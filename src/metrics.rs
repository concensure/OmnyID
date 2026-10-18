use std::sync::atomic::{AtomicU64, Ordering};

use serde::Serialize;

#[derive(Default)]
pub struct Metrics {
    messages_stored_total: AtomicU64,
    messages_replayed_total: AtomicU64,
    relay_connections_total: AtomicU64,
    relay_webtransport_capability_checks_total: AtomicU64,
    relay_webtransport_sessions_total: AtomicU64,
    relay_send_requests_total: AtomicU64,
    relay_thread_subscriptions_total: AtomicU64,
    relay_errors_total: AtomicU64,
    gateway_inbound_emails_total: AtomicU64,
    gateway_outbound_attempts_total: AtomicU64,
    gateway_outbound_failures_total: AtomicU64,
    rate_limited_requests_total: AtomicU64,
    wedding_quote_events_seen_total: AtomicU64,
    wedding_quote_decisions_projected_total: AtomicU64,
    wedding_quote_projection_blocked_total: AtomicU64,
    wedding_quote_decisions_resurfaced_total: AtomicU64,
    wedding_quote_projection_latency_ms_sum: AtomicU64,
    wedding_quote_projection_latency_ms_count: AtomicU64,
    wedding_quote_projection_latency_ms_max: AtomicU64,
    wedding_quote_missed_critical_deadlines_total: AtomicU64,
    planning_cost_advice_accepted_total: AtomicU64,
    planning_cost_advice_corrected_total: AtomicU64,
}

impl Metrics {
    pub fn inc_messages_stored(&self) {
        self.messages_stored_total.fetch_add(1, Ordering::Relaxed);
    }

    pub fn inc_messages_replayed(&self) {
        self.messages_replayed_total.fetch_add(1, Ordering::Relaxed);
    }

    pub fn inc_relay_connections(&self) {
        self.relay_connections_total.fetch_add(1, Ordering::Relaxed);
    }

    pub fn inc_relay_webtransport_capability_checks(&self) {
        self.relay_webtransport_capability_checks_total
            .fetch_add(1, Ordering::Relaxed);
    }

    pub fn inc_relay_webtransport_sessions(&self) {
        self.relay_webtransport_sessions_total
            .fetch_add(1, Ordering::Relaxed);
    }

    pub fn inc_relay_send_requests(&self) {
        self.relay_send_requests_total
            .fetch_add(1, Ordering::Relaxed);
    }

    pub fn inc_relay_thread_subscriptions(&self) {
        self.relay_thread_subscriptions_total
            .fetch_add(1, Ordering::Relaxed);
    }

    pub fn inc_relay_errors(&self) {
        self.relay_errors_total.fetch_add(1, Ordering::Relaxed);
    }

    pub fn inc_gateway_inbound_emails(&self) {
        self.gateway_inbound_emails_total
            .fetch_add(1, Ordering::Relaxed);
    }

    pub fn inc_gateway_outbound_attempts(&self) {
        self.gateway_outbound_attempts_total
            .fetch_add(1, Ordering::Relaxed);
    }

    pub fn inc_gateway_outbound_failures(&self) {
        self.gateway_outbound_failures_total
            .fetch_add(1, Ordering::Relaxed);
    }

    pub fn inc_rate_limited_requests(&self) {
        self.rate_limited_requests_total
            .fetch_add(1, Ordering::Relaxed);
    }

    pub fn inc_wedding_quote_events_seen(&self) {
        self.wedding_quote_events_seen_total
            .fetch_add(1, Ordering::Relaxed);
    }

    pub fn inc_wedding_quote_decisions_projected(&self) {
        self.wedding_quote_decisions_projected_total
            .fetch_add(1, Ordering::Relaxed);
    }

    pub fn inc_wedding_quote_projection_blocked(&self) {
        self.wedding_quote_projection_blocked_total
            .fetch_add(1, Ordering::Relaxed);
    }

