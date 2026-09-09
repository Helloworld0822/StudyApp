use scraper::{Html, Selector};
use serde_json::{Map, Value};

use super::{Candidate, normalize};

pub(super) fn parse(document: &Html) -> Vec<Candidate> {
    let mut questions = Vec::new();
    let Ok(selector) = Selector::parse("script[type='application/ld+json']") else {
        return questions;
    };
    for element in document.select(&selector) {
        let raw = element.text().collect::<Vec<_>>().join("");
        if let Ok(value) = serde_json::from_str::<Value>(&raw) {
            collect(&value, &mut questions);
        }
    }
    questions
}

fn collect(value: &Value, questions: &mut Vec<Candidate>) {
    match value {
        Value::Array(values) => values.iter().for_each(|child| collect(child, questions)),
        Value::Object(object) => {
            if has_type(object.get("@type"), "Question")
                && let Some(candidate) = question(object)
            {
                questions.push(candidate);
            }
            object.values().for_each(|child| collect(child, questions));
        }
        Value::Null | Value::Bool(_) | Value::Number(_) | Value::String(_) => {}
    }
}

fn question(object: &Map<String, Value>) -> Option<Candidate> {
    let prompt = object
        .get("text")
        .or_else(|| object.get("name"))
        .and_then(text)
        .map(normalize)?;
    let accepted = answers(object.get("acceptedAnswer")?);
    let answer = accepted.first()?.clone();
    if accepted
        .iter()
        .any(|value| normalize(value) != normalize(&answer))
    {
        return None;
    }
    let mut choices = object
        .get("suggestedAnswer")
        .map(answers)
        .unwrap_or_default();
    if !choices
        .iter()
        .any(|choice| normalize(choice) == normalize(&answer))
    {
        choices.push(answer.clone());
    }
    Some(Candidate {
        prompt,
        choices,
        answer,
        explanation: object
            .get("acceptedAnswer")
            .and_then(first_answer_object)
            .and_then(|answer| answer.get("comment").or_else(|| answer.get("explanation")))
            .and_then(text)
            .map(normalize)
            .unwrap_or_default(),
    })
}

fn answers(value: &Value) -> Vec<String> {
    match value {
        Value::Array(values) => values.iter().filter_map(text).map(normalize).collect(),
        Value::String(_) | Value::Object(_) => text(value).map(normalize).into_iter().collect(),
        Value::Null | Value::Bool(_) | Value::Number(_) => Vec::new(),
    }
}

fn first_answer_object(value: &Value) -> Option<&Map<String, Value>> {
    match value {
        Value::Object(object) => Some(object),
        Value::Array(values) => values.first().and_then(Value::as_object),
        Value::Null | Value::Bool(_) | Value::Number(_) | Value::String(_) => None,
    }
}

fn text(value: &Value) -> Option<&str> {
    match value {
        Value::String(value) => Some(value),
        Value::Object(object) => object
            .get("text")
            .or_else(|| object.get("name"))
            .and_then(Value::as_str),
        Value::Null | Value::Bool(_) | Value::Number(_) | Value::Array(_) => None,
    }
}

fn has_type(value: Option<&Value>, expected: &str) -> bool {
    match value {
        Some(Value::String(value)) => value.eq_ignore_ascii_case(expected),
        Some(Value::Array(values)) => values.iter().any(|value| {
            value
                .as_str()
                .is_some_and(|value| value.eq_ignore_ascii_case(expected))
        }),
        Some(Value::Null | Value::Bool(_) | Value::Number(_) | Value::Object(_)) | None => false,
    }
}
