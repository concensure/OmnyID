use std::{collections::BTreeMap, sync::Arc};

use axum::{
    Json, Router,
    extract::{Query, Request, State},
    http::{HeaderMap, StatusCode},
    routing::{get, post},
};
use serde::Deserialize;
use serde_json::{Map, Value, json};
use sqlx::{Postgres, Row, Transaction};
use ulid::Ulid;

use super::{
    AppState, VendorAccess, VendorPermission, clean, database_failure, dedupe_key,
    record_portal_event, require_vendor_access,
};

const VISIBILITY_FIELDS: [&str; 7] = [
    "description",
    "email",
    "phone",
    "website_url",
    "instagram_url",
    "facebook_url",
    "photos",
];

#[derive(Deserialize)]
struct VendorQuery {
    vendor_slug: String,
}

#[derive(Deserialize)]
struct PublicationSubmit {
    vendor_slug: String,
    expected_revision: u64,
    visibility: Value,
    idempotency_key: String,
}

#[derive(Deserialize)]
struct PublicationDecision {
    revision_id: String,
    decision: String,
    note: String,
}

pub(super) fn routes() -> Router<Arc<AppState>> {
    Router::new()
        .route(
            "/api/wedding/vendor/portal/publication",
            get(publication_http),
        )
        .route(
            "/api/wedding/vendor/portal/publication/submit",
            post(submit_publication_http),
        )
        .route(
            "/admin/wedding/vendor/portal/publication/decision",
            post(publication_decision_http),
        )
        .route(
            "/admin/wedding/vendor/portal/publication/pending",
            get(pending_publications_http),
        )
}

async fn pending_publications_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, String)> {
    let operator = super::super::auth::authenticated_user(&state.db, &headers).await?;
    if !super::super::cost_controls::operator_access_allowed(&operator.email) {
        return Err((StatusCode::FORBIDDEN, "Operator access required.".into()));
    }
    let rows = sqlx::query(
        r#"SELECT r.revision_id,r.profile_revision,r.snapshot,r.visibility,
                  r.submitted_at::text AS submitted_at,v.vendor_slug,v.vendor_name,v.category
           FROM wedding_vendor_publication_revisions r
           JOIN wedding_vendors v ON v.vendor_id=r.vendor_id
           WHERE r.status='pending_review' ORDER BY r.submitted_at LIMIT 100"#,
    )
    .fetch_all(&state.db.pool)
    .await
    .map_err(database_failure)?;
    let items = rows.into_iter().map(|row| json!({
        "revision_id":row.get::<String,_>("revision_id"),
        "profile_revision":row.get::<i64,_>("profile_revision"),
        "snapshot":row.get::<Value,_>("snapshot"),"visibility":row.get::<Value,_>("visibility"),
        "submitted_at":row.get::<String,_>("submitted_at"),"vendor_slug":row.get::<String,_>("vendor_slug"),
        "vendor_name":row.get::<String,_>("vendor_name"),"category":row.get::<String,_>("category"),
    })).collect::<Vec<_>>();
    Ok(Json(json!({"items":items})))
}

async fn publication_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Query(query): Query<VendorQuery>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let (_user, access) =
        require_vendor_access(&state, &headers, &query.vendor_slug, VendorPermission::View).await?;
    ensure_profile(&state, &access.vendor_id).await?;
    let profile = sqlx::query(
        r#"SELECT description,public_contact,draft_revision,published_revision,
                  published_description,published_public_contact,publication_visibility,
                  published_at::text AS published_at
           FROM wedding_vendor_owner_profile WHERE vendor_id=$1"#,
    )
    .bind(&access.vendor_id)
    .fetch_one(&state.db.pool)
    .await
    .map_err(database_failure)?;
    let revisions = sqlx::query(
        r#"SELECT revision_id,profile_revision,status,moderation_required,
                  submitted_at::text AS submitted_at,reviewed_at::text AS reviewed_at,
                  published_at::text AS revision_published_at,review_note
           FROM wedding_vendor_publication_revisions
           WHERE vendor_id=$1 ORDER BY submitted_at DESC LIMIT 20"#,
    )
    .bind(&access.vendor_id)
    .fetch_all(&state.db.pool)
    .await
    .map_err(database_failure)?
    .into_iter()
    .map(|row| {
        json!({
            "revision_id":row.get::<String,_>("revision_id"),
            "profile_revision":row.get::<i64,_>("profile_revision"),
            "status":row.get::<String,_>("status"),
            "moderation_required":row.get::<bool,_>("moderation_required"),
            "submitted_at":row.get::<String,_>("submitted_at"),
            "reviewed_at":row.get::<Option<String>,_>("reviewed_at"),
            "published_at":row.get::<Option<String>,_>("revision_published_at"),
            "review_note":row.get::<Option<String>,_>("review_note"),
        })
    })
    .collect::<Vec<_>>();
    Ok(Json(json!({
        "vendor": super::portal_summary(&access),
        "draft": {
            "revision": profile.get::<i64,_>("draft_revision"),
            "description": profile.get::<Option<String>,_>("description"),
            "public_contact": profile.get::<Value,_>("public_contact"),
        },
        "published": {
            "revision": profile.get::<Option<i64>,_>("published_revision"),
            "description": profile.get::<Option<String>,_>("published_description"),
            "public_contact": profile.get::<Value,_>("published_public_contact"),
            "visibility": profile.get::<Value,_>("publication_visibility"),
            "published_at": profile.get::<Option<String>,_>("published_at"),
        },
        "revisions": revisions,
    })))
}

