use std::collections::{BTreeMap, BTreeSet, VecDeque};

use chrono::{DateTime, Duration, SecondsFormat, Utc};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use super::{
    DurationRange, MILESTONE_SCHEMA_VERSION, MilestoneDependency, MilestoneState, PreparedAction,
    PreparedActionKind, validate_milestone,
};

pub const WEDDING_MILESTONE_TEMPLATE_VERSION: &str = "wedding.milestones.v1";
const NEAR_CRITICAL_DAYS: i32 = 14;

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MilestoneEvidenceSourceKind {
    Task,
    Calendar,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ObservedMilestoneState {
    NotStarted,
    Active,
    Blocked,
    Complete,
    Waived,
    Unknown,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct MilestoneEvidence {
    pub milestone_id: String,
    pub source_ref: String,
    pub source_revision_ref: String,
    pub source_kind: MilestoneEvidenceSourceKind,
    pub state: ObservedMilestoneState,
    pub manual_due_at: Option<String>,
    pub manual_date_source_ref: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct MilestoneDefinition {
    pub milestone_id: String,
    pub depends_on: Vec<String>,
    pub duration_or_lead_time: DurationRange,
    pub suggested_latest_offset_days: u32,
    pub prepared_next_action: Option<PreparedAction>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct MilestoneGraphInput {
    pub plan_id: String,
    pub anchor_at: String,
    pub horizon_at: Option<String>,
    pub definitions: Vec<MilestoneDefinition>,
    pub evidence: Vec<MilestoneEvidence>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MilestoneBlockerKind {
    HorizonMissing,
    Cycle,
    PredecessorMissing,
    PredecessorBlocked,
    SourceStateUnresolved,
    EvidenceConflict,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct MilestoneBlocker {
    pub blocker_ref: String,
    pub milestone_id: String,
    pub kind: MilestoneBlockerKind,
    pub source_refs: Vec<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MilestoneDateAuthority {
    ComputedTemplate,
    Manual,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct MilestoneDateProvenance {
    pub authority: MilestoneDateAuthority,
    pub source_ref: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PathUrgency {
    Critical,
    NearCritical,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct MilestoneProjectionItem {
    pub dependency: MilestoneDependency,
    pub date_provenance: Option<MilestoneDateProvenance>,
    pub evidence_refs: Vec<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SelectedPathItem {
    pub milestone_id: String,
    pub urgency: PathUrgency,
    pub slack_days: i32,
    pub prepared_next_action: Option<PreparedAction>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct MilestonePlanProjection {
    pub projection_id: String,
    pub template_version: String,
    pub plan_id: String,
    pub milestones: Vec<MilestoneProjectionItem>,
    pub blockers: Vec<MilestoneBlocker>,
    pub selected_path_item: Option<SelectedPathItem>,
}

pub fn wedding_milestone_graph_input(
    plan_id: &str,
    anchor_at: &str,
    event_at: Option<&str>,
    evidence: Vec<MilestoneEvidence>,
) -> MilestoneGraphInput {
    let id = |key: &str| format!("milestone:{plan_id}:{key}");
    let definition = |key: &str,
                      dependencies: &[&str],
                      minimum_days: u32,
                      maximum_days: u32,
                      latest_before_event_days: u32,
                      action: Option<(PreparedActionKind, &str)>| {
        MilestoneDefinition {
            milestone_id: id(key),
            depends_on: dependencies
                .iter()
                .map(|dependency| id(dependency))
                .collect(),
            duration_or_lead_time: DurationRange {
                minimum_days,
                maximum_days,
                evidence_ref: format!("template:{WEDDING_MILESTONE_TEMPLATE_VERSION}:{key}"),
            },
            suggested_latest_offset_days: latest_before_event_days,
            prepared_next_action: action.map(|(kind, target)| PreparedAction {
                kind,
                target_ref: target.to_string(),
            }),
        }
    };
    MilestoneGraphInput {
        plan_id: plan_id.to_string(),
        anchor_at: anchor_at.to_string(),
        horizon_at: event_at.map(str::to_string),
        definitions: vec![
            definition("guest_count_draft", &[], 3, 7, 210, None),
            definition(
                "accommodation_blocks",
                &["guest_count_draft"],
                7,
                14,
                180,
                Some((PreparedActionKind::Research, "vendor_search:accommodation")),
            ),
            definition("stationery_details", &[], 3, 7, 150, None),
            definition(
                "invitations_ready",
                &[
                    "guest_count_draft",
                    "accommodation_blocks",
                    "stationery_details",
                ],
                7,
                14,
                135,
                Some((PreparedActionKind::Compare, "vendor_search:stationery")),
            ),
            definition("invitations_sent", &["invitations_ready"], 1, 3, 120, None),
            definition("guest_count_final", &["invitations_sent"], 30, 70, 35, None),
            definition(
                "vendor_final_counts",
                &["guest_count_final"],
                3,
                7,
                14,
                Some((
                    PreparedActionKind::Compare,
                    "vendor_search:contracted_vendors",
                )),
            ),
            definition("event_ready", &["vendor_final_counts"], 7, 14, 0, None),
        ],
        evidence,
    }
}

pub fn project_wedding_milestones(
    plan_id: &str,
    anchor_at: &str,
    event_at: Option<&str>,
    evidence: Vec<MilestoneEvidence>,
) -> Result<MilestonePlanProjection, String> {
    project_milestone_graph(
        WEDDING_MILESTONE_TEMPLATE_VERSION,
        &wedding_milestone_graph_input(plan_id, anchor_at, event_at, evidence),
    )
}

pub fn project_milestone_graph(
    template_version: &str,
    input: &MilestoneGraphInput,
) -> Result<MilestonePlanProjection, String> {
    required_identifier(template_version, "template_version")?;
    required_identifier(&input.plan_id, "plan_id")?;
    let anchor = parsed_time(&input.anchor_at, "anchor_at")?;
    let horizon = input
        .horizon_at
        .as_deref()
        .map(|value| parsed_time(value, "horizon_at"))
        .transpose()?;
    if horizon.is_some_and(|value| value < anchor) {
        return Err("horizon_at cannot precede anchor_at".to_string());
    }
    let definitions = validated_definitions(&input.definitions)?;
    let evidence = grouped_evidence(&input.evidence)?;
    if let Some(unknown_id) = evidence.keys().find(|id| !definitions.contains_key(*id)) {
        return Err(format!(
            "evidence references unknown milestone: {unknown_id}"
        ));
    }
    let mut blockers = Vec::new();
    let missing = missing_predecessors(&definitions);
    for (milestone_id, predecessor_id) in &missing {
        blockers.push(blocker(
            milestone_id,
            MilestoneBlockerKind::PredecessorMissing,
            &[predecessor_id.clone()],
        ));
    }
    let cycle_ids = cycle_members(&definitions);
    for milestone_id in &cycle_ids {
        blockers.push(blocker(
            milestone_id,
            MilestoneBlockerKind::Cycle,
            &cycle_ids.iter().cloned().collect::<Vec<_>>(),
        ));
    }
    if horizon.is_none() {
        for milestone_id in definitions.keys() {
            blockers.push(blocker(
                milestone_id,
                MilestoneBlockerKind::HorizonMissing,
                &[],
            ));
        }
    }
    for (milestone_id, records) in &evidence {
        if records.len() > 1 {
            blockers.push(blocker(
                milestone_id,
                MilestoneBlockerKind::EvidenceConflict,
                &records
                    .iter()
                    .map(|value| value.source_ref.clone())
                    .collect::<Vec<_>>(),
            ));
        } else if records[0].state == ObservedMilestoneState::Unknown {
            blockers.push(blocker(
                milestone_id,
                MilestoneBlockerKind::SourceStateUnresolved,
                &[records[0].source_ref.clone()],
            ));
        }
    }
    propagate_blocked_predecessors(&definitions, &evidence, &mut blockers);
    sort_blockers(&mut blockers);

    let topological = topological_order(&definitions);
    let earliest = earliest_finishes(&definitions, &evidence, &blockers, &topological, anchor)?;
    let latest = latest_finishes(
        template_version,
        &definitions,
        &evidence,
        &blockers,
        &topological,
        horizon,
    )?;
    let blocker_refs = blockers_by_milestone(&blockers);
    let mut milestones = Vec::new();
    for (milestone_id, definition) in &definitions {
        let records = evidence.get(milestone_id).cloned().unwrap_or_default();
        let evidence_refs = records
            .iter()
            .flat_map(|value| [value.source_ref.clone(), value.source_revision_ref.clone()])
            .collect::<BTreeSet<_>>()
            .into_iter()
            .collect::<Vec<_>>();
        let source_state = (records.len() == 1).then(|| &records[0].state);
        let terminal = matches!(
            source_state,
            Some(ObservedMilestoneState::Complete | ObservedMilestoneState::Waived)
        );
        let refs = blocker_refs.get(milestone_id).cloned().unwrap_or_default();
        let state = if terminal {
            match source_state {
                Some(ObservedMilestoneState::Waived) => MilestoneState::Waived,
                _ => MilestoneState::Complete,
            }
        } else if !refs.is_empty()
            || matches!(
                source_state,
                Some(ObservedMilestoneState::Blocked | ObservedMilestoneState::Unknown)
            )
        {
            MilestoneState::Blocked
        } else if matches!(source_state, Some(ObservedMilestoneState::Active)) {
            MilestoneState::Active
        } else {
            MilestoneState::NotStarted
        };
        let earliest_at = earliest.get(milestone_id).copied();
        let (latest_at, provenance) = latest.get(milestone_id).cloned().unwrap_or((None, None));
        let slack_days = if terminal || state == MilestoneState::Blocked {
            None
        } else {
            earliest_at
                .zip(latest_at)
                .map(|(early, late)| bounded_days(late.signed_duration_since(early).num_days()))
        };
        let dependency = MilestoneDependency {
            schema_version: MILESTONE_SCHEMA_VERSION.to_string(),
            milestone_id: milestone_id.clone(),
            plan_id: input.plan_id.clone(),
            depends_on: definition.depends_on.clone(),
            duration_or_lead_time: Some(definition.duration_or_lead_time.clone()),
            earliest_at: earliest_at.map(formatted_time),
            latest_at: latest_at.map(formatted_time),
            slack_days,
            state,
            blocking_refs: refs,
            prepared_next_action: None,
        };
        validate_milestone(&dependency)?;
        milestones.push(MilestoneProjectionItem {
            dependency,
            date_provenance: provenance,
            evidence_refs,
        });
    }
    let selected_path_item = select_path_item(&definitions, &mut milestones);
    let projection_id = stable_id(
        "milestone_projection",
        &serde_json::json!({
            "template_version": template_version,
            "plan_id": input.plan_id,
            "anchor_at": input.anchor_at,
            "horizon_at": input.horizon_at,
            "milestones": milestones,
            "blockers": blockers,
        }),
    );
    Ok(MilestonePlanProjection {
        projection_id,
        template_version: template_version.to_string(),
        plan_id: input.plan_id.clone(),
        milestones,
        blockers,
        selected_path_item,
    })
}

fn validated_definitions(
    values: &[MilestoneDefinition],
) -> Result<BTreeMap<String, MilestoneDefinition>, String> {
    if values.is_empty() || values.len() > 100 {
        return Err("definitions must contain 1 to 100 milestones".to_string());
    }
    let mut definitions = BTreeMap::new();
    for value in values {
        required_identifier(&value.milestone_id, "milestone_id")?;
        if value.depends_on.len() > 100
            || value
                .depends_on
                .iter()
                .any(|dependency| dependency == &value.milestone_id)
            || value.duration_or_lead_time.minimum_days > value.duration_or_lead_time.maximum_days
            || value.duration_or_lead_time.maximum_days > 3_650
        {
            return Err(format!(
                "invalid milestone definition: {}",
                value.milestone_id
            ));
        }
        required_identifier(&value.duration_or_lead_time.evidence_ref, "evidence_ref")?;
        if definitions
            .insert(value.milestone_id.clone(), value.clone())
            .is_some()
        {
            return Err(format!(
                "duplicate milestone definition: {}",
                value.milestone_id
            ));
        }
    }
    Ok(definitions)
}

fn grouped_evidence(
    values: &[MilestoneEvidence],
) -> Result<BTreeMap<String, Vec<MilestoneEvidence>>, String> {
    let mut grouped = BTreeMap::<String, Vec<MilestoneEvidence>>::new();
    for value in values {
        for (field, id) in [
            ("milestone_id", &value.milestone_id),
            ("source_ref", &value.source_ref),
            ("source_revision_ref", &value.source_revision_ref),
        ] {
            required_identifier(id, field)?;
        }
        match (&value.manual_due_at, &value.manual_date_source_ref) {
            (Some(date), Some(source)) => {
                parsed_time(date, "manual_due_at")?;
                required_identifier(source, "manual_date_source_ref")?;
            }
            (None, None) => {}
            _ => return Err("manual date requires its exact source reference".to_string()),
        }
        grouped
            .entry(value.milestone_id.clone())
            .or_default()
            .push(value.clone());
    }
    Ok(grouped)
}

fn missing_predecessors(
    definitions: &BTreeMap<String, MilestoneDefinition>,
) -> Vec<(String, String)> {
    definitions
        .values()
        .flat_map(|value| {
            value.depends_on.iter().filter_map(|dependency| {
                (!definitions.contains_key(dependency))
                    .then(|| (value.milestone_id.clone(), dependency.clone()))
            })
        })
        .collect()
}

fn cycle_members(definitions: &BTreeMap<String, MilestoneDefinition>) -> BTreeSet<String> {
    definitions
        .keys()
        .filter(|id| {
            definitions[*id].depends_on.iter().any(|dependency| {
                dependency_reaches(dependency, id, definitions, &mut BTreeSet::new())
            })
        })
        .cloned()
        .collect()
}

fn dependency_reaches(
    current: &str,
    target: &str,
    definitions: &BTreeMap<String, MilestoneDefinition>,
    visited: &mut BTreeSet<String>,
) -> bool {
    if current == target {
        return true;
    }
    if !visited.insert(current.to_string()) {
        return false;
    }
    definitions.get(current).is_some_and(|definition| {
        definition
            .depends_on
            .iter()
            .any(|dependency| dependency_reaches(dependency, target, definitions, visited))
    })
}

fn topological_order(definitions: &BTreeMap<String, MilestoneDefinition>) -> Vec<String> {
    let mut indegree = definitions
        .iter()
        .map(|(id, value)| {
            (
                id.clone(),
                value
                    .depends_on
                    .iter()
                    .filter(|dependency| definitions.contains_key(*dependency))
                    .count(),
            )
        })
        .collect::<BTreeMap<_, _>>();
    let mut ready = indegree
        .iter()
        .filter_map(|(id, count)| (*count == 0).then_some(id.clone()))
        .collect::<VecDeque<_>>();
    let mut order = Vec::new();
    while let Some(id) = ready.pop_front() {
        order.push(id.clone());
        for successor in definitions
            .values()
            .filter(|value| value.depends_on.contains(&id))
        {
            let count = indegree
                .get_mut(&successor.milestone_id)
                .expect("known definition");
            *count -= 1;
            if *count == 0 {
                ready.push_back(successor.milestone_id.clone());
            }
        }
    }
    order
}

fn propagate_blocked_predecessors(
    definitions: &BTreeMap<String, MilestoneDefinition>,
    evidence: &BTreeMap<String, Vec<MilestoneEvidence>>,
    blockers: &mut Vec<MilestoneBlocker>,
) {
    let mut blocked = blockers
        .iter()
        .map(|value| value.milestone_id.clone())
        .collect::<BTreeSet<_>>();
    blocked.extend(evidence.iter().filter_map(|(id, values)| {
        values.first().and_then(|value| {
            matches!(
                value.state,
                ObservedMilestoneState::Blocked | ObservedMilestoneState::Unknown
            )
            .then_some(id.clone())
        })
    }));
    loop {
        let mut changed = false;
        for definition in definitions.values() {
            if blocked.contains(&definition.milestone_id) {
                continue;
            }
            let blocked_dependencies = definition
                .depends_on
                .iter()
                .filter(|id| blocked.contains(*id))
                .cloned()
                .collect::<Vec<_>>();
            if !blocked_dependencies.is_empty() {
                blockers.push(blocker(
                    &definition.milestone_id,
                    MilestoneBlockerKind::PredecessorBlocked,
                    &blocked_dependencies,
                ));
                blocked.insert(definition.milestone_id.clone());
                changed = true;
            }
        }
        if !changed {
            break;
        }
    }
}

fn earliest_finishes(
    definitions: &BTreeMap<String, MilestoneDefinition>,
    evidence: &BTreeMap<String, Vec<MilestoneEvidence>>,
    blockers: &[MilestoneBlocker],
    order: &[String],
    anchor: DateTime<Utc>,
) -> Result<BTreeMap<String, DateTime<Utc>>, String> {
    let blocked = blockers
        .iter()
        .map(|value| value.milestone_id.as_str())
        .collect::<BTreeSet<_>>();
    let terminal = terminal_ids(evidence);
    let mut result: BTreeMap<String, DateTime<Utc>> = BTreeMap::new();
    for id in order {
        if blocked.contains(id.as_str()) || terminal.contains(id) {
            continue;
        }
        let definition = &definitions[id];
        let start = definition
            .depends_on
            .iter()
            .filter(|dependency| !terminal.contains(*dependency))
            .filter_map(|dependency| result.get(dependency))
            .max()
            .copied()
            .unwrap_or(anchor);
        let finish = start
            .checked_add_signed(Duration::days(i64::from(
                definition.duration_or_lead_time.maximum_days,
            )))
            .ok_or_else(|| "earliest date overflow".to_string())?;
        result.insert(id.clone(), finish);
    }
    Ok(result)
}

fn latest_finishes(
    template_version: &str,
    definitions: &BTreeMap<String, MilestoneDefinition>,
    evidence: &BTreeMap<String, Vec<MilestoneEvidence>>,
    blockers: &[MilestoneBlocker],
    order: &[String],
    horizon: Option<DateTime<Utc>>,
) -> Result<BTreeMap<String, (Option<DateTime<Utc>>, Option<MilestoneDateProvenance>)>, String> {
    let Some(horizon) = horizon else {
        return Ok(BTreeMap::new());
    };
    let blocked = blockers
        .iter()
        .map(|value| value.milestone_id.as_str())
        .collect::<BTreeSet<_>>();
    let terminal = terminal_ids(evidence);
    let mut result: BTreeMap<String, (Option<DateTime<Utc>>, Option<MilestoneDateProvenance>)> =
        BTreeMap::new();
    for id in order.iter().rev() {
        if blocked.contains(id.as_str()) || terminal.contains(id) {
            continue;
        }
        let definition = &definitions[id];
        let record = evidence.get(id).and_then(|records| records.first());
        let manual = record.and_then(|record| {
            record
                .manual_due_at
                .as_deref()
                .zip(record.manual_date_source_ref.as_deref())
        });
        let (own_latest, provenance) = if let Some((date, source_ref)) = manual {
            (
                parsed_time(date, "manual_due_at")?,
                MilestoneDateProvenance {
                    authority: MilestoneDateAuthority::Manual,
                    source_ref: source_ref.to_string(),
                },
            )
        } else {
            (
                horizon
                    .checked_sub_signed(Duration::days(i64::from(
                        definition.suggested_latest_offset_days,
                    )))
                    .ok_or_else(|| "latest date overflow".to_string())?,
                MilestoneDateProvenance {
                    authority: MilestoneDateAuthority::ComputedTemplate,
                    source_ref: format!(
                        "template:{template_version}:{}",
                        id.rsplit(':').next().unwrap_or(id)
                    ),
                },
            )
        };
        let successor_limit = definitions
            .values()
            .filter(|value| value.depends_on.contains(id))
            .filter(|value| !terminal.contains(&value.milestone_id))
            .filter_map(|successor| {
                result.get(&successor.milestone_id).and_then(|(latest, _)| {
                    latest.map(|date| {
                        date - Duration::days(i64::from(
                            successor.duration_or_lead_time.maximum_days,
                        ))
                    })
                })
            })
            .min();
        result.insert(
            id.clone(),
            (
                Some(successor_limit.map_or(own_latest, |limit| own_latest.min(limit))),
                Some(provenance),
            ),
        );
    }
    Ok(result)
}

fn terminal_ids(evidence: &BTreeMap<String, Vec<MilestoneEvidence>>) -> BTreeSet<String> {
    evidence
        .iter()
        .filter_map(|(id, records)| {
            (records.len() == 1)
                .then(|| &records[0])
                .and_then(|record| {
                    matches!(
                        record.state,
                        ObservedMilestoneState::Complete | ObservedMilestoneState::Waived
                    )
                    .then_some(id.clone())
                })
        })
        .collect()
}

fn blockers_by_milestone(blockers: &[MilestoneBlocker]) -> BTreeMap<String, Vec<String>> {
    let mut result = BTreeMap::<String, Vec<String>>::new();
    for blocker in blockers {
        result
            .entry(blocker.milestone_id.clone())
            .or_default()
            .push(blocker.blocker_ref.clone());
    }
    for refs in result.values_mut() {
        refs.sort();
        refs.dedup();
    }
    result
}

fn select_path_item(
    definitions: &BTreeMap<String, MilestoneDefinition>,
    milestones: &mut [MilestoneProjectionItem],
) -> Option<SelectedPathItem> {
    let candidates = milestones
        .iter()
        .filter_map(|item| {
            item.dependency
                .slack_days
                .map(|slack| (item.dependency.milestone_id.clone(), slack))
        })
        .filter(|(_, slack)| *slack <= NEAR_CRITICAL_DAYS)
        .collect::<Vec<_>>();
    let selected = candidates
        .iter()
        .filter(|(id, _)| {
            definitions
                .get(id)
                .is_some_and(|value| value.prepared_next_action.is_some())
        })
        .min_by(|left, right| left.1.cmp(&right.1).then_with(|| left.0.cmp(&right.0)))
        .or_else(|| {
            candidates
                .iter()
                .min_by(|left, right| left.1.cmp(&right.1).then_with(|| left.0.cmp(&right.0)))
        })?
        .clone();
    let action = definitions
        .get(&selected.0)
        .and_then(|value| value.prepared_next_action.clone());
    if let Some(item) = milestones
        .iter_mut()
        .find(|item| item.dependency.milestone_id == selected.0)
    {
        item.dependency.prepared_next_action = action.clone();
    }
    Some(SelectedPathItem {
        milestone_id: selected.0,
        urgency: if selected.1 <= 0 {
            PathUrgency::Critical
        } else {
            PathUrgency::NearCritical
        },
        slack_days: selected.1,
        prepared_next_action: action,
    })
}

fn blocker(
    milestone_id: &str,
    kind: MilestoneBlockerKind,
    source_refs: &[String],
) -> MilestoneBlocker {
    let mut sources = source_refs.to_vec();
    sources.sort();
    sources.dedup();
    let blocker_ref = stable_id(
        "milestone_blocker",
        &serde_json::json!({ "milestone_id": milestone_id, "kind": kind, "source_refs": sources }),
    );
    MilestoneBlocker {
        blocker_ref,
        milestone_id: milestone_id.to_string(),
        kind,
        source_refs: sources,
    }
}

fn sort_blockers(values: &mut Vec<MilestoneBlocker>) {
    values.sort_by(|left, right| {
        left.milestone_id
            .cmp(&right.milestone_id)
            .then_with(|| left.blocker_ref.cmp(&right.blocker_ref))
    });
    values.dedup_by(|left, right| left.blocker_ref == right.blocker_ref);
}

fn parsed_time(value: &str, field: &str) -> Result<DateTime<Utc>, String> {
    DateTime::parse_from_rfc3339(value)
        .map(|value| value.with_timezone(&Utc))
        .map_err(|_| format!("{field} must be RFC3339"))
}

fn formatted_time(value: DateTime<Utc>) -> String {
    value.to_rfc3339_opts(SecondsFormat::Secs, true)
}

fn bounded_days(value: i64) -> i32 {
    value.clamp(i64::from(i32::MIN), i64::from(i32::MAX)) as i32
}

fn required_identifier(value: &str, field: &str) -> Result<(), String> {
    if value.is_empty()
        || value.len() > 180
        || value.chars().any(char::is_whitespace)
        || value.contains('@')
    {
        return Err(format!("{field} must be a bounded identifier"));
    }
    Ok(())
}

fn stable_id(prefix: &str, value: &serde_json::Value) -> String {
    let canonical = crate::crypto::canonical_json_string(value);
    let digest = hex::encode(Sha256::digest(canonical.as_bytes()));
    format!("{prefix}:{}", &digest[..24])
}
