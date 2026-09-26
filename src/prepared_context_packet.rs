use chrono::Utc;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::collections::{BTreeSet, HashMap};
use ulid::Ulid;

use crate::{
    file_path_refs::message_file_path_refs,
    message::parse_afp_references,
    object_refs::message_object_refs,
    state_snapshot::{
        StateSnapshotContextItem, StateSnapshotDecisionItem, StateSnapshotResponseItem,
    },
    topology_retrieval::TopologyNeighborhoodBundle,
};

pub const PREPARED_CONTEXT_KIND_CONTINUITY: &str = "continuity_context";
pub const PREPARED_CONTEXT_PACK_KIND_TOPIC: &str = "topic_pack";
pub const PREPARED_CONTEXT_PACK_KIND_OBLIGATION: &str = "obligation_pack";
pub const PREPARED_CONTEXT_RETRIEVAL_MODE_METADATA_FIRST: &str = "metadata_first";
pub const PREPARED_CONTEXT_RETRIEVAL_MODE_METADATA_FIRST_WITH_DEEPENING: &str =
    "metadata_first_with_selective_deepening";

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq, Eq)]
pub struct PreparedContextPack {
    pub pack_id: String,
    pub pack_kind: String,
    pub title: String,
    pub summary: String,
    pub confidence: String,
    pub why_surfaced: String,
    #[serde(default)]
    pub anchor_refs: Vec<String>,
    #[serde(default)]
    pub source_refs: Vec<String>,
    #[serde(default)]
    pub reference_refs: Vec<String>,
    #[serde(default)]
    pub object_refs: Vec<String>,
    #[serde(default)]
    pub file_refs: Vec<String>,
    #[serde(default)]
    pub file_labels: Vec<String>,
    #[serde(default)]
    pub evidence_kinds: Vec<String>,
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
pub struct PreparedContextPacket {
    pub packet_kind: String,
    pub ready: bool,
    pub summary: String,
    #[serde(default)]
    pub retrieval_mode: String,
    #[serde(default)]
    pub deeper_retrieval_recommended: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub readiness_reason: Option<String>,
    #[serde(default)]
    pub anchor_refs: Vec<String>,
    #[serde(default)]
    pub working_set_refs: Vec<String>,
    #[serde(default)]
    pub active_topic_refs: Vec<String>,
    #[serde(default)]
    pub source_refs: Vec<String>,
    #[serde(default)]
    pub decision_refs: Vec<String>,
    #[serde(default)]
    pub decision_history_refs: Vec<String>,
    #[serde(default)]
    pub response_refs: Vec<String>,
    #[serde(default)]
    pub follow_up_refs: Vec<String>,
    #[serde(default)]
    pub relationship_refs: Vec<String>,
    #[serde(default)]
    pub project_refs: Vec<String>,
    #[serde(default)]
    pub reference_refs: Vec<String>,
    #[serde(default)]
    pub object_refs: Vec<String>,
    #[serde(default)]
    pub thread_refs: Vec<String>,
    #[serde(default)]
    pub file_refs: Vec<String>,
    #[serde(default)]
    pub topology_budget_used: u32,
    #[serde(default)]
    pub packs: Vec<PreparedContextPack>,
    #[serde(default)]
    pub decrypt_needed_count: u32,
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

#[derive(Clone, Debug, Default)]
struct PreparedContextScope {
    memory_space: Option<String>,
    author_mask: Option<String>,
    author_type: Option<String>,
    author_id: Option<String>,
    is_human_authored: Option<bool>,
    human_only: Option<bool>,
}

pub fn build_prepared_context_ledger_afp(
    owner_user_id: &str,
    thread_id: &str,
    parent_id: Option<&str>,
    packet: &PreparedContextPacket,
) -> Value {
    let mut metadata = json!({
        "store": true,
        "continuity": true,
        "context_origin": "prepared_context_packet",
        "packet_kind": packet.packet_kind,
        "prepared_context_ready": packet.ready,
        "prepared_context_retrieval_mode": packet.retrieval_mode,
        "prepared_context_deeper_retrieval_recommended": packet.deeper_retrieval_recommended,
    });
    insert_optional_metadata_string(&mut metadata, "memory_space", packet.memory_space.as_ref());
    insert_optional_metadata_string(&mut metadata, "author_mask", packet.author_mask.as_ref());
    insert_optional_metadata_string(&mut metadata, "author_type", packet.author_type.as_ref());
    insert_optional_metadata_string(&mut metadata, "author_id", packet.author_id.as_ref());
    insert_optional_metadata_bool(&mut metadata, "is_human_authored", packet.is_human_authored);
    insert_optional_metadata_bool(&mut metadata, "human_only", packet.human_only);

    let content = json!({
        "title": "Prepared context packet",
        "summary": packet.summary,
        "packet_kind": packet.packet_kind,
        "ready": packet.ready,
        "suggested_actions": if packet.ready {
            json!(["Review prepared context"])
        } else {
            json!([])
        },
        "retrieval_mode": packet.retrieval_mode,
        "deeper_retrieval_recommended": packet.deeper_retrieval_recommended,
        "readiness_reason": packet.readiness_reason,
        "anchor_refs": packet.anchor_refs,
        "working_set_refs": packet.working_set_refs,
        "active_topic_refs": packet.active_topic_refs,
        "source_refs": packet.source_refs,
        "decision_refs": packet.decision_refs,
        "decision_history_refs": packet.decision_history_refs,
        "response_refs": packet.response_refs,
        "follow_up_refs": packet.follow_up_refs,
        "relationship_refs": packet.relationship_refs,
        "project_refs": packet.project_refs,
        "reference_refs": packet.reference_refs,
        "object_refs": packet.object_refs,
        "thread_refs": packet.thread_refs,
        "file_refs": packet.file_refs,
        "topology_budget_used": packet.topology_budget_used,
        "decrypt_needed_count": packet.decrypt_needed_count,
        "packs": packet.packs,
    });
    let view = build_prepared_context_a2ui_view(packet);

    json!({
        "protocol": "afp-v1",
        "id": Ulid::new().to_string(),
        "thread_id": thread_id,
        "parent_id": parent_id,
        "from": "state_synthesizer",
        "to": [owner_user_id],
        "timestamp": Utc::now().to_rfc3339(),
        "type": crate::message::AFP_TYPE_LEDGER,
        "kind": crate::message::AFP_KIND_RICH_NOTE,
        "subtype": "prepared_context",
        "content": content,
        "views": [view],
        "metadata": metadata,
        "store_in_relational": true,
    })
}

pub fn build_prepared_context_packet(
    anchor_refs: &[String],
    topology_bundle: &TopologyNeighborhoodBundle,
    context_panel_items: &[StateSnapshotContextItem],
    decision_queue: &[StateSnapshotDecisionItem],
    response_queue: &[StateSnapshotResponseItem],
    recent_messages: &[Value],
) -> PreparedContextPacket {
    let message_types = recent_messages
        .iter()
        .filter_map(|message| {
            Some((
                message.get("id")?.as_str()?.to_string(),
                message
                    .get("type")
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .to_string(),
            ))
        })
        .collect::<HashMap<_, _>>();
    let messages_by_id = recent_messages
        .iter()
        .filter_map(|message| Some((message.get("id")?.as_str()?.to_string(), message)))
        .collect::<HashMap<_, _>>();

    let anchor_refs = unique_strings(anchor_refs.iter().cloned().collect());
    let decision_refs = unique_strings(
        decision_queue
            .iter()
            .flat_map(|item| item.source_refs.iter().cloned())
            .collect(),
    );
    let response_refs = unique_strings(
        response_queue
            .iter()
            .flat_map(|item| item.source_refs.iter().cloned())
            .collect(),
    );
    let follow_up_refs = unique_strings(
        context_panel_items
            .iter()
            .filter(|item| {
                item.relation_path
                    .iter()
                    .any(|relation| relation == "same_follow_up_chain")
            })
            .map(|item| item.id.clone())
            .collect(),
    );
    let relationship_refs = unique_strings(
        context_panel_items
            .iter()
            .filter(|item| {
                item.relation_path
                    .iter()
                    .any(|relation| relation == "same_relationship")
            })
            .map(|item| item.id.clone())
            .collect(),
    );
    let project_refs = unique_strings(
        context_panel_items
            .iter()
            .filter(|item| {
                item.relation_path.iter().any(|relation| {
                    matches!(
                        relation.as_str(),
                        "same_project" | "same_area" | "same_resource"
                    )
                })
            })
            .map(|item| item.id.clone())
            .collect(),
    );
    let thread_refs = unique_strings(
        context_panel_items
            .iter()
            .filter(|item| {
                item.relation_path
                    .iter()
                    .any(|relation| relation == "same_thread")
            })
            .map(|item| item.id.clone())
            .collect(),
    );
    let anchor_threads = unique_strings(
        anchor_refs
            .iter()
            .chain(context_panel_items.iter().map(|item| &item.id))
            .filter_map(|message_id| {
                messages_by_id
                    .get(message_id)
                    .and_then(|message| message.get("thread_id").and_then(Value::as_str))
                    .map(str::to_string)
            })
            .collect(),
    );
    let anchor_supertags = unique_strings(
        anchor_refs
            .iter()
            .chain(context_panel_items.iter().map(|item| &item.id))
            .filter_map(|message_id| messages_by_id.get(message_id).copied())
            .flat_map(message_supertags)
            .collect(),
    );
    let source_refs_seed = source_refs_seed(
        &anchor_refs,
        context_panel_items,
        &decision_refs,
        &response_refs,
    );
    let working_set_refs = bounded_unique_strings(
        anchor_refs
            .iter()
            .cloned()
            .chain(context_panel_items.iter().map(|item| item.id.clone()))
            .chain(decision_refs.iter().cloned())
            .chain(response_refs.iter().cloned())
            .collect(),
        10,
    );
    let reference_refs = collect_canonical_reference_refs(recent_messages, &source_refs_seed);
    let object_refs = collect_contextual_object_refs(recent_messages, &source_refs_seed);
    let decision_history_refs = collect_decision_history_refs(
        recent_messages,
        &decision_refs,
        &source_refs_seed,
        &anchor_threads,
    );
    let source_refs = unique_strings(
        source_refs_seed
            .iter()
            .cloned()
            .chain(reference_refs.iter().cloned())
            .collect(),
    );
    let file_refs = unique_strings(
        source_refs
            .iter()
            .filter(|source_ref| {
                message_types
                    .get(*source_ref)
                    .map(|message_type| message_type == "file_ledger")
                    .unwrap_or_else(|| source_ref.starts_with("file:"))
            })
            .cloned()
            .chain(collect_linked_file_ledger_refs(
                recent_messages,
                &source_refs,
            ))
            .chain(collect_file_ledger_refs(
                recent_messages,
                &anchor_threads,
                &anchor_supertags,
            ))
            .chain(collect_contextual_file_path_refs(
                recent_messages,
                &source_refs,
                &anchor_threads,
                &anchor_supertags,
            ))
            .collect(),
    );
    let active_topic_refs = bounded_unique_strings(
        project_refs
            .iter()
            .cloned()
            .chain(relationship_refs.iter().cloned())
            .chain(thread_refs.iter().cloned())
            .chain(reference_refs.iter().cloned())
            .chain(object_refs.iter().cloned())
            .collect(),
        10,
    );
    let packs = build_prepared_context_packs(
        &anchor_refs,
        context_panel_items,
        &decision_refs,
        &decision_history_refs,
        &response_refs,
        &follow_up_refs,
        &relationship_refs,
        &project_refs,
        &reference_refs,
        &object_refs,
        &thread_refs,
        &file_refs,
        &messages_by_id,
    );
    let packet_scope = prepared_context_scope_from_refs(&source_refs, &messages_by_id);
    let decrypt_needed_count = context_panel_items
        .iter()
        .filter(|item| item.decrypt_needed)
        .count() as u32;
    let ready = !source_refs.is_empty()
        && (!context_panel_items.is_empty()
            || !decision_refs.is_empty()
            || !response_refs.is_empty());
    let deeper_retrieval_recommended = prepared_context_deeper_retrieval_recommended(
        ready,
        decrypt_needed_count,
        &reference_refs,
        &object_refs,
        &file_refs,
        &decision_history_refs,
        &response_refs,
        &follow_up_refs,
    );
    let retrieval_mode = if deeper_retrieval_recommended {
        PREPARED_CONTEXT_RETRIEVAL_MODE_METADATA_FIRST_WITH_DEEPENING.to_string()
    } else {
        PREPARED_CONTEXT_RETRIEVAL_MODE_METADATA_FIRST.to_string()
    };
    let readiness_reason = prepared_context_readiness_reason(
        ready,
        deeper_retrieval_recommended,
        decrypt_needed_count,
        active_topic_refs.len(),
        working_set_refs.len(),
        file_refs.len(),
        decision_history_refs.len(),
    );

    PreparedContextPacket {
        packet_kind: PREPARED_CONTEXT_KIND_CONTINUITY.to_string(),
        ready,
        summary: prepared_context_summary(
            topology_bundle.result_budget_used,
            decision_refs.len(),
            decision_history_refs.len(),
            response_refs.len(),
            file_refs.len(),
            packs.len(),
            deeper_retrieval_recommended,
        ),
        retrieval_mode,
        deeper_retrieval_recommended,
        readiness_reason,
        anchor_refs,
        working_set_refs,
        active_topic_refs,
        source_refs,
        decision_refs,
        decision_history_refs,
        response_refs,
        follow_up_refs,
        relationship_refs,
        project_refs,
        reference_refs,
        object_refs,
        thread_refs,
        file_refs,
        topology_budget_used: topology_bundle.result_budget_used as u32,
        packs,
        decrypt_needed_count,
        memory_space: packet_scope.memory_space,
        author_mask: packet_scope.author_mask,
        author_type: packet_scope.author_type,
        author_id: packet_scope.author_id,
        is_human_authored: packet_scope.is_human_authored,
        human_only: packet_scope.human_only,
    }
}

fn build_prepared_context_a2ui_view(packet: &PreparedContextPacket) -> Value {
    let body = prepared_context_body(packet);
    json!({
        "format": "a2ui.v1",
        "content": {
            "schema_version": "a2ui.v1",
            "kind": "note",
            "props": {
                "title": "Prepared context packet",
                "summary": packet.summary,
                "body": body,
                "status": if packet.ready { "ready" } else { "preview" },
                "selection_reason": Value::Null,
                "consequence_preview": "Opening this reveals prepared context only; it does not execute a side effect.",
                "provenance_cue": if packet.source_refs.is_empty() {
                    "Prepared from continuity state context.".to_string()
                } else {
                    format!("Prepared from {} source refs.", packet.source_refs.len())
                },
            }
        }
    })
}

fn prepared_context_body(packet: &PreparedContextPacket) -> String {
    let mut sections = vec![packet.summary.clone()];

    if !packet.packs.is_empty() {
        sections.push("Context packs:".to_string());
        sections.extend(
            packet
                .packs
                .iter()
                .map(|pack| format!("- {}: {}", pack.title, pack.summary)),
        );
    }

    if let Some(object_anchor_line) = crate::server::summary_helpers::reference_summary_line(
        "Object anchors",
        &[],
        &packet.object_refs,
        None,
        false,
    ) {
        sections.push(object_anchor_line);
    }
    if let Some(reference_line) = crate::server::summary_helpers::reference_summary_line(
        "References",
        &[],
        &packet.reference_refs,
        None,
        false,
    ) {
        sections.push(reference_line);
    }
    if let Some(file_refs_line) =
        crate::server::summary_helpers::list_summary_line("File refs", &packet.file_refs, false)
    {
        sections.push(file_refs_line);
    }
    if !packet.working_set_refs.is_empty() {
        sections.push(format!(
            "Working set refs: {} item{}",
            packet.working_set_refs.len(),
            if packet.working_set_refs.len() == 1 {
                ""
            } else {
                "s"
            }
        ));
    }
    if !packet.active_topic_refs.is_empty() {
        sections.push(format!(
            "Active topic anchors: {} item{}",
            packet.active_topic_refs.len(),
            if packet.active_topic_refs.len() == 1 {
                ""
            } else {
                "s"
            }
        ));
    }
    sections.push(format!(
        "Retrieval mode: {}.",
        if packet.deeper_retrieval_recommended {
            "metadata-first with selective deepening recommended"
        } else {
            "metadata-first"
        }
    ));
    if let Some(reason) = packet.readiness_reason.as_ref() {
        sections.push(reason.clone());
    }

    sections.join("\n")
}

fn prepared_context_summary(
    context_count: usize,
    decision_count: usize,
    decision_history_count: usize,
    response_count: usize,
    file_count: usize,
    pack_count: usize,
    deeper_retrieval_recommended: bool,
) -> String {
    let mut parts = Vec::new();
    if let Some(phrase) = crate::server::summary_helpers::counted_noun_phrase(
        context_count,
        "related context item",
        "related context items",
    ) {
        parts.push(phrase);
    }
    if let Some(phrase) = crate::server::summary_helpers::counted_noun_phrase(
        decision_count,
        "decision source",
        "decision sources",
    ) {
        parts.push(phrase);
    }
    if let Some(phrase) = crate::server::summary_helpers::counted_noun_phrase(
        decision_history_count,
        "decision history ref",
        "decision history refs",
    ) {
        parts.push(phrase);
    }
    if let Some(phrase) = crate::server::summary_helpers::counted_noun_phrase(
        response_count,
        "response source",
        "response sources",
    ) {
        parts.push(phrase);
    }
    if let Some(phrase) =
        crate::server::summary_helpers::counted_noun_phrase(file_count, "file ref", "file refs")
    {
        parts.push(phrase);
    }
    if let Some(phrase) = crate::server::summary_helpers::counted_noun_phrase(
        pack_count,
        "context pack",
        "context packs",
    ) {
        parts.push(phrase);
    }
    if parts.is_empty() {
        "No prepared context packet is ready yet.".to_string()
    } else {
        let retrieval_suffix = if deeper_retrieval_recommended {
            " Metadata-first support is ready, with selective deeper retrieval recommended."
        } else {
            " Metadata-first support is ready."
        };
        format!(
            "Prepared context ready: {}.{}",
            parts.join(", "),
            retrieval_suffix
        )
    }
}

fn prepared_context_deeper_retrieval_recommended(
    ready: bool,
    decrypt_needed_count: u32,
    reference_refs: &[String],
    object_refs: &[String],
    file_refs: &[String],
    decision_history_refs: &[String],
    response_refs: &[String],
    follow_up_refs: &[String],
) -> bool {
    if !ready {
        return false;
    }
    if decrypt_needed_count > 0 {
        return true;
    }

    let topology_support =
        !reference_refs.is_empty() || !object_refs.is_empty() || !file_refs.is_empty();
    let obligation_support = !decision_history_refs.is_empty()
        || (!response_refs.is_empty() && !follow_up_refs.is_empty());

    !topology_support || !obligation_support
}

fn prepared_context_readiness_reason(
    ready: bool,
    deeper_retrieval_recommended: bool,
    decrypt_needed_count: u32,
    active_topic_count: usize,
    working_set_count: usize,
    file_count: usize,
    decision_history_count: usize,
) -> Option<String> {
    if !ready {
        return Some(
            "Prepared context is still gathering enough linked evidence to form a bounded bundle."
                .to_string(),
        );
    }

    if deeper_retrieval_recommended && decrypt_needed_count > 0 {
        return Some(format!(
            "Metadata-first packet is ready, but {} linked context item{} still need decryption before deeper review.",
            decrypt_needed_count,
            if decrypt_needed_count == 1 { "" } else { "s" }
        ));
    }

    if deeper_retrieval_recommended {
        return Some(
            "Metadata-first packet is ready; deeper retrieval is recommended before higher-consequence review because the current bundle is still light on linked support."
                .to_string(),
        );
    }

    Some(format!(
        "Metadata-first packet is ready across {} working-set ref{}, {} active topic anchor{}, {} decision history ref{}, and {} file ref{}.",
        working_set_count,
        if working_set_count == 1 { "" } else { "s" },
        active_topic_count,
        if active_topic_count == 1 { "" } else { "s" },
        decision_history_count,
        if decision_history_count == 1 { "" } else { "s" },
        file_count,
        if file_count == 1 { "" } else { "s" }
    ))
}

fn build_prepared_context_packs(
    anchor_refs: &[String],
    context_panel_items: &[StateSnapshotContextItem],
    decision_refs: &[String],
    decision_history_refs: &[String],
    response_refs: &[String],
    follow_up_refs: &[String],
    relationship_refs: &[String],
    project_refs: &[String],
    reference_refs: &[String],
    object_refs: &[String],
    thread_refs: &[String],
    file_refs: &[String],
    messages_by_id: &HashMap<String, &Value>,
) -> Vec<PreparedContextPack> {
    let mut packs = Vec::new();
    let bounded_file_refs = bounded_unique_strings(file_refs.to_vec(), 4);
    let bounded_file_labels = prepared_context_file_labels(&bounded_file_refs, messages_by_id);

    let topic_evidence = pack_evidence_kinds(&[
        ("project", project_refs),
        ("reference", reference_refs),
        ("object", object_refs),
        ("thread", thread_refs),
        ("relationship", relationship_refs),
        ("follow_up", follow_up_refs),
        ("file", file_refs),
    ]);
    let topic_source_refs = bounded_unique_strings(
        anchor_refs
            .iter()
            .cloned()
            .chain(project_refs.iter().cloned())
            .chain(reference_refs.iter().cloned())
            .chain(object_refs.iter().cloned())
            .chain(thread_refs.iter().cloned())
            .chain(relationship_refs.iter().cloned())
            .chain(follow_up_refs.iter().cloned())
            .chain(file_refs.iter().cloned())
            .collect(),
        8,
    );
    if (topic_evidence.len() >= 2 || !reference_refs.is_empty() || !object_refs.is_empty())
        && topic_source_refs.len() >= 2
    {
        let topic_scope = prepared_context_scope_from_refs(&topic_source_refs, messages_by_id);
        let topic_anchor_refs = bounded_unique_strings(
            project_refs
                .iter()
                .cloned()
                .chain(reference_refs.iter().cloned())
                .chain(object_refs.iter().cloned())
                .chain(thread_refs.iter().cloned())
                .chain(relationship_refs.iter().cloned())
                .chain(anchor_refs.iter().cloned())
                .collect(),
            4,
        );
        packs.push(PreparedContextPack {
            pack_id: "continuity_topic_pack".to_string(),
            pack_kind: PREPARED_CONTEXT_PACK_KIND_TOPIC.to_string(),
            title: topic_pack_title(project_refs, thread_refs, relationship_refs, file_refs),
            summary: format!(
                "Bounded topic continuity across {} ref{} using {} evidence.",
                topic_source_refs.len(),
                if topic_source_refs.len() == 1 {
                    ""
                } else {
                    "s"
                },
                topic_evidence.join(", ")
            ),
            confidence: if topic_evidence.len() >= 3 || topic_source_refs.len() >= 5 {
                "high".to_string()
            } else {
                "medium".to_string()
            },
            why_surfaced: topic_pack_why_surfaced(
                &topic_evidence,
                &topic_source_refs,
                context_panel_items,
            ),
            anchor_refs: topic_anchor_refs,
            source_refs: topic_source_refs,
            reference_refs: bounded_unique_strings(reference_refs.to_vec(), 4),
            object_refs: bounded_unique_strings(object_refs.to_vec(), 4),
            file_refs: bounded_file_refs.clone(),
            file_labels: bounded_file_labels.clone(),
            evidence_kinds: topic_evidence,
            memory_space: topic_scope.memory_space,
            author_mask: topic_scope.author_mask,
            author_type: topic_scope.author_type,
            author_id: topic_scope.author_id,
            is_human_authored: topic_scope.is_human_authored,
            human_only: topic_scope.human_only,
        });
    }

    let obligation_evidence = pack_evidence_kinds(&[
        ("decision", decision_refs),
        ("decision_history", decision_history_refs),
        ("response", response_refs),
        ("follow_up", follow_up_refs),
        ("file", file_refs),
    ]);
    let obligation_source_refs = bounded_unique_strings(
        decision_refs
            .iter()
            .cloned()
            .chain(decision_history_refs.iter().cloned())
            .chain(response_refs.iter().cloned())
            .chain(follow_up_refs.iter().cloned())
            .chain(file_refs.iter().cloned())
            .collect(),
        8,
    );
    if !obligation_source_refs.is_empty()
        && (!decision_refs.is_empty() || !response_refs.is_empty() || !follow_up_refs.is_empty())
    {
        let obligation_scope =
            prepared_context_scope_from_refs(&obligation_source_refs, messages_by_id);
        packs.push(PreparedContextPack {
            pack_id: "continuity_obligation_pack".to_string(),
            pack_kind: PREPARED_CONTEXT_PACK_KIND_OBLIGATION.to_string(),
            title: "Obligation pack".to_string(),
            summary: format!(
                "Bounded pending work pack across {} ref{} using {} evidence.",
                obligation_source_refs.len(),
                if obligation_source_refs.len() == 1 {
                    ""
                } else {
                    "s"
                },
                obligation_evidence.join(", ")
            ),
            confidence: if (!decision_refs.is_empty() && !response_refs.is_empty())
                || (!response_refs.is_empty() && !follow_up_refs.is_empty())
                || obligation_source_refs.len() >= 5
            {
                "high".to_string()
            } else {
                "medium".to_string()
            },
            why_surfaced: obligation_pack_why_surfaced(
                decision_refs,
                response_refs,
                follow_up_refs,
                file_refs,
                &obligation_source_refs,
                context_panel_items,
            ),
            anchor_refs: bounded_unique_strings(
                decision_refs
                    .iter()
                    .cloned()
                    .chain(response_refs.iter().cloned())
                    .chain(follow_up_refs.iter().cloned())
                    .collect(),
                4,
            ),
            source_refs: obligation_source_refs,
            reference_refs: Vec::new(),
            object_refs: Vec::new(),
            file_refs: bounded_file_refs.clone(),
            file_labels: bounded_file_labels.clone(),
            evidence_kinds: obligation_evidence,
            memory_space: obligation_scope.memory_space,
            author_mask: obligation_scope.author_mask,
            author_type: obligation_scope.author_type,
            author_id: obligation_scope.author_id,
            is_human_authored: obligation_scope.is_human_authored,
            human_only: obligation_scope.human_only,
        });
    }

    packs
}

fn prepared_context_file_labels(
    file_refs: &[String],
    messages_by_id: &HashMap<String, &Value>,
) -> Vec<String> {
    bounded_unique_strings(
        file_refs
            .iter()
            .filter_map(|file_ref| prepared_context_file_label(file_ref, messages_by_id))
            .collect(),
        4,
    )
}

fn prepared_context_file_label(
    file_ref: &str,
    messages_by_id: &HashMap<String, &Value>,
) -> Option<String> {
    if let Some(path) = file_ref.strip_prefix("file:") {
        let normalized = path.trim().replace('\\', "/");
        let label = normalized
            .rsplit('/')
            .next()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .unwrap_or(normalized.as_str());
        return (!label.is_empty()).then(|| label.to_string());
    }

    let message = messages_by_id.get(file_ref)?;
    message
        .get("content")
        .and_then(|content| content.get("title"))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
        .or_else(|| {
            message
                .get("content")
                .and_then(|content| content.get("name"))
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(str::to_string)
        })
        .or_else(|| {
            message
                .get("content")
                .and_then(|content| content.get("entries"))
                .and_then(Value::as_array)
                .and_then(|entries| entries.first())
                .and_then(|entry| entry.get("filename"))
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(str::to_string)
        })
}

fn pack_evidence_kinds(groups: &[(&str, &[String])]) -> Vec<String> {
    groups
        .iter()
        .filter_map(|(label, refs)| (!refs.is_empty()).then_some((*label).to_string()))
        .collect()
}

fn bounded_unique_strings(values: Vec<String>, limit: usize) -> Vec<String> {
    unique_strings(values).into_iter().take(limit).collect()
}

fn topic_pack_title(
    project_refs: &[String],
    thread_refs: &[String],
    relationship_refs: &[String],
    file_refs: &[String],
) -> String {
    if !project_refs.is_empty() {
        "Project topic pack".to_string()
    } else if !thread_refs.is_empty() {
        "Thread topic pack".to_string()
    } else if !relationship_refs.is_empty() {
        "Relationship topic pack".to_string()
    } else if !file_refs.is_empty() {
        "File topic pack".to_string()
    } else {
        "Continuity topic pack".to_string()
    }
}

fn context_refs_freshness<'a>(
    refs: &[String],
    context_panel_items: &'a [StateSnapshotContextItem],
) -> Option<&'a str> {
    ["reactivated", "fresh", "active", "stale"]
        .into_iter()
        .find(|freshness| {
            context_panel_items.iter().any(|item| {
                item.freshness.eq_ignore_ascii_case(freshness)
                    && (refs.iter().any(|reference| reference == &item.id)
                        || item
                            .source_refs
                            .iter()
                            .any(|source_ref| refs.iter().any(|reference| reference == source_ref)))
            })
        })
}

