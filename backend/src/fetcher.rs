use std::time::Duration;

use encoding_rs::Encoding;
use reqwest::{Client, Response, StatusCode, Url, header};

use crate::{
    error::ImportError,
    url_guard::{parse_public_url, resolve_public},
};

mod robots;

const MAX_BYTES: usize = 1_048_576;
const MAX_REDIRECTS: usize = 5;

pub struct FetchedPage {
    pub url: Url,
    pub html: String,
}

pub async fn fetch_page(raw_url: &str) -> Result<FetchedPage, ImportError> {
    let initial = parse_public_url(raw_url)?;
    let (url, response) = fetch_response(initial, true).await?;
    let content_type = response
        .headers()
        .get(header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .unwrap_or_default()
        .to_owned();
    if !content_type.to_ascii_lowercase().starts_with("text/html") {
        return Err(ImportError::NotHtml);
    }
    let charset = content_type
        .split(';')
        .find_map(|part| part.trim().strip_prefix("charset=").map(str::to_owned));
    let bytes = response_bytes(response).await?;
    let html = decode_html(&bytes, charset.as_deref());
    Ok(FetchedPage { url, html })
}

async fn fetch_response(mut url: Url, check_robots: bool) -> Result<(Url, Response), ImportError> {
    for redirect in 0..=MAX_REDIRECTS {
        let addresses = resolve_public(&url).await?;
        if check_robots && !robots_allowed(&url, &addresses).await? {
            return Err(ImportError::RobotsDenied);
        }
        let host = url.host_str().ok_or(ImportError::InvalidUrl)?;
        let client = Client::builder()
            .https_only(true)
            .no_proxy()
            .redirect(reqwest::redirect::Policy::none())
            .resolve_to_addrs(host, &addresses)
            .user_agent("StudyAppBot/1.0")
            .connect_timeout(Duration::from_secs(5))
            .build()
            .map_err(|_| ImportError::Request)?;
        let response = client
            .get(url.clone())
            .send()
            .await
            .map_err(|_| ImportError::Request)?;
        if !response.status().is_redirection() {
            if !response.status().is_success() {
                return Err(ImportError::Request);
            }
            return Ok((url, response));
        }
        if redirect == MAX_REDIRECTS {
            return Err(ImportError::RedirectLimit);
        }
        let location = response
            .headers()
            .get(header::LOCATION)
            .and_then(|value| value.to_str().ok())
            .ok_or(ImportError::Request)?;
        url = url.join(location).map_err(|_| ImportError::InvalidUrl)?;
        url = parse_public_url(url.as_str())?;
    }
    Err(ImportError::RedirectLimit)
}

async fn robots_allowed(
    url: &Url,
    addresses: &[std::net::SocketAddr],
) -> Result<bool, ImportError> {
    let mut robots_url = url.clone();
    robots_url.set_path("/robots.txt");
    let host = robots_url.host_str().ok_or(ImportError::InvalidUrl)?;
    let client = Client::builder()
        .https_only(true)
        .no_proxy()
        .redirect(reqwest::redirect::Policy::none())
        .resolve_to_addrs(host, addresses)
        .user_agent("StudyAppBot/1.0")
        .connect_timeout(Duration::from_secs(5))
        .build()
        .map_err(|_| ImportError::Request)?;
    let response = client
        .get(robots_url)
        .send()
        .await
        .map_err(|_| ImportError::Request)?;
    if response.status() == StatusCode::NOT_FOUND {
        return Ok(true);
    }
    if !response.status().is_success() {
        return Err(ImportError::Request);
    }
    let body = response_bytes(response).await?;
    let target = match url.query() {
        Some(query) => format!("{}?{query}", url.path()),
        None => url.path().to_owned(),
    };
    Ok(!robots::blocks(&String::from_utf8_lossy(&body), &target))
}

async fn response_bytes(mut response: Response) -> Result<Vec<u8>, ImportError> {
    if response
        .content_length()
        .is_some_and(|length| length as usize > MAX_BYTES)
    {
        return Err(ImportError::ResponseTooLarge);
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|_| ImportError::Request)? {
        if bytes.len() + chunk.len() > MAX_BYTES {
            return Err(ImportError::ResponseTooLarge);
        }
        bytes.extend_from_slice(&chunk);
    }
    Ok(bytes)
}

fn decode_html(bytes: &[u8], charset: Option<&str>) -> String {
    let encoding = charset
        .and_then(|name| Encoding::for_label(name.as_bytes()))
        .unwrap_or(encoding_rs::UTF_8);
    encoding.decode(bytes).0.into_owned()
}

#[cfg(test)]
mod tests;
