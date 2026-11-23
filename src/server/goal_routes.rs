/*
 * @module-id: rust.server.goal-routes
 * @primary-capability: rust.source-module
 * @locs-version: 2.0
 * @stability: active
 * @owner: omnyid
 */

use super::*;

const MAX_GOAL_NOTE_LEN: usize = 2000;
const MAX_GOAL_PROGRESS_SIGNAL_LEN: usize = 64;
const MAX_GOAL_AFP_MESSAGE_ID_LEN: usize = 128;

pub(super) fn routes() -> Router<Arc<AppState>> {
    Router::new()
        .route("/api/goals", get(list_goals_http).post(create_goal_http))
        .route(
            "/api/goals/{goal_id}",
            get(get_goal_http)
                .put(update_goal_http)
                .delete(delete_goal_http),
        )
        .route("/api/goals/{goal_id}/confirm", post(confirm_goal_http))
        .route("/api/goals/{goal_id}/dismiss", post(dismiss_goal_http))
        .route("/api/goals/{goal_id}/archive", post(archive_goal_http))
        .route(
            "/api/goals/{goal_id}/progress",
            get(list_goal_progress_http).post(add_goal_progress_http),
        )
        .route("/api/goals/reorder", post(reorder_goals_http))
}

fn goal_list_limit(raw: Option<&str>) -> i64 {
    raw.and_then(|value| value.parse::<i64>().ok())
        .unwrap_or(50)
        .clamp(1, 100)
}

fn clean_goal_optional_string(value: Option<&str>, max_len: usize) -> Option<String> {
    value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|value| value.chars().take(max_len).collect::<String>())
}

fn clean_goal_signal_type(value: Option<&str>) -> Result<String, (StatusCode, String)> {
    let signal = value.unwrap_or("manual").trim();
    if signal.is_empty() || signal.len() > MAX_GOAL_PROGRESS_SIGNAL_LEN {
        return Err((
            StatusCode::BAD_REQUEST,
            format!("signal_type must be 1-{MAX_GOAL_PROGRESS_SIGNAL_LEN} characters"),
        ));
    }
    Ok(signal.to_string())
}

async fn list_goals_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Query(params): Query<HashMap<String, String>>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let status_filter = params.get("status").cloned().unwrap_or_default();
    let limit = goal_list_limit(params.get("limit").map(String::as_str));

    let rows = sqlx::query(
        "SELECT goal_id, domain, title, description, target_date::text as target_date, status,
                agent_support_level, priority_rank, created_at::text as created_at
         FROM user_goals
         WHERE user_id = $1 AND ($2 = '' OR status = $2)
         ORDER BY priority_rank ASC, created_at DESC LIMIT $3",
    )
    .bind(&user.id)
    .bind(&status_filter)
    .bind(limit)
    .fetch_all(&state.db.pool)
    .await
    .map_err(internal_error)
    .map_err(status_to_http)?;

    let goals: Vec<Value> = rows
        .iter()
        .map(|r| -> Result<Value, sqlx::Error> {
            Ok(json!({
                "goal_id": r.try_get::<String, _>("goal_id")?,
                "domain": r.try_get::<String, _>("domain")?,
                "title": r.try_get::<String, _>("title")?,
                "description": r.try_get::<Option<String>, _>("description").ok().flatten(),
                "target_date": r.try_get::<Option<String>, _>("target_date").ok().flatten(),
                "status": r.try_get::<String, _>("status")?,
                "agent_support_level": r.try_get::<String, _>("agent_support_level")?,
                "priority_rank": r.try_get::<i32, _>("priority_rank").unwrap_or(0),
                "created_at": r.try_get::<Option<String>, _>("created_at").ok().flatten(),
            }))
        })
        .collect::<Result<Vec<_>, _>>()
        .map_err(internal_error)
        .map_err(status_to_http)?;
    Ok(Json(json!({ "goals": goals })))
}

