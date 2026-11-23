/*
 * @module-id: rust.server.para-routes
 * @primary-capability: rust.source-module
 * @locs-version: 2.0
 * @stability: active
 * @owner: omnyid
 */

// PARA Navigator â€” classification overlay routes.
//
// Original AFP messages are NEVER mutated. All PARA operations create or update
// a para_classification AFP that references the original via target_id.
//
// para_tags format: ["project:wellness_routine", "area:health"]
// An item may belong to multiple categories simultaneously.

use super::*;
use axum::extract::Query;
use serde::Deserialize;

const MAX_PARA_TAGS: usize = 20;
const MAX_PARA_TAG_LEN: usize = 128;
const MAX_PARA_AUTO_ARCHIVE_TARGETS: usize = 100;
const MAX_PARA_TARGET_ID_LEN: usize = 128;

pub(super) fn routes() -> Router<Arc<AppState>> {
    Router::new()
        .route("/api/para/items", get(para_items_http))
        .route("/api/para/archived", get(para_archived_http))
        .route("/api/para/classify", post(para_classify_http))
        .route("/api/para/archive", post(para_archive_http))
        .route("/api/para/export", get(para_export_http))
        .route(
            "/api/para/auto-archive-candidates",
            get(para_auto_archive_candidates_http),
        )
        .route(
            "/api/para/auto-archive-approve",
            post(para_auto_archive_approve_http),
        )
}

// â”€â”€ GET /api/para/items?prefix=project:&limit=50 â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

#[derive(Deserialize)]
struct ParaItemsQuery {
    prefix: Option<String>,
    limit: Option<i64>,
}

fn para_list_limit(limit: Option<i64>) -> i64 {
    limit.unwrap_or(50).clamp(1, 200)
}

fn normalize_para_tags(tags: Vec<String>) -> Result<Vec<String>, (StatusCode, String)> {
    if tags.len() > MAX_PARA_TAGS {
        return Err((
            StatusCode::BAD_REQUEST,
            format!("para_tags can include at most {MAX_PARA_TAGS} items"),
        ));
    }
    tags.into_iter()
        .map(|tag| {
            let tag = tag.trim().to_string();
            if tag.is_empty() || tag.len() > MAX_PARA_TAG_LEN {
                return Err((
                    StatusCode::BAD_REQUEST,
                    format!("para_tags must be 1-{MAX_PARA_TAG_LEN} characters"),
                ));
            }
            Ok(tag)
        })
        .collect()
}

fn normalize_para_target_id(target_id: String) -> Result<String, (StatusCode, String)> {
    let target_id = target_id.trim().to_string();
    if target_id.is_empty() || target_id.len() > MAX_PARA_TARGET_ID_LEN {
        return Err((
            StatusCode::BAD_REQUEST,
            format!("target_id must be 1-{MAX_PARA_TARGET_ID_LEN} characters"),
        ));
    }
    Ok(target_id)
}

fn normalize_auto_archive_target_ids(
    target_ids: Vec<String>,
) -> Result<Vec<String>, (StatusCode, String)> {
    if target_ids.is_empty() || target_ids.len() > MAX_PARA_AUTO_ARCHIVE_TARGETS {
        return Err((
            StatusCode::BAD_REQUEST,
            format!("target_ids must include 1-{MAX_PARA_AUTO_ARCHIVE_TARGETS} items"),
        ));
    }
    target_ids
        .into_iter()
        .map(normalize_para_target_id)
        .collect()
}

async fn para_items_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Query(q): Query<ParaItemsQuery>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let prefix = q.prefix.as_deref().unwrap_or("project:");
    let limit = para_list_limit(q.limit);
    let items = state
        .db
        .get_para_by_tag_prefix(&user.id, prefix, limit)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    Ok(Json(json!({ "items": items })))
}

// â”€â”€ GET /api/para/archived?limit=50 â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

#[derive(Deserialize)]
struct ArchivedQuery {
    limit: Option<i64>,
}

async fn para_archived_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Query(q): Query<ArchivedQuery>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let limit = para_list_limit(q.limit);
    let rows = state
        .db
        .get_para_archived(&user.id, limit)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    Ok(Json(json!({ "archive": rows })))
}

// â”€â”€ POST /api/para/classify â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Create or update the classification for a target message.
// Body: { target_id, para_tags: ["project:foo", "area:health"] }

#[derive(Deserialize)]
struct ClassifyBody {
    target_id: String,
    para_tags: Vec<String>,
    context: Option<String>,
}

async fn para_classify_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(body): Json<ClassifyBody>,
) -> Result<(StatusCode, Json<Value>), (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let id = ulid::Ulid::new().to_string();
    let target_id = normalize_para_target_id(body.target_id)?;
    let para_tags = normalize_para_tags(body.para_tags)?;
    state
        .db
        .upsert_para_classification(
            &user.id,
            &id,
            &target_id,
            para_tags,
            "active",
            None,
            body.context.as_deref(),
        )
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    Ok((
        StatusCode::OK,
        Json(json!({ "id": id, "target_id": target_id })),
    ))
}

// â”€â”€ POST /api/para/archive â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Archive a classified item (sets status = "archived" on the classification).
// Body: { target_id, reason, context? }