async fn submit_publication_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(body): Json<PublicationSubmit>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let (user, access) = require_vendor_access(
        &state,
        &headers,
        &body.vendor_slug,
        VendorPermission::Publish,
    )
    .await?;
    let visibility = normalized_visibility(&body.visibility)?;
    let dedupe = dedupe_key(&body.idempotency_key)?;
    ensure_profile(&state, &access.vendor_id).await?;
    let mut tx = state.db.pool.begin().await.map_err(database_failure)?;
    if let Some(row) = sqlx::query(
        "SELECT subject_ref FROM wedding_vendor_portal_events WHERE vendor_id=$1 AND event_kind='publication_submitted' AND dedupe_key=$2",
    )
    .bind(&access.vendor_id)
    .bind(&dedupe)
    .fetch_optional(&mut *tx)
    .await
    .map_err(database_failure)?
    {
        tx.rollback().await.ok();
        return Ok(Json(json!({"revision_id":row.get::<Option<String>,_>("subject_ref"),"replayed":true})));
    }
    let row = sqlx::query(
        r#"SELECT description,public_contact,draft_revision,published_description
           FROM wedding_vendor_owner_profile WHERE vendor_id=$1 FOR UPDATE"#,
    )
    .bind(&access.vendor_id)
    .fetch_one(&mut *tx)
    .await
    .map_err(database_failure)?;
    let actual = row.get::<i64, _>("draft_revision");
    if actual != body.expected_revision as i64 {
        return Err((
            StatusCode::CONFLICT,
            "This profile changed in another session. Refresh before publishing.".into(),
        ));
    }
    let description = row.get::<Option<String>, _>("description");
    let contact = row.get::<Value, _>("public_contact");
    let snapshot = json!({"description":description,"public_contact":contact});
    let previous_description = row.get::<Option<String>, _>("published_description");
    let moderation_required = description.as_deref().unwrap_or_default().trim()
        != previous_description.as_deref().unwrap_or_default().trim();
    let status = if moderation_required {
        "pending_review"
    } else {
        "published"
    };
    let revision_id = Ulid::new().to_string();
    let revision_row = sqlx::query(
        r#"INSERT INTO wedding_vendor_publication_revisions
           (revision_id,vendor_id,profile_revision,status,snapshot,visibility,
            moderation_required,submitted_by_user_id,reviewed_by_user_id,reviewed_at,published_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,
                   CASE WHEN $4='published' THEN $8 ELSE NULL END,
                   CASE WHEN $4='published' THEN NOW() ELSE NULL END,
                   CASE WHEN $4='published' THEN NOW() ELSE NULL END)
           ON CONFLICT (vendor_id,profile_revision) DO UPDATE SET
             status=EXCLUDED.status,snapshot=EXCLUDED.snapshot,visibility=EXCLUDED.visibility,
             moderation_required=EXCLUDED.moderation_required,
             submitted_by_user_id=EXCLUDED.submitted_by_user_id,submitted_at=NOW()
           RETURNING revision_id"#,
    )
    .bind(&revision_id)
    .bind(&access.vendor_id)
    .bind(actual)
    .bind(status)
    .bind(&snapshot)
    .bind(&visibility)
    .bind(moderation_required)
    .bind(&user.id)
    .fetch_one(&mut *tx)
    .await
    .map_err(database_failure)?;
    let revision_id: String = revision_row.get("revision_id");
    if !moderation_required {
        apply_publication(
            &mut tx,
            &access.vendor_id,
            actual,
            &snapshot,
            &visibility,
            &user.id,
        )
        .await?;
        supersede_older(&mut tx, &access.vendor_id, actual).await?;
    }
    record_portal_event(
        &mut tx,
        &access,
        &user.id,
        "publication_submitted",
        Some(&revision_id),
        &dedupe,
        json!({"profile_revision":actual,"status":status,"moderation_required":moderation_required}),
    )
    .await?;
    if !moderation_required {
        record_portal_event(
            &mut tx,
            &access,
            &user.id,
            "publication_published",
            Some(&revision_id),
            &format!("publish-{dedupe}"),
            json!({"profile_revision":actual,"source":"self_publish_safe_fields"}),
        )
        .await?;
    }
    tx.commit().await.map_err(database_failure)?;
    Ok(Json(json!({
        "revision_id":revision_id,
        "profile_revision":actual,
        "status":status,
        "moderation_required":moderation_required,
        "replayed":false,
    })))
}

