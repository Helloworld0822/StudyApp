use std::sync::{Arc, Mutex};

use axum::{Json, Router, http::HeaderMap, routing::post};
use serde_json::{Value, json};

use super::{
    AiClient, AiError, AiSettings, ExplainRequest, Question, Subject, router_with_settings,
};

fn question() -> Question {
    Question {
        subject: Subject::Math,
        topic: "덧셈".to_owned(),
        prompt: "2 + 2는 무엇인가요?".to_owned(),
        options: vec![
            "1".to_owned(),
            "2".to_owned(),
            "3".to_owned(),
            "4".to_owned(),
            "5".to_owned(),
        ],
        answer: 3,
        explanation: "2와 2를 더하면 4입니다.".to_owned(),
    }
}

async fn serve(app: Router) -> String {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
        .await
        .expect("bind test listener");
    let address = listener.local_addr().expect("read test address");
    tokio::spawn(async move {
        axum::serve(listener, app).await.expect("serve test app");
    });
    format!("http://{address}")
}

#[tokio::test]
async fn sends_key_only_to_upstream_and_returns_explanation() {
    let authorization = Arc::new(Mutex::new(None));
    let recorder = Arc::clone(&authorization);
    let app = Router::new().route("/v1/chat/completions", post(move |headers: HeaderMap, Json(_): Json<Value>| {
        let recorder = Arc::clone(&recorder);
        async move {
            *recorder.lock().expect("lock recorder") = headers.get("authorization").and_then(|value| value.to_str().ok()).map(str::to_owned);
            Json(json!({"choices":[{"finish_reason":"stop","message":{"refusal":null,"content":json!({"explanation":"정답은 4입니다."}).to_string()}}]}))
        }
    }));
    let base_url = serve(app).await;
    let client = AiClient::new(&AiSettings {
        api_key: Some("test-secret".to_owned()),
        base_url: format!("{base_url}/v1"),
        model: "test-model".to_owned(),
    })
    .expect("create client");

    let result = client
        .explain(&ExplainRequest {
            question: question(),
            selected_answer: Some(2),
        })
        .await;

    assert_eq!(result.expect("explanation result"), "정답은 4입니다.");
    assert_eq!(
        authorization.lock().expect("lock recorder").as_deref(),
        Some("Bearer test-secret")
    );
}

#[tokio::test]
async fn rejects_malformed_provider_output() {
    let app = Router::new().route(
        "/v1/chat/completions",
        post(|| async {
            Json(json!({"choices":[{"finish_reason":"stop","message":{"content":"not json"}}]}))
        }),
    );
    let base_url = serve(app).await;
    let client = AiClient::new(&AiSettings {
        api_key: Some("test-secret".to_owned()),
        base_url: format!("{base_url}/v1"),
        model: "test-model".to_owned(),
    })
    .expect("create client");

    let result = client
        .explain(&ExplainRequest {
            question: question(),
            selected_answer: None,
        })
        .await;

    assert!(matches!(result, Err(AiError::InvalidResponse)));
}

#[tokio::test]
async fn reports_unconfigured_service_without_upstream_call() {
    let base_url = serve(router_with_settings(AiSettings {
        api_key: None,
        base_url: "https://api.openai.com/v1".to_owned(),
        model: "gpt-4.1-mini".to_owned(),
    }))
    .await;
    let body = serde_json::to_string(&json!({"question":question(),"selectedAnswer":0}))
        .expect("serialize request");
    let response = reqwest::Client::new()
        .post(format!("{base_url}/api/ai/explain"))
        .header("content-type", "application/json")
        .body(body)
        .send()
        .await
        .expect("call local API");

    assert_eq!(response.status(), reqwest::StatusCode::SERVICE_UNAVAILABLE);
    let body = response.text().await.expect("read response");
    assert_eq!(
        serde_json::from_str::<Value>(&body).expect("parse response")["error"],
        "AI 기능이 설정되지 않았습니다."
    );
}

#[test]
fn rejects_question_without_five_unique_choices() {
    let mut invalid = question();
    invalid.options[4] = "4".to_owned();

    assert!(matches!(invalid.validate(), Err(AiError::InvalidInput)));
}

#[tokio::test]
async fn generates_five_choice_question_through_real_http_api() {
    let provider = Router::new().route(
        "/v1/chat/completions",
        post(|| async {
            Json(
                json!({"choices":[{"finish_reason":"stop","message":{"refusal":null,
            "content":json!({"question":question()}).to_string()}}]}),
            )
        }),
    );
    let provider_url = serve(provider).await;
    let api_url = serve(router_with_settings(AiSettings {
        api_key: Some("mock-only-key".to_owned()),
        base_url: format!("{provider_url}/v1"),
        model: "fixture".to_owned(),
    }))
    .await;
    let response = reqwest::Client::new()
        .post(format!("{api_url}/api/ai/generate"))
        .header("content-type", "application/json")
        .body(json!({"question":question()}).to_string())
        .send()
        .await
        .expect("call application API");
    assert_eq!(response.status(), reqwest::StatusCode::OK);
    let body: Value =
        serde_json::from_str(&response.text().await.expect("response text")).expect("JSON");
    assert_eq!(
        body["question"]["options"]
            .as_array()
            .expect("options")
            .len(),
        5
    );
    assert_eq!(body["question"]["answer"], 3);
    assert!(!body.to_string().contains("mock-only-key"));
}
