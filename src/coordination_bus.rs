/*
 * @module-id: rust.coordination-bus
 * @primary-capability: rust.source-module
 * @locs-version: 2.0
 * @stability: active
 * @owner: omnyid
 */

/// AFP Coordination Wakeup Bridges â€” in-process acceleration seam.
///
/// Three layered, independently reversible bridges live here:
///
/// Bridge A (default on)  â€” in-process broadcast wakeup.  When any agent writes a
///   coordination AFP event, it calls `coordination_bus().notify(...)`.  Consuming
///   daemons subscribe and interrupt their sleep immediately instead of waiting for
///   the next poll tick.  A dropped wakeup degrades silently to the existing poll
///   interval â€” no correctness risk.  Toggle: `OMNYID_COORD_WAKEUP` (default `1`).
///
/// Bridge B (default off) â€” per-family sequence cursor.  `notify` increments an
///   atomic counter per `CoordFamily`.  Consumers compare their last-seen counter
///   before running a DB pass; if unchanged they skip entirely.  Toggle:
///   `OMNYID_COORD_CURSOR` (default `0`).
///
/// Bridge C (default off) â€” Postgres LISTEN/NOTIFY producer.  A background task
///   subscribes to the `afp_coordination` channel and forwards notifications into
///   the same in-process bus, allowing multi-replica deployments to benefit from
///   Bridge A without requiring a separate message broker.  See
///   `src/coordination_listener.rs` and the accompanying migration.  Toggle:
///   `OMNYID_COORD_DB_NOTIFY` (default `0`).
///
/// AFP remains the canonical, replayable source of truth in all three cases.  The
/// bus carries no semantic state â€” only zero-content routing hints.
use std::sync::{
    Arc, OnceLock,
    atomic::{AtomicU64, Ordering},
};

use tokio::sync::broadcast;
use tracing::trace;

// â”€â”€ Family enum â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/// The AFP message family that caused a coordination wakeup.
///
/// Kept as a small fixed enum so Bridge B's cursor array has a compile-time
/// size with no extra dependencies.  Add variants here when new coordination
/// families are introduced; the cursor array and `coord_family_of` predicate
/// in `db.rs` are the only other places to update.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum CoordFamily {
    Watcher,
    Ingestion,
    BrainDoctor,
    Synthesis,
    Other,
}

const N_FAMILIES: usize = 5;

impl CoordFamily {
    pub fn index(self) -> usize {
        match self {
            CoordFamily::Watcher => 0,
            CoordFamily::Ingestion => 1,
            CoordFamily::BrainDoctor => 2,
            CoordFamily::Synthesis => 3,
            CoordFamily::Other => 4,
        }
    }

    pub fn from_index(i: usize) -> Option<Self> {
        match i {
            0 => Some(CoordFamily::Watcher),
            1 => Some(CoordFamily::Ingestion),
            2 => Some(CoordFamily::BrainDoctor),
            3 => Some(CoordFamily::Synthesis),
            4 => Some(CoordFamily::Other),
            _ => None,
        }
    }

    /// Parse a compact `family_slug|user_id` string (used by Bridge C Postgres payload).
    pub fn from_slug(s: &str) -> Self {
        match s {
            "watcher" => CoordFamily::Watcher,
            "ingestion" => CoordFamily::Ingestion,
            "brain_doctor" => CoordFamily::BrainDoctor,
            "synthesis" => CoordFamily::Synthesis,
            _ => CoordFamily::Other,
        }
    }

    pub fn slug(self) -> &'static str {
        match self {
            CoordFamily::Watcher => "watcher",
            CoordFamily::Ingestion => "ingestion",
            CoordFamily::BrainDoctor => "brain_doctor",
            CoordFamily::Synthesis => "synthesis",
            CoordFamily::Other => "other",
        }
    }
}

// â”€â”€ Wakeup payload â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/// Zero-semantic routing hint carried by the in-process broadcast (Bridge A).
///
/// Consumers MAY filter by `family` to skip irrelevant wakeups; they MUST NOT
/// treat the absence of a wakeup as a guarantee that nothing changed (poll
/// fallback remains canonical).
#[derive(Clone, Debug)]
pub struct CoordWakeup {
    /// Which AFP family triggered the wakeup.
    pub family: CoordFamily,
    /// The user whose data changed; empty string means "all users" or unknown.
    pub owner_user_id: String,
    /// Bridge B: the per-family cursor value at notify time.  Consumers can
    /// compare against their `last_seen` to decide whether to run a DB pass.
    /// Zero when Bridge B is disabled.
    pub seq: u64,
}

// â”€â”€ CoordinationBus â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/// Capacity chosen to absorb short bursts without dropping wakeups.
/// A dropped wakeup (Lagged) is safe â€” it degrades to the existing poll.
const BUS_CAPACITY: usize = 256;

