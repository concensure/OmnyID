// @locs-version: 2.0
//! Pure classification of web search results and merging of them into vendor entities.
//! Search engines rank pages, not businesses, so a result is never a vendor until it has been
//! classified and folded into an entity with a verified identity.

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum SourceKind {
    Official,
    DirectoryProfile,
    Listicle,
    Editorial,
    Social,
    Maps,
    Unknown,
}

impl SourceKind {
    pub(super) fn as_str(self) -> &'static str {
        match self {
            SourceKind::Official => "official",
            SourceKind::DirectoryProfile => "directory_profile",
            SourceKind::Listicle => "listicle",
            SourceKind::Editorial => "editorial",
            SourceKind::Social => "social",
            SourceKind::Maps => "maps",
            SourceKind::Unknown => "unknown",
        }
    }
}

/// `.*` matches any TLD.
pub(super) const DIRECTORY_DOMAINS: &[&str] = &[
    "easyweddings.com.au",
    "weddingwire.com",
    "weddingwire.com.au",
    "theknot.com",
    "wedshed.com.au",
    "venuecrew.com",
    "hitched.co.uk",
    "bridebook.com",
    "confetti.co.uk",
    "zola.com",
    "weddingvenues.com.au",
    "yourwedding.com.au",
    "marryme.com.au",
    "bridestory.com",
    "tripadvisor.*",
    "yelp.*",
];

pub(super) const EDITORIAL_DOMAINS: &[&str] = &[
    "hellomay.com.au",
    "polkadotbride.com",
    "junebugweddings.com",
    "stylemepretty.com",
    "ruffledblog.com",
    "timeout.com",
    "broadsheet.com.au",
    "concreteplayground.com",
    "weddingideasmag.com",
];

pub(super) const SOCIAL_DOMAINS: &[&str] =
    &["instagram.com", "facebook.com", "pinterest.*", "tiktok.com"];

/// Wildcard TLDs cannot be expressed in Goggle or EXA domain filters, so they are expanded.
const WILDCARD_TLD_EXPANSION: &[&str] = &["com", "com.au", "co.uk"];

const NAME_STOPWORDS: &[&str] = &[
    "the", "a", "an", "and", "at", "of", "in", "weddings", "wedding", "venue", "venues", "events",
    "event", "estate",
];

const DIRECTORY_DOMAINS_ENV: &str = "OMNYID_WEDDING_DIRECTORY_DOMAINS";

fn parse_extra_domains(raw: &str) -> Vec<String> {
    raw.split(',')
        .map(|domain| {
            domain
                .trim()
                .trim_start_matches("www.")
                .to_ascii_lowercase()
        })
        .filter(|domain| !domain.is_empty())
        .collect()
}

fn directory_domains() -> Vec<String> {
    let mut domains = DIRECTORY_DOMAINS
        .iter()
        .map(|domain| domain.to_string())
        .collect::<Vec<_>>();
    if let Ok(raw) = std::env::var(DIRECTORY_DOMAINS_ENV) {
        domains.extend(parse_extra_domains(&raw));
    }
    domains
}

pub(super) fn host_matches(host: &str, pattern: &str) -> bool {
    if let Some(base) = pattern.strip_suffix(".*") {
        let labels = host.split('.').collect::<Vec<_>>();
        return labels
            .iter()
            .position(|label| *label == base)
            .is_some_and(|index| index + 1 < labels.len() && index + 3 >= labels.len());
    }
    host == pattern || host.ends_with(&format!(".{pattern}"))
}

fn host_in(host: &str, patterns: &[String]) -> bool {
    patterns.iter().any(|pattern| host_matches(host, pattern))
}

fn host_in_static(host: &str, patterns: &[&str]) -> bool {
    patterns.iter().any(|pattern| host_matches(host, pattern))
}

fn expand_wildcards(patterns: impl IntoIterator<Item = String>) -> Vec<String> {
    let mut expanded = Vec::new();
    for pattern in patterns {
        match pattern.strip_suffix(".*") {
            Some(base) => expanded.extend(
                WILDCARD_TLD_EXPANSION
                    .iter()
                    .map(|tld| format!("{base}.{tld}")),
            ),
            None => expanded.push(pattern),
        }
    }
    expanded
}

