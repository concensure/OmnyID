//! Local socket fixtures only; no external provider, account credential or database.
use omnyid_homeserver::mcp_client::bounded::{CallFailure, CallLimits, CallOutcome, call_tool};
use serde_json::{Value, json};
use std::time::Duration;
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::TcpListener,
};

struct Reply {
    first: String,
    delay: Duration,
    last: String,
}
impl From<String> for Reply {
    fn from(first: String) -> Self {
        Self {
            first,
            delay: Duration::ZERO,
            last: String::new(),
        }
    }
}
fn response(body: &str) -> String {
    format!(
        "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.len()
    )
}
fn success(v: &Value) -> String {
    json!({"jsonrpc":"2.0","id":v["id"],"result":{"structuredContent":{"limit":0}}}).to_string()
}
async fn server<F>(reply: F) -> (String, tokio::task::JoinHandle<Value>)
where
    F: FnOnce(&Value) -> Reply + Send + 'static,
{
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let endpoint = format!("http://{}/mcp", listener.local_addr().unwrap());
    let task = tokio::spawn(async move {
        let (mut stream, _) = listener.accept().await.unwrap();
        let mut bytes = Vec::new();
        let boundary = loop {
            let mut chunk = [0; 1024];
            let n = stream.read(&mut chunk).await.unwrap();
            assert!(n > 0);
            bytes.extend_from_slice(&chunk[..n]);
            if let Some(i) = bytes.windows(4).position(|w| w == b"\r\n\r\n") {
                break i + 4;
            }
            assert!(bytes.len() < 16384);
        };
        let headers = String::from_utf8(bytes[..boundary].to_vec()).unwrap();
        let length: usize = headers
            .lines()
            .find_map(|line| {
                let (name, v) = line.split_once(':')?;
                name.eq_ignore_ascii_case("content-length")
                    .then(|| v.trim().parse().unwrap())
            })
            .unwrap();
        assert!(length <= 65536);
        while bytes.len() < boundary + length {
            let mut chunk = [0; 4096];
            let n = stream.read(&mut chunk).await.unwrap();
            assert!(n > 0);
            bytes.extend_from_slice(&chunk[..n]);
        }
        let payload: Value = serde_json::from_slice(&bytes[boundary..boundary + length]).unwrap();
        let reply = reply(&payload);
        let _ = stream.write_all(reply.first.as_bytes()).await;
        tokio::time::sleep(reply.delay).await;
        let _ = stream.write_all(reply.last.as_bytes()).await;
        drop(stream);
        assert!(
            tokio::time::timeout(Duration::from_millis(80), listener.accept())
                .await
                .is_err(),
            "transport retried"
        );
        json!({"headers":headers,"payload":payload})
    });
    (endpoint, task)
}
fn limits() -> CallLimits {
    CallLimits {
        timeout: Duration::from_secs(2),
        response_bytes: 65536,
    }
}
async fn failure(endpoint: &str, limits: CallLimits) -> CallFailure {
    match call_tool(endpoint, None, "read", &json!({"limit":0}), limits).await {
        Ok(_) => panic!("expected rejection"),
        Err(e) => e,
    }
}
#[tokio::test]
async fn exact_request_and_correlated_structured_response() {
    let (url, server) = server(|v| response(&success(v)).into()).await;
    let result = call_tool(
        &url,
        Some("dummy-test-key"),
        "read",
        &json!({"limit":0}),
        limits(),
    )
    .await
    .unwrap();
    assert_eq!(result.result(), &json!({"structuredContent":{"limit":0}}));
    let request = server.await.unwrap();
    let body = &request["payload"];
    assert_eq!(body["jsonrpc"], "2.0");
    assert_eq!(body["method"], "tools/call");
    assert_eq!(
        body["params"],
        json!({"name":"read","arguments":{"limit":0}})
    );
    assert_eq!(body.as_object().unwrap().len(), 4);
    assert_eq!(body["id"].as_str().unwrap().len(), 26);
    let h = request["headers"].as_str().unwrap().to_ascii_lowercase();
    assert!(h.contains("authorization: bearer dummy-test-key"));
    assert!(h.contains("x-api-key: dummy-test-key"));
    assert!(h.contains("accept-encoding: identity"));
}
#[tokio::test]
async fn invalid_requests_are_not_sent_and_errors_never_include_secrets() {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let url = format!("http://{}/mcp", listener.local_addr().unwrap());
    for (key, cap, args, policy) in [
        (
            Some("secret\r\nInjected: value"),
            "read",
            json!({}),
            limits(),
        ),
        (None, "read now", json!({}), limits()),
        (None, "read", json!([]), limits()),
        (None, "read", json!({"x":"x".repeat(32769)}), limits()),
        (
            None,
            "read",
            json!({}),
            CallLimits {
                timeout: Duration::ZERO,
                ..limits()
            },
        ),
        (
            None,
            "read",
            json!({}),
            CallLimits {
                response_bytes: 65537,
                ..limits()
            },
        ),
    ] {
        let e = match call_tool(&url, key, cap, &args, policy).await {
            Err(e) => e,
            Ok(_) => panic!(),
        };
        assert_eq!(e.outcome, CallOutcome::NotSent);
        assert!(!format!("{e:?}").contains("secret"));
    }
    for endpoint in [
        "http://10.0.0.1/mcp",
        "https://user:secret@example.invalid/mcp",
        "https://example.invalid/mcp#fragment",
    ] {
        assert_eq!(
            failure(endpoint, limits()).await.outcome,
            CallOutcome::NotSent
        );
    }
    assert!(
        tokio::time::timeout(Duration::from_millis(80), listener.accept())
            .await
            .is_err()
    );
}
#[tokio::test]
async fn redirects_and_http_failures_do_not_retry_or_forward_credentials() {
    let target = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let location = format!("http://{}/stolen", target.local_addr().unwrap());
    let (url, task) = server(move |_| {
        format!(
            "HTTP/1.1 307 Temporary Redirect\r\nLocation: {location}\r\nContent-Length: 0\r\n\r\n"
        )
        .into()
    })
    .await;
    let err = match call_tool(&url, Some("dummy-secret"), "read", &json!({}), limits()).await {
        Err(e) => e,
        Ok(_) => panic!(),
    };
    assert_eq!(err.code, "tool_http_failed");
    assert_eq!(err.outcome, CallOutcome::Unknown);
    task.await.unwrap();
    assert!(
        tokio::time::timeout(Duration::from_millis(80), target.accept())
            .await
            .is_err()
    );
    for status in [429, 500, 503] {
        let (url, task) = server(move |_| {
            format!("HTTP/1.1 {status} Error\r\nContent-Length: 13\r\n\r\nprivate-error").into()
        })
        .await;
        let err = failure(&url, limits()).await;
        assert_eq!(err.code, "tool_http_failed");
        assert!(!format!("{err:?}").contains("private"));
        task.await.unwrap();
    }
}
#[tokio::test]
async fn content_length_and_chunked_overflow_are_bounded() {
    for raw in [
        "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: 9999999\r\n\r\n"
            .to_owned(),
        format!(
            "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nTransfer-Encoding: chunked\r\n\r\n{:X}\r\n{}\r\n0\r\n\r\n",
            257,
            "x".repeat(257)
        ),
    ] {
        let (url, task) = server(move |_| raw.into()).await;
        let err = failure(
            &url,
            CallLimits {
                response_bytes: 256,
                ..limits()
            },
        )
        .await;
        assert_eq!(err.code, "tool_response_too_large");
        assert_eq!(err.outcome, CallOutcome::Unknown);
        task.await.unwrap();
    }
}
#[tokio::test]
async fn one_deadline_covers_stalled_headers_and_stalled_body() {
    for first in [
        String::new(),
        "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: 100\r\n\r\n{".into(),
    ] {
        let (url, task) = server(move |_| Reply {
            first,
            delay: Duration::from_millis(400),
            last: String::new(),
        })
        .await;
        let start = std::time::Instant::now();
        let err = failure(
            &url,
            CallLimits {
                timeout: Duration::from_millis(100),
                ..limits()
            },
        )
        .await;
        assert_eq!(err.outcome, CallOutcome::Unknown);
        assert!(start.elapsed() < Duration::from_secs(1));
        task.await.unwrap();
    }
}
#[tokio::test]
async fn malformed_mismatched_duplicate_and_provider_error_envelopes_fail_closed() {
    for case in 0..10 {
        let (url, task)=server(move |v| {
            let id=v["id"].as_str().unwrap();
            let body=match case {
                0=>json!({"jsonrpc":"2.0","id":"foreign","result":{}}).to_string(),
                1=>json!({"jsonrpc":"1.0","id":id,"result":{}}).to_string(),
                2=>json!({"jsonrpc":"2.0","id":id,"error":{"message":"private"}}).to_string(),
                3=>json!({"jsonrpc":"2.0","id":id,"result":{},"extra":true}).to_string(),
                4=>format!("{{\"jsonrpc\":\"2.0\",\"id\":\"{id}\",\"id\":\"{id}\",\"result\":{{}}}}"),
                5=>format!("{{\"jsonrpc\":\"2.0\",\"id\":\"{id}\",\"result\":{{\"structuredContent\":{{\"x\":1,\"x\":2}}}}}}"),
                6=>format!("{} trailing",success(v)),
                7=>"[1,2,3]".into(),
                8=>json!({"jsonrpc":"2.0","id":3,"result":{}}).to_string(),
                _=>"{".into(),
            };response(&body).into()
        }).await;
        assert_eq!(failure(&url, limits()).await.outcome, CallOutcome::Unknown);
        task.await.unwrap();
    }
}
#[tokio::test]
async fn unsupported_streaming_and_encoded_content_are_rejected() {
    for headers in [
        "Content-Type: text/event-stream",
        "Content-Type: application/json\r\nContent-Encoding: gzip",
        "Content-Type: text/plain",
    ] {
        let (url, task) = server(move |_| {
            format!("HTTP/1.1 200 OK\r\n{headers}\r\nContent-Length: 2\r\n\r\n{{}}").into()
        })
        .await;
        assert_eq!(failure(&url, limits()).await.outcome, CallOutcome::Unknown);
        task.await.unwrap();
    }
}
