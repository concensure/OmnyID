use chrono::Utc;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::collections::HashMap;
use ulid::Ulid;

use crate::{
    message::{AFP_KIND_RICH_NOTE, AFP_TYPE_LEDGER},
    prepared_context_packet::PreparedContextPacket,
    state_snapshot::{
        StateSnapshotCommitment, StateSnapshotContextItem, StateSnapshotDecisionItem,
        StateSnapshotResponseItem,
    },
};

pub const PREPARED_DRAFT_CLASS_COMMUNICATION_REPLY: &str = "communication_reply";
pub const PREPARED_DRAFT_CLASS_COMPARISON_TABLE: &str = "comparison_table";
pub const PREPARED_DRAFT_CLASS_DECISION_MEMO: &str = "decision_memo";
pub const PREPARED_DRAFT_CLASS_FOLLOW_UP: &str = "follow_up_draft";
pub const PREPARED_DRAFT_CLASS_MEETING_BRIEF: &str = "meeting_brief";
pub const PREPARED_DRAFT_CLASS_PROJECT_PREP_NOTE: &str = "project_prep_note";
pub const PREPARED_DRAFT_CLASS_TASK_BUNDLE: &str = "task_bundle";

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq, Eq)]
pub struct PreparedDraftComparisonRow {
    pub label: String,
    #[serde(default)]
    pub values: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq, Eq)]
pub struct PreparedDraftArtifact {
    pub draft_id: String,
    pub draft_class: String,
    pub label: String,
    pub channel: String,
    pub summary: String,
    pub body: String,
    pub confidence: String,
    pub readiness: String,
    pub response_due_hint: String,
    pub approval_required_to_send: bool,
    #[serde(default)]
    pub source_refs: Vec<String>,
    #[serde(default)]
    pub source_count: u32,
    #[serde(default)]
    pub storage_type: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub storage_kind: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub comparison_headers: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub comparison_rows: Vec<PreparedDraftComparisonRow>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub selection_reason: Option<String>,
    pub suggested_next_action: String,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub object_refs: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub memory_space: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub author_mask: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub author_type: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub author_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub is_human_authored: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub human_only: Option<bool>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq, Eq)]
