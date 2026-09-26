/*
 * @module-id: rust.entity-extractor
 * @primary-capability: rust.source-module
 * @locs-version: 2.0
 * @stability: active
 * @owner: omnyid
 */

/// Entity & Relationship Extractor â€” heuristics-based typed claim extraction.
///
/// Scans decrypted AFP message content for named entities (people, companies,
/// metrics, events, dates, locations) and subject-predicate-object triples.
/// Emits topology AFP messages (`knowledge_link` and `relation_link`) with no
/// LLM calls or re-encryption.
///
/// Design: pattern-based heuristics first; LLM extraction is a future extension
/// wired in via the `ExtractorBackend` trait.
use chrono::Utc;
use serde_json::{Value, json};
use ulid::Ulid;

use crate::message::{
    AFP_SUBTYPE_KNOWLEDGE_LINK_ENTITY, AFP_SUBTYPE_KNOWLEDGE_LINK_RELATIONSHIP,
    AFP_TYPE_KNOWLEDGE_LINK, AFP_TYPE_RELATION_LINK, AfpEntityMention, AfpKnowledgeLinkContent,
    AfpRelationship,
};

// â”€â”€ Entity kind constants â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

pub const ENTITY_PERSON: &str = "person";
pub const ENTITY_COMPANY: &str = "company";
pub const ENTITY_METRIC: &str = "metric";
pub const ENTITY_EVENT: &str = "event";
pub const ENTITY_DATE: &str = "date";
pub const ENTITY_LOCATION: &str = "location";
pub const ENTITY_PRODUCT: &str = "product";

// â”€â”€ Extraction result â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

pub struct ExtractionResult {
    pub entities: Vec<AfpEntityMention>,
    pub relationships: Vec<AfpRelationship>,
}

// â”€â”€ Heuristic patterns â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

// Relationship predicates inferred from common phrases.
const RELATIONSHIP_PATTERNS: &[(&str, &str)] = &[
    ("works at", "works_at"),
    ("employed by", "employed_by"),
    ("ceo of", "ceo_of"),
    ("founder of", "founder_of"),
    ("acquired by", "acquired_by"),
    ("reports to", "reports_to"),
    ("invested in", "invested_in"),
    ("partnered with", "partnered_with"),
    ("located in", "located_in"),
];

// Metric signal words â€” preceding tokens likely indicate numeric metrics.
const METRIC_SIGNALS: &[&str] = &[
    "$",
    "â‚¬",
    "Â£",
    "%",
    "revenue",
    "profit",
    "loss",
    "growth",
    "mrr",
    "arr",
    "users",
    "installs",
    "downloads",
    "conversion",
    "churn",
    "nps",
    "cac",
    "ltv",
];

/// Extract all entities and relationships from a plain-text string.
pub fn extract_from_text(text: &str) -> ExtractionResult {
    let mut entities = Vec::new();
    let mut relationships = Vec::new();

    // Collect date-like tokens (ISO dates, "Q1 2026", month names).
    extract_dates(text, &mut entities);

    // Collect metric mentions (currency/percentage followed by numbers).
    extract_metrics(text, &mut entities);

    // Extract relationships using phrase patterns.
    extract_relationships(text, &mut relationships);

    ExtractionResult {
        entities,
        relationships,
    }
}

/// Extract from an AFP message `content` JSON blob.
/// Scans common text fields in priority order.
pub fn extract_from_afp_content(content: &Value) -> ExtractionResult {
    let text = collect_text(content);
    extract_from_text(&text)
}

// â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

fn collect_text(content: &Value) -> String {
    let mut parts = Vec::new();
    for field in &[
        "text",
        "body",
        "message",
        "description",
        "condensed_text",
        "summary",
        "title",
    ] {
        if let Some(s) = content.get(field).and_then(Value::as_str) {
            if !s.is_empty() {
                parts.push(s.chars().take(4_000).collect::<String>());
            }
        }
    }
    // Also include content_preview if present.
    if let Some(s) = content.get("content_preview").and_then(Value::as_str) {
        parts.push(s.to_string());
    }
    parts.join(" ")
}