fn freshness_support_suffix(freshness: Option<&str>) -> &'static str {
    match freshness {
        Some("reactivated") => {
            " Reactivated dormant context is carrying part of this continuity bundle."
        }
        Some("fresh") => " Fresh neighborhood support is still attached to this bundle.",
        Some("active") => " Still-active neighborhood support keeps this bundle in view.",
        Some("stale") => {
            " The linked support is older background context rather than fresh activity."
        }
        _ => "",
    }
}

fn topic_pack_why_surfaced(
    evidence_kinds: &[String],
    source_refs: &[String],
    context_panel_items: &[StateSnapshotContextItem],
) -> String {
    format!(
        "Surfaced from linked {} continuity evidence.{}",
        evidence_kinds.join(", "),
        freshness_support_suffix(context_refs_freshness(source_refs, context_panel_items))
    )
}

fn obligation_pack_why_surfaced(
    decision_refs: &[String],
    response_refs: &[String],
    follow_up_refs: &[String],
    file_refs: &[String],
    source_refs: &[String],
    context_panel_items: &[StateSnapshotContextItem],
) -> String {
    let mut reasons = Vec::new();
    if !decision_refs.is_empty() {
        reasons.push("pending decisions");
    }
    if !response_refs.is_empty() {
        reasons.push("response pressure");
    }
    if !follow_up_refs.is_empty() {
        reasons.push("follow-up continuity");
    }
    if !file_refs.is_empty() {
        reasons.push("linked file context");
    }
    format!(
        "Surfaced from {}.{}",
        reasons.join(", "),
        freshness_support_suffix(context_refs_freshness(source_refs, context_panel_items))
    )
}

