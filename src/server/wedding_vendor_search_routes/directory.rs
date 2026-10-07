// @locs-version: 1.0
use super::*;
use crate::db::WeddingVendorRecord;

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
        photo_url: record.photos.first().map(|photo| photo.photo_url.clone()),
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
