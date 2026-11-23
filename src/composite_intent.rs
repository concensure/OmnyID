/*
 * @locs-version: 1.1
 * @module-id: routing.composite-intent
 * @module-name: CompositeIntent
 * @category: routing
 * @domain: intent-classification
 * @primary-capability: composite-intent-detection
 * @sub-capabilities: multi-location-weather-parsing,intent-bucket-scoring
 * @version: 1.0.0
 * @stability: draft
 * @state-model: stateless
 * @side-effects: none
 * @inputs: raw user query string
 * @outputs: composite flag, detected intent list, location-days tuples
 * @dependencies: []
 * @guard-mode: editable
 */

//! Composite intent detection and multi-location query parsing.
//!
//! Single responsibility: decide whether a query spans more than one intent
//! domain and extract structured sub-intents from it. No I/O or side effects.

/* locs:section id=types edit=editable role=contract */

/// An intent domain detected in a query.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum DetectedIntent {
    Weather,
    Document,
    Digest,
    ExternalTool,
    Budget,
}

/* locs:end */

/* locs:section id=impl edit=editable role=implementation */

/// Returns true when the query spans two or more intent domains.
///
/// Callers use this to bypass specialized early-return handlers that would
/// otherwise silently drop the non-matching portion of the query.
pub fn is_composite_query(query: &str) -> bool {
    composite_intents_present(query).len() >= 2
}

/// Returns every intent domain that fired for this query.
pub fn composite_intents_present(query: &str) -> Vec<DetectedIntent> {
    let low = query.to_ascii_lowercase();
    let mut found = Vec::new();

    let weather_tokens = [
        "weather",
        "forecast",
        "temperature",
        "rain",
        "precipitation",
    ];
    if weather_tokens.iter().any(|t| low.contains(t)) {
        found.push(DetectedIntent::Weather);
    }

    let document_tokens = [
        "write",
        "document",
        "draft",
        "create a doc",
        "note",
        "compose",
    ];
    if document_tokens.iter().any(|t| low.contains(t)) {
        found.push(DetectedIntent::Document);
    }

    let digest_tokens = [
        "digest",
        "summarise",
        "summarize",
        "tldr",
        "tl;dr",
        "summary of",
    ];
    if digest_tokens.iter().any(|t| low.contains(t)) {
        found.push(DetectedIntent::Digest);
    }

    let external_tokens = ["notion", "slack", "upload to", "post to", "send to"];
    if external_tokens.iter().any(|t| low.contains(t)) {
        found.push(DetectedIntent::ExternalTool);
    }

    let budget_tokens = [
        "budget",
        "projection",
        "expenses",
        "monthly income",
        "savings goal",
    ];
    if budget_tokens.iter().any(|t| low.contains(t)) {
        found.push(DetectedIntent::Budget);
    }

    found
}

/// Parses zero or more `(city, days)` pairs from a weather query.
///
/// Handles:
/// - "weather in LA" → `[("LA", 7)]`
/// - "weather in LA and New York" → `[("LA", 7), ("New York", 7)]`
/// - "temperature in Tokyo and Seoul for 3 days" → `[("Tokyo", 3), ("Seoul", 3)]`
///
/// Returns an empty vec when no weather signal is present. Returns a single-
/// element vec for single-location queries (identical semantics to the existing
/// `weather_query_details` path, so callers can unify on this function).
pub fn parse_weather_locations(query: &str) -> Vec<(String, u8)> {
    let low = query.to_ascii_lowercase();

    let weather_tokens = [
        "weather",
        "forecast",
        "temperature",
        "rain",
        "precipitation",
    ];
    if !weather_tokens.iter().any(|t| low.contains(t)) {
        return vec![];
    }

    let days = parse_days(&low);

    // Find the location segment: everything after the last " in " (or the whole
    // query if " in " is absent).
    let raw_location_segment = if let Some(idx) = low.rfind(" in ") {
        &query[idx + 4..]
    } else {
        query
    };

    // Split on " and " to handle multiple cities.
    let city_stopwords = [
        "show",
        "me",
        "the",
        "a",
        "an",
        "weather",
        "forecast",
        "temperature",
        "temperatures",
        "rain",
        "precipitation",
        "for",
        "next",
        "this",
        "week",
        "month",
        "day",
        "days",
        "tomorrow",
        "today",
        "chart",
        "graph",
        "outlook",
        "trend",
        "please",
        "what",
        "is",
        "whats",
        "what's",
    ];

    let parts: Vec<&str> = raw_location_segment.split(" and ").collect();

    let mut results = Vec::new();
    for part in parts {
        let city: String = part
            .split_whitespace()
            .filter(|w| {
                let cleaned = w
                    .trim_matches(|ch: char| !ch.is_ascii_alphanumeric())
                    .to_ascii_lowercase();
                !cleaned.is_empty()
                    && !city_stopwords.contains(&cleaned.as_str())
                    && cleaned.parse::<u8>().is_err()
            })
            .collect::<Vec<_>>()
            .join(" ")
            .trim()
            .to_string();

        if !city.is_empty() {
            results.push((city, days));
        }
    }

    results
}

fn parse_days(low: &str) -> u8 {
    if low.contains("tomorrow") {
        return 1;
    }
    if low.contains("next week") || low.contains("this week") || low.contains("7-day") {
        return 7;
    }
    if low.contains("next month") || low.contains("monthly") {
        return 14;
    }
    for word in low.split(|ch: char| !ch.is_ascii_alphanumeric()) {
        if let Ok(v) = word.parse::<u8>() {
            if (1..=14).contains(&v) {
                return v;
            }
        }
    }
    7
}

/* locs:end */

/* locs:section id=tests edit=editable role=example */

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn single_weather_not_composite() {
        assert!(!is_composite_query("weather in Sydney"));
    }

    #[test]
    fn weather_plus_document_is_composite() {
        assert!(is_composite_query(
            "write me a document then check weather in Sydney"
        ));
    }

    #[test]
    fn notion_plus_digest_is_composite() {
        assert!(is_composite_query("summarise this and upload to Notion"));
    }

    #[test]
    fn single_location_parse() {
        let locs = parse_weather_locations("weather in Tokyo");
        assert_eq!(locs.len(), 1);
        assert_eq!(locs[0].0, "Tokyo");
        assert_eq!(locs[0].1, 7);
    }

    #[test]
    fn multi_location_parse() {
        let locs = parse_weather_locations("weather in LA and New York");
        assert_eq!(locs.len(), 2);
        assert_eq!(locs[0].0, "LA");
        assert_eq!(locs[1].0, "New York");
    }

    #[test]
    fn multi_location_with_days() {
        let locs = parse_weather_locations("temperature in Tokyo and Seoul for 3 days");
        assert_eq!(locs.len(), 2);
        assert_eq!(locs[0].1, 3);
        assert_eq!(locs[1].1, 3);
    }

    #[test]
    fn no_weather_signal_returns_empty() {
        let locs = parse_weather_locations("write me a note");
        assert!(locs.is_empty());
    }

    #[test]
    fn detected_intents_for_notion_slack() {
        let intents =
            composite_intents_present("summarise this and upload to Notion then post to Slack");
        assert!(intents.contains(&DetectedIntent::Digest));
        assert!(intents.contains(&DetectedIntent::ExternalTool));
    }
}

/* locs:end */
