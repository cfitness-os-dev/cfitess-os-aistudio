use crate::models::HeitzMemberRecord;
use crate::rbac::can_access_site_scope;
use crate::routes::{append_audit, err_resp, resolve_session_actor, SharedState};
use crate::seed::persist_state;
use axum::extract::{Path, State};
use axum::http::{HeaderMap, StatusCode};
use axum::Json;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use serde_json::Value;

fn normalize_club_id(raw: &str) -> String {
    match raw.trim().to_lowercase().as_str() {
        "beynost" | "club-beynost" => "beynost".to_string(),
        _ => "carre-de-soie".to_string(),
    }
}

fn club_to_site_id(club_id: &str) -> &'static str {
    if club_id == "beynost" || club_id == "club-beynost" {
        "club-beynost"
    } else {
        "club-carre-soie"
    }
}

pub async fn get_heitz_members(
    State(state): State<SharedState>,
    headers: HeaderMap,
) -> Result<Json<Vec<HeitzMemberRecord>>, (StatusCode, Json<Value>)> {
    let (actor_id, _site_id) = resolve_session_actor(&state, &headers).await?;
    let db = state.db.read().await;
    let rows: Vec<HeitzMemberRecord> = db
        .heitz_members
        .iter()
        .filter(|m| {
            let site_id = club_to_site_id(&normalize_club_id(&m.home_club_id));
            can_access_site_scope(&db, &actor_id, site_id)
        })
        .cloned()
        .collect();
    Ok(Json(rows))
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HeitzMemberImportItem {
    #[serde(default)]
    pub id: Option<String>,
    pub first_name: String,
    pub last_name: String,
    #[serde(default)]
    pub phone: Option<String>,
    #[serde(default)]
    pub email: Option<String>,
    #[serde(default)]
    pub badge_code: Option<String>,
    #[serde(default)]
    pub home_club_id: Option<String>,
    #[serde(default)]
    pub subscription_name: Option<String>,
    #[serde(default)]
    pub active_subscription: Option<bool>,
    #[serde(default)]
    pub fin_balance_eur: Option<f64>,
    #[serde(default)]
    pub mywellness_member_id: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HeitzMemberBatchImportPayload {
    #[serde(default)]
    pub source: Option<String>,
    pub members: Vec<HeitzMemberImportItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HeitzMemberBatchImportResponse {
    pub added: usize,
    pub updated: usize,
    pub total_processed: usize,
    pub items: Vec<HeitzMemberRecord>,
}

pub async fn post_heitz_members_import(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Json(payload): Json<HeitzMemberBatchImportPayload>,
) -> Result<(StatusCode, Json<HeitzMemberBatchImportResponse>), (StatusCode, Json<Value>)> {
    if payload.members.is_empty() {
        return Err(err_resp(
            StatusCode::BAD_REQUEST,
            "La liste d'adhérents Heitz à importer est vide.",
        ));
    }
    let (actor_id, active_site_id) = resolve_session_actor(&state, &headers).await?;
    let mut db = state.db.write().await;
    let previous = db.clone();

    let mut added = 0usize;
    let mut updated = 0usize;

    for (idx, raw) in payload.members.iter().enumerate() {
        let first_name = raw.first_name.trim();
        let last_name = raw.last_name.trim();
        if first_name.is_empty() && last_name.is_empty() {
            continue;
        }
        let club_id = raw
            .home_club_id
            .as_deref()
            .map(normalize_club_id)
            .unwrap_or_else(|| normalize_club_id(&active_site_id));
        let target_site_id = club_to_site_id(&club_id);
        if !can_access_site_scope(&db, &actor_id, target_site_id) {
            continue;
        }

        let badge_norm = raw
            .badge_code
            .as_deref()
            .map(|b| b.trim().to_string())
            .filter(|b| !b.is_empty());
        let email_norm = raw
            .email
            .as_deref()
            .map(|e| e.trim().to_string())
            .filter(|e| !e.is_empty());
        let balance = raw.fin_balance_eur.unwrap_or(0.0);

        if let Some(existing) = db.heitz_members.iter_mut().find(|m| {
            (badge_norm.is_some()
                && m.badge_code
                    .eq_ignore_ascii_case(badge_norm.as_deref().unwrap_or_default()))
                || (email_norm.is_some()
                    && m.email
                        .as_deref()
                        .unwrap_or_default()
                        .eq_ignore_ascii_case(email_norm.as_deref().unwrap_or_default()))
                || (m.first_name.eq_ignore_ascii_case(first_name)
                    && m.last_name.eq_ignore_ascii_case(last_name)
                    && normalize_club_id(&m.home_club_id) == club_id)
        }) {
            if let Some(p) = &raw.phone {
                if !p.trim().is_empty() {
                    existing.phone = p.trim().to_string();
                }
            }
            if let Some(sub) = &raw.subscription_name {
                if !sub.trim().is_empty() {
                    existing.subscription_name = sub.trim().to_string();
                }
            }
            if let Some(act) = raw.active_subscription {
                existing.active_subscription = act;
            }
            if raw.fin_balance_eur.is_some() {
                existing.fin_balance_eur = balance;
                existing.fin_balance_state = if balance < 0.0 { 0 } else { 1 };
            }
            updated += 1;
        } else {
            let prefix = if club_id == "beynost" { "BEY" } else { "CDS" };
            let badge_code = badge_norm.unwrap_or_else(|| {
                format!(
                    "HZ-{}-{:04}",
                    prefix,
                    (2000 + db.heitz_members.len() + idx) % 10000
                )
            });
            let record = HeitzMemberRecord {
                id: raw
                    .id
                    .clone()
                    .filter(|s| !s.trim().is_empty())
                    .unwrap_or_else(|| {
                        format!(
                            "hm-{}-{:03}",
                            Utc::now().timestamp_millis(),
                            db.heitz_members.len() + idx + 1
                        )
                    }),
                badge_code,
                rfid_bluetooth_enabled: true,
                mywellness_member_id: raw
                    .mywellness_member_id
                    .as_ref()
                    .map(|s| s.trim().to_string())
                    .filter(|s| !s.is_empty()),
                first_name: if first_name.is_empty() {
                    "Adhérent".into()
                } else {
                    first_name.to_string()
                },
                last_name: if last_name.is_empty() {
                    "Importé".into()
                } else {
                    last_name.to_string()
                },
                phone: raw
                    .phone
                    .as_deref()
                    .map(str::trim)
                    .filter(|s| !s.is_empty())
                    .unwrap_or("06 00 00 00 00")
                    .to_string(),
                email: email_norm,
                home_club_id: club_id,
                subscription_name: raw
                    .subscription_name
                    .as_deref()
                    .map(str::trim)
                    .filter(|s| !s.is_empty())
                    .unwrap_or("Liberté Bi-Club (39,90 €/mois)")
                    .to_string(),
                active_subscription: raw.active_subscription.unwrap_or(true),
                fin_balance_eur: balance,
                fin_balance_state: if balance < 0.0 { 0 } else { 1 },
                technogym_moves30d: 0,
                days_since_last_workout: 0,
                loyalty_points: 50,
                referrals_count: 0,
                last_reward_label: None,
            };
            db.heitz_members.insert(0, record);
            added += 1;
        }
    }

    let source_label = payload.source.as_deref().unwrap_or("HEITZ_CSV");
    append_audit(
        &mut db,
        &actor_id,
        "Adhérents Heitz (Import)",
        format!(
            "Import adhérents Heitz ({source_label}) : {added} créé(s), {updated} mis à jour"
        ),
        &active_site_id,
        "heitz_members",
        None,
        Some(format!("+{added} / ~{updated}")),
    );

    if let Err(err) = persist_state(&state.data_dir, &db) {
        *db = previous;
        return Err(err_resp(
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Échec de persistance de l'import Heitz : {err}"),
        ));
    }

    let items: Vec<HeitzMemberRecord> = db
        .heitz_members
        .iter()
        .filter(|m| {
            let site_id = club_to_site_id(&normalize_club_id(&m.home_club_id));
            can_access_site_scope(&db, &actor_id, site_id)
        })
        .cloned()
        .collect();

    Ok((
        StatusCode::CREATED,
        Json(HeitzMemberBatchImportResponse {
            added,
            updated,
            total_processed: payload.members.len(),
            items,
        }),
    ))
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HeitzMemberPatchPayload {
    #[serde(default)]
    pub fin_balance_eur: Option<f64>,
    #[serde(default)]
    pub active_subscription: Option<bool>,
}

pub async fn patch_heitz_member(
    State(state): State<SharedState>,
    Path(member_id): Path<String>,
    headers: HeaderMap,
    Json(payload): Json<HeitzMemberPatchPayload>,
) -> Result<Json<HeitzMemberRecord>, (StatusCode, Json<Value>)> {
    let (actor_id, _active_site) = resolve_session_actor(&state, &headers).await?;
    let mut db = state.db.write().await;
    let previous = db.clone();

    let Some(idx) = db.heitz_members.iter().position(|m| m.id == member_id) else {
        return Err(err_resp(
            StatusCode::NOT_FOUND,
            "Adhérent Heitz introuvable.",
        ));
    };
    let member_club = normalize_club_id(&db.heitz_members[idx].home_club_id);
    let member_site = club_to_site_id(&member_club);
    if !can_access_site_scope(&db, &actor_id, member_site) {
        return Err(err_resp(
            StatusCode::FORBIDDEN,
            "Accès refusé pour le club de rattachement de cet adhérent.",
        ));
    }

    if let Some(bal) = payload.fin_balance_eur {
        db.heitz_members[idx].fin_balance_eur = bal;
        db.heitz_members[idx].fin_balance_state = if bal < 0.0 { 0 } else { 1 };
    }
    if let Some(act) = payload.active_subscription {
        db.heitz_members[idx].active_subscription = act;
    }

    let updated = db.heitz_members[idx].clone();
    append_audit(
        &mut db,
        &actor_id,
        "Adhérents Heitz (Mise à jour / SEPA)",
        format!(
            "Mise à jour adhérent Heitz {} {} ({}) : solde {:.2} €, actif={}",
            updated.first_name,
            updated.last_name,
            updated.badge_code,
            updated.fin_balance_eur,
            updated.active_subscription
        ),
        member_site,
        "heitz_members",
        None,
        Some(format!("{:.2} €", updated.fin_balance_eur)),
    );

    if let Err(err) = persist_state(&state.data_dir, &db) {
        *db = previous;
        return Err(err_resp(
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Échec de persistance de l'adhérent Heitz : {err}"),
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
            "cfos_hm_test_{}_{}",
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
            "hm-session-{}-{}",
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
    async fn heitz_members_batch_import_and_sepa_regularization_persist() {
        let state = test_state();
        let headers = session_headers(&state, "emp-mario", "club-carre-soie").await;

        let (status, Json(import_out)) = post_heitz_members_import(
            State(state.clone()),
            headers.clone(),
            Json(HeitzMemberBatchImportPayload {
                source: Some("HEITZ_CSV".into()),
                members: vec![HeitzMemberImportItem {
                    id: None,
                    first_name: "Claire".into(),
                    last_name: "Martin".into(),
                    phone: Some("06 11 22 33 44".into()),
                    email: Some("claire.martin@test.fr".into()),
                    badge_code: Some("HZ-CDS-9901".into()),
                    home_club_id: Some("carre-de-soie".into()),
                    subscription_name: None,
                    active_subscription: Some(true),
                    fin_balance_eur: Some(-39.90),
                    mywellness_member_id: None,
                }],
            }),
        )
        .await
        .expect("import Heitz OK");

        assert_eq!(status, StatusCode::CREATED);
        assert_eq!(import_out.added, 1);
        let created = import_out
            .items
            .iter()
            .find(|m| m.badge_code == "HZ-CDS-9901")
            .expect("membre importé");
        assert_eq!(created.fin_balance_state, 0);

        let Json(updated) = patch_heitz_member(
            State(state.clone()),
            Path(created.id.clone()),
            headers.clone(),
            Json(HeitzMemberPatchPayload {
                fin_balance_eur: Some(0.0),
                active_subscription: None,
            }),
        )
        .await
        .expect("patch SEPA OK");

        assert_eq!(updated.fin_balance_eur, 0.0);
        assert_eq!(updated.fin_balance_state, 1);

        let reloaded = load_or_init_state(&state.data_dir);
        let found = reloaded
            .heitz_members
            .iter()
            .find(|m| m.id == created.id)
            .expect("persisté sur disque");
        assert_eq!(found.fin_balance_eur, 0.0);
        assert_eq!(found.fin_balance_state, 1);

        let _ = std::fs::remove_dir_all(&state.data_dir);
    }
}
