use chrono::{TimeZone, Utc};
use base64::{Engine as _, engine::general_purpose::STANDARD};
use omnyid_homeserver::{
    crypto::{encrypt_content, sign_message},
    message::AFPMessage,
    quotation::{
        ActiveVendorGrant, ClaimedVendorAuthority, VENDOR_RESPONSE_TRANSPORT_VERSION,
        VendorResponseRoutingMetadata, VendorTransportFailure, VendorTransportReceiptStatus,
        envelope_digest, validate_claimed_vendor_response, vendor_transport_receipt,
    },
};
use serde_json::{Value, json};

const SEED: [u8; 32] = [13; 32];
const SHARED_KEY: [u8; 32] = [21; 32];

fn now() -> chrono::DateTime<Utc> {
    Utc.with_ymd_and_hms(2026, 10, 18, 3, 0, 0)
        .single()
        .unwrap()
}

fn public_key() -> String {
    use ed25519_dalek::SigningKey;
    hex::encode(SigningKey::from_bytes(&SEED).verifying_key().to_bytes())
}

fn metadata() -> VendorResponseRoutingMetadata {
    VendorResponseRoutingMetadata {
        schema_version: VENDOR_RESPONSE_TRANSPORT_VERSION.to_string(),
        grant_message_id: "grant-message-1".to_string(),
        grant_id: "grant-1".to_string(),
        vendor_id: "vendor-1".to_string(),
        quotation_id: "quotation-1".to_string(),
        quotation_version_id: "quotation-1-v2".to_string(),
        projection_fingerprint: "a".repeat(64),
        response_id: "response-1".to_string(),
        response_fingerprint: "b".repeat(64),
        nonce: "nonce-1".to_string(),
        agent_card_key_id: "vendor-key-2".to_string(),
        expires_at: "2026-10-19T03:00:00Z".to_string(),
    }
}

fn authority<'a>(key: &'a str) -> ClaimedVendorAuthority<'a> {
    ClaimedVendorAuthority {
        vendor_id: "vendor-1",
        agent_id: "agent:vendor-1@example.com",
        agent_card_key_id: "vendor-key-2",
        signing_public_key_hex: key,
        claim_status: "verified",
        agent_card_valid: true,
        response_capability: true,
    }
}

fn grant() -> ActiveVendorGrant<'static> {
    ActiveVendorGrant {
        grant_message_id: "grant-message-1",
        grant_id: "grant-1",
        vendor_id: "vendor-1",
        target_agent_id: "agent:vendor-1@example.com",
        response_recipient_id: "agent:couple@example.com",
        quotation_id: "quotation-1",
        quotation_version_id: "quotation-1-v2",
        thread_id: "thread-1",
        projection_fingerprint: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        expires_at: "2026-10-19T03:00:00Z",
        active: true,
        quotation_active: true,
        closure_terminal: false,
        answer_questions_allowed: true,
    }
}

fn signed_envelope() -> AFPMessage {
    let metadata = serde_json::to_value(metadata()).unwrap();
    let aad = json!({"thread_id": "thread-1", "response_id": "response-1"});
    let mut message = AFPMessage {
        protocol: "afp-v1".to_string(),
        id: "response-1".to_string(),
        thread_id: "thread-1".to_string(),
        parent_id: Some("invite-1".to_string()),
        from: "agent:vendor-1@example.com".to_string(),
        to: vec!["agent:couple@example.com".to_string()],
        timestamp: "2026-10-18T03:00:00Z".to_string(),
        r#type: "wedding_enquiry_response".to_string(),
        kind: Some("quotation_vendor_response_submitted".to_string()),
        supertags: vec!["quotation".to_string(), "ciphertext_only".to_string()],
        subtype: Some("quotation_vendor_response_submitted".to_string()),
        content: Value::Null,
        metadata: Some(metadata),
        signature: String::new(),
        encryption: Some({
            let mut encryption = encrypt_content(
                &json!({"commercial_response": "private vendor material"}),
                &aad,
                &SHARED_KEY,
            );
            encryption["ephemeral_public_key"] = json!(STANDARD.encode([7_u8; 32]));
            encryption["aad"] = json!(STANDARD.encode(serde_json::to_vec(&aad).unwrap()));
            encryption
        }),
        views: vec![],
        references: vec![],
        typed_refs: vec![],
        attachments: vec![],
        store_in_relational: false,
        prev_hash: None,
    };
    sign_message(&mut message, &SEED);
    message
}

