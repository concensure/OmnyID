/*
 * @module-id: rust.server.user-management-routes.tests
 * @primary-capability: rust.source-module
 * @locs-version: 2.0
 * @stability: active
 * @owner: omnyid
 */

use serde_json::json;
use std::sync::{Mutex, OnceLock};

fn env_lock() -> std::sync::MutexGuard<'static, ()> {
    static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    LOCK.get_or_init(|| Mutex::new(()))
        .lock()
        .expect("env lock")
}

#[test]
fn normalize_admin_user_action_accepts_supported_actions() {
    assert_eq!(
        super::normalize_admin_user_action(" revoke_all_sessions "),
        Some("revoke_all_sessions")
    );
    assert_eq!(
        super::normalize_admin_user_action("REVOKE_SUPPORT_ACCESS"),
        Some("revoke_support_access")
    );
    assert_eq!(
        super::normalize_admin_user_action(" suspend_account "),
        Some("suspend_account")
    );
    assert_eq!(
        super::normalize_admin_user_action("reactivate_account"),
        Some("reactivate_account")
    );
}

#[test]
fn normalize_admin_user_action_rejects_unknown_actions() {
    assert_eq!(super::normalize_admin_user_action("suspend_user"), None);
    assert_eq!(super::normalize_admin_user_action(""), None);
}

#[test]
fn admin_users_list_limit_is_bounded_before_querying() {
    assert_eq!(super::admin_users_list_limit(None), 50);
    assert_eq!(super::admin_users_list_limit(Some(0)), 1);
    assert_eq!(super::admin_users_list_limit(Some(-10)), 1);
    assert_eq!(super::admin_users_list_limit(Some(75)), 75);
    assert_eq!(super::admin_users_list_limit(Some(10_000)), 200);
}

#[test]
fn normalize_runtime_remediation_action_accepts_supported_action() {
    assert_eq!(
        super::normalize_runtime_remediation_action(" issue_cleanup_receipt "),
        Some("issue_cleanup_receipt")
    );
    assert_eq!(
        super::normalize_runtime_remediation_action("complete_cleanup_receipt"),
        Some("complete_cleanup_receipt")
    );
    assert_eq!(
        super::normalize_runtime_remediation_action("preview_cleanup"),
        None
    );
}

#[test]
fn parse_meminfo_bytes_uses_available_memory() {
    let parsed = super::parse_meminfo_bytes(
        "\
MemTotal:        8000000 kB
MemFree:         1000000 kB
MemAvailable:   3000000 kB
",
    );

    assert_eq!(parsed, Some((5_000_000 * 1024, 8_000_000 * 1024)));
}

#[test]
fn parse_meminfo_bytes_falls_back_to_free_memory() {
    let parsed = super::parse_meminfo_bytes(
        "\
MemTotal:        8000000 kB
MemFree:         1000000 kB
",
    );

    assert_eq!(parsed, Some((7_000_000 * 1024, 8_000_000 * 1024)));
}

#[test]
fn parse_df_bytes_extracts_used_and_total_bytes() {
    let parsed = super::parse_df_bytes(
        "\
Filesystem     1B-blocks       Used Available Use% Mounted on
/dev/sda1    100000000000 31000000000 69000000000  31% /
",
    );

    assert_eq!(parsed, Some((31_000_000_000, 100_000_000_000)));
}

#[test]
fn parse_df_bytes_rejects_impossible_usage() {
    let parsed = super::parse_df_bytes(
        "\
Filesystem     1B-blocks       Used Available Use% Mounted on
/dev/sda1             100        200         0 200% /
",
    );

    assert_eq!(parsed, None);
}

#[test]
fn admin_wedding_ai_routing_policy_requires_explicit_audit_and_budget_flags() {
    let _env = crate::server::wedding_admin_ai_policy::test_env_lock();
    unsafe {
        std::env::remove_var("OMNYID_WEDDING_ADMIN_AI_ROUTING_ENABLED");
        std::env::remove_var("OMNYID_WEDDING_ADMIN_AI_AUDIT_RECEIPTS_ENABLED");
        std::env::remove_var("OMNYID_WEDDING_ADMIN_AI_DAILY_USD_LIMIT");
        std::env::remove_var("OMNYID_WEDDING_ADMIN_AI_DAILY_REQUEST_LIMIT");
        std::env::remove_var("OMNYID_WEDDING_ADMIN_AI_DAILY_TOKEN_LIMIT");
    }

    let policy = super::admin_wedding_ai_routing_policy_json();

    assert_eq!(policy["backendPolicyEndpointMounted"], true);
    assert_eq!(policy["tenantBoundaryEnforced"], true);
    assert_eq!(policy["weddingTemplateScopeOnly"], true);
    assert_eq!(policy["masterAgentQueryExcluded"], true);
    assert_eq!(policy["auditReceiptProjectionReady"], false);
    assert_eq!(policy["budgetGuardrailsReady"], false);
    assert_eq!(policy["routingEnabled"], false);
}

