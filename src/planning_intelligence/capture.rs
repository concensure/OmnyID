use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use super::{
    CONSTRAINT_SCHEMA_VERSION, ConstraintAuthority, ConstraintKind, ConstraintOperator,
    ConstraintPrivacy, ConstraintStatus, ConstraintStrength, ConstraintValue, PlanningConstraint,
    SourceAnchor, SubjectKind, SubjectReference, validate_constraint,
};

const MAX_REMARK_CHARS: usize = 2_000;
const MAX_PROPOSALS: usize = 4;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum CaptureMethod {
    Deterministic,
    Assisted,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ConstraintCaptureCandidate {
    pub kind: ConstraintKind,
    pub operator: ConstraintOperator,
    pub value: ConstraintValue,
    pub strength: ConstraintStrength,
    pub exact_excerpt: String,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum CaptureResolution {
    Candidates(Vec<ConstraintCaptureCandidate>),
    Clarification(String),
    Unsupported,
    NoMatch,
}

#[derive(Clone, Debug)]
pub struct CaptureProposalContext {
    pub template_id: String,
    pub plan_id: String,
    pub subject_ref: SubjectReference,
    pub source_message_id: String,
    pub source_version_id: Option<String>,
    pub locator: String,
    pub observed_at: String,
    pub method: CaptureMethod,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct AssistedPayload {
    #[serde(default)]
    proposals: Vec<ConstraintCaptureCandidate>,
    clarifying_question: Option<String>,
}

pub fn deterministic_capture(remark: &str) -> CaptureResolution {
    let remark = remark.trim();
    if remark.is_empty() || remark.chars().count() > MAX_REMARK_CHARS {
        return CaptureResolution::Unsupported;
    }
    if contains_injection_language(remark) {
        return CaptureResolution::Unsupported;
    }
    if contains_ambiguity(remark) {
        return CaptureResolution::Clarification(
            "Should this be a must-have, a strong preference, or just something to explore?"
                .to_string(),
        );
    }

    let mut candidates = Vec::new();
    capture_accessibility(remark, &mut candidates);
    capture_location(remark, &mut candidates);
    capture_numeric_limits(remark, &mut candidates);
    capture_dietary_and_alcohol(remark, &mut candidates);
    capture_relationships(remark, &mut candidates);
    capture_aesthetics(remark, &mut candidates);
    capture_category_priority(remark, &mut candidates);
    dedupe_candidates(&mut candidates);

    if candidates.len() > MAX_PROPOSALS {
        return CaptureResolution::Clarification(
            "There are several details here. Which one should I remember first?".to_string(),
        );
    }
    if !candidates.is_empty() {
        return CaptureResolution::Candidates(candidates);
    }
    if contains_sensitive_unstructured_detail(remark) {
        CaptureResolution::Unsupported
    } else {
        CaptureResolution::NoMatch
    }
}

pub fn parse_assisted_capture(raw: &str, remark: &str) -> Result<CaptureResolution, String> {
    if contains_injection_language(remark) || contains_sensitive_unstructured_detail(remark) {
        return Err("remark is outside assisted capture policy".to_string());
    }
    let cleaned = raw
        .trim()
        .trim_start_matches("```json")
        .trim_start_matches("```")
        .trim_end_matches("```")
        .trim();
    let payload: AssistedPayload =
        serde_json::from_str(cleaned).map_err(|error| format!("invalid capture JSON: {error}"))?;
    if payload.proposals.len() > MAX_PROPOSALS {
        return Err("too many capture proposals".to_string());
    }
    if !payload.proposals.is_empty() && payload.clarifying_question.is_some() {
        return Err("capture output cannot mix proposals and clarification".to_string());
    }
    if !payload.proposals.is_empty() {
        for candidate in &payload.proposals {
            validate_capture_candidate(candidate, remark)?;
        }
        return Ok(CaptureResolution::Candidates(payload.proposals));
    }
    if let Some(question) = payload.clarifying_question {
        let question = question.trim();
        if question.is_empty() || question.chars().count() > 240 {
            return Err("clarifying question is invalid".to_string());
        }
        if contains_injection_language(question) || contains_technical_language(question) {
            return Err("clarifying question is not user-safe".to_string());
        }
        return Ok(CaptureResolution::Clarification(question.to_string()));
    }
    Err("capture output contains no usable result".to_string())
}

pub fn proposal_from_candidate(
    candidate: &ConstraintCaptureCandidate,
    context: &CaptureProposalContext,
) -> Result<PlanningConstraint, String> {
    validate_capture_candidate(candidate, &candidate.exact_excerpt)?;
    let canonical = crate::crypto::canonical_json_string(&serde_json::json!({
        "candidate": candidate,
        "plan_id": context.plan_id,
        "source_message_id": context.source_message_id,
        "source_version_id": context.source_version_id,
    }));
    let digest = hex::encode(Sha256::digest(canonical.as_bytes()));
    let constraint = PlanningConstraint {
        schema_version: CONSTRAINT_SCHEMA_VERSION.to_string(),
        constraint_id: format!("constraint:capture:{}", &digest[..32]),
        template_id: context.template_id.clone(),
        plan_id: context.plan_id.clone(),
        subject_ref: context.subject_ref.clone(),
        kind: candidate.kind.clone(),
        operator: candidate.operator.clone(),
        value: candidate.value.clone(),
        strength: candidate.strength.clone(),
        authority: match context.method {
            CaptureMethod::Deterministic => ConstraintAuthority::Deterministic,
            CaptureMethod::Assisted => ConstraintAuthority::Imported,
        },
        privacy: privacy_for_candidate(candidate),
        source_ref: context.source_message_id.clone(),
        source_anchor: SourceAnchor {
            message_id: context.source_message_id.clone(),
            source_version_id: context.source_version_id.clone(),
            locator: context.locator.clone(),
            exact_excerpt: candidate.exact_excerpt.clone(),
        },
        observed_at: context.observed_at.clone(),
        effective_window: None,
        status: ConstraintStatus::Proposed,
        supersedes: None,
    };
    validate_constraint(&constraint)?;
    Ok(constraint)
}

pub fn capture_candidate_label(candidate: &ConstraintCaptureCandidate) -> String {
    match (&candidate.kind, &candidate.value) {
        (ConstraintKind::AccessibilityRequirement, _) => "Step-free access".to_string(),
        (ConstraintKind::LocationRequirement, ConstraintValue::Enum { value, .. })
            if value == "same_venue" =>
        {
            "Ceremony and reception together".to_string()
        }
        (ConstraintKind::LocationRequirement, _) => "Avoid travel between locations".to_string(),
        (ConstraintKind::DistanceLimit, ConstraintValue::Integer { value, unit }) => {
            format!(
                "Travel limit: {value} {}",
                unit.as_deref().unwrap_or("units")
            )
        }
        (ConstraintKind::DurationLimit, ConstraintValue::Integer { value, unit }) => {
            format!(
                "Duration limit: {value} {}",
                unit.as_deref().unwrap_or("units")
            )
        }
        (ConstraintKind::DimensionLimit, ConstraintValue::Integer { value, unit }) => {
            format!("Size limit: {value} {}", unit.as_deref().unwrap_or("units"))
        }
        (ConstraintKind::DietaryRequirement, ConstraintValue::Enum { value, .. }) => {
            format!("{} catering", human_token(value))
        }
        (ConstraintKind::ServiceRequirement, ConstraintValue::Enum { value, .. }) => {
            human_token(value)
        }
        (ConstraintKind::RelationshipSeparation, _) => "Keep these guests apart".to_string(),
        (ConstraintKind::AttendanceRequirement, _) => "Attendance requirement".to_string(),
        (ConstraintKind::AestheticPreference, ConstraintValue::Enum { value, .. }) => {
            format!("{} look and feel", human_token(value))
        }
        (ConstraintKind::CategoryPriority, ConstraintValue::EnumList { values, .. }) => {
            format!(
                "Prioritise {} over {}",
                human_token(&values[0]),
                human_token(&values[1])
            )
        }
        _ => "Planning preference".to_string(),
    }
}

fn human_token(value: &str) -> String {
    let mut value = value.replace('_', " ");
    if let Some(first) = value.get_mut(0..1) {
        first.make_ascii_uppercase();
    }
    value
}

pub(super) fn privacy_for_candidate(candidate: &ConstraintCaptureCandidate) -> ConstraintPrivacy {
    if matches!(
        candidate.kind,
        ConstraintKind::RelationshipSeparation | ConstraintKind::AttendanceRequirement
    ) {
        ConstraintPrivacy::CouplePrivate
    } else {
        ConstraintPrivacy::PlanPrivate
    }
}

pub(super) fn validate_capture_candidate(
    candidate: &ConstraintCaptureCandidate,
    remark: &str,
) -> Result<(), String> {
    if candidate.exact_excerpt.trim().is_empty()
        || candidate.exact_excerpt.chars().count() > MAX_REMARK_CHARS
        || !remark.contains(&candidate.exact_excerpt)
    {
        return Err("capture proposal is not exactly anchored".to_string());
    }
    let valid = match (&candidate.kind, &candidate.operator, &candidate.value) {
        (
            ConstraintKind::AccessibilityRequirement,
            ConstraintOperator::Requires,
            ConstraintValue::Boolean { value },
        ) => *value,
        (
            ConstraintKind::LocationRequirement,
            operator,
            ConstraintValue::Enum { value, vocabulary },
        ) => {
            matches!(
                operator,
                ConstraintOperator::Requires | ConstraintOperator::Excludes
            ) && vocabulary == "planning.location.v1"
                && matches!(value.as_str(), "same_venue" | "inter_event_travel")
        }
        (
            ConstraintKind::DistanceLimit,
            ConstraintOperator::Limits,
            ConstraintValue::Integer { value, unit },
        ) => {
            (1..=1_000).contains(value) && matches!(unit.as_deref(), Some("minutes" | "kilometres"))
        }
        (
            ConstraintKind::DurationLimit,
            ConstraintOperator::Limits,
            ConstraintValue::Integer { value, unit },
        ) => (1..=1_440).contains(value) && matches!(unit.as_deref(), Some("minutes" | "hours")),
        (
            ConstraintKind::DimensionLimit,
            ConstraintOperator::Limits,
            ConstraintValue::Integer { value, unit },
        ) => {
            (1..=10_000).contains(value)
                && matches!(unit.as_deref(), Some("centimetres" | "metres"))
        }
        (
            ConstraintKind::DietaryRequirement,
            ConstraintOperator::Requires,
            ConstraintValue::Enum { value, vocabulary },
        ) => {
            vocabulary == "planning.dietary.v1"
                && matches!(
                    value.as_str(),
                    "vegan"
                        | "vegetarian"
                        | "halal"
                        | "kosher"
                        | "gluten_free"
                        | "nut_free"
                        | "dairy_free"
                )
        }
        (
            ConstraintKind::ServiceRequirement,
            operator,
            ConstraintValue::Enum { value, vocabulary },
        ) => {
            vocabulary == "planning.service.v1"
                && matches!(
                    operator,
                    ConstraintOperator::Requires | ConstraintOperator::Excludes
                )
                && matches!(value.as_str(), "alcohol_free" | "byo_alcohol")
        }
        (
            ConstraintKind::RelationshipSeparation,
            ConstraintOperator::Separates,
            ConstraintValue::ReferenceList { values },
        ) => values.len() == 2 && values.iter().all(|value| value.kind == SubjectKind::Person),
        (
            ConstraintKind::AttendanceRequirement,
            ConstraintOperator::Relates,
            ConstraintValue::Reference { value },
        ) => value.kind == SubjectKind::Person,
        (
            ConstraintKind::AestheticPreference,
            ConstraintOperator::Prefers,
            ConstraintValue::Enum { value, vocabulary },
        ) => vocabulary == "planning.aesthetic.v1" && AESTHETIC_VALUES.contains(&value.as_str()),
        (
            ConstraintKind::CategoryPriority,
            ConstraintOperator::Prefers,
            ConstraintValue::EnumList { values, vocabulary },
        ) => {
            vocabulary == "planning.category_priority.v1"
                && values.len() == 2
                && values[0] != values[1]
                && values
                    .iter()
                    .all(|value| CATEGORY_VALUES.contains(&value.as_str()))
        }
        _ => false,
    };
    valid
        .then_some(())
        .ok_or_else(|| "capture proposal uses an unsupported kind/value combination".to_string())
}

fn candidate(
    kind: ConstraintKind,
    operator: ConstraintOperator,
    value: ConstraintValue,
    strength: ConstraintStrength,
    exact_excerpt: &str,
) -> ConstraintCaptureCandidate {
    ConstraintCaptureCandidate {
        kind,
        operator,
        value,
        strength,
        exact_excerpt: exact_excerpt.to_string(),
    }
}

fn strength_for(remark: &str, default: ConstraintStrength) -> ConstraintStrength {
    let lower = remark.to_ascii_lowercase();
    if ["must", "need", "cannot", "can't", "no ", "required"]
        .iter()
        .any(|term| lower.contains(term))
    {
        ConstraintStrength::Hard
    } else {
        default
    }
}

fn capture_accessibility(remark: &str, output: &mut Vec<ConstraintCaptureCandidate>) {
    if let Some(anchor) = first_phrase(
        remark,
        &[
            "step-free",
            "step free",
            "wheelchair accessible",
            "accessible entrance",
            "no stairs",
        ],
    ) {
        output.push(candidate(
            ConstraintKind::AccessibilityRequirement,
            ConstraintOperator::Requires,
            ConstraintValue::Boolean { value: true },
            ConstraintStrength::Hard,
            anchor,
        ));
    }
}

fn capture_location(remark: &str, output: &mut Vec<ConstraintCaptureCandidate>) {
    if let Some(anchor) = first_phrase(
        remark,
        &["same venue", "one venue", "ceremony and reception together"],
    ) {
        output.push(candidate(
            ConstraintKind::LocationRequirement,
            ConstraintOperator::Requires,
            ConstraintValue::Enum {
                value: "same_venue".to_string(),
                vocabulary: "planning.location.v1".to_string(),
            },
            strength_for(remark, ConstraintStrength::Strong),
            anchor,
        ));
    } else if let Some(anchor) = first_phrase(
        remark,
        &[
            "no travel between",
            "avoid travel between",
            "no venue change",
        ],
    ) {
        output.push(candidate(
            ConstraintKind::LocationRequirement,
            ConstraintOperator::Excludes,
            ConstraintValue::Enum {
                value: "inter_event_travel".to_string(),
                vocabulary: "planning.location.v1".to_string(),
            },
            strength_for(remark, ConstraintStrength::Strong),
            anchor,
        ));
    }
}

fn capture_numeric_limits(remark: &str, output: &mut Vec<ConstraintCaptureCandidate>) {
    let Some(found) = numeric_phrase(remark) else {
        return;
    };
    let lower = found.anchor.to_ascii_lowercase();
    let (kind, unit) = if ["travel", "drive", "distance", "away", "within"]
        .iter()
        .any(|word| lower.contains(word))
    {
        let unit = if found.unit.starts_with("km") || found.unit.starts_with("kilomet") {
            "kilometres"
        } else {
            "minutes"
        };
        (ConstraintKind::DistanceLimit, unit)
    } else if ["height", "width", "length", "dimension"]
        .iter()
        .any(|word| lower.contains(word))
    {
        let unit = if found.unit.starts_with("m") && !found.unit.starts_with("min") {
            "metres"
        } else {
            "centimetres"
        };
        (ConstraintKind::DimensionLimit, unit)
    } else if ["duration", "last", "hours", "minutes"]
        .iter()
        .any(|word| lower.contains(word))
    {
        let unit = if found.unit.starts_with("hour") {
            "hours"
        } else {
            "minutes"
        };
        (ConstraintKind::DurationLimit, unit)
    } else {
        return;
    };
    output.push(candidate(
        kind,
        ConstraintOperator::Limits,
        ConstraintValue::Integer {
            value: found.value,
            unit: Some(unit.to_string()),
        },
        strength_for(remark, ConstraintStrength::Strong),
        found.anchor,
    ));
}

fn capture_dietary_and_alcohol(remark: &str, output: &mut Vec<ConstraintCaptureCandidate>) {
    let dietary = [
        ("gluten-free", "gluten_free"),
        ("gluten free", "gluten_free"),
        ("nut-free", "nut_free"),
        ("nut free", "nut_free"),
        ("dairy-free", "dairy_free"),
        ("dairy free", "dairy_free"),
        ("vegetarian", "vegetarian"),
        ("vegan", "vegan"),
        ("halal", "halal"),
        ("kosher", "kosher"),
    ];
    for (phrase, value) in dietary {
        if let Some(anchor) = find_phrase(remark, phrase) {
            output.push(candidate(
                ConstraintKind::DietaryRequirement,
                ConstraintOperator::Requires,
                ConstraintValue::Enum {
                    value: value.to_string(),
                    vocabulary: "planning.dietary.v1".to_string(),
                },
                strength_for(remark, ConstraintStrength::Strong),
                anchor,
            ));
        }
    }
    if let Some(anchor) = first_phrase(
        remark,
        &["alcohol-free", "alcohol free", "no alcohol", "dry wedding"],
    ) {
        output.push(candidate(
            ConstraintKind::ServiceRequirement,
            ConstraintOperator::Excludes,
            ConstraintValue::Enum {
                value: "alcohol_free".to_string(),
                vocabulary: "planning.service.v1".to_string(),
            },
            ConstraintStrength::Hard,
            anchor,
        ));
    } else if let Some(anchor) = first_phrase(
        remark,
        &[
            "byo alcohol",
            "bring our own alcohol",
            "bring your own alcohol",
        ],
    ) {
        output.push(candidate(
            ConstraintKind::ServiceRequirement,
            ConstraintOperator::Requires,
            ConstraintValue::Enum {
                value: "byo_alcohol".to_string(),
                vocabulary: "planning.service.v1".to_string(),
            },
            strength_for(remark, ConstraintStrength::Strong),
            anchor,
        ));
    }
}

fn capture_relationships(remark: &str, output: &mut Vec<ConstraintCaptureCandidate>) {
    if contains_sensitive_unstructured_detail(remark) {
        return;
    }
    let people = opaque_person_refs(remark);
    if people.len() >= 2
        && first_phrase(remark, &["apart", "not seated together", "separate tables"]).is_some()
    {
        let anchor = remark.trim();
        output.push(candidate(
            ConstraintKind::RelationshipSeparation,
            ConstraintOperator::Separates,
            ConstraintValue::ReferenceList {
                values: people.into_iter().take(2).collect(),
            },
            ConstraintStrength::Hard,
            anchor,
        ));
    } else if people.len() == 1
        && first_phrase(remark, &["must attend", "needs to attend", "must be there"]).is_some()
    {
        output.push(candidate(
            ConstraintKind::AttendanceRequirement,
            ConstraintOperator::Relates,
            ConstraintValue::Reference {
                value: people[0].clone(),
            },
            ConstraintStrength::Hard,
            remark.trim(),
        ));
    }
}

const AESTHETIC_VALUES: &[&str] = &[
    "gothic",
    "romantic",
    "minimalist",
    "modern",
    "classic",
    "rustic",
    "garden",
    "coastal",
    "colourful",
    "black",
    "white",
    "pink",
    "blue",
    "green",
    "round_tables",
    "long_tables",
];

fn capture_aesthetics(remark: &str, output: &mut Vec<ConstraintCaptureCandidate>) {
    let terms = [
        ("round tables", "round_tables"),
        ("long tables", "long_tables"),
        ("minimalist", "minimalist"),
        ("romantic", "romantic"),
        ("modern", "modern"),
        ("classic", "classic"),
        ("rustic", "rustic"),
        ("gothic", "gothic"),
        ("garden", "garden"),
        ("coastal", "coastal"),
        ("colourful", "colourful"),
        ("black", "black"),
        ("white", "white"),
        ("pink", "pink"),
        ("blue", "blue"),
        ("green", "green"),
    ];
    if let Some((anchor, value)) = terms
        .iter()
        .find_map(|(phrase, value)| find_phrase(remark, phrase).map(|anchor| (anchor, *value)))
    {
        output.push(candidate(
            ConstraintKind::AestheticPreference,
            ConstraintOperator::Prefers,
            ConstraintValue::Enum {
                value: value.to_string(),
                vocabulary: "planning.aesthetic.v1".to_string(),
            },
            strength_for(remark, ConstraintStrength::Nice),
            anchor,
        ));
    }
}

const CATEGORY_VALUES: &[&str] = &[
    "venue",
    "photography",
    "catering",
    "flowers",
    "music",
    "attire",
    "stationery",
    "transport",
];

fn capture_category_priority(remark: &str, output: &mut Vec<ConstraintCaptureCandidate>) {
    let lower = remark.to_ascii_lowercase();
    if ![" over ", " rather than ", " more important than "]
        .iter()
        .any(|separator| lower.contains(separator))
    {
        return;
    }
    let mut found = CATEGORY_VALUES
        .iter()
        .filter_map(|category| lower.find(category).map(|index| (index, *category)))
        .collect::<Vec<_>>();
    found.sort_by_key(|item| item.0);
    if found.len() < 2 {
        return;
    }
    let start = found[0].0;
    let end = found[1].0 + found[1].1.len();
    let Some(anchor) = remark.get(start..end) else {
        return;
    };
    output.push(candidate(
        ConstraintKind::CategoryPriority,
        ConstraintOperator::Prefers,
        ConstraintValue::EnumList {
            values: vec![found[0].1.to_string(), found[1].1.to_string()],
            vocabulary: "planning.category_priority.v1".to_string(),
        },
        strength_for(remark, ConstraintStrength::Strong),
        anchor,
    ));
}

fn dedupe_candidates(candidates: &mut Vec<ConstraintCaptureCandidate>) {
    let mut seen = std::collections::HashSet::new();
    candidates.retain(|candidate| {
        let key = serde_json::to_string(&(candidate.kind.clone(), candidate.value.clone()))
            .unwrap_or_default();
        seen.insert(key)
    });
}

struct NumericPhrase<'a> {
    value: i64,
    unit: String,
    anchor: &'a str,
}

fn numeric_phrase(remark: &str) -> Option<NumericPhrase<'_>> {
    let tokens = token_spans(remark);
    for (index, token) in tokens.iter().enumerate() {
        let Ok(value) = token.text.parse::<i64>() else {
            continue;
        };
        let unit = tokens.get(index + 1)?.text.to_ascii_lowercase();
        if ![
            "minute",
            "minutes",
            "hour",
            "hours",
            "km",
            "kilometre",
            "kilometres",
            "cm",
            "centimetre",
            "centimetres",
            "m",
            "metre",
            "metres",
        ]
        .contains(&unit.as_str())
        {
            continue;
        }
        let start_index = index.saturating_sub(4);
        let start = tokens[start_index].start;
        let end = tokens[index + 1].end;
        return remark.get(start..end).map(|anchor| NumericPhrase {
            value,
            unit,
            anchor,
        });
    }
    None
}

struct TokenSpan<'a> {
    text: &'a str,
    start: usize,
    end: usize,
}

