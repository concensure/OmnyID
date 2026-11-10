use std::{collections::BTreeSet, sync::Arc};

use axum::{
    Json, Router,
    extract::{Path, Query, State},
    http::{HeaderMap, StatusCode},
    routing::{get, post, put},
};
use chrono::{Duration, NaiveDate, Utc};
use serde::Deserialize;
use serde_json::{Value, json};
use sqlx::Row;
use ulid::Ulid;

use super::{
    AppState, VendorPermission, clean, database_failure, dedupe_key, record_portal_event,
    require_paid_feature, require_vendor_access,
};

#[derive(Deserialize)]
struct VendorQuery {
    vendor_slug: String,
}

#[derive(Deserialize)]
struct ResourceInput {
    vendor_slug: String,
    expected_revision: Option<u64>,
    name: String,
    description: Option<String>,
    capacity_seated: Option<i32>,
    capacity_standing: Option<i32>,
    inclusions: Vec<String>,
    status: Option<String>,
    idempotency_key: String,
}

#[derive(Deserialize)]
struct BulkCalendarInput {
    vendor_slug: String,
    offer_id: String,
    resource_id: String,
    expected_offer_revision: u64,
    dates: Vec<String>,
    state: String,
    vendor_confirmed: bool,
    maximum_capacity: Option<i32>,
    minimum_spend_cents: Option<i64>,
    indicative_per_head_cents: Option<i64>,
    inclusions: Vec<String>,
    public_conditions: Option<String>,
    idempotency_key: String,
}

pub(super) fn routes() -> Router<Arc<AppState>> {
    Router::new()
        .route(
            "/api/wedding/vendor/portal/resources",
            get(list_resources_http).post(create_resource_http),
        )
        .route(
            "/api/wedding/vendor/portal/resources/{resource_id}",
            put(update_resource_http),
        )
        .route(
            "/api/wedding/vendor/portal/calendar/bulk",
            post(bulk_calendar_http),
        )
}

async fn list_resources_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Query(query): Query<VendorQuery>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let (_user, access) =
        require_vendor_access(&state, &headers, &query.vendor_slug, VendorPermission::View).await?;
    let rows = sqlx::query(
        r#"SELECT room.room_id,room.room_name,room.description,room.capacity_seated,
                  room.capacity_standing,room.inclusions,room.resource_status,
                  room.portal_revision,room.managed_by_vendor,
                  COUNT(slot.slot_id) AS date_count,
                  COUNT(slot.slot_id) FILTER (WHERE slot.state='booked') AS booked_count
           FROM wedding_vendor_rooms room
           LEFT JOIN wedding_vendor_special_offers offer ON offer.room_id=room.room_id
           LEFT JOIN wedding_vendor_special_offer_slots slot ON slot.offer_id=offer.offer_id
           WHERE room.vendor_id=$1
           GROUP BY room.room_id
           ORDER BY room.resource_status,room.sort_order,room.room_name"#,
    )
    .bind(&access.vendor_id)
    .fetch_all(&state.db.pool)
    .await
    .map_err(database_failure)?;
    let items = rows
        .into_iter()
        .map(|row| resource_json(&row))
        .collect::<Vec<_>>();
    Ok(Json(
        json!({"vendor":super::portal_summary(&access),"items":items}),
    ))
}

async fn create_resource_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(body): Json<ResourceInput>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let (user, access) = require_vendor_access(
        &state,
        &headers,
        &body.vendor_slug,
        VendorPermission::Calendar,
    )
    .await?;
    require_paid_feature(&state, &access.vendor_id, "Named resources").await?;
    let input = validate_resource(body)?;
    let mut tx = state.db.pool.begin().await.map_err(database_failure)?;
    if let Some(row) = sqlx::query(
        "SELECT subject_ref FROM wedding_vendor_portal_events WHERE vendor_id=$1 AND event_kind='resource_created' AND dedupe_key=$2",
    )
    .bind(&access.vendor_id)
    .bind(&input.dedupe)
    .fetch_optional(&mut *tx)
    .await
    .map_err(database_failure)?
    {
        tx.rollback().await.ok();
        return Ok(Json(json!({"resource_id":row.get::<Option<String>,_>("subject_ref"),"replayed":true})));
    }
    let resource_id = Ulid::new().to_string();
    sqlx::query(
        r#"INSERT INTO wedding_vendor_rooms
           (room_id,vendor_id,room_name,sort_order,description,capacity_seated,
            capacity_standing,inclusions,evidence,managed_by_vendor,resource_status)
           VALUES ($1,$2,$3,(SELECT COALESCE(MAX(sort_order),-1)+1 FROM wedding_vendor_rooms WHERE vendor_id=$2),
                   $4,$5,$6,$7,'{}'::jsonb,TRUE,$8)"#,
    )
    .bind(&resource_id)
    .bind(&access.vendor_id)
    .bind(&input.name)
    .bind(&input.description)
    .bind(input.capacity_seated)
    .bind(input.capacity_standing)
    .bind(&input.inclusions)
    .bind(&input.status)
    .execute(&mut *tx)
    .await
    .map_err(resource_database_failure)?;
    record_portal_event(
        &mut tx,
        &access,
        &user.id,
        "resource_created",
        Some(&resource_id),
        &input.dedupe,
        json!({"resource_status":input.status}),
    )
    .await?;
    tx.commit().await.map_err(database_failure)?;
    Ok(Json(
        json!({"resource_id":resource_id,"revision":1,"replayed":false}),
    ))
}

