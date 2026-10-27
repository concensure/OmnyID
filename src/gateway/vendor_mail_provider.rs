//! Disabled-by-default configuration boundary for the wedding vendor relay.
//!
//! This module deliberately does not call the shared Gmail gateway.  The
//! current Gmail integration remains an existing, separate continuity path;
//! enabling the vendor relay requires a platform-owned provider and complete
//! authenticated ingress configuration.

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::{db::Db, secret_manager::read_process_secret_trimmed};

const CLOUDFLARE_SEND_URL_PREFIX: &str = "https://api.cloudflare.com/client/v4/accounts";

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
    has_clamav_endpoint: bool,
    has_resend_webhook_secret: bool,
    has_recipient_allowlist: bool,
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
            has_clamav_endpoint: std::env::var("CLAMD_HOST")
                .is_ok_and(|value| !value.trim().is_empty()),
            has_resend_webhook_secret: read_process_secret_trimmed(
                "OMNYID_VENDOR_MAIL_RESEND_WEBHOOK_SECRET",
            )
            .is_some(),
            has_recipient_allowlist: configured_recipient_allowlist()
                .is_some_and(|set| !set.is_empty()),
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
                    || !self.has_worker_shared_secret
                    || !self.has_clamav_endpoint
                    || !self.has_recipient_allowlist =>
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

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum VendorMailDeliveryState {
    Accepted,
    Delivered,
    Bounced,
    Suppressed,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
pub struct VendorMailProviderReceipt {
    pub provider: String,
    pub provider_receipt_key: String,
    pub state: VendorMailDeliveryState,
    pub automatic_retry_allowed: bool,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct VendorMailSendRequest {
    pub from: String,
    pub to: String,
    pub subject: String,
    pub text: String,
    pub reply_to: Option<String>,
    pub message_id: String,
}

#[derive(Debug, Deserialize)]
struct CloudflareSendEnvelope {
    success: bool,
    #[serde(default)]
    result: Option<CloudflareSendResult>,
}

#[derive(Debug, Default, Deserialize)]
struct CloudflareSendResult {
    #[serde(default)]
    delivered: Vec<String>,
    #[serde(default)]
    queued: Vec<String>,
    #[serde(default)]
    permanent_bounces: Vec<String>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
pub struct CloudflareSuppressionRecord {
    pub id: String,
    pub email: String,
    pub reason: String,
    #[serde(default)]
    pub expires_at: Option<String>,
}

impl CloudflareSuppressionRecord {
    pub fn blocks_automatic_retry(&self) -> bool {
        matches!(
            self.reason.trim().to_ascii_lowercase().as_str(),
            "complaint" | "hard_bounce" | "soft_bounce" | "manual" | "policy"
        )
    }

    pub fn event_kind(&self) -> Option<&'static str> {
        match self.reason.trim().to_ascii_lowercase().as_str() {
            "complaint" => Some("complained"),
            "hard_bounce" | "soft_bounce" => Some("bounced"),
            "manual" | "policy" => Some("failed"),
            _ => None,
        }
    }
}

pub async fn record_cloudflare_suppression(
    db: &Db,
    record: &CloudflareSuppressionRecord,
) -> Result<bool, String> {
    if !valid_email_address(&record.email) || !record.blocks_automatic_retry() {
        return Err("invalid_provider_suppression".to_string());
    }
    let Some(event_kind) = record.event_kind() else {
        return Err("invalid_provider_suppression".to_string());
    };
    let recipient_digest = hex::encode(Sha256::digest(
        record.email.trim().to_ascii_lowercase().as_bytes(),
    ));
    let provider_record_digest = hex::encode(Sha256::digest(record.id.as_bytes()));
    let payload_digest = hex::encode(Sha256::digest(
        format!(
            "cloudflare_email_sending\n{}\n{}\n{}",
            record.id, recipient_digest, record.reason
        )
        .as_bytes(),
    ));
    let suppress_until = record
        .expires_at
        .as_deref()
        .map(chrono::DateTime::parse_from_rfc3339)
        .transpose()
        .map_err(|_| "invalid_provider_suppression".to_string())?
        .map(|value| value.with_timezone(&chrono::Utc));
    let event_id = format!("suppression:{provider_record_digest}");
    let mut tx = db
        .pool
        .begin()
        .await
        .map_err(|_| "database_failure".to_string())?;
    let inserted = sqlx::query(
        r#"INSERT INTO wedding_vendor_email_provider_events
             (provider, provider_event_id, event_kind, payload_digest,
              processing_status, attempt_count, processed_at)
           VALUES ('cloudflare_email_sending', $1, $2, $3, 'completed', 1, NOW())
           ON CONFLICT (provider, provider_event_id) DO NOTHING"#,
    )
    .bind(&event_id)
    .bind(event_kind)
    .bind(&payload_digest)
    .execute(&mut *tx)
    .await
    .map_err(|_| "database_failure".to_string())?
    .rows_affected()
        == 1;
    sqlx::query(
        r#"INSERT INTO wedding_vendor_email_delivery_suppressions
             (provider, recipient_digest, reason, provider_record_digest, suppress_until)
           VALUES ('cloudflare_email_sending', $1, $2, $3, $4)
           ON CONFLICT (provider, recipient_digest) DO UPDATE SET
             reason = EXCLUDED.reason,
             provider_record_digest = EXCLUDED.provider_record_digest,
             suppress_until = EXCLUDED.suppress_until,
             recorded_at = NOW()"#,
    )
    .bind(&recipient_digest)
    .bind(record.reason.trim().to_ascii_lowercase())
    .bind(&provider_record_digest)
    .bind(suppress_until)
    .execute(&mut *tx)
    .await
    .map_err(|_| "database_failure".to_string())?;
    tx.commit()
        .await
        .map_err(|_| "database_failure".to_string())?;
    Ok(inserted)
}

pub async fn cloudflare_recipient_is_suppressed(db: &Db, recipient: &str) -> Result<bool, String> {
    if !valid_email_address(recipient) {
        return Err("invalid_vendor_mail_recipient".to_string());
    }
    let digest = hex::encode(Sha256::digest(
        recipient.trim().to_ascii_lowercase().as_bytes(),
    ));
    sqlx::query_scalar::<_, bool>(
        r#"SELECT EXISTS (
             SELECT 1 FROM wedding_vendor_email_delivery_suppressions
              WHERE provider = 'cloudflare_email_sending'
                AND recipient_digest = $1
                AND (suppress_until IS NULL OR suppress_until > NOW())
           )"#,
    )
    .bind(digest)
    .fetch_one(&db.pool)
    .await
    .map_err(|_| "database_failure".to_string())
}

pub fn recipient_is_allowlisted(recipient: &str) -> bool {
    let normalized = recipient.trim().to_ascii_lowercase();
    configured_recipient_allowlist().is_some_and(|set| set.contains(&normalized))
}

fn configured_recipient_allowlist() -> Option<std::collections::BTreeSet<String>> {
    let raw = read_process_secret_trimmed("OMNYID_VENDOR_MAIL_RECIPIENT_ALLOWLIST")?;
    let values = raw
        .split(|character: char| character == ',' || character == ';' || character.is_whitespace())
        .map(str::trim)
        .filter(|value| valid_email_address(value))
        .map(str::to_ascii_lowercase)
        .collect::<std::collections::BTreeSet<_>>();
    Some(values)
}

/// Send one explicitly allowlisted vendor-relay message through Cloudflare.
///
/// This function deliberately performs exactly one provider request. Provider
/// acceptance, immediate delivery, bounce and suppression are returned as
/// distinct receipt states; the application never retries a receipt-bearing
/// request automatically.
pub async fn send_allowlisted_cloudflare_vendor_mail(
    db: &Db,
    request: &VendorMailSendRequest,
) -> Result<VendorMailProviderReceipt, String> {
    let (token, account_id) = cloudflare_send_preflight(request)?;
    if cloudflare_recipient_is_suppressed(db, &request.to).await? {
        return Err("recipient_suppressed".to_string());
    }
    let endpoint = format!(
        "{CLOUDFLARE_SEND_URL_PREFIX}/{}/email/sending/send",
        urlencoding::encode(&account_id)
    );
    send_cloudflare_vendor_mail_to_endpoint(&endpoint, &token, request).await
}

fn cloudflare_send_preflight(request: &VendorMailSendRequest) -> Result<(String, String), String> {
    let config = VendorMailConfig::from_env()?;
    if !config.readiness().ready || config.provider != VendorMailProvider::CloudflareEmailSending {
        return Err("vendor_mail_not_ready".to_string());
    }
    validate_send_request(request)?;
    if !recipient_is_allowlisted(&request.to) {
        return Err("recipient_not_allowlisted".to_string());
    }
    let token = read_process_secret_trimmed("OMNYID_VENDOR_MAIL_CLOUDFLARE_API_TOKEN")
        .ok_or_else(|| "vendor_mail_not_ready".to_string())?;
    let account_id = std::env::var("OMNYID_VENDOR_MAIL_CLOUDFLARE_ACCOUNT_ID")
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| value.len() == 32)
        .ok_or_else(|| "vendor_mail_not_ready".to_string())?;
    Ok((token, account_id))
}

