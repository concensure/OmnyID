/*
 * @module-id: rust.server.wedding-invite-proposal-opportunity-ledger
 * @primary-capability: private AFP lifecycle events for category proposal opportunities
 * @locs-version: 1.0
 */

use chrono::{DateTime, Utc};
use serde_json::{Map, Value, json};
use sqlx::{Postgres, Transaction};
use ulid::Ulid;

use crate::db::tenant_schema_name;

fn clean(value: &str, limit: usize) -> String {
    value.trim().chars().take(limit).collect()
}

pub(super) fn sanitized_context(value: &Value) -> Value {
    let source = value.as_object();
    let mut output = Map::new();
    for key in ["date_or_season", "location"] {
        if let Some(value) = source
            .and_then(|record| record.get(key))
            .and_then(Value::as_str)
        {
            output.insert(key.to_string(), Value::String(clean(value, 240)));
        }
    }
    if let Some(value) = source.and_then(|record| record.get("guest_count")) {
        if value.as_u64().is_some_and(|count| count <= 10_000) {
            output.insert("guest_count".into(), value.clone());
        } else if let Some(value) = value.as_str() {
            output.insert("guest_count".into(), Value::String(clean(value, 32)));
        }
    }
    if let Some(values) = source
        .and_then(|record| record.get("style_priorities"))
        .and_then(Value::as_array)
    {
        output.insert(
            "style_priorities".into(),
            Value::Array(
                values
                    .iter()
                    .filter_map(Value::as_str)
                    .map(|value| Value::String(clean(value, 120)))
                    .filter(|value| value.as_str().is_some_and(|value| !value.is_empty()))
                    .take(8)
                    .collect(),
            ),
        );
    }
    if let Some(value) = source
        .and_then(|record| record.get("approximate_category_budget"))
        .and_then(Value::as_object)
    {
        let amount = value
            .get("amount")
            .and_then(Value::as_f64)
            .filter(|amount| amount.is_finite() && *amount >= 0.0 && *amount <= 100_000_000.0);
        let currency = value
            .get("currency")
            .and_then(Value::as_str)
            .map(|value| clean(value, 3).to_ascii_uppercase());
        if let (Some(amount), Some(currency)) = (amount, currency) {
            output.insert(
                "approximate_category_budget".into(),
                json!({"amount":amount,"currency":currency}),
            );
        }
    }
    if let Some(value) = source
        .and_then(|record| record.get("allow_phone_contact"))
        .and_then(Value::as_bool)
    {
        output.insert("allow_phone_contact".into(), Value::Bool(value));
    }
    Value::Object(output)
}

pub(super) struct OpportunityLedgerEvent<'a> {
    pub owner_user_id: &'a str,
    pub opportunity_id: &'a str,
    pub wedding_plan_id: &'a str,
    pub response_workspace_id: &'a str,
    pub category: &'a str,
    pub status: &'a str,
    pub event_kind: &'a str,
    pub shared_context: &'a Value,
    pub expires_at: DateTime<Utc>,
}

pub(super) async fn append_opportunity_ledger_event(
    tx: &mut Transaction<'_, Postgres>,
    input: OpportunityLedgerEvent<'_>,
) -> Result<(), sqlx::Error> {
    let id = format!("proposal-opportunity-ledger-{}", Ulid::new());
    let table = format!("\"{}\".messages", tenant_schema_name(input.owner_user_id));
    let content = json!({
        "kind":"wedding_vendor_proposal_opportunity",
        "opportunity_id":input.opportunity_id,
        "wedding_plan_id":input.wedding_plan_id,
        "response_workspace_id":input.response_workspace_id,
        "category":input.category,
        "status":input.status,
        "event_kind":input.event_kind,
        "shared_context":input.shared_context,
        "expires_at":input.expires_at.to_rfc3339(),
        "external_action":false,
    });
    let metadata = json!({
        "template":"wedding_planning",
        "weddingPlanId":input.wedding_plan_id,
        "responseWorkspaceId":input.response_workspace_id,
        "opportunity_id":input.opportunity_id,
        "origin":"wedding_invite_proposal",
        "privacy_scope":"tenant_private",
        "model_calls":0,
    });
    let query = format!(
        "INSERT INTO {table} (id,thread_id,from_agent,to_agents,timestamp,type,kind,subtype,content,signature,store_in_relational,metadata,\"references\",supertags) VALUES ($1,$2,$3,$4,$5,'event','wedding_vendor_proposal_opportunity','wedding_vendor_proposal_opportunity',$6,'server:wedding-invite-proposal:v1',TRUE,$7,$8,$9)"
    );
    sqlx::query(&query)
        .bind(id)
        .bind(format!("wedding-proposal:{}", input.response_workspace_id))
        .bind("system://wedding-invite-proposal")
        .bind(json!(["user://couple", "agent://knowledge-graph"]))
        .bind(Utc::now())
        .bind(content)
        .bind(metadata)
        .bind(json!([{
            "type":"proposal_opportunity",
            "target":input.opportunity_id,
            "label":"Invite Proposals opportunity"
        }]))
        .bind(vec![
            "template:wedding_planning",
            "wedding_vendor_proposal",
            "proposal_opportunity",
        ])
        .execute(&mut **tx)
        .await?;
    Ok(())
}
