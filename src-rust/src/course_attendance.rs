use crate::clock_terminals::{authenticate_terminal, authenticated_employee, ClockTerminal};
use crate::models::AppDatabaseState;
use crate::rbac::can_access_site_scope;
use crate::routes::{append_audit, err_resp, resolve_session_actor, SharedState};
use crate::seed::persist_state;
use axum::{
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    Json,
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

type Failure = (StatusCode, Json<Value>);

pub const OFFICIAL_CHECKLIST_VERSION: &str = "2026.11-v1";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OfficialChecklistItemDef {
    pub id: String,
    pub label: String,
    pub required: bool,
}

pub fn official_checklist_items() -> Vec<OfficialChecklistItemDef> {
    vec![
        OfficialChecklistItemDef {
            id: "chk-sono".into(),
            label: "Sonorisation, micro et playlist vérifiés".into(),
            required: true,
        },
        OfficialChecklistItemDef {
            id: "chk-securite".into(),
            label: "Sécurité de la salle et issues de secours dégagées".into(),
            required: true,
        },
        OfficialChecklistItemDef {
            id: "chk-materiel".into(),
            label: "Matériel vérifié, propre et mis à disposition".into(),
            required: true,
        },
        OfficialChecklistItemDef {
            id: "chk-climatisation".into(),
            label: "Aération ou climatisation réglée".into(),
            required: true,
        },
    ]
}

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

/// Valide la checklist contre le référentiel officiel serveur.
fn validate_checklist_against_spec(answers: &[ChecklistItemAnswer]) -> Result<bool, Failure> {
    if answers.is_empty() {
        return Ok(false);
    }
    let official = official_checklist_items();
    let mut seen_ids = std::collections::HashSet::new();

    for a in answers {
        if !seen_ids.insert(&a.item_id) {
            return Err(err_resp(
                StatusCode::BAD_REQUEST,
                format!("Élément de checklist en double : {}", a.item_id),
            ));
        }
        if !official.iter().any(|item| item.id == a.item_id) {
            return Err(err_resp(
                StatusCode::BAD_REQUEST,
                format!("Élément de checklist non reconnu : {}", a.item_id),
            ));
        }
    }

    // Vérifier que tous les items obligatoires sont bien fournis
    for req in official.iter().filter(|i| i.required) {
        let Some(ans) = answers.iter().find(|a| a.item_id == req.id) else {
            return Err(err_resp(
                StatusCode::UNPROCESSABLE_ENTITY,
                format!("Élément obligatoire manquant dans la checklist : {}", req.label),
            ));
        };
        if !ans.checked {
            return Ok(false);
        }
    }
    Ok(true)
}

/// Contrôle que la validation se produit dans la fenêtre horaire autorisée :
/// De 45 minutes avant le début de la séance à 30 minutes après le début.
fn validate_time_window(occurrence: &CourseOccurrence, now: DateTime<Utc>) -> Result<(), Failure> {
    let start = DateTime::parse_from_rfc3339(&occurrence.start_time)
        .map(|dt| dt.with_timezone(&Utc))
        .map_err(|_| err_resp(StatusCode::INTERNAL_SERVER_ERROR, "Horodatage de début de cours invalide."))?;

    let window_start = start - chrono::Duration::minutes(45);
    let window_end = start + chrono::Duration::minutes(30);

    if now < window_start {
        let mins_early = (window_start - now).num_minutes();
        return Err(err_resp(
            StatusCode::UNPROCESSABLE_ENTITY,
            format!("Trop tôt pour valider l'avant-cours. Ouverture de la fenêtre dans {} minute(s).", mins_early + 1),
        ));
    }
    if now > window_end {
        return Err(err_resp(
            StatusCode::UNPROCESSABLE_ENTITY,
            "La fenêtre de validation d'avant-cours pour cette séance est expirée.",
        ));
    }
    Ok(())
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
        "officialChecklist": {
            "version": OFFICIAL_CHECKLIST_VERSION,
            "items": official_checklist_items()
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
    // 1. Authentification stricte du terminal de salle
    let mut db = state.db.write().await;
    let terminal = authenticate_terminal(&db, &headers).await?;

    // 2. Authentification stricte du collaborateur coach (Bearer personnel concordant)
    let actor_id = authenticated_employee(&state, &headers).await?;
    let coach_id = payload.coach_id.trim();
    if actor_id != coach_id {
        return Err(err_resp(
            StatusCode::FORBIDDEN,
            "L'identifiant du coach ne correspond pas à votre session connectée.",
        ));
    }

    // 3. Recherche et validation de l'occurrence
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

    // 4. Contrôle de localisation stricte : terminal de la salle exacte
    if occurrence.site_id != terminal.site_id || occurrence.room_id != terminal.room_id {
        return Err(err_resp(
            StatusCode::CONFLICT,
            format!(
                "Mauvaise salle : cette séance se déroule en {} (club {}). Badgez sur la tablette de la salle.",
                occurrence.room_id, occurrence.site_id
            ),
        ));
    }

    // 5. Contrôle d'affectation coach / remplacement
    let is_authorized_coach = occurrence.assigned_coach_id == coach_id
        || occurrence.substitute_coach_id.as_deref() == Some(coach_id);

    if !is_authorized_coach {
        return Err(err_resp(
            StatusCode::FORBIDDEN,
            "Vous n'êtes pas affecté à l'animation de cette séance de cours.",
        ));
    }

    // 6. Contrôle de la fenêtre horaire (de -45min à +30min)
    let now = Utc::now();
    validate_time_window(&occurrence, now)?;

    // 7. Contrôle d'idempotence borné à l'acteur, l'occurrence et la clé
    let idemp = payload.idempotency_key.trim();
    if idemp.is_empty() {
        return Err(err_resp(
            StatusCode::BAD_REQUEST,
            "Clé d'idempotence requise.",
        ));
    }
    let scoped_idempotency_key = format!("{}:{}:{}", occurrence.id, coach_id, idemp);
    if let Some(existing) = db
        .course_attendances
        .iter()
        .find(|a| a.occurrence_id == occurrence.id || a.idempotency_key == scoped_idempotency_key)
    {
        return Ok(Json(json!({
            "status": "already_verified",
            "attendance": existing
        })));
    }

    // 8. Évaluation de la checklist contre le référentiel serveur officiel
    let checklist_completed = validate_checklist_against_spec(&payload.checklist_answers)?;

    let attendance_id = format!("att-{}", rand::random::<u128>());
    let now_iso = now.to_rfc3339();
    let coach_display_name = coach_name(&db, coach_id);

    let attendance = CourseAttendanceRecord {
        id: attendance_id.clone(),
        occurrence_id: occurrence.id.clone(),
        site_id: occurrence.site_id.clone(),
        room_id: occurrence.room_id.clone(),
        terminal_id: terminal.id.clone(),
        coach_id: coach_id.to_string(),
        coach_name: coach_display_name.clone(),
        verified_at: now_iso,
        checklist_version: OFFICIAL_CHECKLIST_VERSION.into(),
        checklist_completed,
        checklist_answers: payload.checklist_answers,
        note: payload.note,
        idempotency_key: scoped_idempotency_key,
    };

    let mut next = db.clone();
    next.course_attendances.push(attendance.clone());

    // Audit immuable sans toucher aux heures travaillées RH (zéro double comptage)
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

    async fn auth_headers(state: &SharedState, emp_id: &str, terminal_token: &str) -> HeaderMap {
        let token = format!("session-{emp_id}-{}", rand::random::<u128>());
        state.sessions.write().await.insert(
            token.clone(),
            (emp_id.into(), chrono::Utc::now().timestamp() + 3600),
        );
        let mut h = HeaderMap::new();
        h.insert("authorization", format!("Bearer {token}").parse().unwrap());
        h.insert("x-cfitness-terminal-token", HeaderValue::from_str(terminal_token).unwrap());
        h
    }

    #[tokio::test]
    async fn course_presence_verifies_identity_room_window_checklist_and_idempotency() {
        let state = test_state();

        // 1. Terminaux Salle A et Salle B de Beynost
        let token_salle_a = "token-tablette-salle-a";
        let term_salle_a = ClockTerminal {
            id: "term-salle-a-bey".into(),
            site_id: "club-beynost".into(),
            room_id: "room-salle-a".into(),
            room_label: "Salle Cours Collectifs A".into(),
            label: "Tablette Salle A".into(),
            status: "active".into(),
            pairing_code: None,
            failed_pairing_attempts: 0,
            device_secret_hash: Some(hash_terminal_token(token_salle_a)),
            created_at: Utc::now().to_rfc3339(),
            paired_at: Some(Utc::now().to_rfc3339()),
            last_seen_at: Some(Utc::now().to_rfc3339()),
        };

        let token_salle_b = "token-tablette-salle-b";
        let term_salle_b = ClockTerminal {
            id: "term-salle-b-bey".into(),
            site_id: "club-beynost".into(),
            room_id: "room-salle-b".into(),
            room_label: "Salle Bilan InBody".into(),
            label: "Tablette Salle B".into(),
            status: "active".into(),
            pairing_code: None,
            failed_pairing_attempts: 0,
            device_secret_hash: Some(hash_terminal_token(token_salle_b)),
            created_at: Utc::now().to_rfc3339(),
            paired_at: Some(Utc::now().to_rfc3339()),
            last_seen_at: Some(Utc::now().to_rfc3339()),
        };

        // 2. Occurrence BodyPump débutant dans 10 minutes (dans la fenêtre [-45m, +30m])
        let now = Utc::now();
        let course_start = (now + chrono::Duration::minutes(10)).to_rfc3339();
        let course_end = (now + chrono::Duration::minutes(60)).to_rfc3339();
        let occurrence_id = "occ-bodypump-current".to_string();

        let occurrence = CourseOccurrence {
            id: occurrence_id.clone(),
            site_id: "club-beynost".into(),
            room_id: "room-salle-a".into(),
            course_title: "BodyPump".into(),
            assigned_coach_id: "emp-chloe".into(),
            substitute_coach_id: None,
            start_time: course_start,
            end_time: course_end,
            status: "scheduled".into(),
        };

        {
            let mut db = state.db.write().await;
            db.clock_terminals.push(term_salle_a);
            db.clock_terminals.push(term_salle_b);
            db.course_occurrences.push(occurrence);
        }

        // 3. Test échec : pas de session Bearer coach -> 401 Unauthorized
        let mut headers_no_bearer = HeaderMap::new();
        headers_no_bearer.insert("x-cfitness-terminal-token", HeaderValue::from_str(token_salle_a).unwrap());
        let err_no_auth = post_verify_course_presence(
            State(state.clone()),
            headers_no_bearer,
            Json(VerifyPresencePayload {
                occurrence_id: occurrence_id.clone(),
                coach_id: "emp-chloe".into(),
                checklist_answers: vec![],
                note: None,
                idempotency_key: "idemp-01".into(),
            }),
        )
        .await
        .expect_err("no bearer must be 401");
        assert_eq!(err_no_auth.0, StatusCode::UNAUTHORIZED);

        // 4. Test échec : usurpation (Mario connecté tente de valider avec coachId Chloé) -> 403 Forbidden
        let headers_mario_salle_a = auth_headers(&state, "emp-karim", token_salle_a).await;
        let err_spoof = post_verify_course_presence(
            State(state.clone()),
            headers_mario_salle_a.clone(),
            Json(VerifyPresencePayload {
                occurrence_id: occurrence_id.clone(),
                coach_id: "emp-chloe".into(),
                checklist_answers: vec![],
                note: None,
                idempotency_key: "idemp-02".into(),
            }),
        )
        .await
        .expect_err("spoofing coach_id must return 403");
        assert_eq!(err_spoof.0, StatusCode::FORBIDDEN);

        // 5. Test échec : coach non affecté (Karim tente de valider la séance de Chloé) -> 403 Forbidden
        let err_wrong_coach = post_verify_course_presence(
            State(state.clone()),
            headers_mario_salle_a,
            Json(VerifyPresencePayload {
                occurrence_id: occurrence_id.clone(),
                coach_id: "emp-karim".into(),
                checklist_answers: vec![],
                note: None,
                idempotency_key: "idemp-03".into(),
            }),
        )
        .await
        .expect_err("unassigned coach must return 403");
        assert_eq!(err_wrong_coach.0, StatusCode::FORBIDDEN);

        // 6. Test échec : mauvaise salle (Chloé badge sur la tablette Salle B au lieu de Salle A) -> 409 Conflict
        let headers_chloe_salle_b = auth_headers(&state, "emp-chloe", token_salle_b).await;
        let err_bad_room = post_verify_course_presence(
            State(state.clone()),
            headers_chloe_salle_b,
            Json(VerifyPresencePayload {
                occurrence_id: occurrence_id.clone(),
                coach_id: "emp-chloe".into(),
                checklist_answers: vec![],
                note: None,
                idempotency_key: "idemp-04".into(),
            }),
        )
        .await
        .expect_err("bad room terminal must return 409");
        assert_eq!(err_bad_room.0, StatusCode::CONFLICT);

        // Headers corrects : Chloé sur la tablette de la Salle A
        let headers_chloe_salle_a = auth_headers(&state, "emp-chloe", token_salle_a).await;

        // 7. Test échec : checklist avec item inventé / non reconnu -> 400 Bad Request
        let err_unknown_item = post_verify_course_presence(
            State(state.clone()),
            headers_chloe_salle_a.clone(),
            Json(VerifyPresencePayload {
                occurrence_id: occurrence_id.clone(),
                coach_id: "emp-chloe".into(),
                checklist_answers: vec![ChecklistItemAnswer {
                    item_id: "chk-fake".into(),
                    label: "Fake item".into(),
                    checked: true,
                }],
                note: None,
                idempotency_key: "idemp-05".into(),
            }),
        )
        .await
        .expect_err("unknown checklist item must return 400");
        assert_eq!(err_unknown_item.0, StatusCode::BAD_REQUEST);

        // 8. Test échec : checklist incomplète (item obligatoire manquant) -> 422 Unprocessable Entity
        let err_missing_item = post_verify_course_presence(
            State(state.clone()),
            headers_chloe_salle_a.clone(),
            Json(VerifyPresencePayload {
                occurrence_id: occurrence_id.clone(),
                coach_id: "emp-chloe".into(),
                checklist_answers: vec![ChecklistItemAnswer {
                    item_id: "chk-sono".into(),
                    label: "Sonorisation".into(),
                    checked: true,
                }],
                note: None,
                idempotency_key: "idemp-06".into(),
            }),
        )
        .await
        .expect_err("missing required checklist items must return 422");
        assert_eq!(err_missing_item.0, StatusCode::UNPROCESSABLE_ENTITY);

        // 9. Test succès : Chloé valide avec la checklist officielle complète
        let valid_answers = vec![
            ChecklistItemAnswer {
                item_id: "chk-sono".into(),
                label: "Sonorisation, micro et playlist vérifiés".into(),
                checked: true,
            },
            ChecklistItemAnswer {
                item_id: "chk-securite".into(),
                label: "Sécurité de la salle et issues de secours dégagées".into(),
                checked: true,
            },
            ChecklistItemAnswer {
                item_id: "chk-materiel".into(),
                label: "Matériel vérifié, propre et mis à disposition".into(),
                checked: true,
            },
            ChecklistItemAnswer {
                item_id: "chk-climatisation".into(),
                label: "Aération ou climatisation réglée".into(),
                checked: true,
            },
        ];

        let Json(res_ok) = post_verify_course_presence(
            State(state.clone()),
            headers_chloe_salle_a.clone(),
            Json(VerifyPresencePayload {
                occurrence_id: occurrence_id.clone(),
                coach_id: "emp-chloe".into(),
                checklist_answers: valid_answers.clone(),
                note: Some("Séance prête, adhérents en attente".into()),
                idempotency_key: "idemp-07".into(),
            }),
        )
        .await
        .expect("presence verification must succeed");

        assert_eq!(res_ok["status"], "verified");
        assert_eq!(res_ok["attendance"]["checklistCompleted"], true);
        assert_eq!(res_ok["attendance"]["checklistVersion"], OFFICIAL_CHECKLIST_VERSION);

        // 10. Idempotence : un rejeu avec la même clé renvoie already_verified
        let Json(res_idemp) = post_verify_course_presence(
            State(state.clone()),
            headers_chloe_salle_a.clone(),
            Json(VerifyPresencePayload {
                occurrence_id: occurrence_id.clone(),
                coach_id: "emp-chloe".into(),
                checklist_answers: valid_answers,
                note: None,
                idempotency_key: "idemp-07".into(),
            }),
        )
        .await
        .expect("replay must return already_verified");

        assert_eq!(res_idemp["status"], "already_verified");

        let db = state.db.read().await;
        assert_eq!(db.course_attendances.len(), 1);

        let _ = std::fs::remove_dir_all(&state.data_dir);
    }
}
