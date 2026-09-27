/*
 * @module-id: rust.server.cost-controls
 * @primary-capability: rust.source-module
 * @locs-version: 2.0
 * @stability: active
 * @owner: omnyid
 */

use std::sync::Arc;

use axum::{
    Json, Router,
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    response::IntoResponse,
    routing::{get, post},
};
use serde_json::Value;

use super::{
    AppState, auth::authenticated_user, auth::store_private_app_message,
    compat_helpers::internal_json_http_error, load_runtime_operational_guidance,
};

const ADMIN_EMAIL_ENV_KEYS: &[&str] = &["OMNYID_ADMIN_EMAILS", "OMNYID_ADMIN_EMAIL"];

pub(super) fn routes() -> Router<Arc<AppState>> {
    Router::new()
        .route("/api/cost/summary", get(cost_summary_http))
        .route("/api/cost/budget", get(get_budget_http))
        .route("/api/cost/budget", post(upsert_budget_http))
        .route("/api/cost/profit/summary", get(profit_summary_http))
        .route("/api/cost/profit/admin", get(profit_admin_http))
        .route(
            "/api/cost/profit/margin-scan",
            post(profit_margin_scan_http),
        )
        .route(
            "/api/cost/template-profiles",
            get(template_cost_profiles_http),
        )
        .route(
            "/api/cost/examples/chile-trip",
            get(chile_trip_cost_example_http),
        )
        .route(
            "/public-snapshot/manifest",
            post(sign_public_snapshot_manifest_http),
        )
        .route("/api/cost/runs/{run_id}", get(get_run_context_http))
}
/// GET /api/cost/summary â€” aggregate cost totals for the authenticated user.
async fn cost_summary_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> impl IntoResponse {
    let user = match authenticated_user(&state.db, &headers).await {
        Ok(u) => u,
        Err((status, msg)) => {
            return (status, Json(serde_json::json!({ "error": msg }))).into_response();
        }
    };
    let summary = state.cost_oracle.cost_summary_for_user(&user.id).await;
    Json(summary).into_response()
}

/// GET /api/cost/profit/summary â€” profit-aware summary for authenticated user.
async fn profit_summary_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> impl IntoResponse {
    let user = match authenticated_user(&state.db, &headers).await {
        Ok(u) => u,
        Err((status, msg)) => {
            return (status, Json(serde_json::json!({ "error": msg }))).into_response();
        }
    };
    use sqlx::Row;
    let budget = state.cost_oracle.active_budget_for_user(&user.id).await;
    let tier = budget
        .get("pricing_tier")
        .and_then(Value::as_str)
        .unwrap_or("free");
    let monthly_revenue = match tier {
        "pro" => 49.0,
        "power" | "team" => 129.0,
        "creator" => 199.0,
        _ => 0.0,
    };
    let row = sqlx::query(
        r#"SELECT
               COALESCE(SUM(CASE WHEN created_at >= date_trunc('day', now()) THEN cost_usd ELSE 0 END), 0) AS cost_day,
               COALESCE(SUM(CASE WHEN created_at >= date_trunc('month', now()) THEN cost_usd ELSE 0 END), 0) AS cost_month
           FROM cost_records
           WHERE user_id = $1"#,
    )
    .bind(&user.id)
    .fetch_optional(&state.db.pool)
    .await
    .ok()
    .flatten();
    let cost_day = row
        .as_ref()
        .and_then(|r| r.try_get::<f64, _>("cost_day").ok())
        .unwrap_or(0.0);
    let cost_month = row
        .as_ref()
        .and_then(|r| r.try_get::<f64, _>("cost_month").ok())
        .unwrap_or(0.0);
    let margin = monthly_revenue - cost_month;
    if margin < 0.0 {
        let _ = emit_margin_alert_if_needed(
            &state,
            &user.id,
            tier,
            cost_month,
            monthly_revenue,
            margin,
        )
        .await;
    }
    Json(serde_json::json!({
        "user_id": user.id,
        "pricing_tier": tier,
        "tier_max_stage": budget.get("tier_max_stage").cloned().unwrap_or(Value::from(1)),
        "daily_deep_query_limit": budget.get("daily_deep_query_limit").cloned().unwrap_or(Value::from(0)),
        "deep_queries_today": budget.get("deep_queries_today").cloned().unwrap_or(Value::from(0)),
        "budget_max_cost_usd": budget.get("max_cost_usd").cloned().unwrap_or(Value::from(0.0)),
        "cost_day_usd": cost_day,
        "cost_month_usd": cost_month,
        "estimated_monthly_revenue_usd": monthly_revenue,
        "estimated_monthly_margin_usd": margin,
        "margin_guard_active": budget.get("margin_guard_active").cloned().unwrap_or(Value::from(false)),
        "usage_guard_active": budget.get("usage_guard_active").cloned().unwrap_or(Value::from(false)),
    }))
    .into_response()
}

