/*
 * @module-id: integration.skill-capsule-bridge.process-runtime
 * @primary-capability: skill-capsule-runtime-bridge
 * @sub-capabilities: bridge-readiness, runtime-process-execution, workspace-skill-selection
 * @locs-version: 2.0
 * @stability: active
 * @owner: omnyid-runtime
 */

use super::*;
use std::path::{Path as StdPath, PathBuf};
use tokio::process::Command;

const SKILLCAPSULE_NODE_BIN_ENV: &str = "SKILLCAPSULE_NODE_BIN";
const SKILLCAPSULE_RUNTIME_ROOT_ENV: &str = "SKILLCAPSULE_RUNTIME_ROOT";
const SKILLCAPSULE_PROJECT_ROOT_ENV: &str = "SKILLCAPSULE_PROJECT_ROOT";
const SKILLCAPSULE_CONFIG_PATH_ENV: &str = "SKILLCAPSULE_CONFIG_PATH";
const OMNYID_WORKSPACE_SKILLS_FILE: &str = "omnyid.workspace.skills.json";

const SKILLCAPSULE_BRIDGE_SCRIPT: &str = r#"
const path = require('path');

function loadRuntimeModule(runtimeRoot) {
  return require(path.join(runtimeRoot, 'dist', 'runtime.js'));
}

function loadBootstrapModule(runtimeRoot) {
  return require(path.join(runtimeRoot, 'dist', 'bootstrap.js'));
}

function withTaskMetadata(task, payload) {
  if (typeof task === 'string') {
    if (!payload.run_id && !payload.parent_artifact_id) {
      return task;
    }
    return {
      description: task,
      ...(payload.run_id ? { run_id: payload.run_id } : {}),
      ...(payload.parent_artifact_id ? { parent_artifact_id: payload.parent_artifact_id } : {}),
    };
  }
  if (task && typeof task === 'object') {
    return {
      ...task,
      ...(payload.run_id && !task.run_id ? { run_id: payload.run_id } : {}),
      ...(payload.parent_artifact_id && !task.parent_artifact_id
        ? { parent_artifact_id: payload.parent_artifact_id }
        : {}),
    };
  }
  return task;
}

(async () => {
  const payload = JSON.parse(process.env.OMNYID_SKILLCAPSULE_PAYLOAD || '{}');
  const runtimeRoot = process.env.SKILLCAPSULE_RUNTIME_ROOT;
  const configPath = process.env.SKILLCAPSULE_CONFIG_PATH;
  if (!runtimeRoot) {
    throw new Error('SKILLCAPSULE_RUNTIME_ROOT is not configured');
  }

  if (payload.op === 'doctor') {
    const bootstrap = loadBootstrapModule(runtimeRoot);
    const diagnostics = bootstrap.collectRuntimeDiagnostics(configPath);
    console.log(JSON.stringify({ ok: true, data: diagnostics }));
    return;
  }

  const runtimeModule = loadRuntimeModule(runtimeRoot);
  const SkillCapsuleRuntime = runtimeModule.default;
  const runtime = new SkillCapsuleRuntime(configPath);

  let result;
  switch (payload.op) {
    case 'classify':
      result = runtime.classifyTask(payload.task);
      break;
    case 'match':
      result = runtime.match(payload.task);
      break;
    case 'compose':
      result = await runtime.compose(withTaskMetadata(payload.task, payload), payload.budget);
      break;
    case 'prepare':
      result = await runtime.prepare(payload.atom_id, withTaskMetadata(payload.task, payload));
      break;
    case 'activate':
      result = await runtime.activate(payload.atom_id, withTaskMetadata(payload.task, payload));
      break;
    case 'verify':
      result = await runtime.verify(payload.atom_id, withTaskMetadata(payload.task, payload));
      break;
    case 'artifact_list':
      result = runtime.listArtifacts(payload.query || {});
      break;
    case 'artifact_summary':
      result = runtime.summarizeArtifacts(payload.query || {});
      break;
    case 'artifact_lineage':
      result = runtime.getArtifactLineage(payload.run_id);
      break;
    default:
      throw new Error(`Unsupported skill capsule operation: ${payload.op}`);
  }

  console.log(JSON.stringify({ ok: true, data: result }));
})().catch((error) => {
  let payload = {
    ok: false,
    error: {
      code: 'SKILLCAPSULE_BRIDGE_ERROR',
      message: String(error && error.message ? error.message : error),
      retryable: false,
    },
  };
  try {
    const runtimeModule = loadRuntimeModule(process.env.SKILLCAPSULE_RUNTIME_ROOT);
    if (typeof runtimeModule.formatRuntimeError === 'function') {
      payload = runtimeModule.formatRuntimeError(error);
    }
  } catch (_) {}
  console.error(JSON.stringify(payload));
  process.exit(1);
});
"#;

