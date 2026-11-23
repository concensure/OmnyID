use serde::{Deserialize, Serialize};

pub const CONSTRAINT_SCHEMA_VERSION: &str = "planning.constraint.v1";
pub const EVALUATION_SCHEMA_VERSION: &str = "planning.constraint_evaluation.v1";
pub const COST_TRADEOFF_SCHEMA_VERSION: &str = "planning.cost_tradeoff.v1";
pub const MILESTONE_SCHEMA_VERSION: &str = "planning.milestone_dependency.v1";
pub const VENDOR_CHANGE_SCHEMA_VERSION: &str = "quotation.vendor_change.v1";
pub const INTERVENTION_SCHEMA_VERSION: &str = "decision.intervention.v1";

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SubjectKind {
    Plan,
    Person,
    Event,
    Object,
    VendorCategory,
    Option,
    Milestone,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SubjectReference {
    pub kind: SubjectKind,
    pub id: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ConstraintKind {
    AccessibilityRequirement,
    LocationRequirement,
    DistanceLimit,
    DurationLimit,
    DimensionLimit,
    DietaryRequirement,
    ServiceRequirement,
    RelationshipSeparation,
    AttendanceRequirement,
    AestheticPreference,
    CategoryPriority,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ConstraintOperator {
    Requires,
    Excludes,
    Prefers,
    Limits,
    Separates,
    Relates,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ConstraintStrength {
    Hard,
    Strong,
    Nice,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, PartialOrd, Ord)]
#[serde(rename_all = "snake_case")]
pub enum ConstraintAuthority {
    Imported,
    Deterministic,
    ConfirmedInterpretation,
    User,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, PartialOrd, Ord)]
#[serde(rename_all = "snake_case")]
pub enum ConstraintPrivacy {
    ShareableWithApproval,
    PlanPrivate,
    CouplePrivate,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ConstraintStatus {
    Proposed,
    Confirmed,
    Superseded,
    Removed,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case", deny_unknown_fields)]
pub enum ConstraintValue {
    Boolean {
        value: bool,
    },
    Integer {
        value: i64,
        unit: Option<String>,
    },
    IntegerRange {
        minimum: Option<i64>,
        maximum: Option<i64>,
        unit: Option<String>,
    },
    Enum {
        value: String,
        vocabulary: String,
    },
    Reference {
        value: SubjectReference,
    },
    ReferenceList {
        values: Vec<SubjectReference>,
    },
    EnumList {
        values: Vec<String>,
        vocabulary: String,
    },
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SourceAnchor {
    pub message_id: String,
    pub source_version_id: Option<String>,
    pub locator: String,
    pub exact_excerpt: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct EffectiveWindow {
    pub starts_at: Option<String>,
    pub ends_at: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PlanningConstraint {
    pub schema_version: String,
    pub constraint_id: String,
    pub template_id: String,
    pub plan_id: String,
    pub subject_ref: SubjectReference,
    pub kind: ConstraintKind,
    pub operator: ConstraintOperator,
    pub value: ConstraintValue,
    pub strength: ConstraintStrength,
    pub authority: ConstraintAuthority,
    pub privacy: ConstraintPrivacy,
    pub source_ref: String,
    pub source_anchor: SourceAnchor,
    pub observed_at: String,
    pub effective_window: Option<EffectiveWindow>,
    pub status: ConstraintStatus,
    pub supersedes: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EvaluationResult {
    Satisfied,
    Conflict,
    Unknown,
    NotApplicable,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EvaluationSeverity {
    Blocking,
    DecisionRelevant,
    Informational,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EvaluationExplanationCode {
    ExplicitMatch,
    ExplicitConflict,
    EvidenceMissing,
    ScopeMismatch,
    CandidateNotApplicable,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ConstraintEvaluation {
    pub schema_version: String,
    pub evaluation_id: String,
    pub constraint_ref: String,
    pub candidate_ref: String,
    pub result: EvaluationResult,
    pub severity: EvaluationSeverity,
    pub constraint_evidence_ref: String,
    pub candidate_evidence_ref: Option<String>,
    pub explanation_code: EvaluationExplanationCode,
    pub evaluated_at: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Money {
    pub amount_minor: i64,
    pub currency: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "state", rename_all = "snake_case", deny_unknown_fields)]
pub enum KnownMoney {
    Exact { amount: Money, evidence_ref: String },
    Unknown,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct MoneyRange {
    pub minimum_minor: i64,
    pub maximum_minor: i64,
    pub currency: String,
    pub evidence_refs: Vec<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct OffsetOption {
    pub option_id: String,
    pub category_ref: String,
    pub saving_range: MoneyRange,
    pub evidence_refs: Vec<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PriorityImpact {
    Preserved,
    Improved,
    Reduced,
    Unknown,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CostAssumptionCode {
    CurrentQuote,
    CategoryAllowance,
    ConservativeRange,
    QuantityUnconfirmed,
    TaxUnconfirmed,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CostTradeoff {
    pub schema_version: String,
    pub tradeoff_id: String,
    pub candidate_decision_ref: String,
    pub incremental_cost: KnownMoney,
    pub forecast_before: Option<MoneyRange>,
    pub forecast_after: Option<MoneyRange>,
    pub offset_options: Vec<OffsetOption>,
    pub priority_impact: PriorityImpact,
    pub unknown_cost_drivers: Vec<String>,
    pub assumptions: Vec<CostAssumptionCode>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct DurationRange {
    pub minimum_days: u32,
    pub maximum_days: u32,
    pub evidence_ref: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MilestoneState {
    NotStarted,
    Active,
    Blocked,
    Complete,
    Waived,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PreparedActionKind {
    Research,
    Compare,
    Draft,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PreparedAction {
    pub kind: PreparedActionKind,
    pub target_ref: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct MilestoneDependency {
    pub schema_version: String,
    pub milestone_id: String,
    pub plan_id: String,
    pub depends_on: Vec<String>,
    pub duration_or_lead_time: Option<DurationRange>,
    pub earliest_at: Option<String>,
    pub latest_at: Option<String>,
    pub slack_days: Option<i32>,
    pub state: MilestoneState,
    pub blocking_refs: Vec<String>,
    pub prepared_next_action: Option<PreparedAction>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum VendorChangeKind {
    Unavailable,
    Substituted,
    PriceChanged,
    TimingChanged,
    ScopeChanged,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct AnchoredTerm {
    pub value: String,
    pub source_anchor: SourceAnchor,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct VendorChange {
    pub schema_version: String,
    pub change_id: String,
    pub response_ref: String,
    pub affected_object_ref: String,
    pub change_kind: VendorChangeKind,
    pub original_term: AnchoredTerm,
    pub replacement_options: Vec<AnchoredTerm>,
    pub cost_delta: KnownMoney,
    pub deadline: Option<String>,
    pub requires_user_decision: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum InterventionReasonCode {
    ConstraintConflict,
    BudgetTradeoff,
    CriticalDependency,
    VendorChange,
    PreferenceConflict,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct InterventionOption {
    pub option_id: String,
    pub label: String,
    pub consequence_codes: Vec<String>,
    pub evidence_refs: Vec<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct DecisionIntervention {
    pub schema_version: String,
    pub intervention_id: String,
    pub decision_ref: String,
    pub options: Vec<InterventionOption>,
    pub recommended_option_id: Option<String>,
    pub reason_codes: Vec<InterventionReasonCode>,
    pub unknown_codes: Vec<String>,
    pub consequence_summary_codes: Vec<String>,
    pub prepared_next_action: Option<PreparedAction>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum PlanningContract {
    Constraint(PlanningConstraint),
    Evaluation(ConstraintEvaluation),
    CostTradeoff(CostTradeoff),
    Milestone(MilestoneDependency),
    VendorChange(VendorChange),
    Intervention(DecisionIntervention),
}