/// POST /api/cost/profit/margin-scan â€” run per-user margin anomaly check and emit one AFP alert per month.
async fn profit_margin_scan_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> impl IntoResponse {
    let user = match authenticated_user(&state.db, &headers).await {
        Ok(u) => u,
        Err((status, msg)) => {
            return (status, Json(serde_json::json!({ "error": msg }))).into_response();
        }
    };
    use sqlx::Row;
    let plan = sqlx::query(
        "SELECT COALESCE(plan, 'free') AS plan FROM billing_subscriptions WHERE account_id = $1",
    )
    .bind(&user.id)
    .fetch_optional(&state.db.pool)
    .await
    .ok()
    .flatten()
    .and_then(|r| r.try_get::<String, _>("plan").ok())
    .unwrap_or_else(|| "free".to_string());
    let tier_policy = crate::policy_engine::PolicyEngine::tier_policy(&plan);
    let cost_month = sqlx::query_scalar::<_, f64>(
        r#"SELECT COALESCE(SUM(cost_usd), 0)
           FROM cost_records
           WHERE user_id = $1
             AND created_at >= date_trunc('month', now())"#,
    )
    .bind(&user.id)
    .fetch_one(&state.db.pool)
    .await
    .unwrap_or(0.0);
    let margin = tier_policy.est_monthly_revenue_usd - cost_month;
    let emitted = if margin < 0.0 {
        emit_margin_alert_if_needed(
            &state,
            &user.id,
            &plan,
            cost_month,
            tier_policy.est_monthly_revenue_usd,
            margin,
        )
        .await
    } else {
        false
    };
    Json(serde_json::json!({
        "ok": true,
        "plan": plan,
        "cost_month_usd": cost_month,
        "estimated_monthly_revenue_usd": tier_policy.est_monthly_revenue_usd,
        "estimated_monthly_margin_usd": margin,
        "alert_emitted": emitted,
    }))
    .into_response()
}

