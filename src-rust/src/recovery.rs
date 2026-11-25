use crate::models::{
    RecoveryCaseChatHistory, RecoveryCaseRecord, RecoveryChatMessageRecord,
};
use crate::rbac::{can_access_module_action, can_access_site_scope};
use crate::routes::{
    append_audit, authorized_clubs_for_actor, err_resp, resolve_session_actor, SharedState,
};
use crate::seed::persist_state;
use axum::extract::{Path, State};
use axum::http::{HeaderMap, StatusCode};
use axum::Json;
use chrono::Utc;
use serde::Deserialize;
use serde_json::Value;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateRecoveryCasePayload {
    pub member_id: Option<String>,
    pub member_name: String,
    pub club_id: String,
    pub phone: Option<String>,
    pub email: Option<String>,
    pub contract_label: Option<String>,
    pub amount_due_eur: f64,
    pub days_overdue: Option<u32>,
    pub unpaid_reason: Option<String>,
    pub billed_months: Option<Vec<String>>,
    pub has_signed_contract: Option<bool>,
    pub has_id_and_rib: Option<bool>,
    pub has_cgv_accepted: Option<bool>,
    pub missing_docs: Option<Vec<String>>,
    pub last_action_note: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateRecoveryStatusPayload {
    pub status: String,
    pub note: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecordRecoveryRelancePayload {
    pub note: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PutRecoveryCaseChatPayload {
    pub messages: Vec<RecoveryChatMessageRecord>,
}

fn normalize_club_id(raw: &str) -> Option<&'static str> {
    match raw.trim().to_ascii_lowercase().as_str() {
        "carre-de-soie" | "club-carre-soie" | "cds" => Some("carre-de-soie"),
        "beynost" | "club-beynost" | "bey" => Some("beynost"),
        _ => None,
    }
}

fn club_to_site_id(club_id: &str) -> &'static str {
    if club_id == "beynost" {
        "club-beynost"
    } else {
        "club-carre-soie"
    }
}

fn is_valid_recovery_status(status: &str) -> bool {
    matches!(
        status,
        "a_relancer" | "mise_en_demeure" | "pret_contentieux" | "transmis_contentieux" | "regularise"
    )
}

pub async fn get_recovery_cases(
    State(state): State<SharedState>,
    headers: HeaderMap,
) -> Result<Json<Vec<RecoveryCaseRecord>>, (StatusCode, Json<Value>)> {
    let (actor_id, site_id) = resolve_session_actor(&state, &headers).await?;
    let db = state.db.read().await;

    let allowed = can_access_module_action(&db, &actor_id, Some(&site_id), "recovery", "view");
    if !allowed {
        return Err(err_resp(
            StatusCode::FORBIDDEN,
            "Accès refusé (403) : module Recouvrement non autorisé pour ce profil.",
        ));
    }

    let clubs = authorized_clubs_for_actor(&db, &actor_id);
    let visible: Vec<RecoveryCaseRecord> = db
        .recovery_cases
        .iter()
        .filter(|rc| clubs.contains(&rc.club_id) && crate::recovery_evidence::allowed(&db, &actor_id, rc, false))
        .cloned()
        .collect();
    Ok(Json(visible))
}

pub async fn post_recovery_case(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Json(payload): Json<CreateRecoveryCasePayload>,
) -> Result<(StatusCode, Json<RecoveryCaseRecord>), (StatusCode, Json<Value>)> {
    let (actor_id, _) = resolve_session_actor(&state, &headers).await?;
    let mut db = state.db.write().await;

    let member_name = payload.member_name.trim().to_string();
    if member_name.is_empty() {
        return Err(err_resp(
            StatusCode::BAD_REQUEST,
            "Le nom de l'adhérent est obligatoire.",
        ));
    }
    if !payload.amount_due_eur.is_finite() || payload.amount_due_eur <= 0.0 {
        return Err(err_resp(
            StatusCode::BAD_REQUEST,
            "Le montant dû doit être strictement positif.",
        ));
    }
    let Some(club_id) = normalize_club_id(&payload.club_id) else {
        return Err(err_resp(
            StatusCode::BAD_REQUEST,
            format!("Club inconnu : {}", payload.club_id),
        ));
    };
    let target_site_id = club_to_site_id(club_id);

    let clubs = authorized_clubs_for_actor(&db, &actor_id);
    let can_edit = clubs.contains(club_id) && can_access_site_scope(&db, &actor_id, target_site_id)
            && can_access_module_action(&db, &actor_id, Some(target_site_id), "recovery", "edit");
    if !can_edit {
        return Err(err_resp(
            StatusCode::FORBIDDEN,
            "Accès refusé (403) : création de dossier impayé non autorisée sur ce club.",
        ));
    }

    let has_signed = payload.has_signed_contract.unwrap_or(false);
    let has_id_rib = payload.has_id_and_rib.unwrap_or(false);
    let has_cgv = payload.has_cgv_accepted.unwrap_or(false);
    let missing_docs = payload.missing_docs.unwrap_or_else(|| {
        let mut docs = Vec::new();
        if !has_signed {
            docs.push("Contrat signé".to_string());
        }
        if !has_id_rib {
            docs.push("Pièce d'identité & RIB".to_string());
        }
        if !has_cgv {
            docs.push("CGV signées".to_string());
        }
        docs
    });

    let new_case = RecoveryCaseRecord {
        id: format!(
            "rec-{}-{}",
            Utc::now().timestamp_millis(),
            db.recovery_cases.len() + 1
        ),
        member_id: payload
            .member_id
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .unwrap_or("hz-manuel")
            .to_string(),
        member_name: member_name.clone(),
        club_id: club_id.to_string(),
        phone: payload.phone.unwrap_or_default().trim().to_string(),
        email: payload.email.unwrap_or_default().trim().to_string(),
        contract_label: payload
            .contract_label
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .unwrap_or("Abonnement C.Fitness")
            .to_string(),
        amount_due_eur: (payload.amount_due_eur * 100.0).round() / 100.0,
        days_overdue: payload.days_overdue.unwrap_or(0),
        unpaid_reason: payload
            .unpaid_reason
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .unwrap_or("Motif à vérifier auprès de la source")
            .to_string(),
        billed_months: payload
            .billed_months
            .filter(|m| !m.is_empty())
            .unwrap_or_default(),
        has_signed_contract: has_signed,
        has_id_and_rib: has_id_rib,
        has_cgv_accepted: has_cgv,
        missing_docs,
        status: "a_relancer".to_string(),
        relance_count: 0,
        last_action_note: payload
            .last_action_note
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .unwrap_or("Dossier ouvert dans C.Fitness OS.")
            .to_string(),
        overdue_days_known: Some(payload.days_overdue.is_some()),
        compliance_verified: Some(payload.has_signed_contract.is_some() && payload.has_id_and_rib.is_some() && payload.has_cgv_accepted.is_some()),
        source_provenance: Some("Saisie manuelle C.Fitness OS".to_string()),
        last_synced_at_utc: None,
    };

    let snapshot = db.clone();
    db.recovery_cases.push(new_case.clone());
    append_audit(
        &mut db,
        &actor_id,
        "Recouvrement (Création)",
        format!(
            "Ouverture dossier {} — {:.2} € ({})",
            new_case.member_name, new_case.amount_due_eur, new_case.club_id
        ),
        target_site_id,
        &new_case.id,
        None,
        Some(new_case.status.clone()),
    );

    if let Err(err_msg) = persist_state(&state.data_dir, &db) {
        *db = snapshot;
        return Err(err_resp(
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Échec persistance dossier recouvrement : {}", err_msg),
        ));
    }

    Ok((StatusCode::CREATED, Json(new_case)))
}

pub async fn patch_recovery_case_status(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Path(raw_case_id): Path<String>,
    Json(payload): Json<UpdateRecoveryStatusPayload>,
) -> Result<Json<RecoveryCaseRecord>, (StatusCode, Json<Value>)> {
    let (actor_id, _) = resolve_session_actor(&state, &headers).await?;
    let mut db = state.db.write().await;

    let next_status = payload.status.trim().to_string();
    if !is_valid_recovery_status(&next_status) {
        return Err(err_resp(
            StatusCode::BAD_REQUEST,
            format!("Statut recouvrement invalide : {}", payload.status),
        ));
    }

    let case_id = raw_case_id.trim().to_string();
    let Some(idx) = db.recovery_cases.iter().position(|rc| rc.id == case_id) else {
        return Err(err_resp(
            StatusCode::NOT_FOUND,
            format!("Dossier recouvrement introuvable : {}", case_id),
        ));
    };

    let case_club = db.recovery_cases[idx].club_id.clone();
    let target_site_id = club_to_site_id(&case_club);
    let can_edit = crate::recovery_evidence::allowed(&db, &actor_id, &db.recovery_cases[idx], true);
    if !can_edit {
        return Err(err_resp(
            StatusCode::FORBIDDEN,
            "Accès refusé (403) : modification de ce dossier recouvrement non autorisée.",
        ));
    }

    if matches!(next_status.as_str(), "pret_contentieux" | "transmis_contentieux") && !crate::recovery_evidence::documented(&db, &db.recovery_cases[idx]) {
        return Err(err_resp(StatusCode::CONFLICT,"Complétez les références documentaires vérifiées avant cette étape. Une case cochée ne remplace pas une preuve."));
    }
    if matches!(next_status.as_str(),"mise_en_demeure"|"pret_contentieux"|"transmis_contentieux") && crate::recovery_evidence::paused(&db,&db.recovery_cases[idx]) {
        return Err(err_resp(StatusCode::CONFLICT,"Suivi suspendu : vérifiez le paiement signalé ou la contestation avant de poursuivre."));
    }
    if matches!(next_status.as_str(), "mise_en_demeure" | "pret_contentieux" | "transmis_contentieux") && payload.note.as_deref().is_none_or(|n| n.trim().is_empty()) {
        return Err(err_resp(StatusCode::BAD_REQUEST,"Renseignez la référence et la date de la démarche réellement effectuée."));
    }
    let snapshot = db.clone();
    let prev_status = db.recovery_cases[idx].status.clone();
    db.recovery_cases[idx].status = next_status.clone();
    if let Some(note) = payload.note.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
        db.recovery_cases[idx].last_action_note = note.to_string();
    }
    let updated = db.recovery_cases[idx].clone();

    append_audit(
        &mut db,
        &actor_id,
        "Recouvrement (Statut)",
        format!(
            "Statut {} : {} -> {}",
            updated.member_name, prev_status, updated.status
        ),
        target_site_id,
        &updated.id,
        Some(prev_status),
        Some(updated.status.clone()),
    );

    if let Err(err_msg) = persist_state(&state.data_dir, &db) {
        *db = snapshot;
        return Err(err_resp(
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Échec persistance statut recouvrement : {}", err_msg),
        ));
    }

    Ok(Json(updated))
}