async fn update_resource_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(resource_id): Path<String>,
    Json(body): Json<ResourceInput>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let (user, access) = require_vendor_access(
        &state,
        &headers,
        &body.vendor_slug,
        VendorPermission::Calendar,
    )
    .await?;
    require_paid_feature(&state, &access.vendor_id, "Named resources").await?;
    let input = validate_resource(body)?;
    let expected = input.expected_revision.ok_or((
        StatusCode::BAD_REQUEST,
        "expected_revision is required.".into(),
    ))?;
    let mut tx = state.db.pool.begin().await.map_err(database_failure)?;
    let replay_kind = if input.status == "archived" {
        "resource_archived"
    } else {
        "resource_updated"
    };
    if sqlx::query("SELECT 1 FROM wedding_vendor_portal_events WHERE vendor_id=$1 AND event_kind=$2 AND dedupe_key=$3")
        .bind(&access.vendor_id).bind(replay_kind).bind(&input.dedupe)
        .fetch_optional(&mut *tx).await.map_err(database_failure)?.is_some()
    {
        tx.rollback().await.ok();
        return Ok(Json(json!({"resource_id":resource_id,"replayed":true})));
    }
    let current = sqlx::query(
        "SELECT portal_revision,resource_status FROM wedding_vendor_rooms WHERE room_id=$1 AND vendor_id=$2 FOR UPDATE",
    )
    .bind(clean(&resource_id, 100))
    .bind(&access.vendor_id)
    .fetch_optional(&mut *tx)
    .await
    .map_err(database_failure)?
    .ok_or((StatusCode::NOT_FOUND, "Vendor resource not found.".into()))?;
    if current.get::<i64, _>("portal_revision") != expected as i64 {
        return Err((
            StatusCode::CONFLICT,
            "This resource changed in another session. Refresh first.".into(),
        ));
    }
    if input.status == "archived" {
        let booked = sqlx::query_scalar::<_, i64>(
            r#"SELECT COUNT(*) FROM wedding_vendor_special_offer_slots slot
               JOIN wedding_vendor_special_offers offer ON offer.offer_id=slot.offer_id
               WHERE offer.room_id=$1 AND slot.state='booked' AND slot.local_date>=CURRENT_DATE"#,
        )
        .bind(&resource_id)
        .fetch_one(&mut *tx)
        .await
        .map_err(database_failure)?;
        if booked > 0 {
            return Err((
                StatusCode::CONFLICT,
                "A resource with a future confirmed booking cannot be archived.".into(),
            ));
        }
    }
    let result = sqlx::query(
        r#"UPDATE wedding_vendor_rooms SET room_name=$1,description=$2,capacity_seated=$3,
             capacity_standing=$4,inclusions=$5,resource_status=$6,managed_by_vendor=TRUE,
             portal_revision=portal_revision+1,updated_at=NOW()
           WHERE room_id=$7 AND vendor_id=$8 AND portal_revision=$9
           RETURNING portal_revision"#,
    )
    .bind(&input.name)
    .bind(&input.description)
    .bind(input.capacity_seated)
    .bind(input.capacity_standing)
    .bind(&input.inclusions)
    .bind(&input.status)
    .bind(&resource_id)
    .bind(&access.vendor_id)
    .bind(expected as i64)
    .fetch_one(&mut *tx)
    .await
    .map_err(resource_database_failure)?;
    let event_kind = if input.status == "archived" {
        "resource_archived"
    } else {
        "resource_updated"
    };
    record_portal_event(
        &mut tx,
        &access,
        &user.id,
        event_kind,
        Some(&resource_id),
        &input.dedupe,
        json!({"revision":result.get::<i64,_>("portal_revision"),"resource_status":input.status}),
    )
    .await?;
    tx.commit().await.map_err(database_failure)?;
    Ok(Json(
        json!({"resource_id":resource_id,"revision":result.get::<i64,_>("portal_revision")}),
    ))
}

