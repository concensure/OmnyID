use std::{collections::BTreeMap, sync::Arc};

use axum::{
    Json, Router,
    extract::{Query, State},
    http::{HeaderMap, StatusCode},
    routing::{get, post},
};
use chrono::{DateTime, Duration, NaiveDate, Utc};
use serde::Deserialize;
use serde_json::{Value, json};
use sqlx::Row;
use ulid::Ulid;

use super::{
    AppState, VendorPermission, clean, database_failure, dedupe_key, record_portal_event,
    require_vendor_access,
};

const SALES_STAGES: &[&str] = &[
    "enquiry_received",
    "qualification",
    "availability_check",
    "tailored_quote",
    "tour_booking",
    "tour_completed",
    "follow_up",
    "hold",
    "contract",
    "deposit",
    "booked",
    "declined",
    "lost",
];

#[derive(Deserialize)]
struct OperationsQuery {
    vendor_slug: String,
    from: Option<String>,
    to: Option<String>,
}

#[derive(Deserialize)]
struct StageInput {
    vendor_slug: String,
    enquiry_thread_id: String,
    stage: String,
    next_action_at: Option<String>,
    expected_revision: Option<u64>,
    idempotency_key: String,
}

pub(super) fn routes() -> Router<Arc<AppState>> {
    Router::new()
        .route(
            "/api/wedding/vendor/portal/operations",
            get(operations_http),
        )
        .route(
            "/api/wedding/vendor/portal/journeys/stage",
            post(record_stage_http),
        )
}

