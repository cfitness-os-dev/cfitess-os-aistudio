use crate::models::{ClubSocialChannels, SocialPostRecord};
use crate::rbac::{can_access_site_scope, is_admin_employee};
use crate::routes::{append_audit, err_resp, resolve_session_actor, SharedState};
use crate::seed::persist_state;
use axum::extract::{Path, State};
use axum::http::{HeaderMap, StatusCode};
use axum::Json;
use chrono::Utc;
use serde::Deserialize;
use serde_json::Value;

fn normalize_club_id(raw: &str) -> Option<&'static str> {
    match raw.trim().to_lowercase().as_str() {
        "carre-de-soie" | "club-carre-soie" => Some("carre-de-soie"),
        "beynost" | "club-beynost" => Some("beynost"),
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

pub fn default_social_channels(club_id: &str) -> ClubSocialChannels {
    if club_id == "beynost" {
        ClubSocialChannels {
            club_id: "beynost".into(),
            website_url: "https://c.fitness".into(),
            club_page_url: "https://c.fitness/club-beynost".into(),
            instagram_handle: "@c.fitness.beynost".into(),
            instagram_url: "https://www.instagram.com/".into(),
            facebook_url: "https://www.facebook.com/".into(),
            tiktok_handle: "@c.fitness".into(),
            tiktok_url: "https://www.tiktok.com/".into(),
            youtube_url: "https://www.youtube.com/".into(),
            google_business_url: "https://www.google.com/maps/search/?api=1&query=C.Fitness+Beynost+ZAC+des+Baterses+01700+Beynost".into(),
            google_rating: 4.8,
            google_reviews_count: 412,
            updated_at: "2026-11-22".into(),
        }
    } else {
        ClubSocialChannels {
            club_id: "carre-de-soie".into(),
            website_url: "https://c.fitness".into(),
            club_page_url: "https://c.fitness/club-carre-de-soie".into(),
            instagram_handle: "@c.fitness.lyon".into(),
            instagram_url: "https://www.instagram.com/".into(),
            facebook_url: "https://www.facebook.com/".into(),
            tiktok_handle: "@c.fitness".into(),
            tiktok_url: "https://www.tiktok.com/".into(),
            youtube_url: "https://www.youtube.com/".into(),
            google_business_url: "https://www.google.com/maps/search/?api=1&query=C.Fitness+Carre+de+Soie+2+Rue+Jacquard+69120+Vaulx-en-Velin".into(),
            google_rating: 4.7,
            google_reviews_count: 685,
            updated_at: "2026-11-22".into(),
        }
    }
}

pub async fn get_social_channels(
    State(state): State<SharedState>,
    Path(raw_club_id): Path<String>,
    headers: HeaderMap,
) -> Result<Json<ClubSocialChannels>, (StatusCode, Json<Value>)> {
    let Some(club_id) = normalize_club_id(&raw_club_id) else {
        return Err(err_resp(StatusCode::NOT_FOUND, "Club introuvable."));
    };
    let (actor_id, _) = resolve_session_actor(&state, &headers).await?;
    let db = state.db.read().await;
    if !can_access_site_scope(&db, &actor_id, club_to_site_id(club_id)) {
        return Err(err_resp(
            StatusCode::FORBIDDEN,
            "Accès refusé pour ce club.",
        ));
    }
    let channels = db
        .social_channels_by_club
        .get(club_id)
        .cloned()
        .unwrap_or_else(|| default_social_channels(club_id));
    Ok(Json(channels))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateSocialChannelsPayload {
    pub website_url: String,
    pub club_page_url: String,
    pub instagram_handle: String,
    pub instagram_url: String,
    pub facebook_url: String,
    pub tiktok_handle: String,
    pub tiktok_url: String,
    pub youtube_url: String,
    pub google_business_url: String,
    pub google_rating: f64,
    pub google_reviews_count: u32,
}

fn is_safe_http_url(raw: &str) -> bool {
    let trimmed = raw.trim();
    trimmed.is_empty() || trimmed.starts_with("https://") || trimmed.starts_with("http://")
}

pub async fn put_social_channels(
    State(state): State<SharedState>,
    Path(raw_club_id): Path<String>,
    headers: HeaderMap,
    Json(payload): Json<UpdateSocialChannelsPayload>,
) -> Result<Json<ClubSocialChannels>, (StatusCode, Json<Value>)> {
    let Some(club_id) = normalize_club_id(&raw_club_id) else {
        return Err(err_resp(StatusCode::NOT_FOUND, "Club introuvable."));
    };
    let site_id = club_to_site_id(club_id);
    for url in [
        &payload.website_url,
        &payload.club_page_url,
        &payload.instagram_url,
        &payload.facebook_url,
        &payload.tiktok_url,
        &payload.youtube_url,
        &payload.google_business_url,
    ] {
        if !is_safe_http_url(url) {
            return Err(err_resp(
                StatusCode::BAD_REQUEST,
                "Chaque lien doit commencer par https:// ou http:// (ou être vide).",
            ));
        }
    }
    if !payload.google_rating.is_finite() || !(0.0..=5.0).contains(&payload.google_rating) {
        return Err(err_resp(
            StatusCode::BAD_REQUEST,
            "La note Google doit être comprise entre 0 et 5.",
        ));
    }

    let (actor_id, _) = resolve_session_actor(&state, &headers).await?;
    let mut db = state.db.write().await;
    let is_manager = db.employees.iter().any(|e| {
        e.id == actor_id
            && e.site_accesses.iter().any(|sa| {
                sa.site_id == site_id
                    && matches!(
                        sa.profile_id.as_str(),
                        "admin_systeme" | "master_avance" | "planificateur_avance"
                    )
            })
    });
    if !is_admin_employee(&db, &actor_id) && !is_manager {
        return Err(err_resp(
            StatusCode::FORBIDDEN,
            "Seuls la Direction et les responsables du club peuvent modifier les liens Site Web & Réseaux.",
        ));
    }

    let updated = ClubSocialChannels {
        club_id: club_id.into(),
        website_url: payload.website_url.trim().into(),
        club_page_url: payload.club_page_url.trim().into(),
        instagram_handle: payload.instagram_handle.trim().into(),
        instagram_url: payload.instagram_url.trim().into(),
        facebook_url: payload.facebook_url.trim().into(),
        tiktok_handle: payload.tiktok_handle.trim().into(),
        tiktok_url: payload.tiktok_url.trim().into(),
        youtube_url: payload.youtube_url.trim().into(),
        google_business_url: payload.google_business_url.trim().into(),
        google_rating: (payload.google_rating * 10.0).round() / 10.0,
        google_reviews_count: payload.google_reviews_count,
        updated_at: Utc::now().format("%Y-%m-%d").to_string(),
    };

    let mut next = db.clone();
    next.social_channels_by_club
        .insert(club_id.to_string(), updated.clone());
    append_audit(
        &mut next,
        &actor_id,
        "Site Web & Réseaux Sociaux",
        format!("Mise à jour des liens et vitrine digitale ({club_id})"),
        site_id,
        "social_web",
        None,
        Some(updated.website_url.clone()),
    );
    persist_state(&state.data_dir, &next).map_err(|err| {
        err_resp(
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Échec de persistance des canaux digitaux : {err}"),
        )
    })?;
    *db = next;
    Ok(Json(updated))
}

pub async fn get_social_posts(
    State(state): State<SharedState>,
    headers: HeaderMap,
) -> Result<Json<Vec<SocialPostRecord>>, (StatusCode, Json<Value>)> {
    let (actor_id, _) = resolve_session_actor(&state, &headers).await?;
    let db = state.db.read().await;
    let list: Vec<SocialPostRecord> = db
        .social_posts
        .iter()
        .filter(|p| {
            let cid = normalize_club_id(&p.club_id).unwrap_or("carre-de-soie");
            can_access_site_scope(&db, &actor_id, club_to_site_id(cid))
        })
        .cloned()
        .collect();
    Ok(Json(list))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateSocialPostPayload {
    pub club_id: String,
    pub platform: String,
    pub format: String,
    pub title: String,
    #[serde(default)]
    pub caption: String,
    pub scheduled_date: String,
    #[serde(default)]
    pub status: Option<String>,
}

fn is_valid_post_status(st: &str) -> bool {
    matches!(st, "brouillon" | "a_valider" | "programme" | "publie")
}

pub async fn post_social_post(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Json(payload): Json<CreateSocialPostPayload>,
) -> Result<(StatusCode, Json<SocialPostRecord>), (StatusCode, Json<Value>)> {
    let Some(club_id) = normalize_club_id(&payload.club_id) else {
        return Err(err_resp(StatusCode::BAD_REQUEST, "Club invalide."));
    };
    if payload.title.trim().is_empty() {
        return Err(err_resp(
            StatusCode::BAD_REQUEST,
            "Le titre de la publication est obligatoire.",
        ));
    }
    let status = payload
        .status
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or("brouillon");
    if !is_valid_post_status(status) {
        return Err(err_resp(
            StatusCode::BAD_REQUEST,
            "Statut de publication invalide.",
        ));
    }

    let (actor_id, _) = resolve_session_actor(&state, &headers).await?;
    let site_id = club_to_site_id(club_id);
    let mut db = state.db.write().await;
    if !can_access_site_scope(&db, &actor_id, site_id) {
        return Err(err_resp(
            StatusCode::FORBIDDEN,
            "Accès refusé pour créer une publication sur ce club.",
        ));
    }

    let author_name = db
        .employees
        .iter()
        .find(|e| e.id == actor_id)
        .map(|e| format!("{} {}", e.first_name, e.last_name))
        .unwrap_or_else(|| actor_id.clone());

    let post = SocialPostRecord {
        id: format!(
            "soc-{}-{:03}",
            Utc::now().timestamp_millis(),
            db.social_posts.len() + 1
        ),
        club_id: club_id.into(),
        platform: payload.platform.trim().into(),
        format: payload.format.trim().into(),
        title: payload.title.trim().into(),
        caption: payload.caption.trim().into(),
        scheduled_date: payload.scheduled_date.trim().into(),
        status: status.into(),
        author_name,
        created_at: Utc::now().format("%Y-%m-%d").to_string(),
    };

    let mut next = db.clone();
    next.social_posts.insert(0, post.clone());
    append_audit(
        &mut next,
        &actor_id,
        "Calendrier éditorial (Création)",
        format!("Nouvelle publication {} : « {} »", post.platform, post.title),
        site_id,
        "social_web",
        None,
        Some(post.status.clone()),
    );
    persist_state(&state.data_dir, &next).map_err(|err| {
        err_resp(
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Échec de persistance de la publication : {err}"),
        )
    })?;
    *db = next;
    Ok((StatusCode::CREATED, Json(post)))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PatchSocialPostPayload {
    pub status: Option<String>,
    pub scheduled_date: Option<String>,
    pub caption: Option<String>,
}

pub async fn patch_social_post(
    State(state): State<SharedState>,
    Path(post_id): Path<String>,
    headers: HeaderMap,
    Json(payload): Json<PatchSocialPostPayload>,
) -> Result<Json<SocialPostRecord>, (StatusCode, Json<Value>)> {
    if let Some(ref st) = payload.status {
        if !is_valid_post_status(st.trim()) {
            return Err(err_resp(
                StatusCode::BAD_REQUEST,
                "Statut de publication invalide.",
            ));
        }
    }
    let (actor_id, _) = resolve_session_actor(&state, &headers).await?;
    let mut db = state.db.write().await;
    let Some(idx) = db.social_posts.iter().position(|p| p.id == post_id) else {
        return Err(err_resp(StatusCode::NOT_FOUND, "Publication introuvable."));
    };
    let club_id = normalize_club_id(&db.social_posts[idx].club_id).unwrap_or("carre-de-soie");
    let site_id = club_to_site_id(club_id);
    if !can_access_site_scope(&db, &actor_id, site_id) {
        return Err(err_resp(
            StatusCode::FORBIDDEN,
            "Accès refusé pour modifier cette publication.",
        ));
    }

    let mut next = db.clone();
    if let Some(ref st) = payload.status {
        next.social_posts[idx].status = st.trim().into();
    }
    if let Some(ref d) = payload.scheduled_date {
        if !d.trim().is_empty() {
            next.social_posts[idx].scheduled_date = d.trim().into();
        }
    }
    if let Some(ref cap) = payload.caption {
        next.social_posts[idx].caption = cap.trim().into();
    }
    let updated = next.social_posts[idx].clone();
    append_audit(
        &mut next,
        &actor_id,
        "Calendrier éditorial (Mise à jour)",
        format!("Publication « {} » passée à {}", updated.title, updated.status),
        site_id,
        "social_web",
        None,
        Some(updated.status.clone()),
    );
    persist_state(&state.data_dir, &next).map_err(|err| {
        err_resp(
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Échec de persistance de la publication : {err}"),
        )
    })?;
    *db = next;
    Ok(Json(updated))
}

pub async fn delete_social_post(
    State(state): State<SharedState>,
    Path(post_id): Path<String>,
    headers: HeaderMap,
) -> Result<StatusCode, (StatusCode, Json<Value>)> {
    let (actor_id, _) = resolve_session_actor(&state, &headers).await?;
    let mut db = state.db.write().await;
    let Some(idx) = db.social_posts.iter().position(|p| p.id == post_id) else {
        return Err(err_resp(StatusCode::NOT_FOUND, "Publication introuvable."));
    };
    let club_id = normalize_club_id(&db.social_posts[idx].club_id).unwrap_or("carre-de-soie");
    let site_id = club_to_site_id(club_id);
    if !can_access_site_scope(&db, &actor_id, site_id) {
        return Err(err_resp(
            StatusCode::FORBIDDEN,
            "Accès refusé pour supprimer cette publication.",
        ));
    }

    let mut next = db.clone();
    let removed = next.social_posts.remove(idx);
    append_audit(
        &mut next,
        &actor_id,
        "Calendrier éditorial (Suppression)",
        format!("Suppression de la publication « {} »", removed.title),
        site_id,
        "social_web",
        Some(removed.title),
        None,
    );
    persist_state(&state.data_dir, &next).map_err(|err| {
        err_resp(
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Échec de persistance de la suppression : {err}"),
        )
    })?;
    *db = next;
    Ok(StatusCode::NO_CONTENT)
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
            "cfos_social_test_{}_{}",
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
            "soc-session-{}-{}",
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
            HeaderValue::from_str(&format!("Bearer {}", token)).unwrap(),
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
    async fn social_web_channels_and_editorial_posts_persist_by_club() {
        let state = test_state();
        let headers = session_headers(&state, "emp-mario", "club-carre-soie").await;

        let Json(updated_ch) = put_social_channels(
            State(state.clone()),
            Path("carre-de-soie".into()),
            headers.clone(),
            Json(UpdateSocialChannelsPayload {
                website_url: "https://c.fitness".into(),
                club_page_url: "https://c.fitness/carre-de-soie".into(),
                instagram_handle: "@c.fitness.carredesoie".into(),
                instagram_url: "https://www.instagram.com/c.fitness".into(),
                facebook_url: "https://www.facebook.com/c.fitness".into(),
                tiktok_handle: "@c.fitness".into(),
                tiktok_url: "https://www.tiktok.com/@c.fitness".into(),
                youtube_url: "https://www.youtube.com/@cfitness".into(),
                google_business_url: "https://g.page/cfitness-carre-de-soie".into(),
                google_rating: 4.9,
                google_reviews_count: 710,
            }),
        )
        .await
        .expect("update channels OK");
        assert_eq!(updated_ch.google_rating, 4.9);

        let (status, Json(created)) = post_social_post(
            State(state.clone()),
            headers.clone(),
            Json(CreateSocialPostPayload {
                club_id: "carre-de-soie".into(),
                platform: "Instagram".into(),
                format: "Reel / Vidéo".into(),
                title: "Nouveau plateau Hyrox".into(),
                caption: "Venez tester la zone Hyrox dès lundi !".into(),
                scheduled_date: "2026-11-25".into(),
                status: Some("a_valider".into()),
            }),
        )
        .await
        .expect("create post OK");
        assert_eq!(status, StatusCode::CREATED);

        let Json(patched) = patch_social_post(
            State(state.clone()),
            Path(created.id.clone()),
            headers.clone(),
            Json(PatchSocialPostPayload {
                status: Some("programme".into()),
                scheduled_date: None,
                caption: None,
            }),
        )
        .await
        .expect("patch post OK");
        assert_eq!(patched.status, "programme");

        let reloaded = load_or_init_state(&state.data_dir);
        assert_eq!(
            reloaded.social_channels_by_club["carre-de-soie"].google_reviews_count,
            710
        );
        assert!(reloaded
            .social_posts
            .iter()
            .any(|p| p.id == created.id && p.status == "programme"));

        let _ = std::fs::remove_dir_all(&state.data_dir);
    }
}