#[test]
fn admin_wedding_ai_routing_policy_passes_with_explicit_production_flags() {
    let _env = crate::server::wedding_admin_ai_policy::test_env_lock();
    unsafe {
        std::env::set_var("OMNYID_WEDDING_ADMIN_AI_ROUTING_ENABLED", "true");
        std::env::set_var("OMNYID_WEDDING_ADMIN_AI_AUDIT_RECEIPTS_ENABLED", "true");
        std::env::set_var("OMNYID_WEDDING_ADMIN_AI_DAILY_USD_LIMIT", "5");
        std::env::set_var("OMNYID_WEDDING_ADMIN_AI_DAILY_REQUEST_LIMIT", "60");
    }

    let policy = super::admin_wedding_ai_routing_policy_json();

    assert_eq!(policy["backendPolicyEndpointMounted"], true);
    assert_eq!(policy["auditReceiptProjectionReady"], true);
    assert_eq!(policy["tenantBoundaryEnforced"], true);
    assert_eq!(policy["budgetGuardrailsReady"], true);
    assert_eq!(policy["weddingTemplateScopeOnly"], true);
    assert_eq!(policy["masterAgentQueryExcluded"], true);
    assert_eq!(policy["routingEnabled"], true);

    unsafe {
        std::env::remove_var("OMNYID_WEDDING_ADMIN_AI_ROUTING_ENABLED");
        std::env::remove_var("OMNYID_WEDDING_ADMIN_AI_AUDIT_RECEIPTS_ENABLED");
        std::env::remove_var("OMNYID_WEDDING_ADMIN_AI_DAILY_USD_LIMIT");
        std::env::remove_var("OMNYID_WEDDING_ADMIN_AI_DAILY_REQUEST_LIMIT");
    }
}

#[test]
fn admin_third_party_tool_policy_reads_shared_tool_env_flags() {
    let _env = env_lock();
    unsafe {
        std::env::set_var(
            "OMNYID_ADMIN_TOOL_GOOGLE_MAPS_PLATFORM_WEDDING_TEMPLATE_ENABLED",
            "true",
        );
        std::env::set_var("OMNYID_ADMIN_TOOL_WEATHERAPI_ALL_USERS_ENABLED", "true");
        std::env::set_var(
            "OMNYID_ADMIN_TOOL_WEATHERAPI_MONTHLY_FREE_QUOTA_LABEL",
            "1m calls/month",
        );
    }

    let policy = super::admin_third_party_tool_policy_json();
    let policies = policy["policies"].as_array().expect("policies array");
    let maps = policies
        .iter()
        .find(|entry| entry["toolId"] == "google-maps-platform")
        .expect("maps policy");
    let weather = policies
        .iter()
        .find(|entry| entry["toolId"] == "weatherapi")
        .expect("weather policy");
    let cloudinary = policies
        .iter()
        .find(|entry| entry["toolId"] == "cloudinary")
        .expect("cloudinary policy");

    assert_eq!(maps["enabledForAllUsers"], false);
    assert_eq!(maps["enabledForWeddingTemplate"], true);
    assert_eq!(weather["enabledForAllUsers"], true);
    assert_eq!(weather["enabledForWeddingTemplate"], true);
    assert_eq!(weather["monthlyFreeQuotaLabel"], "1m calls/month");
    assert_eq!(cloudinary["enabledForAllUsers"], false);
    assert_eq!(cloudinary["enabledForWeddingTemplate"], false);
    assert_eq!(policy["sourceLabel"], "admin-third-party-tool-policy-env");

    unsafe {
        std::env::remove_var("OMNYID_ADMIN_TOOL_GOOGLE_MAPS_PLATFORM_WEDDING_TEMPLATE_ENABLED");
        std::env::remove_var("OMNYID_ADMIN_TOOL_WEATHERAPI_ALL_USERS_ENABLED");
        std::env::remove_var("OMNYID_ADMIN_TOOL_WEATHERAPI_MONTHLY_FREE_QUOTA_LABEL");
    }
}

