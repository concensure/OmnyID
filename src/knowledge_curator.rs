// Phase 11: Knowledge Curator daemon contract.
//
// The Knowledge Curator is a background sub-agent that converts every new AFP
// message into structured, connected, searchable knowledge.  It is spawned by
// the Master Agent with a delegated key scoped to the AFP message types listed
// in `CuratorPolicy::allowed_message_types()`.
//
// Nothing in this file performs I/O or calls async runtime directly.  It
// defines the event contract, policy types, and audit structures that the
// running server wires together via `src/server.rs`.

use std::collections::{BTreeSet, HashMap};

use crate::message::AFPMessage;
use serde::{Deserialize, Serialize};

// ---------------------------------------------------------------------------
// Daemon identity and lifecycle
// ---------------------------------------------------------------------------

/// Which background daemon kind a registration represents.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum DaemonKind {
    KnowledgeCurator,
    EmailGateway,
    RelationalSync,
    ArchiveColdStorage,
    HealthMaintenance,
}

impl DaemonKind {
    /// AFP message types this daemon is permitted to write.
    /// The policy engine enforces this list for every outbound write.
    pub fn allowed_message_types(&self) -> &'static [&'static str] {
        match self {
            DaemonKind::KnowledgeCurator => &[
                "backlink_update",
                "knowledge_card",
                "insight",
                "merge_suggestion",
                "daemon_heartbeat",
            ],
            DaemonKind::EmailGateway => &[
                "email_incoming",
                "email_outgoing",
                "action_reply",
                "action_forward",
                "daemon_heartbeat",
            ],
            DaemonKind::RelationalSync => &["sync_error", "daemon_heartbeat"],
            DaemonKind::ArchiveColdStorage => &["archived_notice", "daemon_heartbeat"],
            DaemonKind::HealthMaintenance => &[
                "merge_suggestion",
                "insight",
                "system_health",
                "daemon_heartbeat",
            ],
        }
    }

    /// Human-readable name for display in the workflow builder palette.
    pub fn display_name(&self) -> &'static str {
        match self {
            DaemonKind::KnowledgeCurator => "Knowledge Curator",
            DaemonKind::EmailGateway => "Email Gateway",
            DaemonKind::RelationalSync => "Relational Sync",
            DaemonKind::ArchiveColdStorage => "Archive & Cold Storage",
            DaemonKind::HealthMaintenance => "Health & Maintenance",
        }
    }
}

/// A running daemon registration — mirrors the `daemon_registrations` Postgres table.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct DaemonRegistration {
    pub daemon_id: String,
    pub user_id: String,
    pub daemon_kind: DaemonKind,
    pub workflow_id: Option<String>,
    pub delegated_key_id: String,
    pub status: DaemonStatus,
    pub policy_config: CuratorPolicy,
    pub last_heartbeat_at: Option<String>,
    pub created_at: String,
    pub revoked_at: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum DaemonStatus {
    Active,
    Paused,
    Revoked,
}

// ---------------------------------------------------------------------------
// Knowledge Curator policy
// ---------------------------------------------------------------------------

/// Policy constraints applied to every Knowledge Curator run.
/// Stored in `daemon_registrations.policy_config` as JSONB.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct CuratorPolicy {
    /// Maximum curator events processed per hour per user.
    pub max_events_per_hour: u32,
    /// Maximum LLM tokens the curator may consume per day.
    pub max_tokens_per_day: u32,
    /// Cosine similarity threshold for backlink creation (0.0–1.0).
    pub backlink_similarity_threshold: f32,
    /// Whether the curator is allowed to write knowledge cards (LLM calls).
    pub knowledge_cards_enabled: bool,
    /// Whether the curator may generate insight messages (periodic deep run).
    pub insights_enabled: bool,
    /// Whether the curator may propose merge suggestions to the user.
    pub merge_suggestions_enabled: bool,
    /// If the source message is encrypted, encrypt the output with the same key material.
    pub preserve_e2ee: bool,
}

impl Default for CuratorPolicy {
    fn default() -> Self {
        Self {
            max_events_per_hour: 500,
            max_tokens_per_day: 100_000,
            backlink_similarity_threshold: 0.82,
            knowledge_cards_enabled: true,
            insights_enabled: true,
            merge_suggestions_enabled: true,
            preserve_e2ee: true,
        }
    }
}

// ---------------------------------------------------------------------------
// Curator trigger event
// ---------------------------------------------------------------------------

