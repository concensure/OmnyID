//! Shared state-changing services for both claimed-vendor and capability routes.

use super::*;

pub(super) async fn publish_offer(
    state: &AppState,
    vendor_id: &str,
    offer_id: &str,
    expected_revision: u64,
    raw_dedupe: &str,
    actor: CommandActor<'_>,
) -> Result<Value, (StatusCode, String)> {
    let dedupe = idempotency_key(raw_dedupe)?;
    let mut tx = state.db.pool.begin().await.map_err(database_failure)?;
    if event_exists(&mut tx, offer_id, "published", &dedupe).await? {
        tx.rollback().await.ok();
        return Ok(json!({"offer_id":offer_id,"status":"active","replayed":true}));
    }
    let offer_row = locked_offer(&mut tx, vendor_id, offer_id).await?;
    let actual_revision: i64 = offer_row.get("revision");
    if actual_revision != expected_revision as i64 {
        return Err(policy_failure(SpecialOfferPolicyError::StaleRevision {
            expected: expected_revision,
            actual: actual_revision as u64,
        }));
    }
    let slot_rows = sqlx::query(
        "SELECT * FROM wedding_vendor_special_offer_slots WHERE offer_id=$1 AND vendor_id=$2 ORDER BY local_date FOR UPDATE",
    )
    .bind(offer_id)
    .bind(vendor_id)
    .fetch_all(&mut *tx)
    .await
    .map_err(database_failure)?;
    let mut offer = offer_from_row(&offer_row)?;
    offer.publication_state = SpecialOfferPublicationState::Active;
    offer.approved_revision = Some(offer.revision);
    let slots = slot_rows
        .iter()
        .map(slot_from_row)
        .collect::<Result<Vec<_>, _>>()?;
    validate_offer_for_publication(&offer, &slots, Utc::now()).map_err(policy_failure)?;
    for slot in &slots {
        approved_date_price_estimate(
            &offer.pricing,
            &slot.commercial_terms,
            offer.guest_min.or(Some(1)),
        )
        .map_err(policy_failure)?;
    }
    sqlx::query(
        "UPDATE wedding_vendor_special_offers SET publication_state='active',approved_by_user_id=$1,approved_at=NOW(),approved_revision=revision,updated_at=NOW() WHERE offer_id=$2 AND vendor_id=$3 AND revision=$4",
    )
    .bind(actor.user_id)
    .bind(offer_id)
    .bind(vendor_id)
    .bind(actual_revision)
    .execute(&mut *tx)
    .await
    .map_err(database_failure)?;
    record_event(
        &mut tx,
        vendor_id,
        offer_id,
        None,
        "published",
        actor,
        &dedupe,
        json!({"revision":actual_revision}),
    )
    .await?;
    tx.commit().await.map_err(database_failure)?;
    Ok(json!({"offer_id":offer_id,"status":"active","replayed":false}))
}

pub(super) async fn change_offer_state(
    state: &AppState,
    vendor_id: &str,
    offer_id: &str,
    expected_revision: u64,
    action: OfferAction,
    raw_dedupe: &str,
    actor: CommandActor<'_>,
) -> Result<Value, (StatusCode, String)> {
    let (state_name, event_kind) = match action {
        OfferAction::Pause => ("paused", "paused"),
        OfferAction::Withdraw => ("withdrawn", "withdrawn"),
        OfferAction::Reconfirm => ("active", "reconfirmed"),
    };
    let dedupe = idempotency_key(raw_dedupe)?;
    let mut tx = state.db.pool.begin().await.map_err(database_failure)?;
    if event_exists(&mut tx, offer_id, event_kind, &dedupe).await? {
        tx.rollback().await.ok();
        return Ok(json!({"offer_id":offer_id,"status":state_name,"replayed":true}));
    }
    let offer = locked_offer(&mut tx, vendor_id, offer_id).await?;
    let revision: i64 = offer.get("revision");
    if revision != expected_revision as i64 {
        return Err(policy_failure(SpecialOfferPolicyError::StaleRevision {
            expected: expected_revision,
            actual: revision as u64,
        }));
    }
    let current_state: String = offer.get("publication_state");
    let transition_allowed = match action {
        OfferAction::Pause => current_state == "active",
        OfferAction::Withdraw => current_state != "withdrawn" && current_state != "expired",
        OfferAction::Reconfirm => matches!(current_state.as_str(), "active" | "paused"),
    };
    if !transition_allowed {
        return Err((
            StatusCode::CONFLICT,
            "That offer state cannot use this action.".into(),
        ));
    }
    let next_revision = revision + 1;
    let approved_revision = (state_name == "active").then_some(next_revision);
    sqlx::query(
        "UPDATE wedding_vendor_special_offers SET publication_state=$1,revision=$2,approved_revision=$3,approved_by_user_id=CASE WHEN $1='active' THEN $4 ELSE approved_by_user_id END,approved_at=CASE WHEN $1='active' THEN NOW() ELSE approved_at END,updated_at=NOW() WHERE offer_id=$5 AND vendor_id=$6 AND revision=$7",
    )
    .bind(state_name)
    .bind(next_revision)
    .bind(approved_revision)
    .bind(actor.user_id)
    .bind(offer_id)
    .bind(vendor_id)
    .bind(revision)
    .execute(&mut *tx)
    .await
    .map_err(database_failure)?;
    mutate_offer_slots(&mut tx, vendor_id, offer_id, action, actor.user_id).await?;
    record_event(
        &mut tx,
        vendor_id,
        offer_id,
        None,
        event_kind,
        actor,
        &dedupe,
        json!({"revision":next_revision}),
    )
    .await?;
    tx.commit().await.map_err(database_failure)?;
    Ok(json!({
        "offer_id":offer_id,"status":state_name,"revision":next_revision,"replayed":false
    }))
}

