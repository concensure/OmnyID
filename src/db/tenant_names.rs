//! Canonical tenant SQL identifiers, shared by database modules.
pub(crate) fn tenant_schema_name(user_id: &str) -> String {
    // Log a warning if the user_id contains characters outside the expected
    // alphanumeric set — this indicates a programming error upstream; the
    // normalization below still prevents SQL injection but we want visibility.
    let clean = user_id
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_');
    if !clean && !user_id.is_empty() {
        tracing::warn!(
            user_id,
            "tenant_schema_name: user_id contains unexpected characters; \
             normalising to alphanumeric — check registration code path"
        );
    }
    let mut schema = String::from("user_");
    for ch in user_id.chars().flat_map(|c| c.to_lowercase()) {
        schema.push(if ch.is_ascii_alphanumeric() { ch } else { '_' });
        if schema.len() >= 60 {
            break;
        }
    }
    if schema == "user_" {
        schema.push_str("tenant");
    }
    schema
}

pub(crate) fn tenant_schema_drop_sql(user_id: &str) -> String {
    let tenant_schema = tenant_schema_name(user_id);
    format!(r#"DROP SCHEMA IF EXISTS "{tenant_schema}" CASCADE"#)
}

pub(super) fn tenant_agent_task_queue_table(user_id: &str) -> String {
    format!("\"{}\".agent_task_queue", tenant_schema_name(user_id))
}

pub(super) fn tenant_agent_focus_items_table(user_id: &str) -> String {
    format!("\"{}\".agent_focus_items", tenant_schema_name(user_id))
}

pub(super) fn tenant_agent_triggers_table(user_id: &str) -> String {
    format!("\"{}\".agent_triggers", tenant_schema_name(user_id))
}

pub(super) fn tenant_agent_delegations_table(user_id: &str) -> String {
    format!("\"{}\".agent_delegations", tenant_schema_name(user_id))
}

pub(super) fn tenant_agent_capability_registry_table(user_id: &str) -> String {
    format!(
        "\"{}\".agent_capability_registry",
        tenant_schema_name(user_id)
    )
}

pub(super) fn tenant_user_llm_config_table(user_id: &str) -> String {
    format!("\"{}\".user_llm_config", tenant_schema_name(user_id))
}

pub(super) fn tenant_llm_usage_log_table(user_id: &str) -> String {
    format!("\"{}\".llm_usage_log", tenant_schema_name(user_id))
}

pub(super) fn tenant_saved_workflows_table(user_id: &str) -> String {
    format!("\"{}\".saved_workflows", tenant_schema_name(user_id))
}

pub(super) fn tenant_workflow_deployments_table(user_id: &str) -> String {
    format!("\"{}\".workflow_deployments", tenant_schema_name(user_id))
}

pub(super) fn tenant_workflow_runs_table(user_id: &str) -> String {
    format!("\"{}\".workflow_runs", tenant_schema_name(user_id))
}

pub(super) fn tenant_workflow_wait_resume_table(user_id: &str) -> String {
    format!("\"{}\".workflow_wait_resume", tenant_schema_name(user_id))
}

pub(super) fn tenant_workflow_trigger_registrations_table(user_id: &str) -> String {
    format!(
        "\"{}\".workflow_trigger_registrations",
        tenant_schema_name(user_id)
    )
}

pub(super) fn tenant_trigger_observations_table(user_id: &str) -> String {
    format!(
        "\"{}\".workflow_trigger_observations",
        tenant_schema_name(user_id)
    )
}

pub(super) fn tenant_messages_table(user_id: &str) -> String {
    format!("\"{}\".messages", tenant_schema_name(user_id))
}

pub(super) fn tenant_attachments_table(user_id: &str) -> String {
    format!("\"{}\".attachments", tenant_schema_name(user_id))
}
