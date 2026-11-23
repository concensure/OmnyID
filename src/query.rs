use serde_json::Value;
use sqlx::{PgPool, Row};

pub async fn semantic_search(
    pool: &PgPool,
    query_embedding: Vec<f32>,
    limit: i64,
) -> Result<Vec<Value>, sqlx::Error> {
    let rows =
        sqlx::query("SELECT content, summary FROM messages ORDER BY embedding <=> $1 LIMIT $2")
            .bind(&query_embedding)
            .bind(limit)
            .fetch_all(pool)
            .await?;

    Ok(rows
        .into_iter()
        .map(|row| {
            let content: Value = row
                .try_get("content")
                .unwrap_or_else(|_| serde_json::json!({}));
            let summary: Option<String> = row.try_get("summary").ok();
            serde_json::json!({ "content": content, "summary": summary })
        })
        .collect())
}

pub async fn apply_archival_policy(pool: &PgPool) -> Result<(), sqlx::Error> {
    sqlx::query("DELETE FROM messages WHERE expires_at < NOW() AND legal_hold = false")
        .execute(pool)
        .await?;
    Ok(())
}
