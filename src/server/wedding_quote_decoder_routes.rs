// @module-id: server.wedding-quote-decoder-routes
// @primary-capability: bounded-public-source-grounded-quote-extraction
// @locs-version: 1.0

use std::{sync::Arc, time::Duration};

use axum::{
    Json, Router,
    extract::{DefaultBodyLimit, State},
    http::{HeaderMap, StatusCode},
    routing::{get, post},
};
use regex::Regex;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use sqlx::Row;
use ulid::Ulid;

use crate::gateway::smtp_out::{OutgoingEmailAttachment, send_transactional_email_with_attachment};

use super::{
    AppState, RateLimitPolicy,
    auth::{authenticated_user, enforce_rate_limit, public_rate_limit_key},
    cost_controls::operator_access_allowed,
    is_plausible_email,
    openrouter_funded_inference::{self, FundedInferenceRequest},
    readiness_error_to_http,
};

const MAX_QUOTE_CHARS: usize = 20_000;
const MIN_QUOTE_CHARS: usize = 40;

const SYSTEM_PROMPT: &str = r#"You extract commercial terms from one wedding vendor proposal, including venue proposals. Return only strict JSON. Never calculate arithmetic: OmnyID calculates totals deterministically. Never infer an unstated value. Never map a component subtotal to whole_package_amount. Every extracted or ambiguous value must include one exact, contiguous source_snippet copied verbatim from the proposal; do not add ellipses. If no exact support exists, use state not_found and value null.

Return exactly this shape:
{
  "schema_version":"quote-extraction.v2",
  "fields":{
    "pricing_model":{"state":"extracted|ambiguous|not_found","value":"per_head|fixed|minimum_spend|hybrid|unclear|null","source_snippet":string|null,"confidence":"high|medium|low","reason":string},
    "per_head_rate":{"state":"extracted|ambiguous|not_found","value":number|null,"source_snippet":string|null,"confidence":"high|medium|low","reason":string},
    "guest_count":{"state":"extracted|ambiguous|not_found","value":number|null,"source_snippet":string|null,"confidence":"high|medium|low","reason":string},
    "whole_package_amount":{"state":"extracted|ambiguous|not_found","value":number|null,"source_snippet":string|null,"confidence":"high|medium|low","reason":string},
    "fixed_fee":{"state":"extracted|ambiguous|not_found","value":number|null,"source_snippet":string|null,"confidence":"high|medium|low","reason":string},
    "minimum_spend":{"state":"extracted|ambiguous|not_found","value":number|null,"source_snippet":string|null,"confidence":"high|medium|low","reason":string},
    "gst":{"state":"extracted|ambiguous|not_found","value":"included|excluded|unclear|null","source_snippet":string|null,"confidence":"high|medium|low","reason":string},
    "service_charge_pct":{"state":"extracted|ambiguous|not_found","value":number|null,"source_snippet":string|null,"confidence":"high|medium|low","reason":string},
    "venue_hours":{"state":"extracted|ambiguous|not_found","value":number|null,"source_snippet":string|null,"confidence":"high|medium|low","reason":string},
    "overtime_rate":{"state":"extracted|ambiguous|not_found","value":number|null,"source_snippet":string|null,"confidence":"high|medium|low","reason":string},
    "payment_schedule":{"state":"extracted|ambiguous|not_found","value":string|null,"source_snippet":string|null,"confidence":"high|medium|low","reason":string}
  },
  "line_items":[{"label":string,"unit":"per_head|fixed|included|unclear","amount":number|null,"source_snippet":string,"confidence":"high|medium|low"}],
  "inclusions":[{"label":string,"source_snippet":string}],
  "exclusions":[{"label":string,"source_snippet":string}]
}

Classification rules:
- A rate such as 120 guests x $275 is per_head_rate 275 and guest_count 120. It is not a whole-package amount. Do not return the multiplication result.
- whole_package_amount is only for wording that explicitly identifies a grand total, package total or total payable for the proposal as a whole.
- fixed_fee is a stated room, ceremony, hire or other fixed commercial fee, not a calculated subtotal.
- A minimum spend is not a quoted total.
- Line items preserve catering, beverages and other components. Their amounts are quoted values only.
- An inclusion can be stated without a price. Missing information is useful: return not_found for every absent field with a short reason."#;

#[derive(Deserialize)]
struct ExtractRequest {
    text: String,
    #[serde(default)]
    proposal: String,
    #[serde(default)]
    comparison_guests: Option<u32>,
    #[serde(default)]
    company: String,
}

