// @locs-version: 1.0
// @module-id: server.background-workers
// @primary-capability: background-worker-http-routes
// @stability: beta

use std::sync::Arc;

use super::*;

// ── Cron trigger scheduler ────────────────────────────────────────────────────

/// Converts a single day-of-week token from unix numbering (0=Sun, 1=Mon, ...,
/// 6=Sat) to Quartz numbering (1=Sun, 2=Mon, ..., 7=Sat) by incrementing
/// numeric values.  The special value `7` (alternate Sun in unix) maps to `1`.
pub(super) fn unix_dow_token_to_quartz(token: &str) -> String {
    // Pass through non-numeric atoms unchanged (e.g. "MON", "SUN").
    if let Ok(n) = token.parse::<u32>() {
        let q = match n {
            7 => 1,     // unix 7 = Sun → Quartz 1
            d => d + 1, // unix 0-6 → Quartz 1-7
        };
        return q.to_string();
    }
    token.to_string()
}

/// Converts a day-of-week field from unix notation to Quartz notation.
/// Handles `*`, single values, ranges (`1-5`), lists (`1,3,5`), and steps
/// (`*/2`, `1-5/2`).  Numeric values are incremented per `unix_dow_token_to_quartz`.
pub(super) fn unix_dow_field_to_quartz(field: &str) -> String {
    if field == "*" || field == "?" {
        return field.to_string();
    }
    // Handle step expressions: e.g. "1-5/2" or "*/2"
    if let Some((range_part, step)) = field.split_once('/') {
        let converted_range = unix_dow_field_to_quartz(range_part);
        return format!("{converted_range}/{step}");
    }
    // Handle list: "1,3,5"
    if field.contains(',') {
        return field
            .split(',')
            .map(|t| unix_dow_token_to_quartz(t.trim()))
            .collect::<Vec<_>>()
            .join(",");
    }
    // Handle range: "1-5"
    if let Some((lo, hi)) = field.split_once('-') {
        return format!(
            "{}-{}",
            unix_dow_token_to_quartz(lo.trim()),
            unix_dow_token_to_quartz(hi.trim())
        );
    }
    unix_dow_token_to_quartz(field)
}

/// Converts a standard 5-field unix cron expression (`min hour dom month dow`)
/// into the 7-field Quartz format (`sec min hour dom month dow year`) expected
/// by the `cron` crate.
///
/// Day-of-week numbering is also converted: unix 0=Sun,1=Mon…6=Sat →
/// Quartz 1=Sun,2=Mon…7=Sat.  Passes 7-field expressions through unchanged.
pub(super) fn cron_to_quartz(expr: &str) -> String {
    let fields: Vec<&str> = expr.split_whitespace().collect();
    match fields.len() {
        5 => {
            // unix 5-field: min hour dom month dow
            let dow_quartz = unix_dow_field_to_quartz(fields[4]);
            format!(
                "0 {} {} {} {} {} *",
                fields[0], fields[1], fields[2], fields[3], dow_quartz
            )
        }
        6 => {
            // Assume sec min hour dom month dow (dow already in Quartz, just add year)
            format!("{expr} *")
        }
        _ => expr.to_string(),
    }
}

/// Computes the next UTC fire time for a cron expression **after** `from`.
/// Returns `None` if the expression is unparseable or has no upcoming fires.
pub(super) fn cron_next_fire_at(
    five_field_expr: &str,
    from: chrono::DateTime<chrono::Utc>,
) -> Option<chrono::DateTime<chrono::Utc>> {
    use cron::Schedule;
    use std::str::FromStr;
    let quartz = cron_to_quartz(five_field_expr);
    let schedule = Schedule::from_str(&quartz).ok()?;
    schedule.after(&from).next()
}

// ── Email trigger dispatcher ──────────────────────────────────────────────────

