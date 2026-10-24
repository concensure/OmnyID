//! Ciphertext-store, replay, key-continuity, and tenant-bound persistence evidence.

use chrono::{Duration, Utc};
use omnyid_homeserver::{
    db::{Db, UserRecord, VendorTransportStoreOutcome, VendorTransportWrite},
    quotation::vendor_transport_receipt,
};
use serde_json::json;
use ulid::Ulid;

#[test]
fn transport_boundary_has_no_plaintext_columns_or_request_logging() {
    let migration =
        include_str!("../postgres/migrations/0114_quotation_vendor_response_transport.sql");
    let routes = include_str!("../src/server/quotation_vendor_response_routes.rs");
    let persistence = include_str!("../src/db/quotation_vendor_responses.rs");
    assert!(migration.contains("wedding_enquiry_envelopes"));
    assert!(!migration.contains("response_body TEXT"));
    assert!(!migration.contains("projection JSONB"));
    for source in [routes, persistence] {
        assert!(!source.contains("tracing::"));
        assert!(!source.contains("#[instrument"));
        assert!(!source.contains("println!"));
        assert!(!source.contains("dbg!"));
    }
    assert!(routes.contains("validate_claimed_vendor_response"));
    assert!(routes.contains("claimed_vendor_invitation"));
    assert!(routes.contains("/quotation/vendor-transactions/responses/converge"));
    assert!(routes.contains("reconcile_verified_afp_response"));
    assert!(persistence.contains("vendor_response_transport_for_owner"));
    assert!(persistence.contains("t.owner_user_id = $1"));
    assert!(!routes.contains("vendor_subscriptions"));
}

fn test_db_url() -> Option<String> {
    std::env::var("TEST_DATABASE_URL")
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .inspect(|value| {
            assert!(
                value.contains("@127.0.0.1:") && value.ends_with("/omnyid_test"),
                "vendor transport tests require disposable local omnyid_test"
            );
        })
}

async fn user(db: &Db, label: &str) -> UserRecord {
    let suffix = Ulid::new().to_string().to_lowercase();
    let user = UserRecord {
        id: Ulid::new().to_string(),
        email: format!("vendor-transport-{label}-{suffix}@omnyid.test"),
        password_hash: Some("integration-test".to_string()),
        auth_provider: "password".to_string(),
        google_sub: None,
        display_name: format!("Vendor transport {label}"),
        created_at: Utc::now().to_rfc3339(),
    };
    db.create_user(&user).await.expect("create user");
    user
}

#[tokio::test]
async fn persistence_is_ciphertext_only_idor_safe_replay_safe_and_key_bound() {
    let Some(db_url) = test_db_url() else {
        return;
    };
    let db = Db::new(&db_url).await.expect("database");
    let owner = user(&db, "owner").await;
    let vendor_user = user(&db, "vendor").await;
    let other_user = user(&db, "other").await;
    let suffix = Ulid::new().to_string().to_lowercase();
    let vendor_id = format!("transport-vendor-{suffix}");
    let agent_id = format!("agent:transport-{suffix}@omnyid.test");
    sqlx::query(
        r#"INSERT INTO wedding_vendors
            (vendor_id, vendor_slug, vendor_name, category, service_area, status,
             claim_status, claimed_by_user_id)
           VALUES ($1,$2,'Transport vendor','venue','Sydney','active','verified',$3)"#,
    )
    .bind(&vendor_id)
    .bind(format!("transport-{suffix}"))
    .bind(&vendor_user.id)
    .execute(&db.pool)
    .await
    .expect("vendor");
    sqlx::query(
        r#"INSERT INTO managed_agents (id, owner_user_id, agent_id, label, email, kind)
           VALUES ($1,$2,$3,'Transport agent',$4,'wedding_vendor')"#,
    )
    .bind(Ulid::new().to_string())
    .bind(&vendor_user.id)
    .bind(&agent_id)
    .bind(&vendor_user.email)
    .execute(&db.pool)
    .await
    .expect("agent");
    sqlx::query(
        r#"INSERT INTO wedding_vendor_agent_links
            (vendor_id, agent_id, agent_card, card_verified_at)
           VALUES ($1,$2,$3,NOW())"#,
    )
    .bind(&vendor_id)
    .bind(&agent_id)
    .bind(json!({"key_id":"current-key"}))
    .execute(&db.pool)
    .await
    .expect("agent link");

    let message_id = Ulid::new().to_string();
    let request_id = format!("request-{suffix}");
    let request_digest = "a".repeat(64);
    let envelope = br#"{"content":null,"encryption":{"ciphertext":"opaque"}}"#.to_vec();
    let write = VendorTransportWrite {
        owner_user_id: owner.id.clone(),
        vendor_id: vendor_id.clone(),
        message_id: message_id.clone(),
        thread_id: format!("thread-{suffix}"),
        from_agent_id: format!("agent:couple-{suffix}@omnyid.test"),
        to_agent_id: agent_id.clone(),
        direction: "to_vendor".to_string(),
        afp_type: "wedding_enquiry".to_string(),
        envelope: envelope.clone(),
        expires_at: Utc::now() + Duration::hours(1),
        grant_message_id: format!("grant-message-{suffix}"),
        grant_id: format!("grant-{suffix}"),
        quotation_id: format!("quote-{suffix}"),
        quotation_version_id: format!("quote-{suffix}-v1"),
        projection_fingerprint: "b".repeat(64),
        response_id: None,
        response_fingerprint: None,
        transport_nonce: format!("nonce-{suffix}"),
        agent_card_key_id: "current-key".to_string(),
        request_id: request_id.clone(),
        request_digest: request_digest.clone(),
        sender_identity_id: None,
        sender_identity_kind: None,
    };
    let receipt = vendor_transport_receipt(
        &vendor_id,
        &request_id,
        &request_digest,
        Ok(&message_id),
        Utc::now(),
    );
    assert!(matches!(
        db.store_vendor_transport(&write, &receipt)
            .await
            .expect("store"),
        VendorTransportStoreOutcome::Stored(_)
    ));
    assert!(matches!(
        db.store_vendor_transport(&write, &receipt)
            .await
            .expect("retry"),
        VendorTransportStoreOutcome::Retry(_)
    ));
    let raw: Vec<u8> =
        sqlx::query_scalar("SELECT envelope FROM wedding_enquiry_envelopes WHERE message_id = $1")
            .bind(&message_id)
            .fetch_one(&db.pool)
            .await
            .expect("stored envelope");
    assert_eq!(raw, envelope);
    assert!(!String::from_utf8_lossy(&raw).contains("price"));
    assert_eq!(
        db.vendor_transport_inbox(&vendor_user.id)
            .await
            .unwrap()
            .len(),
        1
    );
    assert!(
        db.vendor_transport_inbox(&other_user.id)
            .await
            .unwrap()
            .is_empty()
    );

    sqlx::query("UPDATE wedding_vendor_agent_links SET agent_card = $1 WHERE vendor_id = $2")
        .bind(json!({"key_id":"rotated-key"}))
        .bind(&vendor_id)
        .execute(&db.pool)
        .await
        .unwrap();
    assert!(
        db.vendor_transport_inbox(&vendor_user.id)
            .await
            .unwrap()
            .is_empty()
    );
    sqlx::query("UPDATE wedding_vendors SET claim_status = 'disputed' WHERE vendor_id = $1")
        .bind(&vendor_id)
        .execute(&db.pool)
        .await
        .unwrap();
    assert!(
        db.vendor_transport_inbox(&vendor_user.id)
            .await
            .unwrap()
            .is_empty()
    );
}