/// Directory and editorial domains, for discovery-time downranking and exclusion.
pub(super) fn discovery_excluded_domains() -> Vec<String> {
    expand_wildcards(
        directory_domains()
            .into_iter()
            .chain(EDITORIAL_DOMAINS.iter().map(|domain| domain.to_string())),
    )
}

/// Everything that is not the vendor itself, for the canonical-resolution pass.
pub(super) fn resolution_excluded_domains() -> Vec<String> {
    expand_wildcards(
        directory_domains()
            .into_iter()
            .chain(EDITORIAL_DOMAINS.iter().map(|domain| domain.to_string()))
            .chain(SOCIAL_DOMAINS.iter().map(|domain| domain.to_string())),
    )
}

/// Discovery keeps directories in play (they still name real vendors) but pushes them down.
pub(super) fn discovery_goggle(domains: &[String]) -> String {
    domains
        .iter()
        .map(|domain| format!("$downrank=5,site={domain}"))
        .collect::<Vec<_>>()
        .join("\n")
}

/// Resolution wants the vendor's own site, so non-vendor hosts are removed outright.
pub(super) fn discard_goggle(domains: &[String]) -> String {
    domains
        .iter()
        .map(|domain| format!("$discard,site={domain}"))
        .collect::<Vec<_>>()
        .join("\n")
}

pub(super) fn host_and_path(url: &str) -> Option<(String, String)> {
    let parsed = reqwest::Url::parse(url.trim()).ok()?;
    if !matches!(parsed.scheme(), "http" | "https") {
        return None;
    }
    let host = parsed.host_str()?.to_ascii_lowercase();
    let host = host.strip_prefix("www.").unwrap_or(&host).to_string();
    Some((host, parsed.path().to_ascii_lowercase()))
}

pub(super) fn registrable_domain(host: &str) -> String {
    let labels = host.split('.').collect::<Vec<_>>();
    let len = labels.len();
    if len <= 2 {
        return host.to_string();
    }
    let second_level = matches!(
        labels[len - 2],
        "com" | "net" | "org" | "co" | "gov" | "edu"
    );
    let take = if second_level && labels[len - 1].len() == 2 {
        3
    } else {
        2
    };
    labels[len.saturating_sub(take)..].join(".")
}

fn is_maps(host: &str, path: &str) -> bool {
    host.starts_with("maps.google.")
        || host == "maps.app.goo.gl"
        || host == "openstreetmap.org"
        || host.ends_with(".openstreetmap.org")
        || (host_matches(host, "google.*") && path.starts_with("/maps"))
}

fn is_editorial(host: &str, path: &str) -> bool {
    host_in_static(host, EDITORIAL_DOMAINS) || path.split('/').any(|segment| segment == "blog")
}

/// True for any host that can never be a vendor's own website.
pub(super) fn is_known_non_official_host(host: &str, path: &str) -> bool {
    is_maps(host, path)
        || host_in_static(host, SOCIAL_DOMAINS)
        || host_in_static(host, EDITORIAL_DOMAINS)
        || host_in(host, &directory_domains())
}

pub(super) fn words(text: &str) -> Vec<String> {
    text.to_ascii_lowercase()
        .split(|ch: char| !ch.is_ascii_alphanumeric())
        .filter(|word| !word.is_empty())
        .map(str::to_string)
        .collect()
}

fn title_is_listicle(title: &str) -> bool {
    let lower = title.trim().to_ascii_lowercase();
    let tokens = words(&lower);
    let starts_with_count = lower
        .split_whitespace()
        .next()
        .is_some_and(|first| !first.is_empty() && first.chars().all(|ch| ch.is_ascii_digit()))
        && lower.split_whitespace().count() > 1;
    let has_phrase = |first: &str, second: &str| {
        tokens
            .windows(2)
            .any(|pair| pair[0] == first && pair[1] == second)
    };
    starts_with_count
        || tokens.iter().any(|token| token == "best")
        || tokens
            .windows(2)
            .any(|pair| pair[0] == "top" && pair[1].chars().all(|ch| ch.is_ascii_digit()))
        || has_phrase("guide", "to")
        || has_phrase("venues", "in")
        || has_phrase("venues", "near")
}

/// Directory category pages are titled with a plural trade ("Hunter Valley Wedding Venues");
/// a vendor's profile page is titled with the vendor and a singular label.
fn title_names_a_category(title: &str) -> bool {
    words(title).iter().any(|word| {
        matches!(
            word.as_str(),
            "venues"
                | "photographers"
                | "florists"
                | "suppliers"
                | "vendors"
                | "celebrants"
                | "caterers"
        )
    })
}