    pub fn inc_wedding_quote_decisions_resurfaced(&self) {
        self.wedding_quote_decisions_resurfaced_total
            .fetch_add(1, Ordering::Relaxed);
    }

    pub fn observe_wedding_quote_projection_latency_ms(&self, latency_ms: u64) {
        self.wedding_quote_projection_latency_ms_sum
            .fetch_add(latency_ms, Ordering::Relaxed);
        self.wedding_quote_projection_latency_ms_count
            .fetch_add(1, Ordering::Relaxed);
        self.wedding_quote_projection_latency_ms_max
            .fetch_max(latency_ms, Ordering::Relaxed);
    }

    pub fn inc_wedding_quote_missed_critical_deadlines(&self) {
        self.wedding_quote_missed_critical_deadlines_total
            .fetch_add(1, Ordering::Relaxed);
    }

    pub fn inc_planning_cost_advice_accepted(&self) {
        self.planning_cost_advice_accepted_total
            .fetch_add(1, Ordering::Relaxed);
    }

    pub fn inc_planning_cost_advice_corrected(&self) {
        self.planning_cost_advice_corrected_total
            .fetch_add(1, Ordering::Relaxed);
    }

    pub fn snapshot(&self) -> MetricsSnapshot {
        MetricsSnapshot {
            messages_stored_total: self.messages_stored_total.load(Ordering::Relaxed),
            messages_replayed_total: self.messages_replayed_total.load(Ordering::Relaxed),
            relay_connections_total: self.relay_connections_total.load(Ordering::Relaxed),
            relay_webtransport_capability_checks_total: self
                .relay_webtransport_capability_checks_total
                .load(Ordering::Relaxed),
            relay_webtransport_sessions_total: self
                .relay_webtransport_sessions_total
                .load(Ordering::Relaxed),
            relay_send_requests_total: self.relay_send_requests_total.load(Ordering::Relaxed),
            relay_thread_subscriptions_total: self
                .relay_thread_subscriptions_total
                .load(Ordering::Relaxed),
            relay_errors_total: self.relay_errors_total.load(Ordering::Relaxed),
            gateway_inbound_emails_total: self.gateway_inbound_emails_total.load(Ordering::Relaxed),
            gateway_outbound_attempts_total: self
                .gateway_outbound_attempts_total
                .load(Ordering::Relaxed),
            gateway_outbound_failures_total: self
                .gateway_outbound_failures_total
                .load(Ordering::Relaxed),
            rate_limited_requests_total: self.rate_limited_requests_total.load(Ordering::Relaxed),
            wedding_quote_events_seen_total: self
                .wedding_quote_events_seen_total
                .load(Ordering::Relaxed),
            wedding_quote_decisions_projected_total: self
                .wedding_quote_decisions_projected_total
                .load(Ordering::Relaxed),
            wedding_quote_projection_blocked_total: self
                .wedding_quote_projection_blocked_total
                .load(Ordering::Relaxed),
            wedding_quote_decisions_resurfaced_total: self
                .wedding_quote_decisions_resurfaced_total
                .load(Ordering::Relaxed),
            wedding_quote_projection_latency_ms_sum: self
                .wedding_quote_projection_latency_ms_sum
                .load(Ordering::Relaxed),
            wedding_quote_projection_latency_ms_count: self
                .wedding_quote_projection_latency_ms_count
                .load(Ordering::Relaxed),
            wedding_quote_projection_latency_ms_max: self
                .wedding_quote_projection_latency_ms_max
                .load(Ordering::Relaxed),
            wedding_quote_missed_critical_deadlines_total: self
                .wedding_quote_missed_critical_deadlines_total
                .load(Ordering::Relaxed),
            planning_cost_advice_accepted_total: self
                .planning_cost_advice_accepted_total
                .load(Ordering::Relaxed),
            planning_cost_advice_corrected_total: self
                .planning_cost_advice_corrected_total
                .load(Ordering::Relaxed),
        }
    }
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct MetricsSnapshot {
    pub messages_stored_total: u64,
    pub messages_replayed_total: u64,
    pub relay_connections_total: u64,
    pub relay_webtransport_capability_checks_total: u64,
    pub relay_webtransport_sessions_total: u64,
    pub relay_send_requests_total: u64,
    pub relay_thread_subscriptions_total: u64,
    pub relay_errors_total: u64,
    pub gateway_inbound_emails_total: u64,
    pub gateway_outbound_attempts_total: u64,
    pub gateway_outbound_failures_total: u64,
    pub rate_limited_requests_total: u64,
    pub wedding_quote_events_seen_total: u64,
    pub wedding_quote_decisions_projected_total: u64,
    pub wedding_quote_projection_blocked_total: u64,
    pub wedding_quote_decisions_resurfaced_total: u64,
    pub wedding_quote_projection_latency_ms_sum: u64,
    pub wedding_quote_projection_latency_ms_count: u64,
    pub wedding_quote_projection_latency_ms_max: u64,
    pub wedding_quote_missed_critical_deadlines_total: u64,
    pub planning_cost_advice_accepted_total: u64,
    pub planning_cost_advice_corrected_total: u64,
}

impl MetricsSnapshot {
    /// Render as Prometheus text exposition format (GAP-084).
    pub fn to_prometheus(&self) -> String {
        let mut out = String::with_capacity(1024);
        let fields: &[(&str, &str, u64)] = &[
            (
                "omnyid_messages_stored_total",
                "AFP messages persisted since startup",
                self.messages_stored_total,
            ),
            (
                "omnyid_messages_replayed_total",
                "Duplicate AFP messages deduplicated",
                self.messages_replayed_total,
            ),
            (
                "omnyid_relay_connections_total",
                "WebSocket+WebTransport relay connections accepted",
                self.relay_connections_total,
            ),
            (
                "omnyid_relay_webtransport_capability_checks_total",
                "Requests to GET /transport/capabilities",
                self.relay_webtransport_capability_checks_total,
            ),
            (
                "omnyid_relay_webtransport_sessions_total",
                "WebTransport sessions opened",
                self.relay_webtransport_sessions_total,
            ),
            (
                "omnyid_relay_send_requests_total",
                "Relay send frames handled",
                self.relay_send_requests_total,
            ),
            (
                "omnyid_relay_thread_subscriptions_total",
                "Thread subscribe frames handled",
                self.relay_thread_subscriptions_total,
            ),
            (
                "omnyid_relay_errors_total",
                "Relay-level errors (invalid frames, stream errors)",
                self.relay_errors_total,
            ),
            (
                "omnyid_gateway_inbound_emails_total",
                "Emails received via IMAP/SMTP gateway",
                self.gateway_inbound_emails_total,
            ),
            (
                "omnyid_gateway_outbound_attempts_total",
                "Outbound email send attempts",
                self.gateway_outbound_attempts_total,
            ),
            (
                "omnyid_gateway_outbound_failures_total",
                "Outbound email send failures",
                self.gateway_outbound_failures_total,
            ),
            (
                "omnyid_rate_limited_requests_total",
                "Requests rejected by rate limiter",
                self.rate_limited_requests_total,
            ),
            (
                "omnyid_wedding_quote_events_seen_total",
                "Wedding vendor quote events observed by the server projector",
                self.wedding_quote_events_seen_total,
            ),
            (
                "omnyid_wedding_quote_decisions_projected_total",
                "Wedding quote DecisionOS requests inserted",
                self.wedding_quote_decisions_projected_total,
            ),
            (
                "omnyid_wedding_quote_projection_blocked_total",
                "Wedding quote projections blocked by ownership, pattern, or persistence checks",
                self.wedding_quote_projection_blocked_total,
            ),
            (
                "omnyid_wedding_quote_decisions_resurfaced_total",
                "Due wedding quote decisions resurfaced by reconciliation",
                self.wedding_quote_decisions_resurfaced_total,
            ),
            (
                "omnyid_wedding_quote_projection_latency_ms_sum",
                "Total wedding quote-to-DecisionOS projection latency in milliseconds",
                self.wedding_quote_projection_latency_ms_sum,
            ),
            (
                "omnyid_wedding_quote_projection_latency_ms_count",
                "Wedding quote projection latency observations",
                self.wedding_quote_projection_latency_ms_count,
            ),
            (
                "omnyid_wedding_quote_missed_critical_deadlines_total",
                "Wedding quote deferrals first resurfaced after the critical boundary",
                self.wedding_quote_missed_critical_deadlines_total,
            ),
            (
                "omnyid_planning_cost_advice_accepted_total",
                "Cost advice acknowledgement events accepted",
                self.planning_cost_advice_accepted_total,
            ),
            (
                "omnyid_planning_cost_advice_corrected_total",
                "Cost advice correction feedback events received",
                self.planning_cost_advice_corrected_total,
            ),
        ];
        for (name, help, value) in fields {
            out.push_str(&format!(
                "# HELP {name} {help}\n# TYPE {name} counter\n{name} {value}\n"
            ));
        }
        out.push_str(&format!(
            "# HELP omnyid_wedding_quote_projection_latency_ms_max Maximum observed wedding quote projection latency in milliseconds\n# TYPE omnyid_wedding_quote_projection_latency_ms_max gauge\nomnyid_wedding_quote_projection_latency_ms_max {}\n",
            self.wedding_quote_projection_latency_ms_max
        ));
        out
    }
}

#[cfg(test)]
mod tests {
    use super::{Metrics, MetricsSnapshot};

