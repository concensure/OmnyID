use lettre::{
    AsyncSmtpTransport, AsyncTransport, Tokio1Executor,
    message::{Attachment, Mailbox, Message, MultiPart, SinglePart, header::ContentType},
    transport::smtp::authentication::Credentials,
};

use super::smtp_out::OutgoingEmailRequest;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SmtpFallbackConfig {
    pub host: String,
    pub port: u16,
    pub username: String,
    pub password: String,
    pub from_address: String,
}

pub async fn send_via_smtp_fallback(
    request: &OutgoingEmailRequest,
    config: &SmtpFallbackConfig,
) -> Result<(), String> {
    let from = config
        .from_address
        .parse::<Mailbox>()
        .map_err(|err| format!("invalid fallback SMTP from address: {err}"))?;

    let mut builder = Message::builder()
        .from(from)
        .subject(request.subject.clone());
    for recipient in &request.to {
        let mailbox = recipient
            .parse::<Mailbox>()
            .map_err(|err| format!("invalid fallback SMTP recipient: {err}"))?;
        builder = builder.to(mailbox);
    }
    if let Some(in_reply_to) = request.in_reply_to.as_ref() {
        builder = builder.in_reply_to(in_reply_to.clone());
    }
    if !request.references.is_empty() {
        builder = builder.references(request.references.join(" "));
    }

    let message = if request.attachments.is_empty() {
        builder.header(ContentType::TEXT_PLAIN).body(request.body.clone())
            .map_err(|err| format!("failed to build SMTP message: {err}"))?
    } else {
        let mut mixed = MultiPart::mixed().singlepart(
            SinglePart::builder().header(ContentType::TEXT_PLAIN).body(request.body.clone()),
        );
        for attachment in &request.attachments {
            let content_type = ContentType::parse(&attachment.media_type)
                .map_err(|err| format!("invalid attachment content type: {err}"))?;
            mixed = mixed.singlepart(Attachment::new(attachment.file_name.clone()).body(attachment.bytes.clone(), content_type));
        }
        builder.multipart(mixed).map_err(|err| format!("failed to build SMTP message: {err}"))?
    };

    let credentials = Credentials::new(config.username.clone(), config.password.clone());
    let transport = AsyncSmtpTransport::<Tokio1Executor>::starttls_relay(&config.host)
        .map_err(|err| format!("failed to configure SMTP relay: {err}"))?
        .port(config.port)
        .credentials(credentials)
        .build();

    transport
        .send(message)
        .await
        .map_err(|err| format!("SMTP fallback send failed: {err}"))?;
    Ok(())
}
