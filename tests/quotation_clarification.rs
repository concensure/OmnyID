use std::collections::BTreeSet;

use omnyid_homeserver::quotation::*;

fn candidates() -> Vec<ClarificationCandidate> {
    vec![
        ClarificationCandidate {
            gap_code: "tax_treatment_unknown".to_string(),
            line_id: None,
            question: "Is GST included?".to_string(),
            impact_rank: 1,
        },
        ClarificationCandidate {
            gap_code: "price_missing".to_string(),
            line_id: Some("beverages".to_string()),
            question: "What is the beverage price?".to_string(),
            impact_rank: 3,
        },
        ClarificationCandidate {
            gap_code: "unknown_inclusion".to_string(),
            line_id: Some("staffing".to_string()),
            question: "Is staffing included?".to_string(),
            impact_rank: 2,
        },
        ClarificationCandidate {
            gap_code: "quantity_or_arithmetic_missing".to_string(),
            line_id: Some("hours".to_string()),
            question: "How many hours apply?".to_string(),
            impact_rank: 5,
        },
    ]
}

fn draft() -> ClarificationDraft {
    build_clarification_draft(
        "quote-1",
        "quote-1-v2",
        "compare-v3",
        "vendor@example.test",
        "Questions about quotation quote-1",
        &candidates(),
        &BTreeSet::from(["staffing".to_string()]),
        vec![ClarificationContextFact {
            key: "event.guest_count".to_string(),
            value: "80".to_string(),
        }],
        "2026-10-17T10:00:00Z",
    )
    .unwrap()
}

fn approval(draft: &ClarificationDraft) -> ClarificationApproval {
    ClarificationApproval {
        approval_id: "approval-1".to_string(),
        draft_id: draft.draft_id.clone(),
        draft_hash: draft_hash(draft),
        recipient: draft.recipient.clone(),
        quotation_version_id: draft.quotation_version_id.clone(),
        comparison_revision: draft.comparison_revision.clone(),
        expires_at: "2026-10-17T11:00:00Z".to_string(),
        approval_receipt_id: "approval-receipt-1".to_string(),
    }
}

#[test]
fn drafts_keep_at_most_three_unanswered_facts() {
    let draft = draft();
    assert_eq!(draft.questions.len(), 3);
    assert!(
        !draft
            .questions
            .iter()
            .any(|question| question.fact_key == "staffing")
    );
}

#[test]
fn private_or_competitor_context_is_rejected() {
    let result = build_clarification_draft(
        "quote-1",
        "v1",
        "c1",
        "vendor@example.test",
        "Question",
        &candidates(),
        &BTreeSet::new(),
        vec![ClarificationContextFact {
            key: "competitor.price".to_string(),
            value: "100".to_string(),
        }],
        "2026-10-17T10:00:00Z",
    );
    assert_eq!(result, Err(ClarificationError::ForbiddenContext));
}

#[test]
fn approval_binds_exact_editable_draft_and_expiry() {
    let original = draft();
    let approval = approval(&original);
    assert!(matches!(
        authorise_clarification_send(&original, &approval, "2026-10-17T10:30:00Z", &[]),
        Ok(ClarificationSendDecision::Approved { .. })
    ));
    let mut edited = original.clone();
    edited.questions[0].question.push_str(" Please confirm.");
    assert_eq!(
        authorise_clarification_send(&edited, &approval, "2026-10-17T10:30:00Z", &[]),
        Err(ClarificationError::StaleApproval)
    );
    assert_eq!(
        authorise_clarification_send(&original, &approval, "2026-10-17T11:00:00Z", &[]),
        Err(ClarificationError::ApprovalExpired)
    );
}

#[test]
fn retries_return_the_existing_provider_receipt() {
    let draft = draft();
    let approval = approval(&draft);
    let ClarificationSendDecision::Approved { idempotency_key } =
        authorise_clarification_send(&draft, &approval, "2026-10-17T10:30:00Z", &[]).unwrap()
    else {
        panic!("expected approval")
    };
    let receipt = ClarificationSendReceipt {
        idempotency_key,
        provider_receipt_id: "provider-1".to_string(),
        sent_at: "2026-10-17T10:31:00Z".to_string(),
    };
    assert_eq!(
        authorise_clarification_send(
            &draft,
            &approval,
            "2026-10-17T10:32:00Z",
            &[receipt.clone()]
        ),
        Ok(ClarificationSendDecision::AlreadySent(receipt))
    );
}

#[test]
fn reply_facts_require_exact_evidence_in_the_reply_body() {
    let reply = ClarificationReply {
        source_id: "reply-message-1".to_string(),
        source_version_id: "reply-message-1-v1".to_string(),
        body_text: "Beverages are $55 per guest and your date is available.".to_string(),
        facts: vec![ClarificationReplyFact {
            fact_key: "beverages".to_string(),
            value: "5500 AUD per_person".to_string(),
            exact_excerpt: "Beverages are $55 per guest".to_string(),
            locator: "email:body".to_string(),
        }],
    };
    let anchors = reply_anchors(&reply).unwrap();
    assert_eq!(anchors[0].2.source_id, "reply-message-1");
    let mut unsupported = reply;
    unsupported.facts[0].exact_excerpt = "invented answer".to_string();
    assert_eq!(
        reply_anchors(&unsupported),
        Err(ClarificationError::UnsupportedReplyEvidence)
    );
}
