/*
 * @module-id: rust.file-access-agent
 * @primary-capability: rust.source-module
 * @locs-version: 2.0
 * @stability: active
 * @owner: omnyid
 */

/// File Access Agent â€” sandbox-aware file operations for the Master Agent.
///
/// Implements the three-tier permission model defined in `message.rs`:
///   read_only    â€” list + read; no writes.
///   read_write   â€” read_only + write/create.
///   full_control â€” read_write + rename/delete/mkdir.
///
/// All paths are validated against `sandbox_root` before any I/O.
/// The agent must hold an active `file_access_request:grant` AFP message
/// before calling any operation here; call `validate_grant` first.
use chrono::Utc;
use serde_json::{Value, json};
use ulid::Ulid;

use crate::message::{
    AFP_SUBTYPE_FILE_ACCESS_DENY, AFP_SUBTYPE_FILE_ACCESS_GRANT, AFP_SUBTYPE_FILE_ACCESS_OP,
    AFP_SUBTYPE_FILE_ACCESS_REQUEST, AFP_SUBTYPE_FILE_ACCESS_REVOKE, AFP_TYPE_FILE_ACCESS_REQUEST,
    AfpFileAccessGrantContent, AfpFileOpContent, FILE_OP_DELETE, FILE_OP_LIST, FILE_OP_MKDIR,
    FILE_OP_READ, FILE_OP_RENAME, FILE_OP_WRITE, FILE_PERM_FULL_CONTROL, FILE_PERM_READ_ONLY,
    FILE_PERM_READ_WRITE,
};

// â”€â”€ Permission helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/// Permission tier ordinal â€” higher = more powerful.
fn perm_level(perm: &str) -> u8 {
    match perm {
        FILE_PERM_READ_ONLY => 1,
        FILE_PERM_READ_WRITE => 2,
        FILE_PERM_FULL_CONTROL => 3,
        _ => 0,
    }
}

/// Returns `true` if `held` tier is sufficient to perform `required` operation.
pub fn permission_allows_op(held: &str, op: &str) -> bool {
    let read_ops = [FILE_OP_LIST, FILE_OP_READ];
    let write_ops = [FILE_OP_WRITE, FILE_OP_MKDIR];
    let full_ops = [FILE_OP_DELETE, FILE_OP_RENAME];

    if read_ops.contains(&op) {
        perm_level(held) >= perm_level(FILE_PERM_READ_ONLY)
    } else if write_ops.contains(&op) {
        perm_level(held) >= perm_level(FILE_PERM_READ_WRITE)
    } else if full_ops.contains(&op) {
        perm_level(held) >= perm_level(FILE_PERM_FULL_CONTROL)
    } else {
        false
    }
}

/// Check that a relative `path` does not escape `sandbox_root`.
/// Returns `Ok(absolute_path)` or `Err(reason)`.
pub fn validate_sandbox_path(sandbox_root: &str, relative_path: &str) -> Result<String, String> {
    if relative_path.contains("..") {
        return Err("path traversal detected: '..' is not permitted".to_string());
    }
    let root = sandbox_root.trim_end_matches('/');
    let rel = relative_path.trim_start_matches('/');
    let abs = format!("{root}/{rel}");
    // Ensure the resolved path still starts with sandbox_root.
    if !abs.starts_with(root) {
        return Err(format!(
            "path '{relative_path}' resolves outside sandbox_root '{sandbox_root}'"
        ));
    }
    Ok(abs)
}

/// Returns `Err(reason)` if the grant has expired.
pub fn validate_grant(grant: &AfpFileAccessGrantContent) -> Result<(), String> {
    let now = Utc::now().to_rfc3339();
    if grant.expires_at < now {
        return Err(format!("file access grant expired at {}", grant.expires_at));
    }
    Ok(())
}

/// Returns `Err(reason)` if `ext` is blocked by the grant's allowlist.
/// If `allowed_extensions` is empty, all extensions are permitted.
pub fn check_extension(grant: &AfpFileAccessGrantContent, filename: &str) -> Result<(), String> {
    if grant.allowed_extensions.is_empty() {
        return Ok(());
    }
    let ext = filename
        .rsplit('.')
        .next()
        .map(|e| format!(".{e}"))
        .unwrap_or_default();
    let ok = grant
        .allowed_extensions
        .iter()
        .any(|allowed| allowed.eq_ignore_ascii_case(&ext));
    if ok {
        Ok(())
    } else {
        Err(format!(
            "file extension '{ext}' is not in the grant's allowed_extensions list"
        ))
    }
}

