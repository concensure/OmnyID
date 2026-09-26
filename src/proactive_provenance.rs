use serde_json::{Value, json};

use crate::{
    message::AfpProvenanceHash,
    proactive_policy::ProactiveStrategicAction,
    provenance_record::{build_action_provenance_record_afp, canonical_value_hash},
};

pub fn build_proactive_suggestion_provenance_afp(
    owner_user_id: &str,
    suggestion_afp: &Value,
) -> Option<Value> {
    if !proactive_suggestion_needs_provenance(suggestion_afp) {
        return None;
    }

    let suggestion_id = clean_str(suggestion_afp.get("id")?.as_str()?)?;
    let thread_id = clean_str(suggestion_afp.get("thread_id")?.as_str()?)?;
    let content = suggestion_afp
        .get("content")
        .cloned()
        .unwrap_or(Value::Null);
    let action_label = clean_str(
        content
            .get("action_label")
            .and_then(Value::as_str)
            .unwrap_or(""),
    )
    .unwrap_or_else(|| "Proactive suggestion".to_string());
    let source_refs = source_refs_for_provenance(suggestion_afp);
    let source_ref_slices = source_refs.iter().map(String::as_str).collect::<Vec<_>>();

    Some(build_action_provenance_record_afp(
        owner_user_id,
        &thread_id,
        Some(&suggestion_id),
        "proactive_engine",
        "proactive_suggestion_policy",
        &action_label,
        &source_ref_slices,
        vec![AfpProvenanceHash {
            label: "proactive_suggestion".to_string(),
            sha256: canonical_value_hash(suggestion_afp),
        }],
        Vec::new(),
        content.get("confidence").and_then(Value::as_f64),
        Some(json!({
            "heuristic_id": content.get("heuristic_id").cloned().unwrap_or(Value::Null),
            "strategic_policy": content.get("strategic_policy").cloned().unwrap_or(Value::Null),
            "surface_policy": content.get("surface_policy").cloned().unwrap_or(Value::Null),
            "approval_policy": content.get("approval_policy").cloned().unwrap_or(Value::Null),
            "selection_reason": content.get("selection_reason").cloned().unwrap_or(Value::Null),
            "provenance_cue": content.get("provenance_cue").cloned().unwrap_or(Value::Null),
        })),
    ))
}

pub fn proactive_suggestion_needs_provenance(suggestion_afp: &Value) -> bool {
    let action = suggestion_afp
        .get("content")
        .and_then(|content| content.get("strategic_policy"))
        .and_then(|policy| policy.get("action"))
        .and_then(Value::as_str)
        .or_else(|| {
            suggestion_afp
                .get("metadata")
                .and_then(|metadata| metadata.get("strategic_policy"))
                .and_then(|policy| policy.get("action"))
                .and_then(Value::as_str)
        });

    matches!(
        action.and_then(parse_strategic_action),
        Some(ProactiveStrategicAction::AskApproval | ProactiveStrategicAction::SurfaceNow)
    )
}

fn parse_strategic_action(value: &str) -> Option<ProactiveStrategicAction> {
    match value {
        "ask_approval" => Some(ProactiveStrategicAction::AskApproval),
        "surface_now" => Some(ProactiveStrategicAction::SurfaceNow),
        "defer" => Some(ProactiveStrategicAction::Defer),
        "suppress" => Some(ProactiveStrategicAction::Suppress),
        "background_only" => Some(ProactiveStrategicAction::BackgroundOnly),
        _ => None,
    }
}

fn source_refs_for_provenance(suggestion_afp: &Value) -> Vec<String> {
    let mut refs = Vec::new();
    for value in [
        suggestion_afp
            .get("content")
            .and_then(|content| content.get("source_refs")),
        suggestion_afp
            .get("metadata")
            .and_then(|metadata| metadata.get("source_refs")),
    ] {
        let Some(items) = value.and_then(Value::as_array) else {
            continue;
        };
        for item in items {
            let Some(source_ref) = item.as_str().and_then(clean_str) else {
                continue;
            };
            if !refs.iter().any(|existing| existing == &source_ref) {
                refs.push(source_ref);
            }
        }
    }
    refs
}

fn clean_str(value: &str) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::message::AFP_TYPE_PROVENANCE_RECORD;

    fn suggestion_with_action(action: &str) -> Value {
        json!({
            "id": "suggestion_1",
            "thread_id": "thread_1",
            "content": {
                "heuristic_id": "test-heuristic",
                "action_label": "Review next step",
                "confidence": 0.77,
                "source_refs": ["event_1", "event_1", "event_2"],
                "strategic_policy": { "action": action },
                "surface_policy": action,
                "approval_policy": "no_side_effect",
                "selection_reason": "Policy selected this suggestion.",
                "provenance_cue": "Traceable to policy input."
            },
            "metadata": {
                "source_refs": ["event_2", "event_3"]
            }
        })
    }

    #[test]
    fn builds_parented_provenance_for_approval_gated_suggestion() {
        let suggestion = json!({
            "id": "suggestion_1",
            "thread_id": "thread_1",
            "content": {
                "heuristic_id": "stalled-thread",
                "action_label": "Follow up on thread",
                "confidence": 0.91,
                "source_refs": ["event_1"],
                "strategic_policy": { "action": "ask_approval" },
                "surface_policy": "surface_now",
                "approval_policy": "approval_required",
                "selection_reason": "Thread stalled.",
                "provenance_cue": "Traceable to event."
            },
            "metadata": {}
        });

        let provenance =
            build_proactive_suggestion_provenance_afp("user_1", &suggestion).expect("provenance");

        assert_eq!(
            provenance["type"].as_str(),
            Some(AFP_TYPE_PROVENANCE_RECORD)
        );
        assert_eq!(provenance["parent_id"].as_str(), Some("suggestion_1"));
        assert_eq!(
            provenance["content"]["source_message_ids"][0].as_str(),
            Some("event_1")
        );
        assert_eq!(
            provenance["content"]["context"]["approval_policy"].as_str(),
            Some("approval_required")
        );
    }

    #[test]
    fn builds_provenance_for_surface_now_suggestion() {
        let suggestion = suggestion_with_action("surface_now");
        let provenance =
            build_proactive_suggestion_provenance_afp("user_1", &suggestion).expect("provenance");

        assert_eq!(provenance["parent_id"].as_str(), Some("suggestion_1"));
        assert_eq!(
            provenance["content"]["action_type"].as_str(),
            Some("proactive_suggestion_policy")
        );
        assert_eq!(
            provenance["content"]["input_hashes"][0]["label"].as_str(),
            Some("proactive_suggestion")
        );
        assert!(
            provenance["content"]["input_hashes"][0]["sha256"]
                .as_str()
                .is_some_and(|value| value.len() == 64)
        );
    }

    #[test]
    fn provenance_deduplicates_source_refs_from_content_and_metadata() {
        let suggestion = suggestion_with_action("ask_approval");
        let provenance =
            build_proactive_suggestion_provenance_afp("user_1", &suggestion).expect("provenance");

        let source_ids = provenance["content"]["source_message_ids"]
            .as_array()
            .expect("source ids")
            .iter()
            .filter_map(Value::as_str)
            .collect::<Vec<_>>();

        assert_eq!(source_ids, vec!["event_1", "event_2", "event_3"]);
    }

    #[test]
    fn skips_non_action_driving_suggestions() {
        for action in ["defer", "suppress", "background_only"] {
            let suggestion = suggestion_with_action(action);

            assert!(
                build_proactive_suggestion_provenance_afp("user_1", &suggestion).is_none(),
                "{action} should not create companion provenance"
            );
        }
    }
}