fn extract_dates(text: &str, out: &mut Vec<AfpEntityMention>) {
    // Match ISO-like dates and quarter references.
    let words: Vec<&str> = text.split_whitespace().collect();
    for (i, word) in words.iter().enumerate() {
        let lower = word.to_lowercase();
        let lower = lower.trim_end_matches([',', '.', ';', ':']);

        // ISO date pattern: YYYY-MM-DD
        if lower.len() == 10 && lower.as_bytes()[4] == b'-' && lower.as_bytes()[7] == b'-' {
            if lower[..4].parse::<u32>().is_ok() {
                out.push(AfpEntityMention {
                    kind: ENTITY_DATE.to_string(),
                    name: lower.to_string(),
                    canonical: lower.to_string(),
                    context_snippet: context_around(&words, i, 4),
                    confidence: 0.90,
                });
                continue;
            }
        }

        // Quarter reference: "Q1", "Q2", "Q3", "Q4" followed optionally by year.
        if matches!(lower, "q1" | "q2" | "q3" | "q4") {
            let year = words.get(i + 1).and_then(|w| w.parse::<u32>().ok());
            let canonical = match year {
                Some(y) => format!("{lower}_{y}"),
                None => lower.to_string(),
            };
            let display = match year {
                Some(y) => format!("{} {y}", lower.to_uppercase()),
                None => lower.to_uppercase(),
            };
            out.push(AfpEntityMention {
                kind: ENTITY_DATE.to_string(),
                name: display,
                canonical,
                context_snippet: context_around(&words, i, 4),
                confidence: 0.80,
            });
        }
    }
}

fn extract_metrics(text: &str, out: &mut Vec<AfpEntityMention>) {
    let words: Vec<&str> = text.split_whitespace().collect();
    for (i, word) in words.iter().enumerate() {
        let lower = word.to_lowercase();
        let lower_trim = lower.trim_end_matches([',', '.', ';', ':']);

        // Check if this word or next word looks like a metric signal + number.
        let is_signal = METRIC_SIGNALS.iter().any(|s| lower_trim.starts_with(s));
        if !is_signal {
            continue;
        }

        // If the signal is a currency/percent prefix attached to a number (e.g. "$5M").
        let rest = lower_trim.trim_start_matches(['$', '\u{20AC}', '\u{00A3}', '%']);
        let has_number = rest
            .chars()
            .next()
            .map(|c| c.is_ascii_digit())
            .unwrap_or(false)
            || words
                .get(i + 1)
                .map(|w| {
                    w.chars()
                        .next()
                        .map(|c| c.is_ascii_digit())
                        .unwrap_or(false)
                })
                .unwrap_or(false);

        if has_number {
            let name = if rest.is_empty() {
                format!("{} {}", word, words.get(i + 1).copied().unwrap_or(""))
                    .trim()
                    .to_string()
            } else {
                word.to_string()
            };
            out.push(AfpEntityMention {
                kind: ENTITY_METRIC.to_string(),
                name: name.clone(),
                canonical: name.to_lowercase().replace(' ', "_"),
                context_snippet: context_around(&words, i, 5),
                confidence: 0.75,
            });
        }
    }
}

fn extract_relationships(text: &str, out: &mut Vec<AfpRelationship>) {
    let lower = text.to_lowercase();
    for (phrase, predicate) in RELATIONSHIP_PATTERNS {
        let mut search_start = 0;
        while let Some(pos) = lower[search_start..].find(phrase) {
            let abs_pos = search_start + pos;
            // Grab the ~30 chars before as subject, ~30 chars after as object.
            let subject_raw = &text[abs_pos.saturating_sub(40)..abs_pos];
            let object_raw = &text[(abs_pos + phrase.len()).min(text.len())..];
            let subject = last_token(subject_raw);
            let object = first_token(object_raw);

            if !subject.is_empty() && !object.is_empty() {
                out.push(AfpRelationship {
                    subject: subject.to_string(),
                    predicate: predicate.to_string(),
                    object: object.to_string(),
                    confidence: 0.70,
                });
            }
            search_start = abs_pos + phrase.len();
            if search_start >= lower.len() {
                break;
            }
        }
    }
}

