// @locs-version: 2.0
//! Second half of vendor discovery: turn classified candidates into resolved, persisted
//! entities. Entities with no confirmed official site get a bounded, cached, metered lookup;
//! the best few are probed for stated capacity; everything is stored as attribute evidence and
//! then joined with the couple's availability state before it leaves the server.

use super::attribute_catalog::{PendingAttribute, attributes_with_unknowns};
use super::entity_merge::{classify_and_merge_sources, merge_entities_sharing_websites};
use super::providers::{brave_web_search, exa_search};
use super::source_classification::{
    discard_goggle, host_and_path, official_site_confidence, registrable_domain,
    resolution_excluded_domains,
};
use super::*;
use crate::db::WeddingVendorUserContactRecord;
use crate::db::wedding_vendor_evidence::{
    VendorAttributeRecord, VendorAvailabilityRecord, vendor_attribute_authority_rank,
};
use std::collections::HashMap;

const DEFAULT_RESOLUTION_MAX_CALLS: usize = 5;
const OFFICIAL_SITE_ACCEPT_THRESHOLD: f32 = 0.6;
const CACHE_MIN_CONFIDENCE: f32 = 0.8;
const ENRICHMENT_TOP_ENTITIES: usize = 3;
const SNIPPET_CAPACITY_CONFIDENCE: f32 = 0.6;
const IDENTITY_TTL_DAYS: i64 = 365;

fn online_catalog_enrichment_value_enabled(value: Option<&str>) -> bool {
    !matches!(
        value.map(str::trim).map(str::to_ascii_lowercase).as_deref(),
        Some("0" | "false" | "no" | "off")
    )
}

fn online_catalog_enrichment_enabled() -> bool {
    online_catalog_enrichment_value_enabled(
        std::env::var("OMNYID_WEDDING_ONLINE_CATALOG_ENRICHMENT_ENABLED")
            .ok()
            .as_deref(),
    )
}

fn resolution_max_calls() -> usize {
    std::env::var("OMNYID_WEDDING_RESOLUTION_MAX_CALLS")
        .ok()
        .and_then(|value| value.trim().parse::<usize>().ok())
        .map(|value| value.min(20))
        .unwrap_or(DEFAULT_RESOLUTION_MAX_CALLS)
}

#[derive(Default)]
struct ResolutionStats {
    attempted: usize,
    resolved: usize,
    cache_hits: usize,
    enrichment_attempted: usize,
}

pub(super) struct EnrichInput<'a> {
    pub(super) db: &'a Db,
    pub(super) client: &'a reqwest::Client,
    pub(super) user_id: &'a str,
    pub(super) workspace_id: Option<&'a str>,
    pub(super) wedding_plan_id: Option<&'a str>,
    pub(super) queries: &'a [WeddingVendorSearchQueryRequest],
    pub(super) blocked_provider_kinds: &'a BTreeSet<String>,
}

pub(super) struct EnrichOutcome {
    pub(super) sources: Vec<WeddingVendorSearchSource>,
    pub(super) persisted_count: usize,
    pub(super) receipt: Value,
}

/// Entities still without a website, in result order, capped so one search cannot fan out
/// into unbounded paid lookups.
pub(super) fn select_resolution_candidates(
    sources: &[WeddingVendorSearchSource],
    max: usize,
) -> Vec<usize> {
    sources
        .iter()
        .enumerate()
        .filter(|(_, source)| source.website_url.is_none() && !source.title.trim().is_empty())
        .map(|(index, _)| index)
        .take(max)
        .collect()
}

/// A cached site is reusable only if it came from an authoritative source, is confident and
/// has not expired; anything weaker is re-resolved.
pub(super) fn usable_cached_official_site(
    record: &VendorAttributeRecord,
    now: chrono::DateTime<chrono::Utc>,
) -> Option<String> {
    let url = record.value.as_ref()?.as_str()?.to_string();
    let rank = vendor_attribute_authority_rank(&record.authority, "primary_official")?;
    let required = vendor_attribute_authority_rank("primary_official", "primary_official")?;
    let expired = record
        .valid_until
        .as_deref()
        .and_then(parse_db_timestamp)
        .is_some_and(|valid_until| valid_until < now);
    (matches!(record.status.as_str(), "known" | "estimated")
        && rank >= required
        && record.confidence.unwrap_or(0.0) >= CACHE_MIN_CONFIDENCE
        && !expired)
        .then_some(url)
}