/// GET /api/cost/profit/admin â€” internal profitability dashboard aggregates.
async fn profit_admin_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> impl IntoResponse {
    let user = match authenticated_user(&state.db, &headers).await {
        Ok(u) => u,
        Err((status, msg)) => {
            return (status, Json(serde_json::json!({ "error": msg }))).into_response();
        }
    };
    if !operator_access_allowed(&user.email) {
        return (
            StatusCode::FORBIDDEN,
            Json(serde_json::json!({
                "error": "operator access required"
            })),
        )
            .into_response();
    }
    use sqlx::Row;
    let user_rows = sqlx::query(
        r#"SELECT
               c.user_id,
               COUNT(DISTINCT c.run_id) AS sessions,
               COALESCE(SUM(c.cost_usd), 0) AS cost_usd,
               COALESCE(MAX(b.plan), 'free') AS plan
            FROM cost_records c
            LEFT JOIN billing_subscriptions b ON b.account_id = c.user_id
           WHERE c.created_at >= date_trunc('month', now())
           GROUP BY c.user_id
           ORDER BY cost_usd DESC
           LIMIT 50"#,
    )
    .fetch_all(&state.db.pool)
    .await
    .unwrap_or_default();
    let users = user_rows
        .into_iter()
        .map(|r| {
            let plan = r
                .try_get::<String, _>("plan")
                .unwrap_or_else(|_| "free".to_string());
            let revenue = match plan.as_str() {
                "pro" => 49.0,
                "power" | "team" => 129.0,
                "creator" => 199.0,
                _ => 0.0,
            };
            let cost = r.try_get::<f64, _>("cost_usd").unwrap_or(0.0);
            serde_json::json!({
                "user_id": r.try_get::<String, _>("user_id").unwrap_or_else(|_| "unknown".to_string()),
                "sessions": r.try_get::<i64, _>("sessions").unwrap_or(0),
                "plan": plan,
                "cost_usd": cost,
                "revenue_usd": revenue,
                "margin_usd": revenue - cost,
            })
        })
        .collect::<Vec<_>>();
    let by_workflow = sqlx::query(
        r#"SELECT
               COALESCE(workflow_id, 'unclassified') AS workflow_id,
               COALESCE(SUM(cost_usd), 0) AS cost_usd,
               COUNT(*) AS events
            FROM cost_records
           WHERE created_at >= date_trunc('month', now())
           GROUP BY COALESCE(workflow_id, 'unclassified')
           ORDER BY cost_usd DESC
           LIMIT 30"#,
    )
    .fetch_all(&state.db.pool)
    .await
    .unwrap_or_default()
    .into_iter()
    .map(|r| {
        serde_json::json!({
            "workflow_id": r.try_get::<String, _>("workflow_id").unwrap_or_else(|_| "unclassified".to_string()),
            "cost_usd": r.try_get::<f64, _>("cost_usd").unwrap_or(0.0),
            "events": r.try_get::<i64, _>("events").unwrap_or(0),
        })
    })
    .collect::<Vec<_>>();
    let daily = sqlx::query(
        r#"SELECT
               to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS day,
               COALESCE(SUM(cost_usd), 0) AS cost_usd
            FROM cost_records
           WHERE created_at >= now() - interval '30 days'
           GROUP BY date_trunc('day', created_at)
           ORDER BY date_trunc('day', created_at) DESC
           LIMIT 30"#,
    )
    .fetch_all(&state.db.pool)
    .await
    .unwrap_or_default()
    .into_iter()
    .map(|r| {
        serde_json::json!({
            "day": r.try_get::<String, _>("day").unwrap_or_default(),
            "cost_usd": r.try_get::<f64, _>("cost_usd").unwrap_or(0.0),
        })
    })
    .collect::<Vec<_>>();
    Json(profit_admin_summary_json(users, by_workflow, daily)).into_response()
}

pub(super) fn operator_access_allowed(user_email: &str) -> bool {
    let normalized_user_email = normalize_profit_admin_email(user_email);
    if normalized_user_email.is_empty() {
        return false;
    }
    configured_profit_admin_emails()
        .iter()
        .any(|allowed| allowed == &normalized_user_email)
}

fn profit_admin_allowed(user_email: &str) -> bool {
    operator_access_allowed(user_email)
}

fn configured_profit_admin_emails() -> Vec<String> {
    ADMIN_EMAIL_ENV_KEYS
        .iter()
        .filter_map(|key| std::env::var(key).ok())
        .flat_map(|raw| {
            raw.split(',')
                .map(normalize_profit_admin_email)
                .filter(|email| !email.is_empty())
                .collect::<Vec<_>>()
        })
        .collect()
}

fn normalize_profit_admin_email(value: &str) -> String {
    value.trim().to_ascii_lowercase()
}

fn profit_admin_summary_json(
    users: Vec<Value>,
    by_workflow: Vec<Value>,
    daily_cost: Vec<Value>,
) -> Value {
    serde_json::json!({
        "users": users,
        "by_workflow": by_workflow,
        "daily_cost": daily_cost,
        "operational_guidance": load_runtime_operational_guidance(),
    })
}

