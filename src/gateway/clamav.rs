// @locs-version: 1.0
// @module-id: gateway.clamav
// @primary-capability: uploaded-file-malware-scan
// @stability: beta

use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;

const CONNECT_TIMEOUT_SECS: u64 = 3;
const READ_TIMEOUT_SECS: u64 = 30;
const CHUNK_SIZE: usize = 2048;

#[derive(Debug)]
pub struct ScanResult {
    pub is_infected: bool,
    pub virus_name: Option<String>,
}

/// Scan raw bytes with ClamAV via the clamd INSTREAM protocol.
///
/// Returns `Ok(None)` when `CLAMD_HOST` is not set, letting the caller proceed
/// without AV scanning rather than hard-failing in environments where ClamAV
/// is not deployed.
pub async fn scan_bytes(data: &[u8]) -> Result<Option<ScanResult>, String> {
    let host = match std::env::var("CLAMD_HOST") {
        Ok(h) if !h.trim().is_empty() => h,
        _ => return Ok(None),
    };

    let addr = if host.contains(':') {
        host.clone()
    } else {
        format!("{host}:3310")
    };

    let stream = tokio::time::timeout(
        std::time::Duration::from_secs(CONNECT_TIMEOUT_SECS),
        TcpStream::connect(&addr),
    )
    .await
    .map_err(|_| format!("ClamAV connect timeout to {addr}"))?
    .map_err(|e| format!("ClamAV connect error: {e}"))?;

    let result = run_instream(stream, data).await?;
    Ok(Some(result))
}

async fn run_instream(mut stream: TcpStream, data: &[u8]) -> Result<ScanResult, String> {
    // clamd INSTREAM command: "nINSTREAM\n" + chunks of [u32be length][bytes] + [u32be 0]
    stream
        .write_all(b"nINSTREAM\n")
        .await
        .map_err(|e| format!("ClamAV write error: {e}"))?;

    for chunk in data.chunks(CHUNK_SIZE) {
        let len = (chunk.len() as u32).to_be_bytes();
        stream
            .write_all(&len)
            .await
            .map_err(|e| format!("ClamAV write error: {e}"))?;
        stream
            .write_all(chunk)
            .await
            .map_err(|e| format!("ClamAV write error: {e}"))?;
    }
    // Terminate the stream with a zero-length chunk
    stream
        .write_all(&[0u8; 4])
        .await
        .map_err(|e| format!("ClamAV terminator write error: {e}"))?;
    stream
        .flush()
        .await
        .map_err(|e| format!("ClamAV flush error: {e}"))?;

    // Read response with timeout: "stream: OK\n" or "stream: <VIRUS> FOUND\n"
    let mut response = String::new();
    tokio::time::timeout(
        std::time::Duration::from_secs(READ_TIMEOUT_SECS),
        stream.read_to_string(&mut response),
    )
    .await
    .map_err(|_| "ClamAV read timeout".to_string())?
    .map_err(|e| format!("ClamAV read error: {e}"))?;

    parse_clamd_response(&response)
}

fn parse_clamd_response(response: &str) -> Result<ScanResult, String> {
    let line = response.lines().next().unwrap_or("").trim();

    if line.ends_with("OK") {
        return Ok(ScanResult {
            is_infected: false,
            virus_name: None,
        });
    }

    if line.ends_with("FOUND") {
        // Format: "stream: Win.Trojan.Agent FOUND"
        let virus_name = line
            .strip_prefix("stream:")
            .unwrap_or(line)
            .trim()
            .strip_suffix("FOUND")
            .unwrap_or("")
            .trim()
            .to_string();
        return Ok(ScanResult {
            is_infected: true,
            virus_name: Some(virus_name),
        });
    }

    if line.ends_with("ERROR") {
        return Err(format!("ClamAV scan error: {line}"));
    }

    Err(format!("Unexpected ClamAV response: {line}"))
}

#[cfg(test)]
mod tests {
    use super::parse_clamd_response;

    #[test]
    fn parses_clean_response() {
        let result = parse_clamd_response("stream: OK\n").unwrap();
        assert!(!result.is_infected);
        assert!(result.virus_name.is_none());
    }

    #[test]
    fn parses_infected_response() {
        let result = parse_clamd_response("stream: Win.Trojan.Agent FOUND\n").unwrap();
        assert!(result.is_infected);
        assert_eq!(result.virus_name.as_deref(), Some("Win.Trojan.Agent"));
    }

    #[test]
    fn parses_clamd_error() {
        let err = parse_clamd_response("stream: Access denied. ERROR\n").unwrap_err();
        assert!(err.contains("ClamAV scan error"));
    }
}
