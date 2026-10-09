/*
 * @module-id: rust.server.wedding-vendor-photo-routes
 * @primary-capability: licensed-owner-photo-publication
 * @locs-version: 2.0
 * @stability: draft
 * @owner: omnyid
 */

//! Licensed owner-photo upload and public delivery routes.
//!
//! Images are decoded and re-encoded to WebP before storage, which removes
//! EXIF/metadata. The original bytes are never retained by this service.

use std::{io::Cursor, sync::Arc};

use axum::{
    Json, Router,
    body::Body,
    extract::{DefaultBodyLimit, Multipart, Path, Query, State},
    http::{HeaderMap, StatusCode, header},
    response::Response,
    routing::{delete, get},
};
use image::{
    DynamicImage, GenericImageView, ImageFormat, ImageReader, Limits, imageops::FilterType,
};
use serde::Deserialize;
use serde_json::{Value, json};
use sqlx::Row;
use ulid::Ulid;

use crate::daemon_runtime::{
    delete_object_payload, download_object_payload, seaweedfs_client, upload_object_payload,
};

use super::{
    AppState, RateLimitPolicy,
    auth::{authenticated_rate_limit_key, authenticated_user, enforce_rate_limit},
    wedding_vendor_claim_routes::{PHOTO_LICENCE_SHA256, PHOTO_LICENCE_VERSION},
};

const MAX_IMAGE_BYTES: usize = 15 * 1024 * 1024;
const MAX_DECODED_IMAGE_BYTES: u64 = 128 * 1024 * 1024;
const MAX_SOURCE_EDGE: u32 = 8_000;
const FULL_EDGE: u32 = 2400;
const MEDIUM_EDGE: u32 = 1200;
const THUMB_EDGE: u32 = 480;

pub(super) fn routes() -> Router<Arc<AppState>> {
    Router::new()
        .route(
            "/api/wedding/vendor/photos",
            get(list_owner_photos_http).post(upload_owner_photo_http),
        )
        .route(
            "/api/wedding/vendor/photos/{asset_id}",
            delete(schedule_owner_photo_removal_http),
        )
        .route(
            "/api/public/wedding/vendor/photos/{asset_id}/{variant}",
            get(public_owner_photo_http),
        )
        .layer(DefaultBodyLimit::max(MAX_IMAGE_BYTES))
}

#[derive(Deserialize)]
struct PublicPhotoPath {
    asset_id: String,
    variant: String,
}

#[derive(Deserialize)]
struct OwnerPhotoQuery {
    vendor_slug: String,
}

#[derive(Deserialize)]
struct OwnerPhotoPath {
    asset_id: String,
}

async fn list_owner_photos_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Query(query): Query<OwnerPhotoQuery>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let vendor_id = owned_vendor_id(&state, &user.id, &query.vendor_slug).await?;
    let rows = sqlx::query(
        r#"SELECT asset_id, alt_text, is_cover, status, removal_requested_at, purge_after
           FROM wedding_vendor_owner_assets
           WHERE vendor_id = $1 AND status IN ('live', 'hidden')
           ORDER BY position ASC"#,
    )
    .bind(vendor_id)
    .fetch_all(&state.db.pool)
    .await
    .map_err(database_failure)?;
    let photos = rows.into_iter().map(|row| json!({
        "asset_id": row.get::<String, _>("asset_id"),
        "alt_text": row.get::<Option<String>, _>("alt_text"),
        "is_cover": row.get::<bool, _>("is_cover"),
        "status": row.get::<String, _>("status"),
        "url": format!("/api/public/wedding/vendor/photos/{}/medium", row.get::<String, _>("asset_id")),
        "purge_after": row.get::<Option<chrono::DateTime<chrono::Utc>>, _>("purge_after").map(|value| value.to_rfc3339()),
    })).collect::<Vec<_>>();
    Ok(Json(json!({ "photos": photos })))
}

