/*
 * @module-id: rust.temporal-ledger
 * @primary-capability: rust.source-module
 * @locs-version: 2.0
 * @stability: active
 * @owner: omnyid
 */

/// Temporal Ledger â€” time-windowed queries and point-in-time snapshots.
///
/// Answers questions like "what changed last quarter?" by:
///   1. Creating periodic `ledger_snapshot:point_in_time` AFP messages.
///   2. Computing `ledger_snapshot:delta` messages between two snapshots.
///   3. Providing `query_ledger_range()` to filter entries by effective_date.
///
/// Snapshots are lightweight: they record an entry count and a SHA-256 hash
/// of the serialised entries.  Full entry data is included only when the
/// ledger is small (â‰¤ `INLINE_THRESHOLD` entries).
use chrono::{DateTime, Utc};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use ulid::Ulid;

use crate::message::{
    AFP_SUBTYPE_LEDGER_SNAPSHOT_DELTA, AFP_SUBTYPE_LEDGER_SNAPSHOT_POINT_IN_TIME,
    AFP_TYPE_LEDGER_SNAPSHOT, AfpLedgerDeltaContent, AfpLedgerEntry, AfpLedgerSnapshotContent,
};

/// Ledgers with more entries than this threshold omit `entries_inline` to avoid
/// large AFP messages.
pub const INLINE_THRESHOLD: usize = 50;

// â”€â”€ Snapshot creation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/// Compute a deterministic SHA-256 hash of a slice of ledger entries.
/// Entries are sorted by `entry_id` before hashing to ensure stability.
pub fn hash_entries(entries: &[AfpLedgerEntry]) -> String {
    let mut sorted_ids: Vec<&str> = entries.iter().map(|e| e.entry_id.as_str()).collect();
    sorted_ids.sort_unstable();
    let mut hasher = Sha256::new();
    for id in sorted_ids {
        hasher.update(id.as_bytes());
        hasher.update(b"|");
    }
    format!("{:x}", hasher.finalize())
}

/// Build a `ledger_snapshot:point_in_time` AFP message for the given ledger entries.
pub fn build_snapshot(
    owner_user_id: &str,
    thread_id: &str,
    ledger_message_id: &str,
    tier: &str,
    entries: &[AfpLedgerEntry],
) -> Value {
    let snapshot_id = Ulid::new().to_string();
    let now = Utc::now().to_rfc3339();

    let entries_inline: Vec<Value> = if entries.len() <= INLINE_THRESHOLD {
        entries
            .iter()
            .map(|e| serde_json::to_value(e).unwrap_or(Value::Null))
            .collect()
    } else {
        vec![]
    };

    let content = AfpLedgerSnapshotContent {
        ledger_message_id: ledger_message_id.to_string(),
        snapshot_id: snapshot_id.clone(),
        snapshot_at: now.clone(),
        tier: tier.to_string(),
        entry_count: entries.len() as u32,
        entries_hash: hash_entries(entries),
        entries_inline,
        ..Default::default()
    };

    json!({
        "protocol": "afp-v1",
        "id": Ulid::new().to_string(),
        "thread_id": thread_id,
        "from": "temporal_ledger",
        "to": [owner_user_id],
        "timestamp": now,
        "type": AFP_TYPE_LEDGER_SNAPSHOT,
        "subtype": AFP_SUBTYPE_LEDGER_SNAPSHOT_POINT_IN_TIME,
        "content": serde_json::to_value(&content).unwrap_or(Value::Null),
        "metadata": { "store": true, "snapshot": true },
        "store_in_relational": true,
    })
}

// â”€â”€ Delta computation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/// Compute a delta between two sets of ledger entries (before vs after).
///
/// Returns an `AfpLedgerDeltaContent` describing what was added, removed, or
/// promoted between the two snapshots.
pub fn compute_delta(
    ledger_message_id: &str,
    from_snapshot_id: &str,
    to_snapshot_id: &str,
    period_start: &str,
    period_end: &str,
    before: &[AfpLedgerEntry],
    after: &[AfpLedgerEntry],
) -> AfpLedgerDeltaContent {
    use std::collections::HashSet;

    let before_ids: HashSet<&str> = before.iter().map(|e| e.entry_id.as_str()).collect();
    let after_ids: HashSet<&str> = after.iter().map(|e| e.entry_id.as_str()).collect();

    let added: Vec<String> = after_ids
        .difference(&before_ids)
        .map(|s| s.to_string())
        .collect();
    let removed: Vec<String> = before_ids
        .difference(&after_ids)
        .map(|s| s.to_string())
        .collect();

    // Placeholder for future promoted-entry tracking (requires tier field on AfpLedgerEntry).
    let before_tiers: std::collections::HashMap<&str, &str> = before
        .iter()
        .map(|e| (e.entry_id.as_str(), e.entry_id.as_str()))
        .collect();
    let _ = before_tiers; // used when AfpLedgerEntry exposes tier; currently unused

    let net_change = added.len() as i32 - removed.len() as i32;

    AfpLedgerDeltaContent {
        from_snapshot_id: from_snapshot_id.to_string(),
        to_snapshot_id: to_snapshot_id.to_string(),
        ledger_message_id: ledger_message_id.to_string(),
        period_start: period_start.to_string(),
        period_end: period_end.to_string(),
        added_entry_ids: added,
        removed_entry_ids: removed,
        promoted_entry_ids: vec![],
        net_change,
        ..Default::default()
    }
}

