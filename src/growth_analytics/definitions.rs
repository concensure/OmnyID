use serde::Serialize;

pub const GROWTH_EVENT_SCHEMA_VERSION: &str = "growth-events.v1";
pub const GROWTH_KPI_SCHEMA_VERSION: &str = "growth-kpis.v1";
pub const GROWTH_REPORT_TIMEZONE: &str = "Australia/Sydney";

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum SourceAvailability {
    Direct,
    Derived,
    Absent,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum GrowthUnit {
    Visit,
    User,
    Wedding,
    Transaction,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
pub struct GrowthEventDefinition {
    pub event: &'static str,
    pub availability: SourceAvailability,
    pub source_authority: &'static str,
    pub source_selector: &'static str,
    pub unit: GrowthUnit,
    pub acquisition_increment: bool,
    pub activation_eligible: bool,
    pub allowed_metadata: &'static [&'static str],
    pub note: &'static str,
}

const NO_METADATA: &[&str] = &[];
const PUBLIC_TOUCH_METADATA: &[&str] = &[
    "landing_path",
    "touch_class",
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_content",
    "utm_term",
    "intent",
    "device_class",
];
const AFP_ACTION_METADATA: &[&str] = &["source_kind", "definition_version"];
const BILLING_METADATA: &[&str] = &[
    "currency",
    "gross_minor_units",
    "refund_minor_units",
    "tax_minor_units",
    "test_mode",
];

pub const GROWTH_EVENT_DEFINITIONS: &[GrowthEventDefinition] = &[
    GrowthEventDefinition {
        event: "landing_page_view",
        availability: SourceAvailability::Direct,
        source_authority: "wedding_site_events",
        source_selector: "event = 'wedding_landing_view'",
        unit: GrowthUnit::Visit,
        acquisition_increment: false,
        activation_eligible: false,
        allowed_metadata: PUBLIC_TOUCH_METADATA,
        note: "Deduplicate by visit and stable client event id before KPI use.",
    },
    GrowthEventDefinition {
        event: "quiz_started",
        availability: SourceAvailability::Direct,
        source_authority: "wedding_site_events",
        source_selector: "event = 'quiz_started'",
        unit: GrowthUnit::Visit,
        acquisition_increment: false,
        activation_eligible: false,
        allowed_metadata: &["quiz_version", "landing_path"],
        note: "Never retain quiz answers in growth metadata.",
    },
    GrowthEventDefinition {
        event: "quiz_completed",
        availability: SourceAvailability::Direct,
        source_authority: "wedding_site_events",
        source_selector: "event = 'quiz_completed'",
        unit: GrowthUnit::Visit,
        acquisition_increment: false,
        activation_eligible: false,
        allowed_metadata: &["quiz_version", "landing_path"],
        note: "Completion is an engagement diagnostic, not Wedding activation.",
    },
    GrowthEventDefinition {
        event: "binder_downloaded",
        availability: SourceAvailability::Absent,
        source_authority: "none",
        source_selector: "no authoritative successful-download event",
        unit: GrowthUnit::Visit,
        acquisition_increment: false,
        activation_eligible: false,
        allowed_metadata: NO_METADATA,
        note: "wedding_binder_submitted is not proof that a download completed.",
    },
    GrowthEventDefinition {
        event: "registration_completed",
        availability: SourceAvailability::Direct,
        source_authority: "users",
        source_selector: "new row committed by POST /auth/register; existing-account responses excluded",
        unit: GrowthUnit::User,
        acquisition_increment: false,
        activation_eligible: false,
        allowed_metadata: &["registration_source"],
        note: "Project server-side once; a user is not the primary acquisition unit.",
    },
    GrowthEventDefinition {
        event: "email_verified",
        availability: SourceAvailability::Direct,
        source_authority: "users",
        source_selector: "email_verified transitions false to true through verified auth token/provider",
        unit: GrowthUnit::User,
        acquisition_increment: false,
        activation_eligible: false,
        allowed_metadata: NO_METADATA,
        note: "Project idempotently; repeated verification does not add an event.",
    },
    GrowthEventDefinition {
        event: "wedding_created",
        availability: SourceAvailability::Derived,
        source_authority: "AFP Wedding scope",
        source_selector: "first durable account-authorised message carrying canonical wedding_plan_id",
        unit: GrowthUnit::Wedding,
        acquisition_increment: true,
        activation_eligible: false,
        allowed_metadata: &["definition_version"],
        note: "One canonical Wedding increments acquisition once; partner acceptance never does.",
    },
    GrowthEventDefinition {
        event: "wedding_plan_saved",
        availability: SourceAvailability::Direct,
        source_authority: "AFP Wedding ledger",
        source_selector: "subtype = 'wedding_intake_profile' and content.wedding_plan_id is authorised",
        unit: GrowthUnit::Wedding,
        acquisition_increment: false,
        activation_eligible: true,
        allowed_metadata: AFP_ACTION_METADATA,
        note: "Count the durable source id, never the profile values.",
    },
    GrowthEventDefinition {
        event: "budget_saved",
        availability: SourceAvailability::Direct,
        source_authority: "AFP Wedding ledger",
        source_selector: "subtype = 'wedding_decision_selection' and content.budget_decision = true",
        unit: GrowthUnit::Wedding,
        acquisition_increment: false,
        activation_eligible: true,
        allowed_metadata: AFP_ACTION_METADATA,
        note: "Count a meaningful persisted budget decision, never its amount.",
    },
    GrowthEventDefinition {
        event: "vendor_saved",
        availability: SourceAvailability::Direct,
        source_authority: "AFP Wedding ledger",
        source_selector: "subtype = 'selected_vendor_contact_details' and content.selected_for_follow_up = true",
        unit: GrowthUnit::Wedding,
        acquisition_increment: false,
        activation_eligible: true,
        allowed_metadata: AFP_ACTION_METADATA,
        note: "Search impressions and generated recommendations do not qualify.",
    },
    GrowthEventDefinition {
        event: "decision_resolved",
        availability: SourceAvailability::Direct,
        source_authority: "AFP Wedding ledger",
        source_selector: "subtype = 'wedding_decision_selection' with a durable decision_id",
        unit: GrowthUnit::Wedding,
        acquisition_increment: false,
        activation_eligible: true,
        allowed_metadata: AFP_ACTION_METADATA,
        note: "Deduplicate by source message and decision version.",
    },
    GrowthEventDefinition {
        event: "meaningful_activity",
        availability: SourceAvailability::Derived,
        source_authority: "growth activation projection",
        source_selector: "one row per canonical Wedding and Sydney calendar day containing an activation-v1 source",
        unit: GrowthUnit::Wedding,
        acquisition_increment: false,
        activation_eligible: false,
        allowed_metadata: &["definition_version", "activity_count"],
        note: "Either partner may contribute, but the Wedding/day is counted once.",
    },
    GrowthEventDefinition {
        event: "payment_succeeded",
        availability: SourceAvailability::Direct,
        source_authority: "billing_events",
        source_selector: "signed accepted checkout.session.completed or checkout.session.async_payment_succeeded with paid OmnyID Wedding product",
        unit: GrowthUnit::Transaction,
        acquisition_increment: false,
        activation_eligible: false,
        allowed_metadata: BILLING_METADATA,
        note: "Checkout start and test-mode events are excluded.",
    },
    GrowthEventDefinition {
        event: "payment_refunded",
        availability: SourceAvailability::Absent,
        source_authority: "none",
        source_selector: "refund event is not currently accepted into the billing projection",
        unit: GrowthUnit::Transaction,
        acquisition_increment: false,
        activation_eligible: false,
        allowed_metadata: BILLING_METADATA,
        note: "Do not report net revenue or paid reversals until signed refund ingestion exists.",
    },
];

pub const ACTIVATION_V1_EVENTS: &[&str] = &[
    "wedding_plan_saved",
    "budget_saved",
    "vendor_saved",
    "decision_resolved",
];

pub const NEVER_ACTIVATION_SOURCES: &[&str] = &[
    "landing_page_view",
    "login",
    "home_view",
    "generated_ai_output",
    "partner_invite_accepted",
    "quiz_completed",
];

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
pub struct GrowthKpiDefinition {
    pub key: &'static str,
    pub numerator: &'static str,
    pub denominator: &'static str,
    pub maturity_days: u16,
    pub zero_denominator_state: &'static str,
    pub note: &'static str,
}

pub const GROWTH_KPI_DEFINITIONS: &[GrowthKpiDefinition] = &[
    GrowthKpiDefinition {
        key: "cost_per_landing_visit",
        numerator: "matched paid spend in AUD",
        denominator: "deduplicated eligible first-party landing visits",
        maturity_days: 0,
        zero_denominator_state: "unavailable",
        note: "Organic cost is N/A; Meta and first-party landing views remain separate.",
    },
    GrowthKpiDefinition {
        key: "signup_rate",
        numerator: "distinct newly acquired Weddings",
        denominator: "eligible landing visits",
        maturity_days: 0,
        zero_denominator_state: "unavailable",
        note: "Partner joins never increment the numerator.",
    },
    GrowthKpiDefinition {
        key: "activation_rate_7d",
        numerator: "mature new Weddings with first activation-v1 event within seven days",
        denominator: "mature newly registered Weddings",
        maturity_days: 7,
        zero_denominator_state: "unavailable",
        note: "Immature Weddings are provisional or excluded.",
    },
    GrowthKpiDefinition {
        key: "cost_per_activated_wedding",
        numerator: "matched paid spend in AUD",
        denominator: "distinct activated acquired Weddings",
        maturity_days: 7,
        zero_denominator_state: "no_activations",
        note: "Never divide by accounts or partners.",
    },
    GrowthKpiDefinition {
        key: "return_days_1_to_7",
        numerator: "mature activated Weddings with meaningful activity on a later Sydney day in days one to seven",
        denominator: "mature eligible activated Weddings",
        maturity_days: 7,
        zero_denominator_state: "unavailable",
        note: "This is a days 1-7 return metric, not strict Day-7 retention.",
    },
    GrowthKpiDefinition {
        key: "paid_cac_30d",
        numerator: "matched paid spend in AUD",
        denominator: "distinct mature acquired Weddings with a qualifying first purchase within 30 days",
        maturity_days: 30,
        zero_denominator_state: "no_purchases",
        note: "Unavailable until payment and refund reconciliation are complete.",
    },
];

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
pub struct GrowthPrivacyPolicy {
    pub persistent_attribution_enabled_by_default: bool,
    pub explicit_opt_in_required: bool,
    pub persistent_touch_max_age_days: u16,
    pub anonymous_raw_measurement_max_age_days: u16,
    pub revoke_deletes_identity_link: bool,
    pub historic_attribution_backfill: &'static str,
    pub linked_projection_retention: &'static str,
    pub aggregate_retention: &'static str,
}

pub const GROWTH_PRIVACY_POLICY_V1: GrowthPrivacyPolicy = GrowthPrivacyPolicy {
    persistent_attribution_enabled_by_default: false,
    explicit_opt_in_required: true,
    persistent_touch_max_age_days: 30,
    anonymous_raw_measurement_max_age_days: 30,
    revoke_deletes_identity_link: true,
    historic_attribution_backfill: "unavailable_when_no_eligible_touch_was_recorded",
    linked_projection_retention: "pending_privacy_impact_assessment; do not enable persistent linking",
    aggregate_retention: "deidentified rollups only; reassess re-identification risk at least annually",
};

pub fn event_definition(event: &str) -> Option<&'static GrowthEventDefinition> {
    GROWTH_EVENT_DEFINITIONS
        .iter()
        .find(|definition| definition.event == event)
}

