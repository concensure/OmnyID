/*
 * @module-id: rust.ledger-ingestion-agent
 * @primary-capability: rust.source-module
 * @locs-version: 2.0
 * @stability: active
 * @owner: omnyid
 */

/// Ledger Ingestion Agent â€” periodic auto-context ingestion into the tiered ledger.
///
/// Periodically scans a window of recent AFP messages (default: last 20 minutes),
/// runs entity extraction and thread summarization, and writes the resulting
/// insights as ledger entries plus topology AFP messages. Coarse extraction
/// artifacts remain `knowledge_link`; reusable topology memberships are emitted
/// as `relation_link`.
///
/// This is the backend loop described as "Aggressive Auto-Context Ingestion."
/// It does NOT decrypt messages â€” it operates on `content_preview` and
/// plaintext metadata fields only, exactly like the Background Watcher's
/// metadata-first scan pass.
use chrono::Utc;
use serde_json::{Value, json};
use std::collections::HashSet;
use ulid::Ulid;

use crate::{
    entity_extractor::{
        build_knowledge_link_entity_afp, build_knowledge_link_relationship_afp,
        build_relation_link_entity_afps, build_relation_link_relationship_afps,
        extract_from_afp_content,
    },
    message::{AfpLedgerEntry, AfpTieredLedgerContent},
    thread_summarizer::{auto_summarize_threads, should_auto_summarize},
    tiered_ledger::{LedgerStats, evaluate_promotion_rules},
};

// â”€â”€ Ingestion configuration â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/// Default window of messages to consider per ingestion pass (minutes).
pub const DEFAULT_WINDOW_MINUTES: u32 = 20;

/// Max messages processed per pass to cap CPU usage.
pub const MAX_MESSAGES_PER_PASS: usize = 100;

// â”€â”€ Ingestion run result â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

pub struct IngestionPassResult {
    pub messages_scanned: usize,
    pub entities_extracted: usize,
    pub relationships_extracted: usize,
    pub ledger_entries_created: usize,
    pub ledger_entries: Vec<AfpLedgerEntry>,
    /// AFP messages ready to store (knowledge_link, relation_link, thread_summary, etc.).
    pub afp_messages: Vec<Value>,
    /// Whether a promotion decision was triggered for the target ledger.
    pub promotion_triggered: bool,
    pub ran_at: String,
}

