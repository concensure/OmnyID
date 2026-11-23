use std::sync::Arc;

use axum::{
    Json, Router,
    body::Body,
    extract::{Query, State},
    http::{HeaderMap, Response, StatusCode, header},
    response::IntoResponse,
    routing::get,
};
use chrono::{Days, NaiveDate, Utc};
use chrono_tz::Australia::Sydney;
use serde::Deserialize;
use serde_json::{Value, json};

use crate::growth_analytics::{
    KPI_DEFINITION_VERSION, compare_growth_kpis, formula_safe_cell, trailing_sydney_window,
};

use super::{
    AppState, auth::authenticated_user, cost_controls::operator_access_allowed,
    readiness_error_to_http,
};

const MAX_PAGE_SIZE: u16 = 100;
const MAX_EXPORT_ROWS: i64 = 5_000;

pub(super) fn routes() -> Router<Arc<AppState>> {
    Router::new()
        .route("/admin/growth/overview", get(overview_http))
        .route("/admin/growth/campaigns", get(campaigns_http))
        .route("/admin/growth/cohorts", get(cohorts_http))
        .route(
            "/admin/growth/benchmarks",
            get(benchmarks_http).post(create_benchmark_http),
        )
        .route("/admin/growth/quality", get(quality_http))
        .route("/admin/growth/export.csv", get(export_http))
}

#[derive(Clone, Debug, Deserialize)]
struct GrowthQuery {
    from: Option<NaiveDate>,
    through: Option<NaiveDate>,
    source: Option<String>,
    attribution_model: Option<String>,
    page: Option<u32>,
    page_size: Option<u16>,
}

#[derive(Clone, Debug)]
struct ResolvedQuery {
    from: NaiveDate,
    through: NaiveDate,
    source: Option<String>,
    attribution_model: String,
    page: u32,
    page_size: u16,
}

#[derive(Clone, Debug, Deserialize)]
struct GrowthBenchmarkRequest {
    kpi_key: String,
    target_value: i64,
    effective_from: NaiveDate,
    effective_through: Option<NaiveDate>,
    rationale: String,
}

fn benchmark_policy(key: &str) -> Option<(&'static str, &'static str)> {
    match key {
        "cost_per_landing_session" | "cost_per_activated_wedding" | "paid_cac_30d" => {
            Some(("aud_minor_per_unit", "lower_is_better"))
        }
        "signup_rate" | "activation_rate_7d" | "return_rate_days_1_to_7" => {
            Some(("basis_points", "higher_is_better"))
        }
        _ => None,
    }
}

fn growth_enabled_value(value: Option<&str>) -> bool {
    value.is_some_and(|value| {
        matches!(
            value.trim().to_ascii_lowercase().as_str(),
            "1" | "true" | "yes" | "on"
        )
    })
}

fn growth_enabled() -> bool {
    growth_enabled_value(
        std::env::var("OMNYID_GROWTH_ANALYTICS_ENABLED")
            .ok()
            .as_deref(),
    )
}

async fn operator(
    state: &AppState,
    headers: &HeaderMap,
) -> Result<crate::db::UserRecord, (StatusCode, String)> {
    if !growth_enabled() {
        return Err((StatusCode::NOT_FOUND, "Growth analytics is disabled".into()));
    }
    let user = authenticated_user(&state.db, headers).await?;
    if !operator_access_allowed(&user.email) {
        return Err((StatusCode::FORBIDDEN, "operator access required".into()));
    }
    Ok(user)
}

fn resolved_query(query: GrowthQuery) -> Result<ResolvedQuery, (StatusCode, String)> {
    let today = Utc::now().with_timezone(&Sydney).date_naive();
    let through = query.through.unwrap_or(today);
    let from = query
        .from
        .unwrap_or_else(|| through.checked_sub_days(Days::new(29)).unwrap_or(through));
    crate::db::validate_growth_date_range(from, through)
        .map_err(|message| (StatusCode::BAD_REQUEST, message.into()))?;
    let attribution_model = query
        .attribution_model
        .unwrap_or_else(|| "first_touch".into());
    if !matches!(
        attribution_model.as_str(),
        "first_touch" | "last_non_direct_touch"
    ) {
        return Err((
            StatusCode::BAD_REQUEST,
            "unsupported attribution model".into(),
        ));
    }
    let source = query
        .source
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty() && value.len() <= 80);
    Ok(ResolvedQuery {
        from,
        through,
        source,
        attribution_model,
        page: query.page.unwrap_or(1).clamp(1, 10_000),
        page_size: query.page_size.unwrap_or(25).clamp(1, MAX_PAGE_SIZE),
    })
}

