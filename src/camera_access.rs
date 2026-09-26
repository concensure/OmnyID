/*
 * @module-id: rust.camera-access
 * @primary-capability: rust.source-module
 * @locs-version: 2.0
 * @stability: active
 * @owner: omnyid
 */

/// Camera Access â€” AFP message builders for the agent camera-capture workflow.
///
/// The camera only ever opens in the user's browser.  The agent receives the
/// **processed result** (decoded QR string or a single JPEG snapshot), never
/// a raw video stream.  This preserves the Local-First / Privacy-First contract.
///
/// AFP flow:
///   1. Agent builds a `camera_access:request` and appends it to the thread.
///   2. The A2UI `camera_scanner` card opens the device camera locally
///      (navigator.mediaDevices.getUserMedia).
///   3. On user approval the UI appends `camera_access:grant` for the audit log.
///   4. Capture completes; the UI appends `camera_access:result` with decoded data.
///   5. Agent reads the result and closes the camera (or keeps it per grant_scope).
///
/// Permission scopes:
///   "once"    â€” camera closes immediately after one result.
///   "session" â€” camera stays available until a cancel or session end.
use chrono::Utc;
use serde_json::{Value, json};
use ulid::Ulid;

use crate::message::{
    AFP_SUBTYPE_CAMERA_ACCESS_CANCEL, AFP_SUBTYPE_CAMERA_ACCESS_GRANT,
    AFP_SUBTYPE_CAMERA_ACCESS_REQUEST, AFP_SUBTYPE_CAMERA_ACCESS_RESULT, AFP_TYPE_CAMERA_ACCESS,
    CAMERA_GRANT_ONCE, CAMERA_GRANT_SESSION, CAMERA_MODE_PHOTO, CAMERA_MODE_QR_SCAN,
};

// â”€â”€ Permission helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/// Return `true` if `grant_scope` is a recognised value.
pub fn is_valid_grant_scope(scope: &str) -> bool {
    matches!(scope, CAMERA_GRANT_ONCE | CAMERA_GRANT_SESSION)
}

/// Return `true` if `mode` is a recognised camera mode.
pub fn is_valid_camera_mode(mode: &str) -> bool {
    matches!(mode, CAMERA_MODE_QR_SCAN | CAMERA_MODE_PHOTO)
}

/// Human-readable label for a camera mode.
pub fn camera_mode_label(mode: &str) -> &'static str {
    match mode {
        CAMERA_MODE_QR_SCAN => "QR / barcode scan",
        CAMERA_MODE_PHOTO => "Photo capture",
        _ => "Unknown mode",
    }
}

// â”€â”€ AFP message builders â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/// Build a `camera_access:request` AFP message.
///
/// `mode` must be `"qr_scan"` or `"photo"`.
/// `grant_scope` must be `"once"` or `"session"`.
pub fn build_camera_request_afp(
    owner_user_id: &str,
    thread_id: &str,
    mode: &str,
    reason: &str,
    grant_scope: &str,
) -> Value {
    debug_assert!(is_valid_camera_mode(mode), "unknown camera mode: {mode}");
    debug_assert!(
        is_valid_grant_scope(grant_scope),
        "unknown grant scope: {grant_scope}"
    );

    json!({
        "protocol": "afp-v1",
        "id": Ulid::new().to_string(),
        "thread_id": thread_id,
        "from": "master_agent",
        "to": [owner_user_id],
        "timestamp": Utc::now().to_rfc3339(),
        "type": AFP_TYPE_CAMERA_ACCESS,
        "subtype": AFP_SUBTYPE_CAMERA_ACCESS_REQUEST,
        "content": {
            "task_id": Ulid::new().to_string(),
            "mode": mode,
            "reason": reason,
            "grant_scope": grant_scope,
        },
        "metadata": { "store": true },
        "store_in_relational": true,
    })
}

/// Build a `camera_access:grant` AFP message (emitted by the UI on user approval).
pub fn build_camera_grant_afp(
    owner_user_id: &str,
    thread_id: &str,
    task_id: &str,
    mode: &str,
    grant_scope: &str,
) -> Value {
    json!({
        "protocol": "afp-v1",
        "id": Ulid::new().to_string(),
        "thread_id": thread_id,
        "from": owner_user_id,
        "to": ["master_agent"],
        "timestamp": Utc::now().to_rfc3339(),
        "type": AFP_TYPE_CAMERA_ACCESS,
        "subtype": AFP_SUBTYPE_CAMERA_ACCESS_GRANT,
        "content": {
            "task_id": task_id,
            "mode": mode,
            "grant_scope": grant_scope,
            "granted_at": Utc::now().to_rfc3339(),
        },
        "metadata": { "store": true },
        "store_in_relational": true,
    })
}

