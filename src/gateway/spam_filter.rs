// @locs-version: 1.0
// @module-id: gateway.spam-filter
// @primary-capability: inbound-message-spam-classification
// @stability: beta

use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;

const DEFAULT_THRESHOLD: f32 = 5.0;
const SPAMC_VERSION: &str = "SPAMC/1.5";
const CONNECT_TIMEOUT_SECS: u64 = 3;
const READ_TIMEOUT_SECS: u64 = 10;

/// Result of a SpamAssassin scan.
pub struct SpamResult {
    pub is_spam: bool,
    pub score: f32,
    pub threshold: f32,
}

/// Check a raw MIME email against SpamAssassin via the SPAMC protocol.
///
/// Returns `Ok(None)` when the SpamAssassin host is not configured so the
/// caller can proceed without spam filtering rather than hard-failing.
pub async fn check_spam(raw_email: &[u8]) -> Result<Option<SpamResult>, String> {
    let host = match std::env::var("SPAMASSASSIN_HOST") {
        Ok(h) if !h.trim().is_empty() => h,
        _ => return Ok(None),
    };

    let threshold: f32 = std::env::var("SPAM_THRESHOLD")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(DEFAULT_THRESHOLD);

    let addr = if host.contains(':') {
        host.clone()
    } else {
        format!("{host}:783")
    };

    let stream = tokio::time::timeout(
        std::time::Duration::from_secs(CONNECT_TIMEOUT_SECS),
        TcpStream::connect(&addr),
    )
    .await
    .map_err(|_| format!("SpamAssassin connect timeout to {addr}"))?
    .map_err(|e| format!("SpamAssassin connect error: {e}"))?;

    let result = run_spamc(stream, raw_email, threshold).await?;
    Ok(Some(result))
}

async fn run_spamc(
    mut stream: TcpStream,
    raw_email: &[u8],
    threshold: f32,
) -> Result<SpamResult, String> {
    // SPAMC request: "CHECK SPAMC/1.5\r\nContent-length: <n>\r\n\r\n<email>"
    let request = format!(
        "CHECK {SPAMC_VERSION}\r\nContent-length: {}\r\n\r\n",
        raw_email.len()
    );
    stream
        .write_all(request.as_bytes())
        .await
        .map_err(|e| format!("SpamAssassin write error: {e}"))?;
    stream
        .write_all(raw_email)
        .await
        .map_err(|e| format!("SpamAssassin write error: {e}"))?;
    stream
        .shutdown()
        .await
        .map_err(|e| format!("SpamAssassin shutdown error: {e}"))?;

    // Read response with timeout
    let mut response = String::new();
    tokio::time::timeout(
        std::time::Duration::from_secs(READ_TIMEOUT_SECS),
        stream.read_to_string(&mut response),
    )
    .await
    .map_err(|_| "SpamAssassin read timeout".to_string())?
    .map_err(|e| format!("SpamAssassin read error: {e}"))?;

    parse_spamd_response(&response, threshold)
}

/// Parse a SPAMD CHECK response, e.g.:
///   SPAMD/1.1 0 EX_OK\r\n
///   Spam: True ; 8.5 / 5.0\r\n
fn parse_spamd_response(response: &str, threshold: f32) -> Result<SpamResult, String> {
    // Find the "Spam:" header line
    let spam_line = response
        .lines()
        .find(|line| line.starts_with("Spam:"))
        .ok_or_else(|| format!("No 'Spam:' line in SPAMD response: {response}"))?;

    // Format: "Spam: True ; 8.5 / 5.0"
    let after_colon = spam_line.strip_prefix("Spam:").unwrap_or("").trim();

    let mut parts = after_colon.splitn(2, ';');
    let is_spam_str = parts.next().unwrap_or("").trim().to_ascii_lowercase();
    let scores_str = parts.next().unwrap_or("").trim();

    let is_spam = is_spam_str == "true" || is_spam_str == "yes";

    // Parse "8.5 / 5.0" — take the left side as the score
    let score: f32 = scores_str
        .split('/')
        .next()
        .and_then(|s| s.trim().parse().ok())
        .unwrap_or(0.0);

    Ok(SpamResult {
        is_spam: is_spam || score >= threshold,
        score,
        threshold,
    })
}

#[cfg(test)]
mod tests {
    use super::parse_spamd_response;

    #[test]
    fn parses_spam_true_response() {
        let response = "SPAMD/1.1 0 EX_OK\r\nSpam: True ; 8.5 / 5.0\r\n\r\n";
        let result = parse_spamd_response(response, 5.0).unwrap();
        assert!(result.is_spam);
        assert!((result.score - 8.5).abs() < 0.01);
    }

    #[test]
    fn parses_spam_false_response() {
        let response = "SPAMD/1.1 0 EX_OK\r\nSpam: False ; 1.2 / 5.0\r\n\r\n";
        let result = parse_spamd_response(response, 5.0).unwrap();
        assert!(!result.is_spam);
        assert!((result.score - 1.2).abs() < 0.01);
    }

    #[test]
    fn threshold_override_catches_borderline_score() {
        let response = "SPAMD/1.1 0 EX_OK\r\nSpam: False ; 4.9 / 5.0\r\n\r\n";
        // Lower threshold to 3.0 — should trip even though SPAMD said "False"
        let result = parse_spamd_response(response, 3.0).unwrap();
        assert!(result.is_spam);
    }
}