/// GET /api/cost/template-profiles â€” per-template optimisation metadata.
async fn template_cost_profiles_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> impl IntoResponse {
    if let Err((status, msg)) = authenticated_user(&state.db, &headers).await {
        return (status, Json(serde_json::json!({ "error": msg }))).into_response();
    }
    let travel_nodes =
        crate::policy_engine::PolicyEngine::allowed_expensive_nodes_for_template("travel_booker");
    let finance_nodes = crate::policy_engine::PolicyEngine::allowed_expensive_nodes_for_template(
        "finance_guardian",
    );
    let study_nodes =
        crate::policy_engine::PolicyEngine::allowed_expensive_nodes_for_template("study_planner");
    let free_tier = crate::policy_engine::PolicyEngine::tier_policy("free");
    let pro_tier = crate::policy_engine::PolicyEngine::tier_policy("pro");
    Json(serde_json::json!({
        "profiles": [
            {"template_id":"travel_booker","avg_cost_usd":0.085,"expensive_nodes":travel_nodes,"recommended_stage_cap":pro_tier.max_stage},
            {"template_id":"finance_guardian","avg_cost_usd":0.035,"expensive_nodes":finance_nodes,"recommended_stage_cap":pro_tier.max_stage},
            {"template_id":"study_planner","avg_cost_usd":0.012,"expensive_nodes":study_nodes,"recommended_stage_cap":free_tier.max_stage}
        ]
    }))
    .into_response()
}

#[derive(serde::Deserialize)]
struct PublicSnapshotManifestRequest {
    snapshot_id: String,
    thread_id: String,
    view_id: String,
    content: Value,
}

/// POST /public-snapshot/manifest â€” produce signed public snapshot manifest.
async fn sign_public_snapshot_manifest_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(body): Json<PublicSnapshotManifestRequest>,
) -> impl IntoResponse {
    let user = match authenticated_user(&state.db, &headers).await {
        Ok(u) => u,
        Err((status, msg)) => {
            return (status, Json(serde_json::json!({ "error": msg }))).into_response();
        }
    };
    use hmac::Mac;
    use sha2::{Digest, Sha256};
    type HmacSha256 = hmac::Hmac<Sha256>;

    let manifest = serde_json::json!({
        "snapshot_id": body.snapshot_id,
        "thread_id": body.thread_id,
        "view_id": body.view_id,
        "owner_user_id": user.id,
        "created_at": chrono::Utc::now().to_rfc3339(),
        "content_sha256": hex::encode(Sha256::digest(
            serde_json::to_string(&body.content).unwrap_or_default().as_bytes()
        )),
    });
    let payload = serde_json::to_string(&manifest).unwrap_or_default();
    let signature = std::env::var("OMNYID_MANIFEST_SIGNING_KEY")
        .ok()
        .and_then(|secret| {
            let mut mac = HmacSha256::new_from_slice(secret.as_bytes()).ok()?;
            mac.update(payload.as_bytes());
            Some(hex::encode(mac.finalize().into_bytes()))
        });
    Json(serde_json::json!({
        "manifest": manifest,
        "signature": signature,
        "algorithm": if signature.is_some() { "hmac-sha256" } else { "unsigned" }
    }))
    .into_response()
}

