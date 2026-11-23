// @locs-version: 2.0
//! Live discovery providers (Brave, EXA, Google Places). They return raw candidates; turning a
//! candidate into a vendor entity is the job of source_classification.

use super::attribute_catalog::PendingAttribute;
use super::source_classification::{discovery_excluded_domains, discovery_goggle};
use super::*;

const PLACES_RATING_TTL_DAYS: i64 = 180;
const PLACES_IDENTITY_TTL_DAYS: i64 = 365;

/// Shared by Brave and Google Places so both bias results to the same market.
pub(super) fn wedding_search_country() -> String {
    env_optional_trimmed_local("OMNYID_WEDDING_SEARCH_COUNTRY")
        .map(|value| value.to_ascii_uppercase())
        .filter(|value| value.len() == 2 && value.chars().all(|ch| ch.is_ascii_alphabetic()))
        .unwrap_or_else(|| "AU".to_string())
}

pub(super) struct BraveWebResults {
    pub(super) results: Vec<Value>,
    pub(super) goggles_fallback_note: Option<String>,
}

/// One Brave web search. If the plan rejects the Goggles parameter the request is retried once
/// without it, because an un-downranked result set is better than none.
pub(super) async fn brave_web_search(
    client: &reqwest::Client,
    query_text: &str,
    count: usize,
    goggle: Option<&str>,
) -> Result<BraveWebResults, String> {
    let key = resolve_admin_tool_secret(BRAVE_SEARCH_SPEC)
        .map(|secret| secret.secret)
        .ok_or_else(|| "Brave Search API key is not configured.".to_string())?;
    let count = count.to_string();
    let country = wedding_search_country();
    let mut goggles_fallback_note = None;
    let mut active_goggle = goggle.filter(|value| !value.trim().is_empty());
    loop {
        let mut params = vec![
            ("q", query_text),
            ("count", count.as_str()),
            ("country", country.as_str()),
            ("search_lang", "en"),
            ("safesearch", "moderate"),
        ];
        if let Some(goggle) = active_goggle {
            params.push(("goggles", goggle));
        }
        let response = client
            .get("https://api.search.brave.com/res/v1/web/search")
            .query(&params)
            .header("Accept", "application/json")
            .header("X-Subscription-Token", &key)
            .send()
            .await
            .map_err(|err| format!("Brave Search request failed: {err}"))?;
        let status = response.status();
        if !status.is_success() {
            let rejected_goggles = status.is_client_error()
                && !matches!(status.as_u16(), 401 | 429)
                && active_goggle.is_some();
            if rejected_goggles {
                goggles_fallback_note = Some(format!(
                    "Brave Search rejected the Goggles parameter ({status}); retried without directory downranking. Check that the Brave plan supports Goggles."
                ));
                active_goggle = None;
                continue;
            }
            return Err(vendor_provider_http_error("Brave Search", response).await);
        }
        let json = response
            .json::<serde_json::Value>()
            .await
            .map_err(|err| format!("Brave Search response parse failed: {err}"))?;
        let results = json["web"]["results"]
            .as_array()
            .cloned()
            .unwrap_or_default();
        return Ok(BraveWebResults {
            results,
            goggles_fallback_note,
        });
    }
}

pub(super) async fn search_brave(
    client: &reqwest::Client,
    query: &WeddingVendorSearchQueryRequest,
    limit: usize,
    failed_messages: &mut Vec<String>,
) -> Result<Vec<WeddingVendorSearchSource>, String> {
    let goggle = discovery_goggle(&discovery_excluded_domains());
    let response = brave_web_search(client, &query.query, limit, Some(&goggle)).await?;
    failed_messages.extend(response.goggles_fallback_note);
    Ok(response
        .results
        .into_iter()
        .take(limit)
        .filter_map(|item| {
            Some(WeddingVendorSearchSource {
                title: item["title"].as_str()?.to_string(),
                url: item["url"].as_str()?.to_string(),
                snippet: item["description"].as_str().map(ToOwned::to_owned),
                provider: "Brave Search".to_string(),
                website_url: item["url"].as_str().map(ToOwned::to_owned),
                photo_url: item["thumbnail"]["src"]
                    .as_str()
                    .filter(|url| looks_like_public_http_url(url))
                    .map(ToOwned::to_owned),
                email: infer_email_from_text(item["description"].as_str().unwrap_or_default()),
                instagram_url: item["url"]
                    .as_str()
                    .filter(|url| url.to_ascii_lowercase().contains("instagram.com"))
                    .map(ToOwned::to_owned),
                ..WeddingVendorSearchSource::default()
            })
        })
        .collect())
}

