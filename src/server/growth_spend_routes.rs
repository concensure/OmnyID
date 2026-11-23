use std::sync::Arc;

use axum::{
    Json, Router,
    extract::{DefaultBodyLimit, State},
    http::{HeaderMap, StatusCode},
    routing::post,
};
use base64::{Engine as _, engine::general_purpose::STANDARD};
use serde::Deserialize;
use serde_json::{Value, json};

use crate::growth_analytics::{
    MAX_SPEND_CSV_BYTES, SpendConversion, SpendGrain, formula_safe_cell, preview_spend_csv,
};

use super::{
    AppState, auth::authenticated_user, cost_controls::operator_access_allowed,
    readiness_error_to_http,
};

const MAX_BASE64_CHARS: usize = ((MAX_SPEND_CSV_BYTES + 2) / 3) * 4 + 16;

pub(super) fn routes() -> Router<Arc<AppState>> {
    Router::new()
        .route("/admin/growth/spend/preview", post(preview_http))
        .route("/admin/growth/spend/commit", post(commit_http))
        .route("/admin/growth/spend/manual", post(manual_http))
        .route("/admin/growth/spend/adjust", post(adjust_http))
        .layer(DefaultBodyLimit::max(7 * 1024 * 1024))
}

#[derive(Clone, Deserialize)]
struct SpendUploadRequest {
    filename: String,
    platform: String,
    csv_base64: String,
    source_currency: String,
    aud_rate_micros: i64,
    conversion_source: String,
    conversion_date: chrono::NaiveDate,
}

#[derive(Deserialize)]
struct SpendCommitRequest {
    #[serde(flatten)]
    upload: SpendUploadRequest,
    selected_grain: Option<SpendGrain>,
    decision: Option<Value>,
}

#[derive(Deserialize)]
struct SpendAdjustmentRequest {
    spend_row_id: String,
    source_spend_delta_minor: i64,
    aud_spend_delta_minor: i64,
    reason: String,
}

async fn operator(
    state: &AppState,
    headers: &HeaderMap,
) -> Result<crate::db::UserRecord, (StatusCode, String)> {
    let user = authenticated_user(&state.db, headers).await?;
    if !operator_access_allowed(&user.email) {
        return Err((StatusCode::FORBIDDEN, "operator access required".into()));
    }
    Ok(user)
}

fn decode_upload(request: &SpendUploadRequest) -> Result<Vec<u8>, (StatusCode, String)> {
    if request.csv_base64.len() > MAX_BASE64_CHARS {
        return Err((StatusCode::PAYLOAD_TOO_LARGE, "CSV exceeds 5 MiB".into()));
    }
    let bytes = STANDARD
        .decode(request.csv_base64.as_bytes())
        .map_err(|_| (StatusCode::BAD_REQUEST, "CSV encoding is invalid".into()))?;
    if bytes.is_empty() || bytes.len() > MAX_SPEND_CSV_BYTES {
        return Err((
            StatusCode::PAYLOAD_TOO_LARGE,
            "CSV must be between 1 byte and 5 MiB".into(),
        ));
    }
    Ok(bytes)
}

fn conversion(request: &SpendUploadRequest) -> SpendConversion {
    SpendConversion {
        source_currency: request.source_currency.trim().to_ascii_uppercase(),
        aud_rate_micros: request.aud_rate_micros,
        source: request.conversion_source.trim().to_string(),
        date: request.conversion_date,
    }
}

fn spend_db_error(error: sqlx::Error) -> (StatusCode, String) {
    match error {
        sqlx::Error::Protocol(message) => (StatusCode::BAD_REQUEST, message),
        other => readiness_error_to_http(other),
    }
}