pub async fn post_recovery_case_relance(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Path(raw_case_id): Path<String>,
    Json(payload): Json<RecordRecoveryRelancePayload>,
) -> Result<Json<RecoveryCaseRecord>, (StatusCode, Json<Value>)> {
    let (actor_id, _) = resolve_session_actor(&state, &headers).await?;
    let mut db = state.db.write().await;

    let note = payload.note.trim().to_string();
    if note.is_empty() {
        return Err(err_resp(
            StatusCode::BAD_REQUEST,
            "La note de relance est obligatoire.",
        ));
    }

    let case_id = raw_case_id.trim().to_string();
    let Some(idx) = db.recovery_cases.iter().position(|rc| rc.id == case_id) else {
        return Err(err_resp(
            StatusCode::NOT_FOUND,
            format!("Dossier recouvrement introuvable : {}", case_id),
        ));
    };

    let case_club = db.recovery_cases[idx].club_id.clone();
    let target_site_id = club_to_site_id(&case_club);
    let can_edit = crate::recovery_evidence::allowed(&db, &actor_id, &db.recovery_cases[idx], true);
    if !can_edit {
        return Err(err_resp(
            StatusCode::FORBIDDEN,
            "Accès refusé (403) : enregistrement de relance non autorisé.",
        ));
    }

    if crate::recovery_evidence::paused(&db,&db.recovery_cases[idx]) {
        return Err(err_resp(StatusCode::CONFLICT,"Relance suspendue : un contrôle du paiement, de la contestation ou du solde est nécessaire."));
    }
    let snapshot = db.clone();
    let prev_count = db.recovery_cases[idx].relance_count;
    db.recovery_cases[idx].relance_count = prev_count + 1;
    db.recovery_cases[idx].last_action_note = note;
    let updated = db.recovery_cases[idx].clone();

    append_audit(
        &mut db,
        &actor_id,
        "Recouvrement (Relance)",
        format!(
            "Relance #{} enregistrée pour {}",
            updated.relance_count, updated.member_name
        ),
        target_site_id,
        &updated.id,
        Some(prev_count.to_string()),
        Some(updated.relance_count.to_string()),
    );

    if let Err(err_msg) = persist_state(&state.data_dir, &db) {
        *db = snapshot;
        return Err(err_resp(
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Échec persistance relance recouvrement : {}", err_msg),
        ));
    }

    Ok(Json(updated))
}

