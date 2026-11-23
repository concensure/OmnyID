//! export.rs — Portable data export in standard open formats.
//!
//! Implements R10: let users export their entire Omnyid history as:
//!   - MBOX (RFC 4155)  — all email-type AFP messages
//!   - AFP archive      — signed, gzip-compressed NDJSON of all messages
//!   - JSON-LD          — note-type AFP messages as schema.org NoteDigitalDocument
//!
//! All export functions take a slice of `ProtoMessage` values (already fetched
//! from the DB and decrypted by the caller) and return the serialized bytes.
//!
//! These are pure serialization helpers; routing and DB access live in server.rs.

use chrono::DateTime;

/// AFP message representation used for export (mirrors ProtoMessage fields).
#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct ExportMessage {
    pub id: String,
    pub thread_id: String,
    pub parent_id: String,
    pub from: String,
    pub to: Vec<String>,
    pub timestamp: String,
    pub r#type: String,
    pub content: String,
    pub prev_hash: Option<String>,
}

// ── Tabular export format ─────────────────────────────────────────────────────

#[derive(Debug, Clone, PartialEq)]
pub enum ExportFormat {
    Csv,
    Xlsx,
}

impl ExportFormat {
    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "csv" => Some(Self::Csv),
            "xlsx" => Some(Self::Xlsx),
            _ => None,
        }
    }

    pub fn extension(&self) -> &'static str {
        match self {
            Self::Csv => "csv",
            Self::Xlsx => "xlsx",
        }
    }

    pub fn mime_type(&self) -> &'static str {
        match self {
            Self::Csv => "text/csv",
            Self::Xlsx => "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        }
    }
}

/// Export tabular data (columns + rows) to the requested format.
/// Returns serialized bytes or an error description.
pub fn export_to_file(
    fmt: &ExportFormat,
    columns: &[String],
    rows: &[Vec<serde_json::Value>],
) -> Result<Vec<u8>, String> {
    match fmt {
        ExportFormat::Csv => {
            let mut out = String::new();
            out.push_str(&columns.join(","));
            out.push('\n');
            for row in rows {
                let cells: Vec<String> = row
                    .iter()
                    .map(|v| match v {
                        serde_json::Value::String(s) => {
                            format!("\"{}\"", s.replace('"', "\"\""))
                        }
                        serde_json::Value::Null => String::new(),
                        other => other.to_string(),
                    })
                    .collect();
                out.push_str(&cells.join(","));
                out.push('\n');
            }
            Ok(out.into_bytes())
        }
        ExportFormat::Xlsx => {
            use rust_xlsxwriter::Workbook;
            let mut wb = Workbook::new();
            let ws = wb.add_worksheet();
            for (col_idx, col_name) in columns.iter().enumerate() {
                ws.write(0, col_idx as u16, col_name.as_str())
                    .map_err(|e| e.to_string())?;
            }
            for (row_idx, row) in rows.iter().enumerate() {
                for (col_idx, cell) in row.iter().enumerate() {
                    let text = match cell {
                        serde_json::Value::String(s) => s.clone(),
                        serde_json::Value::Null => String::new(),
                        other => other.to_string(),
                    };
                    ws.write(row_idx as u32 + 1, col_idx as u16, text.as_str())
                        .map_err(|e| e.to_string())?;
                }
            }
            wb.save_to_buffer().map_err(|e| e.to_string())
        }
    }
}

// ── MBOX export (RFC 4155) ────────────────────────────────────────────────────

