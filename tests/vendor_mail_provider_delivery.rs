//! Disposable-Postgres proof for provider bounce/complaint retry suppression.

use omnyid_homeserver::{
    db::Db,
    gateway::vendor_mail_provider::{
        CloudflareSuppressionRecord, cloudflare_recipient_is_suppressed,
        record_cloudflare_suppression,
    },
};

fn test_db_url() -> Option<String> {
    std::env::var("TEST_DATABASE_URL")
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .inspect(|value| {
            assert!(
                value.contains("@127.0.0.1:") && value.ends_with("/omnyid_test"),
                "provider delivery tests require disposable local omnyid_test",
            );
        })
}

#[tokio::test]
async fn complaint_is_idempotent_hashed_and_blocks_automatic_retry() {
    let Some(db_url) = test_db_url() else { return };
    let db = Db::new(&db_url).await.expect("database");
    let record = CloudflareSuppressionRecord {
        id: format!("provider-record-{}", ulid::Ulid::new()),
        email: format!("controlled-{}@example.test", ulid::Ulid::new()),
        reason: "complaint".to_string(),
        expires_at: None,
    };

    assert!(
        record_cloudflare_suppression(&db, &record)
            .await
            .expect("first record")
    );
    assert!(
        !record_cloudflare_suppression(&db, &record)
            .await
            .expect("exact retry")
    );
    assert!(
        cloudflare_recipient_is_suppressed(&db, &record.email)
            .await
            .expect("suppression lookup")
    );

    let row = sqlx::query(
        "SELECT recipient_digest, provider_record_digest, reason FROM wedding_vendor_email_delivery_suppressions WHERE provider = 'cloudflare_email_sending' AND reason = 'complaint' ORDER BY recorded_at DESC LIMIT 1",
    )
    .fetch_one(&db.pool)
    .await
    .expect("suppression row");
    use sqlx::Row as _;
    let recipient_digest: String = row.get("recipient_digest");
    let provider_record_digest: String = row.get("provider_record_digest");
    assert_eq!(recipient_digest.len(), 64);
    assert_eq!(provider_record_digest.len(), 64);
    assert_ne!(recipient_digest, record.email);
    assert_ne!(provider_record_digest, record.id);

    let event_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM wedding_vendor_email_provider_events WHERE provider = 'cloudflare_email_sending' AND provider_event_id = $1 AND event_kind = 'complained' AND processing_status = 'completed'",
    )
    .bind(format!("suppression:{provider_record_digest}"))
    .fetch_one(&db.pool)
    .await
    .expect("provider event count");
    assert_eq!(event_count, 1);
}
