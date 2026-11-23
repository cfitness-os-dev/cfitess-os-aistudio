mod auth_passwords;
mod clock_terminals;
#[cfg(test)]
mod terminal_integrity_tests;
mod course_attendance;
mod employee_import;
mod employee_lifecycle;
mod heitz_members;
mod hr_manager;
mod clock_policy;
#[cfg(test)]
mod clock_policy_tests;
#[cfg(test)]
mod hr_manager_tests;
mod lead_automations;
mod lead_settings;
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
use crate::seed::load_or_init_state;
use axum::body::Body;
use axum::http::{HeaderValue, Request};
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
    let mut res = next.run(req).await;
    let headers = res.headers_mut();
    headers.insert(
        "x-content-type-options",
        HeaderValue::from_static("nosniff"),
    );
    headers.insert("x-frame-options", HeaderValue::from_static("SAMEORIGIN"));
    headers.insert(
        "referrer-policy",
        HeaderValue::from_static("strict-origin-when-cross-origin"),
    );
    headers.insert(
        "permissions-policy",
        HeaderValue::from_static("camera=(), microphone=(self), geolocation=()"),
    );
    headers.insert("x-xss-protection", HeaderValue::from_static("0"));
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

    let initial_state = load_or_init_state(&data_dir);
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
                CorsLayer::very_permissive().allow_origin(AllowOrigin::list(origins))
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

    lead_automations::spawn_lead_automation_scheduler(shared.clone());

    let app: Router = api_router(shared)
        .fallback_service(spa_service)
        .layer(middleware::from_fn(security_headers_middleware))
        .layer(cors_layer)
        .layer(TraceLayer::new_for_http());

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
