/*
 * @module-id: rust.browser-automation
 * @primary-capability: rust.source-module
 * @locs-version: 2.0
 * @stability: active
 * @owner: omnyid
 */

/// Browser Automation Ã¢â‚¬â€ Playwright-backed web task execution for the Master Agent.
///
/// Enables agents to automate browser sessions inside a Cloud Runner container
/// or local Tauri desktop app sandbox.  The Cloud Runner manages a sandboxed
/// Chromium instance; the Tauri integration uses the OS default browser via IPC.
///
/// Navigation permission tiers (must be granted by the user before any task):
///   navigation_read  Ã¢â‚¬â€ navigate and observe (extract, screenshot); no interaction.
///   navigation_form  Ã¢â‚¬â€ read + fill forms, click submit buttons, follow links.
///   navigation_full  Ã¢â‚¬â€ form + click any element, type text, download files.
///
/// Key invariants:
///   - Every task must have a user-approved `browser_task:request` AFP message.
///   - `step_approval_required = true` gates each navigation behind a confirmation.
///   - Follow-up task events should chain via `parent_id` for verifiable lineage.
///   - Screenshots are stored as separate `browser_task:screenshot` AFP messages.
///   - All visited URLs are recorded in the `browser_task:result` message for audit.
use chrono::Utc;
use serde_json::{Value, json};
use ulid::Ulid;

use crate::autonomy_policy::autonomy_decision_for_browser_task;
use crate::message::{
    AFP_SUBTYPE_BROWSER_TASK_BLOCKED, AFP_SUBTYPE_BROWSER_TASK_CANCEL,
    AFP_SUBTYPE_BROWSER_TASK_PROGRESS, AFP_SUBTYPE_BROWSER_TASK_REQUEST,
    AFP_SUBTYPE_BROWSER_TASK_RESULT, AFP_SUBTYPE_BROWSER_TASK_SCREENSHOT,
    AFP_SUBTYPE_BROWSER_TASK_UNBLOCK, AFP_TYPE_BROWSER_TASK, AfpBrowserStep,
    AfpBrowserTaskRequestContent, NAV_PERM_FORM, NAV_PERM_FULL, NAV_PERM_READ,
};

// Ã¢â€â‚¬Ã¢â€â‚¬ Permission helpers Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

/// Ordinal for navigation permission tiers.
fn nav_perm_level(perm: &str) -> u8 {
    match perm {
        NAV_PERM_READ => 1,
        NAV_PERM_FORM => 2,
        NAV_PERM_FULL => 3,
        _ => 0,
    }
}

/// Return `true` if `held_permission` is sufficient for `action`.
///
/// - `navigate`, `screenshot`, `extract`, `wait` Ã¢â€ â€™ navigation_read
/// - `fill`, `submit` Ã¢â€ â€™ navigation_form
/// - `click`, `type`, `download`, `scroll`, `hover` Ã¢â€ â€™ navigation_full
/// - `captcha_probe`, `shadow_dom_query` Ã¢â€ â€™ navigation_full (adaptive recovery)
pub fn permission_allows_action(held_permission: &str, action: &str) -> bool {
    let read_actions = ["navigate", "screenshot", "extract", "wait"];
    let form_actions = ["fill", "submit"];
    let full_actions = [
        "click",
        "type",
        "download",
        "scroll",
        "hover",
        "captcha_probe",
        "shadow_dom_query",
    ];

    if read_actions.contains(&action) {
        nav_perm_level(held_permission) >= nav_perm_level(NAV_PERM_READ)
    } else if form_actions.contains(&action) {
        nav_perm_level(held_permission) >= nav_perm_level(NAV_PERM_FORM)
    } else if full_actions.contains(&action) {
        nav_perm_level(held_permission) >= nav_perm_level(NAV_PERM_FULL)
    } else {
        false
    }
}

/// Validate that all `planned_steps` in a task request are within the
/// `required_permission` tier.  Returns `Err` with the first violation found.
pub fn validate_task_steps(task: &AfpBrowserTaskRequestContent) -> Result<(), String> {
    for step in &task.planned_steps {
        let perm = task.required_permission.as_deref().unwrap_or(NAV_PERM_READ);
        if !permission_allows_action(perm, &step.action) {
            return Err(format!(
                "step {} action '{}' requires higher permission than '{}'",
                step.step_index, step.action, perm
            ));
        }
    }
    Ok(())
}