/// Convert an email-type AFP message into an RFC 4155 MBOX record.
///
/// MBOX format:
///   From <sender> <date>\r\n
///   From: <sender>\r\n
///   To: <recipients>\r\n
///   Date: <RFC 2822 date>\r\n
///   Message-ID: <id>\r\n
///   Subject: AFP/<type>\r\n
///   \r\n
///   <body>\r\n
///   \r\n
fn message_to_mbox_record(msg: &ExportMessage) -> String {
    // Convert ISO 8601 timestamp to RFC 2822 for email Date header
    let rfc2822_date = DateTime::parse_from_rfc3339(&msg.timestamp)
        .map(|dt| dt.format("%a, %d %b %Y %H:%M:%S %z").to_string())
        .unwrap_or_else(|_| msg.timestamp.clone());

    // Escape "From " at start of body lines (MBOX requirement)
    let body = msg.content.replace("\nFrom ", "\n>From ");

    let to_header = if msg.to.is_empty() {
        "undisclosed-recipients:;".to_string()
    } else {
        msg.to.join(", ")
    };

    format!(
        "From {sender} {date}\r\nFrom: {sender}\r\nTo: {to}\r\nDate: {date}\r\nMessage-ID: <{id}@omnyid>\r\nSubject: AFP/{msg_type}\r\n\r\n{body}\r\n\r\n",
        sender = msg.from,
        date = rfc2822_date,
        to = to_header,
        id = msg.id,
        msg_type = msg.r#type,
        body = body,
    )
}

/// Build a complete RFC 4155 MBOX file from a slice of AFP messages.
///
/// Only messages whose `type` starts with `email.` are included.
/// Returns the raw bytes of the MBOX file.
pub fn build_mbox(messages: &[ExportMessage]) -> Vec<u8> {
    let mut out = String::new();
    for msg in messages {
        if msg.r#type.starts_with("email.") || msg.r#type == "email" {
            out.push_str(&message_to_mbox_record(msg));
        }
    }
    out.into_bytes()
}

// ── AFP archive (NDJSON) ──────────────────────────────────────────────────────

/// Build a gzip-compressed NDJSON AFP archive of all messages.
///
/// Each line is a JSON object containing all fields of an ExportMessage.
/// The archive is signed by including the SHA-256 of the concatenated JSON
/// as the last line: `{"archive_hash":"<hex>"}`.
///
/// Returns the gzipped bytes.
pub fn build_afp_archive(messages: &[ExportMessage]) -> Vec<u8> {
    use flate2::Compression;
    use flate2::write::GzEncoder;
    use sha2::{Digest, Sha256};
    use std::io::Write;

    let mut ndjson = String::new();
    for msg in messages {
        if let Ok(line) = serde_json::to_string(msg) {
            ndjson.push_str(&line);
            ndjson.push('\n');
        }
    }

    // Compute archive integrity hash
    let hash = hex::encode(Sha256::digest(ndjson.as_bytes()));
    let trailer = serde_json::json!({"archive_hash": hash, "message_count": messages.len()});
    ndjson.push_str(&trailer.to_string());
    ndjson.push('\n');

    let mut encoder = GzEncoder::new(Vec::new(), Compression::default());
    let _ = encoder.write_all(ndjson.as_bytes());
    encoder.finish().unwrap_or_else(|_| ndjson.into_bytes())
}

// ── JSON-LD export ────────────────────────────────────────────────────────────

/// Convert a note-type AFP message into a schema.org `NoteDigitalDocument` JSON-LD object.
fn message_to_json_ld(msg: &ExportMessage) -> serde_json::Value {
    serde_json::json!({
        "@context": "https://schema.org",
        "@type": "NoteDigitalDocument",
        "@id": format!("urn:omnyid:message:{}", msg.id),
        "identifier": msg.id,
        "isPartOf": {
            "@type": "Collection",
            "identifier": msg.thread_id,
        },
        "author": {
            "@type": "Person",
            "identifier": msg.from,
        },
        "dateCreated": msg.timestamp,
        "encodingFormat": "application/json",
        "text": msg.content,
        "additionalType": msg.r#type,
    })
}

