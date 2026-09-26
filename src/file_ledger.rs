/*
 * @module-id: rust.file-ledger
 * @primary-capability: rust.source-module
 * @locs-version: 2.0
 * @stability: active
 * @owner: omnyid
 */

/// File Ledger â€” SeaweedFS-backed file tracking with metadata and export routing.
///
/// Manages an append-only log of file references (`AfpFileLedgerEntry`) and
/// routes export requests to the appropriate format handler:
///   pdf      â†’ returns error ("not yet available"); wire to a PDF service when ready
///   xlsx     â†’ real XLSX via `rust_xlsxwriter` (bold headers, autofit columns)
///   markdown â†’ plain Markdown table
///   zip      â†’ archive manifest (download URLs bundled)
///
/// Does NOT store file bytes here â€” that is SeaweedFS's job.
/// This module only manages the AFP ledger index and export manifests.
use chrono::Utc;
use rust_xlsxwriter::{Format, Workbook, XlsxError};
use serde_json::{Value, json};
use ulid::Ulid;

use crate::message::{
    AFP_SUBTYPE_FILE_LEDGER_CREATE, AFP_SUBTYPE_FILE_LEDGER_EXPORT_RESULT,
    AFP_SUBTYPE_FILE_LEDGER_UPDATE, AFP_TYPE_FILE_LEDGER, AfpFileExportRequest,
    AfpFileExportResult, AfpFileLedgerContent, AfpFileLedgerEntry, AfpFileLedgerUpdate,
};

// â”€â”€ File status constants â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

pub const FILE_STATUS_ACTIVE: &str = "active";
pub const FILE_STATUS_ARCHIVED: &str = "archived";
pub const FILE_STATUS_DELETED: &str = "deleted";

// â”€â”€ Ledger management â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/// Build a `file_ledger:create` AFP JSON message.
pub fn build_file_ledger_create_afp(
    owner_user_id: &str,
    thread_id: &str,
    ledger: &AfpFileLedgerContent,
) -> Value {
    json!({
        "protocol": "afp-v1",
        "id": Ulid::new().to_string(),
        "thread_id": thread_id,
        "from": "file_ledger_agent",
        "to": [owner_user_id],
        "timestamp": Utc::now().to_rfc3339(),
        "type": AFP_TYPE_FILE_LEDGER,
        "subtype": AFP_SUBTYPE_FILE_LEDGER_CREATE,
        "content": serde_json::to_value(ledger).unwrap_or(Value::Null),
        "metadata": { "store": true },
        "store_in_relational": true,
    })
}

/// Build a `file_ledger:update` AFP JSON message.
pub fn build_file_ledger_update_afp(
    owner_user_id: &str,
    thread_id: &str,
    update: &AfpFileLedgerUpdate,
) -> Value {
    json!({
        "protocol": "afp-v1",
        "id": Ulid::new().to_string(),
        "thread_id": thread_id,
        "from": "file_ledger_agent",
        "to": [owner_user_id],
        "timestamp": Utc::now().to_rfc3339(),
        "type": AFP_TYPE_FILE_LEDGER,
        "subtype": AFP_SUBTYPE_FILE_LEDGER_UPDATE,
        "content": serde_json::to_value(update).unwrap_or(Value::Null),
        "metadata": { "store": true },
        "store_in_relational": true,
    })
}

// â”€â”€ Ledger state reconstruction â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/// Merge an ordered series of `AfpFileLedgerUpdate` messages onto a base ledger.
/// Returns the resolved set of active entries.
pub fn merge_file_ledger(
    base: &AfpFileLedgerContent,
    updates: &[AfpFileLedgerUpdate],
) -> Vec<AfpFileLedgerEntry> {
    let mut entries: std::collections::HashMap<String, AfpFileLedgerEntry> = base
        .entries
        .iter()
        .map(|e| (e.entry_id.clone(), e.clone()))
        .collect();

    for update in updates {
        // Apply upserts.
        for entry in &update.upsert {
            entries.insert(entry.entry_id.clone(), entry.clone());
        }
        // Apply archives.
        for id in &update.archive {
            if let Some(e) = entries.get_mut(id) {
                e.status = FILE_STATUS_ARCHIVED.to_string();
            }
        }
    }

    entries.into_values().collect()
}

/// Filter to only active entries.
pub fn active_entries(entries: &[AfpFileLedgerEntry]) -> Vec<&AfpFileLedgerEntry> {
    entries
        .iter()
        .filter(|e| e.status == FILE_STATUS_ACTIVE || e.status.is_empty())
        .collect()
}

// â”€â”€ Export routing â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/// Export result produced by the format handlers below.
pub struct ExportManifest {
    /// The exported content as bytes (or URL reference for zip/pdf).
    pub content: ExportContent,
    pub file_count: u32,
    pub export_size_bytes: u64,
}

