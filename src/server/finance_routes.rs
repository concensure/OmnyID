/*
 * @module-id: rust.server.finance-routes
 * @primary-capability: rust.source-module
 * @locs-version: 2.0
 * @stability: active
 * @owner: omnyid
 */

use super::*;
use axum::routing::delete;

const FINANCE_GUARDIAN_AGENT: &str = "omnyid://daemon/finance-guardian";
const FINANCE_REPORT_RETENTION_LIMIT: i64 = 30;

pub(super) fn routes() -> Router<Arc<AppState>> {
    Router::new()
        .route(
            "/api/finance/accounts",
            get(list_accounts_http).post(create_account_http),
        )
        .route(
            "/api/finance/accounts/{account_id}",
            delete(delete_account_http),
        )
        .route("/api/finance/transactions", get(list_transactions_http))
        .route(
            "/api/finance/transactions/import",
            post(import_transactions_http),
        )
        .route("/api/finance/insights", get(finance_insights_http))
        .route("/api/finance/anomalies", get(finance_anomalies_http))
        .route("/api/finance/guardian/run", post(run_finance_guardian_http))
}

// â”€â”€ Merchant â†’ category rules (rule-based, no LLM cost) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

fn classify_transaction(description: &str, merchant: Option<&str>) -> &'static str {
    let text = merchant.unwrap_or("").to_lowercase() + " " + &description.to_lowercase();
    if text.contains("grocery")
        || text.contains("woolworths")
        || text.contains("coles")
        || text.contains("aldi")
        || text.contains("iga")
        || text.contains("supermarket")
        || text.contains("food")
    {
        return "groceries";
    }
    if text.contains("uber")
        || text.contains("lyft")
        || text.contains("taxi")
        || text.contains("transport")
        || text.contains("train")
        || text.contains("bus")
        || text.contains("opal")
        || text.contains("fuel")
        || text.contains("petrol")
        || text.contains("parking")
    {
        return "transport";
    }
    if text.contains("netflix")
        || text.contains("spotify")
        || text.contains("steam")
        || text.contains("apple")
        || text.contains("google play")
        || text.contains("amazon prime")
        || text.contains("disney")
        || text.contains("youtube")
    {
        return "subscriptions";
    }
    if text.contains("restaurant")
        || text.contains("cafe")
        || text.contains("coffee")
        || text.contains("takeaway")
        || text.contains("doordash")
        || text.contains("ubereats")
        || text.contains("menulog")
        || text.contains("dining")
    {
        return "dining";
    }
    if text.contains("rent")
        || text.contains("mortgage")
        || text.contains("strata")
        || text.contains("real estate")
        || text.contains("property")
    {
        return "housing";
    }
    if text.contains("electric")
        || text.contains("gas")
        || text.contains("water")
        || text.contains("internet")
        || text.contains("phone")
        || text.contains("broadband")
    {
        return "utilities";
    }
    if text.contains("gym")
        || text.contains("fitness")
        || text.contains("doctor")
        || text.contains("pharmacy")
        || text.contains("hospital")
        || text.contains("medical")
        || text.contains("dental")
        || text.contains("health")
    {
        return "health";
    }
    if text.contains("amazon")
        || text.contains("ebay")
        || text.contains("kmart")
        || text.contains("target")
        || text.contains("shopping")
        || text.contains("retail")
    {
        return "shopping";
    }
    if text.contains("salary")
        || text.contains("payroll")
        || text.contains("wage")
        || text.contains("income")
        || text.contains("dividend")
        || text.contains("interest")
    {
        return "income";
    }
    "other"
}

// â”€â”€ Account handlers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async fn list_accounts_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let rows = sqlx::query(
        "SELECT account_id, label, institution, account_type, currency, source,
                masked_number, enabled, created_at::text AS created_at
         FROM finance_accounts WHERE user_id = $1 AND enabled = true
         ORDER BY created_at ASC",
    )
    .bind(&user.id)
    .fetch_all(&state.db.pool)
    .await
    .map_err(internal_error)
    .map_err(status_to_http)?;

    let accounts: Vec<Value> = rows
        .iter()
        .map(|r| {
            json!({
                "account_id":   r.try_get::<String, _>("account_id").unwrap_or_default(),
                "label":        r.try_get::<String, _>("label").unwrap_or_default(),
                "institution":  r.try_get::<Option<String>, _>("institution").ok().flatten(),
                "account_type": r.try_get::<String, _>("account_type").unwrap_or_default(),
                "currency":     r.try_get::<String, _>("currency").unwrap_or_default(),
                "source":       r.try_get::<String, _>("source").unwrap_or_default(),
                "masked_number":r.try_get::<Option<String>, _>("masked_number").ok().flatten(),
                "enabled":      r.try_get::<bool, _>("enabled").unwrap_or(true),
                "created_at":   r.try_get::<Option<String>, _>("created_at").ok().flatten(),
            })
        })
        .collect();

    Ok(Json(json!({ "accounts": accounts })))
}