// â”€â”€ Ingestion pass â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/// Run one ingestion pass over a slice of recent AFP messages.
///
/// `messages`        â€” recent messages (content_preview populated, not decrypted)
/// `ledger`          â€” current tiered ledger to ingest into
/// `owner_user_id`   â€” for AFP builder helpers
/// `thread_id`       â€” thread to emit new AFP messages on
///
/// Returns new ledger entries and AFP messages to emit. Callers are responsible
/// for persisting these â€” this function is pure (no DB calls).
pub fn run_ingestion_pass(
    messages: &[Value],
    ledger: &AfpTieredLedgerContent,
    owner_user_id: &str,
    thread_id: &str,
    ledger_created_at: Option<&str>,
) -> IngestionPassResult {
    let ran_at = Utc::now().to_rfc3339();
    let ingestion_pass_id = Ulid::new().to_string();
    let capped: &[Value] = &messages[..messages.len().min(MAX_MESSAGES_PER_PASS)];

    let mut afp_messages: Vec<Value> = Vec::new();
    let mut new_entries: Vec<AfpLedgerEntry> = Vec::new();
    let mut total_entities = 0usize;
    let mut total_relationships = 0usize;

    for msg in capped {
        let msg_id = msg["id"].as_str().unwrap_or("");
        if msg_id.is_empty() {
            continue;
        }

        // Use content_preview as extraction input (never decrypt).
        // Filter out empty strings so they fall through to the metadata-only path.
        let (content_for_extraction, content_source) =
            if let Some(preview) = msg["content_preview"].as_str().filter(|s| !s.is_empty()) {
                (json!({ "text": preview }), "content_preview")
            } else {
                // Fall back to plaintext metadata fields only.
                (metadata_only_content(msg), "metadata_only")
            };

        let extraction = merge_extraction_hints(
            extract_from_afp_content(&content_for_extraction),
            msg.get("metadata")
                .and_then(|metadata| metadata.get("extraction_hints")),
        );
        total_entities += extraction.entities.len();
        total_relationships += extraction.relationships.len();

        if !extraction.entities.is_empty() {
            afp_messages.push(build_knowledge_link_entity_afp(
                owner_user_id,
                thread_id,
                msg_id,
                &extraction,
            ));
            afp_messages.extend(build_relation_link_entity_afps(
                owner_user_id,
                thread_id,
                msg_id,
                &extraction,
            ));
            // Create a ledger entry for significant entity clusters.
            if extraction.entities.len() >= 2 {
                let label = format!(
                    "Entities in {}: {}",
                    msg_id.chars().take(8).collect::<String>(),
                    extraction
                        .entities
                        .iter()
                        .take(3)
                        .map(|e| e.name.as_str())
                        .collect::<Vec<_>>()
                        .join(", ")
                );
                new_entries.push(AfpLedgerEntry {
                    entry_id: Ulid::new().to_string(),
                    label,
                    status: "open".to_string(),
                    authored_by: Some("ledger_ingestion_agent".to_string()),
                    created_at: Some(ran_at.clone()),
                    metadata: Some(ingestion_entry_metadata(
                        &ran_at,
                        &ingestion_pass_id,
                        content_source,
                        extraction.entities.len(),
                    )),
                    ..Default::default()
                });
            }
        }

        if !extraction.relationships.is_empty() {
            afp_messages.push(build_knowledge_link_relationship_afp(
                owner_user_id,
                thread_id,
                msg_id,
                &extraction,
            ));
            afp_messages.extend(build_relation_link_relationship_afps(
                owner_user_id,
                thread_id,
                msg_id,
                &extraction,
            ));
        }
    }

    // Run thread summarization if the window is large enough.
    // Only create the ledger entry when the summary has non-empty condensed text â€”
    // an empty string would produce the sentinel label "Auto-summary: " with no content.
    if should_auto_summarize(capped) {
        let summary = auto_summarize_threads(capped);
        if !summary.condensed_text.is_empty() {
            let summary_entry = AfpLedgerEntry {
                entry_id: Ulid::new().to_string(),
                label: format!(
                    "Auto-summary: {}",
                    &summary.condensed_text.chars().take(60).collect::<String>()
                ),
                status: "open".to_string(),
                authored_by: Some("thread_summarizer".to_string()),
                created_at: Some(ran_at.clone()),
                ..Default::default()
            };
            new_entries.push(summary_entry);
        }
    }

    // Check whether the ledger should be promoted after adding new entries.
    let combined_entry_count = (ledger.entries.len() + new_entries.len()) as u32;
    let days_since_creation = ledger_created_at
        .and_then(|s| s.parse::<chrono::DateTime<Utc>>().ok())
        .map(|created| (Utc::now() - created).num_days().max(0) as u32)
        .unwrap_or(0);
    let stats = LedgerStats {
        update_count: new_entries.len() as u32,
        entry_count: combined_entry_count,
        days_since_creation,
    };
    let promotion_triggered = evaluate_promotion_rules(ledger, &stats).is_some();

    let ledger_entries_created = new_entries.len();
    IngestionPassResult {
        messages_scanned: capped.len(),
        entities_extracted: total_entities,
        relationships_extracted: total_relationships,
        ledger_entries_created,
        ledger_entries: new_entries,
        afp_messages,
        promotion_triggered,
        ran_at,
    }
}

/// Build a minimal plaintext-only content Value from AFP message headers.
/// Used when `content_preview` is absent.
fn metadata_only_content(msg: &Value) -> Value {
    let type_str = msg["type"].as_str().unwrap_or("");
    let subtype = msg["subtype"].as_str().unwrap_or("");
    let from = msg["from"].as_str().unwrap_or("");
    let title = msg["metadata"]["title"].as_str().unwrap_or("");
    let source_url = msg["metadata"]["source_url"].as_str().unwrap_or("");
    json!({
        "text": format!("{type_str} {subtype} from {from} {title} {source_url}")
            .trim()
            .to_string()
    })
}