fn unique_strings(values: Vec<String>) -> Vec<String> {
    values
        .into_iter()
        .filter(|value| !value.trim().is_empty())
        .collect::<BTreeSet<_>>()
        .into_iter()
        .collect()
}

fn insert_optional_metadata_string(target: &mut Value, key: &str, value: Option<&String>) {
    if let Some(value) = value.filter(|value| !value.trim().is_empty()) {
        target[key] = Value::String(value.clone());
    }
}

fn insert_optional_metadata_bool(target: &mut Value, key: &str, value: Option<bool>) {
    if let Some(value) = value {
        target[key] = Value::Bool(value);
    }
}

fn prepared_context_scope_from_refs(
    refs: &[String],
    messages_by_id: &HashMap<String, &Value>,
) -> PreparedContextScope {
    refs.iter()
        .filter_map(|reference| messages_by_id.get(reference).copied())
        .find_map(prepared_context_scope_from_message)
        .unwrap_or_default()
}

fn prepared_context_scope_from_message(message: &Value) -> Option<PreparedContextScope> {
    let metadata = message.get("metadata")?;
    Some(PreparedContextScope {
        memory_space: metadata_string(metadata, "memory_space"),
        author_mask: metadata_string(metadata, "author_mask"),
        author_type: metadata_string(metadata, "author_type"),
        author_id: metadata_string(metadata, "author_id"),
        is_human_authored: metadata_bool(metadata, "is_human_authored").or_else(|| {
            metadata
                .get("author_type")
                .and_then(Value::as_str)
                .map(|author_type| {
                    matches!(author_type.trim().to_ascii_lowercase().as_str(), "human")
                })
        }),
        human_only: metadata_bool(metadata, "human_only"),
    })
}

