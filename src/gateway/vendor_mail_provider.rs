//! Disabled-by-default configuration boundary for the wedding vendor relay.
//!
//! This module deliberately does not call the shared Gmail gateway.  The
//! current Gmail integration remains an existing, separate continuity path;
//! enabling the vendor relay requires a platform-owned provider and complete
//! authenticated ingress configuration.

use crate::secret_manager::read_process_secret_trimmed;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum VendorMailProvider {
    Disabled,
    CloudflareEmailSending,
    Resend,
}

impl VendorMailProvider {
    fn from_env() -> Result<Self, String> {
        match std::env::var("OMNYID_VENDOR_MAIL_PROVIDER")
            .unwrap_or_else(|_| "disabled".to_string())
            .trim()
            .to_ascii_lowercase()
            .as_str()
        {
            "" | "disabled" => Ok(Self::Disabled),
            "cloudflare" | "cloudflare_email_sending" => Ok(Self::CloudflareEmailSending),
            "resend" => Ok(Self::Resend),
            // Gmail is intentionally not a vendor-relay provider, even while
            // legacy Gmail transport remains live elsewhere in the product.
            "gmail" | "gmail_oauth" | "smtp" | "outlook" => Err(
                "OMNYID_VENDOR_MAIL_PROVIDER cannot select a user mailbox transport".to_string(),
            ),
            _ => Err("OMNYID_VENDOR_MAIL_PROVIDER is not supported".to_string()),
        }
    }

