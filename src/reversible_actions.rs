/*
 * @module-id: rust.reversible-actions
 * @primary-capability: rust.source-module
 * @locs-version: 2.0
 * @stability: active
 * @owner: omnyid
 */

use chrono::Utc;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use ulid::Ulid;

use crate::{
    autonomy_policy::autonomy_decision_for_internal_reversible_action,
    calendar_event_profile::calendar_event_profile_from_fields,
    integration::{ActionResult, ActionStatus},
    message::{AFP_KIND_RICH_NOTE, AFP_TYPE_LEDGER, AfpProvenanceHash},
    provenance_record::{build_action_provenance_record_afp, canonical_value_hash},
    rollback::{build_revert_checkpoint_afp, encode_rollback_token},
};

pub const REVERSIBLE_CAPABILITY_DRAFT_TASK_CREATE: &str = "cap_internal_task_draft_create";
pub const REVERSIBLE_ACTION_TASK_DRAFT_CREATE: &str = "action_task_draft_create";
pub const REVERSIBLE_CAPABILITY_INBOX_ORGANIZE: &str = "cap_internal_inbox_organize";
pub const REVERSIBLE_ACTION_INBOX_ORGANIZE: &str = "action_inbox_organize";
pub const REVERSIBLE_CAPABILITY_FILE_BUNDLE_STAGE: &str = "cap_internal_file_bundle_stage";
pub const REVERSIBLE_ACTION_FILE_BUNDLE_STAGE: &str = "action_file_bundle_stage";
pub const REVERSIBLE_CAPABILITY_TENTATIVE_CALENDAR_HOLD: &str =
    "cap_internal_tentative_calendar_hold";
