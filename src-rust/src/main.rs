mod auth_passwords;
mod clock_terminals;
mod club_displays;
#[cfg(test)]
mod terminal_integrity_tests;
mod course_attendance;
mod employee_import;
mod employee_lifecycle;
mod heitz_live;
mod heitz_collection;
mod heitz_recovery_readers;
mod heitz_recovery_links;
mod heitz_transport;
mod recovery_evidence;
mod heitz_members;
mod hr_manager;
mod hr_collaboration;
mod hr_documents;
mod rh_notifications;
mod planning_notifications;
mod hr_organisation;
mod hr_pilotage;
mod hr_site_rules;
mod hr_leave_policy;
mod hr_leave_accrual;
mod hr_leave_carry;
mod clock_policy;
#[cfg(test)]
mod clock_policy_tests;
#[cfg(test)]
mod hr_manager_tests;
mod lead_automations;
mod lead_scenarios;
mod lead_settings;
mod lead_contacts;
mod leave_requests;
mod maintenance;
mod missions;
mod models;
mod orchestrator;
mod personal_workspace;
mod punch_photos;
mod rbac;
mod recovery;
mod routes;
mod seed;
mod site_settings;
mod social_web;
mod stocks;
mod timeclock;

use crate::routes::{api_router, is_demo_mode, SharedAppState};
use crate::seed::try_load_or_init_state;
use axum::body::Body;
use axum::http::{header, HeaderName, HeaderValue, Method, Request};
use axum::middleware::{self, Next};
use axum::response::Response;
use axum::Router;
use std::env;
use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::RwLock;
use tower_http::cors::{AllowOrigin, CorsLayer};
use tower_http::services::{ServeDir, ServeFile};
use tower_http::trace::TraceLayer;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

async fn security_headers_middleware(req: Request<Body>, next: Next) -> Response {
    let is_api_route = req.uri().path().starts_with("/api/");
    let is_private_calendar = req.uri().path().starts_with("/api/calendar/");
    let is_https_forwarded = req
        .headers()
        .get("x-forwarded-proto")
        .and_then(|v| v.to_str().ok())
        .is_some_and(|v| v.trim().eq_ignore_ascii_case("https"));

    let mut res = next.run(req).await;
    let headers = res.headers_mut();
    headers.insert(
        "x-content-type-options",
        HeaderValue::from_static("nosniff"),
    );
    headers.insert("x-frame-options", HeaderValue::from_static("SAMEORIGIN"));
    headers.insert(
        "referrer-policy",
        HeaderValue::from_static(if is_private_calendar { "no-referrer" } else { "strict-origin-when-cross-origin" }),
    );
    headers.insert(
        "permissions-policy",
        HeaderValue::from_static("camera=(self), microphone=(self), geolocation=()"),
    );
    headers.insert("x-xss-protection", HeaderValue::from_static("0"));
    headers.insert(
        "content-security-policy",
        HeaderValue::from_static(
            "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self'; media-src 'self' blob:; frame-src 'self'; frame-ancestors 'self'; object-src 'none'; base-uri 'self'; form-action 'self'",
        ),
    );
    if is_api_route && !headers.contains_key(header::CACHE_CONTROL) {
        headers.insert(
            header::CACHE_CONTROL,
            HeaderValue::from_static("no-store, no-cache, must-revalidate"),
        );
        headers.insert(header::PRAGMA, HeaderValue::from_static("no-cache"));
    }
    if !is_demo_mode() || is_https_forwarded {
        headers.insert(
            header::STRICT_TRANSPORT_SECURITY,
            HeaderValue::from_static("max-age=31536000; includeSubDomains"),
        );
    }
    res
}

