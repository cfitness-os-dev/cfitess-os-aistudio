use crate::clock_terminals::authenticated_employee;
use crate::rbac::{can_access_site_scope, evaluate_permission, PermissionTarget};
use crate::routes::{append_audit, err_resp, SharedState};
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
pub struct ClubDisplayScreen {
    pub id: String,
    pub site_id: String,
    pub name: String,
    pub zone: String,
    pub mode: String, // "planning" | "messages" | "mixed"
    pub headline: String,
    pub ticker_message: String,
    pub active: bool,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CreateDisplayPayload {
    pub name: String,
    pub zone: String,
    #[serde(default = "default_mode")]
    pub mode: String,
    #[serde(default)]
    pub headline: String,
    #[serde(default)]
    pub ticker_message: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct UpdateDisplayPayload {
    pub name: Option<String>,
    pub zone: Option<String>,
    pub mode: Option<String>,
    pub headline: Option<String>,
    pub ticker_message: Option<String>,
    pub active: Option<bool>,
}

fn default_mode() -> String {
    "mixed".into()
}

fn club_site(raw: &str) -> Result<(&'static str, &'static str), Failure> {
    match raw {
        "carre-de-soie" | "club-carre-soie" => Ok(("carre-de-soie", "club-carre-soie")),
        "beynost" | "club-beynost" => Ok(("beynost", "club-beynost")),
        _ => Err(err_resp(StatusCode::BAD_REQUEST, "Club inconnu.")),
    }
}

fn valid_mode(raw: &str) -> Result<&'static str, Failure> {
    match raw.trim() {
        "planning" => Ok("planning"),
        "messages" => Ok("messages"),
        "mixed" => Ok("mixed"),
        _ => Err(err_resp(
            StatusCode::BAD_REQUEST,
            "Mode d'affichage invalide (planning, messages ou mixed).",
        )),
    }
}

fn can_manage_displays(
    db: &crate::models::AppDatabaseState,
    actor_id: &str,
    site_id: &str,
) -> bool {
    can_access_site_scope(db, actor_id, site_id)
        && evaluate_permission(
            db,
            actor_id,
            site_id,
            "ORG04-37",
            Some(PermissionTarget {
                site_id: Some(site_id),
                target_employee_id: Some(actor_id),
                target_team_ids: &[],
                lock_state: None,
            }),
        )
        .allowed
}

pub async fn get_club_displays(
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
            "Accès refusé aux écrans de ce club.",
        ));
    }
    let screens: Vec<&ClubDisplayScreen> = db
        .club_displays
        .iter()
        .filter(|s| s.site_id == site_id)
        .collect();
    Ok(Json(json!({ "siteId": site_id, "screens": screens })))
}

pub async fn post_create_display(
    State(state): State<SharedState>,
    Path(raw_club): Path<String>,
    headers: HeaderMap,
    Json(payload): Json<CreateDisplayPayload>,
) -> Result<Json<Value>, Failure> {
    let (_, site_id) = club_site(&raw_club)?;
    let actor_id = authenticated_employee(&state, &headers).await?;
    let mut db = state.db.write().await;
    if !can_manage_displays(&db, &actor_id, site_id) {
        return Err(err_resp(
            StatusCode::FORBIDDEN,
            "Droits insuffisants pour créer un écran dans ce club.",
        ));
    }

    let name = payload.name.trim();
    let zone = payload.zone.trim();
    if name.is_empty() || zone.is_empty() {
        return Err(err_resp(
            StatusCode::BAD_REQUEST,
            "Nom d'écran et zone requis.",
        ));
    }
    let mode = valid_mode(&payload.mode)?;
    let id = format!("disp-{}", rand::random::<u64>());
    let screen = ClubDisplayScreen {
        id: id.clone(),
        site_id: site_id.to_string(),
        name: name.to_string(),
        zone: zone.to_string(),
        mode: mode.to_string(),
        headline: payload.headline.trim().to_string(),
        ticker_message: payload.ticker_message.trim().to_string(),
        active: true,
        updated_at: Utc::now().to_rfc3339(),
    };

    let mut next = db.clone();
    next.club_displays.push(screen.clone());
    append_audit(
        &mut next,
        &actor_id,
        "DISPLAY_CREATED",
        format!("Écran {} ({}) créé sur {}", screen.name, screen.zone, site_id),
        site_id,
        &id,
        None,
        Some("active".into()),
    );
    persist_state(&state.data_dir, &next).map_err(|err| {
        err_resp(
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Échec de persistance de l'écran : {err}"),
        )
    })?;
    *db = next;

    Ok(Json(json!({ "screen": screen })))
}

