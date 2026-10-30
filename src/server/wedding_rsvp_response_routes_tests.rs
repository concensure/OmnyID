use super::wedding_rsvp_response_routes::{
    Attendance, InvitationAuthority, RecordResponseRequest, record_response_for_user,
    validate_expected_revision, validate_invitation_scope, validate_request,
};
use crate::db::Db;
use axum::http::StatusCode;
use serde_json::json;

fn request() -> RecordResponseRequest {
    RecordResponseRequest {
        wedding_plan_id: "wedding_plan:primary".into(),
        response_workspace_id: "response_workspace:primary".into(),
        invitation_id: "wedding_invitation:primary:alex:ceremony".into(),
        person_id: "wedding_guest:primary:alex".into(),
        event_id: "wedding_event:primary:ceremony".into(),
        attendance: Attendance::Attending,
        expected_revision: 1,
        idempotency_key: "rsvp-save:alex:ceremony:2".into(),
        private_answers_ciphertext: Some("encrypted:v1:opaque-envelope".into()),
    }
}

fn authority() -> InvitationAuthority {
    InvitationAuthority {
        person_id: "wedding_guest:primary:alex".into(),
        event_id: "wedding_event:primary:ceremony".into(),
        invitation_status: "invited".into(),
        response_revision: 1,
        locked_at: None,
        plus_one_allowed: false,
        children_invited: true,
    }
}

#[test]
fn accepts_a_bounded_opaque_private_answer_envelope() {
    assert!(validate_request(&request()).is_ok());
}

#[test]
fn rejects_empty_or_oversized_private_answer_envelopes() {
    let mut empty = request();
    empty.private_answers_ciphertext = Some(String::new());
    assert_eq!(
        validate_request(&empty).unwrap_err().0,
        StatusCode::BAD_REQUEST
    );

    let mut oversized = request();
    oversized.private_answers_ciphertext = Some("x".repeat(32 * 1024 + 1));
    assert_eq!(
        validate_request(&oversized).unwrap_err().0,
        StatusCode::BAD_REQUEST
    );

    let mut plaintext = request();
    plaintext.private_answers_ciphertext = Some("Guest has a severe nut allergy".into());
    assert_eq!(
        validate_request(&plaintext).unwrap_err().0,
        StatusCode::BAD_REQUEST
    );
}

#[test]
fn rejects_stale_revisions_before_append() {
    assert!(validate_expected_revision(2, 2).is_ok());
    assert_eq!(
        validate_expected_revision(1, 2).unwrap_err().0,
        StatusCode::CONFLICT
    );
}

#[test]
fn rejects_cross_person_and_cross_event_invitation_references() {
    let mut wrong_person = authority();
    wrong_person.person_id = "wedding_guest:primary:someone-else".into();
    assert_eq!(
        validate_invitation_scope(&request(), &wrong_person)
            .unwrap_err()
            .0,
        StatusCode::FORBIDDEN
    );

    let mut wrong_event = authority();
    wrong_event.event_id = "wedding_event:primary:reception".into();
    assert_eq!(
        validate_invitation_scope(&request(), &wrong_event)
            .unwrap_err()
            .0,
        StatusCode::FORBIDDEN
    );
}

#[test]
fn rejects_updates_to_a_locked_response() {
    let mut locked = authority();
    locked.locked_at = Some("2027-11-10T00:00:00Z".into());
    assert_eq!(
        validate_invitation_scope(&request(), &locked)
            .unwrap_err()
            .0,
        StatusCode::CONFLICT
    );
}

#[test]
fn denies_unknown_command_fields_instead_of_silently_ignoring_them() {
    let value = serde_json::json!({
        "wedding_plan_id": "wedding_plan:primary",
        "response_workspace_id": "response_workspace:primary",
        "invitation_id": "wedding_invitation:primary:alex:ceremony",
        "person_id": "wedding_guest:primary:alex",
        "event_id": "wedding_event:primary:ceremony",
        "attendance": "attending",
        "expected_revision": 1,
        "idempotency_key": "rsvp-save:alex:ceremony:2",
        "private_answers_ciphertext": null,
        "unexpected_answer": "please persist me"
    });
    assert!(serde_json::from_value::<RecordResponseRequest>(value).is_err());
}

async fn insert_invitation(db: &Db, table: &str, request: &RecordResponseRequest) {
    let query = format!(
        "INSERT INTO {table} (id,thread_id,from_agent,to_agents,timestamp,type,kind,subtype,content,signature,store_in_relational,metadata) VALUES ($1,'rsvp-test','test','[]'::jsonb,NOW(),'ledger','wedding_boundary_event_invitation','wedding_boundary_event_invitation',$2,'test',TRUE,$3)"
    );
    sqlx::query(&query)
        .bind(ulid::Ulid::new().to_string())
        .bind(json!({
            "ledger_kind": "wedding_boundary_event_invitation",
            "invitation_id": request.invitation_id,
            "person_id": request.person_id,
            "event_id": request.event_id,
            "invitation_status": "invited",
            "response_revision": 1,
            "locked_at": null,
            "plus_one_allowed": false,
            "children_invited": false
        }))
        .bind(json!({
            "weddingPlanId": request.wedding_plan_id,
            "responseWorkspaceId": request.response_workspace_id
        }))
        .execute(&db.pool)
        .await
        .expect("insert invitation fixture");
}

