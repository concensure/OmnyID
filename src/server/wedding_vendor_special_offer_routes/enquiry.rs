//! Couple-approved enquiry linkage for a top-three Limited Special.
//!
//! A pre-send recheck prevents stale package guidance from being relied on.
//! The post-send link accepts only a persisted AFP delivery receipt belonging
//! to the authenticated Wedding owner, and is replay-safe.

use super::*;

#[derive(Debug, Deserialize)]
pub(super) struct LinkSpecialEnquiryRequest {
    offer_id: String,
    slot_id: String,
    expected_slot_revision: u64,
    wedding_plan_id: String,
    enquiry_envelope_ref: String,
    idempotency_key: String,
}

#[derive(Debug, Deserialize)]
pub(super) struct RecheckSpecialEnquiryRequest {
    offer_id: String,
    slot_id: String,
    expected_slot_revision: u64,
}

#[derive(Debug, Deserialize)]
pub(super) struct SpecialDeliveryFailureRequest {
    offer_id: String,
    slot_id: String,
    idempotency_key: String,
    reason_code: String,
    wedding_plan_id: String,
}

pub(super) async fn record_special_delivery_failure_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<SpecialDeliveryFailureRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    if !discovery::rollout_allowed(&user.email) {
        return Err((
            StatusCode::NOT_FOUND,
            "Limited Specials are not available.".into(),
        ));
    }
    let offer_id = required(&request.offer_id, "offer_id", 80)?;
    let slot_id = required(&request.slot_id, "slot_id", 80)?;
    let dedupe = idempotency_key(&request.idempotency_key)?;
    let wedding_plan_id = required(&request.wedding_plan_id, "wedding_plan_id", 160)?;
    let reason_code = match request.reason_code.as_str() {
        "provider_rejected" | "provider_unavailable" | "network_error" => request.reason_code,
        _ => "provider_unavailable".into(),
    };
    let row = sqlx::query(
        "SELECT slot.vendor_id FROM wedding_vendor_special_offer_slots slot WHERE slot.slot_id=$1 AND slot.offer_id=$2",
    )
    .bind(&slot_id)
    .bind(&offer_id)
    .fetch_optional(&state.db.pool)
    .await
    .map_err(database_failure)?
    .ok_or((StatusCode::NOT_FOUND, "Limited Special not found.".into()))?;
    let vendor_id = row.get::<String, _>("vendor_id");
    let draft_exists = sqlx::query_scalar::<_, bool>(
        r#"SELECT EXISTS(
             SELECT 1 FROM afp_messages message
              WHERE message.owner_user_id=$1
                AND message.subtype='wedding_vendor_outreach_draft'
                AND COALESCE(message.metadata->>'wedding_plan_id',message.metadata->>'weddingPlanId',message.payload->'content'->>'wedding_plan_id')=$2
                AND message.payload->'content'->>'vendor_id'=$3
                AND message.payload->'content'->'limited_special'->>'offer_id'=$4
                AND message.payload->'content'->'limited_special'->>'slot_id'=$5
           )"#,
    )
    .bind(&user.id)
    .bind(&wedding_plan_id)
    .bind(&vendor_id)
    .bind(&offer_id)
    .bind(&slot_id)
    .fetch_one(&state.db.pool)
    .await
    .map_err(database_failure)?;
    if !draft_exists {
        return Err((
            StatusCode::CONFLICT,
            "No approved enquiry attempt was found.".into(),
        ));
    }
    let inserted = sqlx::query(
        r#"INSERT INTO wedding_vendor_special_offer_events
           (event_id,vendor_id,offer_id,slot_id,event_kind,actor_kind,actor_user_id,source_ref,dedupe_key,metadata)
           VALUES($1,$2,$3,$4,'delivery_failed','couple',$5,'approved_vendor_enquiry',$6,$7)
           ON CONFLICT(offer_id,event_kind,dedupe_key) DO NOTHING"#,
    )
    .bind(Ulid::new().to_string())
    .bind(vendor_id)
    .bind(&offer_id)
    .bind(&slot_id)
    .bind(&user.id)
    .bind(&dedupe)
    .bind(json!({"reason_code":reason_code,"event_version":WEDDING_VENDOR_SPECIAL_OFFER_EVENT_VERSION}))
    .execute(&state.db.pool)
    .await
    .map_err(database_failure)?
    .rows_affected();
    Ok(Json(json!({"status":"recorded","replayed":inserted == 0})))
}