/// Return a human-readable label for a permission tier.
pub fn nav_perm_label(perm: &str) -> &'static str {
    match perm {
        NAV_PERM_READ => "Read-only (navigate and observe)",
        NAV_PERM_FORM => "Form-fill (read + fill forms and submit)",
        NAV_PERM_FULL => "Full automation (click, type, download)",
        _ => "Unknown permission",
    }
}

// Ã¢â€â‚¬Ã¢â€â‚¬ Common task templates Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

/// Build a flight-search task with read-only permission.
/// The agent navigates to the given URL and extracts flight data; no booking occurs
/// without a separate `navigation_full` task with explicit user approval.
pub fn flight_search_task(
    owner_user_id: &str,
    thread_id: &str,
    search_url: &str,
    reason: &str,
) -> Value {
    let steps = vec![
        AfpBrowserStep {
            step_index: 0,
            action: "navigate".to_string(),
            description: "Open flight search page".to_string(),
            target: Some(search_url.to_string()),
            status: "pending".to_string(),
            ..Default::default()
        },
        AfpBrowserStep {
            step_index: 1,
            action: "screenshot".to_string(),
            description: "Capture search results".to_string(),
            target: None,
            status: "pending".to_string(),
            ..Default::default()
        },
        AfpBrowserStep {
            step_index: 2,
            action: "extract".to_string(),
            description: "Extract flight options and prices".to_string(),
            target: Some("[data-testid='flight-card'], .flight-result".to_string()),
            status: "pending".to_string(),
            ..Default::default()
        },
    ];
    build_browser_task_request_afp(
        owner_user_id,
        thread_id,
        None,
        "Search for flight options",
        search_url,
        NAV_PERM_READ,
        steps,
        120,
        false,
        reason,
    )
}

/// Build a form-fill task for submitting a web form.
/// Requires `navigation_form` permission.  Always sets `step_approval_required = true`.
pub fn form_fill_task(
    owner_user_id: &str,
    thread_id: &str,
    form_url: &str,
    form_fields: &[(&str, &str)],
    reason: &str,
) -> Value {
    let mut steps = vec![AfpBrowserStep {
        step_index: 0,
        action: "navigate".to_string(),
        description: format!("Open form at {form_url}"),
        target: Some(form_url.to_string()),
        status: "pending".to_string(),
        ..Default::default()
    }];
    for (i, (selector, value)) in form_fields.iter().enumerate() {
        steps.push(AfpBrowserStep {
            step_index: (i as u32) + 1,
            action: "fill".to_string(),
            description: format!("Fill field '{selector}' with value"),
            target: Some(selector.to_string()),
            status: "pending".to_string(),
            ..Default::default()
        });
        let _ = value; // value is sent separately at runtime, not in the plan
    }
    let submit_idx = form_fields.len() as u32 + 1;
    steps.push(AfpBrowserStep {
        step_index: submit_idx,
        action: "submit".to_string(),
        description: "Submit the completed form".to_string(),
        target: Some("button[type='submit'], input[type='submit']".to_string()),
        status: "pending".to_string(),
        ..Default::default()
    });
    steps.push(AfpBrowserStep {
        step_index: submit_idx + 1,
        action: "screenshot".to_string(),
        description: "Capture confirmation page".to_string(),
        target: None,
        status: "pending".to_string(),
        ..Default::default()
    });

    build_browser_task_request_afp(
        owner_user_id,
        thread_id,
        None,
        "Fill and submit web form",
        form_url,
        NAV_PERM_FORM,
        steps,
        180,
        true, // always require step approval for form submission
        reason,
    )
}