fn parse_db_timestamp(text: &str) -> Option<chrono::DateTime<chrono::Utc>> {
    chrono::DateTime::parse_from_rfc3339(text)
        .ok()
        .or_else(|| chrono::DateTime::parse_from_str(text, "%Y-%m-%d %H:%M:%S%.f%#z").ok())
        .map(|parsed| parsed.with_timezone(&chrono::Utc))
}

pub(super) struct WebHit {
    pub(super) title: String,
    pub(super) url: String,
    pub(super) snippet: String,
}

/// Best-scoring hit at or above the acceptance threshold; earlier hits win ties.
pub(super) fn pick_official_site(
    hits: &[WebHit],
    name: &str,
    phone: Option<&str>,
    address: Option<&str>,
) -> Option<(String, f32)> {
    let mut best: Option<(String, f32)> = None;
    for hit in hits {
        let score =
            official_site_confidence(name, &hit.url, &hit.title, &hit.snippet, phone, address);
        if score >= OFFICIAL_SITE_ACCEPT_THRESHOLD
            && best.as_ref().is_none_or(|(_, current)| score > *current)
        {
            best = Some((hit.url.clone(), score));
        }
    }
    best
}

fn site_root(url: &str) -> String {
    reqwest::Url::parse(url)
        .ok()
        .and_then(|parsed| {
            parsed
                .host_str()
                .map(|host| format!("{}://{host}/", parsed.scheme()))
        })
        .unwrap_or_else(|| url.to_string())
}

fn brave_hits(results: &[Value]) -> Vec<WebHit> {
    results
        .iter()
        .filter_map(|item| {
            Some(WebHit {
                title: item["title"].as_str()?.to_string(),
                url: item["url"].as_str()?.to_string(),
                snippet: item["description"].as_str().unwrap_or_default().to_string(),
            })
        })
        .collect()
}

fn word_is(text: &str, start: usize, end: usize) -> bool {
    let bytes = text.as_bytes();
    let before_ok = start == 0 || !bytes[start - 1].is_ascii_alphanumeric();
    let after_ok = end >= bytes.len() || !bytes[end].is_ascii_alphanumeric();
    before_ok && after_ok
}

/// (seated_max, standing_max) from phrases such as "120 seated" or "250 standing". A bare
/// "N guests" counts as seated, the conservative reading for a feasibility check. Numbers
/// outside 10..=2000, and calendar years, are ignored so they cannot pose as capacities.
pub(super) fn extract_capacity_mentions(text: &str) -> (Option<u32>, Option<u32>) {
    let lower = text.to_ascii_lowercase();
    let bytes = lower.as_bytes();
    let (mut seated, mut standing) = (None::<u32>, None::<u32>);
    let mut index = 0;
    while index < bytes.len() {
        if !bytes[index].is_ascii_digit() || (index > 0 && bytes[index - 1].is_ascii_digit()) {
            index += 1;
            continue;
        }
        let digits_end = index
            + bytes[index..]
                .iter()
                .take_while(|b| b.is_ascii_digit())
                .count();
        let digits = &lower[index..digits_end];
        let mut cursor = digits_end;
        while cursor < bytes.len() && bytes[cursor] == b' ' {
            cursor += 1;
        }
        let word_end = cursor
            + bytes[cursor..]
                .iter()
                .take_while(|b| b.is_ascii_alphabetic())
                .count();
        let word = &lower[cursor..word_end];
        let number = digits
            .parse::<u32>()
            .ok()
            .filter(|n| (10..=2000).contains(n) && !(1900..=2100).contains(n));
        if let (Some(number), true, true) = (
            number,
            (2..=4).contains(&digits.len()) && word_is(&lower, index, digits_end),
            word_is(&lower, cursor, word_end),
        ) {
            match word {
                "seated" | "guests" => seated = seated.max(Some(number)),
                "standing" | "cocktail" => standing = standing.max(Some(number)),
                _ => {}
            }
        }
        index = digits_end;
    }
    (seated, standing)
}