async fn bulk_calendar_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(body): Json<BulkCalendarInput>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let (user, access) = require_vendor_access(
        &state,
        &headers,
        &body.vendor_slug,
        VendorPermission::Calendar,
    )
    .await?;
    require_paid_feature(&state, &access.vendor_id, "Bulk calendar editing").await?;
    let dates = validate_dates(&body.dates)?;
    let state_name = match body.state.as_str() {
        "available" | "paused" | "withdrawn" => body.state.as_str(),
        _ => {
            return Err((
                StatusCode::BAD_REQUEST,
                "Bulk state must be available, paused or withdrawn.".into(),
            ));
        }
    };
    if body.maximum_capacity.is_some_and(|value| value <= 0)
        || body.minimum_spend_cents.is_some_and(|value| value < 0)
        || body
            .indicative_per_head_cents
            .is_some_and(|value| value < 0)
    {
        return Err((
            StatusCode::BAD_REQUEST,
            "Capacity and prices cannot be negative.".into(),
        ));
    }
    let inclusions = clean_list(body.inclusions, 40, 240)?;
    let conditions = body
        .public_conditions
        .map(|value| clean(&value, 1200))
        .filter(|value| !value.is_empty());
    let dedupe = dedupe_key(&body.idempotency_key)?;
    let mut tx = state.db.pool.begin().await.map_err(database_failure)?;
    if sqlx::query("SELECT 1 FROM wedding_vendor_portal_events WHERE vendor_id=$1 AND event_kind='calendar_bulk_updated' AND dedupe_key=$2")
        .bind(&access.vendor_id).bind(&dedupe).fetch_optional(&mut *tx).await.map_err(database_failure)?.is_some()
    {
        tx.rollback().await.ok();
        return Ok(Json(json!({"replayed":true,"updated":0})));
    }
    let offer = sqlx::query(
        "SELECT revision,room_id,publication_state FROM wedding_vendor_special_offers WHERE offer_id=$1 AND vendor_id=$2 FOR UPDATE",
    )
    .bind(clean(&body.offer_id, 100))
    .bind(&access.vendor_id)
    .fetch_optional(&mut *tx)
    .await
    .map_err(database_failure)?
    .ok_or((StatusCode::NOT_FOUND, "Offer not found.".into()))?;
    if offer.get::<i64, _>("revision") != body.expected_offer_revision as i64 {
        return Err((
            StatusCode::CONFLICT,
            "This calendar changed in another session. Refresh first.".into(),
        ));
    }
    if offer.get::<Option<String>, _>("room_id").as_deref() != Some(body.resource_id.as_str()) {
        return Err((
            StatusCode::BAD_REQUEST,
            "The selected resource does not belong to this offer.".into(),
        ));
    }
    let resource = sqlx::query("SELECT room_name,resource_status FROM wedding_vendor_rooms WHERE room_id=$1 AND vendor_id=$2")
        .bind(&body.resource_id).bind(&access.vendor_id).fetch_optional(&mut *tx).await.map_err(database_failure)?
        .ok_or((StatusCode::NOT_FOUND, "Vendor resource not found.".into()))?;
    if resource.get::<String, _>("resource_status") != "active" {
        return Err((
            StatusCode::CONFLICT,
            "Archived resources cannot receive calendar changes.".into(),
        ));
    }
    let booked = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM wedding_vendor_special_offer_slots WHERE offer_id=$1 AND local_date=ANY($2) AND state='booked'",
    )
    .bind(&body.offer_id)
    .bind(&dates)
    .fetch_one(&mut *tx)
    .await
    .map_err(database_failure)?;
    if booked > 0 {
        return Err((
            StatusCode::CONFLICT,
            "Bulk changes cannot replace a confirmed booking.".into(),
        ));
    }
    let now = Utc::now();
    for date in &dates {
        let existing_slot = sqlx::query_scalar::<_, String>(
            r#"SELECT slot_id FROM wedding_vendor_special_offer_slots
               WHERE offer_id=$1 AND local_date=$2 AND space_label=$3
                 AND session_label='' AND COALESCE(starts_at,TIME '00:00:00')=TIME '00:00:00'
               FOR UPDATE"#,
        )
        .bind(&body.offer_id)
        .bind(date)
        .bind(resource.get::<String, _>("room_name"))
        .fetch_optional(&mut *tx)
        .await
        .map_err(database_failure)?;
        if let Some(slot_id) = existing_slot {
            sqlx::query(
                r#"UPDATE wedding_vendor_special_offer_slots
                   SET maximum_capacity=$1,minimum_spend_cents=$2,indicative_per_head_cents=$3,
                       inclusions=$4,public_conditions=$5,state=$6,last_confirmed_at=$7,
                       confirmation_expires_at=$8,updated_by_user_id=$9,availability_scope=$10,
                       availability_scope_updated_at=NOW(),revision=revision+1,updated_at=NOW()
                   WHERE slot_id=$11 AND vendor_id=$12 AND state<>'booked'"#,
            )
            .bind(body.maximum_capacity)
            .bind(body.minimum_spend_cents)
            .bind(body.indicative_per_head_cents)
            .bind(&inclusions)
            .bind(&conditions)
            .bind(state_name)
            .bind(now)
            .bind(now + Duration::days(14))
            .bind(&user.id)
            .bind(if body.vendor_confirmed {
                "vendor_confirmed"
            } else {
                "calendar_open"
            })
            .bind(slot_id)
            .bind(&access.vendor_id)
            .execute(&mut *tx)
            .await
            .map_err(database_failure)?;
            continue;
        }
        sqlx::query(
            r#"INSERT INTO wedding_vendor_special_offer_slots
               (slot_id,offer_id,vendor_id,local_date,timezone,space_label,maximum_capacity,
                minimum_spend_cents,indicative_per_head_cents,inclusions,public_conditions,state,
                last_confirmed_at,confirmation_expires_at,updated_by_user_id,availability_scope,
                availability_scope_updated_at)
               VALUES ($1,$2,$3,$4,'Australia/Sydney',$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,NOW())"#,
        )
        .bind(Ulid::new().to_string())
        .bind(&body.offer_id)
        .bind(&access.vendor_id)
        .bind(date)
        .bind(resource.get::<String, _>("room_name"))
        .bind(body.maximum_capacity)
        .bind(body.minimum_spend_cents)
        .bind(body.indicative_per_head_cents)
        .bind(&inclusions)
        .bind(&conditions)
        .bind(state_name)
        .bind(now)
        .bind(now + Duration::days(14))
        .bind(&user.id)
        .bind(if body.vendor_confirmed { "vendor_confirmed" } else { "calendar_open" })
        .execute(&mut *tx)
        .await
        .map_err(database_failure)?;
    }
    let next_revision = body.expected_offer_revision + 1;
    sqlx::query(
        "UPDATE wedding_vendor_special_offers SET revision=$1,publication_state=CASE WHEN publication_state='active' THEN 'paused' ELSE publication_state END,approved_revision=NULL,updated_at=NOW() WHERE offer_id=$2 AND vendor_id=$3 AND revision=$4",
    )
    .bind(next_revision as i64)
    .bind(&body.offer_id)
    .bind(&access.vendor_id)
    .bind(body.expected_offer_revision as i64)
    .execute(&mut *tx)
    .await
    .map_err(database_failure)?;
    record_portal_event(
        &mut tx,
        &access,
        &user.id,
        "calendar_bulk_updated",
        Some(&body.offer_id),
        &dedupe,
        json!({"resource_id":body.resource_id,"date_count":dates.len(),"state":state_name,"offer_revision":next_revision}),
    )
    .await?;
    tx.commit().await.map_err(database_failure)?;
    Ok(Json(
        json!({"replayed":false,"updated":dates.len(),"offer_revision":next_revision,"publication_state":"paused_for_review"}),
    ))
}

