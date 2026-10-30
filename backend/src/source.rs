use std::time::Duration;

use axum::Json;
use scraper::{Html, Selector};
use serde::{Deserialize, Serialize};

use crate::{error::ImportError, fetcher, parser};

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SourceRequest {
    url: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceResponse {
    text: String,
    source_url: String,
    source_title: String,
}

pub async fn import_material(
    Json(request): Json<SourceRequest>,
) -> Result<Json<SourceResponse>, ImportError> {
    let page = tokio::time::timeout(Duration::from_secs(12), fetcher::fetch_page(&request.url))
        .await
        .map_err(|_| ImportError::Request)??;
    let text = extract(&page.html);
    if !(20..=12000).contains(&text.chars().count()) {
        return Err(ImportError::MaterialUnsupported);
    }
    Ok(Json(SourceResponse {
        text,
        source_url: page.url.to_string(),
        source_title: parser::source_title(&page.html).chars().take(200).collect(),
    }))
}

fn extract(html: &str) -> String {
    let document = Html::parse_document(html);
    let root = ["main", "article", "body"].iter().find_map(|tag| {
        Selector::parse(tag)
            .ok()
            .and_then(|selector| document.select(&selector).next())
    });
    let Some(root) = root else {
        return String::new();
    };
    let mut lines = Vec::new();
    for node in root.descendants() {
        if let scraper::node::Node::Text(text) = node.value() {
            let hidden = node
                .ancestors()
                .filter_map(scraper::ElementRef::wrap)
                .any(|element| {
                    matches!(
                        element.value().name(),
                        "script" | "style" | "nav" | "footer" | "header" | "noscript" | "template"
                    ) || element.value().attr("hidden").is_some()
                        || element.value().attr("aria-hidden") == Some("true")
                });
            if !hidden {
                let line = text.split_whitespace().collect::<Vec<_>>().join(" ");
                if !line.is_empty() {
                    lines.push(line);
                }
            }
        }
    }
    lines.join("\n")
}

#[cfg(test)]
mod tests {
    #[test]
    fn extracts_article_without_navigation_or_instructions_in_scripts() {
        let text = super::extract(
            "<body><nav>메뉴</nav><main><p>공부할 본문입니다.</p><script>bad()</script><div hidden>숨김</div><style>css</style><p>두 번째 문장입니다.</p></main></body>",
        );
        assert_eq!(text, "공부할 본문입니다.\n두 번째 문장입니다.");
    }
}
