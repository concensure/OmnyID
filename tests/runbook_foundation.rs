use chrono::{TimeZone, Utc};
use omnyid_homeserver::{
    runbook_contract::*, runbook_matcher::*, runbook_registry::*, runbook_validation::*,
};
use serde_json::{Value, json};
use std::collections::HashSet;

fn now() -> chrono::DateTime<Utc> {
    Utc.with_ymd_and_hms(2026, 11, 18, 0, 0, 0).unwrap()
}
fn step(id: &str, kind: StepKind) -> Step {
    Step {
        step_id: id.into(),
        kind,
        operation: None,
        required_fields: vec![],
        input_refs: vec![],
        tool: None,
        output_kind: None,
        output_schema: None,
        follow_up_event: None,
        max_retries: 0,
        token_limit: 0,
        cost_limit_microunits: 0,
    }
}
fn definition(id: &str) -> RunbookDefinition {
    RunbookDefinition {
        runbook_id: id.into(),
        version: 1,
        name: "Review event".into(),
        description: "Private description".into(),
        enabled: true,
        priority: 50,
        dedupe_group: None,
        trigger: Trigger {
            event_types: vec!["quote_received".into()],
            filters: vec![],
        },
        steps: vec![
            step("read", StepKind::Read),
            step("done", StepKind::Complete),
        ],
        tools_allowlist: vec![],
        success_criteria: vec![Filter {
            path: "instance.outputs.quote_ref".into(),
            op: FilterOp::Exists,
            value: None,
        }],
        escalate_when: vec![EscalationReason::MissingRequiredFact],
        follow_up_events: vec![],
        max_autonomy: MaxAutonomy::DraftOnly,
        status: DefinitionStatus::Active,
        supersedes_id: None,
        evidence_limit: 8,
    }
}
fn envelope(d: &RunbookDefinition) -> Value {
    build_definition_afp("alice", d, now()).unwrap()
}
fn registry(defs: &[RunbookDefinition]) -> Registry {
    Registry::rebuild("alice", &defs.iter().map(envelope).collect::<Vec<_>>()).unwrap()
}
fn event() -> ProactiveEvent {
    ProactiveEvent {
        urgency: None,
        event_id: "event-1".into(),
        event_type: "quote_received".into(),
        source_refs: vec!["document:quote-1".into()],
        entity_refs: vec!["wedding:w1".into()],
        metadata: json!({"revision": 3, "tags": ["quote"], "wedding_id": "w1"})
            .as_object()
            .unwrap()
            .clone(),
        confidence: 0.9,
        occurred_at: now(),
        caused_by_event_id: None,
    }
}

#[test]
fn strict_round_trip_and_private_envelope() {
    let d = definition("quote");
    assert_eq!(
        parse_definition(&serde_json::to_vec(&d).unwrap()).unwrap(),
        d
    );
    let afp = envelope(&d);
    assert_eq!(parse_definition_afp("alice", &afp).unwrap().definition, d);
    assert_eq!(afp["to"], json!(["alice"]));
    assert!(!afp["metadata"].to_string().contains("Private description"));
    assert!(!afp["metadata"].to_string().contains("steps"));
    assert!(parse_definition_afp("bob", &afp).is_err());
    let mut leaking = afp;
    leaking["metadata"]["description"] = json!("Private description");
    assert!(parse_definition_afp("alice", &leaking).is_err());
}

#[test]
fn unknown_fields_enums_and_nested_inputs_are_rejected() {
    for (pointer, bad) in [
        ("/max_autonomy", json!("auto_execute")),
        ("/status", json!("published")),
        ("/steps/0/kind", json!("shell")),
        ("/escalate_when/0", json!("ignore_policy")),
        ("/success_criteria/0/op", json!("regex")),
    ] {
        let mut value = serde_json::to_value(definition("quote")).unwrap();
        *value.pointer_mut(pointer).unwrap() = bad;
        assert!(
            parse_definition(&serde_json::to_vec(&value).unwrap()).is_err(),
            "{pointer}"
        );
    }
    for pointer in ["", "/steps/0", "/trigger", "/success_criteria/0"] {
        let mut value = serde_json::to_value(definition("quote")).unwrap();
        value
            .pointer_mut(pointer)
            .unwrap()
            .as_object_mut()
            .unwrap()
            .insert("api_key".into(), json!("secret"));
        assert!(parse_definition(&serde_json::to_vec(&value).unwrap()).is_err());
    }
    assert!(parse_definition(b"{broken").is_err());
    assert!(parse_definition(&vec![b' '; MAX_DEFINITION_BYTES + 1]).is_err());
}

