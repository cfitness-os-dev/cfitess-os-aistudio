mod models;
mod rbac;
mod routes;
mod seed;

use crate::routes::{api_router, SharedAppState};
use crate::seed::load_or_init_state;
use axum::Router;
use std::env;
use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::RwLock;
use tower_http::cors::CorsLayer;
use tower_http::services::{ServeDir, ServeFile};
use tower_http::trace::TraceLayer;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

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
    });

    let index_file = frontend_dir.join("index.html");
    let spa_service = ServeDir::new(&frontend_dir)
        .append_index_html_on_directories(true)
        .not_found_service(ServeFile::new(index_file));

    let app: Router = api_router(shared)
        .fallback_service(spa_service)
        .layer(CorsLayer::permissive())
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