async fn create_account_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(body): Json<Value>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;

    let label = body["label"].as_str().unwrap_or("").trim().to_string();
    if label.is_empty() || label.len() > 200 {
        return Err((
            StatusCode::BAD_REQUEST,
            "label must be 1â€“200 characters".to_string(),
        ));
    }
    let account_type = body["account_type"]
        .as_str()
        .unwrap_or("checking")
        .to_string();
    if !["checking", "savings", "credit", "investment", "other"].contains(&account_type.as_str()) {
        return Err((
            StatusCode::BAD_REQUEST,
            "account_type must be checking, savings, credit, investment, or other".to_string(),
        ));
    }
    let source = body["source"].as_str().unwrap_or("manual").to_string();
    if !["manual", "csv", "plaid"].contains(&source.as_str()) {
        return Err((
            StatusCode::BAD_REQUEST,
            "source must be manual, csv, or plaid".to_string(),
        ));
    }

    let account_id = Ulid::new().to_string();
    let institution = body["institution"]
        .as_str()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    let currency = body["currency"].as_str().unwrap_or("AUD").to_uppercase();
    let masked_number = body["masked_number"]
        .as_str()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    let external_id = body["external_id"].as_str().map(|s| s.to_string());

    sqlx::query(
        "INSERT INTO finance_accounts
             (account_id, user_id, label, institution, account_type, currency, source, masked_number, external_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
    )
    .bind(&account_id)
    .bind(&user.id)
    .bind(&label)
    .bind(&institution)
    .bind(&account_type)
    .bind(&currency)
    .bind(&source)
    .bind(&masked_number)
    .bind(&external_id)
    .execute(&state.db.pool)
    .await
    .map_err(internal_error)
    .map_err(status_to_http)?;

    // Emit AFP message so the Knowledge Curator can index it
    let afp_msg_id = format!("finance-account.{account_id}");
    let content = json!({
        "account_id":   account_id,
        "label":        label,
        "institution":  institution,
        "account_type": account_type,
        "currency":     currency,
        "source":       source,
    });
    let afp_msg = crate::afp::Message {
        protocol: "afp-v1".to_string(),
        id: afp_msg_id.clone(),
        thread_id: format!("thread.finance.{}", user.id),
        parent_id: String::new(),
        from: format!("omnyid://user/{}", user.id),
        to: vec!["omnyid://workspace/user".to_string()],
        timestamp: chrono::Utc::now().to_rfc3339(),
        r#type: crate::message::AFP_TYPE_FINANCE_ACCOUNT_LINKED.to_string(),
        kind: None,
        supertags: vec![],
        content: content.to_string(),
        signature: String::new(),
        encryption: "{}".to_string(),
        views: "[]".to_string(),
        references: "[]".to_string(),
        attachments: "[]".to_string(),
        store_in_relational: false,
        subtype: String::new(),
        metadata: json!({ "store": false }).to_string(),
    };
    let _ = state
        .db
        .store_private_message(&user.id, &afp_msg, content)
        .await;

    Ok(Json(json!({ "account_id": account_id })))
}

async fn delete_account_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(account_id): Path<String>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    sqlx::query("UPDATE finance_accounts SET enabled = false, updated_at = NOW() WHERE account_id = $1 AND user_id = $2")
        .bind(&account_id)
        .bind(&user.id)
        .execute(&state.db.pool)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    Ok(Json(json!({ "ok": true })))
}

