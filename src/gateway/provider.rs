#[derive(Clone, Debug, PartialEq, Eq)]
pub enum MailProvider {
    Gmail,
    Outlook,
    CustomImap,
    Disabled,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum InboundAuthMode {
    OAuthGmailApi,
    OAuthMicrosoftGraph,
    DirectCredentialsFallback,
    Disabled,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum OutboundAuthMode {
    OAuthGmailApi,
    OAuthMicrosoftGraph,
    DirectSmtpFallback,
    Disabled,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct MailGatewayConfig {
    pub provider: MailProvider,
    pub inbound_auth_mode: InboundAuthMode,
    pub outbound_auth_mode: OutboundAuthMode,
    pub poll_interval_seconds: u64,
    pub email_address: Option<String>,
    pub imap_host: Option<String>,
    pub imap_port: u16,
    pub imap_username: Option<String>,
    pub imap_password: Option<String>,
    pub smtp_host: Option<String>,
    pub smtp_port: u16,
    pub smtp_username: Option<String>,
    pub smtp_password: Option<String>,
    pub gmail_client_id: Option<String>,
    pub gmail_client_secret: Option<String>,
    pub gmail_refresh_token: Option<String>,
    pub gmail_user_id: Option<String>,
    pub from_address: Option<String>,
}

impl MailGatewayConfig {
    pub fn from_env() -> Self {
        let provider_raw = std::env::var("OMNYID_MAIL_PROVIDER")
            .unwrap_or_else(|_| "disabled".to_string())
            .to_lowercase();
        let provider = match provider_raw.as_str() {
            "gmail" => MailProvider::Gmail,
            "outlook" => MailProvider::Outlook,
            "custom" | "custom-imap" => MailProvider::CustomImap,
            _ => MailProvider::Disabled,
        };

        let poll_interval_seconds = std::env::var("OMNYID_IMAP_POLL_SECONDS")
            .ok()
            .and_then(|value| value.parse::<u64>().ok())
            .map(|value| value.clamp(30, 60))
            .unwrap_or(30);

        let email_address = std::env::var("OMNYID_EMAIL_ADDRESS")
            .ok()
            .filter(|s| !s.trim().is_empty());
        let imap_host = std::env::var("OMNYID_IMAP_HOST")
            .ok()
            .filter(|s| !s.trim().is_empty());
        let imap_port = std::env::var("OMNYID_IMAP_PORT")
            .ok()
            .and_then(|value| value.parse::<u16>().ok())
            .unwrap_or(993);
        let imap_username = std::env::var("OMNYID_IMAP_USERNAME")
            .ok()
            .filter(|s| !s.trim().is_empty());
        let imap_password = read_process_secret_trimmed("OMNYID_IMAP_PASSWORD");
        let smtp_host = std::env::var("SMTP_HOST")
            .ok()
            .filter(|s| !s.trim().is_empty());
        let smtp_port = std::env::var("SMTP_PORT")
            .ok()
            .and_then(|value| value.parse::<u16>().ok())
            .unwrap_or(587);
        let smtp_username = std::env::var("SMTP_USER")
            .ok()
            .filter(|s| !s.trim().is_empty());
        let smtp_password = read_process_secret_trimmed("SMTP_PASS");
        let gmail_client_id = std::env::var("OMNYID_GMAIL_CLIENT_ID")
            .ok()
            .filter(|s| !s.trim().is_empty());
        let gmail_client_secret = read_process_secret_trimmed("OMNYID_GMAIL_CLIENT_SECRET");
        let gmail_refresh_token = read_process_secret_trimmed("OMNYID_GMAIL_REFRESH_TOKEN");
        let gmail_user_id = std::env::var("OMNYID_GMAIL_USER_ID")
            .ok()
            .filter(|s| !s.trim().is_empty())
            .or_else(|| Some("me".to_string()));
        let from_address = std::env::var("FROM_ADDRESS")
            .ok()
            .filter(|s| !s.trim().is_empty())
            .or_else(|| email_address.clone());

        let inbound_auth_mode = match provider {
            MailProvider::Gmail => {
                if has_env("OMNYID_GMAIL_CLIENT_ID") && has_env("OMNYID_GMAIL_CLIENT_SECRET") {
                    InboundAuthMode::OAuthGmailApi
                } else {
                    InboundAuthMode::Disabled
                }
            }
            MailProvider::Outlook => {
                if has_env("OMNYID_MICROSOFT_CLIENT_ID")
                    && has_env("OMNYID_MICROSOFT_CLIENT_SECRET")
                    && has_env("OMNYID_MICROSOFT_REFRESH_TOKEN")
                {
                    InboundAuthMode::OAuthMicrosoftGraph
                } else {
                    InboundAuthMode::Disabled
                }
            }
            MailProvider::CustomImap => {
                if has_env("OMNYID_IMAP_HOST")
                    && has_env("OMNYID_IMAP_USERNAME")
                    && has_env("OMNYID_IMAP_PASSWORD")
                {
                    InboundAuthMode::DirectCredentialsFallback
                } else {
                    InboundAuthMode::Disabled
                }
            }
            MailProvider::Disabled => InboundAuthMode::Disabled,
        };

        let outbound_auth_mode = match provider {
            MailProvider::Gmail => {
                if has_env("OMNYID_GMAIL_CLIENT_ID")
                    && has_env("OMNYID_GMAIL_CLIENT_SECRET")
                    && has_env("OMNYID_GMAIL_REFRESH_TOKEN")
                {
                    OutboundAuthMode::OAuthGmailApi
                } else {
                    OutboundAuthMode::Disabled
                }
            }
            MailProvider::Outlook => {
                if has_env("OMNYID_MICROSOFT_CLIENT_ID")
                    && has_env("OMNYID_MICROSOFT_CLIENT_SECRET")
                    && has_env("OMNYID_MICROSOFT_REFRESH_TOKEN")
                {
                    OutboundAuthMode::OAuthMicrosoftGraph
                } else {
                    OutboundAuthMode::Disabled
                }
            }
            MailProvider::CustomImap => {
                if has_env("SMTP_HOST") && has_env("SMTP_USER") && has_env("SMTP_PASS") {
                    OutboundAuthMode::DirectSmtpFallback
                } else {
                    OutboundAuthMode::Disabled
                }
            }
            MailProvider::Disabled => OutboundAuthMode::Disabled,
        };

        Self {
            provider,
            inbound_auth_mode,
            outbound_auth_mode,
            poll_interval_seconds,
            email_address,
            imap_host,
            imap_port,
            imap_username,
            imap_password,
            smtp_host,
            smtp_port,
            smtp_username,
            smtp_password,
            gmail_client_id,
            gmail_client_secret,
            gmail_refresh_token,
            gmail_user_id,
            from_address,
        }
    }

    pub fn inbound_enabled(&self) -> bool {
        !matches!(self.inbound_auth_mode, InboundAuthMode::Disabled)
    }

    pub fn outbound_enabled(&self) -> bool {
        !matches!(self.outbound_auth_mode, OutboundAuthMode::Disabled)
    }

    pub fn provider_label(&self) -> &'static str {
        match self.provider {
            MailProvider::Gmail => "gmail",
            MailProvider::Outlook => "outlook",
            MailProvider::CustomImap => "custom-imap",
            MailProvider::Disabled => "disabled",
        }
    }
}

fn has_env(name: &str) -> bool {
    read_process_secret(name).is_some()
}

#[cfg(test)]
mod tests {
    use super::{InboundAuthMode, MailGatewayConfig, MailProvider, OutboundAuthMode};
    use std::sync::{Mutex, OnceLock};

    fn env_lock() -> &'static Mutex<()> {
        static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
        LOCK.get_or_init(|| Mutex::new(()))
    }

    fn clear_env() {
        for key in [
            "OMNYID_MAIL_PROVIDER",
            "OMNYID_IMAP_POLL_SECONDS",
            "OMNYID_EMAIL_ADDRESS",
            "OMNYID_IMAP_HOST",
            "OMNYID_IMAP_PORT",
            "OMNYID_IMAP_USERNAME",
            "OMNYID_IMAP_PASSWORD",
            "OMNYID_GMAIL_CLIENT_ID",
            "OMNYID_GMAIL_CLIENT_SECRET",
            "OMNYID_GMAIL_REFRESH_TOKEN",
            "OMNYID_MICROSOFT_CLIENT_ID",
            "OMNYID_MICROSOFT_CLIENT_SECRET",
            "OMNYID_MICROSOFT_REFRESH_TOKEN",
            "SMTP_HOST",
            "SMTP_USER",
            "SMTP_PASS",
            "SMTP_PORT",
            "OMNYID_GMAIL_USER_ID",
            "FROM_ADDRESS",
        ] {
            unsafe {
                std::env::remove_var(key);
            }
        }
    }

    #[test]
    fn gmail_config_prefers_oauth_for_inbound_and_outbound() {
        let _guard = env_lock().lock().expect("env lock");
        clear_env();
        unsafe {
            std::env::set_var("OMNYID_MAIL_PROVIDER", "gmail");
            std::env::set_var("OMNYID_GMAIL_CLIENT_ID", "client");
            std::env::set_var("OMNYID_GMAIL_CLIENT_SECRET", "secret");
            std::env::set_var("OMNYID_GMAIL_REFRESH_TOKEN", "refresh");
            std::env::set_var("OMNYID_GMAIL_USER_ID", "me");
        }

        let config = MailGatewayConfig::from_env();
        assert_eq!(config.provider, MailProvider::Gmail);
        assert_eq!(config.inbound_auth_mode, InboundAuthMode::OAuthGmailApi);
        assert_eq!(config.outbound_auth_mode, OutboundAuthMode::OAuthGmailApi);
        assert_eq!(config.gmail_user_id.as_deref(), Some("me"));
    }

    #[test]
    fn gmail_inbound_allows_user_scoped_oauth_without_env_refresh_token() {
        let _guard = env_lock().lock().expect("env lock");
        clear_env();
        unsafe {
            std::env::set_var("OMNYID_MAIL_PROVIDER", "gmail");
            std::env::set_var("OMNYID_GMAIL_CLIENT_ID", "client");
            std::env::set_var("OMNYID_GMAIL_CLIENT_SECRET", "secret");
        }

        let config = MailGatewayConfig::from_env();
        assert_eq!(config.provider, MailProvider::Gmail);
        assert_eq!(config.inbound_auth_mode, InboundAuthMode::OAuthGmailApi);
        assert_eq!(config.outbound_auth_mode, OutboundAuthMode::Disabled);
        assert!(config.inbound_enabled());
        assert!(!config.outbound_enabled());
    }

    #[test]
    fn custom_config_uses_direct_fallbacks() {
        let _guard = env_lock().lock().expect("env lock");
        clear_env();
        unsafe {
            std::env::set_var("OMNYID_MAIL_PROVIDER", "custom");
            std::env::set_var("OMNYID_IMAP_HOST", "mail.example.com");
            std::env::set_var("OMNYID_IMAP_PORT", "993");
            std::env::set_var("OMNYID_IMAP_USERNAME", "user@example.com");
            std::env::set_var("OMNYID_IMAP_PASSWORD", "secret");
            std::env::set_var("SMTP_HOST", "smtp.example.com");
            std::env::set_var("SMTP_USER", "user@example.com");
            std::env::set_var("SMTP_PASS", "secret");
        }

        let config = MailGatewayConfig::from_env();
        assert_eq!(config.provider, MailProvider::CustomImap);
        assert_eq!(
            config.inbound_auth_mode,
            InboundAuthMode::DirectCredentialsFallback
        );
        assert_eq!(
            config.outbound_auth_mode,
            OutboundAuthMode::DirectSmtpFallback
        );
        assert_eq!(config.imap_port, 993);
        assert_eq!(config.imap_username.as_deref(), Some("user@example.com"));
    }

    #[test]
    fn poll_interval_is_clamped_into_supported_window() {
        let _guard = env_lock().lock().expect("env lock");
        clear_env();
        unsafe {
            std::env::set_var("OMNYID_MAIL_PROVIDER", "gmail");
            std::env::set_var("OMNYID_GMAIL_CLIENT_ID", "client");
            std::env::set_var("OMNYID_GMAIL_CLIENT_SECRET", "secret");
            std::env::set_var("OMNYID_GMAIL_REFRESH_TOKEN", "refresh");
            std::env::set_var("OMNYID_IMAP_POLL_SECONDS", "5");
        }

        let config = MailGatewayConfig::from_env();
        assert_eq!(config.poll_interval_seconds, 30);
        assert!(config.inbound_enabled());
        assert!(config.outbound_enabled());
    }
}
use crate::secret_manager::{read_process_secret, read_process_secret_trimmed};