fn path_is_listicle(path: &str) -> bool {
    let trimmed = path.trim_end_matches('/');
    let segments = trimmed
        .split('/')
        .filter(|segment| !segment.is_empty())
        .collect::<Vec<_>>();
    let digits_then_best = |segment: &str| {
        let digits = segment.chars().take_while(char::is_ascii_digit).count();
        digits > 0 && segment[digits..].starts_with("-best")
    };
    segments.iter().any(|segment| {
        segment.starts_with("best-")
            || segment.starts_with("top-")
            || digits_then_best(segment)
            || *segment == "directory"
    }) || matches!(
        segments.last(),
        Some(&"wedding-venues") | Some(&"suppliers")
    )
}

fn directory_profile_slug(path: &str) -> bool {
    let segments = path
        .trim_end_matches('/')
        .split('/')
        .filter(|segment| !segment.is_empty())
        .collect::<Vec<_>>();
    segments.last().is_some_and(|slug| {
        // Category pages end in a plural noun ("sydney-hotels", "wedding-venues").
        let last_word = slug
            .trim_end_matches(".html")
            .rsplit(['-', '_'])
            .next()
            .unwrap_or_default();
        slug.contains('-')
            && !matches!(
                last_word,
                "venues"
                    | "suppliers"
                    | "vendors"
                    | "hotels"
                    | "restaurants"
                    | "photographers"
                    | "florists"
            )
            && !matches!(*slug, "search-results")
    })
}

pub(super) fn classify_source(url: &str, title: &str, snippet: &str) -> SourceKind {
    let Some((host, path)) = host_and_path(url) else {
        return SourceKind::Unknown;
    };
    if is_maps(&host, &path) {
        return SourceKind::Maps;
    }
    if host_in_static(&host, SOCIAL_DOMAINS) {
        return SourceKind::Social;
    }
    if is_editorial(&host, &path) {
        return SourceKind::Editorial;
    }
    let looks_like_list = title_is_listicle(title) || path_is_listicle(&path);
    if host_in(&host, &directory_domains()) {
        return if !looks_like_list
            && !title_names_a_category(title)
            && directory_profile_slug(&path)
        {
            SourceKind::DirectoryProfile
        } else {
            SourceKind::Listicle
        };
    }
    if looks_like_list {
        return SourceKind::Listicle;
    }
    let name = first_title_segment(title);
    if official_site_confidence(&name, url, title, snippet, None, None) >= 0.45 {
        SourceKind::Official
    } else {
        SourceKind::Unknown
    }
}

const TITLE_SEPARATORS: &[&str] = &[" | ", " - ", " – ", " — ", " • ", " :: "];

fn title_segments(title: &str) -> Vec<String> {
    let mut segments = vec![title.trim().to_string()];
    for separator in TITLE_SEPARATORS {
        segments = segments
            .into_iter()
            .flat_map(|segment| {
                segment
                    .split(separator)
                    .map(|part| part.trim().to_string())
                    .collect::<Vec<_>>()
            })
            .collect();
    }
    segments.retain(|segment| !segment.is_empty());
    segments
}

pub(super) fn first_title_segment(title: &str) -> String {
    title_segments(title)
        .into_iter()
        .next()
        .unwrap_or_else(|| title.trim().to_string())
}

pub(super) fn compact(text: &str) -> String {
    text.chars()
        .filter(char::is_ascii_alphanumeric)
        .flat_map(char::to_lowercase)
        .collect()
}

/// Lowercased name tokens. Filler words are dropped only while at least two tokens remain, so
/// a venue called simply "The Estate" still has something to match on.
pub(super) fn name_tokens(name: &str) -> Vec<String> {
    let cleaned = name.replace(['\'', '’'], "");
    let all = words(&cleaned);
    let filtered = all
        .iter()
        .filter(|token| !NAME_STOPWORDS.contains(&token.as_str()))
        .cloned()
        .collect::<Vec<_>>();
    if filtered.len() >= 2 { filtered } else { all }
}

pub(super) fn entity_name_key(name: &str) -> String {
    name_tokens(name).join(" ")
}

pub(super) fn phone_key(phone: &str) -> Option<String> {
    let digits = phone
        .chars()
        .filter(char::is_ascii_digit)
        .collect::<String>();
    (digits.len() >= 8).then(|| digits[digits.len() - 8..].to_string())
}

