use crate::models::OrchestratorDecisionRecord;
use crate::rbac::{can_access_module_action, is_admin_employee};
use crate::routes::{
    append_audit, authorized_clubs_for_actor, err_resp, resolve_session_actor, SharedState,
};
use crate::seed::persist_state;
use axum::extract::{Path, State};
use axum::http::{HeaderMap, StatusCode};
use axum::Json;
use chrono::Utc;
use serde::Deserialize;
use serde_json::{json, Value};
use std::collections::HashMap;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateOrchestratorDecisionPayload {
    pub club_id: String,
    pub trigger_event: String,
    pub source_system: Option<String>,
    pub assigned_agent: Option<String>,
    pub agent_color: Option<String>,
    pub proposed_action: String,
    pub conflict_avoided_note: Option<String>,
    pub requires_human_approval: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateOrchestratorDecisionStatusPayload {
    pub status: String,
}

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct UpdateAgentAutonomyPayload {
    pub autonomy_mode: Option<String>,
    pub toggle: Option<bool>,
}

fn default_agent_autonomy_modes() -> HashMap<String, String> {
    HashMap::from([
        ("agent-rh".to_string(), "validation_humaine".to_string()),
        ("agent-crm".to_string(), "execution_auto_encadree".to_string()),
        ("agent-recouvrement".to_string(), "validation_humaine".to_string()),
        ("agent-telephonie".to_string(), "execution_auto_encadree".to_string()),
        ("agent-maintenance".to_string(), "validation_humaine".to_string()),
        ("agent-pilotage".to_string(), "execution_auto_encadree".to_string()),
    ])
}

pub async fn get_orchestrator_agent_autonomies(
    State(state): State<SharedState>,
    headers: HeaderMap,
) -> Result<Json<HashMap<String, String>>, (StatusCode, Json<Value>)> {
    let (actor_id, site_id) = resolve_session_actor(&state, &headers).await?;
    let db = state.db.read().await;

    let allowed = is_admin_employee(&db, &actor_id)
        || can_access_module_action(&db, &actor_id, Some(&site_id), "maintenance", "view")
        || can_access_module_action(&db, &actor_id, Some(&site_id), "stocks", "view");
    if !allowed {
        return Err(err_resp(
            StatusCode::FORBIDDEN,
            "Accès refusé (403) : consultation des réglages d'autonomie IA non autorisée.",
        ));
    }

    let mut modes = default_agent_autonomy_modes();
    for (k, v) in &db.agent_autonomy_modes {
        if modes.contains_key(k) {
            modes.insert(k.clone(), v.clone());
        }
    }
    Ok(Json(modes))
}

pub async fn put_orchestrator_agent_autonomy(
    State(state): State<SharedState>,
    Path(agent_id): Path<String>,
    headers: HeaderMap,
    Json(payload): Json<UpdateAgentAutonomyPayload>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let (actor_id, site_id) = resolve_session_actor(&state, &headers).await?;
    let defaults = default_agent_autonomy_modes();
    let Some(default_mode) = defaults.get(agent_id.trim()) else {
        return Err(err_resp(
            StatusCode::BAD_REQUEST,
            format!("Identifiant d'agent IA inconnu : {}", agent_id),
        ));
    };

    let mut db = state.db.write().await;
    if !is_admin_employee(&db, &actor_id) {
        return Err(err_resp(
            StatusCode::FORBIDDEN,
            "Accès refusé (403) : seul un administrateur peut modifier le mode d'autonomie des Agents IA.",
        ));
    }

    let current_mode = db
        .agent_autonomy_modes
        .get(agent_id.trim())
        .cloned()
        .unwrap_or_else(|| default_mode.clone());

    let next_mode = if payload.toggle.unwrap_or(false) {
        if current_mode == "validation_humaine" {
            "execution_auto_encadree".to_string()
        } else {
            "validation_humaine".to_string()
        }
    } else if let Some(explicit) = payload.autonomy_mode.as_deref().map(str::trim) {
        match explicit {
            "validation_humaine" | "execution_auto_encadree" => explicit.to_string(),
            _ => {
                return Err(err_resp(
                    StatusCode::BAD_REQUEST,
                    "Mode d'autonomie invalide. Valeurs supportées : validation_humaine, execution_auto_encadree.",
                ));
            }
        }
    } else {
        return Err(err_resp(
            StatusCode::BAD_REQUEST,
            "Aucun mode d'autonomie ou directive de bascule fournie.",
        ));
    };

    let snapshot = db.clone();
    db.agent_autonomy_modes
        .insert(agent_id.trim().to_string(), next_mode.clone());

    append_audit(
        &mut db,
        &actor_id,
        "Orchestrateur IA (Autonomie Agent)",
        format!(
            "Mode d'autonomie {} : {} -> {}",
            agent_id.trim(),
            current_mode,
            next_mode
        ),
        &site_id,
        "agent_autonomy_modes",
        Some(current_mode),
        Some(next_mode.clone()),
    );

    if let Err(e) = persist_state(&state.data_dir, &db) {
        *db = snapshot;
        return Err(err_resp(
            StatusCode::INTERNAL_SERVER_ERROR,
            &format!("Échec de persistance atomique du mode d'autonomie IA : {e}"),
        ));
    }

    Ok(Json(json!({
        "agentId": agent_id.trim(),
        "autonomyMode": next_mode
    })))
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

pub async fn get_orchestrator_decisions(
    State(state): State<SharedState>,
    headers: HeaderMap,
) -> Result<Json<Vec<OrchestratorDecisionRecord>>, (StatusCode, Json<Value>)> {
    let (actor_id, site_id) = resolve_session_actor(&state, &headers).await?;
    let db = state.db.read().await;

    let allowed = is_admin_employee(&db, &actor_id)
        || can_access_module_action(&db, &actor_id, Some(&site_id), "maintenance", "view")
        || can_access_module_action(&db, &actor_id, Some(&site_id), "stocks", "view");
    if !allowed {
        return Err(err_resp(
            StatusCode::FORBIDDEN,
            "Accès refusé (403) : consultation des décisions de l'Orchestrateur non autorisée.",
        ));
    }

    let authorized_clubs = authorized_clubs_for_actor(&db, &actor_id);
    let list: Vec<OrchestratorDecisionRecord> = db
        .orchestrator_decisions
        .iter()
        .filter(|d| {
            normalize_club_id(&d.club_id)
                .map(|c| authorized_clubs.contains(c))
                .unwrap_or(false)
        })
        .cloned()
        .collect();

    Ok(Json(list))
}

pub async fn post_orchestrator_decision(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Json(payload): Json<CreateOrchestratorDecisionPayload>,
) -> Result<(StatusCode, Json<OrchestratorDecisionRecord>), (StatusCode, Json<Value>)> {
    let (actor_id, _site_id) = resolve_session_actor(&state, &headers).await?;
    let clean_trigger = payload.trigger_event.trim();
    let clean_action = payload.proposed_action.trim();
    if clean_trigger.is_empty() || clean_action.is_empty() {
        return Err(err_resp(
            StatusCode::BAD_REQUEST,
            "L'événement déclencheur et l'action proposée sont obligatoires.",
        ));
    }

    let norm_club = normalize_club_id(&payload.club_id).ok_or_else(|| {
        err_resp(
            StatusCode::BAD_REQUEST,
            "Club invalide. Valeurs supportées : carre-de-soie, beynost.",
        )
    })?;

    let mut db = state.db.write().await;

    let allowed = is_admin_employee(&db, &actor_id)
        || can_access_module_action(
            &db,
            &actor_id,
            Some(club_to_site_id(norm_club)),
            "maintenance",
            "edit",
        )
        || can_access_module_action(
            &db,
            &actor_id,
            Some(club_to_site_id(norm_club)),
            "stocks",
            "edit",
        );
    if !allowed {
        return Err(err_resp(
            StatusCode::FORBIDDEN,
            "Accès refusé (403) : création de décision d'arbitrage non autorisée.",
        ));
    }

    let authorized_clubs = authorized_clubs_for_actor(&db, &actor_id);
    if !authorized_clubs.contains(norm_club) {
        return Err(err_resp(
            StatusCode::FORBIDDEN,
            "Accès refusé (403) : vous n'êtes pas habilité sur ce club.",
        ));
    }

    let requires_approval = payload.requires_human_approval.unwrap_or(true);
    let decision = OrchestratorDecisionRecord {
        id: format!("orch-{}", Utc::now().timestamp_millis()),
        timestamp: Utc::now().format("%H:%M:%S").to_string(),
        trigger_event: clean_trigger.to_string(),
        source_system: payload
            .source_system
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .unwrap_or("Temporal / n8n Workflow #WF-402")
            .to_string(),
        assigned_agent: payload
            .assigned_agent
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .unwrap_or("Agent CRM & Fidélisation + Agent Téléphonie IA")
            .to_string(),
        agent_color: payload
            .agent_color
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .unwrap_or("text-emerald-400")
            .to_string(),
        proposed_action: clean_action.to_string(),
        conflict_avoided_note: payload
            .conflict_avoided_note
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(str::to_string),
        requires_human_approval: requires_approval,
        status: if requires_approval {
            "en_attente_validation".to_string()
        } else {
            "execute".to_string()
        },
        club_id: norm_club.to_string(),
    };

    let snapshot = db.clone();
    db.orchestrator_decisions.insert(0, decision.clone());

    append_audit(
        &mut db,
        &actor_id,
        "Orchestrateur IA (Événement)",
        format!(
            "Nouvelle proposition d'arbitrage IA ({}) : {}",
            norm_club, decision.trigger_event
        ),
        club_to_site_id(norm_club),
        "orchestrator_decisions",
        None,
        Some(decision.status.clone()),
    );

    if let Err(e) = persist_state(&state.data_dir, &db) {
        *db = snapshot;
        return Err(err_resp(
            StatusCode::INTERNAL_SERVER_ERROR,
            &format!("Échec de persistance atomique de la décision Orchestrateur : {e}"),
        ));
    }

    Ok((StatusCode::CREATED, Json(decision)))
}

pub async fn patch_orchestrator_decision_status(
    State(state): State<SharedState>,
    Path(decision_id): Path<String>,
    headers: HeaderMap,
    Json(payload): Json<UpdateOrchestratorDecisionStatusPayload>,
) -> Result<Json<OrchestratorDecisionRecord>, (StatusCode, Json<Value>)> {
    let (actor_id, _site_id) = resolve_session_actor(&state, &headers).await?;
    let next_status = match payload.status.trim() {
        "en_attente_validation" | "execute" | "bloque_anti_conflit" | "refuse" => {
            payload.status.trim().to_string()
        }
        _ => {
            return Err(err_resp(
                StatusCode::BAD_REQUEST,
                "Statut invalide. Valeurs supportées : en_attente_validation, execute, bloque_anti_conflit, refuse.",
            ));
        }
    };

    let mut db = state.db.write().await;

    let (idx, decision_club) = {
        let pos = db
            .orchestrator_decisions
            .iter()
            .position(|d| d.id == decision_id)
            .ok_or_else(|| {
                err_resp(
                    StatusCode::NOT_FOUND,
                    &format!("Décision Orchestrateur « {decision_id} » introuvable."),
                )
            })?;
        (pos, db.orchestrator_decisions[pos].club_id.clone())
    };

    let allowed = is_admin_employee(&db, &actor_id)
        || can_access_module_action(
            &db,
            &actor_id,
            Some(club_to_site_id(&decision_club)),
            "maintenance",
            "edit",
        )
        || can_access_module_action(
            &db,
            &actor_id,
            Some(club_to_site_id(&decision_club)),
            "stocks",
            "edit",
        );
    if !allowed {
        return Err(err_resp(
            StatusCode::FORBIDDEN,
            "Accès refusé (403) : arbitrage des décisions de l'Orchestrateur non autorisé.",
        ));
    }

    let authorized_clubs = authorized_clubs_for_actor(&db, &actor_id);
    if !authorized_clubs.contains(decision_club.as_str()) {
        return Err(err_resp(
            StatusCode::FORBIDDEN,
            "Accès refusé (403) : vous n'êtes pas habilité sur le club de cette décision.",
        ));
    }

    let snapshot = db.clone();
    let old_status = db.orchestrator_decisions[idx].status.clone();
    db.orchestrator_decisions[idx].status = next_status;
    let updated = db.orchestrator_decisions[idx].clone();

    append_audit(
        &mut db,
        &actor_id,
        "Orchestrateur IA (Arbitrage)",
        format!(
            "Arbitrage décision « {} » ({}) : {} → {}",
            updated.id, decision_club, old_status, updated.status
        ),
        club_to_site_id(&decision_club),
        "orchestrator_decisions",
        Some(old_status),
        Some(updated.status.clone()),
    );

    if let Err(e) = persist_state(&state.data_dir, &db) {
        *db = snapshot;
        return Err(err_resp(
            StatusCode::INTERNAL_SERVER_ERROR,
            &format!("Échec de persistance atomique de l'arbitrage Orchestrateur : {e}"),
        ));
    }

    Ok(Json(updated))
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
            "cfos_orch_test_{}_{}",
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
            "orch-session-{}-{}",
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
    async fn test_get_orchestrator_decisions_scoping() {
        let state = test_state();
        let headers_admin = session_headers(&state, "emp-admin", "club-carre-soie").await;
        let all_decisions = get_orchestrator_decisions(State(state.clone()), headers_admin)
            .await
            .unwrap()
            .0;
        assert_eq!(all_decisions.len(), 4);

        // Collaborateur cantonné à Carré de Soie uniquement
        let headers_cds = session_headers(&state, "emp-accueil-cs", "club-carre-soie").await;
        let cds_decisions = get_orchestrator_decisions(State(state), headers_cds)
            .await
            .unwrap()
            .0;
        assert!(cds_decisions.iter().all(|d| d.club_id == "carre-de-soie"));
    }

    #[tokio::test]
    async fn test_post_and_patch_orchestrator_decision_status() {
        let state = test_state();
        let headers = session_headers(&state, "emp-admin", "club-beynost").await;

        let payload = CreateOrchestratorDecisionPayload {
            club_id: "beynost".into(),
            trigger_event: "Test qualification prospect Beynost".into(),
            source_system: None,
            assigned_agent: None,
            agent_color: None,
            proposed_action: "Verrouiller créneau Checkup".into(),
            conflict_avoided_note: Some("Aucun doublon".into()),
            requires_human_approval: Some(true),
        };

        let (status, Json(created)) = post_orchestrator_decision(
            State(state.clone()),
            headers.clone(),
            Json(payload),
        )
        .await
        .unwrap();
        assert_eq!(status, StatusCode::CREATED);
        assert_eq!(created.status, "en_attente_validation");

        // Approve -> execute
        let Json(approved) = patch_orchestrator_decision_status(
            State(state.clone()),
            Path(created.id.clone()),
            headers.clone(),
            Json(UpdateOrchestratorDecisionStatusPayload {
                status: "execute".into(),
            }),
        )
        .await
        .unwrap();
        assert_eq!(approved.status, "execute");

        // Reject -> refuse
        let Json(rejected) = patch_orchestrator_decision_status(
            State(state),
            Path(created.id),
            headers,
            Json(UpdateOrchestratorDecisionStatusPayload {
                status: "refuse".into(),
            }),
        )
        .await
        .unwrap();
        assert_eq!(rejected.status, "refuse");
    }

    #[tokio::test]
    async fn test_orchestrator_rejects_unauthorized_club_and_invalid_status() {
        let state = test_state();
        let headers_cds = session_headers(&state, "emp-accueil-cs", "club-carre-soie").await;

        // Tentative d'arbitrage sur une décision de Beynost ("orch-2")
        let err = patch_orchestrator_decision_status(
            State(state.clone()),
            Path("orch-2".into()),
            headers_cds.clone(),
            Json(UpdateOrchestratorDecisionStatusPayload {
                status: "execute".into(),
            }),
        )
        .await
        .unwrap_err();
        assert_eq!(err.0, StatusCode::FORBIDDEN);

        // Statut invalide
        let err_bad = patch_orchestrator_decision_status(
            State(state),
            Path("orch-1".into()),
            headers_cds,
            Json(UpdateOrchestratorDecisionStatusPayload {
                status: "inconnu".into(),
            }),
        )
        .await
        .unwrap_err();
        assert_eq!(err_bad.0, StatusCode::BAD_REQUEST);
    }

    #[tokio::test]
    async fn test_agent_autonomy_modes_persist_and_enforce_admin_only() {
        let state = test_state();
        let admin_headers = session_headers(&state, "emp-admin", "club-carre-soie").await;

        let Json(initial_modes) = get_orchestrator_agent_autonomies(
            State(state.clone()),
            admin_headers.clone(),
        )
        .await
        .unwrap();
        assert_eq!(initial_modes.get("agent-rh").unwrap(), "validation_humaine");

        let Json(toggled) = put_orchestrator_agent_autonomy(
            State(state.clone()),
            Path("agent-rh".into()),
            admin_headers,
            Json(UpdateAgentAutonomyPayload {
                autonomy_mode: None,
                toggle: Some(true),
            }),
        )
        .await
        .unwrap();
        assert_eq!(toggled["autonomyMode"], "execution_auto_encadree");

        // Non-admin rejected with 403
        let cds_headers = session_headers(&state, "emp-accueil-cs", "club-carre-soie").await;
        let err = put_orchestrator_agent_autonomy(
            State(state),
            Path("agent-rh".into()),
            cds_headers,
            Json(UpdateAgentAutonomyPayload {
                autonomy_mode: Some("validation_humaine".into()),
                toggle: None,
            }),
        )
        .await
        .unwrap_err();
        assert_eq!(err.0, StatusCode::FORBIDDEN);
    }
}