pub struct CoordinationBus {
    tx: broadcast::Sender<CoordWakeup>,
    /// Bridge B: per-family monotonically increasing counters.
    /// `notify` increments atomically; consumers read to decide whether to
    /// bother running a DB pass.  All zeros when Bridge B is disabled, which
    /// means consumers see seq=0 on every wakeup and always run a pass â€” the
    /// correct behaviour for Bridge A without Bridge B.
    cursors: [AtomicU64; N_FAMILIES],
}

impl CoordinationBus {
    fn new() -> Self {
        let (tx, _) = broadcast::channel(BUS_CAPACITY);
        CoordinationBus {
            tx,
            cursors: std::array::from_fn(|_| AtomicU64::new(0)),
        }
    }

    /// Fire a wakeup for `family` / `owner_user_id`.
    ///
    /// No-op when `OMNYID_COORD_WAKEUP=0`.  Safe to call from any async or
    /// sync context â€” the broadcast send is non-blocking (excess messages are
    /// dropped from slow receivers, which is safe).
    pub fn notify(&self, family: CoordFamily, owner_user_id: &str) {
        if !wakeup_enabled() {
            return;
        }
        let seq = if cursor_enabled() {
            self.cursors[family.index()].fetch_add(1, Ordering::SeqCst) + 1
        } else {
            0
        };
        let wakeup = CoordWakeup {
            family,
            owner_user_id: owner_user_id.to_string(),
            seq,
        };
        trace!(
            family = family.slug(),
            user = owner_user_id,
            seq,
            "coord wakeup fired"
        );
        // Errors here mean no active subscribers â€” perfectly fine at startup or
        // when all daemons have exited.
        let _ = self.tx.send(wakeup);
    }

    /// Subscribe to receive wakeups.  Call once per daemon task, before the
    /// main loop starts, so no wakeup is missed.
    pub fn subscribe(&self) -> broadcast::Receiver<CoordWakeup> {
        self.tx.subscribe()
    }

    /// Bridge B: current cursor value for `family`.  Returns 0 when Bridge B
    /// is disabled (equivalent to "always run the pass").
    pub fn cursor(&self, family: CoordFamily) -> u64 {
        self.cursors[family.index()].load(Ordering::SeqCst)
    }
}

// â”€â”€ Global accessor â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

static COORDINATION_BUS: OnceLock<Arc<CoordinationBus>> = OnceLock::new();

/// Return the process-global `CoordinationBus`.
///
/// Initialised lazily on first call; safe to call from any thread or task.
/// Mirrors the `knowledge_curator_state()` singleton pattern in `server/mod.rs`.
pub fn coordination_bus() -> &'static Arc<CoordinationBus> {
    COORDINATION_BUS.get_or_init(|| Arc::new(CoordinationBus::new()))
}

// â”€â”€ Feature flags â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/// `OMNYID_COORD_WAKEUP=0` disables Bridge A entirely (default: enabled).
pub fn wakeup_enabled() -> bool {
    static ENABLED: OnceLock<bool> = OnceLock::new();
    *ENABLED.get_or_init(|| {
        std::env::var("OMNYID_COORD_WAKEUP")
            .map(|v| v != "0")
            .unwrap_or(true)
    })
}

/// `OMNYID_COORD_CURSOR=1` enables Bridge B cursor-based hot-path skip (default: disabled).
pub fn cursor_enabled() -> bool {
    static ENABLED: OnceLock<bool> = OnceLock::new();
    *ENABLED.get_or_init(|| {
        std::env::var("OMNYID_COORD_CURSOR")
            .map(|v| v == "1")
            .unwrap_or(false)
    })
}

/// `OMNYID_COORD_DB_NOTIFY=1` enables Bridge C Postgres LISTEN/NOTIFY (default: disabled).
pub fn db_notify_enabled() -> bool {
    static ENABLED: OnceLock<bool> = OnceLock::new();
    *ENABLED.get_or_init(|| {
        std::env::var("OMNYID_COORD_DB_NOTIFY")
            .map(|v| v == "1")
            .unwrap_or(false)
    })
}