pub async fn get_recovery_case_chat(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Path(raw_case_id): Path<String>,
) -> Result<Json<RecoveryCaseChatHistory>, (StatusCode, Json<Value>)> {
    let (actor_id, _) = resolve_session_actor(&state, &headers).await?;
    let db = state.db.read().await;
    let case_id = raw_case_id.trim().to_string();

    let Some(case_rec) = db.recovery_cases.iter().find(|rc| rc.id == case_id) else {
        return Err(err_resp(
            StatusCode::NOT_FOUND,
            format!("Dossier recouvrement introuvable : {}", case_id),
        ));
    };
    if !crate::recovery_evidence::allowed(&db, &actor_id, case_rec, false) {
        return Err(err_resp(
            StatusCode::FORBIDDEN,
            "Accès refusé (403) : consultation du chat de ce dossier non autorisée.",
        ));
    }

    let entry = db
        .recovery_chat_histories
        .get(&case_id)
        .cloned()
        .unwrap_or_else(|| RecoveryCaseChatHistory {
            case_id,
            updated_at: String::new(),
            updated_by: String::new(),
            messages: Vec::new(),
        });
    Ok(Json(entry))
}

pub async fn put_recovery_case_chat(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Path(raw_case_id): Path<String>,
    Json(payload): Json<PutRecoveryCaseChatPayload>,
) -> Result<Json<RecoveryCaseChatHistory>, (StatusCode, Json<Value>)> {
    let (actor_id, _) = resolve_session_actor(&state, &headers).await?;
    let mut db = state.db.write().await;
    let case_id = raw_case_id.trim().to_string();

    let Some(case_rec) = db.recovery_cases.iter().find(|rc| rc.id == case_id) else {
        return Err(err_resp(
            StatusCode::NOT_FOUND,
            format!("Dossier recouvrement introuvable : {}", case_id),
        ));
    };
    if !crate::recovery_evidence::allowed(&db, &actor_id, case_rec, false) {
        return Err(err_resp(
            StatusCode::FORBIDDEN,
            "Accès refusé (403) : enregistrement du chat de ce dossier non autorisé.",
        ));
    }

    if payload.messages.len() > 50 {
        return Err(err_resp(
            StatusCode::BAD_REQUEST,
            "Historique de chat trop long (50 messages maximum).",
        ));
    }

    let mut cleaned_messages = Vec::with_capacity(payload.messages.len());
    for msg in payload.messages {
        let role = msg.role.trim();
        if !matches!(role, "user" | "assistant") {
            return Err(err_resp(
                StatusCode::BAD_REQUEST,
                "Rôle de message invalide (user ou assistant attendu).",
            ));
        }
        let content = msg.content.trim();
        if content.is_empty() || content.chars().count() > 16_000 {
            return Err(err_resp(
                StatusCode::BAD_REQUEST,
                "Chaque message enregistré doit contenir entre 1 et 16 000 caractères.",
            ));
        }
        cleaned_messages.push(RecoveryChatMessageRecord {
            role: role.to_string(),
            content: content.to_string(),
        });
    }

    let snapshot = db.clone();
    let entry = if cleaned_messages.is_empty() {
        db.recovery_chat_histories.remove(&case_id);
        RecoveryCaseChatHistory {
            case_id: case_id.clone(),
            updated_at: String::new(),
            updated_by: String::new(),
            messages: Vec::new(),
        }
    } else {
        let item = RecoveryCaseChatHistory {
            case_id: case_id.clone(),
            updated_at: Utc::now().to_rfc3339(),
            updated_by: actor_id.clone(),
            messages: cleaned_messages,
        };
        db.recovery_chat_histories.insert(case_id.clone(), item.clone());
        item
    };

    if let Err(err_msg) = persist_state(&state.data_dir, &db) {
        *db = snapshot;
        return Err(err_resp(
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Échec persistance chat recouvrement : {}", err_msg),
        ));
    }

    Ok(Json(entry))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::routes::SharedAppState;
    use crate::seed::load_or_init_state;
    use axum::http::{header, HeaderValue};
    use std::collections::HashMap;
    use std::sync::Arc;
    use tokio::sync::RwLock;

    fn test_state() -> SharedState {
        static TEST_SEQ: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(1);
        let seq = TEST_SEQ.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        let dir = std::env::temp_dir().join(format!(
            "cfos_rec_test_{}_{}",
            Utc::now().timestamp_nanos_opt().unwrap_or_default(),
            seq
        ));
        Arc::new(SharedAppState {
            db: RwLock::new(load_or_init_state(&dir)),
            data_dir: dir,
            sessions: RwLock::new(HashMap::new()),
            login_attempts: RwLock::new(HashMap::new()),
        })
    }

    async fn session_headers(state: &SharedState, actor_id: &str, site_id: &str) -> HeaderMap {
        let token = format!(
            "rec-session-{}-{}",
            actor_id,
            Utc::now().timestamp_nanos_opt().unwrap_or_default()
        );
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
            "x-cfitness-site-id",
            HeaderValue::from_str(site_id).unwrap(),
        );
        headers
    }

    #[tokio::test]
    async fn recovery_routes_list_create_update_status_and_record_relance_persisted() {
        let state = test_state();
        let headers = session_headers(&state, "emp-greg", "club-carre-soie").await;

        let Json(initial_list) = get_recovery_cases(State(state.clone()), headers.clone())
            .await
            .expect("Greg accède aux dossiers de recouvrement");
        assert!(!initial_list.is_empty());

        let (status, Json(created)) = post_recovery_case(
            State(state.clone()),
            headers.clone(),
            Json(CreateRecoveryCasePayload {
                member_id: Some("hz-999".into()),
                member_name: "Julie Test".into(),
                club_id: "beynost".into(),
                phone: Some("0600000099".into()),
                email: Some("julie.test@exemple.fr".into()),
                contract_label: Some("Pass Liberté 12 mois".into()),
                amount_due_eur: 79.8,
                days_overdue: Some(25),
                unpaid_reason: Some("Rejet SEPA (MD01)".into()),
                billed_months: Some(vec!["Octobre 2026".into(), "Novembre 2026".into()]),
                has_signed_contract: Some(true),
                has_id_and_rib: Some(true),
                has_cgv_accepted: Some(true),
                missing_docs: None,
                last_action_note: None,
            }),
        )
        .await
        .expect("création dossier recouvrement");
        assert_eq!(status, StatusCode::CREATED);
        assert_eq!(created.club_id, "beynost");
        assert_eq!(created.status, "a_relancer");

        let Json(after_relance) = post_recovery_case_relance(
            State(state.clone()),
            headers.clone(),
            Path(created.id.clone()),
            Json(RecordRecoveryRelancePayload {
                note: "Mail amiable envoyé via assistant Ollama.".into(),
            }),
        )
        .await
        .expect("relance enregistrée");
        assert_eq!(after_relance.relance_count, 1);

        let Json(after_status) = patch_recovery_case_status(
            State(state.clone()),
            headers,
            Path(created.id.clone()),
            Json(UpdateRecoveryStatusPayload {
                status: "mise_en_demeure".into(),
                note: Some("Mise en demeure envoyée sous 8 jours.".into()),
            }),
        )
        .await
        .expect("statut mis à jour");
        assert_eq!(after_status.status, "mise_en_demeure");

        let reloaded = load_or_init_state(&state.data_dir);
        let persisted = reloaded
            .recovery_cases
            .iter()
            .find(|rc| rc.id == created.id)
            .expect("dossier persisté sur disque");
        assert_eq!(persisted.relance_count, 1);
        assert_eq!(persisted.status, "mise_en_demeure");
        let _ = std::fs::remove_dir_all(&state.data_dir);
    }

    #[tokio::test]
    async fn recovery_routes_enforce_club_isolation_and_rbac_403() {
        let state = test_state();
        let maxime_headers = session_headers(&state, "emp-maxime", "club-carre-soie").await;
        let err = get_recovery_cases(State(state.clone()), maxime_headers)
            .await
            .unwrap_err();
        assert_eq!(err.0, StatusCode::FORBIDDEN);

        let sarah_headers = session_headers(&state, "emp-sarah", "club-carre-soie").await;
        // Sarah n'est rattachée qu'à Carré de Soie : un dossier Beynost doit être refusé
        let (st, _) = post_recovery_case(
            State(state.clone()),
            sarah_headers,
            Json(CreateRecoveryCasePayload {
                member_id: None,
                member_name: "Test Hors Périmètre".into(),
                club_id: "beynost".into(),
                phone: None,
                email: None,
                contract_label: None,
                amount_due_eur: 39.9,
                days_overdue: None,
                unpaid_reason: None,
                billed_months: None,
                has_signed_contract: None,
                has_id_and_rib: None,
                has_cgv_accepted: None,
                missing_docs: None,
                last_action_note: None,
            }),
        )
        .await
        .unwrap_err();
        assert_eq!(st, StatusCode::FORBIDDEN);
        let _ = std::fs::remove_dir_all(&state.data_dir);
    }

    #[tokio::test]
    async fn recovery_routes_reject_invalid_status_400() {
        let state = test_state();
        let headers = session_headers(&state, "emp-mario", "club-carre-soie").await;
        let (st, _) = patch_recovery_case_status(
            State(state.clone()),
            headers,
            Path("rec-1".into()),
            Json(UpdateRecoveryStatusPayload {
                status: "statut_bidon".into(),
                note: None,
            }),
        )
        .await
        .unwrap_err();
        assert_eq!(st, StatusCode::BAD_REQUEST);
        let _ = std::fs::remove_dir_all(&state.data_dir);
    }

    #[tokio::test]
    async fn recovery_case_chat_save_reload_and_clear_persisted() {
        let state = test_state();
        let admin_headers = session_headers(&state, "emp-mario", "club-carre-soie").await;
        let max_headers = session_headers(&state, "emp-maxime", "club-carre-soie").await;

        let Json(cases) = get_recovery_cases(State(state.clone()), admin_headers.clone())
            .await
            .expect("dossiers accessibles");
        let case_id = cases[0].id.clone();

        // Un collaborateur non autorisé sur Recouvrement reçoit 403
        assert_eq!(
            get_recovery_case_chat(
                State(state.clone()),
                max_headers.clone(),
                Path(case_id.clone()),
            )
            .await
            .unwrap_err()
            .0,
            StatusCode::FORBIDDEN
        );

        let Json(initial) = get_recovery_case_chat(
            State(state.clone()),
            admin_headers.clone(),
            Path(case_id.clone()),
        )
        .await
        .expect("lecture chat initial");
        assert!(initial.messages.is_empty());

        let Json(saved) = put_recovery_case_chat(
            State(state.clone()),
            admin_headers.clone(),
            Path(case_id.clone()),
            Json(PutRecoveryCaseChatPayload {
                messages: vec![
                    RecoveryChatMessageRecord {
                        role: "user".into(),
                        content: "Prépare une relance amiable".into(),
                    },
                    RecoveryChatMessageRecord {
                        role: "assistant".into(),
                        content: "Bonjour, merci de régulariser votre dossier.".into(),
                    },
                ],
            }),
        )
        .await
        .expect("sauvegarde chat");
        assert_eq!(saved.messages.len(), 2);
        assert!(!saved.updated_at.is_empty());

        let reloaded = load_or_init_state(&state.data_dir);
        let persisted = reloaded
            .recovery_chat_histories
            .get(&case_id)
            .expect("historique chat persisté sur disque");
        assert_eq!(persisted.messages.len(), 2);
        assert_eq!(persisted.messages[0].role, "user");

        let Json(cleared) = put_recovery_case_chat(
            State(state.clone()),
            admin_headers,
            Path(case_id.clone()),
            Json(PutRecoveryCaseChatPayload { messages: vec![] }),
        )
        .await
        .expect("effacement chat");
        assert!(cleared.messages.is_empty());

        let reloaded_after_clear = load_or_init_state(&state.data_dir);
        assert!(!reloaded_after_clear.recovery_chat_histories.contains_key(&case_id));
        let _ = std::fs::remove_dir_all(&state.data_dir);
    }
}