async fn meter(input: &EnrichInput<'_>, provider: WeddingSharedToolProvider, operation: &str) {
    if let Err(err) = record_wedding_shared_tool_usage(
        input.db,
        WeddingSharedToolUsageInput {
            user_id: input.user_id.to_string(),
            provider,
            feature: WeddingSharedToolFeature::VendorDiscovery,
            quantity: 1.0,
            estimated_cost_usd: 0.0,
            usage_unit: Some("requests".to_string()),
            wedding_plan_id: input.workspace_id.map(str::to_string),
            operation: Some(operation.to_string()),
            provider_request_id: None,
            occurred_at: Some(chrono::Utc::now().to_rfc3339()),
        },
    )
    .await
    {
        tracing::warn!(%err, operation, "wedding vendor discovery usage metering failed");
    }
}

fn apply_resolved_site(
    source: &mut WeddingVendorSearchSource,
    site: &str,
    score: f32,
    evidence_url: Option<String>,
    label: &str,
) {
    let root = site_root(site);
    source.website_url = Some(root.clone());
    source.url = root.clone();
    source.source_kind = Some("official".to_string());
    source.official_site_confidence = Some(score);
    let attribute = if score >= CACHE_MIN_CONFIDENCE {
        PendingAttribute::known(
            "official_website",
            json!(root),
            "primary_official",
            IDENTITY_TTL_DAYS,
        )
    } else {
        PendingAttribute::estimated(
            "official_website",
            json!(root),
            "primary_official",
            score,
            IDENTITY_TTL_DAYS,
        )
    };
    source.pending_attributes.push(
        attribute
            .with_confidence(score)
            .with_source(evidence_url, Some(label.to_string())),
    );
}

async fn resolve_official_sites(
    input: &EnrichInput<'_>,
    sources: &mut [WeddingVendorSearchSource],
    stats: &mut ResolutionStats,
    failed_messages: &mut Vec<String>,
) {
    let max_calls = resolution_max_calls();
    let candidates = select_resolution_candidates(sources, max_calls);
    if candidates.is_empty() {
        return;
    }
    let (default_category, default_area) = discovery_context(input.queries);
    let slugs = candidates
        .iter()
        .map(|&index| source_vendor_slug(&sources[index], &default_category, &default_area))
        .collect::<Vec<_>>();
    let cache = input
        .db
        .official_website_cache_by_slug(&slugs)
        .await
        .unwrap_or_else(|err| {
            failed_messages.push(format!(
                "Official-site cache lookup failed: {err}. Resolution will query providers instead."
            ));
            HashMap::new()
        });
    let brave_ok = admin_shared_tool_policy_enabled("brave-search-api")
        && !input.blocked_provider_kinds.contains("brave_search");
    let exa_ok = admin_shared_tool_policy_enabled("exa-search-api")
        && !input.blocked_provider_kinds.contains("exa_search");
    let goggle = discard_goggle(&resolution_excluded_domains());
    let exclude = resolution_excluded_domains();
    let now = chrono::Utc::now();
    let mut calls = 0usize;
    for (position, &index) in candidates.iter().enumerate() {
        stats.attempted += 1;
        if let Some(site) = cache
            .get(&slugs[position])
            .and_then(|record| usable_cached_official_site(record, now))
        {
            apply_resolved_site(
                &mut sources[index],
                &site,
                0.9,
                Some(site.clone()),
                "Cached official site",
            );
            stats.cache_hits += 1;
            stats.resolved += 1;
            continue;
        }
        let name = sources[index].title.clone();
        let phone = sources[index].phone.clone();
        let address = sources[index].address.clone();
        let query_text = format!("\"{name}\" {default_area} wedding");
        let mut found = None;
        if brave_ok && calls < max_calls {
            calls += 1;
            meter(
                input,
                WeddingSharedToolProvider::BraveSearch,
                "vendor_canonical_resolution",
            )
            .await;
            match brave_web_search(input.client, &query_text, 5, Some(&goggle)).await {
                Ok(response) => {
                    failed_messages.extend(response.goggles_fallback_note);
                    found = pick_official_site(
                        &brave_hits(&response.results),
                        &name,
                        phone.as_deref(),
                        address.as_deref(),
                    );
                }
                Err(message) => {
                    let blocking = provider_error_blocks_remaining_run_queries(&message);
                    failed_messages
                        .push(format!("Official-site lookup for {name} failed: {message}"));
                    if blocking {
                        return;
                    }
                }
            }
        }
        if found.is_none() && exa_ok && calls < max_calls {
            calls += 1;
            meter(
                input,
                WeddingSharedToolProvider::ExaSearch,
                "vendor_canonical_resolution",
            )
            .await;
            match exa_search(input.client, &query_text, 5, &exclude).await {
                Ok(results) => {
                    let hits = results
                        .into_iter()
                        .map(|result| WebHit {
                            title: result.title,
                            url: result.url,
                            snippet: result.snippet.unwrap_or_default(),
                        })
                        .collect::<Vec<_>>();
                    found = pick_official_site(&hits, &name, phone.as_deref(), address.as_deref());
                }
                Err(message) => {
                    let blocking = provider_error_blocks_remaining_run_queries(&message);
                    failed_messages
                        .push(format!("Official-site lookup for {name} failed: {message}"));
                    if blocking {
                        return;
                    }
                }
            }
        }
        if let Some((url, score)) = found {
            apply_resolved_site(
                &mut sources[index],
                &url,
                score,
                Some(url.clone()),
                "Canonical resolution",
            );
            stats.resolved += 1;
        }
    }
}