#[derive(Clone, Deserialize, Serialize)]
struct ExtractedField {
    state: String,
    value: Option<Value>,
    source_snippet: Option<String>,
    confidence: String,
    reason: String,
}

#[derive(Deserialize)]
struct ModelFields {
    pricing_model: ExtractedField,
    per_head_rate: ExtractedField,
    guest_count: ExtractedField,
    whole_package_amount: ExtractedField,
    fixed_fee: ExtractedField,
    minimum_spend: ExtractedField,
    gst: ExtractedField,
    service_charge_pct: ExtractedField,
    venue_hours: ExtractedField,
    overtime_rate: ExtractedField,
    payment_schedule: ExtractedField,
}

#[derive(Deserialize, Serialize)]
struct LineItem {
    label: String,
    unit: String,
    amount: Option<f64>,
    source_snippet: String,
    confidence: String,
}

#[derive(Deserialize, Serialize)]
struct EvidenceItem {
    label: String,
    source_snippet: String,
}

#[derive(Deserialize)]
struct ModelPayload {
    schema_version: String,
    fields: ModelFields,
    #[serde(default)]
    line_items: Vec<LineItem>,
    #[serde(default)]
    inclusions: Vec<EvidenceItem>,
    #[serde(default)]
    exclusions: Vec<EvidenceItem>,
}

pub(super) fn routes() -> Router<Arc<AppState>> {
    Router::new()
        .route("/wedding/quote-extract", post(extract_http))
        .route("/wedding/quote-share", post(share_quote_http))
        .route("/admin/wedding/quote-shares", get(admin_quote_shares_http))
        .layer(DefaultBodyLimit::max(96 * 1024))
}

#[derive(Deserialize)]
struct QuoteShareRequest {
    email: String,
    #[serde(default)]
    company: String,
    snapshot: Value,
}

fn printable(value: &str) -> String {
    value
        .chars()
        .map(|character| match character {
            '\n' | '\r' | '\t' => character,
            '—' | '–' => '-',
            '“' | '”' => '"',
            '‘' | '’' => '\'',
            character if character.is_ascii() && !character.is_ascii_control() => character,
            _ => '?',
        })
        .collect()
}

fn human_key(value: &str) -> String {
    let mut label = value.replace('_', " ");
    if let Some(first) = label.get_mut(0..1) {
        first.make_ascii_uppercase();
    }
    label
}

fn snapshot_lines(snapshot: &Value) -> Vec<String> {
    let mut lines = vec![
        "OmnyID Wedding - venue quote comparison".to_string(),
        "Prepared from the figures and evidence reviewed in the public quote tool.".to_string(),
        String::new(),
    ];
    for key in ["generated_at", "comparison_guests", "comparison_hours"] {
        if let Some(value) = snapshot.get(key) {
            lines.push(format!(
                "{}: {}",
                human_key(key),
                value
                    .as_str()
                    .map(str::to_string)
                    .unwrap_or_else(|| value.to_string())
            ));
        }
    }
    let proposals = snapshot
        .get("proposals")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    for (index, proposal) in proposals.iter().take(2).enumerate() {
        lines.push(String::new());
        lines.push(format!(
            "PROPOSAL {} - {}",
            index + 1,
            proposal
                .get("label")
                .and_then(Value::as_str)
                .unwrap_or("Unnamed venue")
        ));
        for key in ["pricing_model", "estimated_total"] {
            if let Some(value) = proposal.get(key) {
                lines.push(format!("{}: {}", human_key(key), value));
            }
        }
        for section in [
            "commercial_terms",
            "line_items",
            "formula_lines",
            "assumptions",
            "unknowns",
            "follow_up_questions",
            "extraction_fields",
        ] {
            if let Some(value) = proposal.get(section) {
                lines.push(String::new());
                lines.push(human_key(section));
                let rendered = serde_json::to_string_pretty(value)
                    .unwrap_or_else(|_| "Not available".to_string());
                lines.extend(rendered.lines().map(|line| format!("  {line}")));
            }
        }
        lines.push(String::new());
        lines.push("Original proposal text".to_string());
        lines.extend(
            proposal
                .get("proposal_text")
                .and_then(Value::as_str)
                .unwrap_or("Not included")
                .lines()
                .map(str::to_string),
        );
    }
    lines
}