pub async fn patch_update_display(
    State(state): State<SharedState>,
    Path((raw_club, screen_id)): Path<(String, String)>,
    headers: HeaderMap,
    Json(payload): Json<UpdateDisplayPayload>,
) -> Result<Json<Value>, Failure> {
    let (_, site_id) = club_site(&raw_club)?;
    let actor_id = authenticated_employee(&state, &headers).await?;
    let mut db = state.db.write().await;
    if !can_manage_displays(&db, &actor_id, site_id) {
        return Err(err_resp(
            StatusCode::FORBIDDEN,
            "Droits insuffisants pour modifier cet écran.",
        ));
    }

    let Some(idx) = db
        .club_displays
        .iter()
        .position(|s| s.id == screen_id && s.site_id == site_id)
    else {
        return Err(err_resp(StatusCode::NOT_FOUND, "Écran introuvable."));
    };

    let mut next = db.clone();
    let s = &mut next.club_displays[idx];
    if let Some(name) = payload.name {
        let t = name.trim();
        if !t.is_empty() {
            s.name = t.to_string();
        }
    }
    if let Some(zone) = payload.zone {
        let t = zone.trim();
        if !t.is_empty() {
            s.zone = t.to_string();
        }
    }
    if let Some(mode) = payload.mode {
        s.mode = valid_mode(&mode)?.to_string();
    }
    if let Some(headline) = payload.headline {
        s.headline = headline.trim().to_string();
    }
    if let Some(ticker) = payload.ticker_message {
        s.ticker_message = ticker.trim().to_string();
    }
    if let Some(active) = payload.active {
        s.active = active;
    }
    s.updated_at = Utc::now().to_rfc3339();
    let updated = s.clone();

    append_audit(
        &mut next,
        &actor_id,
        "DISPLAY_UPDATED",
        format!("Écran {} mis à jour sur {}", updated.name, site_id),
        site_id,
        &screen_id,
        None,
        Some(updated.mode.clone()),
    );
    persist_state(&state.data_dir, &next).map_err(|err| {
        err_resp(
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Échec de persistance de l'écran : {err}"),
        )
    })?;
    *db = next;

    Ok(Json(json!({ "screen": updated })))
}

pub async fn delete_display(
    State(state): State<SharedState>,
    Path((raw_club, screen_id)): Path<(String, String)>,
    headers: HeaderMap,
) -> Result<Json<Value>, Failure> {
    let (_, site_id) = club_site(&raw_club)?;
    let actor_id = authenticated_employee(&state, &headers).await?;
    let mut db = state.db.write().await;
    if !can_manage_displays(&db, &actor_id, site_id) {
        return Err(err_resp(
            StatusCode::FORBIDDEN,
            "Droits insuffisants pour supprimer cet écran.",
        ));
    }
    let Some(idx) = db
        .club_displays
        .iter()
        .position(|s| s.id == screen_id && s.site_id == site_id)
    else {
        return Err(err_resp(StatusCode::NOT_FOUND, "Écran introuvable."));
    };
    let mut next = db.clone();
    let removed = next.club_displays.remove(idx);
    append_audit(
        &mut next,
        &actor_id,
        "DISPLAY_DELETED",
        format!("Écran {} supprimé sur {}", removed.name, site_id),
        site_id,
        &screen_id,
        Some("active".into()),
        Some("deleted".into()),
    );
    persist_state(&state.data_dir, &next).map_err(|err| {
        err_resp(
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Échec de suppression de l'écran : {err}"),
        )
    })?;
    *db = next;
    Ok(Json(json!({ "deleted": true, "id": screen_id })))
}

