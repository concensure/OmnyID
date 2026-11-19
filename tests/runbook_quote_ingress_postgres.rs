//! Canonical HTTP persistence -> gated reference event -> bounded review.
use axum::{
    body::Body,
    http::{Request, StatusCode},
};
use chrono::{Duration, SecondsFormat, Utc};
use http_body_util::BodyExt;
use omnyid_homeserver::{
    db::{AuthSessionRecord, Db, UserRecord},
    runbook_contract::*,
    runbook_evidence::EvidenceRequest,
    runbook_hooks::bridge_normalised_quote,
    runbook_input::InputSupplied,
    runbook_read::ReadRequest,
    runbook_runtime::RunbookRuntime,
    runbook_starter_pack::starter_definitions,
    runbook_store::RunbookStore,
};
use serde_json::{Value, json};
use tower::ServiceExt;
use ulid::Ulid;

async fn user(db: &Db) -> (UserRecord, String) {
    let id = Ulid::new().to_string();
    let user = UserRecord {
        id: id.clone(),
        email: format!("quote-ingress-{id}@omnyid.test"),
        password_hash: Some("test".into()),
        auth_provider: "password".into(),
        google_sub: None,
        display_name: "Quote ingress".into(),
        created_at: Utc::now().to_rfc3339(),
    };
    db.create_user(&user).await.unwrap();
    let token = Ulid::new().to_string();
    db.create_session(&AuthSessionRecord {
        token: token.clone(),
        user_id: id,
        created_at: Utc::now().to_rfc3339(),
        expires_at: (Utc::now() + Duration::hours(1)).to_rfc3339(),
    })
    .await
    .unwrap();
    (user, token)
}
async fn post(app: &axum::Router, token: &str, body: &Value) -> (StatusCode, Value) {
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/quotation/normalisations")
                .header("authorization", format!("Bearer {token}"))
                .header("content-type", "application/json")
                .body(Body::from(body.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();
    let status = response.status();
    let bytes = response.into_body().collect().await.unwrap().to_bytes();
    (
        status,
        serde_json::from_slice(&bytes).unwrap_or_else(|_| json!(String::from_utf8_lossy(&bytes))),
    )
}

#[tokio::test]
async fn canonical_http_replay_private_evidence_and_missing_date_preserve_booking_boundary() {
    let url = std::env::var("TEST_DATABASE_URL").expect("disposable database required");
    assert!(url.contains("@127.0.0.1:") && url.ends_with("/omnyid_test"));
    let db = Db::new(&url).await.unwrap();
    let (owner, token) = user(&db).await;
    let (other, other_token) = user(&db).await;
    let table = format!("\"user_{}\".messages", owner.id.to_lowercase());
    sqlx::query(&format!("INSERT INTO {table} (id,thread_id,from_agent,to_agents,timestamp,type,content,signature) VALUES ('source-one','quote-thread',$1,$2,NOW(),'document',$3,'')"))
        .bind(&owner.id).bind(json!([owner.id])).bind(json!({"body":"private vendor source"})).execute(&db.pool).await.unwrap();
    let store = RunbookStore::new(&db, [21; 32], [22; 32]);
    let runtime = RunbookRuntime::new(&store);
    let mut definition = starter_definitions()
        .into_iter()
        .find(|d| d.runbook_id == "vendor_quote_received")
        .unwrap();
    definition.enabled = true;
    store.save(&owner.id, None, definition).await.unwrap();
    // This binary has one test: environment configuration cannot race another test.
    unsafe {
        std::env::set_var("OMNYID_ENCRYPTION_KEY_HEX", hex::encode([21; 32]));
        std::env::set_var("OMNYID_SIGNING_KEY_HEX", hex::encode([22; 32]));
        std::env::set_var("OMNYID_RUNBOOK_ALLOWLIST", &owner.id);
        std::env::remove_var("OMNYID_RUNBOOK_EVENT_HOOKS_ENABLED");
    }
    let app = omnyid_homeserver::server::build_test_router(&url).await;
    let quotation: Value =
        serde_json::from_str(include_str!("runbook_quote_fixture.json")).unwrap();
    let request = json!({"thread_id":"quote-thread","quotation":quotation});
    assert_eq!(
        post(&app, &other_token, &request).await.0,
        StatusCode::NOT_FOUND
    );
    let (status, saved) = post(&app, &token, &request).await;
    assert_eq!(status, StatusCode::OK, "{saved}");
    let quote_id = saved["message_ids"][0].as_str().unwrap();
    let event_count = || {
        sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM afp_messages WHERE owner_user_id=$1 AND payload->'content'->>'event_type'='wedding_vendor_quote_received'").bind(&owner.id).fetch_one(&db.pool)
    };
    assert_eq!(event_count().await.unwrap(), 0);
    unsafe {
        std::env::set_var("OMNYID_RUNBOOK_EVENT_HOOKS_ENABLED", "true");
    }
    assert_eq!(
        post(&app, &token, &request).await,
        (StatusCode::OK, saved.clone())
    );
    assert_eq!(
        post(&app, &token, &request).await,
        (StatusCode::OK, saved.clone())
    );
    assert_eq!(event_count().await.unwrap(), 1);
    let event: Value = sqlx::query_scalar("SELECT payload FROM afp_messages WHERE owner_user_id=$1 AND payload->'content'->>'event_type'='wedding_vendor_quote_received'")
        .bind(&owner.id).fetch_one(&db.pool).await.unwrap();
    assert!(!event.to_string().contains("private vendor source"));
    assert!(event["content"].get("quotation").is_none());
    assert!(event["content"].get("wedding_date").is_none());
    let receipt = runtime
        .dispatch(&owner.id, event["id"].as_str().unwrap())
        .await
        .unwrap();
    assert_eq!(receipt.instance_ids.len(), 1);
    let id = &receipt.instance_ids[0];
    assert_eq!(
        runtime
            .instance(&owner.id, id)
            .await
            .unwrap()
            .instance
            .status,
        InstanceState::Matched
    );
    assert!(
        runtime
            .dispatch(&other.id, event["id"].as_str().unwrap())
            .await
            .is_err()
    );
    unsafe {
        std::env::set_var(
            "OMNYID_RUNBOOK_ALLOWLIST",
            format!("{},{}", owner.id, other.id),
        );
    }
    assert!(
        bridge_normalised_quote(&db, &other.id, quote_id)
            .await
            .is_err()
    );

    // Exercise the encrypted form of that same canonical record. It remains an
    // explicit, budgeted reference, and needs no forged urgency metadata.
    let timestamp = Utc::now().to_rfc3339_opts(SecondsFormat::Micros, true);
    let metadata: Value = sqlx::query_scalar(&format!("SELECT metadata FROM {table} WHERE id=$1"))
        .bind(quote_id)
        .fetch_one(&db.pool)
        .await
        .unwrap();
    let aad = json!({"protocol":"afp-v1","id":quote_id,"thread_id":"quote-thread","parent_id":"",
        "from":owner.id,"to":["agent://quotation-intelligence"],"timestamp":timestamp,"type":"ledger",
        "subtype":"quotation_normalisation_confirmed","metadata":metadata});
    let encryption = omnyid_homeserver::crypto::encrypt_content(
        &json!({"quotation":quotation}),
        &aad,
        &[21; 32],
    );
    sqlx::query(&format!(
        "UPDATE {table} SET content='{{}}', encryption=$2, timestamp=$3::timestamptz WHERE id=$1"
    ))
    .bind(quote_id)
    .bind(encryption)
    .bind(&timestamp)
    .execute(&db.pool)
    .await
    .unwrap();
    let mut evidence = EvidenceRequest {
        refs: vec![format!("private_message:{quote_id}")],
        required_fields: vec![],
        evidence_limit: 1,
        decrypt_limit: 0,
        byte_limit: 65536,
    };
    assert_eq!(
        store
            .resolve_evidence(&owner.id, &evidence)
            .await
            .unwrap()
            .omitted[0]
            .reason,
        "decrypt_budget"
    );
    evidence.decrypt_limit = 1;
    assert_eq!(
        store
            .resolve_evidence(&owner.id, &evidence)
            .await
            .unwrap()
            .included[0]
            .content["quotation"],
        quotation
    );
    runtime.start(&owner.id, id, 1).await.unwrap();
    let read = runtime
        .execute_read(
            &owner.id,
            id,
            &ReadRequest {
                step_id: "read".into(),
                expected_revision: 2,
                snapshot_ref: None,
                decrypt_limit: 2,
                byte_limit: 262144,
            },
        )
        .await
        .unwrap();
    assert!(
        read.packet
            .included
            .iter()
            .any(|item| item.reference == format!("private_message:{quote_id}"))
    );
    assert_eq!(
        runtime
            .execute_transform(&owner.id, id, "assess", 3)
            .await
            .unwrap_err(),
        "missing_required_fact"
    );
    let question = runtime
        .request_missing_input(
            &owner.id,
            id,
            3,
            AnswerSchema::Date,
            Utc::now() + Duration::hours(1),
        )
        .await
        .unwrap()
        .unwrap();
    assert_eq!(question.missing_fields, vec!["wedding_date"]);
    runtime
        .supply_input(
            &owner.id,
            &InputSupplied {
                event_id: Ulid::new().to_string(),
                instance_id: id.clone(),
                escalation_id: question.escalation_id,
                answers: [("wedding_date".into(), json!("2027-05-01"))].into(),
            },
            4,
        )
        .await
        .unwrap();
    let review = runtime
        .execute_transform(&owner.id, id, "assess", 5)
        .await
        .unwrap();
    for key in [
        "booking_authorized",
        "payment_authorized",
        "availability_confirmed",
    ] {
        assert_eq!(review.result.conclusions[key], false);
    }
    let emitted = runtime
        .emit_review(&owner.id, id, "surface", 6)
        .await
        .unwrap();
    assert!(emitted.approval_ref.is_none());
    runtime.complete(&owner.id, id, 7).await.unwrap();
    assert_eq!(event_count().await.unwrap(), 1);
    let count: i64 = sqlx::query_scalar(&format!(
        "SELECT COUNT(*) FROM {table} WHERE kind='quotation_normalisation_confirmed'"
    ))
    .fetch_one(&db.pool)
    .await
    .unwrap();
    assert_eq!(count, 1);
    db.delete_user_account_and_data(&owner.id, &owner.email, &[])
        .await
        .unwrap();
    db.delete_user_account_and_data(&other.id, &other.email, &[])
        .await
        .unwrap();
}