fn wrap_pdf_lines(lines: Vec<String>) -> Vec<String> {
    let mut wrapped = Vec::new();
    for line in lines {
        let line = printable(&line);
        if line.is_empty() {
            wrapped.push(String::new());
            continue;
        }
        let mut remaining = line.as_str();
        while remaining.chars().count() > 86 {
            let boundary = remaining
                .char_indices()
                .take_while(|(index, _)| *index <= 86)
                .filter(|(_, character)| character.is_whitespace())
                .map(|(index, _)| index)
                .last()
                .unwrap_or_else(|| {
                    remaining
                        .char_indices()
                        .nth(86)
                        .map(|(index, _)| index)
                        .unwrap_or(remaining.len())
                });
            let (head, tail) = remaining.split_at(boundary.max(1));
            wrapped.push(head.trim_end().to_string());
            remaining = tail.trim_start();
        }
        wrapped.push(remaining.to_string());
    }
    wrapped
}

fn pdf_escape(value: &str) -> String {
    value
        .replace('\\', "\\\\")
        .replace('(', "\\(")
        .replace(')', "\\)")
}

fn build_quote_pdf(snapshot: &Value) -> Vec<u8> {
    let lines = wrap_pdf_lines(snapshot_lines(snapshot));
    let pages = lines.chunks(50).collect::<Vec<_>>();
    let page_count = pages.len().max(1);
    let kids = (0..page_count)
        .map(|index| format!("{} 0 R", 4 + index * 2))
        .collect::<Vec<_>>()
        .join(" ");
    let mut objects = vec![
        "<< /Type /Catalog /Pages 2 0 R >>".to_string(),
        format!("<< /Type /Pages /Kids [{kids}] /Count {page_count} >>"),
        "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>".to_string(),
    ];
    for (index, page_lines) in pages.iter().enumerate() {
        let content_id = 5 + index * 2;
        objects.push(format!("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents {content_id} 0 R >>"));
        let mut content = "BT\n/F1 9 Tf\n48 800 Td\n14 TL\n".to_string();
        for line in *page_lines {
            content.push_str(&format!("({}) Tj\nT*\n", pdf_escape(line)));
        }
        content.push_str("ET\n");
        objects.push(format!(
            "<< /Length {} >>\nstream\n{}endstream",
            content.len(),
            content
        ));
    }
    if pages.is_empty() {
        objects.push("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents 5 0 R >>".to_string());
        let content = "BT\n/F1 9 Tf\n48 800 Td\n(OmnyID Wedding quote comparison) Tj\nET\n";
        objects.push(format!(
            "<< /Length {} >>\nstream\n{}endstream",
            content.len(),
            content
        ));
    }
    let mut pdf = b"%PDF-1.4\n%OmnyID\n".to_vec();
    let mut offsets = vec![0usize];
    for (index, object) in objects.iter().enumerate() {
        offsets.push(pdf.len());
        pdf.extend_from_slice(format!("{} 0 obj\n{}\nendobj\n", index + 1, object).as_bytes());
    }
    let xref = pdf.len();
    pdf.extend_from_slice(
        format!("xref\n0 {}\n0000000000 65535 f \n", objects.len() + 1).as_bytes(),
    );
    for offset in offsets.iter().skip(1) {
        pdf.extend_from_slice(format!("{offset:010} 00000 n \n").as_bytes());
    }
    pdf.extend_from_slice(
        format!(
            "trailer\n<< /Size {} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n",
            objects.len() + 1
        )
        .as_bytes(),
    );
    pdf
}