async fn send_cloudflare_vendor_mail_to_endpoint(
    endpoint: &str,
    token: &str,
    request: &VendorMailSendRequest,
) -> Result<VendorMailProviderReceipt, String> {
    let mut payload = serde_json::json!({
        "from": request.from,
        "to": request.to,
        "subject": request.subject,
        "text": request.text,
        "headers": {
            "X-OmnyID-Receipt-ID": request.message_id,
        }
    });
    if let Some(reply_to) = request.reply_to.as_deref() {
        payload["reply_to"] = serde_json::json!(reply_to);
    }
    let response = reqwest::Client::new()
        .post(endpoint)
        .bearer_auth(token)
        .json(&payload)
        .send()
        .await
        .map_err(|_| "provider_request_failed".to_string())?;
    if !response.status().is_success() {
        return Err("provider_rejected".to_string());
    }
    let envelope = response
        .json::<CloudflareSendEnvelope>()
        .await
        .map_err(|_| "provider_receipt_invalid".to_string())?;
    if !envelope.success {
        return Err("provider_rejected".to_string());
    }
    receipt_from_cloudflare_result(
        envelope
            .result
            .ok_or_else(|| "provider_receipt_invalid".to_string())?,
        &request.to,
        &request.message_id,
    )
}

fn receipt_from_cloudflare_result(
    result: CloudflareSendResult,
    recipient: &str,
    receipt_key: &str,
) -> Result<VendorMailProviderReceipt, String> {
    if !valid_message_id(receipt_key) {
        return Err("provider_receipt_invalid".to_string());
    }
    let contains = |values: &[String]| {
        values
            .iter()
            .any(|value| value.eq_ignore_ascii_case(recipient))
    };
    let state = if contains(&result.permanent_bounces) {
        VendorMailDeliveryState::Bounced
    } else if contains(&result.delivered) {
        VendorMailDeliveryState::Delivered
    } else if contains(&result.queued) {
        VendorMailDeliveryState::Accepted
    } else {
        return Err("provider_receipt_recipient_missing".to_string());
    };
    Ok(VendorMailProviderReceipt {
        provider: VendorMailProvider::CloudflareEmailSending
            .label()
            .to_string(),
        provider_receipt_key: receipt_key.to_string(),
        state,
        automatic_retry_allowed: false,
    })
}

