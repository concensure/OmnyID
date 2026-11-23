use super::*;

pub(super) async fn admin_dashboard_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Query(query): Query<AdminMetricsQuery>,
) -> Result<Json<Value>, (StatusCode, String)> {
    operator(&state, &headers, "celebrant-management-dashboard").await?;
    let days = query.days.unwrap_or(90).clamp(7, 365);
    let rows = sqlx::query(
        r#"SELECT v.vendor_id,v.vendor_slug,v.vendor_name,v.service_area,v.claim_status,v.status listing_status,
                  p.register_status,p.register_type,p.register_source_url,p.register_checked_at,p.register_evidence_ref,
                  p.participation_status,p.participation_updated_at,p.callback_phone_confirmed,
                  o.channel outreach_channel,o.status outreach_status,o.sent_at outreach_sent_at,
                  o.follow_up_due_at,o.opted_out_at,
                  COUNT(g.grant_id)::bigint generated_links,
                  COUNT(g.grant_id) FILTER (WHERE g.exchanged_at IS NOT NULL)::bigint opened_links,
                  MAX(g.exchanged_at) latest_opened_at,
                  MAX(g.grant_id) FILTER (WHERE g.status IN ('active','exchanged')) active_grant_id,
                  MAX(g.expires_at) FILTER (WHERE g.status IN ('active','exchanged')) active_link_expires_at
             FROM wedding_vendors v
             LEFT JOIN wedding_celebrant_pilot_profiles p ON p.vendor_id=v.vendor_id
             LEFT JOIN wedding_celebrant_outreach o ON o.vendor_id=v.vendor_id
             LEFT JOIN wedding_celebrant_management_grants g ON g.vendor_id=v.vendor_id
            WHERE v.status IN ('active','hidden') AND lower(v.category)='celebrant'
            GROUP BY v.vendor_id,v.vendor_slug,v.vendor_name,v.service_area,v.claim_status,v.status,
                     p.register_status,p.register_type,p.register_source_url,p.register_checked_at,p.register_evidence_ref,
                     p.participation_status,p.participation_updated_at,p.callback_phone_confirmed,
                     o.channel,o.status,o.sent_at,o.follow_up_due_at,o.opted_out_at
            ORDER BY v.vendor_name"#,
    )
    .fetch_all(&state.db.pool).await.map_err(db_error)?;
    let metric_rows = sqlx::query(
        r#"WITH report_days AS (
               SELECT generate_series(
                   (NOW() AT TIME ZONE 'Australia/Sydney')::date - ($1::integer - 1),
                   (NOW() AT TIME ZONE 'Australia/Sydney')::date,
                   INTERVAL '1 day'
               )::date AS day
           ), qualified AS (
               SELECT (activated_at AT TIME ZONE 'Australia/Sydney')::date AS day,
                      owner_user_id || ':' || wedding_plan_id AS wedding_key
                 FROM growth_wedding_activations
                WHERE activated_at >= NOW() - make_interval(days => $1::integer)
           ), availability_updates AS (
               SELECT (occurred_at AT TIME ZONE 'Australia/Sydney')::date AS day,vendor_id
                 FROM wedding_vendor_special_offer_events
                WHERE occurred_at >= NOW() - make_interval(days => $1::integer)
                  AND event_kind IN ('created','approved','published','reconfirmed','paused','withdrawn',
                    'hold_created','hold_expired','booked','stale','availability_confirmed','cancelled_booking_reopened')
               UNION ALL
               SELECT (occurred_at AT TIME ZONE 'Australia/Sydney')::date AS day,vendor_id
                 FROM wedding_celebrant_management_events
                WHERE occurred_at >= NOW() - make_interval(days => $1::integer)
                  AND event_kind IN ('settings_updated','window_added','window_removed','live_started','live_paused')
               UNION ALL
               SELECT (occurred_at AT TIME ZONE 'Australia/Sydney')::date AS day,vendor_id
                 FROM wedding_celebrant_consultation_events
                WHERE occurred_at >= NOW() - make_interval(days => $1::integer)
                  AND vendor_id IS NOT NULL
                  AND event_kind IN ('settings_updated','live_started','live_paused')
           ), completed_delivery_evidence AS (
               SELECT 'afp:' || envelope.message_id AS delivery_key,
                      COALESCE(envelope.acked_at,envelope.delivered_at,envelope.received_at) AS completed_at
                 FROM wedding_enquiry_envelopes envelope
                 JOIN wedding_vendors vendor ON vendor.vendor_id=envelope.vendor_id
                WHERE envelope.direction='to_vendor'
                  AND (envelope.delivered_at IS NOT NULL OR envelope.acked_at IS NOT NULL)
                  AND lower(vendor.category)='venue'
               UNION ALL
               SELECT CASE WHEN provider_event.afp_message_id IS NOT NULL
                           THEN 'afp:' || provider_event.afp_message_id
                           ELSE 'provider:' || provider_event.provider || ':' || provider_event.provider_event_id END,
                      COALESCE(provider_event.processed_at,provider_event.created_at)
                 FROM wedding_vendor_email_provider_events provider_event
                 JOIN wedding_vendor_email_threads thread ON thread.relay_thread_id=provider_event.relay_thread_id
                 JOIN wedding_vendors vendor ON vendor.vendor_id=thread.vendor_id
                WHERE provider_event.event_kind='delivered'
                  AND provider_event.processing_status='completed'
                  AND lower(vendor.category)='venue'
           ), completed_enquiries AS (
               SELECT delivery_key,
                      (MIN(completed_at) AT TIME ZONE 'Australia/Sydney')::date AS day
                 FROM completed_delivery_evidence
                WHERE completed_at >= NOW() - make_interval(days => $1::integer)
                GROUP BY delivery_key
           )
           SELECT report_days.day,
                  COALESCE((SELECT COUNT(DISTINCT wedding_key) FROM qualified WHERE qualified.day=report_days.day),0)::bigint AS qualified_couples,
                  COALESCE((SELECT COUNT(DISTINCT vendor_id) FROM availability_updates WHERE availability_updates.day=report_days.day),0)::bigint AS availability_vendors_maintained,
                  COALESCE((SELECT COUNT(*) FROM completed_enquiries WHERE completed_enquiries.day=report_days.day),0)::bigint AS completed_venue_enquiries
             FROM report_days ORDER BY report_days.day"#,
    )
    .bind(days)
    .fetch_all(&state.db.pool)
    .await
    .map_err(db_error)?;
    let fresh_availability_vendors = sqlx::query_scalar::<_, i64>(
        r#"SELECT COUNT(DISTINCT vendor_id)::bigint FROM (
               SELECT vendor_id
                 FROM wedding_vendor_special_offer_slots
                WHERE state IN ('available','enquiry_received','provisional_hold','booked')
                  AND confirmation_expires_at>NOW()
                  AND last_confirmed_at>=NOW()-INTERVAL '30 days'
               UNION
               SELECT vendor_id
                 FROM wedding_celebrant_management_events
                WHERE event_kind IN ('settings_updated','window_added','window_removed','live_started','live_paused')
                  AND occurred_at>=NOW()-INTERVAL '30 days'
               UNION
               SELECT vendor_id
                 FROM wedding_celebrant_consultation_windows
                WHERE enabled=TRUE AND updated_at>=NOW()-INTERVAL '30 days'
           ) fresh"#,
    )
    .fetch_one(&state.db.pool)
    .await
    .map_err(db_error)?;
    let funnel = sqlx::query(
        r#"SELECT
             COUNT(*)::bigint AS discovered,
             COUNT(*) FILTER (WHERE v.status='active')::bigint AS listed,
             COUNT(*) FILTER (WHERE EXISTS(SELECT 1 FROM wedding_celebrant_management_grants g WHERE g.vendor_id=v.vendor_id))::bigint AS invited,
             COUNT(*) FILTER (WHERE EXISTS(SELECT 1 FROM wedding_celebrant_management_grants g WHERE g.vendor_id=v.vendor_id AND g.exchanged_at IS NOT NULL))::bigint AS opened,
             COUNT(*) FILTER (WHERE EXISTS(SELECT 1 FROM wedding_celebrant_consultation_windows w WHERE w.vendor_id=v.vendor_id AND w.enabled))::bigint AS configured,
             COUNT(*) FILTER (WHERE p.participation_status='accepted')::bigint AS opted_in,
             COUNT(*) FILTER (WHERE v.status='active' AND p.register_status='verified')::bigint AS published,
             COUNT(*) FILTER (WHERE EXISTS(SELECT 1 FROM wedding_celebrant_callback_requests r WHERE r.selected_vendor_id=v.vendor_id))::bigint AS engaged,
             COUNT(*) FILTER (WHERE o.status='opted_out' OR o.follow_up_due_at<=NOW() OR p.register_status IN ('not_found','requires_review'))::bigint AS exceptions
           FROM wedding_vendors v
           LEFT JOIN wedding_celebrant_pilot_profiles p ON p.vendor_id=v.vendor_id
           LEFT JOIN wedding_celebrant_outreach o ON o.vendor_id=v.vendor_id
          WHERE lower(v.category)='celebrant' AND v.status IN ('active','hidden')"#,
    )
    .fetch_one(&state.db.pool)
    .await
    .map_err(db_error)?;
    let series = metric_rows
        .into_iter()
        .map(|row| json!({
            "day":row.get::<NaiveDate,_>("day"),
            "qualified_couples":row.get::<i64,_>("qualified_couples"),
            "availability_vendors_maintained":row.get::<i64,_>("availability_vendors_maintained"),
            "completed_venue_enquiries":row.get::<i64,_>("completed_venue_enquiries")
        }))
        .collect::<Vec<_>>();
    let qualified_couples = series
        .iter()
        .filter_map(|row| row.get("qualified_couples")?.as_i64())
        .sum::<i64>();
    let availability_vendors_maintained = series
        .iter()
        .filter_map(|row| row.get("availability_vendors_maintained")?.as_i64())
        .sum::<i64>();
    let completed_venue_enquiries = series
        .iter()
        .filter_map(|row| row.get("completed_venue_enquiries")?.as_i64())
        .sum::<i64>();
    let consultations_enabled =
        std::env::var("OMNYID_CELEBRANT_CONSULTATIONS_ENABLED").as_deref() == Ok("true");
    let phone_verification_configured = [
        "OMNYID_TWILIO_ACCOUNT_SID",
        "OMNYID_TWILIO_AUTH_TOKEN",
        "OMNYID_TWILIO_VERIFY_SERVICE_SID",
        "OMNYID_CELEBRANT_CONSULTATION_TOKEN_PEPPER",
        "OMNYID_ENCRYPTION_KEY_HEX",
    ]
    .iter()
    .all(|name| crate::secret_manager::read_process_secret_trimmed(name).is_some());
    Ok(Json(json!({"vendors":rows.into_iter().map(|row|json!({
        "vendor_id":row.get::<String,_>("vendor_id"),"vendor_slug":row.get::<String,_>("vendor_slug"),
        "vendor_name":row.get::<String,_>("vendor_name"),"service_area":row.get::<String,_>("service_area"),
        "claim_status":row.get::<String,_>("claim_status"),"listing_status":row.get::<String,_>("listing_status"),
        "register_status":row.get::<Option<String>,_>("register_status").unwrap_or_else(||"pending".into()),
        "register_type":row.get::<Option<String>,_>("register_type"),
        "register_source_url":row.get::<Option<String>,_>("register_source_url"),
        "register_evidence_ref":row.get::<Option<String>,_>("register_evidence_ref"),
        "register_checked_at":row.get::<Option<DateTime<Utc>>,_>("register_checked_at").map(|v|v.to_rfc3339()),
        "participation_status":row.get::<Option<String>,_>("participation_status").unwrap_or_else(||"not_asked".into()),
        "participation_updated_at":row.get::<Option<DateTime<Utc>>,_>("participation_updated_at").map(|v|v.to_rfc3339()),
        "callback_phone_confirmed":row.get::<Option<bool>,_>("callback_phone_confirmed").unwrap_or(false),
        "outreach_channel":row.get::<Option<String>,_>("outreach_channel"),
        "outreach_status":row.get::<Option<String>,_>("outreach_status"),
        "outreach_sent_at":row.get::<Option<DateTime<Utc>>,_>("outreach_sent_at").map(|v|v.to_rfc3339()),
        "follow_up_due_at":row.get::<Option<DateTime<Utc>>,_>("follow_up_due_at").map(|v|v.to_rfc3339()),
        "opted_out_at":row.get::<Option<DateTime<Utc>>,_>("opted_out_at").map(|v|v.to_rfc3339()),
        "generated_links":row.get::<i64,_>("generated_links"),"opened_links":row.get::<i64,_>("opened_links"),
        "latest_opened_at":row.get::<Option<DateTime<Utc>>,_>("latest_opened_at").map(|v|v.to_rfc3339()),
        "active_grant_id":row.get::<Option<String>,_>("active_grant_id"),
        "active_link_expires_at":row.get::<Option<DateTime<Utc>>,_>("active_link_expires_at").map(|v|v.to_rfc3339())
    })).collect::<Vec<_>>(),
    "metrics":{
        "window_days":days,
        "fresh_availability_vendors":fresh_availability_vendors,
        "qualified_couples":qualified_couples,
        "availability_vendors_maintained":availability_vendors_maintained,
        "completed_venue_enquiries":completed_venue_enquiries,
        "celebrant_funnel":{
            "discovered":funnel.get::<i64,_>("discovered"),
            "listed":funnel.get::<i64,_>("listed"),
            "invited":funnel.get::<i64,_>("invited"),
            "opened":funnel.get::<i64,_>("opened"),
            "configured":funnel.get::<i64,_>("configured"),
            "opted_in":funnel.get::<i64,_>("opted_in"),
            "published":funnel.get::<i64,_>("published"),
            "engaged":funnel.get::<i64,_>("engaged"),
            "exceptions":funnel.get::<i64,_>("exceptions")
        },
        "series":series,
        "definitions":{
            "qualified_couples":"Distinct wedding plans reaching the existing activation projection in the selected period; no plan content is read.",
            "fresh_availability_vendors":"Distinct vendors with unexpired availability confirmed or explicitly maintained in the last 30 days.",
            "availability_vendors_maintained":"Distinct vendors with an authoritative availability state change on each Sydney calendar day.",
            "completed_venue_enquiries":"Distinct venue enquiries with delivery or acknowledgement evidence; drafts and provider acceptance alone are excluded."
        },
        "timezone":"Australia/Sydney",
        "generated_at":Utc::now().to_rfc3339()
    },
    "readiness":{
        "management_links_configured":pepper().is_some(),
        "consultations_enabled":consultations_enabled,
        "phone_verification_configured":phone_verification_configured,
        "notice":if !consultations_enabled { "Consultation rollout is disabled globally; individual celebrant setup may still be prepared." } else if !phone_verification_configured { "Consultations are enabled but couple phone verification is not configured." } else { "Consultation runtime gates are configured; individual eligibility still applies." }
    }})))
}

