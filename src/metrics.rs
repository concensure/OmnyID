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
        ];
        for (name, help, value) in fields {
            out.push_str(&format!(
                "# HELP {name} {help}\n# TYPE {name} counter\n{name} {value}\n"
            ));
        }
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
            }
        );
    }
}
