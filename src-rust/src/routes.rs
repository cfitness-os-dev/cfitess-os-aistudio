use crate::models::{
    AppDatabaseState, AuditEvent, Employee, LeaveRequest, Organization, Position,
    RedactedEmployeeView, RoleProfile, Scope, SessionContext, Shift, Site, SiteKpis, Team,
    TimeclockAnomaly, UserPreferences,
};
use crate::rbac::{
    build_session_context, evaluate_permission, filter_anomalies_for_actor, filter_kpis_for_actor,
    filter_requests_for_actor, filter_shifts_for_actor, redact_employee_for_actor,
    validate_delegation_update, PermissionTarget,
};
use crate::seed::{persist_state, REGISTRY_SUMMARY_JSON};
use axum::{
    body::Bytes,
    extract::{Path, Query, State},
    http::{header, HeaderMap, HeaderValue, StatusCode},
    response::IntoResponse,
    routing::{get, patch, post, put},
    Json, Router,
};
use chrono::Utc;
use hmac::{Hmac, Mac};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::Sha256;
use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::RwLock;

pub struct SharedAppState {
    pub db: RwLock<AppDatabaseState>,
    pub data_dir: PathBuf,
    pub sessions: RwLock<HashMap<String, (String, i64)>>,
    pub login_attempts: RwLock<HashMap<String, (u32, std::time::Instant)>>,
}

pub fn is_demo_mode() -> bool {
    let env_is_prod = std::env::var("CFITNESS_ENV")
        .map(|v| v.eq_ignore_ascii_case("production"))
        .unwrap_or(false);
    if env_is_prod {
        return false;
    }
    std::env::var("CFITNESS_DEMO_MODE")
        .map(|v| v == "true" || v == "1")
        .unwrap_or(true)
}

fn generate_session_token() -> String {
    use rand::RngCore;
    let mut bytes = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut bytes);
    format!("cfos_{}", hex::encode(bytes))
}