fn context_around(words: &[&str], center: usize, radius: usize) -> Option<String> {
    let start = center.saturating_sub(radius);
    let end = (center + radius + 1).min(words.len());
    Some(words[start..end].join(" "))
}

fn last_token(text: &str) -> &str {
    text.split_whitespace()
        .last()
        .unwrap_or("")
        .trim_matches([',', '.', ';', ':'])
}

fn first_token(text: &str) -> &str {
    text.split_whitespace()
        .next()
        .unwrap_or("")
        .trim_matches([',', '.', ';', ':'])
}

// â”€â”€ AFP builder â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

fn build_entity_link_afp(
    message_type: &str,
    owner_user_id: &str,
    thread_id: &str,
    source_message_id: &str,
    result: &ExtractionResult,
) -> Value {
    let confidence = average_entity_confidence(&result.entities);
    let content = AfpKnowledgeLinkContent {
        source_message_id: source_message_id.to_string(),
        thread_id: thread_id.to_string(),
        extracted_at: Utc::now().to_rfc3339(),
        entities: result.entities.clone(),
        relationships: vec![],
        extractor_version: Some("heuristic-v1".to_string()),
        link_type: Some("entity_cluster".to_string()),
        confidence,
        source_refs: vec![source_message_id.to_string()],
        ..Default::default()
    };
    json!({
        "protocol": "afp-v1",
        "id": Ulid::new().to_string(),
        "thread_id": thread_id,
        "from": "entity_extractor",
        "to": [owner_user_id],
        "timestamp": Utc::now().to_rfc3339(),
        "type": message_type,
        "subtype": AFP_SUBTYPE_KNOWLEDGE_LINK_ENTITY,
        "content": serde_json::to_value(&content).unwrap_or(Value::Null),
        "metadata": { "store": true, "extractor": true },
        "store_in_relational": true,
    })
}

/// Build a `knowledge_link:entity` AFP message from an extraction result.
pub fn build_knowledge_link_entity_afp(
    owner_user_id: &str,
    thread_id: &str,
    source_message_id: &str,
    result: &ExtractionResult,
) -> Value {
    build_entity_link_afp(
        AFP_TYPE_KNOWLEDGE_LINK,
        owner_user_id,
        thread_id,
        source_message_id,
        result,
    )
}

/// Build a `relation_link:entity` AFP message from an extraction result.
pub fn build_relation_link_entity_afp(
    owner_user_id: &str,
    thread_id: &str,
    source_message_id: &str,
    result: &ExtractionResult,
) -> Value {
    build_entity_link_afp(
        AFP_TYPE_RELATION_LINK,
        owner_user_id,
        thread_id,
        source_message_id,
        result,
    )
}

fn build_entity_link_afps(
    message_type: &str,
    owner_user_id: &str,
    thread_id: &str,
    source_message_id: &str,
    result: &ExtractionResult,
) -> Vec<Value> {
    result
        .entities
        .iter()
        .map(|entity| {
            let relationship_id = entity_relationship_id(entity);
            let content = AfpKnowledgeLinkContent {
                source_message_id: source_message_id.to_string(),
                thread_id: thread_id.to_string(),
                extracted_at: Utc::now().to_rfc3339(),
                entities: vec![entity.clone()],
                relationships: vec![],
                extractor_version: Some("heuristic-v1".to_string()),
                link_type: Some("shared_entity".to_string()),
                relationship_id: Some(relationship_id.clone()),
                confidence: Some(entity.confidence),
                source_refs: vec![source_message_id.to_string()],
                ..Default::default()
            };
            json!({
                "protocol": "afp-v1",
                "id": Ulid::new().to_string(),
                "thread_id": thread_id,
                "from": "entity_extractor",
                "to": [owner_user_id],
                "timestamp": Utc::now().to_rfc3339(),
                "type": message_type,
                "subtype": AFP_SUBTYPE_KNOWLEDGE_LINK_ENTITY,
                "content": serde_json::to_value(&content).unwrap_or(Value::Null),
                "metadata": {
                    "store": true,
                    "extractor": true,
                    "relationship_id": relationship_id,
                },
                "store_in_relational": true,
            })
        })
        .collect()
}