pub(super) fn build_skill_capsule_bridge_context() -> SkillCapsuleBridgeContext {
    let project_root = std::env::var(SKILLCAPSULE_PROJECT_ROOT_ENV)
        .ok()
        .map(PathBuf::from)
        .filter(|path| !path.as_os_str().is_empty())
        .unwrap_or_else(|| PathBuf::from(env!("CARGO_MANIFEST_DIR")));
    let runtime_root = std::env::var(SKILLCAPSULE_RUNTIME_ROOT_ENV)
        .ok()
        .map(PathBuf::from)
        .filter(|path| !path.as_os_str().is_empty())
        .unwrap_or_else(default_skill_capsule_runtime_root);
    let config_path = std::env::var(SKILLCAPSULE_CONFIG_PATH_ENV)
        .ok()
        .map(PathBuf::from)
        .filter(|path| !path.as_os_str().is_empty())
        .unwrap_or_else(|| {
            project_root
                .join(".skillcapsule")
                .join("skillcapsule.config.json")
        });
    let node_bin = std::env::var(SKILLCAPSULE_NODE_BIN_ENV)
        .ok()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_default();

    SkillCapsuleBridgeContext {
        node_bin,
        runtime_root,
        project_root,
        config_path,
    }
}

pub(super) fn validate_skill_capsule_node_bin(node_bin: &str) -> Result<(), String> {
    let trimmed = node_bin.trim();
    if trimmed.is_empty() {
        return Err(format!(
            "{} must be set to an absolute path for the Node runtime",
            SKILLCAPSULE_NODE_BIN_ENV
        ));
    }

    let has_shell_metacharacters = trimmed.contains(';')
        || trimmed.contains('&')
        || trimmed.contains('|')
        || trimmed.contains('`')
        || trimmed.contains('$')
        || trimmed.contains('\n')
        || trimmed.contains('\r')
        || trimmed.contains("..");
    if has_shell_metacharacters {
        return Err(format!(
            "{} '{}' is not allowed: shell metacharacters and traversal are forbidden",
            SKILLCAPSULE_NODE_BIN_ENV, trimmed
        ));
    }

    let path = PathBuf::from(trimmed);
    if !path.is_absolute() {
        return Err(format!(
            "{} '{}' is not allowed: must be an absolute path to a Node binary",
            SKILLCAPSULE_NODE_BIN_ENV, trimmed
        ));
    }

    let file_stem = path
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("");
    if !matches!(file_stem, "node" | "nodejs") {
        return Err(format!(
            "{} '{}' is not allowed: file name must resolve to node or nodejs",
            SKILLCAPSULE_NODE_BIN_ENV, trimmed
        ));
    }

    Ok(())
}

pub(super) fn ensure_skill_capsule_bridge_ready()
-> Result<SkillCapsuleBridgeContext, (StatusCode, String)> {
    let bridge = build_skill_capsule_bridge_context();

    // GAP-064: validate node_bin before using it as a process path. Reject paths
    // containing shell metacharacters, path traversal, or suspicious sequences.
    if let Err(reason) = validate_skill_capsule_node_bin(&bridge.node_bin) {
        tracing::error!(error = %reason, "Invalid skill capsule node binary configuration");
        return Err(internal_http_error(reason));
    }
    if !PathBuf::from(&bridge.node_bin).exists() {
        return Err((
            StatusCode::FAILED_DEPENDENCY,
            format!(
                "{} does not exist at {}",
                SKILLCAPSULE_NODE_BIN_ENV, bridge.node_bin
            ),
        ));
    }

    if !bridge.runtime_root.exists() {
        return Err((
            StatusCode::FAILED_DEPENDENCY,
            format!(
                "skill_capsule runtime root is unavailable at {}",
                bridge.runtime_root.display()
            ),
        ));
    }
    if !bridge.runtime_root.join("dist").join("runtime.js").exists() {
        return Err((
            StatusCode::FAILED_DEPENDENCY,
            format!(
                "skill_capsule build output is missing at {}",
                bridge
                    .runtime_root
                    .join("dist")
                    .join("runtime.js")
                    .display()
            ),
        ));
    }
    if !bridge.config_path.exists() {
        return Err((
            StatusCode::PRECONDITION_REQUIRED,
            format!(
                "skill_capsule is not initialized for this project; missing {}",
                bridge.config_path.display()
            ),
        ));
    }
    Ok(bridge)
}

pub(crate) async fn invoke_skill_capsule_operation(
    payload: Value,
) -> Result<Value, (StatusCode, String)> {
    let bridge = ensure_skill_capsule_bridge_ready()?;
    run_skill_capsule_operation(&bridge, payload).await
}

