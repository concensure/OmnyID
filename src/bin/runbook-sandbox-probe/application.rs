//! Synthetic HTTP acceptance in the already guarded disposable probe process.
use super::*;
use omnyid_homeserver::db::AuthSessionRecord;
use sha2::{Digest, Sha256};

async fn session(db: &Db, owner: &str, old: bool) -> String {
    let token = Ulid::new().to_string();
    db.create_session(&AuthSessionRecord {
        token: token.clone(),
        user_id: owner.into(),
        created_at: (Utc::now() - chrono::Duration::hours(if old { 2 } else { 0 })).to_rfc3339(),
        expires_at: (Utc::now() + chrono::Duration::hours(1)).to_rfc3339(),
    })
    .await
    .unwrap();
    token
}

pub async fn run(db: &Db, url: &str, key: &[u8; 32], token: &str) {
    let root = std::env::var("SANDBOX_ROOT_KEY").unwrap();
    let encryption: [u8; 32] = hex::decode(&root).unwrap().try_into().unwrap();
    let store = RunbookStore::new(db, encryption, [32; 32]);
    let owner = user(db).await;
    let foreign = user(db).await;
    let id = setup(db, &store, &owner, key, token).await;
    let registry = store.registry(&owner).await.unwrap();
    let definition = &registry.get("sandbox_marker").unwrap().definition;
    let cohort = json!({"expires_at":Utc::now()+chrono::Duration::minutes(5),"members":[{
        "owner":owner,"runbook_id":definition.runbook_id,"version":definition.version,"step_id":"tool",
        "definition_sha256":hex::encode(Sha256::digest(json!(definition).to_string().as_bytes()))}]}).to_string();
    // Dedicated disposable process; configure before starting its HTTP application.
    unsafe {
        for (name, value) in [
            ("OMNYID_RUNBOOK_MANAGEMENT_ENABLED", "true"),
            ("OMNYID_RUNBOOK_TOOL_REVIEW_ENABLED", "true"),
            ("OMNYID_RUNBOOK_TOOL_EXECUTION_ENABLED", "true"),
            ("OMNYID_RUNBOOK_TOOL_SANDBOX_ENABLED", "true"),
            ("OMNYID_SECRET_MANAGER_BACKEND", "env"),
            ("OMNYID_RUNBOOK_TOOL_EXECUTION_COHORT", cohort.as_str()),
            ("OMNYID_ENCRYPTION_KEY_HEX", root.as_str()),
            ("OMNYID_SIGNING_KEY_HEX", hex::encode([32; 32]).as_str()),
        ] {
            std::env::set_var(name, value);
        }
    }
    let auth = session(db, &owner, false).await;
    let stale_auth = session(db, &owner, true).await;
    let foreign_auth = session(db, &foreign, false).await;
    let app = omnyid_homeserver::server::build_test_router(url).await;
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let base = format!("http://{}", listener.local_addr().unwrap());
    let server = tokio::spawn(async move {
        axum::serve(listener, app).await.unwrap();
    });
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .unwrap();
    let send = |path: String, auth: String, body: Value| {
        client
            .post(format!("{base}{path}"))
            .bearer_auth(auth)
            .json(&body)
            .send()
    };
    let path = format!("/runbooks/instances/{id}/tools");
    let response = send(path,auth.clone(),json!({"step_id":"tool","expected_revision":2,
        "request":{"tool_slug":"sandbox","capability":"create_marker","arguments":{"marker":"application_http","mode":"ok"}}})).await.unwrap();
    assert_eq!(response.status(), 200);
    let proposal = response.json::<Value>().await.unwrap()["proposal"]["proposal_ref"]
        .as_str()
        .unwrap()
        .to_owned();
    let execute = format!("/runbooks/instances/{id}/tools/{proposal}/execute");
    for credential in [&foreign_auth, &stale_auth] {
        assert!(
            !send(execute.clone(), credential.clone(), json!({}))
                .await
                .unwrap()
                .status()
                .is_success()
        );
    }
    assert!(
        !send(execute.clone(), auth.clone(), json!({}))
            .await
            .unwrap()
            .status()
            .is_success()
    );
    assert_eq!(effects("application_http"), 0);
    let decision = send(
        format!("/runbooks/instances/{id}/tools/{proposal}/decision"),
        auth.clone(),
        json!({"expected_revision":3,"approved":true}),
    )
    .await
    .unwrap();
    assert_eq!(decision.status(), 200);
    assert!(
        !send(execute.clone(), stale_auth, json!({}))
            .await
            .unwrap()
            .status()
            .is_success()
    );
    assert_eq!(effects("application_http"), 0);
    assert!(
        !send(
            execute.clone(),
            auth.clone(),
            json!({"endpoint":"http://untrusted.invalid"})
        )
        .await
        .unwrap()
        .status()
        .is_success()
    );
    let (first, second) = tokio::join!(
        send(execute.clone(), auth.clone(), json!({})),
        send(execute.clone(), auth.clone(), json!({}))
    );
    let first = first.unwrap();
    let second = second.unwrap();
    assert!(first.status().is_success() || second.status().is_success());
    let replay = send(execute, auth, json!({})).await.unwrap();
    assert_eq!(replay.status(), 200);
    assert_eq!(replay.headers()["cache-control"], "no-store");
    let receipt = replay.json::<Value>().await.unwrap();
    assert_eq!(receipt["receipt"]["applied"], true);
    assert_eq!(effects("application_http"), 1);
    server.abort();
    println!(
        "{}",
        json!({"case":"application_http","effects":1,"approved":true,"replay_suppressed":true,
        "cross_owner_denied":true,"stale_auth_denied":true,"missing_approval_denied":true,"request_policy_override_denied":true})
    );
}