async fn schedule_owner_photo_removal_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(path): Path<OwnerPhotoPath>,
    Query(query): Query<OwnerPhotoQuery>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let vendor_id = owned_vendor_id(&state, &user.id, &query.vendor_slug).await?;
    let asset_id = valid_ulid(&path.asset_id, "photo")?;
    let result = sqlx::query(
        r#"UPDATE wedding_vendor_owner_assets
           SET status = 'hidden', is_cover = FALSE, removal_requested_at = NOW(),
               purge_after = NOW() + INTERVAL '14 days'
           WHERE asset_id = $1 AND vendor_id = $2 AND status = 'live'"#,
    )
    .bind(asset_id)
    .bind(vendor_id)
    .execute(&state.db.pool)
    .await
    .map_err(database_failure)?;
    if result.rows_affected() == 0 {
        return Err((StatusCode::NOT_FOUND, "live photo not found".to_string()));
    }
    Ok(Json(json!({ "status": "scheduled_for_removal", "purge_after_days": 14 })))
}

async fn owned_vendor_id(
    state: &AppState,
    user_id: &str,
    vendor_slug: &str,
) -> Result<String, (StatusCode, String)> {
    let slug = valid_slug(vendor_slug)?;
    let row = sqlx::query(
        "SELECT vendor_id FROM wedding_vendors WHERE vendor_slug = $1 AND status = 'active' AND claimed_by_user_id = $2 AND claim_status IN ('claim_pending', 'claimed', 'verified')",
    )
    .bind(slug)
    .bind(user_id)
    .fetch_optional(&state.db.pool)
    .await
    .map_err(database_failure)?
    .ok_or_else(|| (StatusCode::FORBIDDEN, "only the active claimant can manage vendor photos".to_string()))?;
    Ok(row.get("vendor_id"))
}

