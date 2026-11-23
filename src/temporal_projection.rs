/*
 * @module-id: rust.temporal-projection
 * @primary-capability: rust.source-module
 * @locs-version: 2.0
 * @stability: active
 * @owner: omnyid
 */

/// Temporal Projection agent â€” Pillar B of Continuity.
///
/// Reads the `temporal_summary` materialized view and recent AFP messages to
/// build a forward-looking projection objective dispatched via the agent
/// orchestrator.  The LLM synthesizes `temporal_projection` AFP messages that
/// flag deadline risks, slipping projects, and schedule pressure.
use chrono::{Duration, Utc};
use serde_json::{Value, json};
use ulid::Ulid;

use crate::{
    db::Db,
    message::{AFP_TYPE_TEMPORAL_PROJECTION, AfpProjectionRisk, AfpTemporalProjectionContent},
};

/// Build the LLM objective for generating a temporal projection.
/// Returns the objective string ready for `/agent/orchestrate`.
pub async fn build_temporal_projection_objective(
    db: &Db,
    user_id: &str,
    horizon_days: u32,
) -> Result<String, sqlx::Error> {
    let summary_rows = db.query_temporal_summary(20).await?;
    let recent_tasks = db.list_afp_messages_by_type(user_id, &["task"], 15).await?;

    let horizon_date = (Utc::now() + Duration::days(horizon_days as i64))
        .format("%Y-%m-%d")
        .to_string();

    let objective = format!(
        "You are the Temporal Projection agent for OmnyID. \
        Today is {}. Analyse the following temporal patterns and active tasks, \
        then produce a {}-day forward projection for this user.\n\n\
        ## Temporal patterns (recency-weighted)\n{}\n\n\
        ## Active tasks\n{}\n\n\
        Return an AFP message with:\n\
          type: \"temporal_projection\"\n\
          content fields: horizon_days={}, summary (1â€“2 sentences), \
          risks (array of {{label, severity, recommended_action}}), \
          confidence (0.0â€“1.0), period_start (today ISO-8601), period_end ({} ISO-8601)\n\
        Wrap in AFP JSON with id (new ULID), thread_id \"continuity:temporal:{}\", \
        from \"temporal_projection_agent\", to [\"{}\"], \
        metadata.store=true, store_in_relational=true.",
        Utc::now().format("%Y-%m-%d"),
        horizon_days,
        serde_json::to_string_pretty(&summary_rows).unwrap_or_default(),
        serde_json::to_string_pretty(&recent_tasks).unwrap_or_default(),
        horizon_days,
        horizon_date,
        user_id,
        user_id,
    );

    Ok(objective)
}

/// Build a rule-based `temporal_projection` AFP for use when temporal_summary
/// data is available but an LLM call is not warranted (e.g. low-confidence
/// heuristic fallback).
pub fn build_heuristic_temporal_projection_afp(
    user_id: &str,
    summary_rows: &[Value],
    horizon_days: u32,
) -> Value {
    let now = Utc::now();
    let period_end = (now + Duration::days(horizon_days as i64))
        .format("%Y-%m-%d")
        .to_string();

    // Count event types with high frequency to flag load.
    let high_freq_count = summary_rows
        .iter()
        .filter(|r| r["avg_frequency_hours"].as_f64().unwrap_or(999.0) < 24.0)
        .count();

    let (summary, risks) = if high_freq_count > 5 {
        (
            format!(
                "High activity detected: {} frequently recurring event types. \
                Schedule pressure looks elevated over the next {} days.",
                high_freq_count, horizon_days
            ),
            vec![AfpProjectionRisk {
                label: "Heavy recurring load".to_string(),
                severity: "medium".to_string(),
                recommended_action:
                    "Review recurring commitments and consider deferring lower-priority items."
                        .to_string(),
            }],
        )
    } else {
        (
            format!(
                "Activity looks manageable over the next {} days based on recent patterns.",
                horizon_days
            ),
            vec![],
        )
    };

    let content = AfpTemporalProjectionContent {
        horizon_days,
        summary,
        risks,
        confidence: 0.55,
        period_start: now.format("%Y-%m-%d").to_string(),
        period_end,
    };

    let id = Ulid::new().to_string();
    json!({
        "protocol": "afp-v1",
        "id": id,
        "thread_id": format!("continuity:temporal:{}", user_id),
        "from": "temporal_projection_agent",
        "to": [user_id],
        "timestamp": now.to_rfc3339(),
        "type": AFP_TYPE_TEMPORAL_PROJECTION,
        "content": {
            "horizon_days": content.horizon_days,
            "summary": content.summary,
            "risks": content.risks,
            "confidence": content.confidence,
            "period_start": content.period_start,
            "period_end": content.period_end,
        },
        "views": [{
            "schema_version": "a2ui.v1",
            "kind": "insight_line",
            "props": {
                "icon": "ðŸ“…",
                "title": content.summary,
                "badge": format!("{}-day projection", horizon_days),
                "badge_tone": "info",
            },
        }],
        "metadata": { "store": true, "continuity": true },
        "store_in_relational": true,
    })
}
