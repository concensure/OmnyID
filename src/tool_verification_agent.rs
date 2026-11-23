/*
 * @module-id: rust.tool-verification-agent
 * @primary-capability: rust.source-module
 * @locs-version: 2.0
 * @stability: active
 * @owner: omnyid
 */

/// Tool Call Verification Agent â€” structural and semantic result validation.
///
/// Inspects every tool call output for correctness, safety, and completeness
/// before it is passed to the next pipeline step.  Three modes:
///
///   "structural" â€” validates presence and types of required fields.
///   "semantic"   â€” cross-checks parameter intent against result content.
///   "full"       â€” both structural + semantic.
///
/// Returns `AfpToolVerificationResult` with a confidence score (0.0â€“1.0),
/// a list of `AfpVerificationIssue` entries, and an optional corrected result.
use std::time::Instant;

use serde_json::Value;

use crate::message::{
    AFP_SUBTYPE_TOOL_VERIFICATION_RESULT, AFP_TYPE_TOOL_VERIFICATION, AfpToolVerificationRequest,
    AfpToolVerificationResult, AfpVerificationIssue,
};

// â”€â”€ Issue severity constants â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

pub const ISSUE_SEVERITY_WARNING: &str = "warning";
pub const ISSUE_SEVERITY_ERROR: &str = "error";

pub const ISSUE_KIND_MISSING_FIELD: &str = "missing_field";
pub const ISSUE_KIND_WRONG_TYPE: &str = "wrong_type";
pub const ISSUE_KIND_OUT_OF_RANGE: &str = "out_of_range";
pub const ISSUE_KIND_SEMANTIC_INCONSISTENCY: &str = "semantic_inconsistency";
pub const ISSUE_KIND_EMPTY_RESULT: &str = "empty_result";

// â”€â”€ Structural validation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/// Validate a tool result against an optional expected JSON Schema.
/// Currently supports a simplified schema subset: `required[]` and
/// `properties.<key>.type` checks.
fn structural_check(result: &Value, schema: Option<&Value>) -> Vec<AfpVerificationIssue> {
    let mut issues = Vec::new();

    // An entirely null result is always an error.
    if result.is_null() {
        issues.push(AfpVerificationIssue {
            kind: ISSUE_KIND_MISSING_FIELD.to_string(),
            description: "Tool returned null â€” no result produced.".to_string(),
            path: None,
            severity: ISSUE_SEVERITY_ERROR.to_string(),
        });
        return issues;
    }

    // An empty object is suspicious.
    if let Some(obj) = result.as_object() {
        if obj.is_empty() {
            issues.push(AfpVerificationIssue {
                kind: ISSUE_KIND_EMPTY_RESULT.to_string(),
                description: "Tool returned an empty object â€” expected fields are absent."
                    .to_string(),
                path: Some("/".to_string()),
                severity: ISSUE_SEVERITY_WARNING.to_string(),
            });
        }
    }

    let schema = match schema {
        Some(s) => s,
        None => return issues,
    };

    // Check required fields.
    if let Some(required) = schema.get("required").and_then(Value::as_array) {
        for field in required {
            if let Some(key) = field.as_str() {
                if result.get(key).is_none() {
                    issues.push(AfpVerificationIssue {
                        kind: ISSUE_KIND_MISSING_FIELD.to_string(),
                        description: format!("Required field '/{key}' is absent."),
                        path: Some(format!("/{key}")),
                        severity: ISSUE_SEVERITY_ERROR.to_string(),
                    });
                }
            }
        }
    }

    // Check property types.
    if let Some(props) = schema.get("properties").and_then(Value::as_object) {
        for (key, prop_schema) in props {
            let expected_type = match prop_schema.get("type").and_then(Value::as_str) {
                Some(t) => t,
                None => continue,
            };
            if let Some(actual_val) = result.get(key) {
                if !value_matches_type(actual_val, expected_type) {
                    issues.push(AfpVerificationIssue {
                        kind: ISSUE_KIND_WRONG_TYPE.to_string(),
                        description: format!(
                            "Field '/{key}' expected type '{expected_type}', got '{}'.",
                            json_type_name(actual_val)
                        ),
                        path: Some(format!("/{key}")),
                        severity: ISSUE_SEVERITY_ERROR.to_string(),
                    });
                }
            }
        }
    }

    issues
}

fn value_matches_type(v: &Value, expected: &str) -> bool {
    match expected {
        "string" => v.is_string(),
        "number" => v.is_number(),
        "integer" => v.is_i64() || v.is_u64(),
        "boolean" => v.is_boolean(),
        "array" => v.is_array(),
        "object" => v.is_object(),
        "null" => v.is_null(),
        _ => true, // Unknown type â€” pass through.
    }
}

fn json_type_name(v: &Value) -> &'static str {
    match v {
        Value::Null => "null",
        Value::Bool(_) => "boolean",
        Value::Number(_) => "number",
        Value::String(_) => "string",
        Value::Array(_) => "array",
        Value::Object(_) => "object",
    }
}