#[test]
fn admin_third_party_tool_policy_sanitizes_and_merges_saved_file_policy() {
    let request = super::AdminThirdPartyToolPolicyWriteRequest {
        policies: vec![
            super::AdminThirdPartyToolPolicyWriteRecord {
                tool_id: "google-maps-platform".to_string(),
                enabled_for_all_users: Some(false),
                enabled_for_wedding_template: Some(true),
                monthly_free_quota_label: Some("  $200 credit/month  ".to_string()),
                quota_used_label: None,
            },
            super::AdminThirdPartyToolPolicyWriteRecord {
                tool_id: "cloudinary".to_string(),
                enabled_for_all_users: Some(true),
                enabled_for_wedding_template: Some(false),
                monthly_free_quota_label: None,
                quota_used_label: Some("12 transforms".to_string()),
            },
        ],
    };
    let saved_policy =
        super::sanitize_admin_third_party_tool_policy(request).expect("sanitized policy");
    let suffix = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .expect("system time")
        .as_nanos();
    let policy_path = std::env::temp_dir().join(format!(
        "omnyid-admin-third-party-tool-policy-{}.json",
        suffix
    ));
    std::fs::write(
        &policy_path,
        serde_json::to_string_pretty(&saved_policy).expect("policy json"),
    )
    .expect("write policy");

    let policy = super::admin_third_party_tool_policy_json_with_file(Some(
        policy_path.to_string_lossy().to_string(),
    ));
    let policies = policy["policies"].as_array().expect("policies array");
    let maps = policies
        .iter()
        .find(|entry| entry["toolId"] == "google-maps-platform")
        .expect("maps policy");
    let cloudinary = policies
        .iter()
        .find(|entry| entry["toolId"] == "cloudinary")
        .expect("cloudinary policy");

    assert_eq!(maps["enabledForWeddingTemplate"], true);
    assert_eq!(maps["monthlyFreeQuotaLabel"], "$200 credit/month");
    assert_eq!(cloudinary["enabledForAllUsers"], true);
    assert_eq!(cloudinary["quotaUsedLabel"], "12 transforms");

    let _ = std::fs::remove_file(policy_path);
}

#[test]
fn admin_third_party_tool_policy_rejects_unknown_tools() {
    let err = super::sanitize_admin_third_party_tool_policy(
        super::AdminThirdPartyToolPolicyWriteRequest {
            policies: vec![super::AdminThirdPartyToolPolicyWriteRecord {
                tool_id: "personal-user-secret".to_string(),
                enabled_for_all_users: Some(true),
                enabled_for_wedding_template: Some(true),
                monthly_free_quota_label: None,
                quota_used_label: None,
            }],
        },
    )
    .expect_err("unknown tool should fail");

    assert_eq!(err.0, super::StatusCode::BAD_REQUEST);
    assert!(err.1.contains("unsupported toolId"));
}

#[test]
fn admin_wedding_api_stack_reports_redacted_admin_secret_status() {
    let _env = env_lock();
    unsafe {
        std::env::set_var(
            "OMNYID_ADMIN_GOOGLE_PLACES_API_KEY",
            "secret-google-places-key",
        );
        std::env::remove_var("OMNYID_ADMIN_GOOGLE_MAPS_KEY");
        std::env::remove_var("OMNYID_GOOGLE_MAPS_KEY");
    }

    let stack = super::admin_wedding_api_stack_json();
    let connected = stack["connectedAppIds"]
        .as_array()
        .expect("connected app ids");
    assert!(connected.iter().any(|value| value == "google-places-api"));
    assert!(
        !connected
            .iter()
            .any(|value| value == "google-maps-platform")
    );
    assert!(!stack.to_string().contains("secret-google-places-key"));

    let providers = stack["providers"].as_array().expect("providers");
    let places = providers
        .iter()
        .find(|entry| entry["connectedAppId"] == "google-places-api")
        .expect("places status");
    assert_eq!(places["configured"], true);
    assert_eq!(
        places["sourceLabel"],
        "env:OMNYID_ADMIN_GOOGLE_PLACES_API_KEY"
    );

    unsafe {
        std::env::remove_var("OMNYID_ADMIN_GOOGLE_PLACES_API_KEY");
    }
}

