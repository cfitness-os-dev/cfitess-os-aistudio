//! Withdrawal of an employee's own pending request. Caller holds the common
//! database write lock and persists a clone before replacing the live state.
use crate::models::AppDatabaseState;
use crate::routes::{append_audit, err_resp};
use axum::{http::StatusCode, Json};
use serde_json::Value;

pub(super) fn apply(
    db: &mut AppDatabaseState,
    actor: &str,
    site: &str,
    id: &str,
    reason: &str,
) -> Result<(), (StatusCode, Json<Value>)> {
    let index = db.leave_requests.iter().position(|r|
        r.id == id && r.employee_id == actor && r.site_id == site
    ).ok_or_else(|| err_resp(StatusCode::NOT_FOUND, "Demande introuvable dans votre espace de ce club."))?;
    if db.leave_requests[index].status != "pending" {
        return Err(err_resp(StatusCode::CONFLICT, "Cette demande a déjà été traitée ou retirée. Actualisez votre espace."));
    }
    let reason = reason.trim();
    if reason.is_empty() || reason.chars().count() > 1000 {
        return Err(err_resp(StatusCode::BAD_REQUEST, "Indiquez un motif de retrait de 1 à 1000 caractères."));
    }
    let row = &mut db.leave_requests[index];
    row.status = "cancelled".into();
    row.comment = format!("{}\nRetrait par le collaborateur : {}", row.comment, reason).trim().into();
    append_audit(db, actor, "HR_LEAVE_WITHDRAWAL", format!("Retrait de la demande {id}"), site, id,
        Some("pending".into()), Some(format!("cancelled | {reason}")));
    Ok(())
}