struct ValidResource {
    name: String,
    description: Option<String>,
    capacity_seated: Option<i32>,
    capacity_standing: Option<i32>,
    inclusions: Vec<String>,
    status: String,
    expected_revision: Option<u64>,
    dedupe: String,
}

fn validate_resource(input: ResourceInput) -> Result<ValidResource, (StatusCode, String)> {
    let name = clean(&input.name, 160);
    if name.is_empty() {
        return Err((StatusCode::BAD_REQUEST, "Resource name is required.".into()));
    }
    if input.capacity_seated.is_some_and(|value| value < 0)
        || input.capacity_standing.is_some_and(|value| value < 0)
    {
        return Err((
            StatusCode::BAD_REQUEST,
            "Resource capacity cannot be negative.".into(),
        ));
    }
    let status = input.status.unwrap_or_else(|| "active".into());
    if !matches!(status.as_str(), "active" | "archived") {
        return Err((
            StatusCode::BAD_REQUEST,
            "Resource status must be active or archived.".into(),
        ));
    }
    Ok(ValidResource {
        name,
        description: input
            .description
            .map(|value| clean(&value, 2000))
            .filter(|value| !value.is_empty()),
        capacity_seated: input.capacity_seated,
        capacity_standing: input.capacity_standing,
        inclusions: clean_list(input.inclusions, 40, 240)?,
        status,
        expected_revision: input.expected_revision,
        dedupe: dedupe_key(&input.idempotency_key)?,
    })
}