/// What caused the curator to wake up.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum CuratorTriggerKind {
    /// A new AFP message arrived via ElectricSQL change-stream.
    NewMessage,
    /// Periodic deep maintenance during an idle window.
    DeepMaintenance,
    /// Forced re-index of an older message range.
    Reindex,
}

/// The input to a single curator processing run.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct CuratorTrigger {
    pub run_id: String,
    pub daemon_id: String,
    pub user_id: String,
    pub trigger_kind: CuratorTriggerKind,
    /// AFP message id that caused this run (None for DeepMaintenance / Reindex).
    pub source_message_id: Option<String>,
    /// For Reindex triggers: the date range to re-process.
    pub reindex_window_days: Option<u32>,
    pub triggered_at: String,
}

// ---------------------------------------------------------------------------
// Backlink types
// ---------------------------------------------------------------------------

/// The kind of relationship a backlink edge represents.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum BacklinkKind {
    SemanticSimilarity,
    EntityOverlap,
    ExplicitRef,
    TemporalProximity,
}

/// A single backlink edge created by the curator.
/// Both the source→target and target→source edges are written as separate AFP messages
/// (type: `backlink_update`) so the graph is bidirectional in the AFP layer.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct BacklinkRecord {
    pub backlink_id: String,
    pub user_id: String,
    pub source_id: String,
    pub target_id: String,
    pub link_kind: BacklinkKind,
    /// Cosine similarity score; None for non-vector link kinds.
    pub similarity: Option<f32>,
    /// Named entities shared between source and target (for EntityOverlap links).
    pub entities: Vec<String>,
    pub created_at: String,
    pub curator_run_id: String,
}

/// Internal runtime view used by the Knowledge Curator to keep backlink
/// traversal fast without exposing any extra AFP surface area.
#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct DerivedBacklinkGraph {
    pub edges_by_backlink_id: HashMap<String, BacklinkRecord>,
    pub outbound_edges: HashMap<String, BTreeSet<String>>,
    pub inbound_edges: HashMap<String, BTreeSet<String>>,
}

impl DerivedBacklinkGraph {
    /// Apply a new lightweight backlink_update into the derived graph index.
    /// Returns true when the graph changed.
    pub fn apply_backlink(&mut self, record: BacklinkRecord) -> bool {
        let backlink_id = record.backlink_id.clone();
        let source_id = record.source_id.clone();
        let target_id = record.target_id.clone();

        if self.edges_by_backlink_id.get(&backlink_id) == Some(&record) {
            return false;
        }

        self.outbound_edges
            .entry(source_id)
            .or_default()
            .insert(backlink_id.clone());
        self.inbound_edges
            .entry(target_id)
            .or_default()
            .insert(backlink_id.clone());
        self.edges_by_backlink_id.insert(backlink_id, record);
        true
    }

    /// Return all neighbour message ids reachable from the given message id.
    pub fn neighbours(&self, message_id: &str) -> Vec<String> {
        let Some(edge_ids) = self.outbound_edges.get(message_id) else {
            return Vec::new();
        };

        edge_ids
            .iter()
            .filter_map(|edge_id| self.edges_by_backlink_id.get(edge_id))
            .map(|record| record.target_id.clone())
            .collect()
    }

    pub fn edge_count(&self) -> usize {
        self.edges_by_backlink_id.len()
    }
}

/// Internal curator runtime state.
/// `derived_graph` is intentionally not part of AFP itself; it is a live
/// in-memory/indexed projection built from lightweight backlink_update messages.
#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct KnowledgeCuratorState {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub derived_graph: Option<DerivedBacklinkGraph>,
}

impl KnowledgeCuratorState {
    pub fn apply_backlink_update(&mut self, record: BacklinkRecord) -> bool {
        self.derived_graph
            .get_or_insert_with(DerivedBacklinkGraph::default)
            .apply_backlink(record)
    }
}

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
pub struct BacklinkUpdateMetadata {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub user_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub backlink_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub similarity_score: Option<f32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub match_reason: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub curator_run_id: Option<String>,
    #[serde(default)]
    pub entities: Vec<String>,
}

impl BacklinkRecord {
    /// Convert a lightweight `backlink_update` AFP message into the heavier
    /// internal/index form used by Postgres and the in-memory graph.
    pub fn from_backlink_message(message: &AFPMessage) -> Option<Self> {
        if message.r#type != "backlink_update" {
            return None;
        }

        let references = backlink_reference_ids(&message.references);
        if references.len() < 2 {
            return None;
        }

        let metadata: BacklinkUpdateMetadata = message
            .metadata
            .clone()
            .and_then(|value| serde_json::from_value(value).ok())
            .unwrap_or_default();