/// Build a `camera_access:result` AFP message carrying the processed capture.
///
/// For `"qr_scan"` set `scan_data` to the decoded text; `photo_b64` should be `None`.
/// For `"photo"` set `photo_b64` to the base64-encoded JPEG; `scan_data` should be `None`.
pub fn build_camera_result_afp(
    owner_user_id: &str,
    thread_id: &str,
    task_id: &str,
    mode: &str,
    scan_data: Option<&str>,
    photo_b64: Option<&str>,
) -> Value {
    json!({
        "protocol": "afp-v1",
        "id": Ulid::new().to_string(),
        "thread_id": thread_id,
        "from": owner_user_id,
        "to": ["master_agent"],
        "timestamp": Utc::now().to_rfc3339(),
        "type": AFP_TYPE_CAMERA_ACCESS,
        "subtype": AFP_SUBTYPE_CAMERA_ACCESS_RESULT,
        "content": {
            "task_id": task_id,
            "mode": mode,
            "scan_data": scan_data,
            "photo_b64": photo_b64,
            "captured_at": Utc::now().to_rfc3339(),
        },
        "metadata": { "store": true },
        "store_in_relational": false,
    })
}

/// Build a `camera_access:cancel` AFP message.
pub fn build_camera_cancel_afp(
    owner_user_id: &str,
    thread_id: &str,
    task_id: &str,
    reason: &str,
) -> Value {
    json!({
        "protocol": "afp-v1",
        "id": Ulid::new().to_string(),
        "thread_id": thread_id,
        "from": owner_user_id,
        "to": ["master_agent"],
        "timestamp": Utc::now().to_rfc3339(),
        "type": AFP_TYPE_CAMERA_ACCESS,
        "subtype": AFP_SUBTYPE_CAMERA_ACCESS_CANCEL,
        "content": {
            "task_id": task_id,
            "reason": reason,
            "cancelled_at": Utc::now().to_rfc3339(),
        },
        "metadata": { "store": true },
        "store_in_relational": true,
    })
}

// â”€â”€ Convenience builders â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/// QR scan request (once scope) â€” the most common pattern for 2FA and login codes.
pub fn qr_scan_request(owner_user_id: &str, thread_id: &str, reason: &str) -> Value {
    build_camera_request_afp(
        owner_user_id,
        thread_id,
        CAMERA_MODE_QR_SCAN,
        reason,
        CAMERA_GRANT_ONCE,
    )
}

/// Single photo capture (once scope) â€” for receipts, business cards, documents.
pub fn photo_capture_request(owner_user_id: &str, thread_id: &str, reason: &str) -> Value {
    build_camera_request_afp(
        owner_user_id,
        thread_id,
        CAMERA_MODE_PHOTO,
        reason,
        CAMERA_GRANT_ONCE,
    )
}

// â”€â”€ Tests â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn qr_scan_request_shape() {
        let msg = qr_scan_request("user_01", "thread_01", "Scan the 2FA QR code");
        assert_eq!(msg["type"].as_str(), Some(AFP_TYPE_CAMERA_ACCESS));
        assert_eq!(
            msg["subtype"].as_str(),
            Some(AFP_SUBTYPE_CAMERA_ACCESS_REQUEST)
        );
        assert_eq!(msg["content"]["mode"].as_str(), Some(CAMERA_MODE_QR_SCAN));
        assert_eq!(
            msg["content"]["grant_scope"].as_str(),
            Some(CAMERA_GRANT_ONCE)
        );
        assert_eq!(msg["metadata"]["store"].as_bool(), Some(true));
    }

    #[test]
    fn photo_request_shape() {
        let msg = photo_capture_request("user_01", "thread_01", "Capture the receipt");
        assert_eq!(msg["content"]["mode"].as_str(), Some(CAMERA_MODE_PHOTO));
    }

    #[test]
    fn camera_result_stores_false() {
        let msg = build_camera_result_afp(
            "user_01",
            "thread_01",
            "task_01",
            CAMERA_MODE_QR_SCAN,
            Some("otpauth://totp/Example?secret=ABC"),
            None,
        );
        assert_eq!(
            msg["subtype"].as_str(),
            Some(AFP_SUBTYPE_CAMERA_ACCESS_RESULT)
        );
        assert_eq!(msg["metadata"]["store"].as_bool(), Some(true));
        assert_eq!(msg["store_in_relational"].as_bool(), Some(false));
        assert_eq!(
            msg["content"]["scan_data"].as_str(),
            Some("otpauth://totp/Example?secret=ABC")
        );
    }

    #[test]
    fn valid_modes_and_scopes() {
        assert!(is_valid_camera_mode(CAMERA_MODE_QR_SCAN));
        assert!(is_valid_camera_mode(CAMERA_MODE_PHOTO));
        assert!(!is_valid_camera_mode("video"));
        assert!(is_valid_grant_scope(CAMERA_GRANT_ONCE));
        assert!(is_valid_grant_scope(CAMERA_GRANT_SESSION));
        assert!(!is_valid_grant_scope("forever"));
    }
}
