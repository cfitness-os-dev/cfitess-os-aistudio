use crate::models::AppDatabaseState;
use crate::rbac::{
    can_access_site_scope, evaluate_permission, filter_requests_for_actor, PermissionTarget,
};
use crate::routes::{append_audit, err_resp, resolve_session_actor, SharedState};
use crate::seed::persist_state;
use axum::{
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    Json,
};
use chrono::Utc;
use serde::Deserialize;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};

pub(crate) fn request_revision(request: &crate::models::LeaveRequest) -> String {
    format!(
        "{:x}",
        Sha256::digest(serde_json::to_vec(request).expect("serializable leave"))
    )
}

type Failure = (StatusCode, Json<Value>);
fn club(raw: &str) -> Result<&'static str, Failure> {
    match raw {
        "carre-de-soie" => Ok("club-carre-soie"),
        "beynost" => Ok("club-beynost"),
        _ => Err(err_resp(StatusCode::BAD_REQUEST, "Club inconnu.")),
    }
}
async fn actor(state: &SharedState, headers: &HeaderMap) -> Result<String, Failure> {
    if !headers
        .get("authorization")
        .and_then(|h| h.to_str().ok())
        .map(|h| h.starts_with("Bearer "))
        .unwrap_or(false)
    {
        return Err(err_resp(
            StatusCode::UNAUTHORIZED,
            "Connectez-vous pour accéder aux données RH.",
        ));
    }
    Ok(resolve_session_actor(state, headers).await?.0)
}
fn allowed(db: &AppDatabaseState, actor: &str, site: &str, target: &str, action: &str) -> bool {
    let Some(employee) = db.employees.iter().find(|e| e.id == target) else {
        return false;
    };
    let Some(access) = employee.site_accesses.iter().find(|a| a.site_id == site) else {
        return false;
    };
    evaluate_permission(
        db,
        actor,
        site,
        action,
        Some(PermissionTarget {
            site_id: Some(site),
            target_employee_id: Some(target),
            target_team_ids: &access.team_ids,
            lock_state: None,
        }),
    )
    .allowed
}
fn name(db: &AppDatabaseState, id: &str) -> String {
    db.employees
        .iter()
        .find(|e| e.id == id)
        .map(|e| format!("{} {}", e.first_name, e.last_name))
        .unwrap_or_else(|| id.into())
}
fn view(db: &AppDatabaseState, actor: &str, club_id: &str, site: &str) -> Value {
    let requests = filter_requests_for_actor(db, actor, site)
        .iter()
        .map(|row| {
            let mut data = serde_json::to_value(row).unwrap();
            data["employeeName"] = json!(name(db, &row.employee_id));
            data["revision"] = json!(request_revision(row));
            data["canDecide"] = json!(
                row.employee_id != actor && allowed(db, actor, site, &row.employee_id, "ORG04-17")
            );
            data
        })
        .collect::<Vec<_>>();
    let mut entries = Vec::new();
    for (employee_id, data) in &db.personal_workspace.people {
        if employee_id != actor && !allowed(db, actor, site, employee_id, "ORG04-35") {
            continue;
        }
        for row in data["timeEntries"]
            .as_array()
            .into_iter()
            .flatten()
            .filter(|r| r["clubId"] == club_id)
        {
            let mut row = row.clone();
            row["employeeId"] = json!(employee_id);
            row["employeeName"] = json!(name(db, employee_id));
            row["canReview"] = json!(
                employee_id != actor
                    && allowed(db, actor, site, employee_id, "ORG04-35")
                    && allowed(db, actor, site, employee_id, "ORG04-36")
            );
            entries.push(row);
        }
    }
    entries.sort_by(|a, b| {
        b["timestamp"]
            .as_str()
            .cmp(&a["timestamp"].as_str())
            .then(a["id"].as_str().cmp(&b["id"].as_str()))
    });
    json!({"actorId":actor,"clubId":club_id,"requests":requests,"timeEntries":entries})
}
pub async fn get_workspace(
    State(state): State<SharedState>,
    Path(club_id): Path<String>,
    headers: HeaderMap,
) -> Result<Json<Value>, Failure> {
    let site = club(&club_id)?;
    let actor = actor(&state, &headers).await?;
    let db = state.db.read().await;
    if !can_access_site_scope(&db, &actor, site) {
        return Err(err_resp(
            StatusCode::FORBIDDEN,
            "Club hors de votre périmètre.",
        ));
    }
    Ok(Json(view(&db, &actor, &club_id, site)))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Decision {
    pub status: String,
    pub expected_status: String,
    pub expected_revision: String,
    pub note: String,
}
pub async fn decide_request(
    State(state): State<SharedState>,
    Path((club_id, id)): Path<(String, String)>,
    headers: HeaderMap,
    Json(payload): Json<Decision>,
) -> Result<Json<Value>, Failure> {
    let site = club(&club_id)?;
    let actor = actor(&state, &headers).await?;
    let mut db = state.db.write().await;
    if !can_access_site_scope(&db, &actor, site) {
        return Err(err_resp(
            StatusCode::FORBIDDEN,
            "Club hors de votre périmètre.",
        ));
    }
    let request = db
        .leave_requests
        .iter()
        .find(|r| r.id == id && r.site_id == site)
        .cloned()
        .ok_or_else(|| err_resp(StatusCode::NOT_FOUND, "Demande introuvable dans ce club."))?;
    if request.employee_id == actor || !allowed(&db, &actor, site, &request.employee_id, "ORG04-17")
    {
        return Err(err_resp(StatusCode::FORBIDDEN,"Vous ne pouvez pas décider de cette absence. Une autre personne habilitée doit traiter vos propres demandes."));
    }
    if request.status != payload.expected_status
        || request_revision(&request) != payload.expected_revision
    {
        return Err(err_resp(
            StatusCode::CONFLICT,
            "La demande a été traitée entre-temps. Actualisez avant de décider.",
        ));
    }
    if !["approved", "rejected", "pending"].contains(&payload.status.as_str())
        || payload.status == request.status
    {
        return Err(err_resp(
            StatusCode::BAD_REQUEST,
            "Changement de statut invalide.",
        ));
    }
    let note = payload.note.trim();
    if note.chars().count() > 1000 || (payload.status != "approved" && note.is_empty()) {
        return Err(err_resp(StatusCode::BAD_REQUEST,"Un motif est obligatoire pour un refus ou une remise en attente (1000 caractères maximum)."));
    }
    let mut next = db.clone();
    let row = next.leave_requests.iter_mut().find(|r| r.id == id).unwrap();
    row.status = payload.status.clone();
    if !note.is_empty() {
        row.comment = format!(
            "{}\nDécision RH ({}) : {}",
            row.comment,
            note_name(&payload.status),
            note
        )
        .trim()
        .into();
    }
    append_audit(
        &mut next,
        &actor,
        "HR_LEAVE_DECISION",
        format!("{} : {}", id, payload.status),
        site,
        &request.employee_id,
        Some(request.status),
        Some(format!("{} | {}", payload.status, note)),
    );
    persist_state(&state.data_dir, &next).map_err(|_| {
        err_resp(
            StatusCode::INTERNAL_SERVER_ERROR,
            "Décision non enregistrée. Aucun changement confirmé.",
        )
    })?;
    *db = next;
    Ok(Json(view(&db, &actor, &club_id, site)))
}
fn note_name(status: &str) -> &str {
    match status {
        "approved" => "validée",
        "rejected" => "refusée",
        _ => "en attente",
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EntryReview {
    pub employee_id: String,
    pub note: String,
    pub expected_version: Option<String>,
}
pub async fn review_entry(
    State(state): State<SharedState>,
    Path((club_id, id)): Path<(String, String)>,
    headers: HeaderMap,
    Json(payload): Json<EntryReview>,
) -> Result<Json<Value>, Failure> {
    let site = club(&club_id)?;
    let actor = actor(&state, &headers).await?;
    let mut db = state.db.write().await;
    let employee = &payload.employee_id;
    if !can_access_site_scope(&db, &actor, site)
        || employee == &actor
        || !allowed(&db, &actor, site, employee, "ORG04-35")
        || !allowed(&db, &actor, site, employee, "ORG04-36")
    {
        return Err(err_resp(
            StatusCode::FORBIDDEN,
            "Annotation de pointage non autorisée sur ce périmètre.",
        ));
    }
    let note = payload.note.trim();
    if note.is_empty() || note.chars().count() > 1000 {
        return Err(err_resp(
            StatusCode::BAD_REQUEST,
            "Saisissez une note de 1 à 1000 caractères.",
        ));
    }
    let mut next = db.clone();
    let row = next
        .personal_workspace
        .people
        .get_mut(employee)
        .and_then(|data| data["timeEntries"].as_array_mut())
        .and_then(|rows| {
            rows.iter_mut()
                .find(|r| r["id"] == id && r["clubId"] == club_id)
        })
        .ok_or_else(|| err_resp(StatusCode::NOT_FOUND, "Pointage introuvable dans ce club."))?;
    let version = row["review"]["version"].as_str();
    if version != payload.expected_version.as_deref() {
        return Err(err_resp(
            StatusCode::CONFLICT,
            "Ce pointage a reçu une autre annotation. Actualisez avant de continuer.",
        ));
    }
    let previous = row["review"].clone();
    row["review"] = json!({"note":note,"actorId":actor,"at":Utc::now().to_rfc3339(),"version":format!("review-{}",rand::random::<u128>())});
    append_audit(
        &mut next,
        &actor,
        "HR_TIMECLOCK_REVIEW",
        format!("Annotation du pointage {id}"),
        site,
        employee,
        Some(previous.to_string()),
        Some(note.into()),
    );
    persist_state(&state.data_dir, &next).map_err(|_| {
        err_resp(
            StatusCode::INTERNAL_SERVER_ERROR,
            "Annotation non enregistrée. Aucun changement confirmé.",
        )
    })?;
    *db = next;
    Ok(Json(view(&db, &actor, &club_id, site)))
}
