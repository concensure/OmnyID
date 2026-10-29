const WEDDING_EXACT_SOURCES: [&str; 2] = ["wedding", "wedding_quiz"];

fn is_wedding_source(source: Option<&str>) -> bool {
    let normalized = source.unwrap_or_default().trim().to_ascii_lowercase();
    WEDDING_EXACT_SOURCES.contains(&normalized.as_str())
        || normalized.starts_with("wedding_")
        || normalized.starts_with("listicle_")
}

pub(super) fn verification_url(base_url: &str, raw_token: &str, source: Option<&str>) -> String {
    let experience = if is_wedding_source(source) { "wedding" } else { "generic" };
    format!("{base_url}/verify-email?token={raw_token}&source={experience}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn wedding_sources_collapse_to_the_bounded_wedding_experience() {
        for source in ["wedding", "wedding_quiz", "wedding_enquiry", "listicle_overloaded"] {
            assert_eq!(
                verification_url("https://omnyid.com", "safe-token", Some(source)),
                "https://omnyid.com/verify-email?token=safe-token&source=wedding",
            );
        }
    }

    #[test]
    fn unknown_or_missing_sources_fail_closed_to_generic() {
        for source in [None, Some(""), Some("vendor_acquisition"), Some("https://bad.example")]
        {
            assert_eq!(
                verification_url("https://omnyid.com", "safe-token", source),
                "https://omnyid.com/verify-email?token=safe-token&source=generic",
            );
        }
    }
}
