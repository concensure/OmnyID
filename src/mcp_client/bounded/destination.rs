//! Trusted operator-reviewed endpoints. Never construct from model/user arguments.
use super::{CallFailure, rejected};
use std::net::{IpAddr, Ipv4Addr, SocketAddr};

// No Debug/Serialize: endpoint paths may be private.
pub struct PinnedMcpTarget {
    endpoint: String,
    host: String,
    addresses: Vec<SocketAddr>,
}
impl PinnedMcpTarget {
    /// Explicit HTTPS destination and reviewed public IPv4 addresses. No DNS lookup
    /// is performed by the HTTP client; TLS still verifies the original hostname.
    pub fn https(endpoint: &str, addresses: Vec<Ipv4Addr>) -> Result<Self, CallFailure> {
        let url = parse(endpoint)?;
        if url.scheme() != "https"
            || addresses.is_empty()
            || addresses.len() > 8
            || addresses.iter().any(|ip| !public_ipv4(*ip))
        {
            return Err(rejected("tool_destination_denied"));
        }
        if let Ok(ip) = url.host_str().unwrap_or("").parse::<IpAddr>() {
            if addresses.len() != 1 || ip != IpAddr::V4(addresses[0]) {
                return Err(rejected("tool_destination_denied"));
            }
        }
        if url.host_str().is_some_and(|h| h.contains(':')) {
            return Err(rejected("tool_destination_denied"));
        }
        let port = url
            .port_or_known_default()
            .ok_or_else(|| rejected("tool_destination_denied"))?;
        Ok(Self {
            endpoint: endpoint.into(),
            host: url.host_str().unwrap().into(),
            addresses: addresses
                .into_iter()
                .map(|ip| SocketAddr::new(IpAddr::V4(ip), port))
                .collect(),
        })
    }
    /// Explicit local sandbox only. Literal IPv4 loopback prevents DNS and routing
    /// to any other address. Never use this constructor for an external provider.
    pub fn loopback_sandbox(endpoint: &str) -> Result<Self, CallFailure> {
        let url = parse(endpoint)?;
        let ip = url
            .host_str()
            .and_then(|s| s.parse::<Ipv4Addr>().ok())
            .filter(Ipv4Addr::is_loopback)
            .ok_or_else(|| rejected("tool_destination_denied"))?;
        if url.scheme() != "http" {
            return Err(rejected("tool_destination_denied"));
        }
        let port = url
            .port_or_known_default()
            .ok_or_else(|| rejected("tool_destination_denied"))?;
        Ok(Self {
            endpoint: endpoint.into(),
            host: ip.to_string(),
            addresses: vec![SocketAddr::new(IpAddr::V4(ip), port)],
        })
    }
    pub fn endpoint(&self) -> &str {
        &self.endpoint
    }
    pub(super) fn pin(&self, builder: reqwest::ClientBuilder) -> reqwest::ClientBuilder {
        builder.resolve_to_addrs(&self.host, &self.addresses)
    }
}
fn parse(endpoint: &str) -> Result<reqwest::Url, CallFailure> {
    let url = reqwest::Url::parse(endpoint).map_err(|_| rejected("tool_destination_denied"))?;
    if endpoint.len() > 2048
        || url.host_str().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
        || url.host_str().is_some_and(|h| h.ends_with('.'))
    {
        return Err(rejected("tool_destination_denied"));
    }
    Ok(url)
}
fn public_ipv4(ip: Ipv4Addr) -> bool {
    let [a, b, c, _] = ip.octets();
    !(matches!(a, 0 | 10 | 127)
        || a >= 224
        || (a == 100 && (64..=127).contains(&b))
        || (a == 169 && b == 254)
        || (a == 172 && (16..=31).contains(&b))
        || (a == 192 && (b == 0 || b == 168 || (b == 88 && c == 99)))
        || (a == 198 && (b == 18 || b == 19 || (b == 51 && c == 100)))
        || (a == 203 && b == 0 && c == 113))
}
