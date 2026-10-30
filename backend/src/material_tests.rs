use std::sync::{
    Arc, Mutex,
    atomic::{AtomicUsize, Ordering},
};

use axum::{Json, Router, routing::post};
use serde_json::{Value, json};

use crate::ai::{AiSettings, router_with_settings};

const SECRET: &str = "material-mock-secret";
const TEXT: &str = "A student reads a different book every week and writes a short review.";

async fn serve(app: Router) -> String {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
        .await
        .expect("bind fixture");
    let address = listener.local_addr().expect("fixture address");
    tokio::spawn(async move {
        axum::serve(listener, app).await.expect("serve fixture");
    });
    format!("http://{address}")
}

async fn api(provider: &str, key: Option<&str>) -> String {
    serve(router_with_settings(AiSettings {
        api_key: key.map(str::to_owned),
        base_url: format!("{provider}/v1"),
        model: "fixture-model".to_owned(),
    }))
    .await
}

fn request(subject: &str) -> Value {
    json!({"subject":subject,"topic":"읽기","text":TEXT,"difficulty":"standard","count":1})
}

fn question(subject: &str) -> Value {
    json!({"subject":subject,"topic":"읽기","prompt":"What does the student do every week?",
        "options":["Reads a book","Writes a novel","Runs a race","Builds a house","Plants a tree"],
        "answer":0,"explanation":"지문에서 매주 책을 읽는다고 했습니다. 다른 선택지는 지문에 없습니다.","passage":TEXT})
}

fn completion(content: &Value) -> Value {
    json!({"choices":[{"finish_reason":"stop","message":{"refusal":null,"content":content.to_string()}}]})
}

async fn send(api: &str, body: &Value) -> reqwest::Response {
    reqwest::Client::new()
        .post(format!("{api}/api/ai/material"))
        .header("content-type", "application/json")
        .body(body.to_string())
        .send()
        .await
        .expect("call application")
}

#[tokio::test]
async fn generates_material_for_all_three_subjects_with_separate_source_data() {
    let captured = Arc::new(Mutex::new(Vec::<Value>::new()));
    let recorder = Arc::clone(&captured);
    let provider = serve(Router::new().route(
        "/v1/chat/completions",
        post(move |Json(payload): Json<Value>| {
            let recorder = Arc::clone(&recorder);
            async move {
                let data: Value = serde_json::from_str(
                    payload["messages"][1]["content"]
                        .as_str()
                        .expect("user data"),
                )
                .expect("source JSON");
                let mut questions = Vec::new();
                for index in 0..data["count"].as_u64().expect("count") {
                    let mut item = question(data["subject"].as_str().expect("subject"));
                    item["prompt"] = json!(format!(
                        "Question {index}: What does the student do every week?"
                    ));
                    questions.push(item);
                }
                recorder.lock().expect("record payload").push(payload);
                Json(completion(&json!({"questions":questions})))
            }
        }),
    ))
    .await;
    let app = api(&provider, Some(SECRET)).await;
    for subject in ["korean", "english", "math"] {
        let mut body = request(subject);
        body["count"] = json!(5);
        let response = send(&app, &body).await;
        assert_eq!(response.status(), reqwest::StatusCode::OK, "{subject}");
        let text = response.text().await.expect("response body");
        assert!(!text.contains(SECRET));
        let result: Value = serde_json::from_str(&text).expect("response JSON");
        let items = result["questions"].as_array().expect("questions");
        assert_eq!(items.len(), 5);
        for item in items {
            assert_eq!(item["subject"], subject);
            assert_eq!(item["passage"], TEXT);
            assert_eq!(item["options"][0], "Reads a book");
            assert_eq!(item["answer"], 0);
        }
    }
    let payloads = captured.lock().expect("captured payloads");
    assert_eq!(payloads.len(), 3);
    for payload in payloads.iter() {
        assert_eq!(payload["model"], "fixture-model");
        assert_eq!(payload["max_completion_tokens"], 10000);
        assert!(
            !payload["messages"][0]["content"]
                .as_str()
                .expect("system")
                .contains(TEXT)
        );
        let data: Value =
            serde_json::from_str(payload["messages"][1]["content"].as_str().expect("user"))
                .expect("input");
        assert_eq!(data["text"], TEXT);
        assert_eq!(data["topic"], "읽기");
        assert_eq!(data["difficulty"], "standard");
        assert_eq!(data["count"], 5);
        let schema = &payload["response_format"]["json_schema"];
        assert_eq!(schema["strict"], true);
        assert_eq!(schema["schema"]["additionalProperties"], false);
        let item = &schema["schema"]["properties"]["questions"]["items"];
        assert_eq!(item["additionalProperties"], false);
        assert!(
            item["required"]
                .as_array()
                .expect("required fields")
                .contains(&json!("passage"))
        );
        assert_eq!(item["properties"]["options"]["minItems"], 5);
    }
}

