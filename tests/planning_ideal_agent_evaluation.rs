use serde_json::Value;
use std::{collections::BTreeSet, fs, path::Path};

fn root() -> &'static Path {
    Path::new(env!("CARGO_MANIFEST_DIR"))
}

fn manifest() -> Value {
    let path = root().join("config/planning_ideal_agent_evaluation_v1.json");
    serde_json::from_str(&fs::read_to_string(path).expect("evaluation manifest"))
        .expect("valid json")
}

fn strings<'a>(value: &'a Value, field: &str) -> Vec<&'a str> {
    value[field]
        .as_array()
        .unwrap_or_else(|| panic!("{field} must be an array"))
        .iter()
        .map(|item| {
            item.as_str()
                .unwrap_or_else(|| panic!("{field} values must be strings"))
        })
        .collect()
}

#[test]
fn ideal_agent_manifest_covers_every_closed_golden_scenario() {
    let value = manifest();
    assert_eq!(
        value["schema_version"],
        "planning.ideal_agent_evaluation.v1"
    );
    let scenarios = value["scenarios"].as_array().expect("scenarios");
    let actual = scenarios
        .iter()
        .map(|scenario| scenario["id"].as_str().expect("scenario id"))
        .collect::<BTreeSet<_>>();
    let expected = BTreeSet::from([
        "remembered-centrepiece-limit",
        "accessibility-conflict",
        "budget-offset",
        "accommodation-critical-path",
        "vendor-substitution",
        "partner-preference-conflict",
        "cross-channel-replay",
        "stale-authority",
        "non-wedding-reuse",
    ]);
    assert_eq!(actual, expected);
    assert_eq!(scenarios.len(), 9);

    let review_dimensions = strings(&value, "human_review_dimensions")
        .into_iter()
        .collect::<BTreeSet<_>>();
    for scenario in scenarios {
        assert!(!scenario["authority_boundary"]
            .as_str()
            .unwrap_or("")
            .is_empty());
        assert!(!scenario["privacy_boundary"]
            .as_str()
            .unwrap_or("")
            .is_empty());
        let paths = strings(scenario, "automated_test_paths");
        assert!(!paths.is_empty());
        for path in paths {
            assert!(
                root().join(path).is_file(),
                "missing automated evidence path {path}"
            );
        }
        for dimension in strings(scenario, "human_review_dimensions") {
            assert!(
                review_dimensions.contains(dimension),
                "open review dimension {dimension}"
            );
        }
    }
}

#[test]
fn rollout_is_dark_ordered_and_blocked_from_vendor_enablement() {
    let value = manifest();
    let rollout = &value["rollout"];
    assert_eq!(rollout["default_state"], "dark");
    assert_eq!(strings(rollout, "release_blockers"), ["WED-225", "WED-226"]);
    let stages = rollout["stages"].as_array().expect("rollout stages");
    let ids = stages
        .iter()
        .map(|stage| stage["id"].as_str().expect("stage id"))
        .collect::<Vec<_>>();
    assert_eq!(
        ids,
        [
            "dark_package",
            "synthetic_tenant",
            "allowlisted_couple",
            "permissioned_vendor"
        ]
    );
    let vendor_requires = strings(stages.last().expect("vendor stage"), "requires");
    for gate in [
        "allowlisted_couple",
        "WED-225",
        "WED-226",
        "mail_provider_gates",
    ] {
        assert!(
            vendor_requires.contains(&gate),
            "vendor stage missing {gate}"
        );
    }
    assert!(rollout["kill_switch_policy"]
        .as_str()
        .unwrap_or("")
        .contains("without deleting AFP"));
    assert!(rollout["metrics_policy"]
        .as_str()
        .unwrap_or("")
        .contains("Content-free"));
}

#[test]
fn oracle_packages_keep_every_backend_planning_flag_explicitly_false() {
    let value = manifest();
    let flags = strings(&value["rollout"], "backend_flags");
    for relative in [
        "docker-compose.oracle.yml",
        "docker-compose.oracle.minimal.yml",
        "docker-compose.oracle.quic.yml",
        "docker-compose.oracle.staging.yml",
    ] {
        let contents = fs::read_to_string(root().join(relative)).expect("compose file");
        for flag in &flags {
            let expected = format!("{flag}: ${{{flag}:-false}}");
            assert!(
                contents.contains(&expected),
                "{relative} does not dark-package {flag}"
            );
        }
    }
}
