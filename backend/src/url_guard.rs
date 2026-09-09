use std::net::{IpAddr, SocketAddr};

use reqwest::Url;

use crate::error::ImportError;

pub fn parse_public_url(raw: &str) -> Result<Url, ImportError> {
    let url = Url::parse(raw).map_err(|_| ImportError::InvalidUrl)?;
    if url.scheme() != "https"
        || !url.username().is_empty()
        || url.password().is_some()
        || url.fragment().is_some()
        || url.port().is_some_and(|port| port != 443)
        || url.host_str().is_none()
    {
        return Err(ImportError::InvalidUrl);
    }
    let host = url
        .host_str()
        .ok_or(ImportError::InvalidUrl)?
        .trim_end_matches('.');
    if host.eq_ignore_ascii_case("gutenberg.org")
        || host.to_ascii_lowercase().ends_with(".gutenberg.org")
    {
        return Err(ImportError::GutenbergDenied);
    }
    Ok(url)
}

pub async fn resolve_public(url: &Url) -> Result<Vec<SocketAddr>, ImportError> {
    let host = url.host_str().ok_or(ImportError::InvalidUrl)?;
    let addresses = match host.parse::<IpAddr>() {
        Ok(ip) => vec![SocketAddr::new(ip, 443)],
        Err(_) => tokio::net::lookup_host((host, 443))
            .await
            .map_err(|_| ImportError::Dns)?
            .collect::<Vec<_>>(),
    };
    if addresses.is_empty() || addresses.iter().any(|address| !is_public_ip(address.ip())) {
        return Err(ImportError::BlockedAddress);
    }
    Ok(addresses)
}

pub fn is_public_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(ipv4) => is_public_ipv4(ipv4.octets()),
        IpAddr::V6(ipv6) => match ipv6.to_ipv4_mapped() {
            Some(mapped) => is_public_ipv4(mapped.octets()),
            None => is_public_ipv6(ipv6.segments()),
        },
    }
}

const fn is_public_ipv4(octets: [u8; 4]) -> bool {
    let [a, b, c, d] = octets;
    !matches!(
        (a, b, c, d),
        (0, _, _, _)
            | (10, _, _, _)
            | (100, 64..=127, _, _)
            | (127, _, _, _)
            | (169, 254, _, _)
            | (172, 16..=31, _, _)
            | (192, 0, 0, 0..=8 | 11..=255)
            | (192, 0, 2, _)
            | (192, 88, 99, _)
            | (192, 168, _, _)
            | (198, 18..=19, _, _)
            | (198, 51, 100, _)
            | (203, 0, 113, _)
            | (224..=255, _, _, _)
    )
}

const fn is_public_ipv6(segments: [u16; 8]) -> bool {
    let [a, b, c, d, e, f, g, h] = segments;
    if a < 0x2000 || a > 0x3fff || (a == 0x2001 && b == 0x0db8) {
        return false;
    }
    !matches!(
        (a, b, c, d, e, f, g, h),
        (0, 0, 0, 0, 0, 0, 0, 0..=1)
            | (0x0100, 0, 0, 0, _, _, _, _)
            | (0x2001, 0x0000..=0x01ff, _, _, _, _, _, _)
            | (0x2002, _, _, _, _, _, _, _)
            | (0x3fff, 0x0000..=0x0fff, _, _, _, _, _, _)
            | (0xfc00..=0xfdff, _, _, _, _, _, _, _)
            | (0xfe80..=0xfebf, _, _, _, _, _, _, _)
            | (0xfec0..=0xfeff, _, _, _, _, _, _, _)
            | (0xff00..=0xffff, _, _, _, _, _, _, _)
    )
}

#[cfg(test)]
mod tests {
    use std::net::{IpAddr, Ipv4Addr, Ipv6Addr};

    use super::{is_public_ip, parse_public_url};

    #[test]
    fn rejects_documentation_and_non_global_ipv6() {
        for address in ["2001:db8::1", "::2", "64:ff9b:1::a00:1"] {
            assert!(!is_public_ip(address.parse().expect("valid test IP")));
        }
        assert!(is_public_ip(
            "2606:4700:4700::1111".parse().expect("public test IP")
        ));
    }

    #[test]
    fn rejects_private_and_mapped_private_addresses() {
        // Given: private IPv4 and an IPv4-mapped IPv6 address.
        let private = IpAddr::V4(Ipv4Addr::new(10, 0, 0, 1));
        let mapped = IpAddr::V6(Ipv6Addr::new(0, 0, 0, 0, 0, 0xffff, 0x7f00, 1));

        // When: destinations are checked before an outbound request.
        let private_allowed = is_public_ip(private);
        let mapped_allowed = is_public_ip(mapped);

        // Then: neither address can be fetched.
        assert!(!private_allowed);
        assert!(!mapped_allowed);
    }

    #[test]
    fn rejects_http_credentials_and_fragments() {
        // Given: URLs that would weaken the outbound request boundary.
        let http = "http://example.com/questions";
        let credentials = "https://user:pass@example.com/questions";
        let fragment = "https://example.com/questions#answer";

        // When: each value is parsed as an import source URL.
        let results = [http, credentials, fragment].map(parse_public_url);

        // Then: no unsafe form reaches the fetcher.
        assert!(results.iter().all(Result::is_err));
    }

    #[test]
    fn rejects_reserved_ranges_and_gutenberg_pages() {
        // Given: reserved destinations and a normal Project Gutenberg page.
        let reserved = [
            IpAddr::V4(Ipv4Addr::new(192, 88, 99, 1)),
            IpAddr::V4(Ipv4Addr::new(233, 252, 0, 1)),
            IpAddr::V6(Ipv6Addr::new(0x2001, 0x20, 0, 0, 0, 0, 0, 1)),
        ];

        // When: addresses and source policy are checked.
        let gutenberg = parse_public_url("https://www.gutenberg.org/ebooks/84");

        // Then: no reserved or prohibited normal-page crawl is allowed.
        assert!(reserved.into_iter().all(|ip| !is_public_ip(ip)));
        assert!(gutenberg.is_err());
    }
}
