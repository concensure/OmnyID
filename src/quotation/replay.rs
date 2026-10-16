use super::{
    afp::{CORRECTED_QUOTATION_KIND, NORMALISED_QUOTATION_KIND, QUOTATION_COMPARISON_KIND},
    contracts::{
        NormalisedQuotation, QuotationComparison, QuoteLifecycle, quotation_material_fingerprint,
    },
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
    pub active_comparisons: BTreeMap<String, QuotationComparison>,
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
                        state
                            .comparisons
                            .entry(comparison.comparison_id.clone())
                            .or_insert(comparison);
                    }
                    Err(error) => state.diagnostics.push(diagnostic(
                        message,
                        "invalid_comparison_payload",
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
    state.diagnostics.sort_by(|left, right| {
        left.message_id
            .cmp(&right.message_id)
            .then_with(|| left.code.cmp(&right.code))
            .then_with(|| left.detail.cmp(&right.detail))
    });
    state
}
