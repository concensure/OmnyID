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

pub fn academic_study_integration_capabilities() -> Vec<IntegrationCapability> {
    vec![
        IntegrationCapability {
            capability_id: "cap_canvas_lms_import_academic_context".to_string(),
            provider: "canvas_lms".to_string(),
            operation: "import_academic_context".to_string(),
            transport: IntegrationTransport::Rest,
            scopes: vec![
                "courses:read".to_string(),
                "modules:read".to_string(),
                "assignments:read".to_string(),
                "files:read".to_string(),
            ],
            approval_mode: ApprovalMode::HumanApprovalRequired,
            secret_refs: vec!["vault://canvas_lms/api_token".to_string()],
            metadata: serde_json::json!({
                "surface": "study_lens",
                "writes": ["study_courses", "study_deadlines", "file_sources", "afp_calendar_events"],
                "providers": ["Canvas"],
                "guardrail": "Imported records must preserve provider IDs; accepted dated records project to first-class AFP calendar_event messages but must not be counted as mastery evidence."
            }),
        },
        IntegrationCapability {
            capability_id: "cap_blackboard_lms_import_academic_context".to_string(),
            provider: "blackboard_lms".to_string(),
            operation: "import_academic_context".to_string(),
            transport: IntegrationTransport::Rest,
            scopes: vec![
                "courses:read".to_string(),
                "content:read".to_string(),
                "assessments:read".to_string(),
                "calendar:read".to_string(),
            ],
            approval_mode: ApprovalMode::HumanApprovalRequired,
            secret_refs: vec!["vault://blackboard_lms/oauth".to_string()],
            metadata: serde_json::json!({
                "surface": "study_lens",
                "writes": ["study_courses", "study_deadlines", "file_sources", "afp_calendar_events"],
                "providers": ["Blackboard"],
                "guardrail": "Imported records must preserve provider IDs; accepted dated records project to first-class AFP calendar_event messages but must not be counted as mastery evidence."
            }),
        },
        IntegrationCapability {
            capability_id: "cap_google_classroom_import_academic_context".to_string(),
            provider: "google_classroom".to_string(),
            operation: "import_academic_context".to_string(),
            transport: IntegrationTransport::Rest,
            scopes: vec![
                "classroom.courses.readonly".to_string(),
                "classroom.coursework.me.readonly".to_string(),
                "classroom.courseworkmaterials.readonly".to_string(),
            ],
            approval_mode: ApprovalMode::HumanApprovalRequired,
            secret_refs: vec!["vault://google_classroom/oauth".to_string()],
            metadata: serde_json::json!({
                "surface": "study_lens",
                "writes": ["study_courses", "study_deadlines", "file_sources", "afp_calendar_events"],
                "providers": ["Google Classroom"],
                "guardrail": "Imported records must preserve provider IDs; accepted dated records project to first-class AFP calendar_event messages but must not be counted as mastery evidence."
            }),
        },
        IntegrationCapability {
            capability_id: "cap_google_calendar_import_academic_dates".to_string(),
            provider: "google_calendar".to_string(),
            operation: "import_academic_dates".to_string(),
            transport: IntegrationTransport::Rest,
            scopes: vec!["calendar.events.readonly".to_string()],
            approval_mode: ApprovalMode::HumanApprovalRequired,
            secret_refs: vec!["vault://google_calendar/oauth".to_string()],
            metadata: serde_json::json!({
                "surface": "study_lens",
                "writes": ["study_deadlines", "study_sessions", "afp_calendar_events"],
                "providers": ["Google Calendar"],
                "guardrail": "Calendar events become deadline/session evidence only after explicit import and review; accepted dated records project to first-class AFP calendar_event messages for calendar and search."
            }),
        },
    ]
}

#[cfg(test)]
mod tests {
    use super::{
        ActionIntent, ActionResult, ActionStatus, ApprovalMode, IntegrationCapability,
        IntegrationTransport, academic_study_integration_capabilities,
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

    #[test]
    fn academic_study_integration_capabilities_cover_lms_and_google_calendar() {
        let capabilities = academic_study_integration_capabilities();
        let providers: Vec<&str> = capabilities
            .iter()
            .map(|capability| capability.provider.as_str())
            .collect();

        assert!(providers.contains(&"canvas_lms"));
        assert!(providers.contains(&"blackboard_lms"));
        assert!(providers.contains(&"google_classroom"));
        assert!(providers.contains(&"google_calendar"));
        assert!(
            capabilities
                .iter()
                .all(|capability| capability.approval_mode == ApprovalMode::HumanApprovalRequired)
        );
        assert!(
            capabilities
                .iter()
                .all(|capability| capability.metadata["surface"] == "study_lens")
        );
        assert!(capabilities.iter().any(|capability| {
            capability.metadata["writes"]
                .as_array()
                .is_some_and(|writes| {
                    writes
                        .iter()
                        .any(|write| write.as_str() == Some("study_deadlines"))
                })
        }));
        assert!(capabilities.iter().all(|capability| {
            capability.metadata["writes"]
                .as_array()
                .is_some_and(|writes| {
                    writes
                        .iter()
                        .any(|write| write.as_str() == Some("afp_calendar_events"))
                })
        }));
        assert!(capabilities.iter().all(|capability| {
            capability.metadata["guardrail"]
                .as_str()
                .is_some_and(|guardrail| guardrail.contains("first-class AFP calendar_event"))
        }));
    }
}
