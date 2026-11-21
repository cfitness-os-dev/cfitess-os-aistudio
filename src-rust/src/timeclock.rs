use crate::models::TimeclockAnomaly;
use crate::rbac::{
    evaluate_permission, filter_anomalies_for_actor, is_admin_employee, normalize_site_id,
    PermissionTarget,
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
pub struct CreateTimeclockAnomalyPayload {
    pub employee_id: String,
    pub site_id: String,
    pub date: String,
    pub planned_range: String,
    pub punched_range: String,
    pub delta_minutes: i32,
    pub has_proof_photo: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateTimeclockAnomalyPayload {
    pub status: String,
    pub note: Option<String>,
}

pub async fn get_timeclock_anomalies(
    State(state): State<SharedState>,
    headers: HeaderMap,
) -> Result<Json<Vec<TimeclockAnomaly>>, (StatusCode, Json<Value>)> {
    let (actor_id, site_id) = resolve_session_actor(&state, &headers).await?;
    let db = state.db.read().await;
    let list = filter_anomalies_for_actor(&db, &actor_id, &site_id);
    Ok(Json(list))
}

pub async fn post_timeclock_anomaly(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Json(payload): Json<CreateTimeclockAnomalyPayload>,
) -> Result<(StatusCode, Json<TimeclockAnomaly>), (StatusCode, Json<Value>)> {
    let (actor_id, _active_site) = resolve_session_actor(&state, &headers).await?;
    let target_site_id = normalize_site_id(&payload.site_id);
    if target_site_id != "club-carre-soie" && target_site_id != "club-beynost" {
        return Err(err_resp(
            StatusCode::BAD_REQUEST,
            format!("Établissement invalide : {}", payload.site_id),
        ));
    }
    if payload.employee_id.trim().is_empty()
        || payload.date.trim().is_empty()
        || payload.planned_range.trim().is_empty()
        || payload.punched_range.trim().is_empty()
    {
        return Err(err_resp(
            StatusCode::BAD_REQUEST,
            "Champs obligatoires manquants pour l'anomalie de pointage.",
        ));
    }

    let mut db = state.db.write().await;
    if !db
        .employees
        .iter()
        .any(|e| e.id == payload.employee_id.trim())
    {
        return Err(err_resp(
            StatusCode::NOT_FOUND,
            format!("Collaborateur introuvable : {}", payload.employee_id),
        ));
    }

    let target = PermissionTarget {
        site_id: Some(&target_site_id),
        target_employee_id: Some(payload.employee_id.trim()),
        target_team_ids: &[],
        lock_state: None,
    };
    let allowed = is_admin_employee(&db, &actor_id)
        || evaluate_permission(&db, &actor_id, &target_site_id, "ORG04-17", Some(target)).allowed;
    if !allowed {
        return Err(err_resp(
            StatusCode::FORBIDDEN,
            "Accès refusé (403) : déclaration d'anomalie de pointage non autorisée sur ce périmètre.",
        ));
    }

    let seq = db.anomalies.len() + 1;
    let anomaly = TimeclockAnomaly {
        id: format!("anom-{}-{:03}", Utc::now().timestamp_millis(), seq),
        employee_id: payload.employee_id.trim().to_string(),
        site_id: target_site_id.clone(),
        date: payload.date.trim().to_string(),
        planned_range: payload.planned_range.trim().to_string(),
        punched_range: payload.punched_range.trim().to_string(),
        delta_minutes: payload.delta_minutes,
        has_proof_photo: payload.has_proof_photo.unwrap_or(false),
        status: "to_review".to_string(),
    };

    let snapshot = db.clone();
    db.anomalies.insert(0, anomaly.clone());

    append_audit(
        &mut db,
        &actor_id,
        "Temps & Pointeuse (Anomalie déclarée)",
        format!(
            "Déclaration anomalie badgeuse {} ({}, écart {} min)",
            anomaly.employee_id, anomaly.date, anomaly.delta_minutes
        ),
        &target_site_id,
        "anomalies",
        None,
        Some(anomaly.status.clone()),
    );

    if let Err(err_msg) = persist_state(&state.data_dir, &db) {
        *db = snapshot;
        return Err(err_resp(
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Échec persistance anomalie badgeuse : {}", err_msg),
        ));
    }

    Ok((StatusCode::CREATED, Json(anomaly)))
}

pub async fn patch_timeclock_anomaly(
    State(state): State<SharedState>,
    Path(anomaly_id): Path<String>,
    headers: HeaderMap,
    Json(payload): Json<UpdateTimeclockAnomalyPayload>,
) -> Result<Json<TimeclockAnomaly>, (StatusCode, Json<Value>)> {
    let (actor_id, _active_site) = resolve_session_actor(&state, &headers).await?;
    let next_status = match payload.status.trim() {
        "to_review" | "validated" | "ignored" => payload.status.trim().to_string(),
        _ => {
            return Err(err_resp(
                StatusCode::BAD_REQUEST,
                "Statut d'anomalie invalide. Valeurs supportées : to_review, validated, ignored.",
            ));
        }
    };

    let mut db = state.db.write().await;
    let (idx, anom_emp, anom_site) = {
        let pos = db
            .anomalies
            .iter()
            .position(|a| a.id == anomaly_id)
            .ok_or_else(|| {
                err_resp(
                    StatusCode::NOT_FOUND,
                    format!("Anomalie de pointage « {} » introuvable.", anomaly_id),
                )
            })?;
        (
            pos,
            db.anomalies[pos].employee_id.clone(),
            db.anomalies[pos].site_id.clone(),
        )
    };

    let target = PermissionTarget {
        site_id: Some(&anom_site),
        target_employee_id: Some(&anom_emp),
        target_team_ids: &[],
        lock_state: None,
    };
    let allowed = is_admin_employee(&db, &actor_id)
        || evaluate_permission(&db, &actor_id, &anom_site, "ORG04-17", Some(target)).allowed;
    if !allowed {
        return Err(err_resp(
            StatusCode::FORBIDDEN,
            "Accès refusé (403) : régularisation de pointage (ORG04-17) non autorisée sur ce périmètre.",
        ));
    }

    let snapshot = db.clone();
    let old_status = db.anomalies[idx].status.clone();
    db.anomalies[idx].status = next_status.clone();
    let updated = db.anomalies[idx].clone();

    let note_suffix = payload
        .note
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(|n| format!(" · Motif : {n}"))
        .unwrap_or_default();

    append_audit(
        &mut db,
        &actor_id,
        "Temps & Pointeuse (Régularisation OBJ20)",
        format!(
            "Correction non destructive anomalie {} ({}, badgé brut conservé {}) : {} -> {}{}",
            updated.id,
            updated.date,
            updated.punched_range,
            old_status,
            updated.status,
            note_suffix
        ),
        &anom_site,
        "anomalies",
        Some(old_status),
        Some(updated.status.clone()),
    );

    if let Err(err_msg) = persist_state(&state.data_dir, &db) {
        *db = snapshot;
        return Err(err_resp(
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Échec persistance régularisation pointage : {}", err_msg),
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
            "cfos_tc_test_{}_{}",
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
            "tc-session-{}-{}",
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
    async fn timeclock_anomalies_create_and_non_destructive_regularization_persist() {
        let state = test_state();
        let admin_headers = session_headers(&state, "emp-admin", "club-carre-soie").await;

        let (status, Json(created)) = post_timeclock_anomaly(
            State(state.clone()),
            admin_headers.clone(),
            Json(CreateTimeclockAnomalyPayload {
                employee_id: "emp-accueil-cs".into(),
                site_id: "carre-de-soie".into(),
                date: "2026-11-21".into(),
                planned_range: "09:00 - 17:00".into(),
                punched_range: "09:14 - 17:02".into(),
                delta_minutes: -12,
                has_proof_photo: Some(true),
            }),
        )
        .await
        .expect("création anomalie");
        assert_eq!(status, StatusCode::CREATED);
        assert_eq!(created.status, "to_review");

        // Régularisation OBJ20 sans écraser OBJ19 (punched_range)
        let Json(validated) = patch_timeclock_anomaly(
            State(state.clone()),
            Path(created.id.clone()),
            admin_headers,
            Json(UpdateTimeclockAnomalyPayload {
                status: "validated".into(),
                note: Some("Retard tramway T3 justifié".into()),
            }),
        )
        .await
        .expect("validation anomalie");
        assert_eq!(validated.status, "validated");
        assert_eq!(validated.punched_range, "09:14 - 17:02");

        // Employé standard (emp-accueil-cs) ne peut pas régulariser sa propre anomalie (403)
        let emp_headers = session_headers(&state, "emp-accueil-cs", "club-carre-soie").await;
        let (err_code, _) = patch_timeclock_anomaly(
            State(state.clone()),
            Path(created.id),
            emp_headers,
            Json(UpdateTimeclockAnomalyPayload {
                status: "ignored".into(),
                note: None,
            }),
        )
        .await
        .unwrap_err();
        assert_eq!(err_code, StatusCode::FORBIDDEN);
        let _ = std::fs::remove_dir_all(&state.data_dir);
    }
}
