/*
 * @module-id: rust.db.tests
 * @primary-capability: rust.source-module
 * @locs-version: 2.0
 * @stability: active
 * @owner: omnyid
 */

use super::{
    StorageMode, claim_ref_type_matches_filter, effective_storage_mode,
    enable_server_summarization, group_claim_triples_by_predicate, normalized_claim_ref_type,
    persisted_content_for_mode, persisted_views_for_mode, redacted_views_for_read,
    summarize_claim_neighborhood, summarize_related_claims, summary_and_embedding_for_mode,
    tenant_private_schema_bootstrap_sql, tenant_schema_name,
};
use crate::afp::Message;
use crate::knowledge_curator::{BacklinkKind, BacklinkRecord};
use serde_json::json;

fn sample_proto_message() -> Message {
    Message {
            protocol: "afp-v1".to_string(),
            id: "msg_test_01".to_string(),
            thread_id: "thread_test_01".to_string(),
            parent_id: String::new(),
            from: "agent:test@omnyid.local".to_string(),
            to: vec!["agent:peer@omnyid.local".to_string()],
            timestamp: "2026-03-20T00:00:00Z".to_string(),
            r#type: "task".to_string(),
            kind: None,
            supertags: vec![],
            content: "{\"secret\":true}".to_string(),
            signature: "demo".to_string(),
            encryption: "{\"scheme\":\"omnyid-envelope-v1\",\"algorithm\":\"xchacha20poly1305-ietf\",\"nonce\":\"abc\",\"ciphertext\":\"def\"}".to_string(),
            views: "[]".to_string(),
            references: "[]".to_string(),
            attachments: "[]".to_string(),
            store_in_relational: false,
            subtype: "status".to_string(),
            metadata: "{\"domain\":\"ops\"}".to_string(),
        }
}

#[test]
fn encrypted_messages_default_to_ciphertext_only_storage() {
    unsafe {
        std::env::remove_var("OMNYID_ALLOW_PLAINTEXT_STORAGE");
    }
    let message = sample_proto_message();
    let mode = effective_storage_mode(
        &message,
        &json!({"secret": true}),
        &json!({
            "scheme": "omnyid-envelope-v1",
            "algorithm": "xchacha20poly1305-ietf",
            "nonce": "abc",
            "ciphertext": "def"
        }),
    );
    assert_eq!(mode, StorageMode::CiphertextOnly);
}

#[test]
fn ciphertext_only_mode_removes_plaintext_content() {
    let persisted = persisted_content_for_mode(
        &StorageMode::CiphertextOnly,
        &json!({"secret": "message"}),
        &json!({
            "scheme": "omnyid-envelope-v1",
            "algorithm": "xchacha20poly1305-ietf",
            "nonce": "abc",
            "ciphertext": "def"
        }),
    );
    assert_eq!(persisted["omnyid_storage"]["mode"], "ciphertext_only");
    assert_eq!(persisted["omnyid_storage"]["plaintext_removed"], true);
}

#[test]
fn ciphertext_only_mode_removes_plaintext_views() {
    let persisted = persisted_views_for_mode(
        &StorageMode::CiphertextOnly,
        &json!([{"format": "email", "content": {"body": "secret"}}]),
        &json!({
            "scheme": "omnyid-envelope-v1",
            "algorithm": "xchacha20poly1305-ietf",
            "nonce": "abc",
            "ciphertext": "def"
        }),
    );
    assert_eq!(persisted[0]["format"], "system");
    assert_eq!(persisted[0]["content"]["plaintext_removed"], true);
}

#[test]
fn encrypted_messages_redact_views_on_read() {
    let redacted = redacted_views_for_read(
        &json!([{"format": "email", "content": {"body": "secret"}}]),
        &json!({
            "scheme": "omnyid-envelope-v1",
            "algorithm": "xchacha20poly1305-ietf",
            "nonce": "abc",
            "ciphertext": "def"
        }),
    );
    assert_eq!(redacted[0]["format"], "system");
    assert_eq!(redacted[0]["content"]["mode"], "ciphertext_only");
}

#[test]
fn server_summarization_defaults_to_disabled() {
    unsafe {
        std::env::remove_var("OMNYID_ENABLE_SERVER_SUMMARIZATION");
    }
    assert!(!enable_server_summarization());
}

#[test]
fn ciphertext_only_mode_disables_summary_generation() {
    let (summary, embedding) =
        summary_and_embedding_for_mode(&StorageMode::CiphertextOnly, &json!({"text": "hello"}));
    assert!(summary.is_none());
    assert!(embedding.is_none());
}

#[test]
fn bootstrap_schema_contains_mail_sync_checkpoints_table() {
    let schema = include_str!("../../postgres/migrations/0001_init.sql");
    assert!(schema.contains("CREATE TABLE IF NOT EXISTS mail_sync_checkpoints"));
}