/// One site-restricted query per top entity, reading only snippets for explicit capacity
/// figures. Nothing else is inferred: price text in snippets is too ambiguous to trust.
async fn enrich_top_entities(
    input: &EnrichInput<'_>,
    sources: &mut [WeddingVendorSearchSource],
    stats: &mut ResolutionStats,
    failed_messages: &mut Vec<String>,
) {
    if !admin_shared_tool_policy_enabled("brave-search-api")
        || input.blocked_provider_kinds.contains("brave_search")
    {
        return;
    }
    let (default_category, _) = discovery_context(input.queries);
    for source in sources.iter_mut().take(ENRICHMENT_TOP_ENTITIES) {
        let is_venue = source
            .category
            .as_deref()
            .unwrap_or(&default_category)
            .trim()
            .eq_ignore_ascii_case("venue");
        let Some((site_host, _)) = source.website_url.as_deref().and_then(host_and_path) else {
            continue;
        };
        if !is_venue || source.vendor_id.is_some() {
            continue;
        }
        stats.enrichment_attempted += 1;
        meter(
            input,
            WeddingSharedToolProvider::BraveSearch,
            "vendor_official_site_enrichment",
        )
        .await;
        let query_text = format!("site:{site_host} wedding packages capacity");
        let response = match brave_web_search(input.client, &query_text, 5, None).await {
            Ok(response) => response,
            Err(message) => {
                let blocking = provider_error_blocks_remaining_run_queries(&message);
                failed_messages.push(format!(
                    "Capacity lookup for {} failed: {message}",
                    source.title
                ));
                if blocking {
                    return;
                }
                continue;
            }
        };
        let registrable = registrable_domain(&site_host);
        let mut best: (Option<(u32, String)>, Option<(u32, String)>) = (None, None);
        for hit in brave_hits(&response.results) {
            let same_site = host_and_path(&hit.url)
                .is_some_and(|(host, _)| registrable_domain(&host) == registrable);
            if !same_site {
                continue;
            }
            let (seated, standing) =
                extract_capacity_mentions(&format!("{} {}", hit.title, hit.snippet));
            if let Some(value) = seated.filter(|v| best.0.as_ref().is_none_or(|(c, _)| v > c)) {
                best.0 = Some((value, hit.url.clone()));
            }
            if let Some(value) = standing.filter(|v| best.1.as_ref().is_none_or(|(c, _)| v > c)) {
                best.1 = Some((value, hit.url.clone()));
            }
        }
        for (key, found) in [
            ("capacity_seated_max", best.0),
            ("capacity_standing_max", best.1),
        ] {
            if let Some((value, url)) = found {
                source.pending_attributes.push(
                    PendingAttribute::estimated(
                        key,
                        json!(value),
                        "primary_official",
                        SNIPPET_CAPACITY_CONFIDENCE,
                        IDENTITY_TTL_DAYS,
                    )
                    .with_source(Some(url), Some("Official site search snippet".to_string())),
                );
            }
        }
    }
}