/// Fire a single email-family workflow run.
///
/// Mirrors `fire_scheduled_workflow_run` but uses `trigger_kind = "email"` and
/// embeds the email subject/from in the trigger observation's `payload_summary`.
pub(super) async fn fire_email_trigger_workflow_run(
    state: &Arc<AppState>,
    reg: &crate::db::WorkflowTriggerRegistrationRecord,
    activation_id: &str,
    now_utc: chrono::DateTime<chrono::Utc>,
    email_subject: Option<&str>,
    email_from: Option<&str>,
) -> Result<String, String> {
    let user_id = &reg.owner_user_id;
    let workflow_id = &reg.workflow_id;
    let deployment_id = &reg.deployment_id;
    let trigger_node_id = &reg.trigger_node_id;
    let now_str = now_utc.to_rfc3339();

    let deployment = state
        .db
        .get_workflow_deployment(user_id, workflow_id, deployment_id)
        .await
        .map_err(|e| format!("load deployment {deployment_id}: {e}"))?;
    let graph_snapshot = deployment["graph_snapshot"].clone();
    let ir_snapshot = deployment["ir_snapshot"].clone();
    let environment = graph_snapshot
        .get("environment")
        .and_then(serde_json::Value::as_str)
        .or_else(|| {
            ir_snapshot
                .get("environment")
                .and_then(serde_json::Value::as_str)
        });
    let trigger_kind = "email";
    let enriched_ir =
        enrich_workflow_ir_for_run(&ir_snapshot, deployment_id, environment, trigger_kind, None);

    workflow_trigger_policy_check(reg, trigger_kind).map_err(|e| format!("policy_check: {e}"))?;

    let nonce = trigger_replay_nonce(deployment_id, trigger_node_id, activation_id);
    let claimed = state
        .db
        .check_and_claim_replay_nonce(user_id, &nonce)
        .await
        .map_err(|e| format!("replay nonce claim: {e}"))?;
    if !claimed {
        return Err(format!(
            "duplicate email activation: activation_id={activation_id} already processed"
        ));
    }

    let mut run = workflow_run_record(
        workflow_id,
        deployment_id,
        user_id,
        trigger_kind,
        None,
        None,
        &graph_snapshot,
        &enriched_ir,
    );
    enrich_workflow_run_with_private_calendar_context(&state.db, &mut run).await;
    state
        .db
        .append_workflow_run(&run)
        .await
        .map_err(|e| format!("append run: {e}"))?;

    let obs = crate::db::TriggerObservabilityRecord {
        observation_id: format!("wftobs_{}", ulid::Ulid::new().to_string().to_lowercase()),
        registration_id: reg.registration_id.clone(),
        workflow_id: workflow_id.clone(),
        deployment_id: deployment_id.clone(),
        owner_user_id: user_id.clone(),
        trigger_source: "email".to_string(),
        trigger_time: now_str.clone(),
        payload_summary: serde_json::json!({
            "trigger_kind": "email",
            "email_subject": email_subject,
            "email_from": email_from,
        }),
        schedule_metadata: serde_json::json!({}),
        delayed_resumption_reason: None,
        hybrid_decision_chain: serde_json::json!([]),
        run_initiation_trace: serde_json::json!({
            "run_id": run.run_id,
            "workflow_id": workflow_id,
            "deployment_id": deployment_id,
            "trigger_node_id": trigger_node_id,
            "activation_id": activation_id,
            "via": "email_trigger_dispatcher",
        }),
        replay_nonce: nonce,
        created_at: now_str.clone(),
    };
    if let Err(e) = state.db.write_trigger_observation(&obs).await {
        tracing::warn!(
            run_id = %run.run_id,
            workflow_id = %workflow_id,
            error = %e,
            "email_dispatcher: failed to write trigger observation; run continues"
        );
    }

    let wait_resume_records = workflow_wait_resume_records_for_run(
        workflow_id,
        deployment_id,
        user_id,
        &run,
        &enriched_ir,
    );
    for record in &wait_resume_records {
        if let Err(e) = state.db.append_workflow_wait_resume_record(record).await {
            tracing::warn!(
                run_id = %run.run_id,
                error = %e,
                "email_dispatcher: failed to write wait-resume record; run continues"
            );
        }
    }

    tracing::info!(
        run_id = %run.run_id,
        workflow_id = %workflow_id,
        registration_id = %reg.registration_id,
        email_subject = ?email_subject,
        "email_dispatcher: fired email trigger workflow run"
    );
    Ok(run.run_id)
}

