use crate::models::Site;
use crate::rbac::{evaluate_permission, is_admin_employee, normalize_site_id};
use crate::routes::{append_audit, err_resp, resolve_session_actor, SharedState};
use crate::seed::persist_state;
use axum::extract::{Path, State};
use axum::http::{HeaderMap, StatusCode};
use axum::Json;
use serde::Deserialize;
use serde_json::Value;

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct UpdateSiteSettingsPayload {
    pub name: Option<String>,
    pub address: Option<String>,
    pub city: Option<String>,
    pub siret: Option<String>,
    pub day_start_hour: Option<String>,
    pub break_alert_hours: Option<u32>,
    pub break_alert_enabled: Option<bool>,
    pub consecutive_days_blocking: Option<bool>,
    pub complementary_max_hours: Option<u32>,
    pub missions_module_active: Option<bool>,
    pub report_rules_visible: Option<bool>,
}

fn is_valid_hhmm(value: &str) -> bool {
    let parts: Vec<&str> = value.trim().split(':').collect();
    if parts.len() != 2 {
        return false;
    }
    let Ok(h) = parts[0].parse::<u32>() else {
        return false;
    };
    let Ok(m) = parts[1].parse::<u32>() else {
        return false;
    };
    h <= 23 && m <= 59 && parts[0].len() == 2 && parts[1].len() == 2
}

pub async fn get_admin_sites(
    State(state): State<SharedState>,
    headers: HeaderMap,
) -> Result<Json<Vec<Site>>, (StatusCode, Json<Value>)> {
    let (actor_id, site_id) = resolve_session_actor(&state, &headers).await?;
    let db = state.db.read().await;
    let allowed = is_admin_employee(&db, &actor_id)
        || evaluate_permission(&db, &actor_id, &site_id, "ORG04-32", None).allowed;
    if !allowed {
        return Err(err_resp(
            StatusCode::FORBIDDEN,
            "Accès refusé (403) : lecture des paramètres d'établissement réservée à l'administration.",
        ));
    }
    Ok(Json(db.sites.clone()))
}

