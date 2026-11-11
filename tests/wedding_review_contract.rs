use omnyid_homeserver::wedding_reviews::{
    ReviewAudience, ReviewExperienceKind, ReviewPolicyInput, ReviewSubjectKind,
    ReviewVerificationState, aggregate_eligible_scores, validate_policy,
};

const MIGRATION: &str = include_str!("../postgres/migrations/0161_wedding_reviews.sql");
const ROUTES: &str = include_str!("../src/server/wedding_review_routes.rs");
const SERVER: &str = include_str!("../src/server/mod.rs");

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

#[test]
fn revision_route_reuses_auth_plan_ownership_and_private_afp_authorities() {
    assert!(ROUTES.contains("authenticated_user(&state.db, &headers)"));
    assert!(
        ROUTES.contains("wedding_user_onboarding_state WHERE user_id=$1 AND wedding_plan_id=$2")
    );
    assert!(ROUTES.contains("store_private_app_message("));
    assert!(ROUTES.contains("wedding_review_revision"));
    assert!(ROUTES.contains("OMNYID_WEDDING_REVIEWS_ENABLED"));
    assert!(SERVER.contains(".merge(wedding_review_routes::routes())"));
}

#[test]
fn receipt_contract_is_content_light_and_scoped_to_authenticated_actor() {
    assert!(MIGRATION.contains("CREATE TABLE IF NOT EXISTS wedding_review_command_receipts"));
    assert!(MIGRATION.contains("UNIQUE (owner_user_id, idempotency_key)"));
    assert!(MIGRATION.contains("request_hash TEXT NOT NULL"));
    let receipt_schema = MIGRATION
        .split("CREATE TABLE IF NOT EXISTS wedding_review_command_receipts")
        .nth(1)
        .and_then(|tail| {
            tail.split("CREATE INDEX IF NOT EXISTS idx_wedding_review_command_receipts_review")
                .next()
        })
        .expect("receipt schema");
    for forbidden in [
        "review_text",
        "body",
        "email",
        "phone",
        "attachment",
        "public_snapshot",
    ] {
        assert!(
            !receipt_schema.contains(forbidden),
            "receipt must not retain private content field: {forbidden}"
        );
    }
}

#[test]
fn expected_revision_and_partner_safe_canonical_lock_are_both_enforced() {
    assert!(ROUTES.contains("current_revision != i64::try_from(request.expected_revision)"));
    assert!(ROUTES.contains("vendor_id IS NOT DISTINCT FROM $4 FOR UPDATE"));
    assert!(ROUTES.contains("ON CONFLICT (owner_user_id,idempotency_key) DO NOTHING"));
    assert!(ROUTES.contains("if review.get::<String, _>(\"owner_user_id\") == user.id"));
}
