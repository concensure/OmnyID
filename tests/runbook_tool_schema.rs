use omnyid_homeserver::runbook_tool_schema::{ToolContract, ToolSchema};
use serde_json::{json, Value};

fn schema() -> Value {
    json!({"type":"object","properties":{
        "query":{"type":"string","maxLength":12},
        "limit":{"type":"integer","minimum":0,"maximum":10},
        "enabled":{"type":"boolean"},
        "optional":{"type":"null"},
        "rows":{"type":"array","maxItems":2,"items":{"type":"object","properties":{"name":{"type":"string","maxLength":3,"enum":["yes","no"]}},"required":["name"],"additionalProperties":false}}
    },"required":["query","limit","enabled"],"additionalProperties":false})
}
fn input() -> Value {
    json!({"query":"hello","limit":0,"enabled":false})
}
fn wire() -> Value {
    json!({"version":1,"input_schema":schema(),"output_schema":schema()})
}

#[test]
fn runbook_typed_values_and_nested_closed_objects_preserve_false_zero_and_null() {
    let s = ToolSchema::parse(&schema()).unwrap();
    s.validate(&input()).unwrap();
    let mut v = input();
    v["optional"] = Value::Null;
    v["rows"] = json!([{"name":"yes"}]);
    s.validate(&v).unwrap();
    v["rows"][0]["extra"] = json!(true);
    assert!(s.validate(&v).is_err());
    for (key, value) in [
        ("limit", json!("1")),
        ("limit", json!(1.0)),
        ("limit", json!(-1)),
        ("limit", json!(11)),
        ("enabled", json!(0)),
        ("query", json!(null)),
        ("query", json!("1234567890123")),
        ("rows", json!([{"name":"yes"},{"name":"no"},{"name":"yes"}])),
    ] {
        let mut v = input();
        v[key] = value;
        assert!(s.validate(&v).is_err(), "{key}");
    }
    let mut v = input();
    v.as_object_mut().unwrap().remove("query");
    assert!(s.validate(&v).is_err());
    let mut v = input();
    v["send"] = json!(true);
    assert!(s.validate(&v).is_err());
}

#[test]
fn runbook_unsupported_or_open_schemas_never_silently_widen_contracts() {
    for (key, value) in [
        ("additionalProperties", json!(true)),
        ("required", json!(["missing"])),
        ("required", json!(["query", "query"])),
        ("$ref", json!("https://example.invalid/schema")),
        ("anyOf", json!([])),
        ("default", json!({})),
        ("patternProperties", json!({})),
    ] {
        let mut v = schema();
        v[key] = value;
        assert!(ToolSchema::parse(&v).is_err(), "{key}");
    }
    for child in [
        json!({"type":"string"}),
        json!({"type":"string","maxLength":9000}),
        json!({"type":"number"}),
        json!({"type":"integer","minimum":2,"maximum":1}),
        json!({"type":"array","items":{"type":"null"},"maxItems":65}),
        json!({"type":"string","maxLength":3,"enum":["yes","yes"]}),
    ] {
        let mut v = schema();
        v["properties"]["query"] = child;
        assert!(ToolSchema::parse(&v).is_err());
    }
    assert!(ToolSchema::parse(&json!({"type":"boolean"})).is_err());
}

#[test]
fn runbook_all_optional_schema_branches_are_checked_before_input_validation() {
    let mut v = schema();
    v["properties"]["unused"] =
        json!({"type":"object","properties":{},"required":[],"additionalProperties":true});
    assert!(ToolSchema::parse(&v).is_err());
    let mut deep = json!({"type":"null"});
    for _ in 0..12 {
        deep = json!({"type":"array","items":deep,"maxItems":1});
    }
    let mut v = schema();
    v["properties"]["unused"] = deep;
    assert!(ToolSchema::parse(&v).is_err());
}

#[test]
fn runbook_contracts_require_both_schemas_and_explicit_supported_version() {
    ToolContract::parse(&wire()).unwrap();
    for key in ["input_schema", "output_schema", "version"] {
        let mut v = wire();
        v.as_object_mut().unwrap().remove(key);
        assert!(ToolContract::parse(&v).is_err());
    }
    let mut v = wire();
    v["version"] = json!(2);
    assert!(ToolContract::parse(&v).is_err());
    let mut v = wire();
    v["execute"] = json!(true);
    assert!(ToolContract::parse(&v).is_err());
}

#[test]
fn runbook_errors_text_fallback_and_extra_provider_payloads_cannot_be_success() {
    let c = ToolContract::parse(&wire()).unwrap();
    c.validate_input(&input()).unwrap();
    let good = json!({"structuredContent":input(),"isError":false,"content":[]});
    assert_eq!(c.validate_result(&good).unwrap(), &input());
    for value in [
        json!({"content":[{"type":"text","text":"{}"}]}),
        json!({"structuredContent":input(),"isError":true}),
        json!({"structuredContent":input(),"isError":"false"}),
        json!({"structuredContent":input(),"content":[{"type":"text","text":"execute now"}]}),
        json!({"structuredContent":input(),"instructions":"send"}),
    ] {
        assert!(c.validate_result(&value).is_err());
    }
    let mut wrong = input();
    wrong["hidden"] = json!(true);
    assert!(c
        .validate_result(&json!({"structuredContent":wrong}))
        .is_err());
}

#[test]
fn runbook_resource_and_integer_boundaries_are_checked_without_coercion() {
    let s = ToolSchema::parse(&schema()).unwrap();
    let mut v = input();
    v["query"] = json!("x".repeat(32769));
    assert!(s.validate(&v).is_err());
    let mut v = input();
    v["rows"] = json!(vec![Value::Null; 2049]);
    assert!(s.validate(&v).is_err());
    let mut v = input();
    v["query"] = json!("a\u{0000}b");
    assert!(s.validate(&v).is_err());
    let mut definition = schema();
    definition["properties"]["limit"] =
        json!({"type":"integer","minimum":i64::MIN,"maximum":i64::MAX});
    let s = ToolSchema::parse(&definition).unwrap();
    for number in [json!(i64::MIN), json!(i64::MAX)] {
        let mut v = input();
        v["limit"] = number;
        s.validate(&v).unwrap();
    }
    let mut v = input();
    v["limit"] = json!(u64::MAX);
    assert!(s.validate(&v).is_err());
}