pub async fn put_admin_site_settings(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Path(raw_site_id): Path<String>,
    Json(patch): Json<UpdateSiteSettingsPayload>,
) -> Result<Json<Site>, (StatusCode, Json<Value>)> {
    let (actor_id, active_site) = resolve_session_actor(&state, &headers).await?;
    let mut db = state.db.write().await;

    let allowed = is_admin_employee(&db, &actor_id)
        || evaluate_permission(&db, &actor_id, &active_site, "ORG04-32", None).allowed;
    if !allowed {
        return Err(err_resp(
            StatusCode::FORBIDDEN,
            "Accès refusé (403) : modification des paramètres d'établissement réservée à l'administration.",
        ));
    }

    let target_site_id = normalize_site_id(&raw_site_id);
    if !db.sites.iter().any(|s| s.id == target_site_id) {
        return Err(err_resp(
            StatusCode::NOT_FOUND,
            format!("Établissement introuvable : {}", raw_site_id),
        ));
    }

    if let Some(ref name) = patch.name {
        if name.trim().is_empty() {
            return Err(err_resp(
                StatusCode::BAD_REQUEST,
                "Le nom de l'établissement ne peut pas être vide.",
            ));
        }
    }
    if let Some(ref hour) = patch.day_start_hour {
        if !is_valid_hhmm(hour) {
            return Err(err_resp(
                StatusCode::BAD_REQUEST,
                "Heure de début de journée invalide (format attendu HH:MM).",
            ));
        }
    }
    if let Some(alert_h) = patch.break_alert_hours {
        if !(1..=12).contains(&alert_h) {
            return Err(err_resp(
                StatusCode::BAD_REQUEST,
                "Le seuil d'alerte pause doit être compris entre 1 et 12 heures.",
            ));
        }
    }
    if let Some(max_h) = patch.complementary_max_hours {
        if !(1..=48).contains(&max_h) {
            return Err(err_resp(
                StatusCode::BAD_REQUEST,
                "Le plafond d'heures complémentaires doit être compris entre 1 et 48 heures.",
            ));
        }
    }

    let snapshot = db.clone();
    let idx = db
        .sites
        .iter()
        .position(|s| s.id == target_site_id)
        .expect("site vérifié");
    let prev_name = db.sites[idx].name.clone();

    if let Some(v) = patch.name {
        db.sites[idx].name = v.trim().to_string();
    }
    if let Some(v) = patch.address {
        db.sites[idx].address = v.trim().to_string();
    }
    if let Some(v) = patch.city {
        db.sites[idx].city = v.trim().to_string();
    }
    if let Some(v) = patch.siret {
        db.sites[idx].siret = v.trim().to_string();
    }
    if let Some(v) = patch.day_start_hour {
        db.sites[idx].settings.day_start_hour = v.trim().to_string();
    }
    if let Some(v) = patch.break_alert_hours {
        db.sites[idx].settings.break_alert_hours = v;
    }
    if let Some(v) = patch.break_alert_enabled {
        db.sites[idx].settings.break_alert_enabled = v;
    }
    if let Some(v) = patch.consecutive_days_blocking {
        db.sites[idx].settings.consecutive_days_blocking = v;
    }
    if let Some(v) = patch.complementary_max_hours {
        db.sites[idx].settings.complementary_max_hours = v;
    }
    if let Some(v) = patch.missions_module_active {
        db.sites[idx].settings.missions_module_active = v;
    }
    if let Some(v) = patch.report_rules_visible {
        db.sites[idx].settings.report_rules_visible = v;
    }

    let updated_site = db.sites[idx].clone();
    append_audit(
        &mut db,
        &actor_id,
        "Paramétrage établissement",
        format!(
            "Mise à jour des paramètres du club {} ({})",
            updated_site.name, updated_site.id
        ),
        &updated_site.id,
        &updated_site.id,
        Some(prev_name),
        Some(updated_site.name.clone()),
    );

    if let Err(err_msg) = persist_state(&state.data_dir, &db) {
        *db = snapshot;
        return Err(err_resp(
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Échec persistance paramètres établissement : {}", err_msg),
        ));
    }

    Ok(Json(updated_site))
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
        static TEST_SEQ: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(1);
        let seq = TEST_SEQ.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        let dir = std::env::temp_dir().join(format!(
            "cfos_site_test_{}_{}",
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
            "site-session-{}-{}",
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
    async fn admin_can_update_club_settings_and_persist() {
        let state = test_state();
        let headers = session_headers(&state, "emp-mario", "club-carre-soie").await;
        let Json(updated) = put_admin_site_settings(
            State(state.clone()),
            headers.clone(),
            Path("carre-de-soie".into()),
            Json(UpdateSiteSettingsPayload {
                name: Some("C.Fitness Carré de Soie Production".into()),
                day_start_hour: Some("06:30".into()),
                break_alert_hours: Some(5),
                missions_module_active: Some(true),
                ..Default::default()
            }),
        )
        .await
        .expect("admin peut modifier un club");

        assert_eq!(updated.id, "club-carre-soie");
        assert_eq!(updated.name, "C.Fitness Carré de Soie Production");
        assert_eq!(updated.settings.day_start_hour, "06:30");
        assert_eq!(updated.settings.break_alert_hours, 5);
        assert!(updated.settings.missions_module_active);

        let reloaded = load_or_init_state(&state.data_dir);
        let persisted = reloaded
            .sites
            .iter()
            .find(|s| s.id == "club-carre-soie")
            .unwrap();
        assert_eq!(persisted.name, "C.Fitness Carré de Soie Production");
        let _ = std::fs::remove_dir_all(&state.data_dir);
    }

    #[tokio::test]
    async fn non_admin_cannot_update_club_settings() {
        let state = test_state();
        let headers = session_headers(&state, "emp-maxime", "club-carre-soie").await;
        let (status, _) = put_admin_site_settings(
            State(state.clone()),
            headers,
            Path("club-carre-soie".into()),
            Json(UpdateSiteSettingsPayload {
                name: Some("Hack".into()),
                ..Default::default()
            }),
        )
        .await
        .unwrap_err();
        assert_eq!(status, StatusCode::FORBIDDEN);
        let _ = std::fs::remove_dir_all(&state.data_dir);
    }
}