// â”€â”€ Semantic validation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/// Cross-check that the result is semantically consistent with the parameters.
/// Heuristic checks â€” not LLM-backed in this implementation.
fn semantic_check(
    tool_name: &str,
    parameters: &Value,
    result: &Value,
) -> Vec<AfpVerificationIssue> {
    let mut issues = Vec::new();

    // If a `query` parameter was given, the result should contain some text.
    if let Some(query) = parameters.get("query").and_then(Value::as_str) {
        if query.len() > 3 {
            let result_text = result.to_string();
            if result_text.len() < 5 {
                issues.push(AfpVerificationIssue {
                    kind: ISSUE_KIND_SEMANTIC_INCONSISTENCY.to_string(),
                    description: format!(
                        "Query '{q}' was issued but result appears empty.",
                        q = query.chars().take(50).collect::<String>()
                    ),
                    path: None,
                    severity: ISSUE_SEVERITY_WARNING.to_string(),
                });
            }
        }
    }

    // Detect obvious error payloads masquerading as results.
    let result_str = result.to_string().to_lowercase();
    for signal in &[
        "error:",
        "\"error\":",
        "\"status\": \"error\"",
        "\"success\": false",
    ] {
        if result_str.contains(signal) {
            issues.push(AfpVerificationIssue {
                kind: ISSUE_KIND_SEMANTIC_INCONSISTENCY.to_string(),
                description: format!(
                    "Result from '{tool_name}' appears to contain an error payload."
                ),
                path: None,
                severity: ISSUE_SEVERITY_ERROR.to_string(),
            });
            break;
        }
    }

    issues
}

// â”€â”€ Confidence scoring â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/// Derive a confidence score from the issue list.
/// Each error reduces confidence by 0.25; each warning by 0.08.
/// Clamped to [0.0, 1.0].
fn score_confidence(issues: &[AfpVerificationIssue]) -> f64 {
    let penalty: f64 = issues
        .iter()
        .map(|i| {
            if i.severity == ISSUE_SEVERITY_ERROR {
                0.25
            } else {
                0.08
            }
        })
        .sum();
    (1.0_f64 - penalty).clamp(0.0, 1.0)
}

// â”€â”€ Auto-correction â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/// Attempt to produce a corrected result by stripping known error envelopes.
/// Returns `None` if no safe correction is possible.
fn try_auto_correct(result: &Value) -> Option<Value> {
    if let Some(obj) = result.as_object() {
        // Unwrap `{ "data": ... }` envelopes that some connectors add.
        if obj.len() == 1 {
            if let Some(inner) = obj.get("data") {
                if !inner.is_null() {
                    return Some(inner.clone());
                }
            }
        }
        // Strip `{ "error": ..., "result": ... }` where "result" is the real payload.
        if obj.contains_key("error") {
            if let Some(real) = obj.get("result").filter(|v| !v.is_null()) {
                return Some(real.clone());
            }
        }
    }
    None
}

// â”€â”€ Main API â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/// Verify a tool call result synchronously.
/// Production callers may wrap this in a background task.
pub fn verify_tool_call(req: &AfpToolVerificationRequest) -> AfpToolVerificationResult {
    let started = Instant::now();

    let mut all_issues: Vec<AfpVerificationIssue> = Vec::new();

    // Always run structural check.
    let structural_issues = structural_check(&req.raw_result, req.expected_schema.as_ref());
    all_issues.extend(structural_issues);

    // Run semantic check when mode includes semantic.
    if req.mode == "semantic" || req.mode == "full" {
        let semantic_issues = semantic_check(&req.tool_name, &req.parameters, &req.raw_result);
        all_issues.extend(semantic_issues);
    }

    let has_errors = all_issues
        .iter()
        .any(|i| i.severity == ISSUE_SEVERITY_ERROR);
    let confidence = score_confidence(&all_issues);
    let valid = !has_errors;

    let corrected_result = if !valid {
        try_auto_correct(&req.raw_result)
    } else {
        None
    };

    let retry_reason = if !valid && corrected_result.is_none() {
        Some(
            all_issues
                .iter()
                .filter(|i| i.severity == ISSUE_SEVERITY_ERROR)
                .map(|i| i.description.as_str())
                .collect::<Vec<_>>()
                .join("; "),
        )
    } else {
        None
    };

    AfpToolVerificationResult {
        call_id: req.call_id.clone(),
        valid,
        confidence,
        issues: all_issues,
        retry_reason,
        corrected_result,
        verification_ms: started.elapsed().as_millis() as u64,
    }
}

