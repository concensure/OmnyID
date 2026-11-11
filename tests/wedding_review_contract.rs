use omnyid_homeserver::wedding_reviews::{
    ReviewAudience, ReviewExperienceKind, ReviewPolicyInput, ReviewSubjectKind,
    ReviewVerificationState, aggregate_eligible_scores, validate_policy,
};

const MIGRATION: &str = include_str!("../postgres/migrations/0161_wedding_reviews.sql");

#[test]
fn migration_keeps_private_content_out_of_control_and_event_rows() {
    for forbidden in [
        "\n    review_text ",
        "\n    reviewer_email ",
        "\n    reviewer_phone ",
        "\n    proof_bytes ",
        "\n    evidence_content ",
    ] {
        assert!(
            !MIGRATION.contains(forbidden),
            "private review content leaked into relational control schema: {forbidden}"
        );
    }
    assert!(MIGRATION.contains("afp_message_id TEXT NOT NULL"));
    assert!(MIGRATION.contains("attachment_id TEXT NOT NULL"));
    assert!(MIGRATION.contains("metadata JSONB NOT NULL DEFAULT '{}'::jsonb"));
}

#[test]
fn migration_deduplicates_partner_reviews_by_canonical_wedding_subject() {
    assert!(MIGRATION.contains("uq_wedding_reviews_planner_workspace"));
    assert!(MIGRATION.contains("wedding_plan_id, response_workspace_id, vendor_id"));
    assert!(MIGRATION.contains("uq_wedding_reviews_vendor_workspace"));
    assert!(!MIGRATION.contains("owner_user_id, vendor_id)\n    WHERE subject_kind = 'vendor'"));
}

#[test]
fn publication_projection_is_separate_and_filters_current_visibility() {
    assert!(MIGRATION.contains("CREATE TABLE IF NOT EXISTS wedding_review_publications"));
    assert!(MIGRATION.contains("WHERE status = 'published' AND aggregate_eligible"));
    assert!(MIGRATION.contains("experience_kind = 'wedding_held'"));
    assert!(MIGRATION.contains("verification_state = 'verified_wedding_held'"));
}

#[test]
fn policy_keeps_old_booking_claims_out_of_wedding_held_average() {
    let booking = validate_policy(ReviewPolicyInput {
        subject: ReviewSubjectKind::Vendor,
        experience: ReviewExperienceKind::Booking,
        verification: ReviewVerificationState::VerifiedBooking,
        audience: ReviewAudience::PublicReview,
        rating: Some(5),
    })
    .expect("booking experience may be published with its truthful label");
    assert!(!booking.aggregate_eligible);
    assert_eq!(aggregate_eligible_scores(&[5, 4, 3]).unwrap().count, 3);
}