fn validate_send_request(request: &VendorMailSendRequest) -> Result<(), String> {
    if !valid_platform_sender(&request.from)
        || !valid_email_address(&request.to)
        || request.subject.trim().is_empty()
        || request.subject.len() > 300
        || request.text.trim().is_empty()
        || request.text.len() > 200_000
        || !valid_message_id(&request.message_id)
        || request
            .reply_to
            .as_deref()
            .is_some_and(|value| !valid_email_address(value))
    {
        return Err("invalid_vendor_mail_request".to_string());
    }
    Ok(())
}

fn valid_email_address(value: &str) -> bool {
    let trimmed = value.trim();
    trimmed.len() <= 254
        && trimmed == value
        && !trimmed.chars().any(char::is_control)
        && !trimmed.contains(char::is_whitespace)
        && trimmed
            .rsplit_once('@')
            .is_some_and(|(local, domain)| !local.is_empty() && domain.contains('.'))
}

fn valid_message_id(value: &str) -> bool {
    value.len() <= 512
        && value.starts_with('<')
        && value.ends_with('>')
        && !value.chars().any(|character| character.is_control())
        && value[1..value.len() - 1].contains('@')
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
    use super::{
        CloudflareSendResult, CloudflareSuppressionRecord, VendorMailConfig,
        VendorMailDeliveryState, VendorMailProvider, VendorMailSendRequest,
        cloudflare_send_preflight, receipt_from_cloudflare_result,
    };
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
            "CLAMD_HOST",
            "OMNYID_VENDOR_MAIL_RESEND_WEBHOOK_SECRET",
            "OMNYID_VENDOR_MAIL_RECIPIENT_ALLOWLIST",
            "OMNYID_VENDOR_MAIL_RECIPIENT_ALLOWLIST_FILE",
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
        assert_eq!(
            send_only.readiness().reason,
            "cloudflare_credentials_missing"
        );
        clear_env();
    }

    #[test]
    fn cloudflare_is_ready_only_with_account_token_ingress_secret_and_scanner() {
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
            std::env::set_var("CLAMD_HOST", "clamav:3310");
            std::env::set_var("OMNYID_VENDOR_MAIL_FROM_ADDRESS", "hello@omnyid.com");
            std::env::set_var(
                "OMNYID_VENDOR_MAIL_RECIPIENT_ALLOWLIST",
                "controlled@example.test",
            );
        }
        let config = VendorMailConfig::from_env().expect("complete config");
        assert_eq!(config.from_address, "hello@omnyid.com");
        assert!(config.readiness().ready);
        clear_env();
    }

    #[test]
    fn cloudflare_receipt_separates_acceptance_delivery_and_bounce_without_retry() {
        let accepted = receipt_from_cloudflare_result(
            CloudflareSendResult {
                queued: vec!["controlled@example.test".to_string()],
                ..CloudflareSendResult::default()
            },
            "controlled@example.test",
            "<provider-accepted@omnyid.com>",
        )
        .expect("accepted receipt");
        assert_eq!(accepted.state, VendorMailDeliveryState::Accepted);
        assert!(!accepted.automatic_retry_allowed);

        let bounced = receipt_from_cloudflare_result(
            CloudflareSendResult {
                permanent_bounces: vec!["controlled@example.test".to_string()],
                ..CloudflareSendResult::default()
            },
            "controlled@example.test",
            "<provider-bounced@omnyid.com>",
        )
        .expect("bounce receipt");
        assert_eq!(bounced.state, VendorMailDeliveryState::Bounced);
        assert!(!bounced.automatic_retry_allowed);
    }

    #[test]
    fn complaint_and_bounce_suppress_automatic_retry() {
        for reason in ["complaint", "hard_bounce", "soft_bounce"] {
            let record = CloudflareSuppressionRecord {
                id: "opaque-provider-id".to_string(),
                email: "controlled@example.test".to_string(),
                reason: reason.to_string(),
                expires_at: None,
            };
            assert!(record.blocks_automatic_retry());
            assert!(matches!(
                record.event_kind(),
                Some("complained" | "bounced")
            ));
        }
    }

    #[test]
    fn outside_allowlist_is_refused_before_provider_request() {
        let _guard = env_lock().lock().expect("env lock");
        clear_env();
        unsafe {
            std::env::set_var("OMNYID_VENDOR_MAIL_ENABLED", "true");
            std::env::set_var("OMNYID_VENDOR_MAIL_PROVIDER", "cloudflare");
            std::env::set_var(
                "OMNYID_VENDOR_MAIL_CLOUDFLARE_API_TOKEN",
                "not-used-because-recipient-is-refused",
            );
            std::env::set_var(
                "OMNYID_VENDOR_MAIL_CLOUDFLARE_ACCOUNT_ID",
                "0123456789abcdef0123456789abcdef",
            );
            std::env::set_var("OMNYID_VENDOR_MAIL_WORKER_SHARED_SECRET", "worker-secret");
            std::env::set_var("CLAMD_HOST", "clamav:3310");
            std::env::set_var(
                "OMNYID_VENDOR_MAIL_RECIPIENT_ALLOWLIST",
                "allowed@example.test",
            );
        }
        let request = VendorMailSendRequest {
            from: "hello@omnyid.com".to_string(),
            to: "outside@example.test".to_string(),
            subject: "Controlled refusal".to_string(),
            text: "This must not leave the process.".to_string(),
            reply_to: Some("hello@omnyid.com".to_string()),
            message_id: "<controlled-refusal@omnyid.com>".to_string(),
        };
        assert_eq!(
            cloudflare_send_preflight(&request),
            Err("recipient_not_allowlisted".to_string())
        );
        clear_env();
    }
}