async fn publication_decision_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    request: Request,
) -> Result<Json<Value>, (StatusCode, String)> {
    let (operator, session) =
        super::super::auth::authenticated_user_and_session(&state.db, &headers).await?;
    super::super::auth::require_recent_high_risk_session(&session)?;
    if !super::super::cost_controls::operator_access_allowed(&operator.email) {
        return Err((StatusCode::FORBIDDEN, "Operator access required.".into()));
    }
    let bytes = axum::body::to_bytes(request.into_body(), 64 * 1024)
        .await
        .map_err(|_| (StatusCode::BAD_REQUEST, "Invalid request body.".into()))?;
    let body: PublicationDecision = serde_json::from_slice(&bytes)
        .map_err(|_| (StatusCode::UNPROCESSABLE_ENTITY, "Invalid publication decision.".into()))?;
    let note = clean(&body.note, 1000);
    if note.len() < 10 {
        return Err((
            StatusCode::BAD_REQUEST,
            "Add a review note of at least 10 characters.".into(),
        ));
    }
    let decision = body.decision.trim().to_ascii_lowercase();
    if !matches!(decision.as_str(), "publish" | "reject") {
        return Err((
            StatusCode::BAD_REQUEST,
            "Decision must be publish or reject.".into(),
        ));
    }
    let mut tx = state.db.pool.begin().await.map_err(database_failure)?;
    let revision = sqlx::query(
        r#"SELECT r.vendor_id,r.profile_revision,r.status,r.snapshot,r.visibility,
                  v.vendor_slug,v.vendor_name,v.category
           FROM wedding_vendor_publication_revisions r
           JOIN wedding_vendors v ON v.vendor_id=r.vendor_id
           WHERE r.revision_id=$1 FOR UPDATE OF r"#,
    )
    .bind(clean(&body.revision_id, 80))
    .fetch_optional(&mut *tx)
    .await
    .map_err(database_failure)?
    .ok_or((
        StatusCode::NOT_FOUND,
        "Publication revision not found.".into(),
    ))?;
    if revision.get::<String, _>("status") != "pending_review" {
        return Err((
            StatusCode::CONFLICT,
            "This publication revision is no longer pending.".into(),
        ));
    }
    let access = VendorAccess {
        vendor_id: revision.get("vendor_id"),
        vendor_slug: revision.get("vendor_slug"),
        vendor_name: revision.get("vendor_name"),
        category: revision.get("category"),
        owner: false,
        role: "operator".into(),
    };
    let profile_revision = revision.get::<i64, _>("profile_revision");
    let event_kind = if decision == "publish" {
        apply_publication(
            &mut tx,
            &access.vendor_id,
            profile_revision,
            &revision.get("snapshot"),
            &revision.get("visibility"),
            &operator.id,
        )
        .await?;
        supersede_older(&mut tx, &access.vendor_id, profile_revision).await?;
        "publication_published"
    } else {
        "publication_rejected"
    };
    let status = if decision == "publish" {
        "published"
    } else {
        "rejected"
    };
    sqlx::query(
        "UPDATE wedding_vendor_publication_revisions SET status=$1,reviewed_by_user_id=$2,review_note=$3,reviewed_at=NOW(),published_at=CASE WHEN $1='published' THEN NOW() ELSE NULL END WHERE revision_id=$4",
    )
    .bind(status)
    .bind(&operator.id)
    .bind(&note)
    .bind(&body.revision_id)
    .execute(&mut *tx)
    .await
    .map_err(database_failure)?;
    record_portal_event(
        &mut tx,
        &access,
        &operator.id,
        event_kind,
        Some(&body.revision_id),
        &format!("operator-{}-{}", decision, body.revision_id),
        json!({"profile_revision":profile_revision,"operator_review":true}),
    )
    .await?;
    tx.commit().await.map_err(database_failure)?;
    Ok(Json(
        json!({"revision_id":body.revision_id,"status":status}),
    ))
}