async fn operations_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Query(query): Query<OperationsQuery>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let (_user, access) =
        require_vendor_access(&state, &headers, &query.vendor_slug, VendorPermission::View).await?;
    let (from, to) = calendar_range(query.from.as_deref(), query.to.as_deref())?;

    let journey_rows = sqlx::query(
        r#"WITH activity AS (
             SELECT thread_id,
                    MIN(received_at) AS first_at,
                    MAX(received_at) AS last_at,
                    COUNT(*) FILTER (WHERE direction='to_vendor') AS enquiries,
                    COUNT(*) FILTER (WHERE direction='to_couple') AS responses
               FROM wedding_enquiry_envelopes
              WHERE vendor_id=$1
              GROUP BY thread_id
           )
           SELECT activity.thread_id,activity.first_at::text AS first_at,
                  activity.last_at::text AS last_at,activity.enquiries,activity.responses,
                  journey.journey_id,journey.current_stage,
                  journey.next_action_at::text AS next_action_at,
                  COALESCE(journey.revision,0) AS revision
             FROM activity
             LEFT JOIN wedding_vendor_sales_journeys journey
               ON journey.vendor_id=$1 AND journey.enquiry_thread_id=activity.thread_id
            ORDER BY activity.last_at DESC
            LIMIT 250"#,
    )
    .bind(&access.vendor_id)
    .fetch_all(&state.db.pool)
    .await
    .map_err(database_failure)?;

    let envelope_rows = sqlx::query(
        r#"SELECT thread_id,message_id,direction,afp_type,
                  received_at::text AS occurred_at,
                  delivered_at IS NOT NULL AS delivered,
                  acked_at IS NOT NULL AS acknowledged
             FROM wedding_enquiry_envelopes
            WHERE vendor_id=$1
            ORDER BY received_at DESC
            LIMIT 600"#,
    )
    .bind(&access.vendor_id)
    .fetch_all(&state.db.pool)
    .await
    .map_err(database_failure)?;

    let stage_rows = sqlx::query(
        r#"SELECT journey.enquiry_thread_id,event.event_id,event.event_kind,event.stage,
                  event.next_action_at::text AS next_action_at,
                  event.occurred_at::text AS occurred_at
             FROM wedding_vendor_sales_journey_events event
             JOIN wedding_vendor_sales_journeys journey ON journey.journey_id=event.journey_id
            WHERE event.vendor_id=$1
            ORDER BY event.occurred_at DESC
            LIMIT 600"#,
    )
    .bind(&access.vendor_id)
    .fetch_all(&state.db.pool)
    .await
    .map_err(database_failure)?;

    let mut history: BTreeMap<String, Vec<Value>> = BTreeMap::new();
    for row in envelope_rows {
        let thread_id = row.get::<String, _>("thread_id");
        history.entry(thread_id).or_default().push(json!({
            "event_id": row.get::<String, _>("message_id"),
            "kind": if row.get::<String, _>("direction") == "to_vendor" { "enquiry_received" } else { "response_sent" },
            "direction": row.get::<String, _>("direction"),
            "afp_type": row.get::<String, _>("afp_type"),
            "occurred_at": row.get::<String, _>("occurred_at"),
            "delivered": row.get::<bool, _>("delivered"),
            "acknowledged": row.get::<bool, _>("acknowledged"),
        }));
    }
    for row in stage_rows {
        let thread_id = row.get::<String, _>("enquiry_thread_id");
        history.entry(thread_id).or_default().push(json!({
            "event_id": row.get::<String, _>("event_id"),
            "kind": row.get::<String, _>("event_kind"),
            "stage": row.get::<String, _>("stage"),
            "occurred_at": row.get::<String, _>("occurred_at"),
            "next_action_at": row.get::<Option<String>, _>("next_action_at"),
        }));
    }
    for events in history.values_mut() {
        events.sort_by(|left, right| {
            right["occurred_at"]
                .as_str()
                .cmp(&left["occurred_at"].as_str())
        });
    }

    let journeys = journey_rows
        .into_iter()
        .map(|row| {
            let thread_id = row.get::<String, _>("thread_id");
            let suffix = thread_id.chars().rev().take(6).collect::<String>().chars().rev().collect::<String>();
            json!({
                "journey_id": row.get::<Option<String>, _>("journey_id"),
                "thread_ref": thread_id,
                "customer_label": format!("Enquiry • {suffix}"),
                "current_stage": row.get::<Option<String>, _>("current_stage").unwrap_or_else(|| "enquiry_received".into()),
                "next_action_at": row.get::<Option<String>, _>("next_action_at"),
                "revision": row.get::<i64, _>("revision"),
                "first_activity_at": row.get::<String, _>("first_at"),
                "last_activity_at": row.get::<String, _>("last_at"),
                "enquiry_count": row.get::<i64, _>("enquiries"),
                "response_count": row.get::<i64, _>("responses"),
                "history": history.remove(&thread_id).unwrap_or_default(),
            })
        })
        .collect::<Vec<_>>();

    let summary = summary_projection(&state, &access.vendor_id).await?;
    let trends = trend_projection(&state, &access.vendor_id).await?;
    let exceptions = exception_projection(&state, &access.vendor_id).await?;
    let calendar = calendar_projection(&state, &access.vendor_id, from, to).await?;

    Ok(Json(json!({
        "vendor": super::portal_summary(&access),
        "generated_at": Utc::now().to_rfc3339(),
        "summary": summary,
        "trends": trends,
        "journeys": journeys,
        "exceptions": exceptions,
        "calendar": calendar,
    })))
}

