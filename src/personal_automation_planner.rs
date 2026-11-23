/*
 * @module-id: rust.personal-automation-planner
 * @primary-capability: rust.source-module
 * @locs-version: 2.0
 * @stability: active
 * @owner: omnyid
 */

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::{
    autonomy_policy::{
        AutonomyDecision, autonomy_decision_for_personal_automation_ignore,
        autonomy_decision_for_personal_automation_prepare,
        autonomy_decision_for_personal_automation_request_approval,
    },
    db::UserConnectedCapabilityRecord,
};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum PersonalEventFamily {
    MessageRequiresReply,
    ApprovalPending,
    RenewalDue,
    BillDue,
    FormDue,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum PersonalEventSeverity {
    Low,
    Medium,
    High,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct PersonalAutomationEvent {
    pub owner_user_id: String,
    pub event_family: PersonalEventFamily,
    pub provider: String,
    pub account_ref: Option<String>,
    pub source_ref: String,
    pub severity: PersonalEventSeverity,
    #[serde(default)]
    pub payload: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum PlannerActionClass {
    Ignore,
    PrepareDraft,
    RequestApproval,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct PersonalAutomationPlannerDecision {
    pub action_class: PlannerActionClass,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub capability_id: Option<String>,
    pub autonomy_decision: AutonomyDecision,
    pub rationale: String,
    #[serde(default)]
    pub source_refs: Vec<String>,
}

pub fn plan_background_automation(
    event: &PersonalAutomationEvent,
    connected_capabilities: &[UserConnectedCapabilityRecord],
    priority_rules: &Value,
) -> PersonalAutomationPlannerDecision {
    match event.event_family {
        PersonalEventFamily::MessageRequiresReply => {
            plan_message_requires_reply(event, connected_capabilities, priority_rules)
        }
        PersonalEventFamily::ApprovalPending => PersonalAutomationPlannerDecision {
            action_class: PlannerActionClass::RequestApproval,
            capability_id: None,
            autonomy_decision: autonomy_decision_for_personal_automation_request_approval(
                "Approval is already pending and must be surfaced for explicit review.",
            ),
            rationale: "Approval-pending events must surface through the shared approval path."
                .to_string(),
            source_refs: vec![event.source_ref.clone()],
        },
        PersonalEventFamily::RenewalDue => {
            PersonalAutomationPlannerDecision {
                action_class: PlannerActionClass::PrepareDraft,
                capability_id: None,
                autonomy_decision: autonomy_decision_for_personal_automation_prepare(
                    "Renewal-like events should be prepared for review before any user-visible change is made.",
                ),
                rationale:
                    "Renewal events can be prepared internally as review artifacts before any user-visible execution is attempted."
                        .to_string(),
                source_refs: vec![event.source_ref.clone()],
            }
        }
        PersonalEventFamily::BillDue => {
            let amount_usd = event
                .payload
                .get("amount_usd")
                .and_then(Value::as_f64)
                .unwrap_or(0.0);
            let rule_threshold = extract_financial_threshold(priority_rules);
            let high_impact_amount = rule_threshold
                .map(|threshold| amount_usd >= threshold)
                .unwrap_or(false);
            let due_now = event
                .payload
                .get("days_until_due")
                .and_then(Value::as_i64)
                .map(|days| days <= 0)
                .unwrap_or(false);

            if event.severity == PersonalEventSeverity::High || high_impact_amount || due_now {
                return PersonalAutomationPlannerDecision {
                    action_class: PlannerActionClass::RequestApproval,
                    capability_id: None,
                    autonomy_decision: autonomy_decision_for_personal_automation_request_approval(
                        "Bill events with high amount or immediate due timing should be surfaced for explicit review.",
                    ),
                    rationale:
                        "The bill is high-impact due to amount threshold or due-now timing."
                            .to_string(),
                    source_refs: vec![event.source_ref.clone()],
                };
            }

            PersonalAutomationPlannerDecision {
                action_class: PlannerActionClass::PrepareDraft,
                capability_id: None,
                autonomy_decision: autonomy_decision_for_personal_automation_prepare(
                    "Bill-like events should be prepared as review artifacts before any payment decision is made.",
                ),
                rationale:
                    "Bill events can be prepared internally as bill-review artifacts before any user-visible execution is attempted."
                        .to_string(),
                source_refs: vec![event.source_ref.clone()],
            }
        }
        PersonalEventFamily::FormDue => {
            let due_now = event
                .payload
                .get("days_until_due")
                .and_then(Value::as_i64)
                .map(|days| days <= 0)
                .unwrap_or(false);
            let requires_signature = event
                .payload
                .get("requires_signature")
                .and_then(Value::as_bool)
                .unwrap_or(false);
            let sensitive_form = event
                .payload
                .get("sensitive_form")
                .and_then(Value::as_bool)
                .unwrap_or(false);

            if event.severity == PersonalEventSeverity::High
                || due_now
                || requires_signature
                || sensitive_form
            {
                return PersonalAutomationPlannerDecision {
                    action_class: PlannerActionClass::RequestApproval,
                    capability_id: None,
                    autonomy_decision: autonomy_decision_for_personal_automation_request_approval(
                        "Urgent or signoff-heavy forms should be surfaced for explicit review before submission.",
                    ),
                    rationale:
                        "The form is high-impact due to due-now timing, signature requirements, or sensitive submission context."
                            .to_string(),
                    source_refs: vec![event.source_ref.clone()],
                };
            }

            PersonalAutomationPlannerDecision {
                action_class: PlannerActionClass::PrepareDraft,
                capability_id: None,
                autonomy_decision: autonomy_decision_for_personal_automation_prepare(
                    "Form-like events should be prepared as review artifacts before any submission is attempted.",
                ),
                rationale:
                    "Forms can be prepared internally as review artifacts before any user-visible submission is attempted."
                        .to_string(),
                source_refs: vec![event.source_ref.clone()],
            }
        }
    }
}

fn plan_message_requires_reply(
    event: &PersonalAutomationEvent,
    connected_capabilities: &[UserConnectedCapabilityRecord],
    priority_rules: &Value,
) -> PersonalAutomationPlannerDecision {
    let high_impact = message_requires_approval(event, priority_rules);
    let has_draft = has_usable_capability(connected_capabilities, &event.provider, "gmail.draft");
    let has_send = has_usable_capability(connected_capabilities, &event.provider, "gmail.send");

    if high_impact {
        return PersonalAutomationPlannerDecision {
            action_class: PlannerActionClass::RequestApproval,
            capability_id: if has_send {
                Some("gmail.send".to_string())
            } else if has_draft {
                Some("gmail.draft".to_string())
            } else {
                None
            },
            autonomy_decision: autonomy_decision_for_personal_automation_request_approval(
                "This message crosses a consequence threshold or matches a user priority rule that requires human review.",
            ),
            rationale:
                "The message is high-impact due to explicit impact markers, financial threshold, or sensitive communication rules."
                    .to_string(),
            source_refs: vec![event.source_ref.clone()],
        };
    }

    if has_draft {
        return PersonalAutomationPlannerDecision {
            action_class: PlannerActionClass::PrepareDraft,
            capability_id: Some("gmail.draft".to_string()),
            autonomy_decision: autonomy_decision_for_personal_automation_prepare(
                "A low-risk reply can be prepared silently and surfaced as a draft artifact.",
            ),
            rationale:
                "A healthy Gmail draft capability exists and no approval rule was triggered."
                    .to_string(),
            source_refs: vec![event.source_ref.clone()],
        };
    }

    ignored_decision(
        event,
        "No healthy draft capability is available for this reply-required message.",
    )
}

fn ignored_decision(
    event: &PersonalAutomationEvent,
    rationale: &str,
) -> PersonalAutomationPlannerDecision {
    PersonalAutomationPlannerDecision {
        action_class: PlannerActionClass::Ignore,
        capability_id: None,
        autonomy_decision: autonomy_decision_for_personal_automation_ignore(
            "The event was observed but no safe connected action path is currently available.",
        ),
        rationale: rationale.to_string(),
        source_refs: vec![event.source_ref.clone()],
    }
}

fn has_usable_capability(
    connected_capabilities: &[UserConnectedCapabilityRecord],
    provider: &str,
    capability_id: &str,
) -> bool {
    connected_capabilities.iter().any(|capability| {
        capability.provider == provider
            && capability.capability_id == capability_id
            && capability.health_state == "healthy"
            && capability.revoked_at.is_none()
    })
}

fn message_requires_approval(event: &PersonalAutomationEvent, priority_rules: &Value) -> bool {
    if event.severity == PersonalEventSeverity::High {
        return true;
    }

    if event
        .payload
        .get("impact")
        .and_then(Value::as_str)
        .map(|value| value.eq_ignore_ascii_case("high"))
        .unwrap_or(false)
    {
        return true;
    }

    if event
        .payload
        .get("requires_action")
        .and_then(Value::as_bool)
        .unwrap_or(false)
        && event
            .payload
            .get("sensitive_action")
            .and_then(Value::as_bool)
            .unwrap_or(false)
    {
        return true;
    }

    let amount_usd = event
        .payload
        .get("amount_usd")
        .and_then(Value::as_f64)
        .unwrap_or(0.0);
    let rule_threshold = extract_financial_threshold(priority_rules);
    if rule_threshold
        .map(|threshold| amount_usd >= threshold)
        .unwrap_or(false)
    {
        return true;
    }

    let normalized_text = normalized_message_text(event);
    extract_communication_keywords(priority_rules)
        .iter()
        .any(|keyword| normalized_text.contains(keyword))
}

fn normalized_message_text(event: &PersonalAutomationEvent) -> String {
    let mut parts = Vec::new();
    for key in ["subject", "snippet", "body_preview", "sender_label"] {
        if let Some(value) = event.payload.get(key).and_then(Value::as_str) {
            let trimmed = value.trim();
            if !trimmed.is_empty() {
                parts.push(trimmed.to_ascii_lowercase());
            }
        }
    }
    parts.join(" ")
}

fn extract_financial_threshold(priority_rules: &Value) -> Option<f64> {
    priority_rules
        .get("rules")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .find(|rule| rule.get("type").and_then(Value::as_str) == Some("financial_threshold"))
        .and_then(|rule| rule.get("amount_usd"))
        .and_then(Value::as_f64)
}

fn extract_communication_keywords(priority_rules: &Value) -> Vec<String> {
    priority_rules
        .get("rules")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .find(|rule| rule.get("type").and_then(Value::as_str) == Some("communication_filter"))
        .and_then(|rule| rule.get("keywords"))
        .and_then(Value::as_array)
        .map(|keywords| {
            keywords
                .iter()
                .filter_map(Value::as_str)
                .map(|value| value.trim().to_ascii_lowercase())
                .filter(|value| !value.is_empty())
                .collect()
        })
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::agent_template::default_priority_rules;
    use serde_json::json;

    fn gmail_capability(capability_id: &str, health_state: &str) -> UserConnectedCapabilityRecord {
        UserConnectedCapabilityRecord {
            id: "ucc_1".to_string(),
            user_id: "user_1".to_string(),
            provider: "gmail".to_string(),
            account_ref: "person@example.com".to_string(),
            capability_family: "communications".to_string(),
            capability_id: capability_id.to_string(),
            transport: "rest".to_string(),
            granted_scopes: vec![],
            approval_mode: "autonomous".to_string(),
            secret_ref: Some("user_gmail_tokens:user_1".to_string()),
            health_state: health_state.to_string(),
            last_checked_at: None,
            connected_at: "2026-07-17T00:00:00Z".to_string(),
            revoked_at: None,
            metadata_json: json!({}),
        }
    }

    fn message_event(payload: Value) -> PersonalAutomationEvent {
        PersonalAutomationEvent {
            owner_user_id: "user_1".to_string(),
            event_family: PersonalEventFamily::MessageRequiresReply,
            provider: "gmail".to_string(),
            account_ref: Some("person@example.com".to_string()),
            source_ref: "thread:gmail:msg-1".to_string(),
            severity: PersonalEventSeverity::Medium,
            payload,
        }
    }

    fn renewal_event(payload: Value) -> PersonalAutomationEvent {
        PersonalAutomationEvent {
            owner_user_id: "user_1".to_string(),
            event_family: PersonalEventFamily::RenewalDue,
            provider: "manual".to_string(),
            account_ref: None,
            source_ref: "renewal:sample-1".to_string(),
            severity: PersonalEventSeverity::Medium,
            payload,
        }
    }

    fn bill_event(payload: Value) -> PersonalAutomationEvent {
        PersonalAutomationEvent {
            owner_user_id: "user_1".to_string(),
            event_family: PersonalEventFamily::BillDue,
            provider: "manual".to_string(),
            account_ref: None,
            source_ref: "bill:sample-1".to_string(),
            severity: PersonalEventSeverity::Medium,
            payload,
        }
    }

    fn form_event(payload: Value) -> PersonalAutomationEvent {
        PersonalAutomationEvent {
            owner_user_id: "user_1".to_string(),
            event_family: PersonalEventFamily::FormDue,
            provider: "manual".to_string(),
            account_ref: None,
            source_ref: "form:sample-1".to_string(),
            severity: PersonalEventSeverity::Medium,
            payload,
        }
    }

    #[test]
    fn routine_message_with_draft_capability_prepares_draft() {
        let decision = plan_background_automation(
            &message_event(json!({
                "subject": "Quick follow up",
                "snippet": "Can you reply when you have a moment?"
            })),
            &[gmail_capability("gmail.draft", "healthy")],
            &default_priority_rules(),
        );

        assert_eq!(decision.action_class, PlannerActionClass::PrepareDraft);
        assert_eq!(decision.capability_id.as_deref(), Some("gmail.draft"));
        assert_eq!(
            decision.autonomy_decision.autonomy_level,
            crate::autonomy_policy::PersonalAutonomyLevel::SuggestWithArtifact
        );
    }

    #[test]
    fn high_impact_message_requests_approval() {
        let decision = plan_background_automation(
            &message_event(json!({
                "subject": "Contract signature needed today",
                "impact": "high",
                "requires_action": true
            })),
            &[
                gmail_capability("gmail.draft", "healthy"),
                gmail_capability("gmail.send", "healthy"),
            ],
            &default_priority_rules(),
        );

        assert_eq!(decision.action_class, PlannerActionClass::RequestApproval);
        assert_eq!(decision.capability_id.as_deref(), Some("gmail.send"));
        assert!(decision.autonomy_decision.approval_required);
    }

    #[test]
    fn invoice_above_threshold_requests_approval() {
        let decision = plan_background_automation(
            &message_event(json!({
                "subject": "Invoice to approve",
                "snippet": "Please approve this invoice today.",
                "amount_usd": 75.0
            })),
            &[gmail_capability("gmail.draft", "healthy")],
            &default_priority_rules(),
        );

        assert_eq!(decision.action_class, PlannerActionClass::RequestApproval);
        assert!(decision.autonomy_decision.approval_required);
    }

    #[test]
    fn message_without_healthy_draft_capability_is_ignored() {
        let decision = plan_background_automation(
            &message_event(json!({
                "subject": "Quick follow up",
                "snippet": "Can you reply when you have a moment?"
            })),
            &[gmail_capability("gmail.draft", "degraded")],
            &default_priority_rules(),
        );

        assert_eq!(decision.action_class, PlannerActionClass::Ignore);
        assert!(decision.capability_id.is_none());
    }

    #[test]
    fn renewal_due_prepares_internal_review_artifact_without_external_capability() {
        let decision = plan_background_automation(
            &renewal_event(json!({
                "service_name": "Acme Fiber",
                "days_until_renewal": 12,
                "current_cost_usd": 79.0
            })),
            &[],
            &default_priority_rules(),
        );

        assert_eq!(decision.action_class, PlannerActionClass::PrepareDraft);
        assert_eq!(decision.capability_id, None);
        assert_eq!(
            decision.autonomy_decision.autonomy_level,
            crate::autonomy_policy::PersonalAutonomyLevel::SuggestWithArtifact
        );
    }

    #[test]
    fn bill_due_prepares_internal_review_artifact_below_threshold() {
        let decision = plan_background_automation(
            &bill_event(json!({
                "biller_name": "Sydney Water",
                "days_until_due": 4,
                "amount_usd": 24.0
            })),
            &[],
            &default_priority_rules(),
        );

        assert_eq!(decision.action_class, PlannerActionClass::PrepareDraft);
        assert_eq!(decision.capability_id, None);
        assert_eq!(
            decision.autonomy_decision.autonomy_level,
            crate::autonomy_policy::PersonalAutonomyLevel::SuggestWithArtifact
        );
    }

    #[test]
    fn bill_due_requests_approval_when_above_threshold() {
        let decision = plan_background_automation(
            &bill_event(json!({
                "biller_name": "Quarterly Rates",
                "days_until_due": 6,
                "amount_usd": 125.0
            })),
            &[],
            &default_priority_rules(),
        );

        assert_eq!(decision.action_class, PlannerActionClass::RequestApproval);
        assert!(decision.autonomy_decision.approval_required);
    }

    #[test]
    fn form_due_prepares_internal_review_artifact() {
        let decision = plan_background_automation(
            &form_event(json!({
                "form_name": "Excursion Consent",
                "days_until_due": 3,
                "form_kind": "school_form"
            })),
            &[],
            &default_priority_rules(),
        );

        assert_eq!(decision.action_class, PlannerActionClass::PrepareDraft);
        assert_eq!(decision.capability_id, None);
        assert_eq!(
            decision.autonomy_decision.autonomy_level,
            crate::autonomy_policy::PersonalAutonomyLevel::SuggestWithArtifact
        );
    }

    #[test]
    fn urgent_signature_form_requests_approval() {
        let decision = plan_background_automation(
            &form_event(json!({
                "form_name": "Medical Consent",
                "days_until_due": 0,
                "form_kind": "school_form",
                "requires_signature": true
            })),
            &[],
            &default_priority_rules(),
        );

        assert_eq!(decision.action_class, PlannerActionClass::RequestApproval);
        assert!(decision.autonomy_decision.approval_required);
    }
}
