/*
 * @module-id: rust.server.user-management-routes.wedding-rooms
 * @primary-capability: operator-vendor-room-management
 * @locs-version: 2.0
 * @stability: draft
 * @owner: omnyid
 */

//! Operator routes for per-vendor rooms plus the public delivery route for room photos.
//! Uploaded photos are re-encoded to WebP (which drops EXIF) before they reach object storage.

use axum::{body::Body, body::Bytes, http::header, response::Response};
use image::ImageFormat;
use serde::Deserialize;
use ulid::Ulid;

use super::super::wedding_vendor_photo_routes::{
    FULL_EDGE, MAX_IMAGE_BYTES, decode_upload, encode_webp,
};
use super::wedding_admin::validate_optional_http_url;
use super::*;
use crate::daemon_runtime::{
    delete_object_payload, download_object_payload, seaweedfs_client, upload_object_payload,
};
use crate::db::{WeddingVendorRoomExternalPhoto, WeddingVendorRoomUpsertRecord};

const MAX_INCLUSIONS: usize = 30;
const MAX_TEXT_CHARS: usize = 2_000;
const MAX_LABEL_CHARS: usize = 200;

#[derive(Deserialize)]
pub(super) struct WeddingVendorRoomRequest {
    room_name: String,
    sort_order: Option<i32>,
    description: Option<String>,
    capacity_seated: Option<i32>,
    capacity_standing: Option<i32>,
    pricing_label: Option<String>,
    price_from_cents: Option<i64>,
    minimum_spend_cents: Option<i64>,
    minimum_spend_note: Option<String>,
    inclusions: Option<Vec<String>>,
    availability_note: Option<String>,
    source_url: Option<String>,
    source_label: Option<String>,
    source_checked_at: Option<String>,
    photos: Option<Vec<WeddingVendorRoomExternalPhoto>>,
}

#[derive(Deserialize)]
pub(super) struct RoomPhotoQuery {
    alt_text: Option<String>,
}

#[derive(Deserialize)]
pub(super) struct RoomPhotoPath {
    vendor_id: String,
    room_id: String,
    slot: i32,
}

#[derive(Deserialize)]
pub(super) struct PublicRoomPhotoPath {
    room_id: String,
    slot: i32,
}

async fn require_operator(
    state: &AppState,
    headers: &HeaderMap,
) -> Result<crate::db::UserRecord, (StatusCode, String)> {
    let operator_user = authenticated_user(&state.db, headers).await?;
    if !super::super::cost_controls::operator_access_allowed(&operator_user.email) {
        return Err((
            StatusCode::FORBIDDEN,
            "operator access required".to_string(),
        ));
    }
    Ok(operator_user)
}

fn bounded_text(
    value: Option<String>,
    label: &str,
    max_chars: usize,
) -> Result<Option<String>, (StatusCode, String)> {
    let text = clean_optional_string(value);
    if text
        .as_ref()
        .is_some_and(|text| text.chars().count() > max_chars)
    {
        return Err((
            StatusCode::BAD_REQUEST,
            format!("{label} must be at most {max_chars} characters; shorten it and retry"),
        ));
    }
    Ok(text)
}

fn non_negative<T: PartialOrd + Default>(
    value: Option<T>,
    label: &str,
) -> Result<Option<T>, (StatusCode, String)> {
    match value {
        Some(number) if number < T::default() => Err((
            StatusCode::BAD_REQUEST,
            format!("{label} cannot be negative; omit it when the vendor did not state a value"),
        )),
        other => Ok(other),
    }
}

fn validate_slot(slot: i32) -> Result<i32, (StatusCode, String)> {
    if (1..=3).contains(&slot) {
        Ok(slot)
    } else {
        Err((
            StatusCode::BAD_REQUEST,
            "photo slot must be 1, 2, or 3".to_string(),
        ))
    }
}

