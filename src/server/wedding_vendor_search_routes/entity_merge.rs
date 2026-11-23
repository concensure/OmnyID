// @locs-version: 2.0
//! Folds classified search results into one entity per business, picking each field from the
//! most authoritative member. Pure: no I/O.

use super::WeddingVendorSearchSource;
use super::source_classification::{
    SourceKind, classify_source, first_title_segment, host_and_path, host_matches,
    is_known_non_official_host, name_tokens, official_site_confidence, phone_key,
    registrable_domain, social_name, social_title_looks_like_business,
    vendor_name_from_directory_title,
};
use std::collections::BTreeSet;

fn is_entity_native_provider(provider: &str) -> bool {
    provider == "Admin vendor database"
        || provider.starts_with("Google Places")
        || provider.starts_with("OSM")
}

fn native_rank(provider: &str) -> u8 {
    if provider == "Admin vendor database" {
        0
    } else if provider.starts_with("Google Places") {
        1
    } else {
        2
    }
}

#[derive(Clone)]
struct Candidate {
    source: WeddingVendorSearchSource,
    kind: SourceKind,
    native: bool,
    /// The website this candidate contributes, only when its host can be a vendor's own site.
    website: Option<String>,
}

fn plain_website(url: Option<&String>) -> Option<String> {
    let url = url?;
    let (host, path) = host_and_path(url)?;
    (!is_known_non_official_host(&host, &path)).then(|| url.clone())
}

pub(super) struct MergeOutcome {
    pub(super) sources: Vec<WeddingVendorSearchSource>,
    pub(super) discarded_non_vendor_count: usize,
    pub(super) editorial_mention_urls: Vec<String>,
}

fn candidate_from_source(mut source: WeddingVendorSearchSource) -> Result<Candidate, String> {
    if is_entity_native_provider(&source.provider) {
        let website = plain_website(source.website_url.as_ref());
        if website.is_none() {
            if let Some(url) = source.website_url.take() {
                if url.to_ascii_lowercase().contains("instagram.com") {
                    source.instagram_url.get_or_insert(url);
                }
            }
        }
        source.website_url = website.clone();
        let kind = if website.is_some() {
            SourceKind::Official
        } else {
            SourceKind::Maps
        };
        return Ok(Candidate {
            source,
            kind,
            native: true,
            website,
        });
    }
    let kind = classify_source(
        &source.url,
        &source.title,
        source.snippet.as_deref().unwrap_or_default(),
    );
    let (host, _) = host_and_path(&source.url).unwrap_or_default();
    match kind {
        SourceKind::Listicle | SourceKind::Editorial => Err(source.url),
        SourceKind::Social => {
            let name = social_name(&source.title);
            let droppable = host_matches(&host, "pinterest.*") || host == "tiktok.com";
            if droppable || !social_title_looks_like_business(&name) {
                return Err(source.url);
            }
            if host_matches(&host, "instagram.com") {
                source.instagram_url = Some(source.url.clone());
            }
            source.title = name;
            source.website_url = None;
            Ok(Candidate {
                source,
                kind,
                native: false,
                website: None,
            })
        }
        SourceKind::DirectoryProfile => {
            source.title = vendor_name_from_directory_title(&source.title, &host);
            source.website_url = None;
            Ok(Candidate {
                source,
                kind,
                native: false,
                website: None,
            })
        }
        SourceKind::Official => {
            source.title = first_title_segment(&source.title);
            let website = Some(source.url.clone());
            source.website_url = website.clone();
            Ok(Candidate {
                source,
                kind,
                native: false,
                website,
            })
        }
        SourceKind::Maps => {
            source.title = first_title_segment(&source.title);
            source.map_url.get_or_insert_with(|| source.url.clone());
            source.website_url = None;
            Ok(Candidate {
                source,
                kind,
                native: false,
                website: None,
            })
        }
        SourceKind::Unknown => {
            source.title = first_title_segment(&source.title);
            source.website_url = None;
            Ok(Candidate {
                source,
                kind,
                native: false,
                website: None,
            })
        }
    }
}

fn token_set(name: &str) -> BTreeSet<String> {
    name_tokens(name).into_iter().collect()
}