/// Build a data-extraction task that reads page content without interaction.
pub fn data_extraction_task(
    owner_user_id: &str,
    thread_id: &str,
    url: &str,
    selector: &str,
    reason: &str,
) -> Value {
    let steps = vec![
        AfpBrowserStep {
            step_index: 0,
            action: "navigate".to_string(),
            description: format!("Navigate to {url}"),
            target: Some(url.to_string()),
            status: "pending".to_string(),
            ..Default::default()
        },
        AfpBrowserStep {
            step_index: 1,
            action: "wait".to_string(),
            description: "Wait for dynamic content to load".to_string(),
            target: Some(selector.to_string()),
            status: "pending".to_string(),
            ..Default::default()
        },
        AfpBrowserStep {
            step_index: 2,
            action: "extract".to_string(),
            description: format!("Extract data from '{selector}'"),
            target: Some(selector.to_string()),
            status: "pending".to_string(),
            ..Default::default()
        },
        AfpBrowserStep {
            step_index: 3,
            action: "screenshot".to_string(),
            description: "Capture page screenshot for audit".to_string(),
            target: None,
            status: "pending".to_string(),
            ..Default::default()
        },
    ];
    build_browser_task_request_afp(
        owner_user_id,
        thread_id,
        None,
        "Extract data from web page",
        url,
        NAV_PERM_READ,
        steps,
        60,
        false,
        reason,
    )
}

// Ã¢â€â‚¬Ã¢â€â‚¬ AFP message builders Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

/// Build a `browser_task:request` AFP message.
pub fn build_browser_task_request_afp(
    owner_user_id: &str,
    thread_id: &str,
    parent_message_id: Option<&str>,
    goal: &str,
    start_url: &str,
    required_permission: &str,
    steps: Vec<AfpBrowserStep>,
    timeout_seconds: u32,
    step_approval_required: bool,
    reason: &str,
) -> Value {
    let steps_val = serde_json::to_value(&steps).unwrap_or(Value::Array(vec![]));
    let autonomy_decision = autonomy_decision_for_browser_task(step_approval_required);
    json!({
        "protocol": "afp-v1",
        "id": Ulid::new().to_string(),
        "thread_id": thread_id,
        "parent_id": parent_message_id,
        "from": "master_agent",
        "to": [owner_user_id],
        "timestamp": Utc::now().to_rfc3339(),
        "type": AFP_TYPE_BROWSER_TASK,
        "subtype": AFP_SUBTYPE_BROWSER_TASK_REQUEST,
        "content": {
            "task_id": Ulid::new().to_string(),
            "goal": goal,
            "start_url": start_url,
            "required_permission": required_permission,
            "planned_steps": steps_val,
            "timeout_seconds": timeout_seconds,
            "step_approval_required": step_approval_required,
            "reason": reason,
        },
        "metadata": {
            "store": true,
            "autonomy_decision": autonomy_decision,
        },
        "store_in_relational": true,
    })
}

/// Build a `browser_task:progress` streaming update AFP message.
pub fn build_browser_task_progress_afp(
    owner_user_id: &str,
    thread_id: &str,
    parent_message_id: Option<&str>,
    task_id: &str,
    current_step: u32,
    total_steps: u32,
    steps: Vec<AfpBrowserStep>,
    current_url: Option<&str>,
) -> Value {
    let steps_val = serde_json::to_value(&steps).unwrap_or(Value::Array(vec![]));
    json!({
        "protocol": "afp-v1",
        "id": Ulid::new().to_string(),
        "thread_id": thread_id,
        "parent_id": parent_message_id,
        "from": "browser_runner",
        "to": [owner_user_id],
        "timestamp": Utc::now().to_rfc3339(),
        "type": AFP_TYPE_BROWSER_TASK,
        "subtype": AFP_SUBTYPE_BROWSER_TASK_PROGRESS,
        "content": {
            "task_id": task_id,
            "current_step": current_step,
            "total_steps": total_steps,
            "steps": steps_val,
            "current_url": current_url,
        },
        "metadata": { "store": false },
        "store_in_relational": false,
    })
}

