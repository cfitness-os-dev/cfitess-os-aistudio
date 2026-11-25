//! Human-reviewed exceptional carryover tracking. Does not create, debit or expire CP.
use crate::models::{AppDatabaseState, Employee};
use crate::routes::{append_audit, err_resp, SharedState};
use axum::{
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    Json,
};
use chrono::{Datelike, NaiveDate, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
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
#[serde(rename_all = "camelCase")]
pub struct Notice {
    pub notified_on: String,
    pub medium: String,
    pub evidence: String,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Record {
    pub id: String,
    pub employee_id: String,
    pub site_id: String,
    pub source_start: String,
    pub source_end: String,
    pub initial_days: f64,
    pub remaining_days: f64,
    pub available_until: String,
    pub reference: String,
    pub status: String,
    pub notice: Option<Notice>,
    pub balance_signature: String,
    pub created_at: String,
    pub updated_at: String,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Event {
    pub id: String,
    pub employee_id: String,
    pub actor_id: String,
    pub site_id: String,
    pub action: String,
    pub reason: String,
    pub timestamp: String,
    pub before: Option<Record>,
    pub after: Record,
}
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Store {
    #[serde(default)]
    pub records: Vec<Record>,
    #[serde(default)]
    pub events: Vec<Event>,
}
pub(crate) fn protected_days(db: &AppDatabaseState, employee: &str) -> f64 {
    db.leave_accrual
        .carryovers
        .records
        .iter()
        .filter(|r| r.employee_id == employee && r.status == "open")
        .map(|r| (r.remaining_days * 100.0).round() as i64)
        .sum::<i64>() as f64
        / 100.0
}
fn date(s: &str) -> Result<NaiveDate, Failure> {
    let d = NaiveDate::parse_from_str(s, "%Y-%m-%d").map_err(|_| bad("Date invalide."))?;
    if d.to_string() != s || !(1900..=2200).contains(&d.year()) {
        return Err(bad("Date invalide."));
    }
    Ok(d)
}
fn days(n: f64) -> Result<i64, Failure> {
    if !n.is_finite() || n < 0.0 || n > 100.0 || (n * 100.0 - (n * 100.0).round()).abs() > 1e-6 {
        return Err(bad(
            "Quantité invalide : de zéro à 100 jours, deux décimales maximum.",
        ));
    }
    Ok((n * 100.0).round() as i64)
}
fn text(s: &str) -> Result<String, Failure> {
    if s.trim().is_empty() || s.chars().count() > 1000 {
        return Err(bad("Renseignez une justification de 1 à 1000 caractères."));
    }
    Ok(s.trim().into())
}
fn balance_signature(e: &Employee) -> String {
    digest(&e.counter.cp_n_minus1_remaining)
}
fn revision(db: &AppDatabaseState, e: &Employee) -> String {
    digest(&(
        db.leave_accrual
            .carryovers
            .records
            .iter()
            .filter(|r| r.employee_id == e.id)
            .collect::<Vec<_>>(),
        &e.counter,
        &e.site_accesses,
        e.active,
    ))
}
fn primary(e: &Employee, site: &str) -> bool {
    e.site_accesses.iter().filter(|a| a.is_primary).count() == 1
        && e.site_accesses
            .iter()
            .any(|a| a.site_id == site && a.is_primary)
}
fn view(db: &AppDatabaseState, actor: &str, site: &str, today: NaiveDate) -> Value {
    let employees=db.employees.iter().filter(|e|crate::hr_leave_accrual::can_target(db,actor,site,e)).map(|e|{
        let cases=db.leave_accrual.carryovers.records.iter().filter(|r|r.employee_id==e.id).map(|r|json!({"record":r,"balanceChanged":r.status=="open"&&r.balance_signature!=balance_signature(e),"deadlinePassed":r.status=="open"&&r.available_until<today.to_string()})).collect::<Vec<_>>();
        let history=db.leave_accrual.carryovers.events.iter().rev().filter(|h|h.employee_id==e.id).take(100).collect::<Vec<_>>();
        json!({"id":e.id,"name":format!("{} {}",e.first_name,e.last_name),"primary":primary(e,site),"revision":revision(db,e),"priorBalance":e.counter.cp_n_minus1_remaining,"protectedDays":protected_days(db,&e.id),"cases":cases,"history":history})
    }).collect::<Vec<_>>();
    json!({"actorId":actor,"siteId":site,"asOf":today.to_string(),"employees":employees})
}
pub async fn get(
    State(s): State<SharedState>,
    Path(raw): Path<String>,
    h: HeaderMap,
) -> Result<Json<Value>, Failure> {
    let a = crate::hr_leave_accrual::actor(&s, &h).await?;
    let site = crate::hr_leave_accrual::site(&raw)?;
    let db = s.db.read().await;
    if !crate::hr_leave_accrual::can_read(&db, &a, site) {
        return Err(err_resp(
            StatusCode::FORBIDDEN,
            "Consultation des reports non autorisée dans ce club.",
        ));
    }
    Ok(Json(view(
        &db,
        &a,
        site,
        Utc::now()
            .with_timezone(&chrono_tz::Europe::Paris)
            .date_naive(),
    )))
}

/// Personal projection intentionally excludes internal reasons, references,
/// medical evidence, actor identities, signatures and manager history.
pub async fn get_mine(
    State(s): State<SharedState>,
    Path(raw): Path<String>,
    h: HeaderMap,
) -> Result<Json<Value>, Failure> {
    let actor = crate::hr_leave_accrual::actor(&s, &h).await?;
    let site = crate::hr_leave_accrual::site(&raw)?;
    let db = s.db.read().await;
    if !crate::rbac::can_access_site_scope(&db, &actor, site) {
        return Err(err_resp(
            StatusCode::FORBIDDEN,
            "Cet établissement est hors de votre périmètre.",
        ));
    }
    let employee = db
        .employees
        .iter()
        .find(|e| e.id == actor && e.active && e.site_accesses.iter().any(|a| a.site_id == site))
        .ok_or_else(|| err_resp(StatusCode::FORBIDDEN, "Votre dossier n’est pas disponible."))?;
    let today = Utc::now()
        .with_timezone(&chrono_tz::Europe::Paris)
        .date_naive()
        .to_string();
    let items = db
        .leave_accrual
        .carryovers
        .records
        .iter()
        .filter(|r| r.employee_id == actor)
        .map(|r| {
            json!({"id":r.id,"sourceStart":r.source_start,"sourceEnd":r.source_end,
            "initialDays":r.initial_days,"reviewedRemainingDays":r.remaining_days,
            "availableUntil":r.available_until,"status":r.status,"reviewedAt":r.updated_at,
            "balanceChanged":r.status=="open" && r.balance_signature!=balance_signature(employee),
            "deadlinePassed":r.status=="open" && r.available_until<today})
        })
        .collect::<Vec<_>>();
    Ok(Json(json!({"actorId":actor,"siteId":site,"asOf":today,
        "priorBalance":employee.counter.cp_n_minus1_remaining,"items":items})))
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(
    tag = "action",
    rename_all = "snake_case",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum Command {
    Create {
        source_start: String,
        source_end: String,
        days: f64,
        available_until: String,
        reference: String,
    },
    Reconcile {
        id: String,
        remaining_days: f64,
    },
    Extend {
        id: String,
        available_until: String,
    },
    Notice {
        id: String,
        notified_on: String,
        medium: String,
        evidence: String,
    },
    Close {
        id: String,
    },
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Input {
    pub employee_id: String,
    pub expected_revision: String,
    pub review_confirmed: bool,
    pub reason: String,
    pub command: Command,
}
fn change(
    db: &AppDatabaseState,
    actor: &str,
    site: &str,
    input: &Input,
    today: NaiveDate,
    now: &str,
) -> Result<(Option<Record>, Record, &'static str), Failure> {
    let e = db
        .employees
        .iter()
        .find(|e| e.id == input.employee_id)
        .ok_or_else(|| err_resp(StatusCode::NOT_FOUND, "Collaborateur introuvable."))?;
    if !crate::hr_leave_accrual::can_read(db, actor, site)
        || !crate::hr_leave_accrual::can_target(db, actor, site, e)
    {
        return Err(err_resp(
            StatusCode::FORBIDDEN,
            "Une autre personne habilitée aux compteurs et aux règles RH doit traiter ce dossier.",
        ));
    }
    if !primary(e, site) {
        return Err(conflict(
            "Traitez ce suivi depuis le club principal du salarié.",
        ));
    }
    if input.expected_revision != revision(db, e) {
        return Err(conflict(
            "Le dossier ou le reliquat a changé. Actualisez avant de confirmer.",
        ));
    }
    if !input.review_confirmed {
        return Err(bad(
            "Confirmez la vérification des droits et de l’échéance avant d’enregistrer.",
        ));
    }
    text(&input.reason)?;
    let balance = days(e.counter.cp_n_minus1_remaining)?;
    let (before, mut after, action) = match &input.command {
        Command::Create {
            source_start,
            source_end,
            days: amount,
            available_until,
            reference,
        } => {
            let start = date(source_start)?;
            let end = date(source_end)?;
            let limit = date(available_until)?;
            let amount = days(*amount)?;
            if start > end || end >= today || limit < end || amount == 0 {
                return Err(bad(
                    "Vérifiez la période passée, les jours concernés et leur date limite.",
                ));
            }
            if db.leave_accrual.carryovers.records.iter().any(|r| {
                r.employee_id == e.id
                    && r.source_start <= *source_end
                    && r.source_end >= *source_start
            }) {
                return Err(conflict("Un suivi existe déjà sur une période qui recoupe celle-ci. Réévaluez ce dossier plutôt que de dupliquer les jours."));
            }
            let row = Record {
                id: format!("carry-{:032x}", rand::random::<u128>()),
                employee_id: e.id.clone(),
                site_id: site.into(),
                source_start: source_start.clone(),
                source_end: source_end.clone(),
                initial_days: amount as f64 / 100.0,
                remaining_days: amount as f64 / 100.0,
                available_until: available_until.clone(),
                reference: text(reference)?,
                status: "open".into(),
                notice: None,
                balance_signature: balance_signature(e),
                created_at: now.into(),
                updated_at: now.into(),
            };
            (None, row, "create")
        }
        command => {
            let id = match command {
                Command::Reconcile { id, .. }
                | Command::Extend { id, .. }
                | Command::Notice { id, .. }
                | Command::Close { id } => id,
                _ => unreachable!(),
            };
            let old = db
                .leave_accrual
                .carryovers
                .records
                .iter()
                .find(|r| &r.id == id && r.employee_id == e.id)
                .ok_or_else(|| err_resp(StatusCode::NOT_FOUND, "Suivi introuvable."))?;
            if old.status != "open" {
                return Err(conflict(
                    "Ce suivi est clôturé. Son historique reste consultable.",
                ));
            }
            if old.balance_signature != balance_signature(e)
                && !matches!(command, Command::Reconcile { .. })
            {
                return Err(conflict("Le reliquat a changé depuis le dernier rapprochement. Réévaluez les jours concernés avant cette action."));
            }
            let mut row = old.clone();
            let action = match command {
                Command::Reconcile { remaining_days, .. } => {
                    let n = days(*remaining_days)?;
                    if n > days(row.initial_days)? {
                        return Err(bad("Les jours encore concernés ne peuvent dépasser ceux du relevé initial."));
                    }
                    row.remaining_days = n as f64 / 100.0;
                    row.balance_signature = balance_signature(e);
                    row.notice = None;
                    "reconcile"
                }
                Command::Extend {
                    available_until, ..
                } => {
                    if date(available_until)? <= date(&row.available_until)? {
                        return Err(bad(
                            "Une prolongation doit repousser la date limite existante.",
                        ));
                    }
                    row.available_until = available_until.clone();
                    row.notice = None;
                    "extend"
                }
                Command::Notice {
                    notified_on,
                    medium,
                    evidence,
                    ..
                } => {
                    let on = date(notified_on)?;
                    if on > today
                        || on < date(&row.source_end)?
                        || !["bulletin", "courrier", "email", "remise"].contains(&medium.as_str())
                    {
                        return Err(bad("Vérifiez la date réelle d’information du salarié et le support utilisé."));
                    }
                    row.notice = Some(Notice {
                        notified_on: notified_on.clone(),
                        medium: medium.clone(),
                        evidence: text(evidence)?,
                    });
                    "notice"
                }
                Command::Close { .. } => {
                    if days(row.remaining_days)? != 0 {
                        return Err(conflict("Réévaluez d’abord les jours encore concernés à zéro, avec justification. Clôturer ce suivi ne supprime aucun congé."));
                    }
                    row.status = "closed".into();
                    "close"
                }
                _ => unreachable!(),
            };
            (Some(old.clone()), row, action)
        }
    };
    let other = db
        .leave_accrual
        .carryovers
        .records
        .iter()
        .filter(|r| r.employee_id == e.id && r.status == "open" && r.id != after.id)
        .try_fold(0i64, |n, r| days(r.remaining_days).map(|v| n + v))?;
    let total = other + days(after.remaining_days)?;
    // A counter correction can put several annotations above the new balance.
    // Permit a strictly reducing reconciliation so those dossiers can be repaired
    // one at a time, but never create or extend an overallocated entitlement.
    let reducing = action == "reconcile"
        && before
            .as_ref()
            .is_some_and(|old| after.remaining_days < old.remaining_days);
    let closing_zero = action == "close" && after.remaining_days == 0.0;
    if total > balance && !reducing && !closing_zero {
        return Err(conflict("Les jours suivis dépassent le reliquat actuel. Rapprochez les soldes ; aucun droit supplémentaire n’est créé par ce suivi."));
    }
    after.updated_at = now.into();
    Ok((before, after, action))
}
pub async fn post(
    State(s): State<SharedState>,
    Path(raw): Path<String>,
    h: HeaderMap,
    Json(input): Json<Input>,
) -> Result<Json<Value>, Failure> {
    let a = crate::hr_leave_accrual::actor(&s, &h).await?;
    let site = crate::hr_leave_accrual::site(&raw)?;
    let mut db = s.db.write().await;
    let now = Utc::now();
    let today = now.with_timezone(&chrono_tz::Europe::Paris).date_naive();
    let (before, after, action) = change(&db, &a, site, &input, today, &now.to_rfc3339())?;
    let mut next = db.clone();
    if let Some(row) = next
        .leave_accrual
        .carryovers
        .records
        .iter_mut()
        .find(|r| r.id == after.id)
    {
        *row = after.clone()
    } else {
        next.leave_accrual.carryovers.records.push(after.clone());
    }
    next.leave_accrual.carryovers.events.push(Event {
        id: format!("carry-event-{:032x}", rand::random::<u128>()),
        employee_id: input.employee_id.clone(),
        actor_id: a.clone(),
        site_id: site.into(),
        action: action.into(),
        reason: input.reason.trim().into(),
        timestamp: now.to_rfc3339(),
        before: before.clone(),
        after: after.clone(),
    });
    append_audit(
        &mut next,
        &a,
        "HR_CP_CARRYOVER_REVIEW",
        format!("Suivi du report : {}", action),
        site,
        &input.employee_id,
        before.as_ref().map(|v| serde_json::to_string(v).unwrap()),
        Some(serde_json::to_string(&after).unwrap()),
    );
    crate::seed::persist_state(&s.data_dir, &next).map_err(|_| {
        err_resp(
            StatusCode::INTERNAL_SERVER_ERROR,
            "Suivi non enregistré. Aucun changement confirmé.",
        )
    })?;
    *db = next;
    Ok(Json(view(&db, &a, site, today)))
}