/// One tick of the email trigger dispatcher.
///
/// Reads up to 50 unprocessed entries from `public.email_trigger_queue`,
/// then for each entry fires a workflow run for every user who has a
/// registered `email`-family trigger registration. After all users are
/// processed the queue entry is marked dispatched.
pub(super) async fn email_trigger_dispatcher_tick(state: Arc<AppState>) {
    let events = match state.db.list_pending_email_trigger_events(50).await {
        Ok(evts) => evts,
        Err(e) => {
            tracing::error!(
                error = %e,
                "email_dispatcher_tick: list_pending_email_trigger_events failed"
            );
            return;
        }
    };

    if events.is_empty() {
        return;
    }

    let user_ids = match state.db.list_user_ids().await {
        Ok(ids) => ids,
        Err(e) => {
            tracing::error!(error = %e, "email_dispatcher_tick: list_user_ids failed");
            return;
        }
    };

    let now_utc = chrono::Utc::now();

    for (event_id, _provider, _account, email_subject, email_from, _message_uid) in &events {
        for user_id in &user_ids {
            let registrations = match state
                .db
                .list_due_email_trigger_registrations_for_user(user_id)
                .await
            {
                Ok(regs) => regs,
                Err(e) => {
                    tracing::warn!(
                        user_id = %user_id,
                        error = %e,
                        "email_dispatcher_tick: list_due_email_trigger_registrations failed; skipping user"
                    );
                    continue;
                }
            };

            for reg in registrations {
                let activation_id = format!("{}:{}", event_id, reg.registration_id);
                if let Err(e) = fire_email_trigger_workflow_run(
                    &state,
                    &reg,
                    &activation_id,
                    now_utc,
                    email_subject.as_deref(),
                    email_from.as_deref(),
                )
                .await
                {
                    tracing::warn!(
                        user_id = %user_id,
                        registration_id = %reg.registration_id,
                        event_id = %event_id,
                        error = %e,
                        "email_dispatcher_tick: fire_email_trigger_workflow_run failed"
                    );
                }
            }
        }

        if let Err(e) = state.db.mark_email_trigger_dispatched(event_id).await {
            tracing::warn!(
                event_id = %event_id,
                error = %e,
                "email_dispatcher_tick: mark_email_trigger_dispatched failed"
            );
        }
    }
}

/// Long-running background task: runs the email trigger dispatcher every 60 seconds.
/// 45-second initial delay (staggers relative to cron scheduler's 30s delay).
pub(super) async fn email_trigger_dispatcher_loop(state: Arc<AppState>) {
    tracing::info!("email_trigger_dispatcher: starting (60s interval)");
    tokio::time::sleep(tokio::time::Duration::from_secs(45)).await;
    loop {
        email_trigger_dispatcher_tick(state.clone()).await;
        tokio::time::sleep(tokio::time::Duration::from_secs(60)).await;
    }
}
// ── File-drop / watcher adapter ───────────────────────────────────────────────

