/*
 * @module-id: rust.server.federation-route-tests
 * @primary-capability: rust.test-module
 * @locs-version: 2.0
 * @stability: active
 * @owner: omnyid
 */

use super::*;
use std::sync::{Mutex, OnceLock};

fn env_test_lock() -> &'static Mutex<()> {
    static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    LOCK.get_or_init(|| Mutex::new(()))
}

#[tokio::test]
async fn delegation_endpoint_uses_env_override() {
    let _guard = env_test_lock().lock().expect("env test lock");
    unsafe {
        std::env::set_var("OMNYID_AFP_DELEGATION", "relay.omnyid.ai:443");
    }
    let payload = serve_afp_delegation().await.0;
    assert_eq!(payload["afp.server"], "relay.omnyid.ai:443");
    unsafe {
        std::env::remove_var("OMNYID_AFP_DELEGATION");
    }
}

#[tokio::test]
async fn delegation_endpoint_serves_federation_document_shape() {
    let _guard = env_test_lock().lock().expect("env test lock");
    unsafe {
        std::env::set_var("OMNYID_AGENT_ID", "agent:test@omnyid.test");
        std::env::set_var("OMNYID_HOMESERVER_URL", "https://omnyid.test");
        std::env::set_var(
            "OMNYID_SIGNING_KEY_HEX",
            "abababababababababababababababababababababababababababababababab",
        );
        std::env::remove_var("OMNYID_AFP_RELAY_ENDPOINT");
    }

    let payload = serve_afp_delegation().await.0;

    assert_eq!(payload["agent_id"], "agent:test@omnyid.test");
    assert_eq!(
        payload["relay_endpoint"],
        "https://omnyid.test/federation/relay"
    );
    assert_eq!(payload["version"], "1.0");
    assert!(
        payload["signing_key"]
            .as_str()
            .is_some_and(|value| value.len() == 64)
    );

    unsafe {
        std::env::remove_var("OMNYID_AGENT_ID");
        std::env::remove_var("OMNYID_HOMESERVER_URL");
        std::env::remove_var("OMNYID_SIGNING_KEY_HEX");
        std::env::remove_var("OMNYID_AFP_RELAY_ENDPOINT");
    }
}

#[test]
fn federation_send_and_relay_routes_are_registered() {
    let source = include_str!("mod.rs");
    assert!(source.contains(r#".route("/federation/send", post(federation_send_http))"#));
    assert!(source.contains(r#".route("/federation/relay", post(federation_relay_http))"#));
    assert!(source.contains(r#".route("/.well-known/afp-delegation", get(serve_afp_delegation))"#));
}