pub struct PreparedDraftPacket {
    pub ready: bool,
    pub summary: String,
    #[serde(default)]
    pub drafts: Vec<PreparedDraftArtifact>,
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct PreparedDraftGenerationFeedback {
    pub status: String,
    pub acceptance_rate: f64,
}

pub type PreparedDraftGenerationPolicy = HashMap<String, PreparedDraftGenerationFeedback>;

#[derive(Clone, Debug, Default, PartialEq, Eq)]
struct PreparedDraftTopologyContext {
    follow_up_refs: Vec<String>,
    relationship_refs: Vec<String>,
    project_refs: Vec<String>,
    reference_refs: Vec<String>,
    thread_refs: Vec<String>,
    object_refs: Vec<String>,
}

pub fn build_prepared_draft_packet(
    generation_policy: Option<&PreparedDraftGenerationPolicy>,
    prepared_context_packet: Option<&PreparedContextPacket>,
    decision_queue: &[StateSnapshotDecisionItem],
    response_queue: &[StateSnapshotResponseItem],
    active_commitments: &[StateSnapshotCommitment],
    context_panel_items: &[StateSnapshotContextItem],
    recent_messages: &[Value],
) -> PreparedDraftPacket {
    let topology_context = prepared_context_packet
        .map(PreparedDraftTopologyContext::from_packet)
        .unwrap_or_default();
    let mut drafts = response_queue
        .iter()
        .filter_map(|item| {
            communication_reply_draft_from_response(item, prepared_context_packet, recent_messages)
        })
        .filter_map(|draft| apply_generation_feedback(draft, generation_policy, &topology_context))
        .collect::<Vec<_>>();
    if let Some(decision_memo) =
        decision_memo_draft_from_queue(decision_queue, prepared_context_packet, recent_messages)
    {
        if let Some(decision_memo) =
            apply_generation_feedback(decision_memo, generation_policy, &topology_context)
        {
            drafts.push(decision_memo);
        }
    }
    if let Some(comparison_table) = comparison_table_draft_from_decisions(
        decision_queue,
        prepared_context_packet,
        recent_messages,
    ) {
        if let Some(comparison_table) =
            apply_generation_feedback(comparison_table, generation_policy, &topology_context)
        {
            drafts.push(comparison_table);
        }
    }
    if let Some(follow_up_draft) = follow_up_draft_from_context(
        context_panel_items,
        prepared_context_packet,
        recent_messages,
    ) {
        if let Some(follow_up_draft) =
            apply_generation_feedback(follow_up_draft, generation_policy, &topology_context)
        {
            drafts.push(follow_up_draft);
        }
    }
    if let Some(meeting_brief) = meeting_brief_draft_from_commitments(
        active_commitments,
        prepared_context_packet,
        recent_messages,
    ) {
        if let Some(meeting_brief) =
            apply_generation_feedback(meeting_brief, generation_policy, &topology_context)
        {
            drafts.push(meeting_brief);
        }
    }
    if let Some(task_bundle) = task_bundle_draft_from_commitments(
        active_commitments,
        prepared_context_packet,
        recent_messages,
    ) {
        if let Some(task_bundle) =
            apply_generation_feedback(task_bundle, generation_policy, &topology_context)
        {
            drafts.push(task_bundle);
        }
    }
    if let Some(project_prep_note) = project_prep_note_from_context(
        context_panel_items,
        prepared_context_packet,
        recent_messages,
    ) {
        if let Some(project_prep_note) =
            apply_generation_feedback(project_prep_note, generation_policy, &topology_context)
        {
            drafts.push(project_prep_note);
        }
    }

    drafts = bias_draft_class_selection(drafts, &topology_context);
    drafts.sort_by_key(|draft| draft_rank(draft));
    drafts.truncate(3);

    PreparedDraftPacket {
        ready: !drafts.is_empty(),
        summary: prepared_draft_summary(&drafts),
        drafts,
    }
}

pub fn build_prepared_draft_ledger_afp(
    owner_user_id: &str,
    thread_id: &str,
    parent_id: Option<&str>,
    draft: &PreparedDraftArtifact,
) -> Value {
    let content = json!({
        "title": draft.label,
        "summary": draft.summary,
        "body": draft.body,
        "channel": draft.channel,
        "draft_class": draft.draft_class,
        "suggested_actions": [draft.suggested_next_action.clone()],
        "response_due_hint": draft.response_due_hint,
        "follow_up_at": crate::prepared_draft_semantics::follow_up_proposal_from_draft_semantics(
            &draft.draft_class,
            &draft.response_due_hint,
        ),
        "approval_required_to_send": draft.approval_required_to_send,
        "source_refs": draft.source_refs,
        "comparison_headers": draft.comparison_headers,
        "comparison_rows": draft.comparison_rows,
        "selection_reason": draft.selection_reason,
        "object_refs": draft.object_refs,
    });
    let view = build_prepared_draft_a2ui_view(draft);

    let mut metadata = serde_json::Map::from_iter([
        ("store".to_string(), Value::Bool(true)),
        ("continuity".to_string(), Value::Bool(true)),
        (
            "draft_origin".to_string(),
            Value::String("prepared_draft_packet".to_string()),
        ),
        (
            "draft_class".to_string(),
            Value::String(draft.draft_class.clone()),
        ),
        (
            "approval_required_to_send".to_string(),
            Value::Bool(draft.approval_required_to_send),
        ),
    ]);
    insert_optional_metadata_string(&mut metadata, "memory_space", draft.memory_space.as_deref());
    insert_optional_metadata_string(&mut metadata, "author_mask", draft.author_mask.as_deref());
    insert_optional_metadata_string(&mut metadata, "author_type", draft.author_type.as_deref());
    insert_optional_metadata_string(&mut metadata, "author_id", draft.author_id.as_deref());
    insert_optional_metadata_bool(&mut metadata, "is_human_authored", draft.is_human_authored);
    insert_optional_metadata_bool(&mut metadata, "human_only", draft.human_only);

    json!({
        "protocol": "afp-v1",
        "id": Ulid::new().to_string(),
        "thread_id": thread_id,
        "parent_id": parent_id,
        "from": "state_synthesizer",
        "to": [owner_user_id],
        "timestamp": Utc::now().to_rfc3339(),
        "type": AFP_TYPE_LEDGER,
        "kind": AFP_KIND_RICH_NOTE,
        "subtype": draft.draft_class,
        "content": content,
        "views": [view],
        "metadata": Value::Object(metadata),
        "store_in_relational": true,
    })
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
struct PreparedDraftScope {
    memory_space: Option<String>,
    author_mask: Option<String>,
    author_type: Option<String>,
    author_id: Option<String>,
    is_human_authored: Option<bool>,
    human_only: Option<bool>,
}

fn insert_optional_metadata_string(
    metadata: &mut serde_json::Map<String, Value>,
    key: &str,
    value: Option<&str>,
) {
    if let Some(value) = value.filter(|value| !value.trim().is_empty()) {
        metadata.insert(key.to_string(), Value::String(value.to_string()));
    }
}

fn insert_optional_metadata_bool(
    metadata: &mut serde_json::Map<String, Value>,
    key: &str,
    value: Option<bool>,
) {
    if let Some(value) = value {
        metadata.insert(key.to_string(), Value::Bool(value));
    }
}

fn prepared_draft_scope_from_message(message: &Value) -> PreparedDraftScope {
    let metadata = message.get("metadata").and_then(Value::as_object);
    let searchable = metadata
        .and_then(|map| map.get("searchable_metadata"))
        .and_then(Value::as_object);
    let memory_space = metadata_string(searchable, metadata, "memory_space");
    let author_mask = metadata_string(searchable, metadata, "author_mask");
    let author_type = metadata_string(searchable, metadata, "author_type");
    let author_id = metadata_string(searchable, metadata, "author_id");
    let is_human_authored =
        metadata_bool(searchable, metadata, "is_human_authored").or_else(|| {
            author_type
                .as_deref()
                .map(|value| value.trim().eq_ignore_ascii_case("human"))
        });
    let human_only = metadata_bool(searchable, metadata, "human_only");

    PreparedDraftScope {
        memory_space,
        author_mask,
        author_type,
        author_id,
        is_human_authored,
        human_only,
    }
}

fn prepared_draft_scope_from_source_refs(
    source_refs: &[String],
    recent_messages: &[Value],
) -> PreparedDraftScope {
    source_refs
        .iter()
        .find_map(|source_ref| {
            recent_messages
                .iter()
                .find(|message| {
                    message.get("id").and_then(Value::as_str) == Some(source_ref.as_str())
                })
                .map(prepared_draft_scope_from_message)
        })
        .unwrap_or_default()
}

fn metadata_string(
    searchable: Option<&serde_json::Map<String, Value>>,
    metadata: Option<&serde_json::Map<String, Value>>,
    key: &str,
) -> Option<String> {
    searchable
        .and_then(|map| map.get(key))
        .or_else(|| metadata.and_then(|map| map.get(key)))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

fn metadata_bool(
    searchable: Option<&serde_json::Map<String, Value>>,
    metadata: Option<&serde_json::Map<String, Value>>,
    key: &str,
) -> Option<bool> {
    searchable
        .and_then(|map| map.get(key))
        .or_else(|| metadata.and_then(|map| map.get(key)))
        .and_then(Value::as_bool)
}

fn prepared_draft_consequence_preview(draft: &PreparedDraftArtifact) -> Option<String> {
    if draft.approval_required_to_send {
        return Some(
            "Acting now opens a review step first; no external action runs without approval."
                .to_string(),
        );
    }

    match draft.draft_class.as_str() {
        PREPARED_DRAFT_CLASS_COMPARISON_TABLE | PREPARED_DRAFT_CLASS_DECISION_MEMO => Some(
            "Acting now opens prepared decision support without committing to a final action."
                .to_string(),
        ),
        PREPARED_DRAFT_CLASS_COMMUNICATION_REPLY => Some(
            "Acting now opens a prepared reply for review; sending remains explicitly gated."
                .to_string(),
        ),
        PREPARED_DRAFT_CLASS_FOLLOW_UP => Some(
            "Acting now resumes the follow-up context before any outbound step is taken."
                .to_string(),
        ),
        PREPARED_DRAFT_CLASS_PROJECT_PREP_NOTE | PREPARED_DRAFT_CLASS_MEETING_BRIEF => Some(
            "Acting now opens prepared context for review rather than executing a side effect."
                .to_string(),
        ),
        _ if draft.readiness == "ready_now" => {
            Some("Acting now opens the prepared item immediately for review.".to_string())
        }
        _ => None,
    }
}

fn prepared_draft_provenance_cue(draft: &PreparedDraftArtifact) -> Option<String> {
    if draft.source_refs.is_empty() {
        return None;
    }

    match draft.draft_class.as_str() {
        PREPARED_DRAFT_CLASS_COMPARISON_TABLE | PREPARED_DRAFT_CLASS_DECISION_MEMO => {
            Some("Traceable to the decision evidence used to prepare this artifact.".to_string())
        }
        _ => Some("Traceable to the continuity artifacts used to prepare this draft.".to_string()),
    }
}

fn build_prepared_draft_a2ui_view(draft: &PreparedDraftArtifact) -> Value {
    let consequence_preview = prepared_draft_consequence_preview(draft);
    let provenance_cue = prepared_draft_provenance_cue(draft);

    if draft.draft_class == PREPARED_DRAFT_CLASS_COMPARISON_TABLE
        && !draft.comparison_headers.is_empty()
        && !draft.comparison_rows.is_empty()
    {
        return json!({
            "format": "a2ui.v1",
            "content": {
                "schema_version": "a2ui.v1",
                "kind": "panel",
                "title": draft.label,
                "description": draft.summary,
                "components": [{
                    "type": "comparison_table",
                    "props": {
                        "title": draft.label,
                        "description": draft.summary,
                        "columns": draft.comparison_headers,
                        "rows": draft.comparison_rows,
                        "selection_reason": draft.selection_reason,
                        "consequence_preview": consequence_preview,
                        "provenance_cue": provenance_cue,
                    }
                }]
            }
        });
    }

    let structured_sections = structured_a2ui_sections_for_draft(draft);
    if !structured_sections.is_empty() {
        let mut components = vec![json!({
            "type": "note",
            "props": {
                "title": draft.label,
                "summary": draft.summary,
                "channel": draft.channel,
                "status": "draft",
                "review_required": draft.approval_required_to_send,
                "selection_reason": draft.selection_reason,
                "consequence_preview": consequence_preview,
                "provenance_cue": provenance_cue,
            }
        })];
        components.extend(structured_sections);

        return json!({
            "format": "a2ui.v1",
            "content": {
                "schema_version": "a2ui.v1",
                "kind": "panel",
                "title": draft.label,
                "description": draft.summary,
                "components": components,
            }
        });
    }

    json!({
        "format": "a2ui.v1",
        "content": {
            "schema_version": "a2ui.v1",
            "kind": "note",
            "props": {
                "title": draft.label,
                "summary": draft.summary,
                "body": draft.body,
                "channel": draft.channel,
                "status": "draft",
                "review_required": draft.approval_required_to_send,
                "selection_reason": draft.selection_reason,
                "consequence_preview": consequence_preview,
                "provenance_cue": provenance_cue,
            }
        }
    })
}

fn structured_a2ui_sections_for_draft(draft: &PreparedDraftArtifact) -> Vec<Value> {
    match draft.draft_class.as_str() {
        PREPARED_DRAFT_CLASS_DECISION_MEMO => structured_sections_from_headings(
            draft,
            &["Recommended framing", "Supporting highlights"],
        ),
        PREPARED_DRAFT_CLASS_MEETING_BRIEF => {
            structured_sections_from_headings(draft, &["Recommended prep", "Context highlights"])
        }
        PREPARED_DRAFT_CLASS_TASK_BUNDLE => {
            structured_sections_from_headings(draft, &["Grouped work", "Context highlights"])
        }
        PREPARED_DRAFT_CLASS_PROJECT_PREP_NOTE => {
            structured_sections_from_headings(draft, &["Recommended prep", "Supporting highlights"])
        }
        PREPARED_DRAFT_CLASS_FOLLOW_UP => {
            structured_sections_from_headings(draft, &["Continuity highlights"])
        }
        _ => Vec::new(),
    }
}

fn structured_sections_from_headings(
    draft: &PreparedDraftArtifact,
    headings: &[&str],
) -> Vec<Value> {
    headings
        .iter()
        .filter_map(|heading| {
            let items = extract_bullet_section(&draft.body, heading);
            if items.is_empty() {
                None
            } else {
                Some(json!({
                    "type": "bullet_list",
                    "props": {
                        "title": heading,
                        "items": items,
                    }
                }))
            }
        })
        .collect()
}

fn extract_bullet_section(body: &str, heading: &str) -> Vec<String> {
    let heading_line = format!("{heading}:");
    let mut in_section = false;
    let mut items = Vec::new();

    for line in body.lines().map(str::trim) {
        if !in_section {
            if line == heading_line {
                in_section = true;
            }
            continue;
        }

        if line.is_empty() {
            if !items.is_empty() {
                break;
            }
            continue;
        }

        if line.ends_with(':') && !line.starts_with("- ") {
            break;
        }

        if let Some(item) = line.strip_prefix("- ") {
            items.push(item.trim().to_string());
        } else if !items.is_empty() {
            break;
        }
    }

    items
}

fn apply_generation_feedback(
    mut draft: PreparedDraftArtifact,
    generation_policy: Option<&PreparedDraftGenerationPolicy>,
    topology_context: &PreparedDraftTopologyContext,
) -> Option<PreparedDraftArtifact> {
    let family_id = prepared_draft_heuristic_family_id(&draft.draft_id);
    let Some(feedback) = generation_policy.and_then(|policy| policy.get(&family_id)) else {
        if draft.object_refs.is_empty() {
            draft.object_refs = topology_context.object_refs.clone();
        }
        return Some(draft);
    };

    match feedback.status.as_str() {
        "cooldown_recommended" => {
            if should_suppress_for_cooldown(&draft, topology_context) {
                return None;
            }
            apply_cautious_feedback(&mut draft, feedback, topology_context);
            Some(draft)
        }
        "cautious" => {
            apply_cautious_feedback(&mut draft, feedback, topology_context);
            Some(draft)
        }
        "trusted" | "reinforced" => {
            if draft.object_refs.is_empty() {
                draft.object_refs = topology_context.object_refs.clone();
            }
            draft.confidence = promote_confidence(&draft.confidence).to_string();
            Some(draft)
        }
        _ => {
            if draft.object_refs.is_empty() {
                draft.object_refs = topology_context.object_refs.clone();
            }
            Some(draft)
        }
    }
}

fn prepared_draft_heuristic_family_id(draft_id: &str) -> String {
    format!("prepared-draft:{draft_id}")
}

impl PreparedDraftTopologyContext {
    fn from_packet(packet: &PreparedContextPacket) -> Self {
        Self {
            follow_up_refs: packet.follow_up_refs.clone(),
            relationship_refs: packet.relationship_refs.clone(),
            project_refs: packet.project_refs.clone(),
            reference_refs: packet.reference_refs.clone(),
            thread_refs: packet.thread_refs.clone(),
            object_refs: packet.object_refs.clone(),
        }
    }

    fn has_follow_up_overlap(&self, refs: &[String]) -> bool {
        refs.iter().any(|source_ref| {
            self.follow_up_refs
                .iter()
                .any(|candidate| candidate == source_ref)
        })
    }

    fn has_relationship_overlap(&self, refs: &[String]) -> bool {
        refs.iter().any(|source_ref| {
            self.relationship_refs
                .iter()
                .any(|candidate| candidate == source_ref)
        })
    }

    fn has_project_overlap(&self, refs: &[String]) -> bool {
        refs.iter().any(|source_ref| {
            self.project_refs
                .iter()
                .any(|candidate| candidate == source_ref)
        })
    }

    fn has_reference_overlap(&self, refs: &[String]) -> bool {
        refs.iter().any(|source_ref| {
            self.reference_refs
                .iter()
                .any(|candidate| candidate == source_ref)
        })
    }

    fn has_thread_overlap(&self, refs: &[String]) -> bool {
        refs.iter().any(|source_ref| {
            self.thread_refs
                .iter()
                .any(|candidate| candidate == source_ref)
        })
    }

    fn has_project_or_thread_overlap(&self, refs: &[String]) -> bool {
        self.has_project_overlap(refs)
            || self.has_reference_overlap(refs)
            || self.has_thread_overlap(refs)
    }
}

fn bias_draft_class_selection(
    drafts: Vec<PreparedDraftArtifact>,
    topology_context: &PreparedDraftTopologyContext,
) -> Vec<PreparedDraftArtifact> {
    let has_follow_up_draft = drafts
        .iter()
        .any(|draft| draft.draft_class == PREPARED_DRAFT_CLASS_FOLLOW_UP);
    let has_meeting_brief = drafts
        .iter()
        .any(|draft| draft.draft_class == PREPARED_DRAFT_CLASS_MEETING_BRIEF);
    let has_task_bundle = drafts
        .iter()
        .any(|draft| draft.draft_class == PREPARED_DRAFT_CLASS_TASK_BUNDLE);
    let has_project_prep_note = drafts
        .iter()
        .any(|draft| draft.draft_class == PREPARED_DRAFT_CLASS_PROJECT_PREP_NOTE);

    let mut yielded_to_follow_up = false;
    let mut yielded_to_meeting = false;
    let mut yielded_to_task_bundle = false;
    let mut yielded_to_project = false;
    let mut kept = drafts
        .into_iter()
        .filter(|draft| {
            if draft.draft_class != PREPARED_DRAFT_CLASS_COMMUNICATION_REPLY {
                return true;
            }
            if should_yield_reply_to_follow_up(draft, topology_context, has_follow_up_draft) {
                yielded_to_follow_up = true;
                return false;
            }
            if should_yield_reply_to_meeting_brief(draft, topology_context, has_meeting_brief) {
                yielded_to_meeting = true;
                return false;
            }
            if should_yield_reply_to_task_bundle(draft, topology_context, has_task_bundle) {
                yielded_to_task_bundle = true;
                return false;
            }
            if should_yield_reply_to_project_prep(draft, topology_context, has_project_prep_note) {
                yielded_to_project = true;
                return false;
            }
            true
        })
        .collect::<Vec<_>>();

    if yielded_to_follow_up {
        annotate_selection_reason(
            &mut kept,
            PREPARED_DRAFT_CLASS_FOLLOW_UP,
            "Selected follow-up draft because this conversation is already part of an active follow-up chain.",
        );
    }
    if yielded_to_meeting {
        annotate_selection_reason(
            &mut kept,
            PREPARED_DRAFT_CLASS_MEETING_BRIEF,
            "Selected meeting brief because an active meeting context is ready and better matches this thread than a routine reply.",
        );
    }
    if yielded_to_task_bundle {
        annotate_selection_reason(
            &mut kept,
            PREPARED_DRAFT_CLASS_TASK_BUNDLE,
            "Selected task bundle because multiple active commitments in this thread or project are better handled together than as a routine reply.",
        );
    }
    if yielded_to_project {
        annotate_selection_reason(
            &mut kept,
            PREPARED_DRAFT_CLASS_PROJECT_PREP_NOTE,
            "Selected project prep note because this conversation belongs to an active project or thread context.",
        );
    }

    kept
}

fn annotate_selection_reason(
    drafts: &mut [PreparedDraftArtifact],
    draft_class: &str,
    reason: &str,
) {
    if let Some(draft) = drafts
        .iter_mut()
        .find(|draft| draft.draft_class == draft_class && draft.selection_reason.is_none())
    {
        draft.selection_reason = Some(reason.to_string());
    }
}

fn should_yield_reply_to_follow_up(
    draft: &PreparedDraftArtifact,
    topology_context: &PreparedDraftTopologyContext,
    has_follow_up_draft: bool,
) -> bool {
    has_follow_up_draft
        && topology_context.has_follow_up_overlap(&draft.source_refs)
        && !has_due_soon_signal(draft)
        && !matches!(
            draft_context_band(draft),
            DraftContextBand::ExternalCriticalWork
        )
}

fn should_yield_reply_to_project_prep(
    draft: &PreparedDraftArtifact,
    topology_context: &PreparedDraftTopologyContext,
    has_project_prep_note: bool,
) -> bool {
    has_project_prep_note
        && topology_context.has_project_or_thread_overlap(&draft.source_refs)
        && !has_due_soon_signal(draft)
        && matches!(
            draft_context_band(draft),
            DraftContextBand::RoutineWork | DraftContextBand::InternalCriticalWork
        )
}

fn should_yield_reply_to_meeting_brief(
    draft: &PreparedDraftArtifact,
    topology_context: &PreparedDraftTopologyContext,
    has_meeting_brief: bool,
) -> bool {
    has_meeting_brief
        && topology_context.has_project_or_thread_overlap(&draft.source_refs)
        && !has_due_soon_signal(draft)
        && matches!(
            draft_context_band(draft),
            DraftContextBand::RoutineWork | DraftContextBand::InternalCriticalWork
        )
}

fn should_yield_reply_to_task_bundle(
    draft: &PreparedDraftArtifact,
    topology_context: &PreparedDraftTopologyContext,
    has_task_bundle: bool,
) -> bool {
    has_task_bundle
        && topology_context.has_project_or_thread_overlap(&draft.source_refs)
        && !has_due_soon_signal(draft)
        && matches!(
            draft_context_band(draft),
            DraftContextBand::RoutineWork | DraftContextBand::InternalCriticalWork
        )
}

fn should_suppress_for_cooldown(
    draft: &PreparedDraftArtifact,
    topology_context: &PreparedDraftTopologyContext,
) -> bool {
    if should_force_retain_despite_cooldown(draft, topology_context) {
        return false;
    }

    match draft.draft_class.as_str() {
        PREPARED_DRAFT_CLASS_COMMUNICATION_REPLY | PREPARED_DRAFT_CLASS_FOLLOW_UP => {
            match draft_context_band(draft) {
                DraftContextBand::ExternalCriticalWork => false,
                DraftContextBand::InternalCriticalWork => {
                    draft.readiness != "ready_now" && !has_due_soon_signal(draft)
                }
                DraftContextBand::RoutineWork => draft.readiness != "ready_now",
                DraftContextBand::Social => {
                    draft.readiness != "ready_now" || draft.confidence != "high"
                }
            }
        }
        PREPARED_DRAFT_CLASS_MEETING_BRIEF
        | PREPARED_DRAFT_CLASS_TASK_BUNDLE
        | PREPARED_DRAFT_CLASS_PROJECT_PREP_NOTE => {
            draft.readiness != "ready_now" && draft.confidence != "high"
        }
        PREPARED_DRAFT_CLASS_DECISION_MEMO | PREPARED_DRAFT_CLASS_COMPARISON_TABLE => false,
        _ => draft.readiness != "ready_now",
    }
}

fn apply_cautious_feedback(
    draft: &mut PreparedDraftArtifact,
    feedback: &PreparedDraftGenerationFeedback,
    topology_context: &PreparedDraftTopologyContext,
) {
    if draft.readiness == "ready_now"
        && !should_keep_ready_now_under_caution(draft, topology_context)
        && !matches!(
            draft.draft_class.as_str(),
            PREPARED_DRAFT_CLASS_DECISION_MEMO | PREPARED_DRAFT_CLASS_COMPARISON_TABLE
        )
    {
        draft.readiness = "ready".to_string();
    }
    draft.confidence = demote_confidence(&draft.confidence).to_string();
    draft.summary = format!(
        "{} Similar drafts were often dismissed ({:.0}% acceptance), so this one is surfaced more cautiously.",
        draft.summary,
        feedback.acceptance_rate * 100.0
    );
}

fn should_force_retain_despite_cooldown(
    draft: &PreparedDraftArtifact,
    topology_context: &PreparedDraftTopologyContext,
) -> bool {
    has_topology_priority_signal(draft, topology_context)
        || (draft.approval_required_to_send
            && has_due_soon_signal(draft)
            && !matches!(draft_context_band(draft), DraftContextBand::Social))
}

fn should_keep_ready_now_under_caution(
    draft: &PreparedDraftArtifact,
    topology_context: &PreparedDraftTopologyContext,
) -> bool {
    has_topology_priority_signal(draft, topology_context)
        || (draft.approval_required_to_send
            && has_due_soon_signal(draft)
            && matches!(
                draft_context_band(draft),
                DraftContextBand::ExternalCriticalWork | DraftContextBand::InternalCriticalWork
            ))
}

fn has_topology_priority_signal(
    draft: &PreparedDraftArtifact,
    topology_context: &PreparedDraftTopologyContext,
) -> bool {
    !matches!(draft_context_band(draft), DraftContextBand::Social)
        && (topology_context.has_follow_up_overlap(&draft.source_refs)
            || topology_context.has_project_overlap(&draft.source_refs)
            || topology_context.has_reference_overlap(&draft.source_refs)
            || topology_context.has_thread_overlap(&draft.source_refs)
            || (draft.draft_class == PREPARED_DRAFT_CLASS_FOLLOW_UP
                && topology_context.has_relationship_overlap(&draft.source_refs)))
}

#[derive(Copy, Clone, Debug, PartialEq, Eq)]
enum DraftContextBand {
    ExternalCriticalWork,
    InternalCriticalWork,
    RoutineWork,
    Social,
}

fn draft_context_band(draft: &PreparedDraftArtifact) -> DraftContextBand {
    let lower = format!(
        "{} {} {} {}",
        draft.label, draft.channel, draft.summary, draft.body
    )
    .to_ascii_lowercase();

    let social_signal = lower.contains("friend")
        || lower.contains("family")
        || matches!(
            draft.channel.as_str(),
            "chat" | "whatsapp" | "telegram" | "discord"
        );
    if social_signal {
        return DraftContextBand::Social;
    }

    let external_critical_work_signal = lower.contains("supplier")
        || lower.contains("vendor")
        || lower.contains("quote")
        || lower.contains("pricing")
        || lower.contains("buyer")
        || lower.contains("prospect")
        || lower.contains("customer")
        || lower.contains("client")
        || lower.contains("contract")
        || lower.contains("invoice")
        || lower.contains("renewal")
        || lower.contains("purchase")
        || matches!(draft.channel.as_str(), "email");
    if external_critical_work_signal {
        return DraftContextBand::ExternalCriticalWork;
    }

    let internal_critical_work_signal = lower.contains("team")
        || lower.contains("internal")
        || lower.contains("rollout")
        || lower.contains("review request")
        || lower.contains("approval")
        || lower.contains("ops")
        || lower.contains("workspace")
        || matches!(draft.channel.as_str(), "slack" | "teams");
    if internal_critical_work_signal {
        return DraftContextBand::InternalCriticalWork;
    }

    DraftContextBand::RoutineWork
}

fn has_due_soon_signal(draft: &PreparedDraftArtifact) -> bool {
    let lower = format!(
        "{} {} {}",
        draft.response_due_hint, draft.summary, draft.body
    )
    .to_ascii_lowercase();

    lower.contains("today")
        || lower.contains("tonight")
        || lower.contains("within 24h")
        || lower.contains("24h")
        || lower.contains("asap")
        || lower.contains("urgent")
        || lower.contains("eod")
        || lower.contains("end of day")
        || lower.contains("this afternoon")
        || lower.contains("tomorrow morning")
}

fn demote_confidence(confidence: &str) -> &'static str {
    match confidence {
        "high" => "medium",
        "medium" => "low",
        _ => "low",
    }
}

fn promote_confidence(confidence: &str) -> &'static str {
    match confidence {
        "low" => "medium",
        "medium" => "high",
        _ => "high",
    }
}

fn communication_reply_draft_from_response(
    item: &StateSnapshotResponseItem,
    prepared_context_packet: Option<&PreparedContextPacket>,
    recent_messages: &[Value],
) -> Option<PreparedDraftArtifact> {
    if !matches!(
        item.channel.as_str(),
        "email" | "slack" | "chat" | "whatsapp" | "teams" | "discord" | "telegram" | "conversation"
    ) {
        return None;
    }

    let source_ref = item.source_refs.first()?;
    let source_message = recent_messages
        .iter()
        .find(|message| message.get("id").and_then(Value::as_str) == Some(source_ref.as_str()))?;
    let source_text = source_message_text(source_message);
    if source_text.trim().is_empty() {
        return None;
    }

    let source_count = prepared_context_packet
        .map(|packet| {
            packet
                .response_refs
                .iter()
                .filter(|response_ref| {
                    item.source_refs
                        .iter()
                        .any(|source_ref| source_ref == *response_ref)
                })
                .count() as u32
                + packet
                    .follow_up_refs
                    .iter()
                    .filter(|follow_up_ref| {
                        item.source_refs
                            .iter()
                            .any(|source_ref| source_ref == *follow_up_ref)
                    })
                    .count() as u32
        })
        .unwrap_or(0)
        .max(item.source_refs.len() as u32);

    let readiness = if matches!(item.urgency.as_str(), "urgent" | "today")
        || response_due_hint_is_immediate(&item.response_due_hint)
    {
        "ready_now"
    } else {
        "ready"
    };
    let summary = draft_summary_for_channel(&item.channel, &item.response_due_hint);
    let body = draft_body_for_channel(&item.channel, &source_text, &item.response_due_hint);
    let scope = prepared_draft_scope_from_message(source_message);

    Some(PreparedDraftArtifact {
        draft_id: format!("draft:reply:{}", item.id),
        draft_class: PREPARED_DRAFT_CLASS_COMMUNICATION_REPLY.to_string(),
        label: format!("Reply draft for {}", item.label),
        channel: item.channel.clone(),
        summary,
        body,
        confidence: item.confidence.clone(),
        readiness: readiness.to_string(),
        response_due_hint: item.response_due_hint.clone(),
        approval_required_to_send: true,
        source_refs: item.source_refs.clone(),
        source_count,
        storage_type: AFP_TYPE_LEDGER.to_string(),
        storage_kind: Some(AFP_KIND_RICH_NOTE.to_string()),
        comparison_headers: Vec::new(),
        comparison_rows: Vec::new(),
        selection_reason: None,
        suggested_next_action: format!("Review and send {} reply", item.channel),
        object_refs: Vec::new(),
        memory_space: scope.memory_space,
        author_mask: scope.author_mask,
        author_type: scope.author_type,
        author_id: scope.author_id,
        is_human_authored: scope.is_human_authored,
        human_only: scope.human_only,
    })
}

fn response_due_hint_is_immediate(response_due_hint: &str) -> bool {
    crate::timing_hints::due_hint_is_immediate(response_due_hint)
}

fn decision_memo_draft_from_queue(
    decision_queue: &[StateSnapshotDecisionItem],
    prepared_context_packet: Option<&PreparedContextPacket>,
    recent_messages: &[Value],
) -> Option<PreparedDraftArtifact> {
    let decision = decision_queue.iter().find(|item| {
        item.approval_required
            || matches!(item.urgency.as_str(), "urgent" | "today" | "high")
            || item.category == "approval"
    })?;
    let mut source_refs = decision.source_refs.clone();
    if let Some(packet) = prepared_context_packet {
        for decision_ref in &packet.decision_history_refs {
            if !source_refs.iter().any(|existing| existing == decision_ref) {
                source_refs.push(decision_ref.clone());
            }
        }
    }
    source_refs.truncate(5);

    let source_count = prepared_context_packet
        .map(|packet| {
            packet.decision_refs.len() as u32
                + packet.decision_history_refs.len() as u32
                + packet.source_refs.len() as u32
        })
        .unwrap_or(source_refs.len() as u32)
        .max(source_refs.len() as u32);
    let source_text = source_refs
        .iter()
        .filter_map(|source_ref| {
            recent_messages
                .iter()
                .find(|message| {
                    message.get("id").and_then(Value::as_str) == Some(source_ref.as_str())
                })
                .map(source_message_text)
        })
        .filter(|text| !text.trim().is_empty())
        .collect::<Vec<_>>()
        .join(" ");
    let readiness =
        if decision.approval_required || matches!(decision.urgency.as_str(), "urgent" | "today") {
            "ready_now"
        } else {
            "ready"
        };
    let summary = format!(
        "Prepared a decision memo for {} using {} decision ref{}.",
        decision.label,
        source_count,
        if source_count == 1 { "" } else { "s" }
    );
    let body = decision_memo_body(
        decision,
        prepared_context_packet,
        &source_text,
        &source_refs,
        recent_messages,
    );
    let scope = prepared_draft_scope_from_source_refs(&source_refs, recent_messages);

    Some(PreparedDraftArtifact {
        draft_id: format!("draft:decision_memo:{}", stable_slug(&decision.label)),
        draft_class: PREPARED_DRAFT_CLASS_DECISION_MEMO.to_string(),
        label: format!("Decision memo for {}", decision.label),
        channel: "decision".to_string(),
        summary,
        body,
        confidence: decision.confidence.clone(),
        readiness: readiness.to_string(),
        response_due_hint: decision.urgency.clone(),
        approval_required_to_send: false,
        source_refs,
        source_count,
        storage_type: AFP_TYPE_LEDGER.to_string(),
        storage_kind: Some(AFP_KIND_RICH_NOTE.to_string()),
        comparison_headers: Vec::new(),
        comparison_rows: Vec::new(),
        selection_reason: None,
        suggested_next_action: "Review decision memo".to_string(),
        object_refs: Vec::new(),
        memory_space: scope.memory_space,
        author_mask: scope.author_mask,
        author_type: scope.author_type,
        author_id: scope.author_id,
        is_human_authored: scope.is_human_authored,
        human_only: scope.human_only,
    })
}

fn comparison_table_draft_from_decisions(
    decision_queue: &[StateSnapshotDecisionItem],
    prepared_context_packet: Option<&PreparedContextPacket>,
    recent_messages: &[Value],
) -> Option<PreparedDraftArtifact> {
    let compared = decision_queue.iter().take(3).cloned().collect::<Vec<_>>();
    if compared.len() < 2 {
        return None;
    }

    let mut source_refs = compared
        .iter()
        .flat_map(|item| item.source_refs.iter().cloned())
        .collect::<Vec<_>>();
    source_refs.sort();
    source_refs.dedup();
    source_refs.truncate(6);

    let source_count = prepared_context_packet
        .map(|packet| {
            packet.decision_refs.len() as u32
                + packet.decision_history_refs.len() as u32
                + packet.source_refs.len() as u32
        })
        .unwrap_or(source_refs.len() as u32)
        .max(source_refs.len() as u32);
    let readiness = if compared
        .iter()
        .any(|item| item.approval_required || matches!(item.urgency.as_str(), "urgent" | "today"))
    {
        "ready_now"
    } else {
        "ready"
    };
    let scope = prepared_draft_scope_from_source_refs(&source_refs, recent_messages);

    Some(PreparedDraftArtifact {
        draft_id: "draft:comparison_table:decision-queue".to_string(),
        draft_class: PREPARED_DRAFT_CLASS_COMPARISON_TABLE.to_string(),
        label: "Decision comparison table".to_string(),
        channel: "comparison".to_string(),
        summary: format!(
            "Prepared a comparison table for {} active decision options.",
            compared.len()
        ),
        body: "Use this comparison to review active decisions side by side.".to_string(),
        confidence: "medium".to_string(),
        readiness: readiness.to_string(),
        response_due_hint: "Current decision window".to_string(),
        approval_required_to_send: false,
        source_refs,
        source_count,
        storage_type: AFP_TYPE_LEDGER.to_string(),
        storage_kind: Some(AFP_KIND_RICH_NOTE.to_string()),
        comparison_headers: vec![
            "Category".to_string(),
            "Urgency".to_string(),
            "Confidence".to_string(),
            "Next step".to_string(),
        ],
        comparison_rows: compared
            .iter()
            .map(|item| PreparedDraftComparisonRow {
                label: item.label.clone(),
                values: vec![
                    item.category.clone(),
                    item.urgency.clone(),
                    item.confidence.clone(),
                    item.suggested_next_action.clone(),
                ],
            })
            .collect(),
        selection_reason: None,
        suggested_next_action: "Review comparison table".to_string(),
        object_refs: Vec::new(),
        memory_space: scope.memory_space,
        author_mask: scope.author_mask,
        author_type: scope.author_type,
        author_id: scope.author_id,
        is_human_authored: scope.is_human_authored,
        human_only: scope.human_only,
    })
}

fn follow_up_draft_from_context(
    context_panel_items: &[StateSnapshotContextItem],
    prepared_context_packet: Option<&PreparedContextPacket>,
    recent_messages: &[Value],
) -> Option<PreparedDraftArtifact> {
    let context_item = context_panel_items.iter().find(|item| {
        item.relation_path
            .iter()
            .any(|relation| relation == "same_follow_up_chain")
            || item.why_surfaced.to_ascii_lowercase().contains("follow-up")
            || item.label.to_ascii_lowercase().contains("follow-up")
    })?;

    let mut source_refs = context_item.source_refs.clone();
    if source_refs.is_empty() {
        source_refs.push(context_item.id.clone());
    }
    if let Some(packet) = prepared_context_packet {
        for follow_up_ref in &packet.follow_up_refs {
            if !source_refs.iter().any(|existing| existing == follow_up_ref) {
                source_refs.push(follow_up_ref.clone());
            }
        }
    }
    source_refs.truncate(4);

    let source_count = prepared_context_packet
        .map(|packet| {
            packet.follow_up_refs.len() as u32
                + packet.relationship_refs.len() as u32
                + packet.decision_history_refs.len() as u32
        })
        .unwrap_or(source_refs.len() as u32)
        .max(source_refs.len() as u32);
    let source_text = source_refs
        .iter()
        .filter_map(|source_ref| {
            recent_messages
                .iter()
                .find(|message| {
                    message.get("id").and_then(Value::as_str) == Some(source_ref.as_str())
                })
                .map(source_message_text)
        })
        .filter(|text| !text.trim().is_empty())
        .collect::<Vec<_>>()
        .join(" ");
    let readiness = if prepared_context_packet
        .map(|packet| !packet.follow_up_refs.is_empty())
        .unwrap_or(false)
    {
        "ready_now"
    } else {
        "ready"
    };
    let summary = format!(
        "Prepared a follow-up draft for {} using {} continuity ref{}.",
        context_item.label,
        source_count,
        if source_count == 1 { "" } else { "s" }
    );
    let body = follow_up_draft_body(
        context_item,
        prepared_context_packet,
        &source_text,
        &source_refs,
        recent_messages,
    );
    let scope = prepared_draft_scope_from_source_refs(&source_refs, recent_messages);

    Some(PreparedDraftArtifact {
        draft_id: format!("draft:follow_up:{}", stable_slug(&context_item.label)),
        draft_class: PREPARED_DRAFT_CLASS_FOLLOW_UP.to_string(),
        label: format!("Follow-up draft for {}", context_item.label),
        channel: "follow_up".to_string(),
        summary,
        body,
        confidence: context_item.confidence.clone(),
        readiness: readiness.to_string(),
        response_due_hint: "Next follow-up window".to_string(),
        approval_required_to_send: true,
        source_refs,
        source_count,
        storage_type: AFP_TYPE_LEDGER.to_string(),
        storage_kind: Some(AFP_KIND_RICH_NOTE.to_string()),
        comparison_headers: Vec::new(),
        comparison_rows: Vec::new(),
        selection_reason: None,
        suggested_next_action: "Review follow-up draft".to_string(),
        object_refs: Vec::new(),
        memory_space: scope.memory_space,
        author_mask: scope.author_mask,
        author_type: scope.author_type,
        author_id: scope.author_id,
        is_human_authored: scope.is_human_authored,
        human_only: scope.human_only,
    })
}

fn meeting_brief_draft_from_commitments(
    active_commitments: &[StateSnapshotCommitment],
    prepared_context_packet: Option<&PreparedContextPacket>,
    recent_messages: &[Value],
) -> Option<PreparedDraftArtifact> {
    let commitment = active_commitments
        .iter()
        .find(|item| looks_like_meeting_commitment(&item.label))?;
    let source_refs = if commitment.source_refs.is_empty() {
        prepared_context_packet
            .map(|packet| packet.source_refs.iter().take(3).cloned().collect())
            .unwrap_or_default()
    } else {
        commitment.source_refs.clone()
    };

    let source_count = prepared_context_packet
        .map(|packet| {
            packet.source_refs.len() as u32
                + packet.decision_history_refs.len() as u32
                + packet.file_refs.len() as u32
        })
        .unwrap_or(source_refs.len() as u32)
        .max(source_refs.len() as u32);
    let summary = format!(
        "Prepared a meeting brief for {} using {} context ref{}.",
        commitment.label,
        source_count,
        if source_count == 1 { "" } else { "s" }
    );
    let body = meeting_brief_body(
        &commitment.label,
        &commitment.time_horizon,
        prepared_context_packet,
        recent_messages,
        &source_refs,
    );
    let scope = prepared_draft_scope_from_source_refs(&source_refs, recent_messages);
    let readiness = if matches!(commitment.time_horizon.as_str(), "today" | "active") {
        "ready_now"
    } else {
        "ready"
    };

    Some(PreparedDraftArtifact {
        draft_id: format!("draft:meeting_brief:{}", stable_slug(&commitment.label)),
        draft_class: PREPARED_DRAFT_CLASS_MEETING_BRIEF.to_string(),
        label: format!("Meeting brief for {}", commitment.label),
        channel: "meeting".to_string(),
        summary,
        body,
        confidence: "medium".to_string(),
        readiness: readiness.to_string(),
        response_due_hint: if commitment.time_horizon.trim().is_empty() {
            "Before the meeting".to_string()
        } else {
            format!("Before {}", commitment.time_horizon)
        },
        approval_required_to_send: false,
        source_refs,
        source_count,
        storage_type: AFP_TYPE_LEDGER.to_string(),
        storage_kind: Some(AFP_KIND_RICH_NOTE.to_string()),
        comparison_headers: Vec::new(),
        comparison_rows: Vec::new(),
        selection_reason: None,
        suggested_next_action: "Review meeting brief".to_string(),
        object_refs: Vec::new(),
        memory_space: scope.memory_space,
        author_mask: scope.author_mask,
        author_type: scope.author_type,
        author_id: scope.author_id,
        is_human_authored: scope.is_human_authored,
        human_only: scope.human_only,
    })
}

fn task_bundle_draft_from_commitments(
    active_commitments: &[StateSnapshotCommitment],
    prepared_context_packet: Option<&PreparedContextPacket>,
    recent_messages: &[Value],
) -> Option<PreparedDraftArtifact> {
    let task_commitments = active_commitments
        .iter()
        .filter(|item| !looks_like_meeting_commitment(&item.label))
        .take(3)
        .cloned()
        .collect::<Vec<_>>();
    if task_commitments.len() < 2 {
        return None;
    }

    let mut source_refs = task_commitments
        .iter()
        .flat_map(|item| item.source_refs.iter().cloned())
        .collect::<Vec<_>>();
    source_refs.sort();
    source_refs.dedup();
    source_refs.truncate(5);

    let source_count = prepared_context_packet
        .map(|packet| {
            packet.source_refs.len() as u32
                + packet.relationship_refs.len() as u32
                + packet.file_refs.len() as u32
        })
        .unwrap_or(source_refs.len() as u32)
        .max(source_refs.len() as u32);
    let readiness = if task_commitments
        .iter()
        .any(|item| matches!(item.time_horizon.as_str(), "today" | "active"))
    {
        "ready_now"
    } else {
        "ready"
    };
    let primary_label = task_commitments
        .first()
        .map(|item| item.label.clone())
        .unwrap_or_else(|| "active work".to_string());
    let summary = format!(
        "Prepared a task bundle around {} and {} related commitment{}.",
        primary_label,
        task_commitments.len().saturating_sub(1),
        if task_commitments.len() == 2 { "" } else { "s" }
    );
    let body = task_bundle_body(
        &task_commitments,
        prepared_context_packet,
        &source_refs,
        recent_messages,
    );
    let scope = prepared_draft_scope_from_source_refs(&source_refs, recent_messages);

    Some(PreparedDraftArtifact {
        draft_id: format!("draft:task_bundle:{}", stable_slug(&primary_label)),
        draft_class: PREPARED_DRAFT_CLASS_TASK_BUNDLE.to_string(),
        label: format!("Task bundle for {}", primary_label),
        channel: "tasks".to_string(),
        summary,
        body,
        confidence: "medium".to_string(),
        readiness: readiness.to_string(),
        response_due_hint: "Current work window".to_string(),
        approval_required_to_send: false,
        source_refs,
        source_count,
        storage_type: AFP_TYPE_LEDGER.to_string(),
        storage_kind: Some(AFP_KIND_RICH_NOTE.to_string()),
        comparison_headers: Vec::new(),
        comparison_rows: Vec::new(),
        selection_reason: None,
        suggested_next_action: "Review task bundle".to_string(),
        object_refs: Vec::new(),
        memory_space: scope.memory_space,
        author_mask: scope.author_mask,
        author_type: scope.author_type,
        author_id: scope.author_id,
        is_human_authored: scope.is_human_authored,
        human_only: scope.human_only,
    })
}

fn project_prep_note_from_context(
    context_panel_items: &[StateSnapshotContextItem],
    prepared_context_packet: Option<&PreparedContextPacket>,
    recent_messages: &[Value],
) -> Option<PreparedDraftArtifact> {
    let project_item = context_panel_items.iter().find(|item| {
        item.relation_path.iter().any(|relation| {
            matches!(
                relation.as_str(),
                "same_project" | "same_area" | "same_resource"
            )
        })
    })?;

    let mut source_refs = project_item.source_refs.clone();
    if source_refs.is_empty() {
        source_refs.push(project_item.id.clone());
    }
    if let Some(packet) = prepared_context_packet {
        for anchor_ref in &packet.anchor_refs {
            if !source_refs.iter().any(|existing| existing == anchor_ref) {
                source_refs.push(anchor_ref.clone());
            }
        }
    }
    source_refs.truncate(5);

    let source_count = prepared_context_packet
        .map(|packet| {
            packet.source_refs.len() as u32
                + packet.relationship_refs.len() as u32
                + packet.file_refs.len() as u32
        })
        .unwrap_or(source_refs.len() as u32)
        .max(source_refs.len() as u32);
    let readiness = if prepared_context_packet
        .map(|packet| !packet.file_refs.is_empty() || !packet.relationship_refs.is_empty())
        .unwrap_or(false)
    {
        "ready_now"
    } else {
        "ready"
    };
    let summary = format!(
        "Prepared a project prep note for {} using {} continuity ref{}.",
        project_item.label,
        source_count,
        if source_count == 1 { "" } else { "s" }
    );
    let body = project_prep_note_body(
        project_item,
        prepared_context_packet,
        &source_refs,
        recent_messages,
    );
    let scope = prepared_draft_scope_from_source_refs(&source_refs, recent_messages);

    Some(PreparedDraftArtifact {
        draft_id: format!(
            "draft:project_prep_note:{}",
            stable_slug(&project_item.label)
        ),
        draft_class: PREPARED_DRAFT_CLASS_PROJECT_PREP_NOTE.to_string(),
        label: format!("Project prep note for {}", project_item.label),
        channel: "project".to_string(),
        summary,
        body,
        confidence: project_item.confidence.clone(),
        readiness: readiness.to_string(),
        response_due_hint: "Next work session".to_string(),
        approval_required_to_send: false,
        source_refs,
        source_count,
        storage_type: AFP_TYPE_LEDGER.to_string(),
        storage_kind: Some(AFP_KIND_RICH_NOTE.to_string()),
        comparison_headers: Vec::new(),
        comparison_rows: Vec::new(),
        selection_reason: None,
        suggested_next_action: "Review project prep note".to_string(),
        object_refs: Vec::new(),
        memory_space: scope.memory_space,
        author_mask: scope.author_mask,
        author_type: scope.author_type,
        author_id: scope.author_id,
        is_human_authored: scope.is_human_authored,
        human_only: scope.human_only,
    })
}

fn draft_summary_for_channel(channel: &str, due_hint: &str) -> String {
    match channel {
        "email" => {
            format!("Prepared an email reply draft for review. Suggested timing: {due_hint}.")
        }
        "slack" => {
            format!("Prepared a Slack reply draft for review. Suggested timing: {due_hint}.")
        }
        _ => {
            format!("Prepared a reply draft for review on {channel}. Suggested timing: {due_hint}.")
        }
    }
}

fn draft_body_for_channel(channel: &str, source_text: &str, due_hint: &str) -> String {
    let opening = opening_line(source_text);
    let commitment = commitment_line(source_text, due_hint);
    let closing = if channel == "email" {
        "\n\nBest,\n[Your Name]"
    } else {
        ""
    };

    format!("{opening}\n\n{commitment}{closing}")
}

fn opening_line(source_text: &str) -> &'static str {
    let lower = source_text.to_ascii_lowercase();
    if lower.contains("quote") || lower.contains("pricing") {
        "Thanks for sending this through."
    } else if lower.contains("deadline") || lower.contains("today") || lower.contains("asap") {
        "Thanks for the heads-up."
    } else if lower.contains("can you")
        || lower.contains("could you")
        || lower.contains("let me know")
    {
        "Thanks for reaching out."
    } else {
        "Thanks for the update."
    }
}