async fn share_quote_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<QuoteShareRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    if !request.company.trim().is_empty() {
        return Ok(Json(json!({"status":"sent","message":"PDF sent."})));
    }
    let email = request.email.trim().to_ascii_lowercase();
    if !is_plausible_email(&email) || email.len() > 254 {
        return Err((
            StatusCode::BAD_REQUEST,
            "Enter a valid email address.".to_string(),
        ));
    }
    let serialized = serde_json::to_vec(&request.snapshot).map_err(|_| {
        (
            StatusCode::BAD_REQUEST,
            "The comparison could not be read.".to_string(),
        )
    })?;
    if serialized.len() > 72 * 1024
        || !request
            .snapshot
            .get("proposals")
            .is_some_and(Value::is_array)
    {
        return Err((
            StatusCode::BAD_REQUEST,
            "The comparison is incomplete or too large to share.".to_string(),
        ));
    }
    enforce_rate_limit(
        &state,
        public_rate_limit_key("wedding_quote_share_burst", &headers),
        RateLimitPolicy {
            max_requests: 3,
            window: Duration::from_secs(3_600),
        },
    )
    .await?;
    enforce_rate_limit(
        &state,
        public_rate_limit_key("wedding_quote_share_daily", &headers),
        RateLimitPolicy {
            max_requests: 8,
            window: Duration::from_secs(86_400),
        },
    )
    .await?;
    let recipient_digest = hex::encode(Sha256::digest(email.as_bytes()));
    enforce_rate_limit(
        &state,
        format!("wedding_quote_share_recipient:{recipient_digest}"),
        RateLimitPolicy {
            max_requests: 3,
            window: Duration::from_secs(86_400),
        },
    )
    .await?;
    let event_id = Ulid::new().to_string();
    sqlx::query(
        "INSERT INTO wedding_quote_share_events (event_id, delivery_status) VALUES ($1, 'pending')",
    )
    .bind(&event_id)
    .execute(&state.db.pool)
    .await
    .map_err(readiness_error_to_http)?;
    let pdf = build_quote_pdf(&request.snapshot);
    let delivery = send_transactional_email_with_attachment(
        &email,
        "Your OmnyID Wedding venue quote comparison",
        "Your requested venue quote comparison is attached as a PDF. The figures are based on the terms you reviewed in the public tool; unknown terms remain questions for the venue.\n\nContinue in OmnyID Wedding: https://omnyid.com/workspace/?auth=register&source=wedding&from=quote-decoder",
        OutgoingEmailAttachment { attachment_id: event_id.clone(), file_name: "omnyid-wedding-venue-quote-comparison.pdf".to_string(), media_type: "application/pdf".to_string(), bytes: pdf },
    ).await;
    let (status, error_class) = if delivery.is_ok() {
        ("sent", None)
    } else {
        ("failed", Some("provider_rejected"))
    };
    sqlx::query("UPDATE wedding_quote_share_events SET delivery_status = $2, completed_at = NOW(), provider_error_class = $3 WHERE event_id = $1")
        .bind(&event_id).bind(status).bind(error_class).execute(&state.db.pool).await.map_err(readiness_error_to_http)?;
    if let Err(error) = delivery {
        tracing::warn!(%error, %event_id, "public quote comparison PDF delivery failed");
        return Err((StatusCode::SERVICE_UNAVAILABLE, "The PDF could not be sent just now. Your comparison has not been lost in this browser.".to_string()));
    }
    Ok(Json(
        json!({"status":"sent","message":format!("PDF sent to {email}.")}),
    ))
}

async fn admin_quote_shares_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, String)> {
    let operator = authenticated_user(&state.db, &headers).await?;
    if !operator_access_allowed(&operator.email) {
        return Err((
            StatusCode::FORBIDDEN,
            "operator access required".to_string(),
        ));
    }
    let row = sqlx::query("SELECT COUNT(*) FILTER (WHERE delivery_status = 'sent') AS sent_total, COUNT(*) FILTER (WHERE delivery_status = 'sent' AND requested_at >= NOW() - INTERVAL '7 days') AS sent_7d, MAX(completed_at) FILTER (WHERE delivery_status = 'sent') AS last_sent_at FROM wedding_quote_share_events")
        .fetch_one(&state.db.pool).await.map_err(readiness_error_to_http)?;
    Ok(Json(json!({
        "sent_total": row.try_get::<i64, _>("sent_total").unwrap_or(0),
        "sent_7d": row.try_get::<i64, _>("sent_7d").unwrap_or(0),
        "last_sent_at": row.try_get::<Option<chrono::DateTime<chrono::Utc>>, _>("last_sent_at").ok().flatten(),
        "tool_url": "https://omnyid.com/wedding/compare-wedding-venue-quotes.html",
        "privacy": "Counts successful deliveries only; quote content and recipient addresses are not stored.",
    })))
}

fn bounded(value: &str, max: usize) -> String {
    value.trim().chars().take(max).collect()
}

fn source_is_exact(text: &str, source: &str) -> bool {
    let source = source.trim();
    !source.is_empty() && text.contains(source)
}

fn missing(reason: &str) -> ExtractedField {
    ExtractedField {
        state: "not_found".to_string(),
        value: None,
        source_snippet: None,
        confidence: "low".to_string(),
        reason: bounded(reason, 180),
    }
}