pub(super) async fn search_exa(
    client: &reqwest::Client,
    query: &WeddingVendorSearchQueryRequest,
    limit: usize,
) -> Result<Vec<WeddingVendorSearchSource>, String> {
    exa_search(client, &query.query, limit, &discovery_excluded_domains()).await
}

pub(super) async fn exa_search(
    client: &reqwest::Client,
    query_text: &str,
    limit: usize,
    exclude_domains: &[String],
) -> Result<Vec<WeddingVendorSearchSource>, String> {
    let key = resolve_admin_tool_secret(EXA_SEARCH_SPEC)
        .map(|secret| secret.secret)
        .ok_or_else(|| "EXA Search API key is not configured.".to_string())?;
    let response = client
        .post("https://api.exa.ai/search")
        .header("Accept", "application/json")
        .header("Content-Type", "application/json")
        .header("x-api-key", key)
        .json(&json!({
            "query": query_text,
            "numResults": limit.clamp(1, 10),
            "type": "auto",
            "excludeDomains": exclude_domains,
            "contents": {
                "highlights": {
                    "numSentences": 2,
                    "highlightsPerUrl": 1,
                    "query": query_text,
                },
            },
        }))
        .send()
        .await
        .map_err(|err| format!("EXA Search request failed: {err}"))?;
    if !response.status().is_success() {
        return Err(vendor_provider_http_error("EXA Search", response).await);
    }
    let json = response
        .json::<serde_json::Value>()
        .await
        .map_err(|err| format!("EXA Search response parse failed: {err}"))?;
    Ok(json["results"]
        .as_array()
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .take(limit)
        .filter_map(|item| {
            let url = item["url"].as_str()?;
            let title = item["title"]
                .as_str()
                .filter(|value| !value.trim().is_empty())
                .unwrap_or(url)
                .to_string();
            let snippet = item["highlights"]
                .as_array()
                .and_then(|values| values.first())
                .and_then(Value::as_str)
                .or_else(|| item["text"].as_str())
                .or_else(|| item["summary"].as_str())
                .map(|value| value.chars().take(420).collect::<String>());
            Some(WeddingVendorSearchSource {
                title,
                url: url.to_string(),
                snippet: snippet.clone(),
                provider: "EXA Search API".to_string(),
                website_url: Some(url.to_string()),
                photo_url: item["image"].as_str().map(ToOwned::to_owned),
                email: infer_email_from_text(snippet.as_deref().unwrap_or_default()),
                instagram_url: url
                    .to_ascii_lowercase()
                    .contains("instagram.com")
                    .then(|| url.to_string()),
                ..WeddingVendorSearchSource::default()
            })
        })
        .collect())
}

const PLACES_BASE_FIELDS: &str = "places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.internationalPhoneNumber,places.rating,places.userRatingCount,places.googleMapsUri,places.websiteUri,places.photos,places.types,places.primaryType,places.businessStatus,places.location,places.priceLevel,places.priceRange,places.regularOpeningHours,places.accessibilityOptions";
/// These fields move the whole Text Search request to the Enterprise + Atmosphere SKU. The
/// request is already billed at Enterprise for rating/website, and billing is per request at
/// the highest SKU any field triggers, so this is one tier bump per search, not per place.
const PLACES_ATMOSPHERE_FIELDS: &str =
    "places.editorialSummary,places.allowsDogs,places.outdoorSeating,places.parkingOptions";

pub(super) fn places_field_mask(include_atmosphere: bool) -> String {
    if include_atmosphere {
        format!("{PLACES_BASE_FIELDS},{PLACES_ATMOSPHERE_FIELDS}")
    } else {
        PLACES_BASE_FIELDS.to_string()
    }
}

