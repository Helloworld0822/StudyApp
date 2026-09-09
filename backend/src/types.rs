use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Subject {
    Math,
    English,
    Korean,
    Discrete,
    Algorithms,
}

impl Subject {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Math => "math",
            Self::English => "english",
            Self::Korean => "korean",
            Self::Discrete => "discrete",
            Self::Algorithms => "algorithms",
        }
    }

    pub const fn import_topic(self) -> &'static str {
        match self {
            Self::Math => "수학 · 웹 가져오기",
            Self::English => "영어 · 웹 가져오기",
            Self::Korean => "국어 · 웹 가져오기",
            Self::Discrete => "이산수학 · 웹 가져오기",
            Self::Algorithms => "알고리즘 · 웹 가져오기",
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ImportRequest {
    pub url: String,
    pub subject: Subject,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportedQuestion {
    pub id: String,
    pub subject: Subject,
    pub topic: String,
    pub prompt: String,
    pub options: [String; 5],
    pub answer: usize,
    pub explanation: String,
    pub source_url: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportResponse {
    pub source_url: String,
    pub source_title: String,
    pub questions: Vec<ImportedQuestion>,
    pub warnings: Vec<String>,
}
