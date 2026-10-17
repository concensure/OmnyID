use chrono::{DateTime, Utc};
use omnyid_homeserver::quotation::*;

const PEPPER: &[u8] = b"response-capability-test-pepper-32-bytes-minimum";

fn time(value: &str) -> DateTime<Utc> {
    DateTime::parse_from_rfc3339(value)
        .unwrap()
        .with_timezone(&Utc)
}

fn binding() -> ResponseCapabilityBinding {
    ResponseCapabilityBinding {
        grant_id: "grant-1".to_string(),
        vendor_id: "vendor-a".to_string(),
        response_recipient_id: "vendor-contact-a".to_string(),
        quotation_id: "quote-a".to_string(),
        quotation_version_id: "quote-a-v3".to_string(),
        thread_id: "thread-a".to_string(),
        projection_fingerprint: "a".repeat(64),
        allowed_actions: vec![
            ContextGrantAction::AnswerQuestions,
            ContextGrantAction::SubmitRevision,
        ],
        not_before: "2026-10-17T00:01:00Z".to_string(),
        expires_at: "2026-10-18T00:00:00Z".to_string(),
    }
}

fn issue(entropy: u8) -> IssuedResponseCapability {
    issue_response_capability_with_entropy(
        ResponseCapabilityIssue {
            capability_id: format!("capability-{entropy}"),
            binding: binding(),
            issued_at: "2026-10-17T00:00:00Z".to_string(),
        },
        PEPPER,
        [entropy; 32],
        1,
        None,
    )
    .unwrap()
}

fn access<'a>(fingerprint: &'a str) -> ResponseCapabilityAccess<'a> {
    ResponseCapabilityAccess {
        vendor_id: "vendor-a",
        response_recipient_id: "vendor-contact-a",
        quotation_id: "quote-a",
        quotation_version_id: "quote-a-v3",
        thread_id: "thread-a",
        projection_fingerprint: fingerprint,
    }
}

fn authority<'a>(fingerprint: &'a str) -> ResponseCapabilityAuthority<'a> {
    ResponseCapabilityAuthority {
        grant_active: true,
        quotation_active: true,
        claim_disputed: false,
        closure_terminal: false,
        active_projection_fingerprint: fingerprint,
    }
}

#[test]
fn issue_returns_high_entropy_once_and_persists_only_a_keyed_hash() {
    let issued = issue(7);
    let raw = issued.token.clone().expose();
    assert!(raw.starts_with("qrc_"));
    assert!(raw.len() >= 47);
    assert_ne!(issued.record.token_mac, raw);
    assert!(
        !serde_json::to_string(&issued.record)
            .unwrap()
            .contains(&raw)
    );
    assert!(!format!("{:?}", issued.token).contains(&raw));
    assert_eq!(issued.record.token_mac.len(), 64);
    assert_eq!(issued.record.status, ResponseCapabilityStatus::Active);
    assert_eq!(issued.audit.kind, ResponseCapabilityAuditKind::Issued);
}

#[test]
fn exchange_is_exact_bound_generic_and_creates_no_account_session() {
    let issued = issue(8);
    let raw = issued.token.expose();
    let mut record = issued.record;
    let fingerprint = record.binding.projection_fingerprint.clone();
    let session = exchange_response_capability_with_entropy(
        &mut record,
        &raw,
        PEPPER,
        &access(&fingerprint),
        &authority(&fingerprint),
        time("2026-10-17T00:02:00Z"),
        [9; 32],
        [10; 32],
        [11; 32],
    )
    .unwrap();
    assert_eq!(record.status, ResponseCapabilityStatus::Exchanged);
    assert_eq!(session.record.account_access, false);
    let cookie = session.secrets.cookie_header();
    assert!(cookie.contains("HttpOnly"));
    assert!(cookie.contains("Secure"));
    assert!(cookie.contains("SameSite=Strict"));
    assert!(cookie.contains("Path=/quotation/vendor-response"));
    assert!(
        !serde_json::to_string(&session.record)
            .unwrap()
            .contains(session.secrets.session_token())
    );
}

#[test]
fn wrong_binding_expiry_and_authority_fail_with_one_unavailable_error() {
    let issued = issue(12);
    let raw = issued.token.expose();
    for case in [
        "vendor",
        "recipient",
        "thread",
        "version",
        "projection",
        "grant",
        "quote",
        "claim",
        "closure",
        "expired",
    ] {
        let mut record = issued.record.clone();
        let fingerprint = record.binding.projection_fingerprint.clone();
        let mut access = access(&fingerprint);
        let mut authority = authority(&fingerprint);
        let mut now = time("2026-10-17T00:02:00Z");
        match case {
            "vendor" => access.vendor_id = "vendor-b",
            "recipient" => access.response_recipient_id = "other-contact",
            "thread" => access.thread_id = "thread-b",
            "version" => access.quotation_version_id = "quote-a-v4",
            "projection" => access.projection_fingerprint = "b",
            "grant" => authority.grant_active = false,
            "quote" => authority.quotation_active = false,
            "claim" => authority.claim_disputed = true,
            "closure" => authority.closure_terminal = true,
            "expired" => now = time("2026-10-18T00:00:00Z"),
            _ => unreachable!(),
        }
        assert_eq!(
            exchange_response_capability_with_entropy(
                &mut record,
                &raw,
                PEPPER,
                &access,
                &authority,
                now,
                [13; 32],
                [14; 32],
                [15; 32],
            ),
            Err(ResponseCapabilityError::Unavailable),
            "case {case}"
        );
    }
}