/// Build one `knowledge_link:entity` AFP per extracted entity for topology grouping.
pub fn build_knowledge_link_entity_afps(
    owner_user_id: &str,
    thread_id: &str,
    source_message_id: &str,
    result: &ExtractionResult,
) -> Vec<Value> {
    build_entity_link_afps(
        AFP_TYPE_KNOWLEDGE_LINK,
        owner_user_id,
        thread_id,
        source_message_id,
        result,
    )
}

/// Build one `relation_link:entity` AFP per extracted entity for topology grouping.
pub fn build_relation_link_entity_afps(
    owner_user_id: &str,
    thread_id: &str,
    source_message_id: &str,
    result: &ExtractionResult,
) -> Vec<Value> {
    build_entity_link_afps(
        AFP_TYPE_RELATION_LINK,
        owner_user_id,
        thread_id,
        source_message_id,
        result,
    )
}

fn build_relationship_link_afp(
    message_type: &str,
    owner_user_id: &str,
    thread_id: &str,
    source_message_id: &str,
    result: &ExtractionResult,
) -> Value {
    let confidence = average_relationship_confidence(&result.relationships);
    let content = AfpKnowledgeLinkContent {
        source_message_id: source_message_id.to_string(),
        thread_id: thread_id.to_string(),
        extracted_at: Utc::now().to_rfc3339(),
        entities: vec![],
        relationships: result.relationships.clone(),
        extractor_version: Some("heuristic-v1".to_string()),
        link_type: Some("relationship_cluster".to_string()),
        confidence,
        source_refs: vec![source_message_id.to_string()],
        ..Default::default()
    };
    json!({
        "protocol": "afp-v1",
        "id": Ulid::new().to_string(),
        "thread_id": thread_id,
        "from": "entity_extractor",
        "to": [owner_user_id],
        "timestamp": Utc::now().to_rfc3339(),
        "type": message_type,
        "subtype": AFP_SUBTYPE_KNOWLEDGE_LINK_RELATIONSHIP,
        "content": serde_json::to_value(&content).unwrap_or(Value::Null),
        "metadata": { "store": true, "extractor": true },
        "store_in_relational": true,
    })
}

/// Build a `knowledge_link:relationship` AFP message.
pub fn build_knowledge_link_relationship_afp(
    owner_user_id: &str,
    thread_id: &str,
    source_message_id: &str,
    result: &ExtractionResult,
) -> Value {
    build_relationship_link_afp(
        AFP_TYPE_KNOWLEDGE_LINK,
        owner_user_id,
        thread_id,
        source_message_id,
        result,
    )
}

/// Build a `relation_link:relationship` AFP message.
pub fn build_relation_link_relationship_afp(
    owner_user_id: &str,
    thread_id: &str,
    source_message_id: &str,
    result: &ExtractionResult,
) -> Value {
    build_relationship_link_afp(
        AFP_TYPE_RELATION_LINK,
        owner_user_id,
        thread_id,
        source_message_id,
        result,
    )
}

