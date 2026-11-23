/*
 * @module-id: rust.intent-safety-gate
 * @primary-capability: rust.source-module
 * @locs-version: 2.0
 * @stability: active
 * @owner: omnyid
 */

use serde_json::Value;

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct SafetyGateAssessment {
    pub risk_floor: &'static str,
    pub requires_confirmation: bool,
    pub external_side_effect: bool,
    pub blocked_until_confirmation: Vec<String>,
    pub heuristics_used: Vec<String>,
}

pub fn assess_request(query: &str, primary_intent: &str, payload: &Value) -> SafetyGateAssessment {
    let text = combined_text(query, payload);

    let destructive = contains_any(
        &text,
        &[
            "delete",
            "remove",
            "erase",
            "wipe",
            "destroy",
            "revoke",
            "cancel account",
        ],
    );
    let money = contains_any(
        &text,
        &[
            "pay", "purchase", "buy", "transfer", "wire", "invoice", "billing", "refund", "charge",
        ],
    );
    let communication = contains_any(
        &text,
        &[
            "send", "email", "message", "text", "dm", "post", "publish", "contact", "reply",
        ],
    );
    let permissions = contains_any(
        &text,
        &[
            "password",
            "credential",
            "token",
            "secret",
            "permission",
            "grant access",
            "admin",
            "login",
            "sign in",
            "oauth",
        ],
    );
    let regulated_advice = contains_any(
        &text,
        &[
            "legal advice",
            "medical advice",
            "diagnose",
            "prescribe",
            "financial advice",
            "investment advice",
            "tax advice",
        ],
    );

    let mut heuristics_used = Vec::new();
    if destructive {
        heuristics_used.push("destructive_action_gate".to_string());
    }
    if money {
        heuristics_used.push("money_movement_gate".to_string());
    }
    if communication {
        heuristics_used.push("external_communication_gate".to_string());
    }
    if permissions {
        heuristics_used.push("permission_boundary_gate".to_string());
    }
    if regulated_advice {
        heuristics_used.push("regulated_advice_gate".to_string());
    }

    let external_side_effect = communication
        || money
        || contains_any(
            &text,
            &[
                "book",
                "submit",
                "apply",
                "register",
                "schedule with",
                "invite",
            ],
        );

    let risk_floor = if destructive || money || permissions || regulated_advice {
        "high"
    } else if external_side_effect {
        "medium"
    } else {
        "low"
    };

    let requires_confirmation =
        risk_floor != "low" && !matches!(primary_intent, "note" | "task" | "schedule");

    let blocked_until_confirmation = blocked_operations(
        destructive,
        money,
        communication,
        permissions,
        regulated_advice,
    );

    SafetyGateAssessment {
        risk_floor,
        requires_confirmation,
        external_side_effect,
        blocked_until_confirmation,
        heuristics_used,
    }
}

fn combined_text(query: &str, payload: &Value) -> String {
    let mut parts = vec![query.to_ascii_lowercase()];
    for key in [
        "summary",
        "description",
        "objective",
        "title",
        "content",
        "draft_text",
        "query",
    ] {
        if let Some(value) = payload.get(key).and_then(Value::as_str) {
            parts.push(value.to_ascii_lowercase());
        }
    }
    parts.join("\n")
}

fn contains_any(text: &str, tokens: &[&str]) -> bool {
    tokens.iter().any(|token| text.contains(token))
}

fn blocked_operations(
    destructive: bool,
    money: bool,
    communication: bool,
    permissions: bool,
    regulated_advice: bool,
) -> Vec<String> {
    let mut blocked = Vec::new();
    if destructive {
        blocked.push("destructive_action".to_string());
    }
    if money {
        blocked.push("money_movement".to_string());
    }
    if communication {
        blocked.push("external_communication".to_string());
    }
    if permissions {
        blocked.push("permission_boundary_change".to_string());
    }
    if regulated_advice {
        blocked.push("regulated_advice_delivery".to_string());
    }
    blocked
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn money_and_messaging_raise_confirmation_and_high_risk() {
        let assessment = assess_request(
            "Pay the invoice and email John",
            "orchestrate",
            &json!({"objective": "Pay the invoice and email John"}),
        );

        assert_eq!(assessment.risk_floor, "high");
        assert!(assessment.requires_confirmation);
        assert!(assessment.external_side_effect);
        assert!(
            assessment
                .blocked_until_confirmation
                .contains(&"money_movement".to_string())
        );
        assert!(
            assessment
                .heuristics_used
                .contains(&"money_movement_gate".to_string())
        );
    }

    #[test]
    fn low_risk_note_capture_stays_low() {
        let assessment = assess_request(
            "Write down the Q3 summary",
            "note",
            &json!({"content": "Q3 summary"}),
        );

        assert_eq!(assessment.risk_floor, "low");
        assert!(!assessment.requires_confirmation);
        assert!(!assessment.external_side_effect);
        assert!(assessment.blocked_until_confirmation.is_empty());
    }

    #[test]
    fn permission_boundary_changes_raise_high_risk_and_block_access_mutation() {
        let assessment = assess_request(
            "Grant admin access to Sarah and rotate the password",
            "orchestrate",
            &json!({"objective": "Grant admin access to Sarah and rotate the password"}),
        );

        assert_eq!(assessment.risk_floor, "high");
        assert!(assessment.requires_confirmation);
        assert!(
            assessment
                .blocked_until_confirmation
                .contains(&"permission_boundary_change".to_string())
        );
        assert!(
            assessment
                .heuristics_used
                .contains(&"permission_boundary_gate".to_string())
        );
    }
}