    pub const fn label(self) -> &'static str {
        match self {
            Self::Disabled => "disabled",
            Self::CloudflareEmailSending => "cloudflare_email_sending",
            Self::Resend => "resend",
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct VendorMailReadiness {
    pub enabled: bool,
    pub provider: VendorMailProvider,
    pub ready: bool,
    pub reason: &'static str,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct VendorMailConfig {
    pub enabled: bool,
    pub provider: VendorMailProvider,
    pub mask_domain: String,
    pub from_address: String,
    has_cloudflare_token: bool,
    has_cloudflare_account_id: bool,
    has_resend_api_key: bool,
    has_worker_shared_secret: bool,
    has_resend_webhook_secret: bool,
}

impl VendorMailConfig {
    pub fn from_env() -> Result<Self, String> {
        let enabled = matches!(
            std::env::var("OMNYID_VENDOR_MAIL_ENABLED")
                .unwrap_or_else(|_| "false".to_string())
                .trim()
                .to_ascii_lowercase()
                .as_str(),
            "1" | "true" | "yes"
        );
        let provider = VendorMailProvider::from_env()?;
        let mask_domain = std::env::var("OMNYID_VENDOR_MAIL_MASK_DOMAIN")
            .unwrap_or_else(|_| "mail.omnyid.com".to_string())
            .trim()
            .to_ascii_lowercase();
        if mask_domain != "mail.omnyid.com" {
            return Err("OMNYID_VENDOR_MAIL_MASK_DOMAIN must be mail.omnyid.com".to_string());
        }
        let from_address = std::env::var("OMNYID_VENDOR_MAIL_FROM_ADDRESS")
            .unwrap_or_else(|_| "hello@omnyid.com".to_string())
            .trim()
            .to_ascii_lowercase();
        if !valid_platform_sender(&from_address) {
            return Err(
                "OMNYID_VENDOR_MAIL_FROM_ADDRESS must be an omnyid.com sender address".to_string(),
            );
        }
        Ok(Self {
            enabled,
            provider,
            mask_domain,
            from_address,
            has_cloudflare_token: read_process_secret_trimmed(
                "OMNYID_VENDOR_MAIL_CLOUDFLARE_API_TOKEN",
            )
            .is_some(),
            has_cloudflare_account_id: std::env::var("OMNYID_VENDOR_MAIL_CLOUDFLARE_ACCOUNT_ID")
                .is_ok_and(|value| value.trim().len() == 32),
            has_resend_api_key: read_process_secret_trimmed("OMNYID_VENDOR_MAIL_RESEND_API_KEY")
                .is_some(),
            has_worker_shared_secret: read_process_secret_trimmed(
                "OMNYID_VENDOR_MAIL_WORKER_SHARED_SECRET",
            )
            .is_some(),
            has_resend_webhook_secret: read_process_secret_trimmed(
                "OMNYID_VENDOR_MAIL_RESEND_WEBHOOK_SECRET",
            )
            .is_some(),
        })
    }

    pub fn readiness(&self) -> VendorMailReadiness {
        if !self.enabled {
            return VendorMailReadiness {
                enabled: false,
                provider: self.provider,
                ready: false,
                reason: "disabled",
            };
        }
        match self.provider {
            VendorMailProvider::Disabled => VendorMailReadiness {
                enabled: true,
                provider: self.provider,
                ready: false,
                reason: "provider_disabled",
            },
            VendorMailProvider::CloudflareEmailSending
                if !self.has_cloudflare_token
                    || !self.has_cloudflare_account_id
                    || !self.has_worker_shared_secret =>
            {
                VendorMailReadiness {
                    enabled: true,
                    provider: self.provider,
                    ready: false,
                    reason: "cloudflare_credentials_missing",
                }
            }
            VendorMailProvider::Resend
                if !self.has_resend_api_key || !self.has_resend_webhook_secret =>
            {
                VendorMailReadiness {
                    enabled: true,
                    provider: self.provider,
                    ready: false,
                    reason: "resend_credentials_missing",
                }
            }
            _ => VendorMailReadiness {
                enabled: true,
                provider: self.provider,
                ready: true,
                reason: "ready",
            },
        }
    }
}

fn valid_platform_sender(value: &str) -> bool {
    value.len() <= 254
        && !value.contains(char::is_whitespace)
        && value
            .rsplit_once('@')
            .is_some_and(|(local, domain)| !local.is_empty() && domain == "omnyid.com")
}

#[cfg(test)]
mod tests {
    use super::{VendorMailConfig, VendorMailProvider};
    use std::sync::{Mutex, OnceLock};

    fn env_lock() -> &'static Mutex<()> {
        static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
        LOCK.get_or_init(|| Mutex::new(()))
    }

    fn clear_env() {
        for key in [
            "OMNYID_VENDOR_MAIL_ENABLED",
            "OMNYID_VENDOR_MAIL_PROVIDER",
            "OMNYID_VENDOR_MAIL_MASK_DOMAIN",
            "OMNYID_VENDOR_MAIL_FROM_ADDRESS",
            "OMNYID_VENDOR_MAIL_CLOUDFLARE_API_TOKEN",
            "OMNYID_VENDOR_MAIL_CLOUDFLARE_ACCOUNT_ID",
            "OMNYID_VENDOR_MAIL_RESEND_API_KEY",
            "OMNYID_VENDOR_MAIL_WORKER_SHARED_SECRET",
            "OMNYID_VENDOR_MAIL_RESEND_WEBHOOK_SECRET",
        ] {
            unsafe { std::env::remove_var(key) };
        }
    }

    #[test]
    fn defaults_are_disabled_and_do_not_touch_gmail() {
        let _guard = env_lock().lock().expect("env lock");
        clear_env();
        let config = VendorMailConfig::from_env().expect("default config");
        assert_eq!(config.provider, VendorMailProvider::Disabled);
        assert_eq!(config.readiness().reason, "disabled");
    }

    #[test]
    fn rejects_user_mailbox_provider_names() {
        let _guard = env_lock().lock().expect("env lock");
        clear_env();
        unsafe { std::env::set_var("OMNYID_VENDOR_MAIL_PROVIDER", "gmail") };
        assert!(VendorMailConfig::from_env().is_err());
        clear_env();
    }

    #[test]
    fn cloudflare_requires_platform_credentials_when_enabled() {
        let _guard = env_lock().lock().expect("env lock");
        clear_env();
        unsafe {
            std::env::set_var("OMNYID_VENDOR_MAIL_ENABLED", "true");
            std::env::set_var("OMNYID_VENDOR_MAIL_PROVIDER", "cloudflare");
        }
        let config = VendorMailConfig::from_env().expect("config");
        assert_eq!(config.readiness().reason, "cloudflare_credentials_missing");
        unsafe { std::env::set_var("OMNYID_VENDOR_MAIL_CLOUDFLARE_API_TOKEN", "send-only-token") };
        let send_only = VendorMailConfig::from_env().expect("send-only config");
        assert_eq!(send_only.readiness().reason, "cloudflare_credentials_missing");
        clear_env();
    }

    #[test]
    fn cloudflare_is_ready_only_with_account_token_and_ingress_secret() {
        let _guard = env_lock().lock().expect("env lock");
        clear_env();
        unsafe {
            std::env::set_var("OMNYID_VENDOR_MAIL_ENABLED", "true");
            std::env::set_var("OMNYID_VENDOR_MAIL_PROVIDER", "cloudflare");
            std::env::set_var("OMNYID_VENDOR_MAIL_CLOUDFLARE_API_TOKEN", "account-token");
            std::env::set_var(
                "OMNYID_VENDOR_MAIL_CLOUDFLARE_ACCOUNT_ID",
                "0123456789abcdef0123456789abcdef",
            );
            std::env::set_var("OMNYID_VENDOR_MAIL_WORKER_SHARED_SECRET", "worker-secret");
            std::env::set_var("OMNYID_VENDOR_MAIL_FROM_ADDRESS", "hello@omnyid.com");
        }
        let config = VendorMailConfig::from_env().expect("complete config");
        assert_eq!(config.from_address, "hello@omnyid.com");
        assert!(config.readiness().ready);
        clear_env();
    }
}
