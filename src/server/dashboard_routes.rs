// @locs-version: 1.0
// @module-id: server.dashboard-routes
// @primary-capability: dashboard-http-routes
// @stability: beta

use super::*;
use crate::db::ActionAuditEntry;
use crate::message::{
    AFP_TYPE_BROWSER_TASK, AFP_TYPE_FILE_ACCESS_REQUEST, AFP_TYPE_FILE_LEDGER, AFP_TYPE_LEDGER,
    AFP_TYPE_PROVENANCE_RECORD,
};
use crate::server::continuity_routes::{
    continuity_panel_kind, continuity_primary_mode, continuity_priority_card,
    cost_status_from_snapshot, effective_priority_item_with_cost, load_continuity_state_summary,
    load_dashboard_cost_snapshot, preferred_continuity_state_message,
};
use crate::server::thread_discovery::{
    build_thread_summaries, rank_bootstrap_messages, thread_discovery_facet_next_moves,
    thread_discovery_retrieval_state,
};
use std::{
    collections::HashMap,
    sync::{Mutex, OnceLock},
    time::{Duration, Instant},
};

const DASHBOARD_MESSAGE_CACHE_TTL: Duration = Duration::from_secs(15);

#[derive(Clone)]
struct DashboardMessageBundle {
    recent_messages: Vec<AFPMessage>,
    thread_summaries: Vec<DashboardThreadSummary>,
    thread_retrieval_state: Option<Value>,
}

#[derive(Clone)]
struct CachedDashboardMessageBundle {
    cached_at: Instant,
    bundle: DashboardMessageBundle,
}

fn dashboard_message_cache() -> &'static Mutex<HashMap<String, CachedDashboardMessageBundle>> {
    static CACHE: OnceLock<Mutex<HashMap<String, CachedDashboardMessageBundle>>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

fn dashboard_message_cache_key(user_id: &str, limit: usize) -> String {
    format!("{user_id}:{limit}")
}

fn dashboard_user_facing_text(
    text: &str,
    active_persona: Option<&crate::agent_personas::AgentPersona>,
) -> String {
    active_persona
        .map(|persona| crate::agent_personas::restyle_user_facing_text(text, persona))
        .unwrap_or_else(|| text.to_string())
}

fn style_dashboard_continuity_payload(
    mut payload: DashboardContinuityPayload,
    active_persona: Option<&crate::agent_personas::AgentPersona>,
) -> DashboardContinuityPayload {
    let Some(active_persona) = active_persona else {
        return payload;
    };

    payload.continuity_brief = payload.continuity_brief.map(|mut brief| {
        brief.suggested_actions = brief
            .suggested_actions
            .into_iter()
            .map(|action| dashboard_user_facing_text(&action, Some(active_persona)))
            .collect();
        brief
    });
    payload.continuity_priority_item = payload.continuity_priority_item.map(|mut item| {
        item.suggested_action = item
            .suggested_action
            .as_deref()
            .map(|text| dashboard_user_facing_text(text, Some(active_persona)));
        item.selection_reason = item
            .selection_reason
            .as_deref()
            .map(|text| dashboard_user_facing_text(text, Some(active_persona)));
        item
    });
    payload.continuity_priority_card = payload.continuity_priority_card.map(|card| {
        crate::server::continuity_routes::style_continuity_priority_card(card, Some(active_persona))
    });
    payload.continuity_action_items = payload
        .continuity_action_items
        .into_iter()
        .map(|mut item| {
            item.suggested_action =
                dashboard_user_facing_text(&item.suggested_action, Some(active_persona));
            item
        })
        .collect();
    payload.continuity_action_overflow_summary = payload
        .continuity_action_overflow_summary
        .as_deref()
        .map(|text| dashboard_user_facing_text(text, Some(active_persona)));
    payload.continuity_response_items = payload
        .continuity_response_items
        .into_iter()
        .map(|item| {
            crate::server::continuity_routes::style_continuity_response_item(
                item,
                Some(active_persona),
            )
        })
        .collect();
    payload.continuity_prepared_draft_items = payload
        .continuity_prepared_draft_items
        .into_iter()
        .map(|item| {
            crate::server::continuity_routes::style_continuity_prepared_draft_item(
                item,
                Some(active_persona),
            )
        })
        .collect();
    payload.continuity_context_panel_items = payload
        .continuity_context_panel_items
        .into_iter()
        .map(|item| {
            crate::server::continuity_routes::style_continuity_context_panel_item(
                item,
                Some(active_persona),
            )
        })
        .collect();
    payload.continuity_context_pack_items = payload
        .continuity_context_pack_items
        .into_iter()
        .map(|item| {
            crate::server::continuity_routes::style_continuity_context_pack_item(
                item,
                Some(active_persona),
            )
        })
        .collect();
    payload.continuity_state_fields = payload
        .continuity_state_fields
        .into_iter()
        .map(|mut item| {
            item.recommended_action =
                dashboard_user_facing_text(&item.recommended_action, Some(active_persona));
            item.reason = dashboard_user_facing_text(&item.reason, Some(active_persona));
            item
        })
        .collect();
    payload
}

fn style_dashboard_action_log(
    entries: Vec<ActionAuditEntry>,
    active_persona: Option<&crate::agent_personas::AgentPersona>,
) -> Vec<ActionAuditEntry> {
    let Some(active_persona) = active_persona else {
        return entries;
    };

    entries
        .into_iter()
        .map(|mut entry| {
            if let Some(output_obj) = entry.output.as_object_mut() {
                if let Some(review) = output_obj.get("approval_review").cloned() {
                    output_obj.insert(
                        "approval_review".to_string(),
                        crate::server::approval_surfaces::style_approval_review_payload(
                            review,
                            Some(active_persona),
                        ),
                    );
                }
                if let Some(approval_decision_obj) = output_obj
                    .get_mut("approval_decision")
                    .and_then(Value::as_object_mut)
                {
                    if let Some(review) = approval_decision_obj.get("approval_review").cloned() {
                        approval_decision_obj.insert(
                            "approval_review".to_string(),
                            crate::server::approval_surfaces::style_approval_review_payload(
                                review,
                                Some(active_persona),
                            ),
                        );
                    }
                }
            }
            entry
        })
        .collect()
}

fn load_dashboard_message_bundle_from_cache_at(
    user_id: &str,
    limit: usize,
    now: Instant,
) -> Option<DashboardMessageBundle> {
    let key = dashboard_message_cache_key(user_id, limit);
    let mut cache = dashboard_message_cache().lock().ok()?;
    let entry = cache.get(&key)?.clone();
    if now.duration_since(entry.cached_at) > DASHBOARD_MESSAGE_CACHE_TTL {
        cache.remove(&key);
        return None;
    }
    Some(entry.bundle)
}

fn store_dashboard_message_bundle_in_cache_at(
    user_id: &str,
    limit: usize,
    bundle: DashboardMessageBundle,
    now: Instant,
) {
    if let Ok(mut cache) = dashboard_message_cache().lock() {
        cache.insert(
            dashboard_message_cache_key(user_id, limit),
            CachedDashboardMessageBundle {
                cached_at: now,
                bundle,
            },
        );
    }
}

async fn load_dashboard_message_bundle(
    state: &Arc<AppState>,
    user_id: &str,
    agent_ids: &[String],
    limit: usize,
) -> Result<DashboardMessageBundle, (StatusCode, String)> {
    let now = Instant::now();
    if let Some(bundle) = load_dashboard_message_bundle_from_cache_at(user_id, limit, now) {
        return Ok(bundle);
    }

    let merged = state
        .db
        .recent_messages_for_user(user_id, agent_ids, limit as i64)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;

    let recent_messages = rank_bootstrap_messages(merged, limit)
        .into_iter()
        .map(proto_to_app)
        .collect::<Vec<_>>();
    let thread_summaries = build_thread_summaries(&recent_messages);
    let thread_facet_next_moves =
        thread_discovery_facet_next_moves(&thread_summaries, &[], &[], None);
    let thread_retrieval_state = Some(thread_discovery_retrieval_state(
        None,
        &[],
        &[],
        &[],
        &[],
        &[],
        &[],
        None,
        None,
        None,
        Some(&thread_facet_next_moves),
        &thread_summaries,
    ));

    let bundle = DashboardMessageBundle {
        recent_messages,
        thread_summaries,
        thread_retrieval_state,
    };
    store_dashboard_message_bundle_in_cache_at(user_id, limit, bundle.clone(), now);
    Ok(bundle)
}

pub(super) async fn load_workflow_runtime_summary(
    db: &Db,
    owner_user_id: &str,
) -> Result<Option<WorkflowRuntimeSummary>, sqlx::Error> {
    let workflows = db.list_saved_workflows(owner_user_id, false, 5).await?;
    if workflows.is_empty() {
        return Ok(None);
    }

    let mut workflow_count = 0usize;
    let mut active_run_count = 0usize;
    let mut waiting_run_count = 0usize;
    let mut failed_run_count = 0usize;
    let mut completed_run_count = 0usize;
    let mut paused_wait_resume_count = 0usize;
    let mut latest_workflow_title = None;
    let mut latest_run_status = None;

    for workflow in workflows.iter() {
        let Some(workflow_id) = workflow.get("workflow_id").and_then(Value::as_str) else {
            continue;
        };
        workflow_count += 1;
        if latest_workflow_title.is_none() {
            latest_workflow_title = workflow
                .get("title")
                .and_then(Value::as_str)
                .map(str::to_string);
        }

        let runs = db.list_workflow_runs(owner_user_id, workflow_id, 3).await?;
        if let Some(first_run) = runs.first() {
            if latest_run_status.is_none() {
                latest_run_status = first_run
                    .get("status")
                    .and_then(Value::as_str)
                    .map(str::to_string);
            }
        }

        for run in runs.iter() {
            let status = run
                .get("status")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_ascii_lowercase();
            if status.contains("waiting")
                || status.contains("approval")
                || status.contains("paused")
            {
                waiting_run_count += 1;
            } else if status.contains("failed") || status.contains("error") {
                failed_run_count += 1;
            } else if status.contains("completed")
                || status.contains("success")
                || status.contains("succeeded")
            {
                completed_run_count += 1;
            } else if !status.is_empty() {
                active_run_count += 1;
            }

            if let Some(run_id) = run.get("run_id").and_then(Value::as_str) {
                let wait_resume_records = db
                    .list_workflow_wait_resume_records(owner_user_id, workflow_id, run_id, 5)
                    .await?;
                paused_wait_resume_count += wait_resume_records
                    .iter()
                    .filter(|record| {
                        record
                            .get("status")
                            .and_then(Value::as_str)
                            .map(|status| {
                                let status = status.to_ascii_lowercase();
                                status.contains("waiting")
                                    || status.contains("pending")
                                    || status.contains("paused")
                            })
                            .unwrap_or(false)
                    })
                    .count();
            }
        }
    }

    Ok(Some(WorkflowRuntimeSummary {
        workflow_count,
        active_run_count,
        waiting_run_count,
        failed_run_count,
        completed_run_count,
        paused_wait_resume_count,
        latest_workflow_title,
        latest_run_status,
    }))
}

pub(super) async fn load_browser_runtime_summary(
    db: &Db,
    owner_user_id: &str,
) -> Result<Option<BrowserRuntimeSummary>, sqlx::Error> {
    let messages = db
        .list_afp_messages_by_type(owner_user_id, &[AFP_TYPE_BROWSER_TASK], 80)
        .await?;
    if messages.is_empty() {
        return Ok(None);
    }

    let mut latest_task_goal = None;
    let mut latest_task_status = None;
    let mut task_states = BTreeMap::<String, (String, Option<String>, bool)>::new();

    for message in messages.iter() {
        let subtype = message
            .get("subtype")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string();
        let content = message.get("content").and_then(Value::as_object);
        let task_id = content
            .and_then(|content| content.get("task_id"))
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string();
        if task_id.is_empty() {
            continue;
        }

        if latest_task_goal.is_none() {
            latest_task_goal = content
                .and_then(|content| content.get("goal"))
                .and_then(Value::as_str)
                .map(str::to_string)
                .or_else(|| {
                    content
                        .and_then(|content| content.get("summary"))
                        .and_then(Value::as_str)
                        .map(str::to_string)
                });
        }
        if latest_task_status.is_none() {
            latest_task_status = content
                .and_then(|content| content.get("status"))
                .and_then(Value::as_str)
                .map(str::to_string)
                .or_else(|| (!subtype.is_empty()).then_some(subtype.clone()));
        }

        let step_approval_required = content
            .and_then(|content| content.get("step_approval_required"))
            .and_then(Value::as_bool)
            .unwrap_or(false);
        let result_status = content
            .and_then(|content| content.get("status"))
            .and_then(Value::as_str)
            .map(str::to_ascii_lowercase);
        task_states
            .entry(task_id)
            .or_insert_with(|| (subtype, result_status, step_approval_required));
    }

    if task_states.is_empty() {
        return Ok(None);
    }

    let mut active_task_count = 0usize;
    let mut blocked_task_count = 0usize;
    let mut step_approval_task_count = 0usize;
    let mut failed_task_count = 0usize;
    let mut completed_task_count = 0usize;
    let mut cancelled_task_count = 0usize;

    for (subtype, result_status, step_approval_required) in task_states.values() {
        if *step_approval_required {
            step_approval_task_count += 1;
        }

        match subtype.as_str() {
            "browser_task:blocked" => blocked_task_count += 1,
            "browser_task:cancel" => cancelled_task_count += 1,
            "browser_task:result" => match result_status.as_deref().unwrap_or_default() {
                status
                    if status.contains("failed")
                        || status.contains("error")
                        || status.contains("blocked") =>
                {
                    failed_task_count += 1;
                }
                status
                    if status.contains("completed")
                        || status.contains("success")
                        || status.contains("succeeded") =>
                {
                    completed_task_count += 1;
                }
                _ => active_task_count += 1,
            },
            "browser_task:request"
            | "browser_task:progress"
            | "browser_task:unblock"
            | "browser_task:screenshot" => active_task_count += 1,
            _ => active_task_count += 1,
        }
    }

    Ok(Some(BrowserRuntimeSummary {
        task_count: task_states.len(),
        active_task_count,
        blocked_task_count,
        step_approval_task_count,
        failed_task_count,
        completed_task_count,
        cancelled_task_count,
        latest_task_goal,
        latest_task_status,
    }))
}

pub(super) async fn load_task_runtime_summary(
    db: &Db,
    owner_user_id: &str,
) -> Result<Option<TaskRuntimeSummary>, sqlx::Error> {
    let tasks = db.list_agent_tasks(owner_user_id, None, 40).await?;
    let action_log = db
        .recent_action_results_for_capabilities(
            owner_user_id,
            &[crate::reversible_actions::REVERSIBLE_CAPABILITY_DRAFT_TASK_CREATE.to_string()],
            40,
        )
        .await?;
    let summary = attach_task_runtime_reversible_refs(
        build_task_runtime_summary_from_tasks(&tasks),
        &action_log,
    );
    if summary.total_draft_task_count == 0 {
        return Ok(None);
    }
    Ok(Some(summary))
}

fn build_task_runtime_summary_from_tasks(tasks: &[Value]) -> TaskRuntimeSummary {
    let draft_tasks = tasks
        .iter()
        .filter(|task| {
            task.get("plan_json")
                .and_then(Value::as_object)
                .and_then(|plan| plan.get("draft"))
                .and_then(Value::as_bool)
                .unwrap_or(false)
                || task
                    .get("result_json")
                    .and_then(Value::as_object)
                    .and_then(|result| result.get("draft"))
                    .and_then(Value::as_bool)
                    .unwrap_or(false)
        })
        .collect::<Vec<_>>();
    let active_draft_task_count = draft_tasks
        .iter()
        .filter(|task| task.get("status").and_then(Value::as_str) == Some("pending"))
        .count();
    let cancelled_draft_task_count = draft_tasks
        .iter()
        .filter(|task| task.get("status").and_then(Value::as_str) == Some("cancelled"))
        .count();
    let latest_draft_task_id = draft_tasks
        .first()
        .and_then(|task| task.get("id"))
        .and_then(Value::as_str)
        .map(str::to_string);
    let latest_draft_task_title = draft_tasks
        .first()
        .and_then(|task| task.get("intent"))
        .and_then(Value::as_str)
        .map(str::to_string);
    let latest_draft_task_status = draft_tasks
        .first()
        .and_then(|task| task.get("status"))
        .and_then(Value::as_str)
        .map(str::to_string);
    let latest_draft_task_thread_id = draft_tasks
        .first()
        .and_then(|task| task.get("thread_id"))
        .and_then(Value::as_str)
        .map(str::to_string);

    TaskRuntimeSummary {
        active_draft_task_count,
        cancelled_draft_task_count,
        total_draft_task_count: draft_tasks.len(),
        latest_draft_task_id,
        latest_draft_task_title,
        latest_draft_task_status,
        latest_draft_task_thread_id,
        latest_draft_task_action_message_id: None,
    }
}

fn attach_task_runtime_reversible_refs(
    mut summary: TaskRuntimeSummary,
    action_log: &[ActionAuditEntry],
) -> TaskRuntimeSummary {
    let Some(task_id) = summary.latest_draft_task_id.as_deref() else {
        return summary;
    };
    let Some(entry) = action_log.iter().find(|entry| {
        entry.capability_id == crate::reversible_actions::REVERSIBLE_CAPABILITY_DRAFT_TASK_CREATE
            && entry.output.get("task_id").and_then(Value::as_str) == Some(task_id)
    }) else {
        return summary;
    };
    summary.latest_draft_task_action_message_id = entry
        .reversible_summary
        .as_ref()
        .and_then(|summary| summary.action_message_id.clone())
        .or_else(|| entry.external_reference.clone());
    if summary.latest_draft_task_thread_id.is_none() {
        summary.latest_draft_task_thread_id = Some(entry.thread_id.clone());
    }
    summary
}

pub(super) async fn load_calendar_runtime_summary(
    db: &Db,
    owner_user_id: &str,
) -> Result<Option<CalendarRuntimeSummary>, sqlx::Error> {
    let range_start = chrono::Utc::now();
    let range_end = range_start + chrono::Duration::days(31);
    let events = db
        .list_calendar_events_in_range(
            owner_user_id,
            &range_start.to_rfc3339(),
            &range_end.to_rfc3339(),
        )
        .await?;
    let action_log = db
        .recent_action_results_for_capabilities(
            owner_user_id,
            &[
                crate::reversible_actions::REVERSIBLE_CAPABILITY_TENTATIVE_CALENDAR_HOLD
                    .to_string(),
            ],
            40,
        )
        .await?;
    let summary = attach_calendar_runtime_reversible_refs(
        build_calendar_runtime_summary_from_events(&events),
        &action_log,
    );
    if summary.tentative_hold_count == 0 && summary.confirmed_event_count == 0 {
        return Ok(None);
    }
    Ok(Some(summary))
}

fn build_calendar_runtime_summary_from_events(events: &[Value]) -> CalendarRuntimeSummary {
    let tentative_events = events
        .iter()
        .filter(|event| event.get("status").and_then(Value::as_str) == Some("tentative"))
        .collect::<Vec<_>>();
    let confirmed_event_count = events
        .iter()
        .filter(|event| event.get("status").and_then(Value::as_str) == Some("confirmed"))
        .count();
    let latest_tentative_event_id = tentative_events
        .first()
        .and_then(|event| event.get("id"))
        .and_then(Value::as_str)
        .map(str::to_string);
    let latest_tentative_title = tentative_events
        .first()
        .and_then(|event| event.get("title"))
        .and_then(Value::as_str)
        .map(str::to_string);
    let next_tentative_start_at = tentative_events
        .first()
        .and_then(|event| event.get("start_at"))
        .and_then(Value::as_str)
        .map(str::to_string);
    let latest_tentative_location = tentative_events
        .first()
        .and_then(|event| event.get("location"))
        .and_then(Value::as_str)
        .map(str::to_string);
    let latest_tentative_note_kind = tentative_events
        .first()
        .and_then(|event| event.get("profile"))
        .and_then(|profile| profile.get("schedule_note_kind"))
        .and_then(Value::as_str)
        .map(str::to_string);
    let latest_tentative_prep_lead_minutes = tentative_events
        .first()
        .and_then(|event| event.get("profile"))
        .and_then(|profile| profile.get("prep_lead_minutes"))
        .and_then(Value::as_i64);
    let latest_tentative_profile = tentative_events
        .first()
        .and_then(|event| event.get("profile"))
        .cloned();

    CalendarRuntimeSummary {
        tentative_hold_count: tentative_events.len(),
        confirmed_event_count,
        latest_tentative_event_id,
        latest_tentative_thread_id: None,
        latest_tentative_action_message_id: None,
        latest_tentative_title,
        next_tentative_start_at,
        latest_tentative_location,
        latest_tentative_note_kind,
        latest_tentative_prep_lead_minutes,
        latest_tentative_profile,
    }
}

fn attach_calendar_runtime_reversible_refs(
    mut summary: CalendarRuntimeSummary,
    action_log: &[ActionAuditEntry],
) -> CalendarRuntimeSummary {
    let Some(event_id) = summary.latest_tentative_event_id.as_deref() else {
        return summary;
    };
    let Some(entry) = action_log.iter().find(|entry| {
        entry.capability_id
            == crate::reversible_actions::REVERSIBLE_CAPABILITY_TENTATIVE_CALENDAR_HOLD
            && entry.output.get("event_id").and_then(Value::as_str) == Some(event_id)
    }) else {
        return summary;
    };
    summary.latest_tentative_thread_id = Some(entry.thread_id.clone());
    summary.latest_tentative_action_message_id = entry
        .reversible_summary
        .as_ref()
        .and_then(|summary| summary.action_message_id.clone())
        .or_else(|| entry.external_reference.clone());
    summary
}

