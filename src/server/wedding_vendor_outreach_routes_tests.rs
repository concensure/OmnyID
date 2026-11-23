use super::*;

fn sample_couple() -> WeddingVendorOutreachCoupleInput {
    WeddingVendorOutreachCoupleInput {
        date_or_season: Some("March 2027".to_string()), location: Some("Sydney".to_string()), guest_count: None,
        budget_comfort: None, budget_category_label: None, budget_category_amount: None, budget_currency: None,
        top_priorities: vec!["flowers".to_string(), "photography".to_string()],
        atmosphere_description: None, vendor_preferences: None, couple_names: None, deal_breakers: vec![],
    }
}

#[test]
fn deterministic_outreach_uses_vendor_category_allocation_instead_of_total_budget() {
    let mut couple = sample_couple();
    couple.budget_comfort = Some("AUD $13,900 total budget".to_string());
    couple.budget_category_label = Some("Venue & Ceremony".to_string());
    couple.budget_category_amount = Some(8_500.0);
    couple.budget_currency = Some("AUD".to_string());
    let payload = deterministic_outreach_payload(&sample_vendor("Harbour Rooms"), &couple, &[]);
    assert!(payload.body_markdown.contains("Venue & Ceremony budget of AUD $8,500"));
    assert!(!payload.body_markdown.contains("13,900"));
    assert_eq!(payload.grounded_on.iter().filter(|field| field.as_str() == "budget_comfort").count(), 1);
}

fn availability_request(state: &str) -> WeddingVendorAvailabilityRequest {
    WeddingVendorAvailabilityRequest {
        wedding_plan_id: "wp_1".to_string(), state: state.to_string(), date_from: Some("2027-03-20".to_string()),
        date_to: None, confidence: Some(0.9), valid_until: None, notes: Some("  Spoke to events manager  ".to_string()), source_ref: None,
    }
}

#[test]
fn availability_accepts_every_documented_state_and_forces_user_source() {
    for state in VENDOR_AVAILABILITY_STATES {
        let input = availability_input_from_request("u1", "v1", availability_request(state)).expect("valid state");
        assert_eq!(input.state, state); assert_eq!(input.source, "user");
        assert_eq!(input.notes.as_deref(), Some("Spoke to events manager"));
    }
}

#[test]
fn availability_rejects_junk_state_dates_and_confidence() {
    let err = availability_input_from_request("u1", "v1", availability_request("maybe")).err().expect("junk state rejected");
    assert_eq!(err.0, StatusCode::BAD_REQUEST); assert!(err.1.contains("maybe"));
    let mut bad_date = availability_request("booked"); bad_date.date_from = Some("20/03/2027".to_string());
    assert!(availability_input_from_request("u1", "v1", bad_date).is_err());
    let mut inverted = availability_request("booked"); inverted.date_to = Some("2027-03-01".to_string());
    assert!(availability_input_from_request("u1", "v1", inverted).is_err());
    let mut confidence = availability_request("booked"); confidence.confidence = Some(2.0);
    assert!(availability_input_from_request("u1", "v1", confidence).is_err());
    let mut valid_until = availability_request("booked"); valid_until.valid_until = Some("tomorrow".to_string());
    assert!(availability_input_from_request("u1", "v1", valid_until).is_err());
    let mut no_plan = availability_request("booked"); no_plan.wedding_plan_id = "  ".to_string();
    assert!(availability_input_from_request("u1", "v1", no_plan).is_err());
}

#[test]
fn vendor_name_is_required() {
    let request = WeddingVendorOutreachDraftRequest {
        vendor: WeddingVendorOutreachVendorInput { name: "   ".to_string(), category: None, website_url: None, address: None, source_url: None, snippet: None },
        couple: sample_couple(), wedding_plan_id: "wp_1".to_string(), verify_questions: vec![],
    };
    assert!(request.vendor.name.trim().is_empty());
}

#[test]
fn field_lengths_and_grounding_are_bounded() {
    let long = "x".repeat(MAX_COUPLE_FIELD_CHARS + 1);
    let err = reject_if_over_length("couple.location", &Some(long), MAX_COUPLE_FIELD_CHARS).expect_err("expected rejection");
    assert_eq!(err.0, StatusCode::BAD_REQUEST); assert!(err.1.contains("too long"));
    assert!(reject_if_over_length("couple.location", &Some("Sydney".to_string()), MAX_COUPLE_FIELD_CHARS).is_ok());
    assert!(!couple_has_grounding(&WeddingVendorOutreachCoupleInput::default()));
    assert!(couple_has_grounding(&sample_couple()));
    let mut only_priorities = WeddingVendorOutreachCoupleInput::default(); only_priorities.top_priorities = vec!["venue".to_string()];
    assert!(couple_has_grounding(&only_priorities));
}

