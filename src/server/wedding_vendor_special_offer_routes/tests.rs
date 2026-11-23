use super::*;

#[test]
fn slot_terms_are_bounded_and_keep_date_specific_prices() {
    let slot = validate_slot_request(DateSlotDraftRequest {
        local_date: "2027-07-03".into(),
        timezone: "Australia/Sydney".into(),
        starts_at: Some("17:00".into()),
        ends_at: Some("23:00".into()),
        space_label: Some("Garden room".into()),
        session_label: Some("Evening".into()),
        maximum_capacity: Some(90),
        minimum_spend_cents: Some(1_250_000),
        indicative_per_head_cents: Some(18_000),
        inclusions: vec!["Room hire".into(), "Staffing".into()],
        public_conditions: Some("Subject to confirmation".into()),
    })
    .unwrap();
    assert_eq!(slot.terms.maximum_capacity, Some(90));
    assert_eq!(slot.terms.indicative_per_head_cents, Some(18_000));
    assert_eq!(slot.terms.inclusions.len(), 2);
}

#[test]
fn unsafe_date_terms_are_rejected() {
    let result = validate_slot_request(DateSlotDraftRequest {
        local_date: "2027-07-03".into(),
        timezone: "Australia/Sydney".into(),
        starts_at: Some("23:00".into()),
        ends_at: Some("17:00".into()),
        space_label: None,
        session_label: None,
        maximum_capacity: None,
        minimum_spend_cents: None,
        indicative_per_head_cents: Some(-1),
        inclusions: vec![],
        public_conditions: None,
    });
    assert!(result.is_err());
}

#[test]
fn unknown_timezone_is_rejected() {
    let result = validate_slot_request(DateSlotDraftRequest {
        local_date: "2027-07-03".into(),
        timezone: "Sydney-ish".into(),
        starts_at: None,
        ends_at: None,
        space_label: None,
        session_label: None,
        maximum_capacity: Some(90),
        minimum_spend_cents: Some(1_000_000),
        indicative_per_head_cents: Some(15_000),
        inclusions: vec![],
        public_conditions: None,
    });
    assert!(result.is_err());
}

#[test]
fn allowlist_policy_is_false_without_an_enabled_flag() {
    assert!(!rollout_allowed_from(
        false,
        "vendor@example.com",
        "vendor@example.com"
    ));
    assert!(rollout_allowed_from(
        true,
        "vendor@example.com",
        "vendor@example.com"
    ));
}

#[test]
fn provisional_holds_require_a_bounded_expiry() {
    let missing = SlotCommandRequest {
        vendor_slug: "vendor".into(),
        idempotency_key: "hold-missing-expiry".into(),
        expected_revision: 1,
        action: VendorSlotAction::PlaceHold,
        hold_expires_at: None,
        confirmation_expires_at: None,
        reason: None,
    };
    assert!(slot_command(&missing).is_err());

    let excessive = SlotCommandRequest {
        hold_expires_at: Some((Utc::now() + ChronoDuration::days(MAX_HOLD_DAYS + 1)).to_rfc3339()),
        ..missing
    };
    assert!(slot_command(&excessive).is_err());
}
