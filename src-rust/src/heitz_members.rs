use crate::models::HeitzMemberRecord;
use crate::rbac::{can_access_module_action, can_access_site_scope, is_admin_employee};
use crate::routes::{append_audit, err_resp, resolve_session_actor, SharedState};
use crate::seed::persist_state;
use axum::extract::{Path, State};
use axum::http::{HeaderMap, StatusCode};
use axum::Json;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use serde_json::Value;

fn normalize_club_id(raw: &str) -> Option<&'static str> {
    match raw.trim().to_lowercase().as_str() {
        "carre-de-soie" | "club-carre-soie" => Some("carre-de-soie"),
        "beynost" | "club-beynost" => Some("beynost"),
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

fn can_modify_heitz_financial_balance(
    db: &crate::models::AppDatabaseState,
    actor_id: &str,
    site_id: &str,
) -> bool {
    if !can_access_site_scope(db, actor_id, site_id) {
        return false;
    }
    if is_admin_employee(db, actor_id) {
        return true;
    }
    db.finance_authorized_employee_ids
        .iter()
        .any(|id| id == actor_id)
        || db
            .recovery_authorized_employee_ids
            .iter()
            .any(|id| id == actor_id)
        || can_access_module_action(db, actor_id, Some(site_id), "finances", "write")
        || can_access_module_action(db, actor_id, Some(site_id), "recovery", "write")
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
            let Some(cid) = normalize_club_id(&m.home_club_id) else {
                return false;
            };
            can_access_site_scope(&db, &actor_id, club_to_site_id(cid))
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
            "La liste d'adhérents à importer est vide.",
        ));
    }
    let (actor_id, active_site_id) = resolve_session_actor(&state, &headers).await?;
    let mut db = state.db.write().await;

    // État candidat : aucune mutation mémoire/disque/audit en cas de refus 400/403 ou panne disque 500.
    let mut next = db.clone();
    let mut added = 0usize;
    let mut updated = 0usize;

    for (idx, raw) in payload.members.iter().enumerate() {
        let first_name = raw.first_name.trim();
        let last_name = raw.last_name.trim();
        if first_name.is_empty() && last_name.is_empty() {
            return Err(err_resp(
                StatusCode::BAD_REQUEST,
                "Chaque adhérent doit comporter un prénom ou un nom.",
            ));
        }

        let club_id = match raw.home_club_id.as_deref() {
            Some(raw_club) if !raw_club.trim().is_empty() => {
                normalize_club_id(raw_club).ok_or_else(|| {
                    err_resp(
                        StatusCode::BAD_REQUEST,
                        format!("Club inconnu dans l'import : « {} ».", raw_club.trim()),
                    )
                })?
            }
            _ => normalize_club_id(&active_site_id).ok_or_else(|| {
                err_resp(
                    StatusCode::BAD_REQUEST,
                    "Club cible obligatoire ou invalide.",
                )
            })?,
        };
        let target_site_id = club_to_site_id(club_id);

        if !can_access_site_scope(&next, &actor_id, target_site_id) {
            return Err(err_resp(
                StatusCode::FORBIDDEN,
                format!("Accès refusé pour importer un dossier sur le club {}.", club_id),
            ));
        }

        if let Some(bal) = raw.fin_balance_eur {
            if !bal.is_finite() {
                return Err(err_resp(
                    StatusCode::BAD_REQUEST,
                    "Solde financier invalide.",
                ));
            }
        }

        let id_norm = raw
            .id
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(str::to_string);
        let badge_norm = raw
            .badge_code
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(str::to_string);
        let email_norm = raw
            .email
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(str::to_string);

        // Contrôle strict de collision inter-clubs avant toute écriture (id, badge, email).
        if let Some(existing_idx) = next.heitz_members.iter().position(|m| {
            (id_norm.is_some() && m.id.eq_ignore_ascii_case(id_norm.as_deref().unwrap_or_default()))
                || (badge_norm.is_some()
                    && m.badge_code
                        .eq_ignore_ascii_case(badge_norm.as_deref().unwrap_or_default()))
                || (email_norm.is_some()
                    && m.email
                        .as_deref()
                        .unwrap_or_default()
                        .eq_ignore_ascii_case(email_norm.as_deref().unwrap_or_default()))
                || (m.first_name.eq_ignore_ascii_case(first_name)
                    && m.last_name.eq_ignore_ascii_case(last_name)
                    && normalize_club_id(&m.home_club_id) == Some(club_id))
        }) {
            let existing_club = normalize_club_id(&next.heitz_members[existing_idx].home_club_id);
            if existing_club != Some(club_id) {
                return Err(err_resp(
                    StatusCode::FORBIDDEN,
                    "Collision inter-club refusée : cet identifiant, badge ou email appartient à un dossier d'un autre établissement.",
                ));
            }
            if !can_access_site_scope(&next, &actor_id, target_site_id) {
                return Err(err_resp(
                    StatusCode::FORBIDDEN,
                    "Accès refusé sur le dossier cible.",
                ));
            }

            if let Some(new_bal) = raw.fin_balance_eur {
                let current_bal = next.heitz_members[existing_idx].fin_balance_eur;
                if (new_bal - current_bal).abs() > f64::EPSILON
                    && !can_modify_heitz_financial_balance(&next, &actor_id, target_site_id)
                {
                    return Err(err_resp(
                        StatusCode::FORBIDDEN,
                        "Habilitation Finances ou Recouvrement requise pour modifier un solde financier.",
                    ));
                }
                next.heitz_members[existing_idx].fin_balance_eur = new_bal;
                next.heitz_members[existing_idx].fin_balance_state =
                    if new_bal < 0.0 { 0 } else { 1 };
            }

            if let Some(p) = &raw.phone {
                if !p.trim().is_empty() {
                    next.heitz_members[existing_idx].phone = p.trim().to_string();
                }
            }
            if let Some(sub) = &raw.subscription_name {
                if !sub.trim().is_empty() {
                    next.heitz_members[existing_idx].subscription_name = sub.trim().to_string();
                }
            }
            if let Some(act) = raw.active_subscription {
                next.heitz_members[existing_idx].active_subscription = act;
            }
            updated += 1;
        } else {
            let balance = raw.fin_balance_eur.unwrap_or(0.0);
            if balance.abs() > f64::EPSILON
                && !can_modify_heitz_financial_balance(&next, &actor_id, target_site_id)
            {
                return Err(err_resp(
                    StatusCode::FORBIDDEN,
                    "Habilitation Finances ou Recouvrement requise pour importer un solde financier non nul.",
                ));
            }

            let prefix = if club_id == "beynost" { "BEY" } else { "CDS" };
            let badge_code = badge_norm.unwrap_or_else(|| {
                format!(
                    "HZ-{}-{:04}",
                    prefix,
                    (2000 + next.heitz_members.len() + idx) % 10000
                )
            });
            let record = HeitzMemberRecord {
                id: id_norm.unwrap_or_else(|| {
                    format!(
                        "hm-{}-{:03}",
                        Utc::now().timestamp_millis(),
                        next.heitz_members.len() + idx + 1
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
                home_club_id: club_id.to_string(),
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
            next.heitz_members.insert(0, record);
            added += 1;
        }
    }

    let source_label = payload.source.as_deref().unwrap_or("HEITZ_CSV");
    append_audit(
        &mut next,
        &actor_id,
        "Adhérents Heitz (Projection locale)",
        format!(
            "Import projection adhérents ({source_label}) : {added} créé(s), {updated} mis à jour"
        ),
        &active_site_id,
        "heitz_members",
        None,
        Some(format!("+{added} / ~{updated}")),
    );

    persist_state(&state.data_dir, &next).map_err(|err| {
        err_resp(
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Échec de persistance de l'import : {err}"),
        )
    })?;
    *db = next;

    let items: Vec<HeitzMemberRecord> = db
        .heitz_members
        .iter()
        .filter(|m| {
            let Some(cid) = normalize_club_id(&m.home_club_id) else {
                return false;
            };
            can_access_site_scope(&db, &actor_id, club_to_site_id(cid))
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
    if payload.fin_balance_eur.is_none() && payload.active_subscription.is_none() {
        return Err(err_resp(
            StatusCode::BAD_REQUEST,
            "Aucune modification spécifiée.",
        ));
    }
    if let Some(bal) = payload.fin_balance_eur {
        if !bal.is_finite() {
            return Err(err_resp(
                StatusCode::BAD_REQUEST,
                "Solde financier invalide.",
            ));
        }
    }

    let (actor_id, _active_site) = resolve_session_actor(&state, &headers).await?;
    let mut db = state.db.write().await;

    let Some(idx) = db.heitz_members.iter().position(|m| m.id == member_id) else {
        return Err(err_resp(
            StatusCode::NOT_FOUND,
            "Adhérent introuvable.",
        ));
    };
    let Some(member_club) = normalize_club_id(&db.heitz_members[idx].home_club_id) else {
        return Err(err_resp(
            StatusCode::INTERNAL_SERVER_ERROR,
            "Club de rattachement du dossier invalide.",
        ));
    };
    let member_site = club_to_site_id(member_club);
    if !can_access_site_scope(&db, &actor_id, member_site) {
        return Err(err_resp(
            StatusCode::FORBIDDEN,
            "Accès refusé pour le club de rattachement de cet adhérent.",
        ));
    }

    if payload.fin_balance_eur.is_some()
        && !can_modify_heitz_financial_balance(&db, &actor_id, member_site)
    {
        return Err(err_resp(
            StatusCode::FORBIDDEN,
            "Accès refusé (403) : habilitation Finances ou Recouvrement requise pour modifier un solde SEPA.",
        ));
    }

    let mut next = db.clone();
    if let Some(bal) = payload.fin_balance_eur {
        next.heitz_members[idx].fin_balance_eur = bal;
        next.heitz_members[idx].fin_balance_state = if bal < 0.0 { 0 } else { 1 };
    }
    if let Some(act) = payload.active_subscription {
        next.heitz_members[idx].active_subscription = act;
    }

    let updated = next.heitz_members[idx].clone();
    append_audit(
        &mut next,
        &actor_id,
        "Adhérents Heitz (Mise à jour locale)",
        format!(
            "Mise à jour dossier {} {} ({}) : solde {:.2} €, actif={}",
            updated.first_name,
            updated.last_name,
            updated.badge_code,
            updated.fin_balance_eur,
            updated.active_subscription
        ),
        member_site,
        "heitz_members",
        None,
        Some(format!(
            "{:.2} € / actif={}",
            updated.fin_balance_eur, updated.active_subscription
        )),
    );

    persist_state(&state.data_dir, &next).map_err(|err| {
        err_resp(
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Échec de persistance du dossier adhérent : {err}"),
        )
    })?;
    *db = next;

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

    #[tokio::test]
    async fn patch_financial_balance_requires_finance_or_recovery_habilitation() {
        let state = test_state();
        let admin_headers = session_headers(&state, "emp-mario", "club-beynost").await;
        let chloe_headers = session_headers(&state, "emp-chloe", "club-beynost").await;
        let greg_headers = session_headers(&state, "emp-greg", "club-beynost").await;

        let (_, Json(import_out)) = post_heitz_members_import(
            State(state.clone()),
            admin_headers.clone(),
            Json(HeitzMemberBatchImportPayload {
                source: Some("HEITZ_CSV".into()),
                members: vec![HeitzMemberImportItem {
                    id: Some("hm-bey-fin".into()),
                    first_name: "Marc".into(),
                    last_name: "Impaye".into(),
                    phone: Some("06 22 33 44 55".into()),
                    email: Some("marc.bey@test.fr".into()),
                    badge_code: Some("HZ-BEY-7701".into()),
                    home_club_id: Some("beynost".into()),
                    subscription_name: None,
                    active_subscription: Some(true),
                    fin_balance_eur: Some(-60.0),
                    mywellness_member_id: None,
                }],
            }),
        )
        .await
        .expect("seed Beynost OK");
        assert_eq!(import_out.added, 1);

        let before_mem = serde_json::to_value(&*state.db.read().await).unwrap();

        // Commercial sans délégation Finances/Recouvrement -> 403 sur solde financier
        let err_chloe = patch_heitz_member(
            State(state.clone()),
            Path("hm-bey-fin".into()),
            chloe_headers.clone(),
            Json(HeitzMemberPatchPayload {
                fin_balance_eur: Some(0.0),
                active_subscription: None,
            }),
        )
        .await
        .unwrap_err();
        assert_eq!(err_chloe.0, StatusCode::FORBIDDEN);
        assert_eq!(serde_json::to_value(&*state.db.read().await).unwrap(), before_mem);

        // Profil habilité Recouvrement (emp-greg) -> 200 autorisé
        let Json(updated) = patch_heitz_member(
            State(state.clone()),
            Path("hm-bey-fin".into()),
            greg_headers,
            Json(HeitzMemberPatchPayload {
                fin_balance_eur: Some(0.0),
                active_subscription: None,
            }),
        )
        .await
        .expect("recouvrement autorisé");
        assert_eq!(updated.fin_balance_eur, 0.0);
        assert_eq!(updated.fin_balance_state, 1);

        // Gel d'abonnement (active_subscription=false) + persistance après redémarrage
        let Json(frozen) = patch_heitz_member(
            State(state.clone()),
            Path("hm-bey-fin".into()),
            admin_headers.clone(),
            Json(HeitzMemberPatchPayload {
                fin_balance_eur: None,
                active_subscription: Some(false),
            }),
        )
        .await
        .expect("gel persisté");
        assert!(!frozen.active_subscription);

        // Simulation panne disque 500 -> aucune mutation mémoire/disque
        let saved_mem = serde_json::to_value(&*state.db.read().await).unwrap();
        let saved_disk = std::fs::read(state.data_dir.join("cfitness_state.json")).unwrap();
        let blocker = state.data_dir.join("cfitness_state.json.tmp");
        std::fs::create_dir(&blocker).unwrap();
        let err_disk = patch_heitz_member(
            State(state.clone()),
            Path("hm-bey-fin".into()),
            admin_headers,
            Json(HeitzMemberPatchPayload {
                fin_balance_eur: None,
                active_subscription: Some(true),
            }),
        )
        .await
        .unwrap_err();
        assert_eq!(err_disk.0, StatusCode::INTERNAL_SERVER_ERROR);
        assert_eq!(serde_json::to_value(&*state.db.read().await).unwrap(), saved_mem);
        assert_eq!(std::fs::read(state.data_dir.join("cfitness_state.json")).unwrap(), saved_disk);
        std::fs::remove_dir(&blocker).unwrap();

        let reloaded = load_or_init_state(&state.data_dir);
        let found = reloaded
            .heitz_members
            .iter()
            .find(|m| m.id == "hm-bey-fin")
            .expect("dossier relu après redémarrage");
        assert_eq!(found.fin_balance_eur, 0.0);
        assert!(!found.active_subscription);

        let _ = std::fs::remove_dir_all(&state.data_dir);
    }
}
