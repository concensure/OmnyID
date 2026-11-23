/*
 * @module-id: rust.timing-hints
 * @primary-capability: rust.source-module
 * @locs-version: 2.0
 * @stability: active
 * @owner: omnyid
 */

pub fn due_hint_timing_rank(due_hint: &str) -> u8 {
    let normalized = due_hint.trim().to_ascii_lowercase();
    if normalized.is_empty() {
        return 4;
    }
    if due_hint_is_immediate(&normalized) {
        return 0;
    }
    if normalized.contains("tomorrow")
        || normalized.contains("next day")
        || normalized.contains("within 48h")
        || normalized.contains("48h")
    {
        return 1;
    }
    if normalized.contains("this week")
        || normalized.contains("friday")
        || normalized.contains("current decision window")
    {
        return 2;
    }
    if normalized.contains("next follow-up window")
        || normalized.contains("next work session")
        || normalized.contains("current work window")
    {
        return 3;
    }
    4
}

pub fn due_hint_is_immediate(due_hint: &str) -> bool {
    let normalized = due_hint.trim().to_ascii_lowercase();
    normalized.contains("today")
        || normalized.contains("within 24h")
        || normalized.contains("24h")
        || normalized.contains("within 4h")
        || normalized.contains("4h")
        || normalized.contains("asap")
        || normalized.contains("urgent")
        || normalized.contains("eod")
        || normalized.contains("end of day")
        || normalized.contains("this afternoon")
        || normalized.contains("tomorrow morning")
}

pub fn due_hint_sort_key(due_hint: &str) -> (u8, u16) {
    let normalized = due_hint.trim().to_ascii_lowercase();
    if normalized == "today" {
        return (0, 0);
    }
    if normalized == "tomorrow" {
        return (2, 0);
    }
    if let Some(hours) = normalized
        .strip_prefix("within ")
        .and_then(|value| value.strip_suffix('h'))
        .and_then(|value| value.parse::<u16>().ok())
    {
        return (1, hours);
    }

    match due_hint_timing_rank(&normalized) {
        0 => (0, 1),
        1 => (2, 1),
        2 => (3, 0),
        3 => (4, 0),
        _ => (5, u16::MAX),
    }
}

#[cfg(test)]
mod tests {
    use super::{due_hint_is_immediate, due_hint_sort_key, due_hint_timing_rank};

    #[test]
    fn due_hint_helpers_keep_immediate_and_week_scope_consistent() {
        assert!(due_hint_is_immediate("Today"));
        assert!(due_hint_is_immediate("Within 4h"));
        assert_eq!(due_hint_timing_rank("This week"), 2);
        assert_eq!(due_hint_timing_rank("Next work session"), 3);
    }

    #[test]
    fn due_hint_sort_key_prefers_today_then_within_hours_then_tomorrow() {
        assert!(due_hint_sort_key("Today") < due_hint_sort_key("Within 4h"));
        assert!(due_hint_sort_key("Within 4h") < due_hint_sort_key("Within 24h"));
        assert!(due_hint_sort_key("Within 24h") < due_hint_sort_key("Tomorrow"));
    }
}