#[test]
fn tenant_schema_name_normalizes_user_ids() {
    assert_eq!(tenant_schema_name("01J8K9XYZ789"), "user_01j8k9xyz789");
    assert_eq!(
        tenant_schema_name("user:abc@omnyid.com"),
        "user_user_abc_omnyid_com"
    );
    assert_eq!(tenant_schema_name(""), "user_tenant");
}

#[test]
fn tenant_private_schema_bootstrap_contains_core_private_tables() {
    let statements = tenant_private_schema_bootstrap_sql("user_test");
    let joined = statements.join("\n");
    assert!(joined.contains("CREATE SCHEMA IF NOT EXISTS \"user_test\""));
    assert!(joined.contains("\"user_test\".messages"));
    assert!(joined.contains("\"user_test\".attachments"));
    assert!(joined.contains("\"user_test\".agent_task_queue"));
    assert!(joined.contains("\"user_test\".agent_focus_items"));
    assert!(joined.contains("\"user_test\".agent_triggers"));
    assert!(joined.contains("\"user_test\".agent_delegations"));
    assert!(joined.contains("\"user_test\".agent_capability_registry"));
    assert!(joined.contains("\"user_test\".user_llm_config"));
    assert!(joined.contains("\"user_test\".llm_usage_log"));
    assert!(joined.contains("\"user_test\".saved_workflows"));
    assert!(joined.contains("\"user_test\".workflow_deployments"));
    assert!(joined.contains("\"user_test\".workflow_runs"));
    assert!(joined.contains("\"user_test\".workflow_wait_resume"));
    assert!(joined.contains("\"user_test\".sync_devices"));
    assert!(joined.contains("\"user_test\".personalization_events"));
    assert!(joined.contains("public.notify_new_message()"));
}

#[test]
fn migration_list_starts_with_versioned_init_baseline() {
    assert_eq!(super::MIGRATIONS[0].0, "0001_init");
    assert!(
        super::MIGRATIONS[0]
            .2
            .contains("CREATE TABLE IF NOT EXISTS messages")
    );
}

#[test]
fn migration_list_includes_workflow_state_baseline() {
    assert_eq!(super::MIGRATIONS[1].0, "0002_workflow_state");
    assert!(
        super::MIGRATIONS[1]
            .2
            .contains("CREATE TABLE IF NOT EXISTS outbound_email_receipts")
    );
    assert!(
        super::MIGRATIONS[1]
            .2
            .contains("CREATE TABLE IF NOT EXISTS integration_capabilities")
    );
    assert!(
        super::MIGRATIONS[1]
            .2
            .contains("CREATE TABLE IF NOT EXISTS personalization_events")
    );
}

#[test]
fn migration_list_includes_accounts_baseline() {
    assert_eq!(super::MIGRATIONS[2].0, "0003_accounts");
    assert!(
        super::MIGRATIONS[2]
            .2
            .contains("CREATE TABLE IF NOT EXISTS users")
    );
    assert!(
        super::MIGRATIONS[2]
            .2
            .contains("CREATE TABLE IF NOT EXISTS managed_agents")
    );
}

#[test]
fn migration_list_includes_runtime_deployments_baseline() {
    assert_eq!(super::MIGRATIONS[3].0, "0004_runtime_deployments");
    assert!(
        super::MIGRATIONS[3]
            .2
            .contains("CREATE TABLE IF NOT EXISTS runtime_deployments")
    );
}

#[test]
fn migration_list_includes_user_onboarding_baseline() {
    assert_eq!(super::MIGRATIONS[4].0, "0005_user_onboarding");
    assert!(
        super::MIGRATIONS[4]
            .2
            .contains("CREATE TABLE IF NOT EXISTS user_onboarding")
    );
}

#[test]
fn migration_list_includes_waitlist_submissions_baseline() {
    assert_eq!(super::MIGRATIONS[5].0, "0006_waitlist_submissions");
    assert!(
        super::MIGRATIONS[5]
            .2
            .contains("CREATE TABLE IF NOT EXISTS waitlist_submissions")
    );
}

#[test]
fn migration_list_includes_knowledge_triple_index() {
    let last = super::MIGRATIONS
        .iter()
        .find(|entry| entry.0 == "0054_knowledge_triple_index")
        .expect("knowledge triple index migration present");
    assert!(
        last.2
            .contains("CREATE TABLE IF NOT EXISTS afp_knowledge_triples")
    );
    assert!(last.2.contains("subject_norm"));
    assert!(last.2.contains("predicate_norm"));
}