fn metadata(query: &ResolvedQuery) -> Value {
    json!({
        "definition_version": KPI_DEFINITION_VERSION,
        "timezone": "Australia/Sydney",
        "attribution_model": query.attribution_model,
        "from": query.from,
        "through": query.through,
        "source": query.source,
        "completeness": {
            "raw_attribution_retention_days": 30,
            "historic_source_coverage_may_be_unavailable": true
        }
    })
}

async fn overview_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Query(query): Query<GrowthQuery>,
) -> Result<Json<Value>, (StatusCode, String)> {
    operator(&state, &headers).await?;
    let query = resolved_query(query)?;
    let days = (query.through - query.from).num_days() + 1;
    let end_exclusive = query
        .through
        .checked_add_days(Days::new(1))
        .ok_or((StatusCode::BAD_REQUEST, "invalid report end".into()))?;
    let current_window = trailing_sydney_window(end_exclusive, days as u64)
        .ok_or((StatusCode::BAD_REQUEST, "invalid report window".into()))?;
    let previous_through = query
        .from
        .checked_sub_days(Days::new(1))
        .ok_or((StatusCode::BAD_REQUEST, "invalid previous period".into()))?;
    let previous_from = previous_through
        .checked_sub_days(Days::new((days - 1) as u64))
        .ok_or((StatusCode::BAD_REQUEST, "invalid previous period".into()))?;
    let current = state
        .db
        .growth_period_facts(query.from, query.through)
        .await
        .map_err(readiness_error_to_http)?;
    let previous = state
        .db
        .growth_period_facts(previous_from, previous_through)
        .await
        .map_err(readiness_error_to_http)?;
    let comparison = compare_growth_kpis(current_window, query.through, &current, &previous)
        .ok_or((StatusCode::BAD_REQUEST, "invalid comparable period".into()))?;
    Ok(Json(json!({
        "meta": metadata(&query),
        "comparison": comparison,
        "funnel": {
            "landing_sessions": current.first_party_landing_sessions,
            "registered_weddings": current.registered_weddings,
            "activated_weddings": current.activated_acquired_weddings,
            "returned_weddings_days_1_to_7": current.returned_weddings_days_1_to_7,
            "paid_weddings_within_30d": current.paid_weddings_within_30d
        }
    })))
}

async fn campaigns_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Query(query): Query<GrowthQuery>,
) -> Result<Json<Value>, (StatusCode, String)> {
    operator(&state, &headers).await?;
    let query = resolved_query(query)?;
    let offset = i64::from(query.page.saturating_sub(1)) * i64::from(query.page_size);
    let mut rows = state
        .db
        .growth_campaign_rows(
            query.from,
            query.through,
            offset,
            i64::from(query.page_size) + 1,
            query.source.as_deref(),
        )
        .await
        .map_err(readiness_error_to_http)?;
    let has_more = rows.len() > usize::from(query.page_size);
    rows.truncate(usize::from(query.page_size));
    Ok(Json(json!({
        "meta": metadata(&query),
        "page": query.page,
        "page_size": query.page_size,
        "has_more": has_more,
        "items": rows
    })))
}

async fn cohorts_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Query(query): Query<GrowthQuery>,
) -> Result<Json<Value>, (StatusCode, String)> {
    operator(&state, &headers).await?;
    let query = resolved_query(query)?;
    let rows = state
        .db
        .growth_cohort_rows(query.from, query.through)
        .await
        .map_err(readiness_error_to_http)?;
    Ok(Json(json!({"meta":metadata(&query),"items":rows})))
}

async fn benchmarks_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Query(query): Query<GrowthQuery>,
) -> Result<Json<Value>, (StatusCode, String)> {
    operator(&state, &headers).await?;
    let query = resolved_query(query)?;
    let items = state
        .db
        .list_growth_benchmark_revisions(query.from, query.through)
        .await
        .map_err(readiness_error_to_http)?;
    let notice = items
        .is_empty()
        .then_some("No operator target has been recorded. OmnyID does not fabricate benchmarks.");
    Ok(Json(json!({
        "meta": metadata(&query),
        "items": items,
        "notice": notice
    })))
}

async fn create_benchmark_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<GrowthBenchmarkRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = operator(&state, &headers).await?;
    let key = request.kpi_key.trim();
    let (unit, direction) =
        benchmark_policy(key).ok_or((StatusCode::BAD_REQUEST, "unsupported KPI key".into()))?;
    if request.target_value < 0 || (unit == "basis_points" && request.target_value > 10_000) {
        return Err((
            StatusCode::BAD_REQUEST,
            "target is outside its KPI unit".into(),
        ));
    }
    if request
        .effective_through
        .is_some_and(|through| through < request.effective_from)
    {
        return Err((
            StatusCode::BAD_REQUEST,
            "effective-through precedes effective-from".into(),
        ));
    }
    let rationale = request.rationale.trim();
    if !(10..=500).contains(&rationale.len()) {
        return Err((
            StatusCode::BAD_REQUEST,
            "rationale must be 10 to 500 characters".into(),
        ));
    }
    let revision = state
        .db
        .create_growth_benchmark_revision(
            &user.id,
            crate::db::GrowthBenchmarkWrite {
                kpi_key: key,
                target_value: request.target_value,
                unit,
                direction,
                effective_from: request.effective_from,
                effective_through: request.effective_through,
                rationale,
            },
        )
        .await
        .map_err(readiness_error_to_http)?;
    Ok(Json(json!({"revision":revision})))
}