fn ingestion_entry_metadata(
    ingested_at: &str,
    ingestion_pass_id: &str,
    content_source: &str,
    entity_count: usize,
) -> Value {
    json!({
        "ingested_at": ingested_at,
        "ingestion_pass_id": ingestion_pass_id,
        "content_source": content_source,
        "entity_count": entity_count,
    })
}

fn merge_extraction_hints(
    mut extraction: crate::entity_extractor::ExtractionResult,
    hints: Option<&Value>,
) -> crate::entity_extractor::ExtractionResult {
    let Some(hints) = hints else {
        return extraction;
    };

    extraction.entities.extend(hinted_entities(hints));
    extraction.relationships.extend(hinted_relationships(hints));

    dedupe_entities(&mut extraction.entities);
    dedupe_relationships(&mut extraction.relationships);
    extraction
}

fn hinted_entities(hints: &Value) -> Vec<crate::message::AfpEntityMention> {
    let mut entities = Vec::new();

    if let Some(items) = hints.get("entities").and_then(Value::as_array) {
        for item in items.iter().filter_map(Value::as_str) {
            let trimmed = item.trim();
            if trimmed.is_empty() {
                continue;
            }
            entities.push(crate::message::AfpEntityMention {
                kind: crate::entity_extractor::ENTITY_EVENT.to_string(),
                name: trimmed.to_string(),
                canonical: canonical_label(trimmed),
                context_snippet: Some("extraction_hint".to_string()),
                confidence: 0.92,
            });
        }
    }

    if let Some(items) = hints.get("date_refs").and_then(Value::as_array) {
        for item in items.iter().filter_map(Value::as_str) {
            let trimmed = item.trim();
            if trimmed.is_empty() {
                continue;
            }
            entities.push(crate::message::AfpEntityMention {
                kind: crate::entity_extractor::ENTITY_DATE.to_string(),
                name: trimmed.to_string(),
                canonical: canonical_label(trimmed),
                context_snippet: Some("extraction_hint".to_string()),
                confidence: 0.95,
            });
        }
    }

    if let Some(items) = hints.get("action_refs").and_then(Value::as_array) {
        for item in items.iter().filter_map(Value::as_str) {
            let trimmed = item.trim();
            if trimmed.is_empty() {
                continue;
            }
            entities.push(crate::message::AfpEntityMention {
                kind: crate::entity_extractor::ENTITY_EVENT.to_string(),
                name: trimmed.to_string(),
                canonical: canonical_label(trimmed),
                context_snippet: Some("extraction_hint".to_string()),
                confidence: 0.88,
            });
        }
    }

    entities
}

fn hinted_relationships(hints: &Value) -> Vec<crate::message::AfpRelationship> {
    let mut relationships = Vec::new();
    let Some(items) = hints.get("relations").and_then(Value::as_array) else {
        return relationships;
    };

    for item in items {
        let Some(parts) = item.as_array() else {
            continue;
        };
        if parts.len() != 3 {
            continue;
        }
        let Some(subject) = parts[0].as_str().map(str::trim) else {
            continue;
        };
        let Some(predicate) = parts[1].as_str().map(str::trim) else {
            continue;
        };
        let Some(object) = parts[2].as_str().map(str::trim) else {
            continue;
        };
        if subject.is_empty() || predicate.is_empty() || object.is_empty() {
            continue;
        }
        relationships.push(crate::message::AfpRelationship {
            subject: subject.to_string(),
            predicate: predicate.to_string(),
            object: object.to_string(),
            confidence: 0.92,
        });
    }

    relationships
}

fn dedupe_entities(entities: &mut Vec<crate::message::AfpEntityMention>) {
    let mut seen = HashSet::new();
    entities.retain(|entity| seen.insert((entity.kind.clone(), entity.canonical.clone())));
}