async fn upload_owner_photo_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    mut multipart: Multipart,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    enforce_rate_limit(
        &state,
        authenticated_rate_limit_key("vendor_owner_photo", &headers),
        RateLimitPolicy {
            max_requests: 30,
            window: std::time::Duration::from_secs(60 * 60),
        },
    )
    .await?;

    let mut vendor_slug = None;
    let mut photo_licence_id = None;
    let mut alt_text = None;
    let mut wants_cover = false;
    let mut bytes = None;
    let mut mime_type = None;
    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|_| bad_request("invalid photo upload"))?
    {
        match field.name() {
            Some("vendor_slug") => {
                vendor_slug = Some(
                    field
                        .text()
                        .await
                        .map_err(|_| bad_request("invalid vendor_slug"))?,
                )
            }
            Some("photo_licence_id") => {
                photo_licence_id = Some(
                    field
                        .text()
                        .await
                        .map_err(|_| bad_request("invalid photo licence"))?,
                )
            }
            Some("alt_text") => {
                alt_text = Some(
                    field
                        .text()
                        .await
                        .map_err(|_| bad_request("invalid alt text"))?,
                )
            }
            Some("is_cover") => {
                wants_cover = field
                    .text()
                    .await
                    .map_err(|_| bad_request("invalid cover flag"))?
                    .trim()
                    == "true"
            }
            Some("file") => {
                mime_type = field.content_type().map(str::to_string);
                bytes = Some(
                    field
                        .bytes()
                        .await
                        .map_err(|_| bad_request("could not read photo"))?
                        .to_vec(),
                );
            }
            _ => {}
        }
    }

    let vendor_slug = valid_slug(vendor_slug.as_deref().unwrap_or_default())?;
    let photo_licence_id = valid_ulid(
        photo_licence_id.as_deref().unwrap_or_default(),
        "photo licence",
    )?;
    let alt_text = clean_alt_text(alt_text.as_deref())?;
    let bytes = bytes
        .filter(|bytes| !bytes.is_empty())
        .ok_or_else(|| bad_request("a photo file is required"))?;
    if bytes.len() > MAX_IMAGE_BYTES {
        return Err((
            StatusCode::PAYLOAD_TOO_LARGE,
            "photo exceeds the 15 MB limit".to_string(),
        ));
    }
    if !matches!(
        mime_type.as_deref(),
        Some("image/jpeg" | "image/png" | "image/webp")
    ) {
        return Err(bad_request("only JPEG, PNG, and WebP photos are accepted"));
    }
    let source_format = match mime_type.as_deref() {
        Some("image/jpeg") => ImageFormat::Jpeg,
        Some("image/png") => ImageFormat::Png,
        Some("image/webp") => ImageFormat::WebP,
        _ => unreachable!("the MIME type was validated above"),
    };
    let image = decode_upload(&bytes, source_format)
        .map_err(|_| bad_request("photo is not a readable image"))?;
    let dimensions = image.dimensions();
    let (full, medium, thumb) = webp_variants(&image).map_err(|_| {
        (
            StatusCode::UNPROCESSABLE_ENTITY,
            "photo could not be prepared for publication".to_string(),
        )
    })?;

    let mut tx = state.db.pool.begin().await.map_err(database_failure)?;
    let listing = sqlx::query(
        "SELECT vendor_id, claim_status, claimed_by_user_id FROM wedding_vendors WHERE vendor_slug = $1 AND status = 'active' FOR UPDATE",
    ).bind(&vendor_slug).fetch_optional(&mut *tx).await.map_err(database_failure)?
        .ok_or_else(|| (StatusCode::NOT_FOUND, "vendor listing not found".to_string()))?;
    let vendor_id: String = listing.get("vendor_id");
    let claim_status: String = listing.get("claim_status");
    let owner: Option<String> = listing.get("claimed_by_user_id");
    if owner.as_deref() != Some(user.id.as_str())
        || !matches!(
            claim_status.as_str(),
            "claim_pending" | "claimed" | "verified"
        )
    {
        return Err((
            StatusCode::FORBIDDEN,
            "only the active claimant can publish vendor photos".to_string(),
        ));
    }
    let receipt_exists = sqlx::query(
        "SELECT 1 FROM wedding_vendor_photo_licences WHERE photo_licence_id = $1 AND vendor_id = $2 AND user_id = $3 AND agreement_version = $4 AND agreement_sha256 = $5",
    ).bind(&photo_licence_id).bind(&vendor_id).bind(&user.id).bind(PHOTO_LICENCE_VERSION).bind(PHOTO_LICENCE_SHA256)
        .fetch_optional(&mut *tx).await.map_err(database_failure)?.is_some();
    if !receipt_exists {
        return Err((
            StatusCode::FORBIDDEN,
            "accept the current photo licence before publishing images".to_string(),
        ));
    }

    let plan = state
        .db
        .get_billing_status(&user.id)
        .await
        .map_err(database_failure)?
        .get("plan")
        .and_then(Value::as_str)
        .unwrap_or("starter")
        .to_string();
    let limit = if matches!(
        plan.as_str(),
        "pro" | "founding" | "vendor_pro" | "vendor_founding"
    ) {
        30_i64
    } else {
        10_i64
    };
    let count: i64 = sqlx::query("SELECT count(*) AS count FROM wedding_vendor_owner_assets WHERE vendor_id = $1 AND status = 'live'")
        .bind(&vendor_id).fetch_one(&mut *tx).await.map_err(database_failure)?.get("count");
    if count >= limit {
        return Err((
            StatusCode::CONFLICT,
            format!("your current vendor plan can publish up to {limit} photos"),
        ));
    }

    let asset_id = Ulid::new().to_string();
    let base_key = format!("wedding-public/vendors/{vendor_id}/{asset_id}");
    let keys = [
        format!("{base_key}/full.webp"),
        format!("{base_key}/medium.webp"),
        format!("{base_key}/thumb.webp"),
    ];
    let client = seaweedfs_client().ok_or_else(|| {
        (
            StatusCode::SERVICE_UNAVAILABLE,
            "public image storage is unavailable".to_string(),
        )
    })?;
    let variants = [&full, &medium, &thumb];
    let mut uploaded: Vec<String> = Vec::new();
    for (key, payload) in keys.iter().zip(variants) {
        if !upload_object_payload(&client, key, payload.clone(), "image/webp").await {
            for uploaded_key in uploaded {
                let _ = delete_object_payload(&client, &uploaded_key).await;
            }
            return Err((
                StatusCode::SERVICE_UNAVAILABLE,
                "could not store the public photo".to_string(),
            ));
        }
        uploaded.push(key.clone());
    }
    let position: i32 = sqlx::query("SELECT COALESCE(MAX(position), -1) + 1 AS position FROM wedding_vendor_owner_assets WHERE vendor_id = $1")
        .bind(&vendor_id).fetch_one(&mut *tx).await.map_err(database_failure)?.get("position");
    if wants_cover {
        sqlx::query("UPDATE wedding_vendor_owner_assets SET is_cover = FALSE WHERE vendor_id = $1 AND is_cover = TRUE AND status = 'live'")
            .bind(&vendor_id).execute(&mut *tx).await.map_err(database_failure)?;
    }
    let insert = sqlx::query(
        r#"INSERT INTO wedding_vendor_owner_assets
            (asset_id, vendor_id, uploaded_by_user_id, position, is_cover, seaweed_fid_full, seaweed_fid_medium, seaweed_fid_thumb, width, height, bytes, alt_text, status, photo_licence_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'live', $13)"#,
    ).bind(&asset_id).bind(&vendor_id).bind(&user.id).bind(position).bind(wants_cover)
        .bind(&keys[0]).bind(&keys[1]).bind(&keys[2]).bind(dimensions.0 as i32).bind(dimensions.1 as i32)
        .bind(i64::try_from(full.len()).map_err(|_| bad_request("photo is too large"))?).bind(alt_text).bind(&photo_licence_id)
        .execute(&mut *tx).await;
    if insert.is_err() {
        for uploaded_key in uploaded {
            let _ = delete_object_payload(&client, &uploaded_key).await;
        }
    }
    insert.map_err(database_failure)?;
    tx.commit().await.map_err(database_failure)?;
    Ok(Json(
        json!({ "asset_id": asset_id, "photo_licence_id": photo_licence_id, "url": format!("/api/public/wedding/vendor/photos/{asset_id}/medium") }),
    ))
}