// â”€â”€ Transaction handlers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async fn list_transactions_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Query(params): Query<HashMap<String, String>>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let account_id = params
        .get("account_id")
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    let category = params
        .get("category")
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    let anomaly_only = params
        .get("anomaly_only")
        .map(|s| s == "true")
        .unwrap_or(false);
    let from = params
        .get("from")
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    let to = params
        .get("to")
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    let limit: i64 = params
        .get("limit")
        .and_then(|s| s.parse().ok())
        .unwrap_or(50)
        .min(200);

    let rows = sqlx::query(
        "SELECT t.txn_id, t.account_id, a.label AS account_label, t.txn_date::text AS txn_date,
                t.amount_cents, t.currency, t.description, t.merchant_name, t.category,
                t.is_anomaly, t.anomaly_reason, t.created_at::text AS created_at
         FROM finance_transactions t
         JOIN finance_accounts a ON a.account_id = t.account_id
         WHERE t.user_id = $1
           AND ($2::text IS NULL OR t.account_id = $2)
           AND ($3::text IS NULL OR t.category = $3)
           AND ($4 = false OR t.is_anomaly = true)
           AND ($5::date IS NULL OR t.txn_date >= $5::date)
           AND ($6::date IS NULL OR t.txn_date <= $6::date)
         ORDER BY t.txn_date DESC, t.created_at DESC LIMIT $7",
    )
    .bind(&user.id)
    .bind(&account_id)
    .bind(&category)
    .bind(anomaly_only)
    .bind(&from)
    .bind(&to)
    .bind(limit)
    .fetch_all(&state.db.pool)
    .await
    .map_err(internal_error)
    .map_err(status_to_http)?;

    let txns: Vec<Value> = rows
        .iter()
        .map(|r| {
            json!({
                "txn_id":         r.try_get::<String, _>("txn_id").unwrap_or_default(),
                "account_id":     r.try_get::<String, _>("account_id").unwrap_or_default(),
                "account_label":  r.try_get::<String, _>("account_label").unwrap_or_default(),
                "txn_date":       r.try_get::<String, _>("txn_date").unwrap_or_default(),
                "amount_cents":   r.try_get::<i64, _>("amount_cents").unwrap_or(0),
                "currency":       r.try_get::<String, _>("currency").unwrap_or_default(),
                "description":    r.try_get::<String, _>("description").unwrap_or_default(),
                "merchant_name":  r.try_get::<Option<String>, _>("merchant_name").ok().flatten(),
                "category":       r.try_get::<Option<String>, _>("category").ok().flatten(),
                "is_anomaly":     r.try_get::<bool, _>("is_anomaly").unwrap_or(false),
                "anomaly_reason": r.try_get::<Option<String>, _>("anomaly_reason").ok().flatten(),
                "created_at":     r.try_get::<Option<String>, _>("created_at").ok().flatten(),
            })
        })
        .collect();

    Ok(Json(json!({ "transactions": txns, "count": txns.len() })))
}

/// Import transactions from a JSON body representing a CSV parse result.
/// Body: `{ "account_id": "...", "rows": [{ "date": "YYYY-MM-DD", "amount_cents": -1500, "description": "..." }] }`
async fn import_transactions_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(body): Json<Value>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;

    let account_id = body["account_id"]
        .as_str()
        .ok_or_else(|| (StatusCode::BAD_REQUEST, "account_id required".to_string()))?;

    // Verify account belongs to user
    let exists_row = sqlx::query(
        "SELECT EXISTS(SELECT 1 FROM finance_accounts WHERE account_id = $1 AND user_id = $2 AND enabled = true) AS e",
    )
    .bind(account_id)
    .bind(&user.id)
    .fetch_one(&state.db.pool)
    .await
    .map_err(internal_error)
    .map_err(status_to_http)?;
    if !exists_row.try_get::<bool, _>("e").unwrap_or(false) {
        return Err((StatusCode::NOT_FOUND, "account not found".to_string()));
    }

    let rows = body["rows"]
        .as_array()
        .ok_or_else(|| (StatusCode::BAD_REQUEST, "rows must be an array".to_string()))?;
    if rows.len() > 2000 {
        return Err((
            StatusCode::BAD_REQUEST,
            "at most 2000 rows per import".to_string(),
        ));
    }

    let mut imported = 0usize;
    let mut skipped = 0usize;

    for row in rows {
        let date_str = row["date"].as_str().unwrap_or("").trim().to_string();
        let amount_cents = match row["amount_cents"].as_i64() {
            Some(v) => v,
            None => {
                skipped += 1;
                continue;
            }
        };
        let description = row["description"].as_str().unwrap_or("").trim().to_string();
        let merchant = row["merchant_name"]
            .as_str()
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty());
        let currency = row["currency"].as_str().unwrap_or("AUD").to_uppercase();
        let category = Some(classify_transaction(&description, merchant.as_deref()));

        let txn_id = Ulid::new().to_string();
        let result = sqlx::query(
            "INSERT INTO finance_transactions
                 (txn_id, user_id, account_id, txn_date, amount_cents, currency, description, merchant_name, category)
             VALUES ($1, $2, $3, $4::date, $5, $6, $7, $8, $9)
             ON CONFLICT DO NOTHING",
        )
        .bind(&txn_id)
        .bind(&user.id)
        .bind(account_id)
        .bind(&date_str)
        .bind(amount_cents)
        .bind(&currency)
        .bind(&description)
        .bind(&merchant)
        .bind(&category)
        .execute(&state.db.pool)
        .await;

        match result {
            Ok(r) if r.rows_affected() > 0 => imported += 1,
            _ => skipped += 1,
        }
    }

    Ok(Json(json!({ "imported": imported, "skipped": skipped })))
}