/// Fire one workflow run for a `file_drop`-kind trigger registration.
///
/// Mirrors `fire_email_trigger_workflow_run` but embeds file metadata in the
/// trigger observation payload summary.
pub(super) async fn fire_file_drop_trigger_workflow_run(
    state: &Arc<AppState>,
    reg: &crate::db::WorkflowTriggerRegistrationRecord,
    activation_id: &str,
    now_utc: chrono::DateTime<chrono::Utc>,
    watched_path: &str,
    file_name: &str,
    file_size_bytes: Option<i64>,
    file_event_type: &str,
) -> Result<String, String> {
    let user_id = &reg.owner_user_id;
    let workflow_id = &reg.workflow_id;
    let deployment_id = &reg.deployment_id;
    let trigger_node_id = &reg.trigger_node_id;
    let now_str = now_utc.to_rfc3339();

    // 1. Load deployment snapshot.
    let deployment = state
        .db
        .get_workflow_deployment(user_id, workflow_id, deployment_id)
        .await
        .map_err(|e| format!("load deployment {deployment_id}: {e}"))?;
    let graph_snapshot = deployment["graph_snapshot"].clone();
    let ir_snapshot = deployment["ir_snapshot"].clone();
    let environment = graph_snapshot
        .get("environment")
        .and_then(serde_json::Value::as_str)
        .or_else(|| {
            ir_snapshot
                .get("environment")
                .and_then(serde_json::Value::as_str)
        });
    let trigger_kind = "file_drop";
    let enriched_ir =
        enrich_workflow_ir_for_run(&ir_snapshot, deployment_id, environment, trigger_kind, None);

    // 2. Policy check — must pass before replay nonce is claimed.
    workflow_trigger_policy_check(reg, trigger_kind).map_err(|e| format!("policy_check: {e}"))?;

    // 3. Replay nonce — prevents double-firing if dispatcher runs overlap.
    let nonce = trigger_replay_nonce(deployment_id, trigger_node_id, activation_id);
    let claimed = state
        .db
        .check_and_claim_replay_nonce(user_id, &nonce)
        .await
        .map_err(|e| format!("replay nonce claim: {e}"))?;
    if !claimed {
        return Err(format!(
            "duplicate file_drop activation: activation_id={activation_id} already processed"
        ));
    }

    // 4. Persist run record.
    let mut run = workflow_run_record(
        workflow_id,
        deployment_id,
        user_id,
        trigger_kind,
        None,
        None,
        &graph_snapshot,
        &enriched_ir,
    );
    enrich_workflow_run_with_private_calendar_context(&state.db, &mut run).await;
    state
        .db
        .append_workflow_run(&run)
        .await
        .map_err(|e| format!("append run: {e}"))?;

    // 4. Trigger observation.
    let obs = crate::db::TriggerObservabilityRecord {
        observation_id: format!("wftobs_{}", ulid::Ulid::new().to_string().to_lowercase()),
        registration_id: reg.registration_id.clone(),
        workflow_id: workflow_id.clone(),
        deployment_id: deployment_id.clone(),
        owner_user_id: user_id.clone(),
        trigger_source: "file_drop".to_string(),
        trigger_time: now_str.clone(),
        payload_summary: serde_json::json!({
            "trigger_kind": "file_drop",
            "watched_path": watched_path,
            "file_name": file_name,
            "file_size_bytes": file_size_bytes,
            "file_event_type": file_event_type,
        }),
        schedule_metadata: serde_json::json!({}),
        delayed_resumption_reason: None,
        hybrid_decision_chain: serde_json::json!([]),
        run_initiation_trace: serde_json::json!({
            "run_id": run.run_id,
            "workflow_id": workflow_id,
            "deployment_id": deployment_id,
            "trigger_node_id": trigger_node_id,
            "activation_id": activation_id,
            "via": "file_drop_trigger_dispatcher",
        }),
        replay_nonce: nonce,
        created_at: now_str.clone(),
    };
    if let Err(e) = state.db.write_trigger_observation(&obs).await {
        tracing::warn!(
            run_id = %run.run_id,
            workflow_id = %workflow_id,
            error = %e,
            "file_drop_dispatcher: failed to write trigger observation; run continues"
        );
    }

    // 5. Wait-resume records.
    let wait_resume_records = workflow_wait_resume_records_for_run(
        workflow_id,
        deployment_id,
        user_id,
        &run,
        &enriched_ir,
    );
    for record in &wait_resume_records {
        if let Err(e) = state.db.append_workflow_wait_resume_record(record).await {
            tracing::warn!(
                run_id = %run.run_id,
                error = %e,
                "file_drop_dispatcher: failed to write wait-resume record; run continues"
            );
        }
    }

    tracing::info!(
        run_id = %run.run_id,
        workflow_id = %workflow_id,
        registration_id = %reg.registration_id,
        file_name = %file_name,
        "file_drop_dispatcher: fired file_drop trigger workflow run"
    );
    Ok(run.run_id)
}