fn places_included_type(query: &WeddingVendorSearchQueryRequest) -> Option<String> {
    query
        .google_place_types
        .as_ref()?
        .iter()
        .map(|value| value.trim())
        .find(|value| !value.is_empty() && *value != "point_of_interest")
        .map(str::to_string)
}

pub(super) fn places_request_body(
    query: &WeddingVendorSearchQueryRequest,
    limit: usize,
    region_code: &str,
) -> Value {
    let mut body = json!({
        "textQuery": query.query,
        "maxResultCount": limit.clamp(1, 20),
        "regionCode": region_code,
        "languageCode": "en",
    });
    if let Some(included_type) = places_included_type(query) {
        body["includedType"] = json!(included_type);
        body["strictTypeFiltering"] = json!(false);
    }
    body
}

pub(super) struct PlacesParse {
    pub(super) sources: Vec<WeddingVendorSearchSource>,
    pub(super) closed_filtered: usize,
}

pub(super) async fn search_google_places(
    client: &reqwest::Client,
    query: &WeddingVendorSearchQueryRequest,
    limit: usize,
    closed_filtered: &mut usize,
) -> Result<Vec<WeddingVendorSearchSource>, String> {
    let key = resolve_admin_tool_secret(GOOGLE_PLACES_SPEC)
        .map(|secret| secret.secret)
        .ok_or_else(|| "Google Places API key is not configured.".to_string())?;
    let atmosphere =
        env_flag_value_local("OMNYID_WEDDING_PLACES_ATMOSPHERE_FIELDS").unwrap_or(true);
    let response = client
        .post("https://places.googleapis.com/v1/places:searchText")
        .header("X-Goog-Api-Key", key)
        .header("X-Goog-FieldMask", places_field_mask(atmosphere))
        .json(&places_request_body(
            query,
            limit,
            &wedding_search_country(),
        ))
        .send()
        .await
        .map_err(|err| format!("Google Places request failed: {err}"))?;
    if !response.status().is_success() {
        return Err(vendor_provider_http_error("Google Places", response).await);
    }
    let json = response
        .json::<serde_json::Value>()
        .await
        .map_err(|err| format!("Google Places response parse failed: {err}"))?;
    let parsed = google_places_sources_from_response(&json, query, limit);
    *closed_filtered += parsed.closed_filtered;
    Ok(parsed.sources)
}

fn money_units(value: &Value) -> Option<f64> {
    let units = value["units"]
        .as_str()
        .and_then(|text| text.parse::<f64>().ok())
        .or_else(|| value["units"].as_f64())
        .unwrap_or(0.0);
    let nanos = value["nanos"].as_f64().unwrap_or(0.0) / 1_000_000_000.0;
    let total = units + nanos;
    (total > 0.0).then_some(total)
}

fn places_price_per_head(item: &Value) -> Option<f64> {
    let range = &item["priceRange"];
    let currency_ok = |side: &Value| {
        side["currencyCode"]
            .as_str()
            .is_none_or(|currency| currency.eq_ignore_ascii_case("AUD"))
    };
    let start = currency_ok(&range["startPrice"])
        .then(|| money_units(&range["startPrice"]))
        .flatten();
    let end = currency_ok(&range["endPrice"])
        .then(|| money_units(&range["endPrice"]))
        .flatten();
    match (start, end) {
        (Some(low), Some(high)) => Some((low + high) / 2.0),
        (Some(value), None) | (None, Some(value)) => Some(value),
        (None, None) => None,
    }
}