fn safe_sample(row: &crate::growth_analytics::SpendImportRow) -> Value {
    let mut value = serde_json::to_value(row).unwrap_or_else(|_| json!({}));
    if let Some(object) = value.as_object_mut() {
        for field in [
            "platform",
            "account_id",
            "account_name",
            "campaign_id",
            "campaign_name",
            "ad_set_id",
            "ad_set_name",
            "ad_id",
            "ad_name",
            "creative_id",
            "creative_name",
            "placement",
            "conversion_source",
        ] {
            if let Some(text) = object
                .get_mut(field)
                .and_then(|value| value.as_str())
                .map(str::to_string)
            {
                object[field] = Value::String(formula_safe_cell(&text));
            }
        }
    }
    value
}

async fn preview_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<SpendUploadRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = operator(&state, &headers).await?;
    let bytes = decode_upload(&request)?;
    let preview = preview_spend_csv(&bytes, &request.platform, &conversion(&request));
    state
        .db
        .audit_growth_spend_preview(&user.id, &preview)
        .await
        .map_err(readiness_error_to_http)?;
    Ok(Json(json!({
        "content_sha256": preview.content_sha256,
        "file_bytes": preview.file_bytes,
        "source_row_count": preview.source_row_count,
        "valid_row_count": preview.rows.len(),
        "mapping": preview.mapping,
        "grains": preview.grains,
        "requires_grain_selection": preview.requires_grain_selection,
        "formula_like_cells_neutralised": preview.formula_like_cells,
        "errors": preview.errors.iter().take(200).collect::<Vec<_>>(),
        "errors_truncated": preview.errors.len() > 200,
        "sample_rows": preview.rows.iter().take(50).map(safe_sample).collect::<Vec<_>>(),
    })))
}

async fn commit_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<SpendCommitRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = operator(&state, &headers).await?;
    let bytes = decode_upload(&request.upload)?;
    let preview = preview_spend_csv(
        &bytes,
        &request.upload.platform,
        &conversion(&request.upload),
    );
    let result = state
        .db
        .commit_growth_spend_import(
            &user.id,
            &request.upload.filename,
            &request.upload.platform,
            &preview,
            request.selected_grain,
            request.decision.unwrap_or_else(|| json!({})),
        )
        .await
        .map_err(spend_db_error)?;
    Ok(Json(json!(result)))
}

async fn manual_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<SpendUploadRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = operator(&state, &headers).await?;
    let bytes = decode_upload(&request)?;
    let preview = preview_spend_csv(&bytes, &request.platform, &conversion(&request));
    if preview.source_row_count != 1 {
        return Err((
            StatusCode::BAD_REQUEST,
            "manual entry must contain exactly one row".into(),
        ));
    }
    let result = state
        .db
        .commit_growth_spend_import(
            &user.id,
            &request.filename,
            &request.platform,
            &preview,
            None,
            json!({"entry_mode":"manual"}),
        )
        .await
        .map_err(spend_db_error)?;
    Ok(Json(json!(result)))
}

async fn adjust_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<SpendAdjustmentRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = operator(&state, &headers).await?;
    let result = state
        .db
        .add_growth_spend_adjustment(
            &user.id,
            request.spend_row_id.trim(),
            request.source_spend_delta_minor,
            request.aud_spend_delta_minor,
            &request.reason,
        )
        .await
        .map_err(spend_db_error)?;
    Ok(Json(json!(result)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn base64_limit_and_formula_safe_preview_are_fail_closed() {
        let request = SpendUploadRequest {
            filename: "meta.csv".into(),
            platform: "meta".into(),
            csv_base64: "A".repeat(MAX_BASE64_CHARS + 1),
            source_currency: "AUD".into(),
            aud_rate_micros: 1_000_000,
            conversion_source: "AUD native".into(),
            conversion_date: chrono::NaiveDate::from_ymd_opt(2026, 11, 4).unwrap(),
        };
        assert_eq!(
            decode_upload(&request).unwrap_err().0,
            StatusCode::PAYLOAD_TOO_LARGE
        );
        assert_eq!(formula_safe_cell("@SUM(A1)"), "'@SUM(A1)");
    }
}
