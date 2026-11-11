use omnyid_homeserver::wedding_reviews::{
    ReviewAudience, ReviewExperienceKind, ReviewPolicyInput, ReviewSubjectKind,
    ReviewVerificationState, aggregate_eligible_scores, validate_policy,
};

const MIGRATION: &str = include_str!("../postgres/migrations/0161_wedding_reviews.sql");
const EVIDENCE_ACCESS_MIGRATION: &str =
    include_str!("../postgres/migrations/0162_wedding_review_evidence_access.sql");
const ELIGIBILITY_MIGRATION: &str =
    include_str!("../postgres/migrations/0163_wedding_review_eligibility.sql");
const AUTHOR_LIFECYCLE_MIGRATION: &str =
    include_str!("../postgres/migrations/0164_wedding_review_author_lifecycle.sql");
const CORRECTION_MIGRATION: &str =
    include_str!("../postgres/migrations/0165_wedding_review_correction_receipts.sql");
const MODERATION_MIGRATION: &str =
    include_str!("../postgres/migrations/0166_wedding_review_moderation.sql");
const ROUTES: &str = include_str!("../src/server/wedding_review_routes.rs");
const EVIDENCE_ROUTES: &str = include_str!("../src/server/wedding_review_evidence_routes.rs");
const EVIDENCE_OPERATOR_ROUTES: &str =
    include_str!("../src/server/wedding_review_evidence_operator_routes.rs");
const ELIGIBILITY_ROUTES: &str = include_str!("../src/server/wedding_review_eligibility_routes.rs");
const AUTHOR_ROUTES: &str = include_str!("../src/server/wedding_review_author_routes.rs");
const MODERATION_ROUTES: &str = include_str!("../src/server/wedding_review_moderation_routes.rs");
const PUBLIC_ROUTES: &str = include_str!("../src/server/wedding_review_public_routes.rs");
const MESSAGE_ATTACHMENTS: &str = include_str!("../src/db/message_attachments.rs");
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

#[test]
fn evidence_links_reuse_private_upload_ownership_without_copying_file_content() {
    assert!(EVIDENCE_ROUTES.contains("tenant_schema_name(&user.id)"));
    assert!(EVIDENCE_ROUTES.contains("rr.authored_by_user_id=$1"));
    assert!(EVIDENCE_ROUTES.contains("r.current_revision=$3"));
    assert!(EVIDENCE_ROUTES.contains("wedding_user_onboarding_state"));
    assert!(EVIDENCE_ROUTES.contains("PROOF_RETENTION_DAYS: i64 = 90"));
    for forbidden in [
        "storage_url",
        "download_url",
        "file_bytes",
        "reviewer_email",
    ] {
        assert!(
            !EVIDENCE_ROUTES.contains(forbidden),
            "evidence control route must not copy protected material: {forbidden}"
        );
    }
}

#[test]
fn operator_evidence_access_is_purpose_bound_audited_and_purgeable() {
    assert!(EVIDENCE_ACCESS_MIGRATION.contains("wedding_review_evidence_access_log"));
    assert!(EVIDENCE_ACCESS_MIGRATION.contains("purpose_code TEXT NOT NULL"));
    assert!(EVIDENCE_ACCESS_MIGRATION.contains("status = 'purge_scheduled'"));
    assert!(EVIDENCE_OPERATOR_ROUTES.contains("operator_access_allowed"));
    assert!(EVIDENCE_OPERATOR_ROUTES.contains("build_download_url"));
    assert!(EVIDENCE_OPERATOR_ROUTES.contains("delete_uploaded_file"));
    assert!(EVIDENCE_OPERATOR_ROUTES.contains("delete_private_attachment_by_id"));
    for forbidden in [
        "review_text",
        "reviewer_email",
        "reviewer_phone",
        "storage_key:",
    ] {
        assert!(
            !EVIDENCE_ACCESS_MIGRATION.contains(forbidden),
            "operator evidence audit must remain content-light: {forbidden}"
        );
    }
}

#[test]
fn eligibility_is_versioned_claim_specific_and_private() {
    assert!(ELIGIBILITY_MIGRATION.contains("verification_version BIGINT"));
    assert!(ELIGIBILITY_MIGRATION.contains("wedding_review_eligibility_assessments"));
    assert!(ELIGIBILITY_MIGRATION.contains("probable_duplicate BOOLEAN"));
    assert!(ELIGIBILITY_ROUTES.contains("evaluate_review_eligibility"));
    assert!(ELIGIBILITY_ROUTES.contains("purpose_code IN ('eligibility','evidence')"));
    assert!(ELIGIBILITY_ROUTES.contains("event_month_wholly_past"));
    assert!(ELIGIBILITY_ROUTES.contains("accepted_post_event_delivery"));
    assert!(SERVER.contains(".merge(wedding_review_eligibility_routes::routes())"));
    for forbidden in [
        "review_text",
        "reviewer_email",
        "reviewer_phone",
        "evidence_content",
        "attachment_id",
    ] {
        assert!(
            !ELIGIBILITY_MIGRATION.contains(forbidden),
            "eligibility assessment must not retain private material: {forbidden}"
        );
    }
}

