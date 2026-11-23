/*
 * @module-id: rust.rollback
 * @primary-capability: rust.source-module
 * @locs-version: 2.0
 * @stability: active
 * @owner: omnyid
 */

use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};
/// Rollback â€” append-only compensating action system for the Master Agent.
///
/// Every reversible action SHOULD emit a `revert_action:checkpoint` AFP message
/// immediately after its original action AFP message.  The UI uses checkpoints
/// to render "Undo" buttons without fetching original messages.
///
/// Rollback registry pattern:
///   1. Agent performs `action_stripe_charge` â†’ emits `revert_action:checkpoint`
///      with a `rollback_token` (opaque string embedding enough state to reverse it).
///   2. User clicks "Undo" in the UI.
///   3. Agent emits `revert_action:request` referencing `target_message_id`.
///   4. Agent executes compensating steps (e.g. `action_stripe_refund`).
///   5. Agent emits `revert_action:result`.
///
/// The rollback token is deliberately opaque â€” the agent that created the action
/// is responsible for encoding enough state in it.  The homeserver stores it
/// encrypted in the AFP thread and never interprets it.
use chrono::Utc;
use serde_json::{Value, json};
use ulid::Ulid;

use crate::autonomy_policy::{
    autonomy_decision_for_revert_checkpoint, autonomy_decision_for_revert_request,
    autonomy_decision_for_revert_result,
};
use crate::message::{
    AFP_SUBTYPE_REVERT_CHECKPOINT, AFP_SUBTYPE_REVERT_HISTORY, AFP_SUBTYPE_REVERT_REQUEST,
    AFP_SUBTYPE_REVERT_RESULT, AFP_TYPE_REVERT_ACTION, AfpRevertHistoryEntry, AfpRevertStep,
};

// â”€â”€ Rollback token helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/// Encode an arbitrary JSON payload as a base64 rollback token.
///
/// The token is intentionally opaque to the transport layer.  Only the agent
/// that created it knows how to decode it.  Example payload:
/// `{"charge_id": "ch_xxx", "amount": 1299, "currency": "USD"}`
pub fn encode_rollback_token(payload: &Value) -> String {
    let json_bytes = serde_json::to_string(payload)
        .unwrap_or_default()
        .into_bytes();
    BASE64.encode(json_bytes)
}

/// Decode a rollback token back to its JSON payload.
///
/// Returns `None` if the token is malformed or cannot be decoded.
pub fn decode_rollback_token(token: &str) -> Option<Value> {
    let bytes = BASE64.decode(token).ok()?;
    let s = String::from_utf8(bytes).ok()?;
    serde_json::from_str(&s).ok()
}

/// Derive a human-readable `reversible_until` ISO 8601 timestamp for common
/// action types.  Returns `None` for actions where reversibility is permanent
/// or unknown.
///
/// Policy defaults:
///   - `action_stripe_charge`, `action_payment` â†’ 24 h
///   - `action_booking` â†’ 4 h (varies by vendor; conservative default)
///   - `action_reply`, `action_forward` â†’ not reversible (None)
///   - `action_delete` â†’ 30 min (if soft-delete is supported)
///   - everything else â†’ None (case-by-case)
pub fn default_reversible_until(action_type: &str) -> Option<String> {
    let hours = match action_type {
        t if t.contains("charge") || t.contains("payment") => Some(24i64),
        t if t.contains("booking") || t.contains("reserve") => Some(4),
        t if t.contains("delete") => Some(0), // 30 min
        t if t.contains("reply") || t.contains("forward") || t.contains("send") => return None,
        _ => return None,
    };
    let delta = if action_type.contains("delete") {
        chrono::Duration::minutes(30)
    } else {
        chrono::Duration::hours(hours?)
    };
    Some((Utc::now() + delta).to_rfc3339())
}

/// Return `true` if the action type is considered reversible at all.
pub fn is_reversible(action_type: &str) -> bool {
    // Messages already sent to external parties are generally irreversible.
    let irreversible = ["reply", "forward", "send_message", "publish"];
    !irreversible.iter().any(|k| action_type.contains(k))
}

// â”€â”€ AFP message builders â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/// Build a `revert_action:checkpoint` AFP message.
///
/// Emit this immediately after any reversible action to register an undo entry
/// in the thread.  The `rollback_token` should be created with
/// `encode_rollback_token` so it carries enough context to execute the inverse.
pub fn build_revert_checkpoint_afp(
    owner_user_id: &str,
    thread_id: &str,
    source_message_id: &str,
    source_type: &str,
    undo_label: &str,
    rollback_token: &str,
) -> Value {
    let reversible_until = default_reversible_until(source_type);
    let reversible = is_reversible(source_type);
    let autonomy_decision = autonomy_decision_for_revert_checkpoint(reversible);
    json!({
        "protocol": "afp-v1",
        "id": Ulid::new().to_string(),
        "thread_id": thread_id,
        "from": "master_agent",
        "to": [owner_user_id],
        "timestamp": Utc::now().to_rfc3339(),
        "type": AFP_TYPE_REVERT_ACTION,
        "subtype": AFP_SUBTYPE_REVERT_CHECKPOINT,
        "content": {
            "checkpoint_id": Ulid::new().to_string(),
            "source_message_id": source_message_id,
            "source_type": source_type,
            "undo_label": undo_label,
            "rollback_token": rollback_token,
            "reversible_until": reversible_until,
            "reversible": reversible,
        },
        "metadata": {
            "store": true,
            "autonomy_decision": autonomy_decision,
        },
        "store_in_relational": true,
    })
}

