/*
 * @module-id: rust.ledger-export
 * @primary-capability: rust.source-module
 * @locs-version: 2.0
 * @stability: active
 * @owner: omnyid
 */

/// Ledger Export â€” human-readable "human vault" export from tiered ledgers.
///
/// Produces a structured Markdown document from a tiered ledger's entries,
/// compressed summaries, and tier metadata. Intended for:
///   - User-facing memory review ("show me everything I've stored")
///   - Backup exports the user can read without tooling
///   - GPG-encrypted ZIP bundles for long-term archival
///
/// Does NOT export encrypted content â€” only plaintext fields already available
/// on `AfpLedgerEntry` (label, status, authored_by, created_at).
use chrono::Utc;
use serde_json::{Value, json};
use ulid::Ulid;

use crate::message::{
    AFP_SUBTYPE_FILE_LEDGER_EXPORT_RESULT, AFP_TYPE_FILE_LEDGER, AfpFileExportResult,
    AfpLedgerContent, AfpLedgerEntry, AfpTieredLedgerContent,
};
use crate::tiered_ledger::compress_entries;

// â”€â”€ Export format enum â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

pub enum VaultExportFormat {
    Markdown,
    /// CSV-compatible bytes (UTF-8).
    Csv,
    /// JSON Lines â€” one entry per line.
    Jsonl,
}

impl VaultExportFormat {
    pub fn extension(&self) -> &'static str {
        match self {
            Self::Markdown => "md",
            Self::Csv => "csv",
            Self::Jsonl => "jsonl",
        }
    }
}

// â”€â”€ Export result â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

pub struct VaultExportResult {
    pub bytes: Vec<u8>,
    pub format: VaultExportFormat,
    pub entry_count: u32,
}

// â”€â”€ Markdown export â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/// Export a plain `AfpLedgerContent` to human-readable Markdown.
pub fn export_ledger_markdown(
    ledger: &AfpLedgerContent,
    entries: &[AfpLedgerEntry],
) -> VaultExportResult {
    let mut md = format!("# {}\n\n", ledger.name.as_deref().unwrap_or("Ledger"));
    if let Some(desc) = &ledger.description {
        md.push_str(&format!("> {desc}\n\n"));
    }
    md.push_str(&format!("*Exported: {}*\n\n", Utc::now().to_rfc3339()));
    md.push_str("---\n\n");

    if entries.is_empty() {
        md.push_str("*No entries.*\n");
    } else {
        md.push_str("| # | Label | Status | Created | Author |\n");
        md.push_str("|---|-------|--------|---------|--------|\n");
        for (i, e) in entries.iter().enumerate() {
            let created = e.created_at.as_deref().unwrap_or("â€”");
            let author = e.authored_by.as_deref().unwrap_or("â€”");
            md.push_str(&format!(
                "| {} | {} | {} | {} | {} |\n",
                i + 1,
                e.label.replace('|', "\\|"),
                e.status,
                created,
                author,
            ));
        }
    }

    VaultExportResult {
        bytes: md.into_bytes(),
        format: VaultExportFormat::Markdown,
        entry_count: entries.len() as u32,
    }
}

/// Export a `AfpTieredLedgerContent` to Markdown with tier metadata and
/// compressed summary section.
pub fn export_tiered_ledger_markdown(
    ledger: &AfpTieredLedgerContent,
    entries: &[AfpLedgerEntry],
) -> VaultExportResult {
    let mut md = format!("# {} â€” Human Vault\n\n", ledger.name);
    md.push_str(&format!("**Tier:** `{}`\n\n", ledger.tier));
    if let Some(desc) = &ledger.description {
        md.push_str(&format!("> {desc}\n\n"));
    }
    md.push_str(&format!("*Exported: {}*\n\n", Utc::now().to_rfc3339()));
    md.push_str("---\n\n");

    // Compressed summary section.
    if !entries.is_empty() {
        let summary = compress_entries(entries);
        md.push_str("## Summary\n\n");
        md.push_str(&summary);
        md.push_str("\n\n---\n\n");
    }

    // Pointer bundle references.
    if !ledger.pointer_bundle.is_empty() {
        md.push_str("## References\n\n");
        for ptr in &ledger.pointer_bundle {
            md.push_str(&format!("- `{ptr}`\n"));
        }
        md.push_str("\n");
    }

    // Full entry table.
    md.push_str("## Entries\n\n");
    if entries.is_empty() {
        md.push_str("*No entries.*\n");
    } else {
        md.push_str("| # | Label | Status | Created | Author |\n");
        md.push_str("|---|-------|--------|---------|--------|\n");
        for (i, e) in entries.iter().enumerate() {
            let created = e.created_at.as_deref().unwrap_or("â€”");
            let author = e.authored_by.as_deref().unwrap_or("â€”");
            md.push_str(&format!(
                "| {} | {} | {} | {} | {} |\n",
                i + 1,
                e.label.replace('|', "\\|"),
                e.status,
                created,
                author,
            ));
        }
    }

    VaultExportResult {
        bytes: md.into_bytes(),
        format: VaultExportFormat::Markdown,
        entry_count: entries.len() as u32,
    }
}