/// One tick of the file-drop trigger dispatcher.
///
/// Reads up to 50 pending file-drop events, then for each event fires a run
/// for every user who has a registered `file_drop`-kind trigger registration.
pub(super) async fn file_drop_trigger_dispatcher_tick(state: Arc<AppState>) {
    let events = match state.db.list_pending_file_drop_trigger_events(50).await {
        Ok(evts) => evts,
        Err(e) => {
            tracing::error!(error = %e, "file_drop_dispatcher_tick: list_pending_file_drop_trigger_events failed");
            return;
        }
    };

    if events.is_empty() {
        return;
    }

    let user_ids = match state.db.list_user_ids().await {
        Ok(ids) => ids,
        Err(e) => {
            tracing::error!(error = %e, "file_drop_dispatcher_tick: list_user_ids failed");
            return;
        }
    };

    let now_utc = chrono::Utc::now();

    for (event_id, watched_path, file_name, file_size_bytes, file_event_type) in &events {
        for user_id in &user_ids {
            let registrations = match state
                .db
                .list_due_file_drop_trigger_registrations_for_user(user_id)
                .await
            {
                Ok(regs) => regs,
                Err(e) => {
                    tracing::warn!(
                        user_id = %user_id,
                        error = %e,
                        "file_drop_dispatcher_tick: list_due_file_drop_trigger_registrations failed; skipping user"
                    );
                    continue;
                }
            };

            for reg in registrations {
                let activation_id = format!("{}:{}", event_id, reg.registration_id);
                if let Err(e) = fire_file_drop_trigger_workflow_run(
                    &state,
                    &reg,
                    &activation_id,
                    now_utc,
                    watched_path,
                    file_name,
                    *file_size_bytes,
                    file_event_type,
                )
                .await
                {
                    tracing::warn!(
                        user_id = %user_id,
                        registration_id = %reg.registration_id,
                        event_id = %event_id,
                        error = %e,
                        "file_drop_dispatcher_tick: fire_file_drop_trigger_workflow_run failed"
                    );
                }
            }
        }

        if let Err(e) = state.db.mark_file_drop_trigger_dispatched(event_id).await {
            tracing::warn!(
                event_id = %event_id,
                error = %e,
                "file_drop_dispatcher_tick: mark_file_drop_trigger_dispatched failed"
            );
        }
    }
}