pub(super) async fn load_trust_runtime_summary(
    db: &Db,
    owner_user_id: &str,
    action_log: &[ActionAuditEntry],
) -> Result<Option<TrustRuntimeSummary>, sqlx::Error> {
    let provenance_messages = db
        .list_afp_messages_by_type(owner_user_id, &[AFP_TYPE_PROVENANCE_RECORD], 40)
        .await?;

    let provenance_record_count = provenance_messages.len();
    let audited_action_count = action_log.len();
    if provenance_record_count == 0 && audited_action_count == 0 {
        return Ok(None);
    }

    let (
        pending_audit_count,
        failed_audit_count,
        successful_audit_count,
        reversible_action_count,
        undo_ready_action_count,
        latest_audit_status,
        latest_undo_label,
    ) = trust_action_log_stats(action_log);
    let latest_provenance_action_type = provenance_messages
        .first()
        .and_then(|message| message.get("content"))
        .and_then(Value::as_object)
        .and_then(|content| content.get("action_type"))
        .and_then(Value::as_str)
        .map(str::to_string);

    Ok(Some(TrustRuntimeSummary {
        provenance_record_count,
        audited_action_count,
        pending_audit_count,
        failed_audit_count,
        successful_audit_count,
        reversible_action_count,
        undo_ready_action_count,
        latest_provenance_action_type,
        latest_audit_status,
        latest_undo_label,
    }))
}

fn trust_action_log_stats(
    action_log: &[ActionAuditEntry],
) -> (
    usize,
    usize,
    usize,
    usize,
    usize,
    Option<String>,
    Option<String>,
) {
    let undone_checkpoint_ids = action_log
        .iter()
        .filter_map(|entry| {
            if !entry.capability_id.ends_with(":undo") {
                return None;
            }
            let status = entry.status.to_ascii_lowercase();
            if !status.contains("completed")
                && !status.contains("success")
                && !status.contains("succeeded")
            {
                return None;
            }
            entry
                .output
                .get("checkpoint_message_id")
                .and_then(Value::as_str)
                .map(str::to_string)
        })
        .collect::<std::collections::HashSet<_>>();
    let pending_audit_count = action_log
        .iter()
        .filter(|entry| {
            let status = entry.status.to_ascii_lowercase();
            status.contains("pending") || status.contains("waiting")
        })
        .count();
    let failed_audit_count = action_log
        .iter()
        .filter(|entry| {
            let status = entry.status.to_ascii_lowercase();
            status.contains("failed") || status.contains("error")
        })
        .count();
    let successful_audit_count = action_log
        .iter()
        .filter(|entry| {
            let status = entry.status.to_ascii_lowercase();
            status.contains("completed")
                || status.contains("success")
                || status.contains("succeeded")
        })
        .count();
    let reversible_action_count = action_log
        .iter()
        .filter(|entry| {
            entry
                .reversible_summary
                .as_ref()
                .map(|summary| summary.reversible)
                .unwrap_or(false)
        })
        .count();
    let undo_ready_action_count = action_log
        .iter()
        .filter(|entry| {
            entry
                .reversible_summary
                .as_ref()
                .and_then(|summary| summary.rollback_checkpoint_id.as_ref())
                .filter(|checkpoint_id| !undone_checkpoint_ids.contains(*checkpoint_id))
                .is_some()
        })
        .count();
    let latest_audit_status = action_log.first().map(|entry| entry.status.clone());
    let latest_undo_label = action_log.iter().find_map(|entry| {
        entry
            .reversible_summary
            .as_ref()
            .and_then(|summary| summary.undo_label.clone())
    });

    (
        pending_audit_count,
        failed_audit_count,
        successful_audit_count,
        reversible_action_count,
        undo_ready_action_count,
        latest_audit_status,
        latest_undo_label,
    )
}

pub(super) async fn load_file_runtime_summary(
    db: &Db,
    owner_user_id: &str,
) -> Result<Option<FileRuntimeSummary>, sqlx::Error> {
    let ledger_messages = db
        .list_afp_messages_by_type(owner_user_id, &[AFP_TYPE_FILE_LEDGER], 40)
        .await?;
    let access_messages = db
        .list_afp_messages_by_type(owner_user_id, &[AFP_TYPE_FILE_ACCESS_REQUEST], 40)
        .await?;
    let reversible_file_messages = db
        .list_afp_messages_by_type(owner_user_id, &[AFP_TYPE_LEDGER], 80)
        .await?;
    let staged_bundle_messages = reversible_file_messages
        .iter()
        .filter(|message| {
            matches!(
                message.get("subtype").and_then(Value::as_str),
                Some("file_bundle_stage" | "file_bundle_stage_state")
            )
        })
        .cloned()
        .collect::<Vec<_>>();
    let discarded_bundle_messages = reversible_file_messages
        .iter()
        .filter(|message| {
            message.get("subtype").and_then(Value::as_str) == Some("file_bundle_stage_discard")
        })
        .cloned()
        .collect::<Vec<_>>();

    if ledger_messages.is_empty()
        && access_messages.is_empty()
        && staged_bundle_messages.is_empty()
        && discarded_bundle_messages.is_empty()
    {
        return Ok(None);
    }

    Ok(Some(build_file_runtime_summary_from_messages(
        &ledger_messages,
        &access_messages,
        &staged_bundle_messages,
        &discarded_bundle_messages,
    )))
}

pub(super) async fn load_inbox_runtime_summary(
    db: &Db,
    owner_user_id: &str,
) -> Result<Option<InboxRuntimeSummary>, sqlx::Error> {
    let ledger_messages = db
        .list_afp_messages_by_type(owner_user_id, &[AFP_TYPE_LEDGER], 80)
        .await?;
    let staged_messages = ledger_messages
        .iter()
        .filter(|message| {
            message.get("subtype").and_then(Value::as_str) == Some("inbox_organization_state")
        })
        .cloned()
        .collect::<Vec<_>>();
    let reverted_messages = ledger_messages
        .iter()
        .filter(|message| {
            message.get("subtype").and_then(Value::as_str) == Some("inbox_organization_revert")
        })
        .cloned()
        .collect::<Vec<_>>();

    if staged_messages.is_empty() && reverted_messages.is_empty() {
        return Ok(None);
    }

    Ok(Some(build_inbox_runtime_summary_from_messages(
        &staged_messages,
        &reverted_messages,
    )))
}

pub(super) async fn load_device_sync_runtime_summary(
    db: &Db,
    owner_user_id: &str,
) -> Result<Option<DeviceSyncRuntimeSummary>, sqlx::Error> {
    let policies = db
        .list_sync_device_policies_by_user(owner_user_id, 24)
        .await?;
    if policies.is_empty() {
        return Ok(None);
    }

    Ok(Some(build_device_sync_runtime_summary(&policies)))
}

pub(super) fn load_simulator_runtime_summary() -> Option<SimulatorRuntimeSummary> {
    let policies = vec![
        crate::simulator_rollout::load_simulator_rollout_policy(
            crate::simulator_rollout::SimulatorRolloutSurface::Planning,
        ),
        crate::simulator_rollout::load_simulator_rollout_policy(
            crate::simulator_rollout::SimulatorRolloutSurface::Synthesizer,
        ),
        crate::simulator_rollout::load_simulator_rollout_policy(
            crate::simulator_rollout::SimulatorRolloutSurface::Watcher,
        ),
    ];
    Some(build_simulator_runtime_summary_from_policies(&policies))
}

fn trim_non_empty_string(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

fn simulator_runtime_observed_usize(value: Option<&Value>) -> Option<usize> {
    value
        .and_then(Value::as_u64)
        .and_then(|value| usize::try_from(value).ok())
}

fn simulator_runtime_observed_notes(value: Option<&Value>) -> Vec<String> {
    value
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(Value::as_str)
                .map(str::trim)
                .filter(|item| !item.is_empty())
                .map(str::to_string)
                .collect::<Vec<_>>()
        })
        .unwrap_or_default()
}

fn simulator_rollout_stage_rank(value: Option<&str>) -> Option<u8> {
    match value.map(str::trim).filter(|value| !value.is_empty()) {
        Some("shadow") => Some(0),
        Some("review") => Some(1),
        Some("promotion") => Some(2),
        _ => None,
    }
}

fn simulator_runtime_human_label(value: &str) -> String {
    value.replace('_', " ")
}

fn simulator_runtime_policy_posture_summary(
    highest_rollout_stage: &str,
    enabled_surface_count: usize,
    promotion_enabled_surface_count: usize,
    review_surface_count: usize,
    sampled_surface_count: usize,
) -> String {
    format!(
        "Policy posture: {} stage across {} active surface{}; {} promotion-enabled; {} review surface{}; {} sampled surface{}.",
        simulator_runtime_human_label(highest_rollout_stage),
        enabled_surface_count,
        if enabled_surface_count == 1 { "" } else { "s" },
        promotion_enabled_surface_count,
        review_surface_count,
        if review_surface_count == 1 { "" } else { "s" },
        sampled_surface_count,
        if sampled_surface_count == 1 { "" } else { "s" },
    )
}

fn simulator_runtime_rollout_alignment(
    highest_rollout_stage: &str,
    observed_rollout_stage: Option<&str>,
) -> (String, String) {
    let policy_label = simulator_runtime_human_label(highest_rollout_stage);
    let observed_rollout_stage = observed_rollout_stage
        .map(str::trim)
        .filter(|value| !value.is_empty());
    match observed_rollout_stage {
        None => (
            "policy_only".to_string(),
            format!(
                "No observed simulator run has been recorded yet for the current {} policy posture.",
                policy_label
            ),
        ),
        Some(observed) if observed == highest_rollout_stage => (
            "aligned".to_string(),
            format!(
                "Latest observed simulation matches the planned {} posture.",
                policy_label
            ),
        ),
        Some(observed) => {
            let observed_label = simulator_runtime_human_label(observed);
            match (
                simulator_rollout_stage_rank(Some(highest_rollout_stage)),
                simulator_rollout_stage_rank(Some(observed)),
            ) {
                (Some(policy_rank), Some(observed_rank)) if observed_rank < policy_rank => (
                    "below_policy".to_string(),
                    format!(
                        "Latest observed simulation remains below policy posture: observed {} while policy is {}.",
                        observed_label, policy_label
                    ),
                ),
                (Some(policy_rank), Some(observed_rank)) if observed_rank > policy_rank => (
                    "ahead_of_policy".to_string(),
                    format!(
                        "Latest observed simulation exceeded policy posture: observed {} while policy is {}.",
                        observed_label, policy_label
                    ),
                ),
                _ => (
                    "diverged".to_string(),
                    format!(
                        "Latest observed simulation used {} while policy reports {}.",
                        observed_label, policy_label
                    ),
                ),
            }
        }
    }
}

fn build_simulator_runtime_summary_from_policies(
    policies: &[crate::simulator_rollout::SimulatorRolloutPolicy],
) -> SimulatorRuntimeSummary {
    let enabled_surface_count = policies.iter().filter(|policy| policy.enabled).count();
    let promotion_enabled_surface_count = policies
        .iter()
        .filter(|policy| policy.allow_promotion)
        .count();
    let review_surface_count = policies
        .iter()
        .filter(|policy| policy.review_surfaces_enabled)
        .count();
    let sampled_surface_count = policies
        .iter()
        .filter(|policy| policy.probabilistic_sampling_enabled)
        .count();
    let highest_rollout_stage = if policies
        .iter()
        .any(|policy| policy.rollout_stage == "promotion")
    {
        "promotion".to_string()
    } else if policies
        .iter()
        .any(|policy| policy.rollout_stage == "review")
    {
        "review".to_string()
    } else {
        "shadow".to_string()
    };
    let policy_posture_summary = simulator_runtime_policy_posture_summary(
        &highest_rollout_stage,
        enabled_surface_count,
        promotion_enabled_surface_count,
        review_surface_count,
        sampled_surface_count,
    );
    let (rollout_alignment_status, rollout_alignment_summary) =
        simulator_runtime_rollout_alignment(&highest_rollout_stage, None);
    let surfaces = policies
        .iter()
        .map(|policy| SimulatorRuntimeSurfaceSummary {
            surface: policy.surface.as_str().to_string(),
            enabled: policy.enabled,
            allow_promotion: policy.allow_promotion,
            probabilistic_sampling_enabled: policy.probabilistic_sampling_enabled,
            review_surfaces_enabled: policy.review_surfaces_enabled,
            rollout_stage: policy.rollout_stage.clone(),
            calibration_mode: policy.calibration_mode.clone(),
            policy_summary: simulator_runtime_policy_summary(policy),
            calibration_notes: simulator_runtime_calibration_notes(policy),
        })
        .collect::<Vec<_>>();

    SimulatorRuntimeSummary {
        enabled_surface_count,
        promotion_enabled_surface_count,
        review_surface_count,
        sampled_surface_count,
        highest_rollout_stage,
        policy_posture_summary,
        latest_observed_at: None,
        observed_rollout_stage: None,
        observed_calibration_mode: None,
        observed_projection_summary: None,
        observed_review_summary: None,
        observed_actionable_event_count: None,
        observed_promotion_candidate_count: None,
        observed_review_surface_count: None,
        observed_calibration_notes: Vec::new(),
        rollout_alignment_status,
        rollout_alignment_summary,
        surfaces,
    }
}

fn apply_latest_simulator_observation(
    mut summary: SimulatorRuntimeSummary,
    continuity: &DashboardContinuityPayload,
) -> SimulatorRuntimeSummary {
    let Some(state) = continuity.continuity_state.as_ref() else {
        return summary;
    };

    let metadata = state.metadata.as_object();
    let rollout = metadata
        .and_then(|metadata| metadata.get("simulator_rollout_summary"))
        .and_then(Value::as_object);
    let calibration = metadata
        .and_then(|metadata| metadata.get("simulator_calibration_summary"))
        .and_then(Value::as_object);
    let handoff = continuity.continuity_handoff.as_ref();
    let has_handoff_observation = handoff
        .map(|handoff| {
            handoff
                .simulated_rollout_stage
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .is_some()
                || handoff
                    .simulated_calibration_mode
                    .as_deref()
                    .map(str::trim)
                    .filter(|value| !value.is_empty())
                    .is_some()
                || handoff
                    .simulated_projection_summary
                    .as_deref()
                    .map(str::trim)
                    .filter(|value| !value.is_empty())
                    .is_some()
                || handoff
                    .simulated_review_summary
                    .as_deref()
                    .map(str::trim)
                    .filter(|value| !value.is_empty())
                    .is_some()
                || handoff.simulated_actionable_event_count.is_some()
                || handoff.simulated_promotion_candidate_count.is_some()
                || handoff
                    .simulated_calibration_notes
                    .iter()
                    .any(|note| !note.trim().is_empty())
        })
        .unwrap_or(false);

    if rollout.is_none() && calibration.is_none() && !has_handoff_observation {
        return summary;
    }

    summary.latest_observed_at = Some(state.timestamp.clone());
    summary.observed_rollout_stage = trim_non_empty_string(
        rollout
            .and_then(|rollout| rollout.get("rollout_stage"))
            .and_then(Value::as_str)
            .or_else(|| handoff.and_then(|handoff| handoff.simulated_rollout_stage.as_deref())),
    );
    summary.observed_calibration_mode = trim_non_empty_string(
        rollout
            .and_then(|rollout| rollout.get("calibration_mode"))
            .and_then(Value::as_str)
            .or_else(|| {
                calibration
                    .and_then(|calibration| calibration.get("confidence_posture"))
                    .and_then(Value::as_str)
            })
            .or_else(|| handoff.and_then(|handoff| handoff.simulated_calibration_mode.as_deref())),
    );
    summary.observed_projection_summary = trim_non_empty_string(
        handoff.and_then(|handoff| handoff.simulated_projection_summary.as_deref()),
    );
    summary.observed_review_summary = trim_non_empty_string(
        calibration
            .and_then(|calibration| calibration.get("policy_summary"))
            .and_then(Value::as_str)
            .or_else(|| handoff.and_then(|handoff| handoff.simulated_review_summary.as_deref())),
    );
    summary.observed_actionable_event_count = simulator_runtime_observed_usize(
        calibration.and_then(|calibration| calibration.get("actionable_event_count")),
    )
    .or_else(|| {
        handoff.and_then(|handoff| {
            handoff
                .simulated_actionable_event_count
                .and_then(|value| usize::try_from(value).ok())
        })
    });
    summary.observed_promotion_candidate_count = simulator_runtime_observed_usize(
        calibration.and_then(|calibration| calibration.get("promotion_candidate_count")),
    )
    .or_else(|| {
        handoff.and_then(|handoff| {
            handoff
                .simulated_promotion_candidate_count
                .and_then(|value| usize::try_from(value).ok())
        })
    });
    summary.observed_review_surface_count = simulator_runtime_observed_usize(
        calibration.and_then(|calibration| calibration.get("review_surface_count")),
    );
    summary.observed_calibration_notes = {
        let metadata_notes = simulator_runtime_observed_notes(
            calibration.and_then(|calibration| calibration.get("calibration_notes")),
        );
        if !metadata_notes.is_empty() {
            metadata_notes
        } else {
            handoff
                .map(|handoff| {
                    handoff
                        .simulated_calibration_notes
                        .iter()
                        .map(|note| note.trim())
                        .filter(|note| !note.is_empty())
                        .map(str::to_string)
                        .collect::<Vec<_>>()
                })
                .unwrap_or_default()
        }
    };
    let (rollout_alignment_status, rollout_alignment_summary) = simulator_runtime_rollout_alignment(
        &summary.highest_rollout_stage,
        summary.observed_rollout_stage.as_deref(),
    );
    summary.rollout_alignment_status = rollout_alignment_status;
    summary.rollout_alignment_summary = rollout_alignment_summary;

    summary
}

fn simulator_runtime_policy_summary(
    policy: &crate::simulator_rollout::SimulatorRolloutPolicy,
) -> String {
    if !policy.enabled {
        return policy.disabled_summary();
    }
    if !policy.allow_promotion {
        return format!(
            "Simulator preview stays bounded on {} without promotion write-back.",
            policy.surface.as_str()
        );
    }
    if policy.review_surfaces_enabled {
        return format!(
            "Simulator preview stays bounded on {} with review surfaces enabled.",
            policy.surface.as_str()
        );
    }
    format!(
        "Simulator preview stays bounded on {} without exposed review surfaces.",
        policy.surface.as_str()
    )
}

fn simulator_runtime_calibration_notes(
    policy: &crate::simulator_rollout::SimulatorRolloutPolicy,
) -> Vec<String> {
    let mut notes = Vec::new();
    if !policy.enabled {
        notes.push("Rollout policy disabled simulator execution for this surface.".to_string());
        return notes;
    }
    if policy.probabilistic_sampling_enabled {
        notes.push("Probabilistic sampling is enabled within the bounded rollout cap.".to_string());
    } else {
        notes.push("Deterministic bounded preview is active for this surface.".to_string());
    }
    if !policy.allow_promotion {
        notes.push("Promotion write-back is suppressed by rollout policy.".to_string());
    }
    if !policy.review_surfaces_enabled {
        notes.push("Review surfaces are disabled for this rollout stage.".to_string());
    } else {
        notes.push("Review surfaces stay available for bounded simulator previews.".to_string());
    }
    notes
}