async fn emit_margin_alert_if_needed(
    state: &Arc<AppState>,
    user_id: &str,
    tier: &str,
    cost_month_usd: f64,
    revenue_usd: f64,
    margin_usd: f64,
) -> bool {
    let inserted = sqlx::query(
        r#"INSERT INTO profit_margin_alerts (user_id, month_bucket)
           VALUES ($1, date_trunc('month', now())::date)
           ON CONFLICT (user_id, month_bucket) DO NOTHING"#,
    )
    .bind(user_id)
    .execute(&state.db.pool)
    .await
    .ok()
    .map(|done| done.rows_affected() == 1)
    .unwrap_or(false);
    if !inserted {
        return false;
    }
    let msg = crate::message::AFPMessage {
        protocol: "afp-v1".to_string(),
        id: ulid::Ulid::new().to_string(),
        thread_id: format!("system:margin:{}", chrono::Utc::now().format("%Y-%m")),
        parent_id: None,
        from: "system-profit-guard".to_string(),
        to: vec![],
        timestamp: chrono::Utc::now().to_rfc3339(),
        r#type: "agent".to_string(),
        kind: None,
        supertags: vec![],
        subtype: Some(crate::message::AFP_SUBTYPE_DECISION_TRACE.to_string()),
        content: serde_json::json!({
            "kind": "margin_anomaly",
            "tier": tier,
            "cost_month_usd": cost_month_usd,
            "estimated_monthly_revenue_usd": revenue_usd,
            "estimated_monthly_margin_usd": margin_usd,
            "action": "apply_restrictions",
        }),
        metadata: Some(serde_json::json!({"store": true, "alert": true})),
        signature: String::new(),
        encryption: None,
        views: vec![],
        references: vec![],
        typed_refs: vec![],
        attachments: vec![],
        store_in_relational: true,
        prev_hash: None,
    };
    let _ =
        store_private_app_message(&state.db, &state.metrics, &state.relay_tx, user_id, msg).await;
    true
}

/// GET /api/cost/examples/chile-trip â€” tier-based execution trace example.
async fn chile_trip_cost_example_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> impl IntoResponse {
    if let Err((status, msg)) = authenticated_user(&state.db, &headers).await {
        return (status, Json(serde_json::json!({ "error": msg }))).into_response();
    }
    Json(serde_json::json!({
        "scenario": "Chile trip, 10 days, 2 travellers",
        "tiers": {
            "free": {
                "stage_cap": 1,
                "behaviour": ["summary + map + weather immediate", "flights/hotels blocked or cached estimates"],
                "estimated_cost_usd": 0.012
            },
            "pro": {
                "stage_cap": 2,
                "behaviour": ["limited flight API and filtered hotels", "activities remain interaction-gated"],
                "estimated_cost_usd": 0.072
            },
            "power": {
                "stage_cap": 3,
                "behaviour": ["deep comparisons enabled on interaction", "full alternatives + route enrichment"],
                "estimated_cost_usd": 0.210
            }
        }
    }))
    .into_response()
}

/// GET /api/cost/budget â€” retrieve the user's current budget config.
async fn get_budget_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> impl IntoResponse {
    let user = match authenticated_user(&state.db, &headers).await {
        Ok(u) => u,
        Err((status, msg)) => {
            return (status, Json(serde_json::json!({ "error": msg }))).into_response();
        }
    };
    let budget = state.cost_oracle.active_budget_for_user(&user.id).await;
    Json(budget).into_response()
}

#[derive(serde::Deserialize)]
struct UpsertBudgetRequest {
    max_cost_usd: Option<f64>,
    max_api_calls: Option<i32>,
    max_llm_tokens: Option<i64>,
    soft_limit_ratio: Option<f64>,
    degradation_policy: Option<String>,
}

/// POST /api/cost/budget â€” upsert per-user budget config.
async fn upsert_budget_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(body): Json<UpsertBudgetRequest>,
) -> impl IntoResponse {
    let user = match authenticated_user(&state.db, &headers).await {
        Ok(u) => u,
        Err((status, msg)) => {
            return (status, Json(serde_json::json!({ "error": msg }))).into_response();
        }
    };

    let degradation = body.degradation_policy.as_deref().unwrap_or("downgrade");
    let allowed_policies = ["downgrade", "cache_only", "halt"];
    if !allowed_policies.contains(&degradation) {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({
                "error": "degradation_policy must be one of: downgrade, cache_only, halt"
            })),
        )
            .into_response();
    }

    let result = sqlx::query(
        r#"INSERT INTO budget_configs
                  (user_id, max_cost_usd, max_api_calls, max_llm_tokens, soft_limit_ratio, degradation_policy)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (user_id) DO UPDATE
              SET max_cost_usd       = COALESCE($2, budget_configs.max_cost_usd),
                  max_api_calls      = COALESCE($3, budget_configs.max_api_calls),
                  max_llm_tokens     = COALESCE($4, budget_configs.max_llm_tokens),
                  soft_limit_ratio   = COALESCE($5, budget_configs.soft_limit_ratio),
                  degradation_policy = COALESCE($6, budget_configs.degradation_policy),
                  updated_at         = now()"#,
    )
    .bind(&user.id)
    .bind(body.max_cost_usd)
    .bind(body.max_api_calls)
    .bind(body.max_llm_tokens)
    .bind(body.soft_limit_ratio)
    .bind(degradation)
    .execute(&state.db.pool)
    .await;

    match result {
        Ok(_) => Json(serde_json::json!({ "ok": true })).into_response(),
        Err(e) => {
            let (status, payload) = internal_json_http_error(e);
            (status, Json(payload)).into_response()
        }
    }
}

