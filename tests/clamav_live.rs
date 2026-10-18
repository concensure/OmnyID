//! Opt-in live evidence for the shared ClamAV INSTREAM boundary.
//!
//! Set `CLAMD_HOST` to a disposable scanner endpoint. An unset endpoint skips
//! locally so ordinary unit runs never acquire an external service dependency.

use omnyid_homeserver::gateway::clamav::scan_bytes;

#[tokio::test]
async fn configured_clamd_marks_bounded_plain_text_clean() {
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