#[test]
fn definition_limits_and_completion_are_enforced() {
    let base = definition("quote");
    let mut d = base.clone();
    d.steps = vec![step("read", StepKind::Read); MAX_STEPS + 1];
    assert!(validate_definition(&d).is_err());
    let mut d = base.clone();
    d.steps[1].step_id = "read".into();
    assert!(validate_definition(&d).is_err());
    let mut d = base.clone();
    d.steps[0].max_retries = 4;
    assert!(validate_definition(&d).is_err());
    let mut d = base.clone();
    d.evidence_limit = 33;
    assert!(validate_definition(&d).is_err());
    let mut d = base.clone();
    d.steps.pop();
    assert!(validate_definition(&d).is_err());
    let mut d = base.clone();
    d.description = "x".repeat(2049);
    assert!(validate_definition(&d).is_err());
    let mut d = base.clone();
    d.steps[0].input_refs = vec!["history:*".into()];
    assert!(validate_definition(&d).is_err());
    let mut d = base.clone();
    d.trigger.filters = vec![Filter {
        path: "content.body".into(),
        op: FilterOp::Exists,
        value: None,
    }];
    assert!(validate_definition(&d).is_err());
    let mut d = base;
    d.version = 2;
    assert!(validate_definition(&d).is_err());
}

#[test]
fn tool_followup_and_model_boundaries_are_validated() {
    let mut d = definition("quote");
    d.steps[0].kind = StepKind::Tool;
    d.steps[0].tool = Some("quotation.normalise".into());
    assert_eq!(validate_definition(&d), Err("tool_not_allowed"));
    d.tools_allowlist.push("quotation.normalise".into());
    assert!(validate_definition(&d).is_ok());
    d.steps[0] = step("wait", StepKind::Wait);
    assert!(validate_definition(&d).is_err());
    d.steps[0].follow_up_event = Some("review_due".into());
    assert!(validate_definition(&d).is_err());
    d.follow_up_events.push("review_due".into());
    assert!(validate_definition(&d).is_ok());
    d.steps[0] = step("draft", StepKind::Draft);
    assert!(validate_definition(&d).is_err());
    d.steps[0].output_schema = Some("draft_v1".into());
    d.steps[0].token_limit = 1024;
    d.steps[0].cost_limit_microunits = 10000;
    assert!(validate_definition(&d).is_ok());
    d.steps[0].token_limit = 8193;
    assert!(validate_definition(&d).is_err());
    d.steps[0] = step("emit", StepKind::Emit);
    d.steps[0].output_kind = Some("approval_granted".into());
    assert!(validate_definition(&d).is_err());
}

#[test]
fn transition_graph_never_reopens_terminal_instances() {
    use InstanceState::*;
    let states = [
        Matched,
        Running,
        WaitingForInput,
        AwaitingApproval,
        WaitingForEvent,
        Completed,
        Failed,
        Cancelled,
    ];
    for from in states {
        assert!(!from.can_transition_to(from));
        for to in states {
            if from.terminal() {
                assert!(!from.can_transition_to(to));
            }
        }
    }
    assert!(Matched.can_transition_to(Running));
    assert!(!Matched.can_transition_to(Completed));
    for state in [WaitingForInput, AwaitingApproval, WaitingForEvent] {
        assert!(Running.can_transition_to(state));
        assert!(state.can_transition_to(Running));
        assert!(state.can_transition_to(Cancelled));
        assert!(!state.can_transition_to(Completed));
    }
}

