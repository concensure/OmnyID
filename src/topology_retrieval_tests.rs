    use super::*;
    use serde_json::json;

    #[test]
    fn build_neighborhood_bundle_uses_explicit_knowledge_links() {
        let messages = vec![
            json!({
                "id": "task_1",
                "thread_id": "thread_1",
                "type": "task",
                "content": { "title": "Finish travel booking" },
                "metadata": {}
            }),
            json!({
                "id": "decision_1",
                "thread_id": "thread_2",
                "type": "decision_request",
                "content": { "title": "Approve hotel budget" },
                "metadata": {}
            }),
            json!({
                "id": "link_1",
                "type": "knowledge_link",
                "content": {
                    "source_message_id": "task_1",
                    "target_message_id": "decision_1",
                    "link_type": "depends_on",
                    "confidence": 0.92
                }
            }),
        ];

        let bundle = build_neighborhood_bundle(&["task_1".to_string()], &messages, 2, 5);
        assert_eq!(bundle.result_budget_used, 1);
        assert_eq!(bundle.items[0].message_id, "decision_1");
        assert_eq!(bundle.items[0].confidence, "high");
        assert_eq!(bundle.items[0].freshness, "stale");
        assert!(bundle.items[0].why_surfaced.contains("depends on"));
    }

    #[test]
    fn build_neighborhood_bundle_uses_relation_links() {
        let messages = vec![
            json!({
                "id": "task_1",
                "thread_id": "thread_1",
                "type": "task",
                "content": { "title": "Finish travel booking" },
                "metadata": {}
            }),
            json!({
                "id": "decision_1",
                "thread_id": "thread_2",
                "type": "decision_request",
                "content": { "title": "Approve hotel budget" },
                "metadata": {}
            }),
            json!({
                "id": "link_1",
                "type": "relation_link",
                "content": {
                    "source_message_id": "task_1",
                    "target_message_id": "decision_1",
                    "link_type": "depends_on",
                    "confidence": 0.92
                }
            }),
        ];

        let bundle = build_neighborhood_bundle(&["task_1".to_string()], &messages, 2, 5);
        assert_eq!(bundle.result_budget_used, 1);
        assert_eq!(bundle.items[0].message_id, "decision_1");
        assert_eq!(bundle.items[0].confidence, "high");
    }

    #[test]
    fn build_neighborhood_bundle_uses_canonical_message_references() {
        let messages = vec![
            json!({
                "id": "task_1",
                "thread_id": "thread_1",
                "type": "ledger",
                "kind": "task",
                "content": { "title": "Finish rollout checklist" },
                "references": [
                    {
                        "type": "message",
                        "target": "project_1",
                        "metadata": { "link_type": "part_of" }
                    }
                ],
                "metadata": {}
            }),
            json!({
                "id": "project_1",
                "thread_id": "thread_2",
                "type": "ledger",
                "kind": "project",
                "content": { "title": "Aurora rollout" },
                "metadata": {}
            }),
        ];

        let bundle = build_neighborhood_bundle(&["task_1".to_string()], &messages, 2, 5);
        assert_eq!(bundle.result_budget_used, 1);
        assert_eq!(bundle.items[0].message_id, "project_1");
        assert_eq!(bundle.items[0].relation_path, vec!["part_of"]);
        assert_eq!(bundle.items[0].confidence, "high");
    }

    #[test]
    fn build_neighborhood_bundle_falls_back_to_thread_and_relationship_groups() {
        let messages = vec![
            json!({
                "id": "msg_1",
                "thread_id": "thread_shared",
                "type": "note",
                "content": { "title": "Weekend planning" },
                "metadata": { "relationship_id": "rel_1" }
            }),
            json!({
                "id": "msg_2",
                "thread_id": "thread_shared",
                "type": "task",
                "content": { "title": "Book lunch reservation" },
                "metadata": {}
            }),
            json!({
                "id": "msg_3",
                "thread_id": "thread_other",
                "type": "message",
                "content": { "title": "Partner follow-up" },
                "metadata": { "relationship_id": "rel_1" }
            }),
        ];

        let bundle = build_neighborhood_bundle(&["msg_1".to_string()], &messages, 2, 5);
        assert_eq!(bundle.items.len(), 2);
        assert!(
            bundle
                .items
                .iter()
                .any(|item| item.relation_path == vec![LINK_TYPE_SAME_RELATIONSHIP])
        );
        assert!(
            bundle
                .items
                .iter()
                .any(|item| item.relation_path == vec![LINK_TYPE_SAME_THREAD])
        );
    }

    #[test]
    fn build_neighborhood_bundle_uses_knowledge_link_membership_groups() {
        let messages = vec![
            json!({
                "id": "msg_1",
                "thread_id": "thread_alpha",
                "type": "note",
                "content": { "title": "Revenue review" },
                "metadata": {}
            }),
            json!({
                "id": "msg_2",
                "thread_id": "thread_beta",
                "type": "decision_request",
                "content": { "title": "Approve Q1 targets" },
                "metadata": {}
            }),
            json!({
                "id": "link_1",
                "type": "knowledge_link",
                "content": {
                    "source_message_id": "msg_1",
                    "relationship_id": "entity:metric:q1_2026",
                    "link_type": "shared_entity",
                    "confidence": 0.88
                },
                "metadata": {
                    "relationship_id": "entity:metric:q1_2026"
                }
            }),
            json!({
                "id": "link_2",
                "type": "knowledge_link",
                "content": {
                    "source_message_id": "msg_2",
                    "relationship_id": "entity:metric:q1_2026",
                    "link_type": "shared_entity",
                    "confidence": 0.91
                },
                "metadata": {
                    "relationship_id": "entity:metric:q1_2026"
                }
            }),
        ];

        let bundle = build_neighborhood_bundle(&["msg_1".to_string()], &messages, 2, 5);
        assert_eq!(bundle.result_budget_used, 1);
        assert_eq!(bundle.items[0].message_id, "msg_2");
        assert_eq!(bundle.items[0].relation_path, vec!["shared_entity"]);
        assert_eq!(bundle.items[0].confidence, "high");
    }

    #[test]
    fn build_neighborhood_bundle_bounds_large_membership_group_fanout() {
        let mut messages = vec![json!({
            "id": "anchor_1",
            "thread_id": "thread_alpha",
            "type": "note",
            "content": { "title": "Anchor metric note" },
            "metadata": {}
        }), json!({
            "id": "anchor_link",
            "type": "knowledge_link",
            "content": {
                "source_message_id": "anchor_1",
                "relationship_id": "entity:metric:large",
                "link_type": "shared_entity",
                "confidence": 0.95
            }
        })];
        for index in 0..72 {
            messages.push(json!({
                "id": format!("member_{index:02}"),
                "thread_id": format!("thread_member_{index:02}"),
                "type": "decision_request",
                "content": { "title": format!("Member decision {index:02}") },
                "metadata": {}
            }));
            messages.push(json!({
                "id": format!("member_link_{index:02}"),
                "type": "knowledge_link",
                "content": {
                    "source_message_id": format!("member_{index:02}"),
                    "relationship_id": "entity:metric:large",
                    "link_type": "shared_entity",
                    "confidence": 0.8
                }
            }));
        }

        let bundle = build_neighborhood_bundle(&["anchor_1".to_string()], &messages, 1, 10);

        assert_eq!(bundle.result_budget_used, 10);
        assert!(bundle
            .items
            .iter()
            .all(|item| item.relation_path == vec!["shared_entity"]));
    }

    #[test]
    fn build_neighborhood_bundle_groups_messages_by_shared_object_refs() {
        let messages = vec![
            json!({
                "id": "msg_1",
                "thread_id": "thread_alpha",
                "type": "note",
                "content": { "title": "Aurora launch risks" },
                "references": [
                    { "type": "project", "target": "project_aurora", "metadata": { "link_type": "about" } }
                ],
                "metadata": {}
            }),
            json!({
                "id": "msg_2",
                "thread_id": "thread_beta",
                "type": "task",
                "content": { "title": "Update Aurora checklist" },
                "metadata": {
                    "entity_id": "project_aurora"
                }
            }),
        ];

        let bundle = build_neighborhood_bundle(&["msg_1".to_string()], &messages, 2, 5);
        assert_eq!(bundle.result_budget_used, 1);
        assert_eq!(bundle.items[0].message_id, "msg_2");
        assert_eq!(bundle.items[0].relation_path, vec![LINK_TYPE_SHARED_OBJECT]);
        assert!(bundle.items[0].why_surfaced.contains("shared object"));
        assert_eq!(bundle.items[0].confidence, "medium");
    }

    #[test]
    fn build_neighborhood_bundle_uses_follow_up_chain_groups() {
        let messages = vec![
            json!({
                "id": "decision_1",
                "thread_id": "thread_alpha",
                "type": "decision_request",
                "content": { "title": "Choose vendor" },
                "metadata": {}
            }),
            json!({
                "id": "task_1",
                "thread_id": "thread_beta",
                "parent_id": "decision_1",
                "type": "task",
                "content": { "title": "Collect final pricing" },
                "metadata": {}
            }),
            json!({
                "id": "note_1",
                "thread_id": "thread_gamma",
                "parent_id": "decision_1",
                "type": "note",
                "content": { "title": "Procurement caveats" },
                "metadata": {}
            }),
        ];

        let bundle = build_neighborhood_bundle(&["task_1".to_string()], &messages, 2, 5);
        assert_eq!(bundle.items.len(), 2);
        assert!(
            bundle
                .items
                .iter()
                .any(|item| item.message_id == "decision_1"
                    && item.relation_path == vec![LINK_TYPE_SAME_FOLLOW_UP_CHAIN])
        );
        assert!(bundle.items.iter().any(|item| item.message_id == "note_1"
            && item.relation_path == vec![LINK_TYPE_SAME_FOLLOW_UP_CHAIN]));
    }

    #[test]
    fn build_neighborhood_bundle_uses_para_supertag_groups() {
        let messages = vec![
            json!({
                "id": "msg_1",
                "thread_id": "thread_alpha",
                "type": "task",
                "content": {
                    "title": "Finalize launch FAQ",
                    "supertags": ["project:launch_2026", "area:marketing"]
                },
                "metadata": {}
            }),
            json!({
                "id": "msg_2",
                "thread_id": "thread_beta",
                "type": "note",
                "content": {
                    "title": "Landing page blockers",
                    "supertags": ["project:launch_2026"]
                },
                "metadata": {}
            }),
            json!({
                "id": "msg_3",
                "thread_id": "thread_gamma",
                "type": "file_ledger",
                "content": {
                    "title": "Brand asset bundle",
                    "supertags": ["resource:brand_assets"]
                },
                "metadata": {
                    "supertags": ["project:launch_2026", "resource:brand_assets"]
                }
            }),
        ];

        let bundle = build_neighborhood_bundle(&["msg_1".to_string()], &messages, 2, 5);
        assert_eq!(bundle.items.len(), 2);
        assert!(
            bundle.items.iter().any(|item| item.message_id == "msg_2"
                && item.relation_path == vec![LINK_TYPE_SAME_PROJECT])
        );
        assert!(
            bundle.items.iter().any(|item| item.message_id == "msg_3"
                && item.relation_path == vec![LINK_TYPE_SAME_PROJECT])
        );
    }

    #[test]
    fn build_neighborhood_bundle_links_file_export_to_ledger() {
        let messages = vec![
            json!({
                "id": "ledger_1",
                "thread_id": "thread_files",
                "type": "file_ledger",
                "subtype": "file_ledger:create",
                "content": {
                    "name": "Project files",
                    "entries": []
                },
                "metadata": {}
            }),
            json!({
                "id": "export_1",
                "thread_id": "thread_exports",
                "type": "file_ledger",
                "subtype": "file_ledger:export_result",
                "content": {
                    "ledger_message_id": "ledger_1",
                    "format": "markdown"
                },
                "metadata": {}
            }),
        ];

        let bundle = build_neighborhood_bundle(&["export_1".to_string()], &messages, 2, 5);
        assert_eq!(bundle.result_budget_used, 1);
        assert_eq!(bundle.items[0].message_id, "ledger_1");
        assert_eq!(
            bundle.items[0].relation_path,
            vec![LINK_TYPE_SAME_FILE_LEDGER]
        );
    }

    #[test]
    fn build_neighborhood_bundle_groups_messages_by_shared_file_path() {
        let messages = vec![
            json!({
                "id": "msg_1",
                "thread_id": "thread_alpha",
                "type": "note",
                "content": {
                    "title": "Launch plan draft",
                    "file_path": "notes/launch-plan.md"
                },
                "metadata": {}
            }),
            json!({
                "id": "msg_2",
                "thread_id": "thread_beta",
                "type": "task",
                "content": {
                    "title": "Revise launch plan",
                },
                "metadata": {
                    "relative_path": "notes/launch-plan.md"
                }
            }),
        ];

        let bundle = build_neighborhood_bundle(&["msg_1".to_string()], &messages, 2, 5);
        assert_eq!(bundle.result_budget_used, 1);
        assert_eq!(bundle.items[0].message_id, "msg_2");
        assert_eq!(
            bundle.items[0].relation_path,
            vec![LINK_TYPE_SAME_FILE_PATH]
        );
        assert!(bundle.items[0].why_surfaced.contains("same file path"));
    }

    #[test]
    fn build_neighborhood_bundle_uses_file_entry_supertags() {
        let messages = vec![
            json!({
                "id": "msg_1",
                "thread_id": "thread_alpha",
                "type": "task",
                "content": {
                    "title": "Prepare renewal review",
                    "supertags": ["project:renewal_2026"]
                },
                "metadata": {}
            }),
            json!({
                "id": "ledger_1",
                "thread_id": "thread_files",
                "type": "file_ledger",
                "content": {
                    "name": "Renewal docs",
                    "entries": [
                        {
                            "entry_id": "file_1",
                            "name": "contract.pdf",
                            "path": "/contracts/contract.pdf",
                            "mime_type": "application/pdf",
                            "size_bytes": 12,
                            "status": "active",
                            "supertags": ["project:renewal_2026"]
                        }
                    ]
                },
                "metadata": {}
            }),
        ];

        let bundle = build_neighborhood_bundle(&["msg_1".to_string()], &messages, 2, 5);
        assert_eq!(bundle.result_budget_used, 1);
        assert_eq!(bundle.items[0].message_id, "ledger_1");
        assert_eq!(bundle.items[0].relation_path, vec![LINK_TYPE_SAME_PROJECT]);
    }

    #[test]
    fn build_neighborhood_bundle_reads_top_level_supertags() {
        let messages = vec![
            json!({
                "id": "msg_1",
                "thread_id": "thread_alpha",
                "type": "ledger",
                "kind": "task",
                "supertags": ["project:renewal_2026"],
                "content": {
                    "title": "Prepare renewal review"
                },
                "metadata": {}
            }),
            json!({
                "id": "msg_2",
                "thread_id": "thread_beta",
                "type": "ledger",
                "kind": "project",
                "supertags": ["project:renewal_2026"],
                "content": {
                    "title": "Renewal 2026"
                },
                "metadata": {}
            }),
        ];

        let bundle = build_neighborhood_bundle(&["msg_1".to_string()], &messages, 2, 5);
        assert_eq!(bundle.result_budget_used, 1);
        assert_eq!(bundle.items[0].message_id, "msg_2");
        assert_eq!(bundle.items[0].relation_path, vec![LINK_TYPE_SAME_PROJECT]);
    }

    #[test]
    fn build_neighborhood_bundle_bounds_large_workspace_group_fanout() {
        let mut messages = vec![json!({
            "id": "anchor_1",
            "thread_id": "thread_alpha",
            "type": "task",
            "timestamp": "2026-06-01T09:00:00Z",
            "supertags": ["project:large_workspace"],
            "content": { "title": "Anchor task" },
            "metadata": {}
        })];
        for index in 0..80 {
            messages.push(json!({
                "id": format!("note_{index:02}"),
                "thread_id": format!("thread_{index:02}"),
                "type": "note",
                "timestamp": format!("2099-06-{:02}T09:00:00Z", 1 + (index % 20)),
                "supertags": ["project:large_workspace"],
                "content": { "title": format!("Large workspace note {index:02}") },
                "metadata": {}
            }));
        }

        let bundle = build_neighborhood_bundle(&["anchor_1".to_string()], &messages, 1, 12);

        assert_eq!(bundle.result_budget_used, 12);
        assert_eq!(bundle.items.len(), 12);
        assert!(bundle
            .items
            .iter()
            .all(|item| item.relation_path == vec![LINK_TYPE_SAME_PROJECT]));
        assert!(bundle.items.iter().all(|item| item.freshness == "fresh"));
        assert!(bundle.coverage_summary.contains("Surfaced 12 related context items"));
    }

    #[test]
    fn build_neighborhood_bundle_groups_connected_notes_by_shared_source_message() {
        let messages = vec![
            json!({
                "id": "upload_1",
                "thread_id": "thread_uploads",
                "type": "message",
                "content": { "title": "Week 3 economics lecture PDF" },
                "metadata": {}
            }),
            json!({
                "id": "parsed_1",
                "thread_id": "thread_notes",
                "type": "parsed_document",
                "content": {
                    "title": "Parsed lecture notes",
                    "source_message_id": "upload_1"
                },
                "metadata": {
                    "source_message_id": "upload_1",
                    "knowledge_pipeline": "connected_notes_ingest"
                }
            }),
            json!({
                "id": "summary_1",
                "thread_id": "thread_notes",
                "type": "knowledge_card",
                "content": {
                    "title": "Opportunity cost summary",
                    "source_id": "upload_1"
                },
                "metadata": {
                    "source_id": "upload_1"
                }
            }),
        ];

        let bundle = build_neighborhood_bundle(&["upload_1".to_string()], &messages, 2, 5);
        assert_eq!(bundle.items.len(), 2);
        assert!(bundle.items.iter().any(|item| {
            item.message_id == "parsed_1"
                && item.relation_path == vec![LINK_TYPE_SAME_SOURCE_MESSAGE]
        }));
        assert!(bundle.items.iter().any(|item| {
            item.message_id == "summary_1"
                && item.relation_path == vec![LINK_TYPE_SAME_SOURCE_MESSAGE]
        }));
    }

    #[test]
    fn build_neighborhood_bundle_falls_back_for_legacy_curator_string_references() {
        let messages = vec![
            json!({
                "id": "msg_1",
                "thread_id": "thread_alpha",
                "type": "note",
                "content": { "title": "Microeconomics week 3" },
                "metadata": {}
            }),
            json!({
                "id": "card_1",
                "thread_id": "thread_knowledge",
                "type": "knowledge_card",
                "content": {
                    "title": "Derived summary",
                    "source_id": "msg_1"
                },
                "references": ["msg_1"],
                "metadata": {}
            }),
        ];

        let bundle = build_neighborhood_bundle(&["card_1".to_string()], &messages, 2, 5);
        assert_eq!(bundle.result_budget_used, 1);
        assert_eq!(bundle.items[0].message_id, "msg_1");
        assert_eq!(
            bundle.items[0].relation_path,
            vec![LINK_TYPE_SAME_SOURCE_MESSAGE]
        );
        assert_eq!(bundle.items[0].confidence, "high");
    }

    #[test]
    fn build_neighborhood_bundle_prefers_fresh_over_stale() {
        let messages = vec![
            json!({
                "id": "anchor_1",
                "thread_id": "thread_alpha",
                "type": "task",
                "timestamp": "2026-06-10T09:00:00Z",
                "content": { "title": "Anchor task" },
                "metadata": {}
            }),
            json!({
                "id": "stale_1",
                "thread_id": "thread_beta",
                "type": "note",
                "timestamp": "2026-05-01T09:00:00Z",
                "content": { "title": "Old note" },
                "metadata": {}
            }),
            json!({
                "id": "fresh_1",
                "thread_id": "thread_gamma",
                "type": "note",
                "timestamp": "2099-06-13T09:00:00Z",
                "content": { "title": "Fresh note" },
                "metadata": {}
            }),
            json!({
                "id": "link_1",
                "type": "relation_link",
                "content": {
                    "source_message_id": "anchor_1",
                    "target_message_id": "stale_1",
                    "link_type": "related",
                    "confidence": 0.95
                }
            }),
            json!({
                "id": "link_2",
                "type": "relation_link",
                "content": {
                    "source_message_id": "anchor_1",
                    "target_message_id": "fresh_1",
                    "link_type": "related",
                    "confidence": 0.80
                }
            }),
        ];

        let bundle = build_neighborhood_bundle(&["anchor_1".to_string()], &messages, 2, 5);
        assert_eq!(bundle.items[0].message_id, "fresh_1");
        assert_eq!(bundle.items[0].freshness, "fresh");
    }

    #[test]
    fn build_neighborhood_bundle_marks_dormant_follow_up_as_reactivated() {
        let messages = vec![
            json!({
                "id": "decision_1",
                "thread_id": "thread_alpha",
                "type": "decision_request",
                "timestamp": "2026-04-01T09:00:00Z",
                "content": { "title": "Choose vendor" },
                "metadata": {}
            }),
            json!({
                "id": "task_1",
                "thread_id": "thread_beta",
                "parent_id": "decision_1",
                "type": "task",
                "timestamp": "2026-04-03T09:00:00Z",
                "content": { "title": "Collect pricing" },
                "metadata": {}
            }),
        ];

        let bundle = build_neighborhood_bundle(&["task_1".to_string()], &messages, 2, 5);
        assert_eq!(bundle.items[0].message_id, "decision_1");
        assert_eq!(bundle.items[0].freshness, "reactivated");
        assert!(
            bundle.items[0]
                .why_surfaced
                .contains("dormant but still-linked")
        );
    }