/// Writes everything learned about a vendor during this run. Operator-curated vendors keep
/// their own website evidence, so only discovered vendors get an inferred `official_website`.
pub(super) async fn write_pending_attributes(
    db: &Db,
    user_id: &str,
    vendor_id: &str,
    source: &WeddingVendorSearchSource,
) {
    let now = chrono::Utc::now();
    let mut pending = source.pending_attributes.clone();
    let needs_website_evidence = source.vendor_slug.is_none()
        && !pending
            .iter()
            .any(|attribute| attribute.key == "official_website");
    if let (true, Some(website)) = (needs_website_evidence, source.website_url.as_ref()) {
        let (authority, confidence) = if source.provider.contains("Google Places") {
            ("independent_aggregate", 0.9)
        } else {
            (
                "primary_official",
                source.official_site_confidence.unwrap_or(0.5),
            )
        };
        pending.push(
            PendingAttribute::estimated(
                "official_website",
                json!(website),
                authority,
                confidence,
                IDENTITY_TTL_DAYS,
            )
            .with_source(Some(website.clone()), Some(source.provider.clone())),
        );
    }
    for attribute in pending {
        let key = attribute.key;
        let Some(write) = attribute.into_write(now) else {
            continue;
        };
        if let Err(err) = db
            .upsert_wedding_vendor_attribute(vendor_id, &write, Some(user_id))
            .await
        {
            tracing::warn!(%err, vendor_id, key, "wedding vendor attribute persist failed");
        }
    }
}

fn explicit_availability_json(record: &VendorAvailabilityRecord) -> Value {
    json!({
        "state": record.state,
        "date_from": record.date_from,
        "date_to": record.date_to,
        "confidence": record.confidence,
        "checked_at": record.checked_at,
        "valid_until": record.valid_until,
        "source": record.source,
        "notes": record.notes,
    })
}

/// With no explicit record, an outreach contact still tells us something: awaiting a reply, or
/// a reply that has arrived but has not been turned into an availability answer yet.
pub(super) fn derived_availability_json(contact: Option<&WeddingVendorUserContactRecord>) -> Value {
    match contact {
        Some(contact) if contact.response_received_at.is_none() => json!({
            "state": "awaiting_response",
            "checked_at": contact.last_contact_at,
            "source": "outreach",
            "confidence": null,
        }),
        Some(contact) => json!({
            "state": "unknown",
            "checked_at": contact.response_received_at,
            "source": "outreach",
            "confidence": null,
            "notes": "Vendor replied — confirm availability from the reply",
        }),
        None => json!({"state": "unknown", "source": "none", "confidence": null}),
    }
}

async fn attach_stored_evidence(
    input: &EnrichInput<'_>,
    sources: &mut [WeddingVendorSearchSource],
    failed_messages: &mut Vec<String>,
) {
    let vendor_ids = sources
        .iter()
        .filter_map(|source| source.vendor_id.clone())
        .collect::<Vec<_>>();
    if vendor_ids.is_empty() {
        return;
    }
    let (default_category, _) = discovery_context(input.queries);
    let attributes = input
        .db
        .list_wedding_vendor_attributes(&vendor_ids)
        .await
        .unwrap_or_else(|err| {
            failed_messages.push(format!("Vendor attribute lookup failed: {err}"));
            HashMap::new()
        });
    let (explicit, contacts) = match input.wedding_plan_id {
        Some(plan_id) => {
            let explicit = input
                .db
                .latest_wedding_vendor_availability(input.user_id, plan_id, &vendor_ids)
                .await
                .unwrap_or_else(|err| {
                    failed_messages.push(format!("Vendor availability lookup failed: {err}"));
                    HashMap::new()
                });
            let contacts = input
                .db
                .wedding_vendor_user_contacts_by_vendor(input.user_id, &vendor_ids)
                .await
                .unwrap_or_default();
            (explicit, contacts)
        }
        None => (HashMap::new(), HashMap::new()),
    };
    for source in sources.iter_mut() {
        let Some(vendor_id) = source.vendor_id.clone() else {
            continue;
        };
        let category = source
            .category
            .clone()
            .unwrap_or_else(|| default_category.clone());
        let rows = attributes
            .get(&vendor_id)
            .map(Vec::as_slice)
            .unwrap_or_default();
        source.attributes = Some(attributes_with_unknowns(&category, rows));
        source.availability = Some(match explicit.get(&vendor_id) {
            Some(record) => explicit_availability_json(record),
            None => derived_availability_json(contacts.get(&vendor_id)),
        });
    }
}

