//! Deterministic materialized-state replay for the wedding vendor lifecycle.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{BTreeMap, BTreeSet};

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize)]
pub struct WeddingVendorReplayState {
    pub intake_profile_id: Option<String>,
    pub search_receipt_ids: Vec<String>,
    pub active_comparison_id: Option<String>,
    pub selected_vendor_id: Option<String>,
    pub vendor_thread_ids: Vec<String>,
    pub draft_versions: Vec<String>,
    pub approval_id: Option<String>,
    pub send_receipt_id: Option<String>,
    pub reply_ids: Vec<String>,
    pub quote_ids: Vec<String>,
    pub active_decision_ids: Vec<String>,
    pub deferred_decision_ids: Vec<String>,
    pub resurfaced_decision_ids: Vec<String>,
    pub superseded_decision_ids: Vec<String>,
    pub resolved_decision_ids: Vec<String>,
    pub follow_up_ids: Vec<String>,
    pub replayed_message_count: usize,
}

#[derive(Clone, Debug, Deserialize)]
struct ReplayMessage {
    id: String,
    timestamp: String,
    #[serde(default)]
    r#type: String,
    #[serde(default)]
    kind: String,
    #[serde(default)]
    subtype: String,
    thread_id: String,
    #[serde(default)]
    content: Value,
}

