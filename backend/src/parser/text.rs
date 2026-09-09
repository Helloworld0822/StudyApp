use super::{Candidate, normalize};

pub(super) fn parse(text: &str) -> Vec<Candidate> {
    let mut parsed = Vec::new();
    let mut current: Option<TextQuestion> = None;
    for line in text.lines().map(str::trim).filter(|line| !line.is_empty()) {
        if let Some(prompt) = question_line(line) {
            finish(current.take(), &mut parsed);
            current = Some(TextQuestion::new(prompt));
        } else if let Some(question) = current.as_mut() {
            if let Some(answer) = directive(line, &["answer", "정답"]) {
                question.answer = Some(answer.to_owned());
            } else if let Some(explanation) = directive(line, &["explanation", "해설"]) {
                question.explanation.push(explanation.to_owned());
            } else if let Some((index, choice)) = option_line(line) {
                if index == question.options.len() && question.options.len() < 5 {
                    question.options.push(choice.to_owned());
                }
            } else if question.options.is_empty() {
                question.prompt.push(line.to_owned());
            } else if !question.explanation.is_empty() {
                question.explanation.push(line.to_owned());
            }
        }
    }
    finish(current, &mut parsed);
    parsed
}

struct TextQuestion {
    prompt: Vec<String>,
    options: Vec<String>,
    answer: Option<String>,
    explanation: Vec<String>,
}

impl TextQuestion {
    fn new(prompt: &str) -> Self {
        Self {
            prompt: vec![prompt.to_owned()],
            options: Vec::new(),
            answer: None,
            explanation: Vec::new(),
        }
    }
}

fn finish(question: Option<TextQuestion>, parsed: &mut Vec<Candidate>) {
    let Some(question) = question else { return };
    let Some(answer) = question.answer else {
        return;
    };
    parsed.push(Candidate {
        prompt: normalize(&question.prompt.join(" ")),
        choices: question.options,
        answer: normalize(&answer),
        explanation: normalize(&question.explanation.join(" ")),
    });
}

fn question_line(line: &str) -> Option<&str> {
    let candidate = line
        .strip_prefix("Question ")
        .or_else(|| line.strip_prefix("QUESTION "))
        .or_else(|| line.strip_prefix("Q. "))
        .unwrap_or(line);
    strip_number(candidate).or_else(|| (candidate.len() != line.len()).then_some(candidate.trim()))
}

fn strip_number(line: &str) -> Option<&str> {
    let digits = line.chars().take_while(char::is_ascii_digit).count();
    if digits == 0 {
        return None;
    }
    let suffix = line.get(digits..)?;
    let prompt = suffix
        .strip_prefix('.')
        .or_else(|| suffix.strip_prefix(')'))?
        .trim();
    (!prompt.is_empty()).then_some(prompt)
}

fn option_line(line: &str) -> Option<(usize, &str)> {
    let first = line.chars().next()?;
    let index = match first {
        'A' | 'a' | '①' => 0,
        'B' | 'b' | '②' => 1,
        'C' | 'c' | '③' => 2,
        'D' | 'd' | '④' => 3,
        'E' | 'e' | '⑤' => 4,
        _ => return None,
    };
    let suffix = line.get(first.len_utf8()..)?.trim_start();
    let choice = if matches!(first, '①' | '②' | '③' | '④' | '⑤') {
        suffix
    } else {
        suffix
            .strip_prefix('.')
            .or_else(|| suffix.strip_prefix(')'))
            .or_else(|| suffix.strip_prefix(':'))?
            .trim()
    };
    (!choice.is_empty()).then_some((index, choice))
}

fn directive<'a>(line: &'a str, names: &[&str]) -> Option<&'a str> {
    let lower = line.to_ascii_lowercase();
    let name = names.iter().find(|name| lower.starts_with(**name))?;
    let value = line.get(name.len()..)?.trim_start_matches([' ', ':', '：']);
    (!value.is_empty()).then_some(value)
}