/// Build a JSON-LD document containing all note-type AFP messages.
///
/// Returns a `@graph`-style JSON-LD array document.
pub fn build_json_ld(messages: &[ExportMessage]) -> serde_json::Value {
    let items: Vec<serde_json::Value> = messages
        .iter()
        .filter(|m| m.r#type.starts_with("note.") || m.r#type == "note")
        .map(message_to_json_ld)
        .collect();

    serde_json::json!({
        "@context": "https://schema.org",
        "@graph": items,
        "generator": "Omnyid AFP Export v1.0",
    })
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_email_msg() -> ExportMessage {
        ExportMessage {
            id: "msg_email_01".to_string(),
            thread_id: "thread_01".to_string(),
            parent_id: "".to_string(),
            from: "alice@example.com".to_string(),
            to: vec!["bob@example.com".to_string()],
            timestamp: "2026-03-24T10:00:00Z".to_string(),
            r#type: "email.inbound".to_string(),
            content: "Hello, Bob!\nFrom Alice".to_string(),
            prev_hash: None,
        }
    }

    fn sample_note_msg() -> ExportMessage {
        ExportMessage {
            id: "msg_note_01".to_string(),
            thread_id: "thread_02".to_string(),
            parent_id: "".to_string(),
            from: "agent:alice@omnyid.com".to_string(),
            to: vec![],
            timestamp: "2026-03-24T11:00:00Z".to_string(),
            r#type: "note.block".to_string(),
            content: "This is a personal note.".to_string(),
            prev_hash: None,
        }
    }

    #[test]
    fn mbox_includes_email_messages() {
        let msgs = vec![sample_email_msg(), sample_note_msg()];
        let mbox = build_mbox(&msgs);
        let mbox_str = String::from_utf8_lossy(&mbox);
        assert!(
            mbox_str.contains("msg_email_01"),
            "MBOX must include email msg id"
        );
        assert!(
            !mbox_str.contains("msg_note_01"),
            "MBOX must NOT include note msg"
        );
    }

    #[test]
    fn mbox_escapes_from_at_start_of_line() {
        let mut msg = sample_email_msg();
        msg.content = "Line one\nFrom the bottom of my heart".to_string();
        let mbox = build_mbox(&[msg]);
        let mbox_str = String::from_utf8_lossy(&mbox);
        assert!(
            mbox_str.contains(">From"),
            "MBOX must escape 'From ' at line start"
        );
    }

    #[test]
    fn afp_archive_is_gzip_compressed() {
        let msgs = vec![sample_email_msg(), sample_note_msg()];
        let archive = build_afp_archive(&msgs);
        // Gzip magic bytes: 0x1f 0x8b
        assert_eq!(
            archive[0], 0x1f,
            "archive must start with gzip magic byte 0x1f"
        );
        assert_eq!(
            archive[1], 0x8b,
            "archive must start with gzip magic byte 0x8b"
        );
    }

    #[test]
    fn afp_archive_is_decompressible_and_contains_all_messages() {
        use flate2::read::GzDecoder;
        use std::io::Read;

        let msgs = vec![sample_email_msg(), sample_note_msg()];
        let archive = build_afp_archive(&msgs);

        let mut decoder = GzDecoder::new(archive.as_slice());
        let mut ndjson = String::new();
        decoder
            .read_to_string(&mut ndjson)
            .expect("must decompress");

        assert!(ndjson.contains("msg_email_01"));
        assert!(ndjson.contains("msg_note_01"));
        assert!(ndjson.contains("archive_hash"));
    }

    #[test]
    fn json_ld_includes_note_messages_only() {
        let msgs = vec![sample_email_msg(), sample_note_msg()];
        let ld = build_json_ld(&msgs);
        let graph = ld["@graph"].as_array().unwrap();
        assert_eq!(graph.len(), 1, "JSON-LD must only include note messages");
        assert_eq!(graph[0]["@type"], "NoteDigitalDocument");
        assert!(
            graph[0]["identifier"]
                .as_str()
                .unwrap()
                .contains("msg_note_01")
        );
    }

    #[test]
    fn json_ld_context_is_schema_org() {
        let msgs = vec![sample_note_msg()];
        let ld = build_json_ld(&msgs);
        assert_eq!(ld["@context"], "https://schema.org");
    }

    #[test]
    fn json_ld_empty_when_no_notes() {
        let msgs = vec![sample_email_msg()];
        let ld = build_json_ld(&msgs);
        assert_eq!(ld["@graph"].as_array().unwrap().len(), 0);
    }
}