// â”€â”€ Insights â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async fn finance_insights_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Query(params): Query<HashMap<String, String>>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let months: i32 = params
        .get("months")
        .and_then(|s| s.parse().ok())
        .unwrap_or(3)
        .min(24);

    let category_rows = sqlx::query(
        "SELECT category, SUM(ABS(amount_cents)) AS total_cents, COUNT(*) AS txn_count
         FROM finance_transactions
         WHERE user_id = $1 AND amount_cents < 0
           AND txn_date >= CURRENT_DATE - ($2 * INTERVAL '1 month')
         GROUP BY category
         ORDER BY total_cents DESC LIMIT 20",
    )
    .bind(&user.id)
    .bind(months)
    .fetch_all(&state.db.pool)
    .await
    .map_err(internal_error)
    .map_err(status_to_http)?;

    let by_category: Vec<Value> = category_rows
        .iter()
        .map(|r| {
            json!({
                "category":    r.try_get::<Option<String>, _>("category").ok().flatten().unwrap_or_else(|| "other".to_string()),
                "total_cents": r.try_get::<i64, _>("total_cents").unwrap_or(0),
                "txn_count":   r.try_get::<i64, _>("txn_count").unwrap_or(0),
            })
        })
        .collect();

    let monthly_rows = sqlx::query(
        "SELECT DATE_TRUNC('month', txn_date)::date::text AS month,
                SUM(CASE WHEN amount_cents < 0 THEN ABS(amount_cents) ELSE 0 END) AS expenses_cents,
                SUM(CASE WHEN amount_cents > 0 THEN amount_cents ELSE 0 END) AS income_cents
         FROM finance_transactions
         WHERE user_id = $1
           AND txn_date >= CURRENT_DATE - ($2 * INTERVAL '1 month')
         GROUP BY month ORDER BY month DESC",
    )
    .bind(&user.id)
    .bind(months)
    .fetch_all(&state.db.pool)
    .await
    .map_err(internal_error)
    .map_err(status_to_http)?;

    let by_month: Vec<Value> = monthly_rows
        .iter()
        .map(|r| {
            json!({
                "month":          r.try_get::<String, _>("month").unwrap_or_default(),
                "expenses_cents": r.try_get::<i64, _>("expenses_cents").unwrap_or(0),
                "income_cents":   r.try_get::<i64, _>("income_cents").unwrap_or(0),
            })
        })
        .collect();

    Ok(Json(json!({
        "period_months": months,
        "by_category":   by_category,
        "by_month":      by_month,
    })))
}