fn commitment_line(source_text: &str, due_hint: &str) -> String {
    let lower = source_text.to_ascii_lowercase();
    if lower.contains("quote")
        || lower.contains("pricing")
        || lower.contains("vendor")
        || lower.contains("supplier")
    {
        format!("I am reviewing the details now and will follow up {due_hint}.")
    } else if lower.contains("meeting")
        || lower.contains("schedule")
        || lower.contains("availability")
    {
        format!("I will check the schedule and confirm {due_hint}.")
    } else if lower.contains("deadline") || lower.contains("today") || lower.contains("asap") {
        format!("I saw the timing note and will get back to you {due_hint}.")
    } else {
        format!("I am on it and will reply {due_hint}.")
    }
}

fn source_message_text(message: &Value) -> String {
    [
        message["content"]["title"].as_str(),
        message["content"]["subject"].as_str(),
        message["content"]["summary"].as_str(),
        message["content"]["body"].as_str(),
        message["content"]["text"].as_str(),
    ]
    .into_iter()
    .flatten()
    .collect::<Vec<_>>()
    .join(" ")
}

fn draft_rank(draft: &PreparedDraftArtifact) -> (u8, u8, String) {
    let class_rank = match draft.draft_class.as_str() {
        PREPARED_DRAFT_CLASS_COMMUNICATION_REPLY => 0,
        PREPARED_DRAFT_CLASS_DECISION_MEMO => 1,
        PREPARED_DRAFT_CLASS_COMPARISON_TABLE => 2,
        PREPARED_DRAFT_CLASS_FOLLOW_UP => 3,
        PREPARED_DRAFT_CLASS_MEETING_BRIEF => 4,
        PREPARED_DRAFT_CLASS_TASK_BUNDLE => 5,
        PREPARED_DRAFT_CLASS_PROJECT_PREP_NOTE => 6,
        _ => 7,
    };
    let readiness_rank = match draft.readiness.as_str() {
        "ready_now" => 0,
        "ready" => 1,
        _ => 2,
    };
    let confidence_rank = match draft.confidence.as_str() {
        "high" => 0,
        "medium" => 1,
        _ => 2,
    };
    (
        class_rank,
        readiness_rank,
        format!("{confidence_rank}:{}", draft.label),
    )
}