fn room_upsert_input(
    body: WeddingVendorRoomRequest,
) -> Result<WeddingVendorRoomUpsertRecord, (StatusCode, String)> {
    let room_name = bounded_text(Some(body.room_name), "room_name", 120)?
        .ok_or_else(|| (StatusCode::BAD_REQUEST, "room_name is required".to_string()))?;
    let inclusions = body.inclusions.unwrap_or_default();
    if inclusions.len() > MAX_INCLUSIONS {
        return Err((
            StatusCode::BAD_REQUEST,
            format!("a room can list at most {MAX_INCLUSIONS} inclusions"),
        ));
    }
    let inclusions = inclusions
        .into_iter()
        .filter_map(|item| bounded_text(Some(item), "inclusion", MAX_LABEL_CHARS).transpose())
        .collect::<Result<Vec<_>, _>>()?;
    let source_checked_at = clean_optional_string(body.source_checked_at);
    if let Some(date) = &source_checked_at {
        chrono::NaiveDate::parse_from_str(date, "%Y-%m-%d").map_err(|_| {
            (
                StatusCode::BAD_REQUEST,
                "source_checked_at must use YYYY-MM-DD".to_string(),
            )
        })?;
    }
    let external_photos = body
        .photos
        .map(|photos| {
            if photos.len() > 3 {
                return Err((
                    StatusCode::BAD_REQUEST,
                    "rooms can have at most 3 photos".to_string(),
                ));
            }
            photos
                .into_iter()
                .map(|photo| {
                    Ok(WeddingVendorRoomExternalPhoto {
                        slot: validate_slot(photo.slot)?,
                        photo_url: validate_optional_http_url(Some(photo.photo_url), "photo_url")?
                            .ok_or_else(|| {
                                (StatusCode::BAD_REQUEST, "photo_url is required".to_string())
                            })?,
                        alt_text: bounded_text(photo.alt_text, "alt_text", MAX_LABEL_CHARS)?,
                        source_label: bounded_text(
                            photo.source_label,
                            "photo source_label",
                            MAX_LABEL_CHARS,
                        )?,
                        source_url: validate_optional_http_url(
                            photo.source_url,
                            "photo source_url",
                        )?,
                    })
                })
                .collect::<Result<Vec<_>, (StatusCode, String)>>()
        })
        .transpose()?;
    Ok(WeddingVendorRoomUpsertRecord {
        room_name,
        sort_order: body.sort_order.unwrap_or(0),
        description: bounded_text(body.description, "description", MAX_TEXT_CHARS)?,
        capacity_seated: non_negative(body.capacity_seated, "capacity_seated")?,
        capacity_standing: non_negative(body.capacity_standing, "capacity_standing")?,
        pricing_label: bounded_text(body.pricing_label, "pricing_label", MAX_LABEL_CHARS)?,
        price_from_cents: non_negative(body.price_from_cents, "price_from_cents")?,
        minimum_spend_cents: non_negative(body.minimum_spend_cents, "minimum_spend_cents")?,
        minimum_spend_note: bounded_text(
            body.minimum_spend_note,
            "minimum_spend_note",
            MAX_LABEL_CHARS,
        )?,
        inclusions,
        availability_note: bounded_text(
            body.availability_note,
            "availability_note",
            MAX_LABEL_CHARS,
        )?,
        source_url: validate_optional_http_url(body.source_url, "source_url")?,
        source_label: bounded_text(body.source_label, "source_label", MAX_LABEL_CHARS)?,
        source_checked_at,
        evidence: serde_json::json!({}),
        external_photos,
    })
}

async fn vendor_with_rooms(
    state: &AppState,
    vendor_id: &str,
) -> Result<Value, (StatusCode, String)> {
    let vendor = state
        .db
        .list_wedding_vendors(1, Some(vendor_id))
        .await
        .map_err(readiness_error_to_http)?
        .into_iter()
        .find(|vendor| vendor.vendor_id == vendor_id)
        .ok_or_else(|| (StatusCode::NOT_FOUND, "vendor not found".to_string()))?;
    Ok(serde_json::json!({ "vendor": vendor }))
}

