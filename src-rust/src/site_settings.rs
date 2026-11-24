use crate::models::{Site, SiteKpis};
use crate::rbac::{
    can_access_finances, can_access_reports, evaluate_permission, is_admin_employee,
    normalize_site_id, is_owner_or_super_admin,
};
use crate::routes::{
    append_audit, authorized_clubs_for_actor, err_resp, resolve_session_actor, SharedState,
};
use crate::seed::persist_state;
use axum::extract::{Path, State};
use axum::http::{header, HeaderMap, HeaderValue, StatusCode};
use axum::response::IntoResponse;
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

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct UpdateSiteKpisPayload {
    pub period_label: Option<String>,
    pub revenue_eur: Option<f64>,
    pub payroll_mass_eur: Option<f64>,
    pub worked_hours: Option<f64>,
    pub productivity_per_hour: Option<f64>,
    pub retention_rate_pct: Option<f64>,
    pub monthly_target_eur: Option<f64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum BadgeFrequency {
    EachShift,
    ConsecutiveShiftSeries,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct UpdateTimeclockSettingsPayload {
    pub badge_frequency: BadgeFrequency,
    pub tablet_break_badging: bool,
}

pub async fn put_site_timeclock_settings(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Path(raw_site_id): Path<String>,
    Json(patch): Json<UpdateTimeclockSettingsPayload>,
) -> Result<Json<Site>, (StatusCode, Json<Value>)> {
    if !headers.get("authorization").and_then(|v| v.to_str().ok())
        .is_some_and(|v| v.starts_with("Bearer ")) {
        return Err(err_resp(StatusCode::UNAUTHORIZED,
            "Connectez-vous pour modifier les réglages de badgeuse."));
    }
    let (actor_id, _) = resolve_session_actor(&state, &headers).await?;
    let target = normalize_site_id(&raw_site_id);
    let mut db = state.db.write().await;
    let index = db.sites.iter().position(|s| s.id == target)
        .ok_or_else(|| err_resp(StatusCode::NOT_FOUND, "Établissement introuvable."))?;
    // Generic organisation permissions must not grant badgeuse administration.
    if !is_owner_or_super_admin(&db, &actor_id, &target) {
        return Err(err_resp(StatusCode::FORBIDDEN,
            "Les réglages de badgeuse sont réservés au propriétaire ou super administrateur de ce club."));
    }
    let mut next = db.clone();
    next.sites[index].settings.badge_frequency = match patch.badge_frequency {
        BadgeFrequency::EachShift => "each_shift",
        BadgeFrequency::ConsecutiveShiftSeries => "consecutive_shift_series",
    }.into();
    next.sites[index].settings.tablet_break_badging = patch.tablet_break_badging;
    let updated = next.sites[index].clone();
    append_audit(&mut next, &actor_id, "Règles de badgeage",
        format!("Mise à jour des règles de badgeage de {}", updated.name),
        &target, &target, None, None);
    persist_state(&state.data_dir, &next).map_err(|_| err_resp(
        StatusCode::INTERNAL_SERVER_ERROR,
        "Les règles de badgeage n’ont pas été enregistrées. Réessayez."))?;
    *db = next;
    Ok(Json(updated))
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
    let (actor_id, _active_site) = resolve_session_actor(&state, &headers).await?;
    let mut db = state.db.write().await;

    let target_site_id = normalize_site_id(&raw_site_id);
    let allowed = crate::rbac::is_owner_or_super_admin(&db, &actor_id, &target_site_id)
        || crate::hr_organisation::site_permission(&db,&actor_id,&target_site_id,"ORG04-32");
    if !allowed {
        return Err(err_resp(StatusCode::FORBIDDEN, "Modification des paramètres non autorisée sur ce club."));
    }

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

pub async fn get_admin_kpis(
    State(state): State<SharedState>,
    headers: HeaderMap,
) -> Result<Json<Vec<SiteKpis>>, (StatusCode, Json<Value>)> {
    let (actor_id, site_id) = resolve_session_actor(&state, &headers).await?;
    let db = state.db.read().await;
    let allowed = is_admin_employee(&db, &actor_id)
        || can_access_finances(&db, &actor_id, Some(&site_id));
    if !allowed {
        return Err(err_resp(
            StatusCode::FORBIDDEN,
            "Accès refusé (403) : consultation des KPIs financiers réservée à la Direction ou délégation Finances.",
        ));
    }
    Ok(Json(db.kpis.clone()))
}

pub async fn put_admin_site_kpis(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Path(raw_site_id): Path<String>,
    Json(patch): Json<UpdateSiteKpisPayload>,
) -> Result<Json<SiteKpis>, (StatusCode, Json<Value>)> {
    let (actor_id, _active_site) = resolve_session_actor(&state, &headers).await?;
    let target_site_id = normalize_site_id(&raw_site_id);
    if target_site_id != "club-carre-soie" && target_site_id != "club-beynost" {
        return Err(err_resp(
            StatusCode::BAD_REQUEST,
            format!("Établissement KPI invalide : {}", raw_site_id),
        ));
    }

    let mut db = state.db.write().await;
    let allowed = is_admin_employee(&db, &actor_id)
        || can_access_finances(&db, &actor_id, Some(&target_site_id));
    if !allowed {
        return Err(err_resp(
            StatusCode::FORBIDDEN,
            "Accès refusé (403) : modification des KPIs financiers réservée à la Direction ou délégation Finances.",
        ));
    }

    for (label, val) in [
        ("Chiffre d'affaires", patch.revenue_eur),
        ("Masse salariale", patch.payroll_mass_eur),
        ("Heures travaillées", patch.worked_hours),
        ("Productivité horaire", patch.productivity_per_hour),
        ("Taux de rétention", patch.retention_rate_pct),
        ("Objectif mensuel", patch.monthly_target_eur),
    ] {
        if let Some(v) = val {
            if !v.is_finite() || v < 0.0 {
                return Err(err_resp(
                    StatusCode::BAD_REQUEST,
                    format!("Valeur invalide pour « {} » (doit être >= 0).", label),
                ));
            }
        }
    }
    if let Some(ret) = patch.retention_rate_pct {
        if ret > 100.0 {
            return Err(err_resp(
                StatusCode::BAD_REQUEST,
                "Le taux de rétention doit être compris entre 0 et 100 %.",
            ));
        }
    }

    let snapshot = db.clone();
    let existing_pos = db.kpis.iter().position(|k| k.site_id == target_site_id);
    let updated = if let Some(idx) = existing_pos {
        if let Some(ref period) = patch.period_label {
            if !period.trim().is_empty() {
                db.kpis[idx].period_label = period.trim().to_string();
            }
        }
        if patch.revenue_eur.is_some() {
            db.kpis[idx].revenue_eur = patch.revenue_eur;
        }
        if patch.payroll_mass_eur.is_some() {
            db.kpis[idx].payroll_mass_eur = patch.payroll_mass_eur;
        }
        if patch.worked_hours.is_some() {
            db.kpis[idx].worked_hours = patch.worked_hours;
        }
        if patch.retention_rate_pct.is_some() {
            db.kpis[idx].retention_rate_pct = patch.retention_rate_pct;
        }
        if patch.monthly_target_eur.is_some() {
            db.kpis[idx].monthly_target_eur = patch.monthly_target_eur;
        }
        if patch.productivity_per_hour.is_some() {
            db.kpis[idx].productivity_per_hour = patch.productivity_per_hour;
        } else if let (Some(rev), Some(hours)) = (db.kpis[idx].revenue_eur, db.kpis[idx].worked_hours) {
            if hours > 0.0 {
                db.kpis[idx].productivity_per_hour = Some(((rev / hours) * 100.0).round() / 100.0);
            }
        }
        db.kpis[idx].clone()
    } else {
        let rev = patch.revenue_eur;
        let hours = patch.worked_hours;
        let prod = patch.productivity_per_hour.or_else(|| match (rev, hours) {
            (Some(r), Some(h)) if h > 0.0 => Some(((r / h) * 100.0).round() / 100.0),
            _ => None,
        });
        let created = SiteKpis {
            site_id: target_site_id.clone(),
            period_label: patch
                .period_label
                .as_deref()
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .unwrap_or("Mois en cours")
                .to_string(),
            revenue_eur: rev,
            productivity_per_hour: prod,
            payroll_mass_eur: patch.payroll_mass_eur,
            worked_hours: hours,
            retention_rate_pct: patch.retention_rate_pct,
            monthly_target_eur: patch.monthly_target_eur,
        };
        db.kpis.push(created.clone());
        created
    };

    append_audit(
        &mut db,
        &actor_id,
        "Finances & KPIs (Mise à jour)",
        format!(
            "Mise à jour KPIs {} ({}) : CA={:?} €, Masse salariale={:?} €",
            target_site_id, updated.period_label, updated.revenue_eur, updated.payroll_mass_eur
        ),
        &target_site_id,
        "kpis",
        None,
        Some(format!("CA={:?}", updated.revenue_eur)),
    );

    if let Err(err_msg) = persist_state(&state.data_dir, &db) {
        *db = snapshot;
        return Err(err_resp(
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Échec de persistance des KPIs du club : {}", err_msg),
        ));
    }

    Ok(Json(updated))
}

pub async fn get_reports_export_csv(
    State(state): State<SharedState>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, (StatusCode, Json<Value>)> {
    let (actor_id, site_id) = resolve_session_actor(&state, &headers).await?;
    let db = state.db.read().await;
    let allowed = is_admin_employee(&db, &actor_id)
        || can_access_reports(&db, &actor_id, Some(&site_id))
        || can_access_finances(&db, &actor_id, Some(&site_id));
    if !allowed {
        return Err(err_resp(
            StatusCode::FORBIDDEN,
            "Accès refusé (403) : export des rapports réservé à la Direction ou habilitation Rapports/Finances.",
        ));
    }

    let authorized = authorized_clubs_for_actor(&db, &actor_id);
    let mut csv = String::from("\u{FEFF}Club;Code Site;Période;CA HT (EUR);Objectif Mensuel (EUR);Masse Salariale (EUR);Taux Rétention (%);Heures Travaillées;Productivité (EUR/h);Collaborateurs Actifs;Anomalies Pointage;Articles Stock Critique;Tickets SAV Ouverts;Dossiers Recouvrement\r\n");

    for site in &db.sites {
        let club_slug = if site.id == "club-beynost" {
            "beynost"
        } else {
            "carre-de-soie"
        };
        if !authorized.contains(club_slug) {
            continue;
        }
        let kpi = db.kpis.iter().find(|k| k.site_id == site.id);
        let period = kpi
            .map(|k| k.period_label.as_str())
            .unwrap_or("Mois en cours");
        let rev = kpi
            .and_then(|k| k.revenue_eur)
            .map(|v| format!("{v:.2}"))
            .unwrap_or_default();
        let target = kpi
            .and_then(|k| k.monthly_target_eur)
            .map(|v| format!("{v:.2}"))
            .unwrap_or_default();
        let payroll = kpi
            .and_then(|k| k.payroll_mass_eur)
            .map(|v| format!("{v:.2}"))
            .unwrap_or_default();
        let retention = kpi
            .and_then(|k| k.retention_rate_pct)
            .map(|v| format!("{v:.1}"))
            .unwrap_or_default();
        let hours = kpi
            .and_then(|k| k.worked_hours)
            .map(|v| format!("{v:.1}"))
            .unwrap_or_default();
        let prod = kpi
            .and_then(|k| k.productivity_per_hour)
            .map(|v| format!("{v:.2}"))
            .unwrap_or_default();

        let active_emps = db
            .employees
            .iter()
            .filter(|e| e.active && e.site_accesses.iter().any(|sa| sa.site_id == site.id))
            .count();
        let open_anomalies = db
            .anomalies
            .iter()
            .filter(|a| a.site_id == site.id && a.status == "to_review")
            .count();
        let low_stocks = db
            .stock_items
            .iter()
            .filter(|s| s.club_id == club_slug && s.current_qty < s.min_threshold)
            .count();
        let open_tickets = db
            .maintenance_tickets
            .iter()
            .filter(|t| t.club_id == club_slug && t.status != "Résolu")
            .count();
        let open_recovery = db
            .recovery_cases
            .iter()
            .filter(|c| c.club_id == club_slug && c.status != "regularised")
            .count();

        csv.push_str(&format!(
            "{};{};{};{};{};{};{};{};{};{};{};{};{};{}\r\n",
            site.name.replace(';', ","),
            site.id,
            period.replace(';', ","),
            rev,
            target,
            payroll,
            retention,
            hours,
            prod,
            active_emps,
            open_anomalies,
            low_stocks,
            open_tickets,
            open_recovery
        ));
    }

    let mut resp_headers = HeaderMap::new();
    resp_headers.insert(
        header::CONTENT_TYPE,
        HeaderValue::from_static("text/csv; charset=utf-8"),
    );
    resp_headers.insert(
        header::CONTENT_DISPOSITION,
        HeaderValue::from_static("attachment; filename=\"RAPPORT_DIRECTION_CFITNESS.csv\""),
    );
    Ok((resp_headers, csv))
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
    async fn timeclock_settings_persist_by_club_and_rollback_on_disk_failure() {
        let state = test_state();
        let headers = session_headers(&state, "emp-mario", "club-carre-soie").await;
        let before = serde_json::to_value(&*state.db.read().await).unwrap();
        let payload = || UpdateTimeclockSettingsPayload {
            badge_frequency: BadgeFrequency::ConsecutiveShiftSeries,
            tablet_break_badging: true,
        };
        let Json(saved) = put_site_timeclock_settings(State(state.clone()), headers.clone(),
            Path("carre-de-soie".into()), Json(payload())).await.unwrap();
        assert_eq!(saved.settings.badge_frequency, "consecutive_shift_series");
        assert!(saved.settings.tablet_break_badging);
        let reloaded = load_or_init_state(&state.data_dir);
        let cds = reloaded.sites.iter().find(|site| site.id == "club-carre-soie").unwrap();
        assert!(cds.settings.tablet_break_badging);
        assert_eq!(serde_json::to_value(reloaded.sites.iter().find(|s| s.id == "club-beynost").unwrap()).unwrap(),
            before["sites"].as_array().unwrap().iter().find(|s| s["id"] == "club-beynost").unwrap().clone());
        let saved_memory = serde_json::to_value(&*state.db.read().await).unwrap();
        let saved_disk = std::fs::read(state.data_dir.join("cfitness_state.json")).unwrap();
        std::fs::create_dir(state.data_dir.join("cfitness_state.json.tmp")).unwrap();
        let error = put_site_timeclock_settings(State(state.clone()), headers,
            Path("beynost".into()), Json(payload())).await.unwrap_err();
        assert_eq!(error.0, StatusCode::INTERNAL_SERVER_ERROR);
        assert_eq!(serde_json::to_value(&*state.db.read().await).unwrap(), saved_memory);
        assert_eq!(std::fs::read(state.data_dir.join("cfitness_state.json")).unwrap(), saved_disk);
        let _ = std::fs::remove_dir_all(&state.data_dir);
    }

    #[tokio::test]
    async fn timeclock_permissions_follow_the_target_club_not_the_active_club() {
        let state = test_state();
        // Master at CDS, read-only at Beynost in the reference fixture.
        let headers = session_headers(&state, "emp-master", "club-carre-soie").await;
        let payload = || UpdateTimeclockSettingsPayload {
            badge_frequency: BadgeFrequency::EachShift,
            tablet_break_badging: true,
        };
        // A Master with the generic organisation rights may not edit badgeuses.
        let before = serde_json::to_value(&*state.db.read().await).unwrap();
        assert_eq!(put_site_timeclock_settings(State(state.clone()), headers.clone(),
            Path("club-carre-soie".into()), Json(payload())).await.unwrap_err().0, StatusCode::FORBIDDEN);
        assert_eq!(serde_json::to_value(&*state.db.read().await).unwrap(), before);
        // Owner/superadmin on one club does not grant rights on the other club.
        {
            let mut db = state.db.write().await;
            db.employees.iter_mut().find(|e| e.id == "emp-master").unwrap()
                .site_accesses.iter_mut().find(|a| a.site_id == "club-carre-soie").unwrap()
                .profile_id = "admin_systeme".into();
        }
        let _ = put_site_timeclock_settings(State(state.clone()), headers.clone(),
            Path("club-carre-soie".into()), Json(payload())).await.unwrap();
        let before = serde_json::to_value(&*state.db.read().await).unwrap();
        assert_eq!(put_site_timeclock_settings(State(state.clone()), headers,
            Path("club-beynost".into()), Json(payload())).await.unwrap_err().0, StatusCode::FORBIDDEN);
        assert_eq!(serde_json::to_value(&*state.db.read().await).unwrap(), before);
        let _ = std::fs::remove_dir_all(&state.data_dir);
    }

    #[tokio::test]
    async fn timeclock_settings_reject_read_only_and_cross_club_edits() {
        let state = test_state();
        let payload = || UpdateTimeclockSettingsPayload {
            badge_frequency: BadgeFrequency::EachShift,
            tablet_break_badging: false,
        };
        let mut forged = HeaderMap::new();
        forged.insert("x-cfitness-actor-id", HeaderValue::from_static("emp-mario"));
        assert_eq!(put_site_timeclock_settings(State(state.clone()), forged,
            Path("club-carre-soie".into()), Json(payload())).await.unwrap_err().0, StatusCode::UNAUTHORIZED);
        let before = serde_json::to_value(&*state.db.read().await).unwrap();
        for actor in ["emp-maxime", "emp-chloe"] {
            let headers = session_headers(&state, actor, "club-carre-soie").await;
            for club in ["club-carre-soie", "club-beynost"] {
                assert_eq!(put_site_timeclock_settings(State(state.clone()), headers.clone(),
                    Path(club.into()), Json(payload())).await.unwrap_err().0, StatusCode::FORBIDDEN);
            }
        }
        let headers = session_headers(&state, "emp-mario", "club-carre-soie").await;
        assert_eq!(put_site_timeclock_settings(State(state.clone()), headers,
            Path("inconnu".into()), Json(payload())).await.unwrap_err().0, StatusCode::NOT_FOUND);
        assert_eq!(serde_json::to_value(&*state.db.read().await).unwrap(), before);
        assert!(serde_json::from_value::<UpdateTimeclockSettingsPayload>(serde_json::json!({
            "badgeFrequency": "invalid", "tabletBreakBadging": true
        })).is_err());
        assert!(serde_json::from_value::<UpdateTimeclockSettingsPayload>(serde_json::json!({
            "badgeFrequency": "each_shift", "tabletBreakBadging": "true"
        })).is_err());
        assert!(serde_json::from_value::<UpdateTimeclockSettingsPayload>(serde_json::json!({
            "badgeFrequency": "each_shift", "tabletBreakBadging": true, "name": "ignored?"
        })).is_err());
        let _ = std::fs::remove_dir_all(&state.data_dir);
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

    #[tokio::test]
    async fn admin_can_upsert_club_kpis_and_persist() {
        let state = test_state();
        let headers = session_headers(&state, "emp-mario", "club-beynost").await;

        let Json(updated) = put_admin_site_kpis(
            State(state.clone()),
            headers,
            Path("beynost".into()),
            Json(UpdateSiteKpisPayload {
                period_label: Some("Novembre 2026".into()),
                revenue_eur: Some(42500.0),
                payroll_mass_eur: Some(14200.0),
                worked_hours: Some(500.0),
                productivity_per_hour: None,
                retention_rate_pct: Some(92.5),
                monthly_target_eur: Some(46000.0),
            }),
        )
        .await
        .expect("admin peut mettre à jour les KPIs de Beynost");

        assert_eq!(updated.site_id, "club-beynost");
        assert_eq!(updated.period_label, "Novembre 2026");
        assert_eq!(updated.revenue_eur, Some(42500.0));
        assert_eq!(updated.productivity_per_hour, Some(85.0));
        assert_eq!(updated.retention_rate_pct, Some(92.5));
        assert_eq!(updated.monthly_target_eur, Some(46000.0));

        // Non-finance actor rejected with 403
        let max_headers = session_headers(&state, "emp-maxime", "club-carre-soie").await;
        let (status, _) = put_admin_site_kpis(
            State(state.clone()),
            max_headers,
            Path("beynost".into()),
            Json(UpdateSiteKpisPayload {
                revenue_eur: Some(100.0),
                ..Default::default()
            }),
        )
        .await
        .unwrap_err();
        assert_eq!(status, StatusCode::FORBIDDEN);
        let _ = std::fs::remove_dir_all(&state.data_dir);
    }
}