fn same_entity(left: &Candidate, right: &Candidate) -> bool {
    if let (Some(a), Some(b)) = (&left.source.place_id, &right.source.place_id) {
        if a != b {
            return false;
        }
    }
    let left_tokens = token_set(&left.source.title);
    let right_tokens = token_set(&right.source.title);
    if !left_tokens.is_empty() && left_tokens == right_tokens {
        return true;
    }
    let related = left_tokens.is_subset(&right_tokens) || right_tokens.is_subset(&left_tokens);
    if let (Some(a), Some(b)) = (&left.website, &right.website) {
        // Venue groups host several venues under one domain, so a shared domain alone is
        // not evidence of a shared entity; the names must also be related.
        if let (Some((host_a, _)), Some((host_b, _))) = (host_and_path(a), host_and_path(b)) {
            if registrable_domain(&host_a) == registrable_domain(&host_b) && related {
                return true;
            }
        }
    }
    let phones = left
        .source
        .phone
        .as_deref()
        .and_then(phone_key)
        .zip(right.source.phone.as_deref().and_then(phone_key));
    matches!(phones, Some((a, b)) if a == b) && !left_tokens.is_disjoint(&right_tokens)
}

fn path_depth(url: &str) -> usize {
    host_and_path(url)
        .map(|(_, path)| {
            path.split('/')
                .filter(|segment| !segment.is_empty())
                .count()
        })
        .unwrap_or(usize::MAX)
}

fn join_labels(labels: Vec<String>) -> String {
    let mut seen = BTreeSet::new();
    labels
        .into_iter()
        .filter(|label| seen.insert(label.clone()))
        .collect::<Vec<_>>()
        .join(" + ")
}

fn merge_group(mut members: Vec<Candidate>) -> WeddingVendorSearchSource {
    members.sort_by_key(|member| {
        if member.native {
            native_rank(&member.source.provider)
        } else {
            10
        }
    });
    let first_non_empty = |pick: &dyn Fn(&Candidate) -> Option<String>| {
        members
            .iter()
            .find_map(|member| pick(member).filter(|value| !value.trim().is_empty()))
    };

    let title = members
        .iter()
        .find(|member| !member.source.title.trim().is_empty())
        .map(|member| member.source.title.clone())
        .unwrap_or_default();
    let phone = first_non_empty(&|m| m.source.phone.clone());
    let address = first_non_empty(&|m| m.source.address.clone());

    let admin_website = members.iter().find(|member| {
        member.source.provider == "Admin vendor database" && member.website.is_some()
    });
    let web_official = members
        .iter()
        .filter(|member| !member.native && member.kind == SourceKind::Official)
        .min_by_key(|member| path_depth(&member.source.url));
    let native_website = members
        .iter()
        .find(|member| member.native && member.website.is_some());
    let (website, site_confidence) = match (admin_website, web_official, native_website) {
        (Some(member), _, _) => (member.website.clone(), Some(0.95)),
        (None, Some(member), _) => {
            let score = official_site_confidence(
                &title,
                &member.source.url,
                &member.source.title,
                member.source.snippet.as_deref().unwrap_or_default(),
                phone.as_deref(),
                address.as_deref(),
            );
            (member.website.clone(), Some(score.max(0.45)))
        }
        (None, None, Some(member)) => (member.website.clone(), Some(0.9)),
        _ => (None, None),
    };

    let photo_url = members
        .iter()
        .filter(|member| !member.native && member.kind == SourceKind::Official)
        .chain(members.iter().filter(|member| member.native))
        .chain(members.iter().filter(|member| !member.native))
        .find_map(|member| member.source.photo_url.clone());
    let map_url = first_non_empty(&|m| m.source.map_url.clone());
    let url = website
        .clone()
        .or_else(|| map_url.clone())
        .or_else(|| members.first().map(|member| member.source.url.clone()))
        .unwrap_or_default();

    let mut snippets = Vec::<String>::new();
    for member in &members {
        if let Some(snippet) = member.source.snippet.as_deref().map(str::trim) {
            if !snippet.is_empty() && !snippets.iter().any(|existing| existing == snippet) {
                snippets.push(snippet.to_string());
            }
        }
    }
    let snippet = (!snippets.is_empty())
        .then(|| snippets.into_iter().take(2).collect::<Vec<_>>().join(" - "))
        .map(|joined| joined.chars().take(420).collect::<String>());

    let source_kind = if website.is_some() {
        SourceKind::Official
    } else if members.iter().any(|member| member.native) {
        SourceKind::Maps
    } else {
        [SourceKind::DirectoryProfile, SourceKind::Social]
            .into_iter()
            .find(|kind| members.iter().any(|member| member.kind == *kind))
            .unwrap_or(SourceKind::Unknown)
    };

    let mut merged = WeddingVendorSearchSource {
        title,
        url,
        snippet,
        provider: join_labels(members.iter().map(|m| m.source.provider.clone()).collect()),
        website_url: website,
        map_url,
        photo_url,
        address,
        phone,
        email: first_non_empty(&|m| m.source.email.clone()),
        instagram_url: first_non_empty(&|m| m.source.instagram_url.clone()),
        source_kind: Some(source_kind.as_str().to_string()),
        official_site_confidence: site_confidence,
        ..WeddingVendorSearchSource::default()
    };
    for member in &members {
        merged.vendor_id = merged
            .vendor_id
            .take()
            .or_else(|| member.source.vendor_id.clone());
        merged.vendor_slug = merged
            .vendor_slug
            .take()
            .or_else(|| member.source.vendor_slug.clone());
        merged.place_id = merged
            .place_id
            .take()
            .or_else(|| member.source.place_id.clone());
        merged.rating = merged.rating.or(member.source.rating);
        merged.review_count = merged.review_count.or(member.source.review_count);
        merged.category = merged
            .category
            .take()
            .or_else(|| member.source.category.clone());
        merged.service_area = merged
            .service_area
            .take()
            .or_else(|| member.source.service_area.clone());
        merged
            .pending_attributes
            .extend(member.source.pending_attributes.iter().cloned());
    }
    merged
}

