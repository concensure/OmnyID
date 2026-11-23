//! Pure policy for the Sydney celebrant consultation pilot.

use chrono::{DateTime, Duration, Utc};

pub const CONSULTATION_MINUTES: i64 = 10;
pub const MAX_LIVE_MINUTES: i64 = 240;
pub const ACCEPTANCE_HOLD_MINUTES: i64 = 5;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ConsultationIntent {
    GeneralQuestion,
    ProspectiveClient,
}

impl ConsultationIntent {
    pub fn parse(value: &str) -> Option<Self> {
        match value {
            "general_question" => Some(Self::GeneralQuestion),
            "prospective_client" => Some(Self::ProspectiveClient),
            _ => None,
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Self::GeneralQuestion => "general_question",
            Self::ProspectiveClient => "prospective_client",
        }
    }
}

pub fn live_session_end(now: DateTime<Utc>, requested_minutes: i64) -> DateTime<Utc> {
    now + Duration::minutes(requested_minutes.clamp(CONSULTATION_MINUTES, MAX_LIVE_MINUTES))
}

pub fn live_has_capacity(
    now: DateTime<Utc>,
    expires_at: DateTime<Utc>,
    paused: bool,
    active_holds: i64,
    call_cap: i32,
    buffer_minutes: i32,
) -> bool {
    !paused
        && active_holds < i64::from(call_cap)
        && expires_at >= now + Duration::minutes(CONSULTATION_MINUTES + i64::from(buffer_minutes))
}

pub fn valid_topic(value: &str) -> bool {
    matches!(
        value,
        "ceremony_process" | "paperwork" | "ceremony_ideas" | "finding_celebrant"
    )
}

pub fn normalize_phone(value: &str) -> Option<String> {
    let compact = value
        .chars()
        .filter(|character| character.is_ascii_digit() || *character == '+')
        .collect::<String>();
    let normalized = if compact.starts_with("04") && compact.len() == 10 {
        format!("+61{}", &compact[1..])
    } else if compact.starts_with("614") && !compact.starts_with('+') {
        format!("+{compact}")
    } else {
        compact
    };
    let digits = normalized.strip_prefix('+')?;
    (digits.len() >= 8 && digits.len() <= 15 && digits.chars().all(|value| value.is_ascii_digit()))
        .then_some(normalized)
}

/// Build a portable `tel:` target without changing the number shown to people.
/// Australian national numbers are converted to E.164; already international
/// numbers are retained. Short/local extensions are deliberately not guessed.
pub fn phone_tel_href(value: &str) -> Option<String> {
    let compact = value
        .chars()
        .filter(|character| character.is_ascii_digit() || *character == '+')
        .collect::<String>();
    if compact.matches('+').count() > 1 || (compact.contains('+') && !compact.starts_with('+')) {
        return None;
    }
    let normalized = if compact.starts_with('0') && compact.len() == 10 {
        format!("+61{}", &compact[1..])
    } else if compact.starts_with("61") && compact.len() == 11 {
        format!("+{compact}")
    } else {
        compact
    };
    let digits = normalized.strip_prefix('+')?;
    (digits.len() >= 8 && digits.len() <= 15 && digits.chars().all(|value| value.is_ascii_digit()))
        .then(|| format!("tel:{normalized}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn australian_mobile_is_normalised_without_guessing_other_numbers() {
        assert_eq!(
            normalize_phone("0412 345 678").as_deref(),
            Some("+61412345678")
        );
        assert_eq!(
            normalize_phone("+61 412 345 678").as_deref(),
            Some("+61412345678")
        );
        assert!(normalize_phone("123").is_none());
    }

    #[test]
    fn tel_links_use_e164_for_australian_mobile_and_landline_numbers() {
        assert_eq!(
            phone_tel_href("0412 345 678").as_deref(),
            Some("tel:+61412345678")
        );
        assert_eq!(
            phone_tel_href("(02) 9123 4567").as_deref(),
            Some("tel:+61291234567")
        );
        assert_eq!(
            phone_tel_href("61 2 9123 4567").as_deref(),
            Some("tel:+61291234567")
        );
        assert!(phone_tel_href("9123 4567").is_none());
        assert!(phone_tel_href("+61 +2 9123 4567").is_none());
    }

    #[test]
    fn live_status_requires_time_and_capacity() {
        let now = Utc::now();
        assert!(live_has_capacity(
            now,
            now + Duration::minutes(30),
            false,
            1,
            2,
            5
        ));
        assert!(!live_has_capacity(
            now,
            now + Duration::minutes(10),
            false,
            0,
            2,
            5
        ));
        assert!(!live_has_capacity(
            now,
            now + Duration::minutes(30),
            true,
            0,
            2,
            5
        ));
        assert!(!live_has_capacity(
            now,
            now + Duration::minutes(30),
            false,
            2,
            2,
            5
        ));
    }
}
