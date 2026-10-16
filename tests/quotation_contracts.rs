use omnyid_homeserver::quotation::*;

fn anchor(excerpt: &str) -> SourceAnchor {
    SourceAnchor {
        source_id: "source-generic".to_string(),
        source_version_id: "source-generic-v1".to_string(),
        locator: "section=pricing".to_string(),
        exact_excerpt: excerpt.to_string(),
    }
}

fn generic_quote() -> NormalisedQuotation {
    NormalisedQuotation {
        schema_version: QUOTATION_SCHEMA_VERSION.to_string(),
        registry_version: "generic.v1".to_string(),
        identity: QuotationIdentity {
            quotation_id: "production-hire-quote".to_string(),
            version_id: "production-hire-quote-v1".to_string(),
            supersedes_version_id: None,
            vendor_id: "production-supplier".to_string(),
            context_namespace: "production_planner".to_string(),
        },
        lifecycle: QuoteLifecycle::Active,
        currency: "AUD".to_string(),
        issued_at: Some("2026-10-17T00:00:00Z".to_string()),
        valid_until: None,
        sources: vec![SourceReference {
            source_id: "source-generic".to_string(),
            source_version_id: "source-generic-v1".to_string(),
            media_type: "application/pdf".to_string(),
            content_hash: Some("sha256:synthetic".to_string()),
        }],
        line_items: vec![LineItem {
            line_id: "lighting".to_string(),
            label: "Lighting package".to_string(),
            category: "item_rate".to_string(),
            inclusion: InclusionState::Included,
            price_basis: PriceBasis::Fixed,
            effect: LineEffect::Charge,
            unit_price: Some(Money {
                amount_minor: 400_000,
                currency: "AUD".to_string(),
            }),
            quantity: None,
            rate_bps: None,
            percentage_basis_line_ids: Vec::new(),
            evidence: Evidence::confirmed(anchor("Lighting package AUD 4,000")),
        }],
        commercial_terms: vec![CommercialTerm {
            term_id: "bond".to_string(),
            kind: "refundable_bond".to_string(),
            label: "Equipment bond".to_string(),
            amount: Some(Money {
                amount_minor: 50_000,
                currency: "AUD".to_string(),
            }),
            due_at: None,
            refundable: Some(true),
            evidence: Evidence::confirmed(anchor("Refundable equipment bond AUD 500")),
        }],
        unmapped_items: vec![UnmappedItem {
            vendor_label: "Power distro contingency".to_string(),
            proposed_key: None,
            evidence: Evidence::unknown("price not stated"),
        }],
        tax: TaxRule {
            treatment: TaxTreatment::Inclusive,
            rate_bps: Some(1_000),
            evidence: Evidence::confirmed(anchor("All prices include GST")),
        },
    }
}

#[test]
fn non_wedding_generic_quote_round_trips_and_validates() {
    let quotation = generic_quote();
    assert!(validate_normalised_quotation(&quotation).is_empty());
    let encoded = serde_json::to_value(&quotation).unwrap();
    assert_eq!(
        encoded["identity"]["context_namespace"],
        "production_planner"
    );
    assert!(encoded["identity"].get("wedding_plan_id").is_none());
    let decoded: NormalisedQuotation = serde_json::from_value(encoded).unwrap();
    assert_eq!(decoded, quotation);
}

#[test]
fn rust_parses_the_shared_typescript_quotation_fixture() {
    let quotation: NormalisedQuotation = serde_json::from_str(include_str!(
        "fixtures/quotation/generic_normalised_quote.json"
    ))
    .unwrap();
    assert!(validate_normalised_quotation(&quotation).is_empty());
    assert_eq!(quotation.identity.context_namespace, "production_planner");
    assert_eq!(
        quotation.line_items[0]
            .unit_price
            .as_ref()
            .unwrap()
            .amount_minor,
        400_000
    );
    assert_eq!(quotation.commercial_terms[0].refundable, Some(true));
    assert_eq!(
        quotation.unmapped_items[0].evidence.state,
        EvidenceState::Unknown
    );
}

#[test]
fn registry_resolves_aliases_and_venue_extends_generic() {
    let generic = resolve_category_registry("generic.v1").unwrap();
    let venue = resolve_category_registry("venue.v1").unwrap();
    assert_eq!(generic.canonical_key("per head"), Some("per_person_rate"));
    assert_eq!(
        venue.canonical_key("wheelchair access"),
        Some("accessibility")
    );
    assert!(venue.fields.contains_key("minimum_spend"));
    assert!(venue.fields.contains_key("capacity_seated_max"));
    assert_ne!(generic.fingerprint, venue.fingerprint);
}

#[test]
fn material_fingerprint_changes_with_registry_or_distinct_states() {
    let quotation = generic_quote();
    let original = quotation_material_fingerprint(&quotation);

    let mut registry_change = quotation.clone();
    registry_change.registry_version = "generic.v2".to_string();
    assert_ne!(quotation_material_fingerprint(&registry_change), original);

    let mut excluded = quotation.clone();
    excluded.line_items[0].inclusion = InclusionState::Excluded;
    let mut unknown = quotation.clone();
    unknown.line_items[0].inclusion = InclusionState::Unknown;
    let mut zero = quotation.clone();
    zero.line_items[0].unit_price.as_mut().unwrap().amount_minor = 0;
    assert_ne!(quotation_material_fingerprint(&excluded), original);
    assert_ne!(quotation_material_fingerprint(&unknown), original);
    assert_ne!(quotation_material_fingerprint(&zero), original);
    assert_ne!(
        quotation_material_fingerprint(&excluded),
        quotation_material_fingerprint(&unknown)
    );
}

#[test]
fn validation_bounds_money_anchors_and_unmapped_content() {
    let mut quotation = generic_quote();
    quotation.line_items[0]
        .unit_price
        .as_mut()
        .unwrap()
        .amount_minor = MAX_SAFE_AMOUNT_MINOR + 1;
    quotation.line_items[0].evidence.anchors[0].exact_excerpt = "x".repeat(MAX_EXCERPT_CHARS + 1);
    quotation.unmapped_items[0].vendor_label = "x".repeat(MAX_LABEL_CHARS + 1);
    let issues = validate_normalised_quotation(&quotation);
    assert!(
        issues
            .iter()
            .any(|issue| issue.code == "invalid_price_amount")
    );
    assert!(
        issues
            .iter()
            .any(|issue| issue.code == "source_excerpt_too_long")
    );
    assert!(
        issues
            .iter()
            .any(|issue| issue.code == "invalid_unmapped_label")
    );
}

#[test]
fn currency_exponents_are_versionable_integer_metadata() {
    assert_eq!(currency_exponent("AUD"), Some(2));
    assert_eq!(currency_exponent("JPY"), Some(0));
    assert_eq!(currency_exponent("KWD"), Some(3));
    assert_eq!(currency_exponent("aud"), None);
}
