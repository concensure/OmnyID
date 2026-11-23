/*
 * @module-id: rust.agent-memory-store
 * @primary-capability: rust.source-module
 * @locs-version: 2.0
 * @stability: active
 * @owner: omnyid
 */

use chrono::{DateTime, Utc};
use serde_json::Value;
use sqlx::Row;

use crate::{
    db::Db,
    empathetic_memory::extract_empathetic_metadata,
    message::{
        AFP_TYPE_AGENT_MEMORY, AFP_TYPE_PERSONA_STATE, AfpAgentMemoryContent, AfpEmotionalDecay,
        AfpEmotionalSignal, AfpPersonaStateContent,
    },
};

const DEFAULT_LOOKBACK_MULTIPLIER: u32 = 4;
const MAX_LOOKBACK_ITEMS: u32 = 200;
const DEFAULT_CONFIDENCE: f64 = 0.7;

#[derive(Debug, Clone, Default)]
pub struct AgentMemoryLoadOptions {
    pub tier: Option<String>,
    pub memory_type: Option<String>,
    pub include_stale: bool,
    pub limit: u32,
    pub namespace: Option<String>,
    pub memory_space: Option<String>,
    pub author_mask: Option<String>,
    pub author_type: Option<String>,
    pub author_id: Option<String>,
    pub is_human_authored: Option<bool>,
    pub human_only: Option<bool>,
    pub project: Option<String>,
    pub harness: Option<String>,
    pub token_budget: Option<u32>,
    pub agent_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct LoadedAgentMemoryItem {
    pub id: String,
    pub tier: String,
    pub memory_type: String,
    pub namespace: Option<String>,
    pub memory_space: Option<String>,
    pub author_mask: Option<String>,
    pub author_type: Option<String>,
    pub author_id: Option<String>,
    pub is_human_authored: Option<bool>,
    pub human_only: Option<bool>,
    pub content: String,
    pub confidence: f64,
    pub tags: Vec<String>,
    pub citations: Vec<String>,
    pub agent_id: String,
    pub role: String,
    pub project_id: String,
    pub valid_from: Option<String>,
    pub valid_until: Option<String>,
    pub superseded_by: Option<String>,
    pub repo_state_hash: Option<String>,
    pub status: String,
    pub created_at: String,
    pub updated_at: String,
    pub profile_id: Option<String>,
    pub emotional_signal: Option<AfpEmotionalSignal>,
    pub emotional_decay: Option<AfpEmotionalDecay>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct LoadedAgentMemoryWarning {
    pub code: String,
    pub memory_id: Option<String>,
    pub message: String,
}

#[derive(Debug, Clone, PartialEq)]
pub struct LoadedAgentMemoryPointerBundleItem {
    pub id: String,
    pub tier: String,
    pub memory_type: String,
    pub content: String,
    pub confidence: f64,
    pub updated_at: String,
}

#[derive(Debug, Clone, PartialEq)]
pub struct LoadedAgentMemoryPointerBundle {
    pub harness: Option<String>,
    pub token_budget: Option<u32>,
    pub token_estimate: u32,
    pub pointers_text: String,
    pub items: Vec<LoadedAgentMemoryPointerBundleItem>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct LoadedAgentMemoryResult {
    pub items: Vec<LoadedAgentMemoryItem>,
    pub warnings: Vec<LoadedAgentMemoryWarning>,
    pub pointer_bundle: Option<LoadedAgentMemoryPointerBundle>,
    pub active_profile_id: Option<String>,
}

pub async fn load_agent_memory(
    db: &Db,
    user_id: &str,
    options: &AgentMemoryLoadOptions,
) -> Result<LoadedAgentMemoryResult, sqlx::Error> {
    let lookback_limit = options
        .limit
        .max(1)
        .saturating_mul(DEFAULT_LOOKBACK_MULTIPLIER)
        .min(MAX_LOOKBACK_ITEMS) as i64;
    let rows = sqlx::query(
        r#"
        SELECT id, content, metadata, timestamp::text AS timestamp
        FROM messages
        WHERE type = $2
          AND $1 = ANY(SELECT jsonb_array_elements_text(to_agents))
        ORDER BY timestamp DESC
        LIMIT $3
        "#,
    )
    .bind(user_id)
    .bind(AFP_TYPE_AGENT_MEMORY)
    .bind(lookback_limit)
    .fetch_all(&db.pool)
    .await?;

    let active_profile_id = load_active_profile_id(db, user_id).await?;
    let mut warnings = Vec::new();
    let mut items = Vec::new();
    let now = Utc::now();

    for row in rows {
        let id = row.try_get::<String, _>("id").unwrap_or_default();
        let content = row.try_get::<Value, _>("content").unwrap_or(Value::Null);
        let metadata = row.try_get::<Value, _>("metadata").unwrap_or(Value::Null);
        let timestamp = row.try_get::<String, _>("timestamp").unwrap_or_default();
        let Ok(content) = serde_json::from_value::<AfpAgentMemoryContent>(content) else {
            warnings.push(LoadedAgentMemoryWarning {
                code: "invalid_agent_memory_content".to_string(),
                memory_id: Some(id),
                message: "Skipped an agent_memory AFP with invalid content.".to_string(),
            });
            continue;
        };

        let raw_metadata = metadata.as_object();
        let empathetic = extract_empathetic_metadata(Some(&metadata));
        let tier = metadata_string(raw_metadata, "tier").unwrap_or_else(|| "project".to_string());
        let memory_type = content.kind.clone();
        let namespace = metadata_string(raw_metadata, "namespace");
        let memory_space = derive_memory_space(raw_metadata, &content);
        let author_mask = derive_author_mask(raw_metadata);
        let author_type = metadata_string(raw_metadata, "author_type");
        let author_id = metadata_string(raw_metadata, "author_id");
        let is_human_authored = metadata_bool(raw_metadata, "is_human_authored");
        let human_only = metadata_bool(raw_metadata, "human_only");
        let project_id = metadata_string(raw_metadata, "project_id")
            .or_else(|| options.project.clone())
            .unwrap_or_else(|| "default".to_string());
        let agent_id = metadata_string(raw_metadata, "agent_id")
            .or_else(|| options.agent_id.clone())
            .unwrap_or_else(|| "master".to_string());
        let role =
            metadata_string(raw_metadata, "role").unwrap_or_else(|| "continuity".to_string());
        let valid_from = metadata_string(raw_metadata, "valid_from");
        let valid_until = metadata_string(raw_metadata, "valid_until");
        let superseded_by = metadata_string(raw_metadata, "superseded_by");
        let repo_state_hash = metadata_string(raw_metadata, "repo_state_hash");
        let status = derive_status(valid_until.as_deref(), superseded_by.as_deref(), now);

        let item = LoadedAgentMemoryItem {
            id,
            tier,
            memory_type,
            namespace,
            memory_space,
            author_mask,
            author_type,
            author_id,
            is_human_authored,
            human_only,
            content: render_memory_content(&content),
            confidence: metadata_f64(raw_metadata, "confidence").unwrap_or(
                empathetic
                    .emotional_signal
                    .as_ref()
                    .and_then(|signal| signal.confidence)
                    .unwrap_or(DEFAULT_CONFIDENCE),
            ),
            tags: content.tags,
            citations: content.source_message_ids,
            agent_id,
            role,
            project_id,
            valid_from,
            valid_until,
            superseded_by,
            repo_state_hash,
            status,
            created_at: timestamp.clone(),
            updated_at: timestamp,
            profile_id: empathetic.profile_id,
            emotional_signal: empathetic.emotional_signal,
            emotional_decay: empathetic.emotional_decay,
        };

        if matches_filters(&item, options) {
            items.push(item);
        }
    }

    items.sort_by(|left, right| right.updated_at.cmp(&left.updated_at));
    items.truncate(options.limit.max(1) as usize);

    let pointer_bundle =
        build_pointer_bundle(&items, options.harness.as_deref(), options.token_budget);

    Ok(LoadedAgentMemoryResult {
        items,
        warnings,
        pointer_bundle,
        active_profile_id,
    })
}

async fn load_active_profile_id(db: &Db, user_id: &str) -> Result<Option<String>, sqlx::Error> {
    let row = sqlx::query(
        r#"
        SELECT content
        FROM messages
        WHERE type = $2
          AND $1 = ANY(SELECT jsonb_array_elements_text(to_agents))
        ORDER BY timestamp DESC
        LIMIT 1
        "#,
    )
    .bind(user_id)
    .bind(AFP_TYPE_PERSONA_STATE)
    .fetch_optional(&db.pool)
    .await?;

    let Some(row) = row else {
        return Ok(None);
    };

    let content = row.try_get::<Value, _>("content").unwrap_or(Value::Null);
    let persona = serde_json::from_value::<AfpPersonaStateContent>(content).ok();
    Ok(persona.map(|persona| persona.profile_id))
}

fn matches_filters(item: &LoadedAgentMemoryItem, options: &AgentMemoryLoadOptions) -> bool {
    if let Some(tier) = options.tier.as_deref() {
        if item.tier != tier {
            return false;
        }
    }
    if let Some(memory_type) = options.memory_type.as_deref() {
        if item.memory_type != memory_type {
            return false;
        }
    }
    if let Some(namespace) = options.namespace.as_deref() {
        if item.namespace.as_deref() != Some(namespace) {
            return false;
        }
    }
    if let Some(memory_space) = options.memory_space.as_deref() {
        if item.memory_space.as_deref() != Some(memory_space) {
            return false;
        }
    }
    if let Some(author_mask) = options.author_mask.as_deref() {
        if item.author_mask.as_deref() != Some(author_mask) {
            return false;
        }
    }
    if let Some(author_type) = options.author_type.as_deref() {
        if item.author_type.as_deref() != Some(author_type) {
            return false;
        }
    }
    if let Some(author_id) = options.author_id.as_deref() {
        if item.author_id.as_deref() != Some(author_id) {
            return false;
        }
    }
    if let Some(is_human_authored) = options.is_human_authored {
        if item.is_human_authored != Some(is_human_authored) {
            return false;
        }
    }
    if let Some(human_only) = options.human_only {
        if item.human_only != Some(human_only) {
            return false;
        }
    }
    if let Some(project) = options.project.as_deref() {
        if item.project_id != project {
            return false;
        }
    }
    if let Some(agent_id) = options.agent_id.as_deref() {
        if item.agent_id != agent_id {
            return false;
        }
    }
    if !options.include_stale && item.status != "active" {
        return false;
    }
    true
}

fn derive_status(
    valid_until: Option<&str>,
    superseded_by: Option<&str>,
    now: DateTime<Utc>,
) -> String {
    if superseded_by.is_some() {
        return "superseded".to_string();
    }
    if valid_until
        .and_then(parse_rfc3339_utc)
        .is_some_and(|valid_until| valid_until < now)
    {
        return "stale".to_string();
    }
    "active".to_string()
}

fn render_memory_content(content: &AfpAgentMemoryContent) -> String {
    match content.detail.as_deref() {
        Some(detail) if !detail.trim().is_empty() => format!("{} â€” {}", content.summary, detail),
        _ => content.summary.clone(),
    }
}

fn build_pointer_bundle(
    items: &[LoadedAgentMemoryItem],
    harness: Option<&str>,
    token_budget: Option<u32>,
) -> Option<LoadedAgentMemoryPointerBundle> {
    if items.is_empty() {
        return None;
    }

    let budget = token_budget.unwrap_or(240).max(60);
    let mut selected = Vec::new();
    let mut lines = Vec::new();
    let mut token_estimate = 0u32;

    for item in items {
        let line = format!(
            "- [{}:{}] {}",
            item.tier,
            item.memory_type,
            truncate_pointer_text(&item.content, 160)
        );
        let line_tokens = estimate_tokens(&line);
        if !selected.is_empty() && token_estimate.saturating_add(line_tokens) > budget {
            break;
        }
        token_estimate = token_estimate.saturating_add(line_tokens);
        lines.push(line);
        selected.push(LoadedAgentMemoryPointerBundleItem {
            id: item.id.clone(),
            tier: item.tier.clone(),
            memory_type: item.memory_type.clone(),
            content: item.content.clone(),
            confidence: item.confidence,
            updated_at: item.updated_at.clone(),
        });
    }

    Some(LoadedAgentMemoryPointerBundle {
        harness: harness.map(str::to_string),
        token_budget: token_budget.map(|value| value.max(60)),
        token_estimate,
        pointers_text: lines.join("\n"),
        items: selected,
    })
}

fn metadata_string(metadata: Option<&serde_json::Map<String, Value>>, key: &str) -> Option<String> {
    metadata
        .and_then(|metadata| metadata.get(key))
        .and_then(Value::as_str)
        .map(str::to_string)
}

fn metadata_f64(metadata: Option<&serde_json::Map<String, Value>>, key: &str) -> Option<f64> {
    metadata
        .and_then(|metadata| metadata.get(key))
        .and_then(Value::as_f64)
}

fn metadata_bool(metadata: Option<&serde_json::Map<String, Value>>, key: &str) -> Option<bool> {
    metadata
        .and_then(|metadata| metadata.get(key))
        .and_then(Value::as_bool)
}

fn derive_memory_space(
    metadata: Option<&serde_json::Map<String, Value>>,
    content: &AfpAgentMemoryContent,
) -> Option<String> {
    metadata_string(metadata, "memory_space")
        .or_else(|| metadata_string(metadata, "workspace_memory"))
        .or_else(|| content.namespace.clone())
}

fn derive_author_mask(metadata: Option<&serde_json::Map<String, Value>>) -> Option<String> {
    metadata_string(metadata, "author_mask").or_else(|| metadata_string(metadata, "mask"))
}

fn parse_rfc3339_utc(value: &str) -> Option<DateTime<Utc>> {
    DateTime::parse_from_rfc3339(value)
        .ok()
        .map(|timestamp| timestamp.with_timezone(&Utc))
}

fn estimate_tokens(text: &str) -> u32 {
    ((text.split_whitespace().count() as f64) * 1.35).ceil() as u32
}

fn truncate_pointer_text(text: &str, max_chars: usize) -> String {
    if text.chars().count() <= max_chars {
        return text.to_string();
    }
    text.chars()
        .take(max_chars.saturating_sub(3))
        .collect::<String>()
        + "..."
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn sample_item(status: &str) -> LoadedAgentMemoryItem {
        LoadedAgentMemoryItem {
            id: "mem_1".to_string(),
            tier: "project".to_string(),
            memory_type: "preference".to_string(),
            namespace: Some("agent".to_string()),
            memory_space: Some("personal".to_string()),
            author_mask: Some("private".to_string()),
            author_type: Some("agent".to_string()),
            author_id: Some("master".to_string()),
            is_human_authored: Some(false),
            human_only: Some(false),
            content: "Prefers concise handoffs.".to_string(),
            confidence: 0.9,
            tags: vec!["handoff".to_string()],
            citations: vec![],
            agent_id: "master".to_string(),
            role: "continuity".to_string(),
            project_id: "default".to_string(),
            valid_from: None,
            valid_until: None,
            superseded_by: None,
            repo_state_hash: None,
            status: status.to_string(),
            created_at: "2026-05-28T10:00:00Z".to_string(),
            updated_at: "2026-05-28T10:00:00Z".to_string(),
            profile_id: None,
            emotional_signal: None,
            emotional_decay: None,
        }
    }

    #[test]
    fn derive_status_marks_superseded_before_stale() {
        let now = DateTime::parse_from_rfc3339("2026-05-28T11:30:00Z")
            .unwrap()
            .with_timezone(&Utc);
        let status = derive_status(Some("2026-05-20T11:30:00Z"), Some("mem_2"), now);
        assert_eq!(status, "superseded");
    }

    #[test]
    fn matches_filters_excludes_stale_by_default() {
        let options = AgentMemoryLoadOptions {
            include_stale: false,
            limit: 10,
            ..AgentMemoryLoadOptions::default()
        };
        assert!(!matches_filters(&sample_item("stale"), &options));
        assert!(matches_filters(&sample_item("active"), &options));
    }

    #[test]
    fn build_pointer_bundle_respects_budget() {
        let items = vec![
            sample_item("active"),
            LoadedAgentMemoryItem {
                id: "mem_2".to_string(),
                content: "Tracks a longer secondary note ".repeat(40),
                ..sample_item("active")
            },
        ];
        let bundle = build_pointer_bundle(&items, Some("handoff"), Some(20)).unwrap();
        assert!(!bundle.items.is_empty());
        assert!(bundle.token_estimate <= 60);
        assert!(bundle.pointers_text.contains("Prefers concise handoffs."));
    }

    #[test]
    fn matches_filters_can_partition_memory_by_space_and_mask() {
        let item = sample_item("active");
        let matching = AgentMemoryLoadOptions {
            include_stale: false,
            limit: 10,
            memory_space: Some("personal".to_string()),
            author_mask: Some("private".to_string()),
            ..AgentMemoryLoadOptions::default()
        };
        let wrong_space = AgentMemoryLoadOptions {
            include_stale: false,
            limit: 10,
            memory_space: Some("work".to_string()),
            ..AgentMemoryLoadOptions::default()
        };
        let wrong_mask = AgentMemoryLoadOptions {
            include_stale: false,
            limit: 10,
            author_mask: Some("public".to_string()),
            ..AgentMemoryLoadOptions::default()
        };

        assert!(matches_filters(&item, &matching));
        assert!(!matches_filters(&item, &wrong_space));
        assert!(!matches_filters(&item, &wrong_mask));
    }

    #[test]
    fn matches_filters_can_partition_memory_by_origin_flags() {
        let mut item = sample_item("active");
        item.author_type = Some("human".to_string());
        item.author_id = Some("user_root".to_string());
        item.is_human_authored = Some(true);
        item.human_only = Some(true);

        let matching = AgentMemoryLoadOptions {
            include_stale: false,
            limit: 10,
            author_type: Some("human".to_string()),
            author_id: Some("user_root".to_string()),
            is_human_authored: Some(true),
            human_only: Some(true),
            ..AgentMemoryLoadOptions::default()
        };
        let wrong_author_type = AgentMemoryLoadOptions {
            include_stale: false,
            limit: 10,
            author_type: Some("agent".to_string()),
            ..AgentMemoryLoadOptions::default()
        };
        let wrong_human_only = AgentMemoryLoadOptions {
            include_stale: false,
            limit: 10,
            human_only: Some(false),
            ..AgentMemoryLoadOptions::default()
        };

        assert!(matches_filters(&item, &matching));
        assert!(!matches_filters(&item, &wrong_author_type));
        assert!(!matches_filters(&item, &wrong_human_only));
    }

    #[test]
    fn derive_memory_space_prefers_explicit_workspace_then_namespace() {
        let content = AfpAgentMemoryContent {
            kind: "preference".to_string(),
            summary: "Summary".to_string(),
            detail: None,
            tags: vec![],
            source_message_ids: vec![],
            namespace: Some("personal".to_string()),
        };
        let metadata = json!({
            "workspace_memory": "work",
            "memory_space": "project_aurora"
        });

        assert_eq!(
            derive_memory_space(metadata.as_object(), &content),
            Some("project_aurora".to_string())
        );

        let workspace_only = json!({
            "workspace_memory": "work"
        });
        assert_eq!(
            derive_memory_space(workspace_only.as_object(), &content),
            Some("work".to_string())
        );

        assert_eq!(
            derive_memory_space(None, &content),
            Some("personal".to_string())
        );
    }

    #[test]
    fn derive_author_mask_falls_back_to_legacy_mask_key() {
        let metadata = json!({
            "mask": "private"
        });
        assert_eq!(
            derive_author_mask(metadata.as_object()),
            Some("private".to_string())
        );

        let explicit = json!({
            "mask": "private",
            "author_mask": "work"
        });
        assert_eq!(
            derive_author_mask(explicit.as_object()),
            Some("work".to_string())
        );
    }

    #[test]
    fn metadata_bool_reads_optional_origin_flags() {
        let metadata = json!({
            "is_human_authored": true,
            "human_only": false
        });
        assert_eq!(
            metadata_bool(metadata.as_object(), "is_human_authored"),
            Some(true)
        );
        assert_eq!(
            metadata_bool(metadata.as_object(), "human_only"),
            Some(false)
        );
        assert_eq!(metadata_bool(metadata.as_object(), "missing"), None);
    }
}
