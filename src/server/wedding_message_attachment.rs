use axum::http::StatusCode;

pub const WEDDING_MESSAGE_UPLOAD_PURPOSE: &str = "wedding_vendor_message";
pub const MAX_WEDDING_MESSAGE_ATTACHMENT_BYTES: usize = 10 * 1024 * 1024;
pub const MAX_WEDDING_MESSAGE_ATTACHMENTS: usize = 5;

pub fn validate_wedding_message_attachment(
    file_name: &str,
    mime_type: &str,
    bytes: &[u8],
) -> Result<(), (StatusCode, String)> {
    if bytes.is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            "The attachment is empty.".to_string(),
        ));
    }
    if bytes.len() > MAX_WEDDING_MESSAGE_ATTACHMENT_BYTES {
        return Err((
            StatusCode::PAYLOAD_TOO_LARGE,
            "Each enquiry attachment must be 10 MB or smaller.".to_string(),
        ));
    }
    let extension = file_name
        .rsplit_once('.')
        .map(|(_, value)| value.to_ascii_lowercase())
        .unwrap_or_default();
    let allowed = matches!(
        (extension.as_str(), mime_type),
        ("pdf", "application/pdf")
            | (
                "docx",
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            )
            | ("txt", "text/plain")
            | ("jpg" | "jpeg", "image/jpeg")
            | ("png", "image/png")
            | ("webp", "image/webp")
    );
    if !allowed {
        return Err((
            StatusCode::UNSUPPORTED_MEDIA_TYPE,
            "Attach a PDF, DOCX, TXT, JPG, PNG, or WebP file.".to_string(),
        ));
    }
    Ok(())
}

pub async fn scan_wedding_message_attachment(bytes: &[u8]) -> Result<(), (StatusCode, String)> {
    match crate::gateway::clamav::scan_bytes(bytes).await {
        Ok(Some(result)) if !result.is_infected => Ok(()),
        Ok(Some(_)) => Err((
            StatusCode::UNPROCESSABLE_ENTITY,
            "This attachment did not pass the safety check.".to_string(),
        )),
        Ok(None) | Err(_) => Err((
            StatusCode::SERVICE_UNAVAILABLE,
            "Attachment safety scanning is temporarily unavailable. Try again later.".to_string(),
        )),
    }
}

#[cfg(test)]
mod tests {
    use super::validate_wedding_message_attachment;

    #[test]
    fn accepts_only_requested_message_formats_with_matching_types() {
        assert!(
            validate_wedding_message_attachment("brief.pdf", "application/pdf", b"pdf").is_ok()
        );
        assert!(
            validate_wedding_message_attachment(
                "brief.docx",
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                b"docx",
            )
            .is_ok()
        );
        assert!(validate_wedding_message_attachment("note.txt", "text/plain", b"note").is_ok());
        assert!(validate_wedding_message_attachment("look.webp", "image/webp", b"image").is_ok());
        assert!(validate_wedding_message_attachment("sheet.csv", "text/csv", b"x").is_err());
        assert!(validate_wedding_message_attachment("fake.pdf", "image/png", b"x").is_err());
    }
}