pub enum ExportContent {
    /// Inline byte payload (Markdown, XLSX).
    Bytes(Vec<u8>),
    /// External download URL already generated (PDF, ZIP via presign).
    Url(String),
}

/// Route an export request to the appropriate handler.
/// Returns an `ExportManifest` or an error string.
pub fn route_export(
    entries: &[&AfpFileLedgerEntry],
    req: &AfpFileExportRequest,
) -> Result<ExportManifest, String> {
    match req.format.as_str() {
        "markdown" => export_markdown(entries, req),
        "xlsx" => export_xlsx(entries, req),
        "pdf" => export_pdf_stub(entries, req),
        "zip" => export_zip_manifest(entries, req),
        other => Err(format!("Unsupported export format: '{other}'")),
    }
}

fn export_markdown(
    entries: &[&AfpFileLedgerEntry],
    req: &AfpFileExportRequest,
) -> Result<ExportManifest, String> {
    let title = req.title.as_deref().unwrap_or("File Ledger Export");
    let mut md = format!("# {title}\n\n");
    md.push_str("| Filename | MIME Type | Size (bytes) | Tags | Status |\n");
    md.push_str("|----------|-----------|-------------|------|--------|\n");
    for e in entries {
        md.push_str(&format!(
            "| {} | {} | {} | {} | {} |\n",
            e.filename,
            e.mime_type,
            e.size_bytes,
            e.tags.join(", "),
            e.status,
        ));
    }
    let bytes = md.into_bytes();
    let size = bytes.len() as u64;
    Ok(ExportManifest {
        content: ExportContent::Bytes(bytes),
        file_count: entries.len() as u32,
        export_size_bytes: size,
    })
}

fn export_xlsx(
    entries: &[&AfpFileLedgerEntry],
    req: &AfpFileExportRequest,
) -> Result<ExportManifest, String> {
    build_xlsx(entries, req).map_err(|e| format!("XLSX export failed: {e}"))
}

fn build_xlsx(
    entries: &[&AfpFileLedgerEntry],
    req: &AfpFileExportRequest,
) -> Result<ExportManifest, XlsxError> {
    let title = req.title.as_deref().unwrap_or("File Ledger");
    let mut workbook = Workbook::new();
    let sheet = workbook.add_worksheet();
    sheet.set_name(title)?;

    let header_fmt = Format::new().set_bold();
    let headers = ["Filename", "MIME Type", "Size (bytes)", "Tags", "Status"];
    for (col, h) in headers.iter().enumerate() {
        sheet.write_string_with_format(0, col as u16, *h, &header_fmt)?;
    }

    for (row, e) in entries.iter().enumerate() {
        let r = (row + 1) as u32;
        sheet.write_string(r, 0, &e.filename)?;
        sheet.write_string(r, 1, &e.mime_type)?;
        sheet.write_number(r, 2, e.size_bytes as f64)?;
        sheet.write_string(r, 3, &e.tags.join(", "))?;
        sheet.write_string(r, 4, &e.status)?;
    }

    // Auto-fit columns based on header widths.
    sheet.autofit();

    let bytes = workbook.save_to_buffer()?;
    let size = bytes.len() as u64;
    Ok(ExportManifest {
        content: ExportContent::Bytes(bytes),
        file_count: entries.len() as u32,
        export_size_bytes: size,
    })
}

fn export_pdf_stub(
    _entries: &[&AfpFileLedgerEntry],
    _req: &AfpFileExportRequest,
) -> Result<ExportManifest, String> {
    Err("PDF export is not yet available. Use 'xlsx' or 'markdown' format instead.".to_string())
}

fn export_zip_manifest(
    entries: &[&AfpFileLedgerEntry],
    _req: &AfpFileExportRequest,
) -> Result<ExportManifest, String> {
    // Returns a JSON manifest of FIDs for the ZIP bundler service to materialise.
    let manifest = json!({
        "fids": entries.iter().map(|e| &e.seaweed_fid).collect::<Vec<_>>(),
        "filenames": entries.iter().map(|e| &e.filename).collect::<Vec<_>>(),
    });
    let bytes = manifest.to_string().into_bytes();
    let size = bytes.len() as u64;
    Ok(ExportManifest {
        content: ExportContent::Bytes(bytes),
        file_count: entries.len() as u32,
        export_size_bytes: size,
    })
}