#[tokio::main]
async fn main() {
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "cfitness_os=info,tower_http=info".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    let bind_addr = env::var("CFITNESS_BIND_ADDR").unwrap_or_else(|_| {
        let port = env::var("PORT").unwrap_or_else(|_| "8080".to_string());
        format!("0.0.0.0:{}", port)
    });
    let data_dir = PathBuf::from(
        env::var("CFITNESS_DATA_DIR").unwrap_or_else(|_| "./data".to_string()),
    );
    let frontend_dir = PathBuf::from(
        env::var("CFITNESS_FRONTEND_DIR")
            .or_else(|_| env::var("STATIC_DIR"))
            .unwrap_or_else(|_| "./dist".to_string()),
    );

    let initial_state = match try_load_or_init_state(&data_dir) {
        Ok(state) => state,
        Err(err) => {
            tracing::error!("{err}");
            eprintln!("ERREUR FATALE DÉMARRAGE C.FITNESS OS : {err}");
            std::process::exit(1);
        }
    };
    let shared = Arc::new(SharedAppState {
        db: RwLock::new(initial_state),
        data_dir,
        sessions: RwLock::new(std::collections::HashMap::new()),
        login_attempts: RwLock::new(std::collections::HashMap::new()),
    });

    let cors_layer = match env::var("CFITNESS_ALLOWED_ORIGINS") {
        Ok(raw) if !raw.trim().is_empty() => {
            let origins: Vec<HeaderValue> = raw
                .split(',')
                .filter_map(|s| HeaderValue::from_str(s.trim()).ok())
                .collect();
            if origins.is_empty() {
                if !is_demo_mode() {
                    panic!("CFITNESS_ALLOWED_ORIGINS invalide en environnement de production ! Arrêt de sécurité.");
                }
                tracing::warn!("CFITNESS_ALLOWED_ORIGINS vide/invalide -> fallback CorsLayer::permissive() (mode démo)");
                CorsLayer::permissive()
            } else {
                tracing::info!("CORS restreint aux origines autorisées ({} entrées)", origins.len());
                CorsLayer::new()
                    .allow_origin(AllowOrigin::list(origins))
                    .allow_methods([
                        Method::GET,
                        Method::POST,
                        Method::PUT,
                        Method::PATCH,
                        Method::DELETE,
                        Method::OPTIONS,
                    ])
                    .allow_headers([
                        header::AUTHORIZATION,
                        header::CONTENT_TYPE,
                        header::ACCEPT,
                        header::COOKIE,
                        HeaderName::from_static("x-cfitness-actor-id"),
                        HeaderName::from_static("x-cfitness-site-id"),
                        HeaderName::from_static("x-terminal-id"),
                        HeaderName::from_static("x-terminal-secret"),
                        HeaderName::from_static("x-cfitness-heitz-token"),
                        HeaderName::from_static("x-cfitness-webhook-token"),
                        HeaderName::from_static("stripe-signature"),
                    ])
                    .allow_credentials(true)
            }
        }
        _ => {
            if !is_demo_mode() {
                panic!("CFITNESS_ALLOWED_ORIGINS obligatoire en environnement de production ! Définir les domaines autorisés.");
            }
            tracing::warn!("CFITNESS_ALLOWED_ORIGINS non défini : CORS permissif actif (mode LAN/démo)");
            CorsLayer::permissive()
        }
    };

    let index_file = frontend_dir.join("index.html");
    let spa_service = ServeDir::new(&frontend_dir)
        .append_index_html_on_directories(true)
        .fallback(ServeFile::new(index_file));

    hr_collaboration::scheduled::spawn_worker(shared.clone());
    lead_automations::spawn_lead_automation_scheduler(shared.clone());
    lead_scenarios::spawn_worker(shared.clone());
    heitz_live::spawn_heitz_live_sync_worker(shared.clone());

    let app: Router = api_router(shared)
        .fallback_service(spa_service)
        .layer(middleware::from_fn(security_headers_middleware))
        .layer(cors_layer)
        .layer(TraceLayer::new_for_http().make_span_with(|request: &Request<Body>| {
            let path = if request.uri().path().starts_with("/api/calendar/") { "/api/calendar/[private]" } else { request.uri().path() };
            tracing::info_span!("http", method = %request.method(), path)
        }));

    let addr: SocketAddr = bind_addr
        .parse()
        .expect("CFITNESS_BIND_ADDR invalide (ex: 0.0.0.0:8080)");

    tracing::info!("CFitness OS backend démarré sur http://{}", addr);

    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .expect("Impossible de lier le socket TCP");

    axum::serve(listener, app)
        .await
        .expect("Erreur fatale du serveur HTTP Axum");
}