fn sanitize_field(text: &str, mut field: ExtractedField, kind: &str) -> ExtractedField {
    if !matches!(
        field.state.as_str(),
        "extracted" | "ambiguous" | "not_found"
    ) {
        return missing("The extractor returned an unsupported evidence state.");
    }
    if !matches!(field.confidence.as_str(), "high" | "medium" | "low") {
        field.confidence = "low".to_string();
    }
    field.reason = bounded(&field.reason, 180);
    if field.state == "not_found" {
        field.value = None;
        field.source_snippet = None;
        return field;
    }
    let source = field.source_snippet.as_deref().unwrap_or_default().trim();
    if !source_is_exact(text, source) {
        return missing("The suggested value had no exact source sentence in the proposal.");
    }
    field.source_snippet = Some(bounded(source, 260));
    let valid_value = match kind {
        "pricing_model" => field
            .value
            .as_ref()
            .and_then(Value::as_str)
            .is_some_and(|value| {
                matches!(
                    value,
                    "per_head" | "fixed" | "minimum_spend" | "hybrid" | "unclear"
                )
            }),
        "gst" => field
            .value
            .as_ref()
            .and_then(Value::as_str)
            .is_some_and(|value| matches!(value, "included" | "excluded" | "unclear")),
        "payment_schedule" => field
            .value
            .as_ref()
            .and_then(Value::as_str)
            .is_some_and(|value| !value.trim().is_empty() && value.chars().count() <= 500),
        "guest_count" => field
            .value
            .as_ref()
            .and_then(Value::as_f64)
            .is_some_and(|value| value >= 1.0 && value <= 5_000.0 && value.fract() == 0.0),
        "service_charge_pct" => field
            .value
            .as_ref()
            .and_then(Value::as_f64)
            .is_some_and(|value| (0.0..=100.0).contains(&value)),
        "venue_hours" => field
            .value
            .as_ref()
            .and_then(Value::as_f64)
            .is_some_and(|value| value > 0.0 && value <= 48.0),
        _ => field
            .value
            .as_ref()
            .and_then(Value::as_f64)
            .is_some_and(|value| value >= 0.0 && value <= 10_000_000.0),
    };
    if valid_value {
        field
    } else {
        missing("The suggested value was outside the supported field type or range.")
    }
}

fn sanitize_line_items(text: &str, items: Vec<LineItem>) -> Vec<LineItem> {
    items
        .into_iter()
        .filter_map(|mut item| {
            if !matches!(
                item.unit.as_str(),
                "per_head" | "fixed" | "included" | "unclear"
            ) || !source_is_exact(text, &item.source_snippet)
                || item.label.trim().is_empty()
                || item
                    .amount
                    .is_some_and(|amount| !(0.0..=10_000_000.0).contains(&amount))
            {
                return None;
            }
            item.label = bounded(&item.label, 120);
            item.source_snippet = bounded(&item.source_snippet, 260);
            if !matches!(item.confidence.as_str(), "high" | "medium" | "low") {
                item.confidence = "low".to_string();
            }
            Some(item)
        })
        .take(40)
        .collect()
}

fn sanitize_evidence(text: &str, items: Vec<EvidenceItem>) -> Vec<EvidenceItem> {
    items
        .into_iter()
        .filter_map(|mut item| {
            if item.label.trim().is_empty() || !source_is_exact(text, &item.source_snippet) {
                return None;
            }
            item.label = bounded(&item.label, 120);
            item.source_snippet = bounded(&item.source_snippet, 260);
            Some(item)
        })
        .take(40)
        .collect()
}

fn missing_field(reason: &str) -> ExtractedField {
    ExtractedField {
        state: "not_found".to_string(),
        value: None,
        source_snippet: None,
        confidence: "low".to_string(),
        reason: reason.to_string(),
    }
}

fn captured_field(
    text: &str,
    pattern: &str,
    value: impl Into<Value>,
    reason: &str,
) -> Option<ExtractedField> {
    let regex = Regex::new(pattern).ok()?;
    let matched = regex.find(text)?;
    Some(ExtractedField {
        state: "extracted".to_string(),
        value: Some(value.into()),
        source_snippet: Some(matched.as_str().to_string()),
        confidence: "medium".to_string(),
        reason: reason.to_string(),
    })
}

fn captured_money(text: &str, pattern: &str, reason: &str) -> Option<ExtractedField> {
    let regex = Regex::new(pattern).ok()?;
    let captures = regex.captures(text)?;
    let matched = captures.get(0)?;
    let amount = captures
        .get(1)?
        .as_str()
        .replace(',', "")
        .parse::<f64>()
        .ok()?;
    Some(ExtractedField {
        state: "extracted".to_string(),
        value: Some(json!(amount)),
        source_snippet: Some(matched.as_str().to_string()),
        confidence: "medium".to_string(),
        reason: reason.to_string(),
    })
}

