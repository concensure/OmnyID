const WEDDING_EXACT_SOURCES: [&str; 2] = ["wedding", "wedding_quiz"];
const WEDDING_TOKEN_PREFIX: &str = "wedding_";
const GENERIC_TOKEN_PREFIX: &str = "generic_";

pub(super) fn is_wedding_source(source: Option<&str>) -> bool {
    let normalized = source.unwrap_or_default().trim().to_ascii_lowercase();
    WEDDING_EXACT_SOURCES.contains(&normalized.as_str())
        || normalized.starts_with("wedding_")
        || normalized.starts_with("listicle_")
}

pub(super) fn verification_url(base_url: &str, raw_token: &str, source: Option<&str>) -> String {
    let experience = if is_wedding_source(source) {
        "wedding"
    } else {
        "generic"
    };
    format!("{base_url}/verify-email?token={raw_token}&source={experience}")
}

pub(super) fn verification_token_id(source: Option<&str>) -> String {
    let prefix = if is_wedding_source(source) {
        WEDDING_TOKEN_PREFIX
    } else {
        GENERIC_TOKEN_PREFIX
    };
    format!("{prefix}{}", ulid::Ulid::new())
}

pub(super) fn token_experience(token_id: &str) -> &'static str {
    if token_id.starts_with(WEDDING_TOKEN_PREFIX) {
        "wedding"
    } else {
        "generic"
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn wedding_sources_collapse_to_the_bounded_wedding_experience() {
        for source in [
            "wedding",
            "wedding_quiz",
            "wedding_enquiry",
            "listicle_overloaded",
        ] {
            assert_eq!(
                verification_url("https://omnyid.com", "safe-token", Some(source)),
                "https://omnyid.com/verify-email?token=safe-token&source=wedding",
            );
        }
    }

    #[test]
    fn unknown_or_missing_sources_fail_closed_to_generic() {
        for source in [
            None,
            Some(""),
            Some("vendor_acquisition"),
            Some("https://bad.example"),
        ] {
            assert_eq!(
                verification_url("https://omnyid.com", "safe-token", source),
                "https://omnyid.com/verify-email?token=safe-token&source=generic",
            );
        }
    }

    #[test]
    fn token_id_persists_the_bounded_server_side_experience() {
        let wedding_id = verification_token_id(Some("wedding_quiz"));
        let generic_id = verification_token_id(Some("vendor_acquisition"));

        assert!(wedding_id.starts_with(WEDDING_TOKEN_PREFIX));
        assert_eq!(token_experience(&wedding_id), "wedding");
        assert!(generic_id.starts_with(GENERIC_TOKEN_PREFIX));
        assert_eq!(token_experience(&generic_id), "generic");
        assert_eq!(token_experience("legacy-token-without-prefix"), "generic");
    }
}