// â”€â”€ AFP message builders â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/// Build a `file_access_request:request` AFP message for the agent to send
/// when it needs sandbox file access.
pub fn build_file_access_request_afp(
    owner_user_id: &str,
    thread_id: &str,
    requested_path: &str,
    permission: &str,
    reason: &str,
    ttl_seconds: u32,
    first_op: Option<&str>,
) -> Value {
    let request_id = Ulid::new().to_string();
    json!({
        "protocol": "afp-v1",
        "id": Ulid::new().to_string(),
        "thread_id": thread_id,
        "from": "master_agent",
        "to": [owner_user_id],
        "timestamp": Utc::now().to_rfc3339(),
        "type": AFP_TYPE_FILE_ACCESS_REQUEST,
        "subtype": AFP_SUBTYPE_FILE_ACCESS_REQUEST,
        "content": {
            "request_id": request_id,
            "reason": reason,
            "permission": permission,
            "requested_path": requested_path,
            "ttl_seconds": ttl_seconds,
            "first_op": first_op,
        },
        "metadata": { "store": true },
        "store_in_relational": true,
    })
}

/// Build a `file_access_request:grant` AFP message (emitted by the homeserver
/// after the user approves the request).
pub fn build_file_access_grant_afp(
    owner_user_id: &str,
    thread_id: &str,
    request_id: &str,
    granted_permission: &str,
    sandbox_root: &str,
    ttl_seconds: u32,
    allowed_extensions: &[&str],
    max_write_bytes: u64,
) -> Value {
    let expires_at = (Utc::now() + chrono::Duration::seconds(ttl_seconds as i64)).to_rfc3339();
    json!({
        "protocol": "afp-v1",
        "id": Ulid::new().to_string(),
        "thread_id": thread_id,
        "from": "homeserver",
        "to": ["master_agent", owner_user_id],
        "timestamp": Utc::now().to_rfc3339(),
        "type": AFP_TYPE_FILE_ACCESS_REQUEST,
        "subtype": AFP_SUBTYPE_FILE_ACCESS_GRANT,
        "content": {
            "request_id": request_id,
            "granted_permission": granted_permission,
            "sandbox_root": sandbox_root,
            "expires_at": expires_at,
            "allowed_extensions": allowed_extensions,
            "max_write_bytes": max_write_bytes,
        },
        "metadata": { "store": true },
        "store_in_relational": true,
    })
}

/// Build a `file_access_request:deny` AFP message.
pub fn build_file_access_deny_afp(
    owner_user_id: &str,
    thread_id: &str,
    request_id: &str,
    reason: &str,
    deny_reason: &str,
) -> Value {
    json!({
        "protocol": "afp-v1",
        "id": Ulid::new().to_string(),
        "thread_id": thread_id,
        "from": "homeserver",
        "to": ["master_agent", owner_user_id],
        "timestamp": Utc::now().to_rfc3339(),
        "type": AFP_TYPE_FILE_ACCESS_REQUEST,
        "subtype": AFP_SUBTYPE_FILE_ACCESS_DENY,
        "content": {
            "request_id": request_id,
            "reason": reason,
            "deny_reason": deny_reason,
        },
        "metadata": { "store": true },
        "store_in_relational": true,
    })
}

/// Build a `file_access_request:file_op` AFP message for a single operation.
pub fn build_file_op_afp(
    owner_user_id: &str,
    thread_id: &str,
    grant_request_id: &str,
    op: &str,
    path: &str,
    content_b64: Option<&str>,
    new_path: Option<&str>,
) -> Value {
    json!({
        "protocol": "afp-v1",
        "id": Ulid::new().to_string(),
        "thread_id": thread_id,
        "from": "master_agent",
        "to": [owner_user_id],
        "timestamp": Utc::now().to_rfc3339(),
        "type": AFP_TYPE_FILE_ACCESS_REQUEST,
        "subtype": AFP_SUBTYPE_FILE_ACCESS_OP,
        "content": {
            "op_id": Ulid::new().to_string(),
            "grant_request_id": grant_request_id,
            "op": op,
            "path": path,
            "content_b64": content_b64,
            "new_path": new_path,
            "list_limit": 100,
        },
        "metadata": { "store": false },
        "store_in_relational": false,
    })
}

/// Build a `file_access_request:revoke` AFP message (user-initiated session end).
pub fn build_file_access_revoke_afp(
    owner_user_id: &str,
    thread_id: &str,
    request_id: &str,
    reason: &str,
) -> Value {
    json!({
        "protocol": "afp-v1",
        "id": Ulid::new().to_string(),
        "thread_id": thread_id,
        "from": owner_user_id,
        "to": ["master_agent", "homeserver"],
        "timestamp": Utc::now().to_rfc3339(),
        "type": AFP_TYPE_FILE_ACCESS_REQUEST,
        "subtype": AFP_SUBTYPE_FILE_ACCESS_REVOKE,
        "content": {
            "request_id": request_id,
            "reason": reason,
            "revoked_at": Utc::now().to_rfc3339(),
        },
        "metadata": { "store": true },
        "store_in_relational": true,
    })
}