fn build_file_runtime_summary_from_messages(
    ledger_messages: &[Value],
    access_messages: &[Value],
    staged_bundle_messages: &[Value],
    discarded_bundle_messages: &[Value],
) -> FileRuntimeSummary {
    let canonical_staged_bundle_messages = {
        let mut by_bundle_id = std::collections::BTreeMap::<String, Value>::new();
        let mut unkeyed_messages = Vec::new();
        for message in staged_bundle_messages {
            let bundle_id = message
                .get("content")
                .and_then(Value::as_object)
                .and_then(|content| content.get("bundle_id"))
                .and_then(Value::as_str);
            if let Some(bundle_id) = bundle_id {
                let prefer_current = message.get("subtype").and_then(Value::as_str)
                    == Some("file_bundle_stage_state");
                let replace_existing = match by_bundle_id.get(bundle_id) {
                    Some(existing) => {
                        let existing_is_state = existing.get("subtype").and_then(Value::as_str)
                            == Some("file_bundle_stage_state");
                        prefer_current && !existing_is_state
                    }
                    None => true,
                };
                if replace_existing {
                    by_bundle_id.insert(bundle_id.to_string(), message.clone());
                }
            } else {
                unkeyed_messages.push(message.clone());
            }
        }
        by_bundle_id
            .into_values()
            .chain(unkeyed_messages)
            .collect::<Vec<_>>()
    };
    let ledger_create_count = ledger_messages
        .iter()
        .filter(|message| {
            message.get("subtype").and_then(Value::as_str) == Some("file_ledger:create")
        })
        .count();
    let ledger_update_count = ledger_messages
        .iter()
        .filter(|message| {
            message.get("subtype").and_then(Value::as_str) == Some("file_ledger:update")
        })
        .count();
    let export_result_count = ledger_messages
        .iter()
        .filter(|message| {
            message.get("subtype").and_then(Value::as_str) == Some("file_ledger:export_result")
        })
        .count();
    let staged_bundle_count = canonical_staged_bundle_messages.len();
    let staged_bundle_file_count = canonical_staged_bundle_messages
        .iter()
        .map(|message| {
            message
                .get("content")
                .and_then(Value::as_object)
                .and_then(|content| {
                    content
                        .get("file_names")
                        .or_else(|| content.get("file_entry_ids"))
                })
                .and_then(Value::as_array)
                .map(|items| items.len())
                .unwrap_or(0)
        })
        .sum();
    let discarded_bundle_ids = discarded_bundle_messages
        .iter()
        .filter_map(|message| {
            message
                .get("content")
                .and_then(Value::as_object)
                .and_then(|content| content.get("bundle_id"))
                .and_then(Value::as_str)
                .map(str::to_string)
        })
        .collect::<std::collections::HashSet<_>>();
    let active_staged_bundle_messages = canonical_staged_bundle_messages
        .iter()
        .filter(|message| {
            message
                .get("content")
                .and_then(Value::as_object)
                .and_then(|content| content.get("bundle_id"))
                .and_then(Value::as_str)
                .map(|bundle_id| !discarded_bundle_ids.contains(bundle_id))
                .unwrap_or(true)
        })
        .collect::<Vec<_>>();
    let active_staged_bundle_count = active_staged_bundle_messages.len();
    let active_staged_bundle_file_count = active_staged_bundle_messages
        .iter()
        .map(|message| {
            message
                .get("content")
                .and_then(Value::as_object)
                .and_then(|content| {
                    content
                        .get("file_names")
                        .or_else(|| content.get("file_entry_ids"))
                })
                .and_then(Value::as_array)
                .map(|items| items.len())
                .unwrap_or(0)
        })
        .sum();
    let discarded_bundle_count = discarded_bundle_messages.len();
    let latest_action_message_id = active_staged_bundle_messages
        .first()
        .and_then(|message| message.get("content"))
        .and_then(Value::as_object)
        .and_then(|content| content.get("source_action_message_id"))
        .and_then(Value::as_str)
        .map(str::to_string)
        .or_else(|| {
            discarded_bundle_messages
                .first()
                .and_then(|message| message.get("content"))
                .and_then(Value::as_object)
                .and_then(|content| content.get("source_action_message_id"))
                .and_then(Value::as_str)
                .map(str::to_string)
        })
        .or_else(|| {
            canonical_staged_bundle_messages
                .first()
                .and_then(|message| message.get("content"))
                .and_then(Value::as_object)
                .and_then(|content| content.get("source_action_message_id"))
                .and_then(Value::as_str)
                .map(str::to_string)
        });
    let latest_action_thread_id = active_staged_bundle_messages
        .first()
        .and_then(|message| message.get("thread_id"))
        .and_then(Value::as_str)
        .map(str::to_string)
        .or_else(|| {
            discarded_bundle_messages
                .first()
                .and_then(|message| message.get("thread_id"))
                .and_then(Value::as_str)
                .map(str::to_string)
        })
        .or_else(|| {
            canonical_staged_bundle_messages
                .first()
                .and_then(|message| message.get("thread_id"))
                .and_then(Value::as_str)
                .map(str::to_string)
        });
    let latest_reversible_message_id = latest_action_message_id.clone().or_else(|| {
        active_staged_bundle_messages
            .first()
            .and_then(|message| message.get("id"))
            .and_then(Value::as_str)
            .map(str::to_string)
            .or_else(|| {
                canonical_staged_bundle_messages
                    .first()
                    .and_then(|message| message.get("id"))
                    .and_then(Value::as_str)
                    .map(str::to_string)
            })
    });
    let latest_reversible_thread_id = latest_action_thread_id.clone().or_else(|| {
        active_staged_bundle_messages
            .first()
            .and_then(|message| message.get("thread_id"))
            .and_then(Value::as_str)
            .map(str::to_string)
            .or_else(|| {
                canonical_staged_bundle_messages
                    .first()
                    .and_then(|message| message.get("thread_id"))
                    .and_then(Value::as_str)
                    .map(str::to_string)
            })
    });

    let active_file_entry_count = ledger_messages
        .iter()
        .find_map(|message| {
            let subtype = message
                .get("subtype")
                .and_then(Value::as_str)
                .unwrap_or_default();
            let content = message.get("content").and_then(Value::as_object)?;
            if subtype == "file_ledger:create" {
                return Some(
                    content
                        .get("entries")
                        .and_then(Value::as_array)
                        .map(|entries| entries.len())
                        .unwrap_or(0),
                );
            }
            if subtype == "file_ledger:update" {
                let upsert = content
                    .get("upsert")
                    .and_then(Value::as_array)
                    .map(|entries| entries.len())
                    .unwrap_or(0);
                let archive = content
                    .get("archive")
                    .and_then(Value::as_array)
                    .map(|entries| entries.len())
                    .unwrap_or(0);
                return Some(upsert.saturating_sub(archive));
            }
            None
        })
        .unwrap_or(0);

    let latest_ledger_name = ledger_messages.iter().find_map(|message| {
        let content = message.get("content").and_then(Value::as_object)?;
        content
            .get("name")
            .and_then(Value::as_str)
            .map(str::to_string)
            .or_else(|| {
                content
                    .get("ledger_id")
                    .and_then(Value::as_str)
                    .map(str::to_string)
            })
    });

    let pending_access_request_count = access_messages
        .iter()
        .filter(|message| {
            message.get("subtype").and_then(Value::as_str) == Some("file_access:request")
        })
        .count();
    let active_grant_count = access_messages
        .iter()
        .filter(|message| {
            message.get("subtype").and_then(Value::as_str) == Some("file_access:grant")
        })
        .count();
    let denied_access_count = access_messages
        .iter()
        .filter(|message| {
            message.get("subtype").and_then(Value::as_str) == Some("file_access:deny")
        })
        .count();
    let revoked_access_count = access_messages
        .iter()
        .filter(|message| {
            message.get("subtype").and_then(Value::as_str) == Some("file_access:revoke")
        })
        .count();
    let file_op_count = access_messages
        .iter()
        .filter(|message| message.get("subtype").and_then(Value::as_str) == Some("file_access:op"))
        .count();

    let latest_activity = active_staged_bundle_messages
        .first()
        .and_then(|message| message.get("subtype"))
        .and_then(Value::as_str)
        .map(str::to_string)
        .or_else(|| {
            discarded_bundle_messages
                .first()
                .and_then(|message| message.get("subtype"))
                .and_then(Value::as_str)
                .map(str::to_string)
        })
        .or_else(|| {
            ledger_messages
                .first()
                .and_then(|message| message.get("subtype"))
                .and_then(Value::as_str)
                .map(str::to_string)
        })
        .or_else(|| {
            canonical_staged_bundle_messages
                .first()
                .and_then(|message| message.get("subtype"))
                .and_then(Value::as_str)
                .map(str::to_string)
        })
        .or_else(|| {
            access_messages
                .first()
                .and_then(|message| message.get("subtype"))
                .and_then(Value::as_str)
                .map(str::to_string)
        });

    FileRuntimeSummary {
        ledger_create_count,
        ledger_update_count,
        export_result_count,
        active_staged_bundle_count,
        active_staged_bundle_file_count,
        staged_bundle_count,
        staged_bundle_file_count,
        discarded_bundle_count,
        active_file_entry_count,
        pending_access_request_count,
        active_grant_count,
        denied_access_count,
        revoked_access_count,
        file_op_count,
        latest_ledger_name,
        latest_action_message_id,
        latest_action_thread_id,
        latest_reversible_message_id,
        latest_reversible_thread_id,
        latest_activity,
    }
}

fn build_inbox_runtime_summary_from_messages(
    staged_messages: &[Value],
    reverted_messages: &[Value],
) -> InboxRuntimeSummary {
    let reverted_ids = reverted_messages
        .iter()
        .filter_map(|message| {
            message
                .get("content")
                .and_then(Value::as_object)
                .and_then(|content| content.get("organization_id"))
                .and_then(Value::as_str)
                .map(str::to_string)
        })
        .collect::<std::collections::HashSet<_>>();
    let active_staged_messages = staged_messages
        .iter()
        .filter(|message| {
            message
                .get("content")
                .and_then(Value::as_object)
                .and_then(|content| content.get("organization_id"))
                .and_then(Value::as_str)
                .map(|organization_id| !reverted_ids.contains(organization_id))
                .unwrap_or(true)
        })
        .collect::<Vec<_>>();
    let latest_message = active_staged_messages
        .first()
        .copied()
        .or_else(|| staged_messages.first())
        .or_else(|| reverted_messages.first());
    let latest_provider = latest_message
        .and_then(|message| message.get("content"))
        .and_then(Value::as_object)
        .and_then(|content| content.get("provider"))
        .and_then(Value::as_str)
        .map(str::to_string);
    let latest_conversation_ref = latest_message
        .and_then(|message| message.get("content"))
        .and_then(Value::as_object)
        .and_then(|content| content.get("conversation_ref"))
        .and_then(Value::as_str)
        .map(str::to_string);
    let latest_action_message_id = latest_message
        .and_then(|message| message.get("content"))
        .and_then(Value::as_object)
        .and_then(|content| content.get("source_action_message_id"))
        .and_then(Value::as_str)
        .map(str::to_string);
    let latest_action_thread_id = latest_message
        .and_then(|message| message.get("thread_id"))
        .and_then(Value::as_str)
        .map(str::to_string);
    let latest_activity = active_staged_messages
        .first()
        .and_then(|message| message.get("subtype"))
        .and_then(Value::as_str)
        .map(str::to_string)
        .or_else(|| {
            staged_messages
                .first()
                .and_then(|message| message.get("subtype"))
                .and_then(Value::as_str)
                .map(str::to_string)
        })
        .or_else(|| {
            reverted_messages
                .first()
                .and_then(|message| message.get("subtype"))
                .and_then(Value::as_str)
                .map(str::to_string)
        });

    InboxRuntimeSummary {
        active_staged_organization_count: active_staged_messages.len(),
        staged_organization_count: staged_messages.len(),
        reverted_organization_count: reverted_messages.len(),
        latest_provider,
        latest_conversation_ref,
        latest_action_message_id,
        latest_action_thread_id,
        latest_activity,
    }
}

fn build_device_sync_runtime_summary(
    policies: &[crate::db::SyncDevicePolicyRecord],
) -> DeviceSyncRuntimeSummary {
    let mut used_device_count = 0usize;
    let mut local_key_device_count = 0usize;
    let mut desktop_device_count = 0usize;
    let mut mobile_device_count = 0usize;
    let mut watch_device_count = 0usize;

    for policy in policies {
        if policy.last_used_at.is_some() {
            used_device_count += 1;
        }
        if policy.requires_local_key_material {
            local_key_device_count += 1;
        }
        match policy.device_class.as_str() {
            "desktop" => desktop_device_count += 1,
            "mobile" => mobile_device_count += 1,
            "watch" => watch_device_count += 1,
            _ => {}
        }
    }

    let latest = policies.first();
    DeviceSyncRuntimeSummary {
        device_policy_count: policies.len(),
        used_device_count,
        local_key_device_count,
        desktop_device_count,
        mobile_device_count,
        watch_device_count,
        latest_device_id: latest.map(|policy| policy.device_id.clone()),
        latest_device_class: latest.map(|policy| policy.device_class.clone()),
        latest_policy_profile: latest.map(|policy| policy.policy_profile.clone()),
        latest_last_used_at: latest.and_then(|policy| policy.last_used_at.clone()),
        latest_policy_note: latest.and_then(|policy| {
            policy
                .notes_json
                .get("policy_note")
                .and_then(Value::as_str)
                .map(str::to_string)
        }),
    }
}

pub(super) fn routes() -> Router<Arc<AppState>> {
    Router::new()
        .route("/dashboard/bootstrap", get(dashboard_bootstrap_http))
        .route("/dashboard/export", get(dashboard_export_http))
        .route("/dashboard/onboarding", post(update_onboarding_http))
        .route("/dashboard/onboarding-bundle", get(onboarding_bundle_http))
        .route(
            "/dashboard/service-adapter-bundle",
            get(service_adapter_bundle_http),
        )
}

pub(super) fn installer_routes() -> Router<Arc<AppState>> {
    Router::new()
        .route(
            "/installers/local/windows.ps1",
            get(local_windows_installer_http),
        )
        .route("/installers/local/unix.sh", get(local_unix_installer_http))
}

