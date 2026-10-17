use super::{
    ClosureSnapshot, ClosureTransition, QuotationSelection,
    afp::{
        CORRECTED_QUOTATION_KIND, NORMALISED_QUOTATION_KIND, QUOTATION_CLOSURE_TRANSITION_KIND,
        QUOTATION_COMPARISON_KIND, QUOTATION_VENDOR_SELECTED_KIND,
    },
    contracts::{
        CandidateDisposition, NormalisedQuotation, QuotationComparison, QuoteLifecycle,
        quotation_material_fingerprint,
    },
    replay_closure, validate_selection,
    validation::validate_normalised_quotation,
};
use crate::message::AFPMessage;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct ReplayDiagnostic {
    pub message_id: String,
    pub code: String,
    pub detail: String,
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct QuotationReplayState {
    pub versions: BTreeMap<String, NormalisedQuotation>,
    pub active_version_by_quotation: BTreeMap<String, String>,
    pub comparisons: BTreeMap<String, QuotationComparison>,
    pub comparison_message_ids: BTreeMap<String, String>,
    pub active_comparisons: BTreeMap<String, QuotationComparison>,
    pub selections: BTreeMap<String, QuotationSelection>,
    pub active_selections: BTreeMap<String, QuotationSelection>,
    pub closure_transitions: BTreeMap<String, ClosureTransition>,
    pub closure_snapshots: BTreeMap<String, ClosureSnapshot>,
    pub active_closures: BTreeMap<String, ClosureSnapshot>,
    pub diagnostics: Vec<ReplayDiagnostic>,
}

fn kind(message: &AFPMessage) -> &str {
    message
        .kind
        .as_deref()
        .or(message.subtype.as_deref())
        .unwrap_or_default()
}

fn diagnostic(message: &AFPMessage, code: &str, detail: impl Into<String>) -> ReplayDiagnostic {
    ReplayDiagnostic {
        message_id: message.id.clone(),
        code: code.to_string(),
        detail: detail.into(),
    }
}

fn message_sort_key(message: &AFPMessage) -> (&str, &str, String) {
    (
        message.id.as_str(),
        message.timestamp.as_str(),
        serde_json::to_string(&message.content).unwrap_or_default(),
    )
}

pub fn replay_quotation_messages(messages: &[AFPMessage]) -> QuotationReplayState {
    let mut state = QuotationReplayState::default();
    let visible_message_ids = messages
        .iter()
        .map(|message| message.id.as_str())
        .collect::<BTreeSet<_>>();
    let mut ordered = messages.iter().collect::<Vec<_>>();
    ordered.sort_by(|left, right| message_sort_key(left).cmp(&message_sort_key(right)));
    let mut seen_message_ids = BTreeSet::new();
    for message in ordered {
        if message.id.trim().is_empty() || !seen_message_ids.insert(message.id.as_str()) {
            continue;
        }
        match kind(message) {
            NORMALISED_QUOTATION_KIND | CORRECTED_QUOTATION_KIND => {
                let Some(payload) = message.content.get("quotation") else {
                    state.diagnostics.push(diagnostic(
                        message,
                        "missing_quotation_payload",
                        "normalisation event has no quotation payload",
                    ));
                    continue;
                };
                let quotation = match serde_json::from_value::<NormalisedQuotation>(payload.clone())
                {
                    Ok(quotation) => quotation,
                    Err(error) => {
                        state.diagnostics.push(diagnostic(
                            message,
                            "invalid_quotation_payload",
                            error.to_string(),
                        ));
                        continue;
                    }
                };
                let validation = validate_normalised_quotation(&quotation);
                if !validation.is_empty() {
                    state.diagnostics.push(diagnostic(
                        message,
                        "quotation_validation_failed",
                        validation
                            .iter()
                            .map(|issue| issue.code)
                            .collect::<Vec<_>>()
                            .join(","),
                    ));
                    continue;
                }
                let version_id = quotation.identity.version_id.clone();
                if let Some(existing) = state.versions.get(&version_id) {
                    if quotation_material_fingerprint(existing)
                        != quotation_material_fingerprint(&quotation)
                    {
                        state.diagnostics.push(diagnostic(
                            message,
                            "immutable_version_conflict",
                            format!("version {version_id} has conflicting payloads"),
                        ));
                    }
                    continue;
                }
                state.versions.insert(version_id, quotation);
            }
            QUOTATION_COMPARISON_KIND => {
                let Some(payload) = message.content.get("comparison") else {
                    state.diagnostics.push(diagnostic(
                        message,
                        "missing_comparison_payload",
                        "comparison event has no comparison payload",
                    ));
                    continue;
                };
                match serde_json::from_value::<QuotationComparison>(payload.clone()) {
                    Ok(comparison) => {
                        let comparison_id = comparison.comparison_id.clone();
                        if let Some(existing) = state.comparisons.get(&comparison_id) {
                            if existing != &comparison {
                                state.diagnostics.push(diagnostic(
                                    message,
                                    "immutable_comparison_conflict",
                                    format!("comparison {comparison_id} has conflicting payloads"),
                                ));
                            }
                        } else {
                            state
                                .comparison_message_ids
                                .insert(comparison_id.clone(), message.id.clone());
                            state.comparisons.insert(comparison_id, comparison);
                        }
                    }
                    Err(error) => state.diagnostics.push(diagnostic(
                        message,
                        "invalid_comparison_payload",
                        error.to_string(),
                    )),
                }
            }
            QUOTATION_VENDOR_SELECTED_KIND => {
                let Some(payload) = message.content.get("selection") else {
                    state.diagnostics.push(diagnostic(
                        message,
                        "missing_selection_payload",
                        "selection event has no selection payload",
                    ));
                    continue;
                };
                match serde_json::from_value::<QuotationSelection>(payload.clone()) {
                    Ok(selection) if validate_selection(&selection).is_ok() => {
                        if let Some(existing) = state.selections.get(&selection.selection_id) {
                            if existing != &selection {
                                state.diagnostics.push(diagnostic(
                                    message,
                                    "immutable_selection_conflict",
                                    format!(
                                        "selection {} has conflicting payloads",
                                        selection.selection_id
                                    ),
                                ));
                            }
                        } else {
                            state
                                .selections
                                .insert(selection.selection_id.clone(), selection);
                        }
                    }
                    _ => state.diagnostics.push(diagnostic(
                        message,
                        "invalid_selection_payload",
                        "selection payload is invalid",
                    )),
                }
            }
            QUOTATION_CLOSURE_TRANSITION_KIND => {
                let Some(payload) = message.content.get("transition") else {
                    state.diagnostics.push(diagnostic(
                        message,
                        "missing_closure_payload",
                        "closure event has no transition payload",
                    ));
                    continue;
                };
                match serde_json::from_value::<ClosureTransition>(payload.clone()) {
                    Ok(transition) => {
                        let requires_source =
                            !matches!(transition.target_state, super::ClosureState::Selected);
                        if requires_source
                            && transition.evidence_sources.iter().any(|source| {
                                !visible_message_ids.contains(source.source_id.as_str())
                            })
                        {
                            state.diagnostics.push(diagnostic(
                                message,
                                "closure_source_unavailable",
                                "closure evidence does not resolve in this thread",
                            ));
                            continue;
                        }
                        if let Some(existing) = state.closure_transitions.get(&transition.event_id)
                        {
                            if existing != &transition {
                                state.diagnostics.push(diagnostic(
                                    message,
                                    "immutable_closure_conflict",
                                    format!(
                                        "closure event {} has conflicting payloads",
                                        transition.event_id
                                    ),
                                ));
                            }
                        } else {
                            state
                                .closure_transitions
                                .insert(transition.event_id.clone(), transition);
                        }
                    }
                    Err(error) => state.diagnostics.push(diagnostic(
                        message,
                        "invalid_closure_payload",
                        error.to_string(),
                    )),
                }
            }
            _ => {}
        }
    }

    let superseded = state
        .versions
        .values()
        .filter_map(|quotation| quotation.identity.supersedes_version_id.clone())
        .collect::<BTreeSet<_>>();
    let mut candidates = BTreeMap::<String, Vec<String>>::new();
    for quotation in state.versions.values() {
        if superseded.contains(&quotation.identity.version_id)
            || matches!(
                quotation.lifecycle,
                QuoteLifecycle::Superseded | QuoteLifecycle::Declined | QuoteLifecycle::Expired
            )
        {
            continue;
        }
        candidates
            .entry(quotation.identity.quotation_id.clone())
            .or_default()
            .push(quotation.identity.version_id.clone());
    }
    for (quotation_id, mut version_ids) in candidates {
        version_ids.sort();
        if version_ids.len() > 1 {
            state.diagnostics.push(ReplayDiagnostic {
                message_id: quotation_id.clone(),
                code: "divergent_active_versions".to_string(),
                detail: version_ids.join(","),
            });
        }
        if let Some(version_id) = version_ids.pop() {
            state
                .active_version_by_quotation
                .insert(quotation_id, version_id);
        }
    }

    let active_versions = state
        .active_version_by_quotation
        .values()
        .map(String::as_str)
        .collect::<BTreeSet<_>>();
    for (comparison_id, comparison) in &state.comparisons {
        let all_active = !comparison.candidates.is_empty()
            && comparison
                .candidates
                .iter()
                .all(|candidate| active_versions.contains(candidate.version_id.as_str()));
        if all_active {
            state
                .active_comparisons
                .insert(comparison_id.clone(), comparison.clone());
        }
    }

    let superseded_selections = state
        .selections
        .values()
        .filter_map(|selection| selection.supersedes_selection_id.clone())
        .collect::<BTreeSet<_>>();
    let mut selection_candidates = BTreeMap::<String, Vec<QuotationSelection>>::new();
    for selection in state.selections.values() {
        if superseded_selections.contains(&selection.selection_id) {
            continue;
        }
        let valid_parent = selection
            .supersedes_selection_id
            .as_deref()
            .is_none_or(|previous| {
                state
                    .selections
                    .get(previous)
                    .is_some_and(|prior| prior.comparison_id == selection.comparison_id)
            });
        let valid_comparison = state
            .active_comparisons
            .get(&selection.comparison_id)
            .zip(state.comparison_message_ids.get(&selection.comparison_id))
            .is_some_and(|(comparison, revision)| {
                revision == &selection.comparison_revision
                    && comparison.candidates.iter().any(|candidate| {
                        candidate.quotation_id == selection.quotation_id
                            && candidate.version_id == selection.quotation_version_id
                            && candidate.vendor_id == selection.vendor_id
                            && candidate.disposition != CandidateDisposition::Excluded
                    })
            });
        if valid_parent && valid_comparison {
            selection_candidates
                .entry(selection.comparison_id.clone())
                .or_default()
                .push(selection.clone());
        }
    }
    for (comparison_id, mut candidates) in selection_candidates {
        candidates.sort_by(|left, right| left.selection_id.cmp(&right.selection_id));
        if candidates.len() == 1 {
            state
                .active_selections
                .insert(comparison_id, candidates.remove(0));
        } else {
            state.diagnostics.push(ReplayDiagnostic {
                message_id: comparison_id,
                code: "divergent_active_selections".to_string(),
                detail: candidates
                    .iter()
                    .map(|selection| selection.selection_id.as_str())
                    .collect::<Vec<_>>()
                    .join(","),
            });
        }
    }

    let mut closure_groups = BTreeMap::<String, Vec<ClosureTransition>>::new();
    for transition in state.closure_transitions.values() {
        closure_groups
            .entry(transition.quotation_version_id.clone())
            .or_default()
            .push(transition.clone());
    }
    for (version_id, transitions) in closure_groups {
        match replay_closure(&transitions) {
            Ok(Some(snapshot)) => {
                let quotation_id = snapshot.quotation_id.clone();
                let is_active_version = state.active_version_by_quotation.get(&quotation_id)
                    == Some(&snapshot.quotation_version_id);
                let has_active_selection = state.active_selections.values().any(|selection| {
                    selection.quotation_id == quotation_id
                        && selection.quotation_version_id == snapshot.quotation_version_id
                });
                if is_active_version && has_active_selection {
                    state.active_closures.insert(quotation_id, snapshot.clone());
                }
                state.closure_snapshots.insert(version_id, snapshot);
            }
            Ok(None) => {}
            Err(error) => state.diagnostics.push(ReplayDiagnostic {
                message_id: version_id,
                code: "closure_replay_failed".to_string(),
                detail: format!("{error:?}"),
            }),
        }
    }
    state.diagnostics.sort_by(|left, right| {
        left.message_id
            .cmp(&right.message_id)
            .then_with(|| left.code.cmp(&right.code))
            .then_with(|| left.detail.cmp(&right.detail))
    });
    state
}