pub fn is_activation_v1_event(event: &str) -> bool {
    ACTIVATION_V1_EVENTS.contains(&event)
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeSet;

    use super::*;

    #[test]
    fn canonical_events_have_unique_names_and_explicit_sources() {
        let mut names = BTreeSet::new();
        for definition in GROWTH_EVENT_DEFINITIONS {
            assert!(
                names.insert(definition.event),
                "duplicate {}",
                definition.event
            );
            assert!(!definition.source_authority.is_empty());
            assert!(!definition.source_selector.is_empty());
            if definition.availability == SourceAvailability::Absent {
                assert_eq!(definition.source_authority, "none");
            }
        }
    }

    #[test]
    fn activation_v1_is_exact_and_excludes_passive_or_generated_activity() {
        assert_eq!(ACTIVATION_V1_EVENTS.len(), 4);
        for event in ACTIVATION_V1_EVENTS {
            assert!(event_definition(event).is_some_and(|item| item.activation_eligible));
        }
        for source in NEVER_ACTIVATION_SOURCES {
            assert!(!is_activation_v1_event(source));
        }
    }

    #[test]
    fn acquisition_uses_one_wedding_and_never_a_partner_join() {
        let acquisition = GROWTH_EVENT_DEFINITIONS
            .iter()
            .filter(|definition| definition.acquisition_increment)
            .collect::<Vec<_>>();
        assert_eq!(acquisition.len(), 1);
        assert_eq!(acquisition[0].event, "wedding_created");
        assert_eq!(acquisition[0].unit, GrowthUnit::Wedding);
        assert!(event_definition("partner_invite_accepted").is_none());
    }

    #[test]
    fn metadata_allowlists_exclude_private_wedding_fields() {
        let forbidden = [
            "name",
            "email",
            "phone",
            "guest_id",
            "guest_name",
            "allergy",
            "message",
            "quote_text",
            "budget_amount",
            "wedding_plan_id",
            "user_id",
        ];
        for definition in GROWTH_EVENT_DEFINITIONS {
            for key in definition.allowed_metadata {
                assert!(
                    !forbidden.contains(key),
                    "{} exposes {key}",
                    definition.event
                );
            }
        }
    }

    #[test]
    fn unavailable_history_and_refunds_are_not_invented() {
        assert_eq!(
            GROWTH_PRIVACY_POLICY_V1.historic_attribution_backfill,
            "unavailable_when_no_eligible_touch_was_recorded"
        );
        assert_eq!(
            event_definition("binder_downloaded").unwrap().availability,
            SourceAvailability::Absent
        );
        assert_eq!(
            event_definition("payment_refunded").unwrap().availability,
            SourceAvailability::Absent
        );
    }

    #[test]
    fn persistent_attribution_is_false_default_and_time_bounded() {
        assert!(!GROWTH_PRIVACY_POLICY_V1.persistent_attribution_enabled_by_default);
        assert!(GROWTH_PRIVACY_POLICY_V1.explicit_opt_in_required);
        assert_eq!(GROWTH_PRIVACY_POLICY_V1.persistent_touch_max_age_days, 30);
        assert_eq!(
            GROWTH_PRIVACY_POLICY_V1.anonymous_raw_measurement_max_age_days,
            30
        );
        assert!(GROWTH_PRIVACY_POLICY_V1.revoke_deletes_identity_link);
    }

    #[test]
    fn kpis_are_versioned_mature_and_zero_safe() {
        assert_eq!(GROWTH_EVENT_SCHEMA_VERSION, "growth-events.v1");
        assert_eq!(GROWTH_KPI_SCHEMA_VERSION, "growth-kpis.v1");
        assert_eq!(GROWTH_REPORT_TIMEZONE, "Australia/Sydney");
        assert_eq!(GROWTH_KPI_DEFINITIONS.len(), 6);
        for definition in GROWTH_KPI_DEFINITIONS {
            assert!(!definition.numerator.is_empty());
            assert!(!definition.denominator.is_empty());
            assert!(!definition.zero_denominator_state.is_empty());
        }
    }
}