fn dedupe_relationships(relationships: &mut Vec<crate::message::AfpRelationship>) {
    let mut seen = HashSet::new();
    relationships.retain(|relationship| {
        seen.insert((
            relationship.subject.to_lowercase(),
            relationship.predicate.to_lowercase(),
            relationship.object.to_lowercase(),
        ))
    });
}

fn canonical_label(value: &str) -> String {
    value
        .trim()
        .to_lowercase()
        .replace(|ch: char| !ch.is_ascii_alphanumeric(), "_")
        .trim_matches('_')
        .to_string()
}

// â”€â”€ Tests â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

#[cfg(test)]
mod tests {
    use super::*;

    fn make_msg(id: &str, preview: &str) -> Value {
        json!({
            "id": id,
            "thread_id": "thread_01",
            "type": "note",
            "subtype": "ledger",
            "from": "user_01",
            "timestamp": "2026-05-01T10:00:00Z",
            "content_preview": preview,
        })
    }

    fn empty_ledger() -> AfpTieredLedgerContent {
        AfpTieredLedgerContent {
            name: "Test Ledger".to_string(),
            tier: "session".to_string(),
            ..Default::default()
        }
    }

    #[test]
    fn ingestion_pass_scans_messages() {
        let msgs = vec![
            make_msg("m1", "Alice works at Acme Corp."),
            make_msg("m2", "Deal closed at $5M in Q2 2026."),
        ];
        let result = run_ingestion_pass(&msgs, &empty_ledger(), "user_01", "thread_01", None);
        assert_eq!(result.messages_scanned, 2);
    }

    #[test]
    fn ingestion_pass_extracts_entities() {
        let msgs = vec![make_msg(
            "m1",
            "Revenue was $10M in Q1 2026 and $12M in Q2 2026.",
        )];
        let result = run_ingestion_pass(&msgs, &empty_ledger(), "user_01", "thread_01", None);
        assert!(
            result.entities_extracted > 0,
            "should extract date and metric entities"
        );
    }

    #[test]
    fn ingestion_pass_emits_knowledge_link_afp() {
        let msgs = vec![make_msg(
            "m1",
            "Alice works at Acme and Bob reports to Alice.",
        )];
        let result = run_ingestion_pass(&msgs, &empty_ledger(), "user_01", "thread_01", None);
        let has_knowledge_link = result
            .afp_messages
            .iter()
            .any(|m| m["type"].as_str() == Some("knowledge_link"));
        assert!(has_knowledge_link);
    }

    #[test]
    fn ingestion_pass_emits_relation_membership_links_with_relationship_ids() {
        let msgs = vec![make_msg(
            "m1",
            "Revenue was $10M in Q1 2026 and Alice works at Acme.",
        )];
        let result = run_ingestion_pass(&msgs, &empty_ledger(), "user_01", "thread_01", None);
        let has_membership_link = result.afp_messages.iter().any(|m| {
            m["type"].as_str() == Some("relation_link")
                && m["content"]["relationship_id"].is_string()
                && matches!(
                    m["content"]["link_type"].as_str(),
                    Some("shared_entity") | Some("shared_relationship")
                )
        });
        assert!(has_membership_link);
    }

    #[test]
    fn ingestion_pass_caps_at_max_messages() {
        let msgs: Vec<Value> = (0..200)
            .map(|i| make_msg(&format!("m{i}"), "plain text"))
            .collect();
        let result = run_ingestion_pass(&msgs, &empty_ledger(), "user_01", "thread_01", None);
        assert!(result.messages_scanned <= MAX_MESSAGES_PER_PASS);
    }

    #[test]
    fn ingestion_pass_handles_missing_preview() {
        let msg = json!({
            "id": "m1",
            "thread_id": "t1",
            "type": "passive_event",
            "subtype": "email_received",
            "from": "watcher",
            "timestamp": "2026-05-01T10:00:00Z",
        });
        let result = run_ingestion_pass(&[msg], &empty_ledger(), "user_01", "thread_01", None);
        assert_eq!(result.messages_scanned, 1);
    }