/// One tick of the file-drop watcher.
///
/// Reads `OMNYID_FILE_WATCH_DIR` from env; if unset, is a no-op.  Lists all
/// files in the directory and enqueues any whose mtime is within the last
/// `window_secs` seconds (default 70 — slightly wider than the 60s poll
/// cadence to avoid missing files at tick boundaries).
pub(super) async fn file_drop_watcher_tick(state: Arc<AppState>) {
    let watch_dir = match std::env::var("OMNYID_FILE_WATCH_DIR") {
        Ok(d) if !d.is_empty() => d,
        _ => return, // no watched directory configured
    };
    let window_secs = std::env::var("OMNYID_FILE_WATCH_WINDOW_SECS")
        .ok()
        .and_then(|v| v.parse::<u64>().ok())
        .unwrap_or(70);

    let entries = match std::fs::read_dir(&watch_dir) {
        Ok(e) => e,
        Err(err) => {
            tracing::warn!(path = %watch_dir, error = %err, "file_drop_watcher: read_dir failed");
            return;
        }
    };

    let cutoff = std::time::SystemTime::now()
        .checked_sub(std::time::Duration::from_secs(window_secs))
        .unwrap_or(std::time::UNIX_EPOCH);

    for entry_result in entries {
        let entry = match entry_result {
            Ok(e) => e,
            Err(_) => continue,
        };
        let metadata = match entry.metadata() {
            Ok(m) => m,
            Err(_) => continue,
        };
        if !metadata.is_file() {
            continue;
        }
        let mtime = metadata.modified().unwrap_or(std::time::UNIX_EPOCH);
        if mtime < cutoff {
            continue;
        }

        let file_name = entry.file_name().to_string_lossy().to_string();
        let file_size = metadata.len() as i64;
        let event_id = format!("fdrop_{}", ulid::Ulid::new().to_string().to_lowercase());

        if let Err(err) = state
            .db
            .enqueue_file_drop_trigger_event(
                &event_id,
                &watch_dir,
                &file_name,
                Some(file_size),
                "created",
            )
            .await
        {
            tracing::warn!(
                event_id = %event_id,
                file_name = %file_name,
                error = %err,
                "file_drop_watcher: enqueue_file_drop_trigger_event failed; continuing"
            );
        }
    }
}

/// Long-running background task: polls the watched directory every 60 seconds
/// then runs the dispatcher tick.  60-second initial delay.
pub(super) async fn file_drop_watcher_loop(state: Arc<AppState>) {
    if std::env::var("OMNYID_FILE_WATCH_DIR")
        .map(|d| d.is_empty())
        .unwrap_or(true)
    {
        tracing::info!("file_drop_watcher: OMNYID_FILE_WATCH_DIR not set; watcher disabled");
        return;
    }
    tracing::info!("file_drop_watcher: starting (60s interval)");
    tokio::time::sleep(tokio::time::Duration::from_secs(60)).await;
    loop {
        file_drop_watcher_tick(state.clone()).await;
        file_drop_trigger_dispatcher_tick(state.clone()).await;
        tokio::time::sleep(tokio::time::Duration::from_secs(60)).await;
    }
}

// ── Internal workflow runtime event dispatcher ────────────────────────────────

