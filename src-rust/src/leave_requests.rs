use crate::models::LeaveRequest;
use crate::rbac::{evaluate_permission, PermissionTarget};
use crate::routes::{append_audit, err_resp, resolve_session_actor, SharedState};
use crate::seed::persist_state;
use axum::extract::{Path, State};
use axum::http::{HeaderMap, StatusCode};
use axum::Json;
use serde::Deserialize;
use serde_json::Value;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LeaveDecisionPayload {
    pub status: String,
    #[serde(default)]
    pub comment: Option<String>,
}

fn normalize_decision_status(raw: &str) -> Option<&'static str> {
    match raw.trim().to_lowercase().as_str() {
        "approved" | "accepted" => Some("approved"),
        "rejected" | "refused" => Some("rejected"),
        _ => None,
    }
}

pub async fn patch_leave_request_decision(
    State(state): State<SharedState>,
    Path(request_id): Path<String>,
    headers: HeaderMap,
    Json(payload): Json<LeaveDecisionPayload>,
) -> Result<Json<LeaveRequest>, (StatusCode, Json<Value>)> {
    let Some(next_status) = normalize_decision_status(&payload.status) else {
        return Err(err_resp(
            StatusCode::BAD_REQUEST,
            "Décision invalide : utilisez 'approved' ou 'rejected'.",
        ));
    };

    let (actor_id, _) = resolve_session_actor(&state, &headers).await?;
    let mut db = state.db.write().await;

    let Some(idx) = db.leave_requests.iter().position(|r| r.id == request_id) else {
        return Err(err_resp(
            StatusCode::NOT_FOUND,
            "Demande d'absence introuvable.",
        ));
    };

    let target = db.leave_requests[idx].clone();
    if target.employee_id == actor_id {
        return Err(err_resp(
            StatusCode::FORBIDDEN,
            "Vous ne pouvez pas valider ou refuser votre propre demande d'absence.",
        ));
    }

    let target_teams: Vec<String> = db
        .employees
        .iter()
        .find(|e| e.id == target.employee_id)
        .and_then(|e| {
            e.site_accesses
                .iter()
                .find(|a| a.site_id == target.site_id)
        })
        .map(|a| a.team_ids.clone())
        .unwrap_or_default();

    let perm = evaluate_permission(
        &db,
        &actor_id,
        &target.site_id,
        "ORG04-17",
        Some(PermissionTarget {
            site_id: Some(&target.site_id),
            target_employee_id: Some(&target.employee_id),
            target_team_ids: &target_teams,
            lock_state: None,
        }),
    );
    if !perm.allowed {
        return Err(err_resp(
            StatusCode::FORBIDDEN,
            "Droits insuffisants (ORG04-17 requis sur le club et l'équipe concernés).",
        ));
    }

    if target.status != "pending" {
        return Err(err_resp(
            StatusCode::CONFLICT,
            "Cette demande d'absence a déjà été traitée.",
        ));
    }

    let mut next = db.clone();
    let old_status = next.leave_requests[idx].status.clone();
    next.leave_requests[idx].status = next_status.into();
    if let Some(note) = payload.comment.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
        let base = next.leave_requests[idx].comment.trim();
        next.leave_requests[idx].comment = if base.is_empty() {
            note.to_string()
        } else {
            format!("{base} — Décision : {note}")
        };
    }
    let updated = next.leave_requests[idx].clone();

    append_audit(
        &mut next,
        &actor_id,
        "Demande d'absence (Décision)",
        format!(
            "Demande {} ({}) passée de {} à {}",
            updated.id, updated.motive, old_status, updated.status
        ),
        &updated.site_id,
        "leave_request",
        Some(old_status),
        Some(updated.status.clone()),
    );

    persist_state(&state.data_dir, &next).map_err(|err| {
        err_resp(
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Échec de persistance de la décision d'absence : {err}"),
        )
    })?;
    *db = next;

    Ok(Json(updated))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::routes::SharedAppState;
    use crate::seed::load_or_init_state;
    use axum::http::{header, HeaderValue};
    use chrono::Utc;
    use std::collections::HashMap;
    use std::sync::Arc;
    use tokio::sync::RwLock;

    fn test_state() -> SharedState {
        let dir = std::env::temp_dir().join(format!(
            "cfos_leave_decision_test_{}",
            rand::random::<u128>()
        ));
        Arc::new(SharedAppState {
            db: RwLock::new(load_or_init_state(&dir)),
            data_dir: dir,
            sessions: RwLock::new(HashMap::new()),
            login_attempts: RwLock::new(HashMap::new()),
        })
    }

    async fn session_headers(state: &SharedState, actor_id: &str, site_id: &str) -> HeaderMap {
        let token = format!("leave-session-{}-{}", actor_id, rand::random::<u64>());
        state.sessions.write().await.insert(
            token.clone(),
            (actor_id.to_string(), Utc::now().timestamp() + 3600),
        );
        let mut headers = HeaderMap::new();
        headers.insert(
            header::AUTHORIZATION,
            HeaderValue::from_str(&format!("Bearer {token}")).unwrap(),
        );
        headers.insert("x-cfitness-actor-id", HeaderValue::from_str(actor_id).unwrap());
        headers.insert("x-cfitness-site-id", HeaderValue::from_str(site_id).unwrap());
        headers
    }

    #[tokio::test]
    async fn manager_can_approve_leave_request_persist_and_block_double_decision() {
        let state = test_state();
        let req_id = "req-test-approve-01".to_string();
        {
            let mut db = state.db.write().await;
            db.leave_requests.push(LeaveRequest {
                id: req_id.clone(),
                employee_id: "emp-accueil-cs".into(),
                site_id: "club-carre-soie".into(),
                motive: "Congés payés".into(),
                start_date: "2026-12-10".into(),
                end_date: "2026-12-12".into(),
                status: "pending".into(),
                comment: "Demande collaborateur".into(),
            });
        }

        let admin_headers = session_headers(&state, "emp-mario", "club-carre-soie").await;
        let Json(updated) = patch_leave_request_decision(
            State(state.clone()),
            Path(req_id.clone()),
            admin_headers.clone(),
            Json(LeaveDecisionPayload {
                status: "approved".into(),
                comment: Some("Validé par la Direction".into()),
            }),
        )
        .await
        .expect("admin approval OK");
        assert_eq!(updated.status, "approved");
        assert!(updated.comment.contains("Validé par la Direction"));

        // Persistance disque confirmée
        let reloaded = load_or_init_state(&state.data_dir);
        assert!(reloaded
            .leave_requests
            .iter()
            .any(|r| r.id == req_id && r.status == "approved"));

        // Double traitement refusé en 409 Conflict
        let second = patch_leave_request_decision(
            State(state.clone()),
            Path(req_id),
            admin_headers,
            Json(LeaveDecisionPayload {
                status: "rejected".into(),
                comment: None,
            }),
        )
        .await
        .expect_err("already decided request must return 409");
        assert_eq!(second.0, StatusCode::CONFLICT);

        let _ = std::fs::remove_dir_all(&state.data_dir);
    }

    #[tokio::test]
    async fn leave_decision_forbids_self_approval_and_unauthorized_actors() {
        let state = test_state();
        let req_id = "req-test-forbid-01".to_string();
        {
            let mut db = state.db.write().await;
            db.leave_requests.push(LeaveRequest {
                id: req_id.clone(),
                employee_id: "emp-accueil-cs".into(),
                site_id: "club-carre-soie".into(),
                motive: "RTT".into(),
                start_date: "2026-12-15".into(),
                end_date: "2026-12-16".into(),
                status: "pending".into(),
                comment: "Demande".into(),
            });
        }

        // Auto-approbation refusée (403)
        let self_headers = session_headers(&state, "emp-accueil-cs", "club-carre-soie").await;
        let err_self = patch_leave_request_decision(
            State(state.clone()),
            Path(req_id.clone()),
            self_headers,
            Json(LeaveDecisionPayload {
                status: "approved".into(),
                comment: None,
            }),
        )
        .await
        .expect_err("self-approval must be forbidden");
        assert_eq!(err_self.0, StatusCode::FORBIDDEN);

        // Profil lecture seule sur Beynost refusé sur Carré de Soie (403)
        let ro_headers = session_headers(&state, "emp-readonly", "club-beynost").await;
        let err_ro = patch_leave_request_decision(
            State(state.clone()),
            Path(req_id),
            ro_headers,
            Json(LeaveDecisionPayload {
                status: "rejected".into(),
                comment: None,
            }),
        )
        .await
        .expect_err("readonly cross-club actor must be forbidden");
        assert_eq!(err_ro.0, StatusCode::FORBIDDEN);

        let _ = std::fs::remove_dir_all(&state.data_dir);
    }

    #[tokio::test]
    async fn leave_decision_validates_payload_and_rolls_back_on_disk_failure() {
        let state = test_state();
        let req_id = "req-test-rollback-01".to_string();
        {
            let mut db = state.db.write().await;
            db.leave_requests.push(LeaveRequest {
                id: req_id.clone(),
                employee_id: "emp-accueil-cs".into(),
                site_id: "club-carre-soie".into(),
                motive: "Congés payés".into(),
                start_date: "2026-12-20".into(),
                end_date: "2026-12-22".into(),
                status: "pending".into(),
                comment: "Test rollback".into(),
            });
        }

        let admin_headers = session_headers(&state, "emp-mario", "club-carre-soie").await;

        // Statut invalide -> 400
        let err_bad = patch_leave_request_decision(
            State(state.clone()),
            Path(req_id.clone()),
            admin_headers.clone(),
            Json(LeaveDecisionPayload {
                status: "maybe".into(),
                comment: None,
            }),
        )
        .await
        .expect_err("invalid status must return 400");
        assert_eq!(err_bad.0, StatusCode::BAD_REQUEST);

        // Simuler une panne disque (data_dir remplacé par un fichier)
        let _ = std::fs::remove_dir_all(&state.data_dir);
        std::fs::write(&state.data_dir, "blocked").unwrap();
        let audit_before = state.db.read().await.audit_log.len();

        let err_disk = patch_leave_request_decision(
            State(state.clone()),
            Path(req_id.clone()),
            admin_headers,
            Json(LeaveDecisionPayload {
                status: "approved".into(),
                comment: None,
            }),
        )
        .await
        .expect_err("disk failure must return 500");
        assert_eq!(err_disk.0, StatusCode::INTERNAL_SERVER_ERROR);

        // Rollback mémoire + audit confirmé
        let db = state.db.read().await;
        assert_eq!(db.audit_log.len(), audit_before);
        assert!(db
            .leave_requests
            .iter()
            .any(|r| r.id == req_id && r.status == "pending"));

        let _ = std::fs::remove_file(&state.data_dir);
    }
}