#[test]
fn admin_third_party_tool_policy_save_path_sanitizes_internal_errors() {
    let source = include_str!("wedding_admin.rs");
    let start = source
        .find("pub(super) async fn admin_third_party_tool_policy_update_http(")
        .expect("policy update handler exists");
    let end = source[start..]
        .find("\npub(super) async fn admin_wedding_ops_metrics_http(")
        .map(|offset| start + offset)
        .expect("ops metrics handler follows policy update");
    let handler_source = &source[start..end];

    assert!(handler_source.contains("map_err(internal_http_error)"));
    assert!(handler_source.contains("failed to prepare admin third-party tool policy directory"));
    assert!(handler_source.contains("failed to save admin third-party tool policy"));
    assert!(!handler_source.contains("format!(\"failed to prepare policy directory: {err}\")"));
    assert!(!handler_source.contains("format!(\"failed to save policy: {err}\")"));
}

#[test]
fn wedding_vendor_write_input_validates_urls_dates_and_photo_slots() {
    let invalid = super::wedding_vendor_write_input(super::WeddingVendorWriteRequest {
        attributes: None,
        vendor_slug: "harbour-house".to_string(),
        vendor_name: "Harbour House".to_string(),
        category: "Venue".to_string(),
        service_area: "Sydney, NSW".to_string(),
        address: None,
        website_url: Some("venue.example.test".to_string()),
        contact_phone: None,
        contact_email: None,
        source_url: None,
        source_label: None,
        source_checked_at: Some("2026-99-99".to_string()),
        status: Some("active".to_string()),
        notes: None,
        evidence: None,
        caveat_labels: None,
        photos: Some(vec![super::WeddingVendorPhotoRequest {
            slot: 4,
            photo_url: "https://cdn.example.test/venue.jpg".to_string(),
            alt_text: None,
            source_label: None,
            source_url: None,
            retrieved_at: None,
            licence_metadata: None,
        }]),
    });

    assert!(invalid.is_err());

    let duplicate_slots = super::wedding_vendor_write_input(super::WeddingVendorWriteRequest {
        attributes: None,
        vendor_slug: "harbour-house".to_string(),
        vendor_name: "Harbour House".to_string(),
        category: "Venue".to_string(),
        service_area: "Sydney, NSW".to_string(),
        address: None,
        website_url: Some("https://venue.example.test".to_string()),
        contact_phone: None,
        contact_email: None,
        source_url: Some("https://source.example.test".to_string()),
        source_label: None,
        source_checked_at: Some("2026-09-19".to_string()),
        status: Some("active".to_string()),
        notes: None,
        evidence: None,
        caveat_labels: None,
        photos: Some(vec![
            super::WeddingVendorPhotoRequest {
                slot: 1,
                photo_url: "https://cdn.example.test/one.jpg".to_string(),
                alt_text: None,
                source_label: None,
                source_url: None,
                retrieved_at: None,
                licence_metadata: None,
            },
            super::WeddingVendorPhotoRequest {
                slot: 1,
                photo_url: "https://cdn.example.test/two.jpg".to_string(),
                alt_text: None,
                source_label: None,
                source_url: None,
                retrieved_at: None,
                licence_metadata: None,
            },
        ]),
    });

    assert!(duplicate_slots.is_err());
}

#[test]
fn wedding_vendor_list_limit_is_bounded_for_public_and_admin_routes() {
    assert_eq!(super::wedding_vendor_list_limit(None), 200);
    assert_eq!(super::wedding_vendor_list_limit(Some(0)), 1);
    assert_eq!(super::wedding_vendor_list_limit(Some(-50)), 1);
    assert_eq!(super::wedding_vendor_list_limit(Some(20)), 20);
    assert_eq!(super::wedding_vendor_list_limit(Some(50_000)), 200);
    assert_eq!(super::admin_wedding_vendor_list_limit(None), 500);
    assert_eq!(super::admin_wedding_vendor_list_limit(Some(0)), 1);
    assert_eq!(super::admin_wedding_vendor_list_limit(Some(50_000)), 500);
}

