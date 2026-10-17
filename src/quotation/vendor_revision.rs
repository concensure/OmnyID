use serde::{Deserialize, Serialize};

use super::{SourceReference, VendorResponseAttachment};

pub const VENDOR_REVISION_SOURCE_KIND: &str = "quotation_vendor_revision_source";
pub const MAX_VENDOR_REVISION_BYTES: usize = 25 * 1024 * 1024;
pub const MAX_VENDOR_REVISION_TEXT_CHARS: usize = 500_000;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum VendorRevisionBlocker {
    Empty,
    Oversized,
    UnsupportedType,
    SignatureMismatch,
    Encrypted,
    ActiveContent,
    PreparedTextRequired,
    PreparedTextInvalid,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ValidatedVendorRevision<'a> {
    pub media_type: &'static str,
    pub prepared_text: Option<&'a str>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct VendorRevisionArtifact {
    pub session_id: String,
    pub grant_id: String,
    pub vendor_id: String,
    pub quotation_id: String,
    pub quotation_version_id: String,
    pub projection_fingerprint: String,
    pub source: SourceReference,
    pub attachment: VendorResponseAttachment,
    pub parser: String,
    pub parsed_text_hash: String,
    pub extraction_mode: String,
}

fn ascii_contains(bytes: &[u8], needle: &str) -> bool {
    String::from_utf8_lossy(bytes)
        .to_ascii_lowercase()
        .contains(&needle.to_ascii_lowercase())
}

fn prepared_text<'a>(
    value: Option<&'a str>,
    required: bool,
) -> Result<Option<&'a str>, VendorRevisionBlocker> {
    let Some(value) = value else {
        return if required {
            Err(VendorRevisionBlocker::PreparedTextRequired)
        } else {
            Ok(None)
        };
    };
    let value = value.trim();
    if value.is_empty()
        || value.chars().count() > MAX_VENDOR_REVISION_TEXT_CHARS
        || value.chars().any(|character| character == '\0')
    {
        return Err(VendorRevisionBlocker::PreparedTextInvalid);
    }
    Ok(Some(value))
}

fn extension(file_name: &str) -> &str {
    file_name.rsplit('.').next().unwrap_or("")
}

pub fn validate_vendor_revision_upload<'a>(
    file_name: &str,
    declared_media_type: Option<&str>,
    bytes: &[u8],
    extracted_text: Option<&'a str>,
) -> Result<ValidatedVendorRevision<'a>, VendorRevisionBlocker> {
    if bytes.is_empty() {
        return Err(VendorRevisionBlocker::Empty);
    }
    if bytes.len() > MAX_VENDOR_REVISION_BYTES {
        return Err(VendorRevisionBlocker::Oversized);
    }
    let ext = extension(file_name).to_ascii_lowercase();
    let declared = declared_media_type
        .unwrap_or("")
        .split(';')
        .next()
        .unwrap_or("")
        .trim()
        .to_ascii_lowercase();
    let accepted = |expected: &[&str]| declared.is_empty() || expected.contains(&declared.as_str());

    match ext.as_str() {
        "pdf" => {
            if !accepted(&["application/pdf"]) || !bytes.starts_with(b"%PDF-") {
                return Err(VendorRevisionBlocker::SignatureMismatch);
            }
            if ascii_contains(bytes, "/encrypt") {
                return Err(VendorRevisionBlocker::Encrypted);
            }
            if [
                "/javascript",
                "/js",
                "/openaction",
                "/launch",
                "/embeddedfile",
            ]
            .iter()
            .any(|needle| ascii_contains(bytes, needle))
            {
                return Err(VendorRevisionBlocker::ActiveContent);
            }
            Ok(ValidatedVendorRevision {
                media_type: "application/pdf",
                prepared_text: prepared_text(extracted_text, false)?,
            })
        }
        "docx" => {
            if !accepted(&[
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                "application/octet-stream",
            ]) || !bytes.starts_with(b"PK")
            {
                return Err(VendorRevisionBlocker::SignatureMismatch);
            }
            if [
                "vbaproject.bin",
                "word/vbadata.xml",
                "activex",
                "embeddings/",
            ]
            .iter()
            .any(|needle| ascii_contains(bytes, needle))
            {
                return Err(VendorRevisionBlocker::ActiveContent);
            }
            Ok(ValidatedVendorRevision {
                media_type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                prepared_text: prepared_text(extracted_text, true)?,
            })
        }
        "docm" | "dotm" => Err(VendorRevisionBlocker::ActiveContent),
        "png" => {
            if !accepted(&["image/png", "application/octet-stream"])
                || !bytes.starts_with(b"\x89PNG\r\n\x1a\n")
            {
                return Err(VendorRevisionBlocker::SignatureMismatch);
            }
            Ok(ValidatedVendorRevision {
                media_type: "image/png",
                prepared_text: None,
            })
        }
        "jpg" | "jpeg" => {
            if !accepted(&["image/jpeg", "application/octet-stream"])
                || !bytes.starts_with(&[0xff, 0xd8, 0xff])
            {
                return Err(VendorRevisionBlocker::SignatureMismatch);
            }
            Ok(ValidatedVendorRevision {
                media_type: "image/jpeg",
                prepared_text: None,
            })
        }
        "webp" => {
            if !accepted(&["image/webp", "application/octet-stream"])
                || bytes.len() < 12
                || &bytes[..4] != b"RIFF"
                || &bytes[8..12] != b"WEBP"
            {
                return Err(VendorRevisionBlocker::SignatureMismatch);
            }
            Ok(ValidatedVendorRevision {
                media_type: "image/webp",
                prepared_text: None,
            })
        }
        "txt" | "md" | "csv" => {
            if !accepted(&[
                "text/plain",
                "text/markdown",
                "text/csv",
                "application/octet-stream",
            ]) || std::str::from_utf8(bytes).is_err()
                || bytes.contains(&0)
            {
                return Err(VendorRevisionBlocker::SignatureMismatch);
            }
            let media_type = match ext.as_str() {
                "csv" => "text/csv",
                "md" => "text/markdown",
                _ => "text/plain",
            };
            Ok(ValidatedVendorRevision {
                media_type,
                prepared_text: None,
            })
        }
        _ => Err(VendorRevisionBlocker::UnsupportedType),
    }
}