fn validate_dates(values: &[String]) -> Result<Vec<NaiveDate>, (StatusCode, String)> {
    if values.is_empty() || values.len() > 62 {
        return Err((
            StatusCode::BAD_REQUEST,
            "Choose between 1 and 62 dates.".into(),
        ));
    }
    let today = Utc::now().date_naive();
    let mut dates = BTreeSet::new();
    for value in values {
        let date = NaiveDate::parse_from_str(value.trim(), "%Y-%m-%d")
            .map_err(|_| (StatusCode::BAD_REQUEST, "Use dates as YYYY-MM-DD.".into()))?;
        if date < today || date > today + Duration::days(730) {
            return Err((
                StatusCode::BAD_REQUEST,
                "Bulk dates must fall within the next two years.".into(),
            ));
        }
        dates.insert(date);
    }
    Ok(dates.into_iter().collect())
}

fn clean_list(
    values: Vec<String>,
    max: usize,
    chars: usize,
) -> Result<Vec<String>, (StatusCode, String)> {
    if values.len() > max {
        return Err((StatusCode::BAD_REQUEST, "Too many inclusion values.".into()));
    }
    Ok(values
        .into_iter()
        .map(|value| clean(&value, chars))
        .filter(|value| !value.is_empty())
        .collect())
}

fn resource_json(row: &sqlx::postgres::PgRow) -> Value {
    json!({
        "resource_id":row.get::<String,_>("room_id"),
        "name":row.get::<String,_>("room_name"),
        "description":row.get::<Option<String>,_>("description"),
        "capacity_seated":row.get::<Option<i32>,_>("capacity_seated"),
        "capacity_standing":row.get::<Option<i32>,_>("capacity_standing"),
        "inclusions":row.get::<Vec<String>,_>("inclusions"),
        "status":row.get::<String,_>("resource_status"),
        "revision":row.get::<i64,_>("portal_revision"),
        "managed_by_vendor":row.get::<bool,_>("managed_by_vendor"),
        "date_count":row.get::<i64,_>("date_count"),
        "booked_count":row.get::<i64,_>("booked_count"),
    })
}

fn resource_database_failure(error: sqlx::Error) -> (StatusCode, String) {
    if error
        .as_database_error()
        .is_some_and(|error| error.is_unique_violation())
    {
        return (
            StatusCode::CONFLICT,
            "A resource with that name already exists.".into(),
        );
    }
    database_failure(error)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bulk_dates_are_bounded_unique_and_future_only() {
        let tomorrow = (Utc::now().date_naive() + Duration::days(1)).to_string();
        let dates = validate_dates(&[tomorrow.clone(), tomorrow]).unwrap();
        assert_eq!(dates.len(), 1);
        assert!(validate_dates(&[]).is_err());
        assert!(validate_dates(&["2020-01-01".into()]).is_err());
    }

    #[test]
    fn resource_validation_preserves_named_resource_semantics() {
        let resource = validate_resource(ResourceInput {
            vendor_slug: "example".into(),
            expected_revision: None,
            name: "Harbour Room".into(),
            description: Some("Seated reception room".into()),
            capacity_seated: Some(120),
            capacity_standing: None,
            inclusions: vec!["Tables".into()],
            status: Some("active".into()),
            idempotency_key: "resource-create-1".into(),
        })
        .unwrap();
        assert_eq!(resource.name, "Harbour Room");
        assert!(
            validate_resource(ResourceInput {
                vendor_slug: "example".into(),
                expected_revision: None,
                name: " ".into(),
                description: None,
                capacity_seated: None,
                capacity_standing: None,
                inclusions: vec![],
                status: None,
                idempotency_key: "resource-create-2".into(),
            })
            .is_err()
        );
    }
}
