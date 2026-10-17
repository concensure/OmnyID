use serde::{Deserialize, Serialize};

use super::metrics::{QuotationReadinessReport, ReadinessStatus};

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct QuotationFeatureFlags {
    pub extraction: bool,
    pub recommendation: bool,
    pub clarification_draft: bool,
    pub clarification_send: bool,
    pub closure: bool,
    pub vendor_context_grants: bool,
    pub vendor_response_capabilities: bool,
    pub claimed_vendor_responses: bool,
}

fn env_enabled(name: &str) -> bool {
    std::env::var(name).ok().is_some_and(|value| {
        matches!(
            value.trim().to_ascii_lowercase().as_str(),
            "1" | "true" | "yes"
        )
    })
}

fn release_evidence_configured() -> bool {
    let verified = std::env::var("OMNYID_QUOTATION_RELEASE_GATE")
        .ok()
        .is_some_and(|value| value.trim() == "verified");
    let version = std::env::var("OMNYID_QUOTATION_RELEASE_GATE_VERSION")
        .ok()
        .is_some_and(|value| value.trim() == "quotation.readiness.v1");
    let sha = std::env::var("OMNYID_QUOTATION_RELEASE_EVIDENCE_SHA").unwrap_or_default();
    let sha = sha.trim();
    verified
        && version
        && matches!(sha.len(), 40 | 64)
        && sha.chars().all(|character| character.is_ascii_hexdigit())
}

impl QuotationFeatureFlags {
    pub fn from_env() -> Self {
        if !release_evidence_configured() {
            return Self::default();
        }
        Self {
            extraction: env_enabled("OMNYID_QUOTATION_EXTRACTION_ENABLED"),
            recommendation: env_enabled("OMNYID_QUOTATION_RECOMMENDATION_ENABLED"),
            clarification_draft: env_enabled("OMNYID_QUOTATION_CLARIFICATION_DRAFT_ENABLED"),
            clarification_send: env_enabled("OMNYID_QUOTATION_CLARIFICATION_SEND_ENABLED"),
            closure: env_enabled("OMNYID_QUOTATION_CLOSURE_ENABLED"),
            vendor_context_grants: env_enabled("OMNYID_QUOTATION_VENDOR_GRANTS_ENABLED"),
            vendor_response_capabilities: env_enabled(
                "OMNYID_QUOTATION_VENDOR_RESPONSE_CAPABILITIES_ENABLED",
            ),
            claimed_vendor_responses: env_enabled(
                "OMNYID_QUOTATION_CLAIMED_VENDOR_RESPONSES_ENABLED",
            ),
        }
    }

    pub fn gated_by(self, report: &QuotationReadinessReport) -> Self {
        if report.status == ReadinessStatus::Verified {
            self
        } else {
            Self::default()
        }
    }
}