fn prepared_draft_summary(drafts: &[PreparedDraftArtifact]) -> String {
    if drafts.is_empty() {
        return "No prepared drafts are ready yet.".to_string();
    }

    let reply_count = drafts
        .iter()
        .filter(|draft| draft.draft_class == PREPARED_DRAFT_CLASS_COMMUNICATION_REPLY)
        .count();
    let decision_memo_count = drafts
        .iter()
        .filter(|draft| draft.draft_class == PREPARED_DRAFT_CLASS_DECISION_MEMO)
        .count();
    let comparison_table_count = drafts
        .iter()
        .filter(|draft| draft.draft_class == PREPARED_DRAFT_CLASS_COMPARISON_TABLE)
        .count();
    let follow_up_count = drafts
        .iter()
        .filter(|draft| draft.draft_class == PREPARED_DRAFT_CLASS_FOLLOW_UP)
        .count();
    let meeting_brief_count = drafts
        .iter()
        .filter(|draft| draft.draft_class == PREPARED_DRAFT_CLASS_MEETING_BRIEF)
        .count();
    let task_bundle_count = drafts
        .iter()
        .filter(|draft| draft.draft_class == PREPARED_DRAFT_CLASS_TASK_BUNDLE)
        .count();
    let project_prep_note_count = drafts
        .iter()
        .filter(|draft| draft.draft_class == PREPARED_DRAFT_CLASS_PROJECT_PREP_NOTE)
        .count();
    if reply_count > 0
        && decision_memo_count == 0
        && comparison_table_count == 0
        && follow_up_count == 0
        && meeting_brief_count == 0
        && task_bundle_count == 0
        && project_prep_note_count == 0
    {
        format!(
            "Prepared {reply_count} communication reply draft{} for review.",
            if reply_count == 1 { "" } else { "s" }
        )
    } else if decision_memo_count > 0
        && reply_count == 0
        && comparison_table_count == 0
        && follow_up_count == 0
        && meeting_brief_count == 0
        && task_bundle_count == 0
        && project_prep_note_count == 0
    {
        format!(
            "Prepared {decision_memo_count} decision memo{} for review.",
            if decision_memo_count == 1 { "" } else { "s" }
        )
    } else if comparison_table_count > 0
        && reply_count == 0
        && decision_memo_count == 0
        && follow_up_count == 0
        && meeting_brief_count == 0
        && task_bundle_count == 0
        && project_prep_note_count == 0
    {
        format!(
            "Prepared {comparison_table_count} comparison table{} for review.",
            if comparison_table_count == 1 { "" } else { "s" }
        )
    } else if follow_up_count > 0
        && reply_count == 0
        && decision_memo_count == 0
        && comparison_table_count == 0
        && meeting_brief_count == 0
        && task_bundle_count == 0
        && project_prep_note_count == 0
    {
        format!(
            "Prepared {follow_up_count} follow-up draft{} for review.",
            if follow_up_count == 1 { "" } else { "s" }
        )
    } else if meeting_brief_count > 0
        && reply_count == 0
        && decision_memo_count == 0
        && comparison_table_count == 0
        && follow_up_count == 0
        && task_bundle_count == 0
        && project_prep_note_count == 0
    {
        format!(
            "Prepared {meeting_brief_count} meeting brief{} for review.",
            if meeting_brief_count == 1 { "" } else { "s" }
        )
    } else if task_bundle_count > 0
        && reply_count == 0
        && decision_memo_count == 0
        && comparison_table_count == 0
        && follow_up_count == 0
        && meeting_brief_count == 0
        && project_prep_note_count == 0
    {
        format!(
            "Prepared {task_bundle_count} task bundle{} for review.",
            if task_bundle_count == 1 { "" } else { "s" }
        )
    } else if project_prep_note_count > 0
        && reply_count == 0
        && decision_memo_count == 0
        && follow_up_count == 0
        && meeting_brief_count == 0
        && task_bundle_count == 0
    {
        format!(
            "Prepared {project_prep_note_count} project prep note{} for review.",
            if project_prep_note_count == 1 {
                ""
            } else {
                "s"
            }
        )
    } else if reply_count > 0
        || decision_memo_count > 0
        || comparison_table_count > 0
        || follow_up_count > 0
        || meeting_brief_count > 0
        || task_bundle_count > 0
        || project_prep_note_count > 0
    {
        format!(
            "Prepared {} draft artifact{} for review, including {} reply draft{}, {} decision memo{}, {} comparison table{}, {} follow-up draft{}, {} meeting brief{}, {} task bundle{}, and {} project prep note{}.",
            drafts.len(),
            if drafts.len() == 1 { "" } else { "s" },
            reply_count,
            if reply_count == 1 { "" } else { "s" },
            decision_memo_count,
            if decision_memo_count == 1 { "" } else { "s" },
            comparison_table_count,
            if comparison_table_count == 1 { "" } else { "s" },
            follow_up_count,
            if follow_up_count == 1 { "" } else { "s" },
            meeting_brief_count,
            if meeting_brief_count == 1 { "" } else { "s" },
            task_bundle_count,
            if task_bundle_count == 1 { "" } else { "s" },
            project_prep_note_count,
            if project_prep_note_count == 1 {
                ""
            } else {
                "s"
            }
        )
    } else {
        format!(
            "Prepared {} draft artifact{} for review.",
            drafts.len(),
            if drafts.len() == 1 { "" } else { "s" }
        )
    }
}

fn looks_like_meeting_commitment(label: &str) -> bool {
    let lowered = label.to_ascii_lowercase();
    [
        "meeting",
        "call",
        "sync",
        "standup",
        "interview",
        "review",
        "agenda",
        "1:1",
    ]
    .iter()
    .any(|needle| lowered.contains(needle))
}

fn decision_memo_body(
    decision: &StateSnapshotDecisionItem,
    prepared_context_packet: Option<&PreparedContextPacket>,
    source_text: &str,
    source_refs: &[String],
    recent_messages: &[Value],
) -> String {
    let context_summary = prepared_context_packet
        .map(|packet| packet.summary.clone())
        .unwrap_or_else(|| {
            "Prepared context is limited; inspect the linked refs before deciding.".to_string()
        });
    let highlights = source_refs
        .iter()
        .filter_map(|source_ref| {
            recent_messages
                .iter()
                .find(|message| {
                    message.get("id").and_then(Value::as_str) == Some(source_ref.as_str())
                })
                .map(source_message_text)
        })
        .map(|text| text.replace('\n', " ").trim().to_string())
        .filter(|text| !text.is_empty())
        .take(3)
        .collect::<Vec<_>>();

    let stance = if decision.approval_required {
        "This decision crosses an approval boundary and should be reviewed explicitly."
    } else if matches!(decision.urgency.as_str(), "urgent" | "today") {
        "This decision is time-sensitive and should be resolved soon."
    } else {
        "This decision is active and worth resolving with the linked context."
    };

    let mut lines = vec![
        format!("Decision memo for {}", decision.label),
        String::new(),
        format!("Category: {}", decision.category),
        format!("Urgency: {}", decision.urgency),
        stance.to_string(),
        context_summary,
        String::new(),
        "Recommended framing:".to_string(),
        format!("- Decision needed: {}", decision.label),
        format!(
            "- Suggested next action: {}",
            decision.suggested_next_action
        ),
        format!("- Confidence: {}", decision.confidence),
    ];

    if !source_text.trim().is_empty() {
        lines.push(format!(
            "- Working context: {}",
            truncate_highlight(source_text.trim())
        ));
    }

    if !highlights.is_empty() {
        lines.push(String::new());
        lines.push("Supporting highlights:".to_string());
        for highlight in highlights {
            lines.push(format!("- {}", truncate_highlight(&highlight)));
        }
    }

    lines.join("\n")
}