async fn mutate_offer_slots(
    tx: &mut Transaction<'_, Postgres>,
    vendor_id: &str,
    offer_id: &str,
    action: OfferAction,
    user_id: Option<&str>,
) -> Result<(), (StatusCode, String)> {
    let query = match action {
        OfferAction::Pause => {
            "UPDATE wedding_vendor_special_offer_slots SET state='paused',revision=revision+1,updated_by_user_id=$1,updated_at=NOW() WHERE offer_id=$2 AND vendor_id=$3 AND state IN ('available','enquiry_received','stale')"
        }
        OfferAction::Withdraw => {
            let active_holds = sqlx::query_scalar::<_, i64>(
                "SELECT COUNT(*) FROM wedding_vendor_special_offer_slots WHERE offer_id=$1 AND vendor_id=$2 AND state='provisional_hold' AND hold_expires_at>NOW()",
            )
            .bind(offer_id)
            .bind(vendor_id)
            .fetch_one(&mut **tx)
            .await
            .map_err(database_failure)?;
            if active_holds > 0 {
                return Err((
                    StatusCode::CONFLICT,
                    "Resolve the active provisional hold before withdrawing this offer.".into(),
                ));
            }
            "UPDATE wedding_vendor_special_offer_slots SET state='withdrawn',hold_expires_at=NULL,revision=revision+1,updated_by_user_id=$1,updated_at=NOW() WHERE offer_id=$2 AND vendor_id=$3 AND state NOT IN ('booked','provisional_hold')"
        }
        OfferAction::Reconfirm => {
            "UPDATE wedding_vendor_special_offer_slots SET state='available',hold_expires_at=NULL,last_confirmed_at=NOW(),confirmation_expires_at=NOW()+INTERVAL '14 days',revision=revision+1,updated_by_user_id=$1,updated_at=NOW() WHERE offer_id=$2 AND vendor_id=$3 AND state IN ('available','enquiry_received','paused','stale')"
        }
    };
    sqlx::query(query)
        .bind(user_id)
        .bind(offer_id)
        .bind(vendor_id)
        .execute(&mut **tx)
        .await
        .map_err(database_failure)?;
    Ok(())
}

pub(super) async fn change_slot_state(
    state: &AppState,
    vendor_id: &str,
    offer_id: &str,
    slot_id: &str,
    request: &SlotCommandRequest,
    actor: CommandActor<'_>,
) -> Result<Value, (StatusCode, String)> {
    let (command, event_kind) = slot_command(request)?;
    let dedupe = idempotency_key(&request.idempotency_key)?;
    let mut tx = state.db.pool.begin().await.map_err(database_failure)?;
    if event_exists(&mut tx, offer_id, event_kind, &dedupe).await? {
        tx.rollback().await.ok();
        return Ok(json!({"offer_id":offer_id,"slot_id":slot_id,"replayed":true}));
    }
    locked_offer(&mut tx, vendor_id, offer_id).await?;
    let row = sqlx::query(
        "SELECT * FROM wedding_vendor_special_offer_slots WHERE slot_id=$1 AND offer_id=$2 AND vendor_id=$3 FOR UPDATE",
    )
    .bind(slot_id)
    .bind(offer_id)
    .bind(vendor_id)
    .fetch_optional(&mut *tx)
    .await
    .map_err(database_failure)?
    .ok_or((StatusCode::NOT_FOUND, "Available date not found.".into()))?;
    let slot = slot_from_row(&row)?;
    let next = apply_special_slot_command(&slot, request.expected_revision, command, Utc::now())
        .map_err(policy_failure)?;
    sqlx::query(
        "UPDATE wedding_vendor_special_offer_slots SET state=$1,hold_expires_at=$2,last_confirmed_at=$3,confirmation_expires_at=$4,revision=$5,updated_by_user_id=$6,updated_at=NOW() WHERE slot_id=$7 AND offer_id=$8 AND vendor_id=$9 AND revision=$10",
    )
    .bind(slot_state_name(next.state))
    .bind(next.hold_expires_at)
    .bind(next.last_confirmed_at)
    .bind(next.confirmation_expires_at)
    .bind(next.revision as i64)
    .bind(actor.user_id)
    .bind(slot_id)
    .bind(offer_id)
    .bind(vendor_id)
    .bind(request.expected_revision as i64)
    .execute(&mut *tx)
    .await
    .map_err(database_failure)?;
    record_event(
        &mut tx,
        vendor_id,
        offer_id,
        Some(slot_id),
        event_kind,
        actor,
        &dedupe,
        json!({"revision":next.revision}),
    )
    .await?;
    tx.commit().await.map_err(database_failure)?;
    Ok(json!({
        "offer_id":offer_id,"slot_id":slot_id,"state":slot_state_name(next.state),
        "revision":next.revision,"replayed":false
    }))
}
