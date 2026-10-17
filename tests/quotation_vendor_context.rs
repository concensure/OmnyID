use chrono::{DateTime, Utc};
use omnyid_homeserver::quotation::*;
use serde_json::json;
use std::collections::BTreeSet;

fn time(value: &str) -> DateTime<Utc> {
    DateTime::parse_from_rfc3339(value)
        .unwrap()
        .with_timezone(&Utc)
}

fn grant(scope: ContextGrantScope) -> VendorContextGrant {
    let mut grant = VendorContextGrant {
        grant_id: "grant-1".to_string(),
        granted_by_user_id: "user-1".to_string(),
        target_vendor_id: "vendor-a".to_string(),
        quotation_id: "quote-a".to_string(),
        quotation_version_id: "quote-a-v2".to_string(),
        thread_id: "vendor-thread-a".to_string(),
        response_recipient_id: "vendor-recipient-a".to_string(),
        target_agent_id: Some("agent://vendor-a".to_string()),
        purpose: ContextGrantPurpose::ResolveQuoteGaps,
        allowed_fact_ids: vec![
            "fact-guest-count".to_string(),
            "fact-budget".to_string(),
            "fact-competitor-price".to_string(),
            "fact-private-note".to_string(),
        ],
        allowed_question_ids: vec!["question-availability".to_string()],
        allowed_actions: vec![
            ContextGrantAction::AnswerQuestions,
            ContextGrantAction::SubmitRevision,
        ],
        issued_at: "2026-10-17T00:00:00Z".to_string(),
        not_before: "2026-10-17T00:01:00Z".to_string(),
        expires_at: "2026-10-24T00:00:00Z".to_string(),
        scope,
        approval_receipt_ref: "approval-receipt-1".to_string(),
        projection_version: VENDOR_CONTEXT_PROJECTION_VERSION.to_string(),
        projection_fingerprint: "0".repeat(64),
    };
    grant.projection_fingerprint =
        vendor_context_projection_fingerprint(&grant, &available()).unwrap();
    grant
}

fn available() -> Vec<ShareableContextField> {
    vec![
        ShareableContextField {
            fact_id: "fact-guest-count".to_string(),
            key: "guest_count".to_string(),
            value: json!(80),
            provenance_ref: "requirement:guest-count:v2".to_string(),
            class: ShareableContextClass::ApprovedRequirement,
        },
        ShareableContextField {
            fact_id: "fact-budget".to_string(),
            key: "budget".to_string(),
            value: json!({"amount_minor": 2500000, "currency": "AUD"}),
            provenance_ref: "budget:venue:v1".to_string(),
            class: ShareableContextClass::ApprovedBudget,
        },
        ShareableContextField {
            fact_id: "fact-competitor-price".to_string(),
            key: "competitor_price".to_string(),
            value: json!(1900000),
            provenance_ref: "quote:competitor:v1".to_string(),
            class: ShareableContextClass::Prohibited,
        },
        ShareableContextField {
            fact_id: "fact-private-note".to_string(),
            key: "private_note.negotiation".to_string(),
            value: json!("do not share"),
            provenance_ref: "note:private:v1".to_string(),
            class: ShareableContextClass::Prohibited,
        },
    ]
}

#[test]
fn projection_is_minimal_fact_allowlisted_and_denylist_enforced() {
    let projection = project_vendor_context(
        &grant(ContextGrantScope::Reusable),
        "vendor-a",
        &available(),
        &[],
        &BTreeSet::new(),
        time("2026-10-18T00:00:00Z"),
    )
    .unwrap();
    assert_eq!(
        projection
            .fields
            .keys()
            .map(String::as_str)
            .collect::<Vec<_>>(),
        vec!["budget", "guest_count"]
    );
    assert_eq!(projection.fact_ids, vec!["fact-budget", "fact-guest-count"]);
    assert!(!projection.projection_fingerprint.is_empty());
    assert_eq!(projection.recipient_vendor_id, "vendor-a");
    assert_eq!(projection.response_recipient_id, "vendor-recipient-a");
    assert_eq!(projection.quotation_version_id, "quote-a-v2");
    assert_eq!(projection.question_ids, vec!["question-availability"]);
}

#[test]
fn wrong_recipient_expiry_revocation_and_single_use_consumption_fail_closed() {
    let reusable = grant(ContextGrantScope::Reusable);
    assert_eq!(
        project_vendor_context(
            &reusable,
            "vendor-b",
            &available(),
            &[],
            &BTreeSet::new(),
            time("2026-10-18T00:00:00Z"),
        ),
        Err(VendorContextError::WrongRecipient)
    );
    assert_eq!(
        project_vendor_context(
            &reusable,
            "vendor-a",
            &available(),
            &[],
            &BTreeSet::new(),
            time("2026-10-24T00:00:00Z"),
        ),
        Err(VendorContextError::Expired)
    );
    let revocation = VendorContextRevocation {
        revocation_id: "revoke-1".to_string(),
        grant_id: "grant-1".to_string(),
        revoked_by_user_id: "user-1".to_string(),
        revoked_at: "2026-10-18T00:00:00Z".to_string(),
        reason: "User withdrew access".to_string(),
    };
    assert_eq!(
        project_vendor_context(
            &reusable,
            "vendor-a",
            &available(),
            &[revocation],
            &BTreeSet::new(),
            time("2026-10-19T00:00:00Z"),
        ),
        Err(VendorContextError::Revoked)
    );
    assert_eq!(
        project_vendor_context(
            &grant(ContextGrantScope::SingleUse),
            "vendor-a",
            &available(),
            &[],
            &BTreeSet::from(["grant-1".to_string()]),
            time("2026-10-18T00:00:00Z"),
        ),
        Err(VendorContextError::SingleUseConsumed)
    );
}