/// GET /api/cost/runs/:run_id â€” retrieve live execution context for an active run.
async fn get_run_context_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(run_id): Path<String>,
) -> impl IntoResponse {
    let user = match authenticated_user(&state.db, &headers).await {
        Ok(u) => u,
        Err((status, msg)) => {
            return (status, Json(serde_json::json!({ "error": msg }))).into_response();
        }
    };

    // Verify run belongs to this user
    use sqlx::Row;
    let row = sqlx::query("SELECT user_id FROM execution_contexts WHERE run_id = $1")
        .bind(&run_id)
        .fetch_optional(&state.db.pool)
        .await
        .ok()
        .flatten();

    let owner_id: Option<String> = row.and_then(|r| r.try_get::<String, _>("user_id").ok());
    match owner_id {
        Some(oid) if oid == user.id => {
            let ctx = state.cost_oracle.get_context(&run_id).await;
            match ctx {
                Some(c) => match serde_json::to_value(&c) {
                    Ok(payload) => Json(payload).into_response(),
                    Err(err) => {
                        let (status, payload) = internal_json_http_error(err);
                        (status, Json(payload)).into_response()
                    }
                },
                None => (
                    StatusCode::NOT_FOUND,
                    Json(serde_json::json!({ "error": "run not active" })),
                )
                    .into_response(),
            }
        }
        Some(_) => (
            StatusCode::FORBIDDEN,
            Json(serde_json::json!({ "error": "forbidden" })),
        )
            .into_response(),
        None => (
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({ "error": "run not found" })),
        )
            .into_response(),
    }
}

#[cfg(test)]
mod tests {
    use super::{
        configured_profit_admin_emails, normalize_profit_admin_email, profit_admin_allowed,
        profit_admin_summary_json,
    };
    use std::sync::{Mutex, OnceLock};