fn build_relationship_link_afps(
    message_type: &str,
    owner_user_id: &str,
    thread_id: &str,
    source_message_id: &str,
    result: &ExtractionResult,
) -> Vec<Value> {
    result
        .relationships
        .iter()
        .map(|relationship| {
            let relationship_id = relationship_identity(relationship);
            let content = AfpKnowledgeLinkContent {
                source_message_id: source_message_id.to_string(),
                thread_id: thread_id.to_string(),
                extracted_at: Utc::now().to_rfc3339(),
                entities: vec![],
                relationships: vec![relationship.clone()],
                extractor_version: Some("heuristic-v1".to_string()),
                link_type: Some("shared_relationship".to_string()),
                relationship_id: Some(relationship_id.clone()),
                confidence: Some(relationship.confidence),
                source_refs: vec![source_message_id.to_string()],
                ..Default::default()
            };
            json!({
                "protocol": "afp-v1",
                "id": Ulid::new().to_string(),
                "thread_id": thread_id,
                "from": "entity_extractor",
                "to": [owner_user_id],
                "timestamp": Utc::now().to_rfc3339(),
                "type": message_type,
                "subtype": AFP_SUBTYPE_KNOWLEDGE_LINK_RELATIONSHIP,
                "content": serde_json::to_value(&content).unwrap_or(Value::Null),
                "metadata": {
                    "store": true,
                    "extractor": true,
                    "relationship_id": relationship_id,
                },
                "store_in_relational": true,
            })
        })
        .collect()
}

/// Build one `knowledge_link:relationship` AFP per extracted relationship for topology grouping.
pub fn build_knowledge_link_relationship_afps(
    owner_user_id: &str,
    thread_id: &str,
    source_message_id: &str,
    result: &ExtractionResult,
) -> Vec<Value> {
    build_relationship_link_afps(
        AFP_TYPE_KNOWLEDGE_LINK,
        owner_user_id,
        thread_id,
        source_message_id,
        result,
    )
}

/// Build one `relation_link:relationship` AFP per extracted relationship for topology grouping.
pub fn build_relation_link_relationship_afps(
    owner_user_id: &str,
    thread_id: &str,
    source_message_id: &str,
    result: &ExtractionResult,
) -> Vec<Value> {
    build_relationship_link_afps(
        AFP_TYPE_RELATION_LINK,
        owner_user_id,
        thread_id,
        source_message_id,
        result,
    )
}

fn entity_relationship_id(entity: &AfpEntityMention) -> String {
    format!(
        "entity:{}:{}",
        entity.kind.trim().to_lowercase(),
        entity.canonical.trim().to_lowercase()
    )
}

fn relationship_identity(relationship: &AfpRelationship) -> String {
    format!(
        "relationship:{}:{}:{}",
        relationship.predicate.trim().to_lowercase(),
        relationship.subject.trim().to_lowercase(),
        relationship.object.trim().to_lowercase()
    )
}

fn average_entity_confidence(entities: &[AfpEntityMention]) -> Option<f64> {
    average_confidence(entities.iter().map(|entity| entity.confidence))
}

fn average_relationship_confidence(relationships: &[AfpRelationship]) -> Option<f64> {
    average_confidence(
        relationships
            .iter()
            .map(|relationship| relationship.confidence),
    )
}

fn average_confidence(values: impl Iterator<Item = f64>) -> Option<f64> {
    let mut total = 0.0;
    let mut count = 0usize;
    for value in values {
        total += value;
        count += 1;
    }
    if count == 0 {
        None
    } else {
        Some(total / count as f64)
    }
}