fn clean(value: Option<&Value>) -> Option<String> {
    value
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

fn token(message: &ReplayMessage) -> String {
    format!("{} {} {}", message.r#type, message.kind, message.subtype).to_ascii_lowercase()
}

fn push_unique(values: &mut Vec<String>, value: String) {
    if !values.contains(&value) {
        values.push(value);
    }
}

fn decision_id(message: &ReplayMessage) -> Option<String> {
    clean(message.content.get("decision_id"))
}

/// Rebuilds material state from append-only AFP-shaped JSON. Input order and
/// duplicate delivery do not change the result.
pub fn replay_wedding_vendor_messages(messages: &[Value]) -> WeddingVendorReplayState {
    let mut ordered = messages
        .iter()
        .filter_map(|value| serde_json::from_value::<ReplayMessage>(value.clone()).ok())
        .collect::<Vec<_>>();
    ordered.sort_by(|left, right| {
        left.timestamp
            .cmp(&right.timestamp)
            .then_with(|| left.id.cmp(&right.id))
    });
    let mut seen = BTreeSet::new();
    ordered.retain(|message| seen.insert(message.id.clone()));

    let mut state = WeddingVendorReplayState::default();
    let mut active_decisions = BTreeMap::<String, String>::new();
    let mut deferred = BTreeSet::<String>::new();
    for message in ordered {
        let kind = token(&message);
        if kind.contains("wedding_intake_profile") {
            state.intake_profile_id = Some(message.id.clone());
        }
        if kind.contains("wedding_vendor_search_receipt") {
            push_unique(&mut state.search_receipt_ids, message.id.clone());
        }
        if kind.contains("wedding_vendor_comparison") {
            state.active_comparison_id =
                clean(message.content.get("comparison_id")).or_else(|| Some(message.id.clone()));
        }
        if kind.contains("wedding_vendor_selection") {
            state.selected_vendor_id = clean(message.content.get("vendor_id"));
        }
        if kind.contains("wedding_vendor_thread_created") {
            push_unique(&mut state.vendor_thread_ids, message.thread_id.clone());
        }
        if kind.contains("wedding_vendor_outreach_draft") {
            push_unique(&mut state.draft_versions, message.id.clone());
        }
        if kind.contains("wedding_vendor_outreach_approval") {
            state.approval_id = Some(message.id.clone());
        }
        if kind.contains("wedding_vendor_outreach_sent") {
            state.send_receipt_id = Some(message.id.clone());
        }
        if kind.contains("wedding_vendor_reply_received") {
            push_unique(&mut state.reply_ids, message.id.clone());
        }
        if kind.contains("wedding_vendor_quote_received") {
            push_unique(&mut state.quote_ids, message.id.clone());
        }
        if message.r#type == "decision_request" {
            if let Some(decision_id) = decision_id(&message) {
                active_decisions.insert(decision_id.clone(), message.id.clone());
                if kind.contains("resurfaced") {
                    push_unique(&mut state.resurfaced_decision_ids, decision_id.clone());
                    deferred.remove(&decision_id);
                }
            }
        }
        if kind.contains("wedding_decision_deferral") {
            if let Some(decision_id) = decision_id(&message) {
                deferred.insert(decision_id.clone());
                active_decisions.remove(&decision_id);
            }
        }
        if message.r#type == "decision_result" {
            if let Some(decision_id) = decision_id(&message) {
                active_decisions.remove(&decision_id);
                deferred.remove(&decision_id);
                if message.content.get("resolution").and_then(Value::as_str) == Some("superseded") {
                    push_unique(&mut state.superseded_decision_ids, decision_id);
                } else {
                    push_unique(&mut state.resolved_decision_ids, decision_id);
                }
            }
        }
        if kind.contains("wedding_vendor_follow_up") {
            push_unique(&mut state.follow_up_ids, message.id.clone());
        }
        state.replayed_message_count += 1;
    }
    state.active_decision_ids = active_decisions.into_keys().collect();
    state.deferred_decision_ids = deferred.into_iter().collect();
    state
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture() -> Vec<Value> {
        serde_json::from_str(include_str!(
            "../tests/fixtures/wedding_vendor_production_v1.json"
        ))
        .expect("valid frozen wedding production fixture")
    }

    #[test]
    fn frozen_v1_lineage_reconstructs_every_material_lifecycle_state() {
        let state = replay_wedding_vendor_messages(&fixture());
        assert!(state.intake_profile_id.is_some());
        assert_eq!(state.search_receipt_ids.len(), 2);
        assert_eq!(state.active_comparison_id.as_deref(), Some("comparison-v1"));
        assert_eq!(state.selected_vendor_id.as_deref(), Some("vendor-a"));
        assert_eq!(state.vendor_thread_ids.len(), 1);
        assert_eq!(state.draft_versions.len(), 1);
        assert!(state.approval_id.is_some());
        assert!(state.send_receipt_id.is_some());
        assert_eq!(state.reply_ids.len(), 1);
        assert_eq!(state.quote_ids.len(), 2);
        assert_eq!(state.resurfaced_decision_ids.len(), 1);
        assert_eq!(state.superseded_decision_ids.len(), 1);
        assert_eq!(state.resolved_decision_ids.len(), 1);
        assert_eq!(state.follow_up_ids.len(), 1);
        assert!(state.active_decision_ids.is_empty());
        assert!(state.deferred_decision_ids.is_empty());
    }

    #[test]
    fn replay_is_stable_for_duplicates_and_out_of_order_delivery() {
        let canonical = fixture();
        let expected = replay_wedding_vendor_messages(&canonical);
        let mut disorder = canonical.iter().rev().cloned().collect::<Vec<_>>();
        disorder.extend(canonical.iter().take(4).cloned());
        assert_eq!(replay_wedding_vendor_messages(&disorder), expected);
    }

    #[test]
    fn approval_and_send_bind_to_the_same_immutable_payload_hash() {
        let fixture = fixture();
        let draft = fixture
            .iter()
            .find(|message| message["kind"] == "wedding_vendor_outreach_draft")
            .unwrap();
        let approval = fixture
            .iter()
            .find(|message| message["kind"] == "wedding_vendor_outreach_approval")
            .unwrap();
        let sent = fixture
            .iter()
            .find(|message| message["kind"] == "wedding_vendor_outreach_sent")
            .unwrap();
        assert_eq!(
            draft["content"]["payload_hash"],
            approval["content"]["payload_hash"]
        );
        assert_eq!(
            approval["content"]["payload_hash"],
            sent["content"]["payload_hash"]
        );
        assert_eq!(approval["content"]["approved_message_id"], draft["id"]);
        assert_eq!(sent["content"]["approved_message_id"], draft["id"]);
    }
}
