//! Own-account notification inbox. No external delivery or client identity override.
use crate::{
    models::{AppDatabaseState, LeaveRequest},
    rbac::{can_access_site_scope, evaluate_permission, PermissionTarget},
    routes::{append_audit, err_resp, resolve_session_actor, SharedState},
    seed::persist_state,
};
use axum::{
    extract::{Path, Query, State},
    http::{HeaderMap, StatusCode},
    Json,
};
use chrono::Utc;
use serde::Deserialize;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::collections::BTreeSet;
type Failure = (StatusCode, Json<Value>);
#[derive(Default, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Page {
    pub before: Option<String>,
    #[serde(default)]
    pub unread_only: bool,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Read {
    pub ids: Vec<String>,
}
fn site(club: &str) -> Result<&'static str, Failure> {
    match club {
        "beynost" => Ok("club-beynost"),
        "carre-de-soie" => Ok("club-carre-soie"),
        _ => Err(err_resp(StatusCode::BAD_REQUEST, "Club inconnu.")),
    }
}
async fn own(state: &SharedState, headers: &HeaderMap) -> Result<String, Failure> {
    if !headers
        .get("authorization")
        .and_then(|h| h.to_str().ok())
        .is_some_and(|h| h.starts_with("Bearer "))
    {
        return Err(err_resp(
            StatusCode::UNAUTHORIZED,
            "Connectez-vous pour consulter vos notifications.",
        ));
    }
    Ok(resolve_session_actor(state, headers).await?.0)
}
fn check(db: &AppDatabaseState, actor: &str, club: &str) -> Result<(), Failure> {
    if !db.employees.iter().any(|e| e.id == actor && e.active)
        || !can_access_site_scope(db, actor, site(club)?)
    {
        return Err(err_resp(
            StatusCode::FORBIDDEN,
            "Notifications non autorisées dans ce club.",
        ));
    }
    Ok(())
}
fn rows(db: &AppDatabaseState, actor: &str, club: &str) -> Result<Vec<Value>, Failure> {
    let data = crate::personal_workspace::person(db, actor);
    let rows = data["notifications"].as_array().ok_or_else(|| {
        err_resp(
            StatusCode::SERVICE_UNAVAILABLE,
            "Les notifications nécessitent une vérification.",
        )
    })?;
    Ok(rows
        .iter()
        .filter(|n| n["employeeId"] == actor && (n["clubId"] == club || n["clubId"].is_null()))
        .cloned()
        .collect())
}
fn view(db: &AppDatabaseState, actor: &str, club: &str, page: &Page) -> Result<Value, Failure> {
    check(db, actor, club)?;
    let all = rows(db, actor, club)?;
    let start = match page.before.as_deref() {
        None => 0,
        Some(id) => all
            .iter()
            .position(|r| r["id"] == id)
            .map(|i| i + 1)
            .ok_or_else(|| {
                err_resp(
                    StatusCode::BAD_REQUEST,
                    "La page n’est plus disponible. Revenez aux dernières notifications.",
                )
            })?,
    };
    let unread = all.iter().filter(|r| r["read"] != true).count();
    let remaining: Vec<&Value> = all
        .iter()
        .skip(start)
        .filter(|r| !page.unread_only || r["read"] != true)
        .collect();
    let selected: Vec<Value> = remaining.iter().take(50).map(|r| (*r).clone()).collect();
    let next = if remaining.len() > 50 {
        selected.last().and_then(|r| r["id"].as_str())
    } else {
        None
    };
    Ok(
        json!({"employeeId":actor,"clubId":club,"demoMode":crate::routes::is_demo_mode(),"unreadCount":unread,"total":all.len(),"unreadOnly":page.unread_only,"notifications":selected,"nextCursor":next}),
    )
}
pub fn mark_read(row: &mut Value, now: &str) -> bool {
    if row["read"] == true {
        return false;
    }
    row["read"] = json!(true);
    row["readAt"] = json!(now);
    true
}
pub async fn get(
    State(state): State<SharedState>,
    Path(club): Path<String>,
    Query(page): Query<Page>,
    headers: HeaderMap,
) -> Result<Json<Value>, Failure> {
    let actor = own(&state, &headers).await?;
    let db = state.db.read().await;
    Ok(Json(view(&db, &actor, &club, &page)?))
}
pub async fn read(
    State(state): State<SharedState>,
    Path(club): Path<String>,
    Query(page): Query<Page>,
    headers: HeaderMap,
    Json(command): Json<Read>,
) -> Result<Json<Value>, Failure> {
    let actor = own(&state, &headers).await?;
    let mut db = state.db.write().await;
    check(&db, &actor, &club)?;
    if command.ids.is_empty() || command.ids.len() > 50 {
        return Err(err_resp(
            StatusCode::BAD_REQUEST,
            "Choisissez entre 1 et 50 notifications.",
        ));
    }
    let ids: BTreeSet<String> = command.ids.into_iter().collect();
    let own_rows = rows(&db, &actor, &club)?;
    if ids
        .iter()
        .any(|id| !own_rows.iter().any(|r| r["id"] == *id))
    {
        return Err(err_resp(
            StatusCode::NOT_FOUND,
            "Notification introuvable dans votre espace de ce club.",
        ));
    }
    let mut next = db.clone();
    let mut data = crate::personal_workspace::person(&next, &actor);
    let mut changed = 0;
    let now = Utc::now().to_rfc3339();
    for row in data["notifications"].as_array_mut().unwrap() {
        if row["id"].as_str().is_some_and(|id| ids.contains(id))
            && row["employeeId"] == actor
            && (row["clubId"] == club || row["clubId"].is_null())
        {
            changed += usize::from(mark_read(row, &now));
        }
    }
    if changed > 0 {
        next.personal_workspace.people.insert(actor.clone(), data);
        append_audit(
            &mut next,
            &actor,
            "NOTIFICATIONS_READ",
            format!("{changed} notification(s) marquée(s) comme lue(s)."),
            site(&club)?,
            "Mon compte",
            None,
            None,
        );
        persist_state(&state.data_dir, &next).map_err(|_| {
            err_resp(
                StatusCode::INTERNAL_SERVER_ERROR,
                "Lecture non enregistrée. Réessayez.",
            )
        })?;
        *db = next;
    }
    Ok(Json(view(
        &db,
        &actor,
        &club,
        &Page {
            before: None,
            unread_only: page.unread_only,
        },
    )?))
}
pub fn add(
    db: &mut AppDatabaseState,
    employee: &str,
    club: &str,
    event: &str,
    title: &str,
    message: &str,
    kind: &str,
    target: &str,
) -> Result<(), Failure> {
    if !db.employees.iter().any(|e| e.id == employee && e.active) {
        return Ok(());
    }
    let id = format!("rh-event-{}", hex::encode(Sha256::digest(event.as_bytes())));
    let mut data = crate::personal_workspace::person(db, employee);
    let entries = data["notifications"].as_array_mut().ok_or_else(|| {
        err_resp(
            StatusCode::CONFLICT,
            "Les notifications d’un destinataire nécessitent une vérification.",
        )
    })?;
    if !entries.iter().any(|r| r["id"] == id) {
        entries.insert(0,json!({"id":id,"employeeId":employee,"clubId":club,"createdAt":Utc::now().to_rfc3339(),"title":title,"message":message,"type":kind,"targetPage":target,"read":false,"readAt":null}));
    }
    db.personal_workspace.people.insert(employee.into(), data);
    Ok(())
}
pub fn leave_changes(
    before: &AppDatabaseState,
    next: &mut AppDatabaseState,
) -> Result<(), Failure> {
    let changes: Vec<LeaveRequest> = next
        .leave_requests
        .iter()
        .filter(|r| {
            before
                .leave_requests
                .iter()
                .find(|b| b.id == r.id)
                .map(|b| b.status != r.status)
                .unwrap_or(true)
        })
        .cloned()
        .collect();
    for r in changes {
        let club = match r.site_id.as_str() {
            "club-beynost" => "beynost",
            "club-carre-soie" => "carre-de-soie",
            _ => continue,
        };
        let event = format!(
            "leave:{}:{}",
            r.id,
            crate::hr_leave_policy::revision(next, &r)
        );
        let prior = before.leave_requests.iter().find(|b| b.id == r.id);
        if prior.is_some() {
            let label = match r.status.as_str() {
                "approved" | "accepted" => "validée",
                "rejected" | "refused" => "refusée",
                "pending" => "remise en attente",
                "cancelled" => "retirée",
                _ => continue,
            };
            add(
                next,
                &r.employee_id,
                club,
                &event,
                &format!("Demande d’absence {label}"),
                &format!(
                    "Votre demande du {} au {} a été {}. Consultez Mes absences pour le détail.",
                    r.start_date, r.end_date, label
                ),
                "rh_leave",
                "leave",
            )?;
        }
        if prior.is_none() && r.status == "pending" || r.status == "cancelled" {
            let e = next.employees.iter().find(|e| e.id == r.employee_id);
            let Some(e) = e else {
                continue;
            };
            let teams = e
                .site_accesses
                .iter()
                .find(|a| a.site_id == r.site_id)
                .map(|a| a.team_ids.clone())
                .unwrap_or_default();
            let managers: Vec<String> = next
                .employees
                .iter()
                .filter(|e| {
                    e.active
                        && e.id != r.employee_id
                        && e.site_accesses.iter().any(|a| a.site_id == r.site_id)
                        && evaluate_permission(
                            next,
                            &e.id,
                            &r.site_id,
                            "ORG04-17",
                            Some(PermissionTarget {
                                site_id: Some(&r.site_id),
                                target_employee_id: Some(&r.employee_id),
                                target_team_ids: &teams,
                                lock_state: None,
                            }),
                        )
                        .allowed
                })
                .map(|e| e.id.clone())
                .collect();
            for manager in managers {
                add(next,&manager,club,&event,if r.status=="cancelled"{"Demande d’absence retirée"}else{"Nouvelle demande d’absence"},&format!("Une demande du {} au {} est à consulter dans les absences de votre équipe.",r.start_date,r.end_date),"rh_leave","team-leave")?;
            }
        }
    }
    Ok(())
}
#[cfg(test)]
#[path = "rh_notifications_tests.rs"]
mod tests;
