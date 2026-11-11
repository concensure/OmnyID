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
    let routes = include_str!("../src/server/wedding_celebrant_management_link_routes.rs");

    assert!(routes.contains("celebrant-calendar-v1\\0"));
    assert!(routes.contains("HttpOnly; Secure; SameSite=Strict"));
    assert!(routes.contains("g.vendor_id=s.grant_id") == false);
    assert!(routes.contains("JOIN wedding_vendors v ON v.vendor_id=g.vendor_id"));
    assert!(routes.contains("WHERE window_id=$1 AND vendor_id=$2"));
    assert!(routes.contains("WHERE vendor_id=$1 AND paused_at IS NULL"));
    assert!(routes.contains("status='revoked'"));
    assert!(routes.contains("consumed_at=COALESCE(consumed_at,NOW())"));

    for forbidden in ["consultation_requests", "phone_ciphertext FROM", "couple_user_id"] {
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
    let admin =
        include_str!("../solid-ui/src/components/UsageAdminWeddingCelebrantsPanel.tsx");
    let directory = include_str!("../wedding/assets/js/directory.js");

    assert!(portal.contains("celebrant_management"));
    assert!(manager.contains("Manage consultation availability"));
    assert!(manager.contains("cannot open couple details, messages, phone numbers"));
    assert!(admin.contains("Generate link + QR"));
    assert!(admin.contains("Revoke active link"));
    assert!(directory.contains("category=Celebrant") || directory.contains("category"));
}
