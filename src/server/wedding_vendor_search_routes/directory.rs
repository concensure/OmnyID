// @locs-version: 1.0
use super::*;
use crate::db::{WeddingVendorRecord, WeddingVendorRoomRecord};

pub(super) async fn search_wedding_vendor_directory(
    db: &Db,
    user_id: &str,
    queries: &[WeddingVendorSearchQueryRequest],
    limit: usize,
) -> Result<Vec<WeddingVendorSearchSource>, sqlx::Error> {
    let mut sources = Vec::new();
    let mut seen_queries = BTreeSet::new();
    for query in queries {
        for candidate in wedding_vendor_directory_search_terms(query) {
            if !seen_queries.insert(candidate.clone()) {
                continue;
            }
            let records = db
                .list_active_wedding_vendors_for_user(
                    user_id,
                    limit.clamp(1, 8) as i64,
                    Some(&candidate),
                )
                .await?;
            sources.extend(
                records
                    .into_iter()
                    .filter(is_real_vendor_directory_record)
                    .map(wedding_vendor_record_to_search_source),
            );
        }
    }
    Ok(dedupe_sources(sources)
        .into_iter()
        .take(limit * queries.len().max(1))
        .collect())
}

pub(super) fn wedding_vendor_directory_search_terms(
    query: &WeddingVendorSearchQueryRequest,
) -> Vec<String> {
    let mut terms = vec![query.query.trim().to_string()];
    if let Some(category) = query
        .category
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        terms.push(category.to_string());
    }
    if let Some(location) = infer_vendor_service_area(&query.query) {
        terms.push(location);
    }
    dedupe_strings(terms)
}

pub(super) fn is_real_vendor_directory_record(record: &WeddingVendorRecord) -> bool {
    let name = record.vendor_name.trim().to_ascii_lowercase();
    !matches!(
        name.as_str(),
        "easy weddings" | "easyweddings.com.au" | "venueguide" | "venueguide.au" | "venue guide"
    ) && ![
        "wedding venues in ",
        "best wedding venues",
        "live music venues in ",
        "venues for hire in ",
    ]
    .iter()
    .any(|prefix| name.starts_with(prefix))
}

pub(super) fn wedding_vendor_record_to_search_source(
    record: WeddingVendorRecord,
) -> WeddingVendorSearchSource {
    let rooms = rooms_evidence(&record.rooms);
    let url = record
        .website_url
        .clone()
        .or(record.source_url.clone())
        .unwrap_or_else(|| {
            format!(
                "https://www.google.com/maps/search/?api=1&query={}",
                urlencoding::encode(&format!("{} {}", record.vendor_name, record.service_area))
            )
        });
    let snippet = [
        Some(record.category.clone()),
        Some(record.service_area.clone()),
        record.address.clone(),
        record.notes,
    ]
    .into_iter()
    .flatten()
    .map(|value| value.trim().to_string())
    .filter(|value| !value.is_empty())
    .collect::<Vec<_>>()
    .join(" - ");
    WeddingVendorSearchSource {
        title: record.vendor_name,
        url,
        snippet: if snippet.is_empty() {
            Some("Saved in OmnyID's shared wedding vendor database.".to_string())
        } else {
            Some(format!(
                "{snippet} - saved in OmnyID's shared wedding vendor database."
            ))
        },
        provider: "Admin vendor database".to_string(),
        website_url: record.website_url.clone(),
        map_url: record
            .source_url
            .filter(|url| url.contains("maps") || url.contains("openstreetmap")),
        photo_url: record.photos.iter().find_map(|photo| {
            is_unsplash_photo_url(&photo.photo_url).then(|| photo.photo_url.clone())
        }),
        rooms,
        address: record.address,
        phone: record.contact_phone,
        email: record.contact_email,
        instagram_url: record
            .website_url
            .filter(|url| url.to_ascii_lowercase().contains("instagram.com")),
        vendor_id: Some(record.vendor_id),
        vendor_slug: Some(record.vendor_slug),
        category: Some(record.category),
        service_area: Some(record.service_area),
        ..WeddingVendorSearchSource::default()
    }
}

const MAX_ROOMS_PER_SOURCE: usize = 6;

/// Public room payload for a search source; stored photos resolve through the public
/// room-photo route so object-store keys never leave the server.
fn rooms_evidence(rooms: &[WeddingVendorRoomRecord]) -> Option<Value> {
    if rooms.is_empty() {
        return None;
    }
    Some(Value::Array(
        rooms
            .iter()
            .take(MAX_ROOMS_PER_SOURCE)
            .map(|room| {
                let photo_urls = room
                    .photos
                    .iter()
                    .filter_map(|photo| match (&photo.photo_url, photo.stored) {
                        (Some(url), _) => Some(url.clone()),
                        (None, true) => Some(format!(
                            "/api/public/wedding/vendor/room-photos/{}/{}",
                            room.room_id, photo.slot
                        )),
                        (None, false) => None,
                    })
                    .collect::<Vec<_>>();
                serde_json::json!({
                    "room_id": room.room_id,
                    "name": room.room_name,
                    "description": room.description,
                    "capacity_seated": room.capacity_seated,
                    "capacity_standing": room.capacity_standing,
                    "pricing_label": room.pricing_label,
                    "price_from_cents": room.price_from_cents,
                    "minimum_spend_cents": room.minimum_spend_cents,
                    "minimum_spend_note": room.minimum_spend_note,
                    "inclusions": room.inclusions,
                    "availability_note": room.availability_note,
                    "source_url": room.source_url,
                    "source_label": room.source_label,
                    "photo_urls": photo_urls,
                })
            })
            .collect(),
    ))
}