#[tokio::test]
async fn disposable_postgres_proves_tenant_replay_atomicity_and_concurrency() {
    let database_url = std::env::var("OMNYID_RSVP_TEST_DATABASE_URL")
        .or_else(|_| std::env::var("TEST_DATABASE_URL"));
    let Ok(database_url) = database_url else {
        eprintln!("OMNYID_RSVP_TEST_DATABASE_URL not set; RSVP Postgres proof skipped");
        return;
    };
    let db = Db::new(&database_url)
        .await
        .expect("connect disposable RSVP Postgres");
    let unique = ulid::Ulid::new().to_string().to_lowercase();
    let owner = format!("rsvp_owner_{unique}");
    let outsider = format!("rsvp_outsider_{unique}");
    for (user_id, label) in [(&owner, "RSVP owner"), (&outsider, "RSVP outsider")] {
        sqlx::query(
            "INSERT INTO users (id,email,auth_provider,display_name) VALUES ($1,$2,'password',$3)",
        )
        .bind(user_id)
        .bind(format!("{user_id}@example.invalid"))
        .bind(label)
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
    let owner_table = format!("\"{owner_schema}\".messages");
    let scoped = request();
    insert_invitation(&db, &owner_table, &scoped).await;

    let outsider_result = record_response_for_user(&db, &outsider, scoped.clone()).await;
    assert_eq!(outsider_result.unwrap_err().0, StatusCode::FORBIDDEN);

    let mut wrong_wedding = scoped.clone();
    wrong_wedding.wedding_plan_id = "wedding_plan:other".into();
    assert_eq!(
        record_response_for_user(&db, &owner, wrong_wedding)
            .await
            .unwrap_err()
            .0,
        StatusCode::FORBIDDEN
    );

    let first = record_response_for_user(&db, &owner, scoped.clone())
        .await
        .expect("first response");
    assert!(!first.replayed);
    assert_eq!(
        first
            .response
            .get("revision")
            .and_then(|value| value.as_i64()),
        Some(2)
    );
    assert_eq!(
        first.impact_receipt.get("response_id"),
        first.response.get("response_id")
    );

    let replay = record_response_for_user(&db, &owner, scoped.clone())
        .await
        .expect("exact replay");
    assert!(replay.replayed);
    assert_eq!(
        replay.response.get("response_id"),
        first.response.get("response_id")
    );

    let mut changed_replay = scoped.clone();
    changed_replay.attendance = Attendance::NotAttending;
    assert_eq!(
        record_response_for_user(&db, &owner, changed_replay)
            .await
            .unwrap_err()
            .0,
        StatusCode::CONFLICT
    );

    let mut left = scoped.clone();
    left.expected_revision = 2;
    left.idempotency_key = format!("rsvp-concurrent-left:{unique}");
    let mut right = left.clone();
    right.idempotency_key = format!("rsvp-concurrent-right:{unique}");
    right.attendance = Attendance::NotAttending;
    let (left_result, right_result) = tokio::join!(
        record_response_for_user(&db, &owner, left),
        record_response_for_user(&db, &owner, right),
    );
    assert!(matches!(
        (&left_result, &right_result),
        (Ok(_), Err((StatusCode::CONFLICT, _))) | (Err((StatusCode::CONFLICT, _)), Ok(_))
    ));

    let response_count: i64 = sqlx::query_scalar(&format!(
        "SELECT COUNT(*) FROM {owner_table} WHERE kind='wedding_rsvp_response'"
    ))
    .fetch_one(&db.pool)
    .await
    .expect("response count");
    let receipt_count: i64 = sqlx::query_scalar(&format!(
        "SELECT COUNT(*) FROM {owner_table} WHERE kind='wedding_rsvp_impact_receipt'"
    ))
    .fetch_one(&db.pool)
    .await
    .expect("receipt count");
    assert_eq!(response_count, 2);
    assert_eq!(receipt_count, response_count);

    sqlx::raw_sql(&format!("DROP SCHEMA IF EXISTS \"{owner_schema}\" CASCADE"))
        .execute(&db.pool)
        .await
        .expect("drop owner schema");
    sqlx::raw_sql(&format!(
        "DROP SCHEMA IF EXISTS \"{outsider_schema}\" CASCADE"
    ))
    .execute(&db.pool)
    .await
    .expect("drop outsider schema");
    sqlx::query("DELETE FROM users WHERE id=ANY($1)")
        .bind(vec![owner, outsider])
        .execute(&db.pool)
        .await
        .expect("remove disposable RSVP users");
}