const STATE_CODES: &[&str] = &["nsw", "vic", "qld", "wa", "sa", "tas", "act", "nt"];

/// (suburb, postcode) from an Australian-style address such as "12 Main St, Pokolbin NSW 2320".
fn address_locality(address: &str) -> (Option<String>, Option<String>) {
    let postcode = address
        .split(|ch: char| !ch.is_ascii_alphanumeric())
        .find(|token| token.len() == 4 && token.chars().all(|ch| ch.is_ascii_digit()))
        .map(str::to_string);
    let suburb = address.split(',').find_map(|segment| {
        let tokens = segment.split_whitespace().collect::<Vec<_>>();
        let state_index = tokens
            .iter()
            .position(|token| STATE_CODES.contains(&token.to_ascii_lowercase().as_str()))?;
        (state_index > 0).then(|| tokens[..state_index].join(" ").to_ascii_lowercase())
    });
    (suburb, postcode)
}

/// Deterministic likelihood that `url` is the vendor's own site. Weights: a name match in the
/// host is the strongest single signal, corroborating title, phone and locality add smaller
/// amounts, and a wedding-ish path nudges it up; none alone is decisive except the host match.
pub(super) fn official_site_confidence(
    entity_name: &str,
    url: &str,
    title: &str,
    snippet: &str,
    phone: Option<&str>,
    address: Option<&str>,
) -> f32 {
    let Some((host, path)) = host_and_path(url) else {
        return 0.0;
    };
    if is_known_non_official_host(&host, &path) {
        return 0.0;
    }
    let tokens = name_tokens(entity_name);
    let mut score = 0.0f32;
    if !tokens.is_empty() {
        let host_compact = compact(&host);
        if tokens.iter().all(|token| host_compact.contains(token)) {
            score += 0.45;
        }
        let title_compact = compact(title);
        if tokens.iter().all(|token| title_compact.contains(token)) {
            score += 0.2;
        }
    }
    let haystack = format!("{title} {snippet}");
    if let Some(key) = phone.and_then(phone_key) {
        let digits = haystack
            .chars()
            .filter(char::is_ascii_digit)
            .collect::<String>();
        if digits.contains(&key) {
            score += 0.15;
        }
    }
    if let Some(address) = address {
        let (suburb, postcode) = address_locality(address);
        let lower = haystack.to_ascii_lowercase();
        let locality_hit = postcode.is_some_and(|code| haystack.contains(&code))
            || suburb.is_some_and(|suburb| lower.contains(&suburb));
        if locality_hit {
            score += 0.1;
        }
    }
    if path.trim_matches('/').is_empty() || path.contains("wedding") {
        score += 0.1;
    }
    score.min(1.0)
}

fn is_brand_segment(segment: &str, brand: &str) -> bool {
    !brand.is_empty() && compact(segment).contains(brand)
}

const CATEGORY_PREFIX_WORDS: &[&str] = &[
    "venue",
    "venues",
    "photographer",
    "photographers",
    "florist",
    "florists",
    "celebrant",
    "celebrants",
    "caterer",
    "caterers",
    "wedding",
    "weddings",
    "dj",
    "band",
    "videographer",
];
const DESCRIPTOR_SUFFIXES: &[&str] = &[
    "reviews", "review", "photos", "pricing", "prices", "packages", "contact", "profile",
];

fn strip_category_prefix(segment: &str) -> String {
    if let Some((prefix, rest)) = segment.split_once(':') {
        let prefix_words = words(prefix);
        if !rest.trim().is_empty()
            && prefix_words.len() <= 4
            && prefix_words
                .iter()
                .any(|word| CATEGORY_PREFIX_WORDS.contains(&word.as_str()))
        {
            return rest.trim().to_string();
        }
    }
    segment.trim().to_string()
}

fn strip_descriptor_suffix(name: &str) -> String {
    let mut current = name.trim().trim_end_matches([',', '&']).trim().to_string();
    loop {
        let lower = current.to_ascii_lowercase();
        let stripped = DESCRIPTOR_SUFFIXES.iter().find_map(|suffix| {
            lower
                .strip_suffix(suffix)
                .filter(|rest| rest.ends_with(' ') || rest.ends_with(','))
                .map(|rest| {
                    current[..rest.len()]
                        .trim_end_matches([' ', ',', '&'])
                        .to_string()
                })
        });
        match stripped {
            Some(next) if !next.is_empty() => current = next,
            _ => return current,
        }
    }
}