#[test]
fn migration_list_includes_daemon_heartbeat_retention_hardening() {
    let migration = super::MIGRATIONS
        .iter()
        .find(|entry| entry.0 == "0081_daemon_heartbeat_retention")
        .expect("daemon heartbeat retention migration present");
    assert!(migration.2.contains("daemon_heartbeats_created_at_idx"));
    assert!(migration.2.contains("Retain only the most recent 48 hours"));
}

#[test]
fn migration_list_includes_operator_runtime_remediation_receipts() {
    let migration = super::MIGRATIONS
        .iter()
        .find(|entry| entry.0 == "0083_operator_runtime_remediation_receipts")
        .expect("operator runtime remediation receipts migration present");
    assert!(
        migration
            .2
            .contains("CREATE TABLE IF NOT EXISTS operator_runtime_remediation_receipts")
    );
    assert!(
        migration
            .2
            .contains("idx_operator_runtime_remediation_receipts_operator_time")
    );
}

#[test]
fn migration_list_includes_operator_runtime_remediation_receipt_completion() {
    let migration = super::MIGRATIONS
        .iter()
        .find(|entry| entry.0 == "0084_operator_runtime_remediation_receipt_completion")
        .expect("operator runtime remediation receipt completion migration present");
    assert!(
        migration
            .2
            .contains("ALTER TABLE operator_runtime_remediation_receipts")
    );
    assert!(
        migration
            .2
            .contains("lifecycle_status TEXT NOT NULL DEFAULT 'issued'")
    );
    assert!(
        migration
            .2
            .contains("idx_operator_runtime_remediation_receipts_operator_status_time")
    );
}

#[test]
fn normalized_claim_ref_type_collapses_common_semantic_aliases() {
    assert_eq!(normalized_claim_ref_type("supports"), "supports");
    assert_eq!(normalized_claim_ref_type("supported_by"), "supports");
    assert_eq!(normalized_claim_ref_type("contradicts"), "refutes");
    assert_eq!(normalized_claim_ref_type("mentions"), "mentions");
    assert_eq!(normalized_claim_ref_type(""), "mentions");
}

#[test]
fn group_claim_triples_by_predicate_sorts_by_group_size() {
    let triples = vec![
        json!({"predicate": "supports", "subject": "A", "object": "B"}),
        json!({"predicate": "supports", "subject": "C", "object": "D"}),
        json!({"predicate": "refutes", "subject": "X", "object": "Y"}),
    ];
    let groups = group_claim_triples_by_predicate(&triples);
    assert_eq!(groups.len(), 2);
    assert_eq!(groups[0]["predicate"], "supports");
    assert_eq!(groups[0]["count"], 2);
    assert_eq!(groups[1]["predicate"], "refutes");
    assert_eq!(groups[1]["count"], 1);
}

#[test]
fn summarize_claim_neighborhood_reports_edge_counts_and_predicates() {
    let supports = vec![json!({"message_id": "a"}), json!({"message_id": "b"})];
    let refutes = vec![json!({"message_id": "c"})];
    let mentions = vec![json!({"message_id": "d"})];
    let triples = vec![
        json!({"predicate": "supports", "subject": "A", "object": "B"}),
        json!({"predicate": "supports", "subject": "C", "object": "D"}),
        json!({"predicate": "refutes", "subject": "E", "object": "F"}),
    ];

    let summary = summarize_claim_neighborhood(&supports, &refutes, &mentions, &triples);

    assert_eq!(summary["support_count"], 2);
    assert_eq!(summary["refute_count"], 1);
    assert_eq!(summary["mention_count"], 1);
    assert_eq!(summary["triple_count"], 3);
    assert_eq!(summary["net_support"], 1);
    assert_eq!(summary["dominant_predicates"][0]["predicate"], "supports");
    assert_eq!(summary["dominant_predicates"][0]["count"], 2);
    assert_eq!(summary["triple_groups"][0]["predicate"], "supports");
}

#[test]
fn claim_ref_type_matches_filter_accepts_all_and_specific_stances() {
    assert!(claim_ref_type_matches_filter("supports", None));
    assert!(claim_ref_type_matches_filter("supports", Some("all")));
    assert!(claim_ref_type_matches_filter(
        "supported_by",
        Some("supports")
    ));
    assert!(claim_ref_type_matches_filter(
        "contradicts",
        Some("refutes")
    ));
    assert!(!claim_ref_type_matches_filter("mentions", Some("supports")));
}

