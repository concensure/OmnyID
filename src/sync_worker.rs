use sqlx::{PgPool, Row};
use tokio::task::JoinHandle;
use tracing::{info, warn};

use crate::daemon_runtime::ShutdownRx;

pub async fn start_sync_worker(
    pool: PgPool,
    mut shutdown: ShutdownRx,
) -> Result<JoinHandle<()>, sqlx::Error> {
    let mut listener = sqlx::postgres::PgListener::connect_with(&pool).await?;
    listener.listen("new_message").await?;

    Ok(tokio::spawn(async move {
        loop {
            tokio::select! {
                recv = listener.recv() => {
                    match recv {
                        Ok(notification) => {
                            let msg_id = notification.payload();
                            if let Ok(row) =
                                sqlx::query("SELECT thread_id, content FROM messages WHERE id = $1")
                                    .bind(msg_id)
                                    .fetch_one(&pool)
                                    .await
                            {
                                let thread_id: String = row.try_get("thread_id").unwrap_or_default();
                                let content: serde_json::Value = row
                                    .try_get("content")
                                    .unwrap_or_else(|_| serde_json::json!({}));

                                if let Some(true) = content
                                    .get("store_in_relational")
                                    .and_then(|value| value.as_bool())
                                {
                                    let _ = sqlx::query(
                                        "INSERT INTO invoices (id, thread_id, amount, status) VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO NOTHING",
                                    )
                                    .bind(msg_id)
                                    .bind(thread_id)
                                    .bind(content["amount"].as_f64().unwrap_or(0.0))
                                    .bind(content["status"].as_str().unwrap_or("pending"))
                                    .execute(&pool)
                                    .await;
                                }
                            }
                        }
                        Err(err) => {
                            warn!(%err, "sync worker listener receive failed");
                        }
                    }
                }
                _ = shutdown.changed() => {
                    if *shutdown.borrow() {
                        info!("Sync worker: graceful shutdown");
                        break;
                    }
                }
            }
        }
    }))
}
