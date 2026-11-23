//! Stable, secondary reading links used in Wedding acquisition emails.
//!
//! These are deliberately kept separate from the primary email action. The
//! catalogue-backed URLs are public, do not carry recipient data, and can be
//! reused by plain-text and multipart transactional mail.

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct WeddingQuoteReadingLink {
    pub title: &'static str,
    pub url: &'static str,
}

pub const VENUE_QUOTE_READING_LINKS: [WeddingQuoteReadingLink; 3] = [
    WeddingQuoteReadingLink {
        title: "Compare the whole cost before accepting a wedding quote",
        url: "https://omnyid.com/wedding/blog/before-you-accept-that-wedding-quote.html",
    },
    WeddingQuoteReadingLink {
        title: "See what Sydney venues publish per head",
        url: "https://omnyid.com/wedding/blog/sydney-wedding-venue-cost-per-head.html",
    },
    WeddingQuoteReadingLink {
        title: "Take 25 cost-saving questions to a venue tour",
        url: "https://omnyid.com/wedding/blog/venue-tour-questions-australian-couples.html",
    },
];

pub fn optional_plain_text_reading() -> String {
    let links = VENUE_QUOTE_READING_LINKS
        .iter()
        .map(|link| format!("- {}: {}", link.title, link.url))
        .collect::<Vec<_>>()
        .join("\n");
    format!("Optional reading for when venue quotes arrive:\n{links}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reading_list_has_three_distinct_public_wedding_articles() {
        assert_eq!(VENUE_QUOTE_READING_LINKS.len(), 3);
        let mut urls = VENUE_QUOTE_READING_LINKS
            .iter()
            .map(|link| link.url)
            .collect::<Vec<_>>();
        urls.sort_unstable();
        urls.dedup();
        assert_eq!(urls.len(), 3);
        assert!(
            urls.iter()
                .all(|url| url.starts_with("https://omnyid.com/wedding/blog/"))
        );
    }
}