/// Fire one workflow run for an `internal_event`-kind trigger registration.
///
/// Respects optional `source_workflow_id` filter in the registration descriptor:
/// if the registration's descriptor_json contains `"source_workflow_id"`, only
/// events from that workflow are dispatched to it.
pub(super) async fn fire_internal_event_trigger_workflow_run(
    state: &Arc<AppState>,
    reg: &crate::db::WorkflowTriggerRegistrationRecord,
    activation_id: &str,
    now_utc: chrono::DateTime<chrono::Utc>,
    event_type: &str,
    source_workflow_id: Option<&str>,
    source_run_id: Option<&str>,
    payload: &serde_json::Value,
) -> Result<String, String> {
    // Optional source_workflow_id filter: skip if registration restricts to a
    // different source workflow.
    if let Some(required_src) = reg
        .descriptor_json
        .get("source_workflow_id")
        .and_then(|v| v.as_str())
    {
        if source_workflow_id != Some(required_src) {
            return Err(format!(
                "internal_event filter mismatch: registration requires source_workflow_id={required_src}"
            ));
        }
    }

    let user_id = &reg.owner_user_id;
    let workflow_id = &reg.workflow_id;
    let deployment_id = &reg.deployment_id;
    let trigger_node_id = &reg.trigger_node_id;
    let now_str = now_utc.to_rfc3339();

    let deployment = state
        .db
        .get_workflow_deployment(user_id, workflow_id, deployment_id)
        .await
        .map_err(|e| format!("load deployment {deployment_id}: {e}"))?;
    let graph_snapshot = deployment["graph_snapshot"].clone();
    let ir_snapshot = deployment["ir_snapshot"].clone();
    let environment = graph_snapshot
        .get("environment")
        .and_then(serde_json::Value::as_str)
        .or_else(|| {
            ir_snapshot
                .get("environment")
                .and_then(serde_json::Value::as_str)
        });
    let trigger_kind = "internal_event";
    let enriched_ir =
        enrich_workflow_ir_for_run(&ir_snapshot, deployment_id, environment, trigger_kind, None);

    // Policy check — must pass before replay nonce is claimed.
    workflow_trigger_policy_check(reg, trigger_kind).map_err(|e| format!("policy_check: {e}"))?;

    let nonce = trigger_replay_nonce(deployment_id, trigger_node_id, activation_id);
    let claimed = state
        .db
        .check_and_claim_replay_nonce(user_id, &nonce)
        .await
        .map_err(|e| format!("replay nonce claim: {e}"))?;
    if !claimed {
        return Err(format!(
            "duplicate internal_event activation: activation_id={activation_id} already processed"
        ));
    }

    let mut run = workflow_run_record(
        workflow_id,
        deployment_id,
        user_id,
        trigger_kind,
        None,
        None,
        &graph_snapshot,
        &enriched_ir,
    );
    enrich_workflow_run_with_private_calendar_context(&state.db, &mut run).await;
    state
        .db
        .append_workflow_run(&run)
        .await
        .map_err(|e| format!("append run: {e}"))?;

    let obs = crate::db::TriggerObservabilityRecord {
        observation_id: format!("wftobs_{}", ulid::Ulid::new().to_string().to_lowercase()),
        registration_id: reg.registration_id.clone(),
        workflow_id: workflow_id.clone(),
        deployment_id: deployment_id.clone(),
        owner_user_id: user_id.clone(),
        trigger_source: "internal_event".to_string(),
        trigger_time: now_str.clone(),
        payload_summary: super::internal_event_trigger_payload_summary(
            event_type,
            source_workflow_id,
            source_run_id,
            payload,
        ),
        schedule_metadata: serde_json::json!({}),
        delayed_resumption_reason: None,
        hybrid_decision_chain: serde_json::json!([]),
        run_initiation_trace: serde_json::json!({
            "run_id": run.run_id,
            "workflow_id": workflow_id,
            "deployment_id": deployment_id,
            "trigger_node_id": trigger_node_id,
            "activation_id": activation_id,
            "via": "internal_event_dispatcher",
        }),
        replay_nonce: nonce,
        created_at: now_str.clone(),
    };
    if let Err(e) = state.db.write_trigger_observation(&obs).await {
        tracing::warn!(
            run_id = %run.run_id,
            error = %e,
            "internal_event_dispatcher: failed to write trigger observation; run continues"
        );
    }

    let wait_resume_records = workflow_wait_resume_records_for_run(
        workflow_id,
        deployment_id,
        user_id,
        &run,
        &enriched_ir,
    );
    for record in &wait_resume_records {
        if let Err(e) = state.db.append_workflow_wait_resume_record(record).await {
            tracing::warn!(
                run_id = %run.run_id,
                error = %e,
                "internal_event_dispatcher: failed to write wait-resume record; run continues"
            );
        }
    }

    tracing::info!(
        run_id = %run.run_id,
        workflow_id = %workflow_id,
        registration_id = %reg.registration_id,
        event_type = %event_type,
        "internal_event_dispatcher: fired internal_event trigger workflow run"
    );
    Ok(run.run_id)
}

