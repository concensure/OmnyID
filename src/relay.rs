use serde::Serialize;
use serde_json::Value;

use crate::message::AFPMessage;

#[derive(Debug)]
pub enum RelayRequest {
    Send {
        message: AFPMessage,
    },
    SubscribeThread {
        thread_id: String,
        include_snapshot: bool,
    },
    SubscribeFleet,
}

#[derive(Serialize)]
struct RelayAckFrame {
    event: &'static str,
    success: bool,
    message_id: String,
}

#[derive(Serialize)]
struct RelayThreadSnapshotFrame {
    event: &'static str,
    thread_id: String,
    messages: Vec<AFPMessage>,
}

#[derive(Serialize)]
struct RelayThreadSubscribedFrame {
    event: &'static str,
    thread_id: String,
}

pub fn parse_relay_request(payload: &str) -> Result<RelayRequest, String> {
    let value: Value =
        serde_json::from_str(payload).map_err(|_| "Relay frame must be valid JSON".to_string())?;

    match value.get("op").and_then(Value::as_str) {
        Some("send") => {
            let message = serde_json::from_value::<AFPMessage>(
                value
                    .get("message")
                    .cloned()
                    .ok_or_else(|| "Relay send frame must include a message".to_string())?,
            )
            .map_err(|_| "Relay send frame must contain a valid AFP message".to_string())?;
            Ok(RelayRequest::Send { message })
        }
        Some("subscribe_thread") => {
            let thread_id = value
                .get("thread_id")
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|thread_id| !thread_id.is_empty())
                .ok_or_else(|| "Relay subscribe frame must include a thread_id".to_string())?
                .to_string();
            let include_snapshot = value
                .get("include_snapshot")
                .and_then(Value::as_bool)
                .unwrap_or(true);
            Ok(RelayRequest::SubscribeThread {
                thread_id,
                include_snapshot,
            })
        }
        Some("subscribe_fleet") => Ok(RelayRequest::SubscribeFleet),
        Some(_) => Err("Unsupported relay operation".to_string()),
        None => {
            let message = serde_json::from_value::<AFPMessage>(value)
                .map_err(|_| "Relay frame must contain a valid AFP message".to_string())?;
            Ok(RelayRequest::Send { message })
        }
    }
}

pub fn relay_error_payload(code: &str, message: &str) -> String {
    serde_json::json!({
        "event": "error",
        "code": code,
        "message": message
    })
    .to_string()
}

pub fn relay_ack_payload(success: bool, message_id: String) -> String {
    serde_json::to_string(&RelayAckFrame {
        event: "ack",
        success,
        message_id,
    })
    .unwrap_or_else(|_| relay_error_payload("serialization_error", "Failed to serialize relay ack"))
}

pub fn relay_thread_snapshot_payload(thread_id: String, messages: Vec<AFPMessage>) -> String {
    serde_json::to_string(&RelayThreadSnapshotFrame {
        event: "thread_snapshot",
        thread_id,
        messages,
    })
    .unwrap_or_else(|_| {
        relay_error_payload("serialization_error", "Failed to serialize thread snapshot")
    })
}

pub fn relay_fleet_subscribed_payload() -> String {
    serde_json::json!({"event": "fleet_subscribed"}).to_string()
}

pub fn relay_fleet_update_payload(task_id: &str, status: &str) -> String {
    serde_json::json!({
        "event": "fleet_update",
        "task_id": task_id,
        "status": status,
    })
    .to_string()
}

pub fn relay_thread_subscribed_payload(thread_id: String) -> String {
    serde_json::to_string(&RelayThreadSubscribedFrame {
        event: "thread_subscribed",
        thread_id,
    })
    .unwrap_or_else(|_| {
        relay_error_payload(
            "serialization_error",
            "Failed to serialize thread subscription ack",
        )
    })
}

#[cfg(test)]
mod tests {
    use super::{
        RelayRequest, parse_relay_request, relay_ack_payload, relay_error_payload,
        relay_thread_subscribed_payload,
    };

    #[test]
    fn parse_send_request_accepts_wrapped_message() {
        let request = parse_relay_request(
            r#"{"op":"send","message":{"thread_id":"thread_test","type":"task","subtype":"status","content":{"kind":"task_status"},"metadata":{"domain":"task_tracking"},"from":"agent:test@omnyid.local"}}"#,
        )
        .expect("request");

        let RelayRequest::Send { message } = request else {
            panic!("expected send request");
        };

        assert_eq!(message.thread_id, "thread_test");
        assert_eq!(message.r#type, "task");
        assert_eq!(message.subtype.as_deref(), Some("status"));
    }

    #[test]
    fn parse_subscribe_request_accepts_thread_subscription_frame() {
        let request = parse_relay_request(
            r#"{"op":"subscribe_thread","thread_id":"thread_test","include_snapshot":false}"#,
        )
        .expect("request");

        let RelayRequest::SubscribeThread {
            thread_id,
            include_snapshot,
        } = request
        else {
            panic!("expected subscribe request");
        };

        assert_eq!(thread_id, "thread_test");
        assert!(!include_snapshot);
    }

    #[test]
    fn relay_payload_helpers_emit_expected_event_shape() {
        assert!(relay_ack_payload(true, "msg_01".to_string()).contains("\"event\":\"ack\""));
        assert!(
            relay_thread_subscribed_payload("thread_01".to_string())
                .contains("\"event\":\"thread_subscribed\"")
        );
        assert!(relay_error_payload("bad_request", "invalid").contains("\"event\":\"error\""));
    }

    // ── Property-style exhaustive parse tests ─────────────────────────────────

    #[test]
    fn parse_relay_rejects_missing_op() {
        assert!(parse_relay_request(r#"{"thread_id":"x"}"#).is_err());
    }

    #[test]
    fn parse_relay_rejects_empty_string() {
        assert!(parse_relay_request("").is_err());
    }

    #[test]
    fn parse_relay_rejects_unknown_op() {
        assert!(parse_relay_request(r#"{"op":"unknown_op"}"#).is_err());
    }

    #[test]
    fn parse_relay_rejects_send_without_message() {
        assert!(parse_relay_request(r#"{"op":"send"}"#).is_err());
    }

    #[test]
    fn parse_relay_accepts_subscribe_with_snapshot_default() {
        // include_snapshot field is optional (defaults to true in the model).
        let result = parse_relay_request(r#"{"op":"subscribe_thread","thread_id":"t1"}"#);
        assert!(result.is_ok(), "expected ok, got {:?}", result);
    }

    #[test]
    fn parse_relay_rejects_non_json() {
        assert!(parse_relay_request("not json at all").is_err());
    }

    #[test]
    fn relay_ack_payload_encodes_message_id() {
        let p = relay_ack_payload(true, "msg_abc".to_string());
        let v: serde_json::Value = serde_json::from_str(&p).expect("valid json");
        assert_eq!(v["message_id"], "msg_abc");
        assert_eq!(v["success"], true);
    }

    #[test]
    fn relay_error_payload_encodes_code_and_message() {
        let p = relay_error_payload("auth_required", "no token");
        let v: serde_json::Value = serde_json::from_str(&p).expect("valid json");
        assert_eq!(v["code"], "auth_required");
        assert_eq!(v["message"], "no token");
    }
}
