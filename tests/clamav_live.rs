//! Opt-in live evidence for the shared ClamAV INSTREAM boundary.
//!
//! Set `CLAMD_HOST` to a disposable scanner endpoint. An unset endpoint skips
//! locally so ordinary unit runs never acquire an external service dependency.

use base64::Engine as _;
use omnyid_homeserver::gateway::clamav::scan_bytes;
use std::sync::{Mutex, OnceLock};

fn env_lock() -> &'static Mutex<()> {
    static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    LOCK.get_or_init(|| Mutex::new(()))
}

#[tokio::test]
async fn configured_clamd_marks_bounded_plain_text_clean() {
    let _guard = env_lock().lock().expect("ClamAV environment lock");
    let endpoint = std::env::var("CLAMD_HOST")
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    let Some(endpoint) = endpoint else {
        eprintln!("CLAMD_HOST unset; skipping live ClamAV evidence");
        return;
    };

    let fixture = b"OmnyID quotation attachment clean-scan fixture. No private or commercial data.";
    let result = scan_bytes(fixture)
        .await
        .unwrap_or_else(|error| panic!("ClamAV at {endpoint} must accept INSTREAM: {error}"))
        .expect("configured CLAMD_HOST must return an explicit scan result");

    assert!(
        !result.is_infected,
        "bounded clean fixture must not be marked infected"
    );
    assert!(
        result.virus_name.is_none(),
        "clean fixture must not have a virus label"
    );
}

#[tokio::test]
async fn configured_clamd_detects_standard_harmless_eicar_fixture() {
    let _guard = env_lock().lock().expect("ClamAV environment lock");
    if std::env::var("CLAMD_HOST")
        .ok()
        .is_none_or(|v| v.trim().is_empty())
    {
        eprintln!("CLAMD_HOST unset; skipping live EICAR evidence");
        return;
    }
    // Standard harmless antivirus test string; decode in memory and never persist it.
    let fixture = base64::engine::general_purpose::STANDARD
        .decode("WDVPIVAlQEFQWzRcUFpYNTQoUF4pN0NDKTd9JEVJQ0FSLVNUQU5EQVJELUFOVElWSVJVUy1URVNULUZJTEUhJEgrSCo=")
        .unwrap();
    let result = scan_bytes(&fixture)
        .await
        .expect("live INSTREAM scan")
        .expect("configured scanner must return a result");
    assert!(
        result.is_infected,
        "live scanner must detect the EICAR test fixture"
    );
    assert!(
        result.virus_name.is_some(),
        "detection must carry a signature label"
    );
}

#[tokio::test]
async fn configured_but_unavailable_clamd_fails_closed() {
    let _guard = env_lock().lock().expect("ClamAV environment lock");
    let listener = std::net::TcpListener::bind("127.0.0.1:0")
        .expect("reserve an unavailable local scanner endpoint");
    let address = listener.local_addr().expect("reserved endpoint address");
    drop(listener);

    let prior = std::env::var_os("CLAMD_HOST");
    unsafe { std::env::set_var("CLAMD_HOST", address.to_string()) };
    let result = scan_bytes(b"bounded unavailable-scanner fixture").await;
    match prior {
        Some(value) => unsafe { std::env::set_var("CLAMD_HOST", value) },
        None => unsafe { std::env::remove_var("CLAMD_HOST") },
    }

    assert!(
        result.is_err(),
        "an unavailable configured scanner must fail closed"
    );
}
