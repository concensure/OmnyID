use super::wedding_rsvp_capability_routes::{
    CreateRequest, token_digest, validate_create, validated_loom_url,
};
use crate::db::{Db, WeddingRsvpCapabilityGrantCreate, WeddingRsvpCapabilityGrantRotation};
use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD};
use chrono::{Duration as ChronoDuration, Utc};
use serde_json::json;
use sha2::{Digest, Sha256};

fn token_for(label: &str) -> String {
    URL_SAFE_NO_PAD.encode(Sha256::digest(label.as_bytes()))
}

async fn drop_test_schema(db: &Db, schema: &str) {
    for attempt in 0..8 {
        match sqlx::raw_sql(&format!("DROP SCHEMA IF EXISTS \"{schema}\" CASCADE"))
            .execute(&db.pool)
            .await
        {
            Ok(_) => return,
            Err(error)
                if error
                    .as_database_error()
                    .is_some_and(|value| value.code().as_deref() == Some("40P01"))
                    && attempt < 7 =>
            {
                tokio::time::sleep(std::time::Duration::from_millis(100 * (attempt + 1))).await;
            }
            Err(error) => panic!("drop RSVP capability test schema: {error:?}"),
        }
    }
    panic!("RSVP capability test schema cleanup did not complete");
}

fn create_request(expires_at: String) -> CreateRequest {
    CreateRequest {
        wedding_plan_id: "wedding_plan:primary".into(),
        response_workspace_id: "response_workspace:primary".into(),
        household_id: "wedding_household:primary:rivera".into(),
        invitation_ids: vec!["wedding_invitation:primary:alex:ceremony".into()],
        expires_at,
        request_contact_details: false,
        loom_video_url: None,
    }
}

#[test]
fn capability_tokens_require_exactly_256_bits() {
    let token = URL_SAFE_NO_PAD.encode([7_u8; 32]);
    let digest = token_digest(&token).expect("valid digest");
    assert_eq!(digest.len(), 64);
    assert!(token_digest(&URL_SAFE_NO_PAD.encode([7_u8; 31])).is_none());
    assert!(token_digest("not a capability token").is_none());
}

#[test]
fn rsvp_video_accepts_only_https_loom_share_or_embed_links() {
    assert_eq!(validated_loom_url(None).unwrap(), None);
    assert!(validated_loom_url(Some("https://www.loom.com/share/abc_123")).is_ok());
    assert!(validated_loom_url(Some("https://loom.com/embed/abc-123")).is_ok());
    assert!(validated_loom_url(Some("http://www.loom.com/share/abc")).is_err());
    assert!(validated_loom_url(Some("https://example.com/share/abc")).is_err());
}

#[test]
fn capability_creation_rejects_duplicates_and_unsafe_expiry() {
    let now = Utc::now();
    assert!(
        validate_create(
            &create_request((now + ChronoDuration::hours(1)).to_rfc3339()),
            now
        )
        .is_ok()
    );
    let mut duplicate = create_request((now + ChronoDuration::hours(1)).to_rfc3339());
    duplicate
        .invitation_ids
        .push(duplicate.invitation_ids[0].clone());
    assert!(validate_create(&duplicate, now).is_err());
    assert!(
        validate_create(
            &create_request((now + ChronoDuration::minutes(5)).to_rfc3339()),
            now
        )
        .is_err()
    );
}

async fn insert_scope_fixture(
    db: &Db,
    table: &str,
    person_id: &str,
    household_id: &str,
    invitation_id: &str,
) {
    let insert = format!(
        "INSERT INTO {table} (id,thread_id,from_agent,to_agents,timestamp,type,kind,subtype,content,signature,store_in_relational,metadata) VALUES ($1,'rsvp-capability-test','test','[]'::jsonb,NOW(),'ledger',$2,$2,$3,'test',TRUE,$4)"
    );
    let metadata = json!({
        "weddingPlanId": "wedding_plan:primary",
        "responseWorkspaceId": "response_workspace:primary"
    });
    sqlx::query(&insert)
        .bind(ulid::Ulid::new().to_string())
        .bind("wedding_boundary_guest_profile")
        .bind(json!({
            "person_id": person_id,
            "display_name": if household_id.ends_with("rivera") { "Alex Rivera" } else { "Sam Other" },
            "household_id": household_id,
            "contact_label": "private@example.invalid",
            "dietary_note": "private dietary detail"
        }))
        .bind(&metadata)
        .execute(&db.pool)
        .await
        .expect("insert guest profile");
    sqlx::query(&insert)
        .bind(ulid::Ulid::new().to_string())
        .bind("wedding_boundary_event_invitation")
        .bind(json!({
            "invitation_id": invitation_id,
            "person_id": person_id,
            "event_id": "wedding_event:primary:ceremony",
            "invitation_status": "invited",
            "response_revision": 1,
            "plus_one_allowed": false,
            "children_invited": false,
            "visible_to_guest": true
        }))
        .bind(&metadata)
        .execute(&db.pool)
        .await
        .expect("insert invitation");
}