/// Build a `browser_task:result` AFP message on task completion.
pub fn build_browser_task_result_afp(
    owner_user_id: &str,
    thread_id: &str,
    parent_message_id: Option<&str>,
    task_id: &str,
    status: &str,
    summary: &str,
    extracted_data: Option<Value>,
    visited_urls: &[&str],
    steps_completed: u32,
    steps_total: u32,
    duration_ms: u64,
    error: Option<&str>,
) -> Value {
    json!({
        "protocol": "afp-v1",
        "id": Ulid::new().to_string(),
        "thread_id": thread_id,
        "parent_id": parent_message_id,
        "from": "browser_runner",
        "to": [owner_user_id],
        "timestamp": Utc::now().to_rfc3339(),
        "type": AFP_TYPE_BROWSER_TASK,
        "subtype": AFP_SUBTYPE_BROWSER_TASK_RESULT,
        "content": {
            "task_id": task_id,
            "status": status,
            "summary": summary,
            "extracted_data": extracted_data,
            "visited_urls": visited_urls,
            "steps_completed": steps_completed,
            "steps_total": steps_total,
            "duration_ms": duration_ms,
            "error": error,
        },
        "metadata": { "store": true },
        "store_in_relational": true,
    })
}

/// Build a `browser_task:cancel` AFP message (user-initiated cancellation).
pub fn build_browser_task_cancel_afp(
    owner_user_id: &str,
    thread_id: &str,
    parent_message_id: Option<&str>,
    task_id: &str,
    reason: &str,
) -> Value {
    json!({
        "protocol": "afp-v1",
        "id": Ulid::new().to_string(),
        "thread_id": thread_id,
        "parent_id": parent_message_id,
        "from": owner_user_id,
        "to": ["browser_runner", "master_agent"],
        "timestamp": Utc::now().to_rfc3339(),
        "type": AFP_TYPE_BROWSER_TASK,
        "subtype": AFP_SUBTYPE_BROWSER_TASK_CANCEL,
        "content": {
            "task_id": task_id,
            "reason": reason,
            "cancelled_at": Utc::now().to_rfc3339(),
        },
        "metadata": { "store": true },
        "store_in_relational": true,
    })
}

/// Build a `browser_task:screenshot` AFP message for an in-task screenshot.
pub fn build_browser_screenshot_afp(
    owner_user_id: &str,
    thread_id: &str,
    parent_message_id: Option<&str>,
    task_id: &str,
    step_index: u32,
    image_b64: &str,
    current_url: &str,
) -> Value {
    json!({
        "protocol": "afp-v1",
        "id": Ulid::new().to_string(),
        "thread_id": thread_id,
        "parent_id": parent_message_id,
        "from": "browser_runner",
        "to": [owner_user_id],
        "timestamp": Utc::now().to_rfc3339(),
        "type": AFP_TYPE_BROWSER_TASK,
        "subtype": AFP_SUBTYPE_BROWSER_TASK_SCREENSHOT,
        "content": {
            "task_id": task_id,
            "step_index": step_index,
            "image_b64": image_b64,
            "current_url": current_url,
            "captured_at": Utc::now().to_rfc3339(),
        },
        "metadata": { "store": true },
        "store_in_relational": false,
    })
}

/// Build an adaptive data-extraction task.
///
/// Identical to `data_extraction_task` but with `resilience_mode = "adaptive"`,
/// which tells the Cloud Runner it may insert `captcha_probe` or `shadow_dom_query`
/// recovery steps and emit a `browser_task:blocked` message instead of aborting.
pub fn adaptive_data_extraction_task(
    owner_user_id: &str,
    thread_id: &str,
    url: &str,
    selector: &str,
    reason: &str,
) -> Value {
    let steps = vec![
        AfpBrowserStep {
            step_index: 0,
            action: "navigate".to_string(),
            description: format!("Navigate to {url}"),
            target: Some(url.to_string()),
            status: "pending".to_string(),
            ..Default::default()
        },
        AfpBrowserStep {
            step_index: 1,
            action: "shadow_dom_query".to_string(),
            description: "Probe shadow DOM roots if standard selectors fail".to_string(),
            target: Some(selector.to_string()),
            status: "pending".to_string(),
            ..Default::default()
        },
        AfpBrowserStep {
            step_index: 2,
            action: "wait".to_string(),
            description: "Wait for dynamic content to load".to_string(),
            target: Some(selector.to_string()),
            status: "pending".to_string(),
            ..Default::default()
        },
        AfpBrowserStep {
            step_index: 3,
            action: "extract".to_string(),
            description: format!("Extract data from '{selector}'"),
            target: Some(selector.to_string()),
            status: "pending".to_string(),
            ..Default::default()
        },
        AfpBrowserStep {
            step_index: 4,
            action: "screenshot".to_string(),
            description: "Capture page screenshot for audit".to_string(),
            target: None,
            status: "pending".to_string(),
            ..Default::default()
        },
    ];
    let mut msg = build_browser_task_request_afp(
        owner_user_id,
        thread_id,
        None,
        "Extract data from web page (adaptive)",
        url,
        NAV_PERM_FULL,
        steps,
        90,
        false,
        reason,
    );
    if let Some(content) = msg.get_mut("content").and_then(|v| v.as_object_mut()) {
        content.insert("resilience_mode".to_string(), serde_json::json!("adaptive"));
    }
    msg
}