async fn record_stage_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(body): Json<StageInput>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let (user, access) = require_vendor_access(
        &state,
        &headers,
        &body.vendor_slug,
        VendorPermission::Enquiries,
    )
    .await?;
    let stage = sales_stage(&body.stage)?;
    let thread_id = clean(&body.enquiry_thread_id, 240);
    if thread_id.is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            "Enquiry thread is required.".into(),
        ));
    }
    let dedupe = dedupe_key(&body.idempotency_key)?;
    let next_action_at = body
        .next_action_at
        .as_deref()
        .filter(|value| !value.trim().is_empty())
        .map(DateTime::parse_from_rfc3339)
        .transpose()
        .map_err(|_| {
            (
                StatusCode::BAD_REQUEST,
                "next_action_at must include a timezone.".into(),
            )
        })?
        .map(|value| value.with_timezone(&Utc));

    let thread_exists = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM wedding_enquiry_envelopes WHERE vendor_id=$1 AND thread_id=$2)",
    )
    .bind(&access.vendor_id)
    .bind(&thread_id)
    .fetch_one(&state.db.pool)
    .await
    .map_err(database_failure)?;
    if !thread_exists {
        return Err((
            StatusCode::NOT_FOUND,
            "Enquiry thread not found for this vendor.".into(),
        ));
    }

    let mut tx = state.db.pool.begin().await.map_err(database_failure)?;
    if let Some(row) = sqlx::query(
        "SELECT journey_id FROM wedding_vendor_sales_journey_events WHERE vendor_id=$1 AND event_kind='stage_recorded' AND dedupe_key=$2",
    )
    .bind(&access.vendor_id)
    .bind(&dedupe)
    .fetch_optional(&mut *tx)
    .await
    .map_err(database_failure)?
    {
        tx.rollback().await.ok();
        return Ok(Json(json!({"journey_id":row.get::<String,_>("journey_id"),"replayed":true})));
    }
    let proposed_id = Ulid::new().to_string();
    sqlx::query(
        r#"INSERT INTO wedding_vendor_sales_journeys
           (journey_id,vendor_id,enquiry_thread_id,current_stage,next_action_at)
           VALUES ($1,$2,$3,'enquiry_received',NULL)
           ON CONFLICT (vendor_id,enquiry_thread_id) DO NOTHING"#,
    )
    .bind(&proposed_id)
    .bind(&access.vendor_id)
    .bind(&thread_id)
    .execute(&mut *tx)
    .await
    .map_err(database_failure)?;
    let current = sqlx::query(
        "SELECT journey_id,revision FROM wedding_vendor_sales_journeys WHERE vendor_id=$1 AND enquiry_thread_id=$2 FOR UPDATE",
    )
    .bind(&access.vendor_id)
    .bind(&thread_id)
    .fetch_one(&mut *tx)
    .await
    .map_err(database_failure)?;
    let revision = current.get::<i64, _>("revision");
    if body
        .expected_revision
        .is_some_and(|expected| expected as i64 != revision)
    {
        return Err((
            StatusCode::CONFLICT,
            "This customer journey changed in another session. Refresh first.".into(),
        ));
    }
    let journey_id = current.get::<String, _>("journey_id");
    let next_revision = sqlx::query_scalar::<_, i64>(
        r#"UPDATE wedding_vendor_sales_journeys
              SET current_stage=$1,next_action_at=$2,revision=revision+1,updated_at=NOW()
            WHERE journey_id=$3 RETURNING revision"#,
    )
    .bind(stage)
    .bind(next_action_at)
    .bind(&journey_id)
    .fetch_one(&mut *tx)
    .await
    .map_err(database_failure)?;
    sqlx::query(
        r#"INSERT INTO wedding_vendor_sales_journey_events
           (event_id,journey_id,vendor_id,event_kind,stage,actor_user_id,next_action_at,dedupe_key)
           VALUES ($1,$2,$3,'stage_recorded',$4,$5,$6,$7)"#,
    )
    .bind(Ulid::new().to_string())
    .bind(&journey_id)
    .bind(&access.vendor_id)
    .bind(stage)
    .bind(&user.id)
    .bind(next_action_at)
    .bind(&dedupe)
    .execute(&mut *tx)
    .await
    .map_err(database_failure)?;
    record_portal_event(
        &mut tx,
        &access,
        &user.id,
        "sales_stage_recorded",
        Some(&journey_id),
        &dedupe,
        json!({"stage":stage,"revision":next_revision,"has_next_action":next_action_at.is_some()}),
    )
    .await?;
    tx.commit().await.map_err(database_failure)?;
    Ok(Json(
        json!({"journey_id":journey_id,"revision":next_revision,"replayed":false}),
    ))
}