fn kind_from_label(label: Option<&str>) -> SourceKind {
    match label {
        Some("official") => SourceKind::Official,
        Some("directory_profile") => SourceKind::DirectoryProfile,
        Some("social") => SourceKind::Social,
        Some("maps") => SourceKind::Maps,
        _ => SourceKind::Unknown,
    }
}

/// `always_merge` runs single-member groups through `merge_group` too, which is what fills
/// in kind and confidence on first classification; later passes leave lone entities alone.
fn group_candidates(
    candidates: Vec<Candidate>,
    always_merge: bool,
) -> Vec<WeddingVendorSearchSource> {
    let mut groups: Vec<Vec<Candidate>> = Vec::new();
    for candidate in candidates {
        match groups
            .iter_mut()
            .find(|group| group.iter().any(|member| same_entity(member, &candidate)))
        {
            Some(group) => group.push(candidate),
            None => groups.push(vec![candidate]),
        }
    }
    groups
        .into_iter()
        .map(|mut group| {
            if group.len() == 1 && !always_merge {
                group.remove(0).source
            } else {
                merge_group(group)
            }
        })
        .collect()
}

/// Canonical resolution can map two entities (say a directory profile and a Places record)
/// onto the same official site; fold those together without re-classifying their sources.
pub(super) fn merge_entities_sharing_websites(
    sources: Vec<WeddingVendorSearchSource>,
) -> Vec<WeddingVendorSearchSource> {
    group_candidates(
        sources
            .into_iter()
            .map(|source| Candidate {
                native: source
                    .provider
                    .split(" + ")
                    .next()
                    .is_some_and(is_entity_native_provider),
                kind: kind_from_label(source.source_kind.as_deref()),
                website: source.website_url.clone(),
                source,
            })
            .collect(),
        false,
    )
}