        let link_kind = match message
            .subtype
            .as_deref()
            .or(metadata.match_reason.as_deref())
            .unwrap_or("explicit_ref")
        {
            "semantic_similarity" => BacklinkKind::SemanticSimilarity,
            "entity_overlap" => BacklinkKind::EntityOverlap,
            "temporal_proximity" => BacklinkKind::TemporalProximity,
            _ => BacklinkKind::ExplicitRef,
        };

        Some(Self {
            backlink_id: metadata.backlink_id.unwrap_or_else(|| {
                format!(
                    "{}:{}:{}:{:?}",
                    message.id, references[0], references[1], link_kind
                )
            }),
            user_id: metadata.user_id.unwrap_or_default(),
            source_id: references[0].clone(),
            target_id: references[1].clone(),
            link_kind,
            similarity: metadata.similarity_score,
            entities: metadata.entities,
            created_at: if message.timestamp.trim().is_empty() {
                chrono::Utc::now().to_rfc3339()
            } else {
                message.timestamp.clone()
            },
            curator_run_id: metadata
                .curator_run_id
                .unwrap_or_else(|| message.id.clone()),
        })
    }
}

fn backlink_reference_ids(references: &[serde_json::Value]) -> Vec<String> {
    references
        .iter()
        .filter_map(|reference| match reference {
            serde_json::Value::String(value) if !value.trim().is_empty() => Some(value.clone()),
            serde_json::Value::Object(map) => map
                .get("target")
                .and_then(serde_json::Value::as_str)
                .map(str::to_string)
                .filter(|value| !value.trim().is_empty()),
            _ => None,
        })
        .collect()
}

// ---------------------------------------------------------------------------
// Knowledge card
// ---------------------------------------------------------------------------

/// A structured summary card produced by the curator for a single AFP message.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct KnowledgeCard {
    pub card_id: String,
    pub user_id: String,
    /// AFP message id this card summarises.
    pub source_id: String,
    pub summary: Option<String>,
    pub supertags: Vec<String>,
    pub entities: Vec<String>,
    /// Arbitrary structured JSON produced by the LLM.
    pub card_json: serde_json::Value,
    /// Embedding model version used (tracks re-index eligibility).
    pub model_version: String,
    pub created_at: String,
    pub curator_run_id: String,
}

// ---------------------------------------------------------------------------
// Insight message
// ---------------------------------------------------------------------------

/// A higher-level synthesised insight produced during deep maintenance.
/// Written to the AFP layer as type: `insight`.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct InsightMessage {
    pub insight_id: String,
    pub user_id: String,
    /// Message ids that contributed to this insight.
    pub source_ids: Vec<String>,
    pub title: String,
    pub body: String,
    pub supertags: Vec<String>,
    pub confidence: f32,
    pub created_at: String,
    pub curator_run_id: String,
}

// ---------------------------------------------------------------------------
// Merge suggestion
// ---------------------------------------------------------------------------

/// When the curator finds near-duplicates (cosine similarity > 0.97), it
/// creates a merge suggestion that requires explicit user approval before
/// any consolidation occurs.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct MergeSuggestion {
    pub suggestion_id: String,
    pub user_id: String,
    pub message_ids: Vec<String>,
    pub similarity: f32,
    pub rationale: String,
    pub status: MergeSuggestionStatus,
    pub created_at: String,
    pub resolved_at: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum MergeSuggestionStatus {
    Pending,
    Approved,
    Dismissed,
}

// ---------------------------------------------------------------------------
// Curator run audit
// ---------------------------------------------------------------------------

/// Audit record for a single curator processing run.
/// Written to `curator_run_audit` in Postgres.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct CuratorRunAudit {
    pub run_id: String,
    pub user_id: String,
    pub daemon_id: String,
    pub source_message_id: Option<String>,
    pub trigger_kind: CuratorTriggerKind,
    pub backlinks_created: u32,
    pub cards_created: u32,
    pub insights_created: u32,
    pub tokens_used: u32,
    pub duration_ms: Option<u32>,
    pub status: CuratorRunStatus,
    pub error_message: Option<String>,
    pub created_at: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum CuratorRunStatus {
    Completed,
    Failed,
    Skipped,
    Partial,
}

// ---------------------------------------------------------------------------
// Daemon heartbeat
// ---------------------------------------------------------------------------

