use crate::models::MissionRecord;
use crate::rbac::{
    can_access_site_scope, evaluate_permission, is_admin_employee, normalize_site_id,
};
use crate::routes::{append_audit, err_resp, resolve_session_actor, SharedState};
use crate::seed::persist_state;
use axum::extract::{Path, State};
use axum::http::{HeaderMap, StatusCode};
use axum::Json;
use chrono::Utc;
use serde::Deserialize;
use serde_json::Value;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateMissionPayload {
    pub site_id: String,
    pub title: String,
    pub budget_hours: f64,
    pub logged_hours: Option<f64>,
    pub hourly_budget_eur: Option<f64>,
}

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct UpdateMissionPayload {
    pub status: Option<String>,
    pub logged_hours: Option<f64>,
    pub add_hours: Option<f64>,
}

pub async fn get_missions(
    State(state): State<SharedState>,
    headers: HeaderMap,
) -> Result<Json<Vec<MissionRecord>>, (StatusCode, Json<Value>)> {
    let (actor_id, site_id) = resolve_session_actor(&state, &headers).await?;
    let db = state.db.read().await;
    let norm_site = normalize_site_id(&site_id);
    let list: Vec<MissionRecord> = db
        .missions
        .iter()
        .filter(|m| {
            let m_site = normalize_site_id(&m.site_id);
            (norm_site == "all" || m_site == norm_site)
                && can_access_site_scope(&db, &actor_id, &m_site)
        })
        .cloned()
        .collect();
    Ok(Json(list))
}

pub async fn post_mission(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Json(payload): Json<CreateMissionPayload>,
) -> Result<(StatusCode, Json<MissionRecord>), (StatusCode, Json<Value>)> {
    let (actor_id, _active_site) = resolve_session_actor(&state, &headers).await?;
    let target_site_id = normalize_site_id(&payload.site_id);
    if target_site_id != "club-carre-soie" && target_site_id != "club-beynost" {
        return Err(err_resp(
            StatusCode::BAD_REQUEST,
            format!("Établissement invalide pour la mission : {}", payload.site_id),
        ));
    }
    if payload.title.trim().is_empty() {
        return Err(err_resp(
            StatusCode::BAD_REQUEST,
            "L'intitulé de la mission est obligatoire.",
        ));
    }
    if !payload.budget_hours.is_finite() || payload.budget_hours <= 0.0 {
        return Err(err_resp(
            StatusCode::BAD_REQUEST,
            "Le budget d'heures de la mission doit être strictement positif.",
        ));
    }

    let mut db = state.db.write().await;
    let allowed = is_admin_employee(&db, &actor_id)
        || evaluate_permission(&db, &actor_id, &target_site_id, "ORG04-21", None).allowed;
    if !allowed {
        return Err(err_resp(
            StatusCode::FORBIDDEN,
            "Accès refusé (403) : création de mission budgétée (ORG04-21) non autorisée.",
        ));
    }

    let seq = db.missions.len() + 1;
    let mission = MissionRecord {
        id: format!("mis-{}-{:03}", Utc::now().timestamp_millis(), seq),
        site_id: target_site_id.clone(),
        title: payload.title.trim().to_string(),
        budget_hours: payload.budget_hours,
        logged_hours: payload
            .logged_hours
            .filter(|h| h.is_finite() && *h >= 0.0)
            .unwrap_or(0.0),
        hourly_budget_eur: payload
            .hourly_budget_eur
            .filter(|r| r.is_finite() && *r >= 0.0)
            .unwrap_or(26.0),
        status: "active".to_string(),
    };

    let snapshot = db.clone();
    db.missions.insert(0, mission.clone());

    append_audit(
        &mut db,
        &actor_id,
        "Missions & Budgets (Création)",
        format!(
            "Création mission « {} » ({} h) sur {}",
            mission.title, mission.budget_hours, target_site_id
        ),
        &target_site_id,
        "missions",
        None,
        Some(mission.title.clone()),
    );

    if let Err(err_msg) = persist_state(&state.data_dir, &db) {
        *db = snapshot;
        return Err(err_resp(
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Échec persistance mission : {}", err_msg),
        ));
    }

    Ok((StatusCode::CREATED, Json(mission)))
}