#[test]
fn projection_rejects_forged_owner_parent_metadata_and_forks() {
    let root = envelope(&definition("quote"));
    let registry = Registry::rebuild("alice", &[root.clone()]).unwrap();
    let mut updated = definition("quote");
    updated.enabled = false;
    let successor = registry
        .successor("quote", root["id"].as_str().unwrap(), updated, now())
        .unwrap();
    let rebuilt = Registry::rebuild("alice", &[successor.clone(), root.clone()]).unwrap();
    assert_eq!(rebuilt.get("quote").unwrap().definition.version, 2);
    assert!(!rebuilt.get("quote").unwrap().definition.enabled);
    assert!(Registry::rebuild("bob", &[root.clone()]).is_err());
    assert!(Registry::rebuild("alice", &[successor.clone()]).is_err());
    assert!(Registry::rebuild("alice", &[root.clone(), root.clone()]).is_err());
    let fork = envelope(&definition("quote"));
    assert!(Registry::rebuild("alice", &[root.clone(), fork]).is_err());
    for (pointer, bad) in [
        ("/from", json!("bob")),
        ("/to", json!(["alice", "bob"])),
        ("/parent_id", json!("forged")),
        ("/metadata/enabled", json!(false)),
        ("/metadata/private", json!(false)),
    ] {
        let mut forged = root.clone();
        *forged.pointer_mut(pointer).unwrap() = bad;
        assert!(Registry::rebuild("alice", &[forged]).is_err());
    }
    assert!(
        registry
            .successor("quote", "stale", definition("quote"), now())
            .is_err()
    );
}

#[test]
fn archive_is_terminal_and_disabled_latest_never_matches() {
    let root = envelope(&definition("quote"));
    let registry = Registry::rebuild("alice", &[root.clone()]).unwrap();
    let mut archived = definition("quote");
    archived.enabled = false;
    archived.status = DefinitionStatus::Archived;
    let next = registry
        .successor("quote", root["id"].as_str().unwrap(), archived, now())
        .unwrap();
    let r = Registry::rebuild("alice", &[root, next.clone()]).unwrap();
    assert!(
        match_event("alice", &r, &event(), &HashSet::new())
            .unwrap()
            .is_empty()
    );
    assert!(
        r.successor(
            "quote",
            next["id"].as_str().unwrap(),
            definition("quote"),
            now()
        )
        .is_err()
    );
}

#[test]
fn typed_filters_fail_closed_for_missing_null_or_wrong_type() {
    let context = json!({"metadata": {"count": 3, "tags": ["quote"], "null": null, "huge": 9007199254740993u64}, "refs": ["document:q1"]});
    for (path, op, value, expected) in [
        ("metadata.count", FilterOp::Eq, Some(json!(3)), true),
        ("metadata.count", FilterOp::Eq, Some(json!("3")), false),
        ("metadata.count", FilterOp::In, Some(json!([1, 3])), true),
        ("metadata.count", FilterOp::Gte, Some(json!(3)), true),
        ("metadata.count", FilterOp::Lte, Some(json!(2)), false),
        ("metadata.missing", FilterOp::Gte, Some(json!(0)), false),
        ("metadata.null", FilterOp::Exists, None, false),
        ("metadata.count", FilterOp::Exists, None, true),
        (
            "metadata.tags",
            FilterOp::ContainsTag,
            Some(json!("quote")),
            true,
        ),
        ("refs", FilterOp::RefKind, Some(json!("document")), true),
        ("refs", FilterOp::RefKind, Some(json!("doc")), false),
        (
            "metadata.huge",
            FilterOp::Lte,
            Some(json!(9007199254740992u64)),
            false,
        ),
    ] {
        assert_eq!(
            filter_matches(
                &Filter {
                    path: path.into(),
                    op,
                    value
                },
                &context
            ),
            expected,
            "{path} {op:?}"
        );
    }
}

#[test]
fn matching_order_dedupe_retry_and_cap_are_stable() {
    let mut defs = (0..8)
        .map(|i| definition(&format!("r{i}")))
        .collect::<Vec<_>>();
    defs[0].priority = 80;
    defs[0].dedupe_group = Some("quote".into());
    defs[1].dedupe_group = Some("quote".into());
    defs[3].trigger.filters.push(Filter {
        path: "metadata.wedding_id".into(),
        op: FilterOp::Exists,
        value: None,
    });
    let r = registry(&defs);
    let results = match_event("alice", &r, &event(), &HashSet::new()).unwrap();
    assert_eq!(results[0].runbook_id, "r0");
    assert_eq!(results[1].runbook_id, "r3");
    assert_eq!(
        results
            .iter()
            .filter(|r| r.disposition == MatchDisposition::Matched)
            .count(),
        5
    );
    assert_eq!(
        results
            .iter()
            .find(|r| r.runbook_id == "r1")
            .unwrap()
            .disposition,
        MatchDisposition::DedupeGroup
    );
    let keys = results
        .iter()
        .filter(|r| r.disposition == MatchDisposition::Matched)
        .map(|r| r.instance_key.clone())
        .collect();
    let retries = match_event("alice", &r, &event(), &keys).unwrap();
    assert!(
        !retries
            .iter()
            .any(|r| r.disposition == MatchDisposition::Matched)
    );
    defs.reverse();
    let reverse = match_event("alice", &registry(&defs), &event(), &HashSet::new()).unwrap();
    assert_eq!(
        results
            .iter()
            .map(|r| (&r.runbook_id, &r.disposition))
            .collect::<Vec<_>>(),
        reverse
            .iter()
            .map(|r| (&r.runbook_id, &r.disposition))
            .collect::<Vec<_>>()
    );
}