async fn public_owner_photo_http(
    State(state): State<Arc<AppState>>,
    Path(path): Path<PublicPhotoPath>,
) -> Result<Response, (StatusCode, String)> {
    let asset_id = valid_ulid(&path.asset_id, "photo")?;
    let column = match path.variant.as_str() {
        "full" => "seaweed_fid_full",
        "medium" => "seaweed_fid_medium",
        "thumb" => "seaweed_fid_thumb",
        _ => return Err((StatusCode::NOT_FOUND, "photo not found".to_string())),
    };
    let query = format!(
        "SELECT asset.{column} AS storage_key FROM wedding_vendor_owner_assets asset JOIN wedding_vendors vendor ON vendor.vendor_id = asset.vendor_id WHERE asset.asset_id = $1 AND asset.status = 'live' AND vendor.status = 'active' AND vendor.claim_status IN ('claimed', 'verified')"
    );
    let row = sqlx::query(&query)
        .bind(&asset_id)
        .fetch_optional(&state.db.pool)
        .await
        .map_err(database_failure)?
        .ok_or_else(|| (StatusCode::NOT_FOUND, "photo not found".to_string()))?;
    let storage_key: String = row.get("storage_key");
    let client = seaweedfs_client().ok_or_else(|| {
        (
            StatusCode::SERVICE_UNAVAILABLE,
            "photo storage is unavailable".to_string(),
        )
    })?;
    let bytes = download_object_payload(&client, &storage_key)
        .await
        .map_err(|_| (StatusCode::NOT_FOUND, "photo not found".to_string()))?;
    Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, "image/webp")
        .header(header::CACHE_CONTROL, "public, max-age=31536000, immutable")
        .body(Body::from(bytes))
        .map_err(|_| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                "photo response failed".to_string(),
            )
        })
}

/// Removes files whose owner-requested fourteen-day grace period has elapsed.
/// Hidden assets are never public during the grace period; a failed object-store
/// deletion remains eligible for the next pass instead of being marked removed.
pub(super) async fn owner_photo_purge_loop(state: Arc<AppState>) {
    loop {
        if let Err(error) = purge_due_owner_photos(&state).await {
            tracing::warn!(%error, "vendor photo purge pass failed");
        }
        tokio::time::sleep(std::time::Duration::from_secs(6 * 60 * 60)).await;
    }
}

async fn purge_due_owner_photos(state: &AppState) -> Result<(), sqlx::Error> {
    let Some(client) = seaweedfs_client() else {
        tracing::warn!("vendor photo purge deferred because object storage is unavailable");
        return Ok(());
    };
    let rows = sqlx::query(
        r#"SELECT asset_id, seaweed_fid_full, seaweed_fid_medium, seaweed_fid_thumb
           FROM wedding_vendor_owner_assets
           WHERE status = 'hidden' AND purge_after <= NOW()
           ORDER BY purge_after ASC
           LIMIT 100"#,
    )
    .fetch_all(&state.db.pool)
    .await?;
    for row in rows {
        let keys = [
            row.get::<String, _>("seaweed_fid_full"),
            row.get::<String, _>("seaweed_fid_medium"),
            row.get::<String, _>("seaweed_fid_thumb"),
        ];
        let mut all_deleted = true;
        for key in keys {
            if delete_object_payload(&client, &key).await.is_err() {
                all_deleted = false;
            }
        }
        if all_deleted {
            sqlx::query(
                "UPDATE wedding_vendor_owner_assets SET status = 'removed' WHERE asset_id = $1 AND status = 'hidden'",
            )
            .bind(row.get::<String, _>("asset_id"))
            .execute(&state.db.pool)
            .await?;
        }
    }
    Ok(())
}