/// Classifies every source, discards pages that are not vendors, and folds the rest into one
/// entity per business. Non-vendor URLs are returned for the receipt, never as candidates.
pub(super) fn classify_and_merge_sources(sources: Vec<WeddingVendorSearchSource>) -> MergeOutcome {
    let mut candidates = Vec::new();
    let mut discarded = 0usize;
    let mut mention_urls = Vec::new();
    for source in sources {
        if source.title.trim().is_empty() || source.url.trim().is_empty() {
            continue;
        }
        match candidate_from_source(source) {
            Ok(candidate) if !candidate.source.title.trim().is_empty() => {
                candidates.push(candidate)
            }
            Ok(_) => {}
            Err(url) => {
                discarded += 1;
                if mention_urls.len() < 5 && !mention_urls.contains(&url) {
                    mention_urls.push(url);
                }
            }
        }
    }

    MergeOutcome {
        sources: group_candidates(candidates, true),
        discarded_non_vendor_count: discarded,
        editorial_mention_urls: mention_urls,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn web(provider: &str, title: &str, url: &str, snippet: &str) -> WeddingVendorSearchSource {
        WeddingVendorSearchSource {
            title: title.to_string(),
            url: url.to_string(),
            snippet: Some(snippet.to_string()),
            provider: provider.to_string(),
            website_url: Some(url.to_string()),
            ..WeddingVendorSearchSource::default()
        }
    }

    #[test]
    fn merges_places_official_and_directory_results_into_one_entity() {
        let places = WeddingVendorSearchSource {
            title: "Redleaf Wollombi".to_string(),
            url: "https://redleafwollombi.com.au".to_string(),
            snippet: Some("1 Main Rd, Wollombi NSW rating 4.8 across 120 reviews".to_string()),
            provider: "Google Places API".to_string(),
            website_url: Some("https://redleafwollombi.com.au".to_string()),
            map_url: Some("https://maps.google.com/?cid=1".to_string()),
            address: Some("1 Main Rd, Wollombi NSW 2325".to_string()),
            phone: Some("+61 2 4998 1234".to_string()),
            photo_url: Some(
                "/wedding/vendor-photo/google?name=places%2Fx%2Fphotos%2Fy".to_string(),
            ),
            place_id: Some("places/x".to_string()),
            rating: Some(4.8),
            review_count: Some(120),
            ..WeddingVendorSearchSource::default()
        };
        let official = web(
            "Brave Search",
            "Redleaf Wollombi | Hunter Valley Wedding Venue",
            "https://www.redleafwollombi.com.au/weddings/",
            "Garden ceremony and marquee reception.",
        );
        let directory = web(
            "Brave Search",
            "Redleaf Wollombi | Wedding Venue | Easy Weddings",
            "https://www.easyweddings.com.au/wedding-venues/redleaf-wollombi/",
            "Reviews and pricing.",
        );
        let listicle = web(
            "Brave Search",
            "10 best Hunter Valley wedding venues",
            "https://www.easyweddings.com.au/wedding-venues/hunter-valley/",
            "",
        );

        let outcome = classify_and_merge_sources(vec![places, official, directory, listicle]);

        assert_eq!(outcome.sources.len(), 1);
        assert_eq!(outcome.discarded_non_vendor_count, 1);
        assert_eq!(outcome.editorial_mention_urls.len(), 1);
        let merged = &outcome.sources[0];
        assert_eq!(merged.title, "Redleaf Wollombi");
        assert_eq!(merged.source_kind.as_deref(), Some("official"));
        assert_eq!(
            merged.website_url.as_deref(),
            Some("https://www.redleafwollombi.com.au/weddings/")
        );
        assert_eq!(merged.phone.as_deref(), Some("+61 2 4998 1234"));
        assert_eq!(
            merged.address.as_deref(),
            Some("1 Main Rd, Wollombi NSW 2325")
        );
        assert_eq!(merged.rating, Some(4.8));
        assert_eq!(merged.review_count, Some(120));
        assert!(
            !merged
                .website_url
                .as_deref()
                .unwrap_or_default()
                .contains("easyweddings")
        );
        assert_eq!(merged.provider, "Google Places API + Brave Search");
        assert!(merged.official_site_confidence.unwrap_or_default() >= 0.45);
    }

    #[test]
    fn directory_only_vendor_has_no_website_and_keeps_the_directory_reference() {
        let directory = web(
            "Brave Search",
            "Circa 1876 | Wedding Venue | WeddingWire",
            "https://www.weddingwire.com.au/wedding-venues/circa-1876--e123",
            "",
        );
        let outcome = classify_and_merge_sources(vec![directory]);
        assert_eq!(outcome.sources.len(), 1);
        let entity = &outcome.sources[0];
        assert_eq!(entity.title, "Circa 1876");
        assert!(entity.website_url.is_none());
        assert_eq!(entity.source_kind.as_deref(), Some("directory_profile"));
        assert!(entity.official_site_confidence.is_none());
    }

    #[test]
    fn venue_group_domains_do_not_merge_distinct_venues() {
        let curzon = web(
            "Brave Search",
            "Curzon Hall",
            "https://navarravenues.com.au/venues/curzon-hall/",
            "",
        );
        let other = web(
            "Brave Search",
            "Navarra Venues",
            "https://navarravenues.com.au/",
            "",
        );
        assert_eq!(
            classify_and_merge_sources(vec![curzon, other])
                .sources
                .len(),
            2
        );
    }

    #[test]
    fn places_entities_with_different_place_ids_stay_separate() {
        let make = |id: &str| WeddingVendorSearchSource {
            title: "The Barn".to_string(),
            url: format!("https://maps.google.com/?cid={id}"),
            provider: "Google Places API".to_string(),
            map_url: Some(format!("https://maps.google.com/?cid={id}")),
            place_id: Some(id.to_string()),
            ..WeddingVendorSearchSource::default()
        };
        assert_eq!(
            classify_and_merge_sources(vec![make("a"), make("b")])
                .sources
                .len(),
            2
        );
    }

    #[test]
    fn social_results_survive_only_when_they_look_like_a_business() {
        let business = web(
            "Brave Search",
            "Redleaf Wollombi (@redleafwollombi) • Instagram photos and videos",
            "https://www.instagram.com/redleafwollombi/",
            "",
        );
        let inspo = web(
            "Brave Search",
            "Best garden wedding ideas - Pinterest",
            "https://www.pinterest.com.au/ideas/garden-wedding/1",
            "",
        );
        let outcome = classify_and_merge_sources(vec![business, inspo]);
        assert_eq!(outcome.sources.len(), 1);
        assert_eq!(outcome.sources[0].title, "Redleaf Wollombi");
        assert!(outcome.sources[0].website_url.is_none());
        assert_eq!(
            outcome.sources[0].instagram_url.as_deref(),
            Some("https://www.instagram.com/redleafwollombi/")
        );
        assert_eq!(outcome.discarded_non_vendor_count, 1);
    }

    #[test]
    fn instagram_website_on_a_places_record_is_not_promoted_to_website() {
        let places = WeddingVendorSearchSource {
            title: "Some Florist".to_string(),
            url: "https://maps.google.com/?cid=1".to_string(),
            provider: "Google Places API".to_string(),
            website_url: Some("https://www.instagram.com/someflorist".to_string()),
            ..WeddingVendorSearchSource::default()
        };
        let outcome = classify_and_merge_sources(vec![places]);
        let entity = &outcome.sources[0];
        assert!(entity.website_url.is_none());
        assert_eq!(
            entity.instagram_url.as_deref(),
            Some("https://www.instagram.com/someflorist")
        );
        assert_eq!(entity.source_kind.as_deref(), Some("maps"));
    }

    #[test]
    fn admin_database_identity_survives_a_merge() {
        let admin = WeddingVendorSearchSource {
            title: "Bells at Killcare".to_string(),
            url: "https://www.bellsatkillcare.com.au/".to_string(),
            provider: "Admin vendor database".to_string(),
            website_url: Some("https://www.bellsatkillcare.com.au/".to_string()),
            vendor_id: Some("venue-bells-at-killcare".to_string()),
            vendor_slug: Some("bells-at-killcare".to_string()),
            ..WeddingVendorSearchSource::default()
        };
        let live = web(
            "Brave Search",
            "Bells at Killcare | Central Coast Wedding Venue",
            "https://bellsatkillcare.com.au/central-coast-weddings/",
            "",
        );
        let outcome = classify_and_merge_sources(vec![live, admin]);
        assert_eq!(outcome.sources.len(), 1);
        assert_eq!(
            outcome.sources[0].vendor_id.as_deref(),
            Some("venue-bells-at-killcare")
        );
        assert_eq!(
            outcome.sources[0].website_url.as_deref(),
            Some("https://www.bellsatkillcare.com.au/")
        );
    }
}
