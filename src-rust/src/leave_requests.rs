#[cfg(test)]
use crate::hr_manager::request_revision;
use crate::models::LeaveRequest;
use crate::rbac::{evaluate_permission, PermissionTarget};
use crate::routes::{
    append_audit, err_resp, resolve_available_commercial_for_club, resolve_session_actor,
    SharedState,
};
use crate::seed::persist_state;
use axum::extract::{Path, State};
use axum::http::{HeaderMap, StatusCode};
use axum::Json;
use serde::Deserialize;
use serde_json::Value;

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LeaveDecisionPayload {
    pub status: String,
    #[serde(default)]
    pub expected_status: Option<String>,
    #[serde(default)]
    pub expected_revision: Option<String>,
    #[serde(default)]
    pub comment: Option<String>,
    #[serde(default)]
    pub note: Option<String>,
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
    if !headers
        .get("authorization")
        .and_then(|h| h.to_str().ok())
        .map(|h| h.starts_with("Bearer "))
        .unwrap_or(false)
    {
        return Err(err_resp(
            StatusCode::UNAUTHORIZED,
            "Connectez-vous pour décider d'une absence (jeton Bearer requis).",
        ));
    }

    let Some(next_status) = normalize_decision_status(&payload.status) else {
        return Err(err_resp(
            StatusCode::BAD_REQUEST,
            "Décision invalide : utilisez 'approved' ou 'rejected'.",
        ));
    };

    let effective_note = payload
        .note
        .as_deref()
        .or(payload.comment.as_deref())
        .map(str::trim)
        .unwrap_or("");

    if effective_note.chars().count() > 1000 {
        return Err(err_resp(
            StatusCode::BAD_REQUEST,
            "Le motif de décision ne doit pas dépasser 1000 caractères.",
        ));
    }

    if next_status != "approved" && effective_note.is_empty() {
        return Err(err_resp(
            StatusCode::BAD_REQUEST,
            "Un motif est obligatoire pour un refus ou une remise en attente (1000 caractères maximum).",
        ));
    }

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

    if let Some(exp_status) = &payload.expected_status {
        if &target.status != exp_status {
            return Err(err_resp(
                StatusCode::CONFLICT,
                "La demande a été traitée entre-temps. Actualisez avant de décider.",
            ));
        }
    }

    if let Some(exp_rev) = &payload.expected_revision {
        if crate::hr_leave_policy::revision(&db,&target) != *exp_rev {
            return Err(err_resp(
                StatusCode::CONFLICT,
                "La demande a été modifiée entre-temps (révision obsolète). Actualisez avant de décider.",
            ));
        }
    }

    if target.status != "pending" {
        return Err(err_resp(
            StatusCode::CONFLICT,
            "Cette demande d'absence a déjà été traitée.",
        ));
    }

    if next_status=="approved" && payload.expected_revision.is_none()
        && crate::hr_leave_policy::request_view(&db,&actor_id,&target)["requiresDocument"]==true {
        return Err(err_resp(StatusCode::CONFLICT,"Actualisez et vérifiez les justificatifs avant de valider."));
    }
    crate::hr_leave_policy::guard_legacy_decision(&db,&actor_id,&target,next_status)?;
    let mut next = db.clone();
    let old_status = next.leave_requests[idx].status.clone();
    next.leave_requests[idx].status = next_status.into();
    if !effective_note.is_empty() {
        let base = next.leave_requests[idx].comment.trim();
        next.leave_requests[idx].comment = if base.is_empty() {
            effective_note.to_string()
        } else {
            format!("{base} — Décision : {effective_note}")
        };
    }
    let updated = next.leave_requests[idx].clone();
    let mut reassigned_prospects = 0usize;
    if updated.status == "approved" {
        let club_id = match updated.site_id.as_str() {
            "club-carre-soie" => Some("carre-de-soie"),
            "club-beynost" => Some("beynost"),
            _ => None,
        };
        let today = chrono::Utc::now().format("%Y-%m-%d").to_string();
        if let Some(club_id) = club_id.filter(|club_id| {
            next.lead_settings_by_club
                .get(*club_id)
                .and_then(|settings| settings.get("autoUnassignOnLeave"))
                .and_then(Value::as_bool)
                .unwrap_or(true)
                && updated.start_date <= today
                && updated.end_date >= today
        }) {
            let replacement = resolve_available_commercial_for_club(&next, club_id);
            for prospect in &mut next.lead_prospects {
                if prospect.club_id == club_id
                    && prospect.assigned_to_id.as_deref() == Some(updated.employee_id.as_str())
                    && !prospect.is_archived
                    && !matches!(
                        prospect.stage.as_str(),
                        "Client"
                            | "Client enseigne"
                            | "Perdu"
                            | "Perdu / Sans suite"
                            | "Archivé"
                            | "Froid"
                    )
                    && !matches!(
                        prospect.lead_status.as_str(),
                        "Client"
                            | "Client enseigne"
                            | "Perdu"
                            | "Perdu / Sans suite"
                            | "Archivé"
                            | "Froid"
                    )
                {
                    prospect.assigned_to_id = Some(replacement.clone());
                    reassigned_prospects += 1;
                }
            }
        }
    }

    append_audit(
        &mut next,
        &actor_id,
        "Demande d'absence (Décision)",
        format!(
            "Demande {} ({}) passée de {} à {}{}",
            updated.id,
            updated.motive,
            old_status,
            updated.status,
            if reassigned_prospects > 0 {
                format!(
                    " ; {} prospect(s) réaffecté(s) selon l’absence RH",
                    reassigned_prospects
                )
            } else {
                String::new()
            }
        ),
        &updated.site_id,
        "leave_request",
        Some(old_status),
        Some(updated.status.clone()),
    );

    crate::rh_notifications::leave_changes(&db,&mut next)?;
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
        headers.insert(
            "x-cfitness-actor-id",
            HeaderValue::from_str(actor_id).unwrap(),
        );
        headers.insert(
            "x-cfitness-site-id",
            HeaderValue::from_str(site_id).unwrap(),
        );
        headers
    }

    #[tokio::test]
    async fn approved_current_leave_reassigns_active_prospects_by_least_load_when_enabled() {
        for auto_unassign in [true, false] {
            let state = test_state();
            let request_id = format!("req-auto-reassign-{}", auto_unassign);
            let today = chrono::Utc::now().format("%Y-%m-%d").to_string();
            {
                let mut db = state.db.write().await;
                db.lead_prospects.clear();
                for (id, assignee, stage) in [
                    ("leave-owner", "emp-maxime", "Nouveau"),
                    ("karim-load", "emp-karim", "Nouveau"),
                    ("closed-owner", "emp-maxime", "Client"),
                ] {
                    db.lead_prospects.push(
                        serde_json::from_value(serde_json::json!({
                            "id": id,
                            "firstName": "Test",
                            "lastName": id,
                            "email": format!("{}@example.test", id),
                            "clubId": "carre-de-soie",
                            "source": "Site",
                            "stage": stage,
                            "leadStatus": stage,
                            "rgpdConsent": true,
                            "assignedToId": assignee,
                            "createdAt": "2026-11-25"
                        }))
                        .unwrap(),
                    );
                }
                db.lead_settings_by_club.get_mut("carre-de-soie").unwrap()["autoUnassignOnLeave"] =
                    serde_json::json!(auto_unassign);
                db.leave_requests.push(LeaveRequest {
                    id: request_id.clone(),
                    employee_id: "emp-maxime".into(),
                    site_id: "club-carre-soie".into(),
                    motive: "Arrêt maladie".into(),
                    start_date: today.clone(),
                    end_date: today,
                    status: "pending".into(),
                    comment: "Arrêt de travail".into(),
                });
            }

            let admin_headers = session_headers(&state, "emp-mario", "club-carre-soie").await;
            let Json(approved) = patch_leave_request_decision(
                State(state.clone()),
                Path(request_id),
                admin_headers,
                Json(LeaveDecisionPayload {
                    status: "approved".into(),
                    ..Default::default()
                }),
            )
            .await
            .expect("approved absence persists");
            assert_eq!(approved.status, "approved");

            let db = state.db.read().await;
            let reassigned = db
                .lead_prospects
                .iter()
                .find(|prospect| prospect.id == "leave-owner")
                .unwrap();
            assert_eq!(
                reassigned.assigned_to_id.as_deref(),
                Some(if auto_unassign {
                    "emp-sarah"
                } else {
                    "emp-maxime"
                })
            );
            assert_eq!(
                db.lead_prospects
                    .iter()
                    .find(|prospect| prospect.id == "closed-owner")
                    .unwrap()
                    .assigned_to_id
                    .as_deref(),
                Some("emp-maxime")
            );
            drop(db);
            let _ = std::fs::remove_dir_all(&state.data_dir);
        }
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
                ..Default::default()
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
                note: Some("Motif obligatoire de refus".into()),
                ..Default::default()
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
                ..Default::default()
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
                note: Some("Refus non habilité".into()),
                ..Default::default()
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
                expected_status: None,
                expected_revision: None,
                comment: None,
                note: None,
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
                expected_status: None,
                expected_revision: None,
                comment: None,
                note: None,
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

    #[tokio::test]
    async fn leave_decision_requires_bearer_token() {
        let state = test_state();
        let req_id = "req-test-auth-01".to_string();
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
                comment: "Test auth".into(),
            });
        }

        let mut headers = HeaderMap::new();
        headers.insert("x-cfitness-actor-id", HeaderValue::from_str("emp-mario").unwrap());
        headers.insert("x-cfitness-site-id", HeaderValue::from_str("club-carre-soie").unwrap());

        let err = patch_leave_request_decision(
            State(state.clone()),
            Path(req_id),
            headers,
            Json(LeaveDecisionPayload {
                status: "approved".into(),
                expected_status: None,
                expected_revision: None,
                comment: None,
                note: None,
            }),
        )
        .await
        .expect_err("missing bearer must return 401");
        assert_eq!(err.0, StatusCode::UNAUTHORIZED);

        let _ = std::fs::remove_dir_all(&state.data_dir);
    }

    #[tokio::test]
    async fn leave_decision_rejection_requires_mandatory_motive() {
        let state = test_state();
        let req_id = "req-test-refusal-motive-01".to_string();
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
                comment: "Test motif refus".into(),
            });
        }

        let admin_headers = session_headers(&state, "emp-mario", "club-carre-soie").await;

        // Refus sans motif -> 400 Bad Request
        let err_no_motive = patch_leave_request_decision(
            State(state.clone()),
            Path(req_id.clone()),
            admin_headers.clone(),
            Json(LeaveDecisionPayload {
                status: "rejected".into(),
                expected_status: None,
                expected_revision: None,
                comment: None,
                note: None,
            }),
        )
        .await
        .expect_err("refusal without motive must return 400");
        assert_eq!(err_no_motive.0, StatusCode::BAD_REQUEST);

        // Refus avec motif -> 200 OK
        let Json(updated) = patch_leave_request_decision(
            State(state.clone()),
            Path(req_id.clone()),
            admin_headers,
            Json(LeaveDecisionPayload {
                status: "rejected".into(),
                expected_status: None,
                expected_revision: None,
                comment: None,
                note: Some("Planning de service incomplet pour cette période.".into()),
            }),
        )
        .await
        .expect("refusal with motive OK");
        assert_eq!(updated.status, "rejected");
        assert!(updated.comment.contains("Planning de service incomplet"));

        let _ = std::fs::remove_dir_all(&state.data_dir);
    }

    #[tokio::test]
    async fn leave_decision_enforces_revision_and_expected_status_checks() {
        let state = test_state();
        let req_id = "req-test-revision-01".to_string();
        let initial_leave = LeaveRequest {
            id: req_id.clone(),
            employee_id: "emp-accueil-cs".into(),
            site_id: "club-carre-soie".into(),
            motive: "Congés payés".into(),
            start_date: "2026-12-20".into(),
            end_date: "2026-12-22".into(),
            status: "pending".into(),
            comment: "Test revision".into(),
        };
        let expected_rev = request_revision(&initial_leave);
        {
            let mut db = state.db.write().await;
            db.leave_requests.push(initial_leave);
        }

        let admin_headers = session_headers(&state, "emp-mario", "club-carre-soie").await;

        // Expected status mismatch -> 409
        let err_status_mismatch = patch_leave_request_decision(
            State(state.clone()),
            Path(req_id.clone()),
            admin_headers.clone(),
            Json(LeaveDecisionPayload {
                status: "approved".into(),
                expected_status: Some("approved".into()), // DB is currently pending
                expected_revision: Some(expected_rev.clone()),
                comment: None,
                note: None,
            }),
        )
        .await
        .expect_err("expected status mismatch must return 409");
        assert_eq!(err_status_mismatch.0, StatusCode::CONFLICT);

        // Revision mismatch -> 409
        let err_rev_mismatch = patch_leave_request_decision(
            State(state.clone()),
            Path(req_id.clone()),
            admin_headers.clone(),
            Json(LeaveDecisionPayload {
                status: "approved".into(),
                expected_status: Some("pending".into()),
                expected_revision: Some("bogus-revision-hash".into()),
                comment: None,
                note: None,
            }),
        )
        .await
        .expect_err("revision mismatch must return 409");
        assert_eq!(err_rev_mismatch.0, StatusCode::CONFLICT);

        // Good revision & status -> 200 OK
        let Json(updated) = patch_leave_request_decision(
            State(state.clone()),
            Path(req_id),
            admin_headers,
            Json(LeaveDecisionPayload {
                status: "approved".into(),
                expected_status: Some("pending".into()),
                expected_revision: Some(expected_rev),
                comment: Some("Validé avec révision conforme.".into()),
                note: None,
            }),
        )
        .await
        .expect("matching revision OK");
        assert_eq!(updated.status, "approved");

        let _ = std::fs::remove_dir_all(&state.data_dir);
    }
}