#[derive(Deserialize)]
struct ArchiveBody {
    target_id: String,
    reason: String,
    context: Option<String>,
}

async fn para_archive_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(body): Json<ArchiveBody>,
) -> Result<(StatusCode, Json<Value>), (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let id = ulid::Ulid::new().to_string();
    let target_id = normalize_para_target_id(body.target_id)?;
    state
        .db
        .upsert_para_classification(
            &user.id,
            &id,
            &target_id,
            vec![],
            "archived",
            Some(&body.reason),
            body.context.as_deref(),
        )
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    Ok((
        StatusCode::OK,
        Json(json!({ "archived": true, "target_id": target_id })),
    ))
}

// â”€â”€ GET /api/para/export?prefix=project:&format=md â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

#[derive(Deserialize)]
struct ExportQuery {
    prefix: Option<String>,
    #[allow(dead_code)]
    format: Option<String>,
}

async fn para_export_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Query(q): Query<ExportQuery>,
) -> Result<(StatusCode, [(&'static str, String); 2], String), (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let prefix = q.prefix.as_deref().unwrap_or("project:");
    let section_label = prefix.trim_end_matches(':');
    let items = state
        .db
        .get_para_by_tag_prefix(&user.id, prefix, 500)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    let mut md = format!("# PARA Export â€” {section_label}\n\n");
    for item in &items {
        let target = item
            .get("target_id")
            .and_then(|v| v.as_str())
            .unwrap_or("unknown");
        let tags: Vec<&str> = item
            .get("para_tags")
            .and_then(|v| v.as_array())
            .map(|a| a.iter().filter_map(|t| t.as_str()).collect())
            .unwrap_or_default();
        md.push_str(&format!("## {target}\n\nTags: {}\n\n", tags.join(", ")));
    }
    Ok((
        StatusCode::OK,
        [
            ("Content-Type", "text/markdown; charset=utf-8".into()),
            (
                "Content-Disposition",
                format!("attachment; filename=\"para_{section_label}.md\""),
            ),
        ],
        md,
    ))
}

// â”€â”€ GET /api/para/auto-archive-candidates â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async fn para_auto_archive_candidates_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let rows = state
        .db
        .get_para_auto_archive_candidates(&user.id, 100)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    Ok(Json(json!({ "candidates": rows })))
}

// â”€â”€ POST /api/para/auto-archive-approve â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

#[derive(Deserialize)]
struct AutoArchiveApproveBody {
    target_ids: Vec<String>,
    reason: Option<String>,
}

async fn para_auto_archive_approve_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(body): Json<AutoArchiveApproveBody>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let reason = body.reason.as_deref().unwrap_or("inactive");
    let mut archived = 0usize;
    for target_id in normalize_auto_archive_target_ids(body.target_ids)? {
        let id = ulid::Ulid::new().to_string();
        if state
            .db
            .upsert_para_classification(
                &user.id,
                &id,
                &target_id,
                vec![],
                "archived",
                Some(reason),
                Some("Auto-archived with user approval"),
            )
            .await
            .is_ok()
        {
            archived += 1;
        }
    }
    Ok(Json(json!({ "archived": archived })))
}

#[cfg(test)]
mod tests {
    #[test]
    fn para_list_limit_is_bounded() {
        assert_eq!(super::para_list_limit(None), 50);
        assert_eq!(super::para_list_limit(Some(0)), 1);
        assert_eq!(super::para_list_limit(Some(-5)), 1);
        assert_eq!(super::para_list_limit(Some(80)), 80);
        assert_eq!(super::para_list_limit(Some(5_000)), 200);
    }

    #[test]
    fn normalize_para_tags_trims_and_bounds_tags() {
        assert_eq!(
            super::normalize_para_tags(vec![" project:venue ".to_string()]).expect("tags"),
            vec!["project:venue".to_string()]
        );
        assert!(super::normalize_para_tags(vec![" ".to_string()]).is_err());
        assert!(
            super::normalize_para_tags(
                (0..=super::MAX_PARA_TAGS)
                    .map(|i| format!("tag:{i}"))
                    .collect()
            )
            .is_err()
        );
    }

    #[test]
    fn normalize_para_target_id_trims_and_bounds_id() {
        assert_eq!(
            super::normalize_para_target_id(" target_1 ".to_string()).expect("target id"),
            "target_1"
        );
        assert!(super::normalize_para_target_id(" ".to_string()).is_err());
        assert!(
            super::normalize_para_target_id("x".repeat(super::MAX_PARA_TARGET_ID_LEN + 1)).is_err()
        );
    }

    #[test]
    fn normalize_auto_archive_target_ids_trims_and_bounds_batch() {
        assert_eq!(
            super::normalize_auto_archive_target_ids(vec![" target_1 ".to_string()])
                .expect("target ids"),
            vec!["target_1".to_string()]
        );
        assert!(super::normalize_auto_archive_target_ids(Vec::new()).is_err());
        assert!(
            super::normalize_auto_archive_target_ids(
                (0..=super::MAX_PARA_AUTO_ARCHIVE_TARGETS)
                    .map(|i| format!("target_{i}"))
                    .collect()
            )
            .is_err()
        );
    }
}