fn normalized_visibility(value: &Value) -> Result<Value, (StatusCode, String)> {
    let object = value.as_object().ok_or((
        StatusCode::BAD_REQUEST,
        "visibility must be an object of field choices.".into(),
    ))?;
    if object
        .keys()
        .any(|key| !VISIBILITY_FIELDS.contains(&key.as_str()))
    {
        return Err((StatusCode::BAD_REQUEST, "Unknown publication field.".into()));
    }
    let mut normalized = BTreeMap::new();
    for field in VISIBILITY_FIELDS {
        normalized.insert(
            field,
            object.get(field).and_then(Value::as_bool).unwrap_or(true),
        );
    }
    Ok(serde_json::to_value(normalized).unwrap_or_else(|_| json!({})))
}

async fn ensure_profile(state: &AppState, vendor_id: &str) -> Result<(), (StatusCode, String)> {
    sqlx::query(
        "INSERT INTO wedding_vendor_owner_profile(vendor_id) VALUES($1) ON CONFLICT DO NOTHING",
    )
    .bind(vendor_id)
    .execute(&state.db.pool)
    .await
    .map_err(database_failure)?;
    Ok(())
}

async fn apply_publication(
    tx: &mut Transaction<'_, Postgres>,
    vendor_id: &str,
    revision: i64,
    snapshot: &Value,
    visibility: &Value,
    actor_user_id: &str,
) -> Result<(), (StatusCode, String)> {
    let visible = |field: &str| {
        visibility
            .get(field)
            .and_then(Value::as_bool)
            .unwrap_or(true)
    };
    let description = visible("description")
        .then(|| snapshot.get("description").cloned())
        .flatten()
        .and_then(|value| value.as_str().map(str::to_string));
    let mut contact = Map::new();
    if let Some(source) = snapshot.get("public_contact").and_then(Value::as_object) {
        for field in [
            "email",
            "phone",
            "website_url",
            "instagram_url",
            "facebook_url",
        ] {
            if visible(field) {
                if let Some(value) = source.get(field).filter(|value| !value.is_null()) {
                    contact.insert(field.to_string(), value.clone());
                }
            }
        }
    }
    sqlx::query(
        r#"UPDATE wedding_vendor_owner_profile SET published_revision=$1,
             published_description=$2,published_public_contact=$3,
             publication_visibility=$4,published_at=NOW(),published_by_user_id=$5
           WHERE vendor_id=$6 AND draft_revision >= $1"#,
    )
    .bind(revision)
    .bind(description)
    .bind(Value::Object(contact))
    .bind(visibility)
    .bind(actor_user_id)
    .bind(vendor_id)
    .execute(&mut **tx)
    .await
    .map_err(database_failure)?;
    Ok(())
}

async fn supersede_older(
    tx: &mut Transaction<'_, Postgres>,
    vendor_id: &str,
    revision: i64,
) -> Result<(), (StatusCode, String)> {
    sqlx::query(
        "UPDATE wedding_vendor_publication_revisions SET status='superseded' WHERE vendor_id=$1 AND profile_revision<$2 AND status IN ('pending_review','published')",
    )
    .bind(vendor_id)
    .bind(revision)
    .execute(&mut **tx)
    .await
    .map_err(database_failure)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn publication_visibility_rejects_unknown_fields_and_defaults_known_fields_on() {
        let value = normalized_visibility(&json!({"email":false,"photos":true})).unwrap();
        assert_eq!(value["email"], false);
        assert_eq!(value["description"], true);
        assert!(normalized_visibility(&json!({"ranking":true})).is_err());
    }

    #[test]
    fn operator_auth_precedes_publication_body_parsing() {
        let source = include_str!("publication.rs");
        let start = source.find("async fn publication_decision_http(").unwrap();
        let body = &source[start..];
        assert!(body.find("authenticated_user_and_session").unwrap() < body.find("to_bytes(request.into_body()").unwrap());
    }
}
