use serde::Deserialize;
use serde_json::Value;

use super::{
    ConstraintAuthority, ConstraintPrivacy, ConstraintStatus, PlanningContract,
    parse_planning_contract, planning_contract_fingerprint, validate_constraint_ingress,
    validate_constraint_successor,
};

#[derive(Deserialize)]
struct Fixture {
    schema_version: String,
    cases: Vec<FixtureCase>,
}

#[derive(Deserialize)]
struct FixtureCase {
    name: String,
    valid: bool,
    #[serde(default)]
    fingerprint: Option<String>,
    payload: Value,
}

fn fixture() -> Fixture {
    serde_json::from_str(include_str!(
        "../../tests/fixtures/planning/contract-cases.json"
    ))
    .expect("planning contract fixture")
}

#[test]
fn shared_fixture_acceptance_is_fail_closed_and_fingerprinted() {
    let fixture = fixture();
    assert_eq!(fixture.schema_version, "planning.contract_fixture.v1");
    assert!(fixture.cases.iter().filter(|case| case.valid).count() >= 6);
    assert!(fixture.cases.iter().filter(|case| !case.valid).count() >= 6);
    for case in fixture.cases {
        let parsed = parse_planning_contract(case.payload);
        assert_eq!(parsed.is_ok(), case.valid, "fixture case {}", case.name);
        if let Ok(contract) = parsed {
            assert_eq!(
                planning_contract_fingerprint(&contract),
                case.fingerprint.expect("valid fixture fingerprint"),
                "fixture fingerprint {}",
                case.name
            );
        }
    }
}

#[test]
fn generic_fixture_contains_no_wedding_only_contract_fields() {
    let source = include_str!("../../tests/fixtures/planning/contract-cases.json");
    for forbidden in ["wedding_id", "guest_id", "venue_id", "couple_name"] {
        assert!(
            !source.contains(forbidden),
            "generic fixture contains {forbidden}"
        );
    }
    assert!(source.contains("home_renovation"));
}

#[test]
fn ingress_and_successor_authority_cannot_be_forged() {
    let fixture = fixture();
    let mut constraint = fixture
        .cases
        .into_iter()
        .find_map(|case| match parse_planning_contract(case.payload).ok()? {
            PlanningContract::Constraint(value) => Some(value),
            _ => None,
        })
        .expect("constraint fixture");

    assert!(validate_constraint_ingress(&constraint, "plan:renovation:alpha", false).is_err());
    assert!(validate_constraint_ingress(&constraint, "plan:other", true).is_err());
    assert!(validate_constraint_ingress(&constraint, "plan:renovation:alpha", true).is_ok());

    let previous = constraint.clone();
    constraint.constraint_id = "constraint:renovation:step-free:v2".to_string();
    constraint.supersedes = Some(previous.constraint_id.clone());
    constraint.status = ConstraintStatus::Confirmed;
    constraint.authority = ConstraintAuthority::User;
    constraint.privacy = ConstraintPrivacy::ShareableWithApproval;
    assert!(validate_constraint_successor(&previous, &constraint, false).is_err());
    assert!(validate_constraint_successor(&previous, &constraint, true).is_ok());
}

#[test]
fn published_json_schemas_are_closed_and_version_pinned() {
    for (path, version) in [
        ("constraint.v1.json", "planning.constraint.v1"),
        (
            "constraint-evaluation.v1.json",
            "planning.constraint_evaluation.v1",
        ),
        ("cost-tradeoff.v1.json", "planning.cost_tradeoff.v1"),
        (
            "milestone-dependency.v1.json",
            "planning.milestone_dependency.v1",
        ),
        ("vendor-change.v1.json", "quotation.vendor_change.v1"),
        ("intervention.v1.json", "decision.intervention.v1"),
    ] {
        let source = match path {
            "constraint.v1.json" => include_str!("../../schemas/planning/constraint.v1.json"),
            "constraint-evaluation.v1.json" => {
                include_str!("../../schemas/planning/constraint-evaluation.v1.json")
            }
            "cost-tradeoff.v1.json" => {
                include_str!("../../schemas/planning/cost-tradeoff.v1.json")
            }
            "milestone-dependency.v1.json" => {
                include_str!("../../schemas/planning/milestone-dependency.v1.json")
            }
            "vendor-change.v1.json" => {
                include_str!("../../schemas/planning/vendor-change.v1.json")
            }
            "intervention.v1.json" => {
                include_str!("../../schemas/planning/intervention.v1.json")
            }
            _ => unreachable!(),
        };
        let schema: Value = serde_json::from_str(source).expect("valid JSON schema");
        assert_eq!(schema["type"], "object", "schema type {path}");
        assert_eq!(
            schema["additionalProperties"], false,
            "closed schema {path}"
        );
        assert_eq!(
            schema["properties"]["schema_version"]["const"], version,
            "schema version {path}"
        );
    }
}
