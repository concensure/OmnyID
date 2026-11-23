/*
 * @module-id: rust.brain-doctor
 * @primary-capability: rust.source-module
 * @locs-version: 2.0
 * @stability: active
 * @owner: omnyid
 */

/// Brain Doctor â€” periodic ledger audit and self-healing.
///
/// The Brain Doctor scans a ledger's entries looking for:
///   - Contradictions: entries with conflicting labels or statuses
///   - Orphans: entries that reference IDs not present in the ledger
///   - Stale entries: entries not updated in N days with "open" status
///   - Duplicates: entries whose labels are too similar (Levenshtein-like)
///   - Low quality: entries with very short or empty labels
///
/// For each finding it proposes a concrete fix action (merge, archive, retag,
/// delete) that the user or Master Agent can approve.  No changes are made
/// automatically â€” all fixes are proposed as AFP messages.
use chrono::{DateTime, Utc};
use serde_json::{Value, json};
use ulid::Ulid;

use crate::message::{
    AFP_SUBTYPE_BRAIN_DOCTOR_AUDIT, AFP_SUBTYPE_BRAIN_DOCTOR_FINDING,
    AFP_SUBTYPE_BRAIN_DOCTOR_FIX_APPLIED, AFP_SUBTYPE_BRAIN_DOCTOR_FIX_PROPOSAL,
    AFP_TYPE_BRAIN_DOCTOR, AfpAuditFinding, AfpBrainDoctorAuditContent,
    AfpBrainDoctorFindingContent, AfpBrainDoctorFixAppliedContent,
    AfpBrainDoctorFixProposalContent, AfpFixProposal, AfpLedgerEntry,
    BRAIN_DOCTOR_SEVERITY_CRITICAL, BRAIN_DOCTOR_SEVERITY_INFO, BRAIN_DOCTOR_SEVERITY_WARNING,
};

// â”€â”€ Audit configuration â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/// Entries open for more than this many days are considered stale.
pub const STALE_THRESHOLD_DAYS: i64 = 30;

/// Labels shorter than this are considered low quality.
pub const MIN_LABEL_LENGTH: usize = 4;

/// Similarity ratio above which two entries are considered potential duplicates.
/// Uses a simple normalised edit-distance approximation.
pub const DUPLICATE_SIMILARITY_THRESHOLD: f64 = 0.85;

