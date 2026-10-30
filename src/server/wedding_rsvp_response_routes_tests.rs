use super::wedding_rsvp_response_routes::{
    Attendance, InvitationAuthority, RecordResponseRequest, validate_expected_revision,
    validate_invitation_scope, validate_request,
};
use axum::http::StatusCode;

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