async fn insert_setup_fixture(db: &Db, table: &str) {
    let insert = format!(
        "INSERT INTO {table} (id,thread_id,from_agent,to_agents,timestamp,type,kind,subtype,content,signature,store_in_relational,metadata) VALUES ($1,'rsvp-capability-test','test','[]'::jsonb,NOW(),'ledger','wedding_rsvp_setup','wedding_rsvp_setup',$2,'test',TRUE,$3)"
    );
    sqlx::query(&insert)
        .bind(ulid::Ulid::new().to_string())
        .bind(json!({
            "setup_id": "wedding_rsvp_setup:test:ceremony",
            "revision": 1,
            "status": "draft",
            "host_label": "Alex and Taylor",
            "event_id": "wedding_event:primary:ceremony",
            "event_label": "Wedding ceremony",
            "response_deadline": "2027-10-01",
            "encryption_key_id": "wedding-rsvp-test-key",
            "encryption_public_key_hex": "11".repeat(32),
            "questions": [
                {"id":"attendance","enabled":true,"required":true,"sensitive":false},
                {"id":"meal_choice","enabled":true,"required":true,"sensitive":false,"options":["Vegetarian","Chicken"]},
                {"id":"dietary_requirements","enabled":true,"required":false,"sensitive":true}
            ]
        }))
        .bind(json!({
            "weddingPlanId": "wedding_plan:primary",
            "responseWorkspaceId": "response_workspace:primary"
        }))
        .execute(&db.pool)
        .await
        .expect("insert RSVP setup");
}

async fn insert_response_fixture(db: &Db, table: &str, invitation_id: &str) {
    let insert = format!(
        "INSERT INTO {table} (id,thread_id,from_agent,to_agents,timestamp,type,kind,subtype,content,signature,store_in_relational,metadata) VALUES ($1,'rsvp-capability-test','test','[]'::jsonb,NOW(),'ledger','wedding_rsvp_response','wedding_rsvp_response',$2,'test',TRUE,$3)"
    );
    sqlx::query(&insert)
        .bind(ulid::Ulid::new().to_string())
        .bind(json!({
            "response_id": "wedding-rsvp-response:test",
            "invitation_id": invitation_id,
            "person_id": "wedding_guest:primary:alex",
            "event_id": "wedding_event:primary:ceremony",
            "attendance": "attending",
            "answers": {"meal_choice": "Vegetarian", "dietary_requirements": "must never escape"},
            "private_answer_question_ids": ["dietary_requirements"],
            "has_private_answers": true,
            "encrypted_private_payload": "encrypted:v1:must-never-return",
            "revision": 2,
            "responded_at": "2027-09-02T03:04:05Z"
        }))
        .bind(json!({
            "weddingPlanId": "wedding_plan:primary",
            "responseWorkspaceId": "response_workspace:primary"
        }))
        .execute(&db.pool)
        .await
        .expect("insert RSVP response");
}

