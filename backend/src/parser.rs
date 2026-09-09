use std::collections::HashSet;

use scraper::{Html, Selector};

use crate::types::{ImportedQuestion, Subject};

mod json_ld;
mod text;

const MAX_QUESTIONS: usize = 30;

pub fn source_title(html: &str) -> String {
    let document = Html::parse_document(html);
    Selector::parse("title")
        .ok()
        .and_then(|selector| document.select(&selector).next())
        .map(|element| normalize(&element.text().collect::<Vec<_>>().join(" ")))
        .unwrap_or_default()
}

pub fn parse_questions(html: &str, subject: Subject, source_url: &str) -> Vec<ImportedQuestion> {
    let document = Html::parse_document(html);
    let visible = visible_text(&document);
    let mut ids = HashSet::new();
    json_ld::parse(&document)
        .into_iter()
        .chain(text::parse(&visible))
        .filter_map(|candidate| finalize(candidate, subject, source_url))
        .filter(|question| ids.insert(question.id.clone()))
        .take(MAX_QUESTIONS)
        .collect()
}

pub(super) struct Candidate {
    prompt: String,
    choices: Vec<String>,
    answer: String,
    explanation: String,
}

fn finalize(candidate: Candidate, subject: Subject, source_url: &str) -> Option<ImportedQuestion> {
    let prompt = normalize(&candidate.prompt);
    let choices = candidate
        .choices
        .iter()
        .map(|choice| normalize(choice))
        .collect::<Vec<_>>();
    let distinct = choices.iter().collect::<HashSet<_>>();
    if prompt.is_empty()
        || choices.len() != 5
        || distinct.len() != 5
        || choices.iter().any(String::is_empty)
    {
        return None;
    }
    let options: [String; 5] = choices.try_into().ok()?;
    let answer = answer_index(&candidate.answer, &options)?;
    let id = stable_id(source_url, subject, &prompt, &options, answer);
    Some(ImportedQuestion {
        id,
        subject,
        topic: subject.import_topic().to_owned(),
        prompt,
        options,
        answer,
        explanation: normalize(&candidate.explanation),
        source_url: source_url.to_owned(),
    })
}

fn answer_index(answer: &str, options: &[String; 5]) -> Option<usize> {
    let answer = normalize(answer);
    options
        .iter()
        .position(|option| normalize(option) == answer)
        .or_else(|| marker_index(&answer))
        .filter(|index| *index < options.len())
}

fn marker_index(value: &str) -> Option<usize> {
    let mut marker = value.trim().trim_matches(['(', ')', '[', ']', '.']).chars();
    let first = marker.next()?;
    if marker.next().is_some() {
        return None;
    }
    match first {
        'A' | 'a' | '①' | '1' => Some(0),
        'B' | 'b' | '②' | '2' => Some(1),
        'C' | 'c' | '③' | '3' => Some(2),
        'D' | 'd' | '④' | '4' => Some(3),
        'E' | 'e' | '⑤' | '5' => Some(4),
        _ => None,
    }
}

fn stable_id(
    source_url: &str,
    subject: Subject,
    prompt: &str,
    options: &[String; 5],
    answer: usize,
) -> String {
    let mut hash = 0xcbf2_9ce4_8422_2325_u64;
    for part in [source_url, subject.as_str(), prompt]
        .into_iter()
        .chain(options.iter().map(String::as_str))
        .chain(std::iter::once(match answer {
            0 => "0",
            1 => "1",
            2 => "2",
            3 => "3",
            4 => "4",
            _ => return String::new(),
        }))
    {
        for byte in part.bytes().chain(std::iter::once(0)) {
            hash ^= u64::from(byte);
            hash = hash.wrapping_mul(0x0000_0100_0000_01b3);
        }
    }
    format!("import-{hash:016x}")
}

fn visible_text(document: &Html) -> String {
    let text = Selector::parse("body")
        .ok()
        .and_then(|selector| document.select(&selector).next())
        .map(|body| body.text().collect::<Vec<_>>().join("\n"))
        .unwrap_or_else(|| {
            document
                .root_element()
                .text()
                .collect::<Vec<_>>()
                .join("\n")
        });
    text.lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .collect::<Vec<_>>()
        .join("\n")
}

pub(super) fn normalize(text: &str) -> String {
    text.split_whitespace().collect::<Vec<_>>().join(" ")
}

#[cfg(test)]
mod tests;