    #[test]
    fn metrics_snapshot_reflects_counter_updates() {
        let metrics = Metrics::default();
        metrics.inc_messages_stored();
        metrics.inc_relay_connections();
        metrics.inc_relay_webtransport_capability_checks();
        metrics.inc_relay_webtransport_sessions();
        metrics.inc_gateway_outbound_failures();
        metrics.inc_rate_limited_requests();
        metrics.inc_wedding_quote_events_seen();
        metrics.inc_wedding_quote_decisions_projected();
        metrics.inc_wedding_quote_projection_blocked();
        metrics.inc_wedding_quote_decisions_resurfaced();
        metrics.observe_wedding_quote_projection_latency_ms(120);
        metrics.observe_wedding_quote_projection_latency_ms(30);
        metrics.inc_wedding_quote_missed_critical_deadlines();
        metrics.inc_planning_cost_advice_accepted();
        metrics.inc_planning_cost_advice_corrected();

        assert_eq!(
            metrics.snapshot(),
            MetricsSnapshot {
                messages_stored_total: 1,
                messages_replayed_total: 0,
                relay_connections_total: 1,
                relay_webtransport_capability_checks_total: 1,
                relay_webtransport_sessions_total: 1,
                relay_send_requests_total: 0,
                relay_thread_subscriptions_total: 0,
                relay_errors_total: 0,
                gateway_inbound_emails_total: 0,
                gateway_outbound_attempts_total: 0,
                gateway_outbound_failures_total: 1,
                rate_limited_requests_total: 1,
                wedding_quote_events_seen_total: 1,
                wedding_quote_decisions_projected_total: 1,
                wedding_quote_projection_blocked_total: 1,
                wedding_quote_decisions_resurfaced_total: 1,
                wedding_quote_projection_latency_ms_sum: 150,
                wedding_quote_projection_latency_ms_count: 2,
                wedding_quote_projection_latency_ms_max: 120,
                wedding_quote_missed_critical_deadlines_total: 1,
                planning_cost_advice_accepted_total: 1,
                planning_cost_advice_corrected_total: 1,
            }
        );
    }
}