async fn summary_projection(
    state: &AppState,
    vendor_id: &str,
) -> Result<Value, (StatusCode, String)> {
    let row = sqlx::query(
        r#"WITH messages AS (
             SELECT COUNT(DISTINCT thread_id) FILTER (WHERE direction='to_vendor') AS enquiries,
                    COUNT(*) FILTER (WHERE direction='to_couple') AS responses
               FROM wedding_enquiry_envelopes
              WHERE vendor_id=$1 AND received_at>=NOW()-INTERVAL '90 days'
           ), stages AS (
             SELECT COUNT(DISTINCT journey_id) FILTER (WHERE stage='tour_booking') AS tours_booked,
                    COUNT(DISTINCT journey_id) FILTER (WHERE stage='tour_completed') AS tours_completed,
                    COUNT(DISTINCT journey_id) FILTER (WHERE stage='tailored_quote') AS quotes,
                    COUNT(DISTINCT journey_id) FILTER (WHERE stage='hold') AS holds,
                    COUNT(DISTINCT journey_id) FILTER (WHERE stage='contract') AS contracts,
                    COUNT(DISTINCT journey_id) FILTER (WHERE stage='deposit') AS deposits,
                    COUNT(DISTINCT journey_id) FILTER (WHERE stage='booked') AS bookings
               FROM wedding_vendor_sales_journey_events
              WHERE vendor_id=$1 AND occurred_at>=NOW()-INTERVAL '90 days'
           ), response_time AS (
             SELECT AVG(EXTRACT(EPOCH FROM (first_response-first_enquiry))/60.0) AS average_minutes
               FROM (
                 SELECT thread_id,
                        MIN(received_at) FILTER (WHERE direction='to_vendor') AS first_enquiry,
                        MIN(received_at) FILTER (WHERE direction='to_couple') AS first_response
                   FROM wedding_enquiry_envelopes WHERE vendor_id=$1 GROUP BY thread_id
               ) response_pairs
              WHERE first_response>=first_enquiry
           )
           SELECT messages.enquiries,messages.responses,stages.tours_booked,stages.tours_completed,stages.quotes,
                  stages.holds,stages.contracts,stages.deposits,stages.bookings,
                  ROUND(response_time.average_minutes)::bigint AS average_response_minutes
             FROM messages,stages,response_time"#,
    )
    .bind(vendor_id)
    .fetch_one(&state.db.pool)
    .await
    .map_err(database_failure)?;
    Ok(json!({
        "period_days": 90,
        "enquiries": row.get::<i64, _>("enquiries"),
        "responses": row.get::<i64, _>("responses"),
        "quotes_delivered": row.get::<i64, _>("quotes"),
        "tours_booked": row.get::<i64, _>("tours_booked"),
        "tours_completed": row.get::<i64, _>("tours_completed"),
        "holds": row.get::<i64, _>("holds"),
        "contracts": row.get::<i64, _>("contracts"),
        "deposits": row.get::<i64, _>("deposits"),
        "bookings": row.get::<i64, _>("bookings"),
        "average_response_minutes": row.get::<Option<i64>, _>("average_response_minutes"),
    }))
}

async fn trend_projection(
    state: &AppState,
    vendor_id: &str,
) -> Result<Vec<Value>, (StatusCode, String)> {
    let rows = sqlx::query(
        r#"SELECT to_char(date_trunc('week',received_at AT TIME ZONE 'Australia/Sydney'),'YYYY-MM-DD') AS week_start,
                  COUNT(DISTINCT thread_id) FILTER (WHERE direction='to_vendor') AS enquiries,
                  COUNT(*) FILTER (WHERE direction='to_couple') AS responses
             FROM wedding_enquiry_envelopes
            WHERE vendor_id=$1 AND received_at>=NOW()-INTERVAL '12 weeks'
            GROUP BY date_trunc('week',received_at AT TIME ZONE 'Australia/Sydney')
            ORDER BY date_trunc('week',received_at AT TIME ZONE 'Australia/Sydney')"#,
    )
    .bind(vendor_id)
    .fetch_all(&state.db.pool)
    .await
    .map_err(database_failure)?;
    Ok(rows
        .into_iter()
        .map(|row| {
            json!({
                "week_start": row.get::<String, _>("week_start"),
                "enquiries": row.get::<i64, _>("enquiries"),
                "responses": row.get::<i64, _>("responses"),
            })
        })
        .collect())
}

