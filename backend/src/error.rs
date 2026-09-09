use axum::{Json, http::StatusCode, response::IntoResponse};
use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum ImportError {
    #[error("invalid source URL")]
    InvalidUrl,
    #[error("DNS lookup failed")]
    Dns,
    #[error("blocked address")]
    BlockedAddress,
    #[error("robots denied")]
    RobotsDenied,
    #[error("Project Gutenberg normal-page crawling is not supported")]
    GutenbergDenied,
    #[error("request failed")]
    Request,
    #[error("redirect limit reached")]
    RedirectLimit,
    #[error("not HTML")]
    NotHtml,
    #[error("response too large")]
    ResponseTooLarge,
    #[error("unsupported source")]
    Unsupported,
}

#[derive(Serialize)]
pub struct ErrorResponse {
    pub error: String,
}

impl IntoResponse for ImportError {
    fn into_response(self) -> axum::response::Response {
        let (status, error) = match self {
            Self::InvalidUrl => (
                StatusCode::UNPROCESSABLE_ENTITY,
                "HTTPS 공개 URL만 사용할 수 있습니다.",
            ),
            Self::Dns | Self::BlockedAddress => (
                StatusCode::UNPROCESSABLE_ENTITY,
                "안전하지 않은 대상 주소는 가져올 수 없습니다.",
            ),
            Self::RobotsDenied => (
                StatusCode::UNPROCESSABLE_ENTITY,
                "robots.txt 정책상 이 페이지를 가져올 수 없습니다.",
            ),
            Self::GutenbergDenied => (
                StatusCode::UNPROCESSABLE_ENTITY,
                "Project Gutenberg 일반 페이지 자동 수집은 지원하지 않습니다. 공식 OPDS 카탈로그 또는 공개 데이터 파일을 내려받아 사용해 주세요.",
            ),
            Self::Unsupported => (
                StatusCode::UNPROCESSABLE_ENTITY,
                "공개된 객관식 문제와 명시적 정답을 찾지 못했습니다.",
            ),
            Self::NotHtml => (
                StatusCode::UNPROCESSABLE_ENTITY,
                "HTML 페이지에서만 문제를 가져올 수 있습니다.",
            ),
            Self::ResponseTooLarge => (
                StatusCode::PAYLOAD_TOO_LARGE,
                "페이지 크기가 1MB 제한을 초과했습니다.",
            ),
            Self::Request | Self::RedirectLimit => (
                StatusCode::BAD_GATEWAY,
                "원본 페이지를 안전하게 가져오지 못했습니다.",
            ),
        };
        (
            status,
            Json(ErrorResponse {
                error: error.to_owned(),
            }),
        )
            .into_response()
    }
}