pub(super) async fn admin_wedding_vendor_room_upsert_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(vendor_id): Path<String>,
    Json(body): Json<WeddingVendorRoomRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    require_operator(&state, &headers).await?;
    let input = room_upsert_input(body)?;
    let vendor_id = vendor_id.trim();
    vendor_with_rooms(&state, vendor_id).await?;
    state
        .db
        .upsert_wedding_vendor_room(vendor_id, &input)
        .await
        .map_err(readiness_error_to_http)?;
    Ok(Json(vendor_with_rooms(&state, vendor_id).await?))
}

pub(super) async fn admin_wedding_vendor_room_delete_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path((vendor_id, room_id)): Path<(String, String)>,
) -> Result<Json<Value>, (StatusCode, String)> {
    require_operator(&state, &headers).await?;
    let keys = state
        .db
        .delete_wedding_vendor_room(vendor_id.trim(), room_id.trim())
        .await
        .map_err(readiness_error_to_http)?
        .ok_or_else(|| (StatusCode::NOT_FOUND, "room not found".to_string()))?;
    if let Some(client) = seaweedfs_client() {
        for key in keys {
            if let Err(error) = delete_object_payload(&client, &key).await {
                tracing::warn!(%error, %key, "room photo object left behind after room delete");
            }
        }
    } else if !keys.is_empty() {
        tracing::warn!(
            count = keys.len(),
            "room photo objects left behind because object storage is not configured"
        );
    }
    Ok(Json(vendor_with_rooms(&state, vendor_id.trim()).await?))
}

pub(super) async fn admin_wedding_vendor_room_photo_upload_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(path): Path<RoomPhotoPath>,
    Query(query): Query<RoomPhotoQuery>,
    body: Bytes,
) -> Result<Json<Value>, (StatusCode, String)> {
    require_operator(&state, &headers).await?;
    let slot = validate_slot(path.slot)?;
    let alt_text = bounded_text(query.alt_text, "alt_text", MAX_LABEL_CHARS)?;
    if body.len() > MAX_IMAGE_BYTES {
        return Err((
            StatusCode::PAYLOAD_TOO_LARGE,
            "room photo is larger than 15 MB; resize it and retry".to_string(),
        ));
    }
    let format = match image::guess_format(&body) {
        Ok(format @ (ImageFormat::Jpeg | ImageFormat::Png | ImageFormat::WebP)) => format,
        _ => {
            return Err((
                StatusCode::UNSUPPORTED_MEDIA_TYPE,
                "room photo must be a JPEG, PNG or WebP image".to_string(),
            ));
        }
    };
    let webp = decode_upload(&body, format)
        .and_then(|image| encode_webp(&image, FULL_EDGE))
        .map_err(|_| {
            (
                StatusCode::UNPROCESSABLE_ENTITY,
                "room photo could not be read as an image; re-export it and retry".to_string(),
            )
        })?;
    let client = seaweedfs_client().ok_or_else(|| {
        (
            StatusCode::SERVICE_UNAVAILABLE,
            "photo storage is unavailable; set OMNYID_SEAWEEDFS_* and retry".to_string(),
        )
    })?;
    let bucket = std::env::var("OMNYID_SEAWEEDFS_BUCKET").unwrap_or_default();
    let key = format!(
        "wedding-public/vendors/{}/rooms/{}/{}.webp",
        path.vendor_id.trim(),
        path.room_id.trim(),
        Ulid::new()
    );
    if !upload_object_payload(&client, &key, webp, "image/webp").await {
        return Err((
            StatusCode::BAD_GATEWAY,
            "room photo upload to object storage failed; retry".to_string(),
        ));
    }
    let previous = state
        .db
        .set_wedding_vendor_room_stored_photo(
            path.vendor_id.trim(),
            path.room_id.trim(),
            slot,
            &bucket,
            &key,
            alt_text.as_deref(),
        )
        .await;
    let previous = match previous {
        Ok(Some(previous)) => previous,
        outcome => {
            if let Err(error) = delete_object_payload(&client, &key).await {
                tracing::warn!(%error, %key, "orphaned room photo object after failed record");
            }
            return match outcome {
                Ok(_) => Err((StatusCode::NOT_FOUND, "room not found".to_string())),
                Err(error) => Err(readiness_error_to_http(error)),
            };
        }
    };
    if let Some(previous_key) = previous {
        if let Err(error) = delete_object_payload(&client, &previous_key).await {
            tracing::warn!(%error, key = %previous_key, "superseded room photo object not removed");
        }
    }
    Ok(Json(
        vendor_with_rooms(&state, path.vendor_id.trim()).await?,
    ))
}