/// Build a `tool_verification:result` AFP JSON message.
pub fn build_verification_result_afp(
    owner_user_id: &str,
    thread_id: &str,
    result: &AfpToolVerificationResult,
) -> Value {
    serde_json::json!({
        "protocol": "afp-v1",
        "id": ulid::Ulid::new().to_string(),
        "thread_id": thread_id,
        "from": "tool_verification_agent",
        "to": [owner_user_id],
        "timestamp": chrono::Utc::now().to_rfc3339(),
        "type": AFP_TYPE_TOOL_VERIFICATION,
        "subtype": AFP_SUBTYPE_TOOL_VERIFICATION_RESULT,
        "content": serde_json::to_value(result).unwrap_or(Value::Null),
        "metadata": { "store": true, "ephemeral": false },
        "store_in_relational": true,
    })
}

// â”€â”€ Tests â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

#[cfg(test)]
mod tests {
    use super::*;
    use crate::message::AfpToolVerificationRequest;

    fn make_req(tool: &str, result: Value, schema: Option<Value>) -> AfpToolVerificationRequest {
        AfpToolVerificationRequest {
            call_id: "call_001".into(),
            tool_name: tool.to_string(),
            parameters: serde_json::json!({ "query": "test" }),
            raw_result: result,
            expected_schema: schema,
            mode: "full".to_string(),
        }
    }

    #[test]
    fn null_result_is_invalid() {
        let req = make_req("search", Value::Null, None);
        let r = verify_tool_call(&req);
        assert!(!r.valid);
        assert!(r.issues.iter().any(|i| i.kind == ISSUE_KIND_MISSING_FIELD));
    }

    #[test]
    fn valid_result_passes_with_schema() {
        let schema = serde_json::json!({
            "required": ["title", "url"],
            "properties": {
                "title": { "type": "string" },
                "url": { "type": "string" }
            }
        });
        let result = serde_json::json!({ "title": "Hello", "url": "https://example.com" });
        let req = make_req("search", result, Some(schema));
        let r = verify_tool_call(&req);
        assert!(r.valid);
        assert!(r.issues.is_empty());
        assert!((r.confidence - 1.0).abs() < 1e-6);
    }

    #[test]
    fn missing_required_field_is_detected() {
        let schema = serde_json::json!({ "required": ["title", "url"] });
        let result = serde_json::json!({ "title": "Hello" }); // url missing
        let req = make_req("search", result, Some(schema));
        let r = verify_tool_call(&req);
        assert!(!r.valid);
        assert!(r.issues.iter().any(|i| i.path == Some("/url".to_string())));
    }

    #[test]
    fn wrong_type_is_detected() {
        let schema = serde_json::json!({
            "properties": { "count": { "type": "integer" } }
        });
        let result = serde_json::json!({ "count": "not_a_number" });
        let req = make_req("count_items", result, Some(schema));
        let r = verify_tool_call(&req);
        assert!(r.issues.iter().any(|i| i.kind == ISSUE_KIND_WRONG_TYPE));
    }

    #[test]
    fn error_envelope_triggers_semantic_issue() {
        let result = serde_json::json!({ "error": "timeout", "result": null });
        let req = make_req("fetch", result, None);
        let r = verify_tool_call(&req);
        assert!(
            r.issues
                .iter()
                .any(|i| i.kind == ISSUE_KIND_SEMANTIC_INCONSISTENCY)
        );
    }

    #[test]
    fn auto_correct_unwraps_data_envelope() {
        let result = serde_json::json!({ "data": { "title": "Unwrapped!" } });
        let req = make_req("fetch", result, None);
        let _ = verify_tool_call(&req);
        // The result is valid (no errors), so corrected_result stays None.
        // But we can test try_auto_correct directly.
        let corrected = try_auto_correct(&serde_json::json!({ "data": { "title": "Unwrapped!" } }));
        assert_eq!(
            corrected,
            Some(serde_json::json!({ "title": "Unwrapped!" }))
        );
    }

    #[test]
    fn confidence_decreases_with_errors() {
        let issues = vec![
            AfpVerificationIssue {
                kind: ISSUE_KIND_MISSING_FIELD.into(),
                description: "missing".into(),
                path: None,
                severity: ISSUE_SEVERITY_ERROR.into(),
            },
            AfpVerificationIssue {
                kind: ISSUE_KIND_WRONG_TYPE.into(),
                description: "wrong type".into(),
                path: None,
                severity: ISSUE_SEVERITY_WARNING.into(),
            },
        ];
        let confidence = score_confidence(&issues);
        assert!(confidence < 1.0);
        assert!(confidence > 0.0);
    }

    #[test]
    fn build_verification_result_afp_has_correct_type() {
        let result = AfpToolVerificationResult {
            call_id: "call_001".into(),
            valid: true,
            confidence: 1.0,
            ..Default::default()
        };
        let afp = build_verification_result_afp("user_01", "thread_01", &result);
        assert_eq!(afp["type"].as_str(), Some(AFP_TYPE_TOOL_VERIFICATION));
        assert_eq!(
            afp["subtype"].as_str(),
            Some(AFP_SUBTYPE_TOOL_VERIFICATION_RESULT)
        );
    }
}