async fn exception_projection(
    state: &AppState,
    vendor_id: &str,
) -> Result<Vec<Value>, (StatusCode, String)> {
    let rows = sqlx::query(
        r#"WITH unanswered AS (
             SELECT thread_id,MAX(received_at) FILTER (WHERE direction='to_vendor') AS inbound_at,
                    MAX(received_at) FILTER (WHERE direction='to_couple') AS outbound_at
               FROM wedding_enquiry_envelopes WHERE vendor_id=$1 GROUP BY thread_id
           )
           SELECT 'unanswered_enquiry' AS kind,thread_id AS subject_ref,inbound_at AS due_at
             FROM unanswered
            WHERE inbound_at<NOW()-INTERVAL '24 hours' AND (outbound_at IS NULL OR outbound_at<inbound_at)
           UNION ALL
           SELECT 'follow_up_overdue',enquiry_thread_id,next_action_at
             FROM wedding_vendor_sales_journeys
            WHERE vendor_id=$1 AND next_action_at<NOW() AND current_stage NOT IN ('booked','declined','lost')
           ORDER BY due_at LIMIT 50"#,
    )
    .bind(vendor_id)
    .fetch_all(&state.db.pool)
    .await
    .map_err(database_failure)?;
    let mut items = rows.into_iter().map(|row| {
        let kind = row.get::<String, _>("kind");
        json!({
            "kind": kind,
            "subject_ref": row.get::<String, _>("subject_ref"),
            "due_at": row.get::<DateTime<Utc>, _>("due_at").to_rfc3339(),
            "label": if kind == "unanswered_enquiry" { "Enquiry awaiting a response" } else { "Follow-up is overdue" },
        })
    }).collect::<Vec<_>>();
    let slots = sqlx::query(
        r#"SELECT slot.slot_id,slot.state,slot.local_date::text AS local_date,
                  slot.hold_expires_at::text AS hold_expires_at,room.room_name
             FROM wedding_vendor_special_offer_slots slot
             JOIN wedding_vendor_special_offers offer ON offer.offer_id=slot.offer_id
             LEFT JOIN wedding_vendor_rooms room ON room.room_id=offer.room_id
            WHERE slot.vendor_id=$1 AND (
              (slot.state='provisional_hold' AND slot.hold_expires_at<=NOW()+INTERVAL '48 hours')
              OR (slot.state='price_review' AND slot.local_date<=CURRENT_DATE+60)
            ) ORDER BY slot.local_date LIMIT 50"#,
    )
    .bind(vendor_id)
    .fetch_all(&state.db.pool)
    .await
    .map_err(database_failure)?;
    items.extend(slots.into_iter().map(|row| {
        let state_name = row.get::<String, _>("state");
        json!({
            "kind": if state_name == "provisional_hold" { "hold_expiring" } else { "price_review_due" },
            "subject_ref": row.get::<String, _>("slot_id"),
            "due_at": row.get::<Option<String>, _>("hold_expires_at").unwrap_or_else(|| format!("{}T09:00:00+11:00", row.get::<String,_>("local_date"))),
            "label": if state_name == "provisional_hold" { "Temporary hold expires within 48 hours" } else { "Price review date is approaching" },
            "resource_name": row.get::<Option<String>, _>("room_name"),
        })
    }));
    Ok(items)
}