pub(super) async fn recheck_special_enquiry_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<RecheckSpecialEnquiryRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    if !discovery::rollout_allowed(&user.email) {
        return Err((
            StatusCode::NOT_FOUND,
            "Limited Specials are not available.".into(),
        ));
    }
    let offer_id = required(&request.offer_id, "offer_id", 80)?;
    let slot_id = required(&request.slot_id, "slot_id", 80)?;
    let expected_revision = i64::try_from(request.expected_slot_revision).map_err(|_| {
        (
            StatusCode::BAD_REQUEST,
            "expected_slot_revision is invalid.".into(),
        )
    })?;
    let current_revision = sqlx::query_scalar::<_, i64>(
        r#"SELECT slot.revision
             FROM wedding_vendor_special_offer_slots slot
             JOIN wedding_vendor_special_offers offer ON offer.offer_id=slot.offer_id AND offer.vendor_id=slot.vendor_id
            WHERE slot.slot_id=$1 AND slot.offer_id=$2
              AND slot.state IN ('available','enquiry_received')
              AND slot.confirmation_expires_at>NOW()
              AND offer.publication_state='active'
              AND offer.approved_revision=offer.revision"#,
    )
    .bind(slot_id)
    .bind(offer_id)
    .fetch_optional(&state.db.pool)
    .await
    .map_err(database_failure)?
    .ok_or((
        StatusCode::CONFLICT,
        "This special is no longer available. Refresh before sending.".into(),
    ))?;
    if current_revision != expected_revision {
        return Err((
            StatusCode::CONFLICT,
            "This special changed after preview. Refresh it before sending.".into(),
        ));
    }
    Ok(Json(
        json!({"status":"current","slot_revision":current_revision}),
    ))
}