/// Validate that an `AfpFileOpContent` is authorized by a grant and that the
/// path is safe.  Returns `Ok(absolute_path)` or `Err(human-readable reason)`.
pub fn authorize_file_op(
    grant: &AfpFileAccessGrantContent,
    op: &AfpFileOpContent,
) -> Result<String, String> {
    validate_grant(grant)?;

    if !permission_allows_op(&grant.permission, &op.operation) {
        return Err(format!(
            "operation '{}' requires a higher permission tier than '{}'",
            op.operation, grant.permission
        ));
    }

    let abs_path = validate_sandbox_path(&grant.sandbox_root, &op.path)?;

    if op.operation == FILE_OP_WRITE || op.operation == FILE_OP_WRITE {
        check_extension(grant, &op.path)?;
        if let Some(b64) = &op.content_b64 {
            let approx_bytes = (b64.len() as f64 * 0.75) as u64;
            if grant.max_write_bytes > 0 && approx_bytes > grant.max_write_bytes {
                return Err(format!(
                    "write of ~{approx_bytes} bytes exceeds grant limit of {} bytes",
                    grant.max_write_bytes
                ));
            }
        }
    }

    Ok(abs_path)
}

// â”€â”€ Tests â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn perm_read_only_allows_list_and_read() {
        assert!(permission_allows_op(FILE_PERM_READ_ONLY, FILE_OP_LIST));
        assert!(permission_allows_op(FILE_PERM_READ_ONLY, FILE_OP_READ));
        assert!(!permission_allows_op(FILE_PERM_READ_ONLY, FILE_OP_WRITE));
        assert!(!permission_allows_op(FILE_PERM_READ_ONLY, FILE_OP_DELETE));
    }

    #[test]
    fn perm_read_write_allows_write_not_delete() {
        assert!(permission_allows_op(FILE_PERM_READ_WRITE, FILE_OP_WRITE));
        assert!(permission_allows_op(FILE_PERM_READ_WRITE, FILE_OP_MKDIR));
        assert!(!permission_allows_op(FILE_PERM_READ_WRITE, FILE_OP_DELETE));
        assert!(!permission_allows_op(FILE_PERM_READ_WRITE, FILE_OP_RENAME));
    }

    #[test]
    fn perm_full_control_allows_all() {
        for op in &[
            FILE_OP_LIST,
            FILE_OP_READ,
            FILE_OP_WRITE,
            FILE_OP_DELETE,
            FILE_OP_RENAME,
            FILE_OP_MKDIR,
        ] {
            assert!(
                permission_allows_op(FILE_PERM_FULL_CONTROL, op),
                "expected full_control to allow {op}"
            );
        }
    }

    #[test]
    fn sandbox_path_blocks_traversal() {
        assert!(validate_sandbox_path("/sandbox", "../../etc/passwd").is_err());
        assert!(validate_sandbox_path("/sandbox", "../secret").is_err());
    }

    #[test]
    fn sandbox_path_allows_valid_relative_path() {
        let result = validate_sandbox_path("/sandbox", "notes/todo.md");
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), "/sandbox/notes/todo.md");
    }

    #[test]
    fn extension_check_passes_when_no_allowlist() {
        let grant = AfpFileAccessGrantContent {
            allowed_extensions: vec![],
            ..Default::default()
        };
        assert!(check_extension(&grant, "anything.exe").is_ok());
    }

    #[test]
    fn extension_check_blocks_unlisted_extension() {
        let grant = AfpFileAccessGrantContent {
            allowed_extensions: vec![".txt".to_string(), ".md".to_string()],
            ..Default::default()
        };
        assert!(check_extension(&grant, "file.txt").is_ok());
        assert!(check_extension(&grant, "file.exe").is_err());
    }

    #[test]
    fn build_file_access_request_afp_shape() {
        let afp = build_file_access_request_afp(
            "user_01",
            "thread_01",
            "/sandbox/notes",
            FILE_PERM_READ_WRITE,
            "Agent needs to read project notes",
            300,
            Some(FILE_OP_LIST),
        );
        assert_eq!(afp["type"].as_str(), Some(AFP_TYPE_FILE_ACCESS_REQUEST));
        assert_eq!(
            afp["subtype"].as_str(),
            Some(AFP_SUBTYPE_FILE_ACCESS_REQUEST)
        );
        assert_eq!(
            afp["content"]["permission"].as_str(),
            Some(FILE_PERM_READ_WRITE)
        );
    }

    #[test]
    fn build_file_access_grant_afp_shape() {
        let afp = build_file_access_grant_afp(
            "user_01",
            "thread_01",
            "req_01",
            FILE_PERM_READ_ONLY,
            "/sandbox",
            300,
            &[],
            0,
        );
        assert_eq!(afp["subtype"].as_str(), Some(AFP_SUBTYPE_FILE_ACCESS_GRANT));
        assert_eq!(
            afp["content"]["granted_permission"].as_str(),
            Some(FILE_PERM_READ_ONLY)
        );
        assert!(afp["content"]["expires_at"].as_str().is_some());
    }

    #[test]
    fn build_file_op_afp_not_stored() {
        let afp = build_file_op_afp(
            "user_01",
            "thread_01",
            "req_01",
            FILE_OP_READ,
            "notes/todo.md",
            None,
            None,
        );
        assert_eq!(afp["subtype"].as_str(), Some(AFP_SUBTYPE_FILE_ACCESS_OP));
        assert_eq!(afp["metadata"]["store"].as_bool(), Some(false));
    }
}