/// classify -> merge -> resolve -> enrich -> persist -> attach stored evidence.
pub(super) async fn enrich_vendor_sources(
    input: EnrichInput<'_>,
    raw_sources: Vec<WeddingVendorSearchSource>,
    failed_messages: &mut Vec<String>,
) -> EnrichOutcome {
    let merged = classify_and_merge_sources(raw_sources);
    let mut sources = merged.sources;
    let mut stats = ResolutionStats::default();
    let online_enrichment_enabled = online_catalog_enrichment_enabled();
    if online_enrichment_enabled {
        resolve_official_sites(&input, &mut sources, &mut stats, failed_messages).await;
        enrich_top_entities(&input, &mut sources, &mut stats, failed_messages).await;
    }
    let mut sources = dedupe_sources(merge_entities_sharing_websites(sources));
    let persisted_count =
        persist_live_vendor_sources(input.db, input.user_id, input.queries, &mut sources).await;
    attach_stored_evidence(&input, &mut sources, failed_messages).await;
    EnrichOutcome {
        sources,
        persisted_count,
        receipt: json!({
            "discarded_non_vendor_source_count": merged.discarded_non_vendor_count,
            "editorial_mention_urls": merged.editorial_mention_urls,
            "canonical_resolution_attempted": stats.attempted,
            "canonical_resolution_resolved": stats.resolved,
            "canonical_resolution_cache_hits": stats.cache_hits,
            "official_site_enrichment_attempted": stats.enrichment_attempted,
            "online_catalog_enrichment_enabled": online_enrichment_enabled,
        }),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn entity(title: &str, website: Option<&str>) -> WeddingVendorSearchSource {
        WeddingVendorSearchSource {
            title: title.to_string(),
            url: website
                .unwrap_or("https://www.easyweddings.com.au/x-y/")
                .to_string(),
            website_url: website.map(str::to_string),
            ..WeddingVendorSearchSource::default()
        }
    }

    #[test]
    fn online_enrichment_kill_switch_defaults_on_and_accepts_explicit_off_values() {
        assert!(online_catalog_enrichment_value_enabled(None));
        assert!(online_catalog_enrichment_value_enabled(Some("true")));
        assert!(!online_catalog_enrichment_value_enabled(Some(" FALSE ")));
        assert!(!online_catalog_enrichment_value_enabled(Some("0")));
    }

    #[test]
    fn candidate_selection_skips_resolved_entities_and_respects_the_cap() {
        let sources = vec![
            entity("A One", None),
            entity("B Two", Some("https://btwo.com.au/")),
            entity("C Three", None),
            entity("D Four", None),
            entity("", None),
        ];
        assert_eq!(select_resolution_candidates(&sources, 5), vec![0, 2, 3]);
        assert_eq!(select_resolution_candidates(&sources, 2), vec![0, 2]);
        assert!(select_resolution_candidates(&sources, 0).is_empty());
    }

    fn cached(
        authority: &str,
        confidence: f32,
        valid_until: Option<&str>,
    ) -> VendorAttributeRecord {
        VendorAttributeRecord {
            vendor_id: "v".to_string(),
            attribute_key: "official_website".to_string(),
            value: Some(json!("https://redleafwollombi.com.au/")),
            status: "known".to_string(),
            confidence: Some(confidence),
            authority: authority.to_string(),
            source_url: None,
            source_label: None,
            retrieved_at: "2026-09-01T00:00:00+00:00".to_string(),
            valid_until: valid_until.map(str::to_string),
            notes: None,
        }
    }

    #[test]
    fn cache_hit_requires_authority_confidence_and_freshness() {
        let now = chrono::DateTime::parse_from_rfc3339("2026-10-01T00:00:00Z")
            .expect("time")
            .with_timezone(&chrono::Utc);
        let fresh = Some("2027-01-01T00:00:00+00:00");
        assert!(
            usable_cached_official_site(&cached("primary_official", 0.9, fresh), now).is_some()
        );
        assert!(usable_cached_official_site(&cached("operator", 0.8, None), now).is_some());
        assert!(usable_cached_official_site(&cached("directory", 0.95, fresh), now).is_none());
        assert!(
            usable_cached_official_site(&cached("independent_aggregate", 0.95, fresh), now)
                .is_none()
        );
        assert!(
            usable_cached_official_site(&cached("primary_official", 0.79, fresh), now).is_none()
        );
        assert!(
            usable_cached_official_site(
                &cached("primary_official", 0.9, Some("2026-09-01T00:00:00+00:00")),
                now
            )
            .is_none()
        );
    }

    #[test]
    fn postgres_text_timestamps_parse_for_expiry_checks() {
        assert!(parse_db_timestamp("2026-09-20 00:00:00+00").is_some());
        assert!(parse_db_timestamp("2026-09-20 10:11:12.123456+00").is_some());
        assert!(parse_db_timestamp("2026-09-20T00:00:00+00:00").is_some());
    }

    fn hit(title: &str, url: &str, snippet: &str) -> WebHit {
        WebHit {
            title: title.to_string(),
            url: url.to_string(),
            snippet: snippet.to_string(),
        }
    }

    #[test]
    fn official_site_pick_accepts_a_confident_hit_and_rejects_weak_ones() {
        let hits = vec![
            hit("Hunter weddings", "https://hunterweddings.com.au/", ""),
            hit(
                "Redleaf Wollombi | Wedding Venue",
                "https://redleafwollombi.com.au/weddings",
                "",
            ),
        ];
        let picked = pick_official_site(&hits, "Redleaf Wollombi", None, None).expect("picked");
        assert_eq!(picked.0, "https://redleafwollombi.com.au/weddings");
        assert!(picked.1 >= 0.6);
        assert!(pick_official_site(&hits[..1], "Redleaf Wollombi", None, None).is_none());
        assert_eq!(site_root(&picked.0), "https://redleafwollombi.com.au/");
    }

    #[test]
    fn capacity_extraction_reads_explicit_figures_only() {
        assert_eq!(
            extract_capacity_mentions("Up to 120 seated or 250 standing"),
            (Some(120), Some(250))
        );
        assert_eq!(
            extract_capacity_mentions("holds 150 guests comfortably"),
            (Some(150), None)
        );
        assert_eq!(
            extract_capacity_mentions("300 cocktail, 180 seated"),
            (Some(180), Some(300))
        );
        assert_eq!(
            extract_capacity_mentions("Est. 2019 guests welcome"),
            (None, None)
        );
        assert_eq!(
            extract_capacity_mentions("5 guests or 99999 guests"),
            (None, None)
        );
        assert_eq!(extract_capacity_mentions("2x120seated"), (None, None));
        assert_eq!(
            extract_capacity_mentions("50 to 80 guests, 120 guests max"),
            (Some(120), None)
        );
        assert_eq!(extract_capacity_mentions("no numbers here"), (None, None));
    }

    #[test]
    fn derived_availability_reflects_outreach_state() {
        let mut contact = WeddingVendorUserContactRecord {
            contact_id: "c".to_string(),
            user_id: "u".to_string(),
            vendor_id: "v".to_string(),
            contact_method: "agent_email_draft".to_string(),
            last_contact_at: "2026-09-30 10:00:00+00".to_string(),
            response_received_at: None,
            follow_up_due_at: None,
            thread_id: None,
            receipt_ref: None,
            notes: None,
            created_at: String::new(),
            updated_at: String::new(),
        };
        assert_eq!(
            derived_availability_json(Some(&contact))["state"],
            json!("awaiting_response")
        );
        assert_eq!(
            derived_availability_json(Some(&contact))["source"],
            json!("outreach")
        );
        contact.response_received_at = Some("2026-10-01 01:00:00+00".to_string());
        let replied = derived_availability_json(Some(&contact));
        assert_eq!(replied["state"], json!("unknown"));
        assert!(
            replied["notes"]
                .as_str()
                .unwrap_or_default()
                .contains("Vendor replied")
        );
        assert_eq!(derived_availability_json(None)["state"], json!("unknown"));
    }

    #[test]
    fn resolved_site_marks_the_entity_official_and_records_evidence() {
        let mut source = entity("Redleaf Wollombi", None);
        apply_resolved_site(
            &mut source,
            "https://redleafwollombi.com.au/weddings",
            0.85,
            None,
            "Canonical resolution",
        );
        assert_eq!(
            source.website_url.as_deref(),
            Some("https://redleafwollombi.com.au/")
        );
        assert_eq!(source.source_kind.as_deref(), Some("official"));
        let attribute = source.pending_attributes.last().expect("attribute");
        assert_eq!(attribute.key, "official_website");
        assert_eq!(attribute.status, "known");
        assert_eq!(attribute.authority, "primary_official");
        let mut weak = entity("Redleaf Wollombi", None);
        apply_resolved_site(
            &mut weak,
            "https://redleafwollombi.com.au/",
            0.65,
            None,
            "Canonical resolution",
        );
        assert_eq!(weak.pending_attributes[0].status, "estimated");
    }
}
