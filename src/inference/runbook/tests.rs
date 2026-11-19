use super::*;
fn request() -> ModelRequest {
    let schema = "runbook_classification_v1";
    ModelRequest {
        model: BASE_MODEL.into(),
        effort: Effort::Low,
        prompt_version: PROMPT_VERSION.into(),
        system_prefix: PREFIX.into(),
        cache_key: crate::runbook_store::digest(&json!([
            "owner",
            PROMPT_VERSION,
            PREFIX,
            schema,
            BASE_MODEL
        ])),
        schema: schema.into(),
        output_schema: output_schema(StepKind::Classify).unwrap(),
        input: json!({"text":"untrusted"}),
        source_refs: vec!["private_message:source".into()],
        max_output_tokens: 128,
        max_cost_microunits: 100_000,
    }
}
fn response() -> Value {
    json!({"model":BASE_MODEL,"choices":[{"finish_reason":"stop","message":{"role":"assistant","content":"{}"}}],
        "usage":{"prompt_tokens":100,"completion_tokens":10}})
}
#[test]
fn owner_schema_prefix_and_escalation_are_bound_before_dispatch() {
    let mut r = request();
    assert!(validate_request("owner", false, &r).is_ok());
    assert!(validate_request("other", false, &r).is_err());
    r.model = ESCALATION_MODEL.into();
    r.effort = Effort::Medium;
    r.cache_key = crate::runbook_store::digest(&json!([r.cache_key, ESCALATION_MODEL]));
    assert!(validate_request("owner", false, &r).is_err());
    assert!(validate_request("owner", true, &r).is_ok());
    r.effort = Effort::Low;
    assert!(validate_request("owner", true, &r).is_err());
    for field in ["schema", "prefix", "sources", "limit"] {
        let mut r = request();
        match field {
            "schema" => r.output_schema = json!({}),
            "prefix" => r.system_prefix = "injected".into(),
            "sources" => r.source_refs = vec!["message:public".into()],
            _ => r.max_output_tokens = 8193,
        }
        assert!(validate_request("owner", true, &r).is_err());
    }
}
#[test]
fn structured_body_sets_effort_limits_privacy_and_no_tools() {
    let b = body(&request());
    assert_eq!(b["reasoning_effort"], "low");
    assert_eq!(b["max_completion_tokens"], 128);
    assert_eq!(b["store"], false);
    assert_eq!(b["service_tier"], "default");
    assert_eq!(b["response_format"]["json_schema"]["strict"], true);
    assert!(b.get("tools").is_none() && b.get("temperature").is_none());
}
#[test]
fn response_requires_exact_model_complete_text_usage_and_standard_tier() {
    let r = request();
    let decoded = transport::decode(&response(), &r).unwrap();
    assert_eq!(decoded.cost_microunits, 18);
    for field in [
        "model", "usage", "finish", "tools", "role", "tier", "negative", "overflow",
    ] {
        let mut v = response();
        match field {
            "model" => v["model"] = json!("other"),
            "usage" => v["usage"] = Value::Null,
            "finish" => v["choices"][0]["finish_reason"] = json!("length"),
            "tools" => v["choices"][0]["message"]["tool_calls"] = json!([]),
            "role" => v["choices"][0]["message"]["role"] = json!("tool"),
            "tier" => v["service_tier"] = json!("fast"),
            "negative" => v["usage"]["prompt_tokens"] = json!(-1),
            _ => v["usage"]["completion_tokens"] = json!(129),
        }
        assert!(transport::decode(&v, &r).is_err());
    }
}
#[tokio::test]
async fn loopback_transport_sends_one_exact_request_and_budget_denial_sends_nothing() {
    use std::sync::{
        Arc,
        atomic::{AtomicUsize, Ordering},
    };
    let calls = Arc::new(AtomicUsize::new(0));
    let count = calls.clone();
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let endpoint = format!("http://{}/chat/completions", listener.local_addr().unwrap());
    let app = axum::Router::new().route(
        "/chat/completions",
        axum::routing::post(
            move |h: axum::http::HeaderMap, axum::Json(b): axum::Json<Value>| {
                let count = count.clone();
                async move {
                    count.fetch_add(1, Ordering::SeqCst);
                    assert_eq!(h["authorization"], "Bearer dummy-key");
                    assert_eq!(b, body(&request()));
                    axum::Json(response())
                }
            },
        ),
    );
    let task = tokio::spawn(async move {
        axum::serve(listener, app).await.unwrap();
    });
    let r = request();
    transport::call(&endpoint, "dummy-key", &r).await.unwrap();
    let mut low = r;
    low.max_cost_microunits = 1;
    assert!(matches!(
        transport::call(&endpoint, "dummy-key", &low).await,
        Err(ModelFailure::CostCeiling)
    ));
    assert_eq!(calls.load(Ordering::SeqCst), 1);
    task.abort();
}
#[tokio::test]
async fn redirects_and_oversized_responses_are_not_followed_or_retried() {
    use std::sync::{
        Arc,
        atomic::{AtomicUsize, Ordering},
    };
    let calls = Arc::new(AtomicUsize::new(0));
    let count = calls.clone();
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let base = format!("http://{}", listener.local_addr().unwrap());
    let app = axum::Router::new()
        .route(
            "/redirect",
            axum::routing::post(|| async { axum::response::Redirect::temporary("/target") }),
        )
        .route(
            "/target",
            axum::routing::post(move || {
                let count = count.clone();
                async move {
                    count.fetch_add(1, Ordering::SeqCst);
                    axum::Json(response())
                }
            }),
        )
        .route(
            "/huge",
            axum::routing::post(|| async { axum::Json(json!({"text":"x".repeat(70000)})) }),
        );
    let task = tokio::spawn(async move {
        axum::serve(listener, app).await.unwrap();
    });
    for path in ["redirect", "huge"] {
        assert!(
            transport::call(&format!("{base}/{path}"), "dummy-key", &request())
                .await
                .is_err()
        );
    }
    assert_eq!(calls.load(Ordering::SeqCst), 0);
    task.abort();
}


#[test]
fn provider_schema_omits_unique_items_but_local_acceptance_rejects_duplicates() {
    for kind in [StepKind::Classify, StepKind::Reason, StepKind::Draft] {
        let schema = output_schema(kind).unwrap();
        assert!(!schema.to_string().contains("uniqueItems"));
    }
    let schema = output_schema(StepKind::Draft).unwrap();
    assert_eq!(schema["properties"]["protocol"]["type"], "string");
    assert_eq!(schema["properties"]["content"]["properties"]["requires_approval"]["enum"], json!([true]));
    let result = crate::runbook_llm_step::output(
        &json!({"label":"relevant","confidence_bps":9000,"source_refs":["private_message:source","private_message:source"]}).to_string(),
        "runbook_classification_v1", &["private_message:source".into()], 8000,
    );
    assert!(matches!(result, Err(ModelFailure::InvalidSchema)));
}