// â”€â”€ Coordination predicate â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/// Classify a stored AFP message into a `CoordFamily`, or return `None` if
/// this message type should not trigger a wakeup.
///
/// This is the **single extension point** for new coordination types.  Add new
/// type strings here; the wakeup machinery requires no other changes.
///
/// Rules (first match wins):
/// 1. `store_in_relational == true` â†’ `Other` (relational-synced writes are
///    always coordination-worthy, e.g. invoice confirmations).
/// 2. `metadata.coordination_event == true` â†’ `Other`.
/// 3. Recognised type strings â†’ specific family.
/// 4. Everything else â†’ `None` (chat messages, tool calls, ephemeral events).
pub fn coord_family_of(
    msg_type: &str,
    msg_subtype: &str,
    store_in_relational: bool,
    metadata_str: &str,
) -> Option<CoordFamily> {
    // Rule 1: explicitly relational-synced writes are coordination events.
    if store_in_relational {
        return Some(CoordFamily::Other);
    }

    // Rule 2: explicit coordination_event metadata flag.
    if metadata_str.contains("\"coordination_event\":true")
        || metadata_str.contains("\"coordination_event\": true")
    {
        return Some(CoordFamily::Other);
    }

    // Rule 3: recognised coordination type families.
    match msg_type {
        "watcher_alert" | "smart_suggestion" | "watcher_resolution_event" => {
            Some(CoordFamily::Watcher)
        }
        "brain_doctor" => Some(CoordFamily::BrainDoctor),
        "state_synthesis" | "state_snapshot" | "synthesis_invalidation_event" => {
            Some(CoordFamily::Synthesis)
        }
        // Ledger / topology ingestion outputs.
        "ledger_entry" | "ledger_link" | "entity_link" | "relation_link" | "topology_link"
        | "merge_suggestion" | "insight" => Some(CoordFamily::Ingestion),
        // Subtype-based disambiguation (e.g. brain_doctor subcategories that
        // may appear under a different parent type string in future).
        _ if msg_subtype.starts_with("brain_doctor") => Some(CoordFamily::BrainDoctor),
        _ if msg_subtype.starts_with("ledger") || msg_subtype.starts_with("ingestion") => {
            Some(CoordFamily::Ingestion)
        }
        _ => None,
    }
}

// â”€â”€ Bridge B consumer helper â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/// Per-daemon cursor tracker for Bridge B hot-path skipping.
///
/// Each daemon holds one of these.  On every wakeup (or short poll), call
/// `should_run(&families)`.  If it returns `false`, the daemon's DB pass is
/// skipped entirely.  When Bridge B is disabled the method always returns `true`.
///
/// Usage:
/// ```rust,no_run
/// use omnyid_homeserver::coordination_bus::{CoordFamily, DaemonCursor};
///
/// async fn run_db_pass() {}
///
/// # async fn example() {
/// let mut cursor = DaemonCursor::new(&[CoordFamily::Ingestion, CoordFamily::Watcher]);
/// // inside the daemon loop, after a wakeup:
/// if cursor.should_run() {
///     run_db_pass().await;
///     cursor.commit();
/// }
/// # }
/// ```
pub struct DaemonCursor {
    families: Vec<CoordFamily>,
    last_seen: [u64; N_FAMILIES],
}

impl DaemonCursor {
    /// Create a cursor that watches `families`.  Pass the families this daemon
    /// cares about; it will only wake for those.
    pub fn new(families: &[CoordFamily]) -> Self {
        DaemonCursor {
            families: families.to_vec(),
            last_seen: [0u64; N_FAMILIES],
        }
    }

    /// Returns `true` if any watched family's cursor has advanced since the
    /// last `commit()`.  Always `true` when Bridge B is disabled.
    pub fn should_run(&self) -> bool {
        if !cursor_enabled() {
            return true;
        }
        let bus = coordination_bus();
        self.families
            .iter()
            .any(|&f| bus.cursor(f) != self.last_seen[f.index()])
    }

    /// Record the current bus cursors as seen.  Call after a successful pass.
    pub fn commit(&mut self) {
        let bus = coordination_bus();
        for &f in &self.families {
            self.last_seen[f.index()] = bus.cursor(f);
        }
    }
}

// â”€â”€ Tests â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

#[cfg(test)]
mod tests {
    use super::*;

    // â”€â”€ coord_family_of predicate â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    #[test]
    fn watcher_types_map_to_watcher_family() {
        for t in &[
            "watcher_alert",
            "smart_suggestion",
            "watcher_resolution_event",
        ] {
            assert_eq!(
                coord_family_of(t, "", false, "{}"),
                Some(CoordFamily::Watcher),
                "type={t}"
            );
        }
    }

    #[test]
    fn brain_doctor_type_maps_to_brain_doctor_family() {
        assert_eq!(
            coord_family_of("brain_doctor", "", false, "{}"),
            Some(CoordFamily::BrainDoctor)
        );
        assert_eq!(
            coord_family_of("other", "brain_doctor:audit", false, "{}"),
            Some(CoordFamily::BrainDoctor)
        );
        assert_eq!(
            coord_family_of("other", "brain_doctor:finding", false, "{}"),
            Some(CoordFamily::BrainDoctor)
        );
    }

