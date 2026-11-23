//! Deterministic wedding lifecycle email copy and sending policy.
//!
//! This module deliberately contains no scheduler and no LLM call. Event producers
//! select a supported trigger only after checking current AFP state, preferences and
//! suppression conditions. The resulting copy is stable enough to audit and cache.

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum WeddingLifecycleEmailKind {
    Welcome,
    PartnerInvitation,
    PartnerAccepted,
    VendorResponse,
    QuoteReady,
    WeeklyProgress,
    Reactivation14Days,
    PostWeddingTransition,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum WeddingLifecycleEmailClass {
    Transactional,
    TimeSensitiveService,
    JourneyGuidance,
    Reactivation,
    ProductTransition,
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct WeddingLifecycleEmailContext {
    pub recipient_name: String,
    pub partner_name: Option<String>,
    pub vendor_name: Option<String>,
    pub completed_count: Option<u32>,
    pub waiting_count: Option<u32>,
    pub next_action: Option<String>,
    pub action_url: String,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct WeddingLifecycleEmail {
    pub kind: WeddingLifecycleEmailKind,
    pub class: WeddingLifecycleEmailClass,
    pub subject: String,
    pub body: String,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct WeddingLifecycleSendPolicy {
    pub requires_notification_permission: bool,
    pub requires_commercial_consent: bool,
    pub max_per_seven_days: u8,
    pub revalidate_before_send: bool,
}

fn clean(value: &str) -> String {
    value.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn bounded_name(value: &str) -> String {
    clean(value).chars().take(80).collect()
}

fn first_name(value: &str) -> String {
    bounded_name(value)
        .split_whitespace()
        .next()
        .unwrap_or("there")
        .to_string()
}

fn bounded_detail(value: Option<&str>, fallback: &str) -> String {
    let value = clean(value.unwrap_or_default());
    if value.is_empty() {
        fallback.to_string()
    } else {
        value.chars().take(240).collect()
    }
}

fn safe_action_url(value: &str) -> String {
    let value = value.trim();
    if value.starts_with("https://omnyid.com/") {
        value.to_string()
    } else {
        "https://omnyid.com/workspace/?source=wedding".to_string()
    }
}

pub const fn send_policy(kind: WeddingLifecycleEmailKind) -> WeddingLifecycleSendPolicy {
    use WeddingLifecycleEmailKind::*;
    match kind {
        Welcome | PartnerInvitation | PartnerAccepted => WeddingLifecycleSendPolicy {
            requires_notification_permission: false,
            requires_commercial_consent: false,
            max_per_seven_days: 4,
            revalidate_before_send: true,
        },
        VendorResponse | QuoteReady => WeddingLifecycleSendPolicy {
            requires_notification_permission: true,
            requires_commercial_consent: false,
            max_per_seven_days: 10,
            revalidate_before_send: true,
        },
        WeeklyProgress => WeddingLifecycleSendPolicy {
            requires_notification_permission: true,
            requires_commercial_consent: false,
            max_per_seven_days: 1,
            revalidate_before_send: true,
        },
        Reactivation14Days => WeddingLifecycleSendPolicy {
            requires_notification_permission: true,
            requires_commercial_consent: false,
            max_per_seven_days: 1,
            revalidate_before_send: true,
        },
        PostWeddingTransition => WeddingLifecycleSendPolicy {
            requires_notification_permission: true,
            requires_commercial_consent: true,
            max_per_seven_days: 1,
            revalidate_before_send: true,
        },
    }
}

pub fn compose_wedding_lifecycle_email(
    kind: WeddingLifecycleEmailKind,
    context: &WeddingLifecycleEmailContext,
) -> WeddingLifecycleEmail {
    use WeddingLifecycleEmailClass::*;
    use WeddingLifecycleEmailKind::*;
    let name = first_name(&context.recipient_name);
    let url = safe_action_url(&context.action_url);
    let vendor = bounded_detail(context.vendor_name.as_deref(), "a vendor");
    let partner = bounded_detail(context.partner_name.as_deref(), "your partner");
    let next = bounded_detail(
        context.next_action.as_deref(),
        "Open your wedding plan and choose the next useful step.",
    );
    let done = context.completed_count.unwrap_or_default();
    let waiting = context.waiting_count.unwrap_or_default();
    let (class, subject, body) = match kind {
        Welcome => (
            Transactional,
            "Welcome to OmnyID Weddings — your plan starts here".to_string(),
            format!(
                "Hi {name},\n\nYou’re part of the OmnyID Weddings community. Less chasing, less guesswork, and more time for the enjoyable parts of planning.\n\nStart with the details you already know. OmnyID will keep connected tasks, decisions, vendors and costs together, and nothing external is sent without your approval.\n\nOpen your wedding plan: {url}\n\nWe hope you have an enjoyable planning journey.\n\nOmnyID Weddings"
            ),
        ),
        PartnerInvitation => (
            Transactional,
            format!("{name} invited you to plan a wedding together"),
            format!(
                "Hi {partner},\n\n{name} invited you to share one wedding plan, budget and guest list. You can review the exact access before joining.\n\nReview the invitation: {url}\n\nOmnyID Weddings"
            ),
        ),
        PartnerAccepted => (
            Transactional,
            "You’re now planning together".to_string(),
            format!(
                "Hi {name},\n\n{partner} has joined your wedding plan. Shared decisions and updates can now stay in one place while private notes remain separate.\n\nOpen the shared plan: {url}\n\nOmnyID Weddings"
            ),
        ),
        VendorResponse => (
            TimeSensitiveService,
            format!("You’ve received a reply from {vendor}"),
            format!(
                "Hi {name},\n\n{vendor} has replied to your enquiry. Review the response and any attachments before deciding what to share or do next.\n\nReview the response: {url}\n\nOmnyID Weddings"
            ),
        ),
        QuoteReady => (
            TimeSensitiveService,
            format!("Your quote from {vendor} is ready to review"),
            format!(
                "Hi {name},\n\nA quote from {vendor} is ready. OmnyID can show the original beside a normalised view of inclusions, missing terms and possible cost changes.\n\nReview the quote: {url}\n\nOmnyID Weddings"
            ),
        ),
        WeeklyProgress => (
            JourneyGuidance,
            "Your wedding planning update".to_string(),
            format!(
                "Hi {name},\n\nThis week: {done} completed, {waiting} waiting.\n\nMost useful next step\n{next}\n\nOpen your plan: {url}\n\nYou can change planning-email preferences in OmnyID.\n\nOmnyID Weddings"
            ),
        ),
        Reactivation14Days => (
            Reactivation,
            "Here’s where you left off".to_string(),
            format!(
                "Hi {name},\n\nYour plan is saved. The most useful unfinished step is:\n\n{next}\n\nContinue when it suits you: {url}\n\nYou can turn planning reminders off in OmnyID.\n\nOmnyID Weddings"
            ),
        ),
        PostWeddingTransition => (
            ProductTransition,
            "Your wedding plan is complete — choose what comes next".to_string(),
            format!(
                "Hi {name},\n\nCongratulations. You can archive the wedding plan and choose whether OmnyID should help with personal projects, important reminders or everyday planning. Nothing carries forward without your choice.\n\nReview your options: {url}\n\nUnsubscribe or change preferences at any time.\n\nOmnyID"
            ),
        ),
    };
    WeddingLifecycleEmail {
        kind,
        class,
        subject,
        body,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn context() -> WeddingLifecycleEmailContext {
        WeddingLifecycleEmailContext {
            recipient_name: "Alex Rivera".into(),
            partner_name: Some("Sam".into()),
            vendor_name: Some("Harbour Studio".into()),
            completed_count: Some(2),
            waiting_count: Some(1),
            next_action: Some("Review the photographer quote".into()),
            action_url: "https://omnyid.com/workspace/?source=wedding".into(),
        }
    }

    #[test]
    fn core_schedule_has_eight_auditable_templates() {
        let kinds = [
            WeddingLifecycleEmailKind::Welcome,
            WeddingLifecycleEmailKind::PartnerInvitation,
            WeddingLifecycleEmailKind::PartnerAccepted,
            WeddingLifecycleEmailKind::VendorResponse,
            WeddingLifecycleEmailKind::QuoteReady,
            WeddingLifecycleEmailKind::WeeklyProgress,
            WeddingLifecycleEmailKind::Reactivation14Days,
            WeddingLifecycleEmailKind::PostWeddingTransition,
        ];
        for kind in kinds {
            let message = compose_wedding_lifecycle_email(kind, &context());
            assert!(!message.subject.trim().is_empty());
            assert!(message.body.contains("https://omnyid.com/"));
            assert!(send_policy(kind).revalidate_before_send);
        }
    }

    #[test]
    fn invalid_links_fail_closed_and_transition_requires_commercial_consent() {
        let mut input = context();
        input.action_url = "https://attacker.example/collect".into();
        let message = compose_wedding_lifecycle_email(WeddingLifecycleEmailKind::Welcome, &input);
        assert!(!message.body.contains("attacker.example"));
        assert!(message.body.contains("https://omnyid.com/workspace/"));
        assert!(
            send_policy(WeddingLifecycleEmailKind::PostWeddingTransition)
                .requires_commercial_consent
        );
        assert!(!send_policy(WeddingLifecycleEmailKind::Welcome).requires_commercial_consent);
    }

    #[test]
    fn copy_uses_bounded_context_without_header_injection() {
        let mut input = context();
        input.vendor_name = Some("Studio\r\nBcc: victim@example.com".into());
        let message =
            compose_wedding_lifecycle_email(WeddingLifecycleEmailKind::QuoteReady, &input);
        assert!(!message.subject.contains('\r'));
        assert!(!message.subject.contains('\n'));
        assert!(message.subject.chars().count() < 200);
    }
}
