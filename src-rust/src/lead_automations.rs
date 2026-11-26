use crate::models::{
    AppDatabaseState, LeadAlertRecord, LeadProspectRecord, ProcessedWebhookEvent,
};
use crate::routes::{
    actor_has_lead_admin_write_on_club, append_audit, authorized_clubs_for_actor, err_resp,
    is_demo_mode, resolve_session_actor, verify_stripe_signature_with_tolerance, SharedState,
};
use crate::seed::persist_state;
use axum::{
    body::Bytes,
    extract::{Path, Query, State},
    http::{HeaderMap, StatusCode},
    Json,
};
use chrono::{DateTime, Datelike, Duration, NaiveDate, NaiveDateTime, NaiveTime, TimeZone, Utc, Weekday};
use serde::Deserialize;
use serde_json::{json, Value};

pub const KNOWN_CLUBS: [&str; 2] = ["carre-de-soie", "beynost"];

pub fn is_valid_club_id(club_id: &str) -> bool {
    KNOWN_CLUBS.contains(&club_id)
}

fn club_id_to_audit_site_id(club_id: &str) -> &'static str {
    if club_id == "beynost" {
        "club-beynost"
    } else if club_id == "carre-de-soie" {
        "club-carre-soie"
    } else {
        "all"
    }
}

pub fn lead_archiving_authorized_clubs(db: &AppDatabaseState, actor_id: &str) -> Vec<String> {
    KNOWN_CLUBS
        .iter()
        .filter(|club| actor_has_lead_admin_write_on_club(db, actor_id, club))
        .map(|club| (*club).to_string())
        .collect()
}

pub fn parse_date_or_datetime_utc(raw: &str) -> Option<DateTime<Utc>> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return None;
    }
    if let Ok(dt) = DateTime::parse_from_rfc3339(trimmed) {
        return Some(dt.with_timezone(&Utc));
    }
    if let Ok(ndt) = NaiveDateTime::parse_from_str(trimmed, "%Y-%m-%d %H:%M") {
        return Some(Utc.from_utc_datetime(&ndt));
    }
    if let Ok(ndt) = NaiveDateTime::parse_from_str(trimmed, "%Y-%m-%dT%H:%M") {
        return Some(Utc.from_utc_datetime(&ndt));
    }
    if let Ok(nd) = NaiveDate::parse_from_str(trimmed, "%Y-%m-%d") {
        let ndt = nd.and_time(NaiveTime::from_hms_opt(0, 0, 0)?);
        return Some(Utc.from_utc_datetime(&ndt));
    }
    None
}

fn last_sunday_of_month(year: i32, month: u32) -> Option<NaiveDate> {
    let next_month_first = if month == 12 {
        NaiveDate::from_ymd_opt(year + 1, 1, 1)?
    } else {
        NaiveDate::from_ymd_opt(year, month + 1, 1)?
    };
    let mut day = next_month_first - Duration::days(1);
    while day.weekday() != Weekday::Sun {
        day -= Duration::days(1);
    }
    Some(day)
}

/// Convertit une date/heure locale Europe/Paris (règle CET +01:00 / CEST +02:00) en DateTime<Utc>.
pub fn parse_paris_local_to_utc(date_str: &str, time_str: &str) -> Option<DateTime<Utc>> {
    let date = NaiveDate::parse_from_str(date_str.trim(), "%Y-%m-%d").ok()?;
    let time = NaiveTime::parse_from_str(time_str.trim(), "%H:%M").ok()?;
    let local_ndt = date.and_time(time);

    let march_switch = last_sunday_of_month(date.year(), 3)?
        .and_time(NaiveTime::from_hms_opt(2, 0, 0)?);
    let oct_switch = last_sunday_of_month(date.year(), 10)?
        .and_time(NaiveTime::from_hms_opt(3, 0, 0)?);

    let offset_hours = if local_ndt >= march_switch && local_ndt < oct_switch {
        2
    } else {
        1
    };
    Some(Utc.from_utc_datetime(&(local_ndt - Duration::hours(offset_hours))))
}

/// Calcule les jours d'inactivité commerciale depuis la dernière réponse entrante (ou le dernier contact / création).
/// Indépendant de `days_without_visit` (fréquentation portillons Heitz).
pub fn compute_days_since_commercial_activity(
    prospect: &LeadProspectRecord,
    now: DateTime<Utc>,
) -> Option<i64> {
    let ref_dt = prospect
        .last_inbound_reply_at
        .as_deref()
        .and_then(parse_date_or_datetime_utc)
        .or_else(|| {
            prospect
                .last_commercial_touch_at
                .as_deref()
                .and_then(parse_date_or_datetime_utc)
        })
        .or_else(|| parse_date_or_datetime_utc(&prospect.created_at))?;

    Some((now - ref_dt).num_days().max(0))
}

fn is_alert_rule_enabled(db: &AppDatabaseState, club_id: &str, rule_id: &str) -> bool {
    if matches!(rule_id, "LEAD-REBALANCE" | "LEAD-TRANSFER") {
        return true;
    }
    if let Some(settings) = db.lead_settings_by_club.get(club_id) {
        if let Some(arr) = settings.get("enabledAlertIds").and_then(|v| v.as_array()) {
            return arr.iter().any(|item| item.as_str() == Some(rule_id));
        }
    }
    matches!(rule_id, "LEAD-0545" | "LEAD-0548" | "LEAD-0551" | "LEAD-0552")
}

fn resolve_club_notification_channels(
    db: &AppDatabaseState,
    club_id: &str,
    channel: &str,
) -> Vec<String> {
    let mut out = Vec::new();
    let Some(settings) = db.lead_settings_by_club.get(club_id) else {
        return out;
    };
    let push_if_valid = |target: &mut Vec<String>, val: Option<&str>| {
        if let Some(s) = val.map(|v| v.trim()).filter(|v| !v.is_empty()) {
            if !target.iter().any(|x| x == s) {
                target.push(s.to_string());
            }
        }
    };
    match channel {
        "SMS" => {
            if club_id == "beynost" {
                push_if_valid(
                    &mut out,
                    settings
                        .get("notifMobileBeynost")
                        .and_then(|v| v.as_str())
                        .or_else(|| settings.get("notifMobile").and_then(|v| v.as_str())),
                );
            } else {
                push_if_valid(
                    &mut out,
                    settings
                        .get("notifMobileCds")
                        .and_then(|v| v.as_str())
                        .or_else(|| settings.get("notifMobile").and_then(|v| v.as_str())),
                );
            }
        }
        "Email" | "In-App" => {
            if club_id == "beynost" {
                push_if_valid(
                    &mut out,
                    settings
                        .get("notifEmailBeynost")
                        .and_then(|v| v.as_str())
                        .or_else(|| settings.get("notifEmail").and_then(|v| v.as_str())),
                );
            } else {
                push_if_valid(&mut out, settings.get("notifEmail").and_then(|v| v.as_str()));
            }
        }
        _ => {}
    }
    out
}

#[allow(clippy::too_many_arguments)]
pub(crate) fn emit_lead_alert_if_enabled(
    db: &mut AppDatabaseState,
    club_id: &str,
    rule_id: &str,
    event_type: &str,
    channel: &str,
    title: String,
    message: String,
    prospect_id: Option<String>,
    recipient_employee_ids: Vec<String>,
    extra_channels: Vec<String>,
) -> bool {
    if !is_alert_rule_enabled(db, club_id, rule_id) {
        return false;
    }

    let mut clean_employees: Vec<String> = Vec::new();
    for emp_id in recipient_employee_ids {
        let trimmed = emp_id.trim();
        // Séparation stricte : jamais d'adresse email dans recipient_employee_ids
        if !trimmed.is_empty() && !trimmed.contains('@') && !clean_employees.iter().any(|x| x == trimmed)
        {
            clean_employees.push(trimmed.to_string());
        }
    }

    let mut clean_channels: Vec<String> = Vec::new();
    for ch in extra_channels
        .into_iter()
        .chain(resolve_club_notification_channels(db, club_id, channel))
    {
        let trimmed = ch.trim();
        if !trimmed.is_empty() && !clean_channels.iter().any(|x| x == trimmed) {
            clean_channels.push(trimmed.to_string());
        }
    }

    let alert = LeadAlertRecord {
        id: format!("alert-{}-{}", Utc::now().timestamp_millis(), db.lead_alerts.len() + 1),
        club_id: club_id.to_string(),
        event_type: event_type.to_string(),
        title,
        message,
        prospect_id,
        recipient_ids: clean_employees.clone(),
        alert_rule_id: Some(rule_id.to_string()),
        channel: channel.to_string(),
        recipient_employee_ids: clean_employees,
        recipient_channels: clean_channels,
        simulation_mode: true, // Simulation sécurisée pendant la recette
        acknowledged: false,
        acknowledged_by: None,
        acknowledged_at: None,
        created_at: Utc::now().to_rfc3339(),
    };

    db.lead_alerts.insert(0, alert);
    if db.lead_alerts.len() > 200 {
        db.lead_alerts.truncate(200);
    }
    true
}

fn actor_can_access_alert(
    db: &AppDatabaseState,
    actor_id: &str,
    alert: &LeadAlertRecord,
) -> bool {
    let allowed_clubs = authorized_clubs_for_actor(db, actor_id);
    if !allowed_clubs.contains(&alert.club_id) {
        return false;
    }
    if actor_has_lead_admin_write_on_club(db, actor_id, &alert.club_id) {
        return true;
    }
    if alert.recipient_employee_ids.iter().any(|id| id == actor_id)
        || alert.recipient_ids.iter().any(|id| id == actor_id)
    {
        return true;
    }
    if let Some(ref pid) = alert.prospect_id {
        if db.lead_prospects.iter().any(|p| {
            &p.id == pid
                && p.club_id == alert.club_id
                && p.assigned_to_id.as_deref() == Some(actor_id)
        }) {
            return true;
        }
    }
    false
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct LeadAlertsQuery {
    pub club_id: Option<String>,
}

pub(crate) async fn get_lead_alerts(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Query(query): Query<LeadAlertsQuery>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let (actor_id, _site_id) = resolve_session_actor(&state, &headers).await?;
    let db = state.db.read().await;
    let allowed_clubs = authorized_clubs_for_actor(&db, &actor_id);

    if let Some(ref requested_club) = query.club_id {
        if requested_club != "all" {
            if !is_valid_club_id(requested_club) {
                return Err(err_resp(StatusCode::BAD_REQUEST, "Identifiant de club invalide."));
            }
            if !allowed_clubs.contains(requested_club) {
                return Err(err_resp(
                    StatusCode::FORBIDDEN,
                    format!("Consultation des alertes refusée (403) hors périmètre club {}.", requested_club),
                ));
            }
        }
    }

    let alerts: Vec<&LeadAlertRecord> = db
        .lead_alerts
        .iter()
        .filter(|a| {
            let club_ok = query
                .club_id
                .as_deref()
                .map(|cid| cid == "all" || a.club_id == cid)
                .unwrap_or(true);
            club_ok && actor_can_access_alert(&db, &actor_id, a)
        })
        .collect();

    Ok(Json(json!({
        "ok": true,
        "alerts": alerts,
        "simulationMode": true
    })))
}

pub(crate) async fn post_ack_lead_alert(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Path(alert_id): Path<String>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let (actor_id, _) = resolve_session_actor(&state, &headers).await?;
    let mut db = state.db.write().await;

    let Some(idx) = db.lead_alerts.iter().position(|a| a.id == alert_id) else {
        return Err(err_resp(StatusCode::NOT_FOUND, "Alerte introuvable."));
    };

    if !actor_can_access_alert(&db, &actor_id, &db.lead_alerts[idx]) {
        return Err(err_resp(
            StatusCode::FORBIDDEN,
            "Acquittement refusé (403) : alerte hors de votre périmètre club ou collaborateur.",
        ));
    }

    let snapshot = db.clone();
    let now_rfc = Utc::now().to_rfc3339();
    let club_id = db.lead_alerts[idx].club_id.clone();

    db.lead_alerts[idx].acknowledged = true;
    db.lead_alerts[idx].acknowledged_by = Some(actor_id.clone());
    db.lead_alerts[idx].acknowledged_at = Some(now_rfc.clone());

    append_audit(
        &mut db,
        &actor_id,
        "lead.alert.ack",
        format!("Acquittement alerte {}", alert_id),
        club_id_to_audit_site_id(&club_id),
        &alert_id,
        None,
        Some(now_rfc.clone()),
    );

    if let Err(err_msg) = persist_state(&state.data_dir, &db) {
        *db = snapshot;
        return Err(err_resp(
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Échec persistance acquittement alerte : {}", err_msg),
        ));
    }

    Ok(Json(json!({
        "ok": true,
        "alertId": alert_id,
        "acknowledged": true,
        "acknowledgedBy": actor_id,
        "acknowledgedAt": now_rfc
    })))
}

#[derive(Clone, Copy)]
enum WebhookProvider {
    InboundReply,
    HeitzSyncSale,
}

fn constant_time_eq(a: &str, b: &str) -> bool {
    let a_bytes = a.as_bytes();
    let b_bytes = b.as_bytes();
    if a_bytes.len() != b_bytes.len() {
        return false;
    }
    let mut diff: u8 = 0;
    for (x, y) in a_bytes.iter().zip(b_bytes.iter()) {
        diff |= x ^ y;
    }
    diff == 0
}

fn webhook_secret_for(provider: WebhookProvider) -> String {
    let env_val = match provider {
        WebhookProvider::InboundReply => std::env::var("CFITNESS_INBOUND_WEBHOOK_SECRET")
            .ok()
            .filter(|v| !v.trim().is_empty())
            .or_else(|| {
                std::env::var("CFITNESS_LEAD_API_KEY")
                    .ok()
                    .filter(|v| !v.trim().is_empty())
            }),
        WebhookProvider::HeitzSyncSale => std::env::var("CFITNESS_HEITZ_WEBHOOK_SECRET")
            .ok()
            .filter(|v| !v.trim().is_empty())
            .or_else(|| {
                std::env::var("HEITZ_WS_TOKEN")
                    .ok()
                    .filter(|v| !v.trim().is_empty())
            }),
    };
    if let Some(secret) = env_val {
        return secret.trim().to_string();
    }
    if is_demo_mode() {
        match provider {
            WebhookProvider::InboundReply => "CFITNESS-DEMO-INBOUND-SECRET".to_string(),
            WebhookProvider::HeitzSyncSale => "CFITNESS-LOCAL-HZ-TOKEN".to_string(),
        }
    } else {
        String::new()
    }
}

fn verify_provider_webhook_auth(
    provider: WebhookProvider,
    headers: &HeaderMap,
    body: &[u8],
) -> Result<&'static str, (StatusCode, Json<Value>)> {
    let secret = webhook_secret_for(provider);
    if secret.is_empty() {
        return Err(err_resp(
            StatusCode::UNAUTHORIZED,
            "Secret webhook fournisseur non configuré en production (401 Unauthorized).",
        ));
    }

    let tolerance = std::env::var("CFITNESS_WEBHOOK_TOLERANCE_SECONDS")
        .ok()
        .and_then(|v| v.parse::<i64>().ok())
        .filter(|v| *v > 0)
        .unwrap_or(300);
    let now_ts = Utc::now().timestamp();

    if let Some(sig_header) = headers
        .get("x-cfitness-signature")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
    {
        if verify_stripe_signature_with_tolerance(&secret, body, sig_header, now_ts, tolerance) {
            return Ok("hmac_sha256_verified");
        }
        return Err(err_resp(
            StatusCode::UNAUTHORIZED,
            "Signature webhook HMAC invalide ou expirée (401 Unauthorized).",
        ));
    }

    let token_header_name = match provider {
        WebhookProvider::InboundReply => "x-cfitness-webhook-token",
        WebhookProvider::HeitzSyncSale => "x-heitz-token",
    };

    let provided_token = headers
        .get(token_header_name)
        .and_then(|v| v.to_str().ok())
        .map(|s| s.trim())
        .filter(|s| !s.is_empty());

    let Some(token) = provided_token else {
        return Err(err_resp(
            StatusCode::UNAUTHORIZED,
            "Authentification webhook requise (signature HMAC ou jeton horodaté absent).",
        ));
    };

    if !constant_time_eq(token, &secret) {
        return Err(err_resp(
            StatusCode::UNAUTHORIZED,
            "Jeton webhook fournisseur invalide (401 Unauthorized).",
        ));
    }

    let ts = headers
        .get("x-cfitness-timestamp")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.trim().parse::<i64>().ok())
        .ok_or_else(|| {
            err_resp(
                StatusCode::UNAUTHORIZED,
                "En-tête x-cfitness-timestamp requis pour protection anti-rejeu (401 Unauthorized).",
            )
        })?;

    if (now_ts - ts).abs() > tolerance {
        return Err(err_resp(
            StatusCode::UNAUTHORIZED,
            "Horodatage webhook hors fenêtre anti-rejeu (401 Unauthorized).",
        ));
    }

    Ok("token_timestamp_verified")
}