#[test]
fn grant_and_revocation_messages_are_private_parent_linked_and_referenced() {
    let grant = grant(ContextGrantScope::SingleUse);
    let projection = project_vendor_context(
        &grant,
        "vendor-a",
        &available(),
        &[],
        &BTreeSet::new(),
        time("2026-10-18T00:00:00Z"),
    )
    .unwrap();
    assert!(matches!(
        vendor_context_grant_message(
            &grant,
            &projection,
            "different-approval",
            "agent://quotation-permission",
        ),
        Err(VendorContextError::InvalidGrant)
    ));
    let message = vendor_context_grant_message(
        &grant,
        &projection,
        &grant.approval_receipt_ref,
        "agent://quotation-permission",
    )
    .unwrap();
    assert_eq!(message.kind.as_deref(), Some(CONTEXT_GRANT_KIND));
    assert_eq!(message.id.len(), 26);
    assert_eq!(
        message.parent_id.as_deref(),
        Some(grant.approval_receipt_ref.as_str())
    );
    assert_eq!(message.references, message.typed_refs);
    assert_eq!(message.metadata.as_ref().unwrap()["e2ee_required"], true);
    assert_eq!(message.content["projection"], serde_json::json!(projection));
    assert!(message.references.iter().any(|reference| {
        reference.get("target").and_then(|value| value.as_str()) == Some("vendor-a")
    }));

    let revocation = VendorContextRevocation {
        revocation_id: "revoke-1".to_string(),
        grant_id: "grant-1".to_string(),
        revoked_by_user_id: "user-1".to_string(),
        revoked_at: "2026-10-18T00:00:00Z".to_string(),
        reason: "User withdrew access".to_string(),
    };
    let revoked =
        vendor_context_revocation_message(&revocation, &message, "agent://quotation-permission")
            .unwrap();
    assert_eq!(revoked.kind.as_deref(), Some(CONTEXT_GRANT_REVOKED_KIND));
    assert_eq!(revoked.id.len(), 26);
    assert_eq!(revoked.parent_id.as_deref(), Some(message.id.as_str()));
    assert_eq!(revoked.references[0]["target"], message.id);
}

#[test]
fn projection_is_deterministic_for_equivalent_inputs() {
    let grant = grant(ContextGrantScope::Reusable);
    let first = project_vendor_context(
        &grant,
        "vendor-a",
        &available(),
        &[],
        &BTreeSet::new(),
        time("2026-10-18T00:00:00Z"),
    )
    .unwrap();
    let mut reversed = available();
    reversed.reverse();
    let second = project_vendor_context(
        &grant,
        "vendor-a",
        &reversed,
        &[],
        &BTreeSet::new(),
        time("2026-10-18T00:00:00Z"),
    )
    .unwrap();
    assert_eq!(first, second);
}

#[test]
fn projection_requires_not_before_and_exact_approved_fingerprint() {
    let grant = grant(ContextGrantScope::Reusable);
    assert_eq!(
        project_vendor_context(
            &grant,
            "vendor-a",
            &available(),
            &[],
            &BTreeSet::new(),
            time("2026-10-17T00:00:30Z"),
        ),
        Err(VendorContextError::NotYetValid)
    );
    let mut tampered = grant;
    tampered.projection_fingerprint = "f".repeat(64);
    assert_eq!(
        project_vendor_context(
            &tampered,
            "vendor-a",
            &available(),
            &[],
            &BTreeSet::new(),
            time("2026-10-18T00:00:00Z"),
        ),
        Err(VendorContextError::InvalidGrant)
    );
}

#[test]
fn projection_serialization_matches_the_approved_preview_bytes() {
    let grant = grant(ContextGrantScope::Reusable);
    let preview = project_vendor_context(
        &grant,
        "vendor-a",
        &available(),
        &[],
        &BTreeSet::new(),
        time("2026-10-18T00:00:00Z"),
    )
    .unwrap();
    let approved_bytes = serde_json::to_vec(&preview).unwrap();
    let delivered = project_vendor_context(
        &grant,
        "vendor-a",
        &available(),
        &[],
        &BTreeSet::new(),
        time("2026-10-18T00:00:00Z"),
    )
    .unwrap();
    assert_eq!(serde_json::to_vec(&delivered).unwrap(), approved_bytes);
}