// â”€â”€ Public API â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/// Run a full audit of the given ledger entries.
/// Returns an `AfpBrainDoctorAuditContent` â€” no AFP messages yet, just the findings.
pub fn audit_ledger(
    ledger_message_id: &str,
    entries: &[AfpLedgerEntry],
) -> AfpBrainDoctorAuditContent {
    let audit_id = Ulid::new().to_string();
    let audited_at = Utc::now().to_rfc3339();
    let mut findings: Vec<AfpAuditFinding> = Vec::new();

    // 1. Low-quality entries.
    for entry in entries {
        if should_skip_low_quality(entry) {
            continue;
        }
        if entry.label.trim().chars().count() < MIN_LABEL_LENGTH {
            findings.push(AfpAuditFinding {
                finding_id: Ulid::new().to_string(),
                kind: "low_quality".to_string(),
                description: format!(
                    "Entry '{}' has a very short label ('{}').",
                    entry.entry_id, entry.label
                ),
                affected_entry_ids: vec![entry.entry_id.clone()],
                severity: BRAIN_DOCTOR_SEVERITY_INFO.to_string(),
                suggested_fix: Some(
                    "Expand label with more descriptive text, or archive if irrelevant."
                        .to_string(),
                ),
                ..Default::default()
            });
        }
    }

    // Collect entry IDs flagged for low quality so the stale check can skip them:
    // an entry that is already queued for a retag proposal does not need a separate
    // archive proposal for staleness â€” the retag action addresses the root issue first.
    let low_quality_entry_ids: std::collections::HashSet<String> = findings
        .iter()
        .filter(|f| f.kind == "low_quality")
        .flat_map(|f| f.affected_entry_ids.iter().cloned())
        .collect();

    // 2. Stale open entries.
    let now = Utc::now();
    for entry in entries {
        if entry.status != "open" {
            continue;
        }
        if low_quality_entry_ids.contains(&entry.entry_id) {
            continue;
        }
        if let Some(created_str) = &entry.created_at {
            if let Ok(created) = created_str.parse::<DateTime<Utc>>() {
                if should_skip_stale(entry, now, created) {
                    continue;
                }
                let age_days = (now - created).num_days();
                if age_days > STALE_THRESHOLD_DAYS {
                    findings.push(AfpAuditFinding {
                        finding_id: Ulid::new().to_string(),
                        kind: "stale".to_string(),
                        description: format!(
                            "Entry '{}' has been open for {} days.",
                            entry.entry_id, age_days
                        ),
                        affected_entry_ids: vec![entry.entry_id.clone()],
                        severity: BRAIN_DOCTOR_SEVERITY_WARNING.to_string(),
                        suggested_fix: Some(
                            "Archive this entry or update its status if still relevant."
                                .to_string(),
                        ),
                        ..Default::default()
                    });
                }
            }
        }
    }

    // 3. Duplicate detection (normalised edit distance approximation).
    // Skip entries whose status indicates they are already closed â€” proposing merge/archive
    // actions on archived or resolved entries produces no useful outcome.
    let mut duplicate_entry_ids: std::collections::HashSet<String> =
        std::collections::HashSet::new();
    for i in 0..entries.len() {
        if matches!(
            entries[i].status.as_str(),
            "archived" | "resolved" | "cancelled"
        ) {
            continue;
        }
        for j in (i + 1)..entries.len() {
            if matches!(
                entries[j].status.as_str(),
                "archived" | "resolved" | "cancelled"
            ) {
                continue;
            }
            let a = entries[i].label.trim().to_lowercase();
            let b = entries[j].label.trim().to_lowercase();
            if a.is_empty() || b.is_empty() {
                continue;
            }
            // Skip if both are already known duplicates of something else â€” avoid redundant findings.
            if duplicate_entry_ids.contains(&entries[i].entry_id)
                && duplicate_entry_ids.contains(&entries[j].entry_id)
            {
                continue;
            }
            let sim = similarity_score(&a, &b);
            if sim >= DUPLICATE_SIMILARITY_THRESHOLD {
                duplicate_entry_ids.insert(entries[i].entry_id.clone());
                duplicate_entry_ids.insert(entries[j].entry_id.clone());
                findings.push(AfpAuditFinding {
                    finding_id: Ulid::new().to_string(),
                    kind: "duplicate".to_string(),
                    description: format!(
                        "Entries '{}' and '{}' have very similar labels ({:.0}% similar).",
                        entries[i].entry_id,
                        entries[j].entry_id,
                        sim * 100.0
                    ),
                    affected_entry_ids: vec![
                        entries[i].entry_id.clone(),
                        entries[j].entry_id.clone(),
                    ],
                    severity: BRAIN_DOCTOR_SEVERITY_WARNING.to_string(),
                    suggested_fix: Some(
                        "Merge these entries or differentiate their labels.".to_string(),
                    ),
                    ..Default::default()
                });
            }
        }
    }

    // 4. Contradictions: entries with identical labels but different statuses.
    {
        use std::collections::HashMap;
        let mut label_status: HashMap<String, Vec<(String, String)>> = HashMap::new();
        for e in entries {
            label_status
                .entry(e.label.trim().to_lowercase())
                .or_default()
                .push((e.entry_id.clone(), e.status.clone()));
        }
        for (label, entries_for_label) in &label_status {
            let statuses: std::collections::HashSet<&str> =
                entries_for_label.iter().map(|(_, s)| s.as_str()).collect();
            if statuses.len() > 1 {
                findings.push(AfpAuditFinding {
                    finding_id: Ulid::new().to_string(),
                    kind: "contradiction".to_string(),
                    description: format!(
                        "Multiple entries with label '{}' have conflicting statuses: {}.",
                        label,
                        entries_for_label
                            .iter()
                            .map(|(id, s)| format!("{id}={s}"))
                            .collect::<Vec<_>>()
                            .join(", ")
                    ),
                    affected_entry_ids: entries_for_label
                        .iter()
                        .map(|(id, _)| id.clone())
                        .collect(),
                    severity: BRAIN_DOCTOR_SEVERITY_CRITICAL.to_string(),
                    suggested_fix: Some(
                        "Resolve conflicting statuses by archiving or merging.".to_string(),
                    ),
                    ..Default::default()
                });
            }
        }
    }

    // Health score: 1.0 - per-entry penalty, capped per entry so that heavily-broken
    // ledgers still show meaningful differentiation (rather than all collapsing to 0.0).
    const PER_ENTRY_PENALTY_CAP: f64 = 0.05;
    let mut entry_penalty_acc: std::collections::HashMap<&str, f64> =
        std::collections::HashMap::new();
    for finding in &findings {
        let per_finding = match finding.severity.as_str() {
            "critical" => 0.15,
            "warning" => 0.05,
            _ => 0.01,
        };
        for entry_id in &finding.affected_entry_ids {
            let acc = entry_penalty_acc.entry(entry_id.as_str()).or_insert(0.0);
            *acc = (*acc + per_finding).min(PER_ENTRY_PENALTY_CAP);
        }
    }
    let penalty: f64 = entry_penalty_acc.values().sum();
    let health_score = (1.0 - penalty).max(0.0);

    AfpBrainDoctorAuditContent {
        audit_id,
        audited_at,
        ledger_message_id: ledger_message_id.to_string(),
        entries_scanned: entries.len() as u32,
        findings,
        health_score,
        ..Default::default()
    }
}

