use super::parse_questions;
use crate::types::Subject;

#[test]
fn rejects_unmatched_answer_words_and_empty_choices() {
    let unknown =
        "<body>1. Pick\nA. one\nB. two\nC. three\nD. four\nE. five\nAnswer: Banana</body>";
    let empty = r#"<script type="application/ld+json">{"@type":"Question","text":"Pick","suggestedAnswer":["one","two","three","four"," "],"acceptedAnswer":"one"}</script>"#;
    for html in [unknown, empty] {
        assert!(parse_questions(html, Subject::Math, "https://example.org/q").is_empty());
    }
}

#[test]
fn extracts_five_circled_choices_and_explanation_when_numbered() {
    // Given: a visible numbered question with five distinct published choices.
    let html = "<body><p>1. 2 + 3은?</p><p>① 1</p><p>② 2</p><p>③ 3</p><p>④ 4</p><p>⑤ 5</p><p>정답: ⑤</p><p>해설: 2 + 3 = 5입니다.</p></body>";

    // When: the page is parsed.
    let questions = parse_questions(html, Subject::Math, "https://example.com/a");

    // Then: the fifth answer, explanation, and non-empty topic are preserved.
    assert_eq!(questions.len(), 1);
    assert_eq!(questions[0].answer, 4);
    assert_eq!(questions[0].explanation, "2 + 3 = 5입니다.");
    assert!(!questions[0].topic.is_empty());
}

#[test]
fn answer_directive_is_not_misread_as_option_a() {
    // Given: a lettered question whose answer line begins with A.
    let html =
        "<body>Question 1. Pick E\nA. one\nB. two\nC. three\nD. four\nE. five\nAnswer: E</body>";

    // When: visible text is parsed.
    let questions = parse_questions(html, Subject::English, "https://example.com/b");

    // Then: Answer selects E rather than becoming another option.
    assert_eq!(questions.len(), 1);
    assert_eq!(questions[0].answer, 4);
}

#[test]
fn includes_accepted_json_ld_answer_when_suggestions_exclude_it() {
    // Given: schema.org keeps the correct answer separate from four distractors.
    let html = r#"<script type="application/ld+json">{"@type":"Question","name":"Pick five","suggestedAnswer":[{"text":"one"},{"text":"two"},{"text":"three"},{"text":"four"}],"acceptedAnswer":{"@type":"Answer","text":"five","comment":"Because it is five."}}</script>"#;

    // When: JSON-LD is imported.
    let questions = parse_questions(html, Subject::Discrete, "https://example.com/c");

    // Then: the accepted answer is included exactly once and indexed correctly.
    assert_eq!(questions.len(), 1);
    assert_eq!(
        questions[0].options,
        ["one", "two", "three", "four", "five"]
    );
    assert_eq!(questions[0].answer, 4);
    assert_eq!(questions[0].explanation, "Because it is five.");
}

#[test]
fn rejects_duplicate_or_non_five_choice_questions() {
    // Given: explicit answers attached to invalid choice sets.
    let duplicate = "<body>1. Pick\nA. x\nB. y\nC. z\nD. z\nE. q\nAnswer: A</body>";
    let four = "<body>1. Pick\nA. w\nB. x\nC. y\nD. z\nAnswer: A</body>";

    // When: both pages are parsed.
    let results = [duplicate, four]
        .map(|html| parse_questions(html, Subject::Algorithms, "https://example.com/invalid"));

    // Then: neither malformed question is imported.
    assert!(results.iter().all(Vec::is_empty));
}

#[test]
fn stable_id_depends_on_source_subject_and_contents() {
    // Given: the same valid question is available from two source URLs.
    let html = "<body>1. Pick\nA. one\nB. two\nC. three\nD. four\nE. five\nAnswer: A</body>";

    // When: imports are repeated and one source coordinate changes.
    let first = parse_questions(html, Subject::Korean, "https://example.com/one");
    let repeated = parse_questions(html, Subject::Korean, "https://example.com/one");
    let other_source = parse_questions(html, Subject::Korean, "https://example.com/two");

    // Then: identical inputs are stable while different pages cannot collide.
    assert_eq!(first[0].id, repeated[0].id);
    assert_ne!(first[0].id, other_source[0].id);
}