fn find_prospect_index_in_club(
    prospects: &[LeadProspectRecord],
    club_id: &str,
    prospect_id: Option<&str>,
    email: Option<&str>,
    phone: Option<&str>,
) -> Option<usize> {
    prospects.iter().position(|p| {
        if p.club_id != club_id {
            return false;
        }
        if let Some(pid) = prospect_id.map(|s| s.trim()).filter(|s| !s.is_empty()) {
            if p.id == pid {
                return true;
            }
        }
        if let Some(em) = email.map(|s| s.trim()).filter(|s| !s.is_empty()) {
            if p.email.eq_ignore_ascii_case(em) {
                return true;
            }
        }
        if let Some(ph) = phone.map(|s| s.trim()).filter(|s| !s.is_empty()) {
            if !p.phone.is_empty() && p.phone == ph {
                return true;
            }
        }
        false
    })
}

fn has_valid_target_identifier(
    prospect_id: Option<&str>,
    email: Option<&str>,
    phone: Option<&str>,
) -> bool {
    prospect_id.map(|s| !s.trim().is_empty()).unwrap_or(false)
        || email.map(|s| !s.trim().is_empty()).unwrap_or(false)
        || phone.map(|s| !s.trim().is_empty()).unwrap_or(false)
}

fn record_processed_event(db: &mut AppDatabaseState, event: ProcessedWebhookEvent) {
    db.processed_lead_events.insert(0, event);
    if db.processed_lead_events.len() > 500 {
        db.processed_lead_events.truncate(500);
    }
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct RunArchivingPayload {
    pub club_id: Option<String>,
}

pub(crate) async fn run_archiving_for_clubs(
    state: &SharedState,
    clubs: &[String],
    actor_id: &str,
    now: DateTime<Utc>,
) -> Result<Value, (StatusCode, Json<Value>)> {
    let mut db = state.db.write().await;
    let snapshot = db.clone();
    let now_rfc = now.to_rfc3339();
    let settings_snapshot = db.lead_settings_by_club.clone();
    let mut archived_ids = Vec::new();
    let mut alert_events: Vec<(String, String, String, Option<String>, String)> = Vec::new();

    for prospect in db.lead_prospects.iter_mut() {
        if !clubs.contains(&prospect.club_id) {
            continue;
        }
        if prospect.is_archived
            || prospect.has_active_vacation
            || matches!(prospect.stage.as_str(), "Client" | "Perdu")
        {
            continue;
        }

        let club_settings = settings_snapshot.get(&prospect.club_id);
        let auto_archive = club_settings
            .and_then(|s| s.get("autoArchiveEnabled"))
            .and_then(|v| v.as_bool())
            .unwrap_or(true);
        if !auto_archive {
            continue;
        }

        let threshold_days = club_settings
            .and_then(|s| s.get("archiveThresholdDays"))
            .and_then(|v| v.as_u64())
            .unwrap_or(30)
            .max(1) as i64;
        let target_stage = club_settings
            .and_then(|s| s.get("archiveTargetStage"))
            .and_then(|v| v.as_str())
            .filter(|s| matches!(*s, "Archivé" | "Froid"))
            .unwrap_or("Archivé")
            .to_string();

        let Some(days_inactive) = compute_days_since_commercial_activity(prospect, now) else {
            continue;
        };

        if days_inactive >= threshold_days {
            prospect.stage = target_stage.clone();
            prospect.lead_status = target_stage.clone();
            prospect.is_archived = true;
            prospect.archived_at = Some(now_rfc.clone());
            prospect.archive_reason = Some(format!(
                "{} j sans réponse commerciale entrante (seuil {} j)",
                days_inactive, threshold_days
            ));
            archived_ids.push(prospect.id.clone());
            alert_events.push((
                prospect.club_id.clone(),
                prospect.id.clone(),
                format!("{} {}", prospect.first_name, prospect.last_name),
                prospect.assigned_to_id.clone(),
                target_stage,
            ));
        }
    }

    for (cid, pid, pname, assigned_opt, target_stage) in &alert_events {
        let recipients = assigned_opt.clone().into_iter().collect();
        emit_lead_alert_if_enabled(
            &mut db,
            cid,
            "LEAD-0551",
            "archived",
            "In-App",
            format!("Prospect classé {} automatiquement : {}", target_stage, pname),
            format!(
                "Inactivité commerciale supérieure au seuil configuré pour le club {}.",
                cid
            ),
            Some(pid.clone()),
            recipients,
            vec![],
        );
    }

    if actor_id == "system-scheduler" {
        db.lead_scheduler_status.last_archive_run_at = Some(now_rfc.clone());
        db.lead_scheduler_status.last_archived_count = archived_ids.len();
        db.lead_scheduler_status.last_run_error = None;
    }

    if !archived_ids.is_empty() || actor_id == "system-scheduler" {
        if !archived_ids.is_empty() {
            let scope_label = if clubs.len() == 1 {
                clubs[0].as_str()
            } else {
                "multi-clubs"
            };
            append_audit(
                &mut db,
                actor_id,
                "lead.automation.archive",
                format!(
                    "Archivage automatique de {} prospect(s) sans réponse commerciale",
                    archived_ids.len()
                ),
                club_id_to_audit_site_id(scope_label),
                scope_label,
                None,
                Some(archived_ids.join(", ")),
            );
        }

        if let Err(err_msg) = persist_state(&state.data_dir, &db) {
            *db = snapshot;
            if actor_id == "system-scheduler" {
                db.lead_scheduler_status.last_run_error =
                    Some(format!("Échec persistance archivage : {}", err_msg));
            }
            return Err(err_resp(
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Échec persistance archivage : {}", err_msg),
            ));
        }
    }

    Ok(json!({
        "ok": true,
        "clubsProcessed": clubs,
        "archivedCount": archived_ids.len(),
        "archivedIds": archived_ids
    }))
}

pub(crate) async fn post_run_lead_archiving(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Json(payload): Json<RunArchivingPayload>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let (actor_id, _) = resolve_session_actor(&state, &headers).await?;
    let authorized_clubs = {
        let db = state.db.read().await;
        lead_archiving_authorized_clubs(&db, &actor_id)
    };

    let target_clubs = match payload.club_id.as_deref().map(|s| s.trim()).filter(|s| !s.is_empty()) {
        None | Some("all") => {
            if authorized_clubs.is_empty() {
                return Err(err_resp(
                    StatusCode::FORBIDDEN,
                    "Exécution de l'archivage automatique refusée (403) : aucun club habilité.",
                ));
            }
            authorized_clubs
        }
        Some(club_id) => {
            if !is_valid_club_id(club_id) {
                return Err(err_resp(StatusCode::BAD_REQUEST, "Identifiant de club invalide."));
            }
            if !authorized_clubs.iter().any(|c| c == club_id) {
                return Err(err_resp(
                    StatusCode::FORBIDDEN,
                    format!(
                        "Exécution de l'archivage automatique refusée (403) sur le club {}.",
                        club_id
                    ),
                ));
            }
            vec![club_id.to_string()]
        }
    };

    let res = run_archiving_for_clubs(&state, &target_clubs, &actor_id, Utc::now()).await?;
    Ok(Json(res))
}

pub(crate) async fn run_appointment_reminders_for_clubs(
    state: &SharedState,
    clubs: &[String],
    actor_id: &str,
    now: DateTime<Utc>,
) -> Result<Value, (StatusCode, Json<Value>)> {
    let mut db = state.db.write().await;
    let snapshot = db.clone();
    let now_rfc = now.to_rfc3339();
    let window_end = now + Duration::hours(24);

    let appointments_snap = db.lead_appointments.clone();
    let mut emitted_ids = Vec::new();

    for slot in appointments_snap {
        if !clubs.contains(&slot.club_id) {
            continue;
        }
        if !matches!(slot.status.as_str(), "confirme" | "reporte") {
            continue;
        }
        let Some(slot_utc) = parse_paris_local_to_utc(&slot.date, &slot.start_time) else {
            continue;
        };
        if slot_utc <= now || slot_utc > window_end {
            continue;
        }

        let prospect_phone = slot
            .prospect_id
            .as_deref()
            .and_then(|pid| {
                db.lead_prospects
                    .iter()
                    .find(|p| p.id == pid && p.club_id == slot.club_id)
            })
            .map(|p| p.phone.clone())
            .filter(|ph| !ph.trim().is_empty());

        let prospect_assigned = slot
            .prospect_id
            .as_deref()
            .and_then(|pid| {
                db.lead_prospects
                    .iter()
                    .find(|p| p.id == pid && p.club_id == slot.club_id)
            })
            .and_then(|p| p.assigned_to_id.clone());

        let mut employee_recipients = vec![slot.coach_id.clone()];
        if let Some(emp) = prospect_assigned {
            employee_recipients.push(emp);
        }

        let prospect_label = slot
            .prospect_name
            .clone()
            .unwrap_or_else(|| "Prospect".to_string());

        for (rule_id, channel) in [("LEAD-0545", "SMS"), ("LEAD-0548", "Email")] {
            let dedup_key = format!("rdv_reminder_24h:{}:{}", slot.id, rule_id);
            if db
                .processed_lead_events
                .iter()
                .any(|e| e.event_key == dedup_key)
            {
                continue;
            }
            if !is_alert_rule_enabled(&db, &slot.club_id, rule_id) {
                continue;
            }

            let mut extra_channels = Vec::new();
            if channel == "Email" {
                if let Some(ref em) = slot.prospect_email {
                    extra_channels.push(em.clone());
                }
            } else if let Some(ref ph) = prospect_phone {
                extra_channels.push(ph.clone());
            }

            let emitted = emit_lead_alert_if_enabled(
                &mut db,
                &slot.club_id,
                rule_id,
                "appointment_reminder_24h",
                channel,
                format!("Rappel {} RDV J-1 : {}", channel, prospect_label),
                format!(
                    "Séance « {} » prévue le {} à {} (Europe/Paris).",
                    slot.type_name, slot.date, slot.start_time
                ),
                slot.prospect_id.clone(),
                employee_recipients.clone(),
                extra_channels,
            );

            if emitted {
                emitted_ids.push(dedup_key.clone());
                record_processed_event(
                    &mut db,
                    ProcessedWebhookEvent {
                        event_key: dedup_key,
                        source: "scheduler_rdv_24h".to_string(),
                        club_id: slot.club_id.clone(),
                        processed_at: now_rfc.clone(),
                        response_summary: json!({
                            "slotId": slot.id,
                            "ruleId": rule_id,
                            "channel": channel,
                            "simulationMode": true
                        }),
                    },
                );
            }
        }
    }

    if actor_id == "system-scheduler" {
        db.lead_scheduler_status.last_reminder_run_at = Some(now_rfc.clone());
        db.lead_scheduler_status.last_reminders_emitted = emitted_ids.len();
        db.lead_scheduler_status.total_runs += 1;
        db.lead_scheduler_status.last_run_error = None;
    }

    if !emitted_ids.is_empty() || actor_id == "system-scheduler" {
        if !emitted_ids.is_empty() {
            append_audit(
                &mut db,
                actor_id,
                "lead.automation.reminders",
                format!(
                    "Émission simulée de {} rappel(s) RDV J-1",
                    emitted_ids.len()
                ),
                club_id_to_audit_site_id(if clubs.len() == 1 {
                    clubs[0].as_str()
                } else {
                    "multi-clubs"
                }),
                "LeadAppointments",
                None,
                Some(emitted_ids.join(", ")),
            );
        }

        if let Err(err_msg) = persist_state(&state.data_dir, &db) {
            *db = snapshot;
            if actor_id == "system-scheduler" {
                db.lead_scheduler_status.last_run_error =
                    Some(format!("Échec persistance rappels RDV : {}", err_msg));
            }
            return Err(err_resp(
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Échec persistance rappels RDV : {}", err_msg),
            ));
        }
    }

    Ok(json!({
        "ok": true,
        "clubsProcessed": clubs,
        "remindersEmitted": emitted_ids.len(),
        "reminderKeys": emitted_ids,
        "simulationMode": true
    }))
}

pub(crate) async fn post_run_lead_reminders(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Json(payload): Json<RunArchivingPayload>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let (actor_id, _) = resolve_session_actor(&state, &headers).await?;
    let authorized_clubs = {
        let db = state.db.read().await;
        lead_archiving_authorized_clubs(&db, &actor_id)
    };

    let target_clubs = match payload.club_id.as_deref().map(|s| s.trim()).filter(|s| !s.is_empty()) {
        None | Some("all") => {
            if authorized_clubs.is_empty() {
                return Err(err_resp(
                    StatusCode::FORBIDDEN,
                    "Exécution des rappels RDV refusée (403) : aucun club habilité.",
                ));
            }
            authorized_clubs
        }
        Some(club_id) => {
            if !is_valid_club_id(club_id) {
                return Err(err_resp(StatusCode::BAD_REQUEST, "Identifiant de club invalide."));
            }
            if !authorized_clubs.iter().any(|c| c == club_id) {
                return Err(err_resp(
                    StatusCode::FORBIDDEN,
                    format!("Exécution des rappels RDV refusée (403) sur le club {}.", club_id),
                ));
            }
            vec![club_id.to_string()]
        }
    };

    let res = run_appointment_reminders_for_clubs(&state, &target_clubs, &actor_id, Utc::now()).await?;
    Ok(Json(res))
}

pub(crate) async fn get_lead_scheduler_status(
    State(state): State<SharedState>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let (actor_id, _) = resolve_session_actor(&state, &headers).await?;
    let db = state.db.read().await;
    let authorized = lead_archiving_authorized_clubs(&db, &actor_id);
    if authorized.is_empty() {
        return Err(err_resp(
            StatusCode::FORBIDDEN,
            "Consultation de l'état du planificateur réservée aux managers/administrateurs.",
        ));
    }
    Ok(Json(json!({
        "ok": true,
        "scheduler": db.lead_scheduler_status,
        "authorizedClubs": authorized
    })))
}

pub fn spawn_lead_automation_scheduler(state: SharedState) {
    let enabled = std::env::var("CFITNESS_AUTOMATION_SCHEDULER")
        .map(|v| v != "0" && !v.eq_ignore_ascii_case("false"))
        .unwrap_or(true);
    let interval_secs = std::env::var("CFITNESS_AUTOMATION_INTERVAL_SECS")
        .ok()
        .and_then(|v| v.parse::<u64>().ok())
        .map(|v| v.max(10))
        .unwrap_or(900);

    {
        let state_clone = state.clone();
        tokio::spawn(async move {
            {
                let mut db = state_clone.db.write().await;
                db.lead_scheduler_status.enabled = enabled;
                db.lead_scheduler_status.frequency_seconds = interval_secs;
                db.lead_scheduler_status.timezone = "Europe/Paris".to_string();
                db.lead_scheduler_status.actor_identity = "system-scheduler".to_string();
            }
            if !enabled {
                tracing::info!("Planificateur automatique Lead désactivé via CFITNESS_AUTOMATION_SCHEDULER=0");
                return;
            }
            tracing::info!(
                "Planificateur automatique Lead actif (fréquence={}s, fuseau=Europe/Paris, identité=system-scheduler)",
                interval_secs
            );
            let all_clubs: Vec<String> = KNOWN_CLUBS.iter().map(|s| (*s).to_string()).collect();
            let mut ticker = tokio::time::interval(std::time::Duration::from_secs(interval_secs));
            ticker.tick().await;
            loop {
                ticker.tick().await;
                let now = Utc::now();
                if let Err((_, err_json)) =
                    run_archiving_for_clubs(&state_clone, &all_clubs, "system-scheduler", now).await
                {
                    tracing::error!("Erreur tick archivage planifié: {}", err_json.0);
                }
                if let Err((_, err_json)) =
                    run_appointment_reminders_for_clubs(&state_clone, &all_clubs, "system-scheduler", now)
                        .await
                {
                    tracing::error!("Erreur tick rappels RDV planifiés: {}", err_json.0);
                }
            }
        });
    }
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct LeadInboundReplyPayload {
    pub event_id: Option<String>,
    pub club_id: String,
    pub prospect_id: Option<String>,
    pub email: Option<String>,
    pub phone: Option<String>,
    pub channel: Option<String>,
    pub message_preview: Option<String>,
}

pub(crate) async fn post_lead_inbound_reply(
    State(state): State<SharedState>,
    headers: HeaderMap,
    body: Bytes,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let auth_mode = verify_provider_webhook_auth(WebhookProvider::InboundReply, &headers, &body)?;

    let payload: LeadInboundReplyPayload = serde_json::from_slice(&body)
        .map_err(|_| err_resp(StatusCode::BAD_REQUEST, "Payload JSON réponse entrante invalide."))?;

    if !is_valid_club_id(payload.club_id.trim()) {
        return Err(err_resp(StatusCode::BAD_REQUEST, "Identifiant clubId invalide."));
    }

    let event_id = payload
        .event_id
        .as_deref()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .or_else(|| {
            headers
                .get("x-event-id")
                .and_then(|v| v.to_str().ok())
                .map(|s| s.trim())
                .filter(|s| !s.is_empty())
        })
        .ok_or_else(|| {
            err_resp(
                StatusCode::BAD_REQUEST,
                "Identifiant événement (eventId ou x-event-id) requis pour anti-rejeu.",
            )
        })?
        .to_string();

    let channel = payload.channel.as_deref().unwrap_or("whatsapp").trim();
    if !matches!(channel, "whatsapp" | "sms" | "email") {
        return Err(err_resp(
            StatusCode::BAD_REQUEST,
            "Canal entrant invalide (attendu : whatsapp, sms ou email).",
        ));
    }

    if !has_valid_target_identifier(
        payload.prospect_id.as_deref(),
        payload.email.as_deref(),
        payload.phone.as_deref(),
    ) {
        return Err(err_resp(
            StatusCode::BAD_REQUEST,
            "Au moins un identifiant prospect (prospectId, email ou phone) est requis.",
        ));
    }

    let event_key = format!("inbound:{}:{}", payload.club_id.trim(), event_id);
    let mut db = state.db.write().await;

    if let Some(existing) = db
        .processed_lead_events
        .iter()
        .find(|e| e.event_key == event_key)
        .cloned()
    {
        return Ok(Json(json!({
            "ok": true,
            "duplicate": true,
            "alreadyProcessed": true,
            "eventId": event_id,
            "authMode": auth_mode,
            "previousResult": existing.response_summary
        })));
    }

    let Some(idx) = find_prospect_index_in_club(
        &db.lead_prospects,
        payload.club_id.trim(),
        payload.prospect_id.as_deref(),
        payload.email.as_deref(),
        payload.phone.as_deref(),
    ) else {
        return Err(err_resp(
            StatusCode::NOT_FOUND,
            "Prospect introuvable dans ce club pour cette réponse entrante.",
        ));
    };

    let snapshot = db.clone();
    let now_rfc = Utc::now().to_rfc3339();

    let (pid, cid, pname, assigned, was_archived, resulting_stage) = {
        let prospect = &mut db.lead_prospects[idx];
        let was_archived = prospect.is_archived
            || matches!(prospect.stage.as_str(), "Archivé" | "Froid" | "Perdu");
        prospect.last_inbound_reply_at = Some(now_rfc.clone());
        prospect.last_commercial_touch_at = Some(now_rfc.clone());
        // Ne jamais modifier days_without_visit (fréquentation portillons Heitz distincte)
        if was_archived && prospect.stage != "Client" {
            prospect.stage = "À relancer".into();
            prospect.lead_status = "À relancer".into();
            prospect.is_archived = false;
            prospect.archived_at = None;
            prospect.archive_reason = None;
        }
        (
            prospect.id.clone(),
            prospect.club_id.clone(),
            format!("{} {}", prospect.first_name, prospect.last_name),
            prospect.assigned_to_id.clone(),
            was_archived,
            prospect.stage.clone(),
        )
    };

    let recipients: Vec<String> = assigned.into_iter().collect();
    let alert_emitted = emit_lead_alert_if_enabled(
        &mut db,
        &cid,
        "LEAD-0551",
        "inbound_reply",
        "In-App",
        format!("Réponse entrante ({}) de {}", channel, pname),
        payload
            .message_preview
            .unwrap_or_else(|| "Le prospect a répondu. Fiche maintenue/réactivée.".into()),
        Some(pid.clone()),
        recipients,
        vec![],
    );

    let response_summary = json!({
        "ok": true,
        "duplicate": false,
        "eventId": event_id,
        "authMode": auth_mode,
        "prospectId": pid,
        "clubId": cid,
        "reactivatedFromArchive": was_archived,
        "newStage": resulting_stage,
        "alertEmitted": alert_emitted
    });

    record_processed_event(
        &mut db,
        ProcessedWebhookEvent {
            event_key,
            source: "inbound_reply".to_string(),
            club_id: cid.clone(),
            processed_at: now_rfc,
            response_summary: response_summary.clone(),
        },
    );

    append_audit(
        &mut db,
        "system-webhook",
        "lead.inbound_reply",
        format!(
            "Réponse entrante {} pour {} (event={}, réactivé={})",
            channel, pname, event_id, was_archived
        ),
        club_id_to_audit_site_id(&cid),
        &cid,
        None,
        Some(pid.clone()),
    );

    if let Err(err_msg) = persist_state(&state.data_dir, &db) {
        *db = snapshot;
        return Err(err_resp(
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Échec persistance réponse entrante : {}", err_msg),
        ));
    }

    Ok(Json(response_summary))
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct HeitzSyncSalePayload {
    pub event_id: Option<String>,
    pub club_id: String,
    pub prospect_id: Option<String>,
    pub email: Option<String>,
    pub phone: Option<String>,
    pub offer_id: String,
    pub offer_name: String,
    pub amount_eur: Option<f64>,
}

pub(crate) async fn post_heitz_sync_sale(
    State(state): State<SharedState>,
    headers: HeaderMap,
    body: Bytes,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let auth_mode = verify_provider_webhook_auth(WebhookProvider::HeitzSyncSale, &headers, &body)?;

    let payload: HeitzSyncSalePayload = serde_json::from_slice(&body)
        .map_err(|_| err_resp(StatusCode::BAD_REQUEST, "Payload JSON vente Heitz invalide."))?;

    if !is_valid_club_id(payload.club_id.trim()) {
        return Err(err_resp(StatusCode::BAD_REQUEST, "Identifiant clubId invalide."));
    }
    if payload.offer_id.trim().is_empty() || payload.offer_name.trim().is_empty() {
        return Err(err_resp(
            StatusCode::BAD_REQUEST,
            "Champs offerId et offerName obligatoires.",
        ));
    }
    if let Some(amount) = payload.amount_eur {
        if !amount.is_finite() || amount < 0.0 {
            return Err(err_resp(StatusCode::BAD_REQUEST, "Montant amountEur invalide."));
        }
    }
    if !has_valid_target_identifier(
        payload.prospect_id.as_deref(),
        payload.email.as_deref(),
        payload.phone.as_deref(),
    ) {
        return Err(err_resp(
            StatusCode::BAD_REQUEST,
            "Au moins un identifiant prospect (prospectId, email ou phone) est requis.",
        ));
    }

    let event_id = payload
        .event_id
        .as_deref()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .or_else(|| {
            headers
                .get("x-event-id")
                .and_then(|v| v.to_str().ok())
                .map(|s| s.trim())
                .filter(|s| !s.is_empty())
        })
        .ok_or_else(|| {
            err_resp(
                StatusCode::BAD_REQUEST,
                "Identifiant événement (eventId ou x-event-id) requis pour anti-rejeu.",
            )
        })?
        .to_string();

    let event_key = format!("heitz_sale:{}:{}", payload.club_id.trim(), event_id);
    let mut db = state.db.write().await;

    if let Some(existing) = db
        .processed_lead_events
        .iter()
        .find(|e| e.event_key == event_key)
        .cloned()
    {
        return Ok(Json(json!({
            "ok": true,
            "duplicate": true,
            "alreadyProcessed": true,
            "eventId": event_id,
            "authMode": auth_mode,
            "previousResult": existing.response_summary
        })));
    }

    let club_id = payload.club_id.trim().to_string();
    let club_settings = db.lead_settings_by_club.get(&club_id).cloned();

    let mut is_trigger_offer = false;
    if let Some(ref settings) = club_settings {
        if let Some(arr) = settings.get("selectedPassOfferIds").and_then(|v| v.as_array()) {
            if arr
                .iter()
                .any(|item| item.as_str() == Some(payload.offer_id.trim()))
            {
                is_trigger_offer = true;
            }
        }
        if !is_trigger_offer {
            if let Some(single_name) = settings.get("clientPassOffer").and_then(|v| v.as_str()) {
                if single_name.trim().eq_ignore_ascii_case(payload.offer_name.trim()) {
                    is_trigger_offer = true;
                }
            }
        }
    }

    let snapshot = db.clone();
    let now_rfc = Utc::now().to_rfc3339();

    if !is_trigger_offer {
        let non_convert_summary = json!({
            "ok": true,
            "duplicate": false,
            "converted": false,
            "eventId": event_id,
            "authMode": auth_mode,
            "reason": "L'offre synchronisée ne fait pas partie des offres déclenchantes configurées pour ce club."
        });
        record_processed_event(
            &mut db,
            ProcessedWebhookEvent {
                event_key,
                source: "heitz_sync_sale".to_string(),
                club_id: club_id.clone(),
                processed_at: now_rfc,
                response_summary: non_convert_summary.clone(),
            },
        );
        if let Err(err_msg) = persist_state(&state.data_dir, &db) {
            *db = snapshot;
            return Err(err_resp(
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Échec persistance événement Heitz non déclencheur : {}", err_msg),
            ));
        }
        return Ok(Json(non_convert_summary));
    }

    let Some(idx) = find_prospect_index_in_club(
        &db.lead_prospects,
        &club_id,
        payload.prospect_id.as_deref(),
        payload.email.as_deref(),
        payload.phone.as_deref(),
    ) else {
        return Err(err_resp(
            StatusCode::NOT_FOUND,
            "Aucun prospect correspondant trouvé dans ce club pour cette vente Heitz.",
        ));
    };

    let target_scope = club_settings
        .as_ref()
        .and_then(|s| s.get("clientPassTargetScope"))
        .and_then(|v| v.as_str())
        .filter(|s| matches!(*s, "club" | "enseigne"))
        .unwrap_or("club")
        .to_string();

    let scope_clubs: Vec<String> = if target_scope == "enseigne" {
        KNOWN_CLUBS.iter().map(|s| (*s).to_string()).collect()
    } else {
        vec![club_id.clone()]
    };

    let (primary_id, primary_email, primary_phone, pname, assigned, prev_stage) = {
        let pr = &mut db.lead_prospects[idx];
        let prev = pr.stage.clone();
        pr.stage = "Client".into();
        pr.lead_status = "Client".into();
        pr.is_archived = false;
        pr.archived_at = None;
        pr.archive_reason = None;
        pr.converted_offer = Some(payload.offer_name.clone());
        pr.client_scope = Some(target_scope.clone());
        for sc in &scope_clubs {
            if !pr.client_club_ids.contains(sc) {
                pr.client_club_ids.push(sc.clone());
            }
        }
        (
            pr.id.clone(),
            pr.email.trim().to_lowercase(),
            pr.phone.trim().to_string(),
            format!("{} {}", pr.first_name, pr.last_name),
            pr.assigned_to_id.clone(),
            prev,
        )
    };

    let mut affected_prospect_ids = vec![primary_id.clone()];
    let mut affected_clubs = vec![club_id.clone()];

    // Si scope == "enseigne", convertir sans doublon ni perte d'historique une fiche sœur dans l'autre club
    if target_scope == "enseigne" {
        for other in db.lead_prospects.iter_mut() {
            if other.id == primary_id {
                continue;
            }
            let same_email = !primary_email.is_empty() && other.email.trim().eq_ignore_ascii_case(&primary_email);
            let same_phone = !primary_phone.is_empty() && !other.phone.is_empty() && other.phone.trim() == primary_phone;
            if same_email || same_phone {
                other.stage = "Client".into();
                other.lead_status = "Client".into();
                other.is_archived = false;
                other.archived_at = None;
                other.archive_reason = None;
                other.converted_offer = Some(payload.offer_name.clone());
                other.client_scope = Some("enseigne".into());
                for sc in &scope_clubs {
                    if !other.client_club_ids.contains(sc) {
                        other.client_club_ids.push(sc.clone());
                    }
                }
                affected_prospect_ids.push(other.id.clone());
                if !affected_clubs.contains(&other.club_id) {
                    affected_clubs.push(other.club_id.clone());
                }
            }
        }
    }

    let recipients: Vec<String> = assigned.into_iter().collect();
    let alert_emitted = emit_lead_alert_if_enabled(
        &mut db,
        &club_id,
        "LEAD-0552",
        "client_converted",
        "Email",
        format!("Nouveau Client converti ({}) : {}", target_scope, pname),
        format!(
            "Souscription Heitz synchronisée ({} — {:.2} €). Portée {}. Statut passé de {} à Client.",
            payload.offer_name,
            payload.amount_eur.unwrap_or(0.0),
            target_scope,
            prev_stage
        ),
        Some(primary_id.clone()),
        recipients,
        vec![],
    );

    let response_summary = json!({
        "ok": true,
        "duplicate": false,
        "converted": true,
        "eventId": event_id,
        "authMode": auth_mode,
        "prospectId": primary_id,
        "clubId": club_id,
        "offerId": payload.offer_id,
        "newStage": "Client",
        "clientScope": target_scope,
        "clientClubIds": scope_clubs,
        "affectedProspectIds": affected_prospect_ids,
        "affectedClubs": affected_clubs,
        "alertEmitted": alert_emitted
    });

    record_processed_event(
        &mut db,
        ProcessedWebhookEvent {
            event_key,
            source: "heitz_sync_sale".to_string(),
            club_id: club_id.clone(),
            processed_at: now_rfc,
            response_summary: response_summary.clone(),
        },
    );

    append_audit(
        &mut db,
        "heitz-sync",
        "heitz.sale.client_conversion",
        format!(
            "Conversion Client via Heitz ({}, scope={}) : {} ({})",
            club_id, target_scope, pname, payload.offer_name
        ),
        club_id_to_audit_site_id(&club_id),
        &club_id,
        Some(prev_stage),
        Some(format!("Client ({})", target_scope)),
    );

    if let Err(err_msg) = persist_state(&state.data_dir, &db) {
        *db = snapshot;
        return Err(err_resp(
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Échec persistance conversion Client : {}", err_msg),
        ));
    }

    Ok(Json(response_summary))
}

pub fn is_commercial_available_for_club(
    db: &AppDatabaseState,
    emp_id: &str,
    club_id: &str,
    now: DateTime<Utc>,
) -> bool {
    let site_id = club_id_to_audit_site_id(club_id);
    let Some(timezone) = db
        .sites
        .iter()
        .find(|s| s.id == site_id)
        .and_then(|s| s.timezone.parse::<chrono_tz::Tz>().ok())
    else {
        return false;
    };
    let today = now.with_timezone(&timezone).date_naive();

    let has_active_account = db.employees.iter().any(|e| {
        e.id == emp_id
            && e.active
            && e.site_accesses.iter().any(|a| a.site_id == site_id)
    });
    if !has_active_account {
        return false;
    }

    let is_on_leave = db.leave_requests.iter().any(|lr| {
        if lr.employee_id != emp_id
            || lr.site_id != site_id
            || !matches!(
                lr.status.trim().to_lowercase().as_str(),
                "approved" | "accepted" | "valide" | "validé"
            )
        {
            return false;
        }
        match (
            NaiveDate::parse_from_str(&lr.start_date, "%Y-%m-%d"),
            NaiveDate::parse_from_str(&lr.end_date, "%Y-%m-%d"),
        ) {
            (Ok(start), Ok(end)) if start <= end => start <= today && end >= today,
            _ => true,
        }
    });

    !is_on_leave
}

pub fn resolve_best_commercial_for_club(
    db: &AppDatabaseState,
    club_id: &str,
    now: DateTime<Utc>,
    exclude_emp: Option<&str>,
) -> String {
    let site_id = club_id_to_audit_site_id(club_id);
    let Some(timezone) = db
        .sites
        .iter()
        .find(|s| s.id == site_id)
        .and_then(|s| s.timezone.parse::<chrono_tz::Tz>().ok())
    else {
        return format!("file_attente_{}", club_id);
    };
    let today = now.with_timezone(&timezone).date_naive();
    let candidates = if club_id == "beynost" {
        vec!["emp-chloe", "emp-greg", "emp-sarah"]
    } else {
        vec!["emp-maxime", "emp-karim", "emp-sarah"]
    };

    candidates
        .into_iter()
        .filter(|emp_id| {
            if let Some(exc) = exclude_emp {
                if *emp_id == exc {
                    return false;
                }
            }
            db.employees.iter().any(|employee| {
                employee.id == *emp_id
                    && employee.active
                    && employee
                        .site_accesses
                        .iter()
                        .any(|access| access.site_id == site_id)
            }) && !db.leave_requests.iter().any(|lr| {
                if lr.employee_id != *emp_id
                    || lr.site_id != site_id
                    || !matches!(
                        lr.status.trim().to_lowercase().as_str(),
                        "approved" | "accepted" | "valide" | "validé"
                    )
                {
                    return false;
                }
                match (
                    NaiveDate::parse_from_str(&lr.start_date, "%Y-%m-%d"),
                    NaiveDate::parse_from_str(&lr.end_date, "%Y-%m-%d"),
                ) {
                    (Ok(start), Ok(end)) if start <= end => start <= today && end >= today,
                    _ => true,
                }
            })
        })
        .min_by_key(|emp_id| {
            let active_count = db
                .lead_prospects
                .iter()
                .filter(|prospect| {
                    prospect.club_id == club_id
                        && prospect.assigned_to_id.as_deref() == Some(*emp_id)
                        && !prospect.is_archived
                        && !matches!(
                            prospect.stage.as_str(),
                            "Client"
                                | "Client enseigne"
                                | "Perdu"
                                | "Perdu / Sans suite"
                                | "Archivé"
                                | "Froid"
                        )
                })
                .count();

            let latest_touch = db
                .lead_prospects
                .iter()
                .filter(|p| {
                    p.club_id == club_id
                        && p.assigned_to_id.as_deref() == Some(*emp_id)
                        && !p.is_archived
                })
                .filter_map(|p| p.last_commercial_touch_at.as_deref().or(Some(&p.created_at)))
                .max()
                .unwrap_or("");

            (active_count, latest_touch)
        })
        .map(str::to_string)
        .unwrap_or_else(|| format!("file_attente_{}", club_id))
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct RebalanceStalePayload {
    pub club_id: Option<String>,
    pub threshold_days: Option<u32>,
}

pub(crate) async fn post_rebalance_stale_prospects(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Json(payload): Json<RebalanceStalePayload>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let (actor_id, _) = resolve_session_actor(&state, &headers).await?;
    let authorized_clubs = {
        let db = state.db.read().await;
        lead_archiving_authorized_clubs(&db, &actor_id)
    };

    let target_clubs = match payload.club_id.as_deref().map(|s| s.trim()).filter(|s| !s.is_empty()) {
        None | Some("all") => {
            if authorized_clubs.is_empty() {
                return Err(err_resp(
                    StatusCode::FORBIDDEN,
                    "Réattribution automatique refusée (403) : aucun club habilité.",
                ));
            }
            authorized_clubs
        }
        Some(club_id) => {
            if !is_valid_club_id(club_id) {
                return Err(err_resp(StatusCode::BAD_REQUEST, "Identifiant de club invalide."));
            }
            if !authorized_clubs.iter().any(|c| c == club_id) {
                return Err(err_resp(
                    StatusCode::FORBIDDEN,
                    format!("Réattribution automatique refusée (403) sur le club {}.", club_id),
                ));
            }
            vec![club_id.to_string()]
        }
    };

    let threshold_days = payload.threshold_days.unwrap_or(3).max(1);
    let now = Utc::now();
    let mut reassigned_ids: Vec<String> = Vec::new();
    let mut alert_events: Vec<(String, String, String, String, String)> = Vec::new();

    {
        let mut db = state.db.write().await;
        let snapshot = db.clone();

        for club_id in &target_clubs {
            for idx in 0..db.lead_prospects.len() {
                let prospect = &db.lead_prospects[idx];
                if prospect.club_id != *club_id || prospect.is_archived {
                    continue;
                }
                if matches!(
                    prospect.stage.as_str(),
                    "Client" | "Client enseigne" | "Perdu" | "Perdu / Sans suite" | "Archivé" | "Froid"
                ) {
                    continue;
                }

                let current_assignee = prospect.assigned_to_id.as_deref().unwrap_or("");
                let is_unassigned = current_assignee.is_empty() || current_assignee.starts_with("file_attente_");
                let is_assignee_unavailable = !is_unassigned
                    && !is_commercial_available_for_club(&db, current_assignee, club_id, now);
                let days_inactive = compute_days_since_commercial_activity(prospect, now).unwrap_or(0);
                let is_stale = days_inactive >= threshold_days as i64;

                if is_unassigned || is_assignee_unavailable || is_stale {
                    let exclude_current = if is_stale && !is_assignee_unavailable {
                        Some(current_assignee)
                    } else {
                        None
                    };
                    let best_commercial = resolve_best_commercial_for_club(&db, club_id, now, exclude_current);
                    if !best_commercial.starts_with("file_attente_") && best_commercial != current_assignee {
                        let old_assigned = if current_assignee.is_empty() {
                            "non assigné".to_string()
                        } else {
                            current_assignee.to_string()
                        };
                        let new_assigned = best_commercial.clone();
                        let p = &mut db.lead_prospects[idx];
                        p.assigned_to_id = Some(new_assigned.clone());
                        let full_name = format!("{} {}", p.first_name, p.last_name).trim().to_string();
                        let pid = p.id.clone();
                        reassigned_ids.push(pid.clone());
                        alert_events.push((
                            club_id.clone(),
                            pid,
                            full_name,
                            old_assigned,
                            new_assigned,
                        ));
                    }
                }
            }
        }

        for (cid, pid, pname, old_ass, new_ass) in &alert_events {
            append_audit(
                &mut db,
                &actor_id,
                "lead.pool.reassign",
                format!("Réaffectation automatique prospect {} ({}) de {} vers {}", pid, pname, old_ass, new_ass),
                club_id_to_audit_site_id(cid),
                pid,
                Some(old_ass.clone()),
                Some(new_ass.clone()),
            );
            emit_lead_alert_if_enabled(
                &mut db,
                cid,
                "LEAD-REBALANCE",
                "commercial_reassigned",
                "app",
                format!("Prospect réaffecté : {}", pname),
                format!("Le prospect {} vous a été réaffecté (anciennement : {}) pour relance.", pname, old_ass),
                Some(pid.clone()),
                vec![new_ass.clone()],
                vec![],
            );
        }

        if let Err(err_msg) = persist_state(&state.data_dir, &db) {
            *db = snapshot;
            return Err(err_resp(
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Erreur lors de la sauvegarde de la réattribution : {}", err_msg),
            ));
        }
    }

    Ok(Json(json!({
        "ok": true,
        "clubsProcessed": target_clubs,
        "reassignedCount": reassigned_ids.len(),
        "reassignedIds": reassigned_ids,
        "thresholdDaysApplied": threshold_days
    })))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TransferProspectPayload {
    pub target_club_id: String,
    #[serde(default)]
    pub reason: Option<String>,
}

pub(crate) async fn post_transfer_prospect(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Path(prospect_id): Path<String>,
    Json(payload): Json<TransferProspectPayload>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let (actor_id, _) = resolve_session_actor(&state, &headers).await?;
    let target_club = payload.target_club_id.trim();
    if !is_valid_club_id(target_club) {
        return Err(err_resp(StatusCode::BAD_REQUEST, "Club de destination invalide."));
    }

    let mut db = state.db.write().await;
    let snapshot = db.clone();

    let (source_club, prospect_name) = {
        let prospect = db
            .lead_prospects
            .iter()
            .find(|p| p.id == prospect_id)
            .ok_or_else(|| err_resp(StatusCode::NOT_FOUND, "Prospect introuvable."))?;
        (
            prospect.club_id.clone(),
            format!("{} {}", prospect.first_name, prospect.last_name).trim().to_string(),
        )
    };

    if source_club == target_club {
        return Err(err_resp(
            StatusCode::BAD_REQUEST,
            "Le club de destination doit être différent du club actuel.",
        ));
    }

    let source_ok = actor_has_lead_admin_write_on_club(&db, &actor_id, &source_club);
    let target_ok = actor_has_lead_admin_write_on_club(&db, &actor_id, target_club);
    if !source_ok || !target_ok {
        return Err(err_resp(
            StatusCode::FORBIDDEN,
            "Transfert refusé (403) : habilitation requise sur les deux clubs.",
        ));
    }

    let target_commercial = crate::routes::resolve_available_commercial_for_club(&db, target_club);
    let reason_str = payload.reason.as_deref().unwrap_or("Transfert inter-clubs").trim();

    if let Some(p) = db.lead_prospects.iter_mut().find(|p| p.id == prospect_id) {
        p.club_id = target_club.to_string();
        p.assigned_to_id = Some(target_commercial.clone());
        p.last_commercial_touch_at = None;
    }

    append_audit(
        &mut db,
        &actor_id,
        "lead.prospect.transfer",
        format!(
            "Transfert prospect {} ({}) de {} vers {} : {}",
            prospect_id, prospect_name, source_club, target_club, reason_str
        ),
        club_id_to_audit_site_id(&source_club),
        &prospect_id,
        Some(source_club.clone()),
        Some(target_club.to_string()),
    );

    emit_lead_alert_if_enabled(
        &mut db,
        target_club,
        "LEAD-TRANSFER",
        "prospect_transferred",
        "app",
        format!("Nouveau prospect transféré : {}", prospect_name),
        format!(
            "Le prospect {} a été transféré depuis {} (motif : {}).",
            prospect_name, source_club, reason_str
        ),
        Some(prospect_id.clone()),
        vec![target_commercial.clone()],
        vec![],
    );

    if let Err(err_msg) = persist_state(&state.data_dir, &db) {
        *db = snapshot;
        return Err(err_resp(
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Erreur lors de la sauvegarde du transfert : {}", err_msg),
        ));
    }

    Ok(Json(json!({
        "ok": true,
        "prospectId": prospect_id,
        "sourceClubId": source_club,
        "targetClubId": target_club,
        "assignedTo": target_commercial,
        "reason": reason_str
    })))
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct ConversionStatsQuery {
    pub club_id: Option<String>,
}

pub(crate) async fn get_lead_conversion_stats(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Query(query): Query<ConversionStatsQuery>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let (actor_id, _) = resolve_session_actor(&state, &headers).await?;
    let db = state.db.read().await;
    let allowed_clubs = authorized_clubs_for_actor(&db, &actor_id);

    if let Some(ref requested_club) = query.club_id {
        if requested_club != "all" {
            if !is_valid_club_id(requested_club) {
                return Err(err_resp(StatusCode::BAD_REQUEST, "Identifiant de club invalide."));
            }
            if !allowed_clubs.contains(requested_club) {
                return Err(err_resp(
                    StatusCode::FORBIDDEN,
                    format!("Accès refusé (403) aux statistiques du club {}.", requested_club),
                ));
            }
        }
    }

    let clubs_in_scope: Vec<&str> = match query.club_id.as_deref() {
        Some("all") | None => KNOWN_CLUBS
            .iter()
            .filter(|c| allowed_clubs.contains(&c.to_string()))
            .copied()
            .collect(),
        Some(c) => vec![c],
    };

    let now = Utc::now();
    let mut total_prospects = 0;
    let mut active_count = 0;
    let mut converted_count = 0;
    let mut lost_count = 0;
    let mut archived_count = 0;
    let mut stale_count = 0;
    let mut unassigned_count = 0;

    use std::collections::HashMap;
    #[derive(Default, serde::Serialize)]
    #[serde(rename_all = "camelCase")]
    struct CommercialStats {
        employee_id: String,
        active_leads: usize,
        converted_leads: usize,
        stale_leads: usize,
    }

    let mut commercial_map: HashMap<String, CommercialStats> = HashMap::new();

    for prospect in &db.lead_prospects {
        if !clubs_in_scope.contains(&prospect.club_id.as_str()) {
            continue;
        }
        total_prospects += 1;

        let is_converted = matches!(prospect.stage.as_str(), "Client" | "Client enseigne")
            || prospect.converted_offer.is_some();
        let is_lost = matches!(prospect.stage.as_str(), "Perdu" | "Perdu / Sans suite");

        if is_converted {
            converted_count += 1;
        } else if is_lost {
            lost_count += 1;
        } else if prospect.is_archived || prospect.stage == "Archivé" {
            archived_count += 1;
        } else {
            active_count += 1;
            let days_inact = compute_days_since_commercial_activity(prospect, now).unwrap_or(0);
            if days_inact >= 3 {
                stale_count += 1;
            }
        }

        let assigned = prospect.assigned_to_id.as_deref().unwrap_or("");
        if assigned.is_empty() || assigned.starts_with("file_attente_") {
            if !is_converted && !is_lost && !prospect.is_archived {
                unassigned_count += 1;
            }
        } else {
            let entry = commercial_map.entry(assigned.to_string()).or_insert_with(|| CommercialStats {
                employee_id: assigned.to_string(),
                active_leads: 0,
                converted_leads: 0,
                stale_leads: 0,
            });
            if is_converted {
                entry.converted_leads += 1;
            } else if !is_lost && !prospect.is_archived {
                entry.active_leads += 1;
                let days_inact = compute_days_since_commercial_activity(prospect, now).unwrap_or(0);
                if days_inact >= 3 {
                    entry.stale_leads += 1;
                }
            }
        }
    }

    let conversion_rate = if total_prospects > 0 {
        ((converted_count as f64 / total_prospects as f64) * 1000.0).round() / 10.0
    } else {
        0.0
    };

    let mut commercial_breakdown: Vec<CommercialStats> = commercial_map.into_values().collect();
    commercial_breakdown.sort_by(|a, b| b.active_leads.cmp(&a.active_leads));

    Ok(Json(json!({
        "ok": true,
        "clubsInScope": clubs_in_scope,
        "stats": {
            "totalProspects": total_prospects,
            "activeLeads": active_count,
            "convertedLeads": converted_count,
            "lostLeads": lost_count,
            "archivedLeads": archived_count,
            "staleLeads": stale_count,
            "unassignedLeads": unassigned_count,
            "conversionRatePercent": conversion_rate,
            "commercialBreakdown": commercial_breakdown
        }
    })))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::routes::{api_router, SharedAppState};
    use crate::seed::load_or_init_state;
    use hmac::{Hmac, Mac};
    use sha2::Sha256;
    use std::path::PathBuf;
    use std::sync::Arc;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    use tokio::sync::RwLock;

    fn make_isolated_dir(tag: &str) -> PathBuf {
        static SEQ: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(1);
        let id = SEQ.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        std::env::temp_dir().join(format!(
            "cfos_lead_auto_{}_{}_{}",
            tag,
            Utc::now().timestamp_nanos_opt().unwrap_or_default(),
            id
        ))
    }

    fn state_for_dir(data_dir: PathBuf) -> SharedState {
        let initial = load_or_init_state(&data_dir);
        Arc::new(SharedAppState {
            db: RwLock::new(initial),
            data_dir,
            sessions: RwLock::new(std::collections::HashMap::new()),
            login_attempts: RwLock::new(std::collections::HashMap::new()),
        })
    }

    async fn spawn_http_server(state: SharedState) -> (String, tokio::task::JoinHandle<()>) {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        let app = api_router(state);
        let handle = tokio::spawn(async move {
            let _ = axum::serve(listener, app).await;
        });
        (format!("127.0.0.1:{}", addr.port()), handle)
    }

    fn decode_chunked_body(raw: &[u8]) -> Vec<u8> {
        let mut out = Vec::new();
        let mut pos = 0;
        while pos < raw.len() {
            let Some(rel_end) = raw[pos..].windows(2).position(|w| w == b"\r\n") else {
                break;
            };
            let size_str = std::str::from_utf8(&raw[pos..pos + rel_end]).unwrap_or("0").trim();
            let size_hex = size_str.split(';').next().unwrap_or("0").trim();
            let chunk_len = usize::from_str_radix(size_hex, 16).unwrap_or(0);
            pos += rel_end + 2;
            if chunk_len == 0 {
                break;
            }
            if pos + chunk_len <= raw.len() {
                out.extend_from_slice(&raw[pos..pos + chunk_len]);
                pos += chunk_len + 2;
            } else {
                break;
            }
        }
        out
    }

    async fn http_req(
        addr: &str,
        method: &str,
        path: &str,
        headers: &[(&str, &str)],
        body: Option<&[u8]>,
    ) -> (u16, Value) {
        let mut stream = tokio::net::TcpStream::connect(addr).await.unwrap();
        let payload = body.unwrap_or(&[]);
        let mut req = format!(
            "{} {} HTTP/1.1\r\nHost: {}\r\nConnection: close\r\nContent-Length: {}\r\n",
            method,
            path,
            addr,
            payload.len()
        );
        let has_ct = headers
            .iter()
            .any(|(k, _)| k.eq_ignore_ascii_case("content-type"));
        if !has_ct && body.is_some() {
            req.push_str("Content-Type: application/json\r\n");
        }
        for (k, v) in headers {
            req.push_str(&format!("{}: {}\r\n", k, v));
        }
        req.push_str("\r\n");

        stream.write_all(req.as_bytes()).await.unwrap();
        if !payload.is_empty() {
            stream.write_all(payload).await.unwrap();
        }
        stream.flush().await.unwrap();

        let mut buf = Vec::new();
        stream.read_to_end(&mut buf).await.unwrap();

        let split_pos = buf
            .windows(4)
            .position(|w| w == b"\r\n\r\n")
            .expect("Invalid HTTP response");
        let head = std::str::from_utf8(&buf[..split_pos]).unwrap();
        let mut lines = head.lines();
        let status_line = lines.next().unwrap();
        let status: u16 = status_line
            .split_whitespace()
            .nth(1)
            .unwrap()
            .parse()
            .unwrap();
        let is_chunked = lines.any(|l| {
            let low = l.to_ascii_lowercase();
            low.starts_with("transfer-encoding:") && low.contains("chunked")
        });
        let raw_body = &buf[split_pos + 4..];
        let body_bytes = if is_chunked {
            decode_chunked_body(raw_body)
        } else {
            raw_body.to_vec()
        };
        let json_val = serde_json::from_slice(&body_bytes)
            .unwrap_or_else(|_| json!({ "raw": String::from_utf8_lossy(&body_bytes).to_string() }));
        (status, json_val)
    }

    async fn http_login(addr: &str, emp_id: &str, pin: &str) -> String {
        let body = serde_json::to_vec(&json!({
            "emailOrId": emp_id,
            "pinOrPassword": pin,
            "roleRequested": "auto"
        }))
        .unwrap();
        let (status, res) = http_req(addr, "POST", "/api/auth/login", &[], Some(&body)).await;
        assert_eq!(status, 200, "login failed for {}: {:?}", emp_id, res);
        res["sessionToken"].as_str().unwrap().to_string()
    }

    fn sign_webhook_body(secret: &str, ts: i64, raw_body: &[u8]) -> String {
        let mut mac = Hmac::<Sha256>::new_from_slice(secret.as_bytes()).unwrap();
        let mut signed = format!("{}.", ts).into_bytes();
        signed.extend_from_slice(raw_body);
        mac.update(&signed);
        format!("t={},v1={}", ts, hex::encode(mac.finalize().into_bytes()))
    }

    fn make_prospect(
        id: &str,
        club_id: &str,
        email: &str,
        phone: &str,
        assigned_to: Option<&str>,
        created_at: &str,
    ) -> LeadProspectRecord {
        LeadProspectRecord {
            id: id.into(),
            gender: "F".into(),
            first_name: "Test".into(),
            last_name: id.into(),
            email: email.into(),
            phone: phone.into(),
            street: "".into(),
            postal_code: "".into(),
            city: "".into(),
            birth_date: "".into(),
            comment: "Historique initial".into(),
            club_id: club_id.into(),
            source: "Site".into(),
            stage: "Contacté".into(),
            lead_status: "Contacté".into(),
            rgpd_consent: true,
            segments: vec!["VIP".into()],
            trial_date: None,
            assigned_to_id: assigned_to.map(|s| s.to_string()),
            last_visit_at: None,
            days_without_visit: 0,
            last_inbound_reply_at: None,
            archived_at: None,
            converted_offer: None,
            is_archived: false,
            archive_reason: None,
            client_scope: None,
            client_club_ids: vec![],
            has_active_vacation: false,
            last_commercial_touch_at: None,
            created_at: created_at.into(),
        }
    }

    #[tokio::test]
    async fn http_archiving_rbac_and_club_isolation() {
        let dir = make_isolated_dir("rbac_arch");
        let state = state_for_dir(dir.clone());
        let old_date = (Utc::now() - Duration::days(45)).format("%Y-%m-%d").to_string();

        {
            let mut db = state.db.write().await;
            db.lead_prospects.push(make_prospect(
                "pr-cds-old",
                "carre-de-soie",
                "cds.old@exemple.fr",
                "0601020304",
                Some("emp-maxime"),
                &old_date,
            ));
            db.lead_prospects.push(make_prospect(
                "pr-bey-old",
                "beynost",
                "bey.old@exemple.fr",
                "0601020305",
                Some("emp-chloe"),
                &old_date,
            ));
        }

        let (addr, srv) = spawn_http_server(state.clone()).await;

        let tok_maxime = http_login(&addr, "emp-maxime", "4210").await; // Commercial (CDS std / BEY emp)
        let tok_sarah = http_login(&addr, "emp-sarah", "3141").await; // Manager CDS uniquement
        let tok_mario = http_login(&addr, "emp-mario", "1010").await; // Admin 2 clubs

        // Commercial : refusé partout (omission, "all", club précis)
        for payload in [json!({}), json!({ "clubId": "all" }), json!({ "clubId": "carre-de-soie" })] {
            let b = serde_json::to_vec(&payload).unwrap();
            let (st, _) = http_req(
                &addr,
                "POST",
                "/api/lead/automations/run-archiving",
                &[("Authorization", &format!("Bearer {}", tok_maxime))],
                Some(&b),
            )
            .await;
            assert_eq!(st, 403);
        }

        // Manager Sarah (habilitée CDS uniquement) : 403 sur beynost
        let b_bey = serde_json::to_vec(&json!({ "clubId": "beynost" })).unwrap();
        let (st, _) = http_req(
            &addr,
            "POST",
            "/api/lead/automations/run-archiving",
            &[("Authorization", &format!("Bearer {}", tok_sarah))],
            Some(&b_bey),
        )
        .await;
        assert_eq!(st, 403);

        // Manager Sarah avec "all" : n'archive QUE carre-de-soie, jamais beynost
        let b_all = serde_json::to_vec(&json!({ "clubId": "all" })).unwrap();
        let (st, body) = http_req(
            &addr,
            "POST",
            "/api/lead/automations/run-archiving",
            &[("Authorization", &format!("Bearer {}", tok_sarah))],
            Some(&b_all),
        )
        .await;
        assert_eq!(st, 200);
        assert_eq!(body["archivedCount"], 1);
        assert_eq!(body["clubsProcessed"], json!(["carre-de-soie"]));
        {
            let db = state.db.read().await;
            assert!(db.lead_prospects.iter().find(|p| p.id == "pr-cds-old").unwrap().is_archived);
            assert!(!db.lead_prospects.iter().find(|p| p.id == "pr-bey-old").unwrap().is_archived);
        }

        // Admin Mario avec payload vide (all) : traite beynost restant
        let (st, body) = http_req(
            &addr,
            "POST",
            "/api/lead/automations/run-archiving",
            &[("Authorization", &format!("Bearer {}", tok_mario))],
            Some(b"{}"),
        )
        .await;
        assert_eq!(st, 200);
        assert_eq!(body["archivedCount"], 1);
        assert!(state
            .db
            .read()
            .await
            .lead_prospects
            .iter()
            .find(|p| p.id == "pr-bey-old")
            .unwrap()
            .is_archived);

        srv.abort();
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[tokio::test]
    async fn http_archiving_business_rules_inbound_delay_and_froid_target() {
        let dir = make_isolated_dir("rules_froid");
        let state = state_for_dir(dir.clone());
        let old_date = (Utc::now() - Duration::days(45)).format("%Y-%m-%d").to_string();
        let recent_iso = (Utc::now() - Duration::days(2)).to_rfc3339();
        let old_iso = (Utc::now() - Duration::days(40)).to_rfc3339();

        {
            let mut db = state.db.write().await;
            if let Some(cfg) = db.lead_settings_by_club.get_mut("carre-de-soie") {
                cfg["archiveTargetStage"] = json!("Froid");
            }
            // Cas A : 0 visite portillon (days_without_visit=0) + aucune réponse depuis 45j -> DOIT être classé Froid
            db.lead_prospects.push(make_prospect(
                "pr-never-visited",
                "carre-de-soie",
                "never@exemple.fr",
                "0611000001",
                Some("emp-maxime"),
                &old_date,
            ));
            // Cas B : days_without_visit=60 MAIS réponse entrante il y a 2j -> NE DOIT PAS être archivé
            let mut p_recent = make_prospect(
                "pr-active-reply",
                "carre-de-soie",
                "recent@exemple.fr",
                "0611000002",
                Some("emp-maxime"),
                &old_date,
            );
            p_recent.days_without_visit = 60;
            p_recent.last_inbound_reply_at = Some(recent_iso);
            db.lead_prospects.push(p_recent);

            // Cas C : réponse entrante ANCIENNE (40j >= 30j) -> DOIT être archivé (ne bloque plus définitivement)
            let mut p_old_reply = make_prospect(
                "pr-old-reply",
                "carre-de-soie",
                "oldreply@exemple.fr",
                "0611000003",
                Some("emp-maxime"),
                &old_date,
            );
            p_old_reply.last_inbound_reply_at = Some(old_iso);
            db.lead_prospects.push(p_old_reply);
        }

        let (addr, srv) = spawn_http_server(state.clone()).await;
        let tok_admin = http_login(&addr, "emp-mario", "1010").await;

        let b_cds = serde_json::to_vec(&json!({ "clubId": "carre-de-soie" })).unwrap();
        let (st, res1) = http_req(
            &addr,
            "POST",
            "/api/lead/automations/run-archiving",
            &[("Authorization", &format!("Bearer {}", tok_admin))],
            Some(&b_cds),
        )
        .await;
        assert_eq!(st, 200);
        assert_eq!(res1["archivedCount"], 2);

        // 2e exécution : les prospects passés en "Froid" (is_archived=true) NE SONT PLUS retraités
        let (st2, res2) = http_req(
            &addr,
            "POST",
            "/api/lead/automations/run-archiving",
            &[("Authorization", &format!("Bearer {}", tok_admin))],
            Some(&b_cds),
        )
        .await;
        assert_eq!(st2, 200);
        assert_eq!(res2["archivedCount"], 0);

        {
            let db = state.db.read().await;
            let pa = db.lead_prospects.iter().find(|p| p.id == "pr-never-visited").unwrap();
            assert_eq!(pa.stage, "Froid");
            assert!(pa.is_archived);
            assert!(!db.lead_prospects.iter().find(|p| p.id == "pr-active-reply").unwrap().is_archived);
            assert!(db.lead_prospects.iter().find(|p| p.id == "pr-old-reply").unwrap().is_archived);

            // Vérifier que le commercial assigné est bien présent dans recipientEmployeeIds et pas mélangé avec des emails
            let alert = db
                .lead_alerts
                .iter()
                .find(|a| a.event_type == "archived" && a.prospect_id.as_deref() == Some("pr-never-visited"))
                .unwrap();
            assert!(alert.recipient_employee_ids.contains(&"emp-maxime".to_string()));
            assert!(alert.recipient_employee_ids.iter().all(|id| !id.contains('@')));
        }

        // Réponse entrante sur le prospect en "Froid" -> le réactive vers "À relancer" et remet is_archived=false
        let reply_payload = serde_json::to_vec(&json!({
            "eventId": "evt-reply-froid-1",
            "clubId": "carre-de-soie",
            "prospectId": "pr-never-visited",
            "channel": "whatsapp",
            "messagePreview": "Je souhaite finalement visiter"
        }))
        .unwrap();
        let ts = Utc::now().timestamp();
        let sig = sign_webhook_body("CFITNESS-DEMO-INBOUND-SECRET", ts, &reply_payload);
        let (st3, res3) = http_req(
            &addr,
            "POST",
            "/api/lead/webhooks/inbound-reply",
            &[("x-cfitness-signature", &sig)],
            Some(&reply_payload),
        )
        .await;
        assert_eq!(st3, 200);
        assert_eq!(res3["reactivatedFromArchive"], true);
        assert_eq!(res3["newStage"], "À relancer");

        srv.abort();
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[tokio::test]
    async fn http_alerts_visibility_ack_rbac_and_enabled_alert_ids() {
        let dir = make_isolated_dir("alerts_rbac");
        let state = state_for_dir(dir.clone());
        let old_date = (Utc::now() - Duration::days(45)).format("%Y-%m-%d").to_string();

        {
            let mut db = state.db.write().await;
            db.lead_prospects.push(make_prospect(
                "pr-cds-max",
                "carre-de-soie",
                "max@exemple.fr",
                "0622000001",
                Some("emp-maxime"),
                &old_date,
            ));
            db.lead_prospects.push(make_prospect(
                "pr-cds-karim",
                "carre-de-soie",
                "karim@exemple.fr",
                "0622000002",
                Some("emp-karim"),
                &old_date,
            ));
            db.lead_prospects.push(make_prospect(
                "pr-bey-chloe",
                "beynost",
                "chloe@exemple.fr",
                "0622000003",
                Some("emp-chloe"),
                &old_date,
            ));

            // LEAD-0551 activée à CDS, DÉSACTIVÉE à Beynost
            if let Some(cfg_bey) = db.lead_settings_by_club.get_mut("beynost") {
                cfg_bey["enabledAlertIds"] = json!(["LEAD-0545"]);
            }
        }

        let (addr, srv) = spawn_http_server(state.clone()).await;
        let tok_mario = http_login(&addr, "emp-mario", "1010").await;
        let tok_sarah = http_login(&addr, "emp-sarah", "3141").await; // Manager CDS
        let tok_maxime = http_login(&addr, "emp-maxime", "4210").await; // Commercial assigné pr-cds-max
        let tok_chloe = http_login(&addr, "emp-chloe", "5320").await; // Employée Beynost uniquement

        // Archivage sur les 2 clubs -> Beynost ne doit émettre AUCUNE alerte car LEAD-0551 est désactivée !
        let (st, _) = http_req(
            &addr,
            "POST",
            "/api/lead/automations/run-archiving",
            &[("Authorization", &format!("Bearer {}", tok_mario))],
            Some(b"{}"),
        )
        .await;
        assert_eq!(st, 200);

        let (st, mario_alerts) = http_req(
            &addr,
            "GET",
            "/api/lead/alerts?clubId=all",
            &[("Authorization", &format!("Bearer {}", tok_mario))],
            None,
        )
        .await;
        assert_eq!(st, 200);
        let list = mario_alerts["alerts"].as_array().unwrap();
        assert_eq!(list.len(), 2);
        assert!(list.iter().all(|a| a["clubId"] == "carre-de-soie"));

        let alert_max_id = list
            .iter()
            .find(|a| a["prospectId"] == "pr-cds-max")
            .unwrap()["id"]
            .as_str()
            .unwrap()
            .to_string();
        let alert_karim_id = list
            .iter()
            .find(|a| a["prospectId"] == "pr-cds-karim")
            .unwrap()["id"]
            .as_str()
            .unwrap()
            .to_string();

        // Chloé (Beynost uniquement) tente GET ?clubId=carre-de-soie -> 403
        let (st, _) = http_req(
            &addr,
            "GET",
            "/api/lead/alerts?clubId=carre-de-soie",
            &[("Authorization", &format!("Bearer {}", tok_chloe))],
            None,
        )
        .await;
        assert_eq!(st, 403);

        // Chloé tente d'acquitter par ID direct une alerte CDS -> 403
        let (st, _) = http_req(
            &addr,
            "POST",
            &format!("/api/lead/alerts/{}/ack", alert_max_id),
            &[("Authorization", &format!("Bearer {}", tok_chloe))],
            Some(b"{}"),
        )
        .await;
        assert_eq!(st, 403);

        // Maxime (commercial) tente d'acquitter l'alerte d'un collègue (Karim) -> 403
        let (st, _) = http_req(
            &addr,
            "POST",
            &format!("/api/lead/alerts/{}/ack", alert_karim_id),
            &[("Authorization", &format!("Bearer {}", tok_maxime))],
            Some(b"{}"),
        )
        .await;
        assert_eq!(st, 403);

        // Maxime ne voit QUE sa propre alerte dans GET /api/lead/alerts
        let (st, max_alerts) = http_req(
            &addr,
            "GET",
            "/api/lead/alerts",
            &[("Authorization", &format!("Bearer {}", tok_maxime))],
            None,
        )
        .await;
        assert_eq!(st, 200);
        assert_eq!(max_alerts["alerts"].as_array().unwrap().len(), 1);
        assert_eq!(max_alerts["alerts"][0]["id"], alert_max_id);

        // Maxime peut acquitter sa propre alerte (200)
        let (st, _) = http_req(
            &addr,
            "POST",
            &format!("/api/lead/alerts/{}/ack", alert_max_id),
            &[("Authorization", &format!("Bearer {}", tok_maxime))],
            Some(b"{}"),
        )
        .await;
        assert_eq!(st, 200);

        // Sarah (Manager CDS) voit toutes les alertes CDS et peut acquitter celle de Karim (200)
        let (st, _) = http_req(
            &addr,
            "POST",
            &format!("/api/lead/alerts/{}/ack", alert_karim_id),
            &[("Authorization", &format!("Bearer {}", tok_sarah))],
            Some(b"{}"),
        )
        .await;
        assert_eq!(st, 200);

        srv.abort();
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[tokio::test]
    async fn http_webhooks_auth_validation_cross_club_dedup_and_restart_persistence() {
        let dir = make_isolated_dir("webhooks_persist");
        let state = state_for_dir(dir.clone());
        let (addr, srv) = spawn_http_server(state.clone()).await;

        // 1. Sans authentification -> 401
        let valid_reply = serde_json::to_vec(&json!({
            "eventId": "evt-in-1",
            "clubId": "carre-de-soie",
            "prospectId": "pr-1",
            "channel": "whatsapp"
        }))
        .unwrap();
        let (st, _) = http_req(&addr, "POST", "/api/lead/webhooks/inbound-reply", &[], Some(&valid_reply)).await;
        assert_eq!(st, 401);

        let (st, _) = http_req(
            &addr,
            "POST",
            "/api/heitz/sync-sale",
            &[],
            Some(b"{\"eventId\":\"hz-1\",\"clubId\":\"carre-de-soie\",\"prospectId\":\"pr-1\",\"offerId\":\"HZ-CDS-ABO-PASS\",\"offerName\":\"Pass\"}"),
        )
        .await;
        assert_eq!(st, 401);

        // 2. Signature expirée ou invalide -> 401
        let expired_ts = Utc::now().timestamp() - 900;
        let expired_sig = sign_webhook_body("CFITNESS-DEMO-INBOUND-SECRET", expired_ts, &valid_reply);
        let (st, _) = http_req(
            &addr,
            "POST",
            "/api/lead/webhooks/inbound-reply",
            &[("x-cfitness-signature", &expired_sig)],
            Some(&valid_reply),
        )
        .await;
        assert_eq!(st, 401);

        // 3. Payload invalide (pas d'eventId) avec auth valide -> 400
        let now_ts = Utc::now().timestamp();
        let no_evt = b"{\"clubId\":\"carre-de-soie\",\"prospectId\":\"pr-1\"}";
        let sig_no_evt = sign_webhook_body("CFITNESS-DEMO-INBOUND-SECRET", now_ts, no_evt);
        let (st, _) = http_req(
            &addr,
            "POST",
            "/api/lead/webhooks/inbound-reply",
            &[("x-cfitness-signature", &sig_no_evt)],
            Some(no_evt),
        )
        .await;
        assert_eq!(st, 400);

        // 4. Rapprochement cross-club : prospectId="pr-1" (Carré de Soie) avec clubId="beynost" -> 404
        let cross_club = serde_json::to_vec(&json!({
            "eventId": "evt-cross-1",
            "clubId": "beynost",
            "prospectId": "pr-1",
            "channel": "whatsapp"
        }))
        .unwrap();
        let sig_cross = sign_webhook_body("CFITNESS-DEMO-INBOUND-SECRET", now_ts, &cross_club);
        let (st, _) = http_req(
            &addr,
            "POST",
            "/api/lead/webhooks/inbound-reply",
            &[("x-cfitness-signature", &sig_cross)],
            Some(&cross_club),
        )
        .await;
        assert_eq!(st, 404);

        // 5. Envoi authentique réussi sur pr-1 (Carré de Soie)
        let sig_ok = sign_webhook_body("CFITNESS-DEMO-INBOUND-SECRET", now_ts, &valid_reply);
        let (st, body) = http_req(
            &addr,
            "POST",
            "/api/lead/webhooks/inbound-reply",
            &[("x-cfitness-signature", &sig_ok)],
            Some(&valid_reply),
        )
        .await;
        assert_eq!(st, 200);
        assert_eq!(body["duplicate"], false);

        // Arrêt complet du serveur HTTP et rechargement depuis le disque (simulation redémarrage)
        srv.abort();
        drop(state);

        let restarted_state = state_for_dir(dir.clone());
        {
            let db = restarted_state.db.read().await;
            let pr1 = db.lead_prospects.iter().find(|p| p.id == "pr-1").unwrap();
            assert!(pr1.last_inbound_reply_at.is_some());
            // days_without_visit (5 dans le seed) n'a pas été écrasé par la réponse commerciale
            assert_eq!(pr1.days_without_visit, 5);
            assert!(db.processed_lead_events.iter().any(|e| e.event_key == "inbound:carre-de-soie:evt-in-1"));
        }

        let alerts_count_before = restarted_state.db.read().await.lead_alerts.len();
        let audit_count_before = restarted_state.db.read().await.audit_log.len();

        let (addr2, srv2) = spawn_http_server(restarted_state.clone()).await;

        // 6. Rejeu du même eventId après redémarrage -> duplicate: true, 0 nouvelle alerte, 0 nouvel audit
        let sig_replay = sign_webhook_body("CFITNESS-DEMO-INBOUND-SECRET", Utc::now().timestamp(), &valid_reply);
        let (st, replay_body) = http_req(
            &addr2,
            "POST",
            "/api/lead/webhooks/inbound-reply",
            &[("x-cfitness-signature", &sig_replay)],
            Some(&valid_reply),
        )
        .await;
        assert_eq!(st, 200);
        assert_eq!(replay_body["duplicate"], true);
        assert_eq!(replay_body["alreadyProcessed"], true);
        assert_eq!(restarted_state.db.read().await.lead_alerts.len(), alerts_count_before);
        assert_eq!(restarted_state.db.read().await.audit_log.len(), audit_count_before);

        srv2.abort();
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[tokio::test]
    async fn http_heitz_client_scope_club_vs_enseigne() {
        let dir = make_isolated_dir("heitz_scope");
        let state = state_for_dir(dir.clone());
        {
            let mut db = state.db.write().await;
            // 1) Paire au même email avec scope par défaut = "club"
            db.lead_prospects.push(make_prospect(
                "pr-club-cds",
                "carre-de-soie",
                "club.only@exemple.fr",
                "0699887701",
                Some("emp-maxime"),
                "2026-11-10",
            ));
            db.lead_prospects.push(make_prospect(
                "pr-club-bey",
                "beynost",
                "club.only@exemple.fr",
                "0699887701",
                Some("emp-chloe"),
                "2026-11-12",
            ));
            // 2) Paire au même email pour tester ensuite le scope "enseigne"
            db.lead_prospects.push(make_prospect(
                "pr-multi-cds",
                "carre-de-soie",
                "bi.club@exemple.fr",
                "0699887766",
                Some("emp-maxime"),
                "2026-11-10",
            ));
            db.lead_prospects.push(make_prospect(
                "pr-multi-bey",
                "beynost",
                "bi.club@exemple.fr",
                "0699887766",
                Some("emp-chloe"),
                "2026-11-12",
            ));
        }

        let (addr, srv) = spawn_http_server(state.clone()).await;
        let ts = Utc::now().timestamp();

        // Cas A : scope "club" -> seule la fiche Carré de Soie est convertie, Beynost reste Contacté
        let sale_club = serde_json::to_vec(&json!({
            "eventId": "hz-club-1",
            "clubId": "carre-de-soie",
            "prospectId": "pr-club-cds",
            "offerId": "HZ-CDS-ABO-PASS",
            "offerName": "Pass Liberté + Biocircuit 12 mois",
            "amountEur": 49.9
        }))
        .unwrap();
        let sig_club = sign_webhook_body("CFITNESS-LOCAL-HZ-TOKEN", ts, &sale_club);
        let (st_club, res_club) = http_req(
            &addr,
            "POST",
            "/api/heitz/sync-sale",
            &[("x-cfitness-signature", &sig_club)],
            Some(&sale_club),
        )
        .await;
        assert_eq!(st_club, 200);
        assert_eq!(res_club["converted"], true);
        assert_eq!(res_club["clientScope"], "club");
        {
            let mut db = state.db.write().await;
            let p_cds = db.lead_prospects.iter().find(|p| p.id == "pr-club-cds").unwrap();
            let p_bey = db.lead_prospects.iter().find(|p| p.id == "pr-club-bey").unwrap();
            assert_eq!(p_cds.stage, "Client");
            assert_eq!(p_cds.client_club_ids, vec!["carre-de-soie"]);
            assert_eq!(p_bey.stage, "Contacté");

            // Basculer maintenant clientPassTargetScope sur "enseigne" pour Carré de Soie
            if let Some(cfg) = db.lead_settings_by_club.get_mut("carre-de-soie") {
                cfg["clientPassTargetScope"] = json!("enseigne");
            }
        }

        // Cas B : scope "enseigne" -> convertit les deux fiches sans doublon ni perte d'historique
        let sale_body = serde_json::to_vec(&json!({
            "eventId": "hz-ens-1",
            "clubId": "carre-de-soie",
            "prospectId": "pr-multi-cds",
            "offerId": "HZ-CDS-ABO-PASS",
            "offerName": "Pass Liberté + Biocircuit 12 mois",
            "amountEur": 49.9
        }))
        .unwrap();
        let sig = sign_webhook_body("CFITNESS-LOCAL-HZ-TOKEN", ts, &sale_body);
        let (st, res) = http_req(
            &addr,
            "POST",
            "/api/heitz/sync-sale",
            &[("x-cfitness-signature", &sig)],
            Some(&sale_body),
        )
        .await;
        assert_eq!(st, 200);
        assert_eq!(res["converted"], true);
        assert_eq!(res["clientScope"], "enseigne");

        {
            let db = state.db.read().await;
            let p_cds = db.lead_prospects.iter().find(|p| p.id == "pr-multi-cds").unwrap();
            let p_bey = db.lead_prospects.iter().find(|p| p.id == "pr-multi-bey").unwrap();
            assert_eq!(p_cds.stage, "Client");
            assert_eq!(p_bey.stage, "Client");
            assert_eq!(p_bey.comment, "Historique initial"); // Historique conservé
            assert_eq!(p_bey.segments, vec!["VIP".to_string()]);
            assert_eq!(p_bey.client_club_ids, vec!["carre-de-soie", "beynost"]);
            // Pas de doublon créé
            assert_eq!(
                db.lead_prospects.iter().filter(|p| p.email == "bi.club@exemple.fr").count(),
                2
            );
        }

        srv.abort();
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[tokio::test]
    async fn http_appointment_reminders_24h_and_scheduler_status() {
        let dir = make_isolated_dir("rdv_sched");
        let state = state_for_dir(dir.clone());

        // Calculer une date/heure locale Europe/Paris dans ~12h par rapport à maintenant
        let now = Utc::now();
        let target_paris = now + Duration::hours(13); // UTC+1/+2 -> entre now et now+24h
        let slot_date = target_paris.format("%Y-%m-%d").to_string();
        let slot_time = target_paris.format("%H:%M").to_string();

        {
            let mut db = state.db.write().await;
            db.lead_appointments.clear();
            db.lead_appointments.push(crate::models::LeadAppointmentRecord {
                id: "slot-j1-test".into(),
                club_id: "carre-de-soie".into(),
                coach_id: "emp-karim".into(),
                type_name: "Séance Découverte Coaching".into(),
                prospect_id: Some("pr-1".into()),
                prospect_name: Some("Camille Garnier".into()),
                prospect_email: Some("camille.garnier@exemple.fr".into()),
                activity_id: None,
                date: slot_date,
                start_time: slot_time,
                duration_minutes: 60,
                capacity_max: 1,
                current_booked_count: 1,
                payment_status: "non_requis".into(),
                status: "confirme".into(),
            });
        }

        let (addr, srv) = spawn_http_server(state.clone()).await;
        let tok_maxime = http_login(&addr, "emp-maxime", "4210").await;
        let tok_mario = http_login(&addr, "emp-mario", "1010").await;

        // Commercial interdit (403) sur scheduler-status et run-reminders
        let (st, _) = http_req(
            &addr,
            "GET",
            "/api/lead/automations/scheduler-status",
            &[("Authorization", &format!("Bearer {}", tok_maxime))],
            None,
        )
        .await;
        assert_eq!(st, 403);

        let (st, _) = http_req(
            &addr,
            "POST",
            "/api/lead/automations/run-reminders",
            &[("Authorization", &format!("Bearer {}", tok_maxime))],
            Some(b"{}"),
        )
        .await;
        assert_eq!(st, 403);

        // Manager/Admin OK -> émet SMS LEAD-0545 + Email LEAD-0548 en mode simulation
        let (st, res) = http_req(
            &addr,
            "POST",
            "/api/lead/automations/run-reminders",
            &[("Authorization", &format!("Bearer {}", tok_mario))],
            Some(b"{\"clubId\":\"carre-de-soie\"}"),
        )
        .await;
        assert_eq!(st, 200);
        assert_eq!(res["remindersEmitted"], 2);
        assert_eq!(res["simulationMode"], true);

        // 2e exécution -> dédupliquée (0 nouveau rappel)
        let (st2, res2) = http_req(
            &addr,
            "POST",
            "/api/lead/automations/run-reminders",
            &[("Authorization", &format!("Bearer {}", tok_mario))],
            Some(b"{\"clubId\":\"carre-de-soie\"}"),
        )
        .await;
        assert_eq!(st2, 200);
        assert_eq!(res2["remindersEmitted"], 0);

        let (st_sched, sched_json) = http_req(
            &addr,
            "GET",
            "/api/lead/automations/scheduler-status",
            &[("Authorization", &format!("Bearer {}", tok_mario))],
            None,
        )
        .await;
        assert_eq!(st_sched, 200);
        assert_eq!(sched_json["scheduler"]["timezone"], "Europe/Paris");

        // Arrêt complet puis redémarrage depuis le disque : déduplication rappels J-1 toujours active
        srv.abort();
        drop(state);

        let restarted_state = state_for_dir(dir.clone());
        let (addr2, srv2) = spawn_http_server(restarted_state.clone()).await;
        let tok_mario_2 = http_login(&addr2, "emp-mario", "1010").await;
        let (st3, res3) = http_req(
            &addr2,
            "POST",
            "/api/lead/automations/run-reminders",
            &[("Authorization", &format!("Bearer {}", tok_mario_2))],
            Some(b"{\"clubId\":\"carre-de-soie\"}"),
        )
        .await;
        assert_eq!(st3, 200);
        assert_eq!(res3["remindersEmitted"], 0);

        srv2.abort();
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[tokio::test]
    async fn http_disk_failure_rolls_back_memory_and_audit_cleanly() {
        let base_dir = make_isolated_dir("disk_fail");
        std::fs::create_dir_all(&base_dir).unwrap();
        let blocker_file = base_dir.join("not_a_directory");
        std::fs::write(&blocker_file, b"lock").unwrap();

        let state = Arc::new(SharedAppState {
            db: RwLock::new(crate::seed::create_initial_seed_state()),
            // Pointer data_dir sur un fichier régulier garantit l'échec déterministe de persist_state sur Windows et Linux
            data_dir: blocker_file.clone(),
            sessions: RwLock::new(std::collections::HashMap::new()),
            login_attempts: RwLock::new(std::collections::HashMap::new()),
        });

        let old_date = (Utc::now() - Duration::days(45)).format("%Y-%m-%d").to_string();
        {
            let mut db = state.db.write().await;
            db.lead_prospects.push(make_prospect(
                "pr-disk-fail",
                "carre-de-soie",
                "diskfail@exemple.fr",
                "0699000011",
                Some("emp-maxime"),
                &old_date,
            ));
            db.lead_alerts.push(LeadAlertRecord {
                id: "alert-disk-1".into(),
                club_id: "carre-de-soie".into(),
                event_type: "archived".into(),
                title: "Test rollback".into(),
                message: "Test".into(),
                prospect_id: Some("pr-disk-fail".into()),
                recipient_ids: vec!["emp-maxime".into()],
                alert_rule_id: Some("LEAD-0551".into()),
                channel: "In-App".into(),
                recipient_employee_ids: vec!["emp-maxime".into()],
                recipient_channels: vec![],
                simulation_mode: true,
                acknowledged: false,
                acknowledged_by: None,
                acknowledged_at: None,
                created_at: "2026-11-21T10:00:00Z".into(),
            });
        }

        let initial_audit_len = state.db.read().await.audit_log.len();
        let initial_alerts_len = state.db.read().await.lead_alerts.len();
        let initial_events_len = state.db.read().await.processed_lead_events.len();

        let (addr, srv) = spawn_http_server(state.clone()).await;
        let tok_mario = http_login(&addr, "emp-mario", "1010").await;

        // 1. Panne disque sur run-archiving -> HTTP 500 + rollback intégral
        let (st, _) = http_req(
            &addr,
            "POST",
            "/api/lead/automations/run-archiving",
            &[("Authorization", &format!("Bearer {}", tok_mario))],
            Some(b"{\"clubId\":\"carre-de-soie\"}"),
        )
        .await;
        assert_eq!(st, 500);
        {
            let db = state.db.read().await;
            let pr = db.lead_prospects.iter().find(|p| p.id == "pr-disk-fail").unwrap();
            assert!(!pr.is_archived);
            assert_eq!(pr.stage, "Contacté");
            assert_eq!(db.audit_log.len(), initial_audit_len);
            assert_eq!(db.lead_alerts.len(), initial_alerts_len);
        }

        // 2. Panne disque sur ack alerte -> HTTP 500 + acknowledged reste false
        let (st, _) = http_req(
            &addr,
            "POST",
            "/api/lead/alerts/alert-disk-1/ack",
            &[("Authorization", &format!("Bearer {}", tok_mario))],
            Some(b"{}"),
        )
        .await;
        assert_eq!(st, 500);
        {
            let db = state.db.read().await;
            let al = db.lead_alerts.iter().find(|a| a.id == "alert-disk-1").unwrap();
            assert!(!al.acknowledged);
            assert_eq!(db.audit_log.len(), initial_audit_len);
        }

        // 3. Panne disque sur webhook inbound-reply -> HTTP 500 + rollback complet
        let ts = Utc::now().timestamp();
        let reply_body = serde_json::to_vec(&json!({
            "eventId": "evt-fail-1",
            "clubId": "carre-de-soie",
            "prospectId": "pr-disk-fail",
            "channel": "whatsapp"
        }))
        .unwrap();
        let sig_in = sign_webhook_body("CFITNESS-DEMO-INBOUND-SECRET", ts, &reply_body);
        let (st, _) = http_req(
            &addr,
            "POST",
            "/api/lead/webhooks/inbound-reply",
            &[("x-cfitness-signature", &sig_in)],
            Some(&reply_body),
        )
        .await;
        assert_eq!(st, 500);

        // 4. Panne disque sur heitz/sync-sale -> HTTP 500 + rollback complet
        let sale_body = serde_json::to_vec(&json!({
            "eventId": "hz-fail-1",
            "clubId": "carre-de-soie",
            "prospectId": "pr-disk-fail",
            "offerId": "HZ-CDS-ABO-PASS",
            "offerName": "Pass"
        }))
        .unwrap();
        let sig_hz = sign_webhook_body("CFITNESS-LOCAL-HZ-TOKEN", ts, &sale_body);
        let (st, _) = http_req(
            &addr,
            "POST",
            "/api/heitz/sync-sale",
            &[("x-cfitness-signature", &sig_hz)],
            Some(&sale_body),
        )
        .await;
        assert_eq!(st, 500);

        {
            let db = state.db.read().await;
            let pr = db.lead_prospects.iter().find(|p| p.id == "pr-disk-fail").unwrap();
            assert_eq!(pr.stage, "Contacté");
            assert!(pr.last_inbound_reply_at.is_none());
            assert_eq!(db.audit_log.len(), initial_audit_len);
            assert_eq!(db.lead_alerts.len(), initial_alerts_len);
            assert_eq!(db.processed_lead_events.len(), initial_events_len);
        }

        srv.abort();
        let _ = std::fs::remove_dir_all(&base_dir);
    }

    #[tokio::test]
    async fn lead_rebalancing_reassigns_unavailable_and_stale_prospects() {
        let base_dir = make_isolated_dir("rebalance");
        let state = state_for_dir(base_dir.clone());
        let (addr, srv) = spawn_http_server(state.clone()).await;

        let tok_mario = http_login(&addr, "emp-mario", "1010").await;
        let today = Utc::now()
            .with_timezone(&chrono_tz::Europe::Paris)
            .date_naive()
            .to_string();

        {
            let mut db = state.db.write().await;
            db.lead_prospects.clear();
            db.lead_alerts.clear();

            // Prospect 1 : assigné à Maxime, mais Maxime est en congé validé aujourd'hui
            let mut p1 = make_prospect(
                "pr-stale-1",
                "carre-de-soie",
                "p1@test.local",
                "0600000001",
                Some("emp-maxime"),
                &Utc::now().to_rfc3339(),
            );
            p1.first_name = "Alice".into();
            p1.last_name = "Durand".into();
            db.lead_prospects.push(p1);

            // Congé validé pour Maxime
            db.leave_requests.push(crate::models::LeaveRequest {
                id: "leave-maxime-today".into(),
                employee_id: "emp-maxime".into(),
                site_id: "club-carre-soie".into(),
                motive: "Congés payés".into(),
                start_date: today.clone(),
                end_date: today.clone(),
                status: "approved".into(),
                comment: "Vacances".into(),
            });

            // Prospect 2 : assigné à Karim mais sans activité commerciale depuis 5 jours
            let old_date = (Utc::now() - Duration::days(5)).to_rfc3339();
            let mut p2 = make_prospect(
                "pr-stale-2",
                "carre-de-soie",
                "p2@test.local",
                "0600000002",
                Some("emp-karim"),
                &old_date,
            );
            p2.first_name = "Bob".into();
            p2.last_name = "Martin".into();
            p2.last_commercial_touch_at = Some(old_date);
            db.lead_prospects.push(p2);
        }

        // Déclenchement de la réattribution automatique
        let rebalance_payload = serde_json::to_vec(&json!({
            "clubId": "carre-de-soie",
            "thresholdDays": 3
        }))
        .unwrap();

        let (st, res) = http_req(
            &addr,
            "POST",
            "/api/lead/automations/rebalance-stale",
            &[("authorization", &format!("Bearer {}", tok_mario))],
            Some(&rebalance_payload),
        )
        .await;

        assert_eq!(st, 200, "rebalance response: {:?}", res);
        assert_eq!(res["ok"], true);
        assert_eq!(res["reassignedCount"], 2);

        {
            let db = state.db.read().await;
            let pr1 = db.lead_prospects.iter().find(|p| p.id == "pr-stale-1").unwrap();
            // Maxime étant en congé, pr1 a été réaffecté à un autre commercial disponible (Karim ou Sarah)
            assert_ne!(pr1.assigned_to_id.as_deref(), Some("emp-maxime"));

            // Une alerte a été émise
            assert!(db.lead_alerts.iter().any(|a| a.event_type == "commercial_reassigned"));
            // Un log d'audit a été enregistré
            assert!(db.audit_log.iter().any(|ev| ev.action_type == "lead.pool.reassign"));
        }

        srv.abort();
        let _ = std::fs::remove_dir_all(&base_dir);
    }

    #[tokio::test]
    async fn lead_transfer_inter_clubs_enforces_strict_rbac() {
        let base_dir = make_isolated_dir("transfer");
        let state = state_for_dir(base_dir.clone());
        let (addr, srv) = spawn_http_server(state.clone()).await;

        let tok_mario = http_login(&addr, "emp-mario", "1010").await; // Superadmin bi-club
        let tok_chloe = http_login(&addr, "emp-chloe", "5320").await; // Commerciale Beynost seule

        {
            let mut db = state.db.write().await;
            db.lead_prospects.clear();
            let mut p = make_prospect(
                "pr-transfer-1",
                "carre-de-soie",
                "transfer@test.local",
                "0612345678",
                Some("emp-maxime"),
                &Utc::now().to_rfc3339(),
            );
            p.first_name = "Camille".into();
            p.last_name = "Roux".into();
            db.lead_prospects.push(p);
        }

        let body_same = serde_json::to_vec(&json!({
            "targetClubId": "carre-de-soie"
        }))
        .unwrap();

        // 1. Refus si même club (400)
        let (st_same, _) = http_req(
            &addr,
            "POST",
            "/api/lead/prospects/pr-transfer-1/transfer",
            &[("authorization", &format!("Bearer {}", tok_mario))],
            Some(&body_same),
        )
        .await;
        assert_eq!(st_same, 400);

        let body_valid = serde_json::to_vec(&json!({
            "targetClubId": "beynost",
            "reason": "Déménagement adhérent"
        }))
        .unwrap();

        // 2. Chloé (Beynost uniquement) ne peut pas transférer un lead de Carré de Soie (403)
        let (st_chloe, _) = http_req(
            &addr,
            "POST",
            "/api/lead/prospects/pr-transfer-1/transfer",
            &[("authorization", &format!("Bearer {}", tok_chloe))],
            Some(&body_valid),
        )
        .await;
        assert_eq!(st_chloe, 403);

        // 3. Mario (bi-club) réussit le transfert (200)
        let (st_mario, res_mario) = http_req(
            &addr,
            "POST",
            "/api/lead/prospects/pr-transfer-1/transfer",
            &[("authorization", &format!("Bearer {}", tok_mario))],
            Some(&body_valid),
        )
        .await;
        assert_eq!(st_mario, 200, "transfer: {:?}", res_mario);
        assert_eq!(res_mario["ok"], true);
        assert_eq!(res_mario["targetClubId"], "beynost");

        {
            let db = state.db.read().await;
            let pr = db.lead_prospects.iter().find(|p| p.id == "pr-transfer-1").unwrap();
            assert_eq!(pr.club_id, "beynost");
            // Le commercial de Beynost a été assigné automatiquement
            assert!(["emp-chloe", "emp-greg", "emp-sarah"]
                .contains(&pr.assigned_to_id.as_deref().unwrap_or("")));
            // Alerte générée sur Beynost
            assert!(db
                .lead_alerts
                .iter()
                .any(|a| a.club_id == "beynost" && a.event_type == "prospect_transferred"));
        }

        srv.abort();
        let _ = std::fs::remove_dir_all(&base_dir);
    }

    #[tokio::test]
    async fn lead_conversion_stats_aggregates_kpis() {
        let base_dir = make_isolated_dir("stats");
        let state = state_for_dir(base_dir.clone());
        let (addr, srv) = spawn_http_server(state.clone()).await;

        let tok_mario = http_login(&addr, "emp-mario", "1010").await;

        {
            let mut db = state.db.write().await;
            db.lead_prospects.clear();

            // 1 actif
            let p1 = make_prospect(
                "pr-act-1",
                "carre-de-soie",
                "act@test.local",
                "0600000010",
                Some("emp-maxime"),
                &Utc::now().to_rfc3339(),
            );
            // 1 converti
            let mut p2 = make_prospect(
                "pr-conv-1",
                "carre-de-soie",
                "conv@test.local",
                "0600000011",
                Some("emp-maxime"),
                &Utc::now().to_rfc3339(),
            );
            p2.stage = "Client".into();
            p2.converted_offer = Some("HZ-PASS".into());

            // 1 perdu
            let mut p3 = make_prospect(
                "pr-lost-1",
                "carre-de-soie",
                "lost@test.local",
                "0600000012",
                Some("emp-karim"),
                &Utc::now().to_rfc3339(),
            );
            p3.stage = "Perdu".into();

            db.lead_prospects.push(p1);
            db.lead_prospects.push(p2);
            db.lead_prospects.push(p3);
        }

        let (st, res) = http_req(
            &addr,
            "GET",
            "/api/lead/stats/conversion?clubId=carre-de-soie",
            &[("authorization", &format!("Bearer {}", tok_mario))],
            None,
        )
        .await;

        assert_eq!(st, 200, "stats: {:?}", res);
        assert_eq!(res["ok"], true);
        let s = &res["stats"];
        assert_eq!(s["totalProspects"], 3);
        assert_eq!(s["activeLeads"], 1);
        assert_eq!(s["convertedLeads"], 1);
        assert_eq!(s["lostLeads"], 1);
        assert_eq!(s["conversionRatePercent"], 33.3);

        srv.abort();
        let _ = std::fs::remove_dir_all(&base_dir);
    }
}