fn task_bundle_body(
    commitments: &[StateSnapshotCommitment],
    prepared_context_packet: Option<&PreparedContextPacket>,
    source_refs: &[String],
    recent_messages: &[Value],
) -> String {
    let context_summary = prepared_context_packet
        .map(|packet| packet.summary.clone())
        .unwrap_or_else(|| {
            "Prepared context is limited; review the linked refs before bundling work.".to_string()
        });
    let highlights = source_refs
        .iter()
        .filter_map(|source_ref| {
            recent_messages
                .iter()
                .find(|message| {
                    message.get("id").and_then(Value::as_str) == Some(source_ref.as_str())
                })
                .map(source_message_text)
        })
        .map(|text| text.replace('\n', " ").trim().to_string())
        .filter(|text| !text.is_empty())
        .take(2)
        .collect::<Vec<_>>();

    let mut lines = vec![
        "Task bundle".to_string(),
        String::new(),
        context_summary,
        String::new(),
        "Grouped work:".to_string(),
    ];

    for commitment in commitments {
        lines.push(format!(
            "- {} ({})",
            commitment.label,
            if commitment.time_horizon.trim().is_empty() {
                "active"
            } else {
                commitment.time_horizon.as_str()
            }
        ));
    }

    lines.push(String::new());
    lines.push("Recommended next step: batch these into one focused work window.".to_string());

    if !highlights.is_empty() {
        lines.push(String::new());
        lines.push("Context highlights:".to_string());
        for highlight in highlights {
            lines.push(format!("- {}", truncate_highlight(&highlight)));
        }
    }

    lines.join("\n")
}

fn project_prep_note_body(
    context_item: &StateSnapshotContextItem,
    prepared_context_packet: Option<&PreparedContextPacket>,
    source_refs: &[String],
    recent_messages: &[Value],
) -> String {
    let context_summary = prepared_context_packet
        .map(|packet| packet.summary.clone())
        .unwrap_or_else(|| "Prepared context is limited; review the linked refs before the next project work session.".to_string());
    let highlights = source_refs
        .iter()
        .filter_map(|source_ref| {
            recent_messages
                .iter()
                .find(|message| {
                    message.get("id").and_then(Value::as_str) == Some(source_ref.as_str())
                })
                .map(source_message_text)
        })
        .map(|text| text.replace('\n', " ").trim().to_string())
        .filter(|text| !text.is_empty())
        .take(3)
        .collect::<Vec<_>>();

    let mut lines = vec![
        format!("Project prep note for {}", context_item.label),
        String::new(),
        format!("Why surfaced: {}", context_item.why_surfaced),
        context_summary,
        String::new(),
        "Recommended prep:".to_string(),
        "- Review the linked project context before the next focused session.".to_string(),
        "- Reconfirm current owner, next milestone, and any open dependencies.".to_string(),
        "- Bring the most relevant file or thread forward before starting work.".to_string(),
    ];

    if !highlights.is_empty() {
        lines.push(String::new());
        lines.push("Supporting highlights:".to_string());
        for highlight in highlights {
            lines.push(format!("- {}", truncate_highlight(&highlight)));
        }
    }

    lines.join("\n")
}

fn follow_up_draft_body(
    context_item: &StateSnapshotContextItem,
    prepared_context_packet: Option<&PreparedContextPacket>,
    source_text: &str,
    source_refs: &[String],
    recent_messages: &[Value],
) -> String {
    let opener = if source_text.to_ascii_lowercase().contains("waiting")
        || context_item
            .why_surfaced
            .to_ascii_lowercase()
            .contains("pending")
    {
        "Following up on the open thread here."
    } else {
        "Following up on this from the current continuity context."
    };
    let context_summary = prepared_context_packet
        .map(|packet| packet.summary.clone())
        .unwrap_or_else(|| {
            "Prepared context is limited; review the linked continuity refs before sending."
                .to_string()
        });
    let highlights = source_refs
        .iter()
        .filter_map(|source_ref| {
            recent_messages
                .iter()
                .find(|message| {
                    message.get("id").and_then(Value::as_str) == Some(source_ref.as_str())
                })
                .map(source_message_text)
        })
        .map(|text| text.replace('\n', " ").trim().to_string())
        .filter(|text| !text.is_empty())
        .take(2)
        .collect::<Vec<_>>();

    let mut lines = vec![
        opener.to_string(),
        String::new(),
        "Wanted to close the loop on this and share the next step.".to_string(),
        "I am reviewing the linked context now and can confirm the right owner or timing shortly."
            .to_string(),
        String::new(),
        format!("Why now: {}", context_item.why_surfaced),
        context_summary,
    ];

    if !highlights.is_empty() {
        lines.push(String::new());
        lines.push("Continuity highlights:".to_string());
        for highlight in highlights {
            lines.push(format!("- {}", truncate_highlight(&highlight)));
        }
    }

    lines.join("\n")
}

fn meeting_brief_body(
    label: &str,
    time_horizon: &str,
    prepared_context_packet: Option<&PreparedContextPacket>,
    recent_messages: &[Value],
    source_refs: &[String],
) -> String {
    let context_summary = prepared_context_packet
        .map(|packet| packet.summary.clone())
        .unwrap_or_else(|| {
            "Prepared context is limited; use the linked refs as the starting point.".to_string()
        });
    let highlights = source_refs
        .iter()
        .filter_map(|source_ref| {
            recent_messages
                .iter()
                .find(|message| {
                    message.get("id").and_then(Value::as_str) == Some(source_ref.as_str())
                })
                .map(source_message_text)
        })
        .map(|text| text.replace('\n', " ").trim().to_string())
        .filter(|text| !text.is_empty())
        .take(3)
        .collect::<Vec<_>>();

    let mut lines = vec![
        format!("Meeting brief for {label}"),
        String::new(),
        format!(
            "Timing: {}",
            if time_horizon.trim().is_empty() {
                "upcoming"
            } else {
                time_horizon
            }
        ),
        context_summary,
        String::new(),
        "Recommended prep:".to_string(),
        "- Review the most recent decision and follow-up context.".to_string(),
        "- Check open dependencies or files linked to this topic.".to_string(),
        "- Arrive with one concrete next step to confirm.".to_string(),
    ];

    if !highlights.is_empty() {
        lines.push(String::new());
        lines.push("Context highlights:".to_string());
        for highlight in highlights {
            lines.push(format!("- {}", truncate_highlight(&highlight)));
        }
    }

    lines.join("\n")
}

fn truncate_highlight(input: &str) -> String {
    const MAX_LEN: usize = 120;
    if input.chars().count() <= MAX_LEN {
        input.to_string()
    } else {
        let truncated = input.chars().take(MAX_LEN - 1).collect::<String>();
        format!("{truncated}...")
    }
}

