use chrono::{Duration, Utc};
use omnyid_homeserver::runbook_execution_cohort::{ExecutionCohort, ExecutionKind};
use serde_json::json;

#[test]
fn execution_cohort_is_default_off_bounded_and_owner_scoped() {
    let now = Utc::now();
    let mut config = json!({"expires_at":now+Duration::minutes(5),"members":[{
        "owner":"owner_a","runbook_id":"review","version":1,"step_id":"draft",
        "definition_sha256":"a".repeat(64)}]});
    let parse = |enabled: &str, value: &serde_json::Value| {
        ExecutionCohort::parse(ExecutionKind::Draft, enabled, &value.to_string(), now)
    };
    for enabled in ["", "false", "TRUE", "1"] {
        assert!(parse(enabled, &config).is_err());
    }
    let policy = parse("true", &config).unwrap();
    assert!(policy.admits_owner("owner_a", now));
    assert!(!policy.admits_owner("owner_b", now));
    assert!(!policy.admits_owner("owner_a", now + Duration::minutes(5)));
    config["expires_at"] = json!(now + Duration::hours(2));
    assert!(parse("true", &config).is_err());
    config["expires_at"] = json!(now);
    assert!(parse("true", &config).is_err());
    config["expires_at"] = json!(now + Duration::minutes(5));
    // Namespaced owners use the shared identifier grammar.
    config["members"][0]["owner"] = json!("owner:a");
    assert!(parse("true", &config).is_ok());
    config["members"][0]["owner"] = json!("owner/a");
    assert!(parse("true", &config).is_err());
    config["members"][0]["owner"] = json!("owner_a");
    config["members"][0]["definition_sha256"] = json!("A".repeat(64));
    assert!(parse("true", &config).is_err());
    config["members"][0]["definition_sha256"] = json!("a".repeat(64));
    config["members"][0]["endpoint"] = json!("https://untrusted.invalid");
    assert!(parse("true", &config).is_err());
    config["members"] = json!([]);
    assert!(parse("true", &config).is_err());
}
