use super::*;
use serde_json::{Value, json};

fn plan() -> Value {
    json!({"account_id":"couple","plan_id":"plan-a","thread_id":"thread-a"})
}
fn money() -> Value {
    json!({"amount_minor":10000,"currency":"AUD"})
}
fn interval() -> Value {
    json!({"starts_at":"2026-11-01T10:00:00+11:00","ends_at":"2026-11-01T12:00:00+11:00","timezone":"Australia/Sydney"})
}
fn grant(client: bool) -> Value {
    json!({"grant_id":"grant-a","practice_id":"practice-a","plan":if client {plan()} else {Value::Null},
        "resource_id":null,"subject_account_id":"planner","role":"lead_planner",
        "capabilities":[{"resource":"plan","action":"read"}],"valid_from":"2026-10-27T00:00:00Z",
        "expires_at":null,"revoked_at":null})
}
fn cases() -> Vec<(&'static str, bool, Value)> {
    vec![
        (
            "practice_created",
            false,
            json!({"display_name":"Harbour Events","owner_account_id":"owner"}),
        ),
        ("practice_member_granted", false, grant(false)),
        (
            "practice_member_revoked",
            false,
            json!({"grant_id":"grant-a","subject_account_id":"planner","supersedes_event_id":"source-a"}),
        ),
        ("plan_collaboration_granted", true, grant(true)),
        (
            "plan_collaboration_revoked",
            true,
            json!({"grant_id":"grant-a","subject_account_id":"planner","supersedes_event_id":"source-a"}),
        ),
        (
            "practice_client_indexed",
            true,
            json!({"plan":plan(),"client_label":"Client A","wedding_date":null,
            "stage":"planning","assigned_planner_id":null,"next_action":"review_quote","next_action_due_at":null,
            "unread_count":null,"action_needed_count":null,"financial_due":[],"source_projection_version":1}),
        ),
        (
            "workflow_item_assigned",
            true,
            json!({"workflow_item_id":"task-a","assignee_account_id":"planner","supersedes_event_id":null}),
        ),
        (
            "availability_policy_recorded",
            false,
            json!({"policy_id":"policy-a","resource_id":"planner",
            "timezone":"Australia/Sydney","windows":[{"weekday":1,"start_minute":540,"end_minute":1020}],
            "setup_minutes":30,"teardown_minutes":30,"travel_minutes":60,"supersedes_event_id":null}),
        ),
        (
            "availability_exception_recorded",
            false,
            json!({"policy_id":"policy-a","resource_id":"planner","interval":interval(),"blocked":true}),
        ),
        (
            "date_hold_transition",
            true,
            json!({"hold_id":"hold-a","resource_id":"vendor-room-a","interval":interval(),
            "expires_at":"2026-10-30T00:00:00Z","expected_state":null,"target_state":"requested","booking_confirmation_event_id":null}),
        ),
        (
            "quotation_revision_linked",
            true,
            json!({"quotation_id":"quote-a","version_id":"quote-v2","canonical_event_id":"source-a","supersedes_version_id":"quote-v1"}),
        ),
        (
            "booking_confirmation_linked",
            true,
            json!({"quotation_id":"quote-a","version_id":"quote-v2","closure_transition_event_id":"source-a","validated_evidence_event_ids":["source-b"]}),
        ),
        (
            "payment_schedule_item_recorded",
            true,
            json!({"item_id":"deposit-a","quotation_version_id":"quote-v2","amount":money(),"due_at":"2026-11-01T00:00:00Z","supersedes_event_id":null}),
        ),
        (
            "payment_evidence_recorded",
            true,
            json!({"item_id":"deposit-a","source_id":"receipt-a","source_version_id":"receipt-v1","amount":money(),"supersedes_event_id":null}),
        ),
        (
            "payment_state_changed",
            true,
            json!({"item_id":"deposit-a","expected_state":"evidence_pending","target_state":"paid","evidence_event_ids":["source-a"],"supersedes_event_id":null}),
        ),
    ]
}
fn envelope(kind: &str, client: bool, data: Value) -> Value {
    json!({"schema_version":PRACTICE_SCHEMA_VERSION,"event_id":"event-a","practice_id":"practice-a",
        "plan":if client {plan()} else {Value::Null},"actor_account_id":"owner",
        "authority":{"membership":1,"collaboration":2},"occurred_at":"2026-10-27T00:00:00Z",
        "idempotency_key":"request-a","source_event_ids":["source-a","source-b"],"payload":{"kind":kind,"data":data}})
}

