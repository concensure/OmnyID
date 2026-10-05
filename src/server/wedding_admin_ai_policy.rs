// @locs-version: 1.0
// @module-id: server.wedding-admin-ai-policy
// @primary-capability: platform-funded-wedding-ai-guardrails
// @stability: active
//
// Runtime policy for platform-funded wedding-only AI work. This is intentionally
// separate from a user's BYOK/master-agent selection: direct Master Agent queries
// must never acquire an admin-funded wedding model.

fn env_flag_enabled(key: &str) -> bool {
    matches!(
        std::env::var(key)
            .ok()
            .as_deref()
            .map(str::trim)
            .map(str::to_ascii_lowercase)
            .as_deref(),
        Some("1" | "true" | "yes" | "on")
    )
}

pub(super) fn routing_enabled() -> bool {
    env_flag_enabled("OMNYID_WEDDING_ADMIN_AI_ROUTING_ENABLED")
}

pub(super) fn audit_receipts_enabled() -> bool {
    env_flag_enabled("OMNYID_WEDDING_ADMIN_AI_AUDIT_RECEIPTS_ENABLED")
}

pub(super) fn daily_request_limit() -> Option<usize> {
    std::env::var("OMNYID_WEDDING_ADMIN_AI_DAILY_REQUEST_LIMIT")
        .ok()
        .and_then(|value| value.trim().parse::<usize>().ok())
        .filter(|value| *value > 0)
}

/// A wedding route may spend platform funds only when all executable guardrails
/// are explicit. The request limit is deliberately mandatory here because it is
/// enforced at the route, unlike a documentation-only dollar/token setting.
pub(super) fn execution_enabled() -> bool {
    routing_enabled() && audit_receipts_enabled() && daily_request_limit().is_some()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Mutex, OnceLock};

    fn env_lock() -> std::sync::MutexGuard<'static, ()> {
        static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
        LOCK.get_or_init(|| Mutex::new(())).lock().expect("env lock")
    }

    #[test]
    fn execution_requires_routing_audit_and_an_enforceable_request_limit() {
        let _guard = env_lock();
        unsafe {
            std::env::remove_var("OMNYID_WEDDING_ADMIN_AI_ROUTING_ENABLED");
            std::env::remove_var("OMNYID_WEDDING_ADMIN_AI_AUDIT_RECEIPTS_ENABLED");
            std::env::remove_var("OMNYID_WEDDING_ADMIN_AI_DAILY_REQUEST_LIMIT");
        }
        assert!(!execution_enabled());

        unsafe {
            std::env::set_var("OMNYID_WEDDING_ADMIN_AI_ROUTING_ENABLED", "true");
            std::env::set_var("OMNYID_WEDDING_ADMIN_AI_AUDIT_RECEIPTS_ENABLED", "true");
            std::env::set_var("OMNYID_WEDDING_ADMIN_AI_DAILY_REQUEST_LIMIT", "60");
        }
        assert_eq!(daily_request_limit(), Some(60));
        assert!(execution_enabled());

        unsafe {
            std::env::remove_var("OMNYID_WEDDING_ADMIN_AI_ROUTING_ENABLED");
            std::env::remove_var("OMNYID_WEDDING_ADMIN_AI_AUDIT_RECEIPTS_ENABLED");
            std::env::remove_var("OMNYID_WEDDING_ADMIN_AI_DAILY_REQUEST_LIMIT");
        }
    }
}