#[derive(Deserialize)]
pub(super) struct AdminMetricsQuery {
    days: Option<i32>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct CreateLinkRequest {
    vendor_id: String,
    expires_in_days: Option<i64>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct CreateLinksBatchRequest {
    vendor_ids: Vec<String>,
    expires_in_days: Option<i64>,
    replace_active: Option<bool>,
    preserve_existing: Option<bool>,
}

pub(super) fn normalize_batch_vendor_ids(
    values: &[String],
) -> Result<std::collections::BTreeSet<String>, (StatusCode, String)> {
    let vendor_ids = values
        .iter()
        .map(|value| clean(value, 160))
        .filter(|value| !value.is_empty())
        .collect::<std::collections::BTreeSet<_>>();
    if vendor_ids.is_empty() || vendor_ids.len() > 100 {
        return Err((
            StatusCode::BAD_REQUEST,
            "Choose between 1 and 100 celebrants.".into(),
        ));
    }
    Ok(vendor_ids)
}

async fn create_link_for_vendor(
    state: &AppState,
    user_id: &str,
    vendor_id: &str,
    days: i64,
    replace_active: bool,
) -> Result<Value, (StatusCode, String)> {
    if !(1..=MAX_GRANT_DAYS).contains(&days) {
        return Err((
            StatusCode::BAD_REQUEST,
            "Expiry must be between 1 and 14 days.".into(),
        ));
    }
    let pepper = pepper().ok_or((
        StatusCode::SERVICE_UNAVAILABLE,
        "Secure vendor links are not configured.".into(),
    ))?;
    let vendor_id = clean(vendor_id, 160);
    let mut tx = state.db.pool.begin().await.map_err(db_error)?;
    // Serialise even the first grant for a vendor. Locking only a grant row is
    // insufficient when there is no row yet and two batch requests arrive at
    // the same time.
    let vendor = sqlx::query("SELECT v.vendor_slug,v.vendor_name,v.category,COALESCE(o.status='opted_out',FALSE) opted_out FROM wedding_vendors v LEFT JOIN wedding_celebrant_outreach o ON o.vendor_id=v.vendor_id WHERE v.vendor_id=$1 AND v.status='active' FOR UPDATE OF v")
        .bind(&vendor_id).fetch_optional(&mut *tx).await.map_err(db_error)?.ok_or((StatusCode::NOT_FOUND,"Celebrant listing not found.".into()))?;
    if vendor.get::<bool, _>("opted_out") {
        return Err((
            StatusCode::CONFLICT,
            "This celebrant opted out of outreach. No management link was created.".into(),
        ));
    }
    let active = sqlx::query_scalar::<_, String>(
        "SELECT grant_id FROM wedding_celebrant_management_grants WHERE vendor_id=$1 AND status IN ('active','exchanged') AND expires_at>NOW() ORDER BY created_at DESC LIMIT 1",
    )
    .bind(&vendor_id)
    .fetch_optional(&mut *tx)
    .await
    .map_err(db_error)?;
    if active.is_some() && !replace_active {
        return Err((
            StatusCode::CONFLICT,
            "This celebrant already has an active link. Keep it or explicitly replace it.".into(),
        ));
    }
    let token = fresh_secret("wcc");
    let prefix = token_prefix(&token, "wcc").ok_or_else(unavailable)?;
    let digest = mac(&pepper, &token).ok_or_else(unavailable)?;
    let grant_id = format!("wcc_grant_{}", Ulid::new());
    let expires_at = Utc::now() + ChronoDuration::days(days);
    let generation = sqlx::query_scalar::<_, i64>("SELECT COALESCE(MAX(generation),0)+1 FROM wedding_celebrant_management_grants WHERE vendor_id=$1")
        .bind(&vendor_id).fetch_one(&mut *tx).await.map_err(db_error)?;
    let scopes = if vendor
        .get::<String, _>("category")
        .trim()
        .eq_ignore_ascii_case("celebrant")
    {
        vec!["consultation_availability", "wedding_date_availability"]
    } else {
        vec!["wedding_date_availability"]
    };
    sqlx::query("INSERT INTO wedding_celebrant_management_grants(grant_id,vendor_id,token_prefix,token_digest,generation,expires_at,created_by_user_id,capability_scopes) VALUES($1,$2,$3,$4,$5,$6,$7,$8)")
        .bind(&grant_id).bind(&vendor_id).bind(prefix).bind(digest).bind(generation).bind(expires_at).bind(user_id).bind(&scopes)
        .execute(&mut *tx).await.map_err(db_error)?;
    record_event(
        &mut tx,
        Some(&grant_id),
        &vendor_id,
        "link_created",
        &format!("link-{grant_id}"),
        json!({"generation":generation,"rotated":0,"batch_safe":!replace_active}),
    )
    .await?;
    tx.commit().await.map_err(db_error)?;
    Ok(json!({
        "grant_id":grant_id,"vendor_id":vendor_id,"vendor_slug":vendor.get::<String,_>("vendor_slug"),"vendor_name":vendor.get::<String,_>("vendor_name"),
        "management_url":format!("{}/workspace/vendor.html#celebrant_management={token}",management_base_url()),
        "expires_at":expires_at.to_rfc3339(),"generation":generation,"rotated_previous_links":false,
        "notice":"This private link is shown once and manages only this vendor's availability. Valid older links remain usable."
    }))
}

pub(super) async fn create_link_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    request: Request,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = operator(&state, &headers, "celebrant-management-link-create").await?;
    let request: CreateLinkRequest = authenticated_body(request).await?;
    let days = request.expires_in_days.unwrap_or(14);
    Ok(Json(
        create_link_for_vendor(&state, &user.id, &request.vendor_id, days, true).await?,
    ))
}

pub(super) async fn create_links_batch_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    request: Request,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = operator(&state, &headers, "celebrant-management-link-batch").await?;
    let request: CreateLinksBatchRequest = authenticated_body(request).await?;
    let days = request.expires_in_days.unwrap_or(14);
    if !(1..=MAX_GRANT_DAYS).contains(&days) {
        return Err((
            StatusCode::BAD_REQUEST,
            "Expiry must be between 1 and 14 days.".into(),
        ));
    }
    let vendor_ids = normalize_batch_vendor_ids(&request.vendor_ids)?;
    if request.replace_active.unwrap_or(false) {
        return Err((
            StatusCode::BAD_REQUEST,
            "Use explicit revocation to invalidate an old link.".into(),
        ));
    }
    let replace_active = request.preserve_existing.unwrap_or(false);
    let mut created = Vec::new();
    let mut skipped = Vec::new();
    for vendor_id in vendor_ids {
        match create_link_for_vendor(&state, &user.id, &vendor_id, days, replace_active).await {
            Ok(link) => created.push(link),
            Err((status, message)) => skipped.push(json!({
                "vendor_id":vendor_id,
                "status":status.as_u16(),
                "reason":message,
            })),
        }
    }
    Ok(Json(json!({
        "created":created,
        "skipped":skipped,
        "replace_active":replace_active,
        "notice":"Bearer links are returned once. They are not stored in plaintext or included in analytics."
    })))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct RevokeRequest {
    vendor_id: String,
}

pub(super) async fn revoke_link_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(grant_id): Path<String>,
    request: Request,
) -> Result<Json<Value>, (StatusCode, String)> {
    operator(&state, &headers, "celebrant-management-link-revoke").await?;
    let request: RevokeRequest = authenticated_body(request).await?;
    let mut tx = state.db.pool.begin().await.map_err(db_error)?;
    let vendor_id = clean(&request.vendor_id, 160);
    let changed=sqlx::query("UPDATE wedding_celebrant_management_grants SET status='revoked',revoked_at=NOW() WHERE grant_id=$1 AND vendor_id=$2 AND status IN ('active','exchanged')")
        .bind(clean(&grant_id,160)).bind(&vendor_id).execute(&mut *tx).await.map_err(db_error)?;
    if changed.rows_affected() != 1 {
        return Err((StatusCode::NOT_FOUND, "Active link not found.".into()));
    }
    sqlx::query("UPDATE wedding_celebrant_management_sessions SET consumed_at=COALESCE(consumed_at,NOW()) WHERE grant_id=$1")
        .bind(&grant_id).execute(&mut *tx).await.map_err(db_error)?;
    record_event(
        &mut tx,
        Some(&grant_id),
        &vendor_id,
        "link_revoked",
        &format!("revoke-{grant_id}"),
        json!({}),
    )
    .await?;
    tx.commit().await.map_err(db_error)?;
    Ok(Json(json!({"status":"revoked"})))
}