// â”€â”€ CSV export â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/// Export entries to CSV bytes.
pub fn export_ledger_csv(ledger_name: &str, entries: &[AfpLedgerEntry]) -> VaultExportResult {
    let mut csv = format!("# {ledger_name}\r\nentry_id,label,status,created_at,authored_by\r\n");
    for e in entries {
        csv.push_str(&format!(
            "{},{},{},{},{}\r\n",
            e.entry_id,
            e.label.replace(',', ";"),
            e.status,
            e.created_at.as_deref().unwrap_or(""),
            e.authored_by.as_deref().unwrap_or(""),
        ));
    }
    VaultExportResult {
        bytes: csv.into_bytes(),
        format: VaultExportFormat::Csv,
        entry_count: entries.len() as u32,
    }
}

// â”€â”€ JSONL export â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/// Export entries as JSON Lines (one JSON object per line).
pub fn export_ledger_jsonl(entries: &[AfpLedgerEntry]) -> VaultExportResult {
    let lines: String = entries
        .iter()
        .filter_map(|e| serde_json::to_string(e).ok())
        .map(|s| format!("{s}\n"))
        .collect();
    VaultExportResult {
        bytes: lines.into_bytes(),
        format: VaultExportFormat::Jsonl,
        entry_count: entries.len() as u32,
    }
}

// â”€â”€ AFP result builder â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/// Build a `file_ledger:export_result` AFP message from a vault export.
pub fn build_vault_export_result_afp(
    owner_user_id: &str,
    thread_id: &str,
    ledger_message_id: &str,
    result: &VaultExportResult,
) -> Value {
    let format_ext = result.format.extension();
    let download_url = format!(
        "https://files.omnyid.internal/exports/vault/{}.{}",
        Ulid::new(),
        format_ext
    );
    let export_result = AfpFileExportResult {
        ledger_message_id: ledger_message_id.to_string(),
        format: format_ext.to_string(),
        download_url,
        file_count: 1,
        export_size_bytes: result.bytes.len() as u64,
        generated_at: Utc::now().to_rfc3339(),
        ..Default::default()
    };
    json!({
        "protocol": "afp-v1",
        "id": Ulid::new().to_string(),
        "thread_id": thread_id,
        "from": "ledger_export",
        "to": [owner_user_id],
        "timestamp": Utc::now().to_rfc3339(),
        "type": AFP_TYPE_FILE_LEDGER,
        "subtype": AFP_SUBTYPE_FILE_LEDGER_EXPORT_RESULT,
        "content": serde_json::to_value(&export_result).unwrap_or(Value::Null),
        "metadata": { "store": true, "vault_export": true },
        "store_in_relational": true,
    })
}

// â”€â”€ Tests â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_entry(id: &str, label: &str) -> AfpLedgerEntry {
        AfpLedgerEntry {
            entry_id: id.to_string(),
            label: label.to_string(),
            status: "open".to_string(),
            created_at: Some("2026-05-01T10:00:00Z".to_string()),
            authored_by: Some("agent_01".to_string()),
            ..Default::default()
        }
    }

    fn sample_ledger() -> AfpLedgerContent {
        AfpLedgerContent {
            name: Some("Project Alpha".to_string()),
            description: Some("Main project ledger.".to_string()),
            ..Default::default()
        }
    }

    #[test]
    fn markdown_export_contains_entry_label() {
        let entries = vec![sample_entry("e1", "Deploy fix")];
        let result = export_ledger_markdown(&sample_ledger(), &entries);
        let md = String::from_utf8_lossy(&result.bytes);
        assert!(md.contains("Deploy fix"));
        assert!(md.contains("Project Alpha"));
        assert_eq!(result.entry_count, 1);
    }

    #[test]
    fn csv_export_has_header_and_row() {
        let entries = vec![sample_entry("e1", "Task A")];
        let result = export_ledger_csv("Test Ledger", &entries);
        let csv = String::from_utf8_lossy(&result.bytes);
        assert!(csv.contains("entry_id,label"));
        assert!(csv.contains("Task A"));
    }

    #[test]
    fn jsonl_export_is_valid_json_per_line() {
        let entries = vec![sample_entry("e1", "Task A"), sample_entry("e2", "Task B")];
        let result = export_ledger_jsonl(&entries);
        let text = String::from_utf8_lossy(&result.bytes);
        let lines: Vec<&str> = text.lines().collect();
        assert_eq!(lines.len(), 2);
        for line in lines {
            assert!(
                serde_json::from_str::<Value>(line).is_ok(),
                "each line must be valid JSON"
            );
        }
    }

    #[test]
    fn build_vault_export_afp_has_correct_type() {
        let result = VaultExportResult {
            bytes: b"# Test".to_vec(),
            format: VaultExportFormat::Markdown,
            entry_count: 0,
        };
        let afp = build_vault_export_result_afp("user_01", "thread_01", "led_01", &result);
        assert_eq!(afp["type"].as_str(), Some(AFP_TYPE_FILE_LEDGER));
        assert_eq!(
            afp["subtype"].as_str(),
            Some(AFP_SUBTYPE_FILE_LEDGER_EXPORT_RESULT)
        );
    }

    #[test]
    fn empty_ledger_markdown_says_no_entries() {
        let result = export_ledger_markdown(&sample_ledger(), &[]);
        let md = String::from_utf8_lossy(&result.bytes);
        assert!(md.contains("No entries"));
        assert_eq!(result.entry_count, 0);
    }
}