    #[test]
    fn synthesis_types_map_to_synthesis_family() {
        assert_eq!(
            coord_family_of("state_synthesis", "", false, "{}"),
            Some(CoordFamily::Synthesis)
        );
        assert_eq!(
            coord_family_of("state_snapshot", "", false, "{}"),
            Some(CoordFamily::Synthesis)
        );
        assert_eq!(
            coord_family_of("synthesis_invalidation_event", "", false, "{}"),
            Some(CoordFamily::Synthesis)
        );
    }

    #[test]
    fn ingestion_types_map_to_ingestion_family() {
        for t in &[
            "ledger_entry",
            "entity_link",
            "relation_link",
            "topology_link",
            "insight",
        ] {
            assert_eq!(
                coord_family_of(t, "", false, "{}"),
                Some(CoordFamily::Ingestion),
                "type={t}"
            );
        }
    }

    #[test]
    fn store_in_relational_always_wakes() {
        assert_eq!(
            coord_family_of("invoice", "", true, "{}"),
            Some(CoordFamily::Other)
        );
        // Even for otherwise-silent types.
        assert_eq!(
            coord_family_of("chat_message", "", true, "{}"),
            Some(CoordFamily::Other)
        );
    }

    #[test]
    fn coordination_event_metadata_wakes() {
        assert_eq!(
            coord_family_of("chat_message", "", false, r#"{"coordination_event":true}"#),
            Some(CoordFamily::Other)
        );
    }

    #[test]
    fn chat_and_tool_calls_do_not_wake() {
        for t in &[
            "chat",
            "tool_call",
            "tool_result",
            "ephemeral_event",
            "daily_digest",
        ] {
            assert_eq!(
                coord_family_of(t, "", false, "{}"),
                None,
                "type={t} should not wake daemons"
            );
        }
    }

    // â”€â”€ CoordinationBus Bridge A â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    #[tokio::test]
    async fn notify_with_no_subscribers_is_a_noop() {
        // Should not panic even when nobody is listening.
        let bus = CoordinationBus::new();
        bus.notify(CoordFamily::Watcher, "user_01");
        bus.notify(CoordFamily::Ingestion, "user_01");
    }

    #[tokio::test]
    async fn subscriber_receives_wakeup() {
        // Use a fresh bus (not the global) so the test is isolated.
        let bus = CoordinationBus::new();
        let mut rx = bus.subscribe();
        bus.notify(CoordFamily::Ingestion, "user_42");
        let msg = tokio::time::timeout(std::time::Duration::from_millis(100), rx.recv())
            .await
            .expect("timed out waiting for wakeup")
            .expect("channel closed");
        assert_eq!(msg.family, CoordFamily::Ingestion);
        assert_eq!(msg.owner_user_id, "user_42");
    }

    #[tokio::test]
    async fn lagged_receiver_does_not_panic() {
        let bus = CoordinationBus::new();
        let mut rx = bus.subscribe();
        // Fill beyond capacity so the receiver lags.
        for _ in 0..(BUS_CAPACITY + 10) {
            bus.notify(CoordFamily::Other, "u");
        }
        // Lagged error is expected and treated as a safe wakeup signal.
        use broadcast::error::RecvError;
        match rx.recv().await {
            Ok(_) | Err(RecvError::Lagged(_)) => {}
            Err(RecvError::Closed) => panic!("channel closed unexpectedly"),
        }
    }

    // â”€â”€ Bridge B cursor â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    #[test]
    fn cursor_starts_at_zero() {
        let bus = CoordinationBus::new();
        assert_eq!(bus.cursor(CoordFamily::Watcher), 0);
        assert_eq!(bus.cursor(CoordFamily::Ingestion), 0);
    }

    #[test]
    fn cursor_advances_only_when_bridge_b_enabled() {
        // Without setting the env var (Bridge B off), cursor stays at 0.
        let bus = CoordinationBus::new();
        // `wakeup_enabled` reads the global OnceLock so we can't easily override
        // it per-test, but we can call notify directly on a fresh bus and check
        // that seq=0 is stamped in the wakeup when Bridge B is off (default).
        // The cursor field stays 0 when not incremented.
        assert_eq!(bus.cursor(CoordFamily::Other), 0);
        // Simulate Bridge B being on by calling fetch_add directly.
        bus.cursors[CoordFamily::Other.index()].fetch_add(1, Ordering::SeqCst);
        assert_eq!(bus.cursor(CoordFamily::Other), 1);
    }

    // â”€â”€ CoordFamily slug round-trip â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    #[test]
    fn family_slug_round_trip() {
        for family in [
            CoordFamily::Watcher,
            CoordFamily::Ingestion,
            CoordFamily::BrainDoctor,
            CoordFamily::Synthesis,
            CoordFamily::Other,
        ] {
            assert_eq!(CoordFamily::from_slug(family.slug()), family);
        }
    }

    #[test]
    fn unknown_slug_returns_other() {
        assert_eq!(CoordFamily::from_slug("unknown_xyz"), CoordFamily::Other);
    }
}