    #[test]
    fn ingestion_pass_stamps_provenance_metadata_on_created_entries() {
        let msgs = vec![make_msg(
            "m1",
            "Revenue was $10M in Q1 2026 and Alice works at Acme.",
        )];
        let result = run_ingestion_pass(&msgs, &empty_ledger(), "user_01", "thread_01", None);
        let entry = result
            .ledger_entries
            .first()
            .expect("expected at least one ingestion-created entry");
        let metadata = entry
            .metadata
            .as_ref()
            .expect("expected provenance metadata");
        assert_eq!(metadata["content_source"].as_str(), Some("content_preview"));
        assert!(metadata["ingestion_pass_id"].as_str().is_some());
        assert!(metadata["ingested_at"].as_str().is_some());
        assert!(
            metadata["entity_count"].as_u64().unwrap_or_default() >= 2,
            "expected entity count to reflect extracted cluster size"
        );
    }

    #[test]
    fn metadata_only_content_uses_plaintext_metadata_fields() {
        let msg = json!({
            "id": "m1",
            "thread_id": "t1",
            "type": "note",
            "subtype": "budget_followup",
            "from": "Alice",
            "timestamp": "2026-05-01T10:00:00Z",
            "metadata": {
                "source_url": "https://example.com/budget-q1-2026",
                "title": "Alice works at Acme and reviews Q1 2026 budget update"
            }
        });
        let degraded = metadata_only_content(&msg);
        let text = degraded["text"].as_str().unwrap_or_default();
        assert!(text.contains("Alice works at Acme"));
        assert!(text.contains("https://example.com/budget-q1-2026"));
    }

    #[test]
    fn ingestion_entry_metadata_marks_metadata_only_sources() {
        let metadata =
            ingestion_entry_metadata("2026-05-01T10:00:00Z", "01JTESTPASS", "metadata_only", 1);
        assert_eq!(metadata["content_source"].as_str(), Some("metadata_only"));
        assert_eq!(metadata["entity_count"].as_u64(), Some(1));
    }

    #[test]
    fn ingestion_pass_merges_extraction_hints_without_preview() {
        let msg = json!({
            "id": "m1",
            "thread_id": "t1",
            "type": "note",
            "subtype": "appointment",
            "from": "system",
            "timestamp": "2026-05-01T10:00:00Z",
            "metadata": {
                "extraction_hints": {
                    "entities": ["Dr. Smith", "knee appointment"],
                    "relations": [["Dr. Smith", "is_provider_for", "knee"]],
                    "date_refs": ["2026-07-01T15:00:00Z"],
                    "action_refs": ["confirm"]
                }
            }
        });
        let result = run_ingestion_pass(&[msg], &empty_ledger(), "user_01", "thread_01", None);
        assert!(
            result.entities_extracted >= 4,
            "hinted entities, date refs, and action refs should be merged into extraction"
        );
        assert!(
            result.relationships_extracted >= 1,
            "hinted relationships should be merged into extraction"
        );
        assert!(
            !result.ledger_entries.is_empty(),
            "hint-rich messages should produce a ledger entry even without content_preview"
        );
    }

    #[test]
    fn ingestion_pass_dedupes_overlapping_preview_and_hint_entities() {
        let msg = json!({
            "id": "m1",
            "thread_id": "t1",
            "type": "note",
            "subtype": "finance",
            "from": "system",
            "timestamp": "2026-05-01T10:00:00Z",
            "content_preview": "Revenue was $10M in Q1 2026.",
            "metadata": {
                "extraction_hints": {
                    "entities": ["$10M"],
                    "date_refs": ["Q1 2026"]
                }
            }
        });
        let result = run_ingestion_pass(&[msg], &empty_ledger(), "user_01", "thread_01", None);
        let entry = result
            .ledger_entries
            .first()
            .expect("expected a ledger entry for merged extraction");
        let entity_count = entry
            .metadata
            .as_ref()
            .and_then(|metadata| metadata.get("entity_count"))
            .and_then(Value::as_u64)
            .unwrap_or_default();
        assert!(
            entity_count <= result.entities_extracted as u64,
            "deduped entity count should not inflate beyond merged extraction output"
        );
    }
}
