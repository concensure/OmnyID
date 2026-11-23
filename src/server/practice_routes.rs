//! Read-only professional shell bootstrap. All rollout switches default closed.
use super::{AppState, auth::authenticated_user};

#[cfg(test)]
#[path = "practice_routes_tests.rs"]
mod tests;
use crate::practice::*;
use axum::{
    Json, Router,
    extract::{Query, State},
    http::{HeaderMap, StatusCode, header},
    response::{IntoResponse, Response},
    routing::get,
};
use chrono::Utc;
use serde::Deserialize;
use sqlx::Row;
use std::sync::Arc;

pub(super) fn routes() -> Router<Arc<AppState>> {
    Router::new().route("/practice/bootstrap", get(bootstrap_http))
}

#[derive(Default, Deserialize)]
#[serde(deny_unknown_fields)]
struct BootstrapQuery {
    practice_id: Option<String>,
}

async fn bootstrap_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Query(query): Query<BootstrapQuery>,
) -> Response {
    let mut response = bootstrap(&state, &headers, query)
        .await
        .unwrap_or_else(IntoResponse::into_response);
    response
        .headers_mut()
        .insert(header::CACHE_CONTROL, "no-store, private".parse().unwrap());
    response
        .headers_mut()
        .insert(header::VARY, "Cookie, Authorization".parse().unwrap());
    response
}

fn unavailable(_: impl std::fmt::Debug) -> (StatusCode, String) {
    (
        StatusCode::SERVICE_UNAVAILABLE,
        "Your practice could not be loaded. Please try again.".into(),
    )
}

async fn bootstrap(
    state: &AppState,
    headers: &HeaderMap,
    query: BootstrapQuery,
) -> Result<Response, (StatusCode, String)> {
    let user = authenticated_user(&state.db, headers).await?;
    let entitled = practice_entitled(
        std::env::var("OMNYID_WEDDING_PRO_PRACTICE_ENABLED")
            .ok()
            .as_deref(),
        &std::env::var("OMNYID_WEDDING_PRO_ACCOUNT_ALLOWLIST").unwrap_or_default(),
        &user.id,
    );
    let now = Utc::now();
    if !entitled {
        return Ok(Json(project_practice_bootstrap(
            &user.id,
            false,
            None,
            &[],
            &[],
            now,
        ))
        .into_response());
    }
    if query
        .practice_id
        .as_ref()
        .is_some_and(|id| id.is_empty() || id.len() > 180 || id.chars().any(char::is_control))
    {
        return Err((
            StatusCode::BAD_REQUEST,
            "Choose a practice from your account.".into(),
        ));
    }
    let mut tx = state.db.pool.begin().await.map_err(unavailable)?;
    sqlx::query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY")
        .execute(&mut *tx)
        .await
        .map_err(unavailable)?;
    let rows = sqlx::query("SELECT d.practice_id,d.display_name,m.revision,m.grant_body FROM practice_directory_projection d JOIN practice_membership_projection m USING(practice_id) WHERE m.subject_account_id=$1 AND NOT d.archived ORDER BY d.practice_id LIMIT 101")
        .bind(&user.id).fetch_all(&mut *tx).await.map_err(unavailable)?;
    if rows.len() > 100 {
        return Err(unavailable("bounded practice portfolio"));
    }
    let mut memberships = Vec::new();
    for row in rows {
        memberships.push(PracticeMembership {
            practice_id: row.try_get("practice_id").map_err(unavailable)?,
            display_name: row.try_get("display_name").map_err(unavailable)?,
            revision: u64::try_from(row.try_get::<i64, _>("revision").map_err(unavailable)?)
                .map_err(unavailable)?,
            grant: serde_json::from_value(row.try_get("grant_body").map_err(unavailable)?)
                .map_err(unavailable)?,
        });
    }
    let mut clients = Vec::new();
    if let Some(selected) = query.practice_id.as_deref().filter(|id| {
        memberships
            .iter()
            .any(|m| m.practice_id == *id && active_practice_membership(m, &user.id, now))
    }) {
        let rows = sqlx::query("SELECT owner_account_id,plan_id,thread_id,revision,grant_body,summary FROM practice_client_projection WHERE practice_id=$1 AND subject_account_id=$2 ORDER BY plan_id,owner_account_id,thread_id LIMIT 1001")
            .bind(selected).bind(&user.id).fetch_all(&mut *tx).await.map_err(unavailable)?;
        // Never show misleading partial totals or truncate before authority filtering.
        if rows.len() > 1000 {
            return Err(unavailable("bounded client portfolio"));
        }
        for row in rows {
            clients.push(PracticeClient {
                practice_id: selected.into(),
                subject_account_id: user.id.clone(),
                plan: PlanRef {
                    account_id: row.try_get("owner_account_id").map_err(unavailable)?,
                    plan_id: row.try_get("plan_id").map_err(unavailable)?,
                    thread_id: row.try_get("thread_id").map_err(unavailable)?,
                },
                revision: u64::try_from(row.try_get::<i64, _>("revision").map_err(unavailable)?)
                    .map_err(unavailable)?,
                grant: serde_json::from_value(row.try_get("grant_body").map_err(unavailable)?)
                    .map_err(unavailable)?,
                summary: serde_json::from_value(row.try_get("summary").map_err(unavailable)?)
                    .map_err(unavailable)?,
            });
        }
    }
    let response = project_practice_bootstrap(
        &user.id,
        true,
        query.practice_id.as_deref(),
        &memberships,
        &clients,
        now,
    );
    tx.commit().await.map_err(unavailable)?;
    Ok(Json(response).into_response())
}