/// Metrics emitted by a daemon on each heartbeat cycle.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct DaemonHeartbeat {
    pub heartbeat_id: String,
    pub daemon_id: String,
    pub user_id: String,
    pub queue_depth: u32,
    pub events_processed_last_hour: u32,
    pub tokens_used_today: u32,
    pub error_count_last_hour: u32,
    pub created_at: String,
}

// ---------------------------------------------------------------------------
// Policy check helper
// ---------------------------------------------------------------------------

/// Result of a curator policy pre-flight check.
#[derive(Debug, PartialEq, Eq)]
pub enum PolicyCheckOutcome {
    Allowed,
    RateLimited { reason: &'static str },
    Blocked { reason: &'static str },
}

/// Validate that a curator trigger is permitted by the given policy.
/// This is a pure function — the caller is responsible for persistence.
pub fn check_curator_policy(
    trigger: &CuratorTrigger,
    policy: &CuratorPolicy,
    events_this_hour: u32,
    tokens_today: u32,
) -> PolicyCheckOutcome {
    if events_this_hour >= policy.max_events_per_hour {
        return PolicyCheckOutcome::RateLimited {
            reason: "max_events_per_hour exceeded",
        };
    }
    if tokens_today >= policy.max_tokens_per_day {
        return PolicyCheckOutcome::RateLimited {
            reason: "max_tokens_per_day exceeded",
        };
    }
    if trigger.trigger_kind == CuratorTriggerKind::DeepMaintenance && !policy.insights_enabled {
        return PolicyCheckOutcome::Blocked {
            reason: "insights_enabled is false",
        };
    }
    PolicyCheckOutcome::Allowed
}

/// Validate that a merge suggestion creation is permitted by policy.
pub fn check_merge_suggestion_policy(policy: &CuratorPolicy) -> PolicyCheckOutcome {
    if !policy.merge_suggestions_enabled {
        return PolicyCheckOutcome::Blocked {
            reason: "merge_suggestions_enabled is false",
        };
    }
    PolicyCheckOutcome::Allowed
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn knowledge_curator_allowed_message_types_are_bounded() {
        let kind = DaemonKind::KnowledgeCurator;
        let types = kind.allowed_message_types();
        assert!(types.contains(&"knowledge_card"));
        assert!(types.contains(&"backlink_update"));
        assert!(types.contains(&"daemon_heartbeat"));
        // Must NOT have write access to arbitrary AFP messages.
        assert!(!types.contains(&"email_outgoing"));
        assert!(!types.contains(&"action_stripe_charge"));
    }

    #[test]
    fn email_gateway_cannot_write_knowledge_cards() {
        let kind = DaemonKind::EmailGateway;
        let types = kind.allowed_message_types();
        assert!(!types.contains(&"knowledge_card"));
        assert!(!types.contains(&"backlink_update"));
        assert!(types.contains(&"email_incoming"));
    }

    #[test]
    fn curator_policy_default_is_safe() {
        let policy = CuratorPolicy::default();
        assert!(policy.preserve_e2ee, "E2EE must be preserved by default");
        assert!(
            policy.backlink_similarity_threshold >= 0.8,
            "Threshold should be conservative"
        );
        assert!(
            policy.max_events_per_hour <= 1000,
            "Rate limit should be bounded"
        );
    }

    #[test]
    fn policy_check_allows_normal_trigger() {
        let policy = CuratorPolicy::default();
        let trigger = CuratorTrigger {
            run_id: "run_01".to_string(),
            daemon_id: "daemon_01".to_string(),
            user_id: "user_01".to_string(),
            trigger_kind: CuratorTriggerKind::NewMessage,
            source_message_id: Some("msg_01".to_string()),
            reindex_window_days: None,
            triggered_at: "2026-04-06T00:00:00Z".to_string(),
        };
        let result = check_curator_policy(&trigger, &policy, 0, 0);
        assert_eq!(result, PolicyCheckOutcome::Allowed);
    }

    #[test]
    fn policy_check_rate_limits_when_hourly_cap_exceeded() {
        let policy = CuratorPolicy::default();
        let trigger = CuratorTrigger {
            run_id: "run_02".to_string(),
            daemon_id: "daemon_01".to_string(),
            user_id: "user_01".to_string(),
            trigger_kind: CuratorTriggerKind::NewMessage,
            source_message_id: Some("msg_02".to_string()),
            reindex_window_days: None,
            triggered_at: "2026-04-06T00:00:00Z".to_string(),
        };
        let result = check_curator_policy(&trigger, &policy, 600, 0); // 600 > 500
        assert_eq!(
            result,
            PolicyCheckOutcome::RateLimited {
                reason: "max_events_per_hour exceeded"
            }
        );
    }

    #[test]
    fn policy_check_blocks_deep_maintenance_when_insights_disabled() {
        let policy = CuratorPolicy {
            insights_enabled: false,
            ..CuratorPolicy::default()
        };
        let trigger = CuratorTrigger {
            run_id: "run_03".to_string(),
            daemon_id: "daemon_01".to_string(),
            user_id: "user_01".to_string(),
            trigger_kind: CuratorTriggerKind::DeepMaintenance,
            source_message_id: None,
            reindex_window_days: Some(30),
            triggered_at: "2026-04-06T01:00:00Z".to_string(),
        };
        let result = check_curator_policy(&trigger, &policy, 0, 0);
        assert_eq!(
            result,
            PolicyCheckOutcome::Blocked {
                reason: "insights_enabled is false"
            }
        );
    }

    #[test]
    fn merge_suggestion_policy_blocks_when_disabled() {
        let policy = CuratorPolicy {
            merge_suggestions_enabled: false,
            ..CuratorPolicy::default()
        };
        let result = check_merge_suggestion_policy(&policy);
        assert_eq!(
            result,
            PolicyCheckOutcome::Blocked {
                reason: "merge_suggestions_enabled is false"
            }
        );
    }

    #[test]
    fn backlink_record_serialises_consistently() {
        let record = BacklinkRecord {
            backlink_id: "bl_001".to_string(),
            user_id: "user_001".to_string(),
            source_id: "msg_abc".to_string(),
            target_id: "msg_xyz".to_string(),
            link_kind: BacklinkKind::SemanticSimilarity,
            similarity: Some(0.91),
            entities: vec!["ACME Corp".to_string()],
            created_at: "2026-04-06T00:00:00Z".to_string(),
            curator_run_id: "run_001".to_string(),
        };
        let json = serde_json::to_string(&record).expect("serialise backlink");
        let round_tripped: BacklinkRecord =
            serde_json::from_str(&json).expect("deserialise backlink");
        assert_eq!(round_tripped.backlink_id, record.backlink_id);
        assert_eq!(round_tripped.link_kind, BacklinkKind::SemanticSimilarity);
    }

    #[test]
    fn backlink_record_parses_from_lightweight_backlink_update_message() {
        let message = AFPMessage {
            id: "msg_backlink".to_string(),
            thread_id: "thread_01".to_string(),
            timestamp: "2026-04-06T00:00:00Z".to_string(),
            r#type: "backlink_update".to_string(),
            subtype: Some("semantic_similarity".to_string()),
            metadata: Some(serde_json::json!({
                "user_id": "user_01",
                "similarity_score": 0.91,
                "curator_run_id": "run_01",
                "entities": ["ACME Corp"]
            })),
            references: vec![
                serde_json::Value::String("msg_source".to_string()),
                serde_json::Value::String("msg_target".to_string()),
            ],
            ..AFPMessage::default()
        };

        let record = BacklinkRecord::from_backlink_message(&message).expect("parse backlink");
        assert_eq!(record.user_id, "user_01");
        assert_eq!(record.source_id, "msg_source");
        assert_eq!(record.target_id, "msg_target");
        assert_eq!(record.link_kind, BacklinkKind::SemanticSimilarity);
        assert_eq!(record.similarity, Some(0.91));
    }

    #[test]
    fn derived_graph_indexes_backlinks_by_source() {
        let mut state = KnowledgeCuratorState::default();
        let changed = state.apply_backlink_update(BacklinkRecord {
            backlink_id: "bl_01".to_string(),
            user_id: "user_01".to_string(),
            source_id: "msg_a".to_string(),
            target_id: "msg_b".to_string(),
            link_kind: BacklinkKind::ExplicitRef,
            similarity: None,
            entities: Vec::new(),
            created_at: "2026-04-06T00:00:00Z".to_string(),
            curator_run_id: "run_01".to_string(),
        });

        assert!(changed);
        let graph = state.derived_graph.expect("derived graph should exist");
        assert_eq!(graph.edge_count(), 1);
        assert_eq!(graph.neighbours("msg_a"), vec!["msg_b".to_string()]);
    }

    #[test]
    fn daemon_kind_display_names_are_non_empty() {
        let kinds = [
            DaemonKind::KnowledgeCurator,
            DaemonKind::EmailGateway,
            DaemonKind::RelationalSync,
            DaemonKind::ArchiveColdStorage,
            DaemonKind::HealthMaintenance,
        ];
        for kind in &kinds {
            assert!(!kind.display_name().is_empty());
        }
    }
}