fn token_spans(value: &str) -> Vec<TokenSpan<'_>> {
    let mut spans = Vec::new();
    let mut start = None;
    for (index, character) in value.char_indices() {
        let allowed = character.is_alphanumeric() || matches!(character, ':' | '_' | '-');
        match (start, allowed) {
            (None, true) => start = Some(index),
            (Some(token_start), false) => {
                spans.push(TokenSpan {
                    text: &value[token_start..index],
                    start: token_start,
                    end: index,
                });
                start = None;
            }
            _ => {}
        }
    }
    if let Some(token_start) = start {
        spans.push(TokenSpan {
            text: &value[token_start..],
            start: token_start,
            end: value.len(),
        });
    }
    spans
}

fn opaque_person_refs(remark: &str) -> Vec<SubjectReference> {
    token_spans(remark)
        .into_iter()
        .filter_map(|token| {
            let value = token
                .text
                .trim_matches(|character: char| matches!(character, ',' | '.' | ';'));
            value.starts_with("person:").then(|| SubjectReference {
                kind: SubjectKind::Person,
                id: value.to_string(),
            })
        })
        .collect()
}

fn first_phrase<'a>(text: &'a str, phrases: &[&str]) -> Option<&'a str> {
    phrases.iter().find_map(|phrase| find_phrase(text, phrase))
}