async fn quality_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Query(query): Query<GrowthQuery>,
) -> Result<Json<Value>, (StatusCode, String)> {
    operator(&state, &headers).await?;
    let query = resolved_query(query)?;
    let quality = state
        .db
        .growth_quality_summary(query.from, query.through)
        .await
        .map_err(readiness_error_to_http)?;
    Ok(Json(json!({"meta":metadata(&query),"quality":quality})))
}

async fn export_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Query(query): Query<GrowthQuery>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let user = operator(&state, &headers).await?;
    let query = resolved_query(query)?;
    let rows = state
        .db
        .growth_campaign_rows(
            query.from,
            query.through,
            0,
            MAX_EXPORT_ROWS,
            query.source.as_deref(),
        )
        .await
        .map_err(readiness_error_to_http)?;
    let mut writer = csv::Writer::from_writer(Vec::new());
    writer
        .write_record([
            "definition_version",
            "from",
            "through",
            "attribution_model",
            "source",
            "medium",
            "campaign",
            "intent",
            "spend_aud_minor",
            "meta_landing_views",
            "first_party_landing_sessions",
            "registered_weddings",
            "activated_weddings",
            "returned_weddings_days_1_to_7",
            "paid_weddings_within_30d",
            "gross_minor",
            "refunded_minor",
        ])
        .map_err(|_| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                "CSV export failed".into(),
            )
        })?;
    for row in &rows {
        writer
            .write_record([
                KPI_DEFINITION_VERSION.to_string(),
                query.from.to_string(),
                query.through.to_string(),
                query.attribution_model.clone(),
                formula_safe_cell(&row.source),
                formula_safe_cell(&row.medium),
                formula_safe_cell(&row.campaign),
                formula_safe_cell(&row.intent),
                row.spend_aud_minor.to_string(),
                row.meta_landing_views.to_string(),
                row.first_party_landing_sessions.to_string(),
                row.registered_weddings.to_string(),
                row.activated_weddings.to_string(),
                row.returned_weddings_days_1_to_7.to_string(),
                row.paid_weddings_within_30d.to_string(),
                row.gross_minor.to_string(),
                row.refunded_minor.to_string(),
            ])
            .map_err(|_| {
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "CSV export failed".into(),
                )
            })?;
    }
    let bytes = writer.into_inner().map_err(|_| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            "CSV export failed".into(),
        )
    })?;
    state
        .db
        .audit_growth_export(
            &user.id,
            json!({
                "definition_version":KPI_DEFINITION_VERSION,"from":query.from,"through":query.through,
                "source":query.source,"attribution_model":query.attribution_model,"row_count":rows.len()
            }),
        )
        .await
        .map_err(readiness_error_to_http)?;
    Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, "text/csv; charset=utf-8")
        .header(
            header::CONTENT_DISPOSITION,
            "attachment; filename=omnyid-growth-campaigns.csv",
        )
        .body(Body::from(bytes))
        .map_err(|_| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                "CSV response failed".into(),
            )
        })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn feature_flag_is_false_by_default_and_strict() {
        assert!(!growth_enabled_value(None));
        assert!(!growth_enabled_value(Some("enabled")));
        assert!(growth_enabled_value(Some("true")));
        assert!(growth_enabled_value(Some("1")));
    }

    #[test]
    fn query_rejects_unbounded_and_unknown_attribution() {
        let too_long = GrowthQuery {
            from: Some(NaiveDate::from_ymd_opt(2025, 1, 1).unwrap()),
            through: Some(NaiveDate::from_ymd_opt(2026, 2, 1).unwrap()),
            source: None,
            attribution_model: None,
            page: None,
            page_size: None,
        };
        assert!(resolved_query(too_long).is_err());
        let unknown = GrowthQuery {
            from: None,
            through: None,
            source: None,
            attribution_model: Some("last_click".into()),
            page: None,
            page_size: None,
        };
        assert!(resolved_query(unknown).is_err());
    }

    #[test]
    fn benchmark_policy_fixes_unit_and_direction_per_kpi() {
        assert_eq!(
            benchmark_policy("signup_rate"),
            Some(("basis_points", "higher_is_better"))
        );
        assert_eq!(
            benchmark_policy("paid_cac_30d"),
            Some(("aud_minor_per_unit", "lower_is_better"))
        );
        assert_eq!(benchmark_policy("arbitrary_score"), None);
    }
}