/// "Wedding Venue: Redleaf | Easy Weddings" -> "Redleaf", so a directory profile can be resolved
/// to the business behind it.
pub(super) fn vendor_name_from_directory_title(title: &str, host: &str) -> String {
    let brand = registrable_domain(host)
        .split('.')
        .next()
        .map(compact)
        .unwrap_or_default();
    let segments = title_segments(title);
    let picked = segments
        .iter()
        .find(|segment| !is_brand_segment(segment, &brand))
        .or_else(|| segments.first())
        .cloned()
        .unwrap_or_else(|| title.trim().to_string());
    strip_descriptor_suffix(&strip_category_prefix(&picked))
}

pub(super) fn social_name(title: &str) -> String {
    let first = first_title_segment(title);
    let without_handle = match first.find("(@") {
        Some(index) => first[..index].trim().to_string(),
        None => first,
    };
    without_handle
}

pub(super) fn social_title_looks_like_business(name: &str) -> bool {
    let tokens = words(name);
    !name.trim().starts_with('#')
        && (1..=6).contains(&tokens.len())
        && name.trim().len() >= 3
        && !tokens.iter().any(|token| {
            matches!(
                token.as_str(),
                "best" | "top" | "ideas" | "inspo" | "inspiration" | "reels" | "hashtag" | "pins"
            )
        })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classifies_official_au_vendor_sites() {
        assert_eq!(
            classify_source(
                "https://www.redleafwollombi.com.au/",
                "Redleaf Wollombi | Hunter Valley Wedding Venue",
                "Garden ceremonies",
            ),
            SourceKind::Official
        );
        assert_eq!(
            classify_source(
                "https://bellsatkillcare.com.au/central-coast-weddings/",
                "Bells at Killcare - Central Coast Weddings",
                "",
            ),
            SourceKind::Official
        );
    }

    #[test]
    fn classifies_directory_profiles_versus_category_pages() {
        assert_eq!(
            classify_source(
                "https://www.easyweddings.com.au/wedding-venues/the-grounds-of-alexandria/",
                "The Grounds of Alexandria | Wedding Venue | Easy Weddings",
                "",
            ),
            SourceKind::DirectoryProfile
        );
        assert_eq!(
            classify_source(
                "https://www.easyweddings.com.au/wedding-venues/hunter-valley/",
                "Hunter Valley Wedding Venues | Easy Weddings",
                "",
            ),
            SourceKind::Listicle
        );
        assert_eq!(
            classify_source(
                "https://www.weddingwire.com.au/",
                "WeddingWire Australia",
                ""
            ),
            SourceKind::Listicle
        );
        assert_eq!(
            classify_source(
                "https://www.tripadvisor.com.au/Hotel_Review-g1-d2-Reviews-Name.html",
                "Name",
                ""
            ),
            SourceKind::DirectoryProfile
        );
        assert_eq!(
            classify_source(
                "https://www.tripadvisor.com.au/Hotels-g255060-Sydney-Hotels.html",
                "Hotels",
                ""
            ),
            SourceKind::Listicle
        );
    }

    #[test]
    fn classifies_listicles_editorial_social_and_maps() {
        assert_eq!(
            classify_source(
                "https://example-weddings.com.au/blog/10-best-venues-in-sydney",
                "10 best venues in Sydney",
                "",
            ),
            SourceKind::Editorial
        );
        assert_eq!(
            classify_source(
                "https://venuefinder.com.au/top-10-hunter-valley",
                "Hunter guide",
                ""
            ),
            SourceKind::Listicle
        );
        assert_eq!(
            classify_source(
                "https://somesite.com.au/x",
                "Best wedding venues Sydney 2026",
                ""
            ),
            SourceKind::Listicle
        );
        assert_eq!(
            classify_source(
                "https://www.hellomay.com.au/real-weddings/jane-and-tom",
                "Jane and Tom",
                ""
            ),
            SourceKind::Editorial
        );
        assert_eq!(
            classify_source(
                "https://www.instagram.com/redleafwollombi/",
                "Redleaf (@redleafwollombi)",
                ""
            ),
            SourceKind::Social
        );
        assert_eq!(
            classify_source("https://www.google.com/maps/place/Redleaf", "Redleaf", ""),
            SourceKind::Maps
        );
        assert_eq!(
            classify_source("https://www.openstreetmap.org/node/1", "Redleaf", ""),
            SourceKind::Maps
        );
        assert_eq!(
            classify_source("https://randomsite.com.au/", "Something unrelated", ""),
            SourceKind::Unknown
        );
    }

    #[test]
    fn host_matching_supports_suffix_and_wildcard_tlds() {
        assert!(host_matches("www.tripadvisor.com.au", "tripadvisor.*"));
        assert!(host_matches("yelp.com", "yelp.*"));
        assert!(!host_matches("yelpful.com", "yelp.*"));
        assert!(host_matches("au.weddingwire.com", "weddingwire.com"));
        assert!(!host_matches("notweddingwire.com", "weddingwire.com"));
    }

    #[test]
    fn extra_directory_domains_parse_from_env_style_list() {
        assert_eq!(
            parse_extra_domains(" www.Foo.com , bar.com.au,, "),
            vec!["foo.com".to_string(), "bar.com.au".to_string()]
        );
    }

    #[test]
    fn goggles_are_built_from_the_shared_domain_list() {
        let domains = discovery_excluded_domains();
        assert!(domains.contains(&"easyweddings.com.au".to_string()));
        assert!(domains.contains(&"tripadvisor.com.au".to_string()));
        assert!(domains.contains(&"hellomay.com.au".to_string()));
        assert!(!domains.iter().any(|domain| domain.contains('*')));
        let downrank = discovery_goggle(&["a.com".to_string(), "b.com".to_string()]);
        assert_eq!(downrank, "$downrank=5,site=a.com\n$downrank=5,site=b.com");
        assert_eq!(
            discard_goggle(&["a.com".to_string()]),
            "$discard,site=a.com"
        );
        assert!(resolution_excluded_domains().contains(&"instagram.com".to_string()));
    }

    #[test]
    fn directory_titles_are_reduced_to_the_vendor_name() {
        assert_eq!(
            vendor_name_from_directory_title(
                "The Grounds of Alexandria | Wedding Venue | Easy Weddings",
                "www.easyweddings.com.au"
            ),
            "The Grounds of Alexandria"
        );
        assert_eq!(
            vendor_name_from_directory_title(
                "Easy Weddings - Redleaf Wollombi",
                "easyweddings.com.au"
            ),
            "Redleaf Wollombi"
        );
        assert_eq!(
            vendor_name_from_directory_title(
                "Wedding Venue: Circa 1876 - WeddingWire",
                "weddingwire.com.au"
            ),
            "Circa 1876"
        );
        assert_eq!(
            vendor_name_from_directory_title(
                "Peterson House Reviews | WeddingWire",
                "weddingwire.com"
            ),
            "Peterson House"
        );
    }

    #[test]
    fn official_site_confidence_rewards_name_in_host_and_zeroes_non_vendor_hosts() {
        let strong = official_site_confidence(
            "Redleaf Wollombi",
            "https://redleafwollombi.com.au/",
            "Redleaf Wollombi | Wedding Venue",
            "Call 02 4998 1234",
            Some("+61 2 4998 1234"),
            Some("1 Main Rd, Wollombi NSW 2325, Australia"),
        );
        assert!(strong >= 0.9, "strong={strong}");
        let weak = official_site_confidence(
            "Redleaf Wollombi",
            "https://hunterweddings.com.au/venues",
            "Hunter Valley weddings",
            "",
            None,
            None,
        );
        assert!(weak < 0.45, "weak={weak}");
        assert_eq!(
            official_site_confidence(
                "Redleaf Wollombi",
                "https://www.easyweddings.com.au/redleaf-wollombi/",
                "Redleaf Wollombi",
                "",
                None,
                None
            ),
            0.0
        );
        assert_eq!(
            official_site_confidence(
                "Redleaf",
                "https://instagram.com/redleaf",
                "Redleaf",
                "",
                None,
                None
            ),
            0.0
        );
    }

    #[test]
    fn name_stopwords_only_drop_when_two_tokens_remain() {
        assert_eq!(
            entity_name_key("The Grounds of Alexandria"),
            "grounds alexandria"
        );
        assert_eq!(entity_name_key("The Estate"), "the estate");
        assert_eq!(entity_name_key("Chloe's Florals"), "chloes florals");
    }
}
