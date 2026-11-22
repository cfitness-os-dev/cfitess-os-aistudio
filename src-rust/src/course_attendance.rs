use crate::clock_terminals::{authenticate_terminal, authenticated_employee, ClockTerminal};
use crate::models::AppDatabaseState;
use crate::rbac::{can_access_site_scope, evaluate_permission, PermissionTarget};
use crate::routes::{append_audit, err_resp, SharedState};
use crate::seed::persist_state;
use axum::{
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    Json,
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::collections::HashMap;

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
    #[serde(default)]
    pub completed_before_start: bool,
    pub checklist_answers: Vec<ChecklistItemAnswer>,
    pub note: Option<String>,
    pub idempotency_key: String,
    #[serde(default)]
    pub checklist_updated_at: Option<String>,
    #[serde(default)]
    pub checklist_updated_by: Option<String>,
    #[serde(default)]
    pub checklist_updated_terminal_id: Option<String>,
    #[serde(default)]
    pub operation_fingerprints: HashMap<String, String>,
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

/// Valide la checklist contre le référentiel officiel serveur et normalise les libellés canoniques.
fn validate_checklist_against_spec(
    answers: &[ChecklistItemAnswer],
) -> Result<(bool, Vec<ChecklistItemAnswer>), Failure> {
    if answers.is_empty() {
        return Ok((false, vec![]));
    }
    let official = official_checklist_items();
    let mut seen_ids = std::collections::HashSet::new();
    let mut canonical_answers = Vec::with_capacity(answers.len());

    for a in answers {
        if !seen_ids.insert(&a.item_id) {
            return Err(err_resp(
                StatusCode::BAD_REQUEST,
                format!("Élément de checklist en double : {}", a.item_id),
            ));
        }
        let Some(def) = official.iter().find(|item| item.id == a.item_id) else {
            return Err(err_resp(
                StatusCode::BAD_REQUEST,
                format!("Élément de checklist non reconnu : {}", a.item_id),
            ));
        };
        canonical_answers.push(ChecklistItemAnswer {
            item_id: def.id.clone(),
            label: def.label.clone(),
            checked: a.checked,
        });
    }

    // Vérifier que tous les items obligatoires sont bien fournis
    let mut all_checked = true;
    for req in official.iter().filter(|i| i.required) {
        let Some(ans) = canonical_answers.iter().find(|a| a.item_id == req.id) else {
            return Err(err_resp(
                StatusCode::UNPROCESSABLE_ENTITY,
                format!("Élément obligatoire manquant dans la checklist : {}", req.label),
            ));
        };
        if !ans.checked {
            all_checked = false;
        }
    }
    Ok((all_checked, canonical_answers))
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
/// (écran partagé de salle : n'expose pas les notes privées ni les clés d'idempotence)
pub async fn get_room_occurrences(
    State(state): State<SharedState>,
    headers: HeaderMap,
) -> Result<Json<Value>, Failure> {
    let db = state.db.read().await;
    let terminal: ClockTerminal = authenticate_terminal(&db, &headers).await?;
    let today = Utc::now().date_naive();

    let occurrences: Vec<Value> = db
        .course_occurrences
        .iter()
        .filter(|o| {
            if o.site_id != terminal.site_id || o.room_id != terminal.room_id {
                return false;
            }
            DateTime::parse_from_rfc3339(&o.start_time)
                .map(|dt| dt.with_timezone(&Utc).date_naive() == today)
                .unwrap_or(false)
        })
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
                "isVerified": attendance.is_some(),
                "isPrepared": attendance.map(|a| a.checklist_completed).unwrap_or(false),
                "preparedBeforeStart": attendance.map(|a| a.completed_before_start).unwrap_or(false)
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

    // 2b. Contrôle d'activité, d'affectation au club et de politique terminal (P0)
    let short_club = match terminal.site_id.as_str() {
        "club-carre-soie" => "carre-de-soie",
        "club-beynost" => "beynost",
        _ => {
            return Err(err_resp(
                StatusCode::FORBIDDEN,
                "L'établissement de cet appareil n'est pas reconnu.",
            ))
        }
    };
    let Some(employee) = db.employees.iter().find(|e| e.id == coach_id) else {
        return Err(err_resp(
            StatusCode::NOT_FOUND,
            "Collaborateur introuvable.",
        ));
    };
    if !employee.active || !can_access_site_scope(&db, coach_id, &terminal.site_id) {
        return Err(err_resp(
            StatusCode::FORBIDDEN,
            "Vous n'avez pas d'affectation active dans ce club.",
        ));
    }
    let pol = crate::clock_policy::policy(&db, coach_id, short_club);
    if !pol.terminal_allowed {
        return Err(err_resp(
            StatusCode::FORBIDDEN,
            "Votre profil ne dispose pas du droit de pointage sur les terminaux de ce club.",
        ));
    }

    // 3. Recherche de l'occurrence (le contrôle de statut cancelled/completed s'applique après le rejeu idempotent)
    let Some(occurrence) = db
        .course_occurrences
        .iter()
        .find(|o| o.id == payload.occurrence_id)
        .cloned()
    else {
        return Err(err_resp(StatusCode::NOT_FOUND, "Séance de cours introuvable."));
    };

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

    // 6. Validation de la checklist et contrôle d'idempotence AVANT la fenêtre horaire
    // (permet de retrouver un succès déjà enregistré même après expiration de la fenêtre ou passage en completed)
    let idemp = payload.idempotency_key.trim();
    if idemp.is_empty() {
        return Err(err_resp(
            StatusCode::BAD_REQUEST,
            "Clé d'idempotence requise.",
        ));
    }
    let (checklist_completed, canonical_answers) =
        validate_checklist_against_spec(&payload.checklist_answers)?;

    let fingerprint_input = json!({
        "occurrenceId": occurrence.id,
        "coachId": coach_id,
        "terminalId": terminal.id,
        "checklistAnswers": canonical_answers,
        "note": payload.note
    })
    .to_string();
    let op_fingerprint = format!("{:x}", Sha256::digest(fingerprint_input.as_bytes()));
    let scoped_idempotency_key = format!("{}:{}:{}", occurrence.id, coach_id, idemp);

    if let Some(existing) = db.course_attendances.iter().find(|a| {
        a.idempotency_key == scoped_idempotency_key
            || a.operation_fingerprints
                .contains_key(&scoped_idempotency_key)
    }) {
        if let Some(stored_fp) = existing.operation_fingerprints.get(&scoped_idempotency_key) {
            if stored_fp != &op_fingerprint {
                return Err(err_resp(
                    StatusCode::CONFLICT,
                    "Clé d'idempotence déjà utilisée pour un contenu ou un terminal différent.",
                ));
            }
        }
        return Ok(Json(json!({
            "status": "already_verified",
            "attendance": existing
        })));
    }

    // 7. Contrôle du statut et de la fenêtre horaire (de -45min à +30min) pour toute nouvelle écriture
    if occurrence.status == "cancelled" || occurrence.status == "completed" {
        return Err(err_resp(
            StatusCode::CONFLICT,
            "Cette séance de cours est annulée ou déjà terminée.",
        ));
    }
    let now = Utc::now();
    validate_time_window(&occurrence, now)?;
    let course_start = DateTime::parse_from_rfc3339(&occurrence.start_time)
        .map(|dt| dt.with_timezone(&Utc))
        .unwrap_or(now);
    let completed_before_start = checklist_completed && now <= course_start;

    let now_iso = now.to_rfc3339();
    let mut next = db.clone();

    // Si l'occurrence a déjà une présence enregistrée :
    // - si la checklist était déjà complète -> 409 (évite d'accepter silencieusement une nouvelle clé différente)
    // - si la checklist était incomplète -> mise à jour tracée séparément sans écraser verified_at/terminal_id initiaux
    if let Some(existing_idx) = next
        .course_attendances
        .iter()
        .position(|a| a.occurrence_id == occurrence.id)
    {
        if next.course_attendances[existing_idx].checklist_completed {
            return Err(err_resp(
                StatusCode::CONFLICT,
                "La présence et la checklist de cette séance sont déjà définitivement validées.",
            ));
        }

        let updated = &mut next.course_attendances[existing_idx];
        updated.checklist_updated_at = Some(now_iso);
        updated.checklist_updated_by = Some(coach_id.to_string());
        updated.checklist_updated_terminal_id = Some(terminal.id.clone());
        updated.checklist_version = OFFICIAL_CHECKLIST_VERSION.into();
        updated.checklist_completed = checklist_completed;
        updated.completed_before_start = completed_before_start;
        updated.checklist_answers = canonical_answers;
        if payload.note.is_some() {
            updated.note = payload.note;
        }
        updated
            .operation_fingerprints
            .insert(scoped_idempotency_key, op_fingerprint);
        let updated_clone = updated.clone();

        append_audit(
            &mut next,
            coach_id,
            "COURSE_CHECKLIST_UPDATED",
            format!(
                "Checklist mise à jour pour {} ({}) sur terminal {} - checklist : {}",
                occurrence.course_title,
                occurrence.id,
                terminal.label,
                if checklist_completed { "complète" } else { "incomplète" }
            ),
            &occurrence.site_id,
            &updated_clone.id,
            Some("incomplete".into()),
            Some(if checklist_completed { "completed" } else { "incomplete" }.into()),
        );

        persist_state(&state.data_dir, &next).map_err(|err| {
            err_resp(
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Échec de persistance de la mise à jour checklist : {err}"),
            )
        })?;
        *db = next;

        return Ok(Json(json!({
            "status": "checklist_updated",
            "attendance": updated_clone
        })));
    }

    let attendance_id = format!("att-{}", rand::random::<u128>());
    let coach_display_name = coach_name(&db, coach_id);
    let mut operation_fingerprints = HashMap::new();
    operation_fingerprints.insert(scoped_idempotency_key.clone(), op_fingerprint);

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
        completed_before_start,
        checklist_answers: canonical_answers,
        note: payload.note,
        idempotency_key: scoped_idempotency_key,
        checklist_updated_at: None,
        checklist_updated_by: None,
        checklist_updated_terminal_id: None,
        operation_fingerprints,
    };

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

/// Consultation des présences de cours par club :
/// - Chaque présence est filtrée via ORG04-37 sur le coach cible et ses vraies équipes dans le club
/// - Un collaborateur voit toujours ses propres présences dans son club
pub async fn get_club_course_attendances(
    State(state): State<SharedState>,
    Path(raw_club): Path<String>,
    headers: HeaderMap,
) -> Result<Json<Value>, Failure> {
    let (_, site_id) = club_site(&raw_club)?;
    let actor_id = authenticated_employee(&state, &headers).await?;
    let db = state.db.read().await;

    if !can_access_site_scope(&db, &actor_id, site_id) {
        return Err(err_resp(
            StatusCode::FORBIDDEN,
            "Accès refusé aux données de ce club.",
        ));
    }

    let mut has_elevated_scope = false;
    let records: Vec<&CourseAttendanceRecord> = db
        .course_attendances
        .iter()
        .filter(|a| {
            if a.site_id != site_id {
                return false;
            }
            if a.coach_id == actor_id {
                return true;
            }
            let target_teams: Vec<String> = db
                .employees
                .iter()
                .find(|e| e.id == a.coach_id)
                .and_then(|e| e.site_accesses.iter().find(|s| s.site_id == site_id))
                .map(|s| s.team_ids.clone())
                .unwrap_or_default();
            let allowed = evaluate_permission(
                &db,
                &actor_id,
                site_id,
                "ORG04-37",
                Some(PermissionTarget {
                    site_id: Some(site_id),
                    target_employee_id: Some(&a.coach_id),
                    target_team_ids: &target_teams,
                    lock_state: None,
                }),
            )
            .allowed;
            if allowed {
                has_elevated_scope = true;
            }
            allowed
        })
        .collect();

    Ok(Json(json!({
        "siteId": site_id,
        "scope": if has_elevated_scope { "club" } else { "self" },
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

        // 5b. Test échec P0 : Chloé n'a pas encore terminal_allowed=true sur Beynost -> 403 Forbidden
        let headers_chloe_salle_a = auth_headers(&state, "emp-chloe", token_salle_a).await;
        let err_p0_denied = post_verify_course_presence(
            State(state.clone()),
            headers_chloe_salle_a.clone(),
            Json(VerifyPresencePayload {
                occurrence_id: occurrence_id.clone(),
                coach_id: "emp-chloe".into(),
                checklist_answers: vec![],
                note: None,
                idempotency_key: "idemp-p0-denied".into(),
            }),
        )
        .await
        .expect_err("P0 terminal_allowed=false must return 403");
        assert_eq!(err_p0_denied.0, StatusCode::FORBIDDEN);

        // Activation de la politique P0 terminal_allowed=true pour Chloé sur Beynost
        {
            let mut db = state.db.write().await;
            db.personal_workspace
                .clock_policies
                .entry("emp-chloe".into())
                .or_default()
                .insert(
                    "beynost".into(),
                    crate::clock_policy::ClockPolicy {
                        personal_allowed: false,
                        terminal_allowed: true,
                        revision: "1".into(),
                        updated_at: Utc::now().to_rfc3339(),
                        updated_by: "emp-daniel".into(),
                    },
                );
        }

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

        // 9a. Test succès initial : Chloé badge sa présence avec checklist vide (incomplète)
        let Json(res_partial) = post_verify_course_presence(
            State(state.clone()),
            headers_chloe_salle_a.clone(),
            Json(VerifyPresencePayload {
                occurrence_id: occurrence_id.clone(),
                coach_id: "emp-chloe".into(),
                checklist_answers: vec![],
                note: Some("Arrivée en salle, préparation en cours".into()),
                idempotency_key: "idemp-07-init".into(),
            }),
        )
        .await
        .expect("initial presence with empty checklist must succeed");
        assert_eq!(res_partial["status"], "verified");
        assert_eq!(res_partial["attendance"]["checklistCompleted"], false);

        // 9b. Test complétion : Chloé complète la checklist officielle (avec un libellé client altéré pour vérifier la normalisation serveur)
        let valid_answers = vec![
            ChecklistItemAnswer {
                item_id: "chk-sono".into(),
                label: "Libellé client modifié".into(),
                checked: true,
            },
            ChecklistItemAnswer {
                item_id: "chk-securite".into(),
                label: "Sécurité".into(),
                checked: true,
            },
            ChecklistItemAnswer {
                item_id: "chk-materiel".into(),
                label: "Matériel".into(),
                checked: true,
            },
            ChecklistItemAnswer {
                item_id: "chk-climatisation".into(),
                label: "Clim".into(),
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
                idempotency_key: "idemp-07-complete".into(),
            }),
        )
        .await
        .expect("checklist completion must succeed");

        assert_eq!(res_ok["status"], "checklist_updated");
        assert_eq!(res_ok["attendance"]["checklistCompleted"], true);
        assert_eq!(res_ok["attendance"]["checklistVersion"], OFFICIAL_CHECKLIST_VERSION);
        assert_eq!(
            res_ok["attendance"]["checklistAnswers"][0]["label"],
            "Sonorisation, micro et playlist vérifiés"
        );

        // 10a. Idempotence : un rejeu strictement identique avec la même clé renvoie already_verified
        let Json(res_idemp) = post_verify_course_presence(
            State(state.clone()),
            headers_chloe_salle_a.clone(),
            Json(VerifyPresencePayload {
                occurrence_id: occurrence_id.clone(),
                coach_id: "emp-chloe".into(),
                checklist_answers: valid_answers.clone(),
                note: Some("Séance prête, adhérents en attente".into()),
                idempotency_key: "idemp-07-complete".into(),
            }),
        )
        .await
        .expect("identical replay must return already_verified");

        assert_eq!(res_idemp["status"], "already_verified");

        // 10b. Conflit d'idempotence : même clé avec un contenu différent -> 409 Conflict
        let err_idemp_conflict = post_verify_course_presence(
            State(state.clone()),
            headers_chloe_salle_a.clone(),
            Json(VerifyPresencePayload {
                occurrence_id: occurrence_id.clone(),
                coach_id: "emp-chloe".into(),
                checklist_answers: valid_answers,
                note: Some("Contenu modifié sur même clé".into()),
                idempotency_key: "idemp-07-complete".into(),
            }),
        )
        .await
        .expect_err("same idempotency key with different payload must return 409");
        assert_eq!(err_idemp_conflict.0, StatusCode::CONFLICT);

        // 11. Cloisonnement lecture :
        // - Un collaborateur d'un autre club (Karim) est refusé (403)
        let headers_karim = auth_headers(&state, "emp-karim", token_salle_a).await;
        let err_karim = get_club_course_attendances(
            State(state.clone()),
            Path("beynost".into()),
            headers_karim,
        )
        .await
        .expect_err("other-club employee must be forbidden");
        assert_eq!(err_karim.0, StatusCode::FORBIDDEN);

        // - La coach elle-même (Chloé, non manager) lit en scope "self" et voit uniquement sa présence
        let Json(chloe_view) = get_club_course_attendances(
            State(state.clone()),
            Path("beynost".into()),
            headers_chloe_salle_a.clone(),
        )
        .await
        .expect("chloe self read must succeed");
        assert_eq!(chloe_view["scope"], "self");
        assert_eq!(chloe_view["attendances"].as_array().unwrap().len(), 1);

        // - Un responsable habilité (Daniel) lit en scope "club" et voit l'ensemble du club
        let headers_daniel = auth_headers(&state, "emp-daniel", token_salle_a).await;
        let Json(daniel_view) = get_club_course_attendances(
            State(state.clone()),
            Path("beynost".into()),
            headers_daniel,
        )
        .await
        .expect("daniel club read must succeed");
        assert_eq!(daniel_view["scope"], "club");
        assert_eq!(daniel_view["attendances"].as_array().unwrap().len(), 1);

        let db = state.db.read().await;
        assert_eq!(db.course_attendances.len(), 1);

        let _ = std::fs::remove_dir_all(&state.data_dir);
    }
}