pub(crate) fn selected_reasoning_skill_guidance_for_user(
    user_id: &str,
) -> Result<Vec<String>, (StatusCode, String)> {
    let bridge = build_skill_capsule_bridge_context();
    let selection = load_workspace_skill_selection(&bridge.project_root, user_id)?;
    Ok(selected_reasoning_skill_guidance_from_ids(
        &selection.selected_skill_ids,
    ))
}

pub(crate) fn selected_workspace_skill_summaries_for_user(
    user_id: &str,
) -> Result<Vec<WorkspaceSkillSummary>, (StatusCode, String)> {
    let bridge = build_skill_capsule_bridge_context();
    let selection = load_workspace_skill_selection(&bridge.project_root, user_id)?;
    let catalog = skill_catalog_for_user(&bridge.project_root, user_id)?;
    Ok(selected_workspace_skill_summaries_from_catalog(
        &selection.selected_skill_ids,
        &catalog,
    ))
}

pub(super) fn selected_reasoning_skill_guidance_from_ids(
    selected_skill_ids: &[String],
) -> Vec<String> {
    let mut guidance = Vec::new();
    let selected: std::collections::HashSet<&str> =
        selected_skill_ids.iter().map(String::as_str).collect();
    if selected.contains("reasoning.react_grounded") {
        guidance.push(
            "Use a grounded thought-action-observation cadence for complex work. Do not invent unseen evidence; pivot based on actual tool observations.".to_string(),
        );
    }
    if selected.contains("reasoning.recommendation_debate") {
        guidance.push(
            "For recommendations, run a bounded internal debate across persona fit, discovery value, and quality critique before finalizing the answer.".to_string(),
        );
    }
    if selected.contains("reasoning.self_reflection_guard") {
        guidance.push(
            "Before surfacing high-stakes output, run a brief reflection pass for fact consistency, user constraints, and tone fit.".to_string(),
        );
    }
    guidance
}

pub(super) fn selected_workspace_skill_summaries_from_ids(
    selected_skill_ids: &[String],
) -> Vec<WorkspaceSkillSummary> {
    let catalog: Vec<SkillCapsuleCatalogItem> = SKILL_CAPSULE_CATALOG
        .iter()
        .map(SkillCapsuleCatalogItem::from)
        .collect();
    selected_workspace_skill_summaries_from_catalog(selected_skill_ids, &catalog)
}

pub(super) fn selected_workspace_skill_summaries_from_catalog(
    selected_skill_ids: &[String],
    catalog: &[SkillCapsuleCatalogItem],
) -> Vec<WorkspaceSkillSummary> {
    let selected: std::collections::HashSet<&str> =
        selected_skill_ids.iter().map(String::as_str).collect();
    catalog
        .iter()
        .filter(|entry| selected.contains(entry.id.as_str()))
        .map(|entry| WorkspaceSkillSummary {
            id: entry.id.clone(),
            title: entry.title.clone(),
            category: entry.category.clone(),
            capsule_kind: entry.capsule_kind.clone(),
            integration_mode: entry.integration_mode.clone(),
            surfaces: entry.surfaces.clone(),
        })
        .collect()
}

pub(super) fn workspace_skill_selection_path(project_root: &PathBuf, user_id: &str) -> PathBuf {
    // Per-user file so one user's selection cannot overwrite another's (GAP-065).
    let safe_uid = safe_user_scope_id(user_id);
    project_root
        .join(".skillcapsule")
        .join(format!("{safe_uid}.{OMNYID_WORKSPACE_SKILLS_FILE}"))
}

pub(super) fn load_workspace_skill_selection(
    project_root: &PathBuf,
    user_id: &str,
) -> Result<WorkspaceSkillSelection, (StatusCode, String)> {
    let path = workspace_skill_selection_path(project_root, user_id);
    if !path.exists() {
        return Ok(WorkspaceSkillSelection {
            selected_skill_ids: Vec::new(),
            updated_at: chrono::Utc::now().to_rfc3339(),
        });
    }
    let raw = std::fs::read_to_string(&path).map_err(|err| {
        tracing::error!(error = %err, path = %path.display(), "failed to read workspace skill selections");
        internal_http_error(err)
    })?;
    serde_json::from_str::<WorkspaceSkillSelection>(&raw).map_err(|err| {
        tracing::error!(error = %err, path = %path.display(), "workspace skill selections are invalid JSON");
        internal_http_error(err)
    })
}

