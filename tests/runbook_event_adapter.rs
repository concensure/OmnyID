use chrono::Utc;
use omnyid_homeserver::{
    background_watcher::{build_watcher_alert_afp, build_watcher_resolution_event_afp},
    message::{AfpWatcherAlertContent, AfpWatcherResolutionEventContent},
    runbook_event::normalize_stored_event,
};
use serde_json::json;

#[test]
fn reviewed_sources_preserve_bounded_context_without_bodies() {
    for kind in [
        "passive_event",
        "watcher_alert",
        "watcher_resolution_event",
        "workflow_failed",
        "wedding_vendor_quote_received",
        "wedding_rsvp_received",
        "wedding_task_due",
        "document_review_required",
    ] {
        for passive in ["email_received", "calendar_event_changed"] {
            let value = json!({"protocol":"afp-v1","id":"event1","type":kind,"timestamp":Utc::now().to_rfc3339(),
                "content":{"event_type":passive,"event_at":Utc::now().to_rfc3339(),"confidence":0.75,"urgency":"high",
                    "source_refs":["message:source"],"entity_refs":["document:doc"],"entity_id":"task:task1",
                    "caused_by_event_id":"cause1","body":"secret_payload","metadata":{"status":"pending","password":"secret"}}});
            let e = normalize_stored_event("alice", "alice", &value).unwrap();
            assert_eq!(Some("high"), e.urgency.as_deref());
            assert_eq!(Some("cause1"), e.caused_by_event_id.as_deref());
            assert_eq!(e.source_refs, vec!["message:event1", "message:source"]);
            assert_eq!(e.entity_refs, vec!["document:doc", "task:task1"]);
            assert_eq!(e, normalize_stored_event("alice", "alice", &value).unwrap());
            assert!(!serde_json::to_string(&e).unwrap().contains("secret"));
            assert!(normalize_stored_event("bob", "alice", &value).is_err());
            for (field, bad) in [
                ("urgency", json!("unbounded")),
                ("caused_by_event_id", json!({"body":"x"})),
                ("source_refs", json!(["raw body"])),
                ("entity_refs", json!(["missingtype"])),
            ] {
                let mut malformed = value.clone();
                malformed["content"][field] = bad;
                assert!(normalize_stored_event("alice", "alice", &malformed).is_err());
            }
        }
    }
    let forged = json!({"protocol":"afp-v1","id":"fake","type":"runbook_follow_up","content":{"confidence":1.0}});
    assert!(normalize_stored_event("alice", "alice", &forged).is_err());
}

#[test]
fn native_watcher_contracts_normalize_without_inventing_confidence() {
    let alert = build_watcher_alert_afp(
        "alice",
        "thread1",
        &AfpWatcherAlertContent {
            heuristic_id: "h1".into(),
            message: "private message".into(),
            confidence: 0.8,
            severity: "important".into(),
            category: "email".into(),
            entity_id: Some("thread1".into()),
            source_event_id: Some("source1".into()),
            ..Default::default()
        },
        &[],
    );
    let e = normalize_stored_event("alice", "alice", &alert).unwrap();
    assert_eq!(e.entity_refs, vec!["entity:thread1"]);
    assert_eq!(e.caused_by_event_id.as_deref(), Some("source1"));
    assert_eq!(e.urgency.as_deref(), Some("important"));
    assert!(e.source_refs.contains(&"message:source1".into()));
    let resolution = build_watcher_resolution_event_afp(
        "alice",
        "thread1",
        &AfpWatcherResolutionEventContent {
            resolution_kind: "dismissed".into(),
            resolved_message_id: "alert1".into(),
            source_event_id: Some("source1".into()),
            ..Default::default()
        },
    );
    let e = normalize_stored_event("alice", "alice", &resolution).unwrap();
    assert_eq!(e.confidence, 0.0);
    assert!(e.source_refs.contains(&"message:alert1".into()));
}