#[test]
fn owner_keys_and_event_summaries_are_isolated() {
    assert_ne!(
        instance_key("ab", "c", "d", 1),
        instance_key("a", "bc", "d", 1)
    );
    assert_ne!(
        instance_key("alice", "e", "d", 1),
        instance_key("bob", "e", "d", 1)
    );
    assert_ne!(
        instance_key("alice", "e", "d", 1),
        instance_key("alice", "e", "d", 2)
    );
    let r = registry(&[definition("quote")]);
    assert!(match_event("bob", &r, &event(), &HashSet::new()).is_err());
    let mut e = event();
    e.metadata.insert("body".into(), json!("private email"));
    assert!(match_event("alice", &r, &e, &HashSet::new()).is_err());
    let mut e = event();
    e.confidence = f64::NAN;
    assert!(validate_event(&e).is_err());
    let mut e = event();
    e.event_type = "unknown_event".into();
    assert!(
        match_event("alice", &r, &e, &HashSet::new())
            .unwrap()
            .is_empty()
    );
}

#[test]
fn runtime_afp_preserves_private_content_and_standard_envelope() {
    use omnyid_homeserver::runbook_afp::*;
    let record = RuntimeRecord::Escalation(EpistemicEscalation {
        escalation_id: "gap-1".into(),
        instance_id: "instance-1".into(),
        step_id: "read".into(),
        status: EscalationStatus::Open,
        reason: EscalationReason::MissingRequiredFact,
        missing_fields: vec!["wedding_date".into()],
        attempted_refs: vec!["wedding:w1".into()],
        question: "What wedding date should this quote use?".into(),
        why_needed: "The date is missing.".into(),
        answer_schema: AnswerSchema::Date,
        expires_at: now() + chrono::Duration::days(7),
    });
    let afp = build_runtime_afp("alice", Some("event-1"), &record, now()).unwrap();
    assert_eq!(parse_runtime_afp("alice", &afp).unwrap(), record);
    assert!(parse_runtime_afp("bob", &afp).is_err());
    assert!(!afp["metadata"].to_string().contains("wedding date"));
    let standard: omnyid_homeserver::message::AFPMessage =
        serde_json::from_value(afp.clone()).unwrap();
    assert_eq!(standard.thread_id, "runbook:instance-1");
    assert_eq!(standard.parent_id.as_deref(), Some("event-1"));
    let mut bad = afp.clone();
    bad["metadata"]["question"] = json!("private question");
    assert!(parse_runtime_afp("alice", &bad).is_err());
    let mut bad = afp;
    bad["content"]["answer_schema"] = json!("execute_shell");
    assert!(parse_runtime_afp("alice", &bad).is_err());
}

#[test]
fn instance_revision_checks_and_runtime_roundtrip() {
    use omnyid_homeserver::runbook_afp::*;
    let instance = RunbookInstance {
        instance_id: "i1".into(),
        runbook_id: "quote".into(),
        runbook_version: 1,
        trigger_event_id: "e1".into(),
        thread_id: "runbook:i1".into(),
        instance_key: instance_key("alice", "e1", "quote", 1),
        status: InstanceState::Matched,
        current_step_id: None,
        completed_step_ids: vec![],
        next_follow_up_at: None,
        wait_expires_at: None,
        definition_ref: "d1".into(),
        evidence_packet_ref: None,
        latest_trace_ref: None,
        retry_of_instance_id: None,
        revision: 1,
    };
    assert!(instance.transition(2, InstanceState::Running).is_err());
    let next = instance.transition(1, InstanceState::Running).unwrap();
    assert_eq!(next.revision, 2);
    let record = RuntimeRecord::Instance(next);
    assert!(build_runtime_afp("alice", None, &record, now()).is_err());
    let afp = build_runtime_afp("alice", Some("revision-1"), &record, now()).unwrap();
    assert_eq!(parse_runtime_afp("alice", &afp).unwrap(), record);
    let mut bad = instance;
    bad.thread_id = "other-thread".into();
    assert!(RuntimeRecord::Instance(bad).validate().is_err());
}