pub(super) async fn public_wedding_vendor_room_photo_http(
    State(state): State<Arc<AppState>>,
    Path(path): Path<PublicRoomPhotoPath>,
) -> Result<Response, (StatusCode, String)> {
    let not_found = || (StatusCode::NOT_FOUND, "photo not found".to_string());
    let key = state
        .db
        .wedding_vendor_room_photo_storage_key(path.room_id.trim(), validate_slot(path.slot)?)
        .await
        .map_err(readiness_error_to_http)?
        .ok_or_else(not_found)?;
    let client = seaweedfs_client().ok_or_else(|| {
        (
            StatusCode::SERVICE_UNAVAILABLE,
            "photo storage is unavailable".to_string(),
        )
    })?;
    let bytes = download_object_payload(&client, &key)
        .await
        .map_err(|_| not_found())?;
    Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, "image/webp")
        .header(header::CACHE_CONTROL, "public, max-age=3600")
        .body(Body::from(bytes))
        .map_err(|_| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                "photo response failed".to_string(),
            )
        })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn request(name: &str) -> WeddingVendorRoomRequest {
        WeddingVendorRoomRequest {
            room_name: name.to_string(),
            sort_order: None,
            description: None,
            capacity_seated: None,
            capacity_standing: None,
            pricing_label: None,
            price_from_cents: None,
            minimum_spend_cents: None,
            minimum_spend_note: None,
            inclusions: None,
            availability_note: None,
            source_url: None,
            source_label: None,
            source_checked_at: None,
            photos: None,
        }
    }

    #[test]
    fn room_requires_a_name_and_rejects_negative_prices() {
        assert!(room_upsert_input(request("  ")).is_err());
        let mut negative = request("Barn");
        negative.price_from_cents = Some(-1);
        assert!(room_upsert_input(negative).is_err());
        let input = room_upsert_input(request(" Barn ")).expect("valid room");
        assert_eq!(input.room_name, "Barn");
        assert!(input.external_photos.is_none());
    }

    #[test]
    fn room_photo_slots_and_urls_are_validated() {
        let mut bad_slot = request("Barn");
        bad_slot.photos = Some(vec![WeddingVendorRoomExternalPhoto {
            slot: 4,
            photo_url: "https://cdn.example/barn.jpg".to_string(),
            alt_text: None,
            source_label: None,
            source_url: None,
        }]);
        assert!(room_upsert_input(bad_slot).is_err());
        let mut bad_url = request("Barn");
        bad_url.photos = Some(vec![WeddingVendorRoomExternalPhoto {
            slot: 1,
            photo_url: "javascript:alert(1)".to_string(),
            alt_text: None,
            source_label: None,
            source_url: None,
        }]);
        assert!(room_upsert_input(bad_url).is_err());
    }

    #[test]
    fn room_inclusions_are_trimmed_and_blank_entries_dropped() {
        let mut body = request("Barn");
        body.inclusions = Some(vec![" Tables ".to_string(), "  ".to_string()]);
        let input = room_upsert_input(body).expect("valid room");
        assert_eq!(input.inclusions, vec!["Tables".to_string()]);
    }
}
