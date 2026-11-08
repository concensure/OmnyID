//! Operator-only Limited Specials adoption and link issuance.

use super::*;
use axum::routing::{get, post};

pub(super) fn routes() -> Router<Arc<AppState>> {
    Router::new()
        .route("/admin/wedding/vendor-specials", get(metrics_http))
        .route(
            "/admin/wedding/vendor-specials/management-links",
            post(create_link_http),
        )
}

fn require_operator(user: &crate::db::UserRecord) -> Result<(), (StatusCode, String)> {
    super::super::cost_controls::operator_access_allowed(&user.email)
        .then_some(())
        .ok_or((StatusCode::FORBIDDEN, "Operator access is required.".into()))
}

pub(super) async fn metrics_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    require_operator(&user)?;
    let rows = sqlx::query(r#"SELECT offer.category,
        COUNT(DISTINCT offer.offer_id)::bigint offers,
        COUNT(DISTINCT offer.offer_id) FILTER (WHERE offer.publication_state='active')::bigint active_offers,
        COUNT(DISTINCT slot.slot_id) FILTER (WHERE slot.state IN ('available','enquiry_received') AND slot.confirmation_expires_at>NOW())::bigint fresh_dates,
        COUNT(DISTINCT slot.slot_id) FILTER (WHERE slot.state='stale' OR slot.confirmation_expires_at<=NOW())::bigint stale_dates,
        COUNT(DISTINCT enquiry.link_id)::bigint enquiries,
        COUNT(DISTINCT event.event_id) FILTER (WHERE event.event_kind='delivery_failed')::bigint delivery_failures
      FROM wedding_vendor_special_offers offer
      LEFT JOIN wedding_vendor_special_offer_slots slot ON slot.offer_id=offer.offer_id
      LEFT JOIN wedding_vendor_special_offer_enquiries enquiry ON enquiry.offer_id=offer.offer_id
      LEFT JOIN wedding_vendor_special_offer_events event ON event.offer_id=offer.offer_id
      GROUP BY offer.category ORDER BY active_offers DESC,offer.category"#)
        .fetch_all(&state.db.pool).await.map_err(database_failure)?;
    let outcomes = sqlx::query("SELECT outcome,COUNT(*)::bigint count FROM wedding_vendor_special_offer_outcome_projection GROUP BY outcome ORDER BY outcome")
        .fetch_all(&state.db.pool).await.map_err(database_failure)?;
    let coverage = sqlx::query(r#"SELECT COUNT(*)::bigint active_vendors,
        COUNT(*) FILTER (WHERE
          EXISTS (SELECT 1 FROM wedding_vendor_attributes a WHERE a.vendor_id=v.vendor_id AND a.attribute_key='latitude' AND a.status IN ('known','estimated') AND jsonb_typeof(a.value)='number')
          AND EXISTS (SELECT 1 FROM wedding_vendor_attributes a WHERE a.vendor_id=v.vendor_id AND a.attribute_key='longitude' AND a.status IN ('known','estimated') AND jsonb_typeof(a.value)='number'))::bigint mapped_vendors
        FROM wedding_vendors v WHERE v.status='active'"#)
        .fetch_one(&state.db.pool).await.map_err(database_failure)?;
    let vendors = sqlx::query(r#"SELECT v.vendor_id,v.vendor_slug,v.vendor_name,v.category,v.claim_status,
        latest.offer_id,latest.publication_state,
        COUNT(DISTINCT c.claim_id)::bigint claim_count,
        COUNT(DISTINCT g.grant_id)::bigint generated_links,
        COUNT(DISTINCT s.session_id)::bigint visits,
        COUNT(DISTINCT a.user_id)::bigint attributed_signups,
        MAX(c.created_at) latest_claim_at,MAX(g.created_at) latest_link_at,MAX(s.created_at) latest_visit_at
      FROM wedding_vendors v
      LEFT JOIN LATERAL (SELECT o.offer_id,o.publication_state FROM wedding_vendor_special_offers o WHERE o.vendor_id=v.vendor_id ORDER BY o.updated_at DESC,o.offer_id DESC LIMIT 1) latest ON TRUE
      LEFT JOIN wedding_vendor_claims c ON c.vendor_id=v.vendor_id
      LEFT JOIN wedding_vendor_special_offer_grants g ON g.vendor_id=v.vendor_id
      LEFT JOIN wedding_vendor_special_offer_sessions s ON s.grant_id=g.grant_id
      LEFT JOIN wedding_vendor_special_offer_grant_attributions a ON a.grant_id=g.grant_id
      WHERE v.status='active' AND (latest.offer_id IS NOT NULL OR c.created_at>NOW()-INTERVAL '30 days' OR g.created_at>NOW()-INTERVAL '30 days')
      GROUP BY v.vendor_id,v.vendor_slug,v.vendor_name,v.category,v.claim_status,latest.offer_id,latest.publication_state
      ORDER BY GREATEST(COALESCE(MAX(g.created_at),'epoch'),COALESCE(MAX(c.created_at),'epoch')) DESC,v.vendor_name"#)
        .fetch_all(&state.db.pool).await.map_err(database_failure)?;
    Ok(Json(json!({
      "categories":rows.into_iter().map(|row|json!({"category":row.get::<String,_>("category"),"offers":row.get::<i64,_>("offers"),"active_offers":row.get::<i64,_>("active_offers"),"fresh_dates":row.get::<i64,_>("fresh_dates"),"stale_dates":row.get::<i64,_>("stale_dates"),"enquiries":row.get::<i64,_>("enquiries"),"delivery_failures":row.get::<i64,_>("delivery_failures")})).collect::<Vec<_>>(),
      "outcomes":outcomes.into_iter().map(|row|json!({"outcome":row.get::<String,_>("outcome"),"count":row.get::<i64,_>("count")})).collect::<Vec<_>>(),
      "map_coverage":{"active_vendors":coverage.get::<i64,_>("active_vendors"),"mapped_vendors":coverage.get::<i64,_>("mapped_vendors")},
      "vendors":vendors.into_iter().map(|row|json!({"vendor_id":row.get::<String,_>("vendor_id"),"vendor_slug":row.get::<String,_>("vendor_slug"),"vendor_name":row.get::<String,_>("vendor_name"),"category":row.get::<String,_>("category"),"claim_status":row.get::<String,_>("claim_status"),"offer_id":row.get::<Option<String>,_>("offer_id"),"offer_state":row.get::<Option<String>,_>("publication_state"),"claim_count":row.get::<i64,_>("claim_count"),"generated_links":row.get::<i64,_>("generated_links"),"visits":row.get::<i64,_>("visits"),"attributed_signups":row.get::<i64,_>("attributed_signups"),"latest_claim_at":row.get::<Option<chrono::DateTime<Utc>>,_>("latest_claim_at").map(|v|v.to_rfc3339()),"latest_link_at":row.get::<Option<chrono::DateTime<Utc>>,_>("latest_link_at").map(|v|v.to_rfc3339()),"latest_visit_at":row.get::<Option<chrono::DateTime<Utc>>,_>("latest_visit_at").map(|v|v.to_rfc3339())})).collect::<Vec<_>>()
    })))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct CreateOperatorLinkRequest {
    vendor_id: String,
    expires_in_days: Option<i64>,
}

async fn create_link_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<CreateOperatorLinkRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    require_operator(&user)?;
    enforce_rate_limit(
        &state,
        authenticated_rate_limit_key("admin-vendor-special-link", &headers),
        RateLimitPolicy {
            max_requests: 20,
            window: Duration::from_secs(60),
        },
    )
    .await?;
    let offer = sqlx::query("SELECT offer_id FROM wedding_vendor_special_offers WHERE vendor_id=$1 ORDER BY updated_at DESC,offer_id DESC LIMIT 1")
        .bind(clean(&request.vendor_id,160)).fetch_optional(&state.db.pool).await.map_err(database_failure)?
        .ok_or((StatusCode::CONFLICT,"Ask the vendor to add one available date before generating a calendar link.".into()))?;
    let offer_id: String = offer.get("offer_id");
    capability::issue_grant(
        &state,
        &user.id,
        &request.vendor_id,
        &offer_id,
        capability::ALL_OPERATIONS
            .iter()
            .map(|value| (*value).to_string())
            .collect(),
        request.expires_in_days.unwrap_or(14),
    )
    .await
    .map(Json)
}
