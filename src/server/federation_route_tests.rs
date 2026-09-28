/*
 * @module-id: rust.server.federation-route-tests
 * @primary-capability: rust.test-module
 * @locs-version: 2.0
 * @stability: active
 * @owner: omnyid
 */

use super::*;
use crate::server::federation_delivery_failure::FEDERATION_DELIVERY_ERROR_MAX_CHARS;
use crate::server::federation_retry_routes::{
    has_successful_federation_delivery_receipt, stored_federated_outbound_message,
};
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
    assert!(source.contains(r#".route("/federation/retry", post(federation_retry_http))"#));
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
    assert_eq!(message.content["delivery_status"], "pending_relay");
    assert_eq!(
        message.metadata.as_ref().expect("metadata")["delivery_status"],
        "pending_relay"
    );
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

#[test]
fn federated_delivery_failure_message_links_to_attempt() {
    let attempted = build_federated_agent_message(
        "agent:local@omnyid.test",
        "agent:peer@example.net",
        "01K8THREAD0000000000000000",
        "Subject",
        "Body",
        "user-1",
    );

    let failure = build_federated_delivery_failure_message(
        &attempted,
        "remote rejected relay: 503 unavailable",
    );

    assert_eq!(failure.thread_id, attempted.thread_id);
    assert_eq!(failure.parent_id.as_deref(), Some(attempted.id.as_str()));
    assert_eq!(
        failure.subtype.as_deref(),
        Some("federated_delivery_failed")
    );
    assert_eq!(failure.content["attempted_message_id"], attempted.id);
    assert_eq!(
        failure.content["error"],
        "remote rejected relay: 503 unavailable"
    );
    assert_eq!(
        failure.metadata.as_ref().expect("metadata")["delivery"],
        "failed"
    );
    assert_eq!(failure.references[0]["target"], attempted.id);
}

#[test]
fn federated_delivery_failure_message_bounds_noisy_error_text() {
    let attempted = build_federated_agent_message(
        "agent:local@omnyid.test",
        "agent:peer@example.net",
        "01K8THREAD0000000000000000",
        "Subject",
        "Body",
        "user-1",
    );
    let noisy_error = format!(
        "remote rejected relay:\n{}\r\n{}",
        "x".repeat(FEDERATION_DELIVERY_ERROR_MAX_CHARS + 100),
        "tail"
    );

    let failure = build_federated_delivery_failure_message(&attempted, &noisy_error);
    let error = failure.content["error"].as_str().expect("error summary");

    assert!(error.chars().count() <= FEDERATION_DELIVERY_ERROR_MAX_CHARS);
    assert!(!error.contains('\n'));
    assert!(!error.contains('\r'));
    assert!(error.ends_with("[truncated]"));
    assert!(
        failure.views[0]["content"]["markdown"]
            .as_str()
            .expect("markdown")
            .contains(error)
    );
}

#[test]
fn federated_delivery_sent_message_links_to_attempt() {
    let attempted = build_federated_agent_message(
        "agent:local@omnyid.test",
        "agent:peer@example.net",
        "01K8THREAD0000000000000000",
        "Subject",
        "Body",
        "user-1",
    );

    let sent = build_federated_delivery_sent_message(&attempted);

    assert_eq!(sent.thread_id, attempted.thread_id);
    assert_eq!(sent.parent_id.as_deref(), Some(attempted.id.as_str()));
    assert_eq!(sent.subtype.as_deref(), Some("federated_delivery_sent"));
    assert_eq!(sent.content["attempted_message_id"], attempted.id);
    assert_eq!(sent.content["status"], "accepted_by_peer_relay");
    assert_eq!(
        sent.metadata.as_ref().expect("metadata")["delivery"],
        "sent"
    );
    assert_eq!(sent.references[0]["target"], attempted.id);
}

#[test]
fn stored_federated_outbound_message_requires_retryable_message() {
    let outbound = build_federated_agent_message(
        "agent:local@omnyid.test",
        "agent:peer@example.net",
        "01K8THREAD0000000000000000",
        "Subject",
        "Body",
        "user-1",
    );
    let parsed = stored_federated_outbound_message(serde_json::to_value(&outbound).expect("json"))
        .expect("outbound message should be retryable");
    assert_eq!(parsed.id, outbound.id);

    let mut non_federated = outbound.clone();
    non_federated.subtype = Some("note".to_string());
    let err = stored_federated_outbound_message(serde_json::to_value(non_federated).expect("json"))
        .expect_err("wrong subtype should fail");
    assert_eq!(err.0, StatusCode::BAD_REQUEST);
    assert!(err.1.contains("only federated outbound"));

    let mut missing_recipient = outbound;
    missing_recipient.to.clear();
    let err =
        stored_federated_outbound_message(serde_json::to_value(missing_recipient).expect("json"))
            .expect_err("missing recipient should fail");
    assert_eq!(err.0, StatusCode::BAD_REQUEST);
    assert!(err.1.contains("valid recipient"));
}

#[test]
fn successful_federation_delivery_receipt_detector_matches_attempt_id() {
    let attempted = build_federated_agent_message(
        "agent:local@omnyid.test",
        "agent:peer@example.net",
        "01K8THREAD0000000000000000",
        "Subject",
        "Body",
        "user-1",
    );
    let sent = build_federated_delivery_sent_message(&attempted);
    let failure =
        build_federated_delivery_failure_message(&attempted, "remote rejected relay: 503");

    assert!(has_successful_federation_delivery_receipt(
        &[failure.clone(), sent.clone()],
        &attempted.id
    ));
    assert!(!has_successful_federation_delivery_receipt(
        &[failure, sent],
        "01K8OTHERATTEMPT0000000000"
    ));
}

#[test]
fn successful_federation_delivery_receipt_detector_uses_metadata_fallback() {
    let attempted = build_federated_agent_message(
        "agent:local@omnyid.test",
        "agent:peer@example.net",
        "01K8THREAD0000000000000000",
        "Subject",
        "Body",
        "user-1",
    );
    let mut sent = build_federated_delivery_sent_message(&attempted);
    sent.content["attempted_message_id"] = Value::Null;

    assert!(has_successful_federation_delivery_receipt(
        &[sent],
        &attempted.id
    ));
}