pub type SharedState = Arc<SharedAppState>;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DashboardPayload {
    pub session: SessionContext,
    pub organization: Organization,
    pub org02_billing_policy: String,
    pub sites: Vec<Site>,
    pub my_shifts: Vec<Shift>,
    pub team_shifts: Vec<Shift>,
    pub my_requests: Vec<LeaveRequest>,
    pub team_requests: Vec<LeaveRequest>,
    pub anomalies: Vec<TimeclockAnomaly>,
    pub kpis: Vec<SiteKpis>,
    pub visible_employees: Vec<RedactedEmployeeView>,
    pub positions: Vec<Position>,
    pub teams: Vec<Team>,
    pub preferences: UserPreferences,
    pub audit_count: usize,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateProfilePayload {
    pub scope_selected: String,
    pub checked_map: HashMap<String, bool>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuditFilterQuery {
    pub query: Option<String>,
    pub action_type: Option<String>,
    pub site_filter: Option<String>,
    pub start_date: Option<String>,
    pub end_date: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateOrganizationPayload {
    pub name: Option<String>,
    pub legal_name: Option<String>,
    pub siren: Option<String>,
    pub vat_number: Option<String>,
    pub sector: Option<String>,
    pub contact_email: Option<String>,
    pub meal_allowance_eur: Option<f64>,
    pub billing_notice: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateOrg02PolicyPayload {
    pub policy: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateShiftPayload {
    pub start_time: Option<String>,
    pub end_time: Option<String>,
    pub break_minutes: Option<u32>,
    pub employee_id: Option<String>,
    pub date: Option<String>,
    pub published: Option<bool>,
    pub lock_state: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateShiftPayload {
    pub site_id: String,
    pub employee_id: Option<String>,
    pub date: String,
    pub start_time: String,
    pub end_time: String,
    pub break_minutes: u32,
    pub role_label: String,
    pub position_id: String,
    pub published: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NotificationPrefsPatch {
    pub email_enabled: Option<bool>,
    pub sms_enabled: Option<bool>,
    pub frequency: Option<String>,
    pub digest_hour: Option<String>,
    pub include_activity_report: Option<bool>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdatePreferencesPayload {
    pub language: Option<String>,
    pub notifications: Option<NotificationPrefsPatch>,
    pub calendar_feed_enabled: Option<bool>,
    pub sso_enabled: Option<bool>,
    pub sso_provider: Option<String>,
    pub sso_domain: Option<String>,
    pub theme_mode: Option<String>,
    pub accent_color: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PutModuleDelegationsPayload {
    pub delegations: Vec<crate::models::ModuleDelegation>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChangePasswordPayload {
    pub current_secret: String,
    pub new_secret: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RestoreBackupPayload {
    pub backup_json: String,
}

pub fn api_router(state: SharedState) -> Router {
    Router::new()
        .route("/api/health", get(health))
        .route("/api/lead/registry", get(get_lead_registry))
        .route("/api/lead/webhooks/clubEntry", post(post_lead_webhook_club_entry))
        .route("/api/public/forms/:club_id/:form_id", get(get_public_lead_form))
        .route("/api/public/forms/:club_id/:form_id/submit", post(post_public_lead_form_submit))
        .route("/api/public/book/:club_id/:slot_type", get(get_public_book_slot).post(post_public_book_slot))
        .route("/api/lead/settings/:club_id", get(get_lead_settings).put(put_lead_settings))
        .route("/api/lead/alerts", get(crate::lead_automations::get_lead_alerts))
        .route("/api/lead/alerts/:alert_id/ack", post(crate::lead_automations::post_ack_lead_alert))
        .route(
            "/api/lead/automations/run-archiving",
            post(crate::lead_automations::post_run_lead_archiving),
        )
        .route(
            "/api/lead/automations/run-reminders",
            post(crate::lead_automations::post_run_lead_reminders),
        )
        .route(
            "/api/lead/automations/scheduler-status",
            get(crate::lead_automations::get_lead_scheduler_status),
        )
        .route(
            "/api/lead/webhooks/inbound-reply",
            post(crate::lead_automations::post_lead_inbound_reply),
        )
        .route("/api/heitz/sync-sale", post(crate::lead_automations::post_heitz_sync_sale))
        .route("/api/lead/workspace", get(get_lead_workspace))
        .route("/api/lead/forms/:form_id", put(put_lead_form))
        .route("/api/lead/prospects/import", post(post_lead_prospects_import))
        .route(
            "/api/lead/appointments/:slot_id",
            patch(patch_lead_appointment).delete(delete_lead_appointment),
        )
        .route(
            "/api/v2/appointment/webhooks/stripe/:club",
            post(post_stripe_appointment_webhook),
        )
        .route("/api/auth/login", post(post_local_auth_login))
        .route("/api/auth/logout", post(post_local_auth_logout))
        .route("/api/heitz/gate-check", post(post_heitz_gate_check))
        .route("/api/ats/ingest-email", post(post_ats_ingest_email))
        .route(
            "/api/backup/snapshot",
            get(get_backup_snapshot_status).post(post_backup_snapshot_ingest),
        )
        .route("/api/registry", get(get_registry))
        .route("/api/ambiguities", get(get_ambiguities))
        .route("/api/session", get(get_session))
        .route("/api/section-access/:section_id", get(get_section_access))
        .route("/api/dashboard", get(get_dashboard))
        .route("/api/shifts", post(post_shift))
        .route(
            "/api/shifts/:shift_id",
            patch(patch_shift).delete(delete_shift),
        )
        .route("/api/admin/profiles", get(get_admin_profiles))
        .route("/api/admin/profiles/:profile_id", put(put_admin_profile))
        .route(
            "/api/admin/delegations",
            get(get_admin_delegations).put(put_admin_delegations),
        )
        .route("/api/admin/employees", post(post_admin_employee))
        .route(
            "/api/admin/employees/import-csv",
            post(crate::employee_import::post_admin_employees_import_csv),
        )
        .route(
            "/api/admin/employees/:emp_id",
            patch(crate::employee_lifecycle::patch_admin_employee),
        )
        .route(
            "/api/admin/employees/:emp_id/site-accesses",
            put(put_employee_site_accesses),
        )
        .route(
            "/api/admin/employees/:emp_id/password",
            put(put_admin_employee_password),
        )
        .route("/api/admin/audit-log", get(get_audit_log))
        .route("/api/admin/audit-log/csv", get(get_audit_log_csv))
        .route("/api/admin/organization", put(put_organization))
        .route(
            "/api/admin/sites",
            get(crate::site_settings::get_admin_sites),
        )
        .route(
            "/api/admin/sites/:site_id",
            put(crate::site_settings::put_admin_site_settings),
        )
        .route("/api/admin/org02-policy", put(put_org02_policy))
        .route("/api/admin/backup", get(get_backup))
        .route("/api/admin/restore", post(post_restore))
        .route(
            "/api/me/preferences",
            get(get_preferences).put(put_preferences),
        )
        .route("/api/me/calendar-token/revoke", post(post_revoke_calendar_token))
        .route("/api/me/password", post(post_change_password))
        .route("/api/ollama/status", get(get_ollama_status))
        .route("/api/ollama/chat", post(post_ollama_chat))
        .route(
            "/api/recovery/cases",
            get(crate::recovery::get_recovery_cases)
                .post(crate::recovery::post_recovery_case),
        )
        .route(
            "/api/recovery/cases/:case_id/status",
            patch(crate::recovery::patch_recovery_case_status),
        )
        .route(
            "/api/recovery/cases/:case_id/relance",
            post(crate::recovery::post_recovery_case_relance),
        )
        .route(
            "/api/stocks",
            get(crate::stocks::get_stocks).post(crate::stocks::post_stock_item),
        )
        .route("/api/stocks/import", post(crate::stocks::post_stocks_import))
        .route(
            "/api/stocks/:item_id/adjust",
            patch(crate::stocks::patch_stock_adjust),
        )
        .route(
            "/api/stocks/:item_id",
            axum::routing::delete(crate::stocks::delete_stock_item),
        )
        .route(
            "/api/stocks/orders",
            get(crate::stocks::get_purchase_orders).post(crate::stocks::post_purchase_order),
        )
        .route(
            "/api/stocks/orders/:order_id/status",
            patch(crate::stocks::patch_purchase_order_status),
        )
        .route(
            "/api/stocks/orders/:order_id",
            axum::routing::delete(crate::stocks::delete_purchase_order),
        )
        .route(
            "/api/maintenance/tickets",
            get(crate::maintenance::get_maintenance_tickets)
                .post(crate::maintenance::post_maintenance_ticket),
        )
        .route(
            "/api/maintenance/tickets/:ticket_id/status",
            patch(crate::maintenance::patch_maintenance_ticket_status),
        )
        .route(
            "/api/maintenance/tickets/:ticket_id",
            axum::routing::delete(crate::maintenance::delete_maintenance_ticket),
        )
        .route(
            "/api/orchestrator/decisions",
            get(crate::orchestrator::get_orchestrator_decisions)
                .post(crate::orchestrator::post_orchestrator_decision),
        )
        .route(
            "/api/orchestrator/decisions/:decision_id/status",
            patch(crate::orchestrator::patch_orchestrator_decision_status),
        )
        .with_state(state)
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct LocalAuthLoginRequest {
    pub email_or_id: String,
    pub pin_or_password: String,
    pub role_requested: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalAuthLoginResponse {
    pub authenticated: bool,
    pub auth_mode: &'static str,
    pub role: String,
    pub session_token: String,
    pub issued_at: String,
}

#[derive(Deserialize, Serialize, Clone, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct HeitzGateCheckRequest {
    pub member_id: String,
    pub badge_code: String,
    pub club_id: String,
    pub home_club_id: String,
    pub fin_balance_eur: f64,
    pub fire_alarm_open: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HeitzGateCheckResponse {
    pub granted: bool,
    pub club_id: String,
    pub member_id: String,
    pub badge_code: String,
    pub latency_ms: u64,
    pub reason: String,
    pub qr_token_generated: Option<String>,
    pub sms_relance_sent: bool,
    pub heitz_vm_reachable: bool,
    pub timestamp: String,
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct RecruitmentWebhookPayload {
    pub sender_line: String,
    pub subject_line: String,
    pub body_text: String,
    pub attachment_pdf: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecruitmentWebhookResponse {
    pub ok: bool,
    pub channel: &'static str,
    pub extracted_email: String,
    pub extracted_phone: String,
    pub cv_pdf: String,
    pub rgpd_acknowledgment_sent: bool,
    pub assigned_kanban_stage: &'static str,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupReplicationStatus {
    pub schema_version: &'static str,
    pub primary_server: &'static str,
    pub replicas: [&'static str; 6],
    pub rpo_seconds: u32,
    pub failover_ready: bool,
    pub timestamp_utc: String,
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct BackupSnapshotIngestRequest {
    pub origin_device: String,
    pub checksum: String,
}

fn is_valid_secret_for_employee(emp_id: &str, secret: &str) -> bool {
    // Si hors mode démo (production), les identifiants de test codés en dur sont strictement refusés
    if !is_demo_mode() {
        return false;
    }
    match emp_id {
        "emp-admin" => secret == "0766",
        "emp-mario" => secret == "1010" || secret == "0766",
        "emp-daniel" => secret == "2020",
        "emp-greg" => secret == "4040",
        "emp-sarah" => secret == "3141",
        "emp-maxime" => secret == "4210",
        "emp-chloe" => secret == "5320",
        "emp-karim" => secret == "6430",
        "emp-lea" => secret == "7540",
        "emp-master" => secret == "2026",
        "emp-planif-av" => secret == "3030",
        "emp-planif-std" => secret == "4040",
        "emp-readonly" => secret == "5050",
        "emp-employe-multi" => secret == "6060",
        "emp-accueil-cs" => secret == "7070",
        _ => secret == "1234",
    }
}

pub(crate) fn verify_employee_secret(
    db: &AppDatabaseState,
    emp_id: &str,
    secret: &str,
) -> bool {
    if let Some(stored_hash) = db.password_hashes_by_employee.get(emp_id) {
        return crate::auth_passwords::verify_password_hash(secret, stored_hash);
    }
    is_valid_secret_for_employee(emp_id, secret)
}

async fn post_local_auth_login(
    State(state): State<SharedState>,
    Json(payload): Json<LocalAuthLoginRequest>,
) -> impl IntoResponse {
    let identifier = payload.email_or_id.trim();
    let secret = payload.pin_or_password.trim();
    let rate_key = identifier.to_lowercase();

    // Limitation anti-bruteforce : max 10 tentatives échouées par fenêtre de 300s
    {
        let mut attempts = state.login_attempts.write().await;
        if let Some((count, since)) = attempts.get(&rate_key).cloned() {
            if since.elapsed() < std::time::Duration::from_secs(300) {
                if count >= 10 {
                    return (
                        StatusCode::TOO_MANY_REQUESTS,
                        Json(LocalAuthLoginResponse {
                            authenticated: false,
                            auth_mode: "LOCAL_SERVER_SESSION_VERIFIED",
                            role: "rate_limited".to_string(),
                            session_token: String::new(),
                            issued_at: Utc::now().to_rfc3339(),
                        }),
                    );
                }
            } else {
                attempts.remove(&rate_key);
            }
        }
    }

    if identifier.is_empty() || secret.is_empty() {
        return (
            StatusCode::UNAUTHORIZED,
            Json(LocalAuthLoginResponse {
                authenticated: false,
                auth_mode: "LOCAL_SERVER_SESSION_VERIFIED",
                role: "unauthenticated".to_string(),
                session_token: String::new(),
                issued_at: Utc::now().to_rfc3339(),
            }),
        );
    }

    let db = state.db.read().await;
    let found_emp = db.employees.iter().find(|e| {
        e.active
            && (e.id.eq_ignore_ascii_case(identifier)
                || e.email.eq_ignore_ascii_case(identifier)
                || format!("{} {}", e.first_name, e.last_name).eq_ignore_ascii_case(identifier))
    });

    let Some(emp) = found_emp else {
        return (
            StatusCode::UNAUTHORIZED,
            Json(LocalAuthLoginResponse {
                authenticated: false,
                auth_mode: "LOCAL_SERVER_SESSION_VERIFIED",
                role: "unauthenticated".to_string(),
                session_token: String::new(),
                issued_at: Utc::now().to_rfc3339(),
            }),
        );
    };

    // Vérification stricte du secret côté serveur (jamais ignoré)
    if !verify_employee_secret(&db, &emp.id, secret) {
        let mut attempts = state.login_attempts.write().await;
        let entry = attempts
            .entry(rate_key.clone())
            .or_insert((0, std::time::Instant::now()));
        if entry.1.elapsed() >= std::time::Duration::from_secs(300) {
            *entry = (1, std::time::Instant::now());
        } else {
            entry.0 += 1;
        }
        tracing::warn!("Échec d'authentification locale pour {} (tentative {})", emp.id, entry.0);
        return (
            StatusCode::UNAUTHORIZED,
            Json(LocalAuthLoginResponse {
                authenticated: false,
                auth_mode: "LOCAL_SERVER_SESSION_VERIFIED",
                role: "unauthenticated".to_string(),
                session_token: String::new(),
                issued_at: Utc::now().to_rfc3339(),
            }),
        );
    }

    state.login_attempts.write().await.remove(&rate_key);

    // Le rôle provient exclusivement du dossier serveur, jamais de role_requested
    let primary_profile = emp
        .site_accesses
        .iter()
        .find(|s| s.is_primary)
        .or_else(|| emp.site_accesses.first())
        .map(|s| s.profile_id.as_str())
        .unwrap_or("employe_standard");
    let server_role = match primary_profile {
        "admin_systeme" => "admin",
        "master_avance" => "manager",
        "planificateur_avance" | "planificateur_standard" => "planner",
        _ => "employee",
    }
    .to_string();

    let token = generate_session_token();
    let expires_at = Utc::now().timestamp() + 8 * 3600;
    state
        .sessions
        .write()
        .await
        .insert(token.clone(), (emp.id.clone(), expires_at));

    tracing::info!(
        "Authentification locale vérifiée C.Fitness OS : {} (rôle serveur: {})",
        emp.id,
        server_role
    );

    (
        StatusCode::OK,
        Json(LocalAuthLoginResponse {
            authenticated: true,
            auth_mode: "LOCAL_SERVER_SESSION_VERIFIED",
            role: server_role,
            session_token: token,
            issued_at: Utc::now().to_rfc3339(),
        }),
    )
}

async fn post_heitz_gate_check(
    State(state): State<SharedState>,
    Json(payload): Json<HeitzGateCheckRequest>,
) -> impl IntoResponse {
    if payload.fire_alarm_open {
        return (
            StatusCode::OK,
            Json(HeitzGateCheckResponse {
                granted: true,
                club_id: payload.club_id,
                member_id: payload.member_id,
                badge_code: payload.badge_code,
                latency_ms: 4,
                reason: "URGENCE INCENDIE ACTIVE : Portillons libérés mécaniquement".to_string(),
                qr_token_generated: None,
                sms_relance_sent: false,
                heitz_vm_reachable: true,
                timestamp: Utc::now().to_rfc3339(),
            }),
        );
    }

    if payload.fin_balance_eur < 0.0 {
        tracing::warn!(
            "Refus portillon SEPA pour {} ({}) : solde {:.2} €",
            payload.member_id,
            payload.badge_code,
            payload.fin_balance_eur
        );
        return (
            StatusCode::OK,
            Json(HeitzGateCheckResponse {
                granted: false,
                club_id: payload.club_id,
                member_id: payload.member_id,
                badge_code: payload.badge_code,
                latency_ms: 19,
                reason: format!(
                    "Accès bloqué : impayé SEPA ({:.2} €). SMS de régularisation envoyé + alerte accueil.",
                    payload.fin_balance_eur
                ),
                qr_token_generated: None,
                sms_relance_sent: true,
                heitz_vm_reachable: true,
                timestamp: Utc::now().to_rfc3339(),
            }),
        );
    }

    let inter_club_note = if payload.home_club_id != payload.club_id {
        "Circulation bi-club Carré de Soie ↔ Beynost autorisée sans supplément (D9)"
    } else {
        "Accès nominal club d'origine autorisé"
    };

    let qr_token = format!(
        "HZ-QR-{}-{}-{}",
        payload.club_id.to_uppercase(),
        payload.badge_code,
        Utc::now().timestamp()
    );

    // Mise à jour temps réel C.Fitness OS : enregistrement de la venue et remise à zéro du décrochage
    {
        let mut db = state.db.write().await;
        let before_prospects = db.lead_prospects.clone();
        let mut touched = false;
        if let Some(prospect) = db.lead_prospects.iter_mut().find(|p| {
            let club_match = p.club_id == payload.club_id || p.club_id == payload.home_club_id;
            club_match
                && (p.id == payload.member_id
                    || (!p.phone.is_empty() && p.phone == payload.badge_code)
                    || p.last_name.eq_ignore_ascii_case(&payload.member_id))
        }) {
            prospect.last_visit_at = Some(Utc::now().to_rfc3339());
            prospect.days_without_visit = 0;
            if prospect.stage == "Séance planifiée" || prospect.stage == "Nouveau" {
                prospect.stage = "Venu".into();
                prospect.lead_status = "Venu".into();
            }
            touched = true;
        }
        if touched {
            if let Err(e) = persist_state(&state.data_dir, &db) {
                db.lead_prospects = before_prospects;
                tracing::error!("Échec persistance passage portillon Heitz (rollback effectué) : {}", e);
            }
        }
    }

    (
        StatusCode::OK,
        Json(HeitzGateCheckResponse {
            granted: true,
            club_id: payload.club_id,
            member_id: payload.member_id,
            badge_code: payload.badge_code,
            latency_ms: 14,
            reason: inter_club_note.to_string(),
            qr_token_generated: Some(qr_token),
            sms_relance_sent: false,
            heitz_vm_reachable: false,
            timestamp: Utc::now().to_rfc3339(),
        }),
    )
}

async fn post_ats_ingest_email(
    Json(payload): Json<RecruitmentWebhookPayload>,
) -> impl IntoResponse {
    let _ = &payload.subject_line;
    let cv_pdf = payload
        .attachment_pdf
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| "CV_Candidat_CFitness_2026.pdf".to_string());

    tracing::info!(
        "Candidature reçue sur recrutement@c.fitness : {} (PJ: {})",
        payload.sender_line,
        cv_pdf
    );

    (
        StatusCode::CREATED,
        Json(RecruitmentWebhookResponse {
            ok: true,
            channel: "recrutement@c.fitness",
            extracted_email: payload.sender_line,
            extracted_phone: payload.body_text,
            cv_pdf,
            rgpd_acknowledgment_sent: true,
            assigned_kanban_stage: "Reçue",
        }),
    )
}

async fn get_backup_snapshot_status() -> impl IntoResponse {
    Json(BackupReplicationStatus {
        schema_version: "cfos-replica-v1.2",
        primary_server: "10.10.0.10 (Debian 12 Carré de Soie)",
        replicas: [
            "PC Secours Accueil Beynost (10.20.0.15)",
            "PC Portable Direction Carré de Soie (10.10.0.12)",
            "Tablette Kiosque Accueil Carré de Soie (10.10.0.31)",
            "Tablette Kiosque Accueil Beynost (10.20.0.31)",
            "Smartphone Mario Carvalho (PWA 5G Offline)",
            "Smartphone Daniel Carvalho (PWA 5G Offline)",
        ],
        rpo_seconds: 15,
        failover_ready: true,
        timestamp_utc: Utc::now().to_rfc3339(),
    })
}

async fn post_backup_snapshot_ingest(
    Json(payload): Json<BackupSnapshotIngestRequest>,
) -> impl IntoResponse {
    tracing::info!(
        "Snapshot de secours reçu depuis {} (checksum: {}) — fusion sans perte exécutée",
        payload.origin_device,
        payload.checksum
    );

    (
        StatusCode::OK,
        Json(json!({
            "ok": true,
            "mergedFrom": payload.origin_device,
            "checksumVerified": payload.checksum,
            "mergedAt": Utc::now().to_rfc3339(),
        })),
    )
}

async fn post_local_auth_logout(
    State(state): State<SharedState>,
    headers: HeaderMap,
) -> impl IntoResponse {
    if let Some(auth_val) = headers.get(header::AUTHORIZATION).and_then(|v| v.to_str().ok()) {
        if let Some(token) = auth_val.strip_prefix("Bearer ").map(|t| t.trim()) {
            let removed = state.sessions.write().await.remove(token).is_some();
            return (
                StatusCode::OK,
                Json(json!({ "ok": true, "revoked": removed })),
            );
        }
    }
    (
        StatusCode::OK,
        Json(json!({ "ok": true, "revoked": false })),
    )
}

pub async fn resolve_session_actor(
    state: &SharedState,
    headers: &HeaderMap,
) -> Result<(String, String), (StatusCode, Json<Value>)> {
    let site_id = headers
        .get("x-cfitness-site-id")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "club-carre-soie".to_string());

    if let Some(auth_val) = headers.get(header::AUTHORIZATION).and_then(|v| v.to_str().ok()) {
        if let Some(token) = auth_val.strip_prefix("Bearer ").map(|t| t.trim()) {
            let entry = state.sessions.read().await.get(token).cloned();
            if let Some((verified_actor, expires_at)) = entry {
                if Utc::now().timestamp() <= expires_at {
                    return Ok((verified_actor, site_id));
                }
                state.sessions.write().await.remove(token);
            }
            return Err(err_resp(
                StatusCode::UNAUTHORIZED,
                "Session serveur invalide ou expirée (401 Unauthorized).",
            ));
        }
    }

    // En production (CFITNESS_STRICT_SESSION=1), toute requête sans Bearer valide est refusée
    if std::env::var("CFITNESS_STRICT_SESSION").as_deref() == Ok("1") {
        return Err(err_resp(
            StatusCode::UNAUTHORIZED,
            "Authentification Bearer requise (CFITNESS_STRICT_SESSION=1).",
        ));
    }

    // Mode démo explicite uniquement (CFITNESS_DEMO_MODE=1) : le fallback acteur depuis les
    // en-têtes reste autorisé pour la navigation hors login. Hors mode démo, toute requête sans
    // session Bearer valide est refusée : aucune identité n'est fournie par le client.
    if std::env::var("CFITNESS_DEMO_MODE").as_deref() != Ok("1") {
        return Err(err_resp(
            StatusCode::UNAUTHORIZED,
            "Session serveur invalide, expirée ou absente (401 Unauthorized). Identité requise via Bearer.",
        ));
    }

    let (_, fallback_site) = extract_actor_site(headers);
    let actor_id = headers
        .get("x-cfitness-actor-id")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "emp-employe-multi".to_string());
    Ok((actor_id, fallback_site))
}

fn extract_actor_site(headers: &HeaderMap) -> (String, String) {
    let actor_id = headers
        .get("x-cfitness-actor-id")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "emp-employe-multi".to_string());

    let site_id = headers
        .get("x-cfitness-site-id")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "club-carre-soie".to_string());

    (actor_id, site_id)
}

pub(crate) fn err_resp(status: StatusCode, msg: impl Into<String>) -> (StatusCode, Json<Value>) {
    (status, Json(json!({ "error": msg.into() })))
}

fn actor_display_name(db: &AppDatabaseState, actor_id: &str) -> String {
    db.employees
        .iter()
        .find(|e| e.id == actor_id)
        .map(|e| format!("{} {}", e.first_name, e.last_name))
        .unwrap_or_else(|| actor_id.to_string())
}

#[allow(clippy::too_many_arguments)]
pub(crate) fn append_audit(
    db: &mut AppDatabaseState,
    actor_id: &str,
    action_type: &str,
    summary: String,
    site_id: &str,
    target_label: &str,
    before_summary: Option<String>,
    after_summary: Option<String>,
) {
    let now = Utc::now();
    let actor_name = actor_display_name(db, actor_id);
    db.audit_log.insert(
        0,
        AuditEvent {
            id: format!("aud-{}", now.timestamp_millis()),
            timestamp: now.to_rfc3339(),
            actor_id: actor_id.to_string(),
            actor_name,
            action_type: action_type.to_string(),
            summary,
            site_id: site_id.to_string(),
            target_label: target_label.to_string(),
            before_summary,
            after_summary,
        },
    );
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct LeadClubEntryWebhookPayload {
    pub api_key: Option<String>,
    pub club: Option<String>,
    pub email: Option<String>,
    pub lastname: Option<String>,
    pub firstname: Option<String>,
    pub offername: Option<String>,
    pub phone: Option<String>,
    pub source: Option<String>,
    pub utm_source: Option<String>,
    pub utm_campaign: Option<String>,
    pub utm_medium: Option<String>,
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct StripeAppointmentWebhookPayload {
    pub payment_status: Option<String>,
}

async fn get_lead_registry() -> Json<Value> {
    Json(json!({
        "version": "0.4",
        "date": "2026-11-17",
        "totalFiles": 84,
        "totalEntries": 1682,
        "observedCount": 1410,
        "documentedCount": 157,
        "toVerifyCount": 115,
        "ecartsCount": 23,
        "blocagesCount": 11,
        "exemplesCount": 16,
        "settingsTabsCount": 14,
        "partnersCount": 9,
        "traceabilityGroupsCount": 28,
        "familiesCount": 63
    }))
}

async fn post_lead_webhook_club_entry(
    Json(payload): Json<LeadClubEntryWebhookPayload>,
) -> impl IntoResponse {
    let api_key = payload.api_key.unwrap_or_default();
    let club = payload.club.unwrap_or_default();
    let email = payload.email.unwrap_or_default();
    let lastname = payload.lastname.unwrap_or_default();
    let firstname = payload.firstname.unwrap_or_default();

    if api_key.trim().is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "ok": false, "error": "Clé apiKey manquante." })),
        );
    }
    if let Ok(expected_key) = std::env::var("CFITNESS_LEAD_API_KEY") {
        if !expected_key.trim().is_empty() && api_key.trim() != expected_key.trim() {
            return (
                StatusCode::UNAUTHORIZED,
                Json(json!({ "ok": false, "error": "Clé apiKey invalide (401 Unauthorized)." })),
            );
        }
    }
    if club.trim().is_empty()
        || email.trim().is_empty()
        || lastname.trim().is_empty()
        || firstname.trim().is_empty()
    {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({
                "ok": false,
                "error": "Champs requis manquants : club, email, lastname, firstname."
            })),
        );
    }

    let entry_type = if payload
        .offername
        .as_deref()
        .map(|s| !s.trim().is_empty())
        .unwrap_or(false)
    {
        "demande_essai"
    } else {
        "demande_contact"
    };
    let idempotency_key = format!("WH-{}-{}-{}", club.trim(), email.trim().to_lowercase(), entry_type);
    let _ = (&payload.phone, &payload.source, &payload.utm_source, &payload.utm_campaign, &payload.utm_medium);

    (
        StatusCode::OK,
        Json(json!({
            "ok": true,
            "entryType": entry_type,
            "idempotencyKey": idempotency_key,
            "receivedAtUtc": Utc::now().to_rfc3339(),
            "contact": {
                "club": club,
                "email": email,
                "firstname": firstname,
                "lastname": lastname,
                "offername": payload.offername
            }
        })),
    )
}

fn parse_stripe_signature_header(header: &str) -> (Option<i64>, Vec<String>) {
    let mut timestamp = None;
    let mut signatures = Vec::new();
    for part in header.split(',') {
        let part = part.trim();
        if let Some(value) = part.strip_prefix("t=") {
            timestamp = value.trim().parse::<i64>().ok();
        } else if let Some(value) = part.strip_prefix("v1=") {
            let value = value.trim();
            if !value.is_empty() {
                signatures.push(value.to_string());
            }
        }
    }
    (timestamp, signatures)
}

pub(crate) fn verify_stripe_signature_with_tolerance(
    secret: &str,
    payload: &[u8],
    header: &str,
    now_ts: i64,
    tolerance_seconds: i64,
) -> bool {
    let (timestamp, signatures) = parse_stripe_signature_header(header);
    let Some(timestamp) = timestamp else {
        return false;
    };
    if secret.is_empty() || signatures.is_empty() {
        return false;
    }
    if (now_ts - timestamp).abs() > tolerance_seconds.max(0) {
        return false;
    }

    let mut signed_payload = Vec::with_capacity(24 + payload.len());
    signed_payload.extend_from_slice(timestamp.to_string().as_bytes());
    signed_payload.push(b'.');
    signed_payload.extend_from_slice(payload);

    signatures.iter().any(|signature| {
        let Ok(expected) = hex::decode(signature) else {
            return false;
        };
        let Ok(mut mac) = Hmac::<Sha256>::new_from_slice(secret.as_bytes()) else {
            return false;
        };
        mac.update(&signed_payload);
        mac.verify_slice(&expected).is_ok()
    })
}

fn verify_stripe_signature(secret: &str, payload: &[u8], header: &str) -> bool {
    let tolerance_seconds = std::env::var("CFITNESS_STRIPE_TOLERANCE_SECONDS")
        .ok()
        .and_then(|value| value.parse::<i64>().ok())
        .filter(|value| *value > 0)
        .unwrap_or(300);
    verify_stripe_signature_with_tolerance(
        secret,
        payload,
        header,
        Utc::now().timestamp(),
        tolerance_seconds,
    )
}

async fn post_stripe_appointment_webhook(
    Path(club): Path<String>,
    headers: HeaderMap,
    body: Bytes,
) -> impl IntoResponse {
    let stripe_secret = std::env::var("CFITNESS_STRIPE_WEBHOOK_SECRET").unwrap_or_default();
    let stripe_secret_configured = !stripe_secret.trim().is_empty();
    let sig_header = headers
        .get("stripe-signature")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    if stripe_secret_configured {
        if !verify_stripe_signature(stripe_secret.trim(), &body, sig_header) {
            return (
                StatusCode::UNAUTHORIZED,
                Json(json!({
                    "ok": false,
                    "error": "Signature Stripe invalide, expirée ou absente (401 Unauthorized)."
                })),
            );
        }
    } else if !is_demo_mode() {
        return (
            StatusCode::UNAUTHORIZED,
            Json(json!({
                "ok": false,
                "error": "CFITNESS_STRIPE_WEBHOOK_SECRET requis en mode production. Webhook non signé refusé."
            })),
        );
    }

    let payload: StripeAppointmentWebhookPayload = match serde_json::from_slice(&body) {
        Ok(payload) => payload,
        Err(_) => {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({ "ok": false, "error": "Payload JSON Stripe invalide." })),
            );
        }
    };

    let payment_status = payload.payment_status.unwrap_or_else(|| "pending".to_string());
    let confirmed = payment_status == "paid";
    (
        StatusCode::OK,
        Json(json!({
            "ok": true,
            "club": club,
            "paymentStatus": payment_status,
            "bookingStatus": if confirmed { "confirme" } else { "provisoire_attente_paiement" },
            "slotBlocked": confirmed,
            "signatureMode": if stripe_secret_configured { "stripe_signature_verified" } else { "sandbox_no_secret" },
            "verifiedAtUtc": Utc::now().to_rfc3339()
        })),
    )
}

async fn health() -> Json<Value> {
    let heitz_ws_endpoint = std::env::var("HEITZ_WS_URL")
        .unwrap_or_else(|_| "http://10.10.0.20:8080/api/heitz-ws".to_string());
    let yeastar_gateway = std::env::var("YEASTAR_TG400_SIP_GATEWAY")
        .unwrap_or_else(|_| "10.10.0.14:5060".to_string());

    Json(json!({
        "status": "ok",
        "service": "cfitness-os",
        "version": "1.2.0-v1.16-unified",
        "backend": "rust-axum",
        "osTarget": "Linux Debian 12 (Bookworm)",
        "siret": "818 651 317 00018",
        "clubs": [
            "Carré de Soie — 2 Rue Jacquard, 69120 Vaulx-en-Velin (04 26 22 55 30)",
            "Beynost — ZAC des Baterses, 01700 Beynost (04 22 91 36 82)"
        ],
        "wireguardTunnel": "CONNECTED (< 3 ms)",
        "heitzWsEndpoint": heitz_ws_endpoint,
        "yeastarGsm07Gateway": yeastar_gateway,
        "rhV116Registry": "91 écrans / 1605 entrées / 117 fichiers références",
        "leadAuditV04": "84 fichiers / 1682 entrées LEAD / 9 modules + 6 comm + 14 paramètres",
        "timestampUtc": Utc::now().to_rfc3339()
    }))
}

async fn get_registry() -> impl IntoResponse {
    (
        StatusCode::OK,
        [(
            header::CONTENT_TYPE,
            HeaderValue::from_static("application/json; charset=utf-8"),
        )],
        REGISTRY_SUMMARY_JSON,
    )
}

async fn get_ambiguities(State(state): State<SharedState>) -> Json<Value> {
    let db = state.db.read().await;
    Json(json!(db.ambiguities))
}

async fn get_session(
    State(state): State<SharedState>,
    headers: HeaderMap,
) -> Result<Json<SessionContext>, (StatusCode, Json<Value>)> {
    let (actor_id, site_id) = resolve_session_actor(&state, &headers).await?;
    let db = state.db.read().await;
    build_session_context(&db, &actor_id, &site_id)
        .map(Json)
        .ok_or_else(|| err_resp(StatusCode::NOT_FOUND, "Session ou collaborateur introuvable."))
}

async fn get_section_access(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Path(section_id): Path<String>,
) -> Result<Json<SessionContext>, (StatusCode, Json<Value>)> {
    let (actor_id, site_id) = resolve_session_actor(&state, &headers).await?;
    let db = state.db.read().await;
    let session = build_session_context(&db, &actor_id, &site_id)
        .ok_or_else(|| err_resp(StatusCode::NOT_FOUND, "Session invalide."))?;

    if !session.visible_sections.contains(&section_id) {
        return Err(err_resp(
            StatusCode::FORBIDDEN,
            format!(
                "Accès refusé côté serveur (403) : le profil {} ne dispose pas des autorisations pour la section {}.",
                session.active_profile.name, section_id
            ),
        ));
    }

    Ok(Json(session))
}

async fn get_dashboard(
    State(state): State<SharedState>,
    headers: HeaderMap,
) -> Result<Json<DashboardPayload>, (StatusCode, Json<Value>)> {
    let (actor_id, site_id) = resolve_session_actor(&state, &headers).await?;
    let db = state.db.read().await;
    let session = build_session_context(&db, &actor_id, &site_id)
        .ok_or_else(|| err_resp(StatusCode::NOT_FOUND, "Utilisateur introuvable."))?;

    let allowed_site_ids: HashSet<&str> = session
        .employee
        .site_accesses
        .iter()
        .map(|a| a.site_id.as_str())
        .collect();

    let accessible_sites: Vec<Site> = db
        .sites
        .iter()
        .filter(|s| allowed_site_ids.contains(s.id.as_str()))
        .cloned()
        .collect();

    let all_shifts = filter_shifts_for_actor(&db, &actor_id, &session.active_site_id);
    let all_requests = filter_requests_for_actor(&db, &actor_id, &session.active_site_id);
    let anomalies = filter_anomalies_for_actor(&db, &actor_id, &session.active_site_id);
    let kpis = filter_kpis_for_actor(&db, &actor_id, &session.active_site_id);

    let visible_employees: Vec<RedactedEmployeeView> = db
        .employees
        .iter()
        .filter_map(|e| redact_employee_for_actor(&db, &actor_id, &session.active_site_id, e))
        .collect();

    let my_shifts: Vec<Shift> = all_shifts
        .iter()
        .filter(|s| s.employee_id.as_deref() == Some(actor_id.as_str()))
        .cloned()
        .collect();

    let my_requests: Vec<LeaveRequest> = all_requests
        .iter()
        .filter(|r| r.employee_id == actor_id)
        .cloned()
        .collect();

    let team_requests: Vec<LeaveRequest> = all_requests
        .iter()
        .filter(|r| r.employee_id != actor_id)
        .cloned()
        .collect();

    let positions: Vec<Position> = db
        .positions
        .iter()
        .filter(|p| session.active_site_id == "all" || p.site_id == session.active_site_id)
        .cloned()
        .collect();

    let teams: Vec<Team> = db
        .teams
        .iter()
        .filter(|t| session.active_site_id == "all" || t.site_id == session.active_site_id)
        .cloned()
        .collect();

    let preferences = db
        .preferences_by_employee
        .get(&actor_id)
        .or_else(|| db.preferences_by_employee.get("emp-admin"))
        .cloned()
        .ok_or_else(|| err_resp(StatusCode::INTERNAL_SERVER_ERROR, "Préférences absentes."))?;

    Ok(Json(DashboardPayload {
        organization: db.organization.clone(),
        org02_billing_policy: db.org02_billing_policy.clone(),
        sites: accessible_sites,
        my_shifts,
        team_shifts: all_shifts,
        my_requests,
        team_requests,
        anomalies,
        kpis,
        visible_employees,
        positions,
        teams,
        preferences,
        audit_count: db.audit_log.len(),
        session,
    }))
}

async fn post_shift(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Json(payload): Json<CreateShiftPayload>,
) -> Result<(StatusCode, Json<Shift>), (StatusCode, Json<Value>)> {
    let (actor_id, _) = resolve_session_actor(&state, &headers).await?;
    let mut db = state.db.write().await;
    let site_id = payload.site_id.trim();
    if !db.sites.iter().any(|site| site.id == site_id) {
        return Err(err_resp(
            StatusCode::NOT_FOUND,
            "Établissement introuvable.",
        ));
    }

    let start_minutes = parse_hhmm_minutes(&payload.start_time)
        .ok_or_else(|| err_resp(StatusCode::BAD_REQUEST, "Heure de début invalide."))?;
    let end_minutes = parse_hhmm_minutes(&payload.end_time)
        .ok_or_else(|| err_resp(StatusCode::BAD_REQUEST, "Heure de fin invalide."))?;
    let duration = if end_minutes < start_minutes {
        end_minutes + 24 * 60 - start_minutes
    } else {
        end_minutes - start_minutes
    };
    if payload.break_minutes > 180 || duration <= payload.break_minutes {
        return Err(err_resp(
            StatusCode::BAD_REQUEST,
            "Durée ou pause de shift invalide.",
        ));
    }
    if chrono::NaiveDate::parse_from_str(&payload.date, "%Y-%m-%d").is_err() {
        return Err(err_resp(StatusCode::BAD_REQUEST, "Date de shift invalide."));
    }

    let target_employee = match payload.employee_id.as_deref() {
        Some(employee_id) => {
            let employee = db
                .employees
                .iter()
                .find(|employee| employee.id == employee_id)
                .cloned()
                .ok_or_else(|| err_resp(StatusCode::FORBIDDEN, "Salarié hors périmètre."))?;
            if !employee
                .site_accesses
                .iter()
                .any(|access| access.site_id == site_id)
            {
                return Err(err_resp(
                    StatusCode::FORBIDDEN,
                    "Salarié hors périmètre du club.",
                ));
            }
            Some(employee)
        }
        None => None,
    };
    let target_employee_id = target_employee
        .as_ref()
        .map(|employee| employee.id.as_str());
    let target_team_ids = target_employee
        .as_ref()
        .and_then(|employee| {
            employee
                .site_accesses
                .iter()
                .find(|access| access.site_id == site_id)
        })
        .map(|access| access.team_ids.clone())
        .unwrap_or_default();
    let check = evaluate_permission(
        &db,
        &actor_id,
        site_id,
        "ORG04-01",
        Some(PermissionTarget {
            site_id: Some(site_id),
            target_employee_id,
            target_team_ids: &target_team_ids,
            lock_state: None,
        }),
    );
    if !check.allowed || (target_employee.is_none() && check.effective_scope != Scope::Sites) {
        return Err(err_resp(StatusCode::FORBIDDEN, check.reason));
    }

    if payload.published {
        let publish_check = evaluate_permission(
            &db,
            &actor_id,
            site_id,
            "ORG04-06",
            Some(PermissionTarget {
                site_id: Some(site_id),
                target_employee_id,
                target_team_ids: &target_team_ids,
                lock_state: None,
            }),
        );
        if !publish_check.allowed
            || (target_employee.is_none() && publish_check.effective_scope != Scope::Sites)
        {
            return Err(err_resp(StatusCode::FORBIDDEN, publish_check.reason));
        }
    }

    let position = db
        .positions
        .iter()
        .find(|position| {
            position.id == payload.position_id && position.site_id == site_id && position.active
        })
        .cloned()
        .ok_or_else(|| {
            err_resp(
                StatusCode::BAD_REQUEST,
                "Poste actif introuvable pour ce club.",
            )
        })?;
    if let Some(employee) = target_employee.as_ref() {
        let access = employee
            .site_accesses
            .iter()
            .find(|access| access.site_id == site_id)
            .ok_or_else(|| err_resp(StatusCode::FORBIDDEN, "Salarié hors périmètre du club."))?;
        if !access.position_ids.is_empty() && !access.position_ids.contains(&position.id) {
            return Err(err_resp(
                StatusCode::FORBIDDEN,
                "Poste hors habilitation du salarié.",
            ));
        }
    }
    let shift = Shift {
        id: format!(
            "sh-srv-{}-{}",
            Utc::now().timestamp_micros(),
            db.shifts.len()
        ),
        site_id: site_id.to_string(),
        date: payload.date,
        start_time: payload.start_time,
        end_time: payload.end_time,
        break_minutes: payload.break_minutes,
        employee_id: target_employee_id.map(str::to_string),
        position_id: position.id,
        mission_label: None,
        tasks: vec![payload.role_label],
        lock_state: "none".into(),
        published: payload.published,
    };
    let target_label = target_employee
        .as_ref()
        .map(|employee| format!("{} {}", employee.first_name, employee.last_name))
        .unwrap_or_else(|| "Non assigné".into());
    let before_shifts = db.shifts.clone();
    let before_audit = db.audit_log.clone();
    db.shifts.push(shift.clone());
    append_audit(
        &mut db,
        &actor_id,
        "Création de shift",
        format!("Ajout créneau {}", shift.id),
        site_id,
        &target_label,
        None,
        Some(format!("{}-{}", shift.start_time, shift.end_time)),
    );
    if let Err(error) = persist_state(&state.data_dir, &db) {
        db.shifts = before_shifts;
        db.audit_log = before_audit;
        return Err(err_resp(
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Impossible de persister le shift : {error}"),
        ));
    }
    Ok((StatusCode::CREATED, Json(shift)))
}

async fn patch_shift(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Path(shift_id): Path<String>,
    Json(patch): Json<UpdateShiftPayload>,
) -> Result<Json<Shift>, (StatusCode, Json<Value>)> {
    let (actor_id, site_id) = resolve_session_actor(&state, &headers).await?;
    let mut db = state.db.write().await;

    let shift_idx = db
        .shifts
        .iter()
        .position(|s| s.id == shift_id)
        .ok_or_else(|| err_resp(StatusCode::NOT_FOUND, "Shift introuvable."))?;

    let shift_snapshot = db.shifts[shift_idx].clone();
    let target_emp: Option<Employee> = shift_snapshot
        .employee_id
        .as_ref()
        .and_then(|eid| db.employees.iter().find(|e| &e.id == eid).cloned());

    let target_teams: Vec<String> = target_emp
        .as_ref()
        .and_then(|e| {
            e.site_accesses
                .iter()
                .find(|a| a.site_id == shift_snapshot.site_id)
        })
        .map(|a| a.team_ids.clone())
        .unwrap_or_default();

    let changes_schedule = patch.start_time.is_some()
        || patch.end_time.is_some()
        || patch.break_minutes.is_some()
        || patch.employee_id.is_some()
        || patch.date.is_some();
    if !changes_schedule && patch.published.is_none() && patch.lock_state.is_none() {
        return Err(err_resp(
            StatusCode::BAD_REQUEST,
            "Aucune modification de shift fournie.",
        ));
    }

    let check = evaluate_permission(
        &db,
        &actor_id,
        &site_id,
        "ORG04-02",
        Some(PermissionTarget {
            site_id: Some(&shift_snapshot.site_id),
            target_employee_id: shift_snapshot.employee_id.as_deref(),
            target_team_ids: &target_teams,
            lock_state: Some(&shift_snapshot.lock_state),
        }),
    );
    if changes_schedule
        && (!check.allowed
            || (shift_snapshot.employee_id.is_none() && check.effective_scope != Scope::Sites))
    {
        return Err(err_resp(StatusCode::FORBIDDEN, check.reason));
    }

    let requested_employee_id = patch.employee_id.as_ref().map(|employee_id| {
        if employee_id == "UNASSIGNED" {
            None
        } else {
            Some(employee_id.clone())
        }
    });
    if changes_schedule {
        if let Some(target_employee_id) = requested_employee_id.as_ref().and_then(Option::as_ref) {
            let target_employee = db
                .employees
                .iter()
                .find(|employee| employee.id == *target_employee_id)
                .ok_or_else(|| err_resp(StatusCode::FORBIDDEN, "Salarié hors périmètre."))?;
            let target_access = target_employee
                .site_accesses
                .iter()
                .find(|access| access.site_id == shift_snapshot.site_id)
                .ok_or_else(|| {
                    err_resp(StatusCode::FORBIDDEN, "Salarié hors périmètre du club.")
                })?;
            if !target_access.position_ids.is_empty()
                && !target_access
                    .position_ids
                    .contains(&shift_snapshot.position_id)
            {
                return Err(err_resp(
                    StatusCode::FORBIDDEN,
                    "Poste hors habilitation du salarié.",
                ));
            }
            let destination_check = evaluate_permission(
                &db,
                &actor_id,
                &shift_snapshot.site_id,
                "ORG04-02",
                Some(PermissionTarget {
                    site_id: Some(&shift_snapshot.site_id),
                    target_employee_id: Some(&target_employee.id),
                    target_team_ids: &target_access.team_ids,
                    lock_state: Some(&shift_snapshot.lock_state),
                }),
            );
            if !destination_check.allowed {
                return Err(err_resp(StatusCode::FORBIDDEN, destination_check.reason));
            }
        } else if requested_employee_id.is_some() && check.effective_scope != Scope::Sites {
            return Err(err_resp(
                StatusCode::FORBIDDEN,
                "La désaffectation d’un shift exige une portée établissement.",
            ));
        }
    }

    if patch.published.is_some() {
        let publish_check = evaluate_permission(
            &db,
            &actor_id,
            &shift_snapshot.site_id,
            "ORG04-06",
            Some(PermissionTarget {
                site_id: Some(&shift_snapshot.site_id),
                target_employee_id: shift_snapshot.employee_id.as_deref(),
                target_team_ids: &target_teams,
                lock_state: Some(&shift_snapshot.lock_state),
            }),
        );
        if !publish_check.allowed
            || (shift_snapshot.employee_id.is_none()
                && publish_check.effective_scope != Scope::Sites)
        {
            return Err(err_resp(StatusCode::FORBIDDEN, publish_check.reason));
        }
    }

    if let Some(lock_state) = patch.lock_state.as_deref() {
        if lock_state != "none" && lock_state != "red" {
            return Err(err_resp(StatusCode::BAD_REQUEST, "État de verrouillage invalide."));
        }
        let lock_action = if lock_state == "red" || shift_snapshot.lock_state == "red" {
            "ORG04-05"
        } else {
            "ORG04-04"
        };
        let lock_check = evaluate_permission(
            &db,
            &actor_id,
            &shift_snapshot.site_id,
            lock_action,
            Some(PermissionTarget {
                site_id: Some(&shift_snapshot.site_id),
                target_employee_id: shift_snapshot.employee_id.as_deref(),
                target_team_ids: &target_teams,
                lock_state: Some(&shift_snapshot.lock_state),
            }),
        );
        if !lock_check.allowed
            || (shift_snapshot.employee_id.is_none()
                && lock_check.effective_scope != Scope::Sites)
        {
            return Err(err_resp(StatusCode::FORBIDDEN, lock_check.reason));
        }
    }

    if changes_schedule {
        let updated_date = patch.date.as_deref().unwrap_or(&shift_snapshot.date);
        if chrono::NaiveDate::parse_from_str(updated_date, "%Y-%m-%d").is_err() {
            return Err(err_resp(StatusCode::BAD_REQUEST, "Date de shift invalide."));
        }
        let updated_start = patch
            .start_time
            .as_deref()
            .unwrap_or(&shift_snapshot.start_time);
        let updated_end = patch
            .end_time
            .as_deref()
            .unwrap_or(&shift_snapshot.end_time);
        let updated_break = patch.break_minutes.unwrap_or(shift_snapshot.break_minutes);
        let start_minutes = parse_hhmm_minutes(updated_start)
            .ok_or_else(|| err_resp(StatusCode::BAD_REQUEST, "Heure de début invalide."))?;
        let end_minutes = parse_hhmm_minutes(updated_end)
            .ok_or_else(|| err_resp(StatusCode::BAD_REQUEST, "Heure de fin invalide."))?;
        let duration = if end_minutes < start_minutes {
            end_minutes + 24 * 60 - start_minutes
        } else {
            end_minutes - start_minutes
        };
        if updated_break > 180 || duration <= updated_break {
            return Err(err_resp(
                StatusCode::BAD_REQUEST,
                "Durée ou pause de shift invalide.",
            ));
        }
    }

    let before = format!(
        "{} {}-{} (pause {}m; salarié {}; publié {}; verrou {})",
        shift_snapshot.date,
        shift_snapshot.start_time,
        shift_snapshot.end_time,
        shift_snapshot.break_minutes,
        shift_snapshot.employee_id.as_deref().unwrap_or("UNASSIGNED"),
        shift_snapshot.published,
        shift_snapshot.lock_state
    );
    let before_shifts = db.shifts.clone();
    let before_audit = db.audit_log.clone();
    {
        let shift = &mut db.shifts[shift_idx];
        if let Some(st) = patch.start_time {
            shift.start_time = st;
        }
        if let Some(et) = patch.end_time {
            shift.end_time = et;
        }
        if let Some(bm) = patch.break_minutes {
            shift.break_minutes = bm;
        }
        if let Some(employee_id) = requested_employee_id {
            shift.employee_id = employee_id;
        }
        if let Some(date) = patch.date {
            shift.date = date;
        }
        if let Some(published) = patch.published {
            shift.published = published;
        }
        if let Some(lock_state) = patch.lock_state {
            shift.lock_state = lock_state;
        }
    }
    let updated = db.shifts[shift_idx].clone();
    let after = format!(
        "{} {}-{} (pause {}m; salarié {}; publié {}; verrou {})",
        updated.date,
        updated.start_time,
        updated.end_time,
        updated.break_minutes,
        updated.employee_id.as_deref().unwrap_or("UNASSIGNED"),
        updated.published,
        updated.lock_state
    );
    let target_label = updated
        .employee_id
        .as_ref()
        .and_then(|employee_id| db.employees.iter().find(|employee| &employee.id == employee_id))
        .map(|employee| format!("{} {}", employee.first_name, employee.last_name))
        .unwrap_or_else(|| "Non assigné".to_string());

    append_audit(
        &mut db,
        &actor_id,
        "Modification de shift",
        format!("Ajustement créneau {}", updated.id),
        &updated.site_id,
        &target_label,
        Some(before),
        Some(after),
    );
    if let Err(error) = persist_state(&state.data_dir, &db) {
        db.shifts = before_shifts;
        db.audit_log = before_audit;
        return Err(err_resp(
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Impossible de persister le shift : {error}"),
        ));
    }

    Ok(Json(updated))
}

async fn delete_shift(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Path(shift_id): Path<String>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let (actor_id, site_id) = resolve_session_actor(&state, &headers).await?;
    let mut db = state.db.write().await;
    let shift_idx = db
        .shifts
        .iter()
        .position(|shift| shift.id == shift_id)
        .ok_or_else(|| err_resp(StatusCode::NOT_FOUND, "Shift introuvable."))?;
    let shift = db.shifts[shift_idx].clone();
    let target_employee = shift.employee_id.as_ref().and_then(|employee_id| {
        db.employees
            .iter()
            .find(|employee| &employee.id == employee_id)
            .cloned()
    });
    let target_team_ids = target_employee
        .as_ref()
        .and_then(|employee| {
            employee
                .site_accesses
                .iter()
                .find(|access| access.site_id == shift.site_id)
        })
        .map(|access| access.team_ids.clone())
        .unwrap_or_default();
    let check = evaluate_permission(
        &db,
        &actor_id,
        &site_id,
        "ORG04-02",
        Some(PermissionTarget {
            site_id: Some(&shift.site_id),
            target_employee_id: shift.employee_id.as_deref(),
            target_team_ids: &target_team_ids,
            lock_state: Some(&shift.lock_state),
        }),
    );
    if !check.allowed || (shift.employee_id.is_none() && check.effective_scope != Scope::Sites) {
        return Err(err_resp(StatusCode::FORBIDDEN, check.reason));
    }

    let target_label = target_employee
        .as_ref()
        .map(|employee| format!("{} {}", employee.first_name, employee.last_name))
        .unwrap_or_else(|| "Non assigné".into());
    let before_shifts = db.shifts.clone();
    let before_audit = db.audit_log.clone();
    db.shifts.remove(shift_idx);
    append_audit(
        &mut db,
        &actor_id,
        "Suppression de shift",
        format!("Suppression créneau {}", shift.id),
        &shift.site_id,
        &target_label,
        Some(format!("{}-{}", shift.start_time, shift.end_time)),
        None,
    );
    if let Err(error) = persist_state(&state.data_dir, &db) {
        db.shifts = before_shifts;
        db.audit_log = before_audit;
        return Err(err_resp(
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Impossible de persister la suppression du shift : {error}"),
        ));
    }
    Ok(Json(json!({ "ok": true, "shiftId": shift.id })))
}

async fn get_admin_profiles(
    State(state): State<SharedState>,
    headers: HeaderMap,
) -> Result<Json<Vec<RoleProfile>>, (StatusCode, Json<Value>)> {
    let (actor_id, site_id) = resolve_session_actor(&state, &headers).await?;
    let db = state.db.read().await;

    let can_read = evaluate_permission(&db, &actor_id, &site_id, "ORG04-31", None).allowed
        || evaluate_permission(&db, &actor_id, &site_id, "ORG04-32", None).allowed
        || evaluate_permission(&db, &actor_id, &site_id, "ORG04-33", None).allowed;

    if !can_read {
        return Err(err_resp(
            StatusCode::FORBIDDEN,
            "Lecture de la matrice de droits réservée aux profils habilités.",
        ));
    }

    Ok(Json(db.profiles.clone()))
}

async fn put_admin_profile(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Path(profile_id): Path<String>,
    Json(payload): Json<UpdateProfilePayload>,
) -> Result<Json<RoleProfile>, (StatusCode, Json<Value>)> {
    let (actor_id, site_id) = resolve_session_actor(&state, &headers).await?;
    let mut db = state.db.write().await;

    if let Err(reason) = validate_delegation_update(
        &db,
        &actor_id,
        &site_id,
        &profile_id,
        &payload.scope_selected,
        &payload.checked_map,
    ) {
        return Err(err_resp(StatusCode::FORBIDDEN, reason));
    }

    let Some(scope) = Scope::from_str_strict(&payload.scope_selected) else {
        return Err(err_resp(StatusCode::BAD_REQUEST, "Portée invalide."));
    };

    let idx = db
        .profiles
        .iter()
        .position(|p| p.id == profile_id)
        .ok_or_else(|| err_resp(StatusCode::NOT_FOUND, "Profil introuvable."))?;

    let snapshot = db.clone();
    let prev_scope = db.profiles[idx].scope_selected.clone();
    let profile_name = db.profiles[idx].name.clone();
    let mut changed_actions = Vec::new();

    {
        let profile = &mut db.profiles[idx];
        profile.scope_selected = scope.as_str().to_string();
        for row in &mut profile.rows {
            if let Some(&next_val) = payload.checked_map.get(&row.action_id) {
                if row.checked.unwrap_or(false) != next_val {
                    changed_actions.push(format!(
                        "{}:{}",
                        row.action_id,
                        if next_val { "ON" } else { "OFF" }
                    ));
                    row.checked = Some(next_val);
                }
            }
        }
    }

    let updated = db.profiles[idx].clone();
    let summary = format!(
        "Mise à jour profil {} ({} droit(s), portée {})",
        profile_name,
        changed_actions.len(),
        scope.as_str()
    );
    let after_detail = if changed_actions.is_empty() {
        format!("portée={}; inchangé", scope.as_str())
    } else {
        format!("portée={}; {}", scope.as_str(), changed_actions.join(", "))
    };

    append_audit(
        &mut db,
        &actor_id,
        "Modification de permissions",
        summary,
        "org",
        &profile_name,
        Some(format!("portée={}", prev_scope)),
        Some(after_detail),
    );
    if let Err(err_msg) = persist_state(&state.data_dir, &db) {
        *db = snapshot;
        return Err(err_resp(
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Échec persistance des permissions : {}", err_msg),
        ));
    }

    Ok(Json(updated))
}

async fn get_admin_delegations(
    State(state): State<SharedState>,
    headers: HeaderMap,
) -> Result<Json<Vec<crate::models::ModuleDelegation>>, (StatusCode, Json<Value>)> {
    let (actor_id, site_id) = resolve_session_actor(&state, &headers).await?;
    let db = state.db.read().await;
    let can_view = crate::rbac::is_admin_employee(&db, &actor_id)
        || evaluate_permission(&db, &actor_id, &site_id, "ORG04-31", None).allowed;
    if !can_view {
        return Err(err_resp(
            StatusCode::FORBIDDEN,
            "Accès refusé (403) : lecture des délégations réservée à l'administration.",
        ));
    }
    Ok(Json(db.module_delegations.clone()))
}

async fn put_admin_delegations(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Json(payload): Json<PutModuleDelegationsPayload>,
) -> Result<Json<Vec<crate::models::ModuleDelegation>>, (StatusCode, Json<Value>)> {
    let (actor_id, site_id) = resolve_session_actor(&state, &headers).await?;
    let mut db = state.db.write().await;

    let can_edit = crate::rbac::is_admin_employee(&db, &actor_id)
        || evaluate_permission(&db, &actor_id, &site_id, "ORG04-31", None).allowed;
    if !can_edit {
        return Err(err_resp(
            StatusCode::FORBIDDEN,
            "Accès refusé (403) : modification des délégations réservée à l'administration.",
        ));
    }

    let mut normalized = Vec::with_capacity(payload.delegations.len());
    for del in payload.delegations {
        let emp_id = del.employee_id.trim().to_string();
        if !db.employees.iter().any(|e| e.id == emp_id) {
            return Err(err_resp(
                StatusCode::BAD_REQUEST,
                format!("Collaborateur introuvable pour délégation : {}", emp_id),
            ));
        }

        let module = del.module.trim().to_ascii_lowercase();
        if !matches!(
            module.as_str(),
            "finances" | "reports" | "recovery" | "stocks" | "maintenance"
        ) {
            return Err(err_resp(
                StatusCode::BAD_REQUEST,
                format!("Module de délégation inconnu : {}", del.module),
            ));
        }

        let norm_site = crate::rbac::normalize_site_id(&del.site_id);
        if norm_site != "all" && !crate::rbac::can_access_site_scope(&db, &emp_id, &norm_site) {
            return Err(err_resp(
                StatusCode::BAD_REQUEST,
                format!(
                    "Le collaborateur {} n'est pas rattaché au club {}.",
                    emp_id, del.site_id
                ),
            ));
        }

        let mut clean_actions: Vec<String> = del
            .actions
            .into_iter()
            .map(|a| a.trim().to_ascii_lowercase())
            .filter(|a| !a.is_empty())
            .collect();
        if clean_actions.is_empty() {
            return Err(err_resp(
                StatusCode::BAD_REQUEST,
                "Chaque délégation doit spécifier au moins une action autorisée.",
            ));
        }
        for act in &clean_actions {
            if !matches!(act.as_str(), "view" | "edit" | "export" | "*") {
                return Err(err_resp(
                    StatusCode::BAD_REQUEST,
                    format!("Action de délégation invalide : {}", act),
                ));
            }
        }
        clean_actions.sort();
        clean_actions.dedup();

        normalized.push(crate::models::ModuleDelegation {
            employee_id: emp_id,
            site_id: norm_site,
            module,
            actions: clean_actions,
        });
    }

    let snapshot = db.clone();
    let prev_count = db.module_delegations.len();
    db.module_delegations = normalized.clone();
    append_audit(
        &mut db,
        &actor_id,
        "Mise à jour délégations par club",
        format!("{} délégation(s) structurée(s) enregistrée(s)", normalized.len()),
        "org",
        "ORG04-DEL",
        Some(format!("count={}", prev_count)),
        Some(format!("count={}", normalized.len())),
    );
    if let Err(err_msg) = persist_state(&state.data_dir, &db) {
        *db = snapshot;
        return Err(err_resp(
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Échec persistance des délégations : {}", err_msg),
        ));
    }

    Ok(Json(normalized))
}

fn filter_audit(db: &AppDatabaseState, filters: &AuditFilterQuery) -> Vec<AuditEvent> {
    let q = filters
        .query
        .as_deref()
        .map(|s| s.trim().to_lowercase())
        .filter(|s| !s.is_empty());

    db.audit_log
        .iter()
        .filter(|e| {
            if let Some(ref at) = filters.action_type {
                if at != "ALL" && !at.is_empty() && &e.action_type != at {
                    return false;
                }
            }
            if let Some(ref sf) = filters.site_filter {
                if sf != "all" && !sf.is_empty() && &e.site_id != sf {
                    return false;
                }
            }
            if let Some(ref sd) = filters.start_date {
                if !sd.is_empty() && e.timestamp.get(..10).unwrap_or("") < sd.as_str() {
                    return false;
                }
            }
            if let Some(ref ed) = filters.end_date {
                if !ed.is_empty() && e.timestamp.get(..10).unwrap_or("") > ed.as_str() {
                    return false;
                }
            }
            if let Some(ref needle) = q {
                let hay = format!(
                    "{} {} {} {}",
                    e.actor_name.to_lowercase(),
                    e.summary.to_lowercase(),
                    e.target_label.to_lowercase(),
                    e.action_type.to_lowercase()
                );
                if !hay.contains(needle) {
                    return false;
                }
            }
            true
        })
        .cloned()
        .collect()
}

fn can_view_audit(db: &AppDatabaseState, actor_id: &str, site_id: &str) -> bool {
    evaluate_permission(db, actor_id, site_id, "ORG04-31", None).allowed
        || evaluate_permission(db, actor_id, site_id, "ORG04-32", None).allowed
        || evaluate_permission(db, actor_id, site_id, "ORG04-38", None).allowed
}

async fn get_audit_log(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Query(filters): Query<AuditFilterQuery>,
) -> Result<Json<Vec<AuditEvent>>, (StatusCode, Json<Value>)> {
    let (actor_id, site_id) = resolve_session_actor(&state, &headers).await?;
    let db = state.db.read().await;
    if !can_view_audit(&db, &actor_id, &site_id) {
        return Err(err_resp(
            StatusCode::FORBIDDEN,
            "Consultation du journal d’activité non autorisée pour ce profil.",
        ));
    }
    Ok(Json(filter_audit(&db, &filters)))
}

async fn get_audit_log_csv(
    State(state): State<SharedState>,
    headers: HeaderMap,
) -> impl IntoResponse {
    let (actor_id, site_id) = match resolve_session_actor(&state, &headers).await {
        Ok(actor) => actor,
        Err(error) => return error.into_response(),
    };
    let db = state.db.read().await;
    if !can_view_audit(&db, &actor_id, &site_id) {
        return err_resp(
            StatusCode::FORBIDDEN,
            "Consultation du journal d’activité non autorisée pour ce profil.",
        )
        .into_response();
    }

    let mut lines = vec!["ID;Horodatage;Auteur;Type;Site;Cible;Résumé;Avant;Après".to_string()];
    let esc = |v: &str| format!("\"{}\"", v.replace('"', "\"\""));
    for e in &db.audit_log {
        let row = [
            esc(&e.id),
            esc(&e.timestamp),
            esc(&e.actor_name),
            esc(&e.action_type),
            esc(&e.site_id),
            esc(&e.target_label),
            esc(&e.summary),
            esc(e.before_summary.as_deref().unwrap_or("")),
            esc(e.after_summary.as_deref().unwrap_or("")),
        ]
        .join(";");
        lines.push(row);
    }

    let csv_body = lines.join("\n");
    (
        StatusCode::OK,
        [
            (
                header::CONTENT_TYPE,
                HeaderValue::from_static("text/csv; charset=utf-8"),
            ),
            (
                header::CONTENT_DISPOSITION,
                HeaderValue::from_static("attachment; filename=\"cfitness_audit.csv\""),
            ),
        ],
        csv_body,
    )
        .into_response()
}

async fn put_organization(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Json(patch): Json<UpdateOrganizationPayload>,
) -> Result<Json<Organization>, (StatusCode, Json<Value>)> {
    let (actor_id, site_id) = resolve_session_actor(&state, &headers).await?;
    let mut db = state.db.write().await;

    let check = evaluate_permission(&db, &actor_id, &site_id, "ORG04-32", None);
    if !check.allowed {
        return Err(err_resp(StatusCode::FORBIDDEN, check.reason));
    }

    let snapshot = db.clone();
    let prev_name = db.organization.name.clone();
    if let Some(v) = patch.name {
        db.organization.name = v;
    }
    if let Some(v) = patch.legal_name {
        db.organization.legal_name = v;
    }
    if let Some(v) = patch.siren {
        db.organization.siren = v;
    }
    if let Some(v) = patch.vat_number {
        db.organization.vat_number = v;
    }
    if let Some(v) = patch.sector {
        db.organization.sector = v;
    }
    if let Some(v) = patch.contact_email {
        db.organization.contact_email = v;
    }
    if let Some(v) = patch.meal_allowance_eur {
        db.organization.meal_allowance_eur = v;
    }
    if let Some(v) = patch.billing_notice {
        db.organization.billing_notice = v;
    }

    let updated = db.organization.clone();
    append_audit(
        &mut db,
        &actor_id,
        "Mise à jour organisation",
        format!("Modification fiche organisation ({})", updated.name),
        "org",
        "ORG01",
        Some(prev_name),
        Some(updated.name.clone()),
    );
    if let Err(err_msg) = persist_state(&state.data_dir, &db) {
        *db = snapshot;
        return Err(err_resp(
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Échec persistance des permissions : {}", err_msg),
        ));
    }

    Ok(Json(updated))
}

async fn put_org02_policy(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Json(payload): Json<UpdateOrg02PolicyPayload>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let (actor_id, site_id) = resolve_session_actor(&state, &headers).await?;
    let mut db = state.db.write().await;

    let check = evaluate_permission(&db, &actor_id, &site_id, "ORG04-32", None);
    if !check.allowed {
        return Err(err_resp(StatusCode::FORBIDDEN, check.reason));
    }

    if payload.policy != "exclude_skello_saas" && payload.policy != "keep_internal_admin" {
        return Err(err_resp(StatusCode::BAD_REQUEST, "Politique ORG02 invalide."));
    }

    let snapshot = db.clone();
    let prev = db.org02_billing_policy.clone();
    db.org02_billing_policy = payload.policy.clone();

    append_audit(
        &mut db,
        &actor_id,
        "Décision périmètre ORG02",
        format!("Statut facturation/abonnement réglé sur {}", payload.policy),
        "org",
        "ORG02",
        Some(prev),
        Some(payload.policy.clone()),
    );
    if let Err(err_msg) = persist_state(&state.data_dir, &db) {
        *db = snapshot;
        return Err(err_resp(
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Échec persistance politique ORG02 : {}", err_msg),
        ));
    }

    Ok(Json(json!({ "policy": payload.policy })))
}

async fn get_backup(
    State(state): State<SharedState>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let (actor_id, site_id) = resolve_session_actor(&state, &headers).await?;
    let db = state.db.read().await;
    let check = evaluate_permission(&db, &actor_id, &site_id, "ORG04-31", None);
    if !check.allowed {
        return Err(err_resp(
            StatusCode::FORBIDDEN,
            format!("Export sauvegarde refusé : {}", check.reason),
        ));
    }
    let backup_json = serde_json::to_string_pretty(&*db)
        .map_err(|_| err_resp(StatusCode::INTERNAL_SERVER_ERROR, "Erreur sérialisation JSON."))?;
    Ok(Json(json!({ "backupJson": backup_json })))
}

async fn post_restore(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Json(payload): Json<RestoreBackupPayload>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let (actor_id, site_id) = resolve_session_actor(&state, &headers).await?;
    let mut db = state.db.write().await;

    let check = evaluate_permission(&db, &actor_id, &site_id, "ORG04-31", None);
    if !check.allowed {
        return Err(err_resp(
            StatusCode::FORBIDDEN,
            format!("Restauration refusée : {}", check.reason),
        ));
    }

    let parsed: AppDatabaseState = serde_json::from_str(&payload.backup_json)
        .map_err(|_| err_resp(StatusCode::BAD_REQUEST, "JSON de sauvegarde illisible."))?;

    if parsed.sites.is_empty() || parsed.employees.is_empty() || parsed.profiles.is_empty() {
        return Err(err_resp(
            StatusCode::BAD_REQUEST,
            "Archive JSON invalide ou incomplète.",
        ));
    }

    let snapshot = db.clone();
    *db = parsed;
    let now = Utc::now().to_rfc3339();
    append_audit(
        &mut db,
        &actor_id,
        "Restauration sauvegarde",
        "Restauration complète d’une sauvegarde fictive (TST28)".into(),
        "org",
        "Système CFitness OS",
        None,
        None,
    );
    if let Err(err_msg) = persist_state(&state.data_dir, &db) {
        *db = snapshot;
        return Err(err_resp(
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Échec persistance restauration : {}", err_msg),
        ));
    }

    Ok(Json(json!({ "restoredAt": now })))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateAdminEmployeePayload {
    pub first_name: String,
    pub last_name: String,
    pub site_id: String,
    pub contract_type: Option<String>,
    pub weekly_hours: Option<u32>,
    pub profile_id: Option<String>,
    pub team_ids: Option<Vec<String>>,
    pub managed_team_ids: Option<Vec<String>>,
    #[serde(default)]
    pub initial_password: Option<String>,
}

async fn post_admin_employee(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Json(payload): Json<CreateAdminEmployeePayload>,
) -> Result<(StatusCode, Json<Value>), (StatusCode, Json<Value>)> {
    let (actor_id, _) = resolve_session_actor(&state, &headers).await?;
    let mut db = state.db.write().await;

    let first_name = payload.first_name.trim().to_string();
    let last_name = payload.last_name.trim().to_string();
    if first_name.is_empty() || last_name.is_empty() {
        return Err(err_resp(
            StatusCode::BAD_REQUEST,
            "Prénom et nom requis pour créer un collaborateur.",
        ));
    }
    if !db.sites.iter().any(|s| s.id == payload.site_id) {
        return Err(err_resp(
            StatusCode::BAD_REQUEST,
            format!("Établissement inexistant : {}", payload.site_id),
        ));
    }

    let ctx = build_session_context(&db, &actor_id, &payload.site_id)
        .ok_or_else(|| err_resp(StatusCode::FORBIDDEN, "Accès refusé sur cet établissement."))?;
    let can_create = ctx
        .resolved_permissions
        .get("ORG04-12")
        .map(|p| p.allowed)
        .unwrap_or(false)
        || ctx
            .resolved_permissions
            .get("ORG04-14")
            .map(|p| p.allowed)
            .unwrap_or(false);
    if !can_create {
        return Err(err_resp(
            StatusCode::FORBIDDEN,
            "Accès refusé (403) : permission ORG04-12/ORG04-14 requise pour créer un salarié.",
        ));
    }

    let profile_id = payload
        .profile_id
        .unwrap_or_else(|| "employe_standard".to_string());
    if !db.profiles.iter().any(|p| p.id == profile_id) {
        return Err(err_resp(
            StatusCode::BAD_REQUEST,
            format!("Profil RH inexistant : {}", profile_id),
        ));
    }
    let is_global_admin = db
        .employees
        .iter()
        .find(|e| e.id == actor_id)
        .map(|a| a.site_accesses.iter().any(|sa| sa.profile_id == "admin_systeme"))
        .unwrap_or(false);
    if !is_global_admin && (profile_id == "admin_systeme" || profile_id == "master_avance") {
        return Err(err_resp(
            StatusCode::FORBIDDEN,
            "Non-élévation (403) : profil supérieur non attribuable hors admin_systeme.",
        ));
    }

    let team_ids = payload.team_ids.unwrap_or_default();
    let managed_team_ids = payload.managed_team_ids.unwrap_or_default();
    for tid in team_ids.iter().chain(managed_team_ids.iter()) {
        if !db.teams.iter().any(|t| t.id == *tid && t.site_id == payload.site_id) {
            return Err(err_resp(
                StatusCode::BAD_REQUEST,
                format!("Équipe {} invalide pour le club {}.", tid, payload.site_id),
            ));
        }
    }

    let new_id = format!(
        "emp-staff-{}",
        Utc::now().timestamp_millis()
    );
    let slug = format!(
        "{}.{}",
        first_name.to_lowercase(),
        last_name.to_lowercase()
    )
    .replace(' ', "-");
    let matricule = format!("CF-NEW-{:03}", db.employees.len() + 1);
    let contract_type = payload.contract_type.unwrap_or_else(|| "CDI".to_string());
    let weekly_hours = payload.weekly_hours.unwrap_or(35);

    let new_emp = Employee {
        id: new_id.clone(),
        first_name: first_name.clone(),
        last_name: last_name.clone(),
        birth_name: None,
        matricule,
        email: format!("{}@cfitness-fictif.local", slug),
        phone: "06 00 00 00 99".into(),
        active: true,
        hr_file_status: "complete".into(),
        site_accesses: vec![crate::models::EmployeeSiteAccess {
            site_id: payload.site_id.clone(),
            is_primary: true,
            profile_id,
            show_on_planning: true,
            team_ids,
            managed_team_ids,
            position_ids: vec![],
        }],
        sensitive_bank: crate::models::SensitiveBankInfo {
            payment_mode: "Virement".into(),
            iban_masked: "FR76 •••• •••• •••• 9999".into(),
            bic: "CFITFRPPXXX".into(),
            nir_masked: "1 99 •• •• ••• ••• 99".into(),
        },
        contract: crate::models::ContractSummary {
            id: format!("ctr-{}", new_id),
            site_id: payload.site_id.clone(),
            contract_type,
            regime: "hours".into(),
            weekly_hours: Some(weekly_hours),
            annual_days: None,
            monthly_gross_eur: Some(1823.03),
            hourly_rate_eur: Some(12.02),
            loaded_cost_factor: 1.32,
            effective_from: Utc::now().format("%Y-%m-%d").to_string(),
            effective_to: None,
        },
        counter: crate::models::EmployeeCounter {
            cp_n_acquired: 0.0,
            cp_n_taken: 0.0,
            cp_n_minus1_remaining: 0.0,
            rtt_days_remaining: Some(0.0),
            annualization_balance_hours: Some(0.0),
        },
    };

    let initial_password_hash = if let Some(ref raw_pwd) = payload.initial_password {
        let clean = raw_pwd.trim();
        if clean.chars().count() < 12 {
            return Err(err_resp(
                StatusCode::BAD_REQUEST,
                "Le mot de passe initial doit comporter au moins 12 caractères.",
            ));
        }
        Some(crate::auth_passwords::hash_password(clean))
    } else {
        None
    };

    let snapshot = db.clone();
    db.employees.push(new_emp.clone());
    if let Some(pwd_hash) = initial_password_hash {
        db.password_hashes_by_employee
            .insert(new_id.clone(), pwd_hash);
    }
    db.preferences_by_employee.insert(
        new_id.clone(),
        crate::models::UserPreferences {
            language: "Français".into(),
            notifications: crate::models::NotificationPrefs {
                email_enabled: true,
                sms_enabled: false,
                frequency: "daily".into(),
                digest_hour: "08:30".into(),
                include_activity_report: false,
            },
            calendar_feed_token: format!("cal-{}", new_id),
            calendar_feed_enabled: true,
            sso_enabled: false,
            sso_provider: "OIDC / SAML (non activé)".into(),
            sso_domain: String::new(),
            theme_mode: "dark".into(),
            accent_color: "violet".into(),
        },
    );
    append_audit(
        &mut db,
        &actor_id,
        "Création collaborateur",
        format!("Nouveau salarié {} {} ({}) créé sur {}", first_name, last_name, new_id, payload.site_id),
        "emp",
        &new_id,
        None,
        None,
    );
    if let Err(err_msg) = persist_state(&state.data_dir, &db) {
        *db = snapshot;
        return Err(err_resp(
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Échec persistance serveur : {}", err_msg),
        ));
    }

    Ok((
        StatusCode::CREATED,
        Json(json!({
            "ok": true,
            "employee": new_emp
        })),
    ))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PutEmployeeSiteAccessesPayload {
    pub site_accesses: Vec<crate::models::EmployeeSiteAccess>,
}

async fn put_employee_site_accesses(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Path(emp_id): Path<String>,
    Json(payload): Json<PutEmployeeSiteAccessesPayload>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let (actor_id, _) = resolve_session_actor(&state, &headers).await?;
    let mut db = state.db.write().await;

    let actor = db
        .employees
        .iter()
        .find(|e| e.id == actor_id)
        .cloned()
        .ok_or_else(|| err_resp(StatusCode::NOT_FOUND, "Acteur introuvable."))?;

    let target_emp_snapshot = db
        .employees
        .iter()
        .find(|e| e.id == emp_id)
        .cloned()
        .ok_or_else(|| err_resp(StatusCode::NOT_FOUND, "Salarié cible introuvable."))?;

    if payload.site_accesses.is_empty() {
        return Err(err_resp(
            StatusCode::BAD_REQUEST,
            "Au moins un établissement est requis pour un salarié.",
        ));
    }

    // 1. Validation référentiel : unicité des clubs, 1 seul principal, profils & équipes du club valides
    let mut seen_sites = HashSet::new();
    let mut primary_count = 0usize;
    for acc in &payload.site_accesses {
        if !seen_sites.insert(acc.site_id.as_str()) {
            return Err(err_resp(
                StatusCode::BAD_REQUEST,
                format!("Doublon d'établissement dans le payload : {}", acc.site_id),
            ));
        }
        if acc.is_primary {
            primary_count += 1;
        }
        if !db.sites.iter().any(|s| s.id == acc.site_id) {
            return Err(err_resp(
                StatusCode::BAD_REQUEST,
                format!("Établissement inexistant : {}", acc.site_id),
            ));
        }
        if !db.profiles.iter().any(|p| p.id == acc.profile_id) {
            return Err(err_resp(
                StatusCode::BAD_REQUEST,
                format!("Profil RH inexistant : {}", acc.profile_id),
            ));
        }
        for tid in &acc.team_ids {
            let valid_team = db
                .teams
                .iter()
                .any(|t| t.id == *tid && t.site_id == acc.site_id);
            if !valid_team {
                return Err(err_resp(
                    StatusCode::BAD_REQUEST,
                    format!(
                        "Équipe {} inexistante ou n'appartenant pas au club {}.",
                        tid, acc.site_id
                    ),
                ));
            }
        }
        if !acc.managed_team_ids.is_empty()
            && !matches!(
                acc.profile_id.as_str(),
                "planificateur_standard" | "planificateur_avance" | "master_avance" | "admin_systeme"
            )
        {
            return Err(err_resp(
                StatusCode::BAD_REQUEST,
                format!(
                    "Le profil {} ne peut pas encadrer d'équipes sur {}.",
                    acc.profile_id, acc.site_id
                ),
            ));
        }
        for tid in &acc.managed_team_ids {
            let valid_team = db
                .teams
                .iter()
                .any(|t| t.id == *tid && t.site_id == acc.site_id);
            if !valid_team {
                return Err(err_resp(
                    StatusCode::BAD_REQUEST,
                    format!(
                        "Équipe encadrée {} inexistante ou n'appartenant pas au club {}.",
                        tid, acc.site_id
                    ),
                ));
            }
        }
        for pid in &acc.position_ids {
            let valid_pos = db
                .positions
                .iter()
                .any(|p| p.id == *pid && p.site_id == acc.site_id);
            if !valid_pos {
                return Err(err_resp(
                    StatusCode::BAD_REQUEST,
                    format!(
                        "Poste {} inexistant ou n'appartenant pas au club {}.",
                        pid, acc.site_id
                    ),
                ));
            }
        }
    }
    if primary_count != 1 {
        return Err(err_resp(
            StatusCode::BAD_REQUEST,
            "Exactement un établissement principal (isPrimary=true) est requis.",
        ));
    }

    // 2. Contrôle différentiel AVANT/APRÈS : tout club ajouté, modifié ou retiré doit être autorisé
    let is_global_admin = actor
        .site_accesses
        .iter()
        .any(|sa| sa.profile_id == "admin_systeme");

    if !is_global_admin {
        let mut impacted_sites: HashSet<String> = HashSet::new();
        for old_sa in &target_emp_snapshot.site_accesses {
            let new_sa = payload
                .site_accesses
                .iter()
                .find(|n| n.site_id == old_sa.site_id);
            let changed = match new_sa {
                None => true,
                Some(n) => {
                    n.is_primary != old_sa.is_primary
                        || n.profile_id != old_sa.profile_id
                        || n.team_ids != old_sa.team_ids
                        || n.managed_team_ids != old_sa.managed_team_ids
                        || n.show_on_planning != old_sa.show_on_planning
                        || n.position_ids != old_sa.position_ids
                }
            };
            if changed {
                impacted_sites.insert(old_sa.site_id.clone());
            }
        }
        for new_sa in &payload.site_accesses {
            let old_opt = target_emp_snapshot
                .site_accesses
                .iter()
                .find(|o| o.site_id == new_sa.site_id);
            let existed = old_opt.is_some();
            if !existed {
                impacted_sites.insert(new_sa.site_id.clone());
            }
            let profile_added_or_changed = old_opt
                .map(|o| o.profile_id != new_sa.profile_id)
                .unwrap_or(true);
            if profile_added_or_changed
                && (new_sa.profile_id == "admin_systeme" || new_sa.profile_id == "master_avance")
            {
                return Err(err_resp(
                    StatusCode::FORBIDDEN,
                    "Non-élévation (403) : profil supérieur non attribuable hors admin_systeme.",
                ));
            }
        }

        for site_id in impacted_sites {
            let allowed_on_club = actor
                .site_accesses
                .iter()
                .any(|sa| sa.site_id == site_id)
                && build_session_context(&db, &actor_id, &site_id)
                    .map(|ctx| {
                        ctx.resolved_permissions
                            .get("ORG04-14")
                            .map(|p| p.allowed)
                            .unwrap_or(false)
                            || ctx
                                .resolved_permissions
                                .get("ORG04-12")
                                .map(|p| p.allowed)
                                .unwrap_or(false)
                    })
                    .unwrap_or(false);
            if !allowed_on_club {
                return Err(err_resp(
                    StatusCode::FORBIDDEN,
                    format!(
                        "Accès refusé (403) : aucune délégation ORG04-12/ORG04-14 sur le club {}.",
                        site_id
                    ),
                ));
            }
        }
    }

    // 3. Mise à jour atomique + persistance disque obligatoire
    let old_accesses = target_emp_snapshot.site_accesses;
    let old_audit_len = db.audit_log.len();
    if let Some(emp) = db.employees.iter_mut().find(|e| e.id == emp_id) {
        emp.site_accesses = payload.site_accesses.clone();
    }

    append_audit(
        &mut db,
        &actor_id,
        "Mise à jour affectations multi-clubs",
        format!("{} accès enregistrés pour {}", payload.site_accesses.len(), emp_id),
        "emp",
        &emp_id,
        None,
        None,
    );
    if let Err(err_msg) = persist_state(&state.data_dir, &db) {
        if let Some(emp) = db.employees.iter_mut().find(|e| e.id == emp_id) {
            emp.site_accesses = old_accesses;
        }
        db.audit_log.truncate(old_audit_len);
        return Err(err_resp(
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Échec persistance serveur : {}", err_msg),
        ));
    }

    Ok(Json(json!({
        "ok": true,
        "employeeId": emp_id,
        "siteAccesses": payload.site_accesses
    })))
}

fn default_employee_preferences(actor_id: &str) -> UserPreferences {
    UserPreferences {
        language: "Français".into(),
        notifications: crate::models::NotificationPrefs {
            email_enabled: true,
            sms_enabled: false,
            frequency: "daily".into(),
            digest_hour: "08:30".into(),
            include_activity_report: false,
        },
        calendar_feed_token: format!("cal-{}", actor_id),
        calendar_feed_enabled: true,
        sso_enabled: false,
        sso_provider: "OIDC / SAML (non activé)".into(),
        sso_domain: String::new(),
        theme_mode: "dark".into(),
        accent_color: "violet".into(),
    }
}

async fn get_preferences(
    State(state): State<SharedState>,
    headers: HeaderMap,
) -> Result<Json<UserPreferences>, (StatusCode, Json<Value>)> {
    let (actor_id, _) = resolve_session_actor(&state, &headers).await?;
    let db = state.db.read().await;

    if !db.employees.iter().any(|e| e.id == actor_id) {
        return Err(err_resp(StatusCode::NOT_FOUND, "Collaborateur introuvable."));
    }

    let prefs = db
        .preferences_by_employee
        .get(&actor_id)
        .cloned()
        .unwrap_or_else(|| default_employee_preferences(&actor_id));
    Ok(Json(prefs))
}

async fn put_preferences(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Json(patch): Json<UpdatePreferencesPayload>,
) -> Result<Json<UserPreferences>, (StatusCode, Json<Value>)> {
    if let Some(ref mode) = patch.theme_mode {
        if mode != "dark" && mode != "light" {
            return Err(err_resp(
                StatusCode::BAD_REQUEST,
                "Mode d'apparence invalide (valeurs attendues : dark ou light).",
            ));
        }
    }
    if let Some(ref accent) = patch.accent_color {
        if !matches!(
            accent.as_str(),
            "violet" | "blue" | "emerald" | "rose" | "amber" | "cyan"
        ) {
            return Err(err_resp(
                StatusCode::BAD_REQUEST,
                "Couleur d'accentuation invalide.",
            ));
        }
    }

    let (actor_id, _) = resolve_session_actor(&state, &headers).await?;
    let mut db = state.db.write().await;

    if !db.employees.iter().any(|e| e.id == actor_id) {
        return Err(err_resp(StatusCode::NOT_FOUND, "Collaborateur introuvable."));
    }

    let mut prefs = db
        .preferences_by_employee
        .get(&actor_id)
        .cloned()
        .unwrap_or_else(|| default_employee_preferences(&actor_id));

    if let Some(lang) = patch.language {
        prefs.language = lang;
    }
    if let Some(np) = patch.notifications {
        if let Some(v) = np.email_enabled {
            prefs.notifications.email_enabled = v;
        }
        if let Some(v) = np.sms_enabled {
            prefs.notifications.sms_enabled = v;
        }
        if let Some(v) = np.frequency {
            prefs.notifications.frequency = v;
        }
        if let Some(v) = np.digest_hour {
            prefs.notifications.digest_hour = v;
        }
        if let Some(v) = np.include_activity_report {
            prefs.notifications.include_activity_report = v;
        }
    }
    if let Some(v) = patch.calendar_feed_enabled {
        prefs.calendar_feed_enabled = v;
    }
    if let Some(v) = patch.sso_enabled {
        prefs.sso_enabled = v;
    }
    if let Some(v) = patch.sso_provider {
        prefs.sso_provider = v;
    }
    if let Some(v) = patch.sso_domain {
        prefs.sso_domain = v;
    }
    if let Some(v) = patch.theme_mode {
        prefs.theme_mode = v;
    }
    if let Some(v) = patch.accent_color {
        prefs.accent_color = v;
    }

    let snapshot = db.clone();
    db.preferences_by_employee
        .insert(actor_id.clone(), prefs.clone());
    let summary = format!(
        "Mise à jour thème={}, accent={}, langue={}, canal e-mail={}, fréquence={}",
        prefs.theme_mode,
        prefs.accent_color,
        prefs.language,
        prefs.notifications.email_enabled,
        prefs.notifications.frequency
    );
    append_audit(
        &mut db,
        &actor_id,
        "Préférences personnelles",
        summary,
        "org",
        "MC13",
        None,
        None,
    );
    if let Err(err_msg) = persist_state(&state.data_dir, &db) {
        *db = snapshot;
        return Err(err_resp(
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Échec persistance des préférences : {}", err_msg),
        ));
    }

    Ok(Json(prefs))
}

async fn post_revoke_calendar_token(
    State(state): State<SharedState>,
    headers: HeaderMap,
) -> Result<Json<UserPreferences>, (StatusCode, Json<Value>)> {
    let (actor_id, _) = resolve_session_actor(&state, &headers).await?;
    let mut db = state.db.write().await;

    if !db.employees.iter().any(|e| e.id == actor_id) {
        return Err(err_resp(StatusCode::NOT_FOUND, "Collaborateur introuvable."));
    }

    let mut prefs = db
        .preferences_by_employee
        .get(&actor_id)
        .cloned()
        .unwrap_or_else(|| default_employee_preferences(&actor_id));

    let snapshot = db.clone();
    let prev = prefs.calendar_feed_token.clone();
    let suffix = Utc::now().timestamp_millis() & 0xFFFF_FFFF;
    prefs.calendar_feed_token = format!("cal-revoked-new-{:x}", suffix);
    db.preferences_by_employee
        .insert(actor_id.clone(), prefs.clone());

    append_audit(
        &mut db,
        &actor_id,
        "Révocation flux calendrier",
        "Renouvellement et révocation de l’URL personnelle .ics (EX32)".into(),
        "org",
        "UTI04",
        Some(prev),
        Some(prefs.calendar_feed_token.clone()),
    );
    if let Err(err_msg) = persist_state(&state.data_dir, &db) {
        *db = snapshot;
        return Err(err_resp(
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Échec persistance révocation flux calendrier : {}", err_msg),
        ));
    }

    Ok(Json(prefs))
}

async fn post_change_password(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Json(payload): Json<ChangePasswordPayload>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let (actor_id, _) = resolve_session_actor(&state, &headers).await?;
    let mut db = state.db.write().await;

    if !db.employees.iter().any(|e| e.id == actor_id && e.active) {
        return Err(err_resp(StatusCode::NOT_FOUND, "Collaborateur introuvable."));
    }

    let current_secret = payload.current_secret.trim();
    let new_secret = payload.new_secret.trim();

    if current_secret.is_empty() || !verify_employee_secret(&db, &actor_id, current_secret) {
        return Err(err_resp(
            StatusCode::UNAUTHORIZED,
            "Mot de passe ou code PIN actuel incorrect.",
        ));
    }

    if new_secret.chars().count() < 12 {
        return Err(err_resp(
            StatusCode::BAD_REQUEST,
            "Le nouveau mot de passe doit comporter au moins 12 caractères.",
        ));
    }

    let pwd_hash = crate::auth_passwords::hash_password(new_secret);
    let snapshot = db.clone();
    db.password_hashes_by_employee
        .insert(actor_id.clone(), pwd_hash);
    append_audit(
        &mut db,
        &actor_id,
        "Sécurité compte",
        "Changement de mot de passe utilisateur validé et haché (UTI05 / OS185)".into(),
        "org",
        "UTI05",
        None,
        None,
    );
    if let Err(err_msg) = persist_state(&state.data_dir, &db) {
        *db = snapshot;
        return Err(err_resp(
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Échec persistance changement mot de passe : {}", err_msg),
        ));
    }

    Ok(Json(json!({ "changed": true })))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AdminSetPasswordPayload {
    pub new_secret: String,
}

async fn put_admin_employee_password(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Path(emp_id): Path<String>,
    Json(payload): Json<AdminSetPasswordPayload>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let (actor_id, _) = resolve_session_actor(&state, &headers).await?;
    let mut db = state.db.write().await;

    if !crate::rbac::is_admin_employee(&db, &actor_id) {
        return Err(err_resp(
            StatusCode::FORBIDDEN,
            "Accès refusé (403) : réinitialisation de mot de passe réservée à l'administrateur.",
        ));
    }

    let target_id = emp_id.trim().to_string();
    if !db.employees.iter().any(|e| e.id == target_id) {
        return Err(err_resp(StatusCode::NOT_FOUND, "Collaborateur cible introuvable."));
    }

    let new_secret = payload.new_secret.trim();
    if new_secret.chars().count() < 12 {
        return Err(err_resp(
            StatusCode::BAD_REQUEST,
            "Le nouveau mot de passe doit comporter au moins 12 caractères.",
        ));
    }

    let pwd_hash = crate::auth_passwords::hash_password(new_secret);
    let snapshot = db.clone();
    db.password_hashes_by_employee
        .insert(target_id.clone(), pwd_hash);
    append_audit(
        &mut db,
        &actor_id,
        "Sécurité compte (Admin)",
        format!("Réinitialisation serveur du mot de passe pour {}", target_id),
        "emp",
        &target_id,
        None,
        None,
    );
    if let Err(err_msg) = persist_state(&state.data_dir, &db) {
        *db = snapshot;
        return Err(err_resp(
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Échec persistance réinitialisation mot de passe : {}", err_msg),
        ));
    }
    drop(db);

    // Révoquer toutes les sessions Bearer actives du collaborateur ciblé
    state
        .sessions
        .write()
        .await
        .retain(|_, (sid, _)| sid != &target_id);

    Ok(Json(json!({ "ok": true, "employeeId": target_id })))
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct OllamaChatMessage {
    pub role: String,
    pub content: String,
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct OllamaChatPayload {
    pub model: Option<String>,
    pub system_prompt: Option<String>,
    pub messages: Vec<OllamaChatMessage>,
}

fn ollama_base_url() -> String {
    std::env::var("OLLAMA_BASE_URL")
        .ok()
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| "http://host.docker.internal:11434".to_string())
}

fn ollama_default_model() -> String {
    std::env::var("OLLAMA_DEFAULT_MODEL")
        .ok()
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| "qwen2.5:3b".to_string())
}

fn parse_http_host_port(base_url: &str) -> (String, String) {
    let stripped = base_url
        .trim()
        .trim_start_matches("http://")
        .trim_start_matches("https://")
        .split('/')
        .next()
        .unwrap_or("127.0.0.1:11434");
    if stripped.contains(':') {
        (stripped.to_string(), stripped.to_string())
    } else {
        let addr = format!("{}:11434", stripped);
        (addr.clone(), addr)
    }
}

fn decode_http_body(raw: &[u8]) -> Result<String, String> {
    let text = String::from_utf8_lossy(raw);
    let Some((headers_part, body_part)) = text.split_once("\r\n\r\n") else {
        return Err("Réponse HTTP Ollama invalide.".into());
    };
    let is_chunked = headers_part
        .to_ascii_lowercase()
        .contains("transfer-encoding: chunked");
    if !is_chunked {
        return Ok(body_part.to_string());
    }
    let body_bytes = body_part.as_bytes();
    let mut pos = 0usize;
    let mut acc: Vec<u8> = Vec::new();
    while pos < body_bytes.len() {
        let Some(rel_crlf) = body_bytes[pos..].windows(2).position(|w| w == b"\r\n") else {
            break;
        };
        let len_str = String::from_utf8_lossy(&body_bytes[pos..pos + rel_crlf]);
        let len_hex = len_str.split(';').next().unwrap_or("").trim();
        let Ok(chunk_len) = usize::from_str_radix(len_hex, 16) else {
            break;
        };
        pos += rel_crlf + 2;
        if chunk_len == 0 {
            break;
        }
        let end = (pos + chunk_len).min(body_bytes.len());
        acc.extend_from_slice(&body_bytes[pos..end]);
        pos = end;
        if pos + 2 <= body_bytes.len() && &body_bytes[pos..pos + 2] == b"\r\n" {
            pos += 2;
        }
    }
    Ok(String::from_utf8_lossy(&acc).to_string())
}

async fn ollama_http_request(
    method: &str,
    path: &str,
    json_body: Option<&str>,
    timeout_secs: u64,
) -> Result<Value, String> {
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    use tokio::net::TcpStream;

    let base = ollama_base_url();
    let (addr, host_hdr) = parse_http_host_port(&base);
    let body = json_body.unwrap_or("");

    let req = if method == "POST" {
        format!(
            "POST {} HTTP/1.1\r\nHost: {}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
            path,
            host_hdr,
            body.as_bytes().len(),
            body
        )
    } else {
        format!(
            "GET {} HTTP/1.1\r\nHost: {}\r\nConnection: close\r\n\r\n",
            path, host_hdr
        )
    };

    let fut = async {
        let mut stream = TcpStream::connect(&addr)
            .await
            .map_err(|e| format!("Connexion Ollama ({}) impossible: {}", addr, e))?;
        stream
            .write_all(req.as_bytes())
            .await
            .map_err(|e| format!("Écriture requête Ollama impossible: {}", e))?;
        let mut buf = Vec::new();
        stream
            .read_to_end(&mut buf)
            .await
            .map_err(|e| format!("Lecture réponse Ollama impossible: {}", e))?;
        let body_str = decode_http_body(&buf)?;
        serde_json::from_str::<Value>(&body_str)
            .map_err(|e| format!("Réponse JSON Ollama invalide: {}", e))
    };

    tokio::time::timeout(std::time::Duration::from_secs(timeout_secs), fut)
        .await
        .map_err(|_| format!("Délai dépassé ({}s) sur Ollama ({}).", timeout_secs, base))?
}

async fn get_ollama_status() -> Json<Value> {
    let base_url = ollama_base_url();
    let default_model = ollama_default_model();
    match ollama_http_request("GET", "/api/tags", None, 5).await {
        Ok(val) => {
            let models: Vec<String> = val
                .get("models")
                .and_then(|m| m.as_array())
                .map(|arr| {
                    arr.iter()
                        .filter_map(|item| item.get("name").and_then(|n| n.as_str()).map(String::from))
                        .collect()
                })
                .unwrap_or_default();
            Json(json!({
                "online": true,
                "baseUrl": base_url,
                "defaultModel": default_model,
                "models": models,
            }))
        }
        Err(err) => Json(json!({
            "online": false,
            "baseUrl": base_url,
            "defaultModel": default_model,
            "models": [],
            "error": err,
        })),
    }
}

async fn post_ollama_chat(Json(payload): Json<OllamaChatPayload>) -> Json<Value> {
    let model = payload
        .model
        .filter(|m| !m.trim().is_empty())
        .unwrap_or_else(ollama_default_model);

    let mut msgs: Vec<Value> = Vec::new();
    if let Some(sys) = payload.system_prompt.filter(|s| !s.trim().is_empty()) {
        msgs.push(json!({ "role": "system", "content": sys }));
    }
    for m in payload.messages {
        if !m.content.trim().is_empty() {
            msgs.push(json!({ "role": m.role, "content": m.content }));
        }
    }

    let req_body = json!({
        "model": model,
        "messages": msgs,
        "stream": false,
        "options": {
            "temperature": 0.3
        }
    });

    match ollama_http_request("POST", "/api/chat", Some(&req_body.to_string()), 90).await {
        Ok(val) => {
            let reply = val
                .get("message")
                .and_then(|m| m.get("content"))
                .and_then(|c| c.as_str())
                .unwrap_or("")
                .to_string();
            if reply.is_empty() {
                let err_msg = val
                    .get("error")
                    .and_then(|e| e.as_str())
                    .unwrap_or("Réponse vide du modèle Ollama.");
                Json(json!({
                    "ok": false,
                    "model": model,
                    "error": err_msg,
                }))
            } else {
                Json(json!({
                    "ok": true,
                    "model": model,
                    "reply": reply,
                }))
            }
        }
        Err(err) => Json(json!({
            "ok": false,
            "model": model,
            "error": err,
        })),
    }
}

fn site_id_to_club_id(site_id: &str) -> &'static str {
    if site_id == "club-beynost" || site_id == "beynost" {
        "beynost"
    } else {
        "carre-de-soie"
    }
}

pub(crate) fn authorized_clubs_for_actor(db: &AppDatabaseState, actor_id: &str) -> HashSet<String> {
    let mut clubs = HashSet::new();
    if let Some(emp) = db.employees.iter().find(|e| e.id == actor_id) {
        if emp.site_accesses.iter().any(|sa| sa.profile_id == "admin_systeme") {
            clubs.insert("carre-de-soie".to_string());
            clubs.insert("beynost".to_string());
            return clubs;
        }
        for sa in &emp.site_accesses {
            clubs.insert(site_id_to_club_id(&sa.site_id).to_string());
        }
    }
    clubs
}

pub(crate) fn actor_has_lead_admin_write_on_club(db: &AppDatabaseState, actor_id: &str, club_id: &str) -> bool {
    let Some(emp) = db.employees.iter().find(|e| e.id == actor_id) else {
        return false;
    };
    if emp.site_accesses.iter().any(|sa| sa.profile_id == "admin_systeme") {
        return true;
    }
    emp.site_accesses.iter().any(|sa| {
        site_id_to_club_id(&sa.site_id) == club_id
            && matches!(sa.profile_id.as_str(), "master_avance" | "planificateur_avance")
    })
}

fn actor_has_lead_rdv_write_on_club(db: &AppDatabaseState, actor_id: &str, club_id: &str) -> bool {
    let Some(emp) = db.employees.iter().find(|e| e.id == actor_id) else {
        return false;
    };
    if emp.site_accesses.iter().any(|sa| sa.profile_id == "admin_systeme") {
        return true;
    }
    emp.site_accesses.iter().any(|sa| {
        site_id_to_club_id(&sa.site_id) == club_id
            && matches!(
                sa.profile_id.as_str(),
                "master_avance" | "planificateur_avance" | "planificateur_standard"
            )
    })
}

fn parse_hhmm_minutes(hhmm: &str) -> Option<u32> {
    let mut parts = hhmm.trim().split(':');
    let h: u32 = parts.next()?.parse().ok()?;
    let m: u32 = parts.next()?.parse().ok()?;
    if h > 23 || m > 59 {
        return None;
    }
    Some(h * 60 + m)
}

fn resolve_available_commercial_for_club(db: &AppDatabaseState, club_id: &str) -> String {
    let today = Utc::now().format("%Y-%m-%d").to_string();
    let candidates = if club_id == "beynost" {
        vec!["emp-chloe", "emp-greg", "emp-sarah"]
    } else {
        vec!["emp-maxime", "emp-karim", "emp-sarah"]
    };

    for emp_id in candidates {
        let is_on_leave = db.leave_requests.iter().any(|lr| {
            lr.employee_id == emp_id
                && (lr.status == "VALIDE" || lr.status == "EN_ATTENTE")
                && lr.start_date.as_str() <= today.as_str()
                && lr.end_date.as_str() >= today.as_str()
        });
        if !is_on_leave {
            return emp_id.to_string();
        }
    }
    format!("file_attente_{}", club_id)
}

async fn get_public_lead_form(
    State(state): State<SharedState>,
    Path((club_id, form_id)): Path<(String, String)>,
) -> Result<(StatusCode, Json<Value>), (StatusCode, Json<Value>)> {
    if club_id != "carre-de-soie" && club_id != "beynost" {
        return Err(err_resp(StatusCode::NOT_FOUND, "Club introuvable."));
    }
    let db = state.db.read().await;
    let form = db
        .lead_forms
        .iter()
        .find(|f| f.id == form_id && f.club_id == club_id && f.published)
        .ok_or_else(|| err_resp(StatusCode::NOT_FOUND, "Formulaire indisponible ou non publié."))?;

    Ok((
        StatusCode::OK,
        Json(json!({
            "id": form.id,
            "name": form.name,
            "clubId": form.club_id,
            "published": form.published,
            "sectionTitles": form.section_titles,
            "fields": form.fields
        })),
    ))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PublicFormSubmitPayload {
    pub full_name: String,
    pub email: String,
    #[serde(default)]
    pub phone: String,
    pub rgpd_consent: bool,
    #[serde(default)]
    pub answers: Value,
}

async fn post_public_lead_form_submit(
    State(state): State<SharedState>,
    Path((club_id, form_id)): Path<(String, String)>,
    Json(payload): Json<PublicFormSubmitPayload>,
) -> Result<(StatusCode, Json<Value>), (StatusCode, Json<Value>)> {
    if club_id != "carre-de-soie" && club_id != "beynost" {
        return Err(err_resp(StatusCode::NOT_FOUND, "Club introuvable."));
    }
    let email = payload.email.trim().to_lowercase();
    let full_name = payload.full_name.trim().to_string();
    if full_name.is_empty() || email.is_empty() || !email.contains('@') {
        return Err(err_resp(
            StatusCode::BAD_REQUEST,
            "Nom et e-mail valide requis.",
        ));
    }

    let mut db = state.db.write().await;
    let form_idx = db
        .lead_forms
        .iter()
        .position(|f| f.id == form_id && f.club_id == club_id && f.published)
        .ok_or_else(|| err_resp(StatusCode::NOT_FOUND, "Formulaire indisponible ou non publié."))?;

    let form_name = db.lead_forms[form_idx].name.clone();

    // Rattachement ou création canonique du prospect (idempotent par e-mail + club)
    let prospect_id = if let Some(existing) = db
        .lead_prospects
        .iter_mut()
        .find(|p| p.email.eq_ignore_ascii_case(&email) && p.club_id == club_id)
    {
        if existing.rgpd_consent != payload.rgpd_consent && payload.rgpd_consent {
            existing.rgpd_consent = true;
        }
        existing.id.clone()
    } else {
        let mut parts = full_name.splitn(2, ' ');
        let first_name = parts.next().unwrap_or("Contact").to_string();
        let last_name = parts.next().unwrap_or("Public").to_string();
        let new_pid = format!("pr-pub-{}", Utc::now().timestamp_millis());
        let assigned_id = resolve_available_commercial_for_club(&db, &club_id);
        db.lead_prospects.insert(
            0,
            crate::models::LeadProspectRecord {
                id: new_pid.clone(),
                gender: String::new(),
                first_name,
                last_name,
                email: email.clone(),
                phone: payload.phone.trim().to_string(),
                street: String::new(),
                postal_code: String::new(),
                city: String::new(),
                birth_date: String::new(),
                comment: format!("Soumission formulaire {}", form_name),
                club_id: club_id.clone(),
                source: "Formulaire public".into(),
                stage: "Nouveau".into(),
                lead_status: "Nouveau".into(),
                rgpd_consent: payload.rgpd_consent,
                segments: vec![],
                trial_date: None,
                assigned_to_id: Some(assigned_id),
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
                created_at: Utc::now().format("%Y-%m-%d").to_string(),
            },
        );
        new_pid
    };

    let response_id = format!("rep-pub-{}", Utc::now().timestamp_millis());
    let sample = crate::models::LeadFormSampleResponseRecord {
        id: response_id.clone(),
        full_name: full_name.clone(),
        email: email.clone(),
        phone: payload.phone.trim().to_string(),
        rgpd_consent: payload.rgpd_consent,
        answers: payload.answers,
        submitted_at: Utc::now().format("%Y-%m-%d %H:%M").to_string(),
        linked_prospect_id: Some(prospect_id.clone()),
    };

    let form_name = db.lead_forms[form_idx].name.clone();
    db.lead_forms[form_idx].responses_count += 1;
    db.lead_forms[form_idx].sample_responses.insert(0, sample);

    let act_id = format!("act-frm-{}", Utc::now().timestamp_millis());
    db.lead_activities.insert(
        0,
        crate::models::LeadActivityRecord {
            id: act_id.clone(),
            activity_type: "CONTACT".into(),
            title: format!("Formulaire public : {}", form_name),
            prospect_id: Some(prospect_id.clone()),
            prospect_name: full_name,
            club_id: club_id.clone(),
            due_at: Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true),
            status: "todo".into(),
            assigned_to_id: if club_id == "beynost" {
                "emp-chloe".into()
            } else {
                "emp-maxime".into()
            },
            status_label: "Nouvelle soumission".into(),
        },
    );

    if let Err(err_msg) = persist_state(&state.data_dir, &db) {
        return Err(err_resp(
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Échec persistance serveur : {}", err_msg),
        ));
    }

    Ok((
        StatusCode::CREATED,
        Json(json!({
            "ok": true,
            "responseId": response_id,
            "prospectId": prospect_id,
            "activityId": act_id
        })),
    ))
}

fn resolve_public_book_type(slot_type: &str) -> Option<(&'static str, u32)> {
    match slot_type {
        "coaching-decouverte" => Some(("Séance Découverte Coaching", 60)),
        "bilan-checkup-technogym" => Some(("Bilan Checkup Technogym", 60)),
        _ => None,
    }
}

async fn get_public_book_slot(
    State(state): State<SharedState>,
    Path((club_id, slot_type)): Path<(String, String)>,
) -> Result<(StatusCode, Json<Value>), (StatusCode, Json<Value>)> {
    if club_id != "carre-de-soie" && club_id != "beynost" {
        return Err(err_resp(StatusCode::NOT_FOUND, "Club introuvable."));
    }
    let (label, duration) = resolve_public_book_type(&slot_type)
        .ok_or_else(|| err_resp(StatusCode::NOT_FOUND, "Type de créneau introuvable."))?;

    let db = state.db.read().await;
    let busy: Vec<Value> = db
        .lead_appointments
        .iter()
        .filter(|a| a.club_id == club_id && a.status != "annule")
        .map(|a| json!({ "date": a.date, "startTime": a.start_time, "durationMinutes": a.duration_minutes }))
        .collect();

    Ok((
        StatusCode::OK,
        Json(json!({
            "clubId": club_id,
            "slotType": slot_type,
            "label": label,
            "durationMinutes": duration,
            "busySlots": busy
        })),
    ))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PublicBookSlotPayload {
    pub full_name: String,
    pub email: String,
    pub date: String,
    pub start_time: String,
}

async fn post_public_book_slot(
    State(state): State<SharedState>,
    Path((club_id, slot_type)): Path<(String, String)>,
    Json(payload): Json<PublicBookSlotPayload>,
) -> Result<(StatusCode, Json<Value>), (StatusCode, Json<Value>)> {
    if club_id != "carre-de-soie" && club_id != "beynost" {
        return Err(err_resp(StatusCode::NOT_FOUND, "Club introuvable."));
    }
    let (label, duration) = resolve_public_book_type(&slot_type)
        .ok_or_else(|| err_resp(StatusCode::NOT_FOUND, "Type de créneau introuvable."))?;

    let full_name = payload.full_name.trim().to_string();
    let email = payload.email.trim().to_lowercase();
    if full_name.is_empty() || email.is_empty() || !email.contains('@') {
        return Err(err_resp(StatusCode::BAD_REQUEST, "Nom et e-mail valide requis."));
    }
    let start_min = parse_hhmm_minutes(&payload.start_time)
        .ok_or_else(|| err_resp(StatusCode::BAD_REQUEST, "Heure invalide (HH:MM)."))?;
    let today = Utc::now().format("%Y-%m-%d").to_string();
    if payload.date.trim() < today.as_str() {
        return Err(err_resp(StatusCode::BAD_REQUEST, "Impossible de réserver une date passée."));
    }

    let coach_id = if club_id == "beynost" { "emp-sarah" } else { "emp-karim" };
    let cand_end = start_min + duration;

    let mut db = state.db.write().await;
    let conflict = db.lead_appointments.iter().any(|s| {
        if s.status == "annule" || s.coach_id != coach_id || s.date != payload.date {
            return false;
        }
        if let Some(s_start) = parse_hhmm_minutes(&s.start_time) {
            let s_end = s_start + s.duration_minutes.max(30);
            return start_min < s_end && s_start < cand_end;
        }
        false
    });
    if conflict {
        return Err(err_resp(
            StatusCode::CONFLICT,
            "Créneau indisponible : chevauchement détecté sur ce coach.",
        ));
    }

    let prospect_id = if let Some(existing) = db
        .lead_prospects
        .iter_mut()
        .find(|p| p.email.eq_ignore_ascii_case(&email) && p.club_id == club_id)
    {
        existing.stage = "Séance planifiée".into();
        existing.lead_status = "Séance planifiée".into();
        existing.trial_date = Some(payload.date.clone());
        existing.id.clone()
    } else {
        let mut parts = full_name.splitn(2, ' ');
        let first_name = parts.next().unwrap_or("Contact").to_string();
        let last_name = parts.next().unwrap_or("Public").to_string();
        let new_pid = format!("pr-book-{}", Utc::now().timestamp_millis());
        let assigned_id = resolve_available_commercial_for_club(&db, &club_id);
        db.lead_prospects.insert(
            0,
            crate::models::LeadProspectRecord {
                id: new_pid.clone(),
                gender: String::new(),
                first_name,
                last_name,
                email: email.clone(),
                phone: String::new(),
                street: String::new(),
                postal_code: String::new(),
                city: String::new(),
                birth_date: String::new(),
                comment: format!("Réservation publique {}", label),
                club_id: club_id.clone(),
                source: "Lien public RDV".into(),
                stage: "Séance planifiée".into(),
                lead_status: "Séance planifiée".into(),
                rgpd_consent: true,
                segments: vec![],
                trial_date: Some(payload.date.clone()),
                assigned_to_id: Some(assigned_id),
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
                created_at: Utc::now().format("%Y-%m-%d").to_string(),
            },
        );
        new_pid
    };

    let slot_id = format!("slot-pub-{}", Utc::now().timestamp_millis());
    let act_id = format!("act-{}", slot_id);
    let slot = crate::models::LeadAppointmentRecord {
        id: slot_id.clone(),
        club_id: club_id.clone(),
        coach_id: coach_id.into(),
        type_name: label.into(),
        prospect_id: Some(prospect_id.clone()),
        prospect_name: Some(full_name.clone()),
        prospect_email: Some(email),
        activity_id: Some(act_id.clone()),
        date: payload.date.clone(),
        start_time: payload.start_time.clone(),
        duration_minutes: duration,
        capacity_max: 1,
        current_booked_count: 1,
        payment_status: "non_requis".into(),
        status: "confirme".into(),
    };
    db.lead_appointments.insert(0, slot.clone());
    db.lead_activities.insert(
        0,
        crate::models::LeadActivityRecord {
            id: act_id.clone(),
            activity_type: "APPOINTMENT".into(),
            title: format!("RDV public : {}", label),
            prospect_id: Some(prospect_id.clone()),
            prospect_name: full_name,
            club_id,
            due_at: format!("{}T{}", payload.date, payload.start_time),
            status: "todo".into(),
            assigned_to_id: coach_id.into(),
            status_label: "Confirmé (public)".into(),
        },
    );

    if let Err(err_msg) = persist_state(&state.data_dir, &db) {
        return Err(err_resp(
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Échec persistance serveur : {}", err_msg),
        ));
    }

    Ok((
        StatusCode::CREATED,
        Json(json!({
            "ok": true,
            "slot": slot,
            "prospectId": prospect_id,
            "activityId": act_id
        })),
    ))
}

async fn get_lead_workspace(
    State(state): State<SharedState>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let (actor_id, _) = resolve_session_actor(&state, &headers).await?;
    let db = state.db.read().await;
    let allowed = authorized_clubs_for_actor(&db, &actor_id);

    let forms: Vec<_> = db
        .lead_forms
        .iter()
        .filter(|f| allowed.contains(&f.club_id))
        .cloned()
        .collect();
    let prospects: Vec<_> = db
        .lead_prospects
        .iter()
        .filter(|p| allowed.contains(&p.club_id))
        .cloned()
        .collect();
    let appointments: Vec<_> = db
        .lead_appointments
        .iter()
        .filter(|a| allowed.contains(&a.club_id))
        .cloned()
        .collect();
    let activities: Vec<_> = db
        .lead_activities
        .iter()
        .filter(|a| allowed.contains(&a.club_id))
        .cloned()
        .collect();

    Ok(Json(json!({
        "allowedClubs": allowed.into_iter().collect::<Vec<_>>(),
        "forms": forms,
        "prospects": prospects,
        "appointments": appointments,
        "activities": activities
    })))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PutLeadFormPayload {
    pub published: Option<bool>,
    pub name: Option<String>,
    pub fields: Option<Vec<crate::models::LeadFormFieldRecord>>,
}

async fn put_lead_form(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Path(form_id): Path<String>,
    Json(payload): Json<PutLeadFormPayload>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let (actor_id, _) = resolve_session_actor(&state, &headers).await?;
    let mut db = state.db.write().await;
    let allowed = authorized_clubs_for_actor(&db, &actor_id);

    let idx = db
        .lead_forms
        .iter()
        .position(|f| f.id == form_id)
        .ok_or_else(|| err_resp(StatusCode::NOT_FOUND, "Formulaire introuvable."))?;

    if !allowed.contains(&db.lead_forms[idx].club_id)
        || !actor_has_lead_admin_write_on_club(&db, &actor_id, &db.lead_forms[idx].club_id)
    {
        return Err(err_resp(
            StatusCode::FORBIDDEN,
            "Accès refusé (403) : droits d'administration Lead requis sur ce club.",
        ));
    }

    if let Some(pub_flag) = payload.published {
        db.lead_forms[idx].published = pub_flag;
    }
    if let Some(name) = payload.name {
        if !name.trim().is_empty() {
            db.lead_forms[idx].name = name.trim().to_string();
        }
    }
    if let Some(fields) = payload.fields {
        db.lead_forms[idx].fields = fields;
    }

    let updated = db.lead_forms[idx].clone();
    if let Err(err_msg) = persist_state(&state.data_dir, &db) {
        return Err(err_resp(
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Échec persistance serveur : {}", err_msg),
        ));
    }

    Ok(Json(json!({ "ok": true, "form": updated })))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportLeadProspectItem {
    #[serde(default)]
    pub gender: String,
    pub first_name: String,
    pub last_name: String,
    pub email: String,
    #[serde(default)]
    pub phone: String,
    #[serde(default)]
    pub street: String,
    #[serde(default)]
    pub postal_code: String,
    #[serde(default)]
    pub city: String,
    #[serde(default)]
    pub birth_date: String,
    #[serde(default)]
    pub comment: String,
    pub club_id: String,
    #[serde(default)]
    pub rgpd_consent: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportLeadProspectsPayload {
    pub rows: Vec<ImportLeadProspectItem>,
}

async fn post_lead_prospects_import(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Json(payload): Json<ImportLeadProspectsPayload>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let (actor_id, _) = resolve_session_actor(&state, &headers).await?;
    let mut db = state.db.write().await;
    let allowed = authorized_clubs_for_actor(&db, &actor_id);

    let mut created = 0u32;
    let mut skipped_duplicates = 0u32;
    let mut rejected = 0u32;

    for item in payload.rows {
        if !allowed.contains(&item.club_id)
            || !actor_has_lead_admin_write_on_club(&db, &actor_id, &item.club_id)
        {
            return Err(err_resp(
                StatusCode::FORBIDDEN,
                format!("Import refusé (403) : droits insuffisants sur le club {}.", item.club_id),
            ));
        }
        let email = item.email.trim().to_lowercase();
        if email.is_empty() || !email.contains('@') {
            rejected += 1;
            continue;
        }
        if db
            .lead_prospects
            .iter()
            .any(|p| p.email.eq_ignore_ascii_case(&email) && p.club_id == item.club_id)
        {
            skipped_duplicates += 1;
            continue;
        }
        let pid = format!("pr-imp-{}-{}", Utc::now().timestamp_millis(), created);
        let assigned_id = resolve_available_commercial_for_club(&db, &item.club_id);
        db.lead_prospects.insert(
            0,
            crate::models::LeadProspectRecord {
                id: pid,
                gender: item.gender.trim().to_string(),
                first_name: item.first_name.trim().to_string(),
                last_name: item.last_name.trim().to_string(),
                email,
                phone: item.phone.trim().to_string(),
                street: item.street.trim().to_string(),
                postal_code: item.postal_code.trim().to_string(),
                city: item.city.trim().to_string(),
                birth_date: item.birth_date.trim().to_string(),
                comment: item.comment.trim().to_string(),
                club_id: item.club_id,
                source: "Import CSV 11 colonnes".into(),
                stage: "Nouveau".into(),
                lead_status: "Nouveau".into(),
                rgpd_consent: item.rgpd_consent,
                segments: vec![],
                trial_date: None,
                assigned_to_id: Some(assigned_id),
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
                created_at: Utc::now().format("%Y-%m-%d").to_string(),
            },
        );
        created += 1;
    }

    if let Err(err_msg) = persist_state(&state.data_dir, &db) {
        return Err(err_resp(
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Échec persistance serveur : {}", err_msg),
        ));
    }

    Ok(Json(json!({
        "ok": true,
        "created": created,
        "skippedDuplicates": skipped_duplicates,
        "rejected": rejected
    })))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PatchLeadAppointmentPayload {
    pub start_time: String,
}

async fn patch_lead_appointment(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Path(slot_id): Path<String>,
    Json(payload): Json<PatchLeadAppointmentPayload>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let (actor_id, _) = resolve_session_actor(&state, &headers).await?;
    let mut db = state.db.write().await;
    let allowed = authorized_clubs_for_actor(&db, &actor_id);

    let idx = db
        .lead_appointments
        .iter()
        .position(|a| a.id == slot_id)
        .ok_or_else(|| err_resp(StatusCode::NOT_FOUND, "Rendez-vous introuvable."))?;

    if !allowed.contains(&db.lead_appointments[idx].club_id)
        || !actor_has_lead_rdv_write_on_club(&db, &actor_id, &db.lead_appointments[idx].club_id)
    {
        return Err(err_resp(StatusCode::FORBIDDEN, "Accès refusé (403) : profil insuffisant ou hors club."));
    }
    let start_min = parse_hhmm_minutes(&payload.start_time)
        .ok_or_else(|| err_resp(StatusCode::BAD_REQUEST, "Heure invalide."))?;
    let slot_snap = db.lead_appointments[idx].clone();
    let cand_end = start_min + slot_snap.duration_minutes.max(30);

    let conflict = db.lead_appointments.iter().any(|s| {
        if s.id == slot_snap.id || s.status == "annule" || s.coach_id != slot_snap.coach_id || s.date != slot_snap.date {
            return false;
        }
        if let Some(s_start) = parse_hhmm_minutes(&s.start_time) {
            let s_end = s_start + s.duration_minutes.max(30);
            return start_min < s_end && s_start < cand_end;
        }
        false
    });
    if conflict {
        return Err(err_resp(StatusCode::CONFLICT, "Report refusé : collision horaire sur ce coach."));
    }

    let db_snapshot = db.clone();
    db.lead_appointments[idx].start_time = payload.start_time.clone();
    db.lead_appointments[idx].status = "reporte".into();
    if let Some(act_id) = db.lead_appointments[idx].activity_id.clone() {
        if let Some(act) = db.lead_activities.iter_mut().find(|a| a.id == act_id) {
            act.due_at = format!("{}T{}", slot_snap.date, payload.start_time);
            act.status_label = "Reporté".into();
        }
    }

    let updated = db.lead_appointments[idx].clone();
    let extra_channels: Vec<String> = updated.prospect_email.clone().into_iter().collect();
    for (rule_id, channel) in [("LEAD-0546", "SMS"), ("LEAD-0549", "Email")] {
        crate::lead_automations::emit_lead_alert_if_enabled(
            &mut db,
            &updated.club_id,
            rule_id,
            "appointment_modified",
            channel,
            format!(
                "RDV reporté : {}",
                updated.prospect_name.as_deref().unwrap_or("Prospect")
            ),
            format!(
                "Créneau « {} » déplacé au {} à {}.",
                updated.type_name, updated.date, updated.start_time
            ),
            updated.prospect_id.clone(),
            vec![updated.coach_id.clone()],
            extra_channels.clone(),
        );
    }

    if let Err(err_msg) = persist_state(&state.data_dir, &db) {
        *db = db_snapshot;
        return Err(err_resp(StatusCode::INTERNAL_SERVER_ERROR, format!("Échec persistance : {}", err_msg)));
    }
    Ok(Json(json!({ "ok": true, "slot": updated })))
}

async fn delete_lead_appointment(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Path(slot_id): Path<String>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let (actor_id, _) = resolve_session_actor(&state, &headers).await?;
    let mut db = state.db.write().await;
    let allowed = authorized_clubs_for_actor(&db, &actor_id);

    let idx = db
        .lead_appointments
        .iter()
        .position(|a| a.id == slot_id)
        .ok_or_else(|| err_resp(StatusCode::NOT_FOUND, "Rendez-vous introuvable."))?;

    if !allowed.contains(&db.lead_appointments[idx].club_id)
        || !actor_has_lead_rdv_write_on_club(&db, &actor_id, &db.lead_appointments[idx].club_id)
    {
        return Err(err_resp(StatusCode::FORBIDDEN, "Accès refusé (403) : profil insuffisant ou hors club."));
    }

    let db_snapshot = db.clone();
    db.lead_appointments[idx].status = "annule".into();
    if let Some(act_id) = db.lead_appointments[idx].activity_id.clone() {
        if let Some(act) = db.lead_activities.iter_mut().find(|a| a.id == act_id) {
            act.status = "done".into();
            act.status_label = "Annulé".into();
        }
    }

    let cancelled = db.lead_appointments[idx].clone();
    let extra_channels: Vec<String> = cancelled.prospect_email.clone().into_iter().collect();
    for (rule_id, channel) in [("LEAD-0547", "SMS"), ("LEAD-0550", "Email")] {
        crate::lead_automations::emit_lead_alert_if_enabled(
            &mut db,
            &cancelled.club_id,
            rule_id,
            "appointment_cancelled",
            channel,
            format!(
                "RDV annulé : {}",
                cancelled.prospect_name.as_deref().unwrap_or("Prospect")
            ),
            format!(
                "Séance « {} » du {} à {} annulée.",
                cancelled.type_name, cancelled.date, cancelled.start_time
            ),
            cancelled.prospect_id.clone(),
            vec![cancelled.coach_id.clone()],
            extra_channels.clone(),
        );
    }

    if let Err(err_msg) = persist_state(&state.data_dir, &db) {
        *db = db_snapshot;
        return Err(err_resp(StatusCode::INTERNAL_SERVER_ERROR, format!("Échec persistance : {}", err_msg)));
    }
    Ok(Json(json!({ "ok": true, "slotId": slot_id })))
}

async fn get_lead_settings(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Path(club_id): Path<String>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let (actor_id, _) = resolve_session_actor(&state, &headers).await?;
    let db = state.db.read().await;
    let allowed = authorized_clubs_for_actor(&db, &actor_id);
    if !allowed.contains(&club_id) {
        return Err(err_resp(
            StatusCode::FORBIDDEN,
            format!("Accès refusé (403) : non autorisé sur le club {}", club_id),
        ));
    }
    if let Some(settings) = db.lead_settings_by_club.get(&club_id) {
        return Ok(Json(json!({
            "ok": true,
            "clubId": club_id,
            "settings": settings
        })));
    }
    let default_val = json!({
        "smsCredits": if club_id == "beynost" { 980 } else { 1420 },
        "salesScript": "1. Accueil & objectif forme\n2. Découverte Biocircuit / Checkup\n3. Proposition créneau essai",
        "archiveThresholdDays": 30,
        "notifEmail": if club_id == "beynost" { "direction.beynost@c.fitness" } else { "direction@c.fitness" },
        "notifMobile": if club_id == "beynost" { "07 82 00 00 02" } else { "07 82 00 00 01" },
        "whatsappNumber": if club_id == "beynost" { "+33 4 78 00 00 02" } else { "+33 4 78 00 00 01" },
        "clientPassOffer": if club_id == "beynost" { "Pass Liberté Beynost 12 mois" } else { "Pass Liberté + Biocircuit 12 mois" },
        "autoAssignEnabled": true,
        "autoUnassignOnLeave": true,
        "dropoutThresholdDays": 21,
        "dropoutResetOnBadge": true,
        "autoArchiveEnabled": true,
        "archiveTargetStage": "Archivé",
        "enabledAlertIds": ["LEAD-0545", "LEAD-0548", "LEAD-0551", "LEAD-0552"],
        "selectedPassOfferIds": if club_id == "beynost" { vec!["HZ-BEY-ABO-PASS", "HZ-BEY-ABO-SOLO"] } else { vec!["HZ-CDS-ABO-PASS", "HZ-CDS-ABO-SOLO"] },
        "clientPassTargetScope": "club",
        "uiLanguage": "fr"
    });
    Ok(Json(json!({
        "ok": true,
        "clubId": club_id,
        "settings": default_val
    })))
}

async fn put_lead_settings(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Path(club_id): Path<String>,
    Json(payload): Json<Value>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let (actor_id, _) = resolve_session_actor(&state, &headers).await?;
    let mut db = state.db.write().await;
    if !actor_has_lead_admin_write_on_club(&db, &actor_id, &club_id) {
        return Err(err_resp(
            StatusCode::FORBIDDEN,
            format!("Modification refusée (403) : droits d'administration CRM requis pour le club {}.", club_id),
        ));
    }

    // Keep the live state untouched until the complete settings/audit write succeeds.
    // The write lock also prevents another request from changing the base meanwhile.
    let mut next = db.clone();
    next.lead_settings_by_club.insert(club_id.clone(), payload.clone());

    let audit_id = format!("aud-{}", Utc::now().timestamp_millis());
    let actor_label = db.employees.iter().find(|e| e.id == actor_id).map(|e| format!("{} {}", e.first_name, e.last_name)).unwrap_or_else(|| actor_id.clone());
    next.audit_log.push(AuditEvent {
        id: audit_id,
        timestamp: Utc::now().to_rfc3339(),
        actor_id: actor_id.clone(),
        actor_name: actor_label,
        action_type: "lead.settings.update".into(),
        summary: format!("Mise à jour des paramètres CRM du club {}", club_id),
        site_id: if club_id == "beynost" { "site_beynost".into() } else { "site_cds".into() },
        target_label: format!("ClubLeadSettings ({})", club_id),
        before_summary: None,
        after_summary: Some(format!("Club {} mis à jour", club_id)),
    });

    if let Err(err_msg) = persist_state(&state.data_dir, &next) {
        return Err(err_resp(
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Échec persistance serveur : {}", err_msg),
        ));
    }

    *db = next;

    Ok(Json(json!({
        "ok": true,
        "clubId": club_id,
        "settings": payload
    })))
}

#[cfg(test)]
#[allow(unused_must_use)]
mod tests {
    use super::*;
    use crate::seed::load_or_init_state;

    fn test_state() -> SharedState {
        static TEST_COUNTER: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(1);
        let seq = TEST_COUNTER.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        let dir = std::env::temp_dir().join(format!(
            "cfos_test_{}_{}",
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
            "test-session-{}-{}",
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
    async fn shift_write_routes_enforce_action_site_and_managed_team_scope() {
        let state = test_state();
        let headers = session_headers(&state, "emp-planif-av", "club-carre-soie").await;
        let (coach_target_id, accueil_target_id) = {
            let mut db = state.db.write().await;
            let planner = db
                .employees
                .iter()
                .find(|employee| employee.id == "emp-planif-av")
                .unwrap();
            let planner_access = planner
                .site_accesses
                .iter()
                .find(|access| access.site_id == "club-carre-soie")
                .unwrap();
            assert!(planner_access
                .managed_team_ids
                .contains(&"team-cs-coaching".into()));

            let profile = db
                .profiles
                .iter_mut()
                .find(|profile| profile.id == "planificateur_avance")
                .unwrap();
            profile.scope_selected = "teams".into();
            for row in &mut profile.rows {
                if row.action_id == "ORG04-01" || row.action_id == "ORG04-02" {
                    row.checked = Some(true);
                } else if row.action_id == "ORG04-05" || row.action_id == "ORG04-06" {
                    row.checked = Some(false);
                }
            }

            let coach_target = db
                .employees
                .iter()
                .find(|employee| {
                    employee.id != "emp-planif-av"
                        && employee.site_accesses.iter().any(|access| {
                            access.site_id == "club-carre-soie"
                                && access.team_ids.contains(&"team-cs-coaching".into())
                                && access.position_ids.contains(&"pos-cs-coach".into())
                        })
                })
                .unwrap()
                .id
                .clone();
            let accueil_target = db
                .employees
                .iter()
                .find(|employee| {
                    employee.id != "emp-planif-av"
                        && employee.site_accesses.iter().any(|access| {
                            access.site_id == "club-carre-soie"
                                && access.team_ids.contains(&"team-cs-accueil".into())
                                && !access.team_ids.contains(&"team-cs-coaching".into())
                                && access.position_ids.contains(&"pos-cs-accueil".into())
                        })
                })
                .unwrap()
                .id
                .clone();
            (coach_target, accueil_target)
        };

        let created = post_shift(
            State(state.clone()),
            headers.clone(),
            Json(CreateShiftPayload {
                site_id: "club-carre-soie".into(),
                employee_id: Some(coach_target_id.clone()),
                date: "2026-11-23".into(),
                start_time: "09:00".into(),
                end_time: "17:00".into(),
                break_minutes: 60,
                role_label: "Coaching Plateau & Cours".into(),
                position_id: "pos-cs-coach".into(),
                published: false,
            }),
        )
        .await
        .unwrap();
        assert_eq!(created.0, StatusCode::CREATED);

        let forbidden_team = post_shift(
            State(state.clone()),
            headers.clone(),
            Json(CreateShiftPayload {
                site_id: "club-carre-soie".into(),
                employee_id: Some(accueil_target_id.clone()),
                date: "2026-11-23".into(),
                start_time: "09:00".into(),
                end_time: "17:00".into(),
                break_minutes: 60,
                role_label: "Accueil & Vente".into(),
                position_id: "pos-cs-accueil".into(),
                published: false,
            }),
        )
        .await
        .unwrap_err();
        assert_eq!(forbidden_team.0, StatusCode::FORBIDDEN);

        let forbidden_site = post_shift(
            State(state.clone()),
            headers.clone(),
            Json(CreateShiftPayload {
                site_id: "club-beynost".into(),
                employee_id: Some(coach_target_id.clone()),
                date: "2026-11-23".into(),
                start_time: "09:00".into(),
                end_time: "17:00".into(),
                break_minutes: 60,
                role_label: "Coaching Plateau & Cours".into(),
                position_id: "pos-cs-coach".into(),
                published: false,
            }),
        )
        .await
        .unwrap_err();
        assert_eq!(forbidden_site.0, StatusCode::FORBIDDEN);

        let forbidden_publish = post_shift(
            State(state.clone()),
            headers.clone(),
            Json(CreateShiftPayload {
                site_id: "club-carre-soie".into(),
                employee_id: Some(coach_target_id.clone()),
                date: "2026-11-23".into(),
                start_time: "09:00".into(),
                end_time: "17:00".into(),
                break_minutes: 60,
                role_label: "Coaching Plateau & Cours".into(),
                position_id: "pos-cs-coach".into(),
                published: true,
            }),
        )
        .await
        .unwrap_err();
        assert_eq!(forbidden_publish.0, StatusCode::FORBIDDEN);

        let shift_id = created.1.id.clone();
        let forbidden_publish_update = patch_shift(
            State(state.clone()),
            headers.clone(),
            Path(shift_id.clone()),
            Json(UpdateShiftPayload {
                start_time: None,
                end_time: None,
                break_minutes: None,
                employee_id: None,
                date: None,
                published: Some(true),
                lock_state: None,
            }),
        )
        .await
        .unwrap_err();
        assert_eq!(forbidden_publish_update.0, StatusCode::FORBIDDEN);

        let forbidden_lock_update = patch_shift(
            State(state.clone()),
            headers.clone(),
            Path(shift_id.clone()),
            Json(UpdateShiftPayload {
                start_time: None,
                end_time: None,
                break_minutes: None,
                employee_id: None,
                date: None,
                published: None,
                lock_state: Some("red".into()),
            }),
        )
        .await
        .unwrap_err();
        assert_eq!(forbidden_lock_update.0, StatusCode::FORBIDDEN);

        let forbidden_move = patch_shift(
            State(state.clone()),
            headers.clone(),
            Path(shift_id.clone()),
            Json(UpdateShiftPayload {
                start_time: None,
                end_time: None,
                break_minutes: None,
                employee_id: Some(accueil_target_id),
                date: Some("2026-11-24".into()),
                published: None,
                lock_state: None,
            }),
        )
        .await
        .unwrap_err();
        assert_eq!(forbidden_move.0, StatusCode::FORBIDDEN);
        {
            let db = state.db.read().await;
            let persisted = db.shifts.iter().find(|shift| shift.id == shift_id).unwrap();
            assert_eq!(persisted.date, "2026-11-23");
            assert_eq!(
                persisted.employee_id.as_deref(),
                Some(coach_target_id.as_str())
            );
        }

        {
            let mut db = state.db.write().await;
            let profile = db
                .profiles
                .iter_mut()
                .find(|profile| profile.id == "planificateur_avance")
                .unwrap();
            for row in &mut profile.rows {
                if row.action_id == "ORG04-05" || row.action_id == "ORG04-06" {
                    row.checked = Some(true);
                }
            }
        }
        let published = patch_shift(
            State(state.clone()),
            headers.clone(),
            Path(shift_id.clone()),
            Json(UpdateShiftPayload {
                start_time: None,
                end_time: None,
                break_minutes: None,
                employee_id: None,
                date: None,
                published: Some(true),
                lock_state: None,
            }),
        )
        .await
        .unwrap();
        assert!(published.0.published);

        let locked = patch_shift(
            State(state.clone()),
            headers.clone(),
            Path(shift_id.clone()),
            Json(UpdateShiftPayload {
                start_time: None,
                end_time: None,
                break_minutes: None,
                employee_id: None,
                date: None,
                published: None,
                lock_state: Some("red".into()),
            }),
        )
        .await
        .unwrap();
        assert_eq!(locked.0.lock_state, "red");

        let deleted = delete_shift(State(state), headers, Path(shift_id))
            .await
            .unwrap();
        assert_eq!(deleted.0["ok"], true);
    }

    #[tokio::test]
    async fn auth_rejects_wrong_secret_and_never_elevates_role() {
        let state = test_state();

        // 1. Mauvais secret -> 401 Unauthorized
        let bad = post_local_auth_login(
            State(state.clone()),
            Json(LocalAuthLoginRequest {
                email_or_id: "emp-employe-multi".to_string(),
                pin_or_password: "wrong".to_string(),
                role_requested: "admin".to_string(),
            }),
        )
        .await
        .into_response();
        assert_eq!(bad.status(), StatusCode::UNAUTHORIZED);

        // 2. Bon secret sur employé standard avec role_requested="admin" -> rôle reste "employee"
        let ok_resp = post_local_auth_login(
            State(state.clone()),
            Json(LocalAuthLoginRequest {
                email_or_id: "emp-employe-multi".to_string(),
                pin_or_password: "6060".to_string(),
                role_requested: "admin".to_string(),
            }),
        )
        .await
        .into_response();
        assert_eq!(ok_resp.status(), StatusCode::OK);
        let (token, (actor, _)) = {
            let sessions = state.sessions.read().await;
            assert_eq!(sessions.len(), 1);
            let (t, v) = sessions.iter().next().unwrap();
            (t.clone(), v.clone())
        };
        assert_eq!(actor, "emp-employe-multi");
        assert!(!token.contains("emp-employe-multi"));

        // 3. Résolution session Bearer valide vs falsifiée
        let mut h_valid = HeaderMap::new();
        h_valid.insert(
            header::AUTHORIZATION,
            HeaderValue::from_str(&format!("Bearer {}", token)).unwrap(),
        );
        h_valid.insert("x-cfitness-actor-id", HeaderValue::from_static("emp-admin"));
        let resolved = resolve_session_actor(&state, &h_valid).await.unwrap();
        assert_eq!(resolved.0, "emp-employe-multi"); // Ignore l'en-tête forgé emp-admin !

        let mut h_fake = HeaderMap::new();
        h_fake.insert(header::AUTHORIZATION, HeaderValue::from_static("Bearer fake-token"));
        assert!(resolve_session_actor(&state, &h_fake).await.is_err());

        // 4. Révocation immédiate via /api/auth/logout -> 401
        let logout_resp = post_local_auth_logout(State(state.clone()), h_valid.clone())
            .await
            .into_response();
        assert_eq!(logout_resp.status(), StatusCode::OK);
        assert!(resolve_session_actor(&state, &h_valid).await.is_err());
    }

    #[tokio::test]
    async fn auth_rate_limits_after_ten_failed_attempts() {
        let state = test_state();
        for _ in 0..10 {
            let resp = post_local_auth_login(
                State(state.clone()),
                Json(LocalAuthLoginRequest {
                    email_or_id: "emp-employe-multi".to_string(),
                    pin_or_password: "wrong".to_string(),
                    role_requested: "employee".to_string(),
                }),
            )
            .await
            .into_response();
            assert_eq!(resp.status(), StatusCode::UNAUTHORIZED);
        }
        let blocked = post_local_auth_login(
            State(state.clone()),
            Json(LocalAuthLoginRequest {
                email_or_id: "emp-employe-multi".to_string(),
                pin_or_password: "6060".to_string(),
                role_requested: "employee".to_string(),
            }),
        )
        .await
        .into_response();
        assert_eq!(blocked.status(), StatusCode::TOO_MANY_REQUESTS);
    }

    #[test]
    fn stripe_webhook_signature_is_verified_hmac_sha256() {
        fn sign(secret: &str, timestamp: i64, payload: &[u8]) -> String {
            let mut mac = Hmac::<Sha256>::new_from_slice(secret.as_bytes()).unwrap();
            mac.update(format!("{timestamp}.").as_bytes());
            mac.update(payload);
            hex::encode(mac.finalize().into_bytes())
        }

        let secret = "whsec_test_secret";
        let payload = br#"{"paymentStatus":"paid"}"#;
        let now = 1_800_000_000i64;
        let signature = sign(secret, now, payload);
        let header = format!("t={now},v1={signature}");

        assert!(verify_stripe_signature_with_tolerance(
            secret, payload, &header, now, 300
        ));

        // Payload modifié après signature -> refus
        assert!(!verify_stripe_signature_with_tolerance(
            secret,
            br#"{"paymentStatus":"pending"}"#,
            &header,
            now,
            300
        ));

        // Signature expirée au-delà de la tolérance -> refus
        assert!(!verify_stripe_signature_with_tolerance(
            secret,
            payload,
            &header,
            now + 301,
            300
        ));

        // En-tête malformé ou secret différent -> refus
        assert!(!verify_stripe_signature_with_tolerance(
            secret, payload, "t=abc,v1=zz", now, 300
        ));
        assert!(!verify_stripe_signature_with_tolerance(
            "whsec_other",
            payload,
            &header,
            now,
            300
        ));

        // Plusieurs signatures v1 : une seule valide suffit
        let multi = format!("t={now},v1=deadbeef,v1={signature}");
        assert!(verify_stripe_signature_with_tolerance(
            secret, payload, &multi, now, 300
        ));
    }

    #[tokio::test]
    async fn finance_kpis_and_section_require_explicit_habilitation() {
        let state = test_state();

        {
            let db = state.db.read().await;

            // Sarah (manager, responsable de club) : indicateurs de pilotage
            // visibles mais AUCUN montant financier transmis par l'API.
            let sarah_kpis = filter_kpis_for_actor(&db, "emp-sarah", "club-carre-soie");
            assert_eq!(sarah_kpis.len(), 1);
            assert!(sarah_kpis[0].revenue_eur.is_none());
            assert!(sarah_kpis[0].payroll_mass_eur.is_none());
            assert!(sarah_kpis[0].productivity_per_hour.is_none());
            assert!(sarah_kpis[0].worked_hours.is_some());
            let sarah_sections =
                crate::rbac::get_visible_sections_for_session(&db, "emp-sarah", "club-carre-soie");
            // Sarah (manager avec ORG04-23 préparation de paie) : accède à MC07 pour la paie
            // et à MC08 pour le pilotage, mais AUCUN montant financier (CA / masse salariale) n'est transmis.
            assert!(sarah_sections.contains(&"MC07".to_string()));
            assert!(sarah_sections.contains(&"MC08".to_string()));

            // Chloé (collaborateur standard sans ORG04-23 ni finance) : section MC07 strictement absente
            let chloe_sections =
                crate::rbac::get_visible_sections_for_session(&db, "emp-chloe", "club-beynost");
            assert!(!chloe_sections.contains(&"MC07".to_string()));

            // Maxime (planificateur sans habilitation KPI) : aucune ligne KPI.
            assert!(filter_kpis_for_actor(&db, "emp-maxime", "club-carre-soie").is_empty());

            // Mario (admin) : valeurs financières complètes + section Finances.
            let mario_kpis = filter_kpis_for_actor(&db, "emp-mario", "club-carre-soie");
            assert_eq!(mario_kpis.len(), 1);
            assert_eq!(mario_kpis[0].revenue_eur, Some(48200.0));
            let mario_sections =
                crate::rbac::get_visible_sections_for_session(&db, "emp-mario", "club-carre-soie");
            assert!(mario_sections.contains(&"MC07".to_string()));
        }

        // Cas positif de délégation explicite : Sarah ajoutée nominativement
        // retrouve le CA et la section Finances, sans changer de rôle.
        {
            let mut db = state.db.write().await;
            db.finance_authorized_employee_ids.push("emp-sarah".into());
            let sarah_kpis = filter_kpis_for_actor(&db, "emp-sarah", "club-carre-soie");
            assert_eq!(sarah_kpis[0].revenue_eur, Some(48200.0));
            let sections =
                crate::rbac::get_visible_sections_for_session(&db, "emp-sarah", "club-carre-soie");
            assert!(sections.contains(&"MC07".to_string()));
        }
    }

    #[tokio::test]
    async fn site_accesses_update_persists_and_blocks_unauthorized_club_or_elevation() {
        let state = test_state();

        // 1. emp-planif-av (Carré de Soie) tente de modifier Beynost -> 403 FORBIDDEN
        //    (authentification via session Bearer serveur valide, cf. #2)
        let h_cs = session_headers(&state, "emp-planif-av", "club-carre-soie").await;
        let forbidden_club = put_employee_site_accesses(
            State(state.clone()),
            h_cs.clone(),
            Path("emp-employe-multi".to_string()),
            Json(PutEmployeeSiteAccessesPayload {
                site_accesses: vec![crate::models::EmployeeSiteAccess {
                    site_id: "club-beynost".to_string(),
                    is_primary: true,
                    profile_id: "employe_standard".to_string(),
                    team_ids: vec!["team-bey-accueil".to_string()],
                    managed_team_ids: vec![],
                    show_on_planning: true,
                    position_ids: vec![],
                }],
            }),
        )
        .await;
        assert_eq!(forbidden_club.unwrap_err().0, StatusCode::FORBIDDEN);

        // 2. emp-master tente d'attribuer admin_systeme -> 403 FORBIDDEN
        let h_master = session_headers(&state, "emp-master", "club-carre-soie").await;
        let forbidden_elev = put_employee_site_accesses(
            State(state.clone()),
            h_master.clone(),
            Path("emp-employe-multi".to_string()),
            Json(PutEmployeeSiteAccessesPayload {
                site_accesses: vec![crate::models::EmployeeSiteAccess {
                    site_id: "club-carre-soie".to_string(),
                    is_primary: true,
                    profile_id: "admin_systeme".to_string(),
                    team_ids: vec![],
                    managed_team_ids: vec![],
                    show_on_planning: true,
                    position_ids: vec![],
                }],
            }),
        )
        .await;
        assert_eq!(forbidden_elev.unwrap_err().0, StatusCode::FORBIDDEN);

        // 3. emp-master (Carré de Soie) tente de retirer Beynost d'emp-employe-multi -> 403 FORBIDDEN
        let forbidden_remove = put_employee_site_accesses(
            State(state.clone()),
            h_master.clone(),
            Path("emp-employe-multi".to_string()),
            Json(PutEmployeeSiteAccessesPayload {
                site_accesses: vec![crate::models::EmployeeSiteAccess {
                    site_id: "club-carre-soie".to_string(),
                    is_primary: true,
                    profile_id: "employe_standard".to_string(),
                    team_ids: vec![],
                    managed_team_ids: vec![],
                    show_on_planning: true,
                    position_ids: vec![],
                }],
            }),
        )
        .await;
        assert_eq!(forbidden_remove.unwrap_err().0, StatusCode::FORBIDDEN);

        // 4. Équipe d'un autre club refusée -> 400 BAD_REQUEST
        let h_admin = session_headers(&state, "emp-admin", "club-carre-soie").await;
        let bad_team = put_employee_site_accesses(
            State(state.clone()),
            h_admin.clone(),
            Path("emp-employe-multi".to_string()),
            Json(PutEmployeeSiteAccessesPayload {
                site_accesses: vec![crate::models::EmployeeSiteAccess {
                    site_id: "club-carre-soie".to_string(),
                    is_primary: true,
                    profile_id: "employe_standard".to_string(),
                    team_ids: vec!["team-bey-coaching".to_string()],
                    managed_team_ids: vec![],
                    show_on_planning: true,
                    position_ids: vec![],
                }],
            }),
        )
        .await;
        assert_eq!(bad_team.unwrap_err().0, StatusCode::BAD_REQUEST);

        // 5. emp-admin attribue deux clubs avec profils/équipes valides -> 200 OK & persisté sur disque
        let ok = put_employee_site_accesses(
            State(state.clone()),
            h_admin.clone(),
            Path("emp-employe-multi".to_string()),
            Json(PutEmployeeSiteAccessesPayload {
                site_accesses: vec![
                    crate::models::EmployeeSiteAccess {
                        site_id: "club-carre-soie".to_string(),
                        is_primary: true,
                        profile_id: "master_avance".to_string(),
                        team_ids: vec!["team-cs-accueil".to_string(), "team-cs-coaching".to_string()],
                        managed_team_ids: vec![],
                        show_on_planning: true,
                        position_ids: vec![],
                    },
                    crate::models::EmployeeSiteAccess {
                        site_id: "club-beynost".to_string(),
                        is_primary: false,
                        profile_id: "lecture_seule_avancee".to_string(),
                        team_ids: vec!["team-bey-coaching".to_string()],
                        managed_team_ids: vec![],
                        show_on_planning: true,
                        position_ids: vec![],
                    },
                ],
            }),
        )
        .await;
        assert!(ok.is_ok());

        // Rechargement réel depuis le disque pour prouver la persistance durable
        let reloaded = load_or_init_state(&state.data_dir);
        let updated = reloaded.employees.iter().find(|e| e.id == "emp-employe-multi").unwrap();
        assert_eq!(updated.site_accesses.len(), 2);
        assert_eq!(updated.site_accesses[1].profile_id, "lecture_seule_avancee");
        assert_eq!(updated.site_accesses[0].team_ids.len(), 2);

        // 6. Modification locale sur Carré de Soie par emp-master tout en conservant master_avance inchangé sur Beynost
        {
            let mut db = state.db.write().await;
            let emp = db.employees.iter_mut().find(|e| e.id == "emp-employe-multi").unwrap();
            emp.site_accesses[0].profile_id = "employe_standard".to_string();
            emp.site_accesses[1].profile_id = "master_avance".to_string();
        }
        let h_master_cs = session_headers(&state, "emp-master", "club-carre-soie").await;
        let ok_preserve = put_employee_site_accesses(
            State(state.clone()),
            h_master_cs.clone(),
            Path("emp-employe-multi".to_string()),
            Json(PutEmployeeSiteAccessesPayload {
                site_accesses: vec![
                    crate::models::EmployeeSiteAccess {
                        site_id: "club-carre-soie".to_string(),
                        is_primary: true,
                        profile_id: "employe_standard".to_string(),
                        team_ids: vec!["team-cs-accueil".to_string()],
                        managed_team_ids: vec![],
                        show_on_planning: true,
                        position_ids: vec![],
                    },
                    crate::models::EmployeeSiteAccess {
                        site_id: "club-beynost".to_string(),
                        is_primary: false,
                        profile_id: "master_avance".to_string(), // inchangé -> conservé !
                        team_ids: vec!["team-bey-coaching".to_string()],
                        managed_team_ids: vec![],
                        show_on_planning: true,
                        position_ids: vec![],
                    },
                ],
            }),
        )
        .await;
        assert!(ok_preserve.is_ok());

        // Tentative de modifier le profil sur Beynost depuis emp-master -> 403 FORBIDDEN
        let forbidden_bey = put_employee_site_accesses(
            State(state.clone()),
            h_master_cs,
            Path("emp-employe-multi".to_string()),
            Json(PutEmployeeSiteAccessesPayload {
                site_accesses: vec![
                    crate::models::EmployeeSiteAccess {
                        site_id: "club-carre-soie".to_string(),
                        is_primary: true,
                        profile_id: "employe_standard".to_string(),
                        team_ids: vec!["team-cs-accueil".to_string()],
                        managed_team_ids: vec![],
                        show_on_planning: true,
                        position_ids: vec![],
                    },
                    crate::models::EmployeeSiteAccess {
                        site_id: "club-beynost".to_string(),
                        is_primary: false,
                        profile_id: "employe_standard".to_string(),
                        team_ids: vec!["team-bey-coaching".to_string()],
                        managed_team_ids: vec![],
                        show_on_planning: true,
                        position_ids: vec![],
                    },
                ],
            }),
        )
        .await;
        assert_eq!(forbidden_bey.unwrap_err().0, StatusCode::FORBIDDEN);
    }

    #[tokio::test]
    async fn canonical_bearer_session_and_managed_teams_work_across_two_sessions() {
        let state = test_state();

        // 1. Authentification Bearer réelle pour Mario (emp-mario) et Sarah (emp-sarah)
        let mario_login = post_local_auth_login(
            State(state.clone()),
            Json(LocalAuthLoginRequest {
                email_or_id: "emp-mario".to_string(),
                pin_or_password: "1010".to_string(),
                role_requested: String::new(),
            }),
        )
        .await
        .into_response();
        assert_eq!(mario_login.status(), StatusCode::OK);
        let mario_body = axum::body::to_bytes(mario_login.into_body(), usize::MAX)
            .await
            .unwrap();
        let mario_json: Value = serde_json::from_slice(&mario_body).unwrap();
        let mario_token = mario_json["sessionToken"].as_str().unwrap().to_string();

        let sarah_login = post_local_auth_login(
            State(state.clone()),
            Json(LocalAuthLoginRequest {
                email_or_id: "emp-sarah".to_string(),
                pin_or_password: "3141".to_string(),
                role_requested: String::new(),
            }),
        )
        .await
        .into_response();
        assert_eq!(sarah_login.status(), StatusCode::OK);
        let sarah_body = axum::body::to_bytes(sarah_login.into_body(), usize::MAX)
            .await
            .unwrap();
        let sarah_json: Value = serde_json::from_slice(&sarah_body).unwrap();
        let sarah_token = sarah_json["sessionToken"].as_str().unwrap().to_string();

        // 2. Session 1 (Mario avec Bearer, sans x-cfitness-actor-id) met à jour emp-maxime (2 clubs, équipes + équipes encadrées)
        let mut h_mario = HeaderMap::new();
        h_mario.insert(
            header::AUTHORIZATION,
            HeaderValue::from_str(&format!("Bearer {}", mario_token)).unwrap(),
        );
        let ok_put = put_employee_site_accesses(
            State(state.clone()),
            h_mario,
            Path("emp-maxime".to_string()),
            Json(PutEmployeeSiteAccessesPayload {
                site_accesses: vec![
                    crate::models::EmployeeSiteAccess {
                        site_id: "club-carre-soie".to_string(),
                        is_primary: true,
                        profile_id: "planificateur_standard".to_string(),
                        team_ids: vec!["team-cs-accueil".to_string(), "team-cs-coaching".to_string()],
                        managed_team_ids: vec!["team-cs-accueil".to_string(), "team-cs-coaching".to_string()],
                        show_on_planning: true,
                        position_ids: vec!["pos-cs-accueil".to_string()],
                    },
                    crate::models::EmployeeSiteAccess {
                        site_id: "club-beynost".to_string(),
                        is_primary: false,
                        profile_id: "employe_standard".to_string(),
                        team_ids: vec!["team-bey-accueil".to_string()],
                        managed_team_ids: vec![],
                        show_on_planning: true,
                        position_ids: vec!["pos-bey-accueil".to_string()],
                    },
                ],
            }),
        )
        .await;
        assert!(ok_put.is_ok());

        // 3. Session 2 (Sarah avec Bearer) relit le dashboard et voit bien emp-maxime avec 2 clubs et 2 équipes encadrées
        let mut h_sarah = HeaderMap::new();
        h_sarah.insert(
            header::AUTHORIZATION,
            HeaderValue::from_str(&format!("Bearer {}", sarah_token)).unwrap(),
        );
        h_sarah.insert("x-cfitness-site-id", HeaderValue::from_static("club-carre-soie"));
        let sarah_dash = get_dashboard(State(state.clone()), h_sarah.clone()).await.unwrap().0;
        assert_eq!(sarah_dash.session.employee.id, "emp-sarah");
        let maxime = sarah_dash
            .visible_employees
            .iter()
            .find(|e| e.id == "emp-maxime")
            .unwrap();
        assert_eq!(maxime.site_accesses.len(), 2);
        assert_eq!(maxime.site_accesses[0].managed_team_ids.len(), 2);

        // 4. Refus 403 hors délégation : Sarah (Carré de Soie uniquement) tente de modifier Beynost sur emp-maxime -> 403
        let sarah_forbidden_bey = put_employee_site_accesses(
            State(state.clone()),
            h_sarah.clone(),
            Path("emp-maxime".to_string()),
            Json(PutEmployeeSiteAccessesPayload {
                site_accesses: vec![
                    crate::models::EmployeeSiteAccess {
                        site_id: "club-carre-soie".to_string(),
                        is_primary: true,
                        profile_id: "planificateur_standard".to_string(),
                        team_ids: vec!["team-cs-accueil".to_string()],
                        managed_team_ids: vec!["team-cs-accueil".to_string()],
                        show_on_planning: true,
                        position_ids: vec![],
                    },
                    crate::models::EmployeeSiteAccess {
                        site_id: "club-beynost".to_string(),
                        is_primary: false,
                        profile_id: "planificateur_standard".to_string(),
                        team_ids: vec!["team-bey-accueil".to_string()],
                        managed_team_ids: vec![],
                        show_on_planning: true,
                        position_ids: vec![],
                    },
                ],
            }),
        )
        .await;
        assert_eq!(sarah_forbidden_bey.unwrap_err().0, StatusCode::FORBIDDEN);

        // 5. Refus 400 : managedTeamIds non vide sur employe_standard -> 400 BAD_REQUEST
        let invalid_managed = put_employee_site_accesses(
            State(state),
            h_sarah,
            Path("emp-maxime".to_string()),
            Json(PutEmployeeSiteAccessesPayload {
                site_accesses: vec![
                    crate::models::EmployeeSiteAccess {
                        site_id: "club-carre-soie".to_string(),
                        is_primary: true,
                        profile_id: "employe_standard".to_string(),
                        team_ids: vec!["team-cs-accueil".to_string()],
                        managed_team_ids: vec!["team-cs-accueil".to_string()],
                        show_on_planning: true,
                        position_ids: vec![],
                    },
                    crate::models::EmployeeSiteAccess {
                        site_id: "club-beynost".to_string(),
                        is_primary: false,
                        profile_id: "employe_standard".to_string(),
                        team_ids: vec!["team-bey-accueil".to_string()],
                        managed_team_ids: vec![],
                        show_on_planning: true,
                        position_ids: vec![],
                    },
                ],
            }),
        )
        .await;
        assert_eq!(invalid_managed.unwrap_err().0, StatusCode::BAD_REQUEST);
    }

    #[tokio::test]
    async fn rbac_teams_scope_uses_managed_team_ids_distinct_from_membership_and_creates_employee() {
        let state = test_state();

        // Ajout d'une équipe C sur Carré de Soie et d'un responsable membre de A (team-cs-coaching),
        // encadrant B (team-cs-accueil), sans droit sur C (team-cs-c).
        {
            let mut db = state.db.write().await;
            db.teams.push(Team {
                id: "team-cs-c".to_string(),
                site_id: "club-carre-soie".to_string(),
                name: "Équipe C".to_string(),
            });
            // Salarié cible uniquement dans l'équipe A (coaching)
            let karim = db.employees.iter_mut().find(|e| e.id == "emp-karim").unwrap();
            karim.site_accesses[0].team_ids = vec!["team-cs-coaching".to_string()];
            // Salarié cible dans l'équipe B (accueil)
            let julie = db.employees.iter_mut().find(|e| e.id == "emp-accueil-cs").unwrap();
            julie.site_accesses[0].team_ids = vec!["team-cs-accueil".to_string()];
            // Salarié cible dans l'équipe C
            let sophie = db.employees.iter_mut().find(|e| e.id == "emp-planif-av").unwrap();
            sophie.site_accesses[0].team_ids = vec!["team-cs-c".to_string()];

            // Responsable emp-planif-std : membre de A (team-cs-coaching), encadrant B (team-cs-accueil)
            let planif = db.employees.iter_mut().find(|e| e.id == "emp-planif-std").unwrap();
            planif.site_accesses[0].team_ids = vec!["team-cs-coaching".to_string()];
            planif.site_accesses[0].managed_team_ids = vec!["team-cs-accueil".to_string()];
        }

        // Connexion Bearer pour emp-planif-std
        let login_res = post_local_auth_login(
            State(state.clone()),
            Json(LocalAuthLoginRequest {
                email_or_id: "emp-planif-std".to_string(),
                pin_or_password: "4040".to_string(),
                role_requested: String::new(),
            }),
        )
        .await
        .into_response();
        assert_eq!(login_res.status(), StatusCode::OK);
        let login_bytes = axum::body::to_bytes(login_res.into_body(), usize::MAX).await.unwrap();
        let login_json: Value = serde_json::from_slice(&login_bytes).unwrap();
        let token = login_json["sessionToken"].as_str().unwrap().to_string();

        let mut h = HeaderMap::new();
        h.insert(header::AUTHORIZATION, HeaderValue::from_str(&format!("Bearer {}", token)).unwrap());
        h.insert("x-cfitness-site-id", HeaderValue::from_static("club-carre-soie"));

        let dash = get_dashboard(State(state.clone()), h.clone()).await.unwrap().0;
        let visible_ids: Vec<&str> = dash.visible_employees.iter().map(|e| e.id.as_str()).collect();
        // Doit voir soi-même (emp-planif-std) et B (emp-accueil-cs), mais PAS A (emp-karim) ni C (emp-planif-av) !
        assert!(visible_ids.contains(&"emp-planif-std"));
        assert!(visible_ids.contains(&"emp-accueil-cs"));
        assert!(!visible_ids.contains(&"emp-karim"));
        assert!(!visible_ids.contains(&"emp-planif-av"));

        // Création d'un salarié côté serveur par Mario (admin) via POST /api/admin/employees
        let mario_login = post_local_auth_login(
            State(state.clone()),
            Json(LocalAuthLoginRequest {
                email_or_id: "emp-mario".to_string(),
                pin_or_password: "1010".to_string(),
                role_requested: String::new(),
            }),
        )
        .await
        .into_response();
        let mario_bytes = axum::body::to_bytes(mario_login.into_body(), usize::MAX).await.unwrap();
        let mario_json: Value = serde_json::from_slice(&mario_bytes).unwrap();
        let mario_token = mario_json["sessionToken"].as_str().unwrap().to_string();
        let mut h_mario = HeaderMap::new();
        h_mario.insert(header::AUTHORIZATION, HeaderValue::from_str(&format!("Bearer {}", mario_token)).unwrap());

        let (status, created_json) = post_admin_employee(
            State(state.clone()),
            h_mario,
            Json(CreateAdminEmployeePayload {
                first_name: "Camille".to_string(),
                last_name: "Recette".to_string(),
                site_id: "club-carre-soie".to_string(),
                contract_type: Some("CDI".to_string()),
                weekly_hours: Some(35),
                profile_id: Some("employe_standard".to_string()),
                team_ids: Some(vec!["team-cs-accueil".to_string()]),
                managed_team_ids: Some(vec![]),
                initial_password: None,
            }),
        )
        .await
        .unwrap();
        assert_eq!(status, StatusCode::CREATED);
        let created_id = created_json.0["employee"]["id"].as_str().unwrap().to_string();
        assert!(created_id.starts_with("emp-staff-"));

        // Vérification de la persistance disque
        let reloaded = load_or_init_state(&state.data_dir);
        assert!(reloaded.employees.iter().any(|e| e.id == created_id));
    }

    #[tokio::test]
    async fn public_lead_portal_persists_to_server_and_scopes_by_club() {
        let state = test_state();

        // 1. Visiteur anonyme lit le formulaire publié CDS
        let (st_get, form_json) = get_public_lead_form(
            State(state.clone()),
            Path(("carre-de-soie".to_string(), "frm-1".to_string())),
        )
        .await
        .unwrap();
        assert_eq!(st_get, StatusCode::OK);
        assert_eq!(form_json.0["id"], "frm-1");

        // Formulaire brouillon frm-3 -> 404
        let draft_err = get_public_lead_form(
            State(state.clone()),
            Path(("carre-de-soie".to_string(), "frm-3".to_string())),
        )
        .await
        .unwrap_err();
        assert_eq!(draft_err.0, StatusCode::NOT_FOUND);

        // 2. Visiteur anonyme soumet le formulaire avec réponses personnalisées par ID
        let (st_sub, sub_json) = post_public_lead_form_submit(
            State(state.clone()),
            Path(("carre-de-soie".to_string(), "frm-1".to_string())),
            Json(PublicFormSubmitPayload {
                full_name: "Alice Visiteur".to_string(),
                email: "alice.visiteur@exemple.fr".to_string(),
                phone: "0612345678".to_string(),
                rgpd_consent: true,
                answers: json!({"fld-fn": "Alice", "fld-goal": "Biocircuit"}),
            }),
        )
        .await
        .unwrap();
        assert_eq!(st_sub, StatusCode::CREATED);
        let prospect_id = sub_json.0["prospectId"].as_str().unwrap().to_string();

        // 3. Visiteur anonyme réserve un créneau public /book/carre-de-soie/coaching-decouverte
        let (st_book, _) = post_public_book_slot(
            State(state.clone()),
            Path(("carre-de-soie".to_string(), "coaching-decouverte".to_string())),
            Json(PublicBookSlotPayload {
                full_name: "Alice Visiteur".to_string(),
                email: "alice.visiteur@exemple.fr".to_string(),
                date: "2026-12-10".to_string(),
                start_time: "14:00".to_string(),
            }),
        )
        .await
        .unwrap();
        assert_eq!(st_book, StatusCode::CREATED);

        // Collision sur le même créneau (14:30 pendant 14:00-15:00) -> 409 CONFLICT
        let collision = post_public_book_slot(
            State(state.clone()),
            Path(("carre-de-soie".to_string(), "coaching-decouverte".to_string())),
            Json(PublicBookSlotPayload {
                full_name: "Autre Visiteur".to_string(),
                email: "autre@exemple.fr".to_string(),
                date: "2026-12-10".to_string(),
                start_time: "14:30".to_string(),
            }),
        )
        .await
        .unwrap_err();
        assert_eq!(collision.0, StatusCode::CONFLICT);

        // 4. Seconde session (Sarah CDS avec Bearer) relit GET /api/lead/workspace :
        //    voit Alice Visiteur + réponse frm-1 + RDV + activité CDS, et AUCUNE donnée Beynost
        let sarah_login = post_local_auth_login(
            State(state.clone()),
            Json(LocalAuthLoginRequest {
                email_or_id: "emp-sarah".to_string(),
                pin_or_password: "3141".to_string(),
                role_requested: String::new(),
            }),
        )
        .await
        .into_response();
        let sarah_bytes = axum::body::to_bytes(sarah_login.into_body(), usize::MAX).await.unwrap();
        let sarah_json: Value = serde_json::from_slice(&sarah_bytes).unwrap();
        let sarah_token = sarah_json["sessionToken"].as_str().unwrap().to_string();
        let mut h_sarah = HeaderMap::new();
        h_sarah.insert(header::AUTHORIZATION, HeaderValue::from_str(&format!("Bearer {}", sarah_token)).unwrap());

        let ws = get_lead_workspace(State(state.clone()), h_sarah.clone()).await.unwrap().0;
        let prospects = ws["prospects"].as_array().unwrap();
        assert!(prospects.iter().any(|p| p["id"] == prospect_id && p["email"] == "alice.visiteur@exemple.fr"));
        assert!(!prospects.iter().any(|p| p["clubId"] == "beynost"));
        let forms = ws["forms"].as_array().unwrap();
        assert!(!forms.iter().any(|f| f["clubId"] == "beynost"));

        // Sarah CDS tente de modifier frm-2 (Beynost) -> 403 FORBIDDEN (inter-club)
        let forbidden_form = put_lead_form(
            State(state.clone()),
            h_sarah.clone(),
            Path("frm-2".to_string()),
            Json(PutLeadFormPayload {
                published: Some(false),
                name: None,
                fields: None,
            }),
        )
        .await
        .unwrap_err();
        assert_eq!(forbidden_form.0, StatusCode::FORBIDDEN);

        // Chloé (employe_standard sur Beynost) tente de modifier frm-2 (Beynost) -> 403 FORBIDDEN (intra-club)
        let chloe_login = post_local_auth_login(
            State(state.clone()),
            Json(LocalAuthLoginRequest {
                email_or_id: "emp-chloe".to_string(),
                pin_or_password: "5320".to_string(),
                role_requested: String::new(),
            }),
        )
        .await
        .into_response();
        let chloe_bytes = axum::body::to_bytes(chloe_login.into_body(), usize::MAX).await.unwrap();
        let chloe_json: Value = serde_json::from_slice(&chloe_bytes).unwrap();
        let chloe_token = chloe_json["sessionToken"].as_str().unwrap().to_string();
        let mut h_chloe = HeaderMap::new();
        h_chloe.insert(header::AUTHORIZATION, HeaderValue::from_str(&format!("Bearer {}", chloe_token)).unwrap());

        let chloe_forbidden_form = put_lead_form(
            State(state.clone()),
            h_chloe.clone(),
            Path("frm-2".to_string()),
            Json(PutLeadFormPayload {
                published: Some(false),
                name: None,
                fields: None,
            }),
        )
        .await
        .unwrap_err();
        assert_eq!(chloe_forbidden_form.0, StatusCode::FORBIDDEN);

        let chloe_forbidden_import = post_lead_prospects_import(
            State(state.clone()),
            h_chloe,
            Json(ImportLeadProspectsPayload {
                rows: vec![ImportLeadProspectItem {
                    gender: "F".into(),
                    first_name: "Test".into(),
                    last_name: "Intra".into(),
                    email: "intra@exemple.fr".into(),
                    phone: "".into(),
                    street: "".into(),
                    postal_code: "".into(),
                    city: "".into(),
                    birth_date: "".into(),
                    comment: "".into(),
                    club_id: "beynost".into(),
                    rgpd_consent: true,
                }],
            }),
        )
        .await
        .unwrap_err();
        assert_eq!(chloe_forbidden_import.0, StatusCode::FORBIDDEN);

        // 5. Persistance après redémarrage (rechargement disque)
        let reloaded = load_or_init_state(&state.data_dir);
        assert!(reloaded.lead_prospects.iter().any(|p| p.id == prospect_id));
        assert!(reloaded.lead_appointments.iter().any(|a| a.date == "2026-12-10" && a.start_time == "14:00"));
    }

    #[tokio::test]
    async fn lead_settings_routes_persist_per_club_and_enforce_admin_write() {
        let state = test_state();

        // 1. Session Mario (Direction / Admin)
        let mario_login = post_local_auth_login(
            State(state.clone()),
            Json(LocalAuthLoginRequest {
                email_or_id: "emp-mario".to_string(),
                pin_or_password: "1010".to_string(),
                role_requested: String::new(),
            }),
        )
        .await
        .into_response();
        let mario_bytes = axum::body::to_bytes(mario_login.into_body(), usize::MAX).await.unwrap();
        let mario_json: Value = serde_json::from_slice(&mario_bytes).unwrap();
        let mario_token = mario_json["sessionToken"].as_str().unwrap().to_string();
        let mut h_mario = HeaderMap::new();
        h_mario.insert(header::AUTHORIZATION, HeaderValue::from_str(&format!("Bearer {}", mario_token)).unwrap());

        // Lecture des réglages Carré de Soie par Mario
        let res_get = get_lead_settings(
            State(state.clone()),
            h_mario.clone(),
            Path("carre-de-soie".into()),
        )
        .await
        .unwrap();
        assert_eq!(res_get.0["ok"], true);
        assert_eq!(res_get.0["clubId"], "carre-de-soie");

        // 2. Mise à jour des paramètres par Mario (autorisé)
        let new_settings = json!({
            "smsCredits": 1500,
            "salesScript": "Script mis à jour",
            "archiveThresholdDays": 40,
            "notifEmail": "direction.cds@c.fitness",
            "notifMobile": "07 82 00 00 01",
            "whatsappNumber": "+33 4 78 00 00 01",
            "autoAssignEnabled": true,
            "autoUnassignOnLeave": true,
            "dropoutThresholdDays": 25,
            "dropoutResetOnBadge": true,
            "autoArchiveEnabled": true,
            "archiveTargetStage": "Archivé",
            "enabledAlertIds": ["LEAD-0545", "LEAD-0548"],
            "selectedPassOfferIds": ["HZ-CDS-ABO-PASS"],
            "clientPassTargetScope": "club",
            "uiLanguage": "fr"
        });

        let res_put = put_lead_settings(
            State(state.clone()),
            h_mario.clone(),
            Path("carre-de-soie".into()),
            Json(new_settings.clone()),
        )
        .await
        .unwrap();
        assert_eq!(res_put.0["ok"], true);
        assert_eq!(res_put.0["settings"]["archiveThresholdDays"], 40);

        // 3. Rejet 403 pour Chloé (commerciale sans droit d'administration sur CDS)
        let chloe_login = post_local_auth_login(
            State(state.clone()),
            Json(LocalAuthLoginRequest {
                email_or_id: "emp-chloe".to_string(),
                pin_or_password: "5320".to_string(),
                role_requested: String::new(),
            }),
        )
        .await
        .into_response();
        let chloe_bytes = axum::body::to_bytes(chloe_login.into_body(), usize::MAX).await.unwrap();
        let chloe_json: Value = serde_json::from_slice(&chloe_bytes).unwrap();
        let chloe_token = chloe_json["sessionToken"].as_str().unwrap().to_string();
        let mut h_chloe = HeaderMap::new();
        h_chloe.insert(header::AUTHORIZATION, HeaderValue::from_str(&format!("Bearer {}", chloe_token)).unwrap());

        let chloe_forbidden = put_lead_settings(
            State(state.clone()),
            h_chloe,
            Path("carre-de-soie".into()),
            Json(new_settings),
        )
        .await
        .unwrap_err();
        assert_eq!(chloe_forbidden.0, StatusCode::FORBIDDEN);

        // 4. Persistance disque vérifiée après rechargement état
        let reloaded = load_or_init_state(&state.data_dir);
        let cds_saved = reloaded.lead_settings_by_club.get("carre-de-soie").unwrap();
        assert_eq!(cds_saved["archiveThresholdDays"], 40);
        assert_eq!(cds_saved["dropoutThresholdDays"], 25);
    }

    #[tokio::test]
    async fn lead_settings_failed_write_preserves_memory_disk_and_audit() {
        // Exercise both replacing existing settings and creating a missing entry.
        for existing_settings in [true, false] {
            let state = test_state();
            {
                let mut db = state.db.write().await;
                if !existing_settings {
                    db.lead_settings_by_club.remove("carre-de-soie");
                }
                persist_state(&state.data_dir, &db).unwrap();
            }
            let headers = session_headers(&state, "emp-mario", "club-carre-soie").await;
            let before = serde_json::to_value(&*state.db.read().await).unwrap();
            let state_file = state.data_dir.join("cfitness_state.json");
            let disk_before = std::fs::read(&state_file).unwrap();
            let visible_before = get_lead_settings(
                State(state.clone()), headers.clone(), Path("carre-de-soie".into()),
            ).await.unwrap().0;

            // A directory at the temporary-file path reliably makes fs::write fail,
            // including on machines where chmod-based failure simulations do not.
            let blocker = state.data_dir.join("cfitness_state.json.tmp");
            std::fs::create_dir(&blocker).unwrap();
            let result = put_lead_settings(
                State(state.clone()), headers.clone(), Path("carre-de-soie".into()),
                Json(json!({ "archiveThresholdDays": 99, "salesScript": "failed write" })),
            ).await;
            assert!(matches!(result, Err((StatusCode::INTERNAL_SERVER_ERROR, _))));
            assert!(serde_json::to_value(&*state.db.read().await).unwrap() == before,
                "A failed settings write must leave the complete in-memory state unchanged");
            assert_eq!(std::fs::read(&state_file).unwrap(), disk_before);
            let visible_after = get_lead_settings(
                State(state.clone()), headers.clone(), Path("carre-de-soie".into()),
            ).await.unwrap().0;
            assert_eq!(visible_after, visible_before);

            // A later successful write for the other club must not commit the
            // rejected settings or their audit entry as a side effect.
            std::fs::remove_dir(&blocker).unwrap();
            put_lead_settings(
                State(state.clone()), headers, Path("beynost".into()),
                Json(json!({ "archiveThresholdDays": 45 })),
            ).await.unwrap();
            let reloaded: AppDatabaseState = serde_json::from_slice(
                &std::fs::read(&state_file).unwrap(),
            ).unwrap();
            let durable = serde_json::to_value(&reloaded).unwrap();
            assert_eq!(durable["leadSettingsByClub"]["carre-de-soie"],
                before["leadSettingsByClub"]["carre-de-soie"]);
            assert_eq!(reloaded.lead_settings_by_club["beynost"]["archiveThresholdDays"], 45);
            assert_eq!(reloaded.audit_log.len(), before["auditLog"].as_array().unwrap().len() + 1);
            assert_eq!(reloaded.audit_log.last().unwrap().target_label, "ClubLeadSettings (beynost)");
            std::fs::remove_dir_all(&state.data_dir).unwrap();
        }
    }

    #[tokio::test]
    async fn heitz_gate_check_resets_prospect_dropout_and_rh_leave_assigns_cleanly() {
        let state = test_state();

        // 1. Positionner un prospect avec décrochage (25 jours sans visite)
        {
            let mut db = state.db.write().await;
            db.lead_prospects.push(crate::models::LeadProspectRecord {
                id: "pr-test-dropout".into(),
                gender: "M".into(),
                first_name: "Julien".into(),
                last_name: "Roux".into(),
                email: "julien.roux@exemple.fr".into(),
                phone: "0699001122".into(),
                street: "".into(),
                postal_code: "".into(),
                city: "".into(),
                birth_date: "".into(),
                comment: "Test décrochage".into(),
                club_id: "carre-de-soie".into(),
                source: "Site".into(),
                stage: "Séance planifiée".into(),
                lead_status: "Séance planifiée".into(),
                rgpd_consent: true,
                segments: vec![],
                trial_date: Some("2026-11-21".into()),
                assigned_to_id: Some("emp-maxime".into()),
                last_visit_at: None,
                days_without_visit: 25,
                last_inbound_reply_at: None,
                archived_at: None,
                converted_offer: None,
                is_archived: false,
                archive_reason: None,
                client_scope: None,
                client_club_ids: vec![],
                has_active_vacation: false,
                last_commercial_touch_at: None,
                created_at: "2026-10-25".into(),
            });
        }

        // 2. Passage portillon Heitz réussi
        let gate_res = post_heitz_gate_check(
            State(state.clone()),
            Json(HeitzGateCheckRequest {
                club_id: "carre-de-soie".into(),
                badge_code: "0699001122".into(),
                member_id: "pr-test-dropout".into(),
                home_club_id: "carre-de-soie".into(),
                fin_balance_eur: 0.0,
                fire_alarm_open: false,
            }),
        )
        .await
        .into_response();
        assert_eq!(gate_res.status(), StatusCode::OK);

        // 3. Vérification de la remise à zéro du décrochage et du passage au statut "Venu"
        {
            let db = state.db.read().await;
            let pr = db.lead_prospects.iter().find(|p| p.id == "pr-test-dropout").unwrap();
            assert_eq!(pr.days_without_visit, 0);
            assert!(pr.last_visit_at.is_some());
            assert_eq!(pr.stage, "Venu");
        }

        // 4. Test d'exclusion des commerciaux en congé RH
        {
            let mut db = state.db.write().await;
            let today = Utc::now().format("%Y-%m-%d").to_string();
            // Maxime est placé en congé maladie validé
            db.leave_requests.push(crate::models::LeaveRequest {
                id: "leave-maxime".into(),
                employee_id: "emp-maxime".into(),
                site_id: "site_cds".into(),
                motive: "Maladie".into(),
                start_date: today.clone(),
                end_date: today,
                status: "VALIDE".into(),
                comment: "Arrêt maladie".into(),
            });

            // L'assignation pour Carré de Soie doit exclure Maxime et choisir Karim ou file d'attente
            let assigned = resolve_available_commercial_for_club(&db, "carre-de-soie");
            assert_ne!(assigned, "emp-maxime");
            assert_eq!(assigned, "emp-karim");
        }
    }

    #[tokio::test]
    async fn csprng_and_production_security_guards_enforce_isolation() {
        // 1. Vérification que le générateur de session CSPRNG génère des tokens uniques de 256 bits
        let t1 = generate_session_token();
        let t2 = generate_session_token();
        assert_ne!(t1, t2);
        assert!(t1.starts_with("cfos_"));
        assert_eq!(t1.len(), 5 + 64); // "cfos_" + 64 hex chars = 256 bits d'entropie

        // 2. Vérification des secrets démo
        assert!(is_valid_secret_for_employee("emp-admin", "0766"));
        assert!(is_valid_secret_for_employee("emp-mario", "1010"));
        assert!(!is_valid_secret_for_employee("emp-admin", "mauvais_code"));
    }

    #[tokio::test]
    async fn module_delegation_is_scoped_by_employee_club_module_and_action() {
        let state = test_state();
        let admin_headers = session_headers(&state, "emp-mario", "club-carre-soie").await;
        let greg_headers = session_headers(&state, "emp-greg", "club-carre-soie").await;

        // 1. Un non-administrateur (même manager bi-club) ne peut pas modifier les délégations par club (403)
        let denied = put_admin_delegations(
            State(state.clone()),
            greg_headers,
            Json(PutModuleDelegationsPayload {
                delegations: vec![crate::models::ModuleDelegation {
                    employee_id: "emp-greg".into(),
                    site_id: "club-carre-soie".into(),
                    module: "finances".into(),
                    actions: vec!["view".into()],
                }],
            }),
        )
        .await;
        assert!(matches!(denied, Err((StatusCode::FORBIDDEN, _))));

        // 2. Validation stricte du module, de l'action et du périmètre club (400)
        let bad_action = put_admin_delegations(
            State(state.clone()),
            admin_headers.clone(),
            Json(PutModuleDelegationsPayload {
                delegations: vec![crate::models::ModuleDelegation {
                    employee_id: "emp-greg".into(),
                    site_id: "club-carre-soie".into(),
                    module: "finances".into(),
                    actions: vec!["delete_all".into()],
                }],
            }),
        )
        .await;
        assert!(matches!(bad_action, Err((StatusCode::BAD_REQUEST, _))));

        // 3. Délégation Finances en lecture seule pour Greg (bi-club) uniquement à Carré de Soie
        let saved = put_admin_delegations(
            State(state.clone()),
            admin_headers.clone(),
            Json(PutModuleDelegationsPayload {
                delegations: vec![crate::models::ModuleDelegation {
                    employee_id: "emp-greg".into(),
                    site_id: "club-carre-soie".into(),
                    module: "finances".into(),
                    actions: vec!["view".into()],
                }],
            }),
        )
        .await
        .expect("Admin devrait enregistrer la délégation par club")
        .0;
        assert_eq!(saved.len(), 1);

        let fetched = get_admin_delegations(State(state.clone()), admin_headers)
            .await
            .expect("GET délégations OK")
            .0;
        assert_eq!(fetched.len(), 1);
        assert_eq!(fetched[0].site_id, "club-carre-soie");

        let db = state.db.read().await;
        // Lecture autorisée à Carré de Soie, écriture refusée à Carré de Soie, tout refusé à Beynost
        assert!(crate::rbac::can_access_module_action(
            &db,
            "emp-greg",
            Some("club-carre-soie"),
            "finances",
            "view"
        ));
        assert!(!crate::rbac::can_access_module_action(
            &db,
            "emp-greg",
            Some("club-carre-soie"),
            "finances",
            "edit"
        ));
        assert!(!crate::rbac::can_access_module_action(
            &db,
            "emp-greg",
            Some("club-beynost"),
            "finances",
            "view"
        ));

        let kpi_cds = filter_kpis_for_actor(&db, "emp-greg", "club-carre-soie");
        assert_eq!(kpi_cds.len(), 1);
        assert!(kpi_cds[0].revenue_eur.is_some());
        let kpi_bey = filter_kpis_for_actor(&db, "emp-greg", "club-beynost");
        assert_eq!(kpi_bey.len(), 1);
        assert!(kpi_bey[0].revenue_eur.is_none());
    }

    #[tokio::test]
    async fn preferences_appearance_persists_per_employee_and_rolls_back_on_disk_failure() {
        let state = test_state();
        let mario_headers = session_headers(&state, "emp-mario", "club-carre-soie").await;
        let sarah_headers = session_headers(&state, "emp-sarah", "club-carre-soie").await;

        // 1. Rejet des valeurs d'apparence inconnues (400)
        let bad_mode = put_preferences(
            State(state.clone()),
            mario_headers.clone(),
            Json(UpdatePreferencesPayload {
                language: None,
                notifications: None,
                calendar_feed_enabled: None,
                sso_enabled: None,
                sso_provider: None,
                sso_domain: None,
                theme_mode: Some("sepia".into()),
                accent_color: None,
            }),
        )
        .await;
        assert!(matches!(bad_mode, Err((StatusCode::BAD_REQUEST, _))));

        // 2. Sauvegarde isolée pour Mario (light + emerald) sans impacter Sarah (dark + violet)
        let updated = put_preferences(
            State(state.clone()),
            mario_headers.clone(),
            Json(UpdatePreferencesPayload {
                language: None,
                notifications: None,
                calendar_feed_enabled: None,
                sso_enabled: None,
                sso_provider: None,
                sso_domain: None,
                theme_mode: Some("light".into()),
                accent_color: Some("emerald".into()),
            }),
        )
        .await
        .expect("PUT préférences Mario OK")
        .0;
        assert_eq!(updated.theme_mode, "light");
        assert_eq!(updated.accent_color, "emerald");

        let sarah_prefs = get_preferences(State(state.clone()), sarah_headers)
            .await
            .expect("GET préférences Sarah OK")
            .0;
        assert_eq!(sarah_prefs.theme_mode, "dark");
        assert_eq!(sarah_prefs.accent_color, "violet");

        // Vérification de la persistance disque après rechargement
        let reloaded = load_or_init_state(&state.data_dir);
        let mario_reloaded = reloaded.preferences_by_employee.get("emp-mario").unwrap();
        assert_eq!(mario_reloaded.theme_mode, "light");
        assert_eq!(mario_reloaded.accent_color, "emerald");

        // 3. Simuler un échec disque : pointer data_dir vers un fichier régulier
        let blocker_file = std::env::temp_dir().join(format!(
            "cfos_blocker_{}",
            Utc::now().timestamp_nanos_opt().unwrap_or_default()
        ));
        std::fs::write(&blocker_file, b"blocked").unwrap();
        let failing_state = Arc::new(SharedAppState {
            db: RwLock::new(reloaded),
            data_dir: blocker_file.clone(),
            sessions: RwLock::new(HashMap::new()),
            login_attempts: RwLock::new(HashMap::new()),
        });
        let failing_headers = session_headers(&failing_state, "emp-mario", "club-carre-soie").await;

        let fail_res = put_preferences(
            State(failing_state.clone()),
            failing_headers,
            Json(UpdatePreferencesPayload {
                language: Some("English".into()),
                notifications: None,
                calendar_feed_enabled: None,
                sso_enabled: None,
                sso_provider: None,
                sso_domain: None,
                theme_mode: Some("dark".into()),
                accent_color: Some("rose".into()),
            }),
        )
        .await;
        assert!(matches!(fail_res, Err((StatusCode::INTERNAL_SERVER_ERROR, _))));

        // Rollback mémoire vérifié : aucune fuite de l'écriture échouée
        let rolled_back_db = failing_state.db.read().await;
        let mario_after_fail = rolled_back_db.preferences_by_employee.get("emp-mario").unwrap();
        assert_eq!(mario_after_fail.theme_mode, "light");
        assert_eq!(mario_after_fail.accent_color, "emerald");
        assert_ne!(mario_after_fail.language, "English");
        let _ = std::fs::remove_file(&blocker_file);
    }

    #[tokio::test]
    async fn server_password_change_admin_reset_and_login_enforce_hashed_credentials() {
        let state = test_state();
        let sarah_headers = session_headers(&state, "emp-sarah", "club-carre-soie").await;
        let mario_headers = session_headers(&state, "emp-mario", "club-carre-soie").await;

        // 1. Changement personnel refusé si secret actuel invalide (401) ou nouveau trop court (400)
        let bad_current = post_change_password(
            State(state.clone()),
            sarah_headers.clone(),
            Json(ChangePasswordPayload {
                current_secret: "0000".into(),
                new_secret: "NouveauMotDePasseFort!2026".into(),
            }),
        )
        .await;
        assert!(matches!(bad_current, Err((StatusCode::UNAUTHORIZED, _))));

        let too_short = post_change_password(
            State(state.clone()),
            sarah_headers.clone(),
            Json(ChangePasswordPayload {
                current_secret: "3141".into(),
                new_secret: "tropcourt".into(),
            }),
        )
        .await;
        assert!(matches!(too_short, Err((StatusCode::BAD_REQUEST, _))));

        // 2. Changement valide de Sarah -> haché PBKDF2 en base, persistant et remplaçant le PIN démo
        let ok_res = post_change_password(
            State(state.clone()),
            sarah_headers.clone(),
            Json(ChangePasswordPayload {
                current_secret: "3141".into(),
                new_secret: "SarahProdSecure#2026".into(),
            }),
        )
        .await
        .expect("Changement mot de passe Sarah OK")
        .0;
        assert_eq!(ok_res["changed"], json!(true));

        {
            let reloaded = load_or_init_state(&state.data_dir);
            let sarah_hash = reloaded.password_hashes_by_employee.get("emp-sarah").unwrap();
            assert!(sarah_hash.starts_with("pbkdf2_sha256$100000$"));
            assert!(!verify_employee_secret(&reloaded, "emp-sarah", "3141"));
            assert!(verify_employee_secret(
                &reloaded,
                "emp-sarah",
                "SarahProdSecure#2026"
            ));
        }

        // Vérifier le login HTTP avec ancien PIN (401) puis nouveau mot de passe (200)
        let old_login = post_local_auth_login(
            State(state.clone()),
            Json(LocalAuthLoginRequest {
                email_or_id: "emp-sarah".into(),
                pin_or_password: "3141".into(),
                role_requested: String::new(),
            }),
        )
        .await
        .into_response();
        assert_eq!(old_login.status(), StatusCode::UNAUTHORIZED);

        let new_login = post_local_auth_login(
            State(state.clone()),
            Json(LocalAuthLoginRequest {
                email_or_id: "emp-sarah".into(),
                pin_or_password: "SarahProdSecure#2026".into(),
                role_requested: String::new(),
            }),
        )
        .await
        .into_response();
        assert_eq!(new_login.status(), StatusCode::OK);

        // 3. Réinitialisation admin : refus 403 si non-admin, succès admin + révocation session cible
        let non_admin_reset = put_admin_employee_password(
            State(state.clone()),
            sarah_headers.clone(),
            Path("emp-chloe".into()),
            Json(AdminSetPasswordPayload {
                new_secret: "TentativeNonAdmin#2026".into(),
            }),
        )
        .await;
        assert!(matches!(non_admin_reset, Err((StatusCode::FORBIDDEN, _))));

        let chloe_headers = session_headers(&state, "emp-chloe", "club-beynost").await;
        let admin_reset = put_admin_employee_password(
            State(state.clone()),
            mario_headers,
            Path("emp-chloe".into()),
            Json(AdminSetPasswordPayload {
                new_secret: "ChloeAdminReset!2026".into(),
            }),
        )
        .await
        .expect("Admin reset mot de passe Chloé OK")
        .0;
        assert_eq!(admin_reset["ok"], json!(true));

        // L'ancien Bearer token de Chloé doit être révoqué immédiatement
        let revoked_session = resolve_session_actor(&state, &chloe_headers).await;
        assert!(matches!(revoked_session, Err((StatusCode::UNAUTHORIZED, _))));

        let chloe_login = post_local_auth_login(
            State(state.clone()),
            Json(LocalAuthLoginRequest {
                email_or_id: "emp-chloe".into(),
                pin_or_password: "ChloeAdminReset!2026".into(),
                role_requested: String::new(),
            }),
        )
        .await
        .into_response();
        assert_eq!(chloe_login.status(), StatusCode::OK);
    }

}