/// Build a `revert_action:request` AFP message.
///
/// Emitted when the user clicks "Undo" and the agent is ready to execute the
/// compensating steps.  `steps` should describe each compensating AFP message
/// the agent will emit.
pub fn build_revert_request_afp(
    owner_user_id: &str,
    thread_id: &str,
    target_message_id: &str,
    target_type: &str,
    title: &str,
    justification: &str,
    steps: Vec<AfpRevertStep>,
    rollback_token: Option<&str>,
    pre_approved: bool,
) -> Value {
    let steps_val = serde_json::to_value(&steps).unwrap_or(Value::Array(vec![]));
    let autonomy_decision = autonomy_decision_for_revert_request(pre_approved);
    json!({
        "protocol": "afp-v1",
        "id": Ulid::new().to_string(),
        "thread_id": thread_id,
        "from": "master_agent",
        "to": [owner_user_id],
        "timestamp": Utc::now().to_rfc3339(),
        "type": AFP_TYPE_REVERT_ACTION,
        "subtype": AFP_SUBTYPE_REVERT_REQUEST,
        "content": {
            "revert_id": Ulid::new().to_string(),
            "target_message_id": target_message_id,
            "target_type": target_type,
            "title": title,
            "justification": justification,
            "steps": steps_val,
            "pre_approved": pre_approved,
            "rollback_token": rollback_token,
        },
        "metadata": {
            "store": true,
            "autonomy_decision": autonomy_decision,
        },
        "store_in_relational": true,
    })
}

/// Build a `revert_action:result` AFP message after executing the revert.
pub fn build_revert_result_afp(
    owner_user_id: &str,
    thread_id: &str,
    revert_id: &str,
    target_message_id: &str,
    status: &str,
    summary: &str,
    steps_completed: u32,
    steps_total: u32,
    duration_ms: u64,
    compensation_message_ids: &[&str],
    error: Option<&str>,
) -> Value {
    let autonomy_decision = autonomy_decision_for_revert_result();
    json!({
        "protocol": "afp-v1",
        "id": Ulid::new().to_string(),
        "thread_id": thread_id,
        "from": "master_agent",
        "to": [owner_user_id],
        "timestamp": Utc::now().to_rfc3339(),
        "type": AFP_TYPE_REVERT_ACTION,
        "subtype": AFP_SUBTYPE_REVERT_RESULT,
        "content": {
            "revert_id": revert_id,
            "target_message_id": target_message_id,
            "status": status,
            "summary": summary,
            "steps_completed": steps_completed,
            "steps_total": steps_total,
            "duration_ms": duration_ms,
            "compensation_message_ids": compensation_message_ids,
            "error": error,
        },
        "metadata": {
            "store": true,
            "autonomy_decision": autonomy_decision,
        },
        "store_in_relational": true,
    })
}

/// Build a `revert_action:history` AFP message (display-ready undo list).
///
/// Aggregates all `revert_action:result` messages on a thread.  Typically
/// emitted by the agent when the user opens the "History" panel.
pub fn build_revert_history_afp(
    owner_user_id: &str,
    thread_id: &str,
    entries: Vec<AfpRevertHistoryEntry>,
) -> Value {
    let entries_val = serde_json::to_value(&entries).unwrap_or(Value::Array(vec![]));
    json!({
        "protocol": "afp-v1",
        "id": Ulid::new().to_string(),
        "thread_id": thread_id,
        "from": "master_agent",
        "to": [owner_user_id],
        "timestamp": Utc::now().to_rfc3339(),
        "type": AFP_TYPE_REVERT_ACTION,
        "subtype": AFP_SUBTYPE_REVERT_HISTORY,
        "content": {
            "thread_id": thread_id,
            "generated_at": Utc::now().to_rfc3339(),
            "entries": entries_val,
        },
        "metadata": { "store": false },
        "store_in_relational": false,
    })
}

// â”€â”€ Common revert step templates â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/// Build the compensating step list for a Stripe charge reversal (refund).
pub fn stripe_refund_steps(charge_id: &str, amount_cents: u32) -> Vec<AfpRevertStep> {
    vec![
        AfpRevertStep {
            step_index: 0,
            description: format!(
                "Issue Stripe refund for charge {charge_id} (${:.2})",
                amount_cents as f64 / 100.0
            ),
            afp_type: "action_stripe_refund".to_string(),
            status: "pending".to_string(),
            ..Default::default()
        },
        AfpRevertStep {
            step_index: 1,
            description: "Notify user of successful refund via email".to_string(),
            afp_type: "action_reply".to_string(),
            status: "pending".to_string(),
            ..Default::default()
        },
    ]
}