#[tokio::test]
async fn rejects_invalid_input_before_any_provider_request() {
    let calls = Arc::new(AtomicUsize::new(0));
    let counter = Arc::clone(&calls);
    let provider = serve(Router::new().route(
        "/v1/chat/completions",
        post(move || {
            let counter = Arc::clone(&counter);
            async move {
                counter.fetch_add(1, Ordering::SeqCst);
                Json(completion(&json!({"questions":[]})))
            }
        }),
    ))
    .await;
    let app = api(&provider, Some(SECRET)).await;
    for (field, value) in [
        ("subject", json!("discrete")),
        ("subject", json!("algorithms")),
        ("count", json!(0)),
        ("count", json!(6)),
        ("text", json!("too short")),
        ("text", json!("글".repeat(12001))),
        ("topic", json!("  ")),
        ("topic", json!("가".repeat(101))),
    ] {
        let mut body = request("korean");
        body[field] = value;
        assert_eq!(
            send(&app, &body).await.status(),
            reqwest::StatusCode::BAD_REQUEST,
            "{field}"
        );
    }
    assert_eq!(calls.load(Ordering::SeqCst), 0);
    let unconfigured = api(&provider, None).await;
    let response = send(&unconfigured, &request("math")).await;
    assert_eq!(response.status(), reqwest::StatusCode::SERVICE_UNAVAILABLE);
    assert!(!response.text().await.expect("error body").contains(SECRET));
    assert_eq!(calls.load(Ordering::SeqCst), 0);
}

#[tokio::test]
async fn rejects_malformed_provider_questions_and_count_mismatches() {
    let output = Arc::new(Mutex::new(json!({"questions":[question("english")]})));
    let fixture = Arc::clone(&output);
    let provider = serve(Router::new().route(
        "/v1/chat/completions",
        post(move || {
            let fixture = Arc::clone(&fixture);
            async move { Json(completion(&fixture.lock().expect("fixture output"))) }
        }),
    ))
    .await;
    let app = api(&provider, Some(SECRET)).await;
    for (field, value) in [
        ("subject", json!("math")),
        ("topic", json!("다른 주제")),
        ("explanation", json!(" \n ")),
        ("answer", json!(5)),
        ("options", json!(["same", "same", "C", "D", "E"])),
        ("passage", json!("x".repeat(12001))),
        ("passage", json!("  ")),
        ("prompt", json!("x".repeat(10001))),
    ] {
        let mut item = question("english");
        item[field] = value;
        *output.lock().expect("update fixture") = json!({"questions":[item]});
        assert_eq!(
            send(&app, &request("english")).await.status(),
            reqwest::StatusCode::BAD_GATEWAY,
            "{field}"
        );
    }
    *output.lock().expect("update fixture") =
        json!({"questions":[question("english"),question("english")]});
    assert_eq!(
        send(&app, &request("english")).await.status(),
        reqwest::StatusCode::BAD_GATEWAY
    );
    let mut two = request("english");
    two["count"] = json!(2);
    assert_eq!(
        send(&app, &two).await.status(),
        reqwest::StatusCode::BAD_GATEWAY
    );
    *output.lock().expect("update fixture") = json!({"questions":[]});
    assert_eq!(
        send(&app, &request("english")).await.status(),
        reqwest::StatusCode::UNPROCESSABLE_ENTITY
    );
}

#[tokio::test]
async fn accepts_null_passage_without_returning_a_null_field() {
    let provider = serve(Router::new().route(
        "/v1/chat/completions",
        post(|| async {
            let mut item = question("math");
            item["passage"] = Value::Null;
            Json(completion(&json!({"questions":[item]})))
        }),
    ))
    .await;
    let app = api(&provider, Some(SECRET)).await;
    let response = send(&app, &request("math")).await;
    assert_eq!(response.status(), reqwest::StatusCode::OK);
    let body: Value =
        serde_json::from_str(&response.text().await.expect("response text")).expect("JSON");
    assert!(body["questions"][0].get("passage").is_none());
}
