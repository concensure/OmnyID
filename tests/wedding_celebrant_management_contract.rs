#[test]
fn migration_seeds_reviewed_profiles_and_scoped_capability_storage() {
    let migration = include_str!(
        "../postgres/migrations/0159_wedding_celebrant_profiles_and_management_links.sql"
    );

    assert!(migration.contains("wedding_celebrant_management_grants"));
    assert!(migration.contains("wedding_celebrant_management_sessions"));
    assert!(migration.contains("wedding_celebrant_management_events"));
    assert!(migration.contains("uq_celebrant_active_management_grant"));
    assert!(migration.contains("'celebrant_profile'"));
    assert!(migration.contains("'image_status','awaiting owner licence'"));
    assert!(migration.contains("vendor_slug='celebrant-enzo-weddings-hunter-valley'"));
    assert!(migration.contains("SET category='Venue'"));
    assert_eq!(migration.matches("('celebrant-").count(), 15);
}

#[test]
fn management_link_is_vendor_scoped_revocable_and_content_light() {
    let routes = concat!(
        include_str!("../src/server/wedding_celebrant_management_link_routes.rs"),
        include_str!("../src/server/wedding_celebrant_management_link_routes/admin.rs")
    );

    assert!(routes.contains("celebrant-calendar-v1\\0"));
    assert!(routes.contains("HttpOnly; Secure; SameSite=Strict"));
    assert!(routes.contains("g.vendor_id=s.grant_id") == false);
    assert!(routes.contains("JOIN wedding_vendors v ON v.vendor_id=g.vendor_id"));
    assert!(routes.contains("WHERE window_id=$1 AND vendor_id=$2"));
    assert!(routes.contains("WHERE vendor_id=$1 AND paused_at IS NULL"));
    assert!(routes.contains("status='revoked'"));
    assert!(routes.contains("consumed_at=COALESCE(consumed_at,NOW())"));

    for forbidden in [
        "consultation_requests",
        "phone_ciphertext FROM",
        "couple_user_id",
    ] {
        assert!(
            !routes.contains(forbidden),
            "management capability must not expose {forbidden}"
        );
    }
}

#[test]
fn public_and_admin_surfaces_support_the_scoped_flow() {
    let portal = include_str!("../solid-ui/src/vendor-claim-main.tsx");
    let manager = include_str!("../solid-ui/src/components/vendor/CelebrantManagementFlow.tsx");
    let admin = include_str!("../solid-ui/src/components/UsageAdminWeddingCelebrantsPanel.tsx");
    let directory = include_str!("../wedding/assets/js/directory.js");

    assert!(portal.contains("celebrant_management"));
    assert!(manager.contains("Manage wedding dates and consultation times"));
    assert!(manager.contains("date_slot_upsert"));
    assert!(manager.contains("cannot open couple details, messages, phone numbers"));
    assert!(admin.contains("Generate link + QR"));
    assert!(admin.contains("one private setup link for both calendars"));
    assert!(admin.contains("Revoke active link"));
    assert!(admin.contains("Prepare several outreach links"));
    assert!(admin.contains("Copy all invitations"));
    assert!(directory.contains("category=Celebrant") || directory.contains("category"));
}

#[test]
fn bulk_link_preparation_reuses_the_scoped_grant_and_preserves_active_links() {
    let routes = concat!(
        include_str!("../src/server/wedding_celebrant_management_link_routes.rs"),
        include_str!("../src/server/wedding_celebrant_management_link_routes/admin.rs")
    );

    assert!(routes.contains("/admin/wedding/celebrant-management/links/batch"));
    assert!(routes.contains("normalize_batch_vendor_ids"));
    assert!(routes.contains("replace_active.unwrap_or(false)"));
    assert!(routes.contains("FOR UPDATE"));
    assert!(routes.contains("Bearer links are returned once"));
    assert!(!routes.contains("management_url\" FROM"));
}

#[test]
fn call_actions_and_operator_funnel_use_durable_evidence() {
    let directory = include_str!("../src/server/wedding_vendor_directory_page.rs");
    let calls =
        include_str!("../solid-ui/src/components/vendor/VendorCelebrantConsultationsPanel.tsx");
    let admin = include_str!("../src/server/wedding_celebrant_management_link_routes.rs");
    let migration =
        include_str!("../postgres/migrations/0160_wedding_vendor_funnel_metric_indexes.sql");

    assert!(directory.contains("phone_tel_href"));
    assert!(calls.contains("phoneTelHref"));
    assert!(calls.contains("native calling app"));
    assert!(admin.contains("growth_wedding_activations"));
    assert!(admin.contains("wedding_enquiry_envelopes"));
    assert!(admin.contains("provider_event.event_kind='delivered'"));
    assert!(admin.contains("phone_verification_configured"));
    assert!(admin.contains("consultations_enabled"));
    assert!(migration.contains("WHERE direction='to_vendor'"));
    assert!(!migration.contains("message_body"));
    // Explanatory comments may name excluded fields; the metric SQL itself
    // must not select or persist any phone column.
    assert!(!migration.contains("contact_phone"));
    assert!(!migration.contains("phone_ciphertext"));
}

#[test]
fn onboarding_operations_keep_consent_outreach_and_capabilities_separate() {
    let migration =
        include_str!("../postgres/migrations/0169_wedding_celebrant_onboarding_operations.sql");
    let operations = include_str!("../src/server/wedding_celebrant_management_ops_routes.rs");
    let links = concat!(
        include_str!("../src/server/wedding_celebrant_management_link_routes.rs"),
        include_str!("../src/server/wedding_celebrant_management_link_routes/admin.rs")
    );
    let admin = include_str!("../solid-ui/src/components/UsageAdminWeddingCelebrantsPanel.tsx");
    let manager = include_str!("../solid-ui/src/components/vendor/CelebrantManagementFlow.tsx");

    assert!(migration.contains("wedding_celebrant_outreach"));
    assert!(migration.contains("participation_status"));
    assert!(migration.contains("capability_scopes"));
    assert!(operations.contains("opted_out"));
    assert!(operations.contains("status='revoked'"));
    assert!(operations.contains("minimal unpublished preview"));
    assert!(!operations.contains("message_body"));
    assert!(links.contains("celebrant_funnel"));
    assert!(links.contains("wedding_date_availability"));
    assert!(links.contains("vec![\"consultation_availability\", \"wedding_date_availability\"]"));
    assert!(links.contains("ensure_wedding_date_offer"));
    assert!(links.contains("authenticated_body(request).await?"));
    assert!(admin.contains("Open official register"));
    assert!(admin.contains("Content-light outreach"));
    assert!(admin.contains("Add a minimal unpublished celebrant listing"));
    assert!(manager.contains("Accept participation"));
    assert!(manager.contains("Pause"));
    assert!(manager.contains("Decline"));
}