async fn create_goal_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(body): Json<Value>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let goal_id = Ulid::new().to_string();

    let domain = body["domain"].as_str().unwrap_or("other").to_string();
    if ![
        "career",
        "finance",
        "health",
        "relationships",
        "personal_growth",
        "creativity",
        "community",
        "lifestyle",
        "other",
    ]
    .contains(&domain.as_str())
    {
        return Err((StatusCode::BAD_REQUEST, "invalid domain".to_string()));
    }
    let title = body["title"].as_str().unwrap_or("").trim().to_string();
    if title.is_empty() || title.len() > 200 {
        return Err((
            StatusCode::BAD_REQUEST,
            "title must be 1â€“200 characters".to_string(),
        ));
    }
    let agent_support_level = body["agent_support_level"]
        .as_str()
        .unwrap_or("watch")
        .to_string();
    if !["watch", "suggest", "assist", "automate"].contains(&agent_support_level.as_str()) {
        return Err((
            StatusCode::BAD_REQUEST,
            "agent_support_level must be watch, suggest, assist, or automate".to_string(),
        ));
    }
    let description = body["description"]
        .as_str()
        .map(|s| s.chars().take(2000).collect::<String>());
    let target_date = body["target_date"].as_str().map(|s| s.to_string());

    sqlx::query(
        "INSERT INTO user_goals (goal_id, user_id, domain, title, description, target_date, status, agent_support_level, priority_rank)
         VALUES ($1, $2, $3, $4, $5, $6::date, 'active', $7,
                COALESCE((SELECT MAX(priority_rank) + 1 FROM user_goals WHERE user_id = $2), 0))"
    )
    .bind(&goal_id)
    .bind(&user.id)
    .bind(&domain)
    .bind(&title)
    .bind(&description)
    .bind(&target_date)
    .bind(&agent_support_level)
    .execute(&state.db.pool)
    .await
    .map_err(internal_error)
    .map_err(status_to_http)?;

    Ok(Json(json!({ "goal_id": goal_id })))
}

async fn get_goal_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(goal_id): Path<String>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let row = sqlx::query(
        "SELECT goal_id, domain, title, description, target_date::text as target_date, status,
                agent_support_level, priority_rank, created_at::text as created_at
         FROM user_goals WHERE goal_id = $1 AND user_id = $2",
    )
    .bind(&goal_id)
    .bind(&user.id)
    .fetch_optional(&state.db.pool)
    .await
    .map_err(internal_error)
    .map_err(status_to_http)?
    .ok_or_else(|| (StatusCode::NOT_FOUND, "goal not found".to_string()))?;

    Ok(Json(json!({
        "goal_id": row.try_get::<String, _>("goal_id").map_err(internal_error).map_err(status_to_http)?,
        "domain": row.try_get::<String, _>("domain").map_err(internal_error).map_err(status_to_http)?,
        "title": row.try_get::<String, _>("title").map_err(internal_error).map_err(status_to_http)?,
        "description": row.try_get::<Option<String>, _>("description").ok().flatten(),
        "target_date": row.try_get::<Option<String>, _>("target_date").ok().flatten(),
        "status": row.try_get::<String, _>("status").map_err(internal_error).map_err(status_to_http)?,
        "agent_support_level": row.try_get::<String, _>("agent_support_level").map_err(internal_error).map_err(status_to_http)?,
        "priority_rank": row.try_get::<i32, _>("priority_rank").unwrap_or(0),
    })))
}

