use crate::models::HeitzMemberRecord;
use crate::rbac::{
    can_access_finances, can_access_module_action, can_access_recovery, can_access_site_scope,
    is_admin_employee, is_manager_employee,
};
use crate::routes::{append_audit, err_resp, resolve_session_actor, SharedState};
use crate::seed::persist_state;
use axum::extract::{Path, State};
use axum::http::{HeaderMap, StatusCode};
use axum::Json;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use serde_json::Value;

fn normalize_club_id(raw: &str) -> Option<String> {
    match raw.trim().to_lowercase().as_str() {
        "beynost" | "club-beynost" => Some("beynost".into()),
        "carre-de-soie" | "club-carre-soie" => Some("carre-de-soie".into()),
        _ => None,
    }
}

fn club_to_site_id(club_id: &str) -> &'static str {
    if club_id == "beynost" || club_id == "club-beynost" {
        "club-beynost"
    } else {
        "club-carre-soie"
    }
}

fn configured_web_url(raw: Option<String>) -> Option<String> {
    let value = raw?.trim().to_string();
    let rest = value.strip_prefix("https://").or_else(|| value.strip_prefix("http://"))?;
    let authority = rest.split(|c| matches!(c, '/' | '?' | '#')).next()?;
    if authority.is_empty() || authority.contains('@')
        || value.chars().any(|c| c.is_whitespace() || c.is_control() || c == '\\') {
        return None;
    }
    Some(value)
}