/// Flux public en lecture seule pour une TV ou un écran mural du club.
pub async fn get_public_display_feed(
    State(state): State<SharedState>,
    Path((raw_club, screen_id)): Path<(String, String)>,
) -> Result<Json<Value>, Failure> {
    let (_, site_id) = club_site(&raw_club)?;
    let db = state.db.read().await;
    let Some(screen) = db
        .club_displays
        .iter()
        .find(|s| s.id == screen_id && s.site_id == site_id && s.active)
    else {
        return Err(err_resp(
            StatusCode::NOT_FOUND,
            "Écran introuvable ou désactivé.",
        ));
    };
    let club_name = if site_id == "club-beynost" {
        "C.Fitness Beynost"
    } else {
        "C.Fitness Carré de Soie"
    };
    Ok(Json(json!({
        "clubName": club_name,
        "screen": screen,
        "serverTimeUtc": Utc::now().to_rfc3339()
    })))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::routes::SharedAppState;
    use crate::seed::load_or_init_state;
    use std::collections::HashMap;
    use std::sync::Arc;
    use tokio::sync::RwLock;

    fn test_state() -> SharedState {
        let dir = std::env::temp_dir().join(format!("display_test_{}", rand::random::<u128>()));
        Arc::new(SharedAppState {
            db: RwLock::new(load_or_init_state(&dir)),
            data_dir: dir,
            sessions: RwLock::new(HashMap::new()),
            login_attempts: RwLock::new(HashMap::new()),
        })
    }

    async fn bearer(state: &SharedState, emp_id: &str) -> HeaderMap {
        let token = format!("tok-{emp_id}-{}", rand::random::<u128>());
        state.sessions.write().await.insert(
            token.clone(),
            (emp_id.into(), Utc::now().timestamp() + 3600),
        );
        let mut h = HeaderMap::new();
        h.insert("authorization", format!("Bearer {token}").parse().unwrap());
        h
    }

    #[tokio::test]
    async fn club_displays_crud_rbac_and_public_feed() {
        let state = test_state();
        let h_admin = bearer(&state, "emp-daniel").await;
        let h_emp = bearer(&state, "emp-karim").await;

        // Non-manager refusé en création (403)
        let denied = post_create_display(
            State(state.clone()),
            Path("carre-de-soie".into()),
            h_emp,
            Json(CreateDisplayPayload {
                name: "TV Accueil".into(),
                zone: "Accueil".into(),
                mode: "mixed".into(),
                headline: "Bienvenue".into(),
                ticker_message: "Nouveaux cours".into(),
            }),
        )
        .await
        .expect_err("employee must not create display");
        assert_eq!(denied.0, StatusCode::FORBIDDEN);

        // Admin crée un écran
        let Json(created) = post_create_display(
            State(state.clone()),
            Path("carre-de-soie".into()),
            h_admin.clone(),
            Json(CreateDisplayPayload {
                name: "TV Cardio 1".into(),
                zone: "Zone Cardio".into(),
                mode: "mixed".into(),
                headline: "Challenge Printemps".into(),
                ticker_message: "BodyPump à 18h30 en Salle A".into(),
            }),
        )
        .await
        .expect("admin create display must succeed");
        let id = created["screen"]["id"].as_str().unwrap().to_string();

        // Flux public OK
        let Json(feed) = get_public_display_feed(
            State(state.clone()),
            Path(("carre-de-soie".into(), id.clone())),
        )
        .await
        .expect("public feed must succeed");
        assert_eq!(feed["clubName"], "C.Fitness Carré de Soie");
        assert_eq!(feed["screen"]["name"], "TV Cardio 1");

        // Suppression par admin
        let Json(del) = delete_display(
            State(state.clone()),
            Path(("carre-de-soie".into(), id)),
            h_admin,
        )
        .await
        .expect("admin delete must succeed");
        assert_eq!(del["deleted"], true);

        let _ = std::fs::remove_dir_all(&state.data_dir);
    }
}