/// Only fields Google actually returned become evidence: an absent field stays unknown and is
/// never turned into a false.
fn places_pending_attributes(
    item: &Value,
    category: Option<&str>,
    maps_url: Option<&String>,
) -> Vec<PendingAttribute> {
    const AGGREGATE: &str = "independent_aggregate";
    let source = |attribute: PendingAttribute| {
        attribute.with_source(maps_url.cloned(), Some("Google Places API".to_string()))
    };
    let mut attributes = Vec::new();
    if let Some(id) = item["id"].as_str().filter(|id| !id.is_empty()) {
        attributes.push(source(
            PendingAttribute::known(
                "google_place_id",
                json!(id),
                AGGREGATE,
                PLACES_IDENTITY_TTL_DAYS,
            )
            .with_confidence(1.0),
        ));
    }
    if let Some(rating) = item["rating"].as_f64() {
        attributes.push(source(
            PendingAttribute::known(
                "rating_google",
                json!(rating),
                AGGREGATE,
                PLACES_RATING_TTL_DAYS,
            )
            .with_confidence(0.9),
        ));
    }
    if let Some(count) = item["userRatingCount"].as_u64() {
        attributes.push(source(
            PendingAttribute::known(
                "review_count_google",
                json!(count),
                AGGREGATE,
                PLACES_RATING_TTL_DAYS,
            )
            .with_confidence(0.9),
        ));
    }
    if let Some(status) = item["businessStatus"].as_str().filter(|status| {
        matches!(
            *status,
            "OPERATIONAL" | "CLOSED_TEMPORARILY" | "CLOSED_PERMANENTLY"
        )
    }) {
        attributes.push(source(
            PendingAttribute::known(
                "business_status",
                json!(status),
                AGGREGATE,
                PLACES_RATING_TTL_DAYS,
            )
            .with_confidence(0.9),
        ));
    }
    if let Some(level) = item["priceLevel"]
        .as_str()
        .filter(|level| level.starts_with("PRICE_LEVEL_") && *level != "PRICE_LEVEL_UNSPECIFIED")
    {
        attributes.push(source(
            PendingAttribute::known(
                "price_level_google",
                json!(level),
                AGGREGATE,
                PLACES_RATING_TTL_DAYS,
            )
            .with_confidence(0.8),
        ));
    }
    // Google's range is a per-person restaurant figure, so it is stored as a weak per-head
    // estimate and only for venues; it must never read as a quote for the whole wedding.
    let is_venue = category.is_some_and(|value| value.trim().eq_ignore_ascii_case("venue"));
    if let Some(per_head) = is_venue.then(|| places_price_per_head(item)).flatten() {
        attributes.push(source(PendingAttribute::estimated(
            "price_per_head_aud",
            json!(per_head.round()),
            AGGREGATE,
            0.3,
            PLACES_RATING_TTL_DAYS,
        )));
    }
    if let Some(accessible) = item["accessibilityOptions"]["wheelchairAccessibleEntrance"].as_bool()
    {
        attributes.push(source(
            PendingAttribute::known(
                "wheelchair_accessible",
                json!(accessible),
                AGGREGATE,
                PLACES_RATING_TTL_DAYS,
            )
            .with_confidence(0.7),
        ));
    }
    if let Some(allows_dogs) = item["allowsDogs"].as_bool() {
        attributes.push(source(
            PendingAttribute::known(
                "pets_allowed",
                json!(allows_dogs),
                AGGREGATE,
                PLACES_RATING_TTL_DAYS,
            )
            .with_confidence(0.6),
        ));
    }
    let has_parking = item["parkingOptions"]
        .as_object()
        .is_some_and(|options| options.values().any(|value| value.as_bool() == Some(true)));
    if has_parking {
        attributes.push(source(
            PendingAttribute::known("parking", json!(true), AGGREGATE, PLACES_RATING_TTL_DAYS)
                .with_confidence(0.7),
        ));
    }
    // Outdoor seating is not an outdoor ceremony space, hence estimated at low confidence.
    if item["outdoorSeating"].as_bool() == Some(true) {
        attributes.push(source(PendingAttribute::estimated(
            "outdoor_space",
            json!(true),
            AGGREGATE,
            0.5,
            PLACES_RATING_TTL_DAYS,
        )));
    }
    if let Some(summary) = item["editorialSummary"]["text"]
        .as_str()
        .map(str::trim)
        .filter(|text| !text.is_empty())
    {
        attributes.push(source(
            PendingAttribute::known(
                "editorial_summary",
                json!(summary),
                AGGREGATE,
                PLACES_RATING_TTL_DAYS,
            )
            .with_confidence(0.8),
        ));
    }
    attributes
}

