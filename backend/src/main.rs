mod ai;
mod error;
mod fetcher;
mod parser;
mod types;
mod url_guard;

use std::time::Duration;

use axum::{
    Json, Router,
    routing::{get, post},
};
use error::ImportError;
use serde::Serialize;
use tower_http::cors::CorsLayer;
use types::{ImportRequest, ImportResponse};

#[derive(Serialize)]
struct HealthResponse {
    status: &'static str,
}

async fn health() -> Json<HealthResponse> {
    Json(HealthResponse { status: "ok" })
}

async fn import_questions(
    Json(request): Json<ImportRequest>,
) -> Result<Json<ImportResponse>, ImportError> {
    let page = tokio::time::timeout(Duration::from_secs(12), fetcher::fetch_page(&request.url))
        .await
        .map_err(|_| ImportError::Request)??;
    let questions = parser::parse_questions(&page.html, request.subject, page.url.as_str());
    if questions.is_empty() {
        return Err(ImportError::Unsupported);
    }
    Ok(Json(ImportResponse {
        source_url: page.url.to_string(),
        source_title: parser::source_title(&page.html),
        questions,
        warnings: Vec::new(),
    }))
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt::init();

    let cors = CorsLayer::new()
        .allow_origin([
            "http://localhost:5173".parse()?,
            "http://127.0.0.1:5173".parse()?,
            "http://localhost:3000".parse()?,
            "http://127.0.0.1:3000".parse()?,
        ])
        .allow_methods([axum::http::Method::GET, axum::http::Method::POST])
        .allow_headers([axum::http::header::CONTENT_TYPE]);

    let app = Router::new()
        .route("/api/health", get(health))
        .route("/api/import/questions", post(import_questions))
        .merge(ai::router())
        .layer(cors);

    let listener = tokio::net::TcpListener::bind("127.0.0.1:3000").await?;
    tracing::info!("listening on {}", listener.local_addr()?);
    axum::serve(listener, app).await?;
    Ok(())
}