async fn update_goal_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(goal_id): Path<String>,
    Json(body): Json<Value>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;

    if let Some(t) = body["title"].as_str() {
        let trimmed = t.trim();
        if trimmed.is_empty() || trimmed.len() > 200 {
            return Err((
                StatusCode::BAD_REQUEST,
                "title must be 1â€“200 characters".to_string(),
            ));
        }
    }
    if let Some(lvl) = body["agent_support_level"].as_str() {
        if !["watch", "suggest", "assist", "automate"].contains(&lvl) {
            return Err((
                StatusCode::BAD_REQUEST,
                "agent_support_level must be watch, suggest, assist, or automate".to_string(),
            ));
        }
    }
    let title = body["title"].as_str().map(|s| s.trim().to_string());
    let description = body["description"]
        .as_str()
        .map(|s| s.chars().take(2000).collect::<String>());
    let target_date = body["target_date"].as_str().map(|s| s.to_string());
    let agent_support_level = body["agent_support_level"].as_str().map(|s| s.to_string());

    sqlx::query(
        "UPDATE user_goals SET
              title = COALESCE($3, title),
              description = COALESCE($4, description),
              target_date = COALESCE($5::date, target_date),
              agent_support_level = COALESCE($6, agent_support_level),
              updated_at = NOW()
           WHERE goal_id = $1 AND user_id = $2",
    )
    .bind(&goal_id)
    .bind(&user.id)
    .bind(&title)
    .bind(&description)
    .bind(&target_date)
    .bind(&agent_support_level)
    .execute(&state.db.pool)
    .await
    .map_err(internal_error)
    .map_err(status_to_http)?;

    Ok(Json(json!({ "ok": true })))
}

async fn delete_goal_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(goal_id): Path<String>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    sqlx::query("DELETE FROM user_goals WHERE goal_id = $1 AND user_id = $2")
        .bind(&goal_id)
        .bind(&user.id)
        .execute(&state.db.pool)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    Ok(Json(json!({ "ok": true })))
}

async fn confirm_goal_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(goal_id): Path<String>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    sqlx::query(
        "UPDATE user_goals SET status = 'active', updated_at = NOW() \
         WHERE goal_id = $1 AND user_id = $2 AND status = 'suggested'",
    )
    .bind(&goal_id)
    .bind(&user.id)
    .execute(&state.db.pool)
    .await
    .map_err(internal_error)
    .map_err(status_to_http)?;
    Ok(Json(json!({ "ok": true })))
}

async fn dismiss_goal_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(goal_id): Path<String>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    sqlx::query(
        "UPDATE user_goals SET status = 'dismissed', updated_at = NOW() \
         WHERE goal_id = $1 AND user_id = $2",
    )
    .bind(&goal_id)
    .bind(&user.id)
    .execute(&state.db.pool)
    .await
    .map_err(internal_error)
    .map_err(status_to_http)?;
    Ok(Json(json!({ "ok": true })))
}

async fn archive_goal_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(goal_id): Path<String>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    sqlx::query(
        "UPDATE user_goals SET status = 'archived', updated_at = NOW() \
         WHERE goal_id = $1 AND user_id = $2",
    )
    .bind(&goal_id)
    .bind(&user.id)
    .execute(&state.db.pool)
    .await
    .map_err(internal_error)
    .map_err(status_to_http)?;
    Ok(Json(json!({ "ok": true })))
}

async fn list_goal_progress_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(goal_id): Path<String>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let rows = sqlx::query(
        "SELECT p.progress_id, p.signal_type, p.note, p.afp_message_id, p.recorded_at::text as recorded_at
         FROM user_goal_progress p
         JOIN user_goals g ON g.goal_id = p.goal_id
         WHERE p.goal_id = $1 AND g.user_id = $2
         ORDER BY p.recorded_at DESC LIMIT 50"
    )
    .bind(&goal_id)
    .bind(&user.id)
    .fetch_all(&state.db.pool)
    .await
    .map_err(internal_error)
    .map_err(status_to_http)?;

    let items: Vec<Value> = rows
        .iter()
        .map(|r| -> Result<Value, sqlx::Error> {
            Ok(json!({
                "progress_id": r.try_get::<String, _>("progress_id")?,
                "signal_type": r.try_get::<String, _>("signal_type")?,
                "note": r.try_get::<Option<String>, _>("note").ok().flatten(),
                "afp_message_id": r.try_get::<Option<String>, _>("afp_message_id").ok().flatten(),
                "recorded_at": r.try_get::<Option<String>, _>("recorded_at").ok().flatten(),
            }))
        })
        .collect::<Result<Vec<_>, _>>()
        .map_err(internal_error)
        .map_err(status_to_http)?;
    Ok(Json(json!({ "progress": items })))
}

