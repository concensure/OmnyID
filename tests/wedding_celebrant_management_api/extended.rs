use super::*;

async fn request(
    app: &Router,
    method: &str,
    path: &str,
    auth: &str,
    cookie: &str,
    csrf: &str,
    body: Value,
) -> (StatusCode, Value, String) {
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method(method)
                .uri(path)
                .header(AUTHORIZATION, auth)
                .header("cookie", cookie)
                .header("x-csrf-token", csrf)
                .header("content-type", "application/json")
                .body(Body::from(body.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();
    let status = response.status();
    let cookie = response
        .headers()
        .get("set-cookie")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .split(';')
        .next()
        .unwrap_or("")
        .to_string();
    let bytes = response.into_body().collect().await.unwrap().to_bytes();
    (
        status,
        serde_json::from_slice(&bytes).unwrap_or(Value::Null),
        cookie,
    )
}

async fn exchange(app: &Router, link: &Value) -> (StatusCode, Value, String) {
    let token = link["management_url"]
        .as_str()
        .unwrap()
        .split("#celebrant_management=")
        .nth(1)
        .unwrap();
    request(
        app,
        "POST",
        "/api/public/wedding/celebrants/manage/exchange",
        "",
        "",
        "",
        json!({"token":token}),
    )
    .await
}

pub(super) async fn verify(
    app: &Router,
    db: &Db,
    auth: &str,
    vendor_id: &str,
    original: &Value,
    suffix: &str,
) {
    let uri = "/admin/wedding/celebrant-management/links/batch";
    let body = json!({"vendor_ids":[vendor_id],"preserve_existing":true});
    let (a, b) = tokio::join!(
        post(app, auth, uri, body.clone()),
        post(app, auth, uri, body)
    );
    assert_eq!(a.0, StatusCode::OK);
    assert_eq!(b.0, StatusCode::OK);
    assert_eq!(a.1["created"].as_array().unwrap().len(), 1);
    assert_eq!(b.1["created"].as_array().unwrap().len(), 1);
    assert_ne!(a.1["created"][0]["grant_id"], b.1["created"][0]["grant_id"]);
    // Previously issued link survives both new grants and renews only after validation.
    sqlx::query("UPDATE wedding_celebrant_management_grants SET expires_at=NOW()+INTERVAL '1 hour' WHERE grant_id=$1")
        .bind(original["grant_id"].as_str().unwrap()).execute(&db.pool).await.unwrap();
    let old = exchange(app, original).await;
    assert_eq!(old.0, StatusCode::OK);
    let renewed:bool=sqlx::query_scalar("SELECT expires_at>NOW()+INTERVAL '13 days 23 hours' AND expires_at<=NOW()+INTERVAL '14 days' FROM wedding_celebrant_management_grants WHERE grant_id=$1")
        .bind(original["grant_id"].as_str().unwrap()).fetch_one(&db.pool).await.unwrap();
    assert!(renewed);
    let second = exchange(app, &a.1["created"][0]).await;
    assert_eq!(second.0, StatusCode::OK);
    let command = "/api/public/wedding/celebrants/manage/command";
    let date = (Utc::now() + Duration::days(90)).date_naive().to_string();
    let make_body = |key: &str| json!({"operation":"date_slot_upsert","local_date":date,"date_state":"available","idempotency_key":format!("{suffix}-{key}"),"space_label":key});
    assert_eq!(
        request(app, "POST", command, "", &old.2, "", make_body("no-csrf"))
            .await
            .0,
        StatusCode::NOT_FOUND
    );
    let (one, two) = tokio::join!(
        request(
            app,
            "POST",
            command,
            "",
            &old.2,
            old.1["csrf_token"].as_str().unwrap(),
            make_body("room-one")
        ),
        request(
            app,
            "POST",
            command,
            "",
            &second.2,
            second.1["csrf_token"].as_str().unwrap(),
            make_body("room-two")
        )
    );
    assert_eq!(one.0, StatusCode::OK, "first calendar update");
    assert_eq!(two.0, StatusCode::OK, "concurrent calendar update");
    let offers:i64=sqlx::query_scalar("SELECT count(*) FROM wedding_vendor_special_offers WHERE vendor_id=$1 AND creation_idempotency_key='celebrant-unified-calendar-v1'")
        .bind(vendor_id).fetch_one(&db.pool).await.unwrap();
    assert_eq!(offers, 1);
    // Expired links cannot be revived. Keep created_at < expires_at for the constraint.
    let expired = &b.1["created"][0];
    sqlx::query("UPDATE wedding_celebrant_management_grants SET created_at=NOW()-INTERVAL '15 days',expires_at=NOW()-INTERVAL '1 day' WHERE grant_id=$1")
        .bind(expired["grant_id"].as_str().unwrap()).execute(&db.pool).await.unwrap();
    assert_eq!(exchange(app, expired).await.0, StatusCode::NOT_FOUND);
    let revoked = post(
        app,
        auth,
        &format!(
            "/admin/wedding/celebrant-management/links/{}/revoke",
            a.1["created"][0]["grant_id"].as_str().unwrap()
        ),
        json!({"vendor_id":vendor_id}),
    )
    .await;
    assert_eq!(revoked.0, StatusCode::OK);
    assert_eq!(
        exchange(app, &a.1["created"][0]).await.0,
        StatusCode::NOT_FOUND
    );
    assert_eq!(
        request(
            app,
            "POST",
            command,
            "",
            &second.2,
            second.1["csrf_token"].as_str().unwrap(),
            make_body("revoked")
        )
        .await
        .0,
        StatusCode::NOT_FOUND
    );

    // Keyset inventory spans more than one bounded page, with category isolation.
    let prefix = format!("venue-calendar-{suffix}-");
    sqlx::query("INSERT INTO wedding_vendors(vendor_id,vendor_slug,vendor_name,category,service_area,status) SELECT $1||lpad(n::text,3,'0'),$1||lpad(n::text,3,'0'),'Calendar Test Venue','Venue','Sydney','active' FROM generate_series(0,101) n")
        .bind(&prefix).execute(&db.pool).await.unwrap();
    let path = format!(
        "/admin/wedding/vendor-calendar/vendors?category=venue&after={prefix}&through={prefix}z"
    );
    let page = request(app, "GET", &path, auth, "", "", Value::Null).await;
    assert_eq!(page.0, StatusCode::OK);
    assert_eq!(page.1["items"].as_array().unwrap().len(), 100);
    let cursor = page.1["next_cursor"].as_str().unwrap();
    let page2 = request(
        app,
        "GET",
        &format!(
            "/admin/wedding/vendor-calendar/vendors?category=venue&after={cursor}&through={prefix}z"
        ),
        auth,
        "",
        "",
        Value::Null,
    )
    .await;
    assert_eq!(page2.1["items"].as_array().unwrap().len(), 2);
    assert!(page2.1["next_cursor"].is_null());
    let venue = format!("{prefix}000");
    let link = post(
        app,
        auth,
        "/admin/wedding/celebrant-management/links",
        json!({"vendor_id":venue}),
    )
    .await;
    assert_eq!(link.0, StatusCode::OK);
    let session = exchange(app, &link.1).await;
    assert_eq!(session.0, StatusCode::OK);
    let view = request(
        app,
        "GET",
        "/api/public/wedding/celebrants/manage/session",
        "",
        &session.2,
        "",
        Value::Null,
    )
    .await;
    assert_eq!(view.0, StatusCode::OK);
    assert_eq!(view.1["capabilities"]["consultation_availability"], false);
    assert!(view.1["profile"].is_null());
    assert_eq!(view.1["windows"], json!([]));
    let denied = request(
        app,
        "POST",
        command,
        "",
        &session.2,
        session.1["csrf_token"].as_str().unwrap(),
        json!({"operation":"window_add","idempotency_key":format!("{suffix}-denied")}),
    )
    .await;
    assert_eq!(denied.0, StatusCode::FORBIDDEN);
    let saved = request(
        app,
        "POST",
        command,
        "",
        &session.2,
        session.1["csrf_token"].as_str().unwrap(),
        make_body("venue-date"),
    )
    .await;
    assert_eq!(saved.0, StatusCode::OK);
    let category: String =
        sqlx::query_scalar("SELECT category FROM wedding_vendor_special_offers WHERE vendor_id=$1")
            .bind(&venue)
            .fetch_one(&db.pool)
            .await
            .unwrap();
    assert_eq!(category, "Venue");
    let public_id = format!("celebrant-search-{suffix}");
    sqlx::query("INSERT INTO wedding_vendors(vendor_id,vendor_slug,vendor_name,category,service_area,status) VALUES($1,$1,'Celebrations By Bev','Celebrant','Sydney','active')")
        .bind(&public_id).execute(&db.pool).await.unwrap();
    let default = request(
        app,
        "GET",
        "/api/public/wedding/vendors?category=celebrant&limit=500",
        "",
        "",
        "",
        Value::Null,
    )
    .await;
    assert_eq!(default.0, StatusCode::OK);
    assert!(
        !default.1["items"]
            .as_array()
            .unwrap()
            .iter()
            .any(|v| v["slug"] == public_id)
    );
    let found = request(
        app,
        "GET",
        "/api/public/wedding/vendors?q=bev&category=celebrant",
        "",
        "",
        "",
        Value::Null,
    )
    .await;
    assert_eq!(found.0, StatusCode::OK);
    assert!(
        found.1["items"]
            .as_array()
            .unwrap()
            .iter()
            .any(|v| v["slug"] == public_id)
    );
    for query in ["beva", "%25", "_"] {
        let missing = request(
            app,
            "GET",
            &format!("/api/public/wedding/vendors?q={query}&category=celebrant"),
            "",
            "",
            "",
            Value::Null,
        )
        .await;
        assert_eq!(missing.0, StatusCode::OK);
        assert!(
            !missing.1["items"]
                .as_array()
                .unwrap()
                .iter()
                .any(|v| v["slug"] == public_id)
        );
    }
}