#[tokio::test]
async fn disposable_postgres_proves_capability_isolation_rotation_and_revocation() {
    let database_url = std::env::var("OMNYID_RSVP_TEST_DATABASE_URL")
        .or_else(|_| std::env::var("TEST_DATABASE_URL"));
    let Ok(database_url) = database_url else {
        eprintln!("OMNYID_RSVP_TEST_DATABASE_URL not set; RSVP capability proof skipped");
        return;
    };
    let db = Db::new(&database_url)
        .await
        .expect("connect disposable RSVP Postgres");
    let unique = ulid::Ulid::new().to_string().to_lowercase();
    let owner = format!("rsvp_cap_owner_{unique}");
    let outsider = format!("rsvp_cap_outsider_{unique}");
    for user_id in [&owner, &outsider] {
        sqlx::query(
            "INSERT INTO users (id,email,auth_provider,display_name) VALUES ($1,$2,'password','RSVP capability proof')",
        )
        .bind(user_id)
        .bind(format!("{user_id}@example.invalid"))
        .execute(&db.pool)
        .await
        .expect("create disposable RSVP user");
    }
    let owner_schema = db
        .ensure_user_private_schema(&owner)
        .await
        .expect("owner private schema");
    let outsider_schema = db
        .ensure_user_private_schema(&outsider)
        .await
        .expect("outsider private schema");
    let table = format!("\"{owner_schema}\".messages");
    let invitation_id = "wedding_invitation:primary:alex:ceremony";
    let other_invitation_id = "wedding_invitation:primary:sam:ceremony";
    insert_setup_fixture(&db, &table).await;
    insert_scope_fixture(
        &db,
        &table,
        "wedding_guest:primary:alex",
        "wedding_household:primary:rivera",
        invitation_id,
    )
    .await;
    insert_scope_fixture(
        &db,
        &table,
        "wedding_guest:primary:sam",
        "wedding_household:primary:other",
        other_invitation_id,
    )
    .await;

    let token_one = token_for(&format!("{unique}:one"));
    let digest_one = token_digest(&token_one).expect("digest one");
    let expires_at = Utc::now() + ChronoDuration::days(2);
    let invalid_scope = db
        .create_wedding_rsvp_capability_grant(
            &owner,
            WeddingRsvpCapabilityGrantCreate {
                actor_user_id: owner.clone(),
                grant_id: format!("rsvp-capability-invalid-{unique}"),
                wedding_plan_id: "wedding_plan:primary".into(),
                response_workspace_id: "response_workspace:primary".into(),
                household_id: "wedding_household:primary:rivera".into(),
                invitation_ids: vec![invitation_id.into(), other_invitation_id.into()],
                token_digest: token_digest(&token_for(&format!("{unique}:invalid")))
                    .expect("invalid scope digest"),
                expires_at,
                request_contact_details: false,
                loom_video_url: None,
            },
        )
        .await
        .expect("invalid scope query");
    assert!(
        invalid_scope.is_none(),
        "cross-household scope must fail closed"
    );

    let grant_id = format!("rsvp-capability-{unique}");
    let created = db
        .create_wedding_rsvp_capability_grant(
            &owner,
            WeddingRsvpCapabilityGrantCreate {
                actor_user_id: owner.clone(),
                grant_id: grant_id.clone(),
                wedding_plan_id: "wedding_plan:primary".into(),
                response_workspace_id: "response_workspace:primary".into(),
                household_id: "wedding_household:primary:rivera".into(),
                invitation_ids: vec![invitation_id.into()],
                token_digest: digest_one.clone(),
                expires_at,
                request_contact_details: false,
                loom_video_url: None,
            },
        )
        .await
        .expect("create capability")
        .expect("valid capability scope");
    assert_eq!(created.open_count, 0);
    assert!(
        db.revoke_wedding_rsvp_capability_grant(&outsider, &outsider, &grant_id)
            .await
            .expect("outsider revoke query")
            .is_none()
    );
    assert!(
        db.list_wedding_rsvp_capability_grants(&outsider, "response_workspace:primary")
            .await
            .expect("outsider list")
            .is_empty()
    );
    insert_response_fixture(&db, &table, invitation_id).await;

    let opened = db
        .open_wedding_rsvp_capability(&digest_one)
        .await
        .expect("open capability")
        .expect("live capability");
    assert_eq!(opened.household_id, "wedding_household:primary:rivera");
    assert_eq!(opened.invitations.len(), 1);
    assert_eq!(opened.invitations[0].display_name, "Alex Rivera");
    assert_eq!(opened.host_label, "Alex and Taylor");
    assert_eq!(opened.event_label, "Wedding ceremony");
    assert_eq!(opened.questions.len(), 3);
    assert_eq!(opened.questions[2].id, "dietary_requirements");
    assert_eq!(opened.latest_responses.len(), 1);
    assert_eq!(opened.latest_responses[0].attendance, "attending");
    assert_eq!(
        opened.latest_responses[0]
            .answers
            .get("meal_choice")
            .map(String::as_str),
        Some("Vegetarian")
    );
    assert_eq!(
        opened.latest_responses[0].private_answer_question_ids,
        vec!["dietary_requirements"]
    );
    assert!(opened.latest_responses[0].complete);
    let opened_json = serde_json::to_string(&opened).expect("serialize safe scope");
    assert!(!opened_json.contains("private@example.invalid"));
    assert!(!opened_json.contains("private dietary detail"));
    assert!(!opened_json.contains("must never escape"));
    assert!(!opened_json.contains("must-never-return"));
    let (left, right) = tokio::join!(
        db.open_wedding_rsvp_capability(&digest_one),
        db.open_wedding_rsvp_capability(&digest_one),
    );
    assert!(left.expect("left replay").is_some());
    assert!(right.expect("right replay").is_some());

    let collision = db
        .create_wedding_rsvp_capability_grant(
            &owner,
            WeddingRsvpCapabilityGrantCreate {
                actor_user_id: owner.clone(),
                grant_id: format!("rsvp-capability-collision-{unique}"),
                wedding_plan_id: "wedding_plan:primary".into(),
                response_workspace_id: "response_workspace:primary".into(),
                household_id: "wedding_household:primary:rivera".into(),
                invitation_ids: vec![invitation_id.into()],
                token_digest: digest_one.clone(),
                expires_at,
                request_contact_details: false,
                loom_video_url: None,
            },
        )
        .await;
    assert!(collision.is_err(), "digest collision must be rejected");

    let token_two = token_for(&format!("{unique}:two"));
    let digest_two = token_digest(&token_two).expect("digest two");
    let rotated = db
        .rotate_wedding_rsvp_capability_grant(
            &owner,
            WeddingRsvpCapabilityGrantRotation {
                actor_user_id: owner.clone(),
                source_grant_id: grant_id.clone(),
                grant_id: format!("rsvp-capability-rotated-{unique}"),
                token_digest: digest_two.clone(),
                expires_at,
            },
        )
        .await
        .expect("rotate capability")
        .expect("live source capability");
    assert!(
        db.open_wedding_rsvp_capability(&digest_one)
            .await
            .expect("old open")
            .is_none()
    );
    assert!(
        db.open_wedding_rsvp_capability(&digest_two)
            .await
            .expect("new open")
            .is_some()
    );
    db.revoke_wedding_rsvp_capability_grant(&owner, &owner, &rotated.grant_id)
        .await
        .expect("revoke rotated capability")
        .expect("rotated capability exists");
    assert!(
        db.open_wedding_rsvp_capability(&digest_two)
            .await
            .expect("revoked open")
            .is_none()
    );

    let token_three = token_for(&format!("{unique}:three"));
    let digest_three = token_digest(&token_three).expect("digest three");
    let expiring_id = format!("rsvp-capability-expiring-{unique}");
    db.create_wedding_rsvp_capability_grant(
        &owner,
        WeddingRsvpCapabilityGrantCreate {
            actor_user_id: owner.clone(),
            grant_id: expiring_id.clone(),
            wedding_plan_id: "wedding_plan:primary".into(),
            response_workspace_id: "response_workspace:primary".into(),
            household_id: "wedding_household:primary:rivera".into(),
            invitation_ids: vec![invitation_id.into()],
            token_digest: digest_three.clone(),
            expires_at,
            request_contact_details: false,
            loom_video_url: None,
        },
    )
    .await
    .expect("create expiring capability")
    .expect("valid expiring scope");
    sqlx::query(
        "UPDATE wedding_rsvp_capability_grants SET created_at=NOW()-INTERVAL '2 days',expires_at=NOW()-INTERVAL '1 day' WHERE grant_id=$1",
    )
    .bind(&expiring_id)
    .execute(&db.pool)
    .await
    .expect("expire disposable capability");
    assert!(
        db.open_wedding_rsvp_capability(&digest_three)
            .await
            .expect("expired open")
            .is_none()
    );
    let expired_recorded: bool = sqlx::query_scalar(
        "SELECT expired_event_at IS NOT NULL FROM wedding_rsvp_capability_grants WHERE grant_id=$1",
    )
    .bind(&expiring_id)
    .fetch_one(&db.pool)
    .await
    .expect("expiry audit marker");
    assert!(expired_recorded);

    let audit_events = sqlx::query_scalar::<_, serde_json::Value>(&format!(
        "SELECT content FROM {table} WHERE metadata->>'origin'='wedding_rsvp_capability' ORDER BY timestamp,id"
    ))
    .fetch_all(&db.pool)
    .await
    .expect("capability AFP audit events");
    assert!(audit_events.len() >= 8);
    let audit_json = serde_json::to_string(&audit_events).expect("serialize capability audit");
    for secret in [
        digest_one.clone(),
        digest_two.clone(),
        digest_three.clone(),
        token_one,
        token_two,
        token_three,
    ] {
        assert!(
            !audit_json.contains(&secret),
            "AFP must not contain capability secrets"
        );
    }

    sqlx::query("DELETE FROM users WHERE id=ANY($1)")
        .bind(vec![owner, outsider])
        .execute(&db.pool)
        .await
        .expect("remove disposable RSVP capability users");
    drop_test_schema(&db, &owner_schema).await;
    drop_test_schema(&db, &outsider_schema).await;
}