/// Generate fix proposals from an audit result.
pub fn propose_fixes(audit: &AfpBrainDoctorAuditContent) -> AfpBrainDoctorFixProposalContent {
    let proposals: Vec<AfpFixProposal> = audit
        .findings
        .iter()
        .map(|f| {
            let (action, details, requires_approval) = match f.kind.as_str() {
                "stale" => ("archive", json!({ "reason": "stale_open_entry" }), false),
                "duplicate" => (
                    "merge",
                    json!({ "keep": f.affected_entry_ids.first() }),
                    true,
                ),
                "low_quality" => (
                    "retag",
                    json!({ "prompt": "Please provide a better label." }),
                    true,
                ),
                "contradiction" => (
                    "archive",
                    json!({ "keep": f.affected_entry_ids.first() }),
                    true,
                ),
                _ => ("archive", json!({}), true),
            };
            AfpFixProposal {
                finding_id: f.finding_id.clone(),
                action: action.to_string(),
                details,
                requires_approval,
                ..Default::default()
            }
        })
        .collect();

    AfpBrainDoctorFixProposalContent {
        audit_id: audit.audit_id.clone(),
        proposals,
        ..Default::default()
    }
}

// â”€â”€ AFP builders â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/// Build a `brain_doctor:audit` AFP message.
pub fn build_audit_afp(
    owner_user_id: &str,
    thread_id: &str,
    audit: &AfpBrainDoctorAuditContent,
) -> Value {
    json!({
        "protocol": "afp-v1",
        "id": Ulid::new().to_string(),
        "thread_id": thread_id,
        "from": "brain_doctor",
        "to": [owner_user_id],
        "timestamp": Utc::now().to_rfc3339(),
        "type": AFP_TYPE_BRAIN_DOCTOR,
        "subtype": AFP_SUBTYPE_BRAIN_DOCTOR_AUDIT,
        "content": serde_json::to_value(audit).unwrap_or(Value::Null),
        "metadata": { "store": true, "brain_doctor": true },
        "store_in_relational": true,
    })
}

/// Build an incremental `brain_doctor:finding` AFP message from one audit finding.
pub fn build_finding_afp(
    owner_user_id: &str,
    thread_id: &str,
    audit: &AfpBrainDoctorAuditContent,
    finding: &AfpAuditFinding,
) -> Value {
    let content = AfpBrainDoctorFindingContent {
        audit_id: audit.audit_id.clone(),
        ledger_message_id: audit.ledger_message_id.clone(),
        finding: finding.clone(),
        entries_scanned: audit.entries_scanned,
        health_score: audit.health_score,
        emitted_at: Utc::now().to_rfc3339(),
    };
    json!({
        "protocol": "afp-v1",
        "id": Ulid::new().to_string(),
        "thread_id": thread_id,
        "from": "brain_doctor",
        "to": [owner_user_id],
        "timestamp": Utc::now().to_rfc3339(),
        "type": AFP_TYPE_BRAIN_DOCTOR,
        "subtype": AFP_SUBTYPE_BRAIN_DOCTOR_FINDING,
        "content": serde_json::to_value(&content).unwrap_or(Value::Null),
        "metadata": {
            "store": true,
            "brain_doctor": true,
            "coordination_event": true,
            "searchable_metadata": {
                "audit_id": audit.audit_id,
                "ledger_message_id": audit.ledger_message_id,
                "finding_id": finding.finding_id,
                "finding_kind": finding.kind,
                "finding_severity": finding.severity,
                "affected_entry_ids": finding.affected_entry_ids,
            }
        },
        "store_in_relational": true,
    })
}