fn find_phrase<'a>(text: &'a str, phrase: &str) -> Option<&'a str> {
    text.char_indices().find_map(|(start, _)| {
        let end = start + phrase.len();
        text.get(start..end)
            .filter(|slice| slice.eq_ignore_ascii_case(phrase))
    })
}

fn contains_ambiguity(value: &str) -> bool {
    let lower = value.to_ascii_lowercase();
    ["maybe", "perhaps", "not sure", "either ", "possibly"]
        .iter()
        .any(|term| lower.contains(term))
}

fn contains_injection_language(value: &str) -> bool {
    let lower = value.to_ascii_lowercase();
    [
        "ignore previous",
        "ignore all instructions",
        "system prompt",
        "developer message",
        "assistant:",
        "output json",
        "jailbreak",
    ]
    .iter()
    .any(|term| lower.contains(term))
}

fn contains_sensitive_unstructured_detail(value: &str) -> bool {
    let lower = value.to_ascii_lowercase();
    [
        "diagnosed",
        "diagnosis",
        "arthritis",
        "autism",
        "adhd",
        "diabetes",
        "pregnant",
        "pregnancy",
        "anxiety",
        "depression",
        "cancer",
        "ethnicity",
        "sexuality",
    ]
    .iter()
    .any(|term| lower.contains(term))
}

fn contains_technical_language(value: &str) -> bool {
    let lower = value.to_ascii_lowercase();
    [
        "provider",
        "model",
        "database",
        "postgres",
        "protocol",
        "schema",
        "payload",
        "http ",
        "api key",
        "token limit",
    ]
    .iter()
    .any(|term| lower.contains(term))
}