async fn calendar_projection(
    state: &AppState,
    vendor_id: &str,
    from: NaiveDate,
    to: NaiveDate,
) -> Result<Value, (StatusCode, String)> {
    let resources = sqlx::query(
        "SELECT room_id,room_name,resource_status FROM wedding_vendor_rooms WHERE vendor_id=$1 ORDER BY resource_status,sort_order,room_name",
    )
    .bind(vendor_id)
    .fetch_all(&state.db.pool)
    .await
    .map_err(database_failure)?
    .into_iter()
    .map(|row| json!({
        "resource_id":row.get::<String,_>("room_id"),
        "name":row.get::<String,_>("room_name"),
        "status":row.get::<String,_>("resource_status"),
    }))
    .collect::<Vec<_>>();
    let slots = sqlx::query(
        r#"SELECT slot.slot_id,offer.room_id,slot.local_date::text AS local_date,
                  slot.state,slot.space_label,slot.hold_expires_at::text AS hold_expires_at,
                  slot.minimum_spend_cents,slot.indicative_per_head_cents,slot.updated_at::text AS updated_at
             FROM wedding_vendor_special_offer_slots slot
             JOIN wedding_vendor_special_offers offer ON offer.offer_id=slot.offer_id
            WHERE slot.vendor_id=$1 AND slot.local_date BETWEEN $2 AND $3
            ORDER BY slot.local_date,slot.space_label"#,
    )
    .bind(vendor_id)
    .bind(from)
    .bind(to)
    .fetch_all(&state.db.pool)
    .await
    .map_err(database_failure)?
    .into_iter()
    .map(|row| json!({
        "slot_id":row.get::<String,_>("slot_id"),
        "resource_id":row.get::<Option<String>,_>("room_id"),
        "local_date":row.get::<String,_>("local_date"),
        "state":row.get::<String,_>("state"),
        "space_label":row.get::<String,_>("space_label"),
        "hold_expires_at":row.get::<Option<String>,_>("hold_expires_at"),
        "minimum_spend_cents":row.get::<Option<i64>,_>("minimum_spend_cents"),
        "indicative_per_head_cents":row.get::<Option<i64>,_>("indicative_per_head_cents"),
        "updated_at":row.get::<String,_>("updated_at"),
    }))
    .collect::<Vec<_>>();
    Ok(json!({"from":from.to_string(),"to":to.to_string(),"resources":resources,"slots":slots}))
}

fn sales_stage(value: &str) -> Result<&str, (StatusCode, String)> {
    SALES_STAGES
        .iter()
        .copied()
        .find(|stage| *stage == value)
        .ok_or((
            StatusCode::BAD_REQUEST,
            "Unknown vendor sales stage.".into(),
        ))
}

fn calendar_range(
    from: Option<&str>,
    to: Option<&str>,
) -> Result<(NaiveDate, NaiveDate), (StatusCode, String)> {
    let default_from = Utc::now().date_naive();
    let from = from
        .map(|value| NaiveDate::parse_from_str(value, "%Y-%m-%d"))
        .transpose()
        .map_err(|_| (StatusCode::BAD_REQUEST, "from must be YYYY-MM-DD.".into()))?
        .unwrap_or(default_from);
    let to = to
        .map(|value| NaiveDate::parse_from_str(value, "%Y-%m-%d"))
        .transpose()
        .map_err(|_| (StatusCode::BAD_REQUEST, "to must be YYYY-MM-DD.".into()))?
        .unwrap_or(from + Duration::days(90));
    if to < from || to > from + Duration::days(180) {
        return Err((
            StatusCode::BAD_REQUEST,
            "Calendar range must be between 1 and 180 days.".into(),
        ));
    }
    Ok((from, to))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stages_are_non_linear_but_bounded() {
        for stage in SALES_STAGES {
            assert_eq!(sales_stage(stage).unwrap(), *stage);
        }
        assert!(sales_stage("paid_in_full_without_contract").is_err());
    }

    #[test]
    fn calendar_window_is_bounded() {
        let (from, to) = calendar_range(Some("2026-11-15"), Some("2027-01-15")).unwrap();
        assert_eq!((to - from).num_days(), 61);
        assert!(calendar_range(Some("2026-11-15"), Some("2027-12-15")).is_err());
        assert!(calendar_range(Some("bad"), None).is_err());
    }
}