pub async fn patch_mission(
    State(state): State<SharedState>,
    Path(mission_id): Path<String>,
    headers: HeaderMap,
    Json(payload): Json<UpdateMissionPayload>,
) -> Result<Json<MissionRecord>, (StatusCode, Json<Value>)> {
    let (actor_id, _active_site) = resolve_session_actor(&state, &headers).await?;
    let mut db = state.db.write().await;

    let (idx, m_site) = {
        let pos = db
            .missions
            .iter()
            .position(|m| m.id == mission_id)
            .ok_or_else(|| {
                err_resp(
                    StatusCode::NOT_FOUND,
                    format!("Mission « {} » introuvable.", mission_id),
                )
            })?;
        (pos, db.missions[pos].site_id.clone())
    };

    let allowed = is_admin_employee(&db, &actor_id)
        || evaluate_permission(&db, &actor_id, &m_site, "ORG04-21", None).allowed;
    if !allowed {
        return Err(err_resp(
            StatusCode::FORBIDDEN,
            "Accès refusé (403) : modification de mission budgétée (ORG04-21) non autorisée.",
        ));
    }

    if let Some(ref st) = payload.status {
        if st.trim() != "active" && st.trim() != "done" {
            return Err(err_resp(
                StatusCode::BAD_REQUEST,
                "Statut de mission invalide (attendu : active ou done).",
            ));
        }
    }

    let snapshot = db.clone();
    let old_summary = format!(
        "{} ({}h/{}h, {})",
        db.missions[idx].title,
        db.missions[idx].logged_hours,
        db.missions[idx].budget_hours,
        db.missions[idx].status
    );

    if let Some(ref st) = payload.status {
        db.missions[idx].status = st.trim().to_string();
    }
    if let Some(lh) = payload.logged_hours {
        if lh.is_finite() && lh >= 0.0 {
            db.missions[idx].logged_hours = lh;
        }
    }
    if let Some(add) = payload.add_hours {
        if add.is_finite() {
            db.missions[idx].logged_hours = (db.missions[idx].logged_hours + add).max(0.0);
        }
    }

    let updated = db.missions[idx].clone();

    append_audit(
        &mut db,
        &actor_id,
        "Missions & Budgets (Mise à jour)",
        format!(
            "Mise à jour mission « {} » : {}h/{}h ({})",
            updated.title, updated.logged_hours, updated.budget_hours, updated.status
        ),
        &m_site,
        "missions",
        Some(old_summary),
        Some(format!("{}h ({})", updated.logged_hours, updated.status)),
    );

    if let Err(err_msg) = persist_state(&state.data_dir, &db) {
        *db = snapshot;
        return Err(err_resp(
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Échec persistance mise à jour mission : {}", err_msg),
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
            "cfos_mis_test_{}_{}",
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
            "mis-session-{}-{}",
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
    async fn missions_crud_and_hours_update_persist() {
        let state = test_state();
        let headers = session_headers(&state, "emp-admin", "club-beynost").await;

        let (status, Json(created)) = post_mission(
            State(state.clone()),
            headers.clone(),
            Json(CreateMissionPayload {
                site_id: "beynost".into(),
                title: "Inventaire annuel matériel Beynost".into(),
                budget_hours: 12.0,
                logged_hours: Some(2.0),
                hourly_budget_eur: Some(25.0),
            }),
        )
        .await
        .expect("création mission");
        assert_eq!(status, StatusCode::CREATED);
        assert_eq!(created.logged_hours, 2.0);

        let Json(updated) = patch_mission(
            State(state.clone()),
            Path(created.id),
            headers,
            Json(UpdateMissionPayload {
                status: Some("done".into()),
                logged_hours: None,
                add_hours: Some(10.0),
            }),
        )
        .await
        .expect("clôture mission");
        assert_eq!(updated.logged_hours, 12.0);
        assert_eq!(updated.status, "done");
        let _ = std::fs::remove_dir_all(&state.data_dir);
    }
}