fn metadata_string(metadata: &Value, key: &str) -> Option<String> {
    metadata
        .get(key)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

fn metadata_bool(metadata: &Value, key: &str) -> Option<bool> {
    metadata.get(key).and_then(Value::as_bool)
}

fn source_refs_seed(
    anchor_refs: &[String],
    context_panel_items: &[StateSnapshotContextItem],
    decision_refs: &[String],
    response_refs: &[String],
) -> Vec<String> {
    unique_strings(
        anchor_refs
            .iter()
            .cloned()
            .chain(
                context_panel_items
                    .iter()
                    .flat_map(|item| item.source_refs.iter().cloned()),
            )
            .chain(decision_refs.iter().cloned())
            .chain(response_refs.iter().cloned())
            .collect(),
    )
}

fn collect_decision_history_refs(
    recent_messages: &[Value],
    decision_refs: &[String],
    source_refs: &[String],
    anchor_threads: &[String],
) -> Vec<String> {
    let interesting = decision_refs
        .iter()
        .cloned()
        .chain(source_refs.iter().cloned())
        .collect::<BTreeSet<_>>();

    unique_strings(
        recent_messages
            .iter()
            .filter(|message| {
                matches!(
                    message.get("type").and_then(Value::as_str),
                    Some("decision_request" | "decision_result" | "decision_outcome" | "action")
                )
            })
            .filter(|message| {
                let message_id = message
                    .get("id")
                    .and_then(Value::as_str)
                    .unwrap_or_default();
                let parent_id = message
                    .get("parent_id")
                    .and_then(Value::as_str)
                    .unwrap_or_default();
                let thread_id = message
                    .get("thread_id")
                    .and_then(Value::as_str)
                    .unwrap_or_default();
                let subtype = message
                    .get("subtype")
                    .and_then(Value::as_str)
                    .unwrap_or_default();
                let decision_message_id = message
                    .get("content")
                    .and_then(|content| content.get("decision_message_id"))
                    .and_then(Value::as_str)
                    .unwrap_or_default();
                let outcome_message_id = message
                    .get("content")
                    .and_then(|content| content.get("outcome_message_id"))
                    .and_then(Value::as_str)
                    .unwrap_or_default();
                let referenced_message_match = message
                    .get("references")
                    .and_then(Value::as_array)
                    .map(|references| parse_afp_references(references))
                    .unwrap_or_default()
                    .into_iter()
                    .filter(|reference| reference.r#type == "message")
                    .map(|reference| reference.target.trim().to_string())
                    .any(|target| interesting.contains(&target));

                interesting.contains(message_id)
                    || interesting.contains(parent_id)
                    || interesting.contains(decision_message_id)
                    || interesting.contains(outcome_message_id)
                    || referenced_message_match
                    || anchor_threads.iter().any(|thread| thread == thread_id)
                    || subtype == "approval_decision"
            })
            .filter_map(|message| {
                message
                    .get("id")
                    .and_then(Value::as_str)
                    .map(str::to_string)
            })
            .collect(),
    )
}

fn collect_canonical_reference_refs(
    recent_messages: &[Value],
    source_refs: &[String],
) -> Vec<String> {
    let source_ref_set = source_refs.iter().cloned().collect::<BTreeSet<_>>();
    unique_strings(
        recent_messages
            .iter()
            .filter(|message| {
                message
                    .get("id")
                    .and_then(Value::as_str)
                    .map(|message_id| source_ref_set.contains(message_id))
                    .unwrap_or(false)
            })
            .flat_map(|message| {
                message
                    .get("references")
                    .and_then(Value::as_array)
                    .map(|references| parse_afp_references(references))
                    .unwrap_or_default()
                    .into_iter()
                    .filter(|reference| reference.r#type == "message")
                    .map(|reference| reference.target.trim().to_string())
                    .filter(|target| !target.is_empty())
                    .collect::<Vec<_>>()
            })
            .collect(),
    )
}

fn collect_contextual_object_refs(
    recent_messages: &[Value],
    source_refs: &[String],
) -> Vec<String> {
    let source_ref_set = source_refs.iter().cloned().collect::<BTreeSet<_>>();
    unique_strings(
        recent_messages
            .iter()
            .filter(|message| {
                message
                    .get("id")
                    .and_then(Value::as_str)
                    .map(|message_id| source_ref_set.contains(message_id))
                    .unwrap_or(false)
            })
            .flat_map(message_object_refs)
            .collect(),
    )
}

fn collect_file_ledger_refs(
    recent_messages: &[Value],
    anchor_threads: &[String],
    anchor_supertags: &[String],
) -> Vec<String> {
    unique_strings(
        recent_messages
            .iter()
            .filter(|message| message.get("type").and_then(Value::as_str) == Some("file_ledger"))
            .filter(|message| {
                let thread_match = message
                    .get("thread_id")
                    .and_then(Value::as_str)
                    .map(|thread_id| anchor_threads.iter().any(|thread| thread == thread_id))
                    .unwrap_or(false);
                let supertags = message_supertags(message);
                let supertag_match = supertags
                    .iter()
                    .any(|tag| anchor_supertags.iter().any(|anchor_tag| anchor_tag == tag));
                thread_match || supertag_match
            })
            .filter_map(|message| {
                message
                    .get("id")
                    .and_then(Value::as_str)
                    .map(str::to_string)
            })
            .collect(),
    )
}

fn collect_linked_file_ledger_refs(
    recent_messages: &[Value],
    source_refs: &[String],
) -> Vec<String> {
    let source_ref_set = source_refs.iter().cloned().collect::<BTreeSet<_>>();
    unique_strings(
        recent_messages
            .iter()
            .filter(|message| message.get("type").and_then(Value::as_str) == Some("file_ledger"))
            .flat_map(|message| {
                let message_id = message
                    .get("id")
                    .and_then(Value::as_str)
                    .map(str::to_string);
                let linked_ledger_id = message
                    .get("content")
                    .and_then(|content| content.get("ledger_message_id"))
                    .and_then(Value::as_str)
                    .map(str::to_string);

                let mut refs = Vec::new();
                if let Some(message_id) = message_id {
                    if source_ref_set.contains(&message_id) {
                        refs.push(message_id);
                        if let Some(linked_ledger_id) = linked_ledger_id {
                            refs.push(linked_ledger_id);
                        }
                    } else if let Some(linked_ledger_id) = linked_ledger_id {
                        if source_ref_set.contains(&linked_ledger_id) {
                            refs.push(message_id);
                            refs.push(linked_ledger_id);
                        }
                    }
                }
                refs
            })
            .collect(),
    )
}

fn collect_contextual_file_path_refs(
    recent_messages: &[Value],
    source_refs: &[String],
    anchor_threads: &[String],
    anchor_supertags: &[String],
) -> Vec<String> {
    let source_ref_set = source_refs.iter().cloned().collect::<BTreeSet<_>>();
    unique_strings(
        recent_messages
            .iter()
            .filter(|message| {
                let message_id_match = message
                    .get("id")
                    .and_then(Value::as_str)
                    .map(|message_id| source_ref_set.contains(message_id))
                    .unwrap_or(false);
                let thread_match = message
                    .get("thread_id")
                    .and_then(Value::as_str)
                    .map(|thread_id| anchor_threads.iter().any(|thread| thread == thread_id))
                    .unwrap_or(false);
                let supertag_match = message_supertags(message)
                    .iter()
                    .any(|tag| anchor_supertags.iter().any(|anchor_tag| anchor_tag == tag));
                message_id_match || thread_match || supertag_match
            })
            .flat_map(message_file_path_refs)
            .collect(),
    )
}

fn message_supertags(message: &Value) -> Vec<String> {
    let mut tags = Vec::new();
    for key in [
        &message["supertags"],
        &message["content"]["supertags"],
        &message["metadata"]["supertags"],
    ] {
        if let Some(items) = key.as_array() {
            for item in items {
                if let Some(tag) = item.as_str() {
                    tags.push(tag.to_string());
                }
            }
        }
    }
    tags
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_prepared_context_packet_from_existing_substrate() {
        let topology_bundle = TopologyNeighborhoodBundle {
            anchor_refs: vec!["msg_anchor".to_string()],
            items: Vec::new(),
            coverage_summary: "Surfaced 2 related context items.".to_string(),
            result_budget_used: 2,
        };
        let context_items = vec![StateSnapshotContextItem {
            id: "msg_follow".to_string(),
            label: "Follow-up".to_string(),
            why_surfaced: "same follow-up chain".to_string(),
            confidence: "high".to_string(),
            freshness: "reactivated".to_string(),
            relation_path: vec![
                "same_follow_up_chain".to_string(),
                "same_project".to_string(),
            ],
            source_refs: vec!["msg_follow".to_string(), "file:report".to_string()],
            decrypt_needed: true,
        }];
        let decisions = vec![StateSnapshotDecisionItem {
            id: "dq_1".to_string(),
            label: "Approve".to_string(),
            category: "shopping".to_string(),
            urgency: "today".to_string(),
            confidence: "high".to_string(),
            source_refs: vec!["msg_decision".to_string()],
            suggested_next_action: "Review".to_string(),
            approval_required: true,
        }];
        let responses = vec![StateSnapshotResponseItem {
            id: "rq_1".to_string(),
            label: "Reply".to_string(),
            channel: "email".to_string(),
            urgency: "today".to_string(),
            confidence: "medium".to_string(),
            response_due_hint: "Today".to_string(),
            source_refs: vec!["msg_response".to_string()],
            suggested_next_action: "Draft".to_string(),
        }];
        let recent_messages = vec![
            serde_json::json!({
                "id": "msg_follow",
                "type": "note",
                "thread_id": "thread_alpha",
                "content": { "supertags": ["project:launch"] }
            }),
            serde_json::json!({
                "id": "msg_decision",
                "type": "decision_request",
                "thread_id": "thread_alpha"
            }),
            serde_json::json!({
                "id": "msg_decision_result",
                "type": "decision_result",
                "parent_id": "msg_decision",
                "thread_id": "thread_alpha"
            }),
            serde_json::json!({
                "id": "ledger_1",
                "type": "file_ledger",
                "thread_id": "thread_alpha",
                "content": { "supertags": ["project:launch"] }
            }),
            serde_json::json!({
                "id": "export_1",
                "type": "file_ledger",
                "subtype": "file_ledger:export_result",
                "thread_id": "thread_exports",
                "content": {
                    "ledger_message_id": "ledger_1",
                    "format": "markdown"
                }
            }),
        ];
        let mut context_items = context_items;
        context_items[0].source_refs.push("export_1".to_string());

        let packet = build_prepared_context_packet(
            &["msg_anchor".to_string()],
            &topology_bundle,
            &context_items,
            &decisions,
            &responses,
            &recent_messages,
        );

        assert!(packet.ready);
        assert_eq!(packet.packet_kind, PREPARED_CONTEXT_KIND_CONTINUITY);
        assert_eq!(
            packet.retrieval_mode,
            PREPARED_CONTEXT_RETRIEVAL_MODE_METADATA_FIRST_WITH_DEEPENING
        );
        assert!(packet.deeper_retrieval_recommended);
        assert_eq!(packet.topology_budget_used, 2);
        assert_eq!(packet.decrypt_needed_count, 1);
        assert_eq!(
            packet.working_set_refs,
            vec![
                "msg_anchor".to_string(),
                "msg_decision".to_string(),
                "msg_follow".to_string(),
                "msg_response".to_string()
            ]
        );
        assert_eq!(
            packet.decision_history_refs,
            vec![
                "msg_decision".to_string(),
                "msg_decision_result".to_string()
            ]
        );
        assert_eq!(packet.follow_up_refs, vec!["msg_follow".to_string()]);
        assert_eq!(packet.project_refs, vec!["msg_follow".to_string()]);
        assert_eq!(packet.active_topic_refs, vec!["msg_follow".to_string()]);
        assert!(
            packet
                .readiness_reason
                .as_deref()
                .is_some_and(|reason| reason.contains("still need decryption"))
        );
        assert_eq!(
            packet.file_refs,
            vec![
                "export_1".to_string(),
                "file:report".to_string(),
                "ledger_1".to_string()
            ]
        );
        assert_eq!(packet.packs.len(), 2);
        assert_eq!(packet.packs[0].pack_kind, PREPARED_CONTEXT_PACK_KIND_TOPIC);
        assert_eq!(
            packet.packs[1].pack_kind,
            PREPARED_CONTEXT_PACK_KIND_OBLIGATION
        );
        assert!(
            packet.packs[0]
                .why_surfaced
                .contains("Reactivated dormant context")
        );
        assert!(
            packet.packs[1]
                .why_surfaced
                .contains("Reactivated dormant context")
        );
    }

    #[test]
    fn builds_prepared_context_packet_from_top_level_supertags() {
        let topology_bundle = TopologyNeighborhoodBundle {
            anchor_refs: vec!["msg_anchor".to_string()],
            items: Vec::new(),
            coverage_summary: "Surfaced 1 related context item.".to_string(),
            result_budget_used: 1,
        };
        let context_items = vec![StateSnapshotContextItem {
            id: "msg_follow".to_string(),
            label: "Follow-up".to_string(),
            why_surfaced: "same project".to_string(),
            confidence: "high".to_string(),
            freshness: "fresh".to_string(),
            relation_path: vec!["same_project".to_string()],
            source_refs: vec!["msg_follow".to_string()],
            decrypt_needed: false,
        }];
        let recent_messages = vec![
            serde_json::json!({
                "id": "msg_anchor",
                "type": "ledger",
                "kind": "task",
                "thread_id": "thread_alpha",
                "supertags": ["project:launch"]
            }),
            serde_json::json!({
                "id": "ledger_1",
                "type": "file_ledger",
                "thread_id": "thread_beta",
                "supertags": ["project:launch"]
            }),
        ];

        let packet = build_prepared_context_packet(
            &["msg_anchor".to_string()],
            &topology_bundle,
            &context_items,
            &[],
            &[],
            &recent_messages,
        );

        assert!(packet.ready);
        assert_eq!(packet.file_refs, vec!["ledger_1".to_string()]);
    }

    #[test]
    fn builds_prepared_context_packet_from_canonical_references() {
        let topology_bundle = TopologyNeighborhoodBundle {
            anchor_refs: vec!["msg_anchor".to_string()],
            items: Vec::new(),
            coverage_summary: "Surfaced 1 related context item.".to_string(),
            result_budget_used: 1,
        };
        let context_items = vec![StateSnapshotContextItem {
            id: "msg_anchor".to_string(),
            label: "Anchor".to_string(),
            why_surfaced: "part of project".to_string(),
            confidence: "high".to_string(),
            freshness: "active".to_string(),
            relation_path: vec!["part_of".to_string()],
            source_refs: vec!["msg_anchor".to_string()],
            decrypt_needed: false,
        }];
        let recent_messages = vec![
            serde_json::json!({
                "id": "msg_anchor",
                "type": "ledger",
                "kind": "task",
                "thread_id": "thread_alpha",
                "references": [
                    {
                        "type": "message",
                        "target": "project_1",
                        "metadata": { "link_type": "part_of" }
                    }
                ]
            }),
            serde_json::json!({
                "id": "project_1",
                "type": "ledger",
                "kind": "project",
                "thread_id": "thread_beta"
            }),
        ];

        let packet = build_prepared_context_packet(
            &["msg_anchor".to_string()],
            &topology_bundle,
            &context_items,
            &[],
            &[],
            &recent_messages,
        );

        assert!(packet.ready);
        assert_eq!(packet.reference_refs, vec!["project_1".to_string()]);
        assert!(packet.source_refs.contains(&"project_1".to_string()));
        assert_eq!(packet.packs.len(), 1);
        assert_eq!(packet.packs[0].pack_kind, PREPARED_CONTEXT_PACK_KIND_TOPIC);
        assert!(
            packet.packs[0]
                .evidence_kinds
                .contains(&"reference".to_string())
        );
    }

    #[test]
    fn builds_prepared_context_packet_from_shared_object_refs() {
        let topology_bundle = TopologyNeighborhoodBundle {
            anchor_refs: vec!["msg_anchor".to_string()],
            items: Vec::new(),
            coverage_summary: "Surfaced 1 related context item.".to_string(),
            result_budget_used: 1,
        };
        let context_items = vec![StateSnapshotContextItem {
            id: "msg_anchor".to_string(),
            label: "Anchor".to_string(),
            why_surfaced: "shared object".to_string(),
            confidence: "high".to_string(),
            freshness: "active".to_string(),
            relation_path: vec!["shared_object".to_string()],
            source_refs: vec!["msg_anchor".to_string()],
            decrypt_needed: false,
        }];
        let recent_messages = vec![
            serde_json::json!({
                "id": "msg_anchor",
                "type": "ledger",
                "kind": "note",
                "thread_id": "thread_alpha",
                "references": [
                    {
                        "type": "project",
                        "target": "project_aurora"
                    }
                ]
            }),
            serde_json::json!({
                "id": "msg_related",
                "type": "task",
                "thread_id": "thread_beta",
                "metadata": {
                    "entity_id": "project_aurora"
                }
            }),
        ];

        let packet = build_prepared_context_packet(
            &["msg_anchor".to_string()],
            &topology_bundle,
            &context_items,
            &[],
            &[],
            &recent_messages,
        );

        assert!(packet.ready);
        assert_eq!(packet.object_refs, vec!["project_aurora".to_string()]);
        assert_eq!(packet.packs.len(), 1);
        assert_eq!(
            packet.packs[0].object_refs,
            vec!["project_aurora".to_string()]
        );
        assert!(
            packet.packs[0]
                .evidence_kinds
                .contains(&"object".to_string())
        );
    }

    #[test]
    fn prepared_context_packet_stays_metadata_first_without_deepening_when_support_is_complete() {
        let topology_bundle = TopologyNeighborhoodBundle {
            anchor_refs: vec!["msg_anchor".to_string()],
            items: Vec::new(),
            coverage_summary: "Surfaced 3 related context items.".to_string(),
            result_budget_used: 3,
        };
        let context_items = vec![StateSnapshotContextItem {
            id: "msg_project".to_string(),
            label: "Project".to_string(),
            why_surfaced: "same project".to_string(),
            confidence: "high".to_string(),
            freshness: "fresh".to_string(),
            relation_path: vec!["same_project".to_string()],
            source_refs: vec!["msg_project".to_string()],
            decrypt_needed: false,
        }];
        let decisions = vec![StateSnapshotDecisionItem {
            id: "dq_1".to_string(),
            label: "Approve plan".to_string(),
            category: "planning".to_string(),
            urgency: "today".to_string(),
            confidence: "high".to_string(),
            source_refs: vec!["msg_decision".to_string()],
            suggested_next_action: "Review".to_string(),
            approval_required: true,
        }];
        let responses = vec![StateSnapshotResponseItem {
            id: "rq_1".to_string(),
            label: "Reply to partner".to_string(),
            channel: "email".to_string(),
            urgency: "today".to_string(),
            confidence: "high".to_string(),
            response_due_hint: "Today".to_string(),
            source_refs: vec!["msg_response".to_string()],
            suggested_next_action: "Draft".to_string(),
        }];
        let recent_messages = vec![
            serde_json::json!({
                "id": "msg_anchor",
                "type": "ledger",
                "thread_id": "thread_alpha",
                "references": [
                    { "type": "message", "target": "project_1" }
                ]
            }),
            serde_json::json!({
                "id": "msg_project",
                "type": "ledger",
                "thread_id": "thread_alpha",
                "content": { "supertags": ["project:launch"] }
            }),
            serde_json::json!({
                "id": "msg_decision",
                "type": "decision_request",
                "thread_id": "thread_alpha"
            }),
            serde_json::json!({
                "id": "msg_decision_result",
                "type": "decision_result",
                "parent_id": "msg_decision",
                "thread_id": "thread_alpha"
            }),
            serde_json::json!({
                "id": "msg_response",
                "type": "email",
                "thread_id": "thread_alpha"
            }),
            serde_json::json!({
                "id": "ledger_1",
                "type": "file_ledger",
                "thread_id": "thread_alpha",
                "content": { "title": "Launch brief" }
            }),
            serde_json::json!({
                "id": "project_1",
                "type": "ledger",
                "kind": "project",
                "thread_id": "thread_beta"
            }),
        ];

        let packet = build_prepared_context_packet(
            &["msg_anchor".to_string()],
            &topology_bundle,
            &context_items,
            &decisions,
            &responses,
            &recent_messages,
        );

        assert!(packet.ready);
        assert_eq!(
            packet.retrieval_mode,
            PREPARED_CONTEXT_RETRIEVAL_MODE_METADATA_FIRST
        );
        assert!(!packet.deeper_retrieval_recommended);
        assert!(packet.summary.contains("Metadata-first support is ready."));
        assert!(
            packet
                .readiness_reason
                .as_deref()
                .is_some_and(|reason| reason.contains("working-set"))
        );
    }

    #[test]
    fn builds_prepared_context_packet_from_contextual_file_paths() {
        let topology_bundle = TopologyNeighborhoodBundle {
            anchor_refs: vec!["msg_anchor".to_string()],
            items: Vec::new(),
            coverage_summary: "Surfaced 1 related context item.".to_string(),
            result_budget_used: 1,
        };
        let context_items = vec![StateSnapshotContextItem {
            id: "msg_context".to_string(),
            label: "Context".to_string(),
            why_surfaced: "same thread".to_string(),
            confidence: "high".to_string(),
            freshness: "fresh".to_string(),
            relation_path: vec!["same_thread".to_string()],
            source_refs: vec!["msg_context".to_string()],
            decrypt_needed: false,
        }];
        let recent_messages = vec![
            serde_json::json!({
                "id": "msg_anchor",
                "type": "ledger",
                "thread_id": "thread_alpha",
                "supertags": ["project:launch"]
            }),
            serde_json::json!({
                "id": "msg_context",
                "type": "note",
                "thread_id": "thread_alpha",
                "content": {
                    "file_path": "notes/launch-plan.md"
                }
            }),
            serde_json::json!({
                "id": "msg_supertag_file",
                "type": "note",
                "thread_id": "thread_beta",
                "metadata": {
                    "path": "docs/launch-brief.md"
                },
                "supertags": ["project:launch"]
            }),
        ];

        let packet = build_prepared_context_packet(
            &["msg_anchor".to_string()],
            &topology_bundle,
            &context_items,
            &[],
            &[],
            &recent_messages,
        );

        assert!(packet.ready);
        assert!(
            packet
                .file_refs
                .contains(&"file:notes/launch-plan.md".to_string())
        );
        assert!(
            packet
                .file_refs
                .contains(&"file:docs/launch-brief.md".to_string())
        );
        assert!(
            packet
                .packs
                .first()
                .map(|pack| pack.file_labels.contains(&"launch-plan.md".to_string()))
                .unwrap_or(false)
        );
        assert!(
            packet
                .packs
                .first()
                .map(|pack| pack.file_labels.contains(&"launch-brief.md".to_string()))
                .unwrap_or(false)
        );
    }

    #[test]
    fn builds_prepared_context_packet_with_decision_outcome_history_lineage() {
        let topology_bundle = TopologyNeighborhoodBundle {
            anchor_refs: vec!["decision_1".to_string()],
            items: Vec::new(),
            coverage_summary: "Surfaced 1 related context item.".to_string(),
            result_budget_used: 1,
        };
        let decisions = vec![StateSnapshotDecisionItem {
            id: "dq_1".to_string(),
            label: "Choose vendor".to_string(),
            category: "decision".to_string(),
            urgency: "today".to_string(),
            confidence: "high".to_string(),
            source_refs: vec!["decision_1".to_string()],
            suggested_next_action: "Review tradeoffs".to_string(),
            approval_required: false,
        }];
        let recent_messages = vec![
            serde_json::json!({
                "id": "decision_1",
                "type": "decision_request",
                "thread_id": "thread_alpha"
            }),
            serde_json::json!({
                "id": "decision_result_1",
                "type": "decision_result",
                "parent_id": "decision_1",
                "thread_id": "thread_alpha"
            }),
            serde_json::json!({
                "id": "decision_outcome_1",
                "type": "decision_outcome",
                "subtype": "decision_outcome:record",
                "thread_id": "thread_beta",
                "content": {
                    "decision_message_id": "decision_1"
                }
            }),
            serde_json::json!({
                "id": "decision_review_1",
                "type": "decision_outcome",
                "subtype": "decision_outcome:review",
                "thread_id": "thread_gamma",
                "content": {
                    "outcome_message_id": "decision_outcome_1"
                },
                "references": [
                    {
                        "type": "message",
                        "target": "decision_1"
                    }
                ]
            }),
        ];

        let packet = build_prepared_context_packet(
            &["decision_1".to_string()],
            &topology_bundle,
            &[],
            &decisions,
            &[],
            &recent_messages,
        );

        assert!(packet.ready);
        assert_eq!(
            packet.decision_history_refs,
            vec![
                "decision_1".to_string(),
                "decision_outcome_1".to_string(),
                "decision_result_1".to_string(),
                "decision_review_1".to_string(),
            ]
        );
    }

    #[test]
    fn prepared_context_ledger_afp_carries_optional_suggested_actions_when_ready() {
        let packet = PreparedContextPacket {
            packet_kind: PREPARED_CONTEXT_KIND_CONTINUITY.to_string(),
            ready: true,
            summary: "Context packet ready.".to_string(),
            ..PreparedContextPacket::default()
        };

        let afp =
            build_prepared_context_ledger_afp("user_1", "thread_1", Some("parent_1"), &packet);

        assert_eq!(
            afp["content"]["suggested_actions"],
            serde_json::json!(["Review prepared context"])
        );
    }
}