// â”€â”€ AFP result builder â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/// Build a `file_ledger:export_result` AFP JSON message from an `ExportManifest`.
pub fn build_export_result_afp(
    owner_user_id: &str,
    thread_id: &str,
    ledger_message_id: &str,
    format: &str,
    manifest: &ExportManifest,
) -> Value {
    let download_url = match &manifest.content {
        ExportContent::Url(url) => url.clone(),
        ExportContent::Bytes(_) => format!(
            "https://files.omnyid.internal/exports/inline/{}.{}",
            Ulid::new(),
            format
        ),
    };

    let result = AfpFileExportResult {
        ledger_message_id: ledger_message_id.to_string(),
        format: format.to_string(),
        download_url,
        file_count: manifest.file_count as i32,
        export_size_bytes: manifest.export_size_bytes,
        generated_at: Utc::now().to_rfc3339(),
        ..Default::default()
    };

    json!({
        "protocol": "afp-v1",
        "id": Ulid::new().to_string(),
        "thread_id": thread_id,
        "from": "file_ledger_agent",
        "to": [owner_user_id],
        "timestamp": Utc::now().to_rfc3339(),
        "type": AFP_TYPE_FILE_LEDGER,
        "subtype": AFP_SUBTYPE_FILE_LEDGER_EXPORT_RESULT,
        "content": serde_json::to_value(&result).unwrap_or(Value::Null),
        "metadata": { "store": true },
        "store_in_relational": true,
    })
}

// â”€â”€ Tests â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_entry(id: &str, filename: &str, status: &str) -> AfpFileLedgerEntry {
        AfpFileLedgerEntry {
            entry_id: id.to_string(),
            seaweed_fid: format!("1,{id}"),
            filename: filename.to_string(),
            mime_type: "application/pdf".to_string(),
            size_bytes: 1024,
            status: status.to_string(),
            tags: vec!["report".to_string()],
            ..Default::default()
        }
    }

    fn sample_ledger() -> AfpFileLedgerContent {
        AfpFileLedgerContent {
            name: "Test Ledger".to_string(),
            entries: vec![sample_entry("e1", "report.pdf", FILE_STATUS_ACTIVE)],
            ..Default::default()
        }
    }

    #[test]
    fn merge_file_ledger_applies_upsert() {
        let base = sample_ledger();
        let update = AfpFileLedgerUpdate {
            ledger_message_id: "led_01".into(),
            upsert: vec![sample_entry("e2", "summary.pdf", FILE_STATUS_ACTIVE)],
            archive: vec![],
        };
        let merged = merge_file_ledger(&base, &[update]);
        assert_eq!(merged.len(), 2);
    }

    #[test]
    fn merge_file_ledger_archives_entry() {
        let base = sample_ledger();
        let update = AfpFileLedgerUpdate {
            ledger_message_id: "led_01".into(),
            upsert: vec![],
            archive: vec!["e1".to_string()],
        };
        let merged = merge_file_ledger(&base, &[update]);
        let active = active_entries(&merged);
        assert!(active.is_empty());
    }

    #[test]
    fn export_markdown_produces_table() {
        let e = sample_entry("e1", "report.pdf", FILE_STATUS_ACTIVE);
        let req = AfpFileExportRequest {
            ledger_id: "led_01".into(),
            format: "markdown".into(),
            filter_status: None,
            title: Some("Test Export".into()),
        };
        let manifest = export_markdown(&[&e], &req).unwrap();
        if let ExportContent::Bytes(bytes) = &manifest.content {
            let md = String::from_utf8_lossy(bytes);
            assert!(md.contains("report.pdf"));
            assert!(md.contains("| Filename |"));
        } else {
            panic!("expected bytes");
        }
    }

    #[test]
    fn export_unsupported_format_returns_error() {
        let e = sample_entry("e1", "file.txt", FILE_STATUS_ACTIVE);
        let req = AfpFileExportRequest {
            ledger_id: "led_01".into(),
            format: "docx".into(),
            filter_status: None,
            title: None,
        };
        assert!(route_export(&[&e], &req).is_err());
    }

    #[test]
    fn build_file_ledger_create_afp_has_correct_type() {
        let ledger = sample_ledger();
        let afp = build_file_ledger_create_afp("user_01", "thread_01", &ledger);
        assert_eq!(afp["type"].as_str(), Some(AFP_TYPE_FILE_LEDGER));
        assert_eq!(
            afp["subtype"].as_str(),
            Some(AFP_SUBTYPE_FILE_LEDGER_CREATE)
        );
    }

    #[test]
    fn build_export_result_afp_has_correct_type() {
        let manifest = ExportManifest {
            content: ExportContent::Url("https://example.com/file.pdf".into()),
            file_count: 1,
            export_size_bytes: 2048,
        };
        let afp = build_export_result_afp("user_01", "thread_01", "led_01", "pdf", &manifest);
        assert_eq!(afp["type"].as_str(), Some(AFP_TYPE_FILE_LEDGER));
        assert_eq!(
            afp["subtype"].as_str(),
            Some(AFP_SUBTYPE_FILE_LEDGER_EXPORT_RESULT)
        );
    }
}