#[test]
fn csrf_and_one_time_nonce_guard_exactly_one_submission() {
    let issued = issue(16);
    let raw = issued.token.expose();
    let mut record = issued.record;
    let fingerprint = record.binding.projection_fingerprint.clone();
    let mut session = exchange_response_capability_with_entropy(
        &mut record,
        &raw,
        PEPPER,
        &access(&fingerprint),
        &authority(&fingerprint),
        time("2026-10-17T00:02:00Z"),
        [17; 32],
        [18; 32],
        [19; 32],
    )
    .unwrap();
    let bad = ResponseSubmissionProof {
        session_token: session.secrets.session_token(),
        csrf_token: "wrong-csrf",
        submission_nonce: session.secrets.submission_nonce(),
        action: ContextGrantAction::SubmitRevision,
    };
    assert_eq!(
        consume_response_capability(
            &mut record,
            &mut session.record,
            &bad,
            PEPPER,
            &authority(&fingerprint),
            time("2026-10-17T00:03:00Z"),
        ),
        Err(ResponseCapabilityError::Unavailable)
    );
    let proof = ResponseSubmissionProof {
        session_token: session.secrets.session_token(),
        csrf_token: session.secrets.csrf_token(),
        submission_nonce: session.secrets.submission_nonce(),
        action: ContextGrantAction::SubmitRevision,
    };
    let consumed = consume_response_capability(
        &mut record,
        &mut session.record,
        &proof,
        PEPPER,
        &authority(&fingerprint),
        time("2026-10-17T00:03:00Z"),
    )
    .unwrap();
    assert_eq!(consumed.kind, ResponseCapabilityAuditKind::Consumed);
    assert_eq!(record.status, ResponseCapabilityStatus::Consumed);
    assert_eq!(
        consume_response_capability(
            &mut record,
            &mut session.record,
            &proof,
            PEPPER,
            &authority(&fingerprint),
            time("2026-10-17T00:04:00Z"),
        ),
        Err(ResponseCapabilityError::Unavailable)
    );
}

#[test]
fn revocation_and_rotation_preserve_a_content_free_audit_trail() {
    let mut revoked = issue(20).record;
    let event = revoke_response_capability(
        &mut revoked,
        ResponseCapabilityRevocationReason::ClaimDisputed,
        time("2026-10-17T00:05:00Z"),
    )
    .unwrap();
    assert_eq!(revoked.status, ResponseCapabilityStatus::Revoked);
    assert_eq!(event.kind, ResponseCapabilityAuditKind::Revoked);

    let issued = issue(21);
    let raw = issued.token.expose();
    let mut prior = issued.record;
    let rotated = rotate_response_capability_with_entropy(
        &mut prior,
        "capability-22".to_string(),
        "2026-10-17T00:06:00Z".to_string(),
        PEPPER,
        [22; 32],
    )
    .unwrap();
    assert_eq!(prior.status, ResponseCapabilityStatus::Rotated);
    assert_eq!(rotated.record.generation, 2);
    assert_eq!(
        rotated.record.rotated_from_capability_id.as_deref(),
        Some(prior.capability_id.as_str())
    );
    let audit_json = serde_json::to_string(&rotated.audit).unwrap();
    assert!(!audit_json.contains(&raw));
    assert!(!audit_json.contains("projection_fingerprint"));
    assert!(!audit_json.contains("vendor-a"));

    let mut preserved = issue(23).record;
    assert_eq!(
        rotate_response_capability_with_entropy(
            &mut preserved,
            "capability-24".to_string(),
            "2026-10-19T00:00:00Z".to_string(),
            PEPPER,
            [24; 32],
        ),
        Err(ResponseCapabilityError::InvalidIssue)
    );
    assert_eq!(preserved.status, ResponseCapabilityStatus::Active);
}

#[test]
fn multi_key_rate_limit_fails_closed_without_raw_keys() {
    let policy = ResponseCapabilityRatePolicy {
        token_prefix_limit: 5,
        ip_hash_limit: 20,
        vendor_limit: 30,
        thread_limit: 40,
        retry_after_seconds: 60,
    };
    assert_eq!(
        response_capability_rate_decision(
            &ResponseCapabilityRateSnapshot {
                token_prefix_attempts: 4,
                ip_hash_attempts: 19,
                vendor_attempts: 29,
                thread_attempts: 39,
            },
            &policy,
        ),
        ResponseCapabilityRateDecision::Allowed
    );
    assert_eq!(
        response_capability_rate_decision(
            &ResponseCapabilityRateSnapshot {
                token_prefix_attempts: 5,
                ip_hash_attempts: 0,
                vendor_attempts: 0,
                thread_attempts: 0,
            },
            &policy,
        ),
        ResponseCapabilityRateDecision::Limited {
            retry_after_seconds: 60
        }
    );
}