pub(super) fn save_workspace_skill_selection(
    project_root: &PathBuf,
    user_id: &str,
    selected_skill_ids: Vec<String>,
) -> Result<WorkspaceSkillSelection, (StatusCode, String)> {
    let valid_ids = workspace_skill_catalog_ids(project_root, user_id)?;
    let mut deduped = Vec::new();
    let mut seen = std::collections::HashSet::new();
    for skill_id in selected_skill_ids {
        if !valid_ids.contains(&skill_id) {
            return Err((
                StatusCode::BAD_REQUEST,
                format!("unknown skill capsule id: {skill_id}"),
            ));
        }
        if seen.insert(skill_id.clone()) {
            deduped.push(skill_id);
        }
    }
    let selection = WorkspaceSkillSelection {
        selected_skill_ids: deduped,
        updated_at: chrono::Utc::now().to_rfc3339(),
    };
    let path = workspace_skill_selection_path(project_root, user_id);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|err| {
            tracing::error!(error = %err, path = %parent.display(), "failed to create workspace skill directory");
            internal_http_error(err)
        })?;
    }
    let payload = serde_json::to_string_pretty(&selection).map_err(internal_http_error)?;
    std::fs::write(&path, payload).map_err(|err| {
        tracing::error!(error = %err, path = %path.display(), "failed to persist workspace skill selection");
        internal_http_error(err)
    })?;
    Ok(selection)
}

pub(super) fn default_skill_capsule_runtime_root() -> PathBuf {
    StdPath::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap_or_else(|| StdPath::new(env!("CARGO_MANIFEST_DIR")))
        .join("skill_capsule")
}

pub(super) fn collect_skill_capsule_bridge_warnings(
    bridge: &SkillCapsuleBridgeContext,
) -> Vec<String> {
    let mut warnings = Vec::new();
    if !bridge.runtime_root.exists() {
        warnings.push(format!(
            "runtime root not found at {}",
            bridge.runtime_root.display()
        ));
    }
    if !bridge.runtime_root.join("dist").join("runtime.js").exists() {
        warnings.push(format!(
            "runtime build output missing at {}",
            bridge
                .runtime_root
                .join("dist")
                .join("runtime.js")
                .display()
        ));
    }
    if !bridge.config_path.exists() {
        warnings.push(format!(
            "project skill_capsule config missing at {}",
            bridge.config_path.display()
        ));
    }
    warnings
}

pub(super) fn artifact_query_to_value(query: SkillCapsuleArtifactQuery) -> Value {
    serde_json::json!({
        "kind": query.kind,
        "runId": query.run_id,
        "parentArtifactId": query.parent_artifact_id,
        "atomId": query.atom_id,
        "status": query.status,
        "taskType": query.task_type,
        "limit": query.limit,
    })
}

pub(super) async fn run_skill_capsule_operation(
    bridge: &SkillCapsuleBridgeContext,
    payload: Value,
) -> Result<Value, (StatusCode, String)> {
    let payload_string = serde_json::to_string(&payload).map_err(|err| {
        (
            StatusCode::BAD_REQUEST,
            format!("invalid skill payload: {err}"),
        )
    })?;
    // 30-second timeout prevents a hung node process from holding a request thread indefinitely (GAP-096).
    let output = tokio::time::timeout(
        skill_capsule_operation_timeout(),
        Command::new(&bridge.node_bin)
            .arg("-e")
            .arg(SKILLCAPSULE_BRIDGE_SCRIPT)
            .current_dir(&bridge.project_root)
            .env("OMNYID_SKILLCAPSULE_PAYLOAD", payload_string)
            .env("SKILLCAPSULE_RUNTIME_ROOT", &bridge.runtime_root)
            .env("SKILLCAPSULE_CONFIG_PATH", &bridge.config_path)
            .output(),
    )
    .await
    .map_err(|_| {
        (
            StatusCode::GATEWAY_TIMEOUT,
            "skill_capsule bridge timed out after 30 seconds".to_string(),
        )
    })?
    .map_err(|err| {
        tracing::error!(error = %err, "failed to launch skill_capsule bridge");
        (
            StatusCode::FAILED_DEPENDENCY,
            "failed to launch skill_capsule bridge".to_string(),
        )
    })?;

    if output.status.success() {
        let stdout = String::from_utf8_lossy(&output.stdout);
        let value = serde_json::from_str::<Value>(stdout.trim()).map_err(|err| {
            tracing::error!(error = %err, "skill_capsule bridge returned invalid JSON");
            (
                StatusCode::BAD_GATEWAY,
                "skill_capsule bridge returned invalid JSON".to_string(),
            )
        })?;
        return Ok(value);
    }

    let stderr = String::from_utf8_lossy(&output.stderr);
    let message = serde_json::from_str::<Value>(stderr.trim())
        .ok()
        .and_then(|value| {
            value
                .get("error")
                .and_then(|item| item.get("message"))
                .and_then(Value::as_str)
                .map(ToOwned::to_owned)
        })
        .unwrap_or_else(|| stderr.trim().to_string());
    Err((StatusCode::BAD_GATEWAY, message))
}

pub(super) fn skill_capsule_operation_timeout() -> std::time::Duration {
    std::time::Duration::from_secs(30)
}