pub const REVERSIBLE_ACTION_TENTATIVE_CALENDAR_HOLD: &str = "action_tentative_calendar_hold";

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct DraftTaskCreationRequest {
    pub title: String,
    pub summary: String,
    #[serde(default)]
    pub due_hint: Option<String>,
    #[serde(default)]
    pub source_refs: Vec<String>,
    #[serde(default)]
    pub source_message_ids: Vec<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct InboxOrganizationRequest {
    pub title: String,
    pub summary: String,
    pub provider: String,
    pub conversation_ref: String,
    #[serde(default)]
    pub apply_label: Option<String>,
    #[serde(default)]
    pub archive_after_label: bool,
    #[serde(default)]
    pub source_refs: Vec<String>,
    #[serde(default)]
    pub source_message_ids: Vec<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct FileBundleStageRequest {
    pub title: String,
    pub summary: String,
    #[serde(default)]
    pub bundle_kind: Option<String>,
    #[serde(default)]
    pub staged_for: Option<String>,
    #[serde(default)]
    pub file_entry_ids: Vec<String>,
    #[serde(default)]
    pub file_names: Vec<String>,
    #[serde(default)]
    pub suggested_export_format: Option<String>,
    #[serde(default)]
    pub source_refs: Vec<String>,
    #[serde(default)]
    pub source_message_ids: Vec<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct TentativeCalendarHoldRequest {
    pub title: String,
    #[serde(default)]
    pub description: Option<String>,
    pub start_at: String,
    #[serde(default)]
    pub end_at: Option<String>,
    #[serde(default)]
    pub all_day: bool,
    #[serde(default)]
    pub location: Option<String>,
    #[serde(default)]
    pub hold_reason: Option<String>,
    #[serde(default)]
    pub source_refs: Vec<String>,
    #[serde(default)]
    pub source_message_ids: Vec<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct ReversibleActionBundle {
    pub action_afp: Value,
    pub checkpoint_afp: Value,
    pub provenance_afp: Value,
    pub action_result: ActionResult,
}

pub fn build_draft_task_creation_bundle(
    owner_user_id: &str,
    thread_id: &str,
    parent_id: Option<&str>,
    request: &DraftTaskCreationRequest,
) -> ReversibleActionBundle {
    let task_id = format!("draft-task:{}", Ulid::new());
    let recorded_at = Utc::now().to_rfc3339();
    let autonomy_decision = autonomy_decision_for_internal_reversible_action(
        "Created an internal draft task that can be removed or revised safely.",
    );

    let action_content = json!({
        "task_id": task_id,
        "title": request.title,
        "summary": request.summary,
        "status": "draft",
        "due_hint": request.due_hint,
        "source_refs": request.source_refs,
    });

    let action_message_id = Ulid::new().to_string();
    let action_afp = json!({
        "protocol": "afp-v1",
        "id": action_message_id,
        "thread_id": thread_id,
        "parent_id": parent_id,
        "from": "master_agent",
        "to": [owner_user_id],
        "timestamp": recorded_at,
        "type": AFP_TYPE_LEDGER,
        "kind": AFP_KIND_RICH_NOTE,
        "subtype": "draft_task",
        "content": action_content,
        "views": [{
            "format": "a2ui.v1",
            "content": {
                "schema_version": "a2ui.v1",
                "kind": "note",
                "props": {
                    "title": request.title,
                    "summary": request.summary,
                    "body": format!("Draft task created and ready for review.\n\nSuggested due hint: {}", request.due_hint.clone().unwrap_or_else(|| "none".to_string())),
                    "status": "draft",
                    "review_required": false,
                }
            }
        }],
        "metadata": {
            "store": true,
            "capability_id": REVERSIBLE_CAPABILITY_DRAFT_TASK_CREATE,
            "autonomy_decision": autonomy_decision,
            "reversible_action": true,
        },
        "store_in_relational": true,
    });

    let rollback_token = encode_rollback_token(&json!({
        "capability_id": REVERSIBLE_CAPABILITY_DRAFT_TASK_CREATE,
        "task_id": task_id,
        "thread_id": thread_id,
        "action_message_id": action_message_id,
        "mode": "remove_draft_task",
    }));
    let mut checkpoint_afp = build_revert_checkpoint_afp(
        owner_user_id,
        thread_id,
        &action_message_id,
        REVERSIBLE_ACTION_TASK_DRAFT_CREATE,
        "Remove draft task",
        &rollback_token,
    );
    checkpoint_afp["parent_id"] = Value::String(action_message_id.clone());

    let provenance_afp = build_action_provenance_record_afp(
        owner_user_id,
        thread_id,
        Some(&action_message_id),
        "master_agent",
        REVERSIBLE_ACTION_TASK_DRAFT_CREATE,
        "Created reversible draft task",
        &request
            .source_message_ids
            .iter()
            .map(String::as_str)
            .collect::<Vec<_>>(),
        vec![AfpProvenanceHash {
            label: "draft_task_request".to_string(),
            sha256: canonical_value_hash(&json!({
                "title": request.title,
                "summary": request.summary,
                "due_hint": request.due_hint,
                "source_refs": request.source_refs,
            })),
        }],
        vec![AfpProvenanceHash {
            label: "draft_task_action".to_string(),
            sha256: canonical_value_hash(&json!({
                "task_id": task_id,
                "action_message_id": action_message_id,
            })),
        }],
        Some(0.95),
        Some(json!({
            "capability_id": REVERSIBLE_CAPABILITY_DRAFT_TASK_CREATE,
            "reversible": true,
            "undo_label": "Remove draft task",
        })),
    );

    let action_result = ActionResult {
        capability_id: REVERSIBLE_CAPABILITY_DRAFT_TASK_CREATE.to_string(),
        thread_id: thread_id.to_string(),
        status: ActionStatus::Completed,
        output: json!({
            "task_id": task_id,
            "action_message_id": action_message_id,
            "status": "draft_created",
            "reversible": true,
            "undo_label": "Remove draft task",
            "side_effect_boundary": "internal_only",
            "rollback_checkpoint_id": checkpoint_afp["id"],
            "provenance_record_id": provenance_afp["id"],
        }),
        external_reference: Some(action_message_id),
        recorded_at,
    };

    ReversibleActionBundle {
        action_afp,
        checkpoint_afp,
        provenance_afp,
        action_result,
    }
}

pub fn build_inbox_organization_bundle(
    owner_user_id: &str,
    thread_id: &str,
    parent_id: Option<&str>,
    request: &InboxOrganizationRequest,
) -> ReversibleActionBundle {
    let organization_id = format!("inbox-org:{}", Ulid::new());
    let recorded_at = Utc::now().to_rfc3339();
    let autonomy_decision = autonomy_decision_for_internal_reversible_action(
        "Applied a reversible inbox organization action that can remove labels or restore archive state.",
    );
    let action_message_id = Ulid::new().to_string();

    let action_content = json!({
        "organization_id": organization_id,
        "provider": request.provider,
        "conversation_ref": request.conversation_ref,
        "apply_label": request.apply_label,
        "archive_after_label": request.archive_after_label,
        "source_refs": request.source_refs,
        "status": "staged",
    });

    let action_afp = json!({
        "protocol": "afp-v1",
        "id": action_message_id,
        "thread_id": thread_id,
        "parent_id": parent_id,
        "from": "master_agent",
        "to": [owner_user_id],
        "timestamp": recorded_at,
        "type": AFP_TYPE_LEDGER,
        "kind": AFP_KIND_RICH_NOTE,
        "subtype": "inbox_organization",
        "content": action_content,
        "views": [{
            "format": "a2ui.v1",
            "content": {
                "schema_version": "a2ui.v1",
                "kind": "note",
                "props": {
                    "title": request.title,
                    "summary": request.summary,
                    "body": format!(
                        "Inbox organization staged for {}.\n\nLabel: {}\nArchive after labeling: {}",
                        request.provider,
                        request.apply_label.clone().unwrap_or_else(|| "none".to_string()),
                        if request.archive_after_label { "yes" } else { "no" }
                    ),
                    "status": "staged",
                    "review_required": false,
                }
            }
        }],
        "metadata": {
            "store": true,
            "capability_id": REVERSIBLE_CAPABILITY_INBOX_ORGANIZE,
            "autonomy_decision": autonomy_decision,
            "reversible_action": true,
        },
        "store_in_relational": true,
    });

    let rollback_token = encode_rollback_token(&json!({
        "capability_id": REVERSIBLE_CAPABILITY_INBOX_ORGANIZE,
        "organization_id": organization_id,
        "provider": request.provider,
        "conversation_ref": request.conversation_ref,
        "remove_label": request.apply_label,
        "restore_archive": request.archive_after_label,
        "action_message_id": action_message_id,
        "mode": "undo_inbox_organization",
    }));
    let mut checkpoint_afp = build_revert_checkpoint_afp(
        owner_user_id,
        thread_id,
        &action_message_id,
        REVERSIBLE_ACTION_INBOX_ORGANIZE,
        "Undo inbox organization",
        &rollback_token,
    );
    checkpoint_afp["parent_id"] = Value::String(action_message_id.clone());

    let provenance_afp = build_action_provenance_record_afp(
        owner_user_id,
        thread_id,
        Some(&action_message_id),
        "master_agent",
        REVERSIBLE_ACTION_INBOX_ORGANIZE,
        "Applied reversible inbox organization",
        &request
            .source_message_ids
            .iter()
            .map(String::as_str)
            .collect::<Vec<_>>(),
        vec![AfpProvenanceHash {
            label: "inbox_organization_request".to_string(),
            sha256: canonical_value_hash(&json!({
                "provider": request.provider,
                "conversation_ref": request.conversation_ref,
                "apply_label": request.apply_label,
                "archive_after_label": request.archive_after_label,
                "source_refs": request.source_refs,
            })),
        }],
        vec![AfpProvenanceHash {
            label: "inbox_organization_action".to_string(),
            sha256: canonical_value_hash(&json!({
                "organization_id": organization_id,
                "action_message_id": action_message_id,
            })),
        }],
        Some(0.94),
        Some(json!({
            "capability_id": REVERSIBLE_CAPABILITY_INBOX_ORGANIZE,
            "reversible": true,
            "undo_label": "Undo inbox organization",
        })),
    );

    let action_result = ActionResult {
        capability_id: REVERSIBLE_CAPABILITY_INBOX_ORGANIZE.to_string(),
        thread_id: thread_id.to_string(),
        status: ActionStatus::Completed,
        output: json!({
            "organization_id": organization_id,
            "action_message_id": action_message_id,
            "status": "inbox_organization_staged",
            "reversible": true,
            "undo_label": "Undo inbox organization",
            "side_effect_boundary": "internal_only",
            "rollback_checkpoint_id": checkpoint_afp["id"],
            "provenance_record_id": provenance_afp["id"],
        }),
        external_reference: Some(action_message_id),
        recorded_at,
    };

    ReversibleActionBundle {
        action_afp,
        checkpoint_afp,
        provenance_afp,
        action_result,
    }
}

pub fn build_file_bundle_stage_bundle(
    owner_user_id: &str,
    thread_id: &str,
    parent_id: Option<&str>,
    request: &FileBundleStageRequest,
) -> ReversibleActionBundle {
    let bundle_id = format!("file-bundle:{}", Ulid::new());
    let recorded_at = Utc::now().to_rfc3339();
    let autonomy_decision = autonomy_decision_for_internal_reversible_action(
        "Staged a prepared file bundle inside OmnyID without exporting, sending, or mutating source files.",
    );
    let action_message_id = Ulid::new().to_string();
    let bundle_kind = request
        .bundle_kind
        .clone()
        .unwrap_or_else(|| "prepared_bundle".to_string());
    let staged_for = request
        .staged_for
        .clone()
        .unwrap_or_else(|| "review".to_string());

    let action_content = json!({
        "bundle_id": bundle_id,
        "bundle_kind": bundle_kind,
        "staged_for": staged_for,
        "file_entry_ids": request.file_entry_ids,
        "file_names": request.file_names,
        "suggested_export_format": request.suggested_export_format,
        "source_refs": request.source_refs,
        "status": "staged",
    });

    let body = format!(
        "Prepared file bundle staged for {}.\n\nFiles: {}\nSuggested export format: {}",
        staged_for,
        if request.file_names.is_empty() {
            "none listed".to_string()
        } else {
            request.file_names.join(", ")
        },
        request
            .suggested_export_format
            .clone()
            .unwrap_or_else(|| "none".to_string())
    );

    let action_afp = json!({
        "protocol": "afp-v1",
        "id": action_message_id,
        "thread_id": thread_id,
        "parent_id": parent_id,
        "from": "master_agent",
        "to": [owner_user_id],
        "timestamp": recorded_at,
        "type": AFP_TYPE_LEDGER,
        "kind": AFP_KIND_RICH_NOTE,
        "subtype": "file_bundle_stage",
        "content": action_content,
        "views": [{
            "format": "a2ui.v1",
            "content": {
                "schema_version": "a2ui.v1",
                "kind": "note",
                "props": {
                    "title": request.title,
                    "summary": request.summary,
                    "body": body,
                    "status": "staged",
                    "review_required": false,
                }
            }
        }],
        "metadata": {
            "store": true,
            "capability_id": REVERSIBLE_CAPABILITY_FILE_BUNDLE_STAGE,
            "autonomy_decision": autonomy_decision,
            "reversible_action": true,
            "side_effect_boundary": "internal_only",
        },
        "store_in_relational": true,
    });

    let rollback_token = encode_rollback_token(&json!({
        "capability_id": REVERSIBLE_CAPABILITY_FILE_BUNDLE_STAGE,
        "bundle_id": bundle_id,
        "thread_id": thread_id,
        "file_entry_ids": request.file_entry_ids,
        "action_message_id": action_message_id,
        "mode": "discard_file_bundle_stage",
    }));
    let mut checkpoint_afp = build_revert_checkpoint_afp(
        owner_user_id,
        thread_id,
        &action_message_id,
        REVERSIBLE_ACTION_FILE_BUNDLE_STAGE,
        "Discard staged file bundle",
        &rollback_token,
    );
    checkpoint_afp["parent_id"] = Value::String(action_message_id.clone());

    let provenance_afp = build_action_provenance_record_afp(
        owner_user_id,
        thread_id,
        Some(&action_message_id),
        "master_agent",
        REVERSIBLE_ACTION_FILE_BUNDLE_STAGE,
        "Staged reversible file bundle",
        &request
            .source_message_ids
            .iter()
            .map(String::as_str)
            .collect::<Vec<_>>(),
        vec![AfpProvenanceHash {
            label: "file_bundle_stage_request".to_string(),
            sha256: canonical_value_hash(&json!({
                "bundle_kind": request.bundle_kind,
                "staged_for": request.staged_for,
                "file_entry_ids": request.file_entry_ids,
                "file_names": request.file_names,
                "suggested_export_format": request.suggested_export_format,
                "source_refs": request.source_refs,
            })),
        }],
        vec![AfpProvenanceHash {
            label: "file_bundle_stage_action".to_string(),
            sha256: canonical_value_hash(&json!({
                "bundle_id": bundle_id,
                "action_message_id": action_message_id,
            })),
        }],
        Some(0.95),
        Some(json!({
            "capability_id": REVERSIBLE_CAPABILITY_FILE_BUNDLE_STAGE,
            "reversible": true,
            "undo_label": "Discard staged file bundle",
            "side_effect_boundary": "internal_only",
        })),
    );

    let action_result = ActionResult {
        capability_id: REVERSIBLE_CAPABILITY_FILE_BUNDLE_STAGE.to_string(),
        thread_id: thread_id.to_string(),
        status: ActionStatus::Completed,
        output: json!({
            "bundle_id": bundle_id,
            "action_message_id": action_message_id,
            "status": "file_bundle_staged",
            "reversible": true,
            "undo_label": "Discard staged file bundle",
            "side_effect_boundary": "internal_only",
            "rollback_checkpoint_id": checkpoint_afp["id"],
            "provenance_record_id": provenance_afp["id"],
        }),
        external_reference: Some(action_message_id),
        recorded_at,
    };

    ReversibleActionBundle {
        action_afp,
        checkpoint_afp,
        provenance_afp,
        action_result,
    }
}

pub fn build_tentative_calendar_hold_bundle(
    owner_user_id: &str,
    thread_id: &str,
    parent_id: Option<&str>,
    request: &TentativeCalendarHoldRequest,
) -> ReversibleActionBundle {
    let event_id = format!("calendar-hold:{}", Ulid::new());
    let recorded_at = Utc::now().to_rfc3339();
    let autonomy_decision = autonomy_decision_for_internal_reversible_action(
        "Placed a tentative internal calendar hold that can be removed cleanly before it becomes a confirmed commitment.",
    );
    let action_message_id = Ulid::new().to_string();
    let profile = calendar_event_profile_from_fields(
        &request.title,
        request.description.as_deref(),
        request.location.as_deref(),
        request.all_day,
    );
    let note_kind = profile
        .get("schedule_note_kind")
        .and_then(Value::as_str)
        .unwrap_or("general_prep");
    let prep_lead_minutes = profile
        .get("prep_lead_minutes")
        .and_then(Value::as_i64)
        .unwrap_or(30);

    let action_content = json!({
        "event_id": event_id,
        "title": request.title,
        "description": request.description,
        "start_at": request.start_at,
        "end_at": request.end_at,
        "all_day": request.all_day,
        "location": request.location,
        "status": "tentative",
        "hold_reason": request.hold_reason,
        "note_kind": note_kind,
        "prep_lead_minutes": prep_lead_minutes,
        "profile": profile,
        "source_refs": request.source_refs,
    });

    let body = format!(
        "Tentative hold placed for {}.\n\nStart: {}\nEnd: {}\nLocation: {}",
        request.title,
        request.start_at,
        request
            .end_at
            .clone()
            .unwrap_or_else(|| "not set".to_string()),
        request
            .location
            .clone()
            .unwrap_or_else(|| "not set".to_string())
    );

    let action_afp = json!({
        "protocol": "afp-v1",
        "id": action_message_id,
        "thread_id": thread_id,
        "parent_id": parent_id,
        "from": "master_agent",
        "to": [owner_user_id],
        "timestamp": recorded_at,
        "type": AFP_TYPE_LEDGER,
        "kind": AFP_KIND_RICH_NOTE,
        "subtype": "tentative_calendar_hold",
        "content": action_content,
        "views": [{
            "format": "calendar",
            "content": {
                "id": event_id,
                "title": request.title,
                "description": request.description,
                "start_at": request.start_at,
                "end_at": request.end_at,
                "all_day": request.all_day,
                "location": request.location,
                "status": "tentative",
                "note_kind": note_kind,
                "prep_lead_minutes": prep_lead_minutes,
                "profile": profile,
            }
        }, {
            "format": "a2ui.v1",
            "content": {
                "schema_version": "a2ui.v1",
                "kind": "note",
                "props": {
                    "title": request.title,
                    "summary": request
                        .hold_reason
                        .clone()
                        .unwrap_or_else(|| "Tentative calendar hold staged for review.".to_string()),
                    "body": body,
                    "status": "tentative",
                    "review_required": false,
                }
            }
        }],
        "metadata": {
            "store": true,
            "capability_id": REVERSIBLE_CAPABILITY_TENTATIVE_CALENDAR_HOLD,
            "autonomy_decision": autonomy_decision,
            "reversible_action": true,
            "side_effect_boundary": "internal_only",
        },
        "store_in_relational": true,
    });

    let rollback_token = encode_rollback_token(&json!({
        "capability_id": REVERSIBLE_CAPABILITY_TENTATIVE_CALENDAR_HOLD,
        "event_id": event_id,
        "title": request.title,
        "start_at": request.start_at,
        "location": request.location,
        "note_kind": note_kind,
        "thread_id": thread_id,
        "action_message_id": action_message_id,
        "mode": "remove_tentative_calendar_hold",
    }));
    let mut checkpoint_afp = build_revert_checkpoint_afp(
        owner_user_id,
        thread_id,
        &action_message_id,
        REVERSIBLE_ACTION_TENTATIVE_CALENDAR_HOLD,
        "Remove tentative hold",
        &rollback_token,
    );
    checkpoint_afp["parent_id"] = Value::String(action_message_id.clone());

    let provenance_afp = build_action_provenance_record_afp(
        owner_user_id,
        thread_id,
        Some(&action_message_id),
        "master_agent",
        REVERSIBLE_ACTION_TENTATIVE_CALENDAR_HOLD,
        "Placed reversible tentative calendar hold",
        &request
            .source_message_ids
            .iter()
            .map(String::as_str)
            .collect::<Vec<_>>(),
        vec![AfpProvenanceHash {
            label: "tentative_calendar_hold_request".to_string(),
            sha256: canonical_value_hash(&json!({
                "title": request.title,
                "description": request.description,
                "start_at": request.start_at,
                "end_at": request.end_at,
                "all_day": request.all_day,
                "location": request.location,
                "hold_reason": request.hold_reason,
                "source_refs": request.source_refs,
            })),
        }],
        vec![AfpProvenanceHash {
            label: "tentative_calendar_hold_action".to_string(),
            sha256: canonical_value_hash(&json!({
                "event_id": event_id,
                "action_message_id": action_message_id,
            })),
        }],
        Some(0.94),
        Some(json!({
            "capability_id": REVERSIBLE_CAPABILITY_TENTATIVE_CALENDAR_HOLD,
            "reversible": true,
            "undo_label": "Remove tentative hold",
            "side_effect_boundary": "internal_only",
        })),
    );

    let action_result = ActionResult {
        capability_id: REVERSIBLE_CAPABILITY_TENTATIVE_CALENDAR_HOLD.to_string(),
        thread_id: thread_id.to_string(),
        status: ActionStatus::Completed,
        output: json!({
            "event_id": event_id,
            "action_message_id": action_message_id,
            "status": "tentative_calendar_hold_created",
            "calendar_status": "tentative",
            "note_kind": note_kind,
            "prep_lead_minutes": prep_lead_minutes,
            "profile": profile,
            "reversible": true,
            "undo_label": "Remove tentative hold",
            "side_effect_boundary": "internal_only",
            "rollback_checkpoint_id": checkpoint_afp["id"],
            "provenance_record_id": provenance_afp["id"],
        }),
        external_reference: Some(action_message_id),
        recorded_at,
    };

    ReversibleActionBundle {
        action_afp,
        checkpoint_afp,
        provenance_afp,
        action_result,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn draft_task_bundle_sets_lineage_and_reversible_artifacts() {
        let bundle = build_draft_task_creation_bundle(
            "user_01",
            "thread_01",
            Some("msg_parent"),
            &DraftTaskCreationRequest {
                title: "Review supplier renewal".to_string(),
                summary: "Create a draft task for the renewal review.".to_string(),
                due_hint: Some("today".to_string()),
                source_refs: vec!["thread:email:supplier".to_string()],
                source_message_ids: vec!["msg_parent".to_string()],
            },
        );

        assert_eq!(bundle.action_afp["type"].as_str(), Some(AFP_TYPE_LEDGER));
        assert_eq!(bundle.action_afp["subtype"].as_str(), Some("draft_task"));
        assert_eq!(bundle.action_afp["parent_id"].as_str(), Some("msg_parent"));
        assert_eq!(
            bundle.checkpoint_afp["content"]["source_message_id"].as_str(),
            bundle.action_afp["id"].as_str()
        );
        assert_eq!(
            bundle.checkpoint_afp["parent_id"].as_str(),
            bundle.action_afp["id"].as_str()
        );
        assert_eq!(
            bundle.provenance_afp["parent_id"].as_str(),
            bundle.action_afp["id"].as_str()
        );
        assert_eq!(
            bundle.action_result.output["action_message_id"].as_str(),
            bundle.action_afp["id"].as_str()
        );
        assert_eq!(
            bundle.action_result.output["rollback_checkpoint_id"].as_str(),
            bundle.checkpoint_afp["id"].as_str()
        );
        assert_eq!(
            bundle.action_result.output["provenance_record_id"].as_str(),
            bundle.provenance_afp["id"].as_str()
        );
        assert_eq!(
            bundle.action_result.capability_id,
            REVERSIBLE_CAPABILITY_DRAFT_TASK_CREATE
        );
    }

    #[test]
    fn inbox_organization_bundle_sets_lineage_and_reversible_artifacts() {
        let bundle = build_inbox_organization_bundle(
            "user_01",
            "thread_02",
            Some("msg_email_parent"),
            &InboxOrganizationRequest {
                title: "Archive supplier quote thread".to_string(),
                summary: "Apply supplier label and archive after triage.".to_string(),
                provider: "gmail".to_string(),
                conversation_ref: "thread:gmail:supplier-quote".to_string(),
                apply_label: Some("supplier/quote".to_string()),
                archive_after_label: true,
                source_refs: vec!["thread:gmail:supplier-quote".to_string()],
                source_message_ids: vec!["msg_email_parent".to_string()],
            },
        );

        assert_eq!(
            bundle.action_afp["subtype"].as_str(),
            Some("inbox_organization")
        );
        assert_eq!(
            bundle.action_afp["parent_id"].as_str(),
            Some("msg_email_parent")
        );
        assert_eq!(
            bundle.checkpoint_afp["content"]["source_message_id"].as_str(),
            bundle.action_afp["id"].as_str()
        );
        assert_eq!(
            bundle.provenance_afp["parent_id"].as_str(),
            bundle.action_afp["id"].as_str()
        );
        assert_eq!(
            bundle.action_result.output["action_message_id"].as_str(),
            bundle.action_afp["id"].as_str()
        );
        assert_eq!(
            bundle.action_result.output["rollback_checkpoint_id"].as_str(),
            bundle.checkpoint_afp["id"].as_str()
        );
        assert_eq!(
            bundle.action_result.output["provenance_record_id"].as_str(),
            bundle.provenance_afp["id"].as_str()
        );
        assert_eq!(
            bundle.action_result.capability_id,
            REVERSIBLE_CAPABILITY_INBOX_ORGANIZE
        );
    }

    #[test]
    fn file_bundle_stage_bundle_sets_lineage_and_reversible_artifacts() {
        let bundle = build_file_bundle_stage_bundle(
            "user_01",
            "thread_03",
            Some("msg_file_parent"),
            &FileBundleStageRequest {
                title: "Stage onboarding document pack".to_string(),
                summary: "Prepare the vendor onboarding files for review.".to_string(),
                bundle_kind: Some("document_pack".to_string()),
                staged_for: Some("vendor review".to_string()),
                file_entry_ids: vec!["file_01".to_string(), "file_02".to_string()],
                file_names: vec![
                    "msa.pdf".to_string(),
                    "security-questionnaire.docx".to_string(),
                ],
                suggested_export_format: Some("zip".to_string()),
                source_refs: vec!["file:file_01".to_string(), "file:file_02".to_string()],
                source_message_ids: vec!["msg_file_parent".to_string()],
            },
        );

        assert_eq!(
            bundle.action_afp["subtype"].as_str(),
            Some("file_bundle_stage")
        );
        assert_eq!(
            bundle.action_afp["parent_id"].as_str(),
            Some("msg_file_parent")
        );
        assert_eq!(
            bundle.checkpoint_afp["content"]["source_message_id"].as_str(),
            bundle.action_afp["id"].as_str()
        );
        assert_eq!(
            bundle.provenance_afp["parent_id"].as_str(),
            bundle.action_afp["id"].as_str()
        );
        assert_eq!(
            bundle.action_afp["metadata"]["side_effect_boundary"].as_str(),
            Some("internal_only")
        );
        assert_eq!(
            bundle.action_result.output["action_message_id"].as_str(),
            bundle.action_afp["id"].as_str()
        );
        assert_eq!(
            bundle.action_result.output["rollback_checkpoint_id"].as_str(),
            bundle.checkpoint_afp["id"].as_str()
        );
        assert_eq!(
            bundle.action_result.output["provenance_record_id"].as_str(),
            bundle.provenance_afp["id"].as_str()
        );
        assert_eq!(
            bundle.action_result.capability_id,
            REVERSIBLE_CAPABILITY_FILE_BUNDLE_STAGE
        );
    }

    #[test]
    fn tentative_calendar_hold_bundle_sets_lineage_and_reversible_artifacts() {
        let bundle = build_tentative_calendar_hold_bundle(
            "user_01",
            "thread_04",
            Some("msg_calendar_parent"),
            &TentativeCalendarHoldRequest {
                title: "Hold for supplier review".to_string(),
                description: Some(
                    "Tentative review block before confirming attendance.".to_string(),
                ),
                start_at: "2026-06-19T09:00:00Z".to_string(),
                end_at: Some("2026-06-19T09:30:00Z".to_string()),
                all_day: false,
                location: Some("Office".to_string()),
                hold_reason: Some("Reserve time while waiting for confirmation.".to_string()),
                source_refs: vec!["thread:supplier-review".to_string()],
                source_message_ids: vec!["msg_calendar_parent".to_string()],
            },
        );

        assert_eq!(
            bundle.action_afp["subtype"].as_str(),
            Some("tentative_calendar_hold")
        );
        assert_eq!(
            bundle.action_afp["content"]["status"].as_str(),
            Some("tentative")
        );
        assert_eq!(
            bundle.action_afp["content"]["note_kind"].as_str(),
            Some("missing_agenda")
        );
        assert_eq!(
            bundle.action_afp["views"][0]["content"]["profile"]["schedule_anchor_type"].as_str(),
            Some("meeting")
        );
        assert_eq!(
            bundle.action_result.output["prep_lead_minutes"].as_i64(),
            Some(45)
        );
        assert_eq!(
            bundle.action_afp["parent_id"].as_str(),
            Some("msg_calendar_parent")
        );
        assert_eq!(
            bundle.checkpoint_afp["content"]["source_message_id"].as_str(),
            bundle.action_afp["id"].as_str()
        );
        assert_eq!(
            bundle.action_result.output["undo_label"].as_str(),
            Some("Remove tentative hold")
        );
        assert_eq!(
            bundle.action_result.output["action_message_id"].as_str(),
            bundle.action_afp["id"].as_str()
        );
        assert_eq!(
            bundle.action_result.output["rollback_checkpoint_id"].as_str(),
            bundle.checkpoint_afp["id"].as_str()
        );
        assert_eq!(
            bundle.action_result.output["provenance_record_id"].as_str(),
            bundle.provenance_afp["id"].as_str()
        );
        assert_eq!(
            bundle.action_result.capability_id,
            REVERSIBLE_CAPABILITY_TENTATIVE_CALENDAR_HOLD
        );
    }
}