/// Build one incremental `brain_doctor:finding` AFP per audit finding.
pub fn build_finding_afps(
    owner_user_id: &str,
    thread_id: &str,
    audit: &AfpBrainDoctorAuditContent,
) -> Vec<Value> {
    audit
        .findings
        .iter()
        .map(|finding| build_finding_afp(owner_user_id, thread_id, audit, finding))
        .collect()
}

fn should_skip_low_quality(entry: &AfpLedgerEntry) -> bool {
    entry
        .metadata
        .as_ref()
        .and_then(|metadata| metadata.get("content_source"))
        .and_then(Value::as_str)
        == Some("metadata_only")
}

fn should_skip_stale(entry: &AfpLedgerEntry, now: DateTime<Utc>, created: DateTime<Utc>) -> bool {
    if entry.authored_by.as_deref() != Some("ledger_ingestion_agent") {
        return false;
    }

    let ingested_at = entry
        .metadata
        .as_ref()
        .and_then(|metadata| metadata.get("ingested_at"))
        .and_then(Value::as_str)
        .and_then(|value| value.parse::<DateTime<Utc>>().ok())
        .unwrap_or(created);

    (now - ingested_at).num_days() < (STALE_THRESHOLD_DAYS * 2)
}

/// Build a `brain_doctor:fix_proposal` AFP message.
pub fn build_fix_proposal_afp(
    owner_user_id: &str,
    thread_id: &str,
    proposals: &AfpBrainDoctorFixProposalContent,
) -> Value {
    json!({
        "protocol": "afp-v1",
        "id": Ulid::new().to_string(),
        "thread_id": thread_id,
        "from": "brain_doctor",
        "to": [owner_user_id],
        "timestamp": Utc::now().to_rfc3339(),
        "type": AFP_TYPE_BRAIN_DOCTOR,
        "subtype": AFP_SUBTYPE_BRAIN_DOCTOR_FIX_PROPOSAL,
        "content": serde_json::to_value(proposals).unwrap_or(Value::Null),
        "metadata": { "store": true, "brain_doctor": true, "requires_approval": true },
        "store_in_relational": true,
    })
}

/// Build a `brain_doctor:fix_applied` AFP message.
pub fn build_fix_applied_afp(
    owner_user_id: &str,
    thread_id: &str,
    audit_id: &str,
    applied_finding_ids: Vec<String>,
    skipped_finding_ids: Vec<String>,
) -> Value {
    let content = AfpBrainDoctorFixAppliedContent {
        audit_id: audit_id.to_string(),
        applied_finding_ids,
        skipped_finding_ids,
        applied_at: Utc::now().to_rfc3339(),
        ..Default::default()
    };
    json!({
        "protocol": "afp-v1",
        "id": Ulid::new().to_string(),
        "thread_id": thread_id,
        "from": "brain_doctor",
        "to": [owner_user_id],
        "timestamp": Utc::now().to_rfc3339(),
        "type": AFP_TYPE_BRAIN_DOCTOR,
        "subtype": AFP_SUBTYPE_BRAIN_DOCTOR_FIX_APPLIED,
        "content": serde_json::to_value(&content).unwrap_or(Value::Null),
        "metadata": { "store": true, "brain_doctor": true },
        "store_in_relational": true,
    })
}

// â”€â”€ Similarity helper â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/// Approximate normalised string similarity in [0.0, 1.0].
/// Uses longest-common-subsequence length as a proxy for similarity.
fn similarity_score(a: &str, b: &str) -> f64 {
    if a == b {
        return 1.0;
    }
    let len_a = a.chars().count();
    let len_b = b.chars().count();
    if len_a == 0 || len_b == 0 {
        return 0.0;
    }
    let lcs = lcs_length(a, b);
    // The LCS invariant guarantees (2*lcs) â‰¤ (len_a+len_b), so this is â‰¤ 1.0.
    // The explicit min(1.0) defends against hypothetical floating-point edge cases.
    ((2 * lcs) as f64 / (len_a + len_b) as f64).min(1.0_f64)
}