async fn add_goal_progress_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(goal_id): Path<String>,
    Json(body): Json<Value>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let exists_row = sqlx::query(
        "SELECT EXISTS(SELECT 1 FROM user_goals WHERE goal_id = $1 AND user_id = $2) as e",
    )
    .bind(&goal_id)
    .bind(&user.id)
    .fetch_one(&state.db.pool)
    .await
    .map_err(internal_error)
    .map_err(status_to_http)?;

    let exists: bool = exists_row.try_get::<bool, _>("e").unwrap_or(false);
    if !exists {
        return Err((StatusCode::NOT_FOUND, "goal not found".to_string()));
    }

    let progress_id = Ulid::new().to_string();
    let signal_type = clean_goal_signal_type(body["signal_type"].as_str())?;
    let note = clean_goal_optional_string(body["note"].as_str(), MAX_GOAL_NOTE_LEN);
    let afp_message_id =
        clean_goal_optional_string(body["afp_message_id"].as_str(), MAX_GOAL_AFP_MESSAGE_ID_LEN);

    sqlx::query(
        "INSERT INTO user_goal_progress (progress_id, goal_id, signal_type, note, afp_message_id) \
         VALUES ($1, $2, $3, $4, $5)",
    )
    .bind(&progress_id)
    .bind(&goal_id)
    .bind(&signal_type)
    .bind(&note)
    .bind(&afp_message_id)
    .execute(&state.db.pool)
    .await
    .map_err(internal_error)
    .map_err(status_to_http)?;

    Ok(Json(json!({ "progress_id": progress_id })))
}

async fn reorder_goals_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(body): Json<Value>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let order = body["order"].as_array().ok_or_else(|| {
        (
            StatusCode::BAD_REQUEST,
            "order must be an array of goal_ids".to_string(),
        )
    })?;
    if order.len() > 200 {
        return Err((
            StatusCode::BAD_REQUEST,
            "at most 200 goals can be reordered at once".to_string(),
        ));
    }
    for (rank, id) in order.iter().enumerate() {
        let Some(goal_id) = id.as_str() else {
            continue;
        };
        let _ = sqlx::query(
            "UPDATE user_goals SET priority_rank = $3 WHERE goal_id = $1 AND user_id = $2",
        )
        .bind(goal_id)
        .bind(&user.id)
        .bind(rank as i32)
        .execute(&state.db.pool)
        .await;
    }
    Ok(Json(json!({ "ok": true })))
}

#[cfg(test)]
mod tests {
    #[test]
    fn goal_list_limit_is_bounded() {
        assert_eq!(super::goal_list_limit(None), 50);
        assert_eq!(super::goal_list_limit(Some("0")), 1);
        assert_eq!(super::goal_list_limit(Some("-20")), 1);
        assert_eq!(super::goal_list_limit(Some("75")), 75);
        assert_eq!(super::goal_list_limit(Some("5000")), 100);
    }

    #[test]
    fn goal_progress_inputs_are_trimmed_and_bounded() {
        assert_eq!(
            super::clean_goal_signal_type(Some(" manual ")).expect("signal"),
            "manual"
        );
        assert!(super::clean_goal_signal_type(Some(" ")).is_err());
        assert!(super::clean_goal_signal_type(Some(&"x".repeat(65))).is_err());
        assert_eq!(
            super::clean_goal_optional_string(Some(" note "), super::MAX_GOAL_NOTE_LEN),
            Some("note".to_string())
        );
        assert_eq!(
            super::clean_goal_optional_string(Some("x".repeat(3000).as_str()), 12)
                .expect("trimmed")
                .len(),
            12
        );
    }
}
