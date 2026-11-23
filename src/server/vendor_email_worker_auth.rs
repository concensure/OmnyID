//! File-backed HMAC key selection for the Cloudflare Email Worker.
//!
//! Exactly one active and one optional previous key are accepted. Keeping the
//! overlap here makes forward rotation and bounded rollback explicit without
//! exposing secrets or teaching the ingress route about secret-file details.

#[derive(Debug, Eq, PartialEq)]
pub(super) enum WorkerSecretError {
    Unavailable,
    Invalid,
}

pub(super) fn configured_worker_secret(
    requested_key_id: &str,
) -> Result<(String, String), WorkerSecretError> {
    let active_key_id = std::env::var("OMNYID_VENDOR_MAIL_WORKER_KEY_ID")
        .unwrap_or_else(|_| "primary-v1".to_string());
    let active_secret = crate::secret_manager::read_process_secret_trimmed(
        "OMNYID_VENDOR_MAIL_WORKER_SHARED_SECRET",
    )
    .filter(|value| value.as_bytes().len() >= 32)
    .ok_or(WorkerSecretError::Unavailable)?;
    if requested_key_id == active_key_id && safe_key_id(requested_key_id) {
        return Ok((active_key_id, active_secret));
    }

    let previous_key_id = std::env::var("OMNYID_VENDOR_MAIL_WORKER_PREVIOUS_KEY_ID")
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| safe_key_id(value) && value != &active_key_id);
    let previous_secret = crate::secret_manager::read_process_secret_trimmed(
        "OMNYID_VENDOR_MAIL_WORKER_PREVIOUS_SHARED_SECRET",
    )
    .filter(|value| value.as_bytes().len() >= 32);
    match (previous_key_id, previous_secret) {
        (Some(key_id), Some(secret)) if requested_key_id == key_id => Ok((key_id, secret)),
        _ => Err(WorkerSecretError::Invalid),
    }
}

fn safe_key_id(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 64
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_'))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Mutex, OnceLock};

    fn env_lock() -> &'static Mutex<()> {
        static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
        LOCK.get_or_init(|| Mutex::new(()))
    }

    #[test]
    fn active_previous_and_rollback_keys_are_bounded() {
        let _guard = env_lock().lock().expect("worker key environment lock");
        let names = [
            "OMNYID_VENDOR_MAIL_WORKER_KEY_ID",
            "OMNYID_VENDOR_MAIL_WORKER_SHARED_SECRET",
            "OMNYID_VENDOR_MAIL_WORKER_PREVIOUS_KEY_ID",
            "OMNYID_VENDOR_MAIL_WORKER_PREVIOUS_SHARED_SECRET",
        ];
        let original = names.map(|name| std::env::var(name).ok());
        set_pair(
            "next-v2",
            "next-next-next-next-next-next-next-next",
            "primary-v1",
            "prior-prior-prior-prior-prior-prior",
        );
        assert_eq!(
            configured_worker_secret("next-v2").expect("active").0,
            "next-v2"
        );
        assert_eq!(
            configured_worker_secret("primary-v1").expect("previous").0,
            "primary-v1"
        );
        assert_eq!(
            configured_worker_secret("unknown-v9"),
            Err(WorkerSecretError::Invalid)
        );

        set_pair(
            "primary-v1",
            "prior-prior-prior-prior-prior-prior",
            "next-v2",
            "next-next-next-next-next-next-next-next",
        );
        assert_eq!(
            configured_worker_secret("next-v2")
                .expect("rollback overlap")
                .0,
            "next-v2"
        );
        restore(&names, original);
    }

    fn set_pair(active_id: &str, active: &str, previous_id: &str, previous: &str) {
        unsafe {
            std::env::set_var("OMNYID_VENDOR_MAIL_WORKER_KEY_ID", active_id);
            std::env::set_var("OMNYID_VENDOR_MAIL_WORKER_SHARED_SECRET", active);
            std::env::set_var("OMNYID_VENDOR_MAIL_WORKER_PREVIOUS_KEY_ID", previous_id);
            std::env::set_var("OMNYID_VENDOR_MAIL_WORKER_PREVIOUS_SHARED_SECRET", previous);
        }
    }

    fn restore(names: &[&str; 4], original: [Option<String>; 4]) {
        for (name, value) in names.iter().zip(original) {
            unsafe {
                match value {
                    Some(value) => std::env::set_var(name, value),
                    None => std::env::remove_var(name),
                }
            }
        }
    }
}