/// Compute the length of the longest common subsequence of two strings.
fn lcs_length(a: &str, b: &str) -> usize {
    let ac: Vec<char> = a.chars().collect();
    let bc: Vec<char> = b.chars().collect();
    let m = ac.len();
    let n = bc.len();
    // Limit to 80Ã—80 to stay O(1) bounded for typical labels.
    let m = m.min(80);
    let n = n.min(80);
    let mut dp = vec![vec![0usize; n + 1]; m + 1];
    for i in 1..=m {
        for j in 1..=n {
            dp[i][j] = if ac[i - 1] == bc[j - 1] {
                dp[i - 1][j - 1] + 1
            } else {
                dp[i - 1][j].max(dp[i][j - 1])
            };
        }
    }
    dp[m][n]
}

// â”€â”€ Tests â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

#[cfg(test)]
mod tests {
    use super::*;

    fn entry(id: &str, label: &str, status: &str, created_at: Option<&str>) -> AfpLedgerEntry {
        AfpLedgerEntry {
            entry_id: id.to_string(),
            label: label.to_string(),
            status: status.to_string(),
            created_at: created_at.map(str::to_string),
            ..Default::default()
        }
    }

    fn ingestion_entry(
        id: &str,
        label: &str,
        status: &str,
        created_at: &str,
        ingested_at: &str,
        content_source: &str,
    ) -> AfpLedgerEntry {
        AfpLedgerEntry {
            entry_id: id.to_string(),
            label: label.to_string(),
            status: status.to_string(),
            authored_by: Some("ledger_ingestion_agent".to_string()),
            created_at: Some(created_at.to_string()),
            metadata: Some(json!({
                "ingested_at": ingested_at,
                "ingestion_pass_id": "01JTESTPASS",
                "content_source": content_source,
                "entity_count": 2
            })),
        }
    }

    #[test]
    fn detects_low_quality_entry() {
        let entries = vec![entry("e1", "ok", "open", None)]; // label "ok" < 4 chars
        let audit = audit_ledger("led_01", &entries);
        assert!(audit.findings.iter().any(|f| f.kind == "low_quality"));
    }

    #[test]
    fn detects_stale_entry() {
        let old_date = (Utc::now() - chrono::Duration::days(40)).to_rfc3339();
        let entries = vec![entry("e1", "Deploy the fix", "open", Some(&old_date))];
        let audit = audit_ledger("led_01", &entries);
        assert!(
            audit.findings.iter().any(|f| f.kind == "stale"),
            "expected stale finding"
        );
    }

    #[test]
    fn recent_entry_not_stale() {
        let recent = Utc::now().to_rfc3339();
        let entries = vec![entry("e1", "Deploy the fix", "open", Some(&recent))];
        let audit = audit_ledger("led_01", &entries);
        assert!(!audit.findings.iter().any(|f| f.kind == "stale"));
    }

    #[test]
    fn fresh_ingestion_entry_is_not_marked_stale() {
        let created_at = (Utc::now() - chrono::Duration::days(50)).to_rfc3339();
        let ingested_at = (Utc::now() - chrono::Duration::days(5)).to_rfc3339();
        let entries = vec![ingestion_entry(
            "e1",
            "Deploy the fix",
            "open",
            &created_at,
            &ingested_at,
            "content_preview",
        )];
        let audit = audit_ledger("led_01", &entries);
        assert!(
            !audit.findings.iter().any(|f| f.kind == "stale"),
            "fresh ingestion-derived entries should not be marked stale yet"
        );
    }

    #[test]
    fn metadata_only_ingestion_entry_is_not_marked_low_quality() {
        let now = Utc::now().to_rfc3339();
        let entries = vec![ingestion_entry(
            "e1",
            "ok",
            "open",
            &now,
            &now,
            "metadata_only",
        )];
        let audit = audit_ledger("led_01", &entries);
        assert!(
            !audit.findings.iter().any(|f| f.kind == "low_quality"),
            "metadata_only ingestion entries should be tagged for enrichment, not low-quality"
        );
    }