pub async fn get_heitz_integration(
    State(state): State<SharedState>, headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let (actor_id, _) = resolve_session_actor(&state, &headers).await?;
    let db = state.db.read().await;
    let mut urls = serde_json::Map::new();
    for (club, var) in [("carre-de-soie", "CFITNESS_HEITZ_WEB_URL_CDS"), ("beynost", "CFITNESS_HEITZ_WEB_URL_BEY")] {
        if can_access_site_scope(&db, &actor_id, club_to_site_id(club)) {
            urls.insert(club.into(), serde_json::json!(if crate::heitz_live::heitz_demo_offline() { None } else { configured_web_url(std::env::var(var).ok()) }));
        }
    }
    let live_configured = crate::heitz_live::is_heitz_live_configured();
    Ok(Json(serde_json::json!({
        "webUrls": urls,
        "apiWritesAvailable": false,
        "liveReadEnabled": live_configured,
        "snapshotImportEnabled": true,
        "mode": if live_configured { "live_read_and_snapshot" } else { "web_only" },
        "canImportSnapshot": is_admin_employee(&db, &actor_id),
        "liveConfigured": live_configured,
        "centerIds": {
            "carre-de-soie": crate::heitz_live::heitz_center_id_cds(),
            "beynost": crate::heitz_live::heitz_center_id_bey(),
        }
    })))
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
        .filter_map(|m| {
            let club = normalize_club_id(&m.home_club_id)?;
            let site = club_to_site_id(&club);
            if !can_access_site_scope(&db, &actor_id, site) {
                return None;
            }
            let can_see_financial_balance = is_admin_employee(&db, &actor_id)
                || is_manager_employee(&db, &actor_id, Some(site))
                || can_access_finances(&db, &actor_id, Some(site))
                || can_access_recovery(&db, &actor_id, Some(site));
            let mut sanitized = m.clone();
            if !can_see_financial_balance {
                // RGPD Art. 5.1.c (Minimisation) & Art. 32 (Besoin d'en connaître) :
                // un collaborateur non habilité Finances/Recouvrement conserve uniquement
                // l'indicateur binaire fin_balance_state (1 = à jour, 0 = vérification accueil requise),
                // sans exposition du montant monétaire exact de la dette.
                sanitized.fin_balance_eur = 0.0;
            }
            Some(sanitized)
        })
        .collect();
    Ok(Json(rows))
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
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
#[serde(rename_all = "camelCase", deny_unknown_fields)]
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
    let (actor_id, active_site_id) = resolve_session_actor(&state, &headers).await?;
    let mut db = state.db.write().await;
    if !is_admin_employee(&db, &actor_id) {
        return Err(err_resp(StatusCode::FORBIDDEN, "L’import d’un export Heitz est réservé à la direction."));
    }
    if payload.source.as_deref().unwrap_or("HEITZ_CSV") != "HEITZ_CSV" {
        return Err(err_resp(StatusCode::BAD_REQUEST, "Seul un export CSV Heitz peut alimenter cette copie de consultation."));
    }
    if payload.members.is_empty() || payload.members.len() > 5000 {
        return Err(err_resp(StatusCode::BAD_REQUEST, "L’export doit contenir entre 1 et 5 000 dossiers."));
    }
    let mut next = db.clone();
    let mut added = 0;
    let mut updated = 0;
    for raw in &payload.members {
        let club = normalize_club_id(raw.home_club_id.as_deref().unwrap_or(&active_site_id))
            .ok_or_else(|| err_resp(StatusCode::BAD_REQUEST, "Club d’import inconnu."))?;
        if !can_access_site_scope(&db, &actor_id, club_to_site_id(&club)) {
            return Err(err_resp(StatusCode::FORBIDDEN, "Import non autorisé pour ce club."));
        }
        let id = raw.id.as_deref().map(str::trim).filter(|v| !v.is_empty());
        let badge = raw.badge_code.as_deref().map(str::trim).filter(|v| !v.is_empty());
        if raw.first_name.trim().is_empty() || raw.last_name.trim().is_empty()
            || raw.first_name.len() > 256 || raw.last_name.len() > 256 || (id.is_none() && badge.is_none())
            || id.is_some_and(|v| v.len() > 256) || badge.is_some_and(|v| v.len() > 256)
            || raw.fin_balance_eur.is_some_and(|v| !v.is_finite()) {
            return Err(err_resp(StatusCode::BAD_REQUEST, "Chaque dossier exige un nom, un prénom et un identifiant ou badge Heitz valide."));
        }
        // Only source ID and badge identify a member; email/name are not unique.
        let matches: Vec<usize> = next.heitz_members.iter().enumerate().filter_map(|(i, m)| {
            (id.is_some_and(|v| v == m.id) || badge.is_some_and(|v| v.eq_ignore_ascii_case(&m.badge_code))).then_some(i)
        }).collect();
        if matches.len() > 1 {
            return Err(err_resp(StatusCode::CONFLICT, "Identifiant et badge correspondent à des dossiers différents. Import annulé."));
        }
        if let Some(&index) = matches.first() {
            if normalize_club_id(&next.heitz_members[index].home_club_id).as_deref() != Some(club.as_str()) {
                return Err(err_resp(StatusCode::CONFLICT, "Identifiant ou badge appartenant à un autre club. Aucun dossier modifié."));
            }
            let m = &mut next.heitz_members[index];
            m.first_name = raw.first_name.trim().into(); m.last_name = raw.last_name.trim().into();
            if let Some(v) = &raw.phone { m.phone = v.trim().into(); }
            if let Some(v) = &raw.email { m.email = Some(v.trim().into()); }
            if let Some(v) = &raw.subscription_name { m.subscription_name = v.trim().into(); }
            if let Some(v) = raw.active_subscription { m.active_subscription = v; }
            if let Some(v) = raw.fin_balance_eur { m.fin_balance_eur = v; m.fin_balance_state = if v < 0.0 { 0 } else { 1 }; }
            updated += 1;
        } else {
            let new_id = id.map(str::to_string).unwrap_or_else(|| format!("heitz-import-{}-{}", Utc::now().timestamp_nanos_opt().unwrap_or_default(), next.heitz_members.len()));
            let balance = raw.fin_balance_eur.unwrap_or(0.0);
            next.heitz_members.push(HeitzMemberRecord {
                id: new_id, badge_code: badge.unwrap_or("").into(), rfid_bluetooth_enabled: false,
                mywellness_member_id: raw.mywellness_member_id.clone(), first_name: raw.first_name.trim().into(),
                last_name: raw.last_name.trim().into(), phone: raw.phone.clone().unwrap_or_default(),
                email: raw.email.clone(), home_club_id: club,
                subscription_name: raw.subscription_name.clone().unwrap_or_else(|| "Non renseigné".into()),
                active_subscription: raw.active_subscription.unwrap_or(false), fin_balance_eur: balance,
                fin_balance_state: if balance < 0.0 { 0 } else { 1 }, technogym_moves30d: 0,
                days_since_last_workout: 0, loyalty_points: 0, referrals_count: 0, last_reward_label: None,
                data_source: Some("CSV Import".into()), last_synced_at_utc: None,
                last_workout_known: Some(false), loyalty_points_known: Some(false),
            }); added += 1;
        }
    }
    append_audit(&mut next, &actor_id, "Copie de consultation Heitz",
        format!("Export CSV importé : {added} dossier(s) ajouté(s), {updated} actualisé(s). Aucune écriture dans Heitz."),
        &active_site_id, "heitz_members", None, None);
    persist_state(&state.data_dir, &next).map_err(|_| err_resp(StatusCode::INTERNAL_SERVER_ERROR,
        "L’export n’a pas été enregistré. Aucun dossier modifié ; vous pouvez réessayer."))?;
    let items = next.heitz_members.iter().filter(|m| normalize_club_id(&m.home_club_id)
        .is_some_and(|club| can_access_site_scope(&next, &actor_id, club_to_site_id(&club)))).cloned().collect();
    *db = next;
    Ok((StatusCode::CREATED, Json(HeitzMemberBatchImportResponse { added, updated, total_processed: payload.members.len(), items })))
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
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
    let (actor_id, _) = resolve_session_actor(&state, &headers).await?;
    let db = state.db.read().await;
    let member = db.heitz_members.iter().find(|m| m.id == member_id)
        .ok_or_else(|| err_resp(StatusCode::NOT_FOUND, "Adhérent introuvable."))?;
    let club = normalize_club_id(&member.home_club_id)
        .ok_or_else(|| err_resp(StatusCode::CONFLICT, "Club du dossier invalide."))?;
    let site = club_to_site_id(&club);
    if !can_access_site_scope(&db, &actor_id, site)
        || (payload.fin_balance_eur.is_some()
            && !can_access_module_action(&db, &actor_id, Some(site), "finances", "write")
            && !can_access_module_action(&db, &actor_id, Some(site), "recovery", "write"))
        || (payload.active_subscription.is_some() && !is_manager_employee(&db, &actor_id, Some(site))) {
        return Err(err_resp(StatusCode::FORBIDDEN, "Opération non autorisée pour ce club et votre rôle."));
    }
    Err(err_resp(StatusCode::CONFLICT, "Cette opération doit être réalisée dans HeitzSystem. Aucun connecteur API d’écriture vérifié n’est configuré."))
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

    fn row(club: &str, badge: &str) -> HeitzMemberImportItem {
        serde_json::from_value(serde_json::json!({
            "firstName": "Recette", "lastName": "Fictive", "badgeCode": badge,
            "homeClubId": club, "finBalanceEur": -40.0, "activeSubscription": true
        })).unwrap()
    }
    fn batch(rows: Vec<HeitzMemberImportItem>) -> HeitzMemberBatchImportPayload {
        HeitzMemberBatchImportPayload { source: Some("HEITZ_CSV".into()), members: rows }
    }

    #[tokio::test]
    async fn heitz_snapshots_persist_and_writes_require_heitz() {
        let state = test_state();
        let headers = session_headers(&state, "emp-mario", "club-carre-soie").await;
        let (_, Json(result)) = post_heitz_members_import(State(state.clone()), headers.clone(),
            Json(batch(vec![row("carre-de-soie", "AUDIT-CDS"), row("beynost", "AUDIT-BEY")]))).await.unwrap();
        assert_eq!(result.added, 2);
        let member = result.items.iter().find(|m| m.badge_code == "AUDIT-CDS").unwrap();
        assert!(!member.rfid_bluetooth_enabled, "An import does not activate a physical badge");
        let before = serde_json::to_value(&*state.db.read().await).unwrap();
        let status = patch_heitz_member(State(state.clone()), Path(member.id.clone()), headers,
            Json(HeitzMemberPatchPayload { fin_balance_eur: Some(0.0), active_subscription: None })).await.unwrap_err().0;
        assert_eq!(status, StatusCode::CONFLICT);
        assert_eq!(serde_json::to_value(&*state.db.read().await).unwrap(), before);
        let persisted = load_or_init_state(&state.data_dir);
        assert_eq!(persisted.heitz_members.iter().find(|m| m.id == member.id).unwrap().fin_balance_eur, -40.0);
        let _ = std::fs::remove_dir_all(&state.data_dir);
    }

    #[tokio::test]
    async fn heitz_import_conflicts_invalid_clubs_and_partial_batches_do_not_mutate() {
        let state = test_state();
        let headers = session_headers(&state, "emp-mario", "club-carre-soie").await;
        let _ = post_heitz_members_import(State(state.clone()), headers.clone(),
            Json(batch(vec![row("carre-de-soie", "COLLISION")]))).await.unwrap();
        let before = serde_json::to_value(&*state.db.read().await).unwrap();
        let disk = std::fs::read(state.data_dir.join("cfitness_state.json")).unwrap();
        for (payload, expected) in [
            (batch(vec![row("carre-de-soie", "NEW-ROLLBACK"), row("unknown-club", "INVALID")]), StatusCode::BAD_REQUEST),
            (batch(vec![row("carre-de-soie", "NEW-ROLLBACK"), row("beynost", "COLLISION")]), StatusCode::CONFLICT),
        ] {
            assert_eq!(post_heitz_members_import(State(state.clone()), headers.clone(), Json(payload)).await.unwrap_err().0, expected);
            assert_eq!(serde_json::to_value(&*state.db.read().await).unwrap(), before);
            assert_eq!(std::fs::read(state.data_dir.join("cfitness_state.json")).unwrap(), disk);
        }
        std::fs::create_dir(state.data_dir.join("cfitness_state.json.tmp")).unwrap();
        assert_eq!(post_heitz_members_import(State(state.clone()), headers,
            Json(batch(vec![row("carre-de-soie", "DISK-FAILED")]))).await.unwrap_err().0, StatusCode::INTERNAL_SERVER_ERROR);
        assert_eq!(serde_json::to_value(&*state.db.read().await).unwrap(), before);
        assert_eq!(std::fs::read(state.data_dir.join("cfitness_state.json")).unwrap(), disk);
        let _ = std::fs::remove_dir_all(&state.data_dir);
    }

    #[tokio::test]
    async fn heitz_commercial_cannot_import_or_modify_balances_and_stays_in_own_club() {
        let state = test_state();
        let admin = session_headers(&state, "emp-mario", "club-carre-soie").await;
        let commercial = session_headers(&state, "emp-chloe", "club-beynost").await;
        let (_, Json(result)) = post_heitz_members_import(State(state.clone()), admin,
            Json(batch(vec![row("carre-de-soie", "PRIVATE-CDS"), row("beynost", "VISIBLE-BEY")]))).await.unwrap();
        let before = serde_json::to_value(&*state.db.read().await).unwrap();
        let Json(visible) = get_heitz_members(State(state.clone()), commercial.clone()).await.unwrap();
        assert!(visible.iter().all(|m| m.home_club_id == "beynost"));
        let imported_bey = visible.iter().find(|m| m.badge_code == "VISIBLE-BEY").unwrap();
        assert_eq!(imported_bey.fin_balance_eur, 0.0, "RGPD: exact debt amount is redacted for commercial without recovery/finance delegation");
        assert_eq!(imported_bey.fin_balance_state, 0, "RGPD: binary indicator of verification required is preserved");
        assert_eq!(post_heitz_members_import(State(state.clone()), commercial.clone(),
            Json(batch(vec![row("beynost", "PRIVATE-CDS")]))).await.unwrap_err().0, StatusCode::FORBIDDEN);
        for badge in ["PRIVATE-CDS", "VISIBLE-BEY"] {
            let member = result.items.iter().find(|m| m.badge_code == badge).unwrap();
            assert_eq!(patch_heitz_member(State(state.clone()), Path(member.id.clone()), commercial.clone(),
                Json(HeitzMemberPatchPayload { fin_balance_eur: Some(0.0), active_subscription: Some(false) })).await.unwrap_err().0,
                StatusCode::FORBIDDEN);
        }
        let Json(integration) = get_heitz_integration(State(state.clone()), commercial).await.unwrap();
        assert_eq!(integration["apiWritesAvailable"], false);
        assert_eq!(integration["canImportSnapshot"], false);
        assert!(integration["webUrls"].get("carre-de-soie").is_none());
        assert_eq!(serde_json::to_value(&*state.db.read().await).unwrap(), before);
        let _ = std::fs::remove_dir_all(&state.data_dir);
    }

    #[test]
    fn heitz_links_reject_executable_urls_credentials_and_controls() {
        for url in ["javascript:alert(1)", "https://user:secret@example.test", "https://example.test/ bad", "https://"] {
            assert!(configured_web_url(Some(url.into())).is_none());
        }
        assert!(configured_web_url(Some("https://heitz.example.test/login#/app".into())).is_some());
    }
    #[tokio::test]
    async fn import_rejects_unknown_club_and_cross_club_collision_without_mutation() {
        let state = test_state();
        let admin_headers = session_headers(&state, "emp-mario", "club-carre-soie").await;
        let chloe_headers = session_headers(&state, "emp-chloe", "club-beynost").await;

        // 1. Seed d'un dossier Carré de Soie par l'admin
        let (st, _) = post_heitz_members_import(
            State(state.clone()),
            admin_headers.clone(),
            Json(HeitzMemberBatchImportPayload {
                source: Some("HEITZ_CSV".into()),
                members: vec![HeitzMemberImportItem {
                    id: Some("hm-cds-1".into()),
                    first_name: "Claire".into(),
                    last_name: "Martin".into(),
                    phone: Some("06 11 22 33 44".into()),
                    email: Some("claire.cds@test.fr".into()),
                    badge_code: Some("HZ-CDS-9901".into()),
                    home_club_id: Some("carre-de-soie".into()),
                    subscription_name: None,
                    active_subscription: Some(true),
                    fin_balance_eur: Some(-49.90),
                    mywellness_member_id: None,
                }],
            }),
        )
        .await
        .expect("seed CDS OK");
        assert_eq!(st, StatusCode::CREATED);

        let before_mem = serde_json::to_value(&*state.db.read().await).unwrap();
        let before_disk = std::fs::read(state.data_dir.join("cfitness_state.json")).unwrap();

        // 2. Club inconnu refusé (400) sans mutation
        let err_unknown = post_heitz_members_import(
            State(state.clone()),
            admin_headers.clone(),
            Json(HeitzMemberBatchImportPayload {
                source: Some("HEITZ_CSV".into()),
                members: vec![HeitzMemberImportItem {
                    id: None,
                    first_name: "Paul".into(),
                    last_name: "Inconnu".into(),
                    phone: None,
                    email: None,
                    badge_code: Some("HZ-UNK-0001".into()),
                    home_club_id: Some("club-inexistant".into()),
                    subscription_name: None,
                    active_subscription: Some(true),
                    fin_balance_eur: Some(0.0),
                    mywellness_member_id: None,
                }],
            }),
        )
        .await
        .unwrap_err();
        assert_eq!(err_unknown.0, StatusCode::BAD_REQUEST);
        assert_eq!(serde_json::to_value(&*state.db.read().await).unwrap(), before_mem);
        assert_eq!(std::fs::read(state.data_dir.join("cfitness_state.json")).unwrap(), before_disk);

        // 3. Commercial mono-club Beynost tentant de modifier le dossier CDS via collision badge/email/id -> 403 sans mutation
        for (id_opt, badge_opt, email_opt) in [
            (None, Some("HZ-CDS-9901".to_string()), None),
            (None, None, Some("claire.cds@test.fr".to_string())),
            (Some("hm-cds-1".to_string()), None, None),
        ] {
            let err_cross = post_heitz_members_import(
                State(state.clone()),
                chloe_headers.clone(),
                Json(HeitzMemberBatchImportPayload {
                    source: Some("HEITZ_CSV".into()),
                    members: vec![HeitzMemberImportItem {
                        id: id_opt,
                        first_name: "Claire".into(),
                        last_name: "Martin".into(),
                        phone: None,
                        email: email_opt,
                        badge_code: badge_opt,
                        home_club_id: Some("beynost".into()),
                        subscription_name: None,
                        active_subscription: Some(true),
                        fin_balance_eur: Some(0.0),
                        mywellness_member_id: None,
                    }],
                }),
            )
            .await
            .unwrap_err();
            assert_eq!(err_cross.0, StatusCode::FORBIDDEN);
            assert_eq!(serde_json::to_value(&*state.db.read().await).unwrap(), before_mem);
            assert_eq!(std::fs::read(state.data_dir.join("cfitness_state.json")).unwrap(), before_disk);
        }

        let _ = std::fs::remove_dir_all(&state.data_dir);
    }

}
