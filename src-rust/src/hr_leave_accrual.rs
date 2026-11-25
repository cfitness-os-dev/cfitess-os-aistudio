//! Explicit, previewed CP credits/rollovers. No scheduler, legal rate or prorata is inferred.
use crate::employee_lifecycle::allowed_on_target;
use crate::models::{AppDatabaseState, CounterAdjustmentRecord, Employee, EmployeeCounter};
use crate::rbac::{can_access_site_scope, evaluate_permission};
use crate::routes::{append_audit, err_resp, resolve_session_actor, SharedState};
use crate::seed::persist_state;
use axum::{
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    Json,
};
use chrono::{Datelike, NaiveDate, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
type Failure = (StatusCode, Json<Value>);
fn bad(s: &str) -> Failure {
    err_resp(StatusCode::BAD_REQUEST, s)
}
fn conflict(s: &str) -> Failure {
    err_resp(StatusCode::CONFLICT, s)
}
fn digest<T: Serialize>(v: &T) -> String {
    format!("{:x}", Sha256::digest(serde_json::to_vec(v).unwrap()))
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Policy {
    pub enabled: bool,
    pub unit: String,
    pub monthly_days: Option<f64>,
    pub rounding: String,
    pub period_start_month: Option<u32>,
    pub carry_mode: String,
    pub carry_limit: Option<f64>,
    pub prior_carry_mode: String,
    pub reference: String,
    /// Observed acquisition eligibility, independent of annualization. None is unverified.
    #[serde(default)]
    pub absence_acquisition: BTreeMap<String, Option<bool>>,
}
impl Default for Policy {
    fn default() -> Self {
        Self {
            enabled: false,
            unit: "unconfigured".into(),
            monthly_days: None,
            rounding: "nearest".into(),
            period_start_month: None,
            carry_mode: "keep_all".into(),
            carry_limit: None,
            prior_carry_mode: "keep".into(),
            reference: String::new(),
            absence_acquisition: BTreeMap::new(),
        }
    }
}
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Account {
    pub active_period: Option<String>,
    pub closed_through: Option<String>,
    pub epoch: u64,
    pub unit: String,
    pub rounding: String,
    pub exact_units: i64,
    pub granted_units: i64,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Operation {
    pub id: String,
    pub site_id: String,
    pub employee_id: String,
    pub kind: String,
    pub month: String,
    pub amount: f64,
    pub carried: f64,
    pub expired: f64,
    pub timestamp: String,
    pub reason: String,
    pub history_id: String,
    pub policy: Policy,
    #[serde(default)]
    pub verified_credit: Option<VerifiedCredit>,
}
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Store {
    #[serde(default)]
    pub carryovers: crate::hr_leave_carry::Store,
    #[serde(default)]
    pub policies: BTreeMap<String, Policy>,
    #[serde(default)]
    pub accounts: BTreeMap<String, Account>,
    #[serde(default)]
    pub operations: Vec<Operation>,
}
pub(crate) fn epoch(db: &AppDatabaseState, id: &str) -> u64 {
    db.leave_accrual
        .accounts
        .get(id)
        .map(|a| a.epoch)
        .unwrap_or(0)
}
pub(crate) fn ensure_open(db: &AppDatabaseState, id: &str, start: &str) -> Result<(), Failure> {
    if db
        .leave_accrual
        .accounts
        .get(id)
        .and_then(|a| a.closed_through.as_deref())
        .is_some_and(|end| start <= end)
    {
        return Err(conflict("Cette période de congés est clôturée. Une régularisation des droits doit être examinée avant toute nouvelle décision."));
    }
    Ok(())
}
pub(crate) fn site(raw: &str) -> Result<&'static str, Failure> {
    match raw {
        "beynost" | "club-beynost" => Ok("club-beynost"),
        "carre-de-soie" | "club-carre-soie" => Ok("club-carre-soie"),
        _ => Err(bad("Club inconnu.")),
    }
}
pub(crate) async fn actor(state: &SharedState, h: &HeaderMap) -> Result<String, Failure> {
    if !h
        .get("authorization")
        .and_then(|v| v.to_str().ok())
        .is_some_and(|v| v.starts_with("Bearer "))
    {
        return Err(err_resp(
            StatusCode::UNAUTHORIZED,
            "Connectez-vous pour consulter les acquisitions de congés.",
        ));
    }
    Ok(resolve_session_actor(state, h).await?.0)
}
fn policy(db: &AppDatabaseState, site: &str) -> Policy {
    db.leave_accrual
        .policies
        .get(site)
        .cloned()
        .unwrap_or_default()
}
pub(crate) fn can_target(db: &AppDatabaseState, actor: &str, site: &str, e: &Employee) -> bool {
    actor != e.id
        && allowed_on_target(db, actor, site, e, "ORG04-16")
        && (allowed_on_target(db, actor, site, e, "ORG04-08")
            || allowed_on_target(db, actor, site, e, "ORG04-12"))
}
pub(crate) fn can_read(db: &AppDatabaseState, actor: &str, site: &str) -> bool {
    can_access_site_scope(db, actor, site)
        && evaluate_permission(db, actor, site, "ORG04-28", None).allowed
}
fn scaled(v: f64, scale: f64, max: f64) -> Result<i64, Failure> {
    if !v.is_finite() || v < 0.0 || v > max || (v * scale - (v * scale).round()).abs() > 1e-6 {
        return Err(bad("Quantité ou précision invalide."));
    }
    Ok((v * scale).round() as i64)
}
fn validate(p: &Policy) -> Result<(), Failure> {
    if !["unconfigured", "ouvrables", "ouvres", "calendaires"].contains(&p.unit.as_str())
        || !["nearest", "up", "down"].contains(&p.rounding.as_str())
        || !["keep_all", "limit", "none"].contains(&p.carry_mode.as_str())
        || !["keep", "expire"].contains(&p.prior_carry_mode.as_str())
    {
        return Err(bad(
            "Choisissez les unités, arrondis et règles de report proposés.",
        ));
    }
    if let Some(v) = p.monthly_days {
        if scaled(v, 10000.0, 100.0)? < 100 {
            return Err(bad(
                "L’acquisition mensuelle doit atteindre au moins 0,01 jour.",
            ));
        }
    }
    if p.period_start_month.is_some_and(|m| !(1..=12).contains(&m)) {
        return Err(bad("Mois de début de période invalide."));
    }
    if let Some(v) = p.carry_limit {
        scaled(v, 100.0, 100.0)?;
    }
    if p.carry_mode == "limit" && p.carry_limit.is_none() {
        return Err(bad("Renseignez le plafond de report."));
    }
    if p.reference.chars().count() > 1000 {
        return Err(bad("Référence des règles trop longue."));
    }
    if p.enabled
        && (p.unit == "unconfigured"
            || p.monthly_days.is_none()
            || p.period_start_month.is_none()
            || p.reference.trim().is_empty())
    {
        return Err(bad("Avant d’activer, renseignez le taux, l’unité, la période et la référence des règles vérifiées."));
    }
    Ok(())
}
fn settings(db: &AppDatabaseState, actor: &str, site: &str) -> Value {
    let p = policy(db, site);
    let people=db.employees.iter().filter(|e|can_target(db,actor,site,e)).map(|e|json!({"id":e.id,"name":format!("{} {}",e.first_name,e.last_name),"primary":e.site_accesses.iter().filter(|a|a.is_primary).count()==1&&e.site_accesses.iter().any(|a|a.site_id==site&&a.is_primary),"counter":e.counter,"account":db.leave_accrual.accounts.get(&e.id)})).collect::<Vec<_>>();
    let history = db
        .leave_accrual
        .operations
        .iter()
        .rev()
        .filter(|o| {
            o.site_id == site
                && db
                    .employees
                    .iter()
                    .find(|e| e.id == o.employee_id)
                    .is_some_and(|e| can_target(db, actor, site, e))
        })
        .take(100)
        .collect::<Vec<_>>();
    let motives = crate::hr_leave_policy::motives(db, site)
        .into_iter()
        .map(|m| json!({"id":m.id,"label":m.label,"active":m.active}))
        .collect::<Vec<_>>();
    json!({"actorId":actor,"siteId":site,"revision":settings_revision(db,site),"canEdit":crate::hr_organisation::site_permission(db,actor,site,"ORG04-29"),"policy":p,"motives":motives,"employees":people,"history":history})
}
fn settings_revision(db: &AppDatabaseState, site: &str) -> String {
    digest(&(policy(db, site), crate::hr_leave_policy::motives(db, site)))
}
pub async fn get(
    State(s): State<SharedState>,
    Path(raw): Path<String>,
    h: HeaderMap,
) -> Result<Json<Value>, Failure> {
    let a = actor(&s, &h).await?;
    let site = site(&raw)?;
    let db = s.db.read().await;
    if !can_read(&db, &a, site) {
        return Err(err_resp(
            StatusCode::FORBIDDEN,
            "Consultation des règles non autorisée dans ce club.",
        ));
    }
    Ok(Json(settings(&db, &a, site)))
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PolicyInput {
    pub expected_revision: String,
    pub policy: Policy,
}
pub async fn put(
    State(s): State<SharedState>,
    Path(raw): Path<String>,
    h: HeaderMap,
    Json(input): Json<PolicyInput>,
) -> Result<Json<Value>, Failure> {
    let a = actor(&s, &h).await?;
    let site = site(&raw)?;
    let mut db = s.db.write().await;
    if !crate::hr_organisation::site_permission(&db, &a, site, "ORG04-29") {
        return Err(err_resp(
            StatusCode::FORBIDDEN,
            "Modification des règles non autorisée.",
        ));
    }
    let old = policy(&db, site);
    if settings_revision(&db, site) != input.expected_revision {
        return Err(conflict(
            "Les règles ont changé. Actualisez avant de confirmer.",
        ));
    }
    validate(&input.policy)?;
    let catalogue = crate::hr_leave_policy::motives(&db, site);
    if input.policy.absence_acquisition.len() > 1000
        || input
            .policy
            .absence_acquisition
            .keys()
            .any(|id| !catalogue.iter().any(|m| &m.id == id))
    {
        return Err(bad("Un motif d’acquisition ne correspond pas au catalogue de ce club. Actualisez les règles."));
    }
    let mut next = db.clone();
    next.leave_accrual
        .policies
        .insert(site.into(), input.policy.clone());
    append_audit(
        &mut next,
        &a,
        "HR_CP_POLICY",
        "Règles d’acquisition et de report vérifiées".into(),
        site,
        "",
        Some(serde_json::to_string(&old).unwrap()),
        Some(serde_json::to_string(&input.policy).unwrap()),
    );
    persist_state(&s.data_dir, &next).map_err(|_| {
        err_resp(
            StatusCode::INTERNAL_SERVER_ERROR,
            "Règles non enregistrées. Aucun changement confirmé.",
        )
    })?;
    *db = next;
    Ok(Json(settings(&db, &a, site)))
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct VerifiedCredit {
    pub days: f64,
    pub reference: String,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PreviewInput {
    pub employee_id: String,
    pub kind: String,
    pub month: String,
    #[serde(default)]
    pub verified_credit: Option<VerifiedCredit>,
}
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct Plan {
    employee_id: String,
    site_id: String,
    kind: String,
    month: String,
    period_start: String,
    period_end: String,
    next_period: String,
    before: EmployeeCounter,
    after: EmployeeCounter,
    amount: f64,
    carried: f64,
    expired: f64,
    baseline_required: bool,
    absence_review_required: bool,
    absence_count: usize,
    unverified_absence_count: usize,
    verified_credit: Option<VerifiedCredit>,
    next_account: Account,
}
fn month(raw: &str) -> Result<NaiveDate, Failure> {
    let date = NaiveDate::parse_from_str(&format!("{}-01", raw), "%Y-%m-%d")
        .map_err(|_| bad("Choisissez un mois valide."))?;
    if !(1900..=2200).contains(&date.year()) || date.format("%Y-%m").to_string() != raw {
        return Err(bad("Choisissez un mois au format année-mois."));
    }
    Ok(date)
}
fn next_month(d: NaiveDate) -> NaiveDate {
    if d.month() == 12 {
        NaiveDate::from_ymd_opt(d.year() + 1, 1, 1).unwrap()
    } else {
        NaiveDate::from_ymd_opt(d.year(), d.month() + 1, 1).unwrap()
    }
}
fn rounded(units: i64, mode: &str) -> i64 {
    match mode {
        "up" => (units + 99) / 100,
        "down" => units / 100,
        _ => (units + 50) / 100,
    }
}
fn plan(
    db: &AppDatabaseState,
    actor: &str,
    site: &str,
    input: &PreviewInput,
    today: NaiveDate,
) -> Result<Plan, Failure> {
    let e = db
        .employees
        .iter()
        .find(|e| e.id == input.employee_id)
        .ok_or_else(|| err_resp(StatusCode::NOT_FOUND, "Collaborateur introuvable."))?;
    if !can_read(db, actor, site) || !can_target(db, actor, site, e) {
        return Err(err_resp(StatusCode::FORBIDDEN,"Une autre personne habilitée aux règles RH et aux compteurs doit traiter ce dossier dans son club."));
    }
    if e.site_accesses.iter().filter(|a| a.is_primary).count() != 1
        || !e
            .site_accesses
            .iter()
            .any(|a| a.site_id == site && a.is_primary)
    {
        return Err(conflict("Cette opération doit être faite depuis le club principal du collaborateur, avec un seul compteur commun aux clubs."));
    }
    let p = policy(db, site);
    validate(&p)?;
    if !p.enabled {
        return Err(conflict(
            "Les règles d’acquisition sont désactivées. Vérifiez-les avant toute opération.",
        ));
    }
    if let Some(credit) = &input.verified_credit {
        let units = scaled(credit.days, 100.0, 100.0)?;
        let maximum = (scaled(p.monthly_days.unwrap(), 10000.0, 100.0)? + 99) / 100;
        if input.kind != "accrue"
            || units > maximum
            || credit.reference.trim().is_empty()
            || credit.reference.chars().count() > 1000
        {
            return Err(bad("Le montant vérifié est réservé à une acquisition mensuelle, entre zéro et le taux complet arrondi au centième supérieur, avec une référence de calcul obligatoire."));
        }
    }
    let first = month(&input.month)?;
    let last = next_month(first).pred_opt().unwrap();
    if last >= today {
        return Err(conflict("Ce mois n’est pas encore terminé. Aucune acquisition ni clôture anticipée n’est exécutée."));
    }
    let start_month = p.period_start_month.unwrap();
    let start_year = first.year() - i32::from(first.month() < start_month);
    let period_start = NaiveDate::from_ymd_opt(start_year, start_month, 1).unwrap();
    let next_period = NaiveDate::from_ymd_opt(start_year + 1, start_month, 1).unwrap();
    let period_end = next_period.pred_opt().unwrap();
    let account = db
        .leave_accrual
        .accounts
        .get(&e.id)
        .cloned()
        .unwrap_or_default();
    if !(0..=12_000_000).contains(&account.exact_units)
        || !(0..=120_000).contains(&account.granted_units)
        || account.epoch == u64::MAX
    {
        return Err(conflict(
            "Le journal des acquisitions doit être vérifié avant toute opération.",
        ));
    }
    if account
        .closed_through
        .as_deref()
        .is_some_and(|end| first.format("%Y-%m-%d").to_string().as_str() <= end)
    {
        return Err(conflict("Cette période a déjà été clôturée."));
    }
    if account
        .active_period
        .as_ref()
        .is_some_and(|v| v != &period_start.to_string())
    {
        return Err(conflict(
            "Clôturez la période précédente avant de changer d’exercice.",
        ));
    }
    if (!account.unit.is_empty() && account.unit != p.unit)
        || (!account.rounding.is_empty() && account.rounding != p.rounding)
    {
        return Err(conflict("L’unité ou l’arrondi diffère de la période ouverte. Une conversion ou régularisation explicite est nécessaire."));
    }
    let mut next = account.clone();
    next.active_period = Some(period_start.to_string());
    next.unit = p.unit.clone();
    next.rounding = p.rounding.clone();
    let mut after = e.counter.clone();
    let mut amount = 0;
    let mut carried = 0;
    let mut expired = 0;
    let acquired = scaled(after.cp_n_acquired, 100.0, 100.0)?;
    let taken = scaled(after.cp_n_taken, 100.0, 100.0)?;
    let prior = scaled(after.cp_n_minus1_remaining, 100.0, 100.0)?;
    let mut absence_review = false;
    let mut absence_count = 0;
    let mut unverified_absence_count = 0;
    match input.kind.as_str() {
        "accrue" => {
            if !e.active {
                return Err(conflict(
                    "Compte inactif : vérifiez les droits de fin de contrat manuellement.",
                ));
            }
            let from = NaiveDate::parse_from_str(&e.contract.effective_from, "%Y-%m-%d")
                .map_err(|_| conflict("Date de début de contrat à vérifier."))?;
            let until = e
                .contract
                .effective_to
                .as_ref()
                .map(|v| {
                    NaiveDate::parse_from_str(v, "%Y-%m-%d")
                        .map_err(|_| conflict("Date de fin de contrat à vérifier."))
                })
                .transpose()?;
            if until.is_some_and(|d| d < from) {
                return Err(conflict("Les dates du contrat sont incohérentes."));
            }
            if from > last || until.is_some_and(|d| d < first) {
                return Err(conflict(
                    "Le mois demandé ne recoupe pas la période du contrat.",
                ));
            }
            if (from > first || until.is_some_and(|d| d < last)) && input.verified_credit.is_none()
            {
                return Err(conflict("Mois incomplet de contrat : le prorata doit être vérifié, il n’est pas inventé par ce moteur."));
            }
            if db.leave_requests.iter().any(|r| {
                r.employee_id == e.id
                    && r.status == "pending"
                    && r.start_date <= last.to_string()
                    && r.end_date >= first.to_string()
            }) {
                return Err(conflict("Des absences de ce mois sont encore en attente. Vérifiez-les avant de créditer les droits."));
            }
            if db
                .leave_accrual
                .operations
                .iter()
                .any(|o| o.employee_id == e.id && o.kind == "accrue" && o.month == input.month)
            {
                return Err(conflict("L’acquisition de ce mois est déjà enregistrée pour ce salarié, tous clubs confondus."));
            }
            // Exact 1/10000-day accumulation prevents 2.0833 rounding to 2.08 every month.
            next.exact_units = next
                .exact_units
                .checked_add(if let Some(credit) = &input.verified_credit {
                    scaled(credit.days, 100.0, 100.0)? * 100
                } else {
                    scaled(p.monthly_days.unwrap(), 10000.0, 100.0)?
                })
                .ok_or_else(|| conflict("Cumul d’acquisition incohérent."))?;
            let total = rounded(next.exact_units, &p.rounding);
            amount = total - next.granted_units;
            if amount < 0 || acquired + amount > 10000 {
                return Err(conflict("Le crédit dépasserait les bornes du compteur. Une régularisation est nécessaire."));
            }
            next.granted_units = total;
            after.cp_n_acquired = (acquired + amount) as f64 / 100.0;
            for r in db.leave_requests.iter().filter(|r| {
                r.employee_id == e.id
                    && r.status == "approved"
                    && r.start_date <= last.to_string()
                    && r.end_date >= first.to_string()
            }) {
                absence_count += 1;
                let eligible = crate::hr_leave_policy::resolve_motive(db, r).and_then(|m| {
                    policy(db, &r.site_id)
                        .absence_acquisition
                        .get(&m.id)
                        .copied()
                        .flatten()
                });
                if eligible == Some(false) && input.verified_credit.is_none() {
                    return Err(conflict("Une absence du mois ne permet pas l’acquisition selon les règles de son club. Le crédit de mois complet est bloqué : vérifiez le prorata avant une régularisation."));
                }
                if eligible.is_none() {
                    unverified_absence_count += 1;
                }
            }
            // Eligibility does not establish the rate/ceiling (e.g. sickness).
            absence_review = absence_count > 0;
        }
        "rollover" => {
            if last != period_end {
                return Err(bad(
                    "Pour clôturer, choisissez le dernier mois de la période de congés configurée.",
                ));
            }
            if taken > acquired {
                return Err(conflict(
                    "Le solde courant est négatif. Régularisez-le avant de clôturer.",
                ));
            }
            if db.leave_requests.iter().any(|r| {
                r.employee_id == e.id && r.status == "pending" && r.start_date <= last.to_string()
            }) {
                return Err(conflict("Des demandes de cette période restent en attente. Traitez-les avant de clôturer."));
            }
            if db.leave_requests.iter().any(|r| {
                r.employee_id == e.id
                    && r.end_date > last.to_string()
                    && db
                        .leave_policy
                        .settlements
                        .get(&r.id)
                        .is_some_and(|rows| rows.iter().any(|s| s.active && s.family == "cp"))
            }) {
                return Err(conflict("Des congés futurs sont déjà décomptés sur cet exercice. Vérifiez ou compensez-les avant de clôturer."));
            }
            let remaining = acquired - taken;
            carried = match p.carry_mode.as_str() {
                "none" => 0,
                "limit" => remaining.min(scaled(p.carry_limit.unwrap(), 100.0, 100.0)?),
                _ => remaining,
            };
            let old = if p.prior_carry_mode == "keep" {
                prior
            } else {
                0
            };
            if old < prior && crate::hr_leave_carry::protected_days(db, &e.id) > 0.0 {
                return Err(conflict("Un report exceptionnel est encore suivi pour ce salarié. Sa perte ne peut pas être confirmée : rapprochez et traitez ce suivi avant la clôture."));
            }
            expired = remaining - carried + prior - old;
            if old + carried > 10000 {
                return Err(conflict("Le report dépasserait la borne du reliquat. Vérifiez les soldes avant de clôturer."));
            }
            after.cp_n_acquired = 0.0;
            after.cp_n_taken = 0.0;
            after.cp_n_minus1_remaining = (old + carried) as f64 / 100.0;
            next.epoch += 1;
            next.closed_through = Some(last.to_string());
            next.active_period = Some(next_period.to_string());
            next.exact_units = 0;
            next.granted_units = 0;
            next.rounding = String::new();
        }
        _ => {
            return Err(bad(
                "Choisissez Acquisition mensuelle ou Clôture et report.",
            ))
        }
    }
    Ok(Plan {
        employee_id: e.id.clone(),
        site_id: site.into(),
        kind: input.kind.clone(),
        month: input.month.clone(),
        period_start: period_start.to_string(),
        period_end: period_end.to_string(),
        next_period: next_period.to_string(),
        before: e.counter.clone(),
        after,
        amount: amount as f64 / 100.0,
        carried: carried as f64 / 100.0,
        expired: expired as f64 / 100.0,
        baseline_required: account.active_period.is_none(),
        absence_review_required: absence_review,
        absence_count,
        unverified_absence_count,
        verified_credit: input.verified_credit.clone(),
        next_account: next,
    })
}
fn preview_value(db: &AppDatabaseState, site: &str, plan: &Plan) -> Value {
    let requests = db
        .leave_requests
        .iter()
        .filter(|r| r.employee_id == plan.employee_id)
        .map(|r| {
            (
                r,
                db.leave_policy.requests.get(&r.id),
                crate::hr_leave_policy::resolve_motive(db, r),
                policy(db, &r.site_id),
            )
        })
        .collect::<Vec<_>>();
    let employee = db
        .employees
        .iter()
        .find(|e| e.id == plan.employee_id)
        .unwrap();
    let revision = digest(&(
        plan,
        policy(db, site),
        db.leave_accrual.accounts.get(&plan.employee_id),
        requests,
        &employee.contract,
        &employee.site_accesses,
        employee.active,
        db.leave_accrual
            .carryovers
            .records
            .iter()
            .filter(|r| r.employee_id == plan.employee_id)
            .collect::<Vec<_>>(),
    ));
    json!({"revision":revision,"plan":plan})
}
pub async fn preview(
    State(s): State<SharedState>,
    Path(raw): Path<String>,
    h: HeaderMap,
    Json(input): Json<PreviewInput>,
) -> Result<Json<Value>, Failure> {
    let a = actor(&s, &h).await?;
    let site = site(&raw)?;
    let db = s.db.read().await;
    let plan = plan(
        &db,
        &a,
        site,
        &input,
        Utc::now()
            .with_timezone(&chrono_tz::Europe::Paris)
            .date_naive(),
    )?;
    Ok(Json(preview_value(&db, site, &plan)))
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ApplyInput {
    pub request: PreviewInput,
    pub expected_preview: String,
    pub baseline_confirmed: bool,
    pub absence_reviewed: bool,
    pub period_reviewed: bool,
    pub confirm_loss: bool,
    pub reason: String,
    #[serde(default)]
    pub calculation_confirmed: bool,
}
pub async fn apply(
    State(s): State<SharedState>,
    Path(raw): Path<String>,
    h: HeaderMap,
    Json(input): Json<ApplyInput>,
) -> Result<Json<Value>, Failure> {
    let a = actor(&s, &h).await?;
    let site = site(&raw)?;
    let mut db = s.db.write().await;
    let plan = plan(
        &db,
        &a,
        site,
        &input.request,
        Utc::now()
            .with_timezone(&chrono_tz::Europe::Paris)
            .date_naive(),
    )?;
    if preview_value(&db, site, &plan)["revision"] != input.expected_preview {
        return Err(conflict(
            "Les règles, le dossier ou les demandes ont changé. Recalculez l’aperçu.",
        ));
    }
    if plan.baseline_required && !input.baseline_confirmed {
        return Err(bad(
            "Confirmez la reprise des soldes initiaux, sans acquisition déjà incluse pour ce mois.",
        ));
    }
    if plan.absence_review_required && !input.absence_reviewed {
        return Err(bad(
            "Vérifiez les effets des absences avant de confirmer ce crédit de mois complet.",
        ));
    }
    if plan.verified_credit.is_some() && !input.calculation_confirmed {
        return Err(bad(
            "Confirmez la vérification du montant proratisé et de sa référence de calcul.",
        ));
    }
    if plan.kind == "rollover" && !input.period_reviewed {
        return Err(bad("Vérifiez que toutes les acquisitions, absences et corrections de la période sont comptabilisées avant de clôturer."));
    }
    if plan.expired > 0.0 && !input.confirm_loss {
        return Err(bad(
            "Confirmez explicitement les droits non reportés affichés dans l’aperçu.",
        ));
    }
    let reason = input.reason.trim();
    if reason.is_empty() || reason.chars().count() > 1000 {
        return Err(bad("Un motif de 1 à 1000 caractères est obligatoire."));
    }
    let mut next = db.clone();
    let idx = next
        .employees
        .iter()
        .position(|e| e.id == plan.employee_id)
        .unwrap();
    let now = Utc::now().to_rfc3339();
    let history_id = format!("cp-move-{:032x}", rand::random::<u128>());
    let id = format!("cp-operation-{:032x}", rand::random::<u128>());
    let actor_name = next
        .employees
        .iter()
        .find(|e| e.id == a)
        .map(|e| format!("{} {}", e.first_name, e.last_name))
        .unwrap_or(a.clone());
    next.employee_counter_history.push(CounterAdjustmentRecord {
        id: history_id.clone(),
        employee_id: plan.employee_id.clone(),
        site_id: site.into(),
        actor_id: a.clone(),
        actor_name,
        timestamp: now.clone(),
        reason: format!(
            "{} CP {} : {}",
            if plan.kind == "accrue" {
                "Acquisition"
            } else {
                "Clôture et report"
            },
            plan.month,
            if let Some(credit) = &plan.verified_credit {
                format!(
                    "{} — Montant vérifié {} j : {}",
                    reason,
                    credit.days,
                    credit.reference.trim()
                )
            } else {
                reason.to_string()
            }
        ),
        before: plan.before.clone(),
        after: plan.after.clone(),
    });
    next.employees[idx].counter = plan.after.clone();
    next.leave_accrual
        .accounts
        .insert(plan.employee_id.clone(), plan.next_account.clone());
    next.leave_accrual.operations.push(Operation {
        id: id.clone(),
        site_id: site.into(),
        employee_id: plan.employee_id.clone(),
        kind: plan.kind.clone(),
        month: plan.month.clone(),
        amount: plan.amount,
        carried: plan.carried,
        expired: plan.expired,
        timestamp: now,
        reason: reason.into(),
        history_id,
        policy: policy(&db, site),
        verified_credit: plan.verified_credit.clone(),
    });
    append_audit(
        &mut next,
        &a,
        "HR_CP_OPERATION",
        format!("{} : {}", plan.kind, plan.month),
        site,
        &plan.employee_id,
        Some(serde_json::to_string(&plan.before).unwrap()),
        Some(serde_json::to_string(&plan.after).unwrap()),
    );
    persist_state(&s.data_dir, &next).map_err(|_| {
        err_resp(
            StatusCode::INTERNAL_SERVER_ERROR,
            "Opération non enregistrée. Aucun changement confirmé.",
        )
    })?;
    *db = next;
    Ok(Json(
        json!({"operationId":id,"employeeId":plan.employee_id,"counter":plan.after,"snapshot":settings(&db,&a,site)}),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fixture() -> AppDatabaseState {
        let mut db = crate::seed::create_initial_seed_state();
        db.leave_requests.clear();
        let e = db
            .employees
            .iter_mut()
            .find(|e| e.id == "emp-chloe")
            .unwrap();
        e.contract.effective_from = "2020-01-01".into();
        e.contract.effective_to = None;
        e.counter.cp_n_acquired = 0.0;
        e.counter.cp_n_taken = 0.0;
        e.counter.cp_n_minus1_remaining = 0.0;
        db.leave_accrual.policies.insert(
            "club-beynost".into(),
            Policy {
                enabled: true,
                unit: "ouvrables".into(),
                monthly_days: Some(2.0833),
                period_start_month: Some(1),
                reference: "Règles fictives vérifiées".into(),
                ..Default::default()
            },
        );
        db
    }
    fn input(kind: &str, month: &str) -> PreviewInput {
        PreviewInput {
            employee_id: "emp-chloe".into(),
            kind: kind.into(),
            month: month.into(),
            verified_credit: None,
        }
    }
    fn calculate(db: &AppDatabaseState, kind: &str, month: &str) -> Result<Plan, Failure> {
        plan(
            db,
            "emp-mario",
            "club-beynost",
            &input(kind, month),
            NaiveDate::from_ymd_opt(2027, 2, 1).unwrap(),
        )
    }
    #[test]
    fn explicitly_verified_partial_credit_is_bounded_and_kept_in_the_preview() {
        let mut db = fixture();
        db.leave_accrual
            .policies
            .get_mut("club-beynost")
            .unwrap()
            .monthly_days = Some(2.5);
        db.employees
            .iter_mut()
            .find(|e| e.id == "emp-chloe")
            .unwrap()
            .contract
            .effective_from = "2026-01-15".into();
        assert!(calculate(&db, "accrue", "2026-01").is_err());
        for days in [2.18, 2.38, 0.0] {
            let mut request = input("accrue", "2026-01");
            request.verified_credit = Some(VerifiedCredit {
                days,
                reference: "Calcul fictif vérifié, aucune formule déduite".into(),
            });
            let p = plan(
                &db,
                "emp-mario",
                "club-beynost",
                &request,
                NaiveDate::from_ymd_opt(2027, 2, 1).unwrap(),
            )
            .unwrap();
            assert_eq!(p.amount, days);
            assert_eq!(p.after.cp_n_acquired, days);
            assert_eq!(p.verified_credit.unwrap().days, days);
        }
        for days in [-0.01, 2.51, 2.181] {
            let mut request = input("accrue", "2026-01");
            request.verified_credit = Some(VerifiedCredit {
                days,
                reference: "Calcul fictif".into(),
            });
            assert!(plan(
                &db,
                "emp-mario",
                "club-beynost",
                &request,
                NaiveDate::from_ymd_opt(2027, 2, 1).unwrap()
            )
            .is_err());
        }
    }
    #[test]
    fn absence_eligibility_is_separate_from_annualization_and_uses_the_absence_club() {
        let mut db = fixture();
        db.leave_requests.push(crate::models::LeaveRequest {
            id: "accrual-absence".into(),
            employee_id: "emp-chloe".into(),
            site_id: "club-carre-soie".into(),
            motive: "Formation".into(),
            start_date: "2026-10-05".into(),
            end_date: "2026-10-05".into(),
            status: "approved".into(),
            comment: String::new(),
        });
        let unknown = calculate(&db, "accrue", "2026-10").unwrap();
        assert!(unknown.absence_review_required);
        assert_eq!(unknown.absence_count, 1);
        assert_eq!(unknown.unverified_absence_count, 1);
        let old_revision = preview_value(&db, "club-beynost", &unknown)["revision"].clone();
        let motive = crate::hr_leave_policy::resolve_motive(&db, &db.leave_requests[0]).unwrap();
        assert!(motive.included_in_annualization);
        db.leave_accrual
            .policies
            .entry("club-carre-soie".into())
            .or_default()
            .absence_acquisition
            .insert(motive.id.clone(), Some(false));
        assert_eq!(
            calculate(&db, "accrue", "2026-10").unwrap_err().0,
            StatusCode::CONFLICT
        );
        // A rule set in the primary club cannot override the rule of this absence's club.
        db.leave_accrual
            .policies
            .get_mut("club-beynost")
            .unwrap()
            .absence_acquisition
            .insert(motive.id.clone(), Some(true));
        assert!(calculate(&db, "accrue", "2026-10").is_err());
        db.leave_accrual
            .policies
            .get_mut("club-carre-soie")
            .unwrap()
            .absence_acquisition
            .insert(motive.id, Some(true));
        let eligible = calculate(&db, "accrue", "2026-10").unwrap();
        assert!(eligible.absence_review_required); // Eligibility alone proves neither rate nor ceiling.
        assert_eq!(eligible.unverified_absence_count, 0);
        assert_ne!(
            preview_value(&db, "club-beynost", &eligible)["revision"],
            old_revision
        );
        db.leave_requests[0].status = "rejected".into();
        assert_eq!(
            calculate(&db, "accrue", "2026-10").unwrap().absence_count,
            0
        );
    }
    #[test]
    fn cumulative_rounding_preserves_fractional_months_without_touching_other_counters() {
        let mut db = fixture();
        let original = db
            .employees
            .iter()
            .find(|e| e.id == "emp-chloe")
            .unwrap()
            .counter
            .clone();
        let mut sum = 0.0;
        for month in 1..=12 {
            let p = calculate(&db, "accrue", &format!("2026-{:02}", month)).unwrap();
            sum += p.amount;
            db.employees
                .iter_mut()
                .find(|e| e.id == "emp-chloe")
                .unwrap()
                .counter = p.after.clone();
            db.leave_accrual
                .accounts
                .insert("emp-chloe".into(), p.next_account);
        }
        let current = &db
            .employees
            .iter()
            .find(|e| e.id == "emp-chloe")
            .unwrap()
            .counter;
        assert_eq!(current.cp_n_acquired, 25.0);
        assert!((sum - 25.0).abs() < 1e-8);
        assert_eq!(current.rtt_days_remaining, original.rtt_days_remaining);
        assert_eq!(
            current.annualization_balance_hours,
            original.annualization_balance_hours
        );
        assert_eq!(rounded(20833, "up"), 209);
        assert_eq!(rounded(20833, "down"), 208);
        assert_eq!(rounded(20833, "nearest"), 208);
    }
    #[test]
    fn capped_rollover_distinguishes_new_and_previous_reliquats_and_freezes_old_period() {
        let mut db = fixture();
        let e = db
            .employees
            .iter_mut()
            .find(|e| e.id == "emp-chloe")
            .unwrap();
        e.counter.cp_n_acquired = 10.0;
        e.counter.cp_n_taken = 3.0;
        e.counter.cp_n_minus1_remaining = 1.0;
        let policy = db.leave_accrual.policies.get_mut("club-beynost").unwrap();
        policy.carry_mode = "limit".into();
        policy.carry_limit = Some(2.0);
        let p = calculate(&db, "rollover", "2026-12").unwrap();
        assert_eq!(p.carried, 2.0);
        assert_eq!(p.expired, 5.0);
        assert_eq!(p.after.cp_n_minus1_remaining, 3.0);
        assert_eq!(p.after.cp_n_acquired, 0.0);
        assert_eq!(p.after.cp_n_taken, 0.0);
        db.leave_accrual
            .policies
            .get_mut("club-beynost")
            .unwrap()
            .prior_carry_mode = "expire".into();
        let p = calculate(&db, "rollover", "2026-12").unwrap();
        assert_eq!(p.expired, 6.0);
        assert_eq!(p.after.cp_n_minus1_remaining, 2.0);
        db.employees
            .iter_mut()
            .find(|e| e.id == "emp-chloe")
            .unwrap()
            .counter = p.after.clone();
        db.leave_accrual
            .accounts
            .insert("emp-chloe".into(), p.next_account);
        assert_eq!(epoch(&db, "emp-chloe"), 1);
        assert!(ensure_open(&db, "emp-chloe", "2026-12-31").is_err());
        assert!(ensure_open(&db, "emp-chloe", "2027-01-01").is_ok());
        assert!(calculate(&db, "rollover", "2026-12").is_err());
        let january = calculate(&db, "accrue", "2027-01").unwrap();
        assert_eq!(january.after.cp_n_acquired, 2.08);
        assert_eq!(january.after.cp_n_taken, 0.0);
        assert_eq!(january.after.cp_n_minus1_remaining, 2.0);
    }
    #[test]
    fn incomplete_future_self_and_secondary_club_operations_are_refused() {
        let mut db = fixture();
        db.employees
            .iter_mut()
            .find(|e| e.id == "emp-chloe")
            .unwrap()
            .contract
            .effective_from = "2026-01-15".into();
        assert!(calculate(&db, "accrue", "2026-01").is_err());
        assert!(calculate(&db, "accrue", "2027-02").is_err());
        assert!(calculate(&db, "rollover", "2026-11").is_err());
        assert_eq!(
            plan(
                &db,
                "emp-chloe",
                "club-beynost",
                &input("accrue", "2026-10"),
                NaiveDate::from_ymd_opt(2027, 2, 1).unwrap()
            )
            .unwrap_err()
            .0,
            StatusCode::FORBIDDEN
        );
        let r = PreviewInput {
            employee_id: "emp-maxime".into(),
            kind: "accrue".into(),
            month: "2026-10".into(),
            verified_credit: None,
        };
        assert!(plan(
            &db,
            "emp-mario",
            "club-beynost",
            &r,
            NaiveDate::from_ymd_opt(2027, 2, 1).unwrap()
        )
        .is_err());
    }
    #[test]
    fn policy_is_opt_in_and_preview_fingerprint_includes_contract_and_current_balances() {
        let default = Policy::default();
        assert!(!default.enabled);
        assert!(default.monthly_days.is_none());
        assert!(validate(&Policy {
            enabled: true,
            ..default
        })
        .is_err());
        let mut db = fixture();
        let p = calculate(&db, "accrue", "2026-10").unwrap();
        let revision = preview_value(&db, "club-beynost", &p)["revision"].clone();
        db.employees
            .iter_mut()
            .find(|e| e.id == "emp-chloe")
            .unwrap()
            .contract
            .weekly_hours = Some(28);
        assert_ne!(preview_value(&db, "club-beynost", &p)["revision"], revision);
        db.leave_accrual
            .accounts
            .insert("emp-chloe".into(), p.next_account);
        db.leave_accrual
            .policies
            .get_mut("club-beynost")
            .unwrap()
            .unit = "ouvres".into();
        assert!(calculate(&db, "accrue", "2026-11").is_err());
        let store: Store = serde_json::from_str("{}").unwrap();
        assert!(
            store.accounts.is_empty() && store.operations.is_empty() && store.policies.is_empty()
        );
    }
}
