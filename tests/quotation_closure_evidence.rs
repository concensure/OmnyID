use omnyid_homeserver::quotation::*;

fn selected_quote() -> NormalisedQuotation {
    serde_json::from_str(include_str!(
        "fixtures/quotation/generic_normalised_quote.json"
    ))
    .unwrap()
}

fn prepared() -> PreparedEvidenceSource {
    PreparedEvidenceSource {
        source: SourceReference {
            source_id: "contract-message-1".to_string(),
            source_version_id: "contract-message-1:2026-10-18T00:00:00Z".to_string(),
            media_type: "application/pdf".to_string(),
            content_hash: Some("sha256:contract".to_string()),
        },
        content_hash: "sha256:contract".to_string(),
        parser: "mineru".to_string(),
    }
}

fn proposal(payload: ClosureEvidencePayload) -> ClosureEvidenceProposal {
    let selected = selected_quote();
    let prepared = prepared();
    ClosureEvidenceProposal {
        schema_version: CLOSURE_EVIDENCE_SCHEMA_VERSION.to_string(),
        quotation_id: selected.identity.quotation_id,
        quotation_version_id: selected.identity.version_id,
        source_id: prepared.source.source_id,
        source_version_id: prepared.source.source_version_id,
        payload,
        deadline_at: None,
    }
}

fn contract_quote() -> NormalisedQuotation {
    let mut contract = selected_quote();
    let source = prepared().source;
    contract.identity.version_id = "production-hire-contract-v1".to_string();
    contract.identity.supersedes_version_id = Some("production-hire-quote-v1".to_string());
    contract.sources = vec![source.clone()];
    contract.line_items[0]
        .unit_price
        .as_mut()
        .unwrap()
        .amount_minor = 425_000;
    contract.line_items[0].evidence = Evidence::confirmed(SourceAnchor {
        source_id: source.source_id.clone(),
        source_version_id: source.source_version_id.clone(),
        locator: "page:1".to_string(),
        exact_excerpt: "Lighting package AUD 4,250".to_string(),
    });
    contract.commercial_terms[0].evidence = Evidence::confirmed(SourceAnchor {
        source_id: source.source_id.clone(),
        source_version_id: source.source_version_id.clone(),
        locator: "page:1".to_string(),
        exact_excerpt: "Refundable equipment bond AUD 500".to_string(),
    });
    contract.tax.evidence = Evidence::confirmed(SourceAnchor {
        source_id: source.source_id,
        source_version_id: source.source_version_id,
        locator: "page:1".to_string(),
        exact_excerpt: "All prices include GST".to_string(),
    });
    contract
}

fn ready(outcome: ClosureEvidenceOutcome) -> ValidatedClosureEvidence {
    match outcome {
        ClosureEvidenceOutcome::Ready { evidence } => evidence,
        ClosureEvidenceOutcome::ManualReviewRequired { reason } => {
            panic!("expected ready evidence: {reason}")
        }
    }
}

#[test]
fn contract_changes_are_derived_from_source_anchored_normalisation() {
    let text =
        "Lighting package AUD 4,250\nRefundable equipment bond AUD 500\nAll prices include GST";
    let evidence = ready(
        validate_closure_evidence(
            &selected_quote(),
            &prepared(),
            Some(text),
            proposal(ClosureEvidencePayload::Contract {
                contract_quotation: Box::new(contract_quote()),
            }),
        )
        .unwrap(),
    );
    assert_eq!(evidence.kind, ClosureEvidenceKind::Contract);
    assert_eq!(evidence.suggested_target, ClosureState::ContractReceived);
    assert!(evidence.requires_explicit_review);
    assert!(evidence.contract_changes.iter().any(|change| {
        change.path == "line_items.lighting" && change.kind == MaterialChangeKind::LineChanged
    }));
    assert!(!evidence.payment_execution);
}

#[test]
fn unanchored_contract_or_unavailable_parser_requires_manual_review() {
    let unanchored = validate_closure_evidence(
        &selected_quote(),
        &prepared(),
        Some("A different document"),
        proposal(ClosureEvidencePayload::Contract {
            contract_quotation: Box::new(contract_quote()),
        }),
    )
    .unwrap();
    assert!(matches!(
        unanchored,
        ClosureEvidenceOutcome::ManualReviewRequired { .. }
    ));
    let unavailable = validate_closure_evidence(
        &selected_quote(),
        &prepared(),
        None,
        proposal(ClosureEvidencePayload::BookingConfirmation {
            exact_excerpt: "Booking confirmed".to_string(),
        }),
    )
    .unwrap();
    assert!(matches!(
        unavailable,
        ClosureEvidenceOutcome::ManualReviewRequired { .. }
    ));
}

#[test]
fn booking_cancellation_and_refund_require_exact_conservative_phrases() {
    for (payload, text, expected) in [
        (
            ClosureEvidencePayload::BookingConfirmation {
                exact_excerpt: "Your booking confirmed for 18 September.".to_string(),
            },
            "Your booking confirmed for 18 September.",
            ClosureState::BookingConfirmed,
        ),
        (
            ClosureEvidencePayload::Cancellation {
                exact_excerpt: "The booking was cancelled.".to_string(),
            },
            "The booking was cancelled.",
            ClosureState::Cancelled,
        ),
        (
            ClosureEvidencePayload::Refund {
                exact_excerpt: "Your deposit was refunded.".to_string(),
            },
            "Your deposit was refunded.",
            ClosureState::Refunded,
        ),
    ] {
        let evidence = ready(
            validate_closure_evidence(
                &selected_quote(),
                &prepared(),
                Some(text),
                proposal(payload),
            )
            .unwrap(),
        );
        assert_eq!(evidence.suggested_target, expected);
    }
    let weak = validate_closure_evidence(
        &selected_quote(),
        &prepared(),
        Some("We look forward to seeing you."),
        proposal(ClosureEvidencePayload::BookingConfirmation {
            exact_excerpt: "We look forward to seeing you.".to_string(),
        }),
    )
    .unwrap();
    assert!(matches!(
        weak,
        ClosureEvidenceOutcome::ManualReviewRequired { .. }
    ));
}

