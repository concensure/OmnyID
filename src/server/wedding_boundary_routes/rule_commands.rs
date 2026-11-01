use super::*;
use std::collections::BTreeSet;

const OPERATIONS: [&str; 2] = ["archive_rule", "supersede_rule"];
const RULE_TYPES: [&str; 9] = [
    "plus_one",
    "children",
    "invitation_scope",
    "allocation",
    "deadline",
    "visibility",
    "access",
    "seating",
    "communication",
];
const SCOPE_KINDS: [&str; 4] = ["wedding", "family_group", "household", "guest"];
const EFFECTS: [&str; 5] = ["require_approval", "deny", "allow", "limit", "notify"];
const AUTHORITIES: [&str; 3] = ["couple", "partner_pair", "planner"];

pub(super) fn routes() -> Router<Arc<AppState>> {
    Router::new().route(
        "/wedding/boundaries/rules/commands",
        post(apply_rule_command),
    )
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct RuleReplacement {
    title: String,
    plain_language: String,
    rule_type: String,
    scope_kind: String,
    scope_id: Option<String>,
    effect: String,
    authority: String,
    effective_until: Option<String>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct RuleCommandRequest {
    wedding_plan_id: String,
    response_workspace_id: String,
    operation: String,
    rule_id: String,
    expected_version: i64,
    replacement: Option<RuleReplacement>,
    confirmed_elevated_impact: Option<bool>,
    idempotency_key: String,
}

fn validate_replacement(value: &RuleReplacement) -> Result<(), (StatusCode, String)> {
    let scope_id_valid =
        value.scope_kind == "wedding" || value.scope_id.as_deref().is_some_and(valid_id);
    if !valid_label(&value.title)
        || value.plain_language.trim().is_empty()
        || value.plain_language.chars().count() > 1_000
        || value.plain_language.chars().any(char::is_control)
        || !RULE_TYPES.contains(&value.rule_type.as_str())
        || !SCOPE_KINDS.contains(&value.scope_kind.as_str())
        || !scope_id_valid
        || !EFFECTS.contains(&value.effect.as_str())
        || !AUTHORITIES.contains(&value.authority.as_str())
        || value
            .effective_until
            .as_deref()
            .is_some_and(|date| chrono::NaiveDate::parse_from_str(date, "%Y-%m-%d").is_err())
    {
        return Err(bad("Review the replacement rule before saving it."));
    }
    Ok(())
}

fn validate_request(request: &RuleCommandRequest) -> Result<(), (StatusCode, String)> {
    if !valid_id(&request.wedding_plan_id)
        || !valid_id(&request.response_workspace_id)
        || !valid_id(&request.rule_id)
        || !valid_id(&request.idempotency_key)
        || request.expected_version < 1
        || !OPERATIONS.contains(&request.operation.as_str())
        || (request.operation == "archive_rule" && request.replacement.is_some())
        || (request.operation == "supersede_rule" && request.replacement.is_none())
    {
        return Err(bad("Review the current rule before applying this change."));
    }
    if let Some(replacement) = &request.replacement {
        validate_replacement(replacement)?;
    }
    Ok(())
}

async fn latest_policy(
    tx: &mut Transaction<'_, Postgres>,
    table: &str,
    request: &RuleCommandRequest,
) -> Result<Value, (StatusCode, String)> {
    let query = format!(
        "SELECT m.content FROM {table} m WHERE m.kind='wedding_boundary_policy' AND m.content->>'boundary_object_id'=$1 AND {} ORDER BY COALESCE((m.content->>'version')::bigint,1) DESC,m.timestamp DESC,m.id DESC LIMIT 1 FOR UPDATE",
        metadata_scope("m", 2, 3)
    );
    sqlx::query_scalar(&query)
        .bind(&request.rule_id)
        .bind(&request.wedding_plan_id)
        .bind(&request.response_workspace_id)
        .fetch_optional(&mut **tx)
        .await
        .map_err(store_error)?
        .ok_or_else(|| conflict("That family rule is no longer available."))
}

async fn latest_kind(
    tx: &mut Transaction<'_, Postgres>,
    table: &str,
    plan: &str,
    workspace: &str,
    kind: &str,
    identity: &str,
) -> Result<Vec<Value>, (StatusCode, String)> {
    let query = format!(
        "SELECT DISTINCT ON (m.content->>$1) m.content FROM {table} m WHERE m.kind=$2 AND {} ORDER BY m.content->>$1,m.timestamp DESC,m.id DESC",
        metadata_scope("m", 3, 4)
    );
    sqlx::query_scalar(&query)
        .bind(identity)
        .bind(kind)
        .bind(plan)
        .bind(workspace)
        .fetch_all(&mut **tx)
        .await
        .map_err(store_error)
}

fn active(value: &Value) -> bool {
    value.get("status").and_then(Value::as_str) != Some("archived")
}

async fn affected_scope(
    tx: &mut Transaction<'_, Postgres>,
    table: &str,
    request: &RuleCommandRequest,
    policy: &Value,
) -> Result<(Vec<String>, Vec<String>), (StatusCode, String)> {
    let households = latest_kind(
        tx,
        table,
        &request.wedding_plan_id,
        &request.response_workspace_id,
        "wedding_boundary_household",
        "household_id",
    )
    .await?;
    let guests = latest_kind(
        tx,
        table,
        &request.wedding_plan_id,
        &request.response_workspace_id,
        "wedding_boundary_guest_profile",
        "person_id",
    )
    .await?;
    let scope = policy
        .get("scope_kind")
        .and_then(Value::as_str)
        .unwrap_or("wedding");
    let scope_id = policy
        .get("scope_id")
        .and_then(Value::as_str)
        .unwrap_or_default();
    let household_ids = households
        .iter()
        .filter(|household| active(household))
        .filter(|household| match scope {
            "wedding" => true,
            "family_group" => {
                household.get("family_group_id").and_then(Value::as_str) == Some(scope_id)
            }
            "household" => household.get("household_id").and_then(Value::as_str) == Some(scope_id),
            _ => false,
        })
        .filter_map(|household| household.get("household_id").and_then(Value::as_str))
        .map(str::to_string)
        .collect::<BTreeSet<_>>();
    let person_ids = guests
        .iter()
        .filter(|guest| active(guest))
        .filter(|guest| {
            if scope == "guest" {
                return guest.get("person_id").and_then(Value::as_str) == Some(scope_id);
            }
            guest
                .get("household_id")
                .and_then(Value::as_str)
                .is_some_and(|id| household_ids.contains(id))
        })
        .filter_map(|guest| guest.get("person_id").and_then(Value::as_str))
        .map(str::to_string)
        .collect::<BTreeSet<_>>();
    let mut affected_households = household_ids.into_iter().collect::<Vec<_>>();
    if scope == "guest" {
        affected_households.extend(
            guests
                .iter()
                .filter(|guest| guest.get("person_id").and_then(Value::as_str) == Some(scope_id))
                .filter_map(|guest| guest.get("household_id").and_then(Value::as_str))
                .map(str::to_string),
        );
        affected_households.sort();
        affected_households.dedup();
    }
    Ok((affected_households, person_ids.into_iter().collect()))
}

fn next_policy_version(policy: &Value, status: &str) -> Value {
    let mut next = policy.clone();
    let version = policy.get("version").and_then(Value::as_i64).unwrap_or(1) + 1;
    let object = next.as_object_mut().expect("stored policies are objects");
    object.insert("version".into(), json!(version));
    object.insert("status".into(), json!(status));
    object.insert("rule_status".into(), json!(status));
    object.insert("previous_version".into(), json!(version - 1));
    next
}

fn replacement_policy(replacement: &RuleReplacement, supersedes_id: &str) -> Value {
    let rule_id = format!("wedding-policy-{}", Ulid::new());
    json!({
        "ledger_kind": "wedding_boundary_policy",
        "boundary_object_id": rule_id,
        "title": replacement.title.trim(),
        "status": "active",
        "visibility": "family_visible",
        "rule_type": replacement.rule_type,
        "enforcement": if replacement.effect == "deny" { "block" } else if replacement.effect == "require_approval" { "require_approval" } else { "warn" },
        "scope": "guest_list",
        "plain_language": replacement.plain_language.trim(),
        "approved_by": [],
        "scope_kind": replacement.scope_kind,
        "scope_id": replacement.scope_id,
        "condition": {},
        "effect": replacement.effect,
        "authority": replacement.authority,
        "effective_from": Utc::now().to_rfc3339(),
        "effective_until": replacement.effective_until,
        "rule_status": "active",
        "override_policy": "couple_only",
        "version": 1,
        "supersedes_id": supersedes_id,
        "private_rationale_encrypted": false
    })
}

async fn apply_rule_command(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<RuleCommandRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    enforce_rate_limit(
        &state,
        authenticated_rate_limit_key("wedding_boundary_rule_command", &headers),
        RateLimitPolicy {
            max_requests: 30,
            window: Duration::from_secs(60),
        },
    )
    .await?;
    validate_request(&request)?;
    let user = authenticated_user(&state.db, &headers).await?;
    state
        .db
        .ensure_user_private_schema(&user.id)
        .await
        .map_err(store_error)?;
    let table = tenant_table(&user.id);
    let mut tx = state.db.pool.begin().await.map_err(store_error)?;
    sqlx::query("SELECT pg_advisory_xact_lock(hashtext($1))")
        .bind(format!(
            "rule-command:{}:{}:{}",
            user.id, request.response_workspace_id, request.rule_id
        ))
        .execute(&mut *tx)
        .await
        .map_err(store_error)?;
    let command_fingerprint =
        fingerprint(&serde_json::to_value(&request).map_err(|_| bad("Invalid rule change."))?);
    if let Some(response) = replay_or_reserve(
        &mut tx,
        &user.id,
        &request.idempotency_key,
        "rule_command",
        &command_fingerprint,
    )
    .await?
    {
        tx.commit().await.map_err(store_error)?;
        return Ok(Json(response));
    }
    let policy = latest_policy(&mut tx, &table, &request).await?;
    let version = policy.get("version").and_then(Value::as_i64).unwrap_or(1);
    let current_status = policy
        .get("rule_status")
        .or_else(|| policy.get("status"))
        .and_then(Value::as_str)
        .unwrap_or("active");
    if version != request.expected_version || current_status != "active" {
        return Err(conflict(
            "That family rule changed. Review the latest version before continuing.",
        ));
    }
    let (household_ids, person_ids) = affected_scope(&mut tx, &table, &request, &policy).await?;
    let invitations = household_commands::invitation_snapshots(
        &mut tx,
        &table,
        &request.wedding_plan_id,
        &request.response_workspace_id,
        &person_ids,
    )
    .await?;
    let committed = invitations.iter().any(|invitation| {
        matches!(
            invitation.get("invitation_status").and_then(Value::as_str),
            Some("invited" | "rsvp_yes" | "waitlist")
        )
    });
    if committed && request.confirmed_elevated_impact != Some(true) {
        return Err(conflict(
            "Some affected invitations were sent or accepted. Confirm the elevated impact before changing this rule.",
        ));
    }
    let old_status = if request.operation == "archive_rule" {
        "archived"
    } else {
        "superseded"
    };
    append_event(
        &mut tx,
        &table,
        &format!("rule-command-{}", Ulid::new()),
        "wedding_boundary_policy",
        &request.wedding_plan_id,
        &request.response_workspace_id,
        next_policy_version(&policy, old_status),
    )
    .await?;
    let replacement_id = if let Some(replacement) = &request.replacement {
        let next = replacement_policy(replacement, &request.rule_id);
        let id = next
            .get("boundary_object_id")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string();
        append_event(
            &mut tx,
            &table,
            &format!("rule-command-{}", Ulid::new()),
            "wedding_boundary_policy",
            &request.wedding_plan_id,
            &request.response_workspace_id,
            next,
        )
        .await?;
        Some(id)
    } else {
        None
    };
    let receipt_id = format!("wedding-boundary-rule-impact-{}", Ulid::new());
    let connected_updates = vec![
        "Family rule version recorded",
        "Existing invitations and RSVP history preserved",
        "Guest, seating, catering, budget and task views queued for recheck",
    ];
    append_event(
        &mut tx,
        &table,
        &receipt_id,
        "wedding_boundary_impact_receipt",
        &request.wedding_plan_id,
        &request.response_workspace_id,
        json!({
            "receipt_id": receipt_id,
            "operation": request.operation,
            "actor": "couple",
            "causation": {"command_fingerprint": command_fingerprint, "rule_id": request.rule_id},
            "expected_version": request.expected_version,
            "replacement_rule_id": replacement_id,
            "reconciliation_reference": receipt_id,
            "affected_household_ids": household_ids,
            "affected_person_ids": person_ids,
            "affected_invitations": invitations,
            "effects": ["guest_list", "invitation_entitlement", "rsvp", "seating", "catering", "budget_forecast", "tasks"],
            "connected_updates": connected_updates,
            "response_history_preserved": true,
            "stable_invitation_references_preserved": true,
            "attendance_inferred": false,
            "invitation_sent": false,
            "spend_committed": false,
            "vendor_contract_changed": false,
            "private_content_copied": false
        }),
    )
    .await?;
    let response = json!({
        "status": "applied",
        "operation": request.operation,
        "rule_id": request.rule_id,
        "replacement_rule_id": replacement_id,
        "impact_receipt_id": receipt_id,
        "replayed": false,
        "explanation": if request.operation == "archive_rule" { "The rule is archived. Its history and existing invitation responses remain intact." } else { "The replacement rule is active. The previous version remains in the audit history." },
        "connected_updates": connected_updates,
        "response_history_preserved": true
    });
    finish_receipt(&mut tx, &user.id, &request.idempotency_key, &response).await?;
    tx.commit().await.map_err(store_error)?;
    Ok(Json(response))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn request(operation: &str) -> RuleCommandRequest {
        RuleCommandRequest {
            wedding_plan_id: "plan:test".into(),
            response_workspace_id: "workspace:test".into(),
            operation: operation.into(),
            rule_id: "rule:test".into(),
            expected_version: 1,
            replacement: None,
            confirmed_elevated_impact: Some(false),
            idempotency_key: "rule-command:test".into(),
        }
    }

    #[test]
    fn archive_rejects_a_replacement() {
        let mut input = request("archive_rule");
        input.replacement = Some(RuleReplacement {
            title: "Named guests".into(),
            plain_language: "Only named guests are included.".into(),
            rule_type: "invitation_scope".into(),
            scope_kind: "wedding".into(),
            scope_id: None,
            effect: "require_approval".into(),
            authority: "couple".into(),
            effective_until: None,
        });
        assert!(validate_request(&input).is_err());
    }

    #[test]
    fn supersede_requires_a_valid_replacement() {
        let input = request("supersede_rule");
        assert!(validate_request(&input).is_err());
    }
}
