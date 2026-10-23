use super::*;

#[test]
fn domain_matching_is_exact_and_rejects_public_mail() {
    assert_eq!(
        email_domain("Owner@BloomsByKate.com"),
        Some("bloomsbykate.com".to_string())
    );
    assert!(is_public_mail_domain("gmail.com"));
    assert!(
        !listing_domains(
            &None,
            &Some("https://www.bloomsbykate.com/about".to_string())
        )
        .contains(&"evilbloomsbykate.com".to_string())
    );
    let context = OwnershipContext {
        claim_id: "claim".into(),
        claim_status: "started".into(),
        expires_at: String::new(),
        vendor_id: "vendor".into(),
        vendor_slug: "blooms".into(),
        vendor_name: "Blooms".into(),
        category: "florist".into(),
        service_area: "Sydney".into(),
        website_url: Some("https://bloomsbykate.com".into()),
        contact_email: Some("hello@bloomsbykate.com".into()),
        listing_status: "unclaimed".into(),
        owner_user_id: None,
    };
    assert!(verify_email_domain(&context, "owner@bloomsbykate.com", false).is_err());
    assert!(verify_email_domain(&context, "owner@bloomsbykate.com", true).is_ok());
}

#[test]
fn website_origin_requires_https_and_strips_path() {
    assert_eq!(
        website_origin("https://www.example.com/about"),
        Some("https://example.com".to_string())
    );
    assert_eq!(website_origin("http://example.com"), None);
    assert_eq!(website_origin("https://user@example.com"), None);
}

#[test]
fn social_urls_are_provider_bounded() {
    assert!(
        validated_https_url(
            Some("https://instagram.com/acme".to_string()),
            Some(&["instagram.com"]),
            "Instagram"
        )
        .is_ok()
    );
    assert!(
        validated_https_url(
            Some("https://evil.example/acme".to_string()),
            Some(&["instagram.com"]),
            "Instagram"
        )
        .is_err()
    );
}