fn stable_slug(input: &str) -> String {
    let slug = input
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() {
                ch.to_ascii_lowercase()
            } else {
                '-'
            }
        })
        .collect::<String>();
    slug.trim_matches('-')
        .split('-')
        .filter(|segment| !segment.is_empty())
        .collect::<Vec<_>>()
        .join("-")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::state_snapshot::{StateSnapshotCommitment, StateSnapshotResponseItem};

    #[test]
    fn builds_communication_reply_draft_packet_from_response_queue() {
        let prepared_context = PreparedContextPacket {
            packet_kind: "continuity_context".to_string(),
            ready: true,
            summary: "Prepared context ready.".to_string(),
            anchor_refs: vec!["msg_1".to_string()],
            source_refs: vec!["msg_1".to_string()],
            decision_refs: Vec::new(),
            decision_history_refs: Vec::new(),
            response_refs: vec!["msg_1".to_string()],
            follow_up_refs: Vec::new(),
            relationship_refs: Vec::new(),
            project_refs: Vec::new(),
            reference_refs: Vec::new(),
            object_refs: Vec::new(),
            thread_refs: Vec::new(),
            file_refs: Vec::new(),
            packs: Vec::new(),
            decrypt_needed_count: 0,
            memory_space: None,
            author_mask: None,
            author_type: None,
            author_id: None,
            is_human_authored: None,
            human_only: None,
            ..PreparedContextPacket::default()
        };
        let response_queue = vec![StateSnapshotResponseItem {
            id: "msg_1".to_string(),
            label: "Supplier quote follow up".to_string(),
            channel: "email".to_string(),
            urgency: "today".to_string(),
            confidence: "medium".to_string(),
            response_due_hint: "Today".to_string(),
            source_refs: vec!["msg_1".to_string()],
            suggested_next_action: "Draft reply".to_string(),
        }];
        let recent_messages = vec![json!({
            "id": "msg_1",
            "type": "email_thread",
            "content": {
                "subject": "Supplier quote follow up",
                "body": "Can you send approval today for the updated pricing?"
            }
        })];

        let packet = build_prepared_draft_packet(
            None,
            Some(&prepared_context),
            &[],
            &response_queue,
            &[],
            &[],
            &recent_messages,
        );

        assert!(packet.ready);
        assert_eq!(packet.drafts.len(), 1);
        assert_eq!(
            packet.drafts[0].draft_class,
            PREPARED_DRAFT_CLASS_COMMUNICATION_REPLY
        );
        assert_eq!(packet.drafts[0].channel, "email");
        assert!(packet.drafts[0].body.contains("Today"));
        assert_eq!(packet.drafts[0].storage_type, AFP_TYPE_LEDGER);
        assert_eq!(
            packet.drafts[0].storage_kind.as_deref(),
            Some(AFP_KIND_RICH_NOTE)
        );
    }

    #[test]
    fn builds_ledger_artifact_using_existing_rich_note_shape() {
        let draft = PreparedDraftArtifact {
            draft_id: "draft_1".to_string(),
            draft_class: PREPARED_DRAFT_CLASS_COMMUNICATION_REPLY.to_string(),
            label: "Reply draft for supplier".to_string(),
            channel: "slack".to_string(),
            summary: "Prepared a Slack reply draft for review.".to_string(),
            body: "Thanks for the update.".to_string(),
            confidence: "medium".to_string(),
            readiness: "ready".to_string(),
            response_due_hint: "Within 24h".to_string(),
            approval_required_to_send: true,
            source_refs: vec!["msg_1".to_string()],
            source_count: 1,
            storage_type: AFP_TYPE_LEDGER.to_string(),
            storage_kind: Some(AFP_KIND_RICH_NOTE.to_string()),
            comparison_headers: Vec::new(),
            comparison_rows: Vec::new(),
            selection_reason: None,
            suggested_next_action: "Review and send slack reply".to_string(),
            object_refs: Vec::new(),
            memory_space: None,
            author_mask: None,
            author_type: None,
            author_id: None,
            is_human_authored: None,
            human_only: None,
        };

        let afp = build_prepared_draft_ledger_afp(
            "user_01",
            "continuity:state:user_01",
            Some("snapshot_1"),
            &draft,
        );

        assert_eq!(afp["type"].as_str(), Some(AFP_TYPE_LEDGER));
        assert_eq!(afp["kind"].as_str(), Some(AFP_KIND_RICH_NOTE));
        assert_eq!(
            afp["subtype"].as_str(),
            Some(PREPARED_DRAFT_CLASS_COMMUNICATION_REPLY)
        );
        assert_eq!(afp["parent_id"].as_str(), Some("snapshot_1"));
        assert_eq!(afp["views"][0]["format"].as_str(), Some("a2ui.v1"));
        assert_eq!(afp["views"][0]["content"]["kind"].as_str(), Some("note"));
    }

    #[test]
    fn builds_meeting_brief_draft_from_active_commitment() {
        let prepared_context = PreparedContextPacket {
            packet_kind: "continuity_context".to_string(),
            ready: true,
            summary: "Prepared context ready: 2 related context items, 1 file ref.".to_string(),
            anchor_refs: vec!["calendar_1".to_string()],
            source_refs: vec!["calendar_1".to_string(), "note_1".to_string()],
            decision_refs: Vec::new(),
            decision_history_refs: vec!["decision_1".to_string()],
            response_refs: Vec::new(),
            follow_up_refs: Vec::new(),
            relationship_refs: Vec::new(),
            project_refs: Vec::new(),
            reference_refs: Vec::new(),
            object_refs: Vec::new(),
            thread_refs: Vec::new(),
            file_refs: vec!["file_1".to_string()],
            packs: Vec::new(),
            decrypt_needed_count: 0,
            memory_space: None,
            author_mask: None,
            author_type: None,
            author_id: None,
            is_human_authored: None,
            human_only: None,
            ..PreparedContextPacket::default()
        };
        let commitments = vec![StateSnapshotCommitment {
            label: "Board review meeting".to_string(),
            time_horizon: "today".to_string(),
            source_refs: vec!["calendar_1".to_string(), "note_1".to_string()],
        }];
        let recent_messages = vec![
            json!({
                "id": "calendar_1",
                "content": {
                    "title": "Board review meeting",
                    "summary": "Review runway, hiring plan, and launch timing."
                }
            }),
            json!({
                "id": "note_1",
                "content": {
                    "title": "Launch prep",
                    "body": "Need one clear funding update and an ownership decision for launch timing."
                }
            }),
        ];

        let packet = build_prepared_draft_packet(
            None,
            Some(&prepared_context),
            &[],
            &[],
            &commitments,
            &[],
            &recent_messages,
        );

        assert!(packet.ready);
        assert_eq!(packet.drafts.len(), 1);
        assert_eq!(
            packet.drafts[0].draft_class,
            PREPARED_DRAFT_CLASS_MEETING_BRIEF
        );
        assert_eq!(packet.drafts[0].channel, "meeting");
        assert_eq!(packet.drafts[0].readiness, "ready_now");
        assert!(!packet.drafts[0].approval_required_to_send);
        assert!(packet.drafts[0].body.contains("Context highlights:"));
    }

    #[test]
    fn builds_follow_up_draft_from_follow_up_context() {
        let prepared_context = PreparedContextPacket {
            packet_kind: "continuity_context".to_string(),
            ready: true,
            summary: "Prepared context ready: 1 related context item, 2 decision history refs."
                .to_string(),
            anchor_refs: vec!["msg_origin".to_string()],
            source_refs: vec!["msg_origin".to_string(), "msg_follow".to_string()],
            decision_refs: Vec::new(),
            decision_history_refs: vec!["decision_1".to_string(), "decision_2".to_string()],
            response_refs: Vec::new(),
            follow_up_refs: vec!["msg_follow".to_string()],
            relationship_refs: vec!["msg_partner".to_string()],
            project_refs: Vec::new(),
            reference_refs: Vec::new(),
            object_refs: Vec::new(),
            thread_refs: Vec::new(),
            file_refs: Vec::new(),
            packs: Vec::new(),
            decrypt_needed_count: 0,
            memory_space: None,
            author_mask: None,
            author_type: None,
            author_id: None,
            is_human_authored: None,
            human_only: None,
            ..PreparedContextPacket::default()
        };
        let context_item = StateSnapshotContextItem {
            id: "msg_follow".to_string(),
            label: "Vendor status follow-up".to_string(),
            why_surfaced: "Pending follow-up chain still unresolved".to_string(),
            confidence: "high".to_string(),
            freshness: "reactivated".to_string(),
            relation_path: vec!["same_follow_up_chain".to_string()],
            source_refs: vec!["msg_origin".to_string(), "msg_follow".to_string()],
            decrypt_needed: false,
        };
        let recent_messages = vec![
            json!({
                "id": "msg_origin",
                "content": {
                    "subject": "Launch blocker",
                    "body": "Need vendor confirmation before we can proceed."
                }
            }),
            json!({
                "id": "msg_follow",
                "content": {
                    "summary": "Still waiting on the vendor timeline and owner confirmation."
                }
            }),
        ];

        let packet = build_prepared_draft_packet(
            None,
            Some(&prepared_context),
            &[],
            &[],
            &[],
            &[context_item],
            &recent_messages,
        );

        assert!(packet.ready);
        assert_eq!(packet.drafts.len(), 1);
        assert_eq!(packet.drafts[0].draft_class, PREPARED_DRAFT_CLASS_FOLLOW_UP);
        assert_eq!(packet.drafts[0].channel, "follow_up");
        assert_eq!(packet.drafts[0].readiness, "ready_now");
        assert!(packet.drafts[0].approval_required_to_send);
        assert!(packet.drafts[0].body.contains("Continuity highlights:"));
    }

    #[test]
    fn builds_decision_memo_from_decision_queue() {
        let prepared_context = PreparedContextPacket {
            packet_kind: "continuity_context".to_string(),
            ready: true,
            summary: "Prepared context ready: 1 decision source, 2 decision history refs."
                .to_string(),
            anchor_refs: vec!["decision_1".to_string()],
            source_refs: vec!["decision_1".to_string()],
            decision_refs: vec!["decision_1".to_string()],
            decision_history_refs: vec!["decision_2".to_string(), "decision_3".to_string()],
            response_refs: Vec::new(),
            follow_up_refs: Vec::new(),
            relationship_refs: Vec::new(),
            project_refs: Vec::new(),
            reference_refs: Vec::new(),
            object_refs: Vec::new(),
            thread_refs: Vec::new(),
            file_refs: Vec::new(),
            packs: Vec::new(),
            decrypt_needed_count: 0,
            memory_space: None,
            author_mask: None,
            author_type: None,
            author_id: None,
            is_human_authored: None,
            human_only: None,
            ..PreparedContextPacket::default()
        };
        let decisions = vec![StateSnapshotDecisionItem {
            id: "decision_1".to_string(),
            label: "Approve supplier renewal".to_string(),
            category: "approval".to_string(),
            urgency: "today".to_string(),
            confidence: "medium".to_string(),
            source_refs: vec!["decision_1".to_string()],
            suggested_next_action: "Review and approve".to_string(),
            approval_required: true,
        }];
        let recent_messages = vec![
            json!({
                "id": "decision_1",
                "type": "decision_request",
                "content": {
                    "title": "Approve supplier renewal",
                    "body": "Contract renewal needed today to keep the service active."
                }
            }),
            json!({
                "id": "decision_2",
                "type": "decision_result",
                "content": {
                    "summary": "Finance confirmed the spend is within budget."
                }
            }),
        ];

        let packet = build_prepared_draft_packet(
            None,
            Some(&prepared_context),
            &decisions,
            &[],
            &[],
            &[],
            &recent_messages,
        );

        assert!(packet.ready);
        assert_eq!(packet.drafts.len(), 1);
        assert_eq!(
            packet.drafts[0].draft_class,
            PREPARED_DRAFT_CLASS_DECISION_MEMO
        );
        assert_eq!(packet.drafts[0].channel, "decision");
        assert_eq!(packet.drafts[0].readiness, "ready_now");
        assert!(!packet.drafts[0].approval_required_to_send);
        assert!(packet.drafts[0].body.contains("Supporting highlights:"));
    }

    #[test]
    fn builds_comparison_table_from_multiple_decisions() {
        let prepared_context = PreparedContextPacket {
            packet_kind: "continuity_context".to_string(),
            ready: true,
            summary: "Prepared context ready: 2 decision sources, 1 decision history ref."
                .to_string(),
            anchor_refs: vec!["decision_1".to_string()],
            source_refs: vec!["decision_1".to_string(), "decision_2".to_string()],
            decision_refs: vec!["decision_1".to_string(), "decision_2".to_string()],
            decision_history_refs: vec!["decision_3".to_string()],
            response_refs: Vec::new(),
            follow_up_refs: Vec::new(),
            relationship_refs: Vec::new(),
            project_refs: Vec::new(),
            reference_refs: Vec::new(),
            object_refs: Vec::new(),
            thread_refs: Vec::new(),
            file_refs: Vec::new(),
            packs: Vec::new(),
            decrypt_needed_count: 0,
            memory_space: None,
            author_mask: None,
            author_type: None,
            author_id: None,
            is_human_authored: None,
            human_only: None,
            ..PreparedContextPacket::default()
        };
        let decisions = vec![
            StateSnapshotDecisionItem {
                id: "decision_1".to_string(),
                label: "Approve supplier renewal".to_string(),
                category: "approval".to_string(),
                urgency: "today".to_string(),
                confidence: "medium".to_string(),
                source_refs: vec!["decision_1".to_string()],
                suggested_next_action: "Review and approve".to_string(),
                approval_required: true,
            },
            StateSnapshotDecisionItem {
                id: "decision_2".to_string(),
                label: "Delay campaign launch".to_string(),
                category: "timing".to_string(),
                urgency: "high".to_string(),
                confidence: "medium".to_string(),
                source_refs: vec!["decision_2".to_string()],
                suggested_next_action: "Review tradeoffs".to_string(),
                approval_required: false,
            },
        ];

        let packet = build_prepared_draft_packet(
            None,
            Some(&prepared_context),
            &decisions,
            &[],
            &[],
            &[],
            &[],
        );

        let comparison = packet
            .drafts
            .iter()
            .find(|draft| draft.draft_class == PREPARED_DRAFT_CLASS_COMPARISON_TABLE)
            .expect("comparison table");
        assert_eq!(comparison.channel, "comparison");
        assert_eq!(comparison.comparison_headers.len(), 4);
        assert_eq!(comparison.comparison_rows.len(), 2);
        assert_eq!(comparison.readiness, "ready_now");
    }

    #[test]
    fn comparison_table_ledger_uses_existing_surface_shape() {
        let draft = PreparedDraftArtifact {
            draft_id: "draft_cmp".to_string(),
            draft_class: PREPARED_DRAFT_CLASS_COMPARISON_TABLE.to_string(),
            label: "Decision comparison table".to_string(),
            channel: "comparison".to_string(),
            summary: "Prepared a comparison table.".to_string(),
            body: "Use this comparison.".to_string(),
            confidence: "medium".to_string(),
            readiness: "ready".to_string(),
            response_due_hint: "Current decision window".to_string(),
            approval_required_to_send: false,
            source_refs: vec!["decision_1".to_string()],
            source_count: 1,
            storage_type: AFP_TYPE_LEDGER.to_string(),
            storage_kind: Some(AFP_KIND_RICH_NOTE.to_string()),
            comparison_headers: vec!["Category".to_string(), "Urgency".to_string()],
            comparison_rows: vec![PreparedDraftComparisonRow {
                label: "Approve supplier renewal".to_string(),
                values: vec!["approval".to_string(), "today".to_string()],
            }],
            selection_reason: None,
            suggested_next_action: "Review comparison table".to_string(),
            object_refs: Vec::new(),
            memory_space: None,
            author_mask: None,
            author_type: None,
            author_id: None,
            is_human_authored: None,
            human_only: None,
        };

        let afp = build_prepared_draft_ledger_afp(
            "user_01",
            "continuity:state:user_01",
            Some("snapshot_1"),
            &draft,
        );

        assert_eq!(afp["views"][0]["format"].as_str(), Some("a2ui.v1"));
        assert_eq!(
            afp["views"][0]["content"]["components"][0]["type"].as_str(),
            Some("comparison_table")
        );
        assert_eq!(
            afp["content"]["comparison_headers"][0].as_str(),
            Some("Category")
        );
        assert_eq!(
            afp["views"][0]["content"]["components"][0]["props"]["consequence_preview"].as_str(),
            Some(
                "Acting now opens prepared decision support without committing to a final action."
            )
        );
        assert_eq!(
            afp["views"][0]["content"]["components"][0]["props"]["provenance_cue"].as_str(),
            Some("Traceable to the decision evidence used to prepare this artifact.")
        );
    }

    #[test]
    fn meeting_brief_ledger_uses_structured_a2ui_sections() {
        let draft = PreparedDraftArtifact {
            draft_id: "draft_meeting".to_string(),
            draft_class: PREPARED_DRAFT_CLASS_MEETING_BRIEF.to_string(),
            label: "Meeting brief for supplier sync".to_string(),
            channel: "meeting".to_string(),
            summary: "Prepared a meeting brief.".to_string(),
            body: [
                "Meeting brief for supplier sync",
                "",
                "Timing: tomorrow",
                "Prepared context ready: 2 related context items.",
                "",
                "Recommended prep:",
                "- Review the most recent decision and follow-up context.",
                "- Check open dependencies or files linked to this topic.",
                "",
                "Context highlights:",
                "- Supplier asked for confirmation on pricing.",
            ]
            .join("\n"),
            confidence: "high".to_string(),
            readiness: "ready_now".to_string(),
            response_due_hint: "tomorrow".to_string(),
            approval_required_to_send: false,
            source_refs: vec!["meeting_1".to_string()],
            source_count: 1,
            storage_type: AFP_TYPE_LEDGER.to_string(),
            storage_kind: Some(AFP_KIND_RICH_NOTE.to_string()),
            comparison_headers: Vec::new(),
            comparison_rows: Vec::new(),
            selection_reason: Some(
                "Selected meeting brief because the upcoming sync already has enough continuity context."
                    .to_string(),
            ),
            suggested_next_action: "Review meeting brief".to_string(),
            object_refs: Vec::new(),
            memory_space: None,
            author_mask: None,
            author_type: None,
            author_id: None,
            is_human_authored: None,
            human_only: None,
        };

        let afp = build_prepared_draft_ledger_afp(
            "user_01",
            "continuity:state:user_01",
            Some("snapshot_1"),
            &draft,
        );

        assert_eq!(afp["views"][0]["format"].as_str(), Some("a2ui.v1"));
        assert_eq!(afp["views"][0]["content"]["kind"].as_str(), Some("panel"));
        assert_eq!(
            afp["views"][0]["content"]["components"][0]["type"].as_str(),
            Some("note")
        );
        assert_eq!(
            afp["views"][0]["content"]["components"][1]["type"].as_str(),
            Some("bullet_list")
        );
        assert_eq!(
            afp["views"][0]["content"]["components"][1]["props"]["title"].as_str(),
            Some("Recommended prep")
        );
        assert_eq!(
            afp["views"][0]["content"]["components"][0]["props"]["consequence_preview"].as_str(),
            Some(
                "Acting now opens prepared context for review rather than executing a side effect."
            )
        );
        assert_eq!(
            afp["views"][0]["content"]["components"][0]["props"]["provenance_cue"].as_str(),
            Some("Traceable to the continuity artifacts used to prepare this draft.")
        );
    }

    #[test]
    fn builds_task_bundle_from_non_meeting_commitments() {
        let prepared_context = PreparedContextPacket {
            packet_kind: "continuity_context".to_string(),
            ready: true,
            summary: "Prepared context ready: 2 related context items, 1 file ref.".to_string(),
            anchor_refs: vec!["task_1".to_string()],
            source_refs: vec!["task_1".to_string(), "task_2".to_string()],
            decision_refs: Vec::new(),
            decision_history_refs: Vec::new(),
            response_refs: Vec::new(),
            follow_up_refs: Vec::new(),
            relationship_refs: vec!["note_1".to_string()],
            project_refs: Vec::new(),
            reference_refs: Vec::new(),
            object_refs: Vec::new(),
            thread_refs: Vec::new(),
            file_refs: vec!["file_1".to_string()],
            packs: Vec::new(),
            decrypt_needed_count: 0,
            memory_space: None,
            author_mask: None,
            author_type: None,
            author_id: None,
            is_human_authored: None,
            human_only: None,
            ..PreparedContextPacket::default()
        };
        let commitments = vec![
            StateSnapshotCommitment {
                label: "Finish proposal draft".to_string(),
                time_horizon: "today".to_string(),
                source_refs: vec!["task_1".to_string()],
            },
            StateSnapshotCommitment {
                label: "Prepare pricing notes".to_string(),
                time_horizon: "active".to_string(),
                source_refs: vec!["task_2".to_string()],
            },
            StateSnapshotCommitment {
                label: "Board review meeting".to_string(),
                time_horizon: "today".to_string(),
                source_refs: vec!["meeting_1".to_string()],
            },
        ];
        let recent_messages = vec![
            json!({
                "id": "task_1",
                "content": {
                    "title": "Finish proposal draft",
                    "body": "Need final draft and stakeholder-ready summary."
                }
            }),
            json!({
                "id": "task_2",
                "content": {
                    "title": "Prepare pricing notes",
                    "summary": "Collect current pricing and competitor references."
                }
            }),
        ];

        let packet = build_prepared_draft_packet(
            None,
            Some(&prepared_context),
            &[],
            &[],
            &commitments,
            &[],
            &recent_messages,
        );

        assert!(packet.ready);
        assert!(
            packet
                .drafts
                .iter()
                .any(|draft| draft.draft_class == PREPARED_DRAFT_CLASS_TASK_BUNDLE)
        );
        let bundle = packet
            .drafts
            .iter()
            .find(|draft| draft.draft_class == PREPARED_DRAFT_CLASS_TASK_BUNDLE)
            .expect("task bundle");
        assert_eq!(bundle.channel, "tasks");
        assert_eq!(bundle.readiness, "ready_now");
        assert!(!bundle.approval_required_to_send);
        assert!(bundle.body.contains("Grouped work:"));
    }

    #[test]
    fn builds_project_prep_note_from_project_context() {
        let prepared_context = PreparedContextPacket {
            packet_kind: "continuity_context".to_string(),
            ready: true,
            summary: "Prepared context ready: 2 related context items, 1 file ref.".to_string(),
            anchor_refs: vec!["msg_anchor".to_string()],
            source_refs: vec!["msg_anchor".to_string(), "msg_project".to_string()],
            decision_refs: Vec::new(),
            decision_history_refs: Vec::new(),
            response_refs: Vec::new(),
            follow_up_refs: Vec::new(),
            relationship_refs: vec!["msg_project".to_string()],
            project_refs: vec!["msg_project".to_string()],
            reference_refs: Vec::new(),
            object_refs: Vec::new(),
            thread_refs: Vec::new(),
            file_refs: vec!["file_1".to_string()],
            packs: Vec::new(),
            decrypt_needed_count: 0,
            memory_space: None,
            author_mask: None,
            author_type: None,
            author_id: None,
            is_human_authored: None,
            human_only: None,
            ..PreparedContextPacket::default()
        };
        let context_item = StateSnapshotContextItem {
            id: "msg_project".to_string(),
            label: "Launch 2026 workstream".to_string(),
            why_surfaced: "Related project context is active across recent notes and files"
                .to_string(),
            confidence: "high".to_string(),
            freshness: "active".to_string(),
            relation_path: vec!["same_project".to_string()],
            source_refs: vec!["msg_anchor".to_string(), "msg_project".to_string()],
            decrypt_needed: false,
        };
        let recent_messages = vec![
            json!({
                "id": "msg_anchor",
                "content": {
                    "title": "Launch roadmap",
                    "summary": "Need launch owner alignment and milestone sequencing."
                }
            }),
            json!({
                "id": "msg_project",
                "content": {
                    "title": "Project notes",
                    "body": "Brand assets and rollout checklist still need final review."
                }
            }),
        ];

        let packet = build_prepared_draft_packet(
            None,
            Some(&prepared_context),
            &[],
            &[],
            &[],
            &[context_item],
            &recent_messages,
        );

        assert!(packet.ready);
        let note = packet
            .drafts
            .iter()
            .find(|draft| draft.draft_class == PREPARED_DRAFT_CLASS_PROJECT_PREP_NOTE)
            .expect("project prep note");
        assert_eq!(note.channel, "project");
        assert_eq!(note.readiness, "ready_now");
        assert!(!note.approval_required_to_send);
        assert!(note.body.contains("Supporting highlights:"));
    }

    #[test]
    fn cooldown_generation_policy_suppresses_low_signal_reply_draft() {
        let response_queue = vec![StateSnapshotResponseItem {
            id: "msg_1".to_string(),
            label: "Routine follow up".to_string(),
            channel: "conversation".to_string(),
            urgency: "medium".to_string(),
            confidence: "medium".to_string(),
            response_due_hint: "This week".to_string(),
            source_refs: vec!["msg_1".to_string()],
            suggested_next_action: "Draft reply".to_string(),
        }];
        let recent_messages = vec![json!({
            "id": "msg_1",
            "type": "chat_thread",
            "content": {
                "subject": "Routine follow up",
                "body": "Just checking whether you had a chance to review this."
            }
        })];
        let mut policy = PreparedDraftGenerationPolicy::new();
        policy.insert(
            "prepared-draft:draft:reply:msg_1".to_string(),
            PreparedDraftGenerationFeedback {
                status: "cooldown_recommended".to_string(),
                acceptance_rate: 0.2,
            },
        );

        let packet = build_prepared_draft_packet(
            Some(&policy),
            None,
            &[],
            &response_queue,
            &[],
            &[],
            &recent_messages,
        );

        assert!(!packet.ready);
        assert!(packet.drafts.is_empty());
    }

    #[test]
    fn trusted_generation_policy_boosts_decision_memo_confidence() {
        let decisions = vec![StateSnapshotDecisionItem {
            id: "decision_1".to_string(),
            label: "Approve supplier renewal".to_string(),
            category: "approval".to_string(),
            urgency: "today".to_string(),
            confidence: "medium".to_string(),
            source_refs: vec!["decision_1".to_string()],
            suggested_next_action: "Review and approve".to_string(),
            approval_required: true,
        }];
        let recent_messages = vec![json!({
            "id": "decision_1",
            "type": "decision_request",
            "content": {
                "title": "Approve supplier renewal",
                "body": "Contract renewal needed today."
            }
        })];
        let mut policy = PreparedDraftGenerationPolicy::new();
        policy.insert(
            "prepared-draft:draft:decision_memo:approve-supplier-renewal".to_string(),
            PreparedDraftGenerationFeedback {
                status: "trusted".to_string(),
                acceptance_rate: 0.9,
            },
        );

        let packet = build_prepared_draft_packet(
            Some(&policy),
            None,
            &decisions,
            &[],
            &[],
            &[],
            &recent_messages,
        );

        assert!(packet.ready);
        assert_eq!(
            packet.drafts[0].draft_class,
            PREPARED_DRAFT_CLASS_DECISION_MEMO
        );
        assert_eq!(packet.drafts[0].confidence, "high");
    }

    #[test]
    fn cooldown_generation_policy_keeps_decision_support_artifact_but_demotes_confidence() {
        let decisions = vec![
            StateSnapshotDecisionItem {
                id: "decision_1".to_string(),
                label: "Approve supplier renewal".to_string(),
                category: "approval".to_string(),
                urgency: "today".to_string(),
                confidence: "medium".to_string(),
                source_refs: vec!["decision_1".to_string()],
                suggested_next_action: "Review and approve".to_string(),
                approval_required: true,
            },
            StateSnapshotDecisionItem {
                id: "decision_2".to_string(),
                label: "Delay campaign launch".to_string(),
                category: "timing".to_string(),
                urgency: "high".to_string(),
                confidence: "medium".to_string(),
                source_refs: vec!["decision_2".to_string()],
                suggested_next_action: "Review tradeoffs".to_string(),
                approval_required: false,
            },
        ];
        let mut policy = PreparedDraftGenerationPolicy::new();
        policy.insert(
            "prepared-draft:draft:comparison_table:decision-queue".to_string(),
            PreparedDraftGenerationFeedback {
                status: "cooldown_recommended".to_string(),
                acceptance_rate: 0.2,
            },
        );

        let packet =
            build_prepared_draft_packet(Some(&policy), None, &decisions, &[], &[], &[], &[]);
        let comparison = packet
            .drafts
            .iter()
            .find(|draft| draft.draft_class == PREPARED_DRAFT_CLASS_COMPARISON_TABLE)
            .expect("comparison table retained");

        assert_eq!(comparison.confidence, "low");
        assert_eq!(comparison.readiness, "ready_now");
        assert!(comparison.summary.contains("20% acceptance"));
    }

    #[test]
    fn cooldown_generation_policy_keeps_urgent_work_reply_ready_now() {
        let response_queue = vec![StateSnapshotResponseItem {
            id: "msg_1".to_string(),
            label: "Urgent vendor reply".to_string(),
            channel: "email".to_string(),
            urgency: "today".to_string(),
            confidence: "high".to_string(),
            response_due_hint: "Today".to_string(),
            source_refs: vec!["msg_1".to_string()],
            suggested_next_action: "Draft reply".to_string(),
        }];
        let recent_messages = vec![json!({
            "id": "msg_1",
            "type": "email_thread",
            "content": {
                "subject": "Urgent vendor reply",
                "body": "Please confirm by today."
            }
        })];
        let mut policy = PreparedDraftGenerationPolicy::new();
        policy.insert(
            "prepared-draft:draft:reply:msg_1".to_string(),
            PreparedDraftGenerationFeedback {
                status: "cooldown_recommended".to_string(),
                acceptance_rate: 0.3,
            },
        );

        let packet = build_prepared_draft_packet(
            Some(&policy),
            None,
            &[],
            &response_queue,
            &[],
            &[],
            &recent_messages,
        );

        assert!(packet.ready);
        assert_eq!(
            packet.drafts[0].draft_class,
            PREPARED_DRAFT_CLASS_COMMUNICATION_REPLY
        );
        assert_eq!(packet.drafts[0].readiness, "ready_now");
        assert_eq!(packet.drafts[0].confidence, "medium");
        assert!(packet.drafts[0].summary.contains("30% acceptance"));
    }

    #[test]
    fn cooldown_generation_policy_keeps_due_soon_critical_work_reply_ready_now() {
        let response_queue = vec![StateSnapshotResponseItem {
            id: "msg_2".to_string(),
            label: "Team review request".to_string(),
            channel: "slack".to_string(),
            urgency: "medium".to_string(),
            confidence: "medium".to_string(),
            response_due_hint: "Within 24h".to_string(),
            source_refs: vec!["msg_2".to_string()],
            suggested_next_action: "Draft reply".to_string(),
        }];
        let recent_messages = vec![json!({
            "id": "msg_2",
            "type": "chat_thread",
            "content": {
                "subject": "Team review request",
                "body": "Internal team needs a response on the rollout plan."
            }
        })];
        let mut policy = PreparedDraftGenerationPolicy::new();
        policy.insert(
            "prepared-draft:draft:reply:msg_2".to_string(),
            PreparedDraftGenerationFeedback {
                status: "cooldown_recommended".to_string(),
                acceptance_rate: 0.25,
            },
        );

        let packet = build_prepared_draft_packet(
            Some(&policy),
            None,
            &[],
            &response_queue,
            &[],
            &[],
            &recent_messages,
        );

        assert!(packet.ready);
        assert_eq!(
            packet.drafts[0].draft_class,
            PREPARED_DRAFT_CLASS_COMMUNICATION_REPLY
        );
        assert_eq!(packet.drafts[0].readiness, "ready_now");
        assert_eq!(packet.drafts[0].confidence, "low");
    }

    #[test]
    fn cooldown_generation_policy_suppresses_non_due_soon_internal_work_reply() {
        let response_queue = vec![StateSnapshotResponseItem {
            id: "msg_2b".to_string(),
            label: "Internal rollout note".to_string(),
            channel: "slack".to_string(),
            urgency: "medium".to_string(),
            confidence: "medium".to_string(),
            response_due_hint: "This week".to_string(),
            source_refs: vec!["msg_2b".to_string()],
            suggested_next_action: "Draft reply".to_string(),
        }];
        let recent_messages = vec![json!({
            "id": "msg_2b",
            "type": "chat_thread",
            "content": {
                "subject": "Internal rollout note",
                "body": "Team can respond later this week on the rollout details."
            }
        })];
        let mut policy = PreparedDraftGenerationPolicy::new();
        policy.insert(
            "prepared-draft:draft:reply:msg_2b".to_string(),
            PreparedDraftGenerationFeedback {
                status: "cooldown_recommended".to_string(),
                acceptance_rate: 0.25,
            },
        );

        let packet = build_prepared_draft_packet(
            Some(&policy),
            None,
            &[],
            &response_queue,
            &[],
            &[],
            &recent_messages,
        );

        assert!(!packet.ready);
        assert!(packet.drafts.is_empty());
    }

    #[test]
    fn cooldown_generation_policy_keeps_external_work_reply_even_when_not_due_soon() {
        let response_queue = vec![StateSnapshotResponseItem {
            id: "msg_2c".to_string(),
            label: "Customer onboarding follow-up".to_string(),
            channel: "email".to_string(),
            urgency: "medium".to_string(),
            confidence: "medium".to_string(),
            response_due_hint: "This week".to_string(),
            source_refs: vec!["msg_2c".to_string()],
            suggested_next_action: "Draft reply".to_string(),
        }];
        let recent_messages = vec![json!({
            "id": "msg_2c",
            "type": "email_thread",
            "content": {
                "subject": "Customer onboarding follow-up",
                "body": "The customer is waiting on next steps for onboarding."
            }
        })];
        let mut policy = PreparedDraftGenerationPolicy::new();
        policy.insert(
            "prepared-draft:draft:reply:msg_2c".to_string(),
            PreparedDraftGenerationFeedback {
                status: "cooldown_recommended".to_string(),
                acceptance_rate: 0.25,
            },
        );

        let packet = build_prepared_draft_packet(
            Some(&policy),
            None,
            &[],
            &response_queue,
            &[],
            &[],
            &recent_messages,
        );

        assert!(packet.ready);
        assert_eq!(
            packet.drafts[0].draft_class,
            PREPARED_DRAFT_CLASS_COMMUNICATION_REPLY
        );
        assert_eq!(packet.drafts[0].readiness, "ready");
        assert_eq!(packet.drafts[0].confidence, "low");
    }

    #[test]
    fn cooldown_generation_policy_keeps_reply_when_follow_up_chain_overlaps() {
        let response_queue = vec![StateSnapshotResponseItem {
            id: "msg_2d".to_string(),
            label: "Routine check-in".to_string(),
            channel: "conversation".to_string(),
            urgency: "medium".to_string(),
            confidence: "medium".to_string(),
            response_due_hint: "This week".to_string(),
            source_refs: vec!["msg_2d".to_string()],
            suggested_next_action: "Draft reply".to_string(),
        }];
        let recent_messages = vec![json!({
            "id": "msg_2d",
            "type": "chat_thread",
            "content": {
                "subject": "Routine check-in",
                "body": "Following up on the earlier open thread."
            }
        })];
        let prepared_context_packet = PreparedContextPacket {
            packet_kind: "continuity_context".to_string(),
            ready: true,
            summary: "Prepared context ready.".to_string(),
            anchor_refs: vec!["msg_2d".to_string()],
            source_refs: vec!["msg_2d".to_string()],
            decision_refs: Vec::new(),
            decision_history_refs: Vec::new(),
            response_refs: vec!["msg_2d".to_string()],
            follow_up_refs: vec!["msg_2d".to_string()],
            relationship_refs: Vec::new(),
            project_refs: Vec::new(),
            reference_refs: Vec::new(),
            object_refs: Vec::new(),
            thread_refs: Vec::new(),
            file_refs: Vec::new(),
            packs: Vec::new(),
            decrypt_needed_count: 0,
            memory_space: None,
            author_mask: None,
            author_type: None,
            author_id: None,
            is_human_authored: None,
            human_only: None,
            ..PreparedContextPacket::default()
        };
        let mut policy = PreparedDraftGenerationPolicy::new();
        policy.insert(
            "prepared-draft:draft:reply:msg_2d".to_string(),
            PreparedDraftGenerationFeedback {
                status: "cooldown_recommended".to_string(),
                acceptance_rate: 0.2,
            },
        );

        let packet = build_prepared_draft_packet(
            Some(&policy),
            Some(&prepared_context_packet),
            &[],
            &response_queue,
            &[],
            &[],
            &recent_messages,
        );

        assert!(packet.ready);
        assert_eq!(
            packet.drafts[0].draft_class,
            PREPARED_DRAFT_CLASS_COMMUNICATION_REPLY
        );
        assert_eq!(packet.drafts[0].readiness, "ready");
        assert_eq!(packet.drafts[0].confidence, "low");
    }

    #[test]
    fn cooldown_generation_policy_keeps_follow_up_draft_when_relationship_context_overlaps() {
        let context_panel_items = vec![StateSnapshotContextItem {
            id: "msg_rel".to_string(),
            label: "Partner follow-up".to_string(),
            relation_path: vec!["same_relationship".to_string()],
            why_surfaced: "Related partner thread".to_string(),
            confidence: "medium".to_string(),
            freshness: "reactivated".to_string(),
            decrypt_needed: false,
            source_refs: vec!["msg_rel".to_string()],
        }];
        let recent_messages = vec![json!({
            "id": "msg_rel",
            "type": "chat_thread",
            "content": {
                "subject": "Partner follow-up",
                "body": "Need to continue the partner relationship thread."
            }
        })];
        let prepared_context_packet = PreparedContextPacket {
            packet_kind: "continuity_context".to_string(),
            ready: true,
            summary: "Prepared context ready.".to_string(),
            anchor_refs: vec!["msg_rel".to_string()],
            source_refs: vec!["msg_rel".to_string()],
            decision_refs: Vec::new(),
            decision_history_refs: Vec::new(),
            response_refs: Vec::new(),
            follow_up_refs: Vec::new(),
            relationship_refs: vec!["msg_rel".to_string()],
            project_refs: Vec::new(),
            reference_refs: Vec::new(),
            object_refs: Vec::new(),
            thread_refs: Vec::new(),
            file_refs: Vec::new(),
            packs: Vec::new(),
            decrypt_needed_count: 0,
            memory_space: None,
            author_mask: None,
            author_type: None,
            author_id: None,
            is_human_authored: None,
            human_only: None,
            ..PreparedContextPacket::default()
        };
        let mut policy = PreparedDraftGenerationPolicy::new();
        policy.insert(
            "prepared-draft:draft:follow_up:partner-follow-up".to_string(),
            PreparedDraftGenerationFeedback {
                status: "cooldown_recommended".to_string(),
                acceptance_rate: 0.2,
            },
        );

        let packet = build_prepared_draft_packet(
            Some(&policy),
            Some(&prepared_context_packet),
            &[],
            &[],
            &[],
            &context_panel_items,
            &recent_messages,
        );

        assert!(packet.ready);
        assert_eq!(packet.drafts[0].draft_class, PREPARED_DRAFT_CLASS_FOLLOW_UP);
        assert_eq!(packet.drafts[0].confidence, "low");
    }

    #[test]
    fn cooldown_generation_policy_keeps_reply_when_project_or_thread_context_overlaps() {
        let response_queue = vec![StateSnapshotResponseItem {
            id: "msg_2e".to_string(),
            label: "Launch workspace thread".to_string(),
            channel: "conversation".to_string(),
            urgency: "medium".to_string(),
            confidence: "medium".to_string(),
            response_due_hint: "This week".to_string(),
            source_refs: vec!["msg_2e".to_string()],
            suggested_next_action: "Draft reply".to_string(),
        }];
        let recent_messages = vec![json!({
            "id": "msg_2e",
            "type": "chat_thread",
            "content": {
                "subject": "Launch workspace thread",
                "body": "Continuing the active launch workstream discussion."
            }
        })];
        let prepared_context_packet = PreparedContextPacket {
            packet_kind: "continuity_context".to_string(),
            ready: true,
            summary: "Prepared context ready.".to_string(),
            anchor_refs: vec!["msg_2e".to_string()],
            source_refs: vec!["msg_2e".to_string()],
            decision_refs: Vec::new(),
            decision_history_refs: Vec::new(),
            response_refs: vec!["msg_2e".to_string()],
            follow_up_refs: Vec::new(),
            relationship_refs: Vec::new(),
            project_refs: vec!["msg_2e".to_string()],
            reference_refs: Vec::new(),
            object_refs: Vec::new(),
            thread_refs: vec!["msg_2e".to_string()],
            file_refs: Vec::new(),
            packs: Vec::new(),
            decrypt_needed_count: 0,
            memory_space: None,
            author_mask: None,
            author_type: None,
            author_id: None,
            is_human_authored: None,
            human_only: None,
            ..PreparedContextPacket::default()
        };
        let mut policy = PreparedDraftGenerationPolicy::new();
        policy.insert(
            "prepared-draft:draft:reply:msg_2e".to_string(),
            PreparedDraftGenerationFeedback {
                status: "cooldown_recommended".to_string(),
                acceptance_rate: 0.2,
            },
        );

        let packet = build_prepared_draft_packet(
            Some(&policy),
            Some(&prepared_context_packet),
            &[],
            &response_queue,
            &[],
            &[],
            &recent_messages,
        );

        assert!(packet.ready);
        assert_eq!(
            packet.drafts[0].draft_class,
            PREPARED_DRAFT_CLASS_COMMUNICATION_REPLY
        );
        assert_eq!(packet.drafts[0].readiness, "ready");
        assert_eq!(packet.drafts[0].confidence, "low");
    }

    #[test]
    fn follow_up_continuity_prefers_follow_up_draft_over_routine_reply() {
        let response_queue = vec![StateSnapshotResponseItem {
            id: "msg_2f".to_string(),
            label: "Routine launch follow-up".to_string(),
            channel: "conversation".to_string(),
            urgency: "medium".to_string(),
            confidence: "medium".to_string(),
            response_due_hint: "This week".to_string(),
            source_refs: vec!["msg_2f".to_string()],
            suggested_next_action: "Draft reply".to_string(),
        }];
        let context_panel_items = vec![StateSnapshotContextItem {
            id: "msg_2f".to_string(),
            label: "Launch follow-up".to_string(),
            why_surfaced: "Pending follow-up chain".to_string(),
            confidence: "high".to_string(),
            freshness: "reactivated".to_string(),
            relation_path: vec!["same_follow_up_chain".to_string()],
            source_refs: vec!["msg_2f".to_string()],
            decrypt_needed: false,
        }];
        let recent_messages = vec![json!({
            "id": "msg_2f",
            "type": "chat_thread",
            "content": {
                "subject": "Routine launch follow-up",
                "body": "Continuing the earlier follow-up thread on launch sequencing."
            }
        })];
        let prepared_context_packet = PreparedContextPacket {
            packet_kind: "continuity_context".to_string(),
            ready: true,
            summary: "Prepared context ready.".to_string(),
            anchor_refs: vec!["msg_2f".to_string()],
            source_refs: vec!["msg_2f".to_string()],
            decision_refs: Vec::new(),
            decision_history_refs: Vec::new(),
            response_refs: vec!["msg_2f".to_string()],
            follow_up_refs: vec!["msg_2f".to_string()],
            relationship_refs: Vec::new(),
            project_refs: Vec::new(),
            reference_refs: Vec::new(),
            object_refs: Vec::new(),
            thread_refs: Vec::new(),
            file_refs: Vec::new(),
            packs: Vec::new(),
            decrypt_needed_count: 0,
            memory_space: None,
            author_mask: None,
            author_type: None,
            author_id: None,
            is_human_authored: None,
            human_only: None,
            ..PreparedContextPacket::default()
        };

        let packet = build_prepared_draft_packet(
            None,
            Some(&prepared_context_packet),
            &[],
            &response_queue,
            &[],
            &context_panel_items,
            &recent_messages,
        );

        assert!(packet.ready);
        assert!(
            packet
                .drafts
                .iter()
                .any(|draft| draft.draft_class == PREPARED_DRAFT_CLASS_FOLLOW_UP)
        );
        assert!(
            !packet
                .drafts
                .iter()
                .any(|draft| draft.draft_class == PREPARED_DRAFT_CLASS_COMMUNICATION_REPLY)
        );
    }

    #[test]
    fn project_continuity_prefers_project_prep_over_routine_workspace_reply() {
        let response_queue = vec![StateSnapshotResponseItem {
            id: "msg_2g".to_string(),
            label: "Workspace planning thread".to_string(),
            channel: "slack".to_string(),
            urgency: "medium".to_string(),
            confidence: "medium".to_string(),
            response_due_hint: "This week".to_string(),
            source_refs: vec!["msg_2g".to_string()],
            suggested_next_action: "Draft reply".to_string(),
        }];
        let context_panel_items = vec![StateSnapshotContextItem {
            id: "msg_2g".to_string(),
            label: "Launch 2026 workstream".to_string(),
            why_surfaced: "Active project thread".to_string(),
            confidence: "high".to_string(),
            freshness: "active".to_string(),
            relation_path: vec!["same_project".to_string(), "same_thread".to_string()],
            source_refs: vec!["msg_2g".to_string()],
            decrypt_needed: false,
        }];
        let recent_messages = vec![json!({
            "id": "msg_2g",
            "type": "chat_thread",
            "content": {
                "subject": "Workspace planning thread",
                "body": "Internal workspace thread for launch planning and rollout notes."
            }
        })];
        let prepared_context_packet = PreparedContextPacket {
            packet_kind: "continuity_context".to_string(),
            ready: true,
            summary: "Prepared context ready.".to_string(),
            anchor_refs: vec!["msg_2g".to_string()],
            source_refs: vec!["msg_2g".to_string()],
            decision_refs: Vec::new(),
            decision_history_refs: Vec::new(),
            response_refs: vec!["msg_2g".to_string()],
            follow_up_refs: Vec::new(),
            relationship_refs: Vec::new(),
            project_refs: vec!["msg_2g".to_string()],
            reference_refs: Vec::new(),
            object_refs: Vec::new(),
            thread_refs: vec!["msg_2g".to_string()],
            file_refs: Vec::new(),
            packs: Vec::new(),
            decrypt_needed_count: 0,
            memory_space: None,
            author_mask: None,
            author_type: None,
            author_id: None,
            is_human_authored: None,
            human_only: None,
            ..PreparedContextPacket::default()
        };

        let packet = build_prepared_draft_packet(
            None,
            Some(&prepared_context_packet),
            &[],
            &response_queue,
            &[],
            &context_panel_items,
            &recent_messages,
        );

        assert!(packet.ready);
        assert!(
            packet
                .drafts
                .iter()
                .any(|draft| draft.draft_class == PREPARED_DRAFT_CLASS_PROJECT_PREP_NOTE)
        );
        assert!(
            !packet
                .drafts
                .iter()
                .any(|draft| draft.draft_class == PREPARED_DRAFT_CLASS_COMMUNICATION_REPLY)
        );
    }

    #[test]
    fn active_meeting_prefers_meeting_brief_over_routine_internal_reply() {
        let response_queue = vec![StateSnapshotResponseItem {
            id: "msg_meeting_thread".to_string(),
            label: "Internal prep thread".to_string(),
            channel: "slack".to_string(),
            urgency: "medium".to_string(),
            confidence: "medium".to_string(),
            response_due_hint: "This week".to_string(),
            source_refs: vec!["msg_meeting_thread".to_string()],
            suggested_next_action: "Draft reply".to_string(),
        }];
        let active_commitments = vec![StateSnapshotCommitment {
            label: "Design review meeting".to_string(),
            time_horizon: "today".to_string(),
            source_refs: vec!["msg_meeting_thread".to_string()],
        }];
        let prepared_context_packet = PreparedContextPacket {
            packet_kind: "continuity_context".to_string(),
            ready: true,
            summary: "Prepared context ready.".to_string(),
            anchor_refs: vec!["msg_meeting_thread".to_string()],
            source_refs: vec!["msg_meeting_thread".to_string()],
            decision_refs: Vec::new(),
            decision_history_refs: Vec::new(),
            response_refs: vec!["msg_meeting_thread".to_string()],
            follow_up_refs: Vec::new(),
            relationship_refs: Vec::new(),
            project_refs: vec!["msg_meeting_thread".to_string()],
            reference_refs: Vec::new(),
            object_refs: Vec::new(),
            thread_refs: vec!["msg_meeting_thread".to_string()],
            file_refs: Vec::new(),
            packs: Vec::new(),
            decrypt_needed_count: 0,
            memory_space: None,
            author_mask: None,
            author_type: None,
            author_id: None,
            is_human_authored: None,
            human_only: None,
            ..PreparedContextPacket::default()
        };
        let recent_messages = vec![json!({
            "id": "msg_meeting_thread",
            "type": "chat_thread",
            "content": {
                "subject": "Internal prep thread",
                "body": "Agenda prep, rollout checklist, and review notes for today's design review."
            }
        })];

        let packet = build_prepared_draft_packet(
            None,
            Some(&prepared_context_packet),
            &[],
            &response_queue,
            &active_commitments,
            &[],
            &recent_messages,
        );

        assert!(packet.ready);
        assert!(
            packet
                .drafts
                .iter()
                .any(|draft| draft.draft_class == PREPARED_DRAFT_CLASS_MEETING_BRIEF)
        );
        assert!(
            !packet
                .drafts
                .iter()
                .any(|draft| draft.draft_class == PREPARED_DRAFT_CLASS_COMMUNICATION_REPLY)
        );
    }

    #[test]
    fn active_commitment_bundle_prefers_task_bundle_over_routine_internal_reply() {
        let response_queue = vec![StateSnapshotResponseItem {
            id: "msg_task_thread".to_string(),
            label: "Internal planning thread".to_string(),
            channel: "slack".to_string(),
            urgency: "medium".to_string(),
            confidence: "medium".to_string(),
            response_due_hint: "This week".to_string(),
            source_refs: vec!["msg_task_thread".to_string()],
            suggested_next_action: "Draft reply".to_string(),
        }];
        let active_commitments = vec![
            StateSnapshotCommitment {
                label: "Finalize rollout checklist".to_string(),
                time_horizon: "today".to_string(),
                source_refs: vec!["msg_task_thread".to_string()],
            },
            StateSnapshotCommitment {
                label: "Prepare launch summary".to_string(),
                time_horizon: "active".to_string(),
                source_refs: vec!["msg_task_thread".to_string()],
            },
        ];
        let prepared_context_packet = PreparedContextPacket {
            packet_kind: "continuity_context".to_string(),
            ready: true,
            summary: "Prepared context ready.".to_string(),
            anchor_refs: vec!["msg_task_thread".to_string()],
            source_refs: vec!["msg_task_thread".to_string()],
            decision_refs: Vec::new(),
            decision_history_refs: Vec::new(),
            response_refs: vec!["msg_task_thread".to_string()],
            follow_up_refs: Vec::new(),
            relationship_refs: vec!["msg_task_thread".to_string()],
            project_refs: vec!["msg_task_thread".to_string()],
            reference_refs: Vec::new(),
            object_refs: Vec::new(),
            thread_refs: vec!["msg_task_thread".to_string()],
            file_refs: Vec::new(),
            packs: Vec::new(),
            decrypt_needed_count: 0,
            ..crate::prepared_context_packet::PreparedContextPacket::default()
        };
        let recent_messages = vec![json!({
            "id": "msg_task_thread",
            "type": "chat_thread",
            "content": {
                "subject": "Internal planning thread",
                "body": "Planning notes, rollout checklist, and launch prep items for the current workstream."
            }
        })];

        let packet = build_prepared_draft_packet(
            None,
            Some(&prepared_context_packet),
            &[],
            &response_queue,
            &active_commitments,
            &[],
            &recent_messages,
        );

        assert!(packet.ready);
        assert!(
            packet
                .drafts
                .iter()
                .any(|draft| draft.draft_class == PREPARED_DRAFT_CLASS_TASK_BUNDLE)
        );
        assert!(
            !packet
                .drafts
                .iter()
                .any(|draft| draft.draft_class == PREPARED_DRAFT_CLASS_COMMUNICATION_REPLY)
        );
    }

    #[test]
    fn cooldown_generation_policy_suppresses_social_reply_more_aggressively() {
        let response_queue = vec![StateSnapshotResponseItem {
            id: "msg_3".to_string(),
            label: "Family catch-up".to_string(),
            channel: "whatsapp".to_string(),
            urgency: "today".to_string(),
            confidence: "medium".to_string(),
            response_due_hint: "Today".to_string(),
            source_refs: vec!["msg_3".to_string()],
            suggested_next_action: "Draft reply".to_string(),
        }];
        let recent_messages = vec![json!({
            "id": "msg_3",
            "type": "chat_thread",
            "content": {
                "subject": "Family catch-up",
                "body": "Your family asked if you can reply later today."
            }
        })];
        let mut policy = PreparedDraftGenerationPolicy::new();
        policy.insert(
            "prepared-draft:draft:reply:msg_3".to_string(),
            PreparedDraftGenerationFeedback {
                status: "cooldown_recommended".to_string(),
                acceptance_rate: 0.1,
            },
        );

        let packet = build_prepared_draft_packet(
            Some(&policy),
            None,
            &[],
            &response_queue,
            &[],
            &[],
            &recent_messages,
        );

        assert!(!packet.ready);
        assert!(packet.drafts.is_empty());
    }

    #[test]
    fn due_soon_hint_promotes_reply_to_ready_now_even_without_urgent_queue_label() {
        let response_queue = vec![StateSnapshotResponseItem {
            id: "msg_4".to_string(),
            label: "Customer confirmation".to_string(),
            channel: "email".to_string(),
            urgency: "medium".to_string(),
            confidence: "medium".to_string(),
            response_due_hint: "EOD today".to_string(),
            source_refs: vec!["msg_4".to_string()],
            suggested_next_action: "Draft reply".to_string(),
        }];
        let recent_messages = vec![json!({
            "id": "msg_4",
            "type": "email_thread",
            "content": {
                "subject": "Customer confirmation",
                "body": "Customer asked for confirmation by end of day."
            }
        })];

        let packet = build_prepared_draft_packet(
            None,
            None,
            &[],
            &response_queue,
            &[],
            &[],
            &recent_messages,
        );

        assert!(packet.ready);
        assert_eq!(
            packet.drafts[0].draft_class,
            PREPARED_DRAFT_CLASS_COMMUNICATION_REPLY
        );
        assert_eq!(packet.drafts[0].readiness, "ready_now");
    }

    #[test]
    fn prepared_draft_ledger_afp_carries_optional_suggested_actions() {
        let draft = PreparedDraftArtifact {
            draft_id: "draft_1".to_string(),
            draft_class: PREPARED_DRAFT_CLASS_COMMUNICATION_REPLY.to_string(),
            label: "Reply to customer".to_string(),
            channel: "email".to_string(),
            summary: "Prepared reply ready for review.".to_string(),
            body: "Thanks for checking in.".to_string(),
            confidence: "high".to_string(),
            readiness: "ready_now".to_string(),
            response_due_hint: "Today".to_string(),
            approval_required_to_send: true,
            source_refs: vec!["msg_1".to_string()],
            source_count: 1,
            storage_type: "ledger".to_string(),
            storage_kind: Some("rich_note".to_string()),
            comparison_headers: Vec::new(),
            comparison_rows: Vec::new(),
            selection_reason: None,
            suggested_next_action: "Review and send email reply".to_string(),
            object_refs: Vec::new(),
            memory_space: None,
            author_mask: None,
            author_type: None,
            author_id: None,
            is_human_authored: None,
            human_only: None,
        };

        let afp = build_prepared_draft_ledger_afp("user_1", "thread_1", Some("parent_1"), &draft);

        assert_eq!(
            afp["content"]["suggested_actions"],
            serde_json::json!(["Review and send email reply"])
        );
        assert_eq!(afp["content"]["follow_up_at"].as_str(), Some("Today"));
    }
}
