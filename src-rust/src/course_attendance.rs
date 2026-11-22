use crate::clock_terminals::{authenticate_terminal, ClockTerminal};
use crate::models::AppDatabaseState;
use crate::rbac::can_access_site_scope;
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

type Failure = (StatusCode, Json<Value>);

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChecklistItemAnswer {
    pub item_id: String,
    pub label: String,
    pub checked: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CourseOccurrence {
    pub id: String,
    pub site_id: String,
    pub room_id: String,
    pub course_title: String,
    pub assigned_coach_id: String,
    pub substitute_coach_id: Option<String>,
    pub start_time: String,
    pub end_time: String,
    pub status: String, // "scheduled" | "cancelled" | "completed"
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CourseAttendanceRecord {
    pub id: String,
    pub occurrence_id: String,
    pub site_id: String,
    pub room_id: String,
    pub terminal_id: String,
    pub coach_id: String,
    pub coach_name: String,
    pub verified_at: String,
    pub checklist_version: String,
    pub checklist_completed: bool,
    pub checklist_answers: Vec<ChecklistItemAnswer>,
    pub note: Option<String>,
    pub idempotency_key: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct VerifyPresencePayload {
    pub occurrence_id: String,
    pub coach_id: String,
    #[serde(default)]
    pub checklist_answers: Vec<ChecklistItemAnswer>,
    #[serde(default)]
    pub note: Option<String>,
    pub idempotency_key: String,
}

fn club_site(raw: &str) -> Result<(&'static str, &'static str), Failure> {
    match raw {
        "carre-de-soie" | "club-carre-soie" => Ok(("carre-de-soie", "club-carre-soie")),
        "beynost" | "club-beynost" => Ok(("beynost", "club-beynost")),
        _ => Err(err_resp(StatusCode::BAD_REQUEST, "Club inconnu.")),
    }
}

fn coach_name(db: &AppDatabaseState, coach_id: &str) -> String {
    db.employees
        .iter()
        .find(|e| e.id == coach_id)
        .map(|e| format!("{} {}", e.first_name, e.last_name))
        .unwrap_or_else(|| coach_id.to_string())
}

/// Lister les occurrences du jour pour la salle exacte du terminal authentifié
pub async fn get_room_occurrences(
    State(state): State<SharedState>,
    headers: HeaderMap,
) -> Result<Json<Value>, Failure> {
    let db = state.db.read().await;
    let terminal: ClockTerminal = authenticate_terminal(&db, &headers).await?;

    let occurrences: Vec<Value> = db
        .course_occurrences
        .iter()
        .filter(|o| o.site_id == terminal.site_id && o.room_id == terminal.room_id)
        .map(|o| {
            let attendance = db
                .course_attendances
                .iter()
                .find(|a| a.occurrence_id == o.id);
            json!({
                "id": o.id,
                "siteId": o.site_id,
                "roomId": o.room_id,
                "courseTitle": o.course_title,
                "assignedCoachId": o.assigned_coach_id,
                "assignedCoachName": coach_name(&db, &o.assigned_coach_id),
                "substituteCoachId": o.substitute_coach_id,
                "startTime": o.start_time,
                "endTime": o.end_time,
                "status": o.status,
                "isPrepared": attendance.map(|a| a.checklist_completed).unwrap_or(false),
                "attendance": attendance
            })
        })
        .collect();

    Ok(Json(json!({
        "terminal": {
            "id": terminal.id,
            "siteId": terminal.site_id,
            "roomId": terminal.room_id,
            "roomLabel": terminal.room_label,
            "label": terminal.label
        },
        "occurrences": occurrences
    })))
}

/// Enregistrer la présence du coach et la checklist d'avant-cours depuis le terminal de la salle
pub async fn post_verify_course_presence(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Json(payload): Json<VerifyPresencePayload>,
) -> Result<Json<Value>, Failure> {
    let mut db = state.db.write().await;
    let terminal = authenticate_terminal(&db, &headers).await?;

    // 1. Contrôle idempotence : si déjà traité avec cette clé, renvoyer sans doublon
    let idemp = payload.idempotency_key.trim();
    if idemp.is_empty() {
        return Err(err_resp(
            StatusCode::BAD_REQUEST,
            "Clé d'idempotence requise.",
        ));
    }
    if let Some(existing) = db
        .course_attendances
        .iter()
        .find(|a| a.idempotency_key == idemp || a.occurrence_id == payload.occurrence_id)
    {
        return Ok(Json(json!({
            "status": "already_verified",
            "attendance": existing
        })));
    }

    // 2. Recherche et validation de l'occurrence
    let Some(occurrence) = db
        .course_occurrences
        .iter()
        .find(|o| o.id == payload.occurrence_id)
        .cloned()
    else {
        return Err(err_resp(StatusCode::NOT_FOUND, "Séance de cours introuvable."));
    };

    if occurrence.status == "cancelled" {
        return Err(err_resp(
            StatusCode::CONFLICT,
            "Cette séance de cours a été annulée.",
        ));
    }

    // 3. Contrôle de localisation stricte : terminal de la salle exacte
    if occurrence.site_id != terminal.site_id || occurrence.room_id != terminal.room_id {
        return Err(err_resp(
            StatusCode::CONFLICT,
            format!(
                "Mauvaise salle : cette séance se déroule en {} (club {}). Badgez sur la tablette de la salle.",
                occurrence.room_id, occurrence.site_id
            ),
        ));
    }

    // 4. Contrôle d'affectation coach / remplacement
    let coach_id = payload.coach_id.trim();
    let is_authorized_coach = occurrence.assigned_coach_id == coach_id
        || occurrence.substitute_coach_id.as_deref() == Some(coach_id);

    if !is_authorized_coach {
        return Err(err_resp(
            StatusCode::FORBIDDEN,
            "Vous n'êtes pas affecté à l'animation de cette séance de cours.",
        ));
    }

    // 5. Évaluation de la checklist
    let checklist_completed = !payload.checklist_answers.is_empty()
        && payload.checklist_answers.iter().all(|a| a.checked);

    let attendance_id = format!("att-{}", rand::random::<u128>());
    let now = Utc::now().to_rfc3339();
    let coach_display_name = coach_name(&db, coach_id);

    let attendance = CourseAttendanceRecord {
        id: attendance_id.clone(),
        occurrence_id: occurrence.id.clone(),
        site_id: occurrence.site_id.clone(),
        room_id: occurrence.room_id.clone(),
        terminal_id: terminal.id.clone(),
        coach_id: coach_id.to_string(),
        coach_name: coach_display_name.clone(),
        verified_at: now.clone(),
        checklist_version: "2026.11-v1".into(),
        checklist_completed,
        checklist_answers: payload.checklist_answers,
        note: payload.note,
        idempotency_key: idemp.to_string(),
    };

    let mut next = db.clone();
    next.course_attendances.push(attendance.clone());

    // Audit immuable sans toucher aux heures travaillées RH
    append_audit(
        &mut next,
        coach_id,
        "COURSE_PRESENCE_VERIFIED",
        format!(
            "Présence validée pour {} ({}) sur terminal {} - checklist : {}",
            occurrence.course_title,
            occurrence.id,
            terminal.label,
            if checklist_completed { "complète" } else { "incomplète" }
        ),
        &occurrence.site_id,
        &attendance_id,
        None,
        Some("verified".into()),
    );

    persist_state(&state.data_dir, &next).map_err(|err| {
        err_resp(
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Échec de persistance de la présence cours : {err}"),
        )
    })?;
    *db = next;

    Ok(Json(json!({
        "status": "verified",
        "attendance": attendance
    })))
}

/// Consultation des présences de cours par club (responsables RH / planning)
pub async fn get_club_course_attendances(
    State(state): State<SharedState>,
    Path(raw_club): Path<String>,
    headers: HeaderMap,
) -> Result<Json<Value>, Failure> {
    let (_, site_id) = club_site(&raw_club)?;
    let (actor_id, _) = resolve_session_actor(&state, &headers).await?;
    let db = state.db.read().await;

    if !can_access_site_scope(&db, &actor_id, site_id) {
        return Err(err_resp(
            StatusCode::FORBIDDEN,
            "Accès refusé aux données de ce club.",
        ));
    }

    let records: Vec<&CourseAttendanceRecord> = db
        .course_attendances
        .iter()
        .filter(|a| a.site_id == site_id)
        .collect();

    Ok(Json(json!({
        "siteId": site_id,
        "attendances": records
    })))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::clock_terminals::{hash_terminal_token, ClockTerminal};
    use crate::routes::SharedAppState;
    use crate::seed::load_or_init_state;
    use axum::http::HeaderValue;
    use std::collections::HashMap;
    use std::sync::Arc;
    use tokio::sync::RwLock;

    fn test_state() -> SharedState {
        let dir = std::env::temp_dir().join(format!("course_test_{}", rand::random::<u128>()));
        Arc::new(SharedAppState {
            db: RwLock::new(load_or_init_state(&dir)),
            data_dir: dir,
            sessions: RwLock::new(HashMap::new()),
            login_attempts: RwLock::new(HashMap::new()),
        })
    }

    #[tokio::test]
    async fn course_presence_verifies_room_coach_and_checklist_idempotently() {
        let state = test_state();

        // 1. Créer un terminal pour la Salle A de Beynost
        let token_salle_a = "token-tablette-salle-a";
        let terminal_salle_a = ClockTerminal {
            id: "term-salle-a-bey".into(),
            site_id: "club-beynost".into(),
            room_id: "room-salle-a".into(),
            room_label: "Salle Cours Collectifs A".into(),
            label: "Tablette Salle A".into(),
            status: "active".into(),
            pairing_code: None,
            device_secret_hash: Some(hash_terminal_token(token_salle_a)),
            created_at: Utc::now().to_rfc3339(),
            paired_at: Some(Utc::now().to_rfc3339()),
            last_seen_at: Some(Utc::now().to_rfc3339()),
        };

        // 2. Créer un terminal pour la Salle B de Beynost
        let token_salle_b = "token-tablette-salle-b";
        let terminal_salle_b = ClockTerminal {
            id: "term-salle-b-bey".into(),
            site_id: "club-beynost".into(),
            room_id: "room-salle-b".into(),
            room_label: "Salle Bilan InBody".into(),
            label: "Tablette Salle B".into(),
            status: "active".into(),
            pairing_code: None,
            device_secret_hash: Some(hash_terminal_token(token_salle_b)),
            created_at: Utc::now().to_rfc3339(),
            paired_at: Some(Utc::now().to_rfc3339()),
            last_seen_at: Some(Utc::now().to_rfc3339()),
        };

        // 3. Occurrence BodyPump prévue en Salle A avec le coach Mario
        let occurrence_id = "occ-bodypump-18h".to_string();
        let occurrence = CourseOccurrence {
            id: occurrence_id.clone(),
            site_id: "club-beynost".into(),
            room_id: "room-salle-a".into(),
            course_title: "BodyPump".into(),
            assigned_coach_id: "emp-mario".into(),
            substitute_coach_id: None,
            start_time: "2026-11-24T18:00:00Z".into(),
            end_time: "2026-11-24T19:00:00Z".into(),
            status: "scheduled".into(),
        };

        {
            let mut db = state.db.write().await;
            db.clock_terminals.push(terminal_salle_a);
            db.clock_terminals.push(terminal_salle_b);
            db.course_occurrences.push(occurrence);
        }

        // 4. Test échec : validation sur la tablette de la Salle B (mauvaise salle) -> 409 Conflict
        let mut headers_salle_b = HeaderMap::new();
        headers_salle_b.insert("x-cfitness-terminal-token", HeaderValue::from_str(token_salle_b).unwrap());

        let err_bad_room = post_verify_course_presence(
            State(state.clone()),
            headers_salle_b,
            Json(VerifyPresencePayload {
                occurrence_id: occurrence_id.clone(),
                coach_id: "emp-mario".into(),
                checklist_answers: vec![],
                note: None,
                idempotency_key: "idemp-01".into(),
            }),
        )
        .await
        .expect_err("bad room must return 409 conflict");
        assert_eq!(err_bad_room.0, StatusCode::CONFLICT);

        // 5. Test échec : coach non affecté (Chloé tente de valider la séance de Mario) -> 403 Forbidden
        let mut headers_salle_a = HeaderMap::new();
        headers_salle_a.insert("x-cfitness-terminal-token", HeaderValue::from_str(token_salle_a).unwrap());

        let err_wrong_coach = post_verify_course_presence(
            State(state.clone()),
            headers_salle_a.clone(),
            Json(VerifyPresencePayload {
                occurrence_id: occurrence_id.clone(),
                coach_id: "emp-chloe".into(),
                checklist_answers: vec![],
                note: None,
                idempotency_key: "idemp-02".into(),
            }),
        )
        .await
        .expect_err("wrong coach must return 403");
        assert_eq!(err_wrong_coach.0, StatusCode::FORBIDDEN);

        // 6. Test succès : Mario valide sur la tablette de la Salle A avec checklist complète
        let Json(res_ok) = post_verify_course_presence(
            State(state.clone()),
            headers_salle_a.clone(),
            Json(VerifyPresencePayload {
                occurrence_id: occurrence_id.clone(),
                coach_id: "emp-mario".into(),
                checklist_answers: vec![
                    ChecklistItemAnswer {
                        item_id: "chk-micro".into(),
                        label: "Micro & sono".into(),
                        checked: true,
                    },
                    ChecklistItemAnswer {
                        item_id: "chk-secu".into(),
                        label: "Sécurité & issues".into(),
                        checked: true,
                    },
                ],
                note: Some("Prêt pour la séance".into()),
                idempotency_key: "idemp-03".into(),
            }),
        )
        .await
        .expect("presence verification OK");

        assert_eq!(res_ok["status"], "verified");
        assert_eq!(res_ok["attendance"]["checklistCompleted"], true);

        // 7. Idempotence : un deuxième envoi de la même clé renvoie already_verified sans doublon
        let Json(res_idemp) = post_verify_course_presence(
            State(state.clone()),
            headers_salle_a,
            Json(VerifyPresencePayload {
                occurrence_id,
                coach_id: "emp-mario".into(),
                checklist_answers: vec![],
                note: None,
                idempotency_key: "idemp-03".into(),
            }),
        )
        .await
        .expect("idempotent replay OK");

        assert_eq!(res_idemp["status"], "already_verified");

        let db = state.db.read().await;
        assert_eq!(db.course_attendances.len(), 1);

        let _ = std::fs::remove_dir_all(&state.data_dir);
    }
}