#[test]
fn author_status_and_withdrawal_are_account_scoped_and_content_light() {
    assert!(AUTHOR_LIFECYCLE_MIGRATION.contains("wedding_review_lifecycle_receipts"));
    assert!(AUTHOR_LIFECYCLE_MIGRATION.contains("UNIQUE (actor_user_id, idempotency_key)"));
    assert!(AUTHOR_ROUTES.contains("wedding_user_onboarding_state"));
    assert!(AUTHOR_ROUTES.contains("authored.authored_by_user_id=$2"));
    assert!(AUTHOR_ROUTES.contains("status='withdrawn'"));
    assert!(AUTHOR_ROUTES.contains("status='purge_scheduled'"));
    assert!(SERVER.contains(".merge(wedding_review_author_routes::routes())"));
    for forbidden in [
        "review_text",
        "public_snapshot",
        "attachment_id",
        "reviewer_email",
    ] {
        assert!(
            !AUTHOR_LIFECYCLE_MIGRATION.contains(forbidden),
            "lifecycle receipt leaked private field: {forbidden}"
        );
    }
}

#[test]
fn corrections_preserve_prior_publication_and_replay_edit_pending() {
    assert!(CORRECTION_MIGRATION.contains("'draft', 'submitted', 'edit_pending'"));
    assert!(ROUTES.contains("correction_over_publication"));
    assert!(ROUTES.contains("\"correction_submitted\""));
    assert!(ROUTES.contains("verification_state='unreviewed'"));
    assert!(!ROUTES.contains("UPDATE wedding_review_publications SET status='superseded'"));
}

#[test]
fn moderation_requires_audited_preview_and_idempotent_receipt() {
    assert!(MODERATION_MIGRATION.contains("wedding_review_moderation_access_log"));
    assert!(MODERATION_MIGRATION.contains("wedding_review_moderation_receipts"));
    assert!(MODERATION_MIGRATION.contains("UNIQUE (moderator_user_id, idempotency_key)"));
    assert!(MODERATION_ROUTES.contains("Open the current review preview before deciding it."));
    assert!(MODERATION_ROUTES.contains("INTERVAL '24 hours'"));
    assert!(MODERATION_ROUTES.contains("operator_access_allowed"));
    assert!(SERVER.contains(".merge(wedding_review_moderation_routes::routes())"));
}

#[test]
fn publication_reads_only_the_exact_private_revision_and_builds_a_safe_snapshot() {
    assert!(MESSAGE_ATTACHMENTS.contains("wedding_review_revision_content"));
    assert!(MESSAGE_ATTACHMENTS.contains("subtype = 'wedding_review_revision'"));
    assert!(MESSAGE_ATTACHMENTS.contains("content->>'review_id' = $2"));
    assert!(MODERATION_ROUTES.contains("\"display_label\": \"An OmnyID couple\""));
    assert!(MODERATION_ROUTES.contains("validate_policy(ReviewPolicyInput"));
    let snapshot = MODERATION_ROUTES
        .split("let snapshot = json!({")
        .nth(1)
        .and_then(|tail| tail.split("});").next())
        .expect("bounded public snapshot");
    for forbidden in [
        "owner_user_id",
        "authored_by_user_id",
        "evidence_ref_id",
        "attachment_id",
        "probable_duplicate",
        "reviewer_email",
        "reviewer_phone",
    ] {
        assert!(
            !snapshot.contains(forbidden),
            "public snapshot leaked {forbidden}"
        );
    }
}

#[test]
fn public_projection_uses_only_publications_and_one_eligible_scored_set() {
    assert!(PUBLIC_ROUTES.contains("wedding_review_publications publication"));
    assert!(PUBLIC_ROUTES.contains("publication.status='published'"));
    assert!(PUBLIC_ROUTES.contains("aggregate_eligible_scores(&scores)"));
    assert!(PUBLIC_ROUTES.contains("filter(|row| row.get::<bool, _>(\"aggregate_eligible\"))"));
    assert!(!PUBLIC_ROUTES.contains("wedding_review_evidence_refs"));
    assert!(!PUBLIC_ROUTES.contains("wedding_review_revision_content"));
    assert!(!PUBLIC_ROUTES.contains("tenant_messages_table"));
    assert!(SERVER.contains(".merge(wedding_review_public_routes::routes())"));
}