#[test]
fn wedding_vendor_write_input_accepts_clean_vendor_payload() {
    let input = super::wedding_vendor_write_input(super::WeddingVendorWriteRequest {
        attributes: None,
        vendor_slug: "harbour-house".to_string(),
        vendor_name: "Harbour House".to_string(),
        category: "Venue".to_string(),
        service_area: "Sydney, NSW".to_string(),
        address: Some("1 Harbour St".to_string()),
        website_url: Some("https://venue.example.test".to_string()),
        contact_phone: Some("+61 400 000 000".to_string()),
        contact_email: Some("events@example.test".to_string()),
        source_url: Some("https://source.example.test".to_string()),
        source_label: Some("Venue website".to_string()),
        source_checked_at: Some("2026-09-19".to_string()),
        status: Some("active".to_string()),
        notes: None,
        evidence: Some(json!({ "address": "1 Harbour St" })),
        caveat_labels: Some(vec!["Request quote".to_string()]),
        photos: Some(vec![super::WeddingVendorPhotoRequest {
            slot: 1,
            photo_url: "https://cdn.example.test/venue.jpg".to_string(),
            alt_text: Some("Ballroom".to_string()),
            source_label: None,
            source_url: Some("https://source.example.test/photo".to_string()),
            retrieved_at: Some("2026-09-20".to_string()),
            licence_metadata: Some(json!({ "use": "editorial" })),
        }]),
    })
    .expect("valid vendor input");

    assert_eq!(input.vendor_slug, "harbour-house");
    assert_eq!(
        input.website_url.as_deref(),
        Some("https://venue.example.test")
    );
    assert_eq!(input.source_checked_at.as_deref(), Some("2026-09-19"));
    assert_eq!(input.photos.len(), 1);
    assert_eq!(input.photos[0].slot, 1);
    assert_eq!(
        input.photos[0].source_url.as_deref(),
        Some("https://source.example.test/photo")
    );
    assert_eq!(
        input.photos[0].licence_metadata,
        json!({ "use": "editorial" })
    );
}

#[test]
fn wedding_vendor_contact_dates_must_be_rfc3339() {
    assert!(
        super::validate_optional_rfc3339(Some("2026-09-19".to_string()), "follow_up_due_at")
            .is_err()
    );
    assert!(
        super::validate_optional_rfc3339(
            Some("2026-09-19T01:00:00Z".to_string()),
            "follow_up_due_at"
        )
        .is_ok()
    );
}

#[test]
fn runtime_remediation_receipt_json_keeps_manual_execution_explicit() {
    let receipt = super::operator_runtime_remediation_receipt_json(
            "01receipt".to_string(),
            "2026-08-28T09:00:00Z".to_string(),
            crate::server::types::RuntimeOperationalGuidanceResponse {
                status: "no_go".to_string(),
                summary: "Execute the bounded operational-history cleanup, rerun proof, and refresh the gate."
                    .to_string(),
                command: "./scripts/oracle-prune-operational-history.ps1 -Apply".to_string(),
                source: "artifacts/production-go-no-go-current/production-go-no-go.json"
                    .to_string(),
                pressure_status: Some("operational_history_present".to_string()),
                pressure_total_rows: Some(19_800),
                cleanup_mode: Some("dry_run".to_string()),
                generated_at: Some("2026-08-28T08:55:00Z".to_string()),
            },
            "issue_cleanup_receipt",
            Some("Issued from operator usage view."),
        );
    assert!(receipt.ok);
    assert_eq!(receipt.action, "issue_cleanup_receipt");
    assert_eq!(receipt.lifecycle_status, "issued");
    assert_eq!(receipt.execution_mode, "manual_operator_shell");
    assert!(receipt.approval_required);
    assert_eq!(receipt.guidance_status, "no_go");
    assert_eq!(receipt.pressure_total_rows, Some(19_800));
    assert_eq!(
        receipt.note.as_deref(),
        Some("Issued from operator usage view.")
    );
    assert_eq!(
        receipt.source,
        "artifacts/production-go-no-go-current/production-go-no-go.json"
    );
    assert_eq!(receipt.receipt_id, "01receipt");
    assert_eq!(receipt.issued_at, "2026-08-28T09:00:00Z");
    assert_eq!(receipt.completed_at, None);
    assert_eq!(receipt.outcome_note, None);
    assert_eq!(receipt.proof_reference, None);
    let _ = json!(receipt);
}
