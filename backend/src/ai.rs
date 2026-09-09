#[path = "ai_client.rs"]
mod ai_client;

use std::env;

use axum::{
    Json, Router,
    extract::State,
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::{get, post},
};
use serde::{Deserialize, Serialize};
use thiserror::Error;

use ai_client::AiClient;

const MAX_INPUT_BYTES: usize = 20_000;

#[derive(Clone)]
struct AiSettings {
    api_key: Option<String>,
    base_url: String,
    model: String,
}

impl AiSettings {
    fn from_env() -> Self {
        Self {
            api_key: env::var("OPENAI_API_KEY")
                .ok()
                .filter(|key| !key.trim().is_empty())
                .or_else(|| {
                    env::var("AI_API_KEY")
                        .ok()
                        .filter(|key| !key.trim().is_empty())
                }),
            base_url: env::var("AI_BASE_URL")
                .unwrap_or_else(|_| "https://api.openai.com/v1".to_owned()),
            model: env::var("AI_MODEL").unwrap_or_else(|_| "gpt-4.1-mini".to_owned()),
        }
    }
}

#[derive(Clone)]
struct AiState {
    settings: AiSettings,
}

pub fn router() -> Router {
    router_with_settings(AiSettings::from_env())
}

fn router_with_settings(settings: AiSettings) -> Router {
    Router::new()
        .route("/api/ai/status", get(status))
        .route("/api/ai/explain", post(explain))
        .route("/api/ai/generate", post(generate))
        .with_state(AiState { settings })
}

async fn status(State(state): State<AiState>) -> Json<AiStatus> {
    Json(AiStatus {
        configured: state.settings.api_key.is_some(),
        model: state.settings.model,
    })
}

async fn explain(
    State(state): State<AiState>,
    Json(request): Json<ExplainRequest>,
) -> Result<Json<ExplainResponse>, AiError> {
    request.question.validate()?;
    if request.selected_answer.is_some_and(|answer| answer >= 5) {
        return Err(AiError::InvalidInput);
    }
    let client = AiClient::new(&state.settings)?;
    Ok(Json(ExplainResponse {
        explanation: client.explain(&request).await?,
    }))
}

async fn generate(
    State(state): State<AiState>,
    Json(request): Json<GenerateRequest>,
) -> Result<Json<GenerateResponse>, AiError> {
    request.question.validate()?;
    let client = AiClient::new(&state.settings)?;
    Ok(Json(GenerateResponse {
        question: client.generate(&request.question).await?,
    }))
}

#[derive(Serialize)]
struct AiStatus {
    configured: bool,
    model: String,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct ExplainRequest {
    question: Question,
    selected_answer: Option<usize>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct GenerateRequest {
    question: Question,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct Question {
    subject: Subject,
    topic: String,
    prompt: String,
    options: Vec<String>,
    answer: usize,
    explanation: String,
}

impl Question {
    fn validate(&self) -> Result<(), AiError> {
        if self.prompt.trim().is_empty()
            || self.topic.trim().is_empty()
            || self.options.len() != 5
            || self.answer >= self.options.len()
            || self.options.iter().any(|option| option.trim().is_empty())
            || self
                .options
                .iter()
                .enumerate()
                .any(|(index, option)| self.options[..index].iter().any(|other| other == option))
            || self.total_bytes() > MAX_INPUT_BYTES
        {
            return Err(AiError::InvalidInput);
        }
        Ok(())
    }

    fn total_bytes(&self) -> usize {
        self.topic.len()
            + self.prompt.len()
            + self.explanation.len()
            + self.options.iter().map(String::len).sum::<usize>()
    }
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "lowercase")]
enum Subject {
    Math,
    English,
    Korean,
    Discrete,
    Algorithms,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ExplainResponse {
    explanation: String,
}

#[derive(Serialize)]
struct GenerateResponse {
    question: Question,
}

#[derive(Debug, Error)]
enum AiError {
    #[error("AI service is not configured")]
    MissingKey,
    #[error("invalid AI input")]
    InvalidInput,
    #[error("invalid base URL")]
    InvalidBaseUrl,
    #[error("AI upstream failed")]
    Upstream,
    #[error("AI upstream timed out")]
    Timeout,
    #[error("AI response was invalid")]
    InvalidResponse,
    #[error("AI request was refused or incomplete")]
    Refused,
}

impl IntoResponse for AiError {
    fn into_response(self) -> Response {
        let (status, error) = match self {
            Self::MissingKey => (
                StatusCode::SERVICE_UNAVAILABLE,
                "AI 기능이 설정되지 않았습니다.",
            ),
            Self::InvalidInput => (StatusCode::BAD_REQUEST, "문제 형식이 올바르지 않습니다."),
            Self::InvalidBaseUrl => (
                StatusCode::SERVICE_UNAVAILABLE,
                "AI 서버 주소 설정이 올바르지 않습니다.",
            ),
            Self::Refused => (
                StatusCode::UNPROCESSABLE_ENTITY,
                "AI가 이 요청을 완료할 수 없습니다.",
            ),
            Self::Timeout => (
                StatusCode::GATEWAY_TIMEOUT,
                "AI 응답 시간이 초과되었습니다.",
            ),
            Self::Upstream | Self::InvalidResponse => {
                (StatusCode::BAD_GATEWAY, "AI 응답을 처리할 수 없습니다.")
            }
        };
        (status, Json(ErrorResponse { error })).into_response()
    }
}

#[derive(Serialize)]
struct ErrorResponse {
    error: &'static str,
}

#[cfg(test)]
#[path = "ai_tests.rs"]
mod ai_tests;