#[derive(Deserialize)]
pub(super) struct CalendarVendorsQuery {
    category: Option<String>,
    after: Option<String>,
    through: Option<String>,
}

pub(super) async fn calendar_vendors_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Query(query): Query<CalendarVendorsQuery>,
) -> Result<Json<Value>, (StatusCode, String)> {
    operator(&state, &headers, "vendor-calendar-inventory").await?;
    let category = query
        .category
        .map(|v| clean(&v, 80))
        .filter(|v| !v.is_empty());
    let after = query.after.map(|v| clean(&v, 160)).unwrap_or_default();
    let through = match query.through {
        Some(value) => clean(&value, 160),
        None => sqlx::query_scalar::<_, Option<String>>(
            "SELECT MAX(vendor_id) FROM wedding_vendors WHERE status='active'",
        )
        .fetch_one(&state.db.pool)
        .await
        .map_err(db_error)?
        .unwrap_or_default(),
    };
    let rows=sqlx::query("SELECT v.vendor_id,v.vendor_name,v.category FROM wedding_vendors v WHERE v.status='active' AND v.vendor_id>$1 AND v.vendor_id<=$2 AND ($3::text IS NULL OR lower(trim(v.category))=lower($3)) AND NOT EXISTS(SELECT 1 FROM wedding_celebrant_outreach o WHERE o.vendor_id=v.vendor_id AND o.status='opted_out') ORDER BY v.vendor_id LIMIT 101")
        .bind(&after).bind(&through).bind(&category).fetch_all(&state.db.pool).await.map_err(db_error)?;
    let more = rows.len() > 100;
    let items=rows.iter().take(100).map(|r|json!({"vendor_id":r.get::<String,_>("vendor_id"),"vendor_name":r.get::<String,_>("vendor_name"),"category":r.get::<String,_>("category")})).collect::<Vec<_>>();
    let next = if more {
        items
            .last()
            .and_then(|v| v.get("vendor_id"))
            .cloned()
            .unwrap_or(Value::Null)
    } else {
        Value::Null
    };
    let categories=sqlx::query_scalar::<_,String>("SELECT DISTINCT lower(trim(category)) FROM wedding_vendors WHERE status='active' ORDER BY 1").fetch_all(&state.db.pool).await.map_err(db_error)?;
    Ok(Json(
        json!({"items":items,"next_cursor":next,"through":through,"categories":categories}),
    ))
}