/// Build the compensating step list for an email send reversal.
///
/// NOTE: email is generally irreversible once delivered.  Use this only when
/// the email is queued (not yet sent) and can be deleted from the outbox.
pub fn email_recall_steps(message_id: &str) -> Vec<AfpRevertStep> {
    vec![AfpRevertStep {
        step_index: 0,
        description: format!("Attempt to delete queued email {message_id} from outbox"),
        afp_type: "action_email_delete_queued".to_string(),
        status: "pending".to_string(),
        ..Default::default()
    }]
}

/// Build the compensating step list for a file deletion reversal (restore from trash).
pub fn file_restore_steps(file_path: &str) -> Vec<AfpRevertStep> {
    vec![AfpRevertStep {
        step_index: 0,
        description: format!("Restore '{file_path}' from trash/soft-delete"),
        afp_type: AFP_TYPE_REVERT_ACTION.to_string(),
        status: "pending".to_string(),
        ..Default::default()
    }]
}

// â”€â”€ Tests â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rollback_token_roundtrip() {
        let payload = json!({"charge_id": "ch_abc", "amount": 1299, "currency": "USD"});
        let token = encode_rollback_token(&payload);
        let decoded = decode_rollback_token(&token).unwrap();
        assert_eq!(decoded["charge_id"], json!("ch_abc"));
        assert_eq!(decoded["amount"], json!(1299));
    }

    #[test]
    fn rollback_token_invalid_returns_none() {
        assert!(decode_rollback_token("!!not-base64!!").is_none());
        assert!(decode_rollback_token("dGhpcyBpcyBub3QganNvbg==").is_none()); // "this is not json"
    }

    #[test]
    fn is_reversible_blocks_send_and_reply() {
        assert!(!is_reversible("action_reply"));
        assert!(!is_reversible("action_forward"));
        assert!(!is_reversible("send_message"));
    }

    #[test]
    fn is_reversible_true_for_charge_and_booking() {
        assert!(is_reversible("action_stripe_charge"));
        assert!(is_reversible("action_booking_reserve"));
        assert!(is_reversible("action_delete"));
    }

    #[test]
    fn default_reversible_until_charge_is_24h_in_future() {
        let ts = default_reversible_until("action_stripe_charge").unwrap();
        let future: chrono::DateTime<Utc> = ts.parse().unwrap();
        let diff = future - Utc::now();
        assert!(diff.num_hours() >= 23 && diff.num_hours() <= 25);
    }

    #[test]
    fn default_reversible_until_reply_is_none() {
        assert!(default_reversible_until("action_reply").is_none());
    }

    #[test]
    fn build_revert_checkpoint_afp_shape() {
        let token = encode_rollback_token(&json!({"charge_id": "ch_abc"}));
        let afp = build_revert_checkpoint_afp(
            "user_01",
            "thread_01",
            "msg_01",
            "action_stripe_charge",
            "Undo payment",
            &token,
        );
        assert_eq!(afp["type"].as_str(), Some(AFP_TYPE_REVERT_ACTION));
        assert_eq!(afp["subtype"].as_str(), Some(AFP_SUBTYPE_REVERT_CHECKPOINT));
        assert!(afp["content"]["rollback_token"].as_str().is_some());
        assert_eq!(afp["content"]["reversible"].as_bool(), Some(true));
        assert_eq!(
            afp["metadata"]["autonomy_decision"]["autonomy_level"].as_str(),
            Some("execute_reversible")
        );
    }

    #[test]
    fn build_revert_request_afp_shape() {
        let steps = stripe_refund_steps("ch_abc", 1299);
        let afp = build_revert_request_afp(
            "user_01",
            "thread_01",
            "msg_charge_01",
            "action_stripe_charge",
            "Undo payment of $12.99",
            "User requested refund immediately after approval",
            steps,
            Some("token123"),
            false,
        );
        assert_eq!(afp["subtype"].as_str(), Some(AFP_SUBTYPE_REVERT_REQUEST));
        let steps_arr = afp["content"]["steps"].as_array().unwrap();
        assert_eq!(steps_arr.len(), 2);
        assert_eq!(
            afp["metadata"]["autonomy_decision"]["autonomy_level"].as_str(),
            Some("request_approval")
        );
    }

    #[test]
    fn build_revert_result_afp_success() {
        let afp = build_revert_result_afp(
            "user_01",
            "thread_01",
            "revert_01",
            "msg_01",
            "success",
            "Payment refunded successfully",
            2,
            2,
            850,
            &["msg_refund_01"],
            None,
        );
        assert_eq!(afp["content"]["status"].as_str(), Some("success"));
        assert_eq!(afp["content"]["steps_completed"], json!(2));
        assert_eq!(
            afp["metadata"]["autonomy_decision"]["autonomy_level"].as_str(),
            Some("execute_reversible")
        );
    }

    #[test]
    fn stripe_refund_steps_has_two_steps() {
        let steps = stripe_refund_steps("ch_xyz", 500);
        assert_eq!(steps.len(), 2);
        assert_eq!(steps[0].step_index, 0);
        assert_eq!(steps[1].step_index, 1);
    }
}