fn deterministic_quote_fallback(text: &str) -> ModelPayload {
    let per_head = captured_money(
        text,
        r"(?i)(?:AUD\s*|A\$\s*|\$\s*)([0-9][0-9,]*(?:\.[0-9]{1,2})?)\s*(?:per\s+(?:person|guest|head)|p\.?p\.?)",
        "A per-person amount is stated explicitly in the uploaded wording.",
    );
    let minimum_spend = captured_money(
        text,
        r"(?i)minimum\s+spend[^0-9$]{0,24}(?:AUD\s*|A\$\s*|\$\s*)([0-9][0-9,]*(?:\.[0-9]{1,2})?)",
        "A minimum spend is stated explicitly in the uploaded wording.",
    );
    let whole_package = captured_money(
        text,
        r"(?i)(?:grand\s+total|package\s+total|total\s+payable|total\s+package)[^0-9$]{0,24}(?:AUD\s*|A\$\s*|\$\s*)([0-9][0-9,]*(?:\.[0-9]{1,2})?)",
        "A whole-package total is stated explicitly in the uploaded wording.",
    );
    let fixed_fee = captured_money(
        text,
        r"(?i)(?:venue|room|ceremony|site|location)\s+(?:hire|fee|rental)[^0-9$]{0,28}(?:AUD\s*|A\$\s*|\$\s*)([0-9][0-9,]*(?:\.[0-9]{1,2})?)",
        "A fixed venue or ceremony fee is stated explicitly in the uploaded wording.",
    );
    let guest_count = Regex::new(r"(?i)\b([1-9][0-9]{0,3})\s+guests?\b")
        .ok()
        .and_then(|regex| regex.captures(text))
        .and_then(|captures| {
            let matched = captures.get(0)?;
            let count = captures.get(1)?.as_str().parse::<u32>().ok()?;
            Some(ExtractedField {
                state: "extracted".to_string(),
                value: Some(json!(count)),
                source_snippet: Some(matched.as_str().to_string()),
                confidence: "medium".to_string(),
                reason: "A guest count is stated explicitly in the uploaded wording.".to_string(),
            })
        });
    let gst = captured_field(
        text,
        r"(?i)\bGST\s+(?:is\s+)?included\b",
        "included",
        "The quote says GST is included.",
    )
    .or_else(|| {
        captured_field(
            text,
            r"(?i)\bGST\s+(?:is\s+)?(?:excluded|not\s+included|additional)\b",
            "excluded",
            "The quote says GST is excluded or additional.",
        )
    });
    let pricing_model = if per_head.is_some() {
        captured_field(
            text,
            r"(?i)(?:AUD\s*|A\$\s*|\$\s*)[0-9][0-9,]*(?:\.[0-9]{1,2})?\s*(?:per\s+(?:person|guest|head)|p\.?p\.?)",
            "per_head",
            "The wording uses an explicit per-person rate.",
        )
    } else if minimum_spend.is_some() {
        captured_field(
            text,
            r"(?i)minimum\s+spend",
            "minimum_spend",
            "The wording identifies a minimum-spend model.",
        )
    } else if whole_package.is_some() || fixed_fee.is_some() {
        let pattern = if whole_package.is_some() {
            r"(?i)(?:grand\s+total|package\s+total|total\s+payable|total\s+package)"
        } else {
            r"(?i)(?:venue|room|ceremony|site|location)\s+(?:hire|fee|rental)"
        };
        captured_field(
            text,
            pattern,
            "fixed",
            "The wording identifies a fixed-price component or package.",
        )
    } else {
        None
    };
    let payment_schedule = captured_field(
        text,
        r"(?i)\b(?:deposit|balance|instalment|installment|payment)\b[^.\n]{0,160}",
        "See exact source wording",
        "Payment timing or a deposit is stated; review the exact excerpt.",
    );
    let line_items = [
        ("Per-person package", "per_head", &per_head),
        ("Fixed venue or ceremony fee", "fixed", &fixed_fee),
        ("Minimum spend", "fixed", &minimum_spend),
        ("Whole-package total", "fixed", &whole_package),
    ]
    .into_iter()
    .filter_map(|(label, unit, field)| {
        let amount = field.as_ref()?.value.as_ref()?.as_f64()?;
        Some(LineItem {
            label: label.to_string(),
            unit: unit.to_string(),
            amount: Some(amount),
            source_snippet: field.as_ref()?.source_snippet.clone()?,
            confidence: "medium".to_string(),
        })
    })
    .collect();
    ModelPayload {
        schema_version: "quote-extraction.v2".to_string(),
        fields: ModelFields {
            pricing_model: pricing_model.unwrap_or_else(|| {
                missing_field("No pricing model was identified deterministically.")
            }),
            per_head_rate: per_head
                .unwrap_or_else(|| missing_field("No explicit per-person rate was found.")),
            guest_count: guest_count
                .unwrap_or_else(|| missing_field("No explicit guest count was found.")),
            whole_package_amount: whole_package
                .unwrap_or_else(|| missing_field("No explicit whole-package total was found.")),
            fixed_fee: fixed_fee.unwrap_or_else(|| {
                missing_field("No explicit fixed venue or ceremony fee was found.")
            }),
            minimum_spend: minimum_spend
                .unwrap_or_else(|| missing_field("No explicit minimum spend was found.")),
            gst: gst.unwrap_or_else(|| missing_field("GST treatment was not stated clearly.")),
            service_charge_pct: missing_field(
                "No explicit service-charge percentage was identified.",
            ),
            venue_hours: missing_field("No explicit venue duration was identified."),
            overtime_rate: missing_field("No explicit overtime rate was identified."),
            payment_schedule: payment_schedule
                .unwrap_or_else(|| missing_field("No explicit payment schedule was identified.")),
        },
        line_items,
        inclusions: Vec::new(),
        exclusions: Vec::new(),
    }
}