#[test]
fn every_registered_schema_round_trips_and_rejects_unknown_fields_or_versions() {
    let fixtures = cases();
    assert_eq!(
        fixtures.iter().map(|v| v.0).collect::<Vec<_>>(),
        PRACTICE_EVENT_KINDS
    );
    for (kind, client, data) in fixtures {
        let value = envelope(kind, client, data);
        let event =
            decode_event(&value.to_string()).unwrap_or_else(|error| panic!("{kind}: {error:?}"));
        assert_eq!(event.payload.kind(), kind);
        assert_eq!(
            decode_event(&serde_json::to_string(&event).unwrap()).unwrap(),
            event
        );
        let mut unsupported = value.clone();
        unsupported["schema_version"] = json!("practice.event.v2");
        assert_eq!(
            decode_event(&unsupported.to_string()),
            Err(PracticeError::UnsupportedVersion)
        );
        let mut extra = value.clone();
        extra["payload"]["data"]["message_body"] = json!("must never enter an index");
        assert_eq!(
            decode_event(&extra.to_string()),
            Err(PracticeError::InvalidContract),
            "{kind}"
        );
        let mut wrong_scope = value;
        wrong_scope["plan"] = if client { Value::Null } else { plan() };
        assert_eq!(
            decode_event(&wrong_scope.to_string()),
            Err(PracticeError::InvalidContract),
            "{kind}"
        );
    }
}

#[test]
fn all_private_index_fields_are_rejected_instead_of_silently_dropped() {
    let (_, client, data) = cases()
        .into_iter()
        .find(|v| v.0 == "practice_client_indexed")
        .unwrap();
    for key in [
        "messages",
        "message_body",
        "documents",
        "guest_list",
        "private_notes",
        "quote_content",
        "next_action_text",
    ] {
        let mut value = envelope("practice_client_indexed", client, data.clone());
        value["payload"]["data"][key] = json!("private");
        assert_eq!(
            decode_event(&value.to_string()),
            Err(PracticeError::InvalidContract)
        );
    }
}

#[test]
fn rejects_invalid_grants_money_intervals_and_unproven_booking_links() {
    let mutate: &[(&str, &str, Value)] = &[
        (
            "plan_collaboration_granted",
            "/payload/data/practice_id",
            json!("other-practice"),
        ),
        (
            "plan_collaboration_granted",
            "/payload/data/plan/account_id",
            json!("other-tenant"),
        ),
        (
            "plan_collaboration_granted",
            "/payload/data/expires_at",
            json!("2026-10-26T00:00:00Z"),
        ),
        (
            "plan_collaboration_granted",
            "/payload/data/role",
            json!("vendor_representative"),
        ),
        (
            "practice_client_indexed",
            "/payload/data/wedding_date",
            json!("2026-02-30"),
        ),
        (
            "availability_policy_recorded",
            "/payload/data/windows/0/weekday",
            json!(8),
        ),
        (
            "availability_policy_recorded",
            "/payload/data/windows/0/end_minute",
            json!(500),
        ),
        (
            "availability_exception_recorded",
            "/payload/data/interval/ends_at",
            json!("2020-01-01T00:00:00Z"),
        ),
        (
            "payment_schedule_item_recorded",
            "/payload/data/amount/amount_minor",
            json!(-1),
        ),
        (
            "payment_schedule_item_recorded",
            "/payload/data/amount/amount_minor",
            json!(9007199254740992_i64),
        ),
        (
            "payment_evidence_recorded",
            "/payload/data/amount/currency",
            json!("FAKE"),
        ),
        (
            "payment_state_changed",
            "/payload/data/evidence_event_ids",
            json!([]),
        ),
        (
            "booking_confirmation_linked",
            "/payload/data/validated_evidence_event_ids",
            json!([]),
        ),
        (
            "booking_confirmation_linked",
            "/source_event_ids",
            json!([]),
        ),
        (
            "quotation_revision_linked",
            "/payload/data/supersedes_version_id",
            json!("quote-v2"),
        ),
    ];
    for (kind, path, bad) in mutate {
        let (_, client, data) = cases().into_iter().find(|v| &v.0 == kind).unwrap();
        let mut value = envelope(kind, client, data);
        *value.pointer_mut(path).unwrap() = bad.clone();
        assert_eq!(
            decode_event(&value.to_string()),
            Err(PracticeError::InvalidContract),
            "{kind} {path}"
        );
    }
}

#[test]
fn hold_conversion_requires_a_valid_transition_and_booking_reference() {
    let (_, client, data) = cases()
        .into_iter()
        .find(|v| v.0 == "date_hold_transition")
        .unwrap();
    let mut value = envelope("date_hold_transition", client, data);
    value["payload"]["data"]["target_state"] = json!("converted");
    assert!(decode_event(&value.to_string()).is_err());
    value["payload"]["data"]["expected_state"] = json!("held");
    assert!(decode_event(&value.to_string()).is_err());
    value["payload"]["data"]["booking_confirmation_event_id"] = json!("source-a");
    assert!(decode_event(&value.to_string()).is_ok());
    for terminal in ["expired", "released", "converted"] {
        value["payload"]["data"]["expected_state"] = json!(terminal);
        assert!(decode_event(&value.to_string()).is_err());
    }
}

#[test]
fn decoder_is_bounded_and_rejects_duplicate_or_unknown_keys() {
    assert!(decode_event(&" ".repeat(128 * 1024 + 1)).is_err());
    let (kind, client, data) = cases().remove(0);
    let value = envelope(kind, client, data).to_string();
    let duplicate = value.replacen('{', "{\"practice_id\":\"attacker\",", 1);
    assert!(decode_event(&duplicate).is_err());
    let mut value: Value = serde_json::from_str(&value).unwrap();
    value["payload"]["kind"] = json!("unknown_future_kind");
    assert!(decode_event(&value.to_string()).is_err());
}