/// Build a `ledger_snapshot:delta` AFP message.
pub fn build_delta_afp(
    owner_user_id: &str,
    thread_id: &str,
    delta: &AfpLedgerDeltaContent,
) -> Value {
    json!({
        "protocol": "afp-v1",
        "id": Ulid::new().to_string(),
        "thread_id": thread_id,
        "from": "temporal_ledger",
        "to": [owner_user_id],
        "timestamp": Utc::now().to_rfc3339(),
        "type": AFP_TYPE_LEDGER_SNAPSHOT,
        "subtype": AFP_SUBTYPE_LEDGER_SNAPSHOT_DELTA,
        "content": serde_json::to_value(delta).unwrap_or(Value::Null),
        "metadata": { "store": true, "snapshot": true },
        "store_in_relational": true,
    })
}

// â”€â”€ Time-range query â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/// Filter ledger entries whose `created_at` field falls within [start, end].
///
/// `start` and `end` are RFC 3339 strings; entries with missing or unparseable
/// timestamps are excluded.  Returns indices into `entries` rather than cloned
/// data to avoid unnecessary allocation.
pub fn query_ledger_range<'a>(
    entries: &'a [AfpLedgerEntry],
    start: &str,
    end: &str,
) -> Vec<&'a AfpLedgerEntry> {
    let start_dt: DateTime<Utc> = match start.parse() {
        Ok(dt) => dt,
        Err(_) => return vec![],
    };
    let end_dt: DateTime<Utc> = match end.parse() {
        Ok(dt) => dt,
        Err(_) => return vec![],
    };

    entries
        .iter()
        .filter(|e| {
            let ts_str = match e.created_at.as_deref() {
                Some(s) => s,
                None => return false,
            };
            if let Ok(ts) = ts_str.parse::<DateTime<Utc>>() {
                ts >= start_dt && ts <= end_dt
            } else {
                false
            }
        })
        .collect()
}

/// Parse a human-readable period label into (start_rfc3339, end_rfc3339).
///
/// Supported: `"last_week"`, `"last_month"`, `"last_quarter"`, `"last_year"`.
/// Returns `None` for unrecognised labels.
pub fn parse_period_label(label: &str) -> Option<(String, String)> {
    let now = Utc::now();
    let (start, end) = match label {
        "last_week" => {
            let s = now - chrono::Duration::days(7);
            (s, now)
        }
        "last_month" => {
            let s = now - chrono::Duration::days(30);
            (s, now)
        }
        "last_quarter" => {
            let s = now - chrono::Duration::days(91);
            (s, now)
        }
        "last_year" => {
            let s = now - chrono::Duration::days(365);
            (s, now)
        }
        _ => return None,
    };
    Some((start.to_rfc3339(), end.to_rfc3339()))
}

// â”€â”€ Tests â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

#[cfg(test)]
mod tests {
    use super::*;

    fn entry(id: &str, created_at: &str) -> AfpLedgerEntry {
        AfpLedgerEntry {
            entry_id: id.to_string(),
            created_at: if created_at.is_empty() {
                None
            } else {
                Some(created_at.to_string())
            },
            ..Default::default()
        }
    }

    #[test]
    fn hash_entries_is_deterministic() {
        let entries = vec![
            entry("e1", "2026-01-01T00:00:00Z"),
            entry("e2", "2026-01-02T00:00:00Z"),
        ];
        let h1 = hash_entries(&entries);
        let entries2 = vec![
            entry("e2", "2026-01-02T00:00:00Z"),
            entry("e1", "2026-01-01T00:00:00Z"),
        ];
        let h2 = hash_entries(&entries2);
        assert_eq!(h1, h2, "hash should be order-independent");
    }

    #[test]
    fn query_ledger_range_filters_correctly() {
        let entries = vec![
            entry("e1", "2026-01-15T00:00:00Z"),
            entry("e2", "2026-03-01T00:00:00Z"),
            entry("e3", "2026-06-01T00:00:00Z"),
        ];
        let hits = query_ledger_range(&entries, "2026-01-01T00:00:00Z", "2026-04-01T00:00:00Z");
        assert_eq!(hits.len(), 2);
        assert!(hits.iter().any(|e| e.entry_id == "e1"));
        assert!(hits.iter().any(|e| e.entry_id == "e2"));
    }

    #[test]
    fn query_ledger_range_invalid_bounds_returns_empty() {
        let entries = vec![entry("e1", "2026-01-01T00:00:00Z")];
        assert!(query_ledger_range(&entries, "not-a-date", "2026-12-31T00:00:00Z").is_empty());
    }

    #[test]
    fn compute_delta_identifies_additions_and_removals() {
        let before = vec![entry("e1", ""), entry("e2", "")];
        let after = vec![entry("e2", ""), entry("e3", "")];
        let delta = compute_delta("led_01", "snap_a", "snap_b", "", "", &before, &after);
        assert!(delta.added_entry_ids.contains(&"e3".to_string()));
        assert!(delta.removed_entry_ids.contains(&"e1".to_string()));
        assert_eq!(delta.net_change, 0);
    }

    #[test]
    fn parse_period_label_last_quarter() {
        let result = parse_period_label("last_quarter");
        assert!(result.is_some());
        let (start, end) = result.unwrap();
        assert!(start < end);
    }

    #[test]
    fn parse_period_label_unknown_returns_none() {
        assert!(parse_period_label("last_decade").is_none());
    }

    #[test]
    fn build_snapshot_afp_has_correct_type() {
        let entries = vec![entry("e1", "2026-01-01T00:00:00Z")];
        let afp = build_snapshot("user_01", "thread_01", "led_01", "project", &entries);
        assert_eq!(afp["type"].as_str(), Some(AFP_TYPE_LEDGER_SNAPSHOT));
        assert_eq!(
            afp["subtype"].as_str(),
            Some(AFP_SUBTYPE_LEDGER_SNAPSHOT_POINT_IN_TIME)
        );
        assert!(afp["content"]["entry_count"].as_u64().is_some());
    }
}