async fn finance_anomalies_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Query(params): Query<HashMap<String, String>>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let limit: i64 = params
        .get("limit")
        .and_then(|s| s.parse().ok())
        .unwrap_or(20)
        .min(100);

    let rows = sqlx::query(
        "SELECT t.txn_id, t.account_id, a.label AS account_label, t.txn_date::text AS txn_date,
                t.amount_cents, t.currency, t.description, t.merchant_name, t.category, t.anomaly_reason
         FROM finance_transactions t
         JOIN finance_accounts a ON a.account_id = t.account_id
         WHERE t.user_id = $1 AND t.is_anomaly = true
         ORDER BY t.txn_date DESC LIMIT $2",
    )
    .bind(&user.id)
    .bind(limit)
    .fetch_all(&state.db.pool)
    .await
    .map_err(internal_error)
    .map_err(status_to_http)?;

    let anomalies: Vec<Value> = rows
        .iter()
        .map(|r| {
            json!({
                "txn_id":         r.try_get::<String, _>("txn_id").unwrap_or_default(),
                "account_id":     r.try_get::<String, _>("account_id").unwrap_or_default(),
                "account_label":  r.try_get::<String, _>("account_label").unwrap_or_default(),
                "txn_date":       r.try_get::<String, _>("txn_date").unwrap_or_default(),
                "amount_cents":   r.try_get::<i64, _>("amount_cents").unwrap_or(0),
                "currency":       r.try_get::<String, _>("currency").unwrap_or_default(),
                "description":    r.try_get::<String, _>("description").unwrap_or_default(),
                "merchant_name":  r.try_get::<Option<String>, _>("merchant_name").ok().flatten(),
                "category":       r.try_get::<Option<String>, _>("category").ok().flatten(),
                "anomaly_reason": r.try_get::<Option<String>, _>("anomaly_reason").ok().flatten(),
            })
        })
        .collect();

    Ok(Json(
        json!({ "anomalies": anomalies, "count": anomalies.len() }),
    ))
}