/// Build a `browser_task:blocked` AFP message.
///
/// Emitted by the Cloud Runner when `resilience_mode = "adaptive"` and the
/// runner encounters a CAPTCHA, bot-detection wall, or other human-solvable
/// barrier.  The runner pauses; the user resolves it and sends `unblock`.
pub fn build_browser_blocked_afp(
    owner_user_id: &str,
    thread_id: &str,
    parent_message_id: Option<&str>,
    task_id: &str,
    blocked_url: &str,
    block_reason: &str,
) -> Value {
    json!({
        "protocol": "afp-v1",
        "id": Ulid::new().to_string(),
        "thread_id": thread_id,
        "parent_id": parent_message_id,
        "from": "browser_runner",
        "to": [owner_user_id],
        "timestamp": Utc::now().to_rfc3339(),
        "type": AFP_TYPE_BROWSER_TASK,
        "subtype": AFP_SUBTYPE_BROWSER_TASK_BLOCKED,
        "content": {
            "task_id": task_id,
            "blocked_url": blocked_url,
            "block_reason": block_reason,
            "blocked_at": Utc::now().to_rfc3339(),
        },
        "metadata": { "store": true },
        "store_in_relational": true,
    })
}

/// Build a `browser_task:unblock` AFP message (user confirms the barrier is cleared).
pub fn build_browser_unblock_afp(
    owner_user_id: &str,
    thread_id: &str,
    parent_message_id: Option<&str>,
    task_id: &str,
) -> Value {
    json!({
        "protocol": "afp-v1",
        "id": Ulid::new().to_string(),
        "thread_id": thread_id,
        "parent_id": parent_message_id,
        "from": owner_user_id,
        "to": ["browser_runner"],
        "timestamp": Utc::now().to_rfc3339(),
        "type": AFP_TYPE_BROWSER_TASK,
        "subtype": AFP_SUBTYPE_BROWSER_TASK_UNBLOCK,
        "content": {
            "task_id": task_id,
            "unblocked_at": Utc::now().to_rfc3339(),
        },
        "metadata": { "store": true },
        "store_in_relational": true,
    })
}

// Ã¢â€â‚¬Ã¢â€â‚¬ Tests Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

#[cfg(test)]
mod tests {
    use super::*;
    use crate::message::AfpBrowserTaskRequestContent;

    #[test]
    fn nav_perm_read_allows_navigate_and_extract() {
        assert!(permission_allows_action(NAV_PERM_READ, "navigate"));
        assert!(permission_allows_action(NAV_PERM_READ, "extract"));
        assert!(permission_allows_action(NAV_PERM_READ, "screenshot"));
        assert!(!permission_allows_action(NAV_PERM_READ, "fill"));
        assert!(!permission_allows_action(NAV_PERM_READ, "click"));
    }

    #[test]
    fn nav_perm_form_allows_fill_not_click() {
        assert!(permission_allows_action(NAV_PERM_FORM, "fill"));
        assert!(permission_allows_action(NAV_PERM_FORM, "submit"));
        assert!(!permission_allows_action(NAV_PERM_FORM, "click"));
        assert!(!permission_allows_action(NAV_PERM_FORM, "type"));
    }