#[test]
fn deposit_is_cash_flow_and_fee_status_is_derived_only_from_explicit_source_words() {
    let deposit = DepositRecord {
        amount: Money {
            amount_minor: 200_000,
            currency: "AUD".to_string(),
        },
        due_at: Some("2026-11-01T00:00:00Z".to_string()),
        paid_at: None,
        refundable: Some(false),
        is_fee: true,
    };
    let schedule = ready(
        validate_closure_evidence(
            &selected_quote(),
            &prepared(),
            Some("A deposit of AUD 2,000 is due on 1 November."),
            proposal(ClosureEvidencePayload::DepositRequest {
                exact_excerpt: "A deposit of AUD 2,000 is due on 1 November.".to_string(),
                deposit: deposit.clone(),
            }),
        )
        .unwrap(),
    );
    assert_eq!(schedule.deposit.as_ref().unwrap().is_fee, false);
    assert_eq!(schedule.deposit.as_ref().unwrap().refundable, None);
    assert_eq!(
        schedule.deadline_at.as_deref(),
        Some("2026-11-01T00:00:00Z")
    );
    assert_eq!(
        deposit_budget_effect(schedule.deposit.as_ref().unwrap()).additional_cost_minor,
        0
    );

    let fee = ready(
        validate_closure_evidence(
            &selected_quote(),
            &prepared(),
            Some("A non-refundable deposit booking fee of AUD 2,000 is due on 1 November."),
            proposal(ClosureEvidencePayload::DepositRequest {
                exact_excerpt:
                    "A non-refundable deposit booking fee of AUD 2,000 is due on 1 November."
                        .to_string(),
                deposit,
            }),
        )
        .unwrap(),
    );
    assert!(fee.deposit.as_ref().unwrap().is_fee);
    assert_eq!(fee.deposit.as_ref().unwrap().refundable, Some(false));

    let mut unsupported = proposal(ClosureEvidencePayload::DepositRequest {
        exact_excerpt: "A deposit of AUD 2,000 is due on 1 November.".to_string(),
        deposit: fee.deposit.clone().unwrap(),
    });
    if let ClosureEvidencePayload::DepositRequest { deposit, .. } = &mut unsupported.payload {
        deposit.amount.amount_minor = 300_000;
    }
    assert!(matches!(
        validate_closure_evidence(
            &selected_quote(),
            &prepared(),
            Some("A deposit of AUD 2,000 is due on 1 November."),
            unsupported,
        )
        .unwrap(),
        ClosureEvidenceOutcome::ManualReviewRequired { .. }
    ));

    let mut premature_payment = fee.deposit.unwrap();
    premature_payment.paid_at = Some("2026-11-01T00:00:00Z".to_string());
    assert!(matches!(
        validate_closure_evidence(
            &selected_quote(),
            &prepared(),
            Some("A deposit of AUD 2,000 is due and paid on 1 November."),
            proposal(ClosureEvidencePayload::DepositRequest {
                exact_excerpt: "A deposit of AUD 2,000 is due and paid on 1 November.".to_string(),
                deposit: premature_payment,
            }),
        )
        .unwrap(),
        ClosureEvidenceOutcome::ManualReviewRequired { .. }
    ));
}

#[test]
fn evidence_id_is_deterministic_and_bound_to_source_version() {
    let input = proposal(ClosureEvidencePayload::BookingConfirmation {
        exact_excerpt: "Booking confirmed".to_string(),
    });
    let first = ready(
        validate_closure_evidence(
            &selected_quote(),
            &prepared(),
            Some("Booking confirmed"),
            input.clone(),
        )
        .unwrap(),
    );
    let second = ready(
        validate_closure_evidence(
            &selected_quote(),
            &prepared(),
            Some("Booking confirmed"),
            input,
        )
        .unwrap(),
    );
    assert_eq!(first.evidence_id, second.evidence_id);
    let mut next_source = prepared();
    next_source.source.source_version_id.push_str(":v2");
    let mut next_proposal = proposal(ClosureEvidencePayload::BookingConfirmation {
        exact_excerpt: "Booking confirmed".to_string(),
    });
    next_proposal.source_version_id = next_source.source.source_version_id.clone();
    let next = ready(
        validate_closure_evidence(
            &selected_quote(),
            &next_source,
            Some("Booking confirmed"),
            next_proposal,
        )
        .unwrap(),
    );
    assert_ne!(first.evidence_id, next.evidence_id);
}

#[test]
fn wrong_quote_or_source_binding_is_rejected_before_fact_validation() {
    let mut wrong = proposal(ClosureEvidencePayload::BookingConfirmation {
        exact_excerpt: "Booking confirmed".to_string(),
    });
    wrong.quotation_version_id = "other-version".to_string();
    assert_eq!(
        validate_closure_evidence(
            &selected_quote(),
            &prepared(),
            Some("Booking confirmed"),
            wrong,
        ),
        Err(ClosureEvidenceError::InvalidBinding)
    );
}
