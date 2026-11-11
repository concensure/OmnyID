use omnyid_homeserver::wedding_celebrant_consultation::{
    live_has_capacity, normalize_phone, valid_topic, ConsultationIntent,
};

#[test]
fn migration_keeps_private_data_out_of_events_and_reserves_scheduled_slots() {
    let migration = include_str!("../postgres/migrations/0158_wedding_celebrant_consultations.sql");
    assert!(migration.contains("phone_ciphertext TEXT NOT NULL"));
    assert!(migration.contains("uq_celebrant_active_scheduled_slot"));
    assert!(
        migration.contains("FOR UPDATE") == false,
        "locking belongs in the command transaction"
    );
    let event_table = migration
        .split("CREATE TABLE IF NOT EXISTS wedding_celebrant_consultation_events")
        .nth(1)
        .unwrap_or("");
    assert!(!event_table.contains("phone_ciphertext"));
    assert!(!event_table.contains("verification_code"));
}

#[test]
fn public_page_explains_the_callback_boundary_and_has_no_account_gate() {
    let page = include_str!("../wedding/talk-to-a-celebrant.html");
    assert!(page.contains("Request a callback"));
    assert!(page.contains("not confirmation that the celebrant is free for your wedding date"));
    assert!(!page.contains("Create an account to continue"));
}

#[test]
fn policy_accepts_only_explicit_intents_topics_and_capacity() {
    assert_eq!(
        ConsultationIntent::parse("general_question")
            .unwrap()
            .as_str(),
        "general_question"
    );
    assert!(ConsultationIntent::parse("sales_call").is_none());
    assert!(valid_topic("paperwork"));
    assert!(!valid_topic("anything"));
    assert_eq!(
        normalize_phone("0412 345 678").as_deref(),
        Some("+61412345678")
    );
    let now = chrono::Utc::now();
    assert!(live_has_capacity(
        now,
        now + chrono::Duration::minutes(30),
        false,
        0,
        1,
        5
    ));
    assert!(!live_has_capacity(
        now,
        now + chrono::Duration::minutes(30),
        false,
        1,
        1,
        5
    ));
}

#[test]
fn request_lifecycle_supports_reassignment_expiry_and_couple_reschedule_choice() {
    let routes = include_str!("../src/server/wedding_celebrant_consultation_routes.rs");
    assert!(routes.contains("request_reassigned"));
    assert!(routes.contains("request_expired"));
    assert!(routes.contains("respond_to_reschedule_http"));
    assert!(routes.contains("reschedule_accepted"));
    assert!(routes.contains("reschedule_declined"));
    assert!(routes.contains("FOR UPDATE OF l SKIP LOCKED LIMIT 1"));
}