    #[test]
    fn detects_duplicate_labels() {
        let entries = vec![
            entry("e1", "Deploy production fix", "open", None),
            entry("e2", "Deploy production fix", "open", None),
        ];
        let audit = audit_ledger("led_01", &entries);
        assert!(
            audit
                .findings
                .iter()
                .any(|f| f.kind == "duplicate" || f.kind == "contradiction")
        );
    }

    #[test]
    fn detects_contradiction() {
        let entries = vec![
            entry("e1", "Launch feature", "open", None),
            entry("e2", "Launch feature", "resolved", None),
        ];
        let audit = audit_ledger("led_01", &entries);
        assert!(audit.findings.iter().any(|f| f.kind == "contradiction"));
    }

    #[test]
    fn health_score_is_1_for_clean_ledger() {
        let entries = vec![
            entry(
                "e1",
                "Deploy the authentication fix",
                "resolved",
                Some("2026-05-01T00:00:00Z"),
            ),
            entry(
                "e2",
                "Update documentation for API",
                "resolved",
                Some("2026-05-02T00:00:00Z"),
            ),
        ];
        let audit = audit_ledger("led_01", &entries);
        assert_eq!(audit.health_score, 1.0);
    }

    #[test]
    fn propose_fixes_covers_all_findings() {
        let old_date = (Utc::now() - chrono::Duration::days(40)).to_rfc3339();
        let entries = vec![entry("e1", "Deploy the fix", "open", Some(&old_date))];
        let audit = audit_ledger("led_01", &entries);
        let proposals = propose_fixes(&audit);
        assert_eq!(proposals.proposals.len(), audit.findings.len());
    }

    #[test]
    fn build_audit_afp_has_correct_type() {
        let audit = audit_ledger("led_01", &[]);
        let afp = build_audit_afp("user_01", "thread_01", &audit);
        assert_eq!(afp["type"].as_str(), Some(AFP_TYPE_BRAIN_DOCTOR));
        assert_eq!(
            afp["subtype"].as_str(),
            Some(AFP_SUBTYPE_BRAIN_DOCTOR_AUDIT)
        );
    }

    #[test]
    fn build_finding_afp_has_incremental_coordination_metadata() {
        let old_date = (Utc::now() - chrono::Duration::days(40)).to_rfc3339();
        let audit = audit_ledger(
            "led_01",
            &[entry("e1", "Deploy the fix", "open", Some(&old_date))],
        );
        let finding = audit
            .findings
            .iter()
            .find(|finding| finding.kind == "stale")
            .expect("stale finding should exist");

        let afp = build_finding_afp("user_01", "thread_01", &audit, finding);

        assert_eq!(afp["type"].as_str(), Some(AFP_TYPE_BRAIN_DOCTOR));
        assert_eq!(
            afp["subtype"].as_str(),
            Some(AFP_SUBTYPE_BRAIN_DOCTOR_FINDING)
        );
        assert_eq!(afp["metadata"]["coordination_event"].as_bool(), Some(true));
        assert_eq!(
            afp["metadata"]["searchable_metadata"]["finding_kind"].as_str(),
            Some("stale")
        );
        assert_eq!(
            afp["content"]["finding"]["finding_id"].as_str(),
            Some(finding.finding_id.as_str())
        );
    }

    #[test]
    fn build_finding_afps_emits_one_message_per_finding() {
        let old_date = (Utc::now() - chrono::Duration::days(40)).to_rfc3339();
        let audit = audit_ledger(
            "led_01",
            &[
                entry("e1", "ok", "open", Some(&old_date)),
                entry("e2", "Deploy the fix", "open", Some(&old_date)),
            ],
        );

        let afps = build_finding_afps("user_01", "thread_01", &audit);

        assert_eq!(afps.len(), audit.findings.len());
        assert!(
            afps.iter()
                .all(|afp| { afp["subtype"].as_str() == Some(AFP_SUBTYPE_BRAIN_DOCTOR_FINDING) })
        );
    }

    #[test]
    fn similarity_score_identical_strings() {
        assert!((similarity_score("hello", "hello") - 1.0).abs() < f64::EPSILON);
    }

    #[test]
    fn similarity_score_different_strings() {
        let score = similarity_score("abc", "xyz");
        assert!(score < 0.5);
    }
}
