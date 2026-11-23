use serde_json::Value;

pub const ACTIVATION_DEFINITION_VERSION: &str = "activation-v1";

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ApprovedActivationSource {
    pub wedding_plan_id: String,
    pub event_names: Vec<&'static str>,
}

fn text<'a>(value: &'a Value, keys: &[&str]) -> Option<&'a str> {
    keys.iter()
        .find_map(|key| value.get(*key).and_then(Value::as_str))
        .map(str::trim)
        .filter(|value| !value.is_empty())
}

fn wedding_plan_id(content: &Value, metadata: &Value) -> Option<String> {
    let plan = text(content, &["wedding_plan_id", "weddingPlanId"])
        .or_else(|| text(metadata, &["wedding_plan_id", "weddingPlanId"]))?;
    (plan.starts_with("wedding_plan:") && plan.len() <= 200).then(|| plan.to_string())
}

pub fn approved_activation_source(
    subtype: &str,
    content: &Value,
    metadata: &Value,
) -> Option<ApprovedActivationSource> {
    let plan = wedding_plan_id(content, metadata)?;
    let content_kind = content.get("kind").and_then(Value::as_str);
    let mut event_names = Vec::with_capacity(2);
    match subtype {
        "wedding_intake_profile" if content_kind == Some("wedding_intake_profile") => {
            event_names.push("wedding_plan_saved");
        }
        "selected_vendor_contact_details"
            if content_kind == Some("wedding_vendor_contact_reference")
                && content
                    .get("selected_for_follow_up")
                    .and_then(Value::as_bool)
                    == Some(true) =>
        {
            event_names.push("vendor_saved");
        }
        "wedding_decision_selection"
            if content_kind == Some("wedding_decision_selection")
                && text(content, &["decision_id"]).is_some() =>
        {
            if content.get("budget_decision").and_then(Value::as_bool) == Some(true) {
                event_names.push("budget_saved");
            }
            event_names.push("decision_resolved");
        }
        _ => return None,
    }
    Some(ApprovedActivationSource {
        wedding_plan_id: plan,
        event_names,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn exact_saved_actions_map_without_copying_values() {
        let source = approved_activation_source(
            "wedding_decision_selection",
            &json!({
                "kind":"wedding_decision_selection",
                "wedding_plan_id":"wedding_plan:one",
                "decision_id":"decision:budget",
                "budget_decision":true,
                "selected_option":{"amount":35_000,"label":"private"}
            }),
            &json!({}),
        )
        .unwrap();
        assert_eq!(source.wedding_plan_id, "wedding_plan:one");
        assert_eq!(source.event_names, ["budget_saved", "decision_resolved"]);
    }

    #[test]
    fn generated_unsaved_and_partner_events_do_not_qualify() {
        for subtype in [
            "prepared_draft",
            "partner_invite_accepted",
            "wedding_task_preview",
            "wedding_intake_profile_generated",
        ] {
            assert!(
                approved_activation_source(
                    subtype,
                    &json!({"kind":subtype,"wedding_plan_id":"wedding_plan:one"}),
                    &json!({}),
                )
                .is_none()
            );
        }
    }

    #[test]
    fn subtype_content_or_plan_mismatch_fails_closed() {
        assert!(
            approved_activation_source(
                "selected_vendor_contact_details",
                &json!({"kind":"wedding_vendor_contact_reference","selected_for_follow_up":false}),
                &json!({"weddingPlanId":"wedding_plan:one"}),
            )
            .is_none()
        );
        assert!(
            approved_activation_source(
                "wedding_intake_profile",
                &json!({"kind":"other","wedding_plan_id":"wedding_plan:one"}),
                &json!({}),
            )
            .is_none()
        );
        assert!(
            approved_activation_source(
                "wedding_intake_profile",
                &json!({"kind":"wedding_intake_profile","wedding_plan_id":"other-tenant"}),
                &json!({}),
            )
            .is_none()
        );
    }
}