fn extraction_json(text: &str, payload: ModelPayload, model: &str) -> Value {
    let fields = payload.fields;
    json!({
        "schema_version": "quote-extraction.v2",
        "model": model,
        "fields": {
            "pricing_model": sanitize_field(text, fields.pricing_model, "pricing_model"),
            "per_head_rate": sanitize_field(text, fields.per_head_rate, "money"),
            "guest_count": sanitize_field(text, fields.guest_count, "guest_count"),
            "whole_package_amount": sanitize_field(text, fields.whole_package_amount, "money"),
            "fixed_fee": sanitize_field(text, fields.fixed_fee, "money"),
            "minimum_spend": sanitize_field(text, fields.minimum_spend, "money"),
            "gst": sanitize_field(text, fields.gst, "gst"),
            "service_charge_pct": sanitize_field(text, fields.service_charge_pct, "service_charge_pct"),
            "venue_hours": sanitize_field(text, fields.venue_hours, "venue_hours"),
            "overtime_rate": sanitize_field(text, fields.overtime_rate, "money"),
            "payment_schedule": sanitize_field(text, fields.payment_schedule, "payment_schedule"),
        },
        "line_items": sanitize_line_items(text, payload.line_items),
        "inclusions": sanitize_evidence(text, payload.inclusions),
        "exclusions": sanitize_evidence(text, payload.exclusions),
        "retained_by_omnyid": false,
    })
}

