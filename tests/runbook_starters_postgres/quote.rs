use super::*;

#[tokio::test]
async fn received_quote_reuses_frozen_normalisation_and_only_emits_review() {
    let db = database().await;
    let owner = user(&db).await;
    let foreign = user(&db).await;
    let store = RunbookStore::new(&db, [21; 32], [22; 32]);
    let runtime = RunbookRuntime::new(&store);
    let quote: Value = serde_json::from_str(include_str!("../runbook_quote_fixture.json")).unwrap();
    let reference = message(&db, &owner.id, json!({"quotation":quote})).await;
    let id = start(
        &db,
        &owner.id,
        "vendor_quote_received",
        json!({
            "normalised_quote_ref":reference,"wedding_date":"2027-05-01","source_refs":[reference]
        }),
    )
    .await;
    let review = runtime
        .execute_transform(&owner.id, &id, "assess", 3)
        .await
        .unwrap();
    assert_eq!(review.result.conclusions["quotation_ref"], reference);
    assert_eq!(
        review.result.conclusions["version_id"],
        quote["identity"]["version_id"]
    );
    for key in [
        "booking_authorized",
        "payment_authorized",
        "availability_confirmed",
    ] {
        assert_eq!(review.result.conclusions[key], false);
    }
    assert!(review.trace.provenance_ref.is_some());
    assert!(
        runtime
            .execute_transform(&foreign.id, &id, "assess", 3)
            .await
            .is_err()
    );
    // Later source changes cannot substitute a second normalisation for the
    // snapshot already read by this instance.
    sqlx::query("UPDATE afp_messages SET payload=jsonb_set(payload,'{content,quotation}','{}'::jsonb) WHERE owner_user_id=$1 AND id=$2")
        .bind(&owner.id).bind(reference.strip_prefix("message:").unwrap()).execute(&db.pool).await.unwrap();
    assert_eq!(
        runtime
            .execute_transform(&owner.id, &id, "assess", 3)
            .await
            .unwrap(),
        review
    );
    let emitted = runtime
        .emit_review(&owner.id, &id, "surface", 4)
        .await
        .unwrap();
    assert!(emitted.approval_ref.is_none());
    assert!(emitted.trace.provenance_ref.is_some());
    assert_eq!(
        runtime
            .emit_review(&owner.id, &id, "surface", 4)
            .await
            .unwrap(),
        emitted
    );
    assert_eq!(
        runtime.complete(&owner.id, &id, 5).await.unwrap().status,
        TraceStatus::Completed
    );
    // Reviewing a saved quote never creates booking/action approval authority.
    assert!(
        runtime
            .request_review(&owner.id, &id, "review_consequence", 6)
            .await
            .is_err()
    );
    erase(&db, &owner).await;
    erase(&db, &foreign).await;
}