fn sample_vendor(name: &str) -> WeddingVendorOutreachVendorInput {
    WeddingVendorOutreachVendorInput { name: name.to_string(), category: Some("venue".to_string()), website_url: None, address: None, source_url: None, snippet: None }
}

#[test]
fn deterministic_outreach_draft_uses_only_supplied_couple_fields() {
    let payload = deterministic_outreach_payload(&sample_vendor("Mackay Family Estate"), &sample_couple(), &[]);
    assert!(payload.subject.contains("Mackay Family Estate")); assert!(payload.body_markdown.contains("March 2027"));
    assert!(payload.body_markdown.contains("Sydney")); assert!(payload.body_markdown.contains("flowers, photography"));
    assert!(!payload.body_markdown.contains("120 guests"));
    assert_eq!(payload.grounded_on, vec!["date_or_season".to_string(), "location".to_string(), "top_priorities".to_string()]);
}

#[test]
fn deterministic_outreach_draft_includes_user_reviewable_verify_questions() {
    let questions = vec!["Could you confirm the seated capacity?".to_string()];
    let payload = deterministic_outreach_payload(&sample_vendor("Mackay Family Estate"), &sample_couple(), &questions);
    assert!(payload.body_markdown.contains("answers to capacity")); assert_eq!(payload.grounded_on.len(), 3);
}

#[test]
fn deterministic_outreach_asks_vendor_to_confirm_explicit_deal_breakers() {
    let mut couple = sample_couple();
    couple.deal_breakers = vec!["step-free access".to_string(), "an indoor wet-weather plan".to_string()];
    let payload = deterministic_outreach_payload(&sample_vendor("Harbour Rooms"), &couple, &[]);
    assert!(payload.body_markdown.contains("confirm that you can meet these requirements"));
    assert!(payload.body_markdown.contains("step-free access; an indoor wet-weather plan"));
    assert!(payload.grounded_on.contains(&"deal_breakers".to_string()));
}

#[test]
fn deterministic_outreach_uses_currency_topics_paragraphs_and_onboarding_signature() {
    let mut couple = sample_couple(); couple.budget_comfort = Some("AUD $13,900 total budget".to_string()); couple.couple_names = Some("Alex Morgan".to_string());
    let payload = deterministic_outreach_payload(&sample_vendor("Bondi Icebergs Club"), &couple, &["Could you confirm capacity?".to_string(), "Could you confirm price?".to_string()]);
    let body = finalize_outreach_body(&payload.body_markdown, &couple);
    assert!(body.contains("total budget of AUD $13,900")); assert!(!body.contains("budget budget"));
    assert!(body.contains("We would also appreciate answers to capacity and price."));
    assert!(body.contains("\n\nWe would be happy to share any other details you need.\n\n"));
    assert!(body.ends_with("Kind regards,\n\nAlex Morgan"));
}

#[test]
fn parses_and_validates_model_response() {
    let raw = "```json\n{\"subject\": \"Enquiry\", \"body_markdown\": \"Hello there. We are planning a Sydney wedding. Could you send availability?\", \"grounded_on\": [\"location\"]}\n```";
    let payload = parse_outreach_model_payload(raw).expect("should parse");
    assert_eq!(payload.subject, "Enquiry");
    assert_eq!(payload.body_markdown, "Hello there.\n\nWe are planning a Sydney wedding.\n\nCould you send availability?");
    assert_eq!(payload.grounded_on, vec!["location".to_string()]);
    assert!(parse_outreach_model_payload("{\"subject\":\"Enquiry\",\"body_markdown\":\"Hello\",\"grounded_on\":[]}").is_err());
    assert!(parse_outreach_model_payload("{\"subject\":\"\",\"body_markdown\":\"Hello\",\"grounded_on\":[\"location\"]}").is_err());
}

#[test]
fn preserves_model_paragraphs_for_outreach_email() {
    let body = "Hello there team.\n\nWe are planning a Sydney wedding.\n\nCould you send availability and package options?";
    assert_eq!(normalized_outreach_paragraphs(body), body);
}