pub(super) fn google_places_sources_from_response(
    json: &serde_json::Value,
    query: &WeddingVendorSearchQueryRequest,
    limit: usize,
) -> PlacesParse {
    let place_types = query
        .google_place_types
        .clone()
        .unwrap_or_default()
        .join(", ");
    let mut closed_filtered = 0usize;
    let sources = json["places"]
        .as_array()
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .filter(|item| {
            let closed = item["businessStatus"].as_str() == Some("CLOSED_PERMANENTLY");
            closed_filtered += usize::from(closed);
            !closed
        })
        .take(limit)
        .filter_map(|item| {
            let name = item["displayName"]["text"]
                .as_str()
                .or_else(|| item["displayName"].as_str())?
                .to_string();
            let place_id = item["id"].as_str().unwrap_or("");
            let vicinity = item["formattedAddress"].as_str().unwrap_or("");
            let rating = item["rating"].as_f64();
            let review_count = item["userRatingCount"].as_u64();
            let rating_text = rating
                .map(|value| {
                    let count = review_count
                        .map(|count| {
                            format!(
                                " across {count} review{}",
                                if count == 1 { "" } else { "s" }
                            )
                        })
                        .unwrap_or_default();
                    format!(" rating {value:.1}{count}")
                })
                .unwrap_or_default();
            let maps_url = item["googleMapsUri"].as_str().map(str::to_string);
            let website_url = item["websiteUri"].as_str().map(str::to_string);
            let phone = item["internationalPhoneNumber"]
                .as_str()
                .or_else(|| item["nationalPhoneNumber"].as_str())
                .map(str::to_string);
            let photo_url = item["photos"]
                .as_array()
                .and_then(|photos| photos.first())
                .and_then(|photo| photo["name"].as_str())
                .and_then(google_place_photo_proxy_url);
            let fallback_url = if place_id.is_empty() {
                format!(
                    "https://www.google.com/maps/search/?api=1&query={}",
                    urlencoding::encode(&query.query)
                )
            } else {
                format!(
                    "https://www.google.com/maps/search/?api=1&query={}&query_place_id={}",
                    urlencoding::encode(&query.query),
                    place_id
                )
            };
            let pending_attributes =
                places_pending_attributes(&item, query.category.as_deref(), maps_url.as_ref());
            Some(WeddingVendorSearchSource {
                title: name,
                url: website_url
                    .clone()
                    .or_else(|| maps_url.clone())
                    .unwrap_or(fallback_url),
                snippet: Some(format!(
                    "{}{}{}",
                    vicinity,
                    rating_text,
                    if place_types.is_empty() {
                        ""
                    } else {
                        " - place types requested"
                    }
                )),
                provider: "Google Places API".to_string(),
                website_url,
                map_url: maps_url,
                photo_url,
                address: (!vicinity.is_empty()).then(|| vicinity.to_string()),
                phone,
                place_id: (!place_id.is_empty()).then(|| place_id.to_string()),
                rating,
                review_count,
                pending_attributes,
                ..WeddingVendorSearchSource::default()
            })
        })
        .collect();
    PlacesParse {
        sources,
        closed_filtered,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn places_query(category: &str, types: &[&str]) -> WeddingVendorSearchQueryRequest {
        WeddingVendorSearchQueryRequest {
            provider_kind: "google_places".to_string(),
            category: Some(category.to_string()),
            query: "wedding venue Hunter Valley".to_string(),
            google_place_types: Some(types.iter().map(|value| value.to_string()).collect()),
            overpass_tags: None,
        }
    }

    #[test]
    fn google_places_sources_from_response_reads_places_api_new_shape() {
        let query = WeddingVendorSearchQueryRequest {
            provider_kind: "google_places".to_string(),
            category: Some("florist".to_string()),
            query: "florist in Sydney specialising in wedding".to_string(),
            google_place_types: Some(vec!["point_of_interest".to_string()]),
            overpass_tags: None,
        };
        let response = json!({
            "places": [{
                "id": "places/example",
                "displayName": { "text": "Chloe's Florals" },
                "formattedAddress": "12 Test Street, Sydney NSW",
                "rating": 4.9,
                "userRatingCount": 63,
                "googleMapsUri": "https://maps.google.com/?cid=example",
                "websiteUri": "https://example.test",
                "photos": [{ "name": "places/example/photos/photo_abc-123" }]
            }]
        });

        let sources = google_places_sources_from_response(&response, &query, 5).sources;

        assert_eq!(sources.len(), 1);
        assert_eq!(sources[0].title, "Chloe's Florals");
        assert_eq!(sources[0].url, "https://example.test");
        assert_eq!(
            sources[0].website_url.as_deref(),
            Some("https://example.test")
        );
        assert_eq!(
            sources[0].map_url.as_deref(),
            Some("https://maps.google.com/?cid=example")
        );
        assert_eq!(
            sources[0].photo_url.as_deref(),
            Some(
                "/wedding/vendor-photo/google?name=places%2Fexample%2Fphotos%2Fphoto_abc-123&max_width_px=720"
            )
        );
        assert!(
            !sources[0]
                .photo_url
                .as_deref()
                .unwrap_or_default()
                .contains("key=")
        );
        assert!(
            sources[0]
                .snippet
                .as_deref()
                .unwrap_or_default()
                .contains("rating 4.9 across 63 reviews")
        );
        assert_eq!(sources[0].provider, "Google Places API");
        assert_eq!(sources[0].rating, Some(4.9));
        assert_eq!(sources[0].review_count, Some(63));
        assert_eq!(sources[0].place_id.as_deref(), Some("places/example"));
        assert_eq!(
            sources[0].address.as_deref(),
            Some("12 Test Street, Sydney NSW")
        );
    }

    fn rich_place(status: &str) -> Value {
        json!({
            "id": "ChIJrich",
            "displayName": { "text": "Redleaf Wollombi" },
            "formattedAddress": "1 Main Rd, Wollombi NSW 2325, Australia",
            "rating": 4.8,
            "userRatingCount": 312,
            "googleMapsUri": "https://maps.google.com/?cid=9",
            "websiteUri": "https://redleafwollombi.com.au",
            "businessStatus": status,
            "priceLevel": "PRICE_LEVEL_EXPENSIVE",
            "priceRange": {
                "startPrice": { "currencyCode": "AUD", "units": "60" },
                "endPrice": { "currencyCode": "AUD", "units": "120" }
            },
            "accessibilityOptions": { "wheelchairAccessibleEntrance": true },
            "allowsDogs": false,
            "parkingOptions": { "freeParkingLot": true, "valetParking": false },
            "outdoorSeating": true,
            "editorialSummary": { "text": "A garden estate in the Hunter Valley." }
        })
    }

    fn attribute<'a>(source: &'a WeddingVendorSearchSource, key: &str) -> &'a PendingAttribute {
        source
            .pending_attributes
            .iter()
            .find(|attribute| attribute.key == key)
            .unwrap_or_else(|| panic!("missing attribute {key}"))
    }

    #[test]
    fn places_response_maps_every_new_field_into_attributes() {
        let query = places_query("venue", &["event_venue"]);
        let parsed = google_places_sources_from_response(
            &json!({"places": [rich_place("OPERATIONAL")]}),
            &query,
            5,
        );
        assert_eq!(parsed.closed_filtered, 0);
        let source = &parsed.sources[0];
        assert_eq!(
            attribute(source, "google_place_id").value,
            Some(json!("ChIJrich"))
        );
        assert_eq!(attribute(source, "rating_google").value, Some(json!(4.8)));
        assert_eq!(
            attribute(source, "review_count_google").value,
            Some(json!(312))
        );
        assert_eq!(
            attribute(source, "business_status").value,
            Some(json!("OPERATIONAL"))
        );
        assert_eq!(
            attribute(source, "price_level_google").value,
            Some(json!("PRICE_LEVEL_EXPENSIVE"))
        );
        let price = attribute(source, "price_per_head_aud");
        assert_eq!(price.status, "estimated");
        assert_eq!(price.value, Some(json!(90.0)));
        assert!(price.confidence.unwrap_or(1.0) <= 0.3);
        assert_eq!(
            attribute(source, "wheelchair_accessible").value,
            Some(json!(true))
        );
        assert_eq!(attribute(source, "pets_allowed").value, Some(json!(false)));
        assert_eq!(attribute(source, "parking").value, Some(json!(true)));
        let outdoor = attribute(source, "outdoor_space");
        assert_eq!(outdoor.status, "estimated");
        assert_eq!(outdoor.confidence, Some(0.5));
        assert_eq!(
            attribute(source, "editorial_summary").value,
            Some(json!("A garden estate in the Hunter Valley."))
        );
        assert!(
            source
                .pending_attributes
                .iter()
                .all(|attribute| attribute.authority == "independent_aggregate")
        );
    }

    #[test]
    fn places_absent_fields_stay_unknown_and_price_range_is_venue_only() {
        let sparse = json!({"places": [{
            "id": "ChIJsparse",
            "displayName": { "text": "Plain Place" },
            "parkingOptions": { "freeParkingLot": false },
            "outdoorSeating": false,
            "priceRange": { "startPrice": { "currencyCode": "AUD", "units": "40" } }
        }]});
        let parsed =
            google_places_sources_from_response(&sparse, &places_query("photographer", &[]), 5);
        let keys = parsed.sources[0]
            .pending_attributes
            .iter()
            .map(|attribute| attribute.key)
            .collect::<Vec<_>>();
        assert_eq!(keys, vec!["google_place_id"]);
        let venue = google_places_sources_from_response(&sparse, &places_query("venue", &[]), 5);
        assert!(
            venue.sources[0]
                .pending_attributes
                .iter()
                .any(|a| a.key == "price_per_head_aud")
        );
    }

    #[test]
    fn closed_permanently_places_are_dropped_and_counted() {
        let response =
            json!({"places": [rich_place("CLOSED_PERMANENTLY"), rich_place("OPERATIONAL")]});
        let parsed = google_places_sources_from_response(&response, &places_query("venue", &[]), 5);
        assert_eq!(parsed.sources.len(), 1);
        assert_eq!(parsed.closed_filtered, 1);
    }

    #[test]
    fn places_request_uses_included_type_region_and_language() {
        let body = places_request_body(
            &places_query("venue", &["point_of_interest", "event_venue"]),
            5,
            "AU",
        );
        assert_eq!(body["includedType"], json!("event_venue"));
        assert_eq!(body["strictTypeFiltering"], json!(false));
        assert_eq!(body["regionCode"], json!("AU"));
        assert_eq!(body["languageCode"], json!("en"));
        let untyped = places_request_body(
            &places_query("photographer", &["point_of_interest"]),
            5,
            "AU",
        );
        assert!(untyped.get("includedType").is_none());
        assert!(untyped.get("strictTypeFiltering").is_none());
    }

    #[test]
    fn places_field_mask_gates_atmosphere_fields() {
        let with = places_field_mask(true);
        let without = places_field_mask(false);
        for field in [
            "places.businessStatus",
            "places.types",
            "places.priceRange",
            "places.regularOpeningHours",
        ] {
            assert!(without.contains(field), "{field} missing from base mask");
        }
        assert!(!without.contains("places.editorialSummary"));
        for field in [
            "places.editorialSummary",
            "places.allowsDogs",
            "places.parkingOptions",
            "places.outdoorSeating",
        ] {
            assert!(with.contains(field), "{field} missing from atmosphere mask");
        }
    }

    #[test]
    fn search_country_defaults_to_au_and_rejects_malformed_values() {
        let _env = env_lock();
        unsafe { std::env::remove_var("OMNYID_WEDDING_SEARCH_COUNTRY") };
        assert_eq!(wedding_search_country(), "AU");
        unsafe { std::env::set_var("OMNYID_WEDDING_SEARCH_COUNTRY", "nz") };
        assert_eq!(wedding_search_country(), "NZ");
        unsafe { std::env::set_var("OMNYID_WEDDING_SEARCH_COUNTRY", "australia") };
        assert_eq!(wedding_search_country(), "AU");
        unsafe { std::env::remove_var("OMNYID_WEDDING_SEARCH_COUNTRY") };
    }
}