async fn dashboard_bootstrap_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<DashboardBootstrapResponse>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let active_persona = state
        .db
        .get_active_agent_persona(&user.id)
        .await
        .ok()
        .flatten();
    let current_token = bearer_token_from_headers(&headers)
        .ok_or_else(|| (StatusCode::UNAUTHORIZED, "missing bearer token".to_string()))?;
    ensure_user_agents_and_demo_seed(&state, &user)
        .await
        .map_err(internal_http_error)?;
    let agents = state
        .db
        .list_managed_agents_by_user(&user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    let agent_ids = agents
        .iter()
        .map(|agent| agent.agent_id.clone())
        .collect::<Vec<_>>();
    let message_bundle = load_dashboard_message_bundle(&state, &user.id, &agent_ids, 20).await?;
    let messages = message_bundle.recent_messages;
    let thread_summaries = message_bundle.thread_summaries;
    let thread_retrieval_state = message_bundle.thread_retrieval_state;
    let action_log = state
        .db
        .recent_action_results(&user.id, 64)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    let runtime_deployment = match state
        .db
        .find_runtime_deployment_by_user(&user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?
    {
        Some(deployment) => Some(
            runtime_deployment_response_live(
                inspect_runtime_deployment_live(inspect_runtime_deployment(deployment)).await,
            )
            .await,
        ),
        None => None,
    };
    let support_access = state
        .db
        .latest_support_access_grant(&user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?
        .map(support_access_state_response)
        .unwrap_or_else(default_support_access_state_response);
    let support_access_history = state
        .db
        .list_support_access_grants(&user.id, 8)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?
        .into_iter()
        .map(support_access_history_entry)
        .collect::<Vec<_>>();
    let sessions = state
        .db
        .list_sessions_by_user(&user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?
        .into_iter()
        .map(|session| account_session_entry(session, &current_token))
        .collect::<Vec<_>>();
    let runtime_backups = load_runtime_backups_response(&state.db, &user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    let runtime_restore_drills = load_runtime_restore_drills_response(&state.db, &user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    let runtime_updates = load_runtime_updates_response(&state.db, &user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    let workflow_runtime_summary = load_workflow_runtime_summary(&state.db, &user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    let browser_runtime_summary = load_browser_runtime_summary(&state.db, &user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    let task_runtime_summary = load_task_runtime_summary(&state.db, &user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    let calendar_runtime_summary = load_calendar_runtime_summary(&state.db, &user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    let trust_runtime_summary = load_trust_runtime_summary(&state.db, &user.id, &action_log)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    let file_runtime_summary = load_file_runtime_summary(&state.db, &user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    let inbox_runtime_summary = load_inbox_runtime_summary(&state.db, &user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    let device_sync_runtime_summary = load_device_sync_runtime_summary(&state.db, &user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    let device_sync_policies = load_device_sync_policies_response(&state.db, &user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    let onboarding = state
        .db
        .find_user_onboarding(&user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?
        .unwrap_or_else(|| default_onboarding_for_user(&user));

    let prefs = state
        .db
        .get_agent_preferences(&user.id)
        .await
        .ok()
        .flatten()
        .and_then(|v| serde_json::from_value::<AgentPreferences>(v).ok())
        .unwrap_or_default();
    let enabled_heuristic_packs = state
        .db
        .get_enabled_packs(&user.id)
        .await
        .unwrap_or_default();
    let continuity_summary = load_continuity_state_summary(&state.db, &user.id, 10)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    crate::server::proactive_routes::persist_prepared_draft_suggestions_from_continuity(
        &state,
        &user.id,
        &continuity_summary,
    )
    .await;
    crate::server::proactive_routes::persist_context_suggestions_from_continuity(
        &state,
        &user.id,
        &continuity_summary,
    )
    .await;
    crate::server::proactive_routes::persist_simulator_review_suggestions_from_continuity(
        &state,
        &user.id,
        &continuity_summary,
    )
    .await;
    // P5.3 — include recent proactive suggestions in the bootstrap response.
    let queue_pressure = crate::server::proactive_routes::queue_pressure_from_continuity_summary(
        &continuity_summary,
    );
    let outcome_feedback = crate::server::proactive_routes::load_adapted_outcome_feedback(
        &state.db,
        &user.id,
        queue_pressure,
    )
    .await
    .unwrap_or_default();
    let proactive_limit = 10;
    let proactive_suggestions = state
        .db
        .list_proactive_suggestions(
            &user.id,
            crate::server::proactive_routes::proactive_suggestion_fetch_limit(proactive_limit),
        )
        .await
        .unwrap_or_default();
    let proactive_suggestions = select_dashboard_bootstrap_proactive_suggestions(
        proactive_suggestions,
        &outcome_feedback,
        &prefs,
        proactive_limit,
    );
    let cost_snapshot = load_dashboard_cost_snapshot(&state, &user.id)
        .await
        .map_err(internal_http_error)?;
    let cost_status = cost_snapshot.as_ref().and_then(cost_status_from_snapshot);
    let continuity = style_dashboard_continuity_payload(
        build_dashboard_continuity_payload(continuity_summary, cost_status.as_ref()),
        active_persona.as_ref(),
    );
    let simulator_runtime_summary = load_simulator_runtime_summary()
        .map(|summary| apply_latest_simulator_observation(summary, &continuity));
    let proactive_suggestions = crate::server::proactive_routes::style_proactive_suggestion_items(
        build_dashboard_bootstrap_proactive_suggestions(
            proactive_suggestions,
            &continuity,
            &outcome_feedback,
            &prefs,
            proactive_limit,
        ),
        active_persona.as_ref(),
    );
    let operational_guidance = load_runtime_operational_guidance();

    let action_log = style_dashboard_action_log(action_log, active_persona.as_ref());

    Ok(Json(DashboardBootstrapResponse {
        user: session_user_response(&user),
        agents,
        messages,
        thread_summaries,
        thread_retrieval_state,
        cost_snapshot,
        cost_status,
        workflow_runtime_summary,
        browser_runtime_summary,
        task_runtime_summary,
        calendar_runtime_summary,
        trust_runtime_summary,
        file_runtime_summary,
        inbox_runtime_summary,
        device_sync_runtime_summary,
        simulator_runtime_summary,
        continuity_state: continuity.continuity_state,
        continuity_brief: continuity.continuity_brief,
        continuity_handoff: continuity.continuity_handoff,
        continuity_surface_hint: continuity.continuity_surface_hint,
        continuity_requires_approval: continuity.continuity_requires_approval,
        continuity_panel_kind: continuity.continuity_panel_kind,
        continuity_primary_mode: continuity.continuity_primary_mode,
        continuity_priority_item: continuity.continuity_priority_item,
        continuity_priority_card: continuity.continuity_priority_card,
        continuity_action_items: continuity.continuity_action_items,
        continuity_action_overflow_count: continuity.continuity_action_overflow_count,
        continuity_action_overflow_summary: continuity.continuity_action_overflow_summary,
        continuity_response_items: continuity.continuity_response_items,
        continuity_prepared_draft_items: continuity.continuity_prepared_draft_items,
        continuity_context_panel_items: continuity.continuity_context_panel_items,
        continuity_context_pack_items: continuity.continuity_context_pack_items,
        continuity_state_fields: continuity.continuity_state_fields,
        action_log,
        onboarding,
        device_sync_policies,
        support_access,
        support_access_history,
        sessions,
        runtime_backups,
        runtime_restore_drills,
        runtime_updates,
        runtime_deployment,
        operational_guidance,
        proactive_suggestions,
        enabled_heuristic_packs,
    }))
}

fn select_dashboard_bootstrap_proactive_suggestions(
    proactive_suggestions: Vec<serde_json::Value>,
    outcome_feedback: &[crate::proactive_outcome_memory::HeuristicOutcomeFeedback],
    prefs: &AgentPreferences,
    limit: i64,
) -> Vec<serde_json::Value> {
    crate::server::proactive_routes::outcome_ranked_proactive_suggestions(
        proactive_suggestions,
        outcome_feedback,
        prefs,
        limit,
    )
}

async fn dashboard_export_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<DashboardExportResponse>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let active_persona = state
        .db
        .get_active_agent_persona(&user.id)
        .await
        .ok()
        .flatten();
    let current_token = bearer_token_from_headers(&headers)
        .ok_or_else(|| (StatusCode::UNAUTHORIZED, "missing bearer token".to_string()))?;
    ensure_user_agents_and_demo_seed(&state, &user)
        .await
        .map_err(internal_http_error)?;
    let agents = state
        .db
        .list_managed_agents_by_user(&user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    let agent_ids = agents
        .iter()
        .map(|agent| agent.agent_id.clone())
        .collect::<Vec<_>>();
    let message_bundle = load_dashboard_message_bundle(&state, &user.id, &agent_ids, 100).await?;
    let messages = message_bundle.recent_messages;
    let thread_summaries = message_bundle.thread_summaries;
    let thread_retrieval_state = message_bundle.thread_retrieval_state;
    let action_log = state
        .db
        .recent_action_results(&user.id, 200)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    let runtime_deployment = match state
        .db
        .find_runtime_deployment_by_user(&user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?
    {
        Some(deployment) => Some(
            runtime_deployment_response_live(
                inspect_runtime_deployment_live(inspect_runtime_deployment(deployment)).await,
            )
            .await,
        ),
        None => None,
    };
    let support_access = state
        .db
        .latest_support_access_grant(&user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?
        .map(support_access_state_response)
        .unwrap_or_else(default_support_access_state_response);
    let support_access_history = state
        .db
        .list_support_access_grants(&user.id, 32)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?
        .into_iter()
        .map(support_access_history_entry)
        .collect::<Vec<_>>();
    let sessions = state
        .db
        .list_sessions_by_user(&user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?
        .into_iter()
        .map(|session| account_session_entry(session, &current_token))
        .collect::<Vec<_>>();
    let runtime_backups = load_runtime_backups_response(&state.db, &user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    let runtime_restore_drills = load_runtime_restore_drills_response(&state.db, &user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    let runtime_updates = load_runtime_updates_response(&state.db, &user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    let workflow_runtime_summary = load_workflow_runtime_summary(&state.db, &user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    let browser_runtime_summary = load_browser_runtime_summary(&state.db, &user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    let task_runtime_summary = load_task_runtime_summary(&state.db, &user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    let calendar_runtime_summary = load_calendar_runtime_summary(&state.db, &user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    let trust_runtime_summary = load_trust_runtime_summary(&state.db, &user.id, &action_log)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    let file_runtime_summary = load_file_runtime_summary(&state.db, &user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    let inbox_runtime_summary = load_inbox_runtime_summary(&state.db, &user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    let device_sync_runtime_summary = load_device_sync_runtime_summary(&state.db, &user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    let device_sync_policies = load_device_sync_policies_response(&state.db, &user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    let onboarding = state
        .db
        .find_user_onboarding(&user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?
        .unwrap_or_else(|| default_onboarding_for_user(&user));
    let continuity_summary = load_continuity_state_summary(&state.db, &user.id, 10)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    let cost_snapshot = load_dashboard_cost_snapshot(&state, &user.id)
        .await
        .map_err(internal_http_error)?;
    let cost_status = cost_snapshot.as_ref().and_then(cost_status_from_snapshot);
    let continuity = style_dashboard_continuity_payload(
        build_dashboard_continuity_payload(continuity_summary, cost_status.as_ref()),
        active_persona.as_ref(),
    );
    let simulator_runtime_summary = load_simulator_runtime_summary()
        .map(|summary| apply_latest_simulator_observation(summary, &continuity));

    Ok(Json(build_dashboard_export_response(
        session_user_response(&user),
        agents,
        cost_snapshot,
        cost_status,
        workflow_runtime_summary,
        browser_runtime_summary,
        task_runtime_summary,
        calendar_runtime_summary,
        trust_runtime_summary,
        file_runtime_summary,
        inbox_runtime_summary,
        device_sync_runtime_summary,
        simulator_runtime_summary,
        continuity,
        onboarding,
        device_sync_policies,
        support_access,
        support_access_history,
        sessions,
        runtime_backups,
        runtime_restore_drills,
        runtime_updates,
        runtime_deployment,
        load_runtime_operational_guidance(),
        messages,
        thread_summaries,
        thread_retrieval_state,
        style_dashboard_action_log(action_log, active_persona.as_ref()),
    )))
}

async fn update_onboarding_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<OnboardingUpdateRequest>,
) -> Result<Json<UserOnboardingRecord>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let onboarding = build_onboarding_record(&user, request)?;

    state
        .db
        .upsert_user_onboarding(&onboarding)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;

    Ok(Json(onboarding))
}

async fn onboarding_bundle_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<OnboardingBundleResponse>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let onboarding = state
        .db
        .find_user_onboarding(&user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?
        .unwrap_or_else(|| default_onboarding_for_user(&user));
    let agents = state
        .db
        .list_managed_agents_by_user(&user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;

    Ok(Json(build_onboarding_bundle_response(
        &user,
        &onboarding,
        &agents,
    )))
}

async fn service_adapter_bundle_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<ServiceAdapterBundleResponse>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let agents = state
        .db
        .list_managed_agents_by_user(&user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;

    Ok(Json(build_service_adapter_bundle_response(&user, &agents)))
}

async fn local_windows_installer_http() -> impl IntoResponse {
    let content = include_str!("../../scripts/install-omnyid-private.ps1");
    (
        [(
            axum::http::header::CONTENT_TYPE,
            "text/plain; charset=utf-8",
        )],
        content,
    )
}

async fn local_unix_installer_http() -> impl IntoResponse {
    let content = include_str!("../../scripts/install-omnyid-private.sh");
    (
        [(
            axum::http::header::CONTENT_TYPE,
            "text/plain; charset=utf-8",
        )],
        content,
    )
}

pub(super) fn build_dashboard_continuity_payload(
    continuity_summary: DashboardContinuityStateResponse,
    cost_status: Option<&DashboardCostStatus>,
) -> DashboardContinuityPayload {
    let continuity_handoff = continuity_summary.preferred_synthesizer_handoff.clone();
    let continuity_state = preferred_continuity_state_message(&continuity_summary);
    let base_surface_hint = continuity_handoff
        .as_ref()
        .map(|handoff| handoff.surface_recommendation.clone());
    let base_requires_approval = continuity_handoff
        .as_ref()
        .map(|handoff| handoff.escalation_required)
        .unwrap_or(false);
    let continuity_priority_item = effective_priority_item_with_cost(
        continuity_summary.preferred_priority_item.as_ref(),
        cost_status,
    );
    let continuity_action_items = if continuity_summary.preferred_action_items.is_empty() {
        crate::server::continuity_routes::continuity_action_items(
            continuity_state.as_ref(),
            continuity_summary.preferred_state_brief.as_ref(),
            continuity_handoff.as_ref(),
        )
    } else {
        continuity_summary.preferred_action_items.clone()
    };
    let continuity_action_overflow_count = continuity_summary.preferred_action_overflow_count;
    let continuity_action_overflow_summary =
        continuity_summary.preferred_action_overflow_summary.clone();
    let continuity_priority_card =
        continuity_priority_card(continuity_priority_item.as_ref(), continuity_state.as_ref());
    let continuity_surface_hint = continuity_priority_item
        .as_ref()
        .and_then(|item| item.surface_hint.clone())
        .or(base_surface_hint);
    let continuity_requires_approval = continuity_priority_item
        .as_ref()
        .map(|item| item.requires_approval)
        .unwrap_or(base_requires_approval);
    let continuity_panel_kind = continuity_priority_item
        .as_ref()
        .map(|item| item.panel_kind.clone())
        .unwrap_or_else(|| {
            continuity_panel_kind(
                continuity_surface_hint.as_deref(),
                continuity_requires_approval,
            )
            .to_string()
        });
    let continuity_primary_mode =
        continuity_primary_mode(continuity_priority_card.as_ref(), &continuity_panel_kind)
            .to_string();

    DashboardContinuityPayload {
        continuity_state: preferred_continuity_state_message(&continuity_summary),
        continuity_brief: continuity_summary.preferred_state_brief,
        continuity_handoff,
        continuity_surface_hint,
        continuity_requires_approval,
        continuity_panel_kind,
        continuity_primary_mode,
        continuity_priority_item,
        continuity_priority_card,
        continuity_action_items,
        continuity_action_overflow_count,
        continuity_action_overflow_summary,
        continuity_response_items: continuity_summary.preferred_response_items,
        continuity_prepared_draft_items: continuity_summary.preferred_prepared_draft_items,
        continuity_context_panel_items: continuity_summary.preferred_context_panel_items,
        continuity_context_pack_items: continuity_summary.preferred_context_pack_items,
        continuity_state_fields: continuity_summary.preferred_state_fields,
    }
}

pub(super) fn build_dashboard_bootstrap_proactive_suggestions(
    proactive_suggestions: Vec<serde_json::Value>,
    continuity: &DashboardContinuityPayload,
    outcome_feedback: &[crate::proactive_outcome_memory::HeuristicOutcomeFeedback],
    prefs: &AgentPreferences,
    limit: i64,
) -> Vec<serde_json::Value> {
    let continuity_prepared_draft_suggestion =
        crate::server::proactive_routes::prepared_draft_suggestion_from_state(
            &continuity.continuity_prepared_draft_items,
            continuity.continuity_state.as_ref(),
            continuity.continuity_handoff.as_ref(),
        );
    let continuity_simulator_reversible_preview =
        crate::server::proactive_routes::simulator_reversible_preview_suggestion_from_state(
            continuity.continuity_state.as_ref(),
            continuity.continuity_handoff.as_ref(),
        );
    let continuity_simulator_conflict_fusion =
        crate::server::proactive_routes::simulator_conflict_fusion_suggestion_from_continuity(
            continuity.continuity_state.as_ref(),
            continuity.continuity_handoff.as_ref(),
        );
    let continuity_simulator_approval_preview =
        crate::server::proactive_routes::simulator_approval_preview_suggestion_from_state(
            continuity.continuity_state.as_ref(),
            continuity.continuity_handoff.as_ref(),
        );
    let mut proactive_suggestions = proactive_suggestions;
    if let Some(suggestion) = continuity_simulator_reversible_preview {
        proactive_suggestions.push(suggestion);
    }
    if let Some(suggestion) = continuity_simulator_conflict_fusion {
        proactive_suggestions.push(suggestion);
    }
    if let Some(suggestion) = continuity_simulator_approval_preview {
        proactive_suggestions.push(suggestion);
    }
    let proactive_suggestions =
        crate::server::proactive_routes::outcome_ranked_proactive_suggestions(
            proactive_suggestions,
            outcome_feedback,
            prefs,
            limit,
        );

    crate::server::proactive_routes::normalize_proactive_suggestion_contract(
        crate::server::proactive_routes::prioritize_proactive_suggestions(
            proactive_suggestions,
            continuity.continuity_priority_item.as_ref(),
            continuity.continuity_priority_card.as_ref(),
            continuity_prepared_draft_suggestion,
            crate::server::proactive_routes::context_ready_suggestion_from_state(
                continuity.continuity_state.as_ref(),
                continuity.continuity_handoff.as_ref(),
            ),
            continuity
                .continuity_context_pack_items
                .first()
                .map(crate::server::proactive_routes::synthetic_context_pack_suggestion),
            crate::server::proactive_routes::state_field_suggestion_from_fields(
                &continuity.continuity_state_fields,
                continuity.continuity_state.as_ref(),
            ),
            None,
        ),
    )
}

pub(super) fn build_dashboard_export_response(
    user: SessionUserResponse,
    agents: Vec<ManagedAgentRecord>,
    cost_snapshot: Option<DashboardCostSnapshot>,
    cost_status: Option<DashboardCostStatus>,
    workflow_runtime_summary: Option<WorkflowRuntimeSummary>,
    browser_runtime_summary: Option<BrowserRuntimeSummary>,
    task_runtime_summary: Option<TaskRuntimeSummary>,
    calendar_runtime_summary: Option<CalendarRuntimeSummary>,
    trust_runtime_summary: Option<TrustRuntimeSummary>,
    file_runtime_summary: Option<FileRuntimeSummary>,
    inbox_runtime_summary: Option<InboxRuntimeSummary>,
    device_sync_runtime_summary: Option<DeviceSyncRuntimeSummary>,
    simulator_runtime_summary: Option<SimulatorRuntimeSummary>,
    continuity: DashboardContinuityPayload,
    onboarding: UserOnboardingRecord,
    device_sync_policies: DeviceSyncPoliciesResponse,
    support_access: SupportAccessStateResponse,
    support_access_history: Vec<SupportAccessHistoryEntry>,
    sessions: Vec<AccountSessionEntry>,
    runtime_backups: RuntimeBackupsResponse,
    runtime_restore_drills: RuntimeRestoreDrillsResponse,
    runtime_updates: RuntimeUpdatesResponse,
    runtime_deployment: Option<RuntimeDeploymentResponse>,
    operational_guidance: Option<RuntimeOperationalGuidanceResponse>,
    recent_messages: Vec<AFPMessage>,
    thread_summaries: Vec<DashboardThreadSummary>,
    thread_retrieval_state: Option<Value>,
    action_log: Vec<ActionAuditEntry>,
) -> DashboardExportResponse {
    let export_scope = DashboardExportScopeResponse {
        includes: vec![
            "account profile and managed agents".to_string(),
            "current billing and cost status".to_string(),
            "recent workspace messages and thread summaries".to_string(),
            "recent action log and continuity state".to_string(),
            "onboarding, support access, and account sessions".to_string(),
            "runtime deployment, backups, restore drills, and updates".to_string(),
            "device sync policies and runtime summaries".to_string(),
        ],
        excludes: vec![
            "full historical mailbox or calendar provider archives".to_string(),
            "every private attachment blob and object-store file".to_string(),
            "plaintext secrets, API keys, and live runtime credentials".to_string(),
            "all third-party provider records outside OmnyID-managed export surfaces".to_string(),
            "guaranteed full backup-grade restore coverage".to_string(),
        ],
        recent_message_count: recent_messages.len(),
        thread_summary_count: thread_summaries.len(),
        action_log_count: action_log.len(),
        session_count: sessions.len(),
    };
    DashboardExportResponse {
        exported_at: chrono::Utc::now().to_rfc3339(),
        export_version: "omnyid-dashboard-export-v1".to_string(),
        export_scope,
        user,
        agents,
        cost_snapshot,
        cost_status,
        workflow_runtime_summary,
        browser_runtime_summary,
        task_runtime_summary,
        calendar_runtime_summary,
        trust_runtime_summary,
        file_runtime_summary,
        inbox_runtime_summary,
        device_sync_runtime_summary,
        simulator_runtime_summary,
        continuity_state: continuity.continuity_state,
        continuity_brief: continuity.continuity_brief,
        continuity_handoff: continuity.continuity_handoff,
        continuity_surface_hint: continuity.continuity_surface_hint,
        continuity_requires_approval: continuity.continuity_requires_approval,
        continuity_panel_kind: continuity.continuity_panel_kind,
        continuity_primary_mode: continuity.continuity_primary_mode,
        continuity_priority_item: continuity.continuity_priority_item,
        continuity_priority_card: continuity.continuity_priority_card,
        continuity_action_items: continuity.continuity_action_items,
        continuity_action_overflow_count: continuity.continuity_action_overflow_count,
        continuity_action_overflow_summary: continuity.continuity_action_overflow_summary,
        continuity_response_items: continuity.continuity_response_items,
        continuity_prepared_draft_items: continuity.continuity_prepared_draft_items,
        continuity_context_panel_items: continuity.continuity_context_panel_items,
        continuity_context_pack_items: continuity.continuity_context_pack_items,
        continuity_state_fields: continuity.continuity_state_fields,
        onboarding,
        device_sync_policies,
        support_access,
        support_access_history,
        sessions,
        runtime_backups,
        runtime_restore_drills,
        runtime_updates,
        runtime_deployment,
        operational_guidance,
        recent_messages,
        thread_summaries,
        thread_retrieval_state,
        action_log,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::agent_personas::AgentPersona;
    use crate::proactive_outcome_memory::HeuristicOutcomeFeedback;
    use crate::server::continuity_routes::continuity_brief_from_state;
    use crate::state_snapshot::{
        StateSnapshotCommitment, StateSnapshotContent, StateSnapshotCriticalChange,
        StateSnapshotDecisionItem,
    };
    use crate::state_synthesizer_contract::SynthesizerToMasterHandoff;

    fn sample_persona() -> AgentPersona {
        AgentPersona {
            id: "persona_1".to_string(),
            owner_user_id: "user_01".to_string(),
            name: "Concise".to_string(),
            soul_md: "Keep it brief.".to_string(),
            writing_style: "concise".to_string(),
            skills_json: serde_json::json!([]),
            lora_confidence_score: 0.0,
            lora_genome_active: false,
            is_active: true,
            created_at: "2026-06-03T00:00:00Z".to_string(),
            updated_at: "2026-06-03T00:00:00Z".to_string(),
        }
    }

    #[test]
    fn preferred_continuity_state_prefers_snapshot_then_falls_back() {
        let summary_with_snapshot = DashboardContinuityStateResponse {
            latest_state_snapshot_ref: Some("snapshot_1".to_string()),
            latest_state_synthesis_ref: Some("synthesis_1".to_string()),
            latest_state_snapshot: Some(DashboardContinuityMessage {
                id: "snapshot_1".to_string(),
                thread_id: "continuity:state:user_01".to_string(),
                timestamp: "2026-06-03T10:00:00Z".to_string(),
                r#type: "state_snapshot".to_string(),
                subtype: "homepage_briefing".to_string(),
                content: serde_json::json!({}),
                parsed_content: None,
                synthesizer_handoff: None,
                metadata: serde_json::json!({}),
                views: serde_json::json!([]),
            }),
            latest_state_synthesis: Some(DashboardContinuityMessage {
                id: "synthesis_1".to_string(),
                thread_id: "continuity:state:user_01".to_string(),
                timestamp: "2026-06-03T09:00:00Z".to_string(),
                r#type: "state_synthesis".to_string(),
                subtype: "".to_string(),
                content: serde_json::json!({}),
                parsed_content: None,
                synthesizer_handoff: None,
                metadata: serde_json::json!({}),
                views: serde_json::json!([]),
            }),
            preferred_state_type: "state_snapshot".to_string(),
            preferred_state_brief: None,
            preferred_synthesizer_handoff: None,
            preferred_priority_item: None,
            preferred_priority_card: None,
            preferred_action_items: Vec::new(),
            preferred_action_overflow_count: 0,
            preferred_action_overflow_summary: None,
            preferred_response_items: Vec::new(),
            preferred_prepared_draft_items: Vec::new(),
            preferred_context_panel_items: Vec::new(),
            preferred_context_pack_items: Vec::new(),
            preferred_state_fields: Vec::new(),
        };
        let preferred = preferred_continuity_state_message(&summary_with_snapshot)
            .expect("snapshot should be preferred when present");
        assert_eq!(preferred.id, "snapshot_1");

        let summary_without_snapshot = DashboardContinuityStateResponse {
            latest_state_snapshot_ref: None,
            latest_state_synthesis_ref: Some("synthesis_1".to_string()),
            latest_state_snapshot: None,
            latest_state_synthesis: Some(DashboardContinuityMessage {
                id: "synthesis_1".to_string(),
                thread_id: "continuity:state:user_01".to_string(),
                timestamp: "2026-06-03T09:00:00Z".to_string(),
                r#type: "state_synthesis".to_string(),
                subtype: "".to_string(),
                content: serde_json::json!({}),
                parsed_content: None,
                synthesizer_handoff: None,
                metadata: serde_json::json!({}),
                views: serde_json::json!([]),
            }),
            preferred_state_type: "state_synthesis".to_string(),
            preferred_state_brief: None,
            preferred_synthesizer_handoff: None,
            preferred_priority_item: None,
            preferred_priority_card: None,
            preferred_action_items: Vec::new(),
            preferred_action_overflow_count: 0,
            preferred_action_overflow_summary: None,
            preferred_response_items: Vec::new(),
            preferred_prepared_draft_items: Vec::new(),
            preferred_context_panel_items: Vec::new(),
            preferred_context_pack_items: Vec::new(),
            preferred_state_fields: Vec::new(),
        };
        let fallback = preferred_continuity_state_message(&summary_without_snapshot)
            .expect("legacy synthesis should be used as fallback");
        assert_eq!(fallback.id, "synthesis_1");
    }

    #[test]
    fn dashboard_bootstrap_selector_trims_after_outcome_reprioritization() {
        let feedback = vec![HeuristicOutcomeFeedback {
            heuristic_id: "simulator-review:bootstrap-exact".to_string(),
            total: 8,
            accepted: 6,
            acceptance_rate: 0.75,
            status: "trusted".to_string(),
            scope: "exact".to_string(),
            suggested_suppression_hours: None,
            suggested_half_life_days: 30,
            adaptation_reason: None,
            threshold_delta: None,
            sample_count: None,
            adaptation_signals: Vec::new(),
        }];
        let suggestions = vec![
            serde_json::json!({
                "id": "fresh-ordinary",
                "content": {
                    "heuristic_id": "fresh-ordinary"
                }
            }),
            serde_json::json!({
                "id": "simulator-bootstrap-exact",
                "content": {
                    "kind": "simulator_approval_preview",
                    "heuristic_id": "simulator-review:bootstrap-exact"
                }
            }),
            serde_json::json!({
                "id": "ordinary-bootstrap-exact",
                "content": {
                    "heuristic_id": "simulator-review:bootstrap-exact"
                }
            }),
        ];

        let selected = select_dashboard_bootstrap_proactive_suggestions(
            suggestions,
            &feedback,
            &AgentPreferences::default(),
            1,
        );

        assert_eq!(selected.len(), 1);
        assert_eq!(
            selected[0]["id"].as_str(),
            Some("simulator-bootstrap-exact")
        );
    }

    #[test]
    fn preferred_continuity_state_returns_none_when_no_state_messages_exist() {
        let empty_summary = DashboardContinuityStateResponse {
            latest_state_snapshot_ref: None,
            latest_state_synthesis_ref: None,
            latest_state_snapshot: None,
            latest_state_synthesis: None,
            preferred_state_type: "none".to_string(),
            preferred_state_brief: None,
            preferred_synthesizer_handoff: None,
            preferred_priority_item: None,
            preferred_priority_card: None,
            preferred_action_items: Vec::new(),
            preferred_action_overflow_count: 0,
            preferred_action_overflow_summary: None,
            preferred_response_items: Vec::new(),
            preferred_prepared_draft_items: Vec::new(),
            preferred_context_panel_items: Vec::new(),
            preferred_context_pack_items: Vec::new(),
            preferred_state_fields: Vec::new(),
        };

        assert!(preferred_continuity_state_message(&empty_summary).is_none());
    }

    #[test]
    fn continuity_brief_uses_typed_snapshot_payload() {
        let state = DashboardContinuityMessage {
            id: "snapshot_1".to_string(),
            thread_id: "continuity:state:user_01".to_string(),
            timestamp: "2026-06-03T10:00:00Z".to_string(),
            r#type: "state_snapshot".to_string(),
            subtype: "homepage_briefing".to_string(),
            content: serde_json::json!({}),
            parsed_content: Some(DashboardContinuityParsedContent::StateSnapshot(
                StateSnapshotContent {
                    snapshot_kind: "homepage_briefing".to_string(),
                    time_window: "today".to_string(),
                    sources: vec!["calendar:today".to_string()],
                    decision_queue: vec![StateSnapshotDecisionItem::default()],
                    response_queue: Vec::new(),
                    active_commitments: vec![StateSnapshotCommitment::default()],
                    critical_changes: vec![StateSnapshotCriticalChange::default()],
                    context_panel_items: Vec::new(),
                    watcher_signals: Vec::new(),
                    continuity_metrics: Default::default(),
                    suggested_actions: vec!["Review your schedule".to_string()],
                    confidence_notes: vec![],
                    state_fields: Vec::new(),
                    prepared_context_packet: None,
                    prepared_draft_packet: None,
                    staleness_at: "2026-06-03T12:00:00Z".to_string(),
                },
            )),
            synthesizer_handoff: None,
            metadata: serde_json::json!({}),
            views: serde_json::json!([]),
        };

        let brief = continuity_brief_from_state(Some(&state)).expect("brief should be derived");
        assert_eq!(brief.source_type, "state_snapshot");
        assert_eq!(brief.title, "Review your schedule");
        assert_eq!(brief.decision_count, 1);
        assert_eq!(brief.commitment_count, 1);
        assert_eq!(brief.critical_change_count, 1);
    }

    #[test]
    fn build_dashboard_continuity_payload_uses_shared_summary_fields() {
        let continuity_state = DashboardContinuityMessage {
            id: "snapshot_1".to_string(),
            thread_id: "continuity:state:user_01".to_string(),
            timestamp: "2026-06-03T10:00:00Z".to_string(),
            r#type: "state_snapshot".to_string(),
            subtype: "homepage_briefing".to_string(),
            content: serde_json::json!({}),
            parsed_content: None,
            synthesizer_handoff: None,
            metadata: serde_json::json!({}),
            views: serde_json::json!([]),
        };
        let continuity_summary = DashboardContinuityStateResponse {
            latest_state_snapshot_ref: Some("snapshot_1".to_string()),
            latest_state_synthesis_ref: Some("synthesis_1".to_string()),
            latest_state_snapshot: Some(continuity_state.clone()),
            latest_state_synthesis: None,
            preferred_state_type: "state_snapshot".to_string(),
            preferred_state_brief: Some(DashboardContinuityBrief {
                source_type: "state_snapshot".to_string(),
                title: "Review your schedule".to_string(),
                decision_count: 1,
                commitment_count: 2,
                critical_change_count: 0,
                suggested_actions: vec!["Review your schedule".to_string()],
                staleness_at: Some("2026-06-03T12:00:00Z".to_string()),
            }),
            preferred_synthesizer_handoff: None,
            preferred_priority_item: None,
            preferred_priority_card: None,
            preferred_action_items: Vec::new(),
            preferred_action_overflow_count: 0,
            preferred_action_overflow_summary: None,
            preferred_response_items: Vec::new(),
            preferred_prepared_draft_items: Vec::new(),
            preferred_context_panel_items: Vec::new(),
            preferred_context_pack_items: Vec::new(),
            preferred_state_fields: Vec::new(),
        };

        let payload = build_dashboard_continuity_payload(continuity_summary, None);
        assert_eq!(
            payload
                .continuity_state
                .as_ref()
                .map(|state| state.id.as_str()),
            Some("snapshot_1")
        );
        assert_eq!(
            payload
                .continuity_brief
                .as_ref()
                .map(|brief| brief.title.as_str()),
            Some("Review your schedule")
        );
        assert!(payload.continuity_handoff.is_none());
        assert_eq!(payload.continuity_surface_hint, None);
        assert!(!payload.continuity_requires_approval);
        assert_eq!(payload.continuity_panel_kind, "briefing_bar");
        assert_eq!(payload.continuity_primary_mode, "briefing_bar");
        assert!(payload.continuity_priority_item.is_none());
        assert!(payload.continuity_priority_card.is_none());
    }

    #[test]
    fn dashboard_continuity_payload_restyles_user_facing_copy_for_active_persona() {
        let payload = DashboardContinuityPayload {
            continuity_state: None,
            continuity_brief: Some(DashboardContinuityBrief {
                source_type: "state_snapshot".to_string(),
                title: "Review your schedule".to_string(),
                decision_count: 1,
                commitment_count: 1,
                critical_change_count: 0,
                suggested_actions: vec!["Review your schedule".to_string()],
                staleness_at: None,
            }),
            continuity_handoff: None,
            continuity_surface_hint: Some("decision_queue".to_string()),
            continuity_requires_approval: true,
            continuity_panel_kind: "approval_queue".to_string(),
            continuity_primary_mode: "priority_card".to_string(),
            continuity_priority_item: Some(ContinuityPriorityItem {
                title: "Review your schedule".to_string(),
                panel_kind: "approval_queue".to_string(),
                requires_approval: true,
                surface_hint: Some("decision_queue".to_string()),
                suggested_action: Some("Review your schedule".to_string()),
                confidence: Some("medium".to_string()),
                prepared_draft_class: None,
                selection_reason: Some("Requires explicit approval.".to_string()),
                source_refs: Vec::new(),
                memory_space: None,
                author_mask: None,
                author_type: None,
                author_id: None,
                is_human_authored: None,
                human_only: None,
            }),
            continuity_priority_card: Some(ContinuityPriorityCard {
                title: "Review your schedule".to_string(),
                description: "Requires explicit approval.".to_string(),
                panel_kind: "approval_queue".to_string(),
                requires_approval: true,
                action_label: "Review your schedule".to_string(),
                surface_hint: Some("decision_queue".to_string()),
                confidence: Some("medium".to_string()),
                prepared_draft_class: None,
                selection_reason: Some("Approval is still in the loop.".to_string()),
                approval_or_reversibility_hint: Some("You can approve or hold it.".to_string()),
                provenance_cue: None,
                autonomy_tier: None,
                retrieval_mode: None,
                deeper_retrieval_recommended: false,
                readiness_reason: None,
                topology_budget_used: 0,
                working_set_count: 0,
                active_topic_count: 0,
                working_set_refs: Vec::new(),
                active_topic_refs: Vec::new(),
                decision_history_refs: Vec::new(),
                project_refs: Vec::new(),
                thread_refs: Vec::new(),
                linked_target_label: None,
                source_refs: Vec::new(),
                object_refs: Vec::new(),
                object_labels: Vec::new(),
                file_refs: Vec::new(),
                file_labels: Vec::new(),
                thread_retrieval_state: None,
                autonomy_decision: None,
                memory_space: None,
                author_mask: None,
                author_type: None,
                author_id: None,
                is_human_authored: None,
                human_only: None,
            }),
            continuity_action_items: vec![ContinuityActionItem {
                id: "action_1".to_string(),
                title: "Reply to supplier".to_string(),
                category: "response".to_string(),
                urgency: "today".to_string(),
                confidence: "high".to_string(),
                requires_approval: false,
                suggested_action: "Reply in thread".to_string(),
                surface_hint: Some("response_queue".to_string()),
                autonomy_decision: None,
                source_refs: Vec::new(),
                memory_space: None,
                author_mask: None,
                author_type: None,
                author_id: None,
                is_human_authored: None,
                human_only: None,
            }],
            continuity_action_overflow_count: 1,
            continuity_action_overflow_summary: Some("1 more item is waiting.".to_string()),
            continuity_response_items: vec![ContinuityResponseItem {
                id: "resp_1".to_string(),
                title: "Reply to supplier".to_string(),
                channel: "email".to_string(),
                urgency: "today".to_string(),
                confidence: "high".to_string(),
                response_due_hint: "Today".to_string(),
                suggested_action: "Reply in thread".to_string(),
                autonomy_decision: None,
                prepared_draft_id: None,
                prepared_draft_summary: Some("Prepared an email reply draft.".to_string()),
                prepared_draft_readiness: None,
                prepared_draft_body: None,
                prepared_draft_class: None,
                prepared_draft_selection_reason: None,
                prepared_draft_available: false,
                prepared_draft_requires_approval: false,
                prepared_draft_autonomy_decision: None,
                prepared_draft_lead_summary: None,
                prepared_draft_summary_lines: vec!["Prepared an email reply draft.".to_string()],
                prepared_draft_object_refs: Vec::new(),
                prepared_draft_object_labels: Vec::new(),
                prepared_draft_thread_retrieval_state: None,
                source_refs: Vec::new(),
            }],
            continuity_prepared_draft_items: Vec::new(),
            continuity_context_panel_items: Vec::new(),
            continuity_context_pack_items: Vec::new(),
            continuity_state_fields: vec![ContinuityStateFieldItem {
                field_key: "approval_required_work".to_string(),
                label: "Approval required work".to_string(),
                status: "active".to_string(),
                confidence: "high".to_string(),
                surface_hint: "decision_queue".to_string(),
                recommended_action: "Review the pending approval".to_string(),
                autonomy_level: "human_review".to_string(),
                reason: "Prepared support is already available".to_string(),
                evidence_refs: Vec::new(),
            }],
        };

        let styled = style_dashboard_continuity_payload(payload, Some(&sample_persona()));

        assert_eq!(
            styled
                .continuity_brief
                .as_ref()
                .and_then(|brief| brief.suggested_actions.first())
                .map(String::as_str),
            Some("Briefly: Review your schedule")
        );
        assert_eq!(
            styled
                .continuity_priority_item
                .as_ref()
                .and_then(|item| item.suggested_action.as_deref()),
            Some("Briefly: Review your schedule")
        );
        assert_eq!(
            styled
                .continuity_priority_card
                .as_ref()
                .map(|card| card.description.as_str()),
            Some("Briefly: Requires explicit approval.")
        );
        assert_eq!(
            styled
                .continuity_action_items
                .first()
                .map(|item| item.suggested_action.as_str()),
            Some("Briefly: Reply in thread")
        );
        assert_eq!(
            styled.continuity_action_overflow_summary.as_deref(),
            Some("Briefly: 1 more item is waiting.")
        );
        assert_eq!(
            styled
                .continuity_response_items
                .first()
                .and_then(|item| item.prepared_draft_summary.as_deref()),
            Some("Briefly: Prepared an email reply draft.")
        );
        assert_eq!(
            styled
                .continuity_state_fields
                .first()
                .map(|item| item.reason.as_str()),
            Some("Briefly: Prepared support is already available")
        );
    }

    #[test]
    fn build_dashboard_export_response_preserves_continuity_payload() {
        let task_summary = TaskRuntimeSummary {
            active_draft_task_count: 1,
            cancelled_draft_task_count: 0,
            total_draft_task_count: 1,
            latest_draft_task_id: Some("draft_task_1".to_string()),
            latest_draft_task_title: Some("Review MSA".to_string()),
            latest_draft_task_status: Some("draft".to_string()),
            latest_draft_task_thread_id: Some("thread_1".to_string()),
            latest_draft_task_action_message_id: Some("msg_draft_action_1".to_string()),
        };
        let calendar_summary = CalendarRuntimeSummary {
            tentative_hold_count: 1,
            confirmed_event_count: 0,
            latest_tentative_event_id: Some("event_1".to_string()),
            latest_tentative_thread_id: Some("thread_calendar_1".to_string()),
            latest_tentative_action_message_id: Some("msg_calendar_action_1".to_string()),
            latest_tentative_title: Some("Hold for review".to_string()),
            next_tentative_start_at: Some("2026-06-04T09:00:00Z".to_string()),
            latest_tentative_location: Some("Boardroom".to_string()),
            latest_tentative_note_kind: Some("high_stakes_prep".to_string()),
            latest_tentative_prep_lead_minutes: Some(60),
            latest_tentative_profile: Some(serde_json::json!({
                "schedule_anchor_type": "meeting",
                "schedule_note_kind": "high_stakes_prep",
                "prep_lead_minutes": 60,
            })),
        };
        let inbox_summary = InboxRuntimeSummary {
            active_staged_organization_count: 1,
            staged_organization_count: 1,
            reverted_organization_count: 0,
            latest_provider: Some("gmail".to_string()),
            latest_conversation_ref: Some("thread:gmail:aurora".to_string()),
            latest_action_message_id: Some("msg_action_1".to_string()),
            latest_action_thread_id: Some("thread_inbox_1".to_string()),
            latest_activity: Some("inbox_organization_state".to_string()),
        };
        let device_sync_summary = DeviceSyncRuntimeSummary {
            device_policy_count: 2,
            used_device_count: 1,
            local_key_device_count: 1,
            desktop_device_count: 1,
            mobile_device_count: 1,
            watch_device_count: 0,
            latest_device_id: Some("desktop-user01".to_string()),
            latest_device_class: Some("desktop".to_string()),
            latest_policy_profile: Some("full".to_string()),
            latest_last_used_at: Some("2026-06-03T11:00:00Z".to_string()),
            latest_policy_note: Some("Keep desktop sync fully provisioned.".to_string()),
        };
        let continuity = DashboardContinuityPayload {
            continuity_state: Some(DashboardContinuityMessage {
                id: "snapshot_1".to_string(),
                thread_id: "continuity:state:user_01".to_string(),
                timestamp: "2026-06-03T10:00:00Z".to_string(),
                r#type: "state_snapshot".to_string(),
                subtype: "homepage_briefing".to_string(),
                content: serde_json::json!({}),
                parsed_content: None,
                synthesizer_handoff: None,
                metadata: serde_json::json!({}),
                views: serde_json::json!([]),
            }),
            continuity_brief: Some(DashboardContinuityBrief {
                source_type: "state_snapshot".to_string(),
                title: "Review your schedule".to_string(),
                decision_count: 1,
                commitment_count: 2,
                critical_change_count: 0,
                suggested_actions: vec!["Review your schedule".to_string()],
                staleness_at: Some("2026-06-03T12:00:00Z".to_string()),
            }),
            continuity_handoff: Some(SynthesizerToMasterHandoff {
                snapshot_ref: "snapshot_1".to_string(),
                view_id: "homepage:state:user_01".to_string(),
                confidence: "medium".to_string(),
                surface_recommendation: "decision_queue".to_string(),
                suggested_mood: None,
                suggested_next_actions: vec!["Review your schedule".to_string()],
                escalation_required: true,
                approval_boundary: None,
                autonomy_decision: None,
                browser_action_candidate: None,
                prepared_context_ready: false,
                prepared_context_summary: None,
                prepared_draft_ready: false,
                prepared_draft_summary: None,
                follow_up_write_candidate: None,
                decrypt_trace: None,
                simulated_projection_ready: false,
                simulated_projection_summary: None,
                simulated_projection_risks: Vec::new(),
                simulated_projection_opportunities: Vec::new(),
                simulated_actionable_event_count: None,
                simulated_review_surfaces_ready: false,
                simulated_rollout_stage: None,
                simulated_calibration_mode: None,
                simulated_review_summary: None,
                simulated_calibration_notes: Vec::new(),
                simulated_promotion_candidate_count: None,
                field_engine_ready: false,
                field_engine_primary_type: None,
                field_engine_summary: None,
                field_engine_risks: Vec::new(),
                field_engine_opportunities: Vec::new(),
                empathy_context: None,
            }),
            continuity_surface_hint: Some("decision_queue".to_string()),
            continuity_requires_approval: true,
            continuity_panel_kind: "approval_queue".to_string(),
            continuity_primary_mode: "priority_card".to_string(),
            continuity_priority_item: Some(ContinuityPriorityItem {
                title: "Review your schedule".to_string(),
                panel_kind: "approval_queue".to_string(),
                requires_approval: true,
                surface_hint: Some("decision_queue".to_string()),
                suggested_action: Some("Review your schedule".to_string()),
                confidence: Some("medium".to_string()),
                prepared_draft_class: None,
                selection_reason: None,
                source_refs: vec!["msg_1".to_string()],
                memory_space: None,
                author_mask: None,
                author_type: None,
                author_id: None,
                is_human_authored: None,
                human_only: None,
            }),
            continuity_priority_card: Some(ContinuityPriorityCard {
                title: "Review your schedule".to_string(),
                description: "Review your schedule requires explicit approval.".to_string(),
                panel_kind: "approval_queue".to_string(),
                requires_approval: true,
                action_label: "Review your schedule".to_string(),
                surface_hint: Some("decision_queue".to_string()),
                confidence: Some("medium".to_string()),
                prepared_draft_class: None,
                selection_reason: None,
                approval_or_reversibility_hint: None,
                provenance_cue: None,
                autonomy_tier: None,
                retrieval_mode: None,
                deeper_retrieval_recommended: false,
                readiness_reason: None,
                topology_budget_used: 0,
                working_set_count: 0,
                active_topic_count: 0,
                working_set_refs: Vec::new(),
                active_topic_refs: Vec::new(),
                decision_history_refs: Vec::new(),
                project_refs: Vec::new(),
                thread_refs: Vec::new(),
                linked_target_label: Some("Aurora rollout thread".to_string()),
                source_refs: vec!["msg_1".to_string()],
                object_refs: Vec::new(),
                object_labels: Vec::new(),
                file_refs: Vec::new(),
                file_labels: Vec::new(),
                thread_retrieval_state: None,
                autonomy_decision: None,
                memory_space: None,
                author_mask: None,
                author_type: None,
                author_id: None,
                is_human_authored: None,
                human_only: None,
            }),
            continuity_action_items: Vec::new(),
            continuity_action_overflow_count: 0,
            continuity_action_overflow_summary: None,
            continuity_response_items: vec![ContinuityResponseItem {
                id: "resp_1".to_string(),
                title: "Reply to supplier".to_string(),
                channel: "email".to_string(),
                urgency: "today".to_string(),
                confidence: "high".to_string(),
                response_due_hint: "Today".to_string(),
                suggested_action: "Reply in thread".to_string(),
                autonomy_decision: None,
                prepared_draft_id: Some("draft:reply:msg_1".to_string()),
                prepared_draft_summary: Some(
                    "Prepared an email reply draft for review. Suggested timing: Today."
                        .to_string(),
                ),
                prepared_draft_readiness: Some("ready_now".to_string()),
                prepared_draft_body: Some("Thanks for sending this through.".to_string()),
                prepared_draft_class: Some("communication_reply".to_string()),
                prepared_draft_selection_reason: None,
                prepared_draft_available: true,
                prepared_draft_requires_approval: true,
                prepared_draft_autonomy_decision: None,
                prepared_draft_lead_summary: Some(
                    "Surfaced around linked object focus on project_aurora. Linked object focus centers on project aurora. The prepared draft is anchored in this object-linked thread neighborhood. Approval remains in the loop."
                        .to_string(),
                ),
                prepared_draft_summary_lines: vec![
                    "Surfaced around linked object focus on project_aurora. Linked object focus centers on project aurora. The prepared draft is anchored in this object-linked thread neighborhood. Approval remains in the loop.".to_string(),
                    "Object anchors: project aurora.".to_string(),
                    "Prepared an email reply draft for review. Suggested timing: Today.".to_string(),
                ],
                prepared_draft_object_refs: vec!["project_aurora".to_string()],
                prepared_draft_object_labels: vec!["project aurora".to_string()],
                prepared_draft_thread_retrieval_state: Some(serde_json::json!({
                    "summary": "Surfaced around linked object focus on project_aurora. Linked object focus centers on project aurora. The prepared draft is anchored in this object-linked thread neighborhood. Approval remains in the loop.",
                    "badges": ["object-linked", "draft-guided", "approval-sensitive"],
            })),
                source_refs: vec!["msg_1".to_string()],
            }],
            continuity_prepared_draft_items: Vec::new(),
            continuity_context_panel_items: Vec::new(),
            continuity_context_pack_items: vec![ContinuityPreparedContextPackItem {
                id: "topic_1".to_string(),
                pack_kind: "topic_pack".to_string(),
                title: "Aurora topic pack".to_string(),
                summary: "Bounded topic continuity across linked work.".to_string(),
                confidence: "high".to_string(),
                why_surfaced: "Surfaced from linked project continuity.".to_string(),
                retrieval_mode: None,
                deeper_retrieval_recommended: false,
                readiness_reason: None,
                topology_budget_used: 0,
                working_set_count: 0,
                active_topic_count: 0,
                anchor_refs: vec!["msg_1".to_string()],
                source_refs: vec!["msg_1".to_string(), "msg_2".to_string()],
                reference_refs: vec!["thread:aurora".to_string()],
                reference_labels: vec!["Aurora rollout thread".to_string()],
                object_refs: Vec::new(),
                object_labels: Vec::new(),
                file_refs: Vec::new(),
                file_labels: Vec::new(),
                evidence_kinds: vec!["reference".to_string(), "project".to_string()],
                thread_retrieval_state: None,
                memory_space: None,
                author_mask: None,
                author_type: None,
                author_id: None,
                is_human_authored: None,
                human_only: None,
            }],
            continuity_state_fields: Vec::new(),
        };

        let response = build_dashboard_export_response(
            SessionUserResponse {
                id: "user_01".to_string(),
                email: "user@example.com".to_string(),
                display_name: "User".to_string(),
                auth_provider: "password".to_string(),
            },
            Vec::new(),
            None,
            None,
            None,
            None,
            Some(task_summary),
            Some(calendar_summary),
            None,
            None,
            Some(inbox_summary),
            Some(device_sync_summary),
            Some(SimulatorRuntimeSummary {
                enabled_surface_count: 2,
                promotion_enabled_surface_count: 1,
                review_surface_count: 1,
                sampled_surface_count: 0,
                highest_rollout_stage: "review".to_string(),
                policy_posture_summary:
                    "Policy posture: review stage across 2 active surfaces; 1 promotion-enabled; 1 review surface; 0 sampled surfaces."
                        .to_string(),
                latest_observed_at: None,
                observed_rollout_stage: None,
                observed_calibration_mode: None,
                observed_projection_summary: None,
                observed_review_summary: None,
                observed_actionable_event_count: None,
                observed_promotion_candidate_count: None,
                observed_review_surface_count: None,
                observed_calibration_notes: Vec::new(),
                rollout_alignment_status: "policy_only".to_string(),
                rollout_alignment_summary:
                    "No observed simulator run has been recorded yet for the current review policy posture."
                        .to_string(),
                surfaces: vec![SimulatorRuntimeSurfaceSummary {
                    surface: "synthesizer".to_string(),
                    enabled: true,
                    allow_promotion: true,
                    probabilistic_sampling_enabled: false,
                    review_surfaces_enabled: true,
                    rollout_stage: "review".to_string(),
                    calibration_mode: "bounded_deterministic".to_string(),
                    policy_summary:
                        "Simulator preview stays bounded on synthesizer with review surfaces enabled."
                            .to_string(),
                    calibration_notes: vec![
                        "Deterministic bounded preview is active for this surface.".to_string(),
                        "Review surfaces stay available for bounded simulator previews."
                            .to_string(),
                    ],
                }],
            }),
            continuity,
            default_onboarding_for_user(&crate::db::UserRecord {
                id: "user_01".to_string(),
                email: "user@example.com".to_string(),
                password_hash: Some("hash".to_string()),
                auth_provider: "password".to_string(),
                google_sub: None,
                display_name: "User".to_string(),
                created_at: "2026-06-03T10:00:00Z".to_string(),
            }),
            DeviceSyncPoliciesResponse {
                entries: Vec::new(),
            },
            default_support_access_state_response(),
            Vec::new(),
            Vec::new(),
            RuntimeBackupsResponse {
                policy: RuntimeBackupPolicyResponse {
                    retention_days: 30,
                    storage_mode: "local".to_string(),
                    last_snapshot_at: None,
                    support_disabled_by_default: true,
                },
                entries: Vec::new(),
            },
            RuntimeRestoreDrillsResponse {
                entries: Vec::new(),
            },
            RuntimeUpdatesResponse {
                policy: RuntimeUpdatePolicyResponse {
                    update_channel: "stable".to_string(),
                    auto_apply: "manual".to_string(),
                    support_disabled_by_default: true,
                },
                current_version: "0.0.0".to_string(),
                latest_version: "0.0.0".to_string(),
                update_available: false,
                runtime_status: "idle".to_string(),
                framework: None,
                last_checked_at: None,
                last_applied_at: None,
                entries: Vec::new(),
                panel: None,
            },
            None,
            None,
            Vec::new(),
            Vec::new(),
            Some(serde_json::json!({
                "summary": "Top surfaced thread is still fresh in the current result window.",
                "badges": ["fresh-top-thread"],
            })),
            Vec::new(),
        );

        assert_eq!(
            response
                .continuity_state
                .as_ref()
                .map(|state| state.id.as_str()),
            Some("snapshot_1")
        );
        assert_eq!(
            response
                .continuity_brief
                .as_ref()
                .map(|brief| brief.title.as_str()),
            Some("Review your schedule")
        );
        assert_eq!(response.export_scope.recent_message_count, 0);
        assert_eq!(response.export_scope.session_count, 0);
        assert_eq!(
            response
                .simulator_runtime_summary
                .as_ref()
                .map(|summary| summary.highest_rollout_stage.as_str()),
            Some("review")
        );
        assert!(
            response
                .export_scope
                .includes
                .iter()
                .any(|entry| entry.contains("account sessions"))
        );
        assert!(
            response
                .export_scope
                .excludes
                .iter()
                .any(|entry| entry.contains("backup-grade"))
        );
        assert_eq!(
            response
                .continuity_handoff
                .as_ref()
                .map(|handoff| handoff.surface_recommendation.as_str()),
            Some("decision_queue")
        );
        assert_eq!(
            response.continuity_surface_hint.as_deref(),
            Some("decision_queue")
        );
        assert!(response.continuity_requires_approval);
        assert_eq!(response.continuity_panel_kind, "approval_queue");
        assert_eq!(response.continuity_primary_mode, "priority_card");
        assert_eq!(
            response
                .continuity_priority_item
                .as_ref()
                .map(|item| item.panel_kind.as_str()),
            Some("approval_queue")
        );
        assert_eq!(
            response
                .continuity_priority_card
                .as_ref()
                .map(|card| card.panel_kind.as_str()),
            Some("approval_queue")
        );
        assert_eq!(
            response
                .continuity_priority_card
                .as_ref()
                .and_then(|card| card.linked_target_label.as_deref()),
            Some("Aurora rollout thread")
        );
        assert_eq!(
            response
                .continuity_response_items
                .first()
                .and_then(|item| item.prepared_draft_lead_summary.as_deref()),
            Some(
                "Surfaced around linked object focus on project_aurora. Linked object focus centers on project aurora. The prepared draft is anchored in this object-linked thread neighborhood. Approval remains in the loop."
            )
        );
        assert_eq!(
            response
                .continuity_response_items
                .first()
                .map(|item| item.prepared_draft_summary_lines.len()),
            Some(3)
        );
        assert_eq!(
            response
                .continuity_context_pack_items
                .first()
                .map(|item| item.title.as_str()),
            Some("Aurora topic pack")
        );
        assert_eq!(
            response
                .continuity_context_pack_items
                .first()
                .and_then(|item| item.reference_labels.first())
                .map(String::as_str),
            Some("Aurora rollout thread")
        );
        assert_eq!(
            response
                .thread_retrieval_state
                .as_ref()
                .and_then(|state| state["badges"].as_array())
                .map(|badges| badges.iter().filter_map(Value::as_str).collect::<Vec<_>>()),
            Some(vec!["fresh-top-thread"])
        );
        assert_eq!(
            response
                .task_runtime_summary
                .as_ref()
                .and_then(|summary| summary.latest_draft_task_id.as_deref()),
            Some("draft_task_1")
        );
        assert_eq!(
            response
                .task_runtime_summary
                .as_ref()
                .and_then(|summary| summary.latest_draft_task_action_message_id.as_deref()),
            Some("msg_draft_action_1")
        );
        assert_eq!(
            response
                .calendar_runtime_summary
                .as_ref()
                .and_then(|summary| summary.latest_tentative_event_id.as_deref()),
            Some("event_1")
        );
        assert_eq!(
            response
                .calendar_runtime_summary
                .as_ref()
                .and_then(|summary| summary.latest_tentative_thread_id.as_deref()),
            Some("thread_calendar_1")
        );
        assert_eq!(
            response
                .calendar_runtime_summary
                .as_ref()
                .and_then(|summary| summary.latest_tentative_action_message_id.as_deref()),
            Some("msg_calendar_action_1")
        );
        assert_eq!(
            response
                .inbox_runtime_summary
                .as_ref()
                .and_then(|summary| summary.latest_action_message_id.as_deref()),
            Some("msg_action_1")
        );
        assert_eq!(
            response
                .inbox_runtime_summary
                .as_ref()
                .and_then(|summary| summary.latest_action_thread_id.as_deref()),
            Some("thread_inbox_1")
        );
        assert_eq!(
            response
                .device_sync_runtime_summary
                .as_ref()
                .and_then(|summary| summary.latest_device_id.as_deref()),
            Some("desktop-user01")
        );
        assert_eq!(
            response
                .device_sync_runtime_summary
                .as_ref()
                .map(|summary| summary.used_device_count),
            Some(1)
        );
    }

    #[test]
    fn build_dashboard_continuity_payload_falls_back_to_handoff_actions() {
        let continuity_summary = DashboardContinuityStateResponse {
            latest_state_snapshot_ref: Some("snapshot_1".to_string()),
            latest_state_synthesis_ref: None,
            latest_state_snapshot: None,
            latest_state_synthesis: None,
            preferred_state_type: "state_snapshot".to_string(),
            preferred_state_brief: Some(DashboardContinuityBrief {
                source_type: "state_snapshot".to_string(),
                title: "Review your schedule".to_string(),
                decision_count: 0,
                commitment_count: 1,
                critical_change_count: 0,
                suggested_actions: vec!["Review your schedule".to_string()],
                staleness_at: None,
            }),
            preferred_synthesizer_handoff: Some(SynthesizerToMasterHandoff {
                snapshot_ref: "snapshot_1".to_string(),
                view_id: "homepage:state:user_01".to_string(),
                confidence: "medium".to_string(),
                surface_recommendation: "decision_queue".to_string(),
                suggested_mood: None,
                suggested_next_actions: vec!["Review your schedule".to_string()],
                escalation_required: true,
                approval_boundary: None,
                autonomy_decision: None,
                browser_action_candidate: None,
                prepared_context_ready: false,
                prepared_context_summary: None,
                prepared_draft_ready: false,
                prepared_draft_summary: None,
                follow_up_write_candidate: None,
                decrypt_trace: None,
                simulated_projection_ready: false,
                simulated_projection_summary: None,
                simulated_projection_risks: Vec::new(),
                simulated_projection_opportunities: Vec::new(),
                simulated_actionable_event_count: None,
                simulated_review_surfaces_ready: false,
                simulated_rollout_stage: None,
                simulated_calibration_mode: None,
                simulated_review_summary: None,
                simulated_calibration_notes: Vec::new(),
                simulated_promotion_candidate_count: None,
                field_engine_ready: false,
                field_engine_primary_type: None,
                field_engine_summary: None,
                field_engine_risks: Vec::new(),
                field_engine_opportunities: Vec::new(),
                empathy_context: None,
            }),
            preferred_priority_item: None,
            preferred_priority_card: None,
            preferred_action_items: Vec::new(),
            preferred_action_overflow_count: 0,
            preferred_action_overflow_summary: None,
            preferred_response_items: Vec::new(),
            preferred_prepared_draft_items: Vec::new(),
            preferred_context_panel_items: Vec::new(),
            preferred_context_pack_items: Vec::new(),
            preferred_state_fields: Vec::new(),
        };

        let payload = build_dashboard_continuity_payload(continuity_summary, None);
        assert_eq!(payload.continuity_action_items.len(), 1);
        assert_eq!(
            payload.continuity_action_items[0].title,
            "Review your schedule"
        );
        assert_eq!(
            payload.continuity_action_items[0].source_refs,
            vec!["snapshot_1".to_string()]
        );
    }

    #[test]
    fn inbox_runtime_summary_counts_staged_and_reverted_artifacts() {
        let staged = serde_json::json!({
            "thread_id": "thread_inbox_1",
            "subtype": "inbox_organization_state",
            "content": {
                "organization_id": "inbox-org:1",
                "provider": "gmail",
                "conversation_ref": "thread:gmail:supplier-quote",
                "source_action_message_id": "msg_action_1"
            }
        });
        let reverted = serde_json::json!({
            "thread_id": "thread_inbox_1",
            "subtype": "inbox_organization_revert",
            "content": {
                "organization_id": "inbox-org:1",
                "provider": "gmail",
                "conversation_ref": "thread:gmail:supplier-quote",
                "source_action_message_id": "msg_action_1"
            }
        });

        let summary = build_inbox_runtime_summary_from_messages(&[staged], &[reverted]);

        assert_eq!(summary.active_staged_organization_count, 0);
        assert_eq!(summary.staged_organization_count, 1);
        assert_eq!(summary.reverted_organization_count, 1);
        assert_eq!(summary.latest_provider.as_deref(), Some("gmail"));
        assert_eq!(
            summary.latest_conversation_ref.as_deref(),
            Some("thread:gmail:supplier-quote")
        );
        assert_eq!(
            summary.latest_action_message_id.as_deref(),
            Some("msg_action_1")
        );
        assert_eq!(
            summary.latest_action_thread_id.as_deref(),
            Some("thread_inbox_1")
        );
        assert_eq!(
            summary.latest_activity.as_deref(),
            Some("inbox_organization_state")
        );
    }

    #[test]
    fn inbox_runtime_summary_keeps_unreverted_staged_organizations_active() {
        let staged = serde_json::json!({
            "thread_id": "thread_inbox_2",
            "subtype": "inbox_organization_state",
            "content": {
                "organization_id": "inbox-org:2",
                "provider": "gmail",
                "conversation_ref": "thread:gmail:customer-followup",
                "source_action_message_id": "msg_action_2"
            }
        });

        let summary = build_inbox_runtime_summary_from_messages(&[staged], &[]);

        assert_eq!(summary.active_staged_organization_count, 1);
        assert_eq!(summary.staged_organization_count, 1);
        assert_eq!(summary.reverted_organization_count, 0);
        assert_eq!(
            summary.latest_conversation_ref.as_deref(),
            Some("thread:gmail:customer-followup")
        );
        assert_eq!(
            summary.latest_action_message_id.as_deref(),
            Some("msg_action_2")
        );
        assert_eq!(
            summary.latest_action_thread_id.as_deref(),
            Some("thread_inbox_2")
        );
    }

    #[test]
    fn device_sync_runtime_summary_counts_provisioned_and_used_devices() {
        let summary = build_device_sync_runtime_summary(&[
            crate::db::SyncDevicePolicyRecord {
                device_id: "desktop-user01".to_string(),
                owner_user_id: "user_01".to_string(),
                agent_id: "agent_01".to_string(),
                device_class: "desktop".to_string(),
                policy_profile: "full".to_string(),
                sync_slices: serde_json::json!(["InboxSummaries"]),
                requires_local_key_material: true,
                notes_json: serde_json::json!({
                    "policy_note": "Keep desktop sync fully provisioned."
                }),
                last_bundle_at: "2026-06-18T09:00:00Z".to_string(),
                last_used_at: Some("2026-06-18T09:30:00Z".to_string()),
                created_at: "2026-06-18T09:00:00Z".to_string(),
                updated_at: "2026-06-18T09:30:00Z".to_string(),
            },
            crate::db::SyncDevicePolicyRecord {
                device_id: "mobile-user01".to_string(),
                owner_user_id: "user_01".to_string(),
                agent_id: "agent_01".to_string(),
                device_class: "mobile".to_string(),
                policy_profile: "balanced".to_string(),
                sync_slices: serde_json::json!(["InboxSummaries"]),
                requires_local_key_material: false,
                notes_json: serde_json::json!({
                    "policy_note": "Keep mobile sync lighter."
                }),
                last_bundle_at: "2026-06-18T08:00:00Z".to_string(),
                last_used_at: None,
                created_at: "2026-06-18T08:00:00Z".to_string(),
                updated_at: "2026-06-18T08:10:00Z".to_string(),
            },
        ]);

        assert_eq!(summary.device_policy_count, 2);
        assert_eq!(summary.used_device_count, 1);
        assert_eq!(summary.local_key_device_count, 1);
        assert_eq!(summary.desktop_device_count, 1);
        assert_eq!(summary.mobile_device_count, 1);
        assert_eq!(summary.watch_device_count, 0);
        assert_eq!(summary.latest_device_id.as_deref(), Some("desktop-user01"));
        assert_eq!(summary.latest_device_class.as_deref(), Some("desktop"));
        assert_eq!(summary.latest_policy_profile.as_deref(), Some("full"));
        assert_eq!(
            summary.latest_last_used_at.as_deref(),
            Some("2026-06-18T09:30:00Z")
        );
        assert_eq!(
            summary.latest_policy_note.as_deref(),
            Some("Keep desktop sync fully provisioned.")
        );
    }

    #[test]
    fn dashboard_bootstrap_priority_item_can_seed_proactive_ordering() {
        let continuity_summary = DashboardContinuityStateResponse {
            latest_state_snapshot_ref: Some("snapshot_1".to_string()),
            latest_state_synthesis_ref: None,
            latest_state_snapshot: Some(DashboardContinuityMessage {
                id: "snapshot_1".to_string(),
                thread_id: "continuity:state:user_01".to_string(),
                timestamp: "2026-06-03T10:00:00Z".to_string(),
                r#type: "state_snapshot".to_string(),
                subtype: "homepage_briefing".to_string(),
                content: serde_json::json!({}),
                parsed_content: Some(DashboardContinuityParsedContent::StateSnapshot(
                    crate::state_snapshot::StateSnapshotContent {
                        snapshot_kind: "homepage_briefing".to_string(),
                        time_window: "today".to_string(),
                        sources: vec!["thread:aurora".to_string()],
                        decision_queue: Vec::new(),
                        response_queue: vec![crate::state_snapshot::StateSnapshotResponseItem {
                            id: "rq_1".to_string(),
                            label: "Aurora rollout thread".to_string(),
                            channel: "chat".to_string(),
                            urgency: "today".to_string(),
                            confidence: "high".to_string(),
                            response_due_hint: "Today".to_string(),
                            source_refs: vec!["thread:aurora".to_string()],
                            suggested_next_action: "Reply in thread".to_string(),
                        }],
                        active_commitments: Vec::new(),
                        critical_changes: Vec::new(),
                        context_panel_items: Vec::new(),
                        watcher_signals: Vec::new(),
                        continuity_metrics: Default::default(),
                        suggested_actions: vec!["Approve the suggested action".to_string()],
                        confidence_notes: Vec::new(),
                        state_fields: Vec::new(),
                        prepared_context_packet: None,
                        prepared_draft_packet: None,
                        staleness_at: "2026-06-03T12:00:00Z".to_string(),
                    },
                )),
                synthesizer_handoff: None,
                metadata: serde_json::json!({}),
                views: serde_json::json!([]),
            }),
            latest_state_synthesis: None,
            preferred_state_type: "none".to_string(),
            preferred_state_brief: None,
            preferred_synthesizer_handoff: None,
            preferred_priority_item: Some(ContinuityPriorityItem {
                title: "Approve the suggested action".to_string(),
                panel_kind: "approval_queue".to_string(),
                requires_approval: true,
                surface_hint: Some("decision_queue".to_string()),
                suggested_action: Some("Approve the suggested action".to_string()),
                confidence: Some("medium".to_string()),
                prepared_draft_class: None,
                selection_reason: None,
                source_refs: vec!["thread:aurora".to_string()],
                memory_space: None,
                author_mask: None,
                author_type: None,
                author_id: None,
                is_human_authored: None,
                human_only: None,
            }),
            preferred_priority_card: Some(ContinuityPriorityCard {
                title: "Approve the suggested action".to_string(),
                description: "Approve the suggested action requires explicit approval.".to_string(),
                panel_kind: "approval_queue".to_string(),
                requires_approval: true,
                action_label: "Approve the suggested action".to_string(),
                surface_hint: Some("decision_queue".to_string()),
                confidence: Some("medium".to_string()),
                prepared_draft_class: None,
                selection_reason: None,
                approval_or_reversibility_hint: None,
                provenance_cue: None,
                autonomy_tier: None,
                retrieval_mode: None,
                deeper_retrieval_recommended: false,
                readiness_reason: None,
                topology_budget_used: 0,
                working_set_count: 0,
                active_topic_count: 0,
                working_set_refs: Vec::new(),
                active_topic_refs: Vec::new(),
                decision_history_refs: Vec::new(),
                project_refs: Vec::new(),
                thread_refs: Vec::new(),
                linked_target_label: None,
                source_refs: vec!["thread:aurora".to_string()],
                object_refs: Vec::new(),
                object_labels: Vec::new(),
                file_refs: Vec::new(),
                file_labels: Vec::new(),
                thread_retrieval_state: None,
                autonomy_decision: None,
                memory_space: None,
                author_mask: None,
                author_type: None,
                author_id: None,
                is_human_authored: None,
                human_only: None,
            }),
            preferred_action_items: Vec::new(),
            preferred_action_overflow_count: 0,
            preferred_action_overflow_summary: None,
            preferred_response_items: Vec::new(),
            preferred_prepared_draft_items: Vec::new(),
            preferred_context_panel_items: Vec::new(),
            preferred_context_pack_items: Vec::new(),
            preferred_state_fields: Vec::new(),
        };
        let continuity = build_dashboard_continuity_payload(continuity_summary, None);
        let seeded = crate::server::proactive_routes::prioritize_proactive_suggestions(
            vec![serde_json::json!({ "id": "suggestion_1" })],
            continuity.continuity_priority_item.as_ref(),
            continuity.continuity_priority_card.as_ref(),
            None,
            None,
            None,
            None,
            None,
        );

        assert_eq!(
            seeded.first().and_then(|item| item["kind"].as_str()),
            Some("continuity_priority")
        );
        assert_eq!(
            seeded
                .first()
                .and_then(|item| item["linked_target_label"].as_str()),
            Some("Aurora rollout thread")
        );
    }

    #[test]
    fn dashboard_bootstrap_context_pack_seed_preserves_reference_labels() {
        let continuity_summary = DashboardContinuityStateResponse {
            latest_state_snapshot_ref: None,
            latest_state_synthesis_ref: None,
            latest_state_snapshot: None,
            latest_state_synthesis: None,
            preferred_state_type: "none".to_string(),
            preferred_state_brief: None,
            preferred_synthesizer_handoff: None,
            preferred_priority_item: None,
            preferred_priority_card: None,
            preferred_action_items: Vec::new(),
            preferred_action_overflow_count: 0,
            preferred_action_overflow_summary: None,
            preferred_response_items: Vec::new(),
            preferred_prepared_draft_items: Vec::new(),
            preferred_context_panel_items: Vec::new(),
            preferred_context_pack_items: vec![ContinuityPreparedContextPackItem {
                id: "topic_1".to_string(),
                pack_kind: "topic_pack".to_string(),
                title: "Aurora topic pack".to_string(),
                summary: "Bounded topic continuity across linked work.".to_string(),
                confidence: "high".to_string(),
                why_surfaced: "Surfaced from linked project continuity.".to_string(),
                retrieval_mode: None,
                deeper_retrieval_recommended: false,
                readiness_reason: None,
                topology_budget_used: 0,
                working_set_count: 0,
                active_topic_count: 0,
                anchor_refs: vec!["msg_1".to_string()],
                source_refs: vec!["msg_1".to_string(), "msg_2".to_string()],
                reference_refs: vec!["thread:aurora".to_string()],
                reference_labels: vec!["Aurora rollout thread".to_string()],
                object_refs: Vec::new(),
                object_labels: Vec::new(),
                file_refs: Vec::new(),
                file_labels: Vec::new(),
                evidence_kinds: vec!["reference".to_string(), "project".to_string()],
                thread_retrieval_state: None,
                memory_space: None,
                author_mask: None,
                author_type: None,
                author_id: None,
                is_human_authored: None,
                human_only: None,
            }],
            preferred_state_fields: Vec::new(),
        };

        let continuity = build_dashboard_continuity_payload(continuity_summary, None);
        let seeded = crate::server::proactive_routes::prioritize_proactive_suggestions(
            vec![serde_json::json!({ "id": "suggestion_1" })],
            continuity.continuity_priority_item.as_ref(),
            continuity.continuity_priority_card.as_ref(),
            None,
            None,
            continuity
                .continuity_context_pack_items
                .first()
                .map(crate::server::proactive_routes::synthetic_context_pack_suggestion),
            None,
            None,
        );

        assert_eq!(
            seeded.first().and_then(|item| item["kind"].as_str()),
            Some("context_pack")
        );
        assert_eq!(
            seeded
                .first()
                .and_then(|item| item["reference_labels"].as_array())
                .map(|labels| labels.len()),
            Some(1)
        );
        assert_eq!(
            seeded
                .first()
                .and_then(|item| item["artifact_summary_lines"].as_array())
                .and_then(|lines| lines.get(1))
                .and_then(|line| line.as_str()),
            Some("Evidence: reference, project")
        );
        assert_eq!(
            seeded
                .first()
                .and_then(|item| item["artifact_summary_lines"].as_array())
                .and_then(|lines| lines.get(2))
                .and_then(|line| line.as_str()),
            Some("Linked objects: Aurora rollout thread")
        );
    }

    #[test]
    fn dashboard_bootstrap_prepared_draft_seed_prefers_file_linked_fallback_from_state() {
        let continuity_summary = DashboardContinuityStateResponse {
            latest_state_snapshot_ref: Some("snapshot_file_ranked_reply".to_string()),
            latest_state_synthesis_ref: None,
            latest_state_snapshot: Some(DashboardContinuityMessage {
                id: "snapshot_file_ranked_reply".to_string(),
                thread_id: "continuity:state:user_01".to_string(),
                timestamp: "2026-06-03T10:00:00Z".to_string(),
                r#type: "state_snapshot".to_string(),
                subtype: "homepage_briefing".to_string(),
                content: serde_json::json!({}),
                parsed_content: Some(DashboardContinuityParsedContent::StateSnapshot(
                    crate::state_snapshot::StateSnapshotContent {
                        snapshot_kind: "homepage_briefing".to_string(),
                        time_window: "today".to_string(),
                        sources: vec!["msg_file".to_string()],
                        decision_queue: Vec::new(),
                        response_queue: Vec::new(),
                        active_commitments: Vec::new(),
                        critical_changes: Vec::new(),
                        context_panel_items: Vec::new(),
                        watcher_signals: Vec::new(),
                        continuity_metrics: Default::default(),
                        suggested_actions: vec!["Reply in thread".to_string()],
                        confidence_notes: Vec::new(),
                        state_fields: Vec::new(),
                        prepared_context_packet: Some(crate::prepared_context_packet::PreparedContextPacket {
                            packet_kind: "continuity_context".to_string(),
                            ready: true,
                            summary: "Prepared context with file anchors.".to_string(),
                            anchor_refs: Vec::new(),
                            source_refs: vec!["msg_file".to_string()],
                            decision_refs: Vec::new(),
                            decision_history_refs: Vec::new(),
                            response_refs: Vec::new(),
                            follow_up_refs: Vec::new(),
                            relationship_refs: Vec::new(),
                            project_refs: Vec::new(),
                            reference_refs: Vec::new(),
                            object_refs: Vec::new(),
                            thread_refs: Vec::new(),
                            file_refs: vec!["file:docs/launch-brief.md".to_string()],
                            packs: Vec::new(),
                            decrypt_needed_count: 0,
                            memory_space: None,
                            author_mask: None,
                            author_type: None,
                            author_id: None,
                            is_human_authored: None,
                            human_only: None,
                            ..crate::prepared_context_packet::PreparedContextPacket::default()
                        }),
                        prepared_draft_packet: Some(crate::prepared_draft_packet::PreparedDraftPacket {
                            ready: true,
                            summary: "Prepared 2 communication reply drafts for review.".to_string(),
                            drafts: vec![
                                crate::prepared_draft_packet::PreparedDraftArtifact {
                                    draft_id: "draft:generic".to_string(),
                                    draft_class: "communication_reply".to_string(),
                                    label: "Reply today".to_string(),
                                    channel: "email".to_string(),
                                    summary: "Prepared an email reply draft for review. Suggested timing: Today.".to_string(),
                                    body: "Generic reply.".to_string(),
                                    confidence: "high".to_string(),
                                    readiness: "ready_now".to_string(),
                                    response_due_hint: "Today".to_string(),
                                    approval_required_to_send: false,
                                    source_refs: vec!["msg_plain".to_string()],
                                    source_count: 1,
                                    storage_type: "ledger".to_string(),
                                    storage_kind: Some("rich_note".to_string()),
                                    comparison_headers: Vec::new(),
                                    comparison_rows: Vec::new(),
                                    selection_reason: Some("Prepared support is ready.".to_string()),
                                    suggested_next_action: "Reply in thread".to_string(),
                                    object_refs: Vec::new(),
                                    memory_space: Some("work".to_string()),
                                    author_mask: Some("me".to_string()),
                                    author_type: Some("human".to_string()),
                                    author_id: Some("user_01".to_string()),
                                    is_human_authored: Some(true),
                                    human_only: Some(true),
                                },
                                crate::prepared_draft_packet::PreparedDraftArtifact {
                                    draft_id: "draft:file".to_string(),
                                    draft_class: "communication_reply".to_string(),
                                    label: "Reply today".to_string(),
                                    channel: "email".to_string(),
                                    summary: "Prepared an email reply draft for review. Suggested timing: Today.".to_string(),
                                    body: "File-linked reply.".to_string(),
                                    confidence: "high".to_string(),
                                    readiness: "ready_now".to_string(),
                                    response_due_hint: "Today".to_string(),
                                    approval_required_to_send: false,
                                    source_refs: vec!["msg_file".to_string()],
                                    source_count: 1,
                                    storage_type: "ledger".to_string(),
                                    storage_kind: Some("rich_note".to_string()),
                                    comparison_headers: Vec::new(),
                                    comparison_rows: Vec::new(),
                                    selection_reason: Some("Prepared support is ready.".to_string()),
                                    suggested_next_action: "Reply in thread".to_string(),
                                    object_refs: Vec::new(),
                                    memory_space: Some("work".to_string()),
                                    author_mask: Some("me".to_string()),
                                    author_type: Some("human".to_string()),
                                    author_id: Some("user_01".to_string()),
                                    is_human_authored: Some(true),
                                    human_only: Some(true),
                                },
                            ],
                        }),
                        staleness_at: "2026-06-03T12:00:00Z".to_string(),
                    },
                )),
                synthesizer_handoff: None,
                metadata: serde_json::json!({}),
                views: serde_json::json!([]),
            }),
            latest_state_synthesis: None,
            preferred_state_type: "state_snapshot".to_string(),
            preferred_state_brief: None,
            preferred_synthesizer_handoff: Some(SynthesizerToMasterHandoff {
                snapshot_ref: "snapshot_file_ranked_reply".to_string(),
                view_id: "homepage:state:user_01".to_string(),
                confidence: "high".to_string(),
                surface_recommendation: "response_queue".to_string(),
                suggested_mood: None,
                suggested_next_actions: vec!["Reply in thread".to_string()],
                escalation_required: false,
                approval_boundary: None,
                autonomy_decision: None,
                browser_action_candidate: None,
                prepared_context_ready: true,
                prepared_context_summary: Some("Prepared context with file anchors.".to_string()),
                prepared_draft_ready: true,
                prepared_draft_summary: Some("Prepared 2 communication reply drafts for review.".to_string()),
                follow_up_write_candidate: None,
                decrypt_trace: None,
                simulated_projection_ready: false,
                simulated_projection_summary: None,
                simulated_projection_risks: Vec::new(),
                simulated_projection_opportunities: Vec::new(),
                simulated_actionable_event_count: None,
                simulated_review_surfaces_ready: false,
                simulated_rollout_stage: None,
                simulated_calibration_mode: None,
                simulated_review_summary: None,
                simulated_calibration_notes: Vec::new(),
                simulated_promotion_candidate_count: None,
                field_engine_ready: false,
                field_engine_primary_type: None,
                field_engine_summary: None,
                field_engine_risks: Vec::new(),
                field_engine_opportunities: Vec::new(),
                empathy_context: None,
            }),
            preferred_priority_item: None,
            preferred_priority_card: None,
            preferred_action_items: Vec::new(),
            preferred_action_overflow_count: 0,
            preferred_action_overflow_summary: None,
            preferred_response_items: Vec::new(),
            preferred_prepared_draft_items: Vec::new(),
            preferred_context_panel_items: Vec::new(),
            preferred_context_pack_items: Vec::new(),
            preferred_state_fields: Vec::new(),
        };

        let continuity = build_dashboard_continuity_payload(continuity_summary, None);
        let seeded = build_dashboard_bootstrap_proactive_suggestions(
            Vec::new(),
            &continuity,
            &[],
            &AgentPreferences::default(),
            6,
        );

        assert_eq!(
            seeded.first().and_then(|item| item["kind"].as_str()),
            Some("prepared_draft")
        );
        assert_eq!(
            seeded.first().and_then(|item| item["id"].as_str()),
            Some("prepared-draft:draft:file")
        );
        assert_eq!(
            seeded
                .first()
                .and_then(|item| item["file_labels"].as_array())
                .and_then(|labels| labels.first())
                .and_then(|label| label.as_str()),
            Some("launch-brief.md")
        );
    }

    #[test]
    fn dashboard_cost_warning_can_promote_priority_card() {
        let continuity_summary = DashboardContinuityStateResponse {
            latest_state_snapshot_ref: None,
            latest_state_synthesis_ref: None,
            latest_state_snapshot: None,
            latest_state_synthesis: None,
            preferred_state_type: "none".to_string(),
            preferred_state_brief: None,
            preferred_synthesizer_handoff: None,
            preferred_priority_item: None,
            preferred_priority_card: None,
            preferred_action_items: Vec::new(),
            preferred_action_overflow_count: 0,
            preferred_action_overflow_summary: None,
            preferred_response_items: Vec::new(),
            preferred_prepared_draft_items: Vec::new(),
            preferred_context_panel_items: Vec::new(),
            preferred_context_pack_items: Vec::new(),
            preferred_state_fields: Vec::new(),
        };

        let payload = build_dashboard_continuity_payload(
            continuity_summary,
            Some(&DashboardCostStatus {
                level: "warning".to_string(),
                title: "Budget pressure is high".to_string(),
                detail: "You are over budget.".to_string(),
                action_label: "Open cost dashboard".to_string(),
            }),
        );

        assert_eq!(payload.continuity_panel_kind, "decision_queue");
        assert_eq!(payload.continuity_primary_mode, "priority_card");
        assert_eq!(
            payload
                .continuity_priority_item
                .as_ref()
                .map(|item| item.title.as_str()),
            Some("Budget pressure is high")
        );
        assert_eq!(
            payload
                .continuity_priority_card
                .as_ref()
                .map(|card| card.action_label.as_str()),
            Some("Open cost dashboard")
        );
    }

    #[test]
    fn trust_action_log_stats_counts_reversible_and_undo_ready_entries() {
        let action_log = vec![
            crate::db::ActionAuditEntry {
                capability_id: "cap_internal_file_bundle_stage".to_string(),
                thread_id: "thread_01".to_string(),
                status: "completed".to_string(),
                output: serde_json::json!({
                    "reversible": true,
                    "rollback_checkpoint_id": "checkpoint_1",
                }),
                external_reference: Some("msg_1".to_string()),
                recorded_at: "2026-06-18T10:00:00Z".to_string(),
                reversible_summary: Some(crate::db::ReversibleActionAuditSummary {
                    reversible: true,
                    undo_label: Some("Discard staged file bundle".to_string()),
                    action_message_id: Some("action_1".to_string()),
                    rollback_checkpoint_id: Some("checkpoint_1".to_string()),
                    provenance_record_id: Some("prov_1".to_string()),
                    side_effect_boundary: Some("internal_only".to_string()),
                }),
            },
            crate::db::ActionAuditEntry {
                capability_id: "cap_external_send".to_string(),
                thread_id: "thread_02".to_string(),
                status: "pending".to_string(),
                output: serde_json::json!({}),
                external_reference: Some("msg_2".to_string()),
                recorded_at: "2026-06-18T09:00:00Z".to_string(),
                reversible_summary: None,
            },
        ];

        let (
            pending_count,
            failed_count,
            successful_count,
            reversible_count,
            undo_ready_count,
            latest_status,
            latest_undo_label,
        ) = trust_action_log_stats(&action_log);

        assert_eq!(pending_count, 1);
        assert_eq!(failed_count, 0);
        assert_eq!(successful_count, 1);
        assert_eq!(reversible_count, 1);
        assert_eq!(undo_ready_count, 1);
        assert_eq!(latest_status.as_deref(), Some("completed"));
        assert_eq!(
            latest_undo_label.as_deref(),
            Some("Discard staged file bundle")
        );
    }

    #[test]
    fn trust_action_log_stats_excludes_checkpoints_already_consumed_by_completed_undo() {
        let action_log = vec![
            crate::db::ActionAuditEntry {
                capability_id: "cap_internal_file_bundle_stage".to_string(),
                thread_id: "thread_01".to_string(),
                status: "completed".to_string(),
                output: serde_json::json!({
                    "reversible": true,
                    "rollback_checkpoint_id": "checkpoint_1",
                }),
                external_reference: Some("msg_1".to_string()),
                recorded_at: "2026-06-18T10:00:00Z".to_string(),
                reversible_summary: Some(crate::db::ReversibleActionAuditSummary {
                    reversible: true,
                    undo_label: Some("Discard staged file bundle".to_string()),
                    action_message_id: Some("action_1".to_string()),
                    rollback_checkpoint_id: Some("checkpoint_1".to_string()),
                    provenance_record_id: Some("prov_1".to_string()),
                    side_effect_boundary: Some("internal_only".to_string()),
                }),
            },
            crate::db::ActionAuditEntry {
                capability_id: "cap_internal_file_bundle_stage:undo".to_string(),
                thread_id: "thread_01".to_string(),
                status: "completed".to_string(),
                output: serde_json::json!({
                    "checkpoint_message_id": "checkpoint_1",
                }),
                external_reference: Some("msg_undo".to_string()),
                recorded_at: "2026-06-18T10:05:00Z".to_string(),
                reversible_summary: None,
            },
            crate::db::ActionAuditEntry {
                capability_id: "cap_internal_draft_task:undo".to_string(),
                thread_id: "thread_02".to_string(),
                status: "failed".to_string(),
                output: serde_json::json!({
                    "checkpoint_message_id": "checkpoint_2",
                }),
                external_reference: Some("msg_failed_undo".to_string()),
                recorded_at: "2026-06-18T10:06:00Z".to_string(),
                reversible_summary: None,
            },
            crate::db::ActionAuditEntry {
                capability_id: "cap_internal_draft_task".to_string(),
                thread_id: "thread_02".to_string(),
                status: "completed".to_string(),
                output: serde_json::json!({
                    "reversible": true,
                    "rollback_checkpoint_id": "checkpoint_2",
                }),
                external_reference: Some("msg_2".to_string()),
                recorded_at: "2026-06-18T10:07:00Z".to_string(),
                reversible_summary: Some(crate::db::ReversibleActionAuditSummary {
                    reversible: true,
                    undo_label: Some("Remove draft task".to_string()),
                    action_message_id: Some("action_2".to_string()),
                    rollback_checkpoint_id: Some("checkpoint_2".to_string()),
                    provenance_record_id: Some("prov_2".to_string()),
                    side_effect_boundary: Some("internal_only".to_string()),
                }),
            },
        ];

        let (_, _, _, reversible_count, undo_ready_count, _, latest_undo_label) =
            trust_action_log_stats(&action_log);

        assert_eq!(reversible_count, 2);
        assert_eq!(undo_ready_count, 1);
        assert_eq!(
            latest_undo_label.as_deref(),
            Some("Discard staged file bundle")
        );
    }

    #[test]
    fn file_runtime_summary_counts_staged_file_bundles() {
        let summary = super::build_file_runtime_summary_from_messages(
            &[],
            &[],
            &[serde_json::json!({
                "id": "msg_bundle_1",
                "thread_id": "thread_bundle_1",
                "type": "ledger",
                "subtype": "file_bundle_stage",
                "content": {
                    "bundle_id": "file-bundle:1",
                    "file_names": ["msa.pdf", "security.docx"],
                    "status": "staged"
                }
            })],
            &[],
        );

        assert_eq!(summary.active_staged_bundle_count, 1);
        assert_eq!(summary.active_staged_bundle_file_count, 2);
        assert_eq!(summary.staged_bundle_count, 1);
        assert_eq!(summary.staged_bundle_file_count, 2);
        assert_eq!(summary.latest_action_message_id, None);
        assert_eq!(
            summary.latest_action_thread_id.as_deref(),
            Some("thread_bundle_1")
        );
        assert_eq!(
            summary.latest_reversible_message_id.as_deref(),
            Some("msg_bundle_1")
        );
        assert_eq!(
            summary.latest_reversible_thread_id.as_deref(),
            Some("thread_bundle_1")
        );
        assert_eq!(
            summary.latest_activity.as_deref(),
            Some("file_bundle_stage")
        );
    }

    #[test]
    fn file_runtime_summary_excludes_discarded_staged_bundles_from_active_counts() {
        let summary = super::build_file_runtime_summary_from_messages(
            &[],
            &[],
            &[serde_json::json!({
                "id": "msg_bundle_1",
                "thread_id": "thread_bundle_1",
                "type": "ledger",
                "subtype": "file_bundle_stage",
                "content": {
                    "bundle_id": "file-bundle:1",
                    "file_names": ["msa.pdf", "security.docx"],
                    "status": "staged"
                }
            })],
            &[serde_json::json!({
                "thread_id": "thread_bundle_1",
                "type": "ledger",
                "subtype": "file_bundle_stage_discard",
                "content": {
                    "bundle_id": "file-bundle:1",
                    "source_action_message_id": "msg_bundle_1",
                    "status": "discarded"
                }
            })],
        );

        assert_eq!(summary.active_staged_bundle_count, 0);
        assert_eq!(summary.active_staged_bundle_file_count, 0);
        assert_eq!(summary.staged_bundle_count, 1);
        assert_eq!(summary.discarded_bundle_count, 1);
        assert_eq!(
            summary.latest_action_message_id.as_deref(),
            Some("msg_bundle_1")
        );
        assert_eq!(
            summary.latest_action_thread_id.as_deref(),
            Some("thread_bundle_1")
        );
        assert_eq!(
            summary.latest_reversible_message_id.as_deref(),
            Some("msg_bundle_1")
        );
        assert_eq!(
            summary.latest_reversible_thread_id.as_deref(),
            Some("thread_bundle_1")
        );
        assert_eq!(
            summary.latest_activity.as_deref(),
            Some("file_bundle_stage_discard")
        );
    }

    #[test]
    fn file_runtime_summary_prefers_state_artifact_without_double_counting_bundle() {
        let summary = super::build_file_runtime_summary_from_messages(
            &[],
            &[],
            &[
                serde_json::json!({
                    "id": "msg_bundle_note_1",
                    "thread_id": "thread_bundle_1",
                    "type": "ledger",
                    "subtype": "file_bundle_stage",
                    "content": {
                        "bundle_id": "file-bundle:1",
                        "file_names": ["msa.pdf", "security.docx"],
                        "status": "staged"
                    }
                }),
                serde_json::json!({
                    "id": "msg_bundle_state_1",
                    "thread_id": "thread_bundle_1",
                    "type": "ledger",
                    "subtype": "file_bundle_stage_state",
                    "content": {
                        "bundle_id": "file-bundle:1",
                        "file_names": ["msa.pdf", "security.docx"],
                        "status": "staged",
                        "source_action_message_id": "msg_bundle_note_1"
                    }
                }),
            ],
            &[],
        );

        assert_eq!(summary.active_staged_bundle_count, 1);
        assert_eq!(summary.staged_bundle_count, 1);
        assert_eq!(summary.active_staged_bundle_file_count, 2);
        assert_eq!(summary.staged_bundle_file_count, 2);
        assert_eq!(
            summary.latest_action_message_id.as_deref(),
            Some("msg_bundle_note_1")
        );
        assert_eq!(
            summary.latest_action_thread_id.as_deref(),
            Some("thread_bundle_1")
        );
        assert_eq!(
            summary.latest_reversible_message_id.as_deref(),
            Some("msg_bundle_note_1")
        );
        assert_eq!(
            summary.latest_activity.as_deref(),
            Some("file_bundle_stage_state")
        );
    }

    #[test]
    fn task_runtime_summary_counts_active_and_cancelled_draft_tasks() {
        let summary = super::build_task_runtime_summary_from_tasks(&[
            serde_json::json!({
                "id": "task_1",
                "status": "pending",
                "intent": "Review renewal package",
                "thread_id": "thread_renewal",
                "plan_json": { "draft": true },
                "result_json": { "draft": true }
            }),
            serde_json::json!({
                "id": "task_2",
                "status": "cancelled",
                "intent": "Prepare vendor follow-up",
                "thread_id": "thread_vendor",
                "plan_json": { "draft": true },
                "result_json": { "draft": true }
            }),
            serde_json::json!({
                "id": "task_3",
                "status": "pending",
                "intent": "Non-draft work",
                "thread_id": "thread_other",
                "plan_json": { "draft": false },
                "result_json": {}
            }),
        ]);

        assert_eq!(summary.active_draft_task_count, 1);
        assert_eq!(summary.cancelled_draft_task_count, 1);
        assert_eq!(summary.total_draft_task_count, 2);
        assert_eq!(summary.latest_draft_task_id.as_deref(), Some("task_1"));
        assert_eq!(
            summary.latest_draft_task_title.as_deref(),
            Some("Review renewal package")
        );
        assert_eq!(summary.latest_draft_task_status.as_deref(), Some("pending"));
        assert_eq!(
            summary.latest_draft_task_thread_id.as_deref(),
            Some("thread_renewal")
        );
        assert!(summary.latest_draft_task_action_message_id.is_none());
    }

    #[test]
    fn calendar_runtime_summary_counts_tentative_holds() {
        let summary = super::build_calendar_runtime_summary_from_events(&[
            serde_json::json!({
                "id": "event_1",
                "title": "Hold for interview prep",
                "start_at": "2026-06-19T10:00:00Z",
                "status": "tentative",
                "location": "Video call",
                "profile": {
                    "schedule_anchor_type": "interview",
                    "schedule_note_kind": "high_stakes_prep",
                    "prep_lead_minutes": 60
                }
            }),
            serde_json::json!({
                "id": "event_2",
                "title": "Team sync",
                "start_at": "2026-06-20T09:00:00Z",
                "status": "confirmed"
            }),
        ]);

        assert_eq!(summary.tentative_hold_count, 1);
        assert_eq!(summary.confirmed_event_count, 1);
        assert_eq!(
            summary.latest_tentative_event_id.as_deref(),
            Some("event_1")
        );
        assert_eq!(
            summary.latest_tentative_title.as_deref(),
            Some("Hold for interview prep")
        );
        assert_eq!(
            summary.next_tentative_start_at.as_deref(),
            Some("2026-06-19T10:00:00Z")
        );
        assert_eq!(
            summary.latest_tentative_location.as_deref(),
            Some("Video call")
        );
        assert_eq!(
            summary.latest_tentative_note_kind.as_deref(),
            Some("high_stakes_prep")
        );
        assert_eq!(summary.latest_tentative_prep_lead_minutes, Some(60));
        assert_eq!(
            summary
                .latest_tentative_profile
                .as_ref()
                .and_then(|profile| profile.get("schedule_anchor_type"))
                .and_then(Value::as_str),
            Some("interview")
        );
        assert!(summary.latest_tentative_thread_id.is_none());
        assert!(summary.latest_tentative_action_message_id.is_none());
    }

    #[test]
    fn task_runtime_summary_attaches_latest_action_message_from_audit_log() {
        let summary = super::attach_task_runtime_reversible_refs(
            super::build_task_runtime_summary_from_tasks(&[serde_json::json!({
                "id": "task_1",
                "status": "pending",
                "intent": "Review renewal package",
                "thread_id": "thread_renewal",
                "plan_json": { "draft": true },
                "result_json": { "draft": true }
            })]),
            &[crate::db::ActionAuditEntry {
                capability_id: crate::reversible_actions::REVERSIBLE_CAPABILITY_DRAFT_TASK_CREATE
                    .to_string(),
                thread_id: "thread_renewal".to_string(),
                status: "completed".to_string(),
                output: serde_json::json!({
                    "task_id": "task_1",
                    "action_message_id": "msg_draft_action_1",
                }),
                external_reference: Some("msg_draft_action_1".to_string()),
                recorded_at: "2026-06-18T10:00:00Z".to_string(),
                reversible_summary: Some(crate::db::ReversibleActionAuditSummary {
                    reversible: true,
                    undo_label: Some("Remove draft task".to_string()),
                    action_message_id: Some("msg_draft_action_1".to_string()),
                    rollback_checkpoint_id: Some("checkpoint_1".to_string()),
                    provenance_record_id: Some("prov_1".to_string()),
                    side_effect_boundary: Some("internal_only".to_string()),
                }),
            }],
        );

        assert_eq!(
            summary.latest_draft_task_action_message_id.as_deref(),
            Some("msg_draft_action_1")
        );
        assert_eq!(
            summary.latest_draft_task_thread_id.as_deref(),
            Some("thread_renewal")
        );
    }

    #[test]
    fn calendar_runtime_summary_attaches_latest_action_target_from_audit_log() {
        let summary = super::attach_calendar_runtime_reversible_refs(
            super::build_calendar_runtime_summary_from_events(&[serde_json::json!({
                "id": "event_1",
                "title": "Hold for interview prep",
                "start_at": "2026-06-19T10:00:00Z",
                "status": "tentative"
            })]),
            &[crate::db::ActionAuditEntry {
                capability_id:
                    crate::reversible_actions::REVERSIBLE_CAPABILITY_TENTATIVE_CALENDAR_HOLD
                        .to_string(),
                thread_id: "thread_calendar_1".to_string(),
                status: "completed".to_string(),
                output: serde_json::json!({
                    "event_id": "event_1",
                    "action_message_id": "msg_calendar_action_1",
                }),
                external_reference: Some("msg_calendar_action_1".to_string()),
                recorded_at: "2026-06-18T10:00:00Z".to_string(),
                reversible_summary: Some(crate::db::ReversibleActionAuditSummary {
                    reversible: true,
                    undo_label: Some("Remove tentative hold".to_string()),
                    action_message_id: Some("msg_calendar_action_1".to_string()),
                    rollback_checkpoint_id: Some("checkpoint_1".to_string()),
                    provenance_record_id: Some("prov_1".to_string()),
                    side_effect_boundary: Some("internal_only".to_string()),
                }),
            }],
        );

        assert_eq!(
            summary.latest_tentative_thread_id.as_deref(),
            Some("thread_calendar_1")
        );
        assert_eq!(
            summary.latest_tentative_action_message_id.as_deref(),
            Some("msg_calendar_action_1")
        );
    }

    #[test]
    fn dashboard_bootstrap_proactive_suggestions_include_simulator_review_previews() {
        let mut continuity = DashboardContinuityPayload {
            continuity_state: Some(DashboardContinuityMessage {
                id: "snapshot_1".to_string(),
                thread_id: "continuity:state:user_01".to_string(),
                timestamp: "2026-06-03T10:00:00Z".to_string(),
                r#type: "state_snapshot".to_string(),
                subtype: "homepage_briefing".to_string(),
                content: serde_json::json!({}),
                parsed_content: Some(DashboardContinuityParsedContent::StateSnapshot(
                    crate::state_snapshot::StateSnapshotContent {
                        snapshot_kind: "homepage_briefing".to_string(),
                        time_window: "today".to_string(),
                        sources: vec!["msg_3".to_string()],
                        decision_queue: Vec::new(),
                        response_queue: Vec::new(),
                        active_commitments: Vec::new(),
                        critical_changes: Vec::new(),
                        context_panel_items: Vec::new(),
                        watcher_signals: Vec::new(),
                        continuity_metrics: Default::default(),
                        suggested_actions: Vec::new(),
                        confidence_notes: Vec::new(),
                        state_fields: Vec::new(),
                        prepared_context_packet: None,
                        prepared_draft_packet: None,
                        staleness_at: "2026-06-03T12:00:00Z".to_string(),
                    },
                )),
                synthesizer_handoff: None,
                metadata: serde_json::json!({
                    "simulator_reversible_action_preview": {
                        "action_afp": {
                            "content": {
                                "title": "Draft follow-up for Customer demo",
                                "summary": "Suggest reversible next step from defer_task around Customer demo.",
                                "source_refs": ["msg_3"]
                            }
                        }
                    },
                    "simulator_approval_review_preview": {
                        "title": "Review approval preview",
                        "reason": "Escalate approval-bound proposal from send_summary around Customer demo.",
                        "approval_kind": "send",
                        "confidence": "high",
                        "source_refs": ["msg_3"],
                        "consequence_summary_lines": ["Outbound summary remains paused for review."]
                    }
                }),
                views: serde_json::json!([]),
            }),
            continuity_brief: None,
            continuity_handoff: Some(SynthesizerToMasterHandoff {
                surface_recommendation: "decision_queue".to_string(),
                ..Default::default()
            }),
            continuity_surface_hint: Some("decision_queue".to_string()),
            continuity_requires_approval: false,
            continuity_panel_kind: "decision_queue".to_string(),
            continuity_primary_mode: "queue".to_string(),
            continuity_priority_item: None,
            continuity_priority_card: None,
            continuity_action_items: Vec::new(),
            continuity_action_overflow_count: 0,
            continuity_action_overflow_summary: None,
            continuity_response_items: Vec::new(),
            continuity_prepared_draft_items: Vec::new(),
            continuity_context_panel_items: Vec::new(),
            continuity_context_pack_items: Vec::new(),
            continuity_state_fields: Vec::new(),
        };
        continuity
            .continuity_state
            .as_mut()
            .expect("continuity state")
            .metadata["simulator_promotions"] = serde_json::json!([
            {
                "target_kind": "reversible_action",
                "review_surface": {
                    "review_available": true,
                    "provenance_summary": "Traceable to the currently linked continuity sources behind this suggestion."
                }
            },
            {
                "target_kind": "approval_required",
                "review_surface": {
                    "review_available": true
                }
            }
        ]);

        let suggestions = build_dashboard_bootstrap_proactive_suggestions(
            Vec::new(),
            &continuity,
            &[],
            &AgentPreferences::default(),
            10,
        );

        assert!(
            suggestions
                .iter()
                .any(|item| item["kind"].as_str() == Some("simulator_reversible_preview"))
        );
        assert!(
            suggestions
                .iter()
                .any(|item| item["kind"].as_str() == Some("simulator_conflict_fusion"))
        );
        assert!(
            suggestions
                .iter()
                .any(|item| item["kind"].as_str() == Some("simulator_approval_preview"))
        );
        let reversible_preview = suggestions
            .iter()
            .find(|item| item["kind"].as_str() == Some("simulator_reversible_preview"))
            .expect("simulator reversible preview");
        assert_eq!(
            reversible_preview["autonomy_tier"].as_str(),
            Some("notify_then_act")
        );
        assert_eq!(
            reversible_preview["autonomy_decision"]["autonomy_level"].as_str(),
            Some("suggest_with_artifact")
        );
        assert_eq!(
            reversible_preview["provenance_cue"].as_str(),
            Some("Traceable to the currently linked continuity sources behind this suggestion.")
        );
    }

    #[test]
    fn dashboard_bootstrap_proactive_suggestions_filter_seeded_simulator_preview_on_family_caution()
    {
        let mut continuity = DashboardContinuityPayload {
            continuity_state: Some(DashboardContinuityMessage {
                id: "snapshot_1".to_string(),
                thread_id: "continuity:state:user_01".to_string(),
                timestamp: "2026-06-03T10:00:00Z".to_string(),
                r#type: "state_snapshot".to_string(),
                subtype: "homepage_briefing".to_string(),
                content: serde_json::json!({}),
                parsed_content: Some(DashboardContinuityParsedContent::StateSnapshot(
                    crate::state_snapshot::StateSnapshotContent {
                        snapshot_kind: "homepage_briefing".to_string(),
                        time_window: "today".to_string(),
                        sources: vec!["msg_3".to_string()],
                        decision_queue: Vec::new(),
                        response_queue: Vec::new(),
                        active_commitments: Vec::new(),
                        critical_changes: Vec::new(),
                        context_panel_items: Vec::new(),
                        watcher_signals: Vec::new(),
                        continuity_metrics: Default::default(),
                        suggested_actions: Vec::new(),
                        confidence_notes: Vec::new(),
                        state_fields: Vec::new(),
                        prepared_context_packet: None,
                        prepared_draft_packet: None,
                        staleness_at: "2026-06-03T12:00:00Z".to_string(),
                    },
                )),
                synthesizer_handoff: None,
                metadata: serde_json::json!({
                    "simulator_approval_review_preview": {
                        "title": "Review approval preview",
                        "reason": "Escalate approval-bound proposal from send_summary around Customer demo.",
                        "approval_kind": "send",
                        "confidence": "high",
                        "source_refs": ["msg_3"],
                        "consequence_summary_lines": ["Outbound summary remains paused for review."]
                    },
                    "simulator_reversible_action_preview": {
                        "action_afp": {
                            "content": {
                                "title": "Review reversible preview",
                                "summary": "Prepare an internal defer path before committing to outreach.",
                                "source_refs": ["msg_3"]
                            }
                        }
                    }
                }),
                views: serde_json::json!([]),
            }),
            continuity_brief: None,
            continuity_handoff: Some(SynthesizerToMasterHandoff {
                surface_recommendation: "decision_queue".to_string(),
                ..Default::default()
            }),
            continuity_surface_hint: Some("decision_queue".to_string()),
            continuity_requires_approval: false,
            continuity_panel_kind: "decision_queue".to_string(),
            continuity_primary_mode: "queue".to_string(),
            continuity_priority_item: None,
            continuity_priority_card: None,
            continuity_action_items: Vec::new(),
            continuity_action_overflow_count: 0,
            continuity_action_overflow_summary: None,
            continuity_response_items: Vec::new(),
            continuity_prepared_draft_items: Vec::new(),
            continuity_context_panel_items: Vec::new(),
            continuity_context_pack_items: Vec::new(),
            continuity_state_fields: Vec::new(),
        };
        continuity
            .continuity_state
            .as_mut()
            .expect("continuity state")
            .metadata["simulator_promotions"] = serde_json::json!([
            {
                "target_kind": "reversible_action",
                "review_surface": {
                    "review_available": true
                }
            },
            {
                "target_kind": "approval_required",
                "review_surface": {
                    "review_available": true
                }
            }
        ]);

        let baseline = build_dashboard_bootstrap_proactive_suggestions(
            Vec::new(),
            &continuity,
            &[],
            &AgentPreferences::default(),
            10,
        );
        let simulator_item = baseline
            .iter()
            .find(|item| item["kind"].as_str() == Some("simulator_conflict_fusion"))
            .expect("seeded simulator fusion preview should exist");
        let family_id = simulator_item["heuristic_family_id"]
            .as_str()
            .map(str::to_string)
            .or_else(|| {
                simulator_item["heuristic_id"]
                    .as_str()
                    .map(crate::db::proactive_heuristic_family_id)
            })
            .expect("seeded simulator preview should resolve to a heuristic family id");
        let feedback = vec![HeuristicOutcomeFeedback {
            heuristic_id: family_id,
            total: 5,
            accepted: 1,
            acceptance_rate: 0.2,
            status: "cautious".to_string(),
            scope: "family".to_string(),
            suggested_suppression_hours: None,
            suggested_half_life_days: 14,
            adaptation_reason: None,
            threshold_delta: None,
            sample_count: None,
            adaptation_signals: Vec::new(),
        }];

        let filtered = build_dashboard_bootstrap_proactive_suggestions(
            Vec::new(),
            &continuity,
            &feedback,
            &AgentPreferences::default(),
            10,
        );

        assert!(
            !filtered
                .iter()
                .any(|item| item["kind"].as_str() == Some("simulator_conflict_fusion"))
        );
    }

    #[test]
    fn dashboard_message_bundle_cache_expires_after_ttl() {
        let user_id = "cache_user";
        let limit = 20usize;
        let bundle = DashboardMessageBundle {
            recent_messages: Vec::new(),
            thread_summaries: Vec::new(),
            thread_retrieval_state: Some(serde_json::json!({"summary": "cached"})),
        };

        let now = Instant::now();
        store_dashboard_message_bundle_in_cache_at(user_id, limit, bundle.clone(), now);
        let cached = load_dashboard_message_bundle_from_cache_at(user_id, limit, now);
        assert!(cached.is_some());
        assert_eq!(
            cached
                .and_then(|entry| entry.thread_retrieval_state)
                .and_then(|value| value
                    .get("summary")
                    .and_then(Value::as_str)
                    .map(str::to_string)),
            Some("cached".to_string())
        );

        let expired = load_dashboard_message_bundle_from_cache_at(
            user_id,
            limit,
            now + DASHBOARD_MESSAGE_CACHE_TTL + Duration::from_secs(1),
        );
        assert!(expired.is_none());
    }

    #[test]
    fn dashboard_message_bundle_uses_shared_user_message_loader() {
        let source = include_str!("dashboard_routes.rs");
        let start = source
            .find("async fn load_dashboard_message_bundle(")
            .expect("load_dashboard_message_bundle exists");
        let tail = &source[start..];
        let end = tail
            .find("pub(super) async fn load_workflow_runtime_summary(")
            .expect("workflow runtime summary follows dashboard message loader");
        let function_source = &tail[..end];

        assert!(
            function_source.contains(".recent_messages_for_user(user_id, agent_ids, limit as i64)")
        );
        assert!(!function_source.contains("tokio::join!("));
    }

    #[test]
    fn simulator_runtime_summary_aggregates_surface_rollout_state() {
        let summary = build_simulator_runtime_summary_from_policies(&[
            crate::simulator_rollout::SimulatorRolloutPolicy {
                surface: crate::simulator_rollout::SimulatorRolloutSurface::Planning,
                enabled: true,
                allow_promotion: false,
                probabilistic_sampling_enabled: false,
                review_surfaces_enabled: false,
                rollout_stage: "shadow".to_string(),
                calibration_mode: "bounded_deterministic".to_string(),
            },
            crate::simulator_rollout::SimulatorRolloutPolicy {
                surface: crate::simulator_rollout::SimulatorRolloutSurface::Synthesizer,
                enabled: true,
                allow_promotion: true,
                probabilistic_sampling_enabled: false,
                review_surfaces_enabled: true,
                rollout_stage: "review".to_string(),
                calibration_mode: "bounded_deterministic".to_string(),
            },
            crate::simulator_rollout::SimulatorRolloutPolicy {
                surface: crate::simulator_rollout::SimulatorRolloutSurface::Watcher,
                enabled: false,
                allow_promotion: false,
                probabilistic_sampling_enabled: true,
                review_surfaces_enabled: false,
                rollout_stage: "promotion".to_string(),
                calibration_mode: "sampled_preview".to_string(),
            },
        ]);

        assert_eq!(summary.enabled_surface_count, 2);
        assert_eq!(summary.promotion_enabled_surface_count, 1);
        assert_eq!(summary.review_surface_count, 1);
        assert_eq!(summary.sampled_surface_count, 1);
        assert_eq!(summary.highest_rollout_stage, "promotion");
        assert_eq!(
            summary.policy_posture_summary,
            "Policy posture: promotion stage across 2 active surfaces; 1 promotion-enabled; 1 review surface; 1 sampled surface."
        );
        assert_eq!(summary.rollout_alignment_status, "policy_only");
        assert_eq!(
            summary.rollout_alignment_summary,
            "No observed simulator run has been recorded yet for the current promotion policy posture."
        );
        assert_eq!(summary.surfaces.len(), 3);
        assert_eq!(summary.surfaces[1].surface, "synthesizer");
        assert_eq!(summary.surfaces[2].calibration_mode, "sampled_preview");
        assert!(
            summary.surfaces[0]
                .policy_summary
                .contains("without promotion write-back")
        );
        assert!(
            summary.surfaces[2]
                .calibration_notes
                .iter()
                .any(|note| note.contains("disabled simulator execution"))
        );
    }

    #[test]
    fn simulator_runtime_summary_merges_latest_continuity_observation() {
        let base = build_simulator_runtime_summary_from_policies(&[
            crate::simulator_rollout::default_simulator_rollout_policy(
                crate::simulator_rollout::SimulatorRolloutSurface::Synthesizer,
            ),
        ]);
        let continuity = DashboardContinuityPayload {
            continuity_state: Some(DashboardContinuityMessage {
                id: "snapshot_1".to_string(),
                thread_id: "continuity:state:user_01".to_string(),
                timestamp: "2026-08-18T05:00:00Z".to_string(),
                r#type: "state_snapshot".to_string(),
                subtype: "homepage_briefing".to_string(),
                content: serde_json::json!({}),
                parsed_content: None,
                synthesizer_handoff: Some(SynthesizerToMasterHandoff {
                    simulated_projection_summary: Some(
                        "Bounded simulation traced 4 step(s) across 1 rollout(s).".to_string(),
                    ),
                    simulated_review_summary: Some(
                        "Simulator preview stays bounded on synthesizer with 1 reviewable promotion candidate."
                            .to_string(),
                    ),
                    simulated_actionable_event_count: Some(4),
                    simulated_promotion_candidate_count: Some(1),
                    simulated_rollout_stage: Some("review".to_string()),
                    simulated_calibration_mode: Some("bounded_deterministic".to_string()),
                    simulated_calibration_notes: vec![
                        "Deterministic bounded preview stayed within a single rollout."
                            .to_string(),
                    ],
                    ..Default::default()
                }),
                metadata: serde_json::json!({
                    "simulator_rollout_summary": {
                        "rollout_stage": "review",
                        "calibration_mode": "bounded_deterministic"
                    },
                    "simulator_calibration_summary": {
                        "confidence_posture": "bounded_deterministic",
                        "actionable_event_count": 4,
                        "promotion_candidate_count": 1,
                        "review_surface_count": 1,
                        "calibration_notes": [
                            "Deterministic bounded preview stayed within a single rollout.",
                            "1 review surface remained available for promoted previews."
                        ]
                    }
                }),
                views: serde_json::json!([]),
            }),
            continuity_brief: None,
            continuity_handoff: Some(SynthesizerToMasterHandoff {
                simulated_projection_summary: Some(
                    "Bounded simulation traced 4 step(s) across 1 rollout(s).".to_string(),
                ),
                simulated_review_summary: Some(
                    "Simulator preview stays bounded on synthesizer with 1 reviewable promotion candidate."
                        .to_string(),
                ),
                simulated_actionable_event_count: Some(4),
                simulated_promotion_candidate_count: Some(1),
                simulated_rollout_stage: Some("review".to_string()),
                simulated_calibration_mode: Some("bounded_deterministic".to_string()),
                simulated_calibration_notes: vec![
                    "Deterministic bounded preview stayed within a single rollout."
                        .to_string(),
                ],
                ..Default::default()
            }),
            continuity_surface_hint: None,
            continuity_requires_approval: false,
            continuity_panel_kind: "decision_queue".to_string(),
            continuity_primary_mode: "queue".to_string(),
            continuity_priority_item: None,
            continuity_priority_card: None,
            continuity_action_items: Vec::new(),
            continuity_action_overflow_count: 0,
            continuity_action_overflow_summary: None,
            continuity_response_items: Vec::new(),
            continuity_prepared_draft_items: Vec::new(),
            continuity_context_panel_items: Vec::new(),
            continuity_context_pack_items: Vec::new(),
            continuity_state_fields: Vec::new(),
        };

        let summary = apply_latest_simulator_observation(base, &continuity);

        assert_eq!(
            summary.latest_observed_at.as_deref(),
            Some("2026-08-18T05:00:00Z")
        );
        assert_eq!(summary.observed_rollout_stage.as_deref(), Some("review"));
        assert_eq!(
            summary.observed_calibration_mode.as_deref(),
            Some("bounded_deterministic")
        );
        assert_eq!(summary.observed_actionable_event_count, Some(4));
        assert_eq!(summary.observed_promotion_candidate_count, Some(1));
        assert_eq!(summary.observed_review_surface_count, Some(1));
        assert_eq!(summary.observed_calibration_notes.len(), 2);
        assert_eq!(summary.rollout_alignment_status, "aligned");
        assert_eq!(
            summary.rollout_alignment_summary,
            "Latest observed simulation matches the planned review posture."
        );
    }

    #[test]
    fn simulator_runtime_summary_ignores_continuity_without_simulator_observation() {
        let base = build_simulator_runtime_summary_from_policies(&[
            crate::simulator_rollout::default_simulator_rollout_policy(
                crate::simulator_rollout::SimulatorRolloutSurface::Synthesizer,
            ),
        ]);
        let continuity = DashboardContinuityPayload {
            continuity_state: Some(DashboardContinuityMessage {
                id: "snapshot_1".to_string(),
                thread_id: "continuity:state:user_01".to_string(),
                timestamp: "2026-08-18T05:00:00Z".to_string(),
                r#type: "state_snapshot".to_string(),
                subtype: "homepage_briefing".to_string(),
                content: serde_json::json!({}),
                parsed_content: None,
                synthesizer_handoff: None,
                metadata: serde_json::json!({}),
                views: serde_json::json!([]),
            }),
            continuity_brief: None,
            continuity_handoff: Some(SynthesizerToMasterHandoff::default()),
            continuity_surface_hint: None,
            continuity_requires_approval: false,
            continuity_panel_kind: "decision_queue".to_string(),
            continuity_primary_mode: "queue".to_string(),
            continuity_priority_item: None,
            continuity_priority_card: None,
            continuity_action_items: Vec::new(),
            continuity_action_overflow_count: 0,
            continuity_action_overflow_summary: None,
            continuity_response_items: Vec::new(),
            continuity_prepared_draft_items: Vec::new(),
            continuity_context_panel_items: Vec::new(),
            continuity_context_pack_items: Vec::new(),
            continuity_state_fields: Vec::new(),
        };

        let summary = apply_latest_simulator_observation(base, &continuity);

        assert_eq!(summary.latest_observed_at, None);
        assert_eq!(summary.observed_rollout_stage, None);
        assert_eq!(summary.observed_calibration_mode, None);
        assert_eq!(summary.observed_projection_summary, None);
        assert_eq!(summary.observed_review_summary, None);
        assert_eq!(summary.observed_actionable_event_count, None);
        assert_eq!(summary.observed_promotion_candidate_count, None);
        assert_eq!(summary.observed_review_surface_count, None);
        assert!(summary.observed_calibration_notes.is_empty());
    }
}