#[test]
fn current_claim_card_and_exact_grant_accept_ciphertext_only_response() {
    let message = signed_envelope();
    let key = public_key();
    let accepted = validate_claimed_vendor_response(&message, &authority(&key), &grant(), now())
        .expect("valid response");
    assert_eq!(accepted.response_id, message.id);
    let encoded = serde_json::to_string(&message).unwrap();
    assert!(!encoded.contains("private vendor material"));
    assert!(encoded.contains("ciphertext"));
}

#[test]
fn plaintext_body_is_rejected_before_transport() {
    let mut message = signed_envelope();
    message.content = json!({"price": 4200});
    sign_message(&mut message, &SEED);
    let key = public_key();
    assert_eq!(
        validate_claimed_vendor_response(&message, &authority(&key), &grant(), now()),
        Err(VendorTransportFailure::PlaintextForbidden)
    );
}

#[test]
fn encryption_container_rejects_plaintext_or_unknown_side_channels() {
    let mut message = signed_envelope();
    message.encryption.as_mut().unwrap()["plaintext"] = json!({"price": 4200});
    sign_message(&mut message, &SEED);
    let key = public_key();
    assert_eq!(
        validate_claimed_vendor_response(&message, &authority(&key), &grant(), now()),
        Err(VendorTransportFailure::InvalidEnvelope)
    );
}

#[test]
fn claim_dispute_and_agent_card_key_change_fail_closed() {
    let message = signed_envelope();
    let key = public_key();
    let mut disputed = authority(&key);
    disputed.claim_status = "disputed";
    assert_eq!(
        validate_claimed_vendor_response(&message, &disputed, &grant(), now()),
        Err(VendorTransportFailure::ClaimUnavailable)
    );

    let mut rotated = authority(&key);
    rotated.agent_card_key_id = "vendor-key-3";
    assert_eq!(
        validate_claimed_vendor_response(&message, &rotated, &grant(), now()),
        Err(VendorTransportFailure::AgentCardChanged)
    );
}

#[test]
fn recipient_vendor_thread_projection_and_active_version_are_exact() {
    let message = signed_envelope();
    let key = public_key();
    for changed in [
        "vendor",
        "agent",
        "recipient",
        "thread",
        "projection",
        "version",
    ] {
        let mut grant = grant();
        match changed {
            "vendor" => grant.vendor_id = "vendor-2",
            "agent" => grant.target_agent_id = "agent:vendor-2@example.com",
            "recipient" => grant.response_recipient_id = "agent:other@example.com",
            "thread" => grant.thread_id = "thread-2",
            "projection" => grant.projection_fingerprint = "c",
            "version" => grant.quotation_version_id = "quotation-1-v3",
            _ => unreachable!(),
        }
        assert!(
            validate_claimed_vendor_response(&message, &authority(&key), &grant, now()).is_err()
        );
    }
}

#[test]
fn bad_signature_expiry_and_terminal_closure_fail_closed() {
    let key = public_key();
    let mut message = signed_envelope();
    message.signature.push('x');
    assert_eq!(
        validate_claimed_vendor_response(&message, &authority(&key), &grant(), now()),
        Err(VendorTransportFailure::SignatureInvalid)
    );

    let message = signed_envelope();
    assert_eq!(
        validate_claimed_vendor_response(
            &message,
            &authority(&key),
            &grant(),
            Utc.with_ymd_and_hms(2026, 10, 20, 3, 0, 0)
                .single()
                .unwrap(),
        ),
        Err(VendorTransportFailure::Expired)
    );

    let mut closed = grant();
    closed.closure_terminal = true;
    assert_eq!(
        validate_claimed_vendor_response(&message, &authority(&key), &closed, now()),
        Err(VendorTransportFailure::GrantUnavailable)
    );
}

#[test]
fn retry_receipt_is_deterministic_without_commercial_material() {
    let message = signed_envelope();
    let digest = envelope_digest(&message).unwrap();
    let first = vendor_transport_receipt("vendor-1", "request-1", &digest, Ok(&message.id), now());
    let retry = vendor_transport_receipt("vendor-1", "request-1", &digest, Ok(&message.id), now());
    assert_eq!(first, retry);
    assert_eq!(first.status, VendorTransportReceiptStatus::Accepted);
    assert!(
        !serde_json::to_string(&first)
            .unwrap()
            .contains("private vendor material")
    );
}