// â”€â”€ Tests â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_iso_date() {
        let result = extract_from_text("The contract was signed on 2026-03-15 and expires soon.");
        let dates: Vec<_> = result
            .entities
            .iter()
            .filter(|e| e.kind == ENTITY_DATE)
            .collect();
        assert!(!dates.is_empty(), "expected a date entity");
        assert_eq!(dates[0].canonical, "2026-03-15");
    }

    #[test]
    fn extracts_quarter_reference() {
        let result = extract_from_text("Revenue grew 40% in Q3 2026 compared to Q2.");
        let dates: Vec<_> = result
            .entities
            .iter()
            .filter(|e| e.kind == ENTITY_DATE)
            .collect();
        assert!(dates.iter().any(|d| d.canonical.contains("q3")));
    }

    #[test]
    fn extracts_metric_with_currency() {
        let result = extract_from_text("The deal closed at $5M ARR.");
        let metrics: Vec<_> = result
            .entities
            .iter()
            .filter(|e| e.kind == ENTITY_METRIC)
            .collect();
        assert!(!metrics.is_empty(), "expected a metric entity");
    }

    #[test]
    fn extracts_relationship() {
        let result = extract_from_text("Alice works at Acme Corp and reports to Bob.");
        assert!(
            !result.relationships.is_empty(),
            "expected at least one relationship"
        );
        let works_at = result
            .relationships
            .iter()
            .find(|r| r.predicate == "works_at");
        assert!(works_at.is_some());
    }

    #[test]
    fn empty_text_returns_empty_result() {
        let result = extract_from_text("");
        assert!(result.entities.is_empty());
        assert!(result.relationships.is_empty());
    }

    #[test]
    fn build_entity_afp_has_correct_type() {
        let result = ExtractionResult {
            entities: vec![],
            relationships: vec![],
        };
        let afp = build_knowledge_link_entity_afp("user_01", "thread_01", "msg_01", &result);
        assert_eq!(afp["type"].as_str(), Some(AFP_TYPE_KNOWLEDGE_LINK));
        assert_eq!(
            afp["subtype"].as_str(),
            Some(AFP_SUBTYPE_KNOWLEDGE_LINK_ENTITY)
        );
    }

    #[test]
    fn build_relation_entity_afp_has_relation_type() {
        let result = ExtractionResult {
            entities: vec![],
            relationships: vec![],
        };
        let afp = build_relation_link_entity_afp("user_01", "thread_01", "msg_01", &result);
        assert_eq!(afp["type"].as_str(), Some(AFP_TYPE_RELATION_LINK));
        assert_eq!(
            afp["subtype"].as_str(),
            Some(AFP_SUBTYPE_KNOWLEDGE_LINK_ENTITY)
        );
    }

    #[test]
    fn builds_entity_membership_afps_with_relationship_ids() {
        let result = extract_from_text("Revenue was $10M in Q1 2026.");
        let afps = build_knowledge_link_entity_afps("user_01", "thread_01", "msg_01", &result);
        assert!(!afps.is_empty());
        assert!(
            afps.iter()
                .all(|afp| afp["content"]["relationship_id"].is_string())
        );
        assert!(
            afps.iter()
                .all(|afp| afp["content"]["link_type"].as_str() == Some("shared_entity"))
        );
    }

    #[test]
    fn builds_relationship_membership_afps_with_relationship_ids() {
        let result = extract_from_text("Alice works at Acme Corp and reports to Bob.");
        let afps =
            build_knowledge_link_relationship_afps("user_01", "thread_01", "msg_01", &result);
        assert!(!afps.is_empty());
        assert!(
            afps.iter()
                .all(|afp| afp["content"]["relationship_id"].is_string())
        );
        assert!(
            afps.iter()
                .all(|afp| afp["content"]["link_type"].as_str() == Some("shared_relationship"))
        );
    }

    #[test]
    fn builds_relation_relationship_afps_with_relation_type() {
        let result = extract_from_text("Alice works at Acme Corp and reports to Bob.");
        let afps = build_relation_link_relationship_afps("user_01", "thread_01", "msg_01", &result);
        assert!(!afps.is_empty());
        assert!(
            afps.iter()
                .all(|afp| afp["type"].as_str() == Some(AFP_TYPE_RELATION_LINK))
        );
    }

    #[test]
    fn afp_content_extraction_reads_body_field() {
        let content = serde_json::json!({ "body": "Signed 2026-05-01 with Acme." });
        let result = extract_from_afp_content(&content);
        let dates: Vec<_> = result
            .entities
            .iter()
            .filter(|e| e.kind == ENTITY_DATE)
            .collect();
        assert!(!dates.is_empty());
    }
}
