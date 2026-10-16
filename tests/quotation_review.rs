use omnyid_homeserver::quotation::*;

fn anchor(excerpt: &str) -> SourceAnchor {
    SourceAnchor {
        source_id: "source-1".to_string(),
        source_version_id: "source-1-v1".to_string(),
        locator: "page:1".to_string(),
        exact_excerpt: excerpt.to_string(),
    }
}

fn line() -> LineItem {
    LineItem {
        line_id: "venue_hire".to_string(),
        label: "Venue hire".to_string(),
        category: "fixed_fee".to_string(),
        inclusion: InclusionState::Required,
        price_basis: PriceBasis::Fixed,
        effect: LineEffect::Charge,
        unit_price: Some(Money {
            amount_minor: 500_000,
            currency: "AUD".to_string(),
        }),
        quantity: None,
        rate_bps: None,
        percentage_basis_line_ids: vec![],
        evidence: Evidence {
            state: EvidenceState::Inferred,
            anchors: vec![anchor("Venue hire $5,000")],
            rationale: Some("extracted".to_string()),
        },
    }
}

fn quotation() -> NormalisedQuotation {
    NormalisedQuotation {
        schema_version: QUOTATION_SCHEMA_VERSION.to_string(),
        registry_version: "venue.v1".to_string(),
        identity: QuotationIdentity {
            quotation_id: "quote-1".to_string(),
            version_id: "quote-1-v1".to_string(),
            supersedes_version_id: None,
            vendor_id: "vendor-1".to_string(),
            context_namespace: "wedding_planner".to_string(),
        },
        lifecycle: QuoteLifecycle::Active,
        currency: "AUD".to_string(),
        issued_at: None,
        valid_until: None,
        sources: vec![SourceReference {
            source_id: "source-1".to_string(),
            source_version_id: "source-1-v1".to_string(),
            media_type: "application/pdf".to_string(),
            content_hash: Some("sha256:synthetic".to_string()),
        }],
        line_items: vec![line()],
        commercial_terms: vec![],
        unmapped_items: vec![],
        tax: TaxRule {
            treatment: TaxTreatment::Exempt,
            rate_bps: None,
            evidence: Evidence::confirmed(anchor("No GST applies")),
        },
    }
}

fn command(quote: &NormalisedQuotation, action: QuotationReviewAction) -> QuotationReviewCommand {
    QuotationReviewCommand {
        command_id: "command-1".to_string(),
        expected_version_id: quote.identity.version_id.clone(),
        expected_material_fingerprint: quotation_material_fingerprint(quote),
        actor_id: "user-1".to_string(),
        reviewed_at: "2026-10-17T10:00:00Z".to_string(),
        action,
    }
}

#[test]
fn confirmation_creates_an_immutable_successor() {
    let original = quotation();
    let result = apply_review_action(
        &original,
        command(
            &original,
            QuotationReviewAction::ConfirmLine {
                line_id: "venue_hire".to_string(),
            },
        ),
    )
    .unwrap();
    let successor = result.quotation.unwrap();
    assert_eq!(
        original.line_items[0].evidence.state,
        EvidenceState::Inferred
    );
    assert_eq!(
        successor.line_items[0].evidence.state,
        EvidenceState::Confirmed
    );
    assert_eq!(
        successor.identity.supersedes_version_id.as_deref(),
        Some("quote-1-v1")
    );
    assert_ne!(
        result.material_fingerprint,
        quotation_material_fingerprint(&original)
    );
}

#[test]
fn corrections_require_registered_source_evidence() {
    let original = quotation();
    let mut replacement = line();
    replacement.unit_price.as_mut().unwrap().amount_minor = 525_000;
    let accepted = apply_review_action(
        &original,
        command(
            &original,
            QuotationReviewAction::CorrectLine {
                line_id: "venue_hire".to_string(),
                replacement: replacement.clone(),
                correction_anchor: anchor("Corrected from source"),
            },
        ),
    )
    .unwrap();
    assert_eq!(
        accepted.quotation.unwrap().line_items[0]
            .unit_price
            .as_ref()
            .unwrap()
            .amount_minor,
        525_000
    );

    let mut foreign = anchor("Unsupported");
    foreign.source_id = "competitor-source".to_string();
    assert_eq!(
        apply_review_action(
            &original,
            command(
                &original,
                QuotationReviewAction::CorrectLine {
                    line_id: "venue_hire".to_string(),
                    replacement,
                    correction_anchor: foreign,
                },
            ),
        ),
        Err(ReviewError::EvidenceRequired)
    );
}

#[test]
fn stale_actions_cannot_overwrite_a_newer_revision() {
    let original = quotation();
    let mut stale = command(
        &original,
        QuotationReviewAction::MarkUnknown {
            line_id: "venue_hire".to_string(),
            reason: "Needs vendor confirmation".to_string(),
        },
    );
    stale.expected_material_fingerprint = "stale".to_string();
    assert_eq!(
        apply_review_action(&original, stale),
        Err(ReviewError::StaleRevision)
    );
}

#[test]
fn low_confidence_material_fields_block_downstream_actions() {
    let gate = material_review_gate(&[
        MaterialReviewField {
            field_id: "price".to_string(),
            materiality: "high".to_string(),
            confidence_bps: 7_900,
            reviewed: false,
            evidence_state: EvidenceState::Inferred,
        },
        MaterialReviewField {
            field_id: "colour".to_string(),
            materiality: "low".to_string(),
            confidence_bps: 2_000,
            reviewed: false,
            evidence_state: EvidenceState::Unknown,
        },
    ]);
    assert!(!gate.ready);
    assert_eq!(gate.blocking_field_ids, vec!["price"]);
}