pub(super) async fn link_special_enquiry_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<LinkSpecialEnquiryRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    if !discovery::rollout_allowed(&user.email) {
        return Err((
            StatusCode::NOT_FOUND,
            "Limited Specials are not available.".into(),
        ));
    }
    enforce_rate_limit(
        &state,
        authenticated_rate_limit_key("wedding-special-enquiry-link", &headers),
        RateLimitPolicy {
            max_requests: 20,
            window: Duration::from_secs(60),
        },
    )
    .await?;
    let offer_id = required(&request.offer_id, "offer_id", 80)?;
    let slot_id = required(&request.slot_id, "slot_id", 80)?;
    let wedding_plan_id = required(&request.wedding_plan_id, "wedding_plan_id", 160)?;
    let enquiry_envelope_ref =
        required(&request.enquiry_envelope_ref, "enquiry_envelope_ref", 240)?;
    let idempotency_key = idempotency_key(&request.idempotency_key)?;
    let expected_revision = i64::try_from(request.expected_slot_revision).map_err(|_| {
        (
            StatusCode::BAD_REQUEST,
            "expected_slot_revision is invalid.".into(),
        )
    })?;

    let conversation_thread_id = sqlx::query_scalar::<_, String>(
        r#"SELECT message.thread_id FROM afp_messages message
              WHERE message.owner_user_id=$1
                AND message.subtype='wedding_vendor_outreach_sent'
                AND COALESCE(message.metadata->>'wedding_plan_id',message.metadata->>'weddingPlanId',message.payload->'content'->>'wedding_plan_id')=$2
                AND COALESCE(message.metadata->>'vendor_contact_receipt_ref',message.payload->'content'->>'client_message_id')=$3
                AND message.payload->'content'->'limited_special'->>'offer_id'=$4
                AND message.payload->'content'->'limited_special'->>'slot_id'=$5
                AND message.thread_id IS NOT NULL
              ORDER BY message.created_at DESC LIMIT 1"#,
    )
    .bind(&user.id)
    .bind(&wedding_plan_id)
    .bind(&enquiry_envelope_ref)
    .bind(&offer_id)
    .bind(&slot_id)
    .fetch_optional(&state.db.pool)
    .await
    .map_err(database_failure)?
    .ok_or((
        StatusCode::CONFLICT,
        "The approved enquiry receipt is not available yet.".into(),
    ))?;

    let mut tx = state.db.pool.begin().await.map_err(database_failure)?;
    if let Some(existing) = sqlx::query(
        "SELECT offer_id,slot_id,wedding_plan_id,enquiry_envelope_ref FROM wedding_vendor_special_offer_enquiries WHERE owner_user_id=$1 AND idempotency_key=$2",
    )
    .bind(&user.id)
    .bind(&idempotency_key)
    .fetch_optional(&mut *tx)
    .await
    .map_err(database_failure)?
    {
        let same = existing.get::<String, _>("offer_id") == offer_id
            && existing.get::<String, _>("slot_id") == slot_id
            && existing.get::<String, _>("wedding_plan_id") == wedding_plan_id
            && existing.get::<String, _>("enquiry_envelope_ref") == enquiry_envelope_ref;
        tx.rollback().await.ok();
        return if same {
            Ok(Json(json!({"status":"linked","replayed":true})))
        } else {
            Err((
                StatusCode::CONFLICT,
                "That enquiry key is already in use.".into(),
            ))
        };
    }

    let row = sqlx::query(
        r#"SELECT slot.vendor_id,slot.revision
             FROM wedding_vendor_special_offer_slots slot
             JOIN wedding_vendor_special_offers offer ON offer.offer_id=slot.offer_id AND offer.vendor_id=slot.vendor_id
            WHERE slot.slot_id=$1 AND slot.offer_id=$2
              AND slot.state IN ('available','enquiry_received')
              AND slot.confirmation_expires_at>NOW()
              AND offer.publication_state='active'
              AND offer.approved_revision=offer.revision
            FOR UPDATE OF slot"#,
    )
    .bind(&slot_id)
    .bind(&offer_id)
    .fetch_optional(&mut *tx)
    .await
    .map_err(database_failure)?
    .ok_or((
        StatusCode::CONFLICT,
        "This special is no longer available. Refresh before sending another enquiry.".into(),
    ))?;
    let current_revision = row.get::<i64, _>("revision");
    if current_revision != expected_revision {
        tx.rollback().await.ok();
        return Err((
            StatusCode::CONFLICT,
            "This special changed after preview. Refresh it before sending.".into(),
        ));
    }
    let vendor_id = row.get::<String, _>("vendor_id");
    let link_id = Ulid::new().to_string();
    sqlx::query(
        r#"INSERT INTO wedding_vendor_special_offer_enquiries
           (link_id,offer_id,slot_id,owner_user_id,wedding_plan_id,enquiry_envelope_ref,idempotency_key,slot_revision,conversation_thread_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)"#,
    )
    .bind(&link_id)
    .bind(&offer_id)
    .bind(&slot_id)
    .bind(&user.id)
    .bind(&wedding_plan_id)
    .bind(&enquiry_envelope_ref)
    .bind(&idempotency_key)
    .bind(current_revision)
    .bind(&conversation_thread_id)
    .execute(&mut *tx)
    .await
    .map_err(database_failure)?;
    sqlx::query(
        "UPDATE wedding_vendor_special_offer_slots SET state='enquiry_received',revision=revision+1,updated_at=NOW() WHERE slot_id=$1 AND offer_id=$2",
    )
    .bind(&slot_id)
    .bind(&offer_id)
    .execute(&mut *tx)
    .await
    .map_err(database_failure)?;
    record_event(
        &mut tx,
        &vendor_id,
        &offer_id,
        Some(&slot_id),
        "enquiry_received",
        CommandActor::couple(&user.id),
        &idempotency_key,
        json!({"link_id":link_id,"slot_revision":current_revision}),
    )
    .await?;
    tx.commit().await.map_err(database_failure)?;
    Ok(Json(
        json!({"status":"linked","link_id":link_id,"replayed":false}),
    ))
}