#[test]
fn event_adapter_uses_partition_and_never_copies_raw_payload() {
    use omnyid_homeserver::runbook_event::normalize_stored_event;
    let stored = json!({"protocol":"afp-v1", "id":"e1", "type":"passive_event", "content": {
        "event_type":"email_received", "confidence":0.8, "event_at":now().to_rfc3339(),
        "entity_id":"thread:t1", "payload":{"body":"PRIVATE"}, "context":{"token":"SECRET"},
        "metadata":{"revision":1,"body":"PRIVATE","credential":"SECRET"}
    }});
    let event = normalize_stored_event("alice", "alice", &stored).unwrap();
    assert_eq!(
        event,
        normalize_stored_event("alice", "alice", &stored).unwrap()
    );
    assert_eq!(event.source_refs, vec!["message:e1"]);
    assert!(!serde_json::to_string(&event).unwrap().contains("PRIVATE"));
    assert!(!serde_json::to_string(&event).unwrap().contains("SECRET"));
    assert!(normalize_stored_event("bob", "alice", &stored).is_err());
    let mut malformed = stored.clone();
    malformed["content"]["event_at"] = json!("tomorrow");
    assert!(normalize_stored_event("alice", "alice", &malformed).is_err());
    let mut malformed = stored;
    malformed["type"] = json!("runbook_follow_up");
    assert!(normalize_stored_event("alice", "alice", &malformed).is_err());
}

#[test]
fn prior_outputs_are_bounded_and_duplicate_filters_cannot_raise_specificity() {
    let mut d = definition("quote");
    d.steps[0].input_refs = vec!["event.source_refs".into()];
    d.steps[1].input_refs = vec!["steps.read.output_refs".into()];
    assert!(validate_definition(&d).is_ok());
    d.steps[0].input_refs = vec!["steps.done.output_refs".into()];
    assert!(validate_definition(&d).is_err());
    d.steps[0].input_refs = vec!["all_history".into()];
    assert!(validate_definition(&d).is_err());
    d.steps[0].input_refs.clear();
    let filter = Filter {
        path: "metadata.wedding_id".into(),
        op: FilterOp::Exists,
        value: None,
    };
    d.trigger.filters = vec![filter.clone(), filter];
    assert_eq!(validate_definition(&d), Err("duplicate_trigger_filter"));
    assert!(!filter_matches(
        &Filter {
            path: "count".into(),
            op: FilterOp::Gte,
            value: Some(json!(9223372036854775808u64))
        },
        &json!({"count":i64::MAX})
    ));
}

#[test]
fn trace_roundtrip_requires_honest_model_cost_and_time_provenance() {
    use omnyid_homeserver::runbook_afp::*;
    let trace = StepTrace {
        trace_id: "trace-1".into(),
        instance_id: "i1".into(),
        step_id: "read".into(),
        step_kind: StepKind::Read,
        status: TraceStatus::Completed,
        input_refs: vec!["message:e1".into()],
        output_refs: vec!["document:d1".into()],
        input_hash: "a".repeat(64),
        output_hash: Some("b".repeat(64)),
        tool_id: None,
        model: None,
        prompt_version: None,
        input_tokens: 0,
        output_tokens: 0,
        cost_microunits: 0,
        approval_ref: None,
        provenance_ref: Some("provenance:p1".into()),
        started_at: now(),
        completed_at: Some(now()),
    };
    let record = RuntimeRecord::Trace(trace.clone());
    let afp = build_runtime_afp("alice", Some("instance-revision-1"), &record, now()).unwrap();
    assert_eq!(parse_runtime_afp("alice", &afp).unwrap(), record);
    let mut bad = trace.clone();
    bad.cost_microunits = 10;
    assert!(RuntimeRecord::Trace(bad).validate().is_err());
    let mut bad = trace.clone();
    bad.step_kind = StepKind::Draft;
    assert!(RuntimeRecord::Trace(bad).validate().is_err());
    let mut bad = trace;
    bad.completed_at = Some(now() - chrono::Duration::seconds(1));
    assert!(RuntimeRecord::Trace(bad).validate().is_err());
}