// â”€â”€ Finance Guardian run â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/// Trigger the Finance Guardian analysis pass:
/// 1. Re-classify any uncategorised transactions
/// 2. Detect anomalies (spend > 3Ã— category 90-day average)
/// 3. Emit AFP messages: finance_report + finance_anomaly per detected anomaly
async fn run_finance_guardian_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;

    // Step 1: re-classify uncategorised rows
    let uncategorised: Vec<(String, String, Option<String>)> = sqlx::query(
        "SELECT txn_id, description, merchant_name FROM finance_transactions
         WHERE user_id = $1 AND (category IS NULL OR category = 'other')
         LIMIT 500",
    )
    .bind(&user.id)
    .fetch_all(&state.db.pool)
    .await
    .map_err(internal_error)
    .map_err(status_to_http)?
    .into_iter()
    .map(|r| {
        (
            r.try_get::<String, _>("txn_id").unwrap_or_default(),
            r.try_get::<String, _>("description").unwrap_or_default(),
            r.try_get::<Option<String>, _>("merchant_name")
                .ok()
                .flatten(),
        )
    })
    .collect();

    let mut reclassified = 0usize;
    for (txn_id, description, merchant) in &uncategorised {
        let category = classify_transaction(description, merchant.as_deref());
        if category != "other" {
            let _ = sqlx::query("UPDATE finance_transactions SET category = $2 WHERE txn_id = $1")
                .bind(txn_id)
                .bind(category)
                .execute(&state.db.pool)
                .await;
            reclassified += 1;
        }
    }

    // Step 2: detect anomalies â€” transactions > 3Ã— category 90-day average
    let avg_rows = sqlx::query(
        "SELECT category, AVG(ABS(amount_cents)) AS avg_cents
         FROM finance_transactions
         WHERE user_id = $1 AND amount_cents < 0
           AND txn_date >= CURRENT_DATE - INTERVAL '90 days'
         GROUP BY category",
    )
    .bind(&user.id)
    .fetch_all(&state.db.pool)
    .await
    .map_err(internal_error)
    .map_err(status_to_http)?;

    let category_avgs: std::collections::HashMap<String, f64> = avg_rows
        .iter()
        .filter_map(|r| {
            let cat = r.try_get::<Option<String>, _>("category").ok().flatten()?;
            let avg = r.try_get::<f64, _>("avg_cents").ok()?;
            Some((cat, avg))
        })
        .collect();

    let recent_rows = sqlx::query(
        "SELECT txn_id, amount_cents, category, description, merchant_name, txn_date::text AS txn_date
         FROM finance_transactions
         WHERE user_id = $1 AND amount_cents < 0
           AND txn_date >= CURRENT_DATE - INTERVAL '7 days'
           AND is_anomaly = false",
    )
    .bind(&user.id)
    .fetch_all(&state.db.pool)
    .await
    .map_err(internal_error)
    .map_err(status_to_http)?;

    let mut anomalies_detected = 0usize;
    let mut anomaly_afp_ids: Vec<String> = Vec::new();

    for row in &recent_rows {
        let txn_id = row.try_get::<String, _>("txn_id").unwrap_or_default();
        let amount = row
            .try_get::<i64, _>("amount_cents")
            .unwrap_or(0)
            .unsigned_abs() as f64;
        let cat = row
            .try_get::<Option<String>, _>("category")
            .ok()
            .flatten()
            .unwrap_or_else(|| "other".to_string());
        let desc = row.try_get::<String, _>("description").unwrap_or_default();
        let date_str = row.try_get::<String, _>("txn_date").unwrap_or_default();

        let avg = category_avgs.get(&cat).copied().unwrap_or(0.0);
        if avg > 0.0 && amount > avg * 3.0 {
            let reason = format!(
                "{:.0}% above average {} spend",
                ((amount / avg - 1.0) * 100.0).round(),
                cat
            );
            let _ = sqlx::query(
                "UPDATE finance_transactions SET is_anomaly = true, anomaly_reason = $2 WHERE txn_id = $1",
            )
            .bind(&txn_id)
            .bind(&reason)
            .execute(&state.db.pool)
            .await;
            anomalies_detected += 1;

            // Emit finance_anomaly AFP message
            let afp_id = format!("finance-anomaly.{txn_id}");
            let content = json!({
                "txn_id":       txn_id,
                "description":  desc,
                "amount_cents": amount as i64,
                "category":     cat,
                "txn_date":     date_str,
                "reason":       reason,
                "severity":     if amount > avg * 5.0 { "high" } else { "medium" },
            });
            let afp_msg = crate::afp::Message {
                protocol: "afp-v1".to_string(),
                id: afp_id.clone(),
                thread_id: format!("thread.finance.{}", user.id),
                parent_id: String::new(),
                from: FINANCE_GUARDIAN_AGENT.to_string(),
                to: vec![format!("omnyid://user/{}", user.id)],
                timestamp: chrono::Utc::now().to_rfc3339(),
                r#type: crate::message::AFP_TYPE_FINANCE_ANOMALY.to_string(),
                kind: None,
                supertags: vec![],
                content: content.to_string(),
                signature: String::new(),
                encryption: "{}".to_string(),
                views: "[]".to_string(),
                references: "[]".to_string(),
                attachments: "[]".to_string(),
                store_in_relational: false,
                subtype: String::new(),
                metadata: "{}".to_string(),
            };
            let _ = state
                .db
                .store_private_message(&user.id, &afp_msg, content)
                .await;
            anomaly_afp_ids.push(afp_id);
        }
    }

    // Step 3: emit a finance_report AFP message summarising the run
    let report_id = format!("finance-report.{}", Ulid::new());
    let report_content = json!({
        "reclassified":        reclassified,
        "anomalies_detected":  anomalies_detected,
        "anomaly_afp_ids":     anomaly_afp_ids,
        "run_at":              chrono::Utc::now().to_rfc3339(),
    });
    let report_msg = crate::afp::Message {
        protocol: "afp-v1".to_string(),
        id: report_id.clone(),
        thread_id: format!("thread.finance.{}", user.id),
        parent_id: String::new(),
        from: FINANCE_GUARDIAN_AGENT.to_string(),
        to: vec![format!("omnyid://user/{}", user.id)],
        timestamp: chrono::Utc::now().to_rfc3339(),
        r#type: crate::message::AFP_TYPE_FINANCE_REPORT.to_string(),
        kind: None,
        supertags: vec![],
        content: report_content.to_string(),
        signature: String::new(),
        encryption: "{}".to_string(),
        views: "[]".to_string(),
        references: "[]".to_string(),
        attachments: "[]".to_string(),
        store_in_relational: false,
        subtype: String::new(),
        metadata: "{}".to_string(),
    };
    let _ = state
        .db
        .store_private_message(&user.id, &report_msg, report_content)
        .await;
    let _ = state
        .db
        .prune_private_messages_to_recent_limit(
            &user.id,
            crate::message::AFP_TYPE_FINANCE_REPORT,
            "",
            FINANCE_GUARDIAN_AGENT,
            FINANCE_REPORT_RETENTION_LIMIT,
        )
        .await;

    Ok(Json(json!({
        "reclassified":       reclassified,
        "anomalies_detected": anomalies_detected,
        "report_afp_id":      report_id,
    })))
}
