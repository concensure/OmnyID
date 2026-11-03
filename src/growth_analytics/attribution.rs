#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AcquisitionTouch {
    pub visit_id: String,
    pub touch_class: String,
    pub occurred_at_unix: i64,
    pub expires_at_unix: i64,
}

fn eligible(touches: &[AcquisitionTouch], now_unix: i64) -> Vec<&AcquisitionTouch> {
    let mut eligible = touches
        .iter()
        .filter(|touch| touch.occurred_at_unix <= now_unix && touch.expires_at_unix > now_unix)
        .collect::<Vec<_>>();
    eligible.sort_by_key(|touch| touch.occurred_at_unix);
    eligible
}

pub fn first_touch(touches: &[AcquisitionTouch], now_unix: i64) -> Option<&AcquisitionTouch> {
    eligible(touches, now_unix).into_iter().next()
}

pub fn last_non_direct_touch(
    touches: &[AcquisitionTouch],
    now_unix: i64,
) -> Option<&AcquisitionTouch> {
    eligible(touches, now_unix).into_iter().rev().find(|touch| {
        !matches!(
            touch.touch_class.as_str(),
            "direct" | "internal" | "unknown"
        )
    })
}

pub fn persistent_attribution_allowed(
    explicit_opt_in: bool,
    global_privacy_control: bool,
    do_not_track: bool,
) -> bool {
    explicit_opt_in && !global_privacy_control && !do_not_track
}

#[cfg(test)]
mod tests {
    use super::*;

    fn touch(id: &str, class: &str, at: i64) -> AcquisitionTouch {
        AcquisitionTouch {
            visit_id: id.to_string(),
            touch_class: class.to_string(),
            occurred_at_unix: at,
            expires_at_unix: at + 30 * 24 * 60 * 60,
        }
    }

    #[test]
    fn paid_then_direct_preserves_first_and_last_non_direct() {
        let touches = vec![
            touch("paid", "campaign", 100),
            touch("return", "direct", 200),
        ];
        assert_eq!(first_touch(&touches, 300).unwrap().visit_id, "paid");
        assert_eq!(
            last_non_direct_touch(&touches, 300).unwrap().visit_id,
            "paid"
        );
    }

    #[test]
    fn later_direct_never_overwrites_a_non_direct_touch() {
        let touches = vec![
            touch("search", "search", 100),
            touch("social", "social", 200),
            touch("direct", "direct", 300),
        ];
        assert_eq!(first_touch(&touches, 400).unwrap().visit_id, "search");
        assert_eq!(
            last_non_direct_touch(&touches, 400).unwrap().visit_id,
            "social"
        );
    }

    #[test]
    fn expired_or_unknown_touches_are_not_misclassified() {
        let touches = vec![
            touch("expired", "campaign", -3_000_000),
            touch("unknown", "unknown", 100),
        ];
        assert_eq!(
            first_touch(&touches, 200).unwrap().visit_id,
            "unknown"
        );
        assert!(last_non_direct_touch(&touches, 200).is_none());
    }

    #[test]
    fn persistent_identity_is_false_default_and_privacy_signal_aware() {
        assert!(!persistent_attribution_allowed(false, false, false));
        assert!(!persistent_attribution_allowed(true, true, false));
        assert!(!persistent_attribution_allowed(true, false, true));
        assert!(persistent_attribution_allowed(true, false, false));
    }
}