pub fn artifact_matches_binding(
    artifact: &VendorRevisionArtifact,
    session_id: &str,
    grant_id: &str,
    vendor_id: &str,
    quotation_id: &str,
    quotation_version_id: &str,
    projection_fingerprint: &str,
) -> bool {
    artifact.session_id == session_id
        && artifact.grant_id == grant_id
        && artifact.vendor_id == vendor_id
        && artifact.quotation_id == quotation_id
        && artifact.quotation_version_id == quotation_version_id
        && artifact.projection_fingerprint == projection_fingerprint
        && artifact.source.source_id == artifact.attachment.source_id
        && artifact.source.source_version_id == artifact.attachment.source_version_id
        && artifact.source.content_hash.as_deref() == Some(&artifact.parsed_text_hash)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn safe_supported_types_are_bounded_and_signature_checked() {
        let pdf = validate_vendor_revision_upload(
            "quote.pdf",
            Some("application/pdf"),
            b"%PDF-1.7\nplain quotation",
            Some("Total AUD 4,200"),
        )
        .unwrap();
        assert_eq!(pdf.media_type, "application/pdf");
        assert_eq!(pdf.prepared_text, Some("Total AUD 4,200"));
        assert_eq!(
            validate_vendor_revision_upload("quote.png", Some("image/png"), b"not png", None),
            Err(VendorRevisionBlocker::SignatureMismatch)
        );
        assert_eq!(
            validate_vendor_revision_upload("quote.exe", None, b"MZ", None),
            Err(VendorRevisionBlocker::UnsupportedType)
        );
    }

    #[test]
    fn encrypted_or_active_documents_fail_closed() {
        assert_eq!(
            validate_vendor_revision_upload(
                "quote.pdf",
                Some("application/pdf"),
                b"%PDF-1.7 /Encrypt",
                None,
            ),
            Err(VendorRevisionBlocker::Encrypted)
        );
        assert_eq!(
            validate_vendor_revision_upload(
                "quote.docx",
                None,
                b"PK central-directory word/vbaProject.bin",
                Some("quote"),
            ),
            Err(VendorRevisionBlocker::ActiveContent)
        );
    }

    #[test]
    fn docx_requires_existing_client_extraction() {
        assert_eq!(
            validate_vendor_revision_upload("quote.docx", None, b"PK safe", None),
            Err(VendorRevisionBlocker::PreparedTextRequired)
        );
    }

    #[test]
    fn oversized_source_is_rejected_before_type_processing() {
        let bytes = vec![b'x'; MAX_VENDOR_REVISION_BYTES + 1];
        assert_eq!(
            validate_vendor_revision_upload("quote.txt", Some("text/plain"), &bytes, None),
            Err(VendorRevisionBlocker::Oversized)
        );
    }
}