async fn extract_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<ExtractRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    if !request.company.trim().is_empty() {
        return Ok(Json(json!({ "status": "ok" })));
    }
    let burst_key = public_rate_limit_key("wedding_quote_extract_burst", &headers);
    let daily_key = public_rate_limit_key("wedding_quote_extract_daily", &headers);
    enforce_rate_limit(
        &state,
        burst_key.clone(),
        RateLimitPolicy {
            max_requests: 5,
            window: Duration::from_secs(600),
        },
    )
    .await?;
    enforce_rate_limit(
        &state,
        daily_key,
        RateLimitPolicy {
            max_requests: 10,
            window: Duration::from_secs(86_400),
        },
    )
    .await?;

    let text = request.text.trim();
    let length = text.chars().count();
    if !(MIN_QUOTE_CHARS..=MAX_QUOTE_CHARS).contains(&length) {
        return Err((
            StatusCode::BAD_REQUEST,
            format!(
                "proposal text must be between {MIN_QUOTE_CHARS} and {MAX_QUOTE_CHARS} characters"
            ),
        ));
    }
    let proposal = bounded(&request.proposal, 20);
    let comparison_guests = request
        .comparison_guests
        .filter(|value| (1..=500).contains(value));
    let prompt = format!(
        "Proposal side: {}\nComparison guests supplied by visitor (context only): {}\n\nPROPOSAL TEXT\n{}",
        if proposal.is_empty() {
            "unspecified"
        } else {
            &proposal
        },
        comparison_guests.map_or_else(|| "not supplied".to_string(), |value| value.to_string()),
        text
    );
    let result = openrouter_funded_inference::infer(
        &state.db.pool,
        &state.http_client,
        FundedInferenceRequest {
            feature: "public_wedding_quote_extraction",
            user_id: None,
            wedding_plan_id: None,
            abuse_id: &burst_key,
            system: SYSTEM_PROMPT,
            prompt: &prompt,
            max_tokens: 900,
            json_mode: true,
        },
    )
    .await;
    let result = match result {
        Ok(result) => result,
        Err(error) => {
            tracing::warn!(%error, "quote extractor model unavailable; returning deterministic grounded fallback");
            return Ok(Json(extraction_json(
                text,
                deterministic_quote_fallback(text),
                "deterministic-fallback-v1",
            )));
        }
    };
    let cleaned = result
        .content
        .trim()
        .trim_start_matches("```json")
        .trim_start_matches("```")
        .trim_end_matches("```")
        .trim();
    let payload: ModelPayload = match serde_json::from_str(cleaned) {
        Ok(payload) => payload,
        Err(error) => {
            tracing::warn!(%error, "quote extractor returned invalid structured output; returning deterministic grounded fallback");
            return Ok(Json(extraction_json(
                text,
                deterministic_quote_fallback(text),
                "deterministic-fallback-v1",
            )));
        }
    };
    if payload.schema_version != "quote-extraction.v2" {
        return Ok(Json(extraction_json(
            text,
            deterministic_quote_fallback(text),
            "deterministic-fallback-v1",
        )));
    }
    Ok(Json(extraction_json(text, payload, &result.model)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn unsupported_or_ungrounded_fields_are_not_returned_as_extracted() {
        let field = ExtractedField {
            state: "extracted".to_string(),
            value: Some(json!(275)),
            source_snippet: Some("invented $275".to_string()),
            confidence: "high".to_string(),
            reason: "looks likely".to_string(),
        };
        let sanitized = sanitize_field("The package is $250 per guest.", field, "money");
        assert_eq!(sanitized.state, "not_found");
        assert!(sanitized.value.is_none());
    }

    #[test]
    fn exact_source_and_bounded_numeric_value_survive() {
        let field = ExtractedField {
            state: "extracted".to_string(),
            value: Some(json!(275)),
            source_snippet: Some("120 guests x $275.00".to_string()),
            confidence: "high".to_string(),
            reason: "explicit per-head wording".to_string(),
        };
        let sanitized = sanitize_field("Package: 120 guests x $275.00", field, "money");
        assert_eq!(sanitized.state, "extracted");
        assert_eq!(sanitized.value, Some(json!(275)));
    }

    #[test]
    fn deterministic_fallback_keeps_per_head_minimum_spend_and_gst_source_grounded() {
        let text = "Minimum spend: A$38,000. Catering is $275 pp for 120 guests. GST is included. A 20 percent deposit is due on booking.";
        let payload = deterministic_quote_fallback(text);
        let response = extraction_json(text, payload, "deterministic-fallback-v1");
        assert_eq!(response["schema_version"], "quote-extraction.v2");
        assert_eq!(response["fields"]["per_head_rate"]["value"], 275.0);
        assert_eq!(response["fields"]["guest_count"]["value"], 120);
        assert_eq!(response["fields"]["minimum_spend"]["value"], 38_000.0);
        assert_eq!(response["fields"]["gst"]["value"], "included");
        assert_eq!(response["model"], "deterministic-fallback-v1");
    }

    #[test]
    fn shared_quote_pdf_is_auditable_and_contains_reviewed_terms() {
        let snapshot = json!({
            "generated_at": "2026-11-10T00:00:00Z",
            "comparison_guests": 100,
            "comparison_hours": 6,
            "proposals": [{
                "label": "Harbour Garden",
                "proposal_text": "Reception package is $220 per guest. GST included.",
                "pricing_model": "per_head",
                "estimated_total": 22000,
                "commercial_terms": { "per_head_rate": 220, "gst": "included" },
                "line_items": [{ "label": "Reception package", "amount": 220 }],
                "formula_lines": ["100 guests x $220 = $22,000"],
                "unknowns": ["overtime rate"],
                "follow_up_questions": ["What is the overtime rate?"]
            }]
        });
        let pdf = build_quote_pdf(&snapshot);
        assert!(pdf.starts_with(b"%PDF-1.4"));
        let rendered = String::from_utf8_lossy(&pdf);
        assert!(rendered.contains("Harbour Garden"));
        assert!(rendered.contains("100 guests x $220 = $22,000"));
        assert!(rendered.ends_with("%%EOF\n"));
    }
}