fn webp_variants(image: &DynamicImage) -> Result<(Vec<u8>, Vec<u8>, Vec<u8>), image::ImageError> {
    Ok((
        encode_webp(&image, FULL_EDGE)?,
        encode_webp(&image, MEDIUM_EDGE)?,
        encode_webp(&image, THUMB_EDGE)?,
    ))
}

fn decode_upload(bytes: &[u8], format: ImageFormat) -> Result<DynamicImage, image::ImageError> {
    let mut limits = Limits::default();
    limits.max_image_width = Some(MAX_SOURCE_EDGE);
    limits.max_image_height = Some(MAX_SOURCE_EDGE);
    limits.max_alloc = Some(MAX_DECODED_IMAGE_BYTES);
    let mut reader = ImageReader::with_format(Cursor::new(bytes), format);
    reader.limits(limits);
    reader.decode()
}

fn encode_webp(image: &DynamicImage, edge: u32) -> Result<Vec<u8>, image::ImageError> {
    let resized = image.resize(edge, edge, FilterType::Lanczos3);
    let mut output = Cursor::new(Vec::new());
    resized.write_to(&mut output, ImageFormat::WebP)?;
    Ok(output.into_inner())
}

fn valid_slug(raw: &str) -> Result<String, (StatusCode, String)> {
    let value = raw.trim().to_ascii_lowercase();
    if value.is_empty()
        || value.len() > 120
        || !value
            .bytes()
            .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'-')
    {
        return Err(bad_request("valid vendor_slug is required"));
    }
    Ok(value)
}

fn valid_ulid(raw: &str, label: &str) -> Result<String, (StatusCode, String)> {
    let value = raw.trim();
    if Ulid::from_string(value).is_err() {
        return Err(bad_request(&format!("valid {label} is required")));
    }
    Ok(value.to_string())
}

fn clean_alt_text(raw: Option<&str>) -> Result<Option<String>, (StatusCode, String)> {
    let value = raw.unwrap_or_default().trim();
    if value.chars().count() > 500 {
        return Err(bad_request("alt text is limited to 500 characters"));
    }
    Ok((!value.is_empty()).then(|| value.to_string()))
}

fn bad_request(message: &str) -> (StatusCode, String) {
    (StatusCode::BAD_REQUEST, message.to_string())
}
fn database_failure(_: sqlx::Error) -> (StatusCode, String) {
    (
        StatusCode::INTERNAL_SERVER_ERROR,
        "vendor photo service is temporarily unavailable".to_string(),
    )
}

#[cfg(test)]
mod tests {
    use super::{clean_alt_text, decode_upload, webp_variants};
    use image::{DynamicImage, ImageFormat};

    #[test]
    fn generated_variants_are_webp() {
        let image = DynamicImage::new_rgba8(11, 7);
        let (full, medium, thumb) = webp_variants(&image).expect("variants should encode");

        for variant in [full, medium, thumb] {
            assert_eq!(image::guess_format(&variant).unwrap(), ImageFormat::WebP);
        }
    }

    #[test]
    fn decoder_rejects_images_larger_than_the_source_edge_cap() {
        let oversized = DynamicImage::new_rgba8(8_001, 1);
        let mut encoded = Cursor::new(Vec::new());
        oversized.write_to(&mut encoded, ImageFormat::Png).unwrap();

        assert!(decode_upload(&encoded.into_inner(), ImageFormat::Png).is_err());
    }

    #[test]
    fn alt_text_is_trimmed_and_bounded() {
        assert_eq!(
            clean_alt_text(Some("  A ceremony space  ")).unwrap(),
            Some("A ceremony space".to_string())
        );
        assert_eq!(clean_alt_text(Some(" ")).unwrap(), None);
        assert!(clean_alt_text(Some(&"a".repeat(501))).is_err());
    }
}
