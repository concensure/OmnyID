use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ApprovalMode {
    Autonomous,
    SuggestOnly,
    HumanApprovalRequired,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum IntegrationTransport {
    Rest,
    Graphql,
    BrowserAutomation,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct IntegrationCapability {
    pub capability_id: String,
    pub provider: String,
    pub operation: String,
    pub transport: IntegrationTransport,
    pub scopes: Vec<String>,
    pub approval_mode: ApprovalMode,
    pub secret_refs: Vec<String>,
    #[serde(default)]
    pub metadata: Value,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct ActionIntent {
    pub capability_id: String,
    pub thread_id: String,
    pub requested_by: String,
    #[serde(default)]
    pub input: Value,
    pub reason: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ActionStatus {
    Pending,
    Approved,
    Rejected,
    Completed,
    Failed,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct ActionResult {
    pub capability_id: String,
    pub thread_id: String,
    pub status: ActionStatus,
    #[serde(default)]
    pub output: Value,
    pub external_reference: Option<String>,
    pub recorded_at: String,
}

impl IntegrationCapability {
    pub fn audit_message_type(&self) -> String {
        format!("action_{}_{}", self.provider, self.operation)
    }
}

#[cfg(test)]
mod tests {
    use super::{
        ActionIntent, ActionResult, ActionStatus, ApprovalMode, IntegrationCapability,
        IntegrationTransport,
    };
    use serde_json::json;

    #[test]
    fn capability_serializes_audit_friendly_shape() {
        let capability = IntegrationCapability {
            capability_id: "cap_stripe_charge".to_string(),
            provider: "stripe".to_string(),
            operation: "charge".to_string(),
            transport: IntegrationTransport::Rest,
            scopes: vec!["charges:write".to_string()],
            approval_mode: ApprovalMode::HumanApprovalRequired,
            secret_refs: vec!["vault://stripe/live".to_string()],
            metadata: json!({
                "region": "us",
                "currency": "usd"
            }),
        };

        assert_eq!(capability.audit_message_type(), "action_stripe_charge");
        assert_eq!(
            capability.approval_mode,
            ApprovalMode::HumanApprovalRequired
        );
    }

    #[test]
    fn action_intent_and_result_share_thread_scope() {
        let intent = ActionIntent {
            capability_id: "cap_expedia_book_trip".to_string(),
            thread_id: "thread_trip_2026_04".to_string(),
            requested_by: "agent:travel@omnyid.ai".to_string(),
            input: json!({
                "origin": "SYD",
                "destination": "SFO"
            }),
            reason: Some("Trip approved in the inbox thread".to_string()),
        };
        let result = ActionResult {
            capability_id: intent.capability_id.clone(),
            thread_id: intent.thread_id.clone(),
            status: ActionStatus::Pending,
            output: json!({
                "approval_mode": "human_approval_required"
            }),
            external_reference: None,
            recorded_at: "2026-03-20T00:00:00Z".to_string(),
        };

        assert_eq!(intent.thread_id, result.thread_id);
        assert_eq!(result.status, ActionStatus::Pending);
    }
}
