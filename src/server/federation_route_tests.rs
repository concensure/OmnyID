/*
 * @module-id: rust.server.federation-route-tests
 * @primary-capability: rust.test-module
 * @locs-version: 2.0
 * @stability: active
 * @owner: omnyid
 */

use super::*;
use axum::http::StatusCode;
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

#[test]
fn federated_agent_message_preserves_ulid_thread_id() {
    let message = build_federated_agent_message(
        "agent:local@omnyid.test",
        "agent:peer@example.net",
        "01K8THREAD0000000000000000",
        "Subject",
        "Body",
        "user-1",
    );

    assert_eq!(message.thread_id, "01K8THREAD0000000000000000");
    assert_eq!(message.content["delivery_thread_id"], message.thread_id);
    assert!(message.content.get("source_thread_id").is_none());
    let metadata = message.metadata.as_ref().expect("metadata");
    assert!(metadata.get("source_thread_id").is_none());
}

#[test]
fn federated_agent_message_uses_delivery_thread_for_semantic_source_thread() {
    let message = build_federated_agent_message(
        "agent:local@omnyid.test",
        "agent:peer@example.net",
        "wedding_vendor_quote:workspace-1:chloes-florals",
        "Subject",
        "Body",
        "user-1",
    );

    assert!(is_valid_ulid(&message.thread_id));
    assert_eq!(message.content["delivery_thread_id"], message.thread_id);
    assert_eq!(
        message.content["source_thread_id"],
        "wedding_vendor_quote:workspace-1:chloes-florals"
    );
    let metadata = message.metadata.as_ref().expect("metadata");
    assert_eq!(
        metadata["source_thread_id"],
        "wedding_vendor_quote:workspace-1:chloes-florals"
    );
    assert_eq!(metadata["delivery_thread_id"], message.thread_id);
}

#[test]
fn federation_send_field_validation_rejects_oversized_content() {
    let long_body = "x".repeat(FEDERATION_BODY_MAX_CHARS + 1);
    let err = validate_federation_send_fields(
        "agent:peer@example.net",
        "01K8THREAD0000000000000000",
        &long_body,
        Some("Subject"),
    )
    .expect_err("oversized body should fail");
    assert_eq!(err.0, StatusCode::PAYLOAD_TOO_LARGE);
    assert!(err.1.contains("message body"));

    let long_subject = "x".repeat(FEDERATION_SUBJECT_MAX_CHARS + 1);
    let err = validate_federation_send_fields(
        "agent:peer@example.net",
        "01K8THREAD0000000000000000",
        "Body",
        Some(&long_subject),
    )
    .expect_err("oversized subject should fail");
    assert_eq!(err.0, StatusCode::PAYLOAD_TOO_LARGE);
    assert!(err.1.contains("subject"));
}
