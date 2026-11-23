/*
 * @module-id: rust.server.agent-memory-routes
 * @primary-capability: rust.source-module
 * @locs-version: 2.0
 * @stability: active
 * @owner: omnyid
 */

use super::*;
use crate::agent_memory_store::{AgentMemoryLoadOptions, load_agent_memory};
use crate::empathetic_memory::{compute_resurfacing_score, explain_resurfacing};
use chrono::Utc;

pub(super) fn routes() -> Router<Arc<AppState>> {
    Router::new().route("/agent/{id}/memory", get(agent_memory_http))
}

#[derive(Debug, Default, Clone, serde::Deserialize, serde::Serialize)]
pub(super) struct AgentMemoryQuery {
    pub(super) tier: Option<String>,
    pub(super) limit: Option<u32>,
    pub(super) harness: Option<String>,
    #[serde(rename = "type")]
    pub(super) memory_type: Option<String>,
    pub(super) include_stale: Option<bool>,
    pub(super) token_budget: Option<u32>,
    pub(super) namespace: Option<String>,
    pub(super) memory_space: Option<String>,
    pub(super) author_mask: Option<String>,
    pub(super) author_type: Option<String>,
    pub(super) author_id: Option<String>,
    pub(super) is_human_authored: Option<bool>,
    pub(super) human_only: Option<bool>,
    pub(super) project: Option<String>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub(super) struct AgentMemoryItem {
    id: String,
    tier: String,
    #[serde(rename = "type")]
    memory_type: String,
    namespace: Option<String>,
    memory_space: Option<String>,
    author_mask: Option<String>,
    author_type: Option<String>,
    author_id: Option<String>,
    is_human_authored: Option<bool>,
    human_only: Option<bool>,
    content: String,
    confidence: f64,
    tags: Vec<String>,
    citations: Vec<String>,
    agent_id: String,
    role: String,
    project_id: String,
    valid_from: Option<String>,
    valid_until: Option<String>,
    superseded_by: Option<String>,
    repo_state_hash: Option<String>,
    status: String,
    created_at: String,
    updated_at: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    profile_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    emotional_signal: Option<crate::message::AfpEmotionalSignal>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    emotional_decay: Option<crate::message::AfpEmotionalDecay>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    resurfacing_score: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    resurfacing_reason: Option<String>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub(super) struct AgentMemoryEvidence {
    memory_id: String,
    kind: String,
    summary: Option<String>,
    created_at: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub(super) struct AgentMemoryWarning {
    code: String,
    memory_id: Option<String>,
    message: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub(super) struct AgentMemoryPointerBundleItem {
    pub(super) id: String,
    pub(super) tier: String,
    #[serde(rename = "type")]
    pub(super) memory_type: String,
    pub(super) content: String,
    pub(super) confidence: f64,
    pub(super) updated_at: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub(super) struct AgentMemoryPointerBundle {
    pub(super) harness: Option<String>,
    pub(super) token_budget: Option<u32>,
    pub(super) token_estimate: u32,
    pub(super) pointers_text: String,
    pub(super) items: Vec<AgentMemoryPointerBundleItem>,
    pub(super) evidence: Vec<AgentMemoryEvidence>,
    pub(super) warnings: Vec<AgentMemoryWarning>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub(super) struct AgentMemoryResponse {
    configured: bool,
    available: bool,
    source: String,
    agent_id: String,
    query: AgentMemoryQuery,
    items: Vec<AgentMemoryItem>,
    evidence: Vec<AgentMemoryEvidence>,
    warnings: Vec<AgentMemoryWarning>,
    pointer_bundle: Option<AgentMemoryPointerBundle>,
    message: Option<String>,
}

fn with_resurfacing_metadata(
    mut items: Vec<AgentMemoryItem>,
    active_profile_id: Option<&str>,
    query: &AgentMemoryQuery,
) -> Vec<AgentMemoryItem> {
    let now = Utc::now();
    for item in &mut items {
        let metadata = crate::message::AfpEmpatheticMetadata {
            profile_id: item.profile_id.clone(),
            emotional_signal: item.emotional_signal.clone(),
            emotional_decay: item.emotional_decay.clone(),
        };
        let breakdown = compute_resurfacing_score(
            item.confidence,
            metadata.emotional_signal.as_ref(),
            metadata.emotional_decay.as_ref(),
            context_match_multiplier(item, query),
            active_profile_id,
            metadata.profile_id.as_deref(),
            now,
        );
        item.resurfacing_score = Some(breakdown.score);
        item.resurfacing_reason = Some(explain_resurfacing(
            metadata.emotional_signal.as_ref(),
            metadata.emotional_decay.as_ref(),
            active_profile_id,
            metadata.profile_id.as_deref(),
        ));
    }
    items.sort_by(|left, right| {
        right
            .resurfacing_score
            .partial_cmp(&left.resurfacing_score)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    items
}

fn context_match_multiplier(item: &AgentMemoryItem, query: &AgentMemoryQuery) -> f64 {
    let mut score = 1.0_f64;
    if query
        .project
        .as_deref()
        .is_some_and(|project| item.project_id == project)
    {
        score += 0.3;
    }
    if query
        .namespace
        .as_deref()
        .is_some_and(|namespace| item.namespace.as_deref() == Some(namespace))
    {
        score += 0.15;
    }
    if query
        .memory_space
        .as_deref()
        .is_some_and(|memory_space| item.memory_space.as_deref() == Some(memory_space))
    {
        score += 0.15;
    }
    if query
        .author_mask
        .as_deref()
        .is_some_and(|author_mask| item.author_mask.as_deref() == Some(author_mask))
    {
        score += 0.1;
    }
    if query
        .author_type
        .as_deref()
        .is_some_and(|author_type| item.author_type.as_deref() == Some(author_type))
    {
        score += 0.1;
    }
    if query
        .author_id
        .as_deref()
        .is_some_and(|author_id| item.author_id.as_deref() == Some(author_id))
    {
        score += 0.1;
    }
    if query
        .memory_type
        .as_deref()
        .is_some_and(|memory_type| item.memory_type == memory_type)
    {
        score += 0.1;
    }
    score.clamp(1.0, 2.0)
}

fn estimate_pointer_tokens(text: &str) -> u32 {
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

fn agent_memory_item_limit(limit: Option<u32>) -> u32 {
    limit.unwrap_or(24).clamp(1, 100)
}

fn build_ranked_pointer_bundle(
    items: &[AgentMemoryItem],
    harness: Option<&str>,
    token_budget: Option<u32>,
) -> Option<AgentMemoryPointerBundle> {
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
        let line_tokens = estimate_pointer_tokens(&line);
        if !selected.is_empty() && token_estimate.saturating_add(line_tokens) > budget {
            break;
        }
        token_estimate = token_estimate.saturating_add(line_tokens);
        lines.push(line);
        selected.push(AgentMemoryPointerBundleItem {
            id: item.id.clone(),
            tier: item.tier.clone(),
            memory_type: item.memory_type.clone(),
            content: item.content.clone(),
            confidence: item.confidence,
            updated_at: item.updated_at.clone(),
        });
    }

    Some(AgentMemoryPointerBundle {
        harness: harness.map(str::to_string),
        token_budget: token_budget.map(|value| value.max(60)),
        token_estimate,
        pointers_text: lines.join("\n"),
        items: selected,
        evidence: Vec::new(),
        warnings: Vec::new(),
    })
}

async fn agent_memory_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(agent_id): Path<String>,
    Query(query): Query<AgentMemoryQuery>,
) -> Result<Json<AgentMemoryResponse>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let load_options = AgentMemoryLoadOptions {
        tier: query.tier.clone(),
        memory_type: query.memory_type.clone(),
        include_stale: query.include_stale.unwrap_or(false),
        limit: agent_memory_item_limit(query.limit),
        namespace: query.namespace.clone(),
        memory_space: query.memory_space.clone(),
        author_mask: query.author_mask.clone(),
        author_type: query.author_type.clone(),
        author_id: query.author_id.clone(),
        is_human_authored: query.is_human_authored,
        human_only: query.human_only,
        project: query.project.clone(),
        harness: query.harness.clone(),
        token_budget: query.token_budget,
        agent_id: Some(agent_id.clone()),
    };
    let pointer_harness = query.harness.clone();
    let pointer_token_budget = query.token_budget;
    let loaded = load_agent_memory(&state.db, &user.id, &load_options)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    let configured = !loaded.items.is_empty();
    let crate::agent_memory_store::LoadedAgentMemoryResult {
        items,
        warnings,
        pointer_bundle: _,
        active_profile_id,
    } = loaded;
    let reranked_items = with_resurfacing_metadata(
        items
            .into_iter()
            .map(|item| AgentMemoryItem {
                id: item.id,
                tier: item.tier,
                memory_type: item.memory_type,
                namespace: item.namespace,
                memory_space: item.memory_space,
                author_mask: item.author_mask,
                author_type: item.author_type,
                author_id: item.author_id,
                is_human_authored: item.is_human_authored,
                human_only: item.human_only,
                content: item.content,
                confidence: item.confidence,
                tags: item.tags,
                citations: item.citations,
                agent_id: item.agent_id,
                role: item.role,
                project_id: item.project_id,
                valid_from: item.valid_from,
                valid_until: item.valid_until,
                superseded_by: item.superseded_by,
                repo_state_hash: item.repo_state_hash,
                status: item.status,
                created_at: item.created_at,
                updated_at: item.updated_at,
                profile_id: item.profile_id,
                emotional_signal: item.emotional_signal,
                emotional_decay: item.emotional_decay,
                resurfacing_score: None,
                resurfacing_reason: None,
            })
            .collect(),
        active_profile_id.as_deref(),
        &query,
    );
    Ok(Json(AgentMemoryResponse {
        configured,
        available: configured,
        source: "native_ledger".to_string(),
        agent_id,
        query,
        items: reranked_items.clone(),
        evidence: Vec::new(),
        warnings: warnings
            .into_iter()
            .map(|warning| AgentMemoryWarning {
                code: warning.code,
                memory_id: warning.memory_id,
                message: warning.message,
            })
            .collect(),
        pointer_bundle: build_ranked_pointer_bundle(
            &reranked_items,
            pointer_harness.as_deref(),
            pointer_token_budget,
        ),
        message: if configured {
            None
        } else {
            Some(
                "No stored agent memory found yet. Store AFP messages of type \"agent_memory\" to populate this view."
                    .to_string(),
            )
        },
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_item(id: &str) -> AgentMemoryItem {
        AgentMemoryItem {
            id: id.to_string(),
            tier: "project".to_string(),
            memory_type: "preference".to_string(),
            namespace: Some("agent".to_string()),
            memory_space: Some("personal".to_string()),
            author_mask: Some("private".to_string()),
            author_type: Some("human".to_string()),
            author_id: Some("user_1".to_string()),
            is_human_authored: Some(true),
            human_only: Some(false),
            content: format!("{id} content"),
            confidence: 0.7,
            tags: Vec::new(),
            citations: Vec::new(),
            agent_id: "master".to_string(),
            role: "continuity".to_string(),
            project_id: "aurora".to_string(),
            valid_from: None,
            valid_until: None,
            superseded_by: None,
            repo_state_hash: None,
            status: "active".to_string(),
            created_at: "2026-06-01T10:00:00Z".to_string(),
            updated_at: "2026-06-01T10:00:00Z".to_string(),
            profile_id: Some("profile_a".to_string()),
            emotional_signal: None,
            emotional_decay: None,
            resurfacing_score: None,
            resurfacing_reason: None,
        }
    }

    #[test]
    fn context_match_multiplier_rewards_matching_query_scope() {
        let item = sample_item("mem_1");
        let query = AgentMemoryQuery {
            project: Some("aurora".to_string()),
            namespace: Some("agent".to_string()),
            memory_space: Some("personal".to_string()),
            author_mask: Some("private".to_string()),
            author_type: Some("human".to_string()),
            author_id: Some("user_1".to_string()),
            ..AgentMemoryQuery::default()
        };

        assert!(context_match_multiplier(&item, &query) > 1.0);
    }

    #[test]
    fn build_ranked_pointer_bundle_preserves_reranked_order() {
        let items = vec![sample_item("mem_high"), sample_item("mem_low")];
        let bundle = build_ranked_pointer_bundle(&items, Some("handoff"), Some(120)).unwrap();

        assert_eq!(
            bundle.items.first().map(|item| item.id.as_str()),
            Some("mem_high")
        );
        assert!(bundle.pointers_text.contains("mem_high content"));
    }

    #[test]
    fn agent_memory_item_limit_is_bounded() {
        assert_eq!(agent_memory_item_limit(None), 24);
        assert_eq!(agent_memory_item_limit(Some(0)), 1);
        assert_eq!(agent_memory_item_limit(Some(32)), 32);
        assert_eq!(agent_memory_item_limit(Some(10_000)), 100);
    }
}
