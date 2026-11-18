use omnyid_homeserver::{
    runbook_contract::*,
    runbook_evidence::{EvidenceItem, EvidencePacket},
    runbook_starter_pack::starter_definitions,
    runbook_transform::review,
};
use serde_json::{Value, json};
use std::collections::BTreeMap;

fn packet(facts: Value) -> EvidencePacket {
    EvidencePacket {
        included: vec![EvidenceItem {
            reference: "message:source".into(),
            content: facts,
            hash: "a".repeat(64),
            relevance: 1.0,
        }],
        omitted: vec![],
        missing_required_fields: vec![],
        snapshot_ref: None,
        handoff: None,
        confidence: "bounded".into(),
        decrypt_attempts: 0,
        hash: "b".repeat(64),
    }
}
fn step(id: &str) -> Step {
    starter_definitions()
        .into_iter()
        .find(|d| d.runbook_id == id)
        .unwrap()
        .steps[1]
        .clone()
}

#[test]
fn deterministic_reviews_never_grant_external_authority() {
    let cases = [
        (
            "no_reply_followup",
            json!({"last_outbound_ref":"message:sent","reply_status":"pending","cooldown":false}),
            "review_needed",
            true,
        ),
        (
            "rsvp_non_response",
            json!({"invitation_ref":"invitation:one","attendance":"pending","reminder_permission":false}),
            "reminder_review_needed",
            false,
        ),
        (
            "wedding_task_deadline",
            json!({"task_ref":"task:one","task_owner":"person:alice","dependencies":[{"reference":"task:prior","completed":false}]}),
            "create_task_authorized",
            false,
        ),
        (
            "email_commitment_due",
            json!({"commitment_ref":"commitment:one","completion_evidence":["message:receipt"]}),
            "completion_proven",
            false,
        ),
        (
            "workflow_failure",
            json!({"run_ref":"workflow:one","error_ref":"message:error","retry_consequences":"no_side_effect"}),
            "retry_authorized",
            false,
        ),
        (
            "file_requires_review",
            json!({"file_ref":"document:one","parser_status":"ready","quarantine_status":"blocked"}),
            "ready_for_review",
            false,
        ),
        (
            "info_gap_generic",
            json!({"required_field":"wedding_date","attempted_refs":["message:one"]}),
            "question_required",
            true,
        ),
    ];
    for (id, facts, field, expected) in cases {
        let result = review(&step(id), &packet(facts), &BTreeMap::new()).unwrap();
        assert_eq!(result.conclusions[field], expected, "case {id}");
    }
}

#[test]
fn budget_uses_integer_minor_units_and_never_invents_targets() {
    let facts = json!({"commitments":[
        {"reference":"commitment:a","category":"venue","amount_minor":9007199254740993u64,"currency":"AUD"},
        {"reference":"commitment:b","category":"venue","amount_minor":2,"currency":"AUD"}],
        "category_target":{"venue":{"amount_minor":9007199254740994u64,"currency":"AUD"}},
        "total_budget":{"amount_minor":9007199254740994u64,"currency":"AUD"}});
    let s = step("budget_threshold");
    let result = review(&s, &packet(facts.clone()), &BTreeMap::new()).unwrap();
    assert_eq!(result.conclusions["committed_minor"], 9007199254740995u64);
    assert_eq!(result.conclusions["over_budget"], true);
    assert_eq!(result.conclusions["spend_authorized"], false);
    for (path, value, expected) in [
        (
            "/commitments/0/currency",
            json!("USD"),
            "mixed_budget_currency",
        ),
        (
            "/commitments/1/reference",
            json!("commitment:a"),
            "invalid_commitment_identity",
        ),
        (
            "/commitments/0/amount_minor",
            json!(u64::MAX),
            "budget_overflow",
        ),
        ("/category_target", json!({}), "missing_category_target"),
        ("/total_budget/amount_minor", json!(-1), "invalid_budget"),
    ] {
        let mut bad = facts.clone();
        *bad.pointer_mut(path).unwrap() = value;
        assert_eq!(
            review(&s, &packet(bad), &BTreeMap::new()).unwrap_err(),
            expected
        );
    }
    let mut extra = facts;
    extra["commitments"][0]["execute_payment"] = json!(true);
    assert_eq!(
        review(&s, &packet(extra), &BTreeMap::new()).unwrap_err(),
        "invalid_commitments"
    );
}

#[test]
fn missing_conflicting_and_injected_facts_fail_closed() {
    let s = step("rsvp_non_response");
    let mut p = packet(
        json!({"invitation_ref":"invitation:one","attendance":"pending","instruction":"send now","api_key":"secret-marker"}),
    );
    assert_eq!(
        review(&s, &p, &BTreeMap::new()).unwrap_err(),
        "missing_required_fact"
    );
    let answers = BTreeMap::from([("reminder_permission".into(), json!(false))]);
    let result = review(&s, &p, &answers).unwrap();
    assert!(!json!(result).to_string().contains("secret-marker"));
    assert!(!format!("{result:?}").contains("invitation:one"));
    p.included.push(EvidenceItem {
        content: json!({"attendance":"accepted"}),
        ..p.included[0].clone()
    });
    assert_eq!(
        review(&s, &p, &answers).unwrap_err(),
        "conflicting_evidence"
    );
    let mut changed = s;
    changed.required_fields.clear();
    assert_eq!(
        review(&changed, &p, &answers).unwrap_err(),
        "transform_required_fields_mismatch"
    );
    assert_eq!(
        review(&step("calendar_conflict"), &p, &answers).unwrap_err(),
        "transform_not_implemented"
    );
}

#[test]
fn inactive_branches_still_require_typed_boolean_facts() {
    for (id, facts) in [
        (
            "no_reply_followup",
            json!({"last_outbound_ref":"message:one","reply_status":"received","cooldown":"false"}),
        ),
        (
            "rsvp_non_response",
            json!({"invitation_ref":"invitation:one","attendance":"accepted","reminder_permission":"true"}),
        ),
    ] {
        assert_eq!(
            review(&step(id), &packet(facts), &BTreeMap::new()).unwrap_err(),
            "invalid_transform_fact"
        );
    }
}