    #[test]
    fn nav_perm_full_allows_all_actions() {
        for action in &[
            "navigate",
            "screenshot",
            "extract",
            "fill",
            "submit",
            "click",
            "type",
            "download",
        ] {
            assert!(
                permission_allows_action(NAV_PERM_FULL, action),
                "expected full to allow {action}"
            );
        }
    }

    #[test]
    fn validate_task_steps_rejects_mismatched_actions() {
        let task = AfpBrowserTaskRequestContent {
            task_description: "test".to_string(),
            navigation_permission: NAV_PERM_READ.to_string(),
            required_permission: Some(NAV_PERM_READ.to_string()),
            planned_steps: vec![AfpBrowserStep {
                step_index: 0,
                action: "click".to_string(), // requires full
                description: "click button".to_string(),
                target: None,
                status: "pending".to_string(),
                ..Default::default()
            }],
            ..Default::default()
        };
        assert!(validate_task_steps(&task).is_err());
    }

    #[test]
    fn validate_task_steps_accepts_compatible_steps() {
        let task = AfpBrowserTaskRequestContent {
            task_description: "extract prices".to_string(),
            navigation_permission: NAV_PERM_READ.to_string(),
            required_permission: Some(NAV_PERM_READ.to_string()),
            planned_steps: vec![
                AfpBrowserStep {
                    step_index: 0,
                    action: "navigate".to_string(),
                    description: "open page".to_string(),
                    target: None,
                    status: "pending".to_string(),
                    ..Default::default()
                },
                AfpBrowserStep {
                    step_index: 1,
                    action: "extract".to_string(),
                    description: "get prices".to_string(),
                    target: None,
                    status: "pending".to_string(),
                    ..Default::default()
                },
            ],
            ..Default::default()
        };
        assert!(validate_task_steps(&task).is_ok());
    }

    #[test]
    fn build_browser_task_request_afp_shape() {
        let afp = flight_search_task(
            "user_01",
            "thread_01",
            "https://flights.example.com/search",
            "Find cheapest flights to Sydney",
        );
        assert_eq!(afp["type"].as_str(), Some(AFP_TYPE_BROWSER_TASK));
        assert_eq!(
            afp["subtype"].as_str(),
            Some(AFP_SUBTYPE_BROWSER_TASK_REQUEST)
        );
        assert_eq!(
            afp["content"]["required_permission"].as_str(),
            Some(NAV_PERM_READ)
        );
        let steps = afp["content"]["planned_steps"].as_array().unwrap();
        assert!(!steps.is_empty());
        assert_eq!(
            afp["metadata"]["autonomy_decision"]["autonomy_level"].as_str(),
            Some("prepare_silently")
        );
    }

    #[test]
    fn form_fill_task_requires_step_approval() {
        let afp = form_fill_task(
            "user_01",
            "thread_01",
            "https://example.com/contact",
            &[("#name", "Alice"), ("#email", "alice@example.com")],
            "Submit contact form on behalf of user",
        );
        assert_eq!(
            afp["content"]["required_permission"].as_str(),
            Some(NAV_PERM_FORM)
        );
        assert_eq!(
            afp["content"]["step_approval_required"].as_bool(),
            Some(true)
        );
        assert_eq!(
            afp["metadata"]["autonomy_decision"]["autonomy_level"].as_str(),
            Some("request_approval")
        );
    }

    #[test]
    fn build_browser_task_result_afp_stores_true() {
        let afp = build_browser_task_result_afp(
            "user_01",
            "thread_01",
            Some("msg_request_01"),
            "task_01",
            "success",
            "Found 3 flights",
            None,
            &["https://flights.example.com"],
            3,
            3,
            4200,
            None,
        );
        assert_eq!(
            afp["subtype"].as_str(),
            Some(AFP_SUBTYPE_BROWSER_TASK_RESULT)
        );
        assert_eq!(afp["parent_id"].as_str(), Some("msg_request_01"));
        assert_eq!(afp["metadata"]["store"].as_bool(), Some(true));
    }

    #[test]
    fn nav_perm_labels_are_non_empty() {
        assert!(!nav_perm_label(NAV_PERM_READ).is_empty());
        assert!(!nav_perm_label(NAV_PERM_FORM).is_empty());
        assert!(!nav_perm_label(NAV_PERM_FULL).is_empty());
    }
}