/// One tick of the internal event dispatcher.
///
/// Reads up to 50 pending internal events from `public.internal_event_queue`.
/// For each event, fires runs only for trigger registrations belonging to the
/// same user who owns the source workflow (internal events are tenant-scoped).
pub(super) async fn internal_event_dispatcher_tick(state: Arc<AppState>) {
    let events = match state.db.list_pending_internal_events(50).await {
        Ok(evts) => evts,
        Err(e) => {
            tracing::error!(error = %e, "internal_event_dispatcher_tick: list_pending_internal_events failed");
            return;
        }
    };

    if events.is_empty() {
        return;
    }

    let now_utc = chrono::Utc::now();

    for (event_id, event_type, source_workflow_id, source_run_id, owner_user_id, payload) in &events
    {
        // Internal events are dispatched only within the owning tenant.
        let registrations = match state
            .db
            .list_due_internal_event_trigger_registrations_for_user(owner_user_id)
            .await
        {
            Ok(regs) => regs,
            Err(e) => {
                tracing::warn!(
                    owner_user_id = %owner_user_id,
                    error = %e,
                    "internal_event_dispatcher_tick: list_due_internal_event_trigger_registrations failed; skipping"
                );
                if let Err(e2) = state.db.mark_internal_event_dispatched(event_id).await {
                    tracing::warn!(event_id = %event_id, error = %e2, "internal_event_dispatcher_tick: mark_dispatched failed");
                }
                continue;
            }
        };

        for reg in registrations {
            let activation_id = format!("{}:{}", event_id, reg.registration_id);
            if let Err(e) = fire_internal_event_trigger_workflow_run(
                &state,
                &reg,
                &activation_id,
                now_utc,
                event_type,
                source_workflow_id.as_deref(),
                source_run_id.as_deref(),
                payload,
            )
            .await
            {
                tracing::warn!(
                    owner_user_id = %owner_user_id,
                    registration_id = %reg.registration_id,
                    event_id = %event_id,
                    error = %e,
                    "internal_event_dispatcher_tick: fire_internal_event_trigger_workflow_run failed"
                );
            }
        }

        if let Err(e) = state.db.mark_internal_event_dispatched(event_id).await {
            tracing::warn!(
                event_id = %event_id,
                error = %e,
                "internal_event_dispatcher_tick: mark_internal_event_dispatched failed"
            );
        }
    }
}

/// Long-running background task: runs the internal event dispatcher every 60 seconds.
/// 90-second initial delay (staggers from cron=30s, email=45s, file_drop=60s).
pub(super) async fn internal_event_dispatcher_loop(state: Arc<AppState>) {
    tracing::info!("internal_event_dispatcher: starting (60s interval)");
    tokio::time::sleep(tokio::time::Duration::from_secs(90)).await;
    loop {
        internal_event_dispatcher_tick(state.clone()).await;
        tokio::time::sleep(tokio::time::Duration::from_secs(60)).await;
    }
}

/// Enqueue an internal workflow runtime event non-fatally.
///
/// Called by `workflow_run_start_http` when a run reaches a terminal state
/// (completed / failed / simulated) so downstream workflows with
/// `trigger_kind=internal_event` can chain off it.
pub(super) fn enqueue_internal_workflow_event_nonblocking(
    state: Arc<AppState>,
    event_type: &str,
    source_workflow_id: &str,
    source_run_id: &str,
    owner_user_id: &str,
    payload: serde_json::Value,
) {
    let event_id = format!("ievt_{}", ulid::Ulid::new().to_string().to_lowercase());
    let event_type = event_type.to_string();
    let source_workflow_id = source_workflow_id.to_string();
    let source_run_id = source_run_id.to_string();
    let owner_user_id = owner_user_id.to_string();
    tokio::spawn(async move {
        if let Err(e) = state
            .db
            .enqueue_internal_event(
                &event_id,
                &event_type,
                Some(&source_workflow_id),
                Some(&source_run_id),
                &owner_user_id,
                &payload,
            )
            .await
        {
            tracing::warn!(
                event_id = %event_id,
                error = %e,
                "enqueue_internal_workflow_event: failed; downstream triggers will not fire"
            );
        }
    });
}
