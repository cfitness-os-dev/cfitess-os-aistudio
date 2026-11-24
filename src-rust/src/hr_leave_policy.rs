//! Applies configured club motives and explicit, manager-confirmed counter allocations.
//! No accrual formula or legal working-day conversion is inferred from dates.
use crate::employee_lifecycle::{allowed_on_target, counter_revision};
use crate::hr_manager::request_revision;
use crate::models::{
    AppDatabaseState, CounterAdjustmentRecord, Employee, EmployeeCounter, LeaveRequest,
    SiteAbsenceMotiveConfig,
};
use crate::rbac::{can_access_site_scope, evaluate_permission};
use crate::routes::{append_audit, err_resp, resolve_session_actor, SharedState};
use crate::seed::persist_state;
use axum::{
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    Json,
};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
type Failure = (StatusCode, Json<Value>);
fn bad(text: &str) -> Failure {
    err_resp(StatusCode::BAD_REQUEST, text)
}
fn conflict(text: &str) -> Failure {
    err_resp(StatusCode::CONFLICT, text)
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Store {
    #[serde(default)]
    pub rules: BTreeMap<String, CounterRule>,
    #[serde(default)]
    pub requests: BTreeMap<String, RequestDetails>,
    #[serde(default)]
    pub settlements: BTreeMap<String, Vec<Settlement>>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CounterRule {
    pub motive_id: String,
    pub site_id: String,
    pub family: String,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RequestDetails {
    pub motive_id: String,
    pub document_ids: Vec<String>,
    pub motive_label_at_request: String,
    #[serde(default = "morning")]
    pub start_period: String,
    #[serde(default = "afternoon")]
    pub end_period: String,
}
fn morning() -> String {
    "am".into()
}
fn afternoon() -> String {
    "pm".into()
}
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Allocations {
    pub cp_n: f64,
    pub cp_n_minus1: f64,
    pub rtt: f64,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settlement {
    #[serde(default)]
    pub counter_epoch: u64,
    pub id: String,
    pub allocations: Allocations,
    pub family: String,
    pub active: bool,
    pub history_id: String,
    pub applied_at: String,
    pub reason: String,
    pub reversed_history_id: Option<String>,
    pub reversed_at: Option<String>,
}
fn site(raw: &str) -> Result<&'static str, Failure> {
    match raw {
        "beynost" | "club-beynost" => Ok("club-beynost"),
        "carre-de-soie" | "club-carre-soie" => Ok("club-carre-soie"),
        _ => Err(bad("Club inconnu.")),
    }
}
async fn actor(state: &SharedState, headers: &HeaderMap) -> Result<String, Failure> {
    if !headers
        .get("authorization")
        .and_then(|v| v.to_str().ok())
        .is_some_and(|v| v.starts_with("Bearer "))
    {
        return Err(err_resp(
            StatusCode::UNAUTHORIZED,
            "Connectez-vous pour accéder aux règles d’absence.",
        ));
    }
    Ok(resolve_session_actor(state, headers).await?.0)
}
pub(crate) fn motives(db: &AppDatabaseState, site: &str) -> Vec<SiteAbsenceMotiveConfig> {
    crate::hr_site_rules::effective_motives(db, site)
}
fn resolve_motive(db: &AppDatabaseState, row: &LeaveRequest) -> Option<SiteAbsenceMotiveConfig> {
    if let Some(details) = db.leave_policy.requests.get(&row.id) {
        return motives(db, &row.site_id)
            .into_iter()
            .find(|m| m.id == details.motive_id);
    }
    let label = alias(&row.motive);
    motives(db, &row.site_id)
        .into_iter()
        .find(|m| alias(&m.label) == label)
}
fn alias(label: &str) -> String {
    match label.trim().to_lowercase().as_str() {
        "cp" | "congés payés" | "congé payé" => "cp".into(),
        "formation cfa" | "formation" => "formation".into(),
        value => value.into(),
    }
}
fn rule(db: &AppDatabaseState, site: &str, motive: &str) -> String {
    db.leave_policy
        .rules
        .get(motive)
        .filter(|r| r.site_id == site)
        .map(|r| r.family.clone())
        .unwrap_or_else(|| "none".into())
}
fn policy_revision(db: &AppDatabaseState, site: &str) -> String {
    format!(
        "{:x}",
        Sha256::digest(
            serde_json::to_vec(&(
                motives(db, site),
                db.leave_policy
                    .rules
                    .values()
                    .filter(|r| r.site_id == site)
                    .collect::<Vec<_>>()
            ))
            .unwrap()
        )
    )
}
pub(crate) fn revision(db: &AppDatabaseState, row: &LeaveRequest) -> String {
    let details = db.leave_policy.requests.get(&row.id);
    let settlements = db.leave_policy.settlements.get(&row.id);
    if details.is_none() && settlements.is_none() {
        return request_revision(row);
    }
    let docs = details.map(|d| document_rows(db, &row.employee_id, &d.document_ids));
    format!(
        "{:x}",
        Sha256::digest(serde_json::to_vec(&(row, details, settlements, docs)).unwrap())
    )
}
fn active_settlement<'a>(db: &'a AppDatabaseState, id: &str) -> Option<&'a Settlement> {
    db.leave_policy
        .settlements
        .get(id)
        .and_then(|rows| rows.iter().rev().find(|s| s.active))
}
fn document_rows(db: &AppDatabaseState, employee: &str, ids: &[String]) -> Vec<Value> {
    let own = crate::personal_workspace::person(db, employee);
    own["documents"]
        .as_array()
        .into_iter()
        .flatten()
        .filter(|d| {
            d["employeeId"] == employee
                && d["category"] == "Attestation"
                && d["id"]
                    .as_str()
                    .is_some_and(|id| ids.iter().any(|candidate| candidate == id))
        })
        .cloned()
        .collect()
}
fn checked_documents(
    db: &AppDatabaseState,
    employee: &str,
    ids: &[String],
) -> Result<Vec<String>, Failure> {
    if ids.len() > 10 || ids.iter().collect::<std::collections::HashSet<_>>().len() != ids.len() {
        return Err(bad("Sélectionnez au plus dix justificatifs distincts."));
    }
    if document_rows(db, employee, ids).len() != ids.len() {
        return Err(bad(
            "Justificatif introuvable dans vos attestations personnelles.",
        ));
    }
    Ok(ids.to_vec())
}
pub(crate) fn prepare_request(
    db: &AppDatabaseState,
    employee: &str,
    site: &str,
    motive_id: Option<&str>,
    label: &str,
    documents: &[String],
    start: &str,
    end: &str,
    start_period: &str,
    end_period: &str,
) -> Result<RequestDetails, Failure> {
    if !matches!(start_period, "am" | "pm")
        || !matches!(end_period, "am" | "pm")
        || (start == end && start_period > end_period)
    {
        return Err(bad("La période de demi-journée est invalide."));
    }
    let options = motives(db, site);
    let chosen = if let Some(id) = motive_id {
        options.into_iter().find(|m| m.id == id)
    } else {
        options
            .into_iter()
            .find(|m| alias(&m.label) == alias(label))
    }
    .ok_or_else(|| bad("Choisissez un motif d’absence disponible dans ce club."))?;
    if rule(db, site, &chosen.id) == "cp" {
        crate::hr_leave_accrual::ensure_open(db, employee, start)?;
    }
    if !chosen.active || !chosen.employee_requestable {
        return Err(err_resp(
            StatusCode::FORBIDDEN,
            "Ce motif n’est pas ouvert aux demandes des collaborateurs dans ce club.",
        ));
    }
    if db.leave_requests.iter().any(|r| {
        r.employee_id == employee
            && r.site_id == site
            && matches!(r.status.as_str(), "pending" | "approved")
            && {
                let details = db.leave_policy.requests.get(&r.id);
                let first = details.map(|d| d.start_period.as_str()).unwrap_or("am");
                let last = details.map(|d| d.end_period.as_str()).unwrap_or("pm");
                (r.start_date.as_str(), first) <= (end, end_period)
                    && (r.end_date.as_str(), last) >= (start, start_period)
            }
    }) {
        return Err(conflict("Une demande en attente ou validée couvre déjà tout ou partie de cette période dans ce club."));
    }
    Ok(RequestDetails {
        motive_id: chosen.id,
        document_ids: checked_documents(db, employee, documents)?,
        motive_label_at_request: chosen.label,
        start_period: start_period.into(),
        end_period: end_period.into(),
    })
}
pub(crate) fn attach_documents(
    db: &mut AppDatabaseState,
    employee: &str,
    site: &str,
    id: &str,
    documents: &[String],
    expected_revision: &str,
) -> Result<(), Failure> {
    let row = db
        .leave_requests
        .iter()
        .find(|r| r.id == id && r.employee_id == employee && r.site_id == site)
        .cloned()
        .ok_or_else(|| {
            err_resp(
                StatusCode::NOT_FOUND,
                "Demande introuvable dans votre espace de ce club.",
            )
        })?;
    if revision(db, &row) != expected_revision {
        return Err(conflict(
            "La demande a changé. Actualisez avant de modifier ses justificatifs.",
        ));
    }
    if row.status != "pending" {
        return Err(conflict(
            "Les justificatifs ne peuvent être changés que sur une demande en attente.",
        ));
    }
    let ids = checked_documents(db, employee, documents)?;
    let motive = resolve_motive(db, &row).ok_or_else(|| {
        conflict("Le motif historique doit être rattaché avant d’ajouter une pièce.")
    })?;
    let details = db
        .leave_policy
        .requests
        .entry(id.into())
        .or_insert(RequestDetails {
            motive_id: motive.id,
            document_ids: vec![],
            motive_label_at_request: row.motive,
            start_period: morning(),
            end_period: afternoon(),
        });
    details.document_ids = ids;
    Ok(())
}
fn counter_permission(db: &AppDatabaseState, actor: &str, site: &str, target: &Employee) -> bool {
    allowed_on_target(db, actor, site, target, "ORG04-16")
        && (allowed_on_target(db, actor, site, target, "ORG04-08")
            || allowed_on_target(db, actor, site, target, "ORG04-12"))
}
fn docs_complete(db: &AppDatabaseState, row: &LeaveRequest) -> bool {
    let ids = db
        .leave_policy
        .requests
        .get(&row.id)
        .map(|d| d.document_ids.as_slice())
        .unwrap_or(&[]);
    !ids.is_empty() && document_rows(db, &row.employee_id, ids).len() == ids.len()
}
fn approval_gate(db: &AppDatabaseState, actor: &str, row: &LeaveRequest) -> Result<(), Failure> {
    if let Some(motive) = resolve_motive(db, row) {
        if rule(db, &row.site_id, &motive.id) == "cp" {
            crate::hr_leave_accrual::ensure_open(db, &row.employee_id, &row.start_date)?;
        }
        if !motive.active {
            return Err(conflict(
                "Ce motif a été désactivé. Vérifiez la demande avant de décider.",
            ));
        }
        if motive.requires_document {
            if !docs_complete(db, row) {
                return Err(conflict(
                    "Un justificatif est requis avant de valider cette demande.",
                ));
            }
            let target = db
                .employees
                .iter()
                .find(|e| e.id == row.employee_id)
                .ok_or_else(|| bad("Collaborateur introuvable."))?;
            if !allowed_on_target(db, actor, &row.site_id, target, "ORG04-14") {
                return Err(err_resp(
                    StatusCode::FORBIDDEN,
                    "La validation exige un profil habilité à consulter les justificatifs.",
                ));
            }
        }
    } else if db.leave_policy.requests.contains_key(&row.id) {
        return Err(conflict("Le motif de cette demande n’est plus disponible."));
    }
    Ok(())
}
/// Called by every legacy decision entry point, so direct requests cannot bypass the new rules.
pub(crate) fn guard_legacy_decision(
    db: &AppDatabaseState,
    actor: &str,
    row: &LeaveRequest,
    next_status: &str,
) -> Result<(), Failure> {
    if active_settlement(db, &row.id).is_some() {
        return Err(conflict(
            "Cette absence a un décompte lié. Utilisez la reprise avec compensation du compteur.",
        ));
    }
    if next_status == "approved" {
        approval_gate(db, actor, row)?;
        if let Some(motive) = resolve_motive(db, row) {
            if rule(db, &row.site_id, &motive.id) != "none" {
                return Err(conflict(
                    "Validez cette absence avec le décompte de compteur prévu.",
                ));
            }
        }
    }
    Ok(())
}
pub(crate) fn request_view(db: &AppDatabaseState, actor: &str, row: &LeaveRequest) -> Value {
    let motive = resolve_motive(db, row);
    let details = db.leave_policy.requests.get(&row.id);
    let ids = details.map(|d| d.document_ids.as_slice()).unwrap_or(&[]);
    let target = db.employees.iter().find(|e| e.id == row.employee_id);
    let can_view_docs = actor == row.employee_id
        || target.is_some_and(|e| allowed_on_target(db, actor, &row.site_id, e, "ORG04-14"));
    let can_counter = target.is_some_and(|e| counter_permission(db, actor, &row.site_id, e));
    let closed_period = active_settlement(db, &row.id).is_some_and(|s| {
        s.family == "cp" && s.counter_epoch != crate::hr_leave_accrual::epoch(db, &row.employee_id)
    });
    let can_settle = !closed_period
        && actor != row.employee_id
        && target.is_some_and(|e| allowed_on_target(db, actor, &row.site_id, e, "ORG04-17"))
        && can_counter;
    let docs = if can_view_docs {
        document_rows(db, &row.employee_id, ids)
            .into_iter()
            .map(|d| json!({"id":d["id"],"title":d["title"],"text":d["contractBodyText"]}))
            .collect::<Vec<_>>()
    } else {
        vec![]
    };
    json!({
        "requestRevision":revision(db,row),
        "closedCounterPeriod":closed_period,
        "startPeriod":details.map(|d|d.start_period.as_str()).unwrap_or("am"),
        "endPeriod":details.map(|d|d.end_period.as_str()).unwrap_or("pm"),
        "motiveId":motive.as_ref().map(|m|&m.id),"active":motive.as_ref().map(|m|m.active),
        "counterFamily":motive.as_ref().map(|m|rule(db,&row.site_id,&m.id)).unwrap_or_else(||"none".into()),
        "requiresDocument":motive.as_ref().is_some_and(|m|m.requires_document),
        "missingDocument":motive.as_ref().is_some_and(|m|m.requires_document)&&!docs_complete(db,row),
        "documentIds":if can_view_docs{ids.to_vec()}else{vec![]},"documents":docs,"canViewDocuments":can_view_docs,
        "policyRevision":policy_revision(db,&row.site_id),"canSettle":can_settle,
        "counter":if actor==row.employee_id||can_counter{target.map(|e|json!({"values":e.counter,"revision":counter_revision(e)}))}else{None},
        "hasActiveSettlement":active_settlement(db,&row.id).is_some(),
        "activeSettlement":if actor==row.employee_id||can_counter {active_settlement(db,&row.id).map(|s|json!({"id":s.id,"allocations":s.allocations,"family":s.family,"appliedAt":s.applied_at}))}else{None},
        "settlementHistory":if actor==row.employee_id||can_counter{db.leave_policy.settlements.get(&row.id).cloned().unwrap_or_default()}else{vec![]}
    })
}
fn settings_view(db: &AppDatabaseState, actor: &str, site: &str) -> Value {
    json!({"actorId":actor,"siteId":site,"revision":policy_revision(db,site),
        "canEdit":crate::hr_organisation::site_permission(db,actor,site,"ORG04-29"),
        "motives":motives(db,site).iter().map(|m|json!({"id":m.id,"label":m.label,"active":m.active,"employeeRequestable":m.employee_requestable,"requiresDocument":m.requires_document,"counterFamily":rule(db,site,&m.id)})).collect::<Vec<_>>()})
}
pub async fn get_settings(
    State(state): State<SharedState>,
    Path(raw): Path<String>,
    headers: HeaderMap,
) -> Result<Json<Value>, Failure> {
    let actor = actor(&state, &headers).await?;
    let site = site(&raw)?;
    let db = state.db.read().await;
    if !can_access_site_scope(&db, &actor, site)
        || !evaluate_permission(&db, &actor, site, "ORG04-28", None).allowed
    {
        return Err(err_resp(
            StatusCode::FORBIDDEN,
            "Consultation des règles non autorisée dans ce club.",
        ));
    }
    Ok(Json(settings_view(&db, &actor, site)))
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RulePayload {
    pub expected_revision: String,
    pub motive_id: String,
    pub family: String,
}
pub async fn put_settings(
    State(state): State<SharedState>,
    Path(raw): Path<String>,
    headers: HeaderMap,
    Json(payload): Json<RulePayload>,
) -> Result<Json<Value>, Failure> {
    let actor = actor(&state, &headers).await?;
    let site = site(&raw)?;
    let mut db = state.db.write().await;
    if !crate::hr_organisation::site_permission(&db, &actor, site, "ORG04-29") {
        return Err(err_resp(
            StatusCode::FORBIDDEN,
            "Modification des règles non autorisée dans ce club.",
        ));
    }
    if policy_revision(&db, site) != payload.expected_revision {
        return Err(conflict(
            "Les règles ont changé. Actualisez avant d’enregistrer.",
        ));
    }
    if !matches!(payload.family.as_str(), "none" | "cp" | "rtt") {
        return Err(bad("Choisissez Aucun décompte, Congés payés ou RTT."));
    }
    if !motives(&db, site).iter().any(|m| m.id == payload.motive_id) {
        return Err(bad("Motif introuvable dans ce club."));
    }
    let mut next = db.clone();
    next.leave_policy.rules.insert(
        payload.motive_id.clone(),
        CounterRule {
            motive_id: payload.motive_id.clone(),
            site_id: site.into(),
            family: payload.family.clone(),
        },
    );
    append_audit(
        &mut next,
        &actor,
        "HR_LEAVE_COUNTER_RULE",
        format!("Règle de décompte : {}", payload.motive_id),
        site,
        &payload.motive_id,
        None,
        Some(payload.family),
    );
    persist_state(&state.data_dir, &next).map_err(|_| {
        err_resp(
            StatusCode::INTERNAL_SERVER_ERROR,
            "Règle non enregistrée. Aucun changement confirmé.",
        )
    })?;
    *db = next;
    Ok(Json(settings_view(&db, &actor, site)))
}
fn units(value: f64) -> Result<i64, Failure> {
    if !value.is_finite()
        || !(0.0..=100.0).contains(&value)
        || (value * 100.0 - (value * 100.0).round()).abs() > 1e-7
    {
        return Err(bad(
            "Quantité invalide : de 0 à 100 jours, avec deux décimales au maximum.",
        ));
    }
    Ok((value * 100.0).round() as i64)
}
fn apply_allocations(
    counter: &EmployeeCounter,
    alloc: &Allocations,
    family: &str,
    reverse: bool,
) -> Result<EmployeeCounter, Failure> {
    let n = units(alloc.cp_n)?;
    let old = units(alloc.cp_n_minus1)?;
    let rtt = units(alloc.rtt)?;
    if (family == "cp" && (rtt != 0 || n + old == 0))
        || (family == "rtt" && (n + old != 0 || rtt == 0))
        || !matches!(family, "cp" | "rtt")
    {
        return Err(bad(
            "Le décompte ne correspond pas au compteur configuré pour ce motif.",
        ));
    }
    let sign = if reverse { -1 } else { 1 };
    let mut next = counter.clone();
    let taken = units(counter.cp_n_taken)? + sign * n;
    let remaining = units(counter.cp_n_minus1_remaining)? - sign * old;
    if taken < 0
        || taken > 10000
        || remaining < 0
        || remaining > 10000
        || (!reverse && n > 0 && taken > units(counter.cp_n_acquired)?)
    {
        return Err(conflict(
            "Solde de congés insuffisant ou reprise nécessitant une régularisation préalable.",
        ));
    }
    next.cp_n_taken = taken as f64 / 100.0;
    next.cp_n_minus1_remaining = remaining as f64 / 100.0;
    if rtt > 0 {
        let base = counter
            .rtt_days_remaining
            .ok_or_else(|| conflict("Le compteur RTT n’est pas disponible."))?;
        let value = units(base)? - sign * rtt;
        if !(0..=5000).contains(&value) {
            return Err(conflict(
                "Solde RTT insuffisant ou reprise nécessitant une régularisation préalable.",
            ));
        }
        next.rtt_days_remaining = Some(value as f64 / 100.0);
    }
    Ok(next)
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SettlementPayload {
    pub action: String,
    pub expected_request_revision: String,
    pub expected_counter_revision: String,
    pub expected_policy_revision: String,
    pub allocations: Allocations,
    pub reason: String,
    pub next_status: Option<String>,
}
pub async fn settle(
    State(state): State<SharedState>,
    Path((raw, id)): Path<(String, String)>,
    headers: HeaderMap,
    Json(payload): Json<SettlementPayload>,
) -> Result<Json<Value>, Failure> {
    let actor = actor(&state, &headers).await?;
    let site = site(&raw)?;
    let mut db = state.db.write().await;
    if !can_access_site_scope(&db, &actor, site) {
        return Err(err_resp(
            StatusCode::FORBIDDEN,
            "Club hors de votre périmètre.",
        ));
    }
    let ri = db
        .leave_requests
        .iter()
        .position(|r| r.id == id && r.site_id == site)
        .ok_or_else(|| err_resp(StatusCode::NOT_FOUND, "Demande introuvable dans ce club."))?;
    let row = db.leave_requests[ri].clone();
    let ei = db
        .employees
        .iter()
        .position(|e| e.id == row.employee_id)
        .ok_or_else(|| bad("Collaborateur introuvable."))?;
    let employee = &db.employees[ei];
    if actor == row.employee_id
        || !allowed_on_target(&db, &actor, site, employee, "ORG04-17")
        || !counter_permission(&db, &actor, site, employee)
    {
        return Err(err_resp(
            StatusCode::FORBIDDEN,
            "Une autre personne habilitée aux absences et compteurs doit traiter cette demande.",
        ));
    }
    if revision(&db, &row) != payload.expected_request_revision
        || counter_revision(employee) != payload.expected_counter_revision
    {
        return Err(conflict(
            "La demande ou le compteur a changé. Actualisez avant de confirmer.",
        ));
    }
    let reason = payload.reason.trim();
    if reason.is_empty() || reason.chars().count() > 1000 {
        return Err(bad(
            "Un motif de validation ou de reprise est obligatoire (1000 caractères maximum).",
        ));
    }
    let (family, allocations, next_status) = match payload.action.as_str() {
        "approve" => {
            if row.status != "pending" || active_settlement(&db, &id).is_some() {
                return Err(conflict(
                    "Cette demande n’est plus en attente de validation.",
                ));
            }
            if policy_revision(&db, site) != payload.expected_policy_revision {
                return Err(conflict(
                    "Les règles de décompte ont changé. Actualisez avant de confirmer.",
                ));
            }
            approval_gate(&db, &actor, &row)?;
            let motive = resolve_motive(&db, &row).ok_or_else(|| {
                conflict("Motif historique non rattaché : décompte non disponible.")
            })?;
            (
                rule(&db, site, &motive.id),
                payload.allocations.clone(),
                "approved".to_string(),
            )
        }
        "reverse" => {
            if row.status != "approved" {
                return Err(conflict(
                    "Seule une absence validée avec un décompte lié peut être reprise.",
                ));
            }
            let record = active_settlement(&db, &id)
                .ok_or_else(|| conflict("Aucun décompte actif à compenser."))?;
            if record.family == "cp"
                && record.counter_epoch != crate::hr_leave_accrual::epoch(&db, &row.employee_id)
            {
                return Err(conflict("La période de ce décompte est clôturée. Une régularisation manuelle doit être examinée ; les compteurs du nouvel exercice ne seront pas modifiés."));
            }
            let status = payload.next_status.as_deref().unwrap_or("");
            if !matches!(status, "pending" | "rejected") {
                return Err(bad(
                    "Choisissez Remettre en attente ou Refuser après reprise.",
                ));
            }
            if units(payload.allocations.cp_n)? != 0
                || units(payload.allocations.cp_n_minus1)? != 0
                || units(payload.allocations.rtt)? != 0
            {
                return Err(bad(
                    "La reprise utilise les quantités d’origine, sans nouveau décompte.",
                ));
            }
            (
                record.family.clone(),
                record.allocations.clone(),
                status.into(),
            )
        }
        _ => return Err(bad("Action de décompte inconnue.")),
    };
    let reverse = payload.action == "reverse";
    let before = employee.counter.clone();
    let after = apply_allocations(&before, &allocations, &family, reverse)?;
    let mut next = db.clone();
    let now = Utc::now().to_rfc3339();
    let history_id = format!("cnt-leave-{:032x}", rand::random::<u128>());
    let actor_name = next
        .employees
        .iter()
        .find(|e| e.id == actor)
        .map(|e| format!("{} {}", e.first_name, e.last_name))
        .unwrap_or_else(|| actor.clone());
    next.employee_counter_history.push(CounterAdjustmentRecord {
        id: history_id.clone(),
        employee_id: row.employee_id.clone(),
        site_id: site.into(),
        actor_id: actor.clone(),
        actor_name,
        timestamp: now.clone(),
        reason: format!(
            "Absence {} — {} : {}",
            id,
            if reverse {
                "reprise compensée"
            } else {
                "décompte confirmé"
            },
            reason
        ),
        before: before.clone(),
        after: after.clone(),
    });
    next.employees[ei].counter = after.clone();
    let ledger = next.leave_policy.settlements.entry(id.clone()).or_default();
    if reverse {
        let record = ledger.iter_mut().rev().find(|s| s.active).unwrap();
        record.active = false;
        record.reversed_at = Some(now.clone());
        record.reversed_history_id = Some(history_id.clone());
    } else {
        ledger.push(Settlement {
            counter_epoch: crate::hr_leave_accrual::epoch(&db, &row.employee_id),
            id: format!("leave-settle-{:032x}", rand::random::<u128>()),
            allocations,
            family,
            active: true,
            history_id,
            applied_at: now.clone(),
            reason: reason.into(),
            reversed_history_id: None,
            reversed_at: None,
        });
    }
    next.leave_requests[ri].status = next_status.clone();
    next.leave_requests[ri].comment =
        format!("{}\nDécision avec compteur : {}", row.comment, reason)
            .trim()
            .into();
    append_audit(
        &mut next,
        &actor,
        "HR_LEAVE_COUNTER_DECISION",
        format!("Absence {} : {}", id, next_status),
        site,
        &row.employee_id,
        Some(json!({"status":row.status,"counter":before}).to_string()),
        Some(json!({"status":next_status,"counter":after}).to_string()),
    );
    persist_state(&state.data_dir, &next).map_err(|_| {
        err_resp(
            StatusCode::INTERNAL_SERVER_ERROR,
            "Décision non enregistrée. Aucun changement confirmé.",
        )
    })?;
    *db = next;
    Ok(Json(
        json!({"requestId":id,"status":db.leave_requests[ri].status,"policy":request_view(&db,&actor,&db.leave_requests[ri])}),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    fn counter() -> EmployeeCounter {
        EmployeeCounter {
            cp_n_acquired: 25.0,
            cp_n_taken: 5.0,
            cp_n_minus1_remaining: 3.0,
            rtt_days_remaining: Some(4.0),
            annualization_balance_hours: Some(12.5),
        }
    }
    #[test]
    fn split_cp_and_compensation_preserve_later_adjustments() {
        let allocation = Allocations {
            cp_n: 1.25,
            cp_n_minus1: 2.5,
            rtt: 0.0,
        };
        let mut after = apply_allocations(&counter(), &allocation, "cp", false).unwrap();
        assert_eq!(after.cp_n_taken, 6.25);
        assert_eq!(after.cp_n_minus1_remaining, 0.5);
        after.cp_n_acquired = 26.0;
        after.cp_n_taken += 0.5;
        after.cp_n_minus1_remaining += 1.0;
        let reverse = apply_allocations(&after, &allocation, "cp", true).unwrap();
        assert_eq!(reverse.cp_n_taken, 5.5);
        assert_eq!(reverse.cp_n_minus1_remaining, 4.0);
        assert_eq!(reverse.cp_n_acquired, 26.0);
        assert_eq!(reverse.annualization_balance_hours, Some(12.5));
    }
    #[test]
    fn rtt_requires_an_available_sufficient_counter() {
        let a = Allocations {
            rtt: 1.5,
            ..Default::default()
        };
        let after = apply_allocations(&counter(), &a, "rtt", false).unwrap();
        assert_eq!(after.rtt_days_remaining, Some(2.5));
        assert_eq!(
            apply_allocations(&after, &a, "rtt", true)
                .unwrap()
                .rtt_days_remaining,
            Some(4.0)
        );
        let mut missing = counter();
        missing.rtt_days_remaining = None;
        assert!(apply_allocations(&missing, &a, "rtt", false).is_err());
        assert!(apply_allocations(
            &counter(),
            &Allocations {
                rtt: 4.01,
                ..Default::default()
            },
            "rtt",
            false
        )
        .is_err());
    }
    #[test]
    fn invalid_precision_families_or_insufficient_cp_never_apply() {
        for value in [-1.0, 0.001, 100.01, f64::INFINITY, f64::NAN] {
            assert!(units(value).is_err());
        }
        for (family, a) in [
            ("cp", Allocations::default()),
            (
                "none",
                Allocations {
                    cp_n: 1.0,
                    ..Default::default()
                },
            ),
            (
                "rtt",
                Allocations {
                    cp_n: 1.0,
                    rtt: 1.0,
                    ..Default::default()
                },
            ),
            (
                "cp",
                Allocations {
                    cp_n: 20.01,
                    ..Default::default()
                },
            ),
            (
                "cp",
                Allocations {
                    cp_n_minus1: 3.01,
                    ..Default::default()
                },
            ),
        ] {
            assert!(apply_allocations(&counter(), &a, family, false).is_err());
        }
        let mut adjusted = counter();
        adjusted.cp_n_taken = 0.0;
        assert!(apply_allocations(
            &adjusted,
            &Allocations {
                cp_n: 1.0,
                ..Default::default()
            },
            "cp",
            true
        )
        .is_err());
    }
    #[test]
    fn empty_policy_migrates_without_enabling_automatic_debits() {
        let store: Store = serde_json::from_str("{}").unwrap();
        assert!(store.rules.is_empty());
        assert!(store.requests.is_empty());
        assert!(store.settlements.is_empty());
    }
    #[test]
    fn legacy_details_default_to_full_day_and_counter_data_is_redacted() {
        let details: RequestDetails = serde_json::from_str(
            r#"{"motiveId":"cp","documentIds":[],"motiveLabelAtRequest":"CP"}"#,
        )
        .unwrap();
        assert_eq!(details.start_period, "am");
        assert_eq!(details.end_period, "pm");
        let mut db = crate::seed::create_initial_seed_state();
        let row = LeaveRequest {
            id: "test-redaction".into(),
            employee_id: "emp-chloe".into(),
            site_id: "club-beynost".into(),
            motive: "CP".into(),
            start_date: "2027-01-01".into(),
            end_date: "2027-01-01".into(),
            status: "approved".into(),
            comment: "".into(),
        };
        db.leave_policy.settlements.insert(
            row.id.clone(),
            vec![Settlement {
                counter_epoch: 0,
                id: "s".into(),
                allocations: Allocations {
                    cp_n: 1.0,
                    ..Default::default()
                },
                family: "cp".into(),
                active: true,
                history_id: "h".into(),
                applied_at: "date".into(),
                reason: "reason".into(),
                reversed_history_id: None,
                reversed_at: None,
            }],
        );
        let view = request_view(&db, "emp-readonly", &row);
        assert_eq!(view["hasActiveSettlement"], true);
        assert!(view["counter"].is_null());
        assert!(view["activeSettlement"].is_null());
        assert_eq!(view["settlementHistory"], json!([]));
        assert_eq!(view["canSettle"], false);
    }
}