#[test]
fn summarize_related_claims_orders_by_hop_then_edge_count() {
    let node_hops = std::collections::BTreeMap::from([
        ("claim_b".to_string(), 1usize),
        ("claim_c".to_string(), 2usize),
    ]);
    let edges = vec![
        BacklinkRecord {
            backlink_id: "b1".to_string(),
            user_id: "user_1".to_string(),
            source_id: "anchor".to_string(),
            target_id: "claim_b".to_string(),
            link_kind: BacklinkKind::ExplicitRef,
            ref_type: "supports".to_string(),
            similarity: Some(0.0),
            entities: vec![],
            created_at: "2026-01-01T00:00:00Z".to_string(),
            curator_run_id: String::new(),
        },
        BacklinkRecord {
            backlink_id: "b2".to_string(),
            user_id: "user_1".to_string(),
            source_id: "claim_b".to_string(),
            target_id: "claim_c".to_string(),
            link_kind: BacklinkKind::ExplicitRef,
            ref_type: "refutes".to_string(),
            similarity: Some(0.0),
            entities: vec![],
            created_at: "2026-01-01T00:00:01Z".to_string(),
            curator_run_id: String::new(),
        },
    ];

    let claims = summarize_related_claims("anchor", &node_hops, &edges, 10);

    assert_eq!(claims.len(), 2);
    assert_eq!(claims[0]["message_id"], "claim_b");
    assert_eq!(claims[0]["hop_distance"], 1);
    assert_eq!(claims[0]["support_edges"], 1);
    assert_eq!(claims[0]["refute_edges"], 1);
    assert_eq!(claims[1]["message_id"], "claim_c");
    assert_eq!(claims[1]["hop_distance"], 2);
    assert_eq!(claims[1]["refute_edges"], 1);
}

#[test]
fn migration_list_includes_support_access_baseline() {
    assert_eq!(super::MIGRATIONS[6].0, "0007_support_access");
    assert!(
        super::MIGRATIONS[6]
            .2
            .contains("CREATE TABLE IF NOT EXISTS support_access_grants")
    );
}

#[test]
fn migration_list_includes_runtime_backups_baseline() {
    assert_eq!(super::MIGRATIONS[7].0, "0008_runtime_backups");
    assert!(
        super::MIGRATIONS[7]
            .2
            .contains("CREATE TABLE IF NOT EXISTS runtime_backup_policies")
    );
    assert!(
        super::MIGRATIONS[7]
            .2
            .contains("CREATE TABLE IF NOT EXISTS runtime_backups")
    );
}

#[test]
fn migration_list_includes_runtime_restore_drills_baseline() {
    assert_eq!(super::MIGRATIONS[8].0, "0009_runtime_restore_drills");
    assert!(
        super::MIGRATIONS[8]
            .2
            .contains("CREATE TABLE IF NOT EXISTS runtime_restore_drills")
    );
}

#[test]
fn migration_list_includes_runtime_update_policy_baseline() {
    assert_eq!(super::MIGRATIONS[9].0, "0010_runtime_update_policies");
    assert!(
        super::MIGRATIONS[9]
            .2
            .contains("CREATE TABLE IF NOT EXISTS runtime_update_policies")
    );
}

#[test]
fn migration_list_includes_runtime_update_audit_baseline() {
    assert_eq!(super::MIGRATIONS[10].0, "0011_runtime_update_audit");
    assert!(
        super::MIGRATIONS[10]
            .2
            .contains("CREATE TABLE IF NOT EXISTS runtime_update_events")
    );
}

#[test]
fn migration_list_includes_sync_device_policy_baseline() {
    assert_eq!(super::MIGRATIONS[11].0, "0012_sync_device_policies");
    assert!(
        super::MIGRATIONS[11]
            .2
            .contains("CREATE TABLE IF NOT EXISTS sync_device_policies")
    );
}

#[test]
fn migration_list_includes_sync_device_tokens_baseline() {
    assert_eq!(super::MIGRATIONS[12].0, "0013_sync_device_tokens");
    assert!(
        super::MIGRATIONS[12]
            .2
            .contains("CREATE TABLE IF NOT EXISTS sync_device_tokens")
    );
}

#[test]
fn migration_list_includes_runtime_runner_policy_events_baseline() {
    assert_eq!(super::MIGRATIONS[13].0, "0014_runtime_runner_policy_events");
    assert!(
        super::MIGRATIONS[13]
            .2
            .contains("CREATE TABLE IF NOT EXISTS runtime_runner_policy_events")
    );
}

#[test]
fn external_email_lookup_query_remains_present() {
    let query = r#"
            SELECT m.thread_id, m.id
            FROM messages m
            CROSS JOIN LATERAL jsonb_array_elements(m."references") AS ref
            WHERE ref->>'type' = 'external_email'
              AND ref->>'target' = ANY($1)
            ORDER BY m.timestamp DESC
            LIMIT 1
            "#;
    assert!(query.contains("jsonb_array_elements"));
    assert!(query.contains("external_email"));
}

mod tenant_roundtrip;