    fn admin_env_lock() -> &'static Mutex<()> {
        static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
        LOCK.get_or_init(|| Mutex::new(()))
    }

    fn set_admin_env_for_test(value: Option<&str>) {
        match value {
            Some(raw) => unsafe {
                std::env::set_var("OMNYID_ADMIN_EMAILS", raw);
            },
            None => unsafe {
                std::env::remove_var("OMNYID_ADMIN_EMAILS");
            },
        }
        unsafe {
            std::env::remove_var("OMNYID_ADMIN_EMAIL");
        }
    }

    #[test]
    fn normalize_profit_admin_email_trims_and_lowercases() {
        assert_eq!(
            normalize_profit_admin_email("  Ops@OmnyID.com "),
            "ops@omnyid.com"
        );
    }

    #[test]
    fn configured_profit_admin_emails_ignores_blank_entries() {
        let _guard = admin_env_lock().lock().expect("lock admin env");
        set_admin_env_for_test(Some(" ops@omnyid.com, ,finance@omnyid.com "));
        assert_eq!(
            configured_profit_admin_emails(),
            vec![
                "ops@omnyid.com".to_string(),
                "finance@omnyid.com".to_string()
            ]
        );
        set_admin_env_for_test(None);
    }

    #[test]
    fn profit_admin_allowed_requires_configured_email_match() {
        let _guard = admin_env_lock().lock().expect("lock admin env");
        set_admin_env_for_test(Some("ops@omnyid.com,finance@omnyid.com"));
        assert!(profit_admin_allowed("Ops@OmnyID.com"));
        assert!(!profit_admin_allowed("user@example.com"));
        set_admin_env_for_test(None);
    }

    #[test]
    fn upsert_budget_route_uses_sanitized_internal_json_error() {
        let source = include_str!("cost_controls.rs");
        let start = source
            .find("async fn upsert_budget_http(")
            .expect("upsert_budget_http definition");
        let end = source[start..]
            .find("/// GET /api/cost/runs/:run_id")
            .map(|offset| start + offset)
            .expect("run context marker");
        let function_source = &source[start..end];
        assert!(function_source.contains("let (status, payload) = internal_json_http_error(e);"));
        assert!(!function_source.contains("Json(serde_json::json!({ \"error\": e.to_string() }))"));
    }

    #[test]
    fn get_run_context_route_does_not_silently_drop_serialization_failures() {
        let source = include_str!("cost_controls.rs");
        let start = source
            .find("async fn get_run_context_http(")
            .expect("get_run_context_http exists");
        let end = source[start..]
            .find("\n#[cfg(test)]")
            .map(|offset| start + offset)
            .expect("test module follows get_run_context_http");
        let function_source = &source[start..end];
        assert!(function_source.contains("Some(c) => match serde_json::to_value(&c) {"));
        assert!(function_source.contains("Ok(payload) => Json(payload).into_response(),"));
        assert!(function_source.contains("let (status, payload) = internal_json_http_error(err);"));
        assert!(!function_source.contains("unwrap_or_default()"));
    }

    #[test]
    fn profit_admin_summary_json_mounts_operational_guidance_when_artifact_present() {
        let _guard = admin_env_lock().lock().expect("lock admin env");
        let temp_dir =
            std::env::temp_dir().join(format!("omnyid-cost-controls-test-{}", ulid::Ulid::new()));
        std::fs::create_dir_all(&temp_dir).expect("create temp dir");
        let artifact_path = temp_dir.join("production-go-no-go.json");
        std::fs::write(
            &artifact_path,
            serde_json::json!({
                "status": "no_go",
                "storage_oracle_operational_history_pressure_status": "operational_history_present",
                "storage_oracle_operational_history_pressure_total_rows": 19800,
                "storage_oracle_operational_history_cleanup_mode": "dry_run",
                "storage_oracle_operational_history_cleanup_follow_through_command": "./scripts/oracle-prune-operational-history.ps1 -Apply",
                "next_action_summary": "Execute the bounded operational-history cleanup, rerun proof, and refresh the gate.",
                "generated_at": "2026-08-28T10:00:00Z"
            })
            .to_string(),
        )
        .expect("write artifact");

        unsafe {
            std::env::set_var("OMNYID_PRODUCTION_GO_NO_GO_PATH", artifact_path.as_os_str());
        }

        let payload = profit_admin_summary_json(vec![], vec![], vec![]);
        assert_eq!(
            payload["operational_guidance"]["status"].as_str(),
            Some("no_go")
        );
        assert_eq!(
            payload["operational_guidance"]["summary"].as_str(),
            Some(
                "Execute the bounded operational-history cleanup, rerun proof, and refresh the gate."
            )
        );
        assert_eq!(
            payload["operational_guidance"]["command"].as_str(),
            Some("./scripts/oracle-prune-operational-history.ps1 -Apply")
        );
        assert_eq!(
            payload["operational_guidance"]["pressure_total_rows"].as_i64(),
            Some(19800)
        );

        unsafe {
            std::env::remove_var("OMNYID_PRODUCTION_GO_NO_GO_PATH");
        }
        let _ = std::fs::remove_file(&artifact_path);
        let _ = std::fs::remove_dir(&temp_dir);
    }
}
