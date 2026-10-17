//! Side-effect-free validation for evidence-bounded venue enrichment proposals.

use serde::{Deserialize, Serialize};
use serde_json::Value;

const WEDDING_FACET_VOCABULARY: &str =
    include_str!("../../solid-ui/src/lib/weddingFacetVocabulary.json");
const ENRICHABLE_KEYS: &[&str] = &[
    "style_facets",
    "capacity_seated_max",
    "capacity_standing_max",
    "venue_hire_fee_aud",
    "price_per_head_aud",
    "minimum_spend_aud",
];

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub(super) struct VenueEnrichmentProposal {
    pub vendor_id: String,
    pub key: String,
    pub value: Value,
    pub quote: String,
    pub source_kind: String,
    pub confidence: f32,
    #[serde(default)]
    pub date_context: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub(super) struct VenueEnrichmentSource<'a> {
    pub vendor_id: &'a str,
    pub category: &'a str,
    pub style_tags: &'a str,
    pub editorial_summary: &'a str,
    pub room_descriptions: &'a [String],
    pub official_page_text: &'a str,
    pub source_date_context: &'a str,
}

pub(super) fn valid_venue_enrichment_proposal(
    proposal: &VenueEnrichmentProposal,
    source: &VenueEnrichmentSource<'_>,
) -> Result<(), String> {
    if !source.category.eq_ignore_ascii_case("venue") || proposal.vendor_id != source.vendor_id {
        return Err("enrichment proposals are limited to the matching venue".to_string());
    }
    if !ENRICHABLE_KEYS.contains(&proposal.key.as_str()) {
        return Err(format!("'{}' is not an enrichable venue key", proposal.key));
    }
    if !(0.0..=1.0).contains(&proposal.confidence) {
        return Err("proposal confidence must be between 0 and 1".to_string());
    }
    let room_text = source.room_descriptions.join("\n");
    let evidence = match proposal.source_kind.as_str() {
        "official_page" => source.official_page_text,
        "editorial" => source.editorial_summary,
        "style_tags" => source.style_tags,
        "room" => &room_text,
        _ => return Err("proposal source_kind is not allowed".to_string()),
    };
    if proposal.quote.trim().is_empty() || !contains_case_insensitive(evidence, &proposal.quote) {
        return Err("proposal quote must be a verbatim substring of its stated source".to_string());
    }
    match proposal.key.as_str() {
        "style_facets" => validate_facets(proposal),
        "venue_hire_fee_aud" | "price_per_head_aud" | "minimum_spend_aud" => {
            validate_number_in_quote(proposal)?;
            let Some(date_context) = proposal.date_context.as_deref().map(str::trim) else {
                return Err("price proposals require stored source date context".to_string());
            };
            if date_context.is_empty() || date_context != source.source_date_context.trim() {
                return Err("price date context must match the stored source date".to_string());
            }
            Ok(())
        }
        _ => validate_number_in_quote(proposal),
    }
}

pub(super) fn normalised_enrichment_status_authority(
    proposal: &VenueEnrichmentProposal,
) -> (&'static str, &'static str) {
    if proposal.source_kind == "official_page" {
        ("estimated", "primary_official")
    } else {
        ("estimated", "inferred")
    }
}

fn validate_facets(proposal: &VenueEnrichmentProposal) -> Result<(), String> {
    if proposal.confidence > 0.6 {
        return Err("style facet confidence cannot exceed 0.6".to_string());
    }
    let allowed = serde_json::from_str::<Value>(WEDDING_FACET_VOCABULARY)
        .ok()
        .and_then(|value| value["facets"].as_array().cloned())
        .ok_or_else(|| "bundled facet vocabulary is invalid".to_string())?
        .into_iter()
        .filter_map(|facet| facet["id"].as_str().map(str::to_string))
        .collect::<std::collections::HashSet<_>>();
    let Some(facets) = proposal.value.as_array() else {
        return Err("style_facets must be an array".to_string());
    };
    if facets.is_empty()
        || facets
            .iter()
            .any(|facet| !facet.as_str().is_some_and(|id| allowed.contains(id)))
    {
        return Err("style_facets contains an unknown facet".to_string());
    }
    Ok(())
}

fn validate_number_in_quote(proposal: &VenueEnrichmentProposal) -> Result<(), String> {
    let Some(number) = proposal
        .value
        .as_f64()
        .filter(|value| value.is_finite() && *value >= 0.0)
    else {
        return Err(format!("'{}' must contain a non-negative number", proposal.key));
    };
    let digits = format!("{number:.0}");
    let quote_digits = proposal
        .quote
        .chars()
        .filter(char::is_ascii_digit)
        .collect::<String>();
    if !quote_digits.contains(&digits) {
        return Err("proposal number must appear in its quote".to_string());
    }
    Ok(())
}

fn contains_case_insensitive(haystack: &str, needle: &str) -> bool {
    haystack.to_ascii_lowercase().contains(&needle.to_ascii_lowercase())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn source<'a>(rooms: &'a [String]) -> VenueEnrichmentSource<'a> {
        VenueEnrichmentSource {
            vendor_id: "venue-1",
            category: "venue",
            style_tags: "garden heritage",
            editorial_summary: "A bright reception room",
            room_descriptions: rooms,
            official_page_text: "Venue hire starts at $12,000. Seats 120 guests.",
            source_date_context: "2026-10-01",
        }
    }

    fn proposal(key: &str, value: Value, quote: &str) -> VenueEnrichmentProposal {
        VenueEnrichmentProposal {
            vendor_id: "venue-1".to_string(),
            key: key.to_string(),
            value,
            quote: quote.to_string(),
            source_kind: "official_page".to_string(),
            confidence: 0.6,
            date_context: Some("2026-10-01".to_string()),
        }
    }

    #[test]
    fn rejects_non_verbatim_quotes_unknown_facets_and_numbers_missing_from_quote() {
        let rooms = vec!["Seats 120 guests".to_string()];
        let source = source(&rooms);
        assert!(valid_venue_enrichment_proposal(
            &proposal("capacity_seated_max", json!(120), "Seats 120 guests"),
            &source,
        ).is_ok());
        assert!(valid_venue_enrichment_proposal(
            &proposal("capacity_seated_max", json!(120), "Seats 140 guests"),
            &source,
        ).is_err());
        assert!(valid_venue_enrichment_proposal(
            &proposal("venue_hire_fee_aud", json!(13000), "Venue hire starts at $12,000"),
            &source,
        ).is_err());
        assert!(valid_venue_enrichment_proposal(
            &proposal("style_facets", json!(["scale.imaginary"]), "Venue hire starts"),
            &source,
        ).is_err());
    }

    #[test]
    fn keeps_proposal_authority_conservative() {
        let official = proposal("venue_hire_fee_aud", json!(12000), "Venue hire starts at $12,000");
        assert_eq!(normalised_enrichment_status_authority(&official), ("estimated", "primary_official"));
        let editorial = VenueEnrichmentProposal {
            source_kind: "editorial".to_string(),
            quote: "A bright reception room".to_string(),
            date_context: None,
            ..official
        };
        assert_eq!(normalised_enrichment_status_authority(&editorial), ("estimated", "inferred"));
    }
}
