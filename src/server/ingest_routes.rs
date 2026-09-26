// @locs-version: 1.0
// @module-id: server.ingest-routes
// @primary-capability: ingestion-http-routes
// @stability: beta

use super::*;
use crate::cost_oracle::{CostRecord, CostType};
use crate::gateway::rest_adapter::validate_public_http_url;
use crate::message::{
    AFP_TYPE_CHART_SPEC, AFP_TYPE_CONTENT_DIGEST_RESULT, AFP_TYPE_DATASET_REVISION,
    AFP_TYPE_DOCUMENT_EXTRACT_RESULT, AFP_TYPE_PARSED_DOCUMENT, AFP_TYPE_TABULAR_DATASET,
    AFP_TYPE_TRANSCRIPT, AfpChartSpec, AfpContentDigestResult, AfpDatasetRevision,
    AfpDocumentExtractResult, AfpMultimodalIngestRequest, AfpParsedDocument, AfpTabularDataset,
    AfpTranscript, AfpTranscriptSegment,
};
use chrono::Datelike as _;
use std::collections::BTreeSet;

pub(super) fn routes() -> Router<Arc<AppState>> {
    Router::new()
        .route(
            "/ingest/capabilities",
            get(attachment_ingest_capabilities_http),
        )
        .route(
            "/ingest/attachment-batch",
            post(ingest_attachment_batch_http),
        )
        .route("/ingest/cleanup", post(cleanup_ingest_outputs_http))
        .route("/ingest/persist", post(persist_ingest_outputs_http))
        .route("/ingest/document", post(ingest_document_http))
        .route("/ingest/extract", post(extract_document_http))
        .route("/ingest/dataset/review", post(review_dataset_http))
        .route("/ingest/chart", post(create_chart_http))
        .route("/ingest/weather", post(ingest_weather_http))
        .route("/ingest/budget", post(ingest_budget_http))
        .route("/ingest/digest", post(digest_content_http))
        .route("/ingest/audio", post(ingest_audio_http))
        .route("/ingest/drop", post(ingest_drop_http))
}

#[derive(serde::Deserialize)]
pub(super) struct IngestDocumentRequest {
    pub thread_id: String,
    #[serde(default)]
    pub source_url: Option<String>,
    #[serde(default)]
    pub source_kind: Option<String>,
    #[serde(default)]
    pub source_message_id: Option<String>,
    #[serde(default)]
    pub source_attachment_id: Option<String>,
    #[serde(default)]
    pub mime_type: Option<String>,
    /// "mineru" | "llamaparse" | "unstructured" | "readability"
    #[serde(default)]
    pub parser: Option<String>,
}

#[derive(serde::Deserialize)]
pub(super) struct IngestAudioRequest {
    pub thread_id: String,
    #[serde(default)]
    pub source_url: Option<String>,
    #[serde(default)]
    pub source_kind: Option<String>,
    #[serde(default)]
    pub source_message_id: Option<String>,
    #[serde(default)]
    pub source_attachment_id: Option<String>,
    #[serde(default)]
    pub mime_type: Option<String>,
    /// "whisper-1" | "whisper-large-v3" | custom
    #[serde(default)]
    pub model: Option<String>,
    /// BCP-47 language hint (null = auto-detect)
    #[serde(default)]
    pub language: Option<String>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum AttachmentRetentionMode {
    KeepFile,
    KeepExtractedOnly,
    KeepNothing,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum KnowledgeOrganizationMode {
    Standard,
    ConnectedNotes,
    Zettelkasten,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum AttachmentSupportMode {
    InlineText,
    ServerProcessing,
    NotSupportedYet,
}

#[derive(serde::Deserialize)]
pub(super) struct AttachmentBatchUpload {
    source_message_id: String,
    #[serde(default)]
    attachment_id: Option<String>,
    #[serde(default)]
    file_name: Option<String>,
    #[serde(default)]
    mime_type: Option<String>,
    #[serde(default)]
    inline_text: Option<String>,
    #[serde(default)]
    inline_content_type: Option<String>,
    #[serde(default)]
    extraction_mode: Option<String>,
}

#[derive(serde::Deserialize)]
pub(super) struct AttachmentBatchIngestRequest {
    thread_id: String,
    #[serde(default)]
    query: Option<String>,
    retention_mode: String,
    #[serde(default)]
    knowledge_mode: Option<String>,
    uploads: Vec<AttachmentBatchUpload>,
}

#[derive(serde::Deserialize)]
pub(super) struct CleanupIngestOutputsRequest {
    message_ids: Vec<String>,
}

#[derive(serde::Deserialize)]
pub(super) struct PersistIngestOutputsRequest {
    message_ids: Vec<String>,
}

const ATTACHMENT_BATCH_MAX_UPLOADS: usize = 12;
const ATTACHMENT_CLEANUP_MAX_MESSAGE_IDS: usize = 24;

#[derive(serde::Deserialize)]
pub(super) struct ExtractDocumentRequest {
    pub thread_id: String,
    pub source_message_id: String,
    #[serde(default)]
    pub delimiter: Option<String>,
    #[serde(default)]
    pub has_header: Option<bool>,
    #[serde(default)]
    pub title: Option<String>,
}

#[derive(serde::Deserialize)]
pub(super) struct ReviewDatasetRequest {
    pub thread_id: String,
    pub dataset_message_id: String,
    pub decision: String,
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default)]
    pub columns: Option<Vec<String>>,
    #[serde(default)]
    pub rows: Option<Vec<Vec<String>>>,
    #[serde(default)]
    pub notes: Vec<String>,
}

#[derive(serde::Deserialize)]
pub(super) struct CreateChartRequest {
    pub thread_id: String,
    pub dataset_message_id: String,
    #[serde(default)]
    pub chart_type: Option<String>,
    #[serde(default)]
    pub label_column: Option<String>,
    #[serde(default)]
    pub value_columns: Option<Vec<String>>,
    #[serde(default)]
    pub title: Option<String>,
}

#[derive(serde::Deserialize)]
pub(super) struct IngestWeatherRequest {
    pub thread_id: String,
    pub location_query: String,
    #[serde(default)]
    pub days: Option<u8>,
    #[serde(default)]
    pub auto_chart: Option<bool>,
}

#[derive(serde::Deserialize)]
pub(super) struct IngestBudgetRequest {
    pub thread_id: String,
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default)]
    pub persona: Option<String>,
    #[serde(default)]
    pub months: Option<u8>,
    #[serde(default)]
    pub monthly_income: Option<f64>,
    #[serde(default)]
    pub fixed_expenses: Option<f64>,
    #[serde(default)]
    pub variable_expenses: Option<f64>,
    #[serde(default)]
    pub savings_goal: Option<f64>,
    #[serde(default)]
    pub auto_chart: Option<bool>,
}

#[derive(serde::Deserialize)]
pub(super) struct DigestContentRequest {
    pub thread_id: String,
    pub source_message_id: String,
}

fn quality_status_from_confidence(confidence: f64, warnings: &[String]) -> String {
    if confidence >= 0.9 && warnings.is_empty() {
        "reviewed".to_string()
    } else if confidence >= 0.8 && warnings.len() <= 1 {
        "draft".to_string()
    } else {
        "review_required".to_string()
    }
}

fn normalize_chart_type(value: Option<&str>) -> String {
    match value.unwrap_or("line").trim().to_ascii_lowercase().as_str() {
        "bar" => "bar".to_string(),
        "pie" => "pie".to_string(),
        "doughnut" => "doughnut".to_string(),
        _ => "line".to_string(),
    }
}

#[derive(serde::Deserialize)]
struct OpenMeteoGeocodeResponse {
    #[serde(default)]
    results: Vec<OpenMeteoGeocodeResult>,
}

#[derive(serde::Deserialize)]
struct OpenMeteoGeocodeResult {
    name: String,
    latitude: f64,
    longitude: f64,
    #[serde(default)]
    country: Option<String>,
    #[serde(default)]
    admin1: Option<String>,
    #[serde(default)]
    timezone: Option<String>,
}

#[derive(serde::Deserialize)]
struct OpenMeteoForecastResponse {
    daily: OpenMeteoDailyForecast,
}

#[derive(serde::Deserialize)]
struct OpenMeteoDailyForecast {
    time: Vec<String>,
    #[serde(default)]
    temperature_2m_max: Vec<f64>,
    #[serde(default)]
    temperature_2m_min: Vec<f64>,
    #[serde(default)]
    precipitation_sum: Vec<f64>,
    #[serde(default)]
    weather_code: Vec<i64>,
}

pub(super) struct WeatherIngestOutcome {
    pub dataset_message: AFPMessage,
    pub chart_message: Option<AFPMessage>,
    pub dataset_id: String,
    pub title: String,
    pub location_label: String,
    pub days: u8,
}

pub(super) struct BudgetProjectionOutcome {
    pub dataset_message: AFPMessage,
    pub chart_message: Option<AFPMessage>,
    pub dataset_id: String,
    pub title: String,
    pub months: u8,
    pub warnings: Vec<String>,
}

pub(super) struct ContentDigestOutcome {
    pub digest_message: AFPMessage,
    pub title: String,
    pub summary: String,
    pub action_items: Vec<String>,
}

#[derive(Clone)]
struct AttachmentIngestOutcome {
    source_message_id: String,
    source_attachment_id: Option<String>,
    file_name: Option<String>,
    mime_type: Option<String>,
    output_message_id: String,
    output_type: String,
    supertags: Vec<String>,
    extraction_mode: String,
    inline_extracted: bool,
    support_mode: &'static str,
    support_label: &'static str,
    support_description: &'static str,
    cost_usd: Option<f64>,
    cost_source: Option<String>,
    academic_kind: Option<String>,
    academic_course_tag: Option<String>,
    academic_week_tag: Option<String>,
    academic_lecture_tag: Option<String>,
    academic_chapter_tag: Option<String>,
    academic_unit_tag: Option<String>,
    academic_summary: Option<String>,
    zettelkasten_stage: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
enum ResolvedSourcePayload {
    RemoteUrl(String),
    InlineBytes {
        bytes: Vec<u8>,
        file_name: Option<String>,
    },
}

#[derive(Clone, Debug, PartialEq, Eq)]
struct ResolvedIngestSource {
    payload: ResolvedSourcePayload,
    source_url: Option<String>,
    source_kind: String,
    source_message_id: Option<String>,
    source_attachment_id: Option<String>,
    mime_type: Option<String>,
}

async fn validate_remote_source_url(source_url: &str) -> Result<(), (StatusCode, String)> {
    validate_public_http_url(source_url)
        .await
        .map_err(|err| (StatusCode::BAD_REQUEST, err))
}

fn parse_attachment_retention_mode(value: &str) -> AttachmentRetentionMode {
    match value.trim() {
        "keep_file" => AttachmentRetentionMode::KeepFile,
        "keep_nothing" => AttachmentRetentionMode::KeepNothing,
        _ => AttachmentRetentionMode::KeepExtractedOnly,
    }
}

fn parse_knowledge_organization_mode(value: Option<&str>) -> KnowledgeOrganizationMode {
    match value.unwrap_or("").trim() {
        "standard" => KnowledgeOrganizationMode::Standard,
        "zettelkasten" => KnowledgeOrganizationMode::Zettelkasten,
        _ => KnowledgeOrganizationMode::ConnectedNotes,
    }
}

fn knowledge_organization_mode_value(mode: KnowledgeOrganizationMode) -> &'static str {
    match mode {
        KnowledgeOrganizationMode::Standard => "standard",
        KnowledgeOrganizationMode::ConnectedNotes => "connected_notes",
        KnowledgeOrganizationMode::Zettelkasten => "zettelkasten",
    }
}

fn knowledge_organization_mode_tag(mode: KnowledgeOrganizationMode) -> &'static str {
    match mode {
        KnowledgeOrganizationMode::Standard => "knowledge_mode:standard",
        KnowledgeOrganizationMode::ConnectedNotes => "knowledge_mode:connected_notes",
        KnowledgeOrganizationMode::Zettelkasten => "knowledge_mode:zettelkasten",
    }
}

fn normalize_topic_tag(raw: &str) -> Option<String> {
    let slug = raw
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() {
                ch.to_ascii_lowercase()
            } else {
                '_'
            }
        })
        .collect::<String>()
        .split('_')
        .filter(|segment| !segment.is_empty())
        .collect::<Vec<_>>()
        .join("_");
    if slug.len() < 3 { None } else { Some(slug) }
}

fn retention_mode_tag(retention_mode: AttachmentRetentionMode) -> &'static str {
    match retention_mode {
        AttachmentRetentionMode::KeepFile => "retention:keep_file",
        AttachmentRetentionMode::KeepExtractedOnly => "retention:keep_extracted_only",
        AttachmentRetentionMode::KeepNothing => "retention:keep_nothing",
    }
}

fn retention_mode_value(retention_mode: AttachmentRetentionMode) -> &'static str {
    match retention_mode {
        AttachmentRetentionMode::KeepFile => "keep_file",
        AttachmentRetentionMode::KeepExtractedOnly => "keep_extracted_only",
        AttachmentRetentionMode::KeepNothing => "keep_nothing",
    }
}

fn retention_mode_label(retention_mode: AttachmentRetentionMode) -> &'static str {
    match retention_mode {
        AttachmentRetentionMode::KeepFile => "Keep files and extracted knowledge",
        AttachmentRetentionMode::KeepExtractedOnly => "Keep extracted knowledge only",
        AttachmentRetentionMode::KeepNothing => "Keep nothing after this run",
    }
}

fn retention_source_persisted(retention_mode: AttachmentRetentionMode) -> bool {
    matches!(retention_mode, AttachmentRetentionMode::KeepFile)
}

fn retention_derived_content_persisted(retention_mode: AttachmentRetentionMode) -> bool {
    !matches!(retention_mode, AttachmentRetentionMode::KeepNothing)
}

fn retention_cleanup_required(retention_mode: AttachmentRetentionMode) -> bool {
    matches!(retention_mode, AttachmentRetentionMode::KeepNothing)
}

fn apply_knowledge_mode_tags(
    tags: &mut BTreeSet<String>,
    knowledge_mode: KnowledgeOrganizationMode,
) {
    tags.insert(knowledge_organization_mode_tag(knowledge_mode).to_string());
    match knowledge_mode {
        KnowledgeOrganizationMode::Standard => {}
        KnowledgeOrganizationMode::ConnectedNotes => {
            tags.insert("knowledge:connected_notes".to_string());
        }
        KnowledgeOrganizationMode::Zettelkasten => {
            tags.insert("resource:zettelkasten".to_string());
            tags.insert("knowledge:zettelkasten".to_string());
            tags.insert("zk:source_note".to_string());
            tags.insert("zk:review_pending".to_string());
        }
    }
}

#[derive(Default)]
struct AttachmentSemanticMetadata {
    academic_kind: Option<String>,
    academic_course_tag: Option<String>,
    academic_week_tag: Option<String>,
    academic_lecture_tag: Option<String>,
    academic_chapter_tag: Option<String>,
    academic_unit_tag: Option<String>,
    academic_module_tag: Option<String>,
    academic_instructor_tag: Option<String>,
    academic_summary: Option<String>,
    zettelkasten_stage: Option<String>,
    zettelkasten_entry_type: Option<String>,
    zettelkasten_next_action: Option<String>,
    knowledge_graph_seed: bool,
    knowledge_graph_group_key: Option<String>,
    knowledge_graph_link_tags: Vec<String>,
}

fn split_semantic_tokens(text: &str) -> Vec<String> {
    text.split(|ch: char| !ch.is_ascii_alphanumeric())
        .filter_map(|token| {
            let trimmed = token.trim();
            if trimmed.is_empty() {
                None
            } else {
                Some(trimmed.to_ascii_lowercase())
            }
        })
        .collect()
}

fn parse_bounded_number(token: Option<&str>, min: u32, max: u32) -> Option<u32> {
    let value = token?.trim().parse::<u32>().ok()?;
    if (min..=max).contains(&value) {
        Some(value)
    } else {
        None
    }
}

fn infer_numbered_academic_tags(tokens: &[String], tags: &mut BTreeSet<String>) {
    for (index, token) in tokens.iter().enumerate() {
        let next = tokens.get(index + 1).map(String::as_str);
        match token.as_str() {
            "week" | "wk" => {
                if let Some(value) = parse_bounded_number(next, 1, 52) {
                    tags.insert("academic:weekly_material".to_string());
                    tags.insert(format!("week:{value}"));
                }
            }
            "lecture" | "lec" => {
                if let Some(value) = parse_bounded_number(next, 1, 52) {
                    tags.insert("academic:lecture".to_string());
                    tags.insert(format!("lecture:{value}"));
                }
            }
            "module" => {
                if let Some(value) = parse_bounded_number(next, 1, 40) {
                    tags.insert(format!("module:{value}"));
                }
            }
            "unit" => {
                if let Some(value) = parse_bounded_number(next, 1, 40) {
                    tags.insert(format!("module:{value}"));
                    tags.insert(format!("unit:{value}"));
                }
            }
            "chapter" => {
                if let Some(value) = parse_bounded_number(next, 1, 100) {
                    tags.insert(format!("chapter:{value}"));
                }
            }
            _ => {}
        }
        if token.len() >= 4
            && token.chars().any(|ch| ch.is_ascii_alphabetic())
            && token.chars().any(|ch| ch.is_ascii_digit())
        {
            let split_index = token
                .char_indices()
                .find_map(|(idx, ch)| ch.is_ascii_digit().then_some(idx));
            if let Some(idx) = split_index {
                let (letters, digits) = token.split_at(idx);
                if (2..=8).contains(&letters.len())
                    && (2..=4).contains(&digits.len())
                    && letters.chars().all(|ch| ch.is_ascii_alphabetic())
                    && digits.chars().all(|ch| ch.is_ascii_digit())
                {
                    tags.insert("academic:course_context".to_string());
                    tags.insert(format!("course:{letters}{digits}"));
                }
            }
        }
    }
}

fn infer_course_and_instructor_tags(tokens: &[String], tags: &mut BTreeSet<String>) {
    for (index, token) in tokens.iter().enumerate() {
        let next = tokens.get(index + 1).map(String::as_str);
        if matches!(token.as_str(), "course" | "subject" | "class" | "unit")
            && let (Some(prefix), Some(number)) = (next, tokens.get(index + 2).map(String::as_str))
            && prefix.chars().all(|ch| ch.is_ascii_alphabetic())
            && (2..=8).contains(&prefix.len())
            && number.chars().all(|ch| ch.is_ascii_digit())
            && (2..=4).contains(&number.len())
        {
            tags.insert("academic:course_context".to_string());
            tags.insert(format!("course:{prefix}{number}"));
        }
        if matches!(
            token.as_str(),
            "prof" | "professor" | "lecturer" | "tutor" | "dr"
        ) && let Some(candidate) = next
            && candidate.chars().all(|ch| ch.is_ascii_alphabetic())
            && candidate.len() >= 3
            && let Some(tag) = normalize_topic_tag(candidate)
        {
            tags.insert("academic:course_context".to_string());
            tags.insert(format!("instructor:{tag}"));
        }
    }
}

fn infer_semantic_context_tags(text: &str, tags: &mut BTreeSet<String>) {
    infer_academic_context_tags(text, tags);
    let tokens = split_semantic_tokens(text);
    infer_numbered_academic_tags(&tokens, tags);
    infer_course_and_instructor_tags(&tokens, tags);
}

fn apply_academic_resource_tags(tags: &mut BTreeSet<String>) {
    if tags.contains("academic:assignment") {
        tags.insert("resource:assignment_brief".to_string());
    }
    if tags.contains("academic:tutorial") {
        tags.insert("resource:tutorial_sheet".to_string());
    }
    if tags.contains("academic:lab") {
        tags.insert("resource:lab_material".to_string());
    }
    if tags.contains("academic:exam") || tags.contains("academic:quiz") {
        tags.insert("resource:exam_revision".to_string());
    }
    if tags.contains("academic:syllabus") {
        tags.insert("resource:course_outline".to_string());
    }
    if tags.contains("academic:notes") {
        tags.insert("resource:study_notes".to_string());
    }
}

fn first_tag_with_prefix(tags: &[String], prefix: &str) -> Option<String> {
    tags.iter().find(|tag| tag.starts_with(prefix)).cloned()
}

fn graph_link_tag(tag: &str) -> bool {
    matches!(
        tag.split_once(':').map(|(prefix, _)| prefix),
        Some(
            "academic"
                | "course"
                | "week"
                | "lecture"
                | "chapter"
                | "unit"
                | "module"
                | "instructor"
                | "topic"
                | "resource"
                | "knowledge"
                | "zk"
        )
    )
}

fn first_graph_group_key(tags: &[String], source_file_name: Option<&str>) -> Option<String> {
    const PRIORITY_PREFIXES: [&str; 9] = [
        "course:",
        "week:",
        "lecture:",
        "chapter:",
        "unit:",
        "module:",
        "topic:",
        "instructor:",
        "resource:",
    ];
    PRIORITY_PREFIXES
        .iter()
        .find_map(|prefix| first_tag_with_prefix(tags, prefix))
        .or_else(|| {
            source_file_name
                .and_then(normalize_topic_tag)
                .map(|tag| format!("source:{tag}"))
        })
}

fn attachment_academic_kind(tags: &[String]) -> Option<String> {
    let tag_set = tags.iter().map(String::as_str).collect::<BTreeSet<_>>();
    if tag_set.contains("academic:lecture") && tag_set.contains("academic:slides") {
        return Some("lecture slides".to_string());
    }
    if tag_set.contains("academic:lecture") && tag_set.contains("source:audio") {
        return Some("lecture recording".to_string());
    }
    if tag_set.contains("academic:reading") {
        return Some("reading".to_string());
    }
    if tag_set.contains("academic:assignment") {
        return Some("assignment brief".to_string());
    }
    if tag_set.contains("academic:tutorial") {
        return Some("tutorial material".to_string());
    }
    if tag_set.contains("academic:lab") {
        return Some("lab material".to_string());
    }
    if tag_set.contains("academic:exam") || tag_set.contains("academic:quiz") {
        return Some("exam revision material".to_string());
    }
    if tag_set.contains("academic:syllabus") {
        return Some("course outline".to_string());
    }
    if tag_set.contains("academic:notes") {
        return Some("study notes".to_string());
    }
    None
}

fn infer_attachment_semantic_metadata(
    canonical_supertags: &[String],
    source_file_name: Option<&str>,
    knowledge_mode: KnowledgeOrganizationMode,
) -> AttachmentSemanticMetadata {
    let academic_kind = attachment_academic_kind(canonical_supertags);
    let academic_course_tag = first_tag_with_prefix(canonical_supertags, "course:");
    let academic_week_tag = first_tag_with_prefix(canonical_supertags, "week:");
    let academic_lecture_tag = first_tag_with_prefix(canonical_supertags, "lecture:");
    let academic_chapter_tag = first_tag_with_prefix(canonical_supertags, "chapter:");
    let academic_unit_tag = first_tag_with_prefix(canonical_supertags, "unit:");
    let academic_module_tag = first_tag_with_prefix(canonical_supertags, "module:");
    let academic_instructor_tag = first_tag_with_prefix(canonical_supertags, "instructor:");
    let zettelkasten_stage = matches!(knowledge_mode, KnowledgeOrganizationMode::Zettelkasten)
        .then_some("source_note_review_pending".to_string());
    let zettelkasten_entry_type = matches!(knowledge_mode, KnowledgeOrganizationMode::Zettelkasten)
        .then_some("source_note".to_string());
    let zettelkasten_next_action = matches!(knowledge_mode, KnowledgeOrganizationMode::Zettelkasten)
        .then_some("Review this source note and write a permanent note that states how it changes, supports, or challenges your existing thinking.".to_string());
    let knowledge_graph_link_tags = canonical_supertags
        .iter()
        .filter(|tag| graph_link_tag(tag))
        .cloned()
        .collect::<Vec<_>>();
    let knowledge_graph_seed = matches!(
        knowledge_mode,
        KnowledgeOrganizationMode::ConnectedNotes | KnowledgeOrganizationMode::Zettelkasten
    ) || !knowledge_graph_link_tags.is_empty();
    let knowledge_graph_group_key = first_graph_group_key(canonical_supertags, source_file_name);

    let mut summary_parts = Vec::new();
    if let Some(kind) = academic_kind.clone() {
        summary_parts.push(kind);
    }
    if let Some(course) = academic_course_tag.clone() {
        summary_parts.push(course.replace(':', " "));
    }
    if let Some(week) = academic_week_tag.clone() {
        summary_parts.push(week.replace(':', " "));
    }
    if let Some(lecture) = academic_lecture_tag.clone() {
        let normalized = lecture.replace(':', " ");
        if !summary_parts.iter().any(|part| part == &normalized) {
            summary_parts.push(normalized);
        }
    }
    if let Some(chapter) = academic_chapter_tag.clone() {
        summary_parts.push(chapter.replace(':', " "));
    }
    if let Some(unit) = academic_unit_tag.clone() {
        summary_parts.push(unit.replace(':', " "));
    }
    if let Some(module) = academic_module_tag.clone() {
        summary_parts.push(module.replace(':', " "));
    }
    if let Some(instructor) = academic_instructor_tag.clone() {
        summary_parts.push(instructor.replace(':', " "));
    }
    let academic_summary = if summary_parts.is_empty() {
        source_file_name
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(|value| format!("{value} was ingested for study retrieval."))
    } else {
        Some(format!(
            "{} organized for study retrieval.",
            summary_parts.join(" | ")
        ))
    };

    AttachmentSemanticMetadata {
        academic_kind,
        academic_course_tag,
        academic_week_tag,
        academic_lecture_tag,
        academic_chapter_tag,
        academic_unit_tag,
        academic_module_tag,
        academic_instructor_tag,
        academic_summary,
        zettelkasten_stage,
        zettelkasten_entry_type,
        zettelkasten_next_action,
        knowledge_graph_seed,
        knowledge_graph_group_key,
        knowledge_graph_link_tags,
    }
}

fn infer_academic_context_tags(text: &str, tags: &mut BTreeSet<String>) {
    let lower = text.to_ascii_lowercase();
    let keyword_tags = [
        ("lecture", "academic:lecture"),
        ("slides", "academic:slides"),
        ("slide", "academic:slides"),
        ("assignment", "academic:assignment"),
        ("tutorial", "academic:tutorial"),
        ("lab", "academic:lab"),
        ("exam", "academic:exam"),
        ("midterm", "academic:exam"),
        ("quiz", "academic:quiz"),
        ("syllabus", "academic:syllabus"),
        ("reading", "academic:reading"),
        ("notes", "academic:notes"),
        ("study", "academic:study"),
        ("week", "academic:weekly_material"),
        ("semester", "academic:semester"),
        ("professor", "academic:course_context"),
        ("course", "academic:course_context"),
        ("uni", "audience:university_student"),
        ("university", "audience:university_student"),
    ];
    for (needle, tag) in keyword_tags {
        if lower.contains(needle) {
            tags.insert(tag.to_string());
        }
    }
}

fn lower_file_extension(file_name: Option<&str>) -> Option<String> {
    file_name
        .and_then(|name| name.rsplit_once('.').map(|(_, ext)| ext))
        .map(|ext| ext.trim().to_ascii_lowercase())
        .filter(|ext| !ext.is_empty())
}

fn attachment_support_descriptor(
    file_name: Option<&str>,
    mime_type: Option<&str>,
    has_inline_text: bool,
) -> (AttachmentSupportMode, &'static str, &'static str) {
    if has_inline_text {
        return (
            AttachmentSupportMode::InlineText,
            "Ready now",
            "This file can be read into connected notes immediately.",
        );
    }
    let ext = lower_file_extension(file_name);
    let mime = mime_type
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|value| value.to_ascii_lowercase());
    let is_pdf = mime.as_deref().is_some_and(|value| value.contains("pdf"))
        || matches!(ext.as_deref(), Some("pdf"));
    if is_pdf {
        if pdf_server_processing_supported() {
            return (
                AttachmentSupportMode::ServerProcessing,
                "Server PDF parse",
                "This PDF can be parsed into connected notes with the configured server document parser.",
            );
        }
        return (
            AttachmentSupportMode::NotSupportedYet,
            "PDF parser gap",
            "This PDF does not expose readable text yet and no server PDF parser is configured for connected notes.",
        );
    }
    if mime
        .as_deref()
        .is_some_and(|value| value.starts_with("audio/") || value.starts_with("video/"))
        || matches!(
            ext.as_deref(),
            Some("mp3" | "wav" | "m4a" | "aac" | "ogg" | "webm" | "mp4" | "mov")
        )
    {
        return (
            AttachmentSupportMode::ServerProcessing,
            "Server read",
            "This file depends on server-side transcription or parsing after upload.",
        );
    }
    if mime
        .as_deref()
        .is_some_and(|value| value.starts_with("image/"))
        || matches!(
            ext.as_deref(),
            Some("jpg" | "jpeg" | "png" | "gif" | "webp" | "svg" | "heic" | "heif")
        )
    {
        if image_ocr_supported() {
            return (
                AttachmentSupportMode::ServerProcessing,
                "Server OCR",
                "This image can be turned into connected notes with server-side OCR after upload.",
            );
        }
        return (
            AttachmentSupportMode::NotSupportedYet,
            "OCR gap",
            "Image notes and screenshots attach successfully, but OCR-based note synthesis is not implemented yet.",
        );
    }
    if matches!(ext.as_deref(), Some("doc" | "xls" | "ppt")) {
        return (
            AttachmentSupportMode::NotSupportedYet,
            "Legacy gap",
            "This legacy file format is not yet converted into connected notes reliably.",
        );
    }
    (
        AttachmentSupportMode::NotSupportedYet,
        "Limited",
        "This attachment can be stored, but note synthesis support is not confirmed yet.",
    )
}

fn infer_attachment_supertags(
    query: Option<&str>,
    file_name: Option<&str>,
    mime_type: Option<&str>,
    retention_mode: AttachmentRetentionMode,
    knowledge_mode: KnowledgeOrganizationMode,
) -> Vec<String> {
    let mut tags = BTreeSet::new();
    tags.insert("resource:study_material".to_string());
    tags.insert("source:attachment".to_string());
    tags.insert(retention_mode_tag(retention_mode).to_string());
    apply_knowledge_mode_tags(&mut tags, knowledge_mode);
    if let Some(mime) = mime_type.map(str::trim).filter(|value| !value.is_empty()) {
        let lower = mime.to_ascii_lowercase();
        if let Some((major, minor)) = lower.split_once('/') {
            tags.insert(format!("media:{major}"));
            let format_minor = minor.replace(['.', '+'], "_");
            if !format_minor.is_empty() {
                tags.insert(format!("format:{format_minor}"));
            }
        }
        if lower.starts_with("audio/") || lower.starts_with("video/") {
            tags.insert("source:audio".to_string());
            tags.insert("resource:lecture_capture".to_string());
            tags.insert("academic:lecture".to_string());
        } else {
            tags.insert("source:document".to_string());
        }
        if lower.contains("presentation")
            || lower.contains("powerpoint")
            || lower.contains("officedocument.presentationml")
        {
            tags.insert("resource:slide_deck".to_string());
            tags.insert("academic:slides".to_string());
        }
        if lower.contains("spreadsheet")
            || lower.contains("excel")
            || lower.contains("sheet")
            || lower.contains("csv")
        {
            tags.insert("resource:tabular_notes".to_string());
        }
        if lower.contains("pdf") {
            tags.insert("resource:reading".to_string());
        }
    }
    if let Some(name) = file_name {
        let lower = name.to_ascii_lowercase();
        if let Some((_, ext)) = lower.rsplit_once('.') {
            if !ext.is_empty() {
                tags.insert(format!("format:{ext}"));
            }
            match ext {
                "pptx" | "ppsx" | "potx" => {
                    tags.insert("resource:slide_deck".to_string());
                    tags.insert("academic:slides".to_string());
                }
                "xlsx" | "xlsm" | "xltx" | "xltm" | "csv" | "tsv" => {
                    tags.insert("resource:tabular_notes".to_string());
                }
                "pdf" => {
                    tags.insert("resource:reading".to_string());
                }
                "srt" | "vtt" => {
                    tags.insert("resource:transcript_text".to_string());
                }
                _ => {}
            }
        }
        infer_semantic_context_tags(name, &mut tags);
        for token in name
            .split(|ch: char| !ch.is_ascii_alphanumeric())
            .filter(|token| token.len() >= 4)
            .take(4)
        {
            if let Some(tag) = normalize_topic_tag(token) {
                tags.insert(format!("topic:{tag}"));
            }
        }
    }
    if let Some(text) = query {
        infer_semantic_context_tags(text, &mut tags);
        for token in text
            .split(|ch: char| !ch.is_ascii_alphanumeric())
            .filter(|token| token.len() >= 5)
            .take(4)
        {
            if let Some(tag) = normalize_topic_tag(token) {
                tags.insert(format!("topic:{tag}"));
            }
        }
    }
    apply_academic_resource_tags(&mut tags);
    tags.into_iter().collect()
}

fn extend_supertags_for_extraction(
    base_tags: Vec<String>,
    extraction_mode: &str,
    inline_extracted: bool,
) -> Vec<String> {
    let mut tags = base_tags.into_iter().collect::<BTreeSet<_>>();
    if inline_extracted {
        tags.insert("pipeline:inline_extract".to_string());
    }
    let lower = extraction_mode.trim().to_ascii_lowercase();
    if !lower.is_empty() {
        tags.insert(format!("extraction:{lower}"));
    }
    if lower.contains("ocr") {
        tags.insert("pipeline:ocr".to_string());
        tags.insert("source:ocr_text".to_string());
        tags.insert("resource:ocr_document".to_string());
    } else if lower.contains("whisper") {
        tags.insert("pipeline:transcription".to_string());
    } else if lower.contains("mineru")
        || lower.contains("llamaparse")
        || lower.contains("unstructured")
        || lower.contains("readability")
    {
        tags.insert("pipeline:document_parser".to_string());
    } else if inline_extracted {
        tags.insert("pipeline:client_extract".to_string());
    }
    tags.into_iter().collect()
}

fn is_audio_like_source(mime_type: Option<&str>, file_name: Option<&str>) -> bool {
    if mime_type.is_some_and(|mime| {
        let lower = mime.to_ascii_lowercase();
        lower.starts_with("audio/") || lower.starts_with("video/")
    }) {
        return true;
    }
    file_name.is_some_and(|name| {
        let lower = name.to_ascii_lowercase();
        [
            ".mp3", ".wav", ".m4a", ".aac", ".ogg", ".webm", ".mp4", ".mov",
        ]
        .iter()
        .any(|ext| lower.ends_with(ext))
    })
}

fn inline_text_for_upload(upload: &AttachmentBatchUpload) -> Option<(&str, &str, &str)> {
    let text = upload.inline_text.as_deref()?.trim();
    if text.is_empty() {
        return None;
    }
    let content_type = upload
        .inline_content_type
        .as_deref()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or("text/plain");
    let extraction_mode = upload
        .extraction_mode
        .as_deref()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or("client_inline_text");
    Some((text, content_type, extraction_mode))
}

async fn lookup_private_message(
    db: &Db,
    user_id: &str,
    message_id: &str,
) -> Result<AFPMessage, (StatusCode, String)> {
    let payload = db
        .get_private_message_payload(user_id, message_id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?
        .ok_or_else(|| {
            (
                StatusCode::NOT_FOUND,
                format!("message '{message_id}' was not found"),
            )
        })?;
    serde_json::from_value(payload).map_err(|err| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("message '{message_id}' payload is invalid: {err}"),
        )
    })
}

async fn cleanup_uploaded_source_message(
    state: &Arc<AppState>,
    user_id: &str,
    message: &AFPMessage,
) -> Result<(), (StatusCode, String)> {
    for attachment in &message.attachments {
        let storage = attachment
            .get("storage")
            .and_then(serde_json::Value::as_object)
            .cloned()
            .unwrap_or_default();
        let backend = storage
            .get("backend")
            .and_then(serde_json::Value::as_str)
            .unwrap_or_default();
        let key = storage
            .get("key")
            .and_then(serde_json::Value::as_str)
            .unwrap_or_default();
        if !backend.is_empty() && !key.is_empty() {
            super::file_upload_routes::delete_uploaded_file(backend, key)
                .await
                .map_err(|err| (StatusCode::BAD_GATEWAY, err))?;
        }
        if let Some(attachment_id) = attachment.get("id").and_then(serde_json::Value::as_str) {
            state
                .db
                .delete_private_attachment_by_id(user_id, attachment_id)
                .await
                .map_err(internal_error)
                .map_err(status_to_http)?;
        }
    }
    state
        .db
        .delete_private_message_by_id(user_id, &message.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    Ok(())
}

async fn store_ingested_document_message(
    state: &Arc<AppState>,
    user_id: &str,
    thread_id: &str,
    to: Vec<String>,
    parsed: AfpParsedDocument,
    source_kind: &str,
    source_message_id: Option<String>,
    source_attachment_id: Option<String>,
    source_file_name: Option<String>,
    mime_type: Option<String>,
    supertags: Vec<String>,
    retention_mode: AttachmentRetentionMode,
    knowledge_mode: KnowledgeOrganizationMode,
    extraction_mode: Option<String>,
    ephemeral_output: bool,
) -> Result<String, (StatusCode, String)> {
    let canonical_supertags = state
        .db
        .canonicalize_supertags(user_id, &supertags)
        .await
        .map_err(internal_http_error)?;
    let semantic_metadata = infer_attachment_semantic_metadata(
        &canonical_supertags,
        source_file_name.as_deref(),
        knowledge_mode,
    );
    let text = parsed.content_text.clone();
    let title = parsed.title.clone();
    let page_count = parsed.page_count;
    let parser_used = parsed.parser_used.clone();
    let content = serde_json::to_value(&parsed).unwrap_or_default();
    let views = vec![serde_json::json!({
        "format": "parsed_document",
        "content": {
            "content_type": parsed.content_type,
            "parser_used": parser_used,
            "text": text,
            "title": title,
            "page_count": page_count,
        }
    })];
    let agent_id = format!(
        "agent:ingest@{}",
        std::env::var("OMNYID_DOMAIN").unwrap_or_else(|_| "local".to_string())
    );
    let mut message = new_server_message(
        agent_id,
        to,
        thread_id.to_string(),
        AFP_TYPE_PARSED_DOCUMENT,
        content,
        views,
        vec![serde_json::json!({
            "type": "ingested_from",
            "target": source_message_id.clone().unwrap_or_default(),
            "metadata": {
                "source_kind": source_kind,
                "source_attachment_id": source_attachment_id,
                "source_file_name": source_file_name,
                "mime_type": mime_type,
            }
        })],
        vec![],
        true,
    )
    .map_err(internal_http_error)?;
    message.supertags = canonical_supertags.clone();
    message.metadata = Some(serde_json::json!({
        "source_kind": source_kind,
        "source_message_id": source_message_id,
        "source_attachment_id": source_attachment_id,
        "source_file_name": source_file_name,
        "mime_type": mime_type,
        "retention_mode": retention_mode_tag(retention_mode),
        "attachment_retention_mode": retention_mode_value(retention_mode),
        "attachment_retention_label": retention_mode_label(retention_mode),
        "source_persisted": retention_source_persisted(retention_mode),
        "derived_content_persisted": retention_derived_content_persisted(retention_mode),
        "cleanup_required": retention_cleanup_required(retention_mode),
        "knowledge_mode": knowledge_organization_mode_value(knowledge_mode),
        "extraction_mode": extraction_mode,
        "knowledge_pipeline": "connected_notes_ingest",
        "supertags": canonical_supertags,
        "academic_kind": semantic_metadata.academic_kind,
        "academic_course_tag": semantic_metadata.academic_course_tag,
        "academic_week_tag": semantic_metadata.academic_week_tag,
        "academic_lecture_tag": semantic_metadata.academic_lecture_tag,
        "academic_chapter_tag": semantic_metadata.academic_chapter_tag,
        "academic_unit_tag": semantic_metadata.academic_unit_tag,
        "academic_module_tag": semantic_metadata.academic_module_tag,
        "academic_instructor_tag": semantic_metadata.academic_instructor_tag,
        "academic_summary": semantic_metadata.academic_summary,
        "zettelkasten_stage": semantic_metadata.zettelkasten_stage,
        "zettelkasten_entry_type": semantic_metadata.zettelkasten_entry_type,
        "zettelkasten_next_action": semantic_metadata.zettelkasten_next_action,
        "knowledge_graph_seed": semantic_metadata.knowledge_graph_seed,
        "knowledge_graph_group_key": semantic_metadata.knowledge_graph_group_key,
        "knowledge_graph_link_tags": semantic_metadata.knowledge_graph_link_tags,
        "ephemeral_output": ephemeral_output,
    }));
    let msg_id = message.id.clone();
    store_private_app_message(&state.db, &state.metrics, &state.relay_tx, user_id, message)
        .await
        .map_err(internal_http_error)?;
    Ok(msg_id)
}

async fn store_ingested_transcript_message(
    state: &Arc<AppState>,
    user_id: &str,
    thread_id: &str,
    to: Vec<String>,
    transcript: AfpTranscript,
    source_kind: &str,
    source_message_id: Option<String>,
    source_attachment_id: Option<String>,
    source_file_name: Option<String>,
    mime_type: Option<String>,
    supertags: Vec<String>,
    retention_mode: AttachmentRetentionMode,
    knowledge_mode: KnowledgeOrganizationMode,
    extraction_mode: Option<String>,
    ephemeral_output: bool,
) -> Result<String, (StatusCode, String)> {
    let canonical_supertags = state
        .db
        .canonicalize_supertags(user_id, &supertags)
        .await
        .map_err(internal_http_error)?;
    let semantic_metadata = infer_attachment_semantic_metadata(
        &canonical_supertags,
        source_file_name.as_deref(),
        knowledge_mode,
    );
    let text = transcript.text.clone();
    let language = transcript.language.clone();
    let duration_seconds = transcript.duration_seconds;
    let model_used = transcript.model_used.clone();
    let content = serde_json::to_value(&transcript).unwrap_or_default();
    let views = vec![serde_json::json!({
        "format": "transcript",
        "content": {
            "model_used": model_used,
            "language": language,
            "duration_seconds": duration_seconds,
            "text": text,
        }
    })];
    let agent_id = format!(
        "agent:ingest@{}",
        std::env::var("OMNYID_DOMAIN").unwrap_or_else(|_| "local".to_string())
    );
    let mut message = new_server_message(
        agent_id,
        to,
        thread_id.to_string(),
        AFP_TYPE_TRANSCRIPT,
        content,
        views,
        vec![serde_json::json!({
            "type": "ingested_from",
            "target": source_message_id.clone().unwrap_or_default(),
            "metadata": {
                "source_kind": source_kind,
                "source_attachment_id": source_attachment_id,
                "source_file_name": source_file_name,
                "mime_type": mime_type,
            }
        })],
        vec![],
        true,
    )
    .map_err(internal_http_error)?;
    message.supertags = canonical_supertags.clone();
    message.metadata = Some(serde_json::json!({
        "source_kind": source_kind,
        "source_message_id": source_message_id,
        "source_attachment_id": source_attachment_id,
        "source_file_name": source_file_name,
        "mime_type": mime_type,
        "retention_mode": retention_mode_tag(retention_mode),
        "attachment_retention_mode": retention_mode_value(retention_mode),
        "attachment_retention_label": retention_mode_label(retention_mode),
        "source_persisted": retention_source_persisted(retention_mode),
        "derived_content_persisted": retention_derived_content_persisted(retention_mode),
        "cleanup_required": retention_cleanup_required(retention_mode),
        "knowledge_mode": knowledge_organization_mode_value(knowledge_mode),
        "extraction_mode": extraction_mode,
        "knowledge_pipeline": "connected_notes_ingest",
        "supertags": canonical_supertags,
        "academic_kind": semantic_metadata.academic_kind,
        "academic_course_tag": semantic_metadata.academic_course_tag,
        "academic_week_tag": semantic_metadata.academic_week_tag,
        "academic_lecture_tag": semantic_metadata.academic_lecture_tag,
        "academic_chapter_tag": semantic_metadata.academic_chapter_tag,
        "academic_unit_tag": semantic_metadata.academic_unit_tag,
        "academic_module_tag": semantic_metadata.academic_module_tag,
        "academic_instructor_tag": semantic_metadata.academic_instructor_tag,
        "academic_summary": semantic_metadata.academic_summary,
        "zettelkasten_stage": semantic_metadata.zettelkasten_stage,
        "zettelkasten_entry_type": semantic_metadata.zettelkasten_entry_type,
        "zettelkasten_next_action": semantic_metadata.zettelkasten_next_action,
        "knowledge_graph_seed": semantic_metadata.knowledge_graph_seed,
        "knowledge_graph_group_key": semantic_metadata.knowledge_graph_group_key,
        "knowledge_graph_link_tags": semantic_metadata.knowledge_graph_link_tags,
        "ephemeral_output": ephemeral_output,
    }));
    let msg_id = message.id.clone();
    store_private_app_message(&state.db, &state.metrics, &state.relay_tx, user_id, message)
        .await
        .map_err(internal_http_error)?;
    Ok(msg_id)
}

fn first_string<'a>(value: &'a serde_json::Value, keys: &[&str]) -> Option<&'a str> {
    keys.iter()
        .find_map(|key| value.get(*key).and_then(serde_json::Value::as_str))
        .filter(|value| !value.trim().is_empty())
}

fn attachment_name(attachment: &serde_json::Value) -> Option<String> {
    attachment
        .get("name")
        .and_then(serde_json::Value::as_str)
        .map(str::to_string)
}

fn attachment_storage_value<'a>(
    attachment: &'a serde_json::Value,
    keys: &[&str],
) -> Option<&'a str> {
    attachment
        .get("storage")
        .and_then(|storage| first_string(storage, keys))
}

async fn attachment_payload_from_storage(
    attachment: &serde_json::Value,
) -> Result<Option<ResolvedSourcePayload>, String> {
    if let Some(source_url) = attachment_storage_value(attachment, &["url", "download_url"]) {
        return Ok(Some(ResolvedSourcePayload::RemoteUrl(
            source_url.to_string(),
        )));
    }

    let storage = attachment
        .get("storage")
        .and_then(serde_json::Value::as_object)
        .cloned()
        .unwrap_or_default();
    let storage_kind = storage
        .get("kind")
        .and_then(serde_json::Value::as_str)
        .or_else(|| storage.get("backend").and_then(serde_json::Value::as_str))
        .or_else(|| storage.get("type").and_then(serde_json::Value::as_str))
        .unwrap_or_default()
        .to_ascii_lowercase();

    let storage_value = serde_json::Value::Object(storage.clone());

    if ["inline", "inline_base64", "base64", "embedded"].contains(&storage_kind.as_str()) {
        let encoded = first_string(
            &storage_value,
            &["data_base64", "base64", "content_base64", "data"],
        )
        .ok_or_else(|| "attachment inline storage is missing base64 data".to_string())?;
        let bytes = base64::Engine::decode(&base64::engine::general_purpose::STANDARD, encoded)
            .map_err(|err| format!("attachment inline base64 decode failed: {err}"))?;
        return Ok(Some(ResolvedSourcePayload::InlineBytes {
            bytes,
            file_name: attachment_name(attachment),
        }));
    }

    if ["seaweedfs", "seaweedfs", "s3"].contains(&storage_kind.as_str())
        || storage.contains_key("object_key")
        || storage.contains_key("key")
    {
        let object_key = first_string(&storage_value, &["object_key", "key"])
            .ok_or_else(|| "attachment object storage is missing object_key".to_string())?;
        let client = crate::daemon_runtime::seaweedfs_client().ok_or_else(|| {
            "SeaweedFS is not configured for attachment-backed ingest".to_string()
        })?;
        let bytes = crate::daemon_runtime::download_archive_payload(&client, object_key).await?;
        return Ok(Some(ResolvedSourcePayload::InlineBytes {
            bytes,
            file_name: attachment_name(attachment),
        }));
    }

    Ok(None)
}

async fn resolve_source_from_message(
    message: &AFPMessage,
    preferred_attachment_id: Option<&str>,
    fallback_mime_type: Option<&str>,
) -> Result<ResolvedIngestSource, String> {
    let selected_attachment = preferred_attachment_id
        .and_then(|attachment_id| {
            message.attachments.iter().find(|attachment| {
                attachment.get("id").and_then(serde_json::Value::as_str) == Some(attachment_id)
            })
        })
        .or_else(|| message.attachments.first());

    let source_attachment_id = preferred_attachment_id
        .map(str::to_string)
        .or_else(|| first_string(&message.content, &["source_attachment_id"]).map(str::to_string))
        .or_else(|| {
            selected_attachment
                .and_then(|attachment| attachment.get("id").and_then(serde_json::Value::as_str))
                .map(str::to_string)
        });

    let mime_type = fallback_mime_type
        .map(str::to_string)
        .or_else(|| {
            selected_attachment
                .and_then(|attachment| {
                    attachment
                        .get("mime_type")
                        .and_then(serde_json::Value::as_str)
                })
                .map(str::to_string)
        })
        .or_else(|| first_string(&message.content, &["mime_type"]).map(str::to_string));

    if let Some(source_url) = first_string(&message.content, &["source_url", "url", "download_url"])
    {
        return Ok(ResolvedIngestSource {
            payload: ResolvedSourcePayload::RemoteUrl(source_url.to_string()),
            source_url: Some(source_url.to_string()),
            source_kind: "afp_message".to_string(),
            source_message_id: Some(message.id.clone()),
            source_attachment_id,
            mime_type,
        });
    }

    if let Some(attachment) = selected_attachment {
        if let Some(payload) = attachment_payload_from_storage(attachment).await? {
            let source_url = match &payload {
                ResolvedSourcePayload::RemoteUrl(url) => Some(url.clone()),
                ResolvedSourcePayload::InlineBytes { .. } => None,
            };
            return Ok(ResolvedIngestSource {
                payload,
                source_url,
                source_kind: "afp_message_attachment".to_string(),
                source_message_id: Some(message.id.clone()),
                source_attachment_id,
                mime_type,
            });
        }
    }

    Err(format!(
        "source_message_id '{}' does not contain a fetchable or embedded attachment source",
        message.id
    ))
}

async fn resolve_document_source(
    db: &Db,
    headers: &HeaderMap,
    req: &IngestDocumentRequest,
) -> Result<ResolvedIngestSource, (StatusCode, String)> {
    if let Some(source_url) = req
        .source_url
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        validate_remote_source_url(source_url).await?;
        return Ok(ResolvedIngestSource {
            payload: ResolvedSourcePayload::RemoteUrl(source_url.to_string()),
            source_url: Some(source_url.to_string()),
            source_kind: req
                .source_kind
                .clone()
                .unwrap_or_else(|| "web_url".to_string()),
            source_message_id: req.source_message_id.clone(),
            source_attachment_id: req.source_attachment_id.clone(),
            mime_type: req.mime_type.clone(),
        });
    }

    let Some(source_message_id) = req
        .source_message_id
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    else {
        return Err((
            StatusCode::BAD_REQUEST,
            "one of source_url or source_message_id is required".to_string(),
        ));
    };

    let thread_messages = thread_messages_for_headers(db, headers, &req.thread_id).await?;
    let source_message = thread_messages
        .into_iter()
        .find(|message| message.id == source_message_id)
        .map(proto_to_app)
        .ok_or_else(|| {
            (
                StatusCode::NOT_FOUND,
                format!(
                    "source_message_id '{}' was not found in thread '{}'",
                    source_message_id, req.thread_id
                ),
            )
        })?;

    resolve_source_from_message(
        &source_message,
        req.source_attachment_id.as_deref(),
        req.mime_type.as_deref(),
    )
    .await
    .map_err(|err| (StatusCode::BAD_REQUEST, err))
}

async fn resolve_audio_source(
    db: &Db,
    headers: &HeaderMap,
    req: &IngestAudioRequest,
) -> Result<ResolvedIngestSource, (StatusCode, String)> {
    if let Some(source_url) = req
        .source_url
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        validate_remote_source_url(source_url).await?;
        return Ok(ResolvedIngestSource {
            payload: ResolvedSourcePayload::RemoteUrl(source_url.to_string()),
            source_url: Some(source_url.to_string()),
            source_kind: req
                .source_kind
                .clone()
                .unwrap_or_else(|| "web_url".to_string()),
            source_message_id: req.source_message_id.clone(),
            source_attachment_id: req.source_attachment_id.clone(),
            mime_type: req.mime_type.clone(),
        });
    }

    let Some(source_message_id) = req
        .source_message_id
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    else {
        return Err((
            StatusCode::BAD_REQUEST,
            "one of source_url or source_message_id is required".to_string(),
        ));
    };

    let thread_messages = thread_messages_for_headers(db, headers, &req.thread_id).await?;
    let source_message = thread_messages
        .into_iter()
        .find(|message| message.id == source_message_id)
        .map(proto_to_app)
        .ok_or_else(|| {
            (
                StatusCode::NOT_FOUND,
                format!(
                    "source_message_id '{}' was not found in thread '{}'",
                    source_message_id, req.thread_id
                ),
            )
        })?;

    resolve_source_from_message(
        &source_message,
        req.source_attachment_id.as_deref(),
        req.mime_type.as_deref(),
    )
    .await
    .map_err(|err| (StatusCode::BAD_REQUEST, err))
}

fn decode_text_payload(bytes: &[u8], mime_type: &str) -> String {
    let text = String::from_utf8_lossy(bytes).to_string();
    if mime_type.contains("html") {
        text.split('<')
            .enumerate()
            .map(|(i, chunk)| {
                if i == 0 {
                    chunk.to_string()
                } else {
                    chunk.splitn(2, '>').nth(1).unwrap_or("").to_string()
                }
            })
            .collect::<Vec<_>>()
            .join(" ")
            .split_whitespace()
            .collect::<Vec<_>>()
            .join(" ")
    } else {
        text
    }
}

fn extract_text_from_pdf_bytes(_bytes: &[u8]) -> Result<String, String> {
    Err("local pdf extraction is not available in this build".to_string())
}

fn pdf_server_processing_supported() -> bool {
    std::env::var("OMNYID_MINERU_URL").is_ok() || std::env::var("OMNYID_LLAMAPARSE_KEY").is_ok()
}

pub(super) async fn attachment_ingest_capabilities_http()
-> Result<Json<serde_json::Value>, (StatusCode, String)> {
    Ok(Json(serde_json::json!({
        "image_ocr_supported": image_ocr_supported(),
        "pdf_server_processing_supported": pdf_server_processing_supported(),
        "legacy_office_supported": false,
        "generated_at": chrono::Utc::now().to_rfc3339(),
    })))
}

fn image_ocr_supported() -> bool {
    crate::secret_manager::read_process_secret_trimmed("OMNYID_OPENAI_API_KEY")
        .or_else(|| crate::secret_manager::read_process_secret_trimmed("OPENAI_API_KEY"))
        .is_some()
}

fn cleanup_target_is_ephemeral_ingest_output(
    message_type: &str,
    metadata: Option<&serde_json::Value>,
) -> bool {
    if message_type != AFP_TYPE_PARSED_DOCUMENT && message_type != AFP_TYPE_TRANSCRIPT {
        return false;
    }
    let Some(metadata) = metadata else {
        return false;
    };
    if metadata
        .get("knowledge_pipeline")
        .and_then(serde_json::Value::as_str)
        != Some("connected_notes_ingest")
    {
        return false;
    }
    metadata
        .get("ephemeral_output")
        .and_then(serde_json::Value::as_bool)
        == Some(true)
}

fn replace_retention_supertag(
    tags: &[String],
    retention_mode: AttachmentRetentionMode,
) -> Vec<String> {
    let mut deduped = Vec::with_capacity(tags.len() + 1);
    let mut seen = std::collections::HashSet::new();
    for tag in tags {
        if tag.starts_with("retention:") {
            continue;
        }
        if seen.insert(tag.clone()) {
            deduped.push(tag.clone());
        }
    }
    let next_retention_tag = retention_mode_tag(retention_mode).to_string();
    if seen.insert(next_retention_tag.clone()) {
        deduped.push(next_retention_tag);
    }
    deduped
}

fn persist_ephemeral_ingest_output(message: &mut AFPMessage) -> Result<(), (StatusCode, String)> {
    if !cleanup_target_is_ephemeral_ingest_output(&message.r#type, message.metadata.as_ref()) {
        return Err((
            StatusCode::BAD_REQUEST,
            format!(
                "message '{}' is not a temporary connected-notes ingest output",
                message.id
            ),
        ));
    }

    let updated_supertags = replace_retention_supertag(
        &message.supertags,
        AttachmentRetentionMode::KeepExtractedOnly,
    );
    let mut metadata = message
        .metadata
        .as_ref()
        .and_then(serde_json::Value::as_object)
        .cloned()
        .unwrap_or_default();

    metadata.insert(
        "retention_mode".to_string(),
        serde_json::Value::String(
            retention_mode_tag(AttachmentRetentionMode::KeepExtractedOnly).to_string(),
        ),
    );
    metadata.insert(
        "attachment_retention_mode".to_string(),
        serde_json::Value::String(
            retention_mode_value(AttachmentRetentionMode::KeepExtractedOnly).to_string(),
        ),
    );
    metadata.insert(
        "attachment_retention_label".to_string(),
        serde_json::Value::String(
            retention_mode_label(AttachmentRetentionMode::KeepExtractedOnly).to_string(),
        ),
    );
    metadata.insert(
        "source_persisted".to_string(),
        serde_json::Value::Bool(false),
    );
    metadata.insert(
        "derived_content_persisted".to_string(),
        serde_json::Value::Bool(true),
    );
    metadata.insert(
        "cleanup_required".to_string(),
        serde_json::Value::Bool(false),
    );
    metadata.insert(
        "ephemeral_output".to_string(),
        serde_json::Value::Bool(false),
    );
    metadata.insert(
        "supertags".to_string(),
        serde_json::Value::Array(
            updated_supertags
                .iter()
                .cloned()
                .map(serde_json::Value::String)
                .collect(),
        ),
    );

    message.supertags = updated_supertags;
    message.metadata = Some(serde_json::Value::Object(metadata));
    Ok(())
}

fn is_image_like_source(mime_type: Option<&str>, file_name: Option<&str>) -> bool {
    if mime_type.is_some_and(|mime| mime.to_ascii_lowercase().starts_with("image/")) {
        return true;
    }
    file_name.is_some_and(|name| {
        let lower = name.to_ascii_lowercase();
        [
            ".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".heic", ".heif",
        ]
        .iter()
        .any(|ext| lower.ends_with(ext))
    })
}

async fn read_source_bytes_for_ocr(
    source: &ResolvedIngestSource,
) -> Result<(Vec<u8>, Option<String>), String> {
    match &source.payload {
        ResolvedSourcePayload::InlineBytes { bytes, file_name } => {
            Ok((bytes.clone(), file_name.clone()))
        }
        ResolvedSourcePayload::RemoteUrl(source_url) => {
            let bytes = reqwest::Client::new()
                .get(source_url)
                .timeout(std::time::Duration::from_secs(60))
                .send()
                .await
                .map_err(|e| format!("image download failed: {e}"))?
                .bytes()
                .await
                .map_err(|e| format!("image read failed: {e}"))?;
            let file_name = source_url
                .rsplit('/')
                .next()
                .map(str::to_string)
                .filter(|value| !value.trim().is_empty());
            Ok((bytes.to_vec(), file_name))
        }
    }
}

fn infer_image_data_url_mime(file_name: Option<&str>, mime_type: &str) -> String {
    let lower = mime_type.trim().to_ascii_lowercase();
    if lower.starts_with("image/") {
        return lower;
    }
    match lower_file_extension(file_name) {
        Some(ext) if ext == "jpg" || ext == "jpeg" => "image/jpeg".to_string(),
        Some(ext) if ext == "png" => "image/png".to_string(),
        Some(ext) if ext == "gif" => "image/gif".to_string(),
        Some(ext) if ext == "webp" => "image/webp".to_string(),
        Some(ext) if ext == "svg" => "image/svg+xml".to_string(),
        Some(ext) if ext == "heic" => "image/heic".to_string(),
        Some(ext) if ext == "heif" => "image/heif".to_string(),
        _ => "image/png".to_string(),
    }
}

async fn call_image_ocr(
    source: &ResolvedIngestSource,
    mime_type: &str,
    file_name: Option<&str>,
) -> Result<String, String> {
    let api_key = crate::secret_manager::read_process_secret_trimmed("OMNYID_OPENAI_API_KEY")
        .or_else(|| crate::secret_manager::read_process_secret_trimmed("OPENAI_API_KEY"))
        .ok_or_else(|| "OMNYID_OPENAI_API_KEY not configured - needed for image OCR".to_string())?;
    let model =
        std::env::var("OMNYID_IMAGE_OCR_MODEL").unwrap_or_else(|_| "gpt-4o-mini".to_string());
    let (bytes, resolved_file_name) = read_source_bytes_for_ocr(source).await?;
    let effective_file_name = file_name.or(resolved_file_name.as_deref());
    let data_mime = infer_image_data_url_mime(effective_file_name, mime_type);
    let data_url = format!(
        "data:{};base64,{}",
        data_mime,
        base64::Engine::encode(&base64::engine::general_purpose::STANDARD, bytes)
    );
    let body = serde_json::json!({
        "model": model,
        "messages": [
            {
                "role": "system",
                "content": "You are an OCR assistant for a student knowledge graph. Extract all readable text from the image faithfully. Keep headings and bullet-like structure when visible. Do not summarize, interpret, or add commentary."
            },
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": "Extract the readable text from this image for connected notes."
                    },
                    {
                        "type": "image_url",
                        "image_url": { "url": data_url }
                    }
                ]
            }
        ],
        "max_tokens": 1600,
        "temperature": 0
    });
    let response: serde_json::Value = reqwest::Client::new()
        .post("https://api.openai.com/v1/chat/completions")
        .bearer_auth(&api_key)
        .header("Content-Type", "application/json")
        .json(&body)
        .timeout(std::time::Duration::from_secs(120))
        .send()
        .await
        .map_err(|e| format!("image OCR request failed: {e}"))?
        .json()
        .await
        .map_err(|e| format!("image OCR response parse error: {e}"))?;
    let text = response["choices"][0]["message"]["content"]
        .as_str()
        .unwrap_or("")
        .trim()
        .to_string();
    if text.is_empty() {
        return Err("image OCR returned no readable text".to_string());
    }
    Ok(text)
}

fn select_parser(mime_type: &str, override_parser: Option<&str>) -> &'static str {
    if let Some(p) = override_parser {
        return match p {
            "mineru" => "mineru",
            "llamaparse" => "llamaparse",
            "pdf_unavailable" => "pdf_unavailable",
            _ => "readability",
        };
    }
    if mime_type.contains("pdf") {
        if std::env::var("OMNYID_MINERU_URL").is_ok() {
            "mineru"
        } else if std::env::var("OMNYID_LLAMAPARSE_KEY").is_ok() {
            "llamaparse"
        } else {
            "pdf_unavailable"
        }
    } else {
        "readability"
    }
}

fn select_whisper_model(override_model: Option<&str>) -> String {
    override_model
        .map(String::from)
        .or_else(|| std::env::var("OMNYID_WHISPER_MODEL").ok())
        .unwrap_or_else(|| "whisper-1".to_string())
}

fn read_env_f64(name: &str) -> Option<f64> {
    std::env::var(name)
        .ok()
        .and_then(|value| value.trim().parse::<f64>().ok())
        .filter(|value| value.is_finite() && *value >= 0.0)
}

fn estimate_document_ingest_cost_usd(parser_family: &str) -> f64 {
    match parser_family {
        "mineru" => read_env_f64("OMNYID_MINERU_COST_USD_PER_DOCUMENT").unwrap_or(0.01),
        "llamaparse" => read_env_f64("OMNYID_LLAMAPARSE_COST_USD_PER_DOCUMENT").unwrap_or(0.015),
        _ => 0.0,
    }
}

fn estimate_audio_transcription_cost_usd(duration_seconds: Option<f64>) -> f64 {
    let duration_seconds = duration_seconds.unwrap_or(0.0);
    if !duration_seconds.is_finite() || duration_seconds <= 0.0 {
        return 0.0;
    }
    let per_minute = read_env_f64("OMNYID_WHISPER_COST_USD_PER_MINUTE").unwrap_or(0.006);
    let billable_minutes = (duration_seconds / 60.0).max(1.0);
    per_minute * billable_minutes
}

fn estimate_image_ocr_cost_usd() -> f64 {
    read_env_f64("OMNYID_IMAGE_OCR_COST_USD_PER_IMAGE").unwrap_or(0.003)
}

async fn record_ingest_cost(
    state: &Arc<AppState>,
    user_id: &str,
    thread_id: &str,
    cost_usd: f64,
    card_type: &str,
    source: &str,
    metadata: serde_json::Value,
) {
    if !cost_usd.is_finite() || cost_usd <= 0.0 {
        return;
    }
    let _ = state
        .cost_oracle
        .record_cost(CostRecord {
            user_id: user_id.to_string(),
            workflow_id: None,
            run_id: None,
            node_id: None,
            card_type: Some(card_type.to_string()),
            cost_usd,
            cost_type: CostType::Api,
            api_tier: 2,
            tokens_used: None,
            source: Some(source.to_string()),
            stage: Some(2),
            metadata: serde_json::json!({
                "thread_id": thread_id,
                "source": source,
                "cost_family": "multimodal_ingest",
                "details": metadata,
            }),
        })
        .await;
}

/// Returns `(text, page_count, title)`.
async fn call_parser(
    parser_family: &str,
    source: &ResolvedIngestSource,
    mime_type: &str,
) -> Result<(String, Option<u32>, Option<String>), String> {
    if let ResolvedSourcePayload::InlineBytes { bytes, .. } = &source.payload {
        if mime_type.contains("pdf") {
            return Ok((extract_text_from_pdf_bytes(bytes)?, None, None));
        }
        if parser_family == "readability"
            || mime_type.starts_with("text/")
            || mime_type.contains("json")
            || mime_type.contains("csv")
            || mime_type.contains("xml")
            || mime_type.contains("html")
            || mime_type.contains("markdown")
        {
            return Ok((decode_text_payload(bytes, mime_type), None, None));
        }
        return Err(
            "attachment-backed binary documents currently require a fetchable URL or a text-like attachment payload".to_string(),
        );
    }

    let source_url = match &source.payload {
        ResolvedSourcePayload::RemoteUrl(url) => url.as_str(),
        ResolvedSourcePayload::InlineBytes { .. } => unreachable!(),
    };

    match parser_family {
        "pdf_unavailable" => Err(
            "PDF parsing is not configured. Set OMNYID_MINERU_URL or OMNYID_LLAMAPARSE_KEY to ingest scanned or non-extractable PDFs."
                .to_string(),
        ),
        "mineru" => {
            let base = std::env::var("OMNYID_MINERU_URL")
                .map_err(|_| "OMNYID_MINERU_URL not configured".to_string())?;
            let client = reqwest::Client::new();
            let resp: serde_json::Value = client
                .post(format!("{base}/parse"))
                .json(&serde_json::json!({ "url": source_url, "mime_type": mime_type }))
                .timeout(std::time::Duration::from_secs(120))
                .send()
                .await
                .map_err(|e| format!("MinerU request failed: {e}"))?
                .json()
                .await
                .map_err(|e| format!("MinerU response error: {e}"))?;
            let text = resp["markdown"]
                .as_str()
                .or_else(|| resp["text"].as_str())
                .unwrap_or("")
                .to_string();
            Ok((
                text,
                resp["page_count"].as_u64().map(|p| p as u32),
                resp["title"].as_str().map(String::from),
            ))
        }
        "llamaparse" => {
            let api_key = std::env::var("OMNYID_LLAMAPARSE_KEY")
                .map_err(|_| "OMNYID_LLAMAPARSE_KEY not configured".to_string())?;
            let client = reqwest::Client::new();
            let upload: serde_json::Value = client
                .post("https://api.cloud.llamaindex.ai/api/parsing/upload")
                .header("Authorization", format!("Bearer {api_key}"))
                .json(&serde_json::json!({ "url": source_url }))
                .timeout(std::time::Duration::from_secs(30))
                .send()
                .await
                .map_err(|e| format!("LlamaParse upload failed: {e}"))?
                .json()
                .await
                .map_err(|e| format!("LlamaParse upload response error: {e}"))?;
            let job_id = upload["id"]
                .as_str()
                .ok_or_else(|| "LlamaParse: missing job id".to_string())?
                .to_string();
            for _ in 0..12 {
                tokio::time::sleep(std::time::Duration::from_secs(5)).await;
                let status: serde_json::Value = client
                    .get(format!(
                        "https://api.cloud.llamaindex.ai/api/parsing/job/{job_id}"
                    ))
                    .header("Authorization", format!("Bearer {api_key}"))
                    .send()
                    .await
                    .map_err(|e| format!("LlamaParse poll failed: {e}"))?
                    .json()
                    .await
                    .map_err(|e| format!("LlamaParse poll response error: {e}"))?;
                if status["status"].as_str() == Some("SUCCESS") {
                    break;
                }
            }
            let result: serde_json::Value = client
                .get(format!(
                    "https://api.cloud.llamaindex.ai/api/parsing/job/{job_id}/result/markdown"
                ))
                .header("Authorization", format!("Bearer {api_key}"))
                .send()
                .await
                .map_err(|e| format!("LlamaParse result fetch failed: {e}"))?
                .json()
                .await
                .map_err(|e| format!("LlamaParse result response error: {e}"))?;
            Ok((
                result["markdown"].as_str().unwrap_or("").to_string(),
                None,
                None,
            ))
        }
        "readability" => {
            let client = reqwest::Client::new();
            let html = client
                .get(source_url)
                .timeout(std::time::Duration::from_secs(30))
                .send()
                .await
                .map_err(|e| format!("fetch failed: {e}"))?
                .text()
                .await
                .map_err(|e| format!("read body failed: {e}"))?;
            let text: String = html
                .split('<')
                .enumerate()
                .map(|(i, chunk)| {
                    if i == 0 {
                        chunk.to_string()
                    } else {
                        chunk.splitn(2, '>').nth(1).unwrap_or("").to_string()
                    }
                })
                .collect::<Vec<_>>()
                .join(" ");
            let text = text.split_whitespace().collect::<Vec<_>>().join(" ");
            Ok((text, None, None))
        }
        other => Err(format!("document parser '{other}' is not implemented")),
    }
}

/// Returns `(text, language, duration_secs, segments)`.
async fn call_whisper(
    source: &ResolvedIngestSource,
    model: &str,
    language: Option<&str>,
) -> Result<
    (
        String,
        Option<String>,
        Option<f64>,
        Vec<AfpTranscriptSegment>,
    ),
    String,
> {
    let whisper_url = std::env::var("OMNYID_WHISPER_URL")
        .unwrap_or_else(|_| "https://api.openai.com/v1/audio/transcriptions".to_string());
    let api_key = crate::secret_manager::read_process_secret_trimmed("OMNYID_OPENAI_API_KEY")
        .or_else(|| crate::secret_manager::read_process_secret_trimmed("OPENAI_API_KEY"))
        .ok_or_else(|| "OMNYID_OPENAI_API_KEY not configured - needed for Whisper".to_string())?;

    let client = reqwest::Client::new();
    let (audio_bytes, filename) = match &source.payload {
        ResolvedSourcePayload::RemoteUrl(source_url) => {
            let audio_bytes = client
                .get(source_url)
                .timeout(std::time::Duration::from_secs(60))
                .send()
                .await
                .map_err(|e| format!("audio download failed: {e}"))?
                .bytes()
                .await
                .map_err(|e| format!("audio read failed: {e}"))?;
            let filename = source_url
                .rsplit('/')
                .next()
                .unwrap_or("audio.mp3")
                .to_string();
            (audio_bytes.to_vec(), filename)
        }
        ResolvedSourcePayload::InlineBytes { bytes, file_name } => (
            bytes.clone(),
            file_name.clone().unwrap_or_else(|| "audio.bin".to_string()),
        ),
    };

    let part = reqwest::multipart::Part::bytes(audio_bytes)
        .file_name(filename)
        .mime_str("application/octet-stream")
        .map_err(|e| format!("multipart error: {e}"))?;
    let mut form = reqwest::multipart::Form::new()
        .text("model", model.to_string())
        .text("response_format", "verbose_json")
        .part("file", part);
    if let Some(lang) = language {
        form = form.text("language", lang.to_string());
    }

    let body: serde_json::Value = client
        .post(&whisper_url)
        .bearer_auth(&api_key)
        .multipart(form)
        .timeout(std::time::Duration::from_secs(120))
        .send()
        .await
        .map_err(|e| format!("Whisper request failed: {e}"))?
        .json()
        .await
        .map_err(|e| format!("Whisper response parse error: {e}"))?;

    let text = body["text"].as_str().unwrap_or("").to_string();
    let lang = body["language"].as_str().map(String::from);
    let duration = body["duration"].as_f64();
    let segments = body["segments"]
        .as_array()
        .map(|segs| {
            segs.iter()
                .map(|s| AfpTranscriptSegment {
                    start_s: s["start"].as_f64().unwrap_or(0.0),
                    end_s: s["end"].as_f64().unwrap_or(0.0),
                    text: s["text"].as_str().unwrap_or("").to_string(),
                })
                .collect()
        })
        .unwrap_or_default();

    Ok((text, lang, duration, segments))
}

fn delimiter_score(line: &str, delimiter: char) -> usize {
    line.split(delimiter)
        .map(str::trim)
        .filter(|cell| !cell.is_empty())
        .count()
}

fn detect_delimiter(lines: &[String], override_delimiter: Option<&str>) -> char {
    if let Some(delimiter) = override_delimiter.and_then(|value| value.chars().next()) {
        return delimiter;
    }

    let candidates = [',', '\t', '|', ';'];
    let sample: Vec<&String> = lines.iter().take(8).collect();
    let mut best = (',', 0usize, 0usize);
    for delimiter in candidates {
        let counts: Vec<usize> = sample
            .iter()
            .map(|line| delimiter_score(line, delimiter))
            .filter(|count| *count > 1)
            .collect();
        if counts.is_empty() {
            continue;
        }
        let consistent = counts.iter().filter(|count| **count == counts[0]).count();
        let score = counts.iter().sum::<usize>() + consistent * 3;
        if score > best.1 {
            best = (delimiter, score, counts[0]);
        }
    }
    best.0
}

fn parse_dataset_from_text(
    text: &str,
    delimiter_override: Option<&str>,
    has_header_override: Option<bool>,
) -> Result<(Vec<String>, Vec<Vec<String>>, Vec<String>, f64), String> {
    let lines: Vec<String> = text
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(str::to_string)
        .collect();
    if lines.len() < 2 {
        return Err("not enough non-empty lines to extract a dataset".to_string());
    }

    let delimiter = detect_delimiter(&lines, delimiter_override);
    let parsed_rows: Vec<Vec<String>> = lines
        .iter()
        .map(|line| {
            line.split(delimiter)
                .map(|cell| cell.trim().to_string())
                .collect::<Vec<_>>()
        })
        .filter(|row| row.len() > 1)
        .collect();
    if parsed_rows.len() < 2 {
        return Err("could not detect multi-column tabular content".to_string());
    }

    let column_count = parsed_rows[0].len();
    let consistent_rows: Vec<Vec<String>> = parsed_rows
        .into_iter()
        .filter(|row| row.len() == column_count)
        .collect();
    if consistent_rows.len() < 2 {
        return Err("tabular rows are not consistent enough to build a dataset".to_string());
    }

    let has_header = has_header_override.unwrap_or(true);
    let discarded_rows = lines.len().saturating_sub(consistent_rows.len());
    let (columns, rows) = if has_header {
        let header = consistent_rows[0].clone();
        let data_rows = consistent_rows[1..].to_vec();
        (header, data_rows)
    } else {
        let columns = (0..column_count)
            .map(|index| format!("column_{}", index + 1))
            .collect::<Vec<_>>();
        (columns, consistent_rows)
    };

    let warnings = if discarded_rows > 0 {
        vec!["some lines were discarded because column counts did not match".to_string()]
    } else {
        vec![]
    };
    let confidence = if warnings.is_empty() { 0.92 } else { 0.74 };

    Ok((columns, rows, warnings, confidence))
}

fn rows_to_table_values(columns: &[String], rows: &[Vec<String>]) -> Vec<serde_json::Value> {
    rows.iter()
        .map(|row| {
            serde_json::Value::Object(
                columns
                    .iter()
                    .cloned()
                    .zip(row.iter().cloned().map(serde_json::Value::String))
                    .collect(),
            )
        })
        .collect()
}

fn parse_numeric_cell(value: &str) -> Option<f64> {
    let trimmed = value.trim().replace(',', "");
    if trimmed.is_empty() {
        return None;
    }
    trimmed.parse::<f64>().ok()
}

fn select_chart_columns(
    dataset: &AfpTabularDataset,
    req: &CreateChartRequest,
) -> Result<(String, Vec<String>), String> {
    let label_column = req
        .label_column
        .clone()
        .filter(|value| dataset.columns.iter().any(|column| column == value))
        .or_else(|| dataset.columns.first().cloned())
        .ok_or_else(|| "dataset must contain at least one column".to_string())?;

    let requested_values = req.value_columns.clone().unwrap_or_default();
    let mut value_columns = if requested_values.is_empty() {
        dataset
            .columns
            .iter()
            .filter(|column| **column != label_column)
            .filter(|column| {
                dataset.rows.iter().any(|row| {
                    dataset
                        .columns
                        .iter()
                        .position(|candidate| candidate == *column)
                        .and_then(|index| row.get(index))
                        .and_then(|cell| parse_numeric_cell(cell))
                        .is_some()
                })
            })
            .cloned()
            .collect::<Vec<_>>()
    } else {
        requested_values
            .into_iter()
            .filter(|column| dataset.columns.iter().any(|candidate| candidate == column))
            .collect::<Vec<_>>()
    };

    value_columns.retain(|column| column != &label_column);
    if value_columns.is_empty() {
        return Err("dataset does not contain any numeric value columns for charting".to_string());
    }
    Ok((label_column, value_columns))
}

fn build_chart_view_content(
    dataset: &AfpTabularDataset,
    chart_type: &str,
    label_column: &str,
    value_columns: &[String],
    title: &str,
) -> Result<serde_json::Value, String> {
    let label_index = dataset
        .columns
        .iter()
        .position(|column| column == label_column)
        .ok_or_else(|| "label column was not found in the dataset".to_string())?;
    let value_indexes = value_columns
        .iter()
        .map(|column| {
            dataset
                .columns
                .iter()
                .position(|candidate| candidate == column)
                .map(|index| (column.clone(), index))
                .ok_or_else(|| format!("value column '{}' was not found in the dataset", column))
        })
        .collect::<Result<Vec<_>, _>>()?;

    let labels = dataset
        .rows
        .iter()
        .map(|row| row.get(label_index).cloned().unwrap_or_default())
        .collect::<Vec<_>>();
    let datasets = value_indexes
        .iter()
        .enumerate()
        .map(|(idx, (column, value_index))| {
            let values = dataset
                .rows
                .iter()
                .map(|row| {
                    row.get(*value_index)
                        .and_then(|cell| parse_numeric_cell(cell))
                        .unwrap_or(0.0)
                })
                .collect::<Vec<_>>();
            let color = match idx % 5 {
                0 => "#0f766e",
                1 => "#2563eb",
                2 => "#ea580c",
                3 => "#7c3aed",
                _ => "#65a30d",
            };
            serde_json::json!({
                "label": column,
                "data": values,
                "backgroundColor": color,
                "borderColor": color,
            })
        })
        .collect::<Vec<_>>();

    Ok(serde_json::json!({
        "chart_type": chart_type,
        "title": title,
        "data": {
            "labels": labels,
            "datasets": datasets,
        },
        "options": {
            "responsive": true,
            "plugins": {
                "legend": { "position": if chart_type == "pie" || chart_type == "doughnut" { "bottom" } else { "top" } }
            }
        },
        "dataset_id": dataset.dataset_id,
        "label_column": label_column,
        "value_columns": value_columns,
    }))
}

async fn geocode_weather_location(query: &str) -> Result<OpenMeteoGeocodeResult, String> {
    let client = reqwest::Client::new();
    let response: OpenMeteoGeocodeResponse = client
        .get("https://geocoding-api.open-meteo.com/v1/search")
        .query(&[
            ("name", query),
            ("count", "1"),
            ("language", "en"),
            ("format", "json"),
        ])
        .timeout(std::time::Duration::from_secs(30))
        .send()
        .await
        .map_err(|err| format!("weather geocoding request failed: {err}"))?
        .json()
        .await
        .map_err(|err| format!("weather geocoding response parse failed: {err}"))?;
    response
        .results
        .into_iter()
        .next()
        .ok_or_else(|| format!("could not resolve weather location '{}'", query))
}

async fn fetch_weather_forecast(
    location: &OpenMeteoGeocodeResult,
    days: u8,
) -> Result<OpenMeteoForecastResponse, String> {
    let client = reqwest::Client::new();
    client
        .get("https://api.open-meteo.com/v1/forecast")
        .query(&[
            ("latitude", location.latitude.to_string()),
            ("longitude", location.longitude.to_string()),
            (
                "daily",
                "temperature_2m_max,temperature_2m_min,precipitation_sum,weather_code".to_string(),
            ),
            ("forecast_days", days.to_string()),
            (
                "timezone",
                location
                    .timezone
                    .clone()
                    .unwrap_or_else(|| "auto".to_string()),
            ),
        ])
        .timeout(std::time::Duration::from_secs(30))
        .send()
        .await
        .map_err(|err| format!("weather forecast request failed: {err}"))?
        .json()
        .await
        .map_err(|err| format!("weather forecast response parse failed: {err}"))
}

fn weather_dataset_title(location: &OpenMeteoGeocodeResult) -> String {
    let mut parts = vec![location.name.clone()];
    if let Some(admin1) = location
        .admin1
        .as_ref()
        .filter(|value| !value.trim().is_empty())
    {
        parts.push(admin1.clone());
    }
    if let Some(country) = location
        .country
        .as_ref()
        .filter(|value| !value.trim().is_empty())
    {
        parts.push(country.clone());
    }
    format!("Weather Forecast - {}", parts.join(", "))
}

fn weather_location_label(location: &OpenMeteoGeocodeResult) -> String {
    let mut parts = vec![location.name.clone()];
    if let Some(country) = location
        .country
        .as_ref()
        .filter(|value| !value.trim().is_empty())
    {
        parts.push(country.clone());
    }
    parts.join(", ")
}

fn normalize_projection_months(value: Option<u8>, default_value: u8) -> u8 {
    value.unwrap_or(default_value).clamp(1, 12)
}

fn budget_dataset_title(persona: Option<&str>, title: Option<&str>) -> String {
    if let Some(title) = title.filter(|value| !value.trim().is_empty()) {
        return title.trim().to_string();
    }

    if let Some(persona) = persona.filter(|value| !value.trim().is_empty()) {
        return format!("{} Budget Projection", persona.trim());
    }

    "Budget Projection".to_string()
}

fn budget_projection_warnings(
    monthly_income: Option<f64>,
    fixed_expenses: Option<f64>,
    variable_expenses: Option<f64>,
) -> Vec<String> {
    let mut warnings = Vec::new();
    if monthly_income.is_none() {
        warnings
            .push("Monthly income was not provided, so the projection defaults to 0.".to_string());
    }
    if fixed_expenses.is_none() {
        warnings
            .push("Fixed expenses were not provided, so the projection defaults to 0.".to_string());
    }
    if variable_expenses.is_none() {
        warnings.push(
            "Variable expenses were not provided, so the projection defaults to 0.".to_string(),
        );
    }
    warnings
}

fn add_months(mut year: i32, mut month: u32, offset: u8) -> (i32, u32) {
    let zero_based = month.saturating_sub(1) as i32 + i32::from(offset);
    year += zero_based.div_euclid(12);
    month = (zero_based.rem_euclid(12) + 1) as u32;
    (year, month)
}

fn build_budget_projection_dataset(
    title: String,
    months: u8,
    monthly_income: Option<f64>,
    fixed_expenses: Option<f64>,
    variable_expenses: Option<f64>,
    savings_goal: Option<f64>,
) -> (AfpTabularDataset, Vec<String>) {
    let warnings = budget_projection_warnings(monthly_income, fixed_expenses, variable_expenses);
    let quality_status = if warnings.is_empty() {
        "approved"
    } else {
        "draft"
    }
    .to_string();
    let income = monthly_income.unwrap_or_default();
    let fixed = fixed_expenses.unwrap_or_default();
    let variable = variable_expenses.unwrap_or_default();
    let savings = savings_goal.unwrap_or_default();
    let base_date = chrono::Utc::now().date_naive();
    let mut cumulative_net = 0.0;
    let rows = (0..months)
        .map(|offset| {
            let (year, month) = add_months(base_date.year(), base_date.month(), offset);
            let net_cash_flow = income - fixed - variable - savings;
            cumulative_net += net_cash_flow;
            vec![
                format!("{year:04}-{month:02}"),
                format!("{income:.2}"),
                format!("{fixed:.2}"),
                format!("{variable:.2}"),
                format!("{savings:.2}"),
                format!("{net_cash_flow:.2}"),
                format!("{cumulative_net:.2}"),
            ]
        })
        .collect::<Vec<_>>();

    (
        AfpTabularDataset {
            dataset_id: format!("dataset_{}", Ulid::new()),
            title,
            columns: vec![
                "month".to_string(),
                "projected_income".to_string(),
                "projected_fixed_expenses".to_string(),
                "projected_variable_expenses".to_string(),
                "projected_savings_goal".to_string(),
                "projected_net_cash_flow".to_string(),
                "projected_cumulative_cash_flow".to_string(),
            ],
            rows,
            source_message_ids: vec![],
            quality_status,
            workflow_family_context: None,
        },
        warnings,
    )
}

fn split_sentences(text: &str) -> Vec<String> {
    text.replace('\n', " ")
        .split_terminator(['.', '!', '?'])
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(str::to_string)
        .collect()
}

fn leading_digest_bullets(text: &str, max_items: usize) -> Vec<String> {
    let lines = text
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .filter(|line| line.len() > 20)
        .take(max_items)
        .map(str::to_string)
        .collect::<Vec<_>>();
    if lines.is_empty() {
        split_sentences(text).into_iter().take(max_items).collect()
    } else {
        lines
    }
}

fn digest_action_items(text: &str) -> Vec<String> {
    let line_items = text
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .filter(|line| {
            let lowered = line.to_ascii_lowercase();
            lowered.starts_with("todo")
                || lowered.starts_with("action")
                || lowered.starts_with("next step")
                || lowered.starts_with("- [ ]")
                || lowered.contains(" follow up")
                || lowered.contains(" will ")
                || lowered.contains(" needs ")
        })
        .take(5)
        .map(str::to_string)
        .collect::<Vec<_>>();
    if !line_items.is_empty() {
        return line_items;
    }

    split_sentences(text)
        .into_iter()
        .filter(|line| {
            let lowered = line.to_ascii_lowercase();
            lowered.starts_with("todo")
                || lowered.starts_with("action")
                || lowered.starts_with("next step")
                || lowered.contains(" follow up")
                || lowered.contains(" will ")
                || lowered.contains(" needs ")
        })
        .take(5)
        .collect()
}

fn digest_title_for_message(message: &AFPMessage) -> String {
    match message.r#type.as_str() {
        AFP_TYPE_TRANSCRIPT => {
            let transcript: AfpTranscript =
                serde_json::from_value(message.content.clone()).unwrap_or_default();
            transcript
                .source_attachment_id
                .map(|id| format!("Meeting Digest - {id}"))
                .unwrap_or_else(|| "Meeting Digest".to_string())
        }
        AFP_TYPE_PARSED_DOCUMENT => {
            let parsed: AfpParsedDocument =
                serde_json::from_value(message.content.clone()).unwrap_or_default();
            parsed
                .title
                .filter(|value| !value.trim().is_empty())
                .map(|title| format!("Document Digest - {title}"))
                .unwrap_or_else(|| "Document Digest".to_string())
        }
        _ => "Content Digest".to_string(),
    }
}

fn source_text_for_digest(message: &AFPMessage) -> Result<String, String> {
    match message.r#type.as_str() {
        AFP_TYPE_TRANSCRIPT => {
            let transcript: AfpTranscript = serde_json::from_value(message.content.clone())
                .map_err(|_| "transcript content is invalid".to_string())?;
            Ok(transcript.text)
        }
        AFP_TYPE_PARSED_DOCUMENT => {
            let parsed: AfpParsedDocument = serde_json::from_value(message.content.clone())
                .map_err(|_| "parsed_document content is invalid".to_string())?;
            Ok(parsed.content_text)
        }
        _ => Err("only transcript and parsed_document messages can be digested".to_string()),
    }
}

fn build_content_digest(source_message: &AFPMessage) -> Result<AfpContentDigestResult, String> {
    let text = source_text_for_digest(source_message)?;
    let bullets = leading_digest_bullets(&text, 4);
    let summary = bullets
        .iter()
        .take(2)
        .cloned()
        .collect::<Vec<_>>()
        .join(" ");
    let action_items = digest_action_items(&text);
    let warnings = if text.trim().len() < 80 {
        vec!["Source content is short, so the digest may be sparse.".to_string()]
    } else {
        vec![]
    };

    Ok(AfpContentDigestResult {
        source_message_id: source_message.id.clone(),
        source_message_type: source_message.r#type.clone(),
        title: digest_title_for_message(source_message),
        summary: if summary.is_empty() {
            "Prepared a compact digest from the source artifact.".to_string()
        } else {
            summary
        },
        bullets,
        action_items,
        warnings,
        workflow_family_context: None,
    })
}

fn build_weather_dataset(
    location: &OpenMeteoGeocodeResult,
    forecast: OpenMeteoForecastResponse,
) -> Result<AfpTabularDataset, String> {
    let day_count = forecast.daily.time.len();
    if day_count == 0 {
        return Err("weather forecast returned no daily rows".to_string());
    }
    let rows = (0..day_count)
        .map(|index| {
            vec![
                forecast.daily.time.get(index).cloned().unwrap_or_default(),
                forecast
                    .daily
                    .temperature_2m_max
                    .get(index)
                    .copied()
                    .unwrap_or_default()
                    .to_string(),
                forecast
                    .daily
                    .temperature_2m_min
                    .get(index)
                    .copied()
                    .unwrap_or_default()
                    .to_string(),
                forecast
                    .daily
                    .precipitation_sum
                    .get(index)
                    .copied()
                    .unwrap_or_default()
                    .to_string(),
                forecast
                    .daily
                    .weather_code
                    .get(index)
                    .copied()
                    .unwrap_or_default()
                    .to_string(),
            ]
        })
        .collect::<Vec<_>>();

    Ok(AfpTabularDataset {
        dataset_id: format!("dataset_{}", Ulid::new()),
        title: weather_dataset_title(location),
        columns: vec![
            "date".to_string(),
            "temperature_max_c".to_string(),
            "temperature_min_c".to_string(),
            "precipitation_mm".to_string(),
            "weather_code".to_string(),
        ],
        rows,
        source_message_ids: vec![],
        quality_status: "approved".to_string(),
        workflow_family_context: None,
    })
}

pub(super) async fn ingest_weather_for_user(
    state: &Arc<AppState>,
    user_id: &str,
    thread_id: &str,
    location_query: &str,
    days: u8,
    auto_chart: bool,
    persist: bool,
) -> Result<WeatherIngestOutcome, String> {
    let location = geocode_weather_location(location_query).await?;
    let forecast = fetch_weather_forecast(&location, days).await?;
    let mut dataset = build_weather_dataset(&location, forecast)?;
    let workflow_family_context = crate::workflow_instance_contracts::build_workflow_family_context(
        Some("weather_source"),
        Some("family_weather"),
        Some("wf_weather_to_chart"),
        Some("wf_weather_to_chart"),
        None,
        [
            (
                "location_query".to_string(),
                serde_json::Value::String(location_query.to_string()),
            ),
            (
                "forecast_days".to_string(),
                serde_json::Value::Number(serde_json::Number::from(days)),
            ),
        ]
        .into_iter()
        .collect(),
    );
    dataset.workflow_family_context = workflow_family_context.clone();
    let dataset_id = dataset.dataset_id.clone();
    let title = dataset.title.clone();
    let location_label = weather_location_label(&location);

    let dataset_message = new_server_message(
        "omnyid://server/weather".to_string(),
        vec![user_id.to_string()],
        thread_id.to_string(),
        AFP_TYPE_TABULAR_DATASET,
        serde_json::to_value(&dataset).unwrap_or_default(),
        vec![serde_json::json!({
            "format": "table",
            "content": {
                "label": dataset.title,
                "dataset_id": dataset.dataset_id,
                "columns": dataset.columns,
                "rows": rows_to_table_values(&dataset.columns, &dataset.rows),
                "source_message_ids": dataset.source_message_ids,
                "quality_status": dataset.quality_status,
                "warnings": [],
                "source_kind": "weather_forecast",
                "location_query": location_query,
                "days": days,
                "workflow_family_context": workflow_family_context.clone(),
            }
        })],
        vec![],
        vec![],
        persist,
    )?;

    let chart_message = if auto_chart {
        let chart_type = "line".to_string();
        let label_column = "date".to_string();
        let value_columns = vec![
            "temperature_max_c".to_string(),
            "temperature_min_c".to_string(),
        ];
        let chart_title = format!("{} Trend", dataset.title);
        let chart_spec = AfpChartSpec {
            dataset_id: dataset.dataset_id.clone(),
            chart_type: chart_type.clone(),
            label_column: label_column.clone(),
            value_columns: value_columns.clone(),
            title: Some(chart_title.clone()),
            workflow_family_context: workflow_family_context.clone(),
        };
        let mut chart_view = build_chart_view_content(
            &dataset,
            &chart_type,
            &label_column,
            &value_columns,
            &chart_title,
        )?;
        crate::workflow_instance_contracts::attach_workflow_family_context(
            &mut chart_view,
            workflow_family_context.as_ref(),
        );
        Some(new_server_message(
            "omnyid://server/weather".to_string(),
            vec![user_id.to_string()],
            thread_id.to_string(),
            AFP_TYPE_CHART_SPEC,
            serde_json::to_value(&chart_spec).unwrap_or_default(),
            vec![serde_json::json!({
                "format": "chart_view",
                "content": chart_view,
                "priority": 100
            })],
            vec![serde_json::json!({"id": dataset_message.id.clone(), "rel": "visualizes"})],
            vec![],
            persist,
        )?)
    } else {
        None
    };

    if persist {
        store_private_app_message(
            &state.db,
            &state.metrics,
            &state.relay_tx,
            user_id,
            dataset_message.clone(),
        )
        .await
        .map_err(|e| e.to_string())?;
        if let Some(chart_message) = chart_message.clone() {
            store_private_app_message(
                &state.db,
                &state.metrics,
                &state.relay_tx,
                user_id,
                chart_message,
            )
            .await
            .map_err(|e| e.to_string())?;
        }
    }

    Ok(WeatherIngestOutcome {
        dataset_message,
        chart_message,
        dataset_id,
        title,
        location_label,
        days,
    })
}

pub(super) async fn ingest_budget_projection_for_user(
    state: &Arc<AppState>,
    user_id: &str,
    thread_id: &str,
    title: Option<&str>,
    persona: Option<&str>,
    months: Option<u8>,
    monthly_income: Option<f64>,
    fixed_expenses: Option<f64>,
    variable_expenses: Option<f64>,
    savings_goal: Option<f64>,
    auto_chart: bool,
    persist: bool,
) -> Result<BudgetProjectionOutcome, String> {
    let months = normalize_projection_months(months, 6);
    let budget_title = budget_dataset_title(persona, title);
    let (mut dataset, warnings) = build_budget_projection_dataset(
        budget_title.clone(),
        months,
        monthly_income,
        fixed_expenses,
        variable_expenses,
        savings_goal,
    );
    let workflow_family_context = crate::workflow_instance_contracts::build_workflow_family_context(
        Some("budget_source"),
        Some("family_budget"),
        Some("wf_budget_projection"),
        Some("wf_budget_projection"),
        None,
        [
            (
                "months".to_string(),
                serde_json::Value::Number(serde_json::Number::from(months)),
            ),
            (
                "persona".to_string(),
                persona
                    .map(|value| serde_json::Value::String(value.to_string()))
                    .unwrap_or(serde_json::Value::Null),
            ),
        ]
        .into_iter()
        .collect(),
    );
    dataset.workflow_family_context = workflow_family_context.clone();
    let dataset_id = dataset.dataset_id.clone();

    let dataset_message = new_server_message(
        "omnyid://server/budget".to_string(),
        vec![user_id.to_string()],
        thread_id.to_string(),
        AFP_TYPE_TABULAR_DATASET,
        serde_json::to_value(&dataset).unwrap_or_default(),
        vec![serde_json::json!({
            "format": "table",
            "content": {
                "label": dataset.title,
                "dataset_id": dataset.dataset_id,
                "columns": dataset.columns,
                "rows": rows_to_table_values(&dataset.columns, &dataset.rows),
                "source_message_ids": dataset.source_message_ids,
                "quality_status": dataset.quality_status,
                "warnings": warnings,
                "source_kind": "budget_projection",
                "persona": persona,
                "months": months,
                "workflow_family_context": workflow_family_context.clone(),
            }
        })],
        vec![],
        vec![],
        persist,
    )?;

    let chart_message = if auto_chart {
        let chart_type = "line".to_string();
        let label_column = "month".to_string();
        let value_columns = vec![
            "projected_income".to_string(),
            "projected_net_cash_flow".to_string(),
            "projected_cumulative_cash_flow".to_string(),
        ];
        let chart_title = format!("{} Trend", budget_title);
        let chart_spec = AfpChartSpec {
            dataset_id: dataset.dataset_id.clone(),
            chart_type: chart_type.clone(),
            label_column: label_column.clone(),
            value_columns: value_columns.clone(),
            title: Some(chart_title.clone()),
            workflow_family_context: workflow_family_context.clone(),
        };
        let mut chart_view = build_chart_view_content(
            &dataset,
            &chart_type,
            &label_column,
            &value_columns,
            &chart_title,
        )?;
        crate::workflow_instance_contracts::attach_workflow_family_context(
            &mut chart_view,
            workflow_family_context.as_ref(),
        );
        Some(new_server_message(
            "omnyid://server/budget".to_string(),
            vec![user_id.to_string()],
            thread_id.to_string(),
            AFP_TYPE_CHART_SPEC,
            serde_json::to_value(&chart_spec).unwrap_or_default(),
            vec![serde_json::json!({
                "format": "chart_view",
                "content": chart_view,
                "priority": 100
            })],
            vec![serde_json::json!({"id": dataset_message.id.clone(), "rel": "visualizes"})],
            vec![],
            persist,
        )?)
    } else {
        None
    };

    if persist {
        store_private_app_message(
            &state.db,
            &state.metrics,
            &state.relay_tx,
            user_id,
            dataset_message.clone(),
        )
        .await
        .map_err(|e| e.to_string())?;
        if let Some(chart_message) = chart_message.clone() {
            store_private_app_message(
                &state.db,
                &state.metrics,
                &state.relay_tx,
                user_id,
                chart_message,
            )
            .await
            .map_err(|e| e.to_string())?;
        }
    }

    Ok(BudgetProjectionOutcome {
        dataset_message,
        chart_message,
        dataset_id,
        title: budget_title,
        months,
        warnings,
    })
}

pub(super) async fn digest_content_for_user(
    state: &Arc<AppState>,
    user_id: &str,
    thread_id: &str,
    source_message: &AFPMessage,
    persist: bool,
) -> Result<ContentDigestOutcome, String> {
    let workflow_family_context =
        crate::workflow_instance_contracts::workflow_family_context_from_message(source_message);
    let mut digest = build_content_digest(source_message)?;
    digest.workflow_family_context = workflow_family_context.clone();
    let mut digest_payload = serde_json::to_value(&digest).unwrap_or_default();
    crate::workflow_instance_contracts::attach_workflow_family_context(
        &mut digest_payload,
        workflow_family_context.as_ref(),
    );
    let mut digest_nodes = Vec::new();
    if let Some(context) = workflow_family_context.clone() {
        digest_nodes.push(serde_json::json!({
            "id": "digest-workflow-family",
            "type": "callout",
            "props": {
                "tone": "strategy",
                "title": "Workflow family provenance",
                "body": format!(
                    "Derived from workflow family '{}' using semantic role '{}'.",
                    context
                        .get("family_id")
                        .and_then(serde_json::Value::as_str)
                        .unwrap_or("custom_workflow"),
                    context
                        .get("semantic_role")
                        .and_then(serde_json::Value::as_str)
                        .unwrap_or("artifact")
                ),
                "meta": context,
            }
        }));
    }
    digest_nodes.extend([
        serde_json::json!({
            "id": "digest-summary",
            "type": "callout",
            "props": {
                "tone": "info",
                "title": "Digest summary",
                "body": digest.summary,
            }
        }),
        serde_json::json!({
            "id": "digest-bullets",
            "type": "table",
            "props": {
                "columns": ["Key points"],
                "rows": digest.bullets.iter().map(|item| vec![item.clone()]).collect::<Vec<_>>(),
                "caption": "Digest bullets",
            }
        }),
        serde_json::json!({
            "id": "digest-actions",
            "type": "table",
            "props": {
                "columns": ["Action items"],
                "rows": digest.action_items.iter().map(|item| vec![item.clone()]).collect::<Vec<_>>(),
                "caption": "Suggested follow-ups",
            }
        }),
    ]);
    let digest_message = new_server_message(
        "omnyid://server/digest".to_string(),
        vec![user_id.to_string()],
        thread_id.to_string(),
        AFP_TYPE_CONTENT_DIGEST_RESULT,
        digest_payload,
        vec![
            serde_json::json!({
                "format": "search_result",
                "content": {
                    "summary": digest.summary,
                    "bullets": digest.bullets,
                    "sources": [],
                    "title": digest.title,
                    "action_items": digest.action_items,
                    "warnings": digest.warnings,
                    "workflow_family_context": workflow_family_context.clone(),
                },
                "priority": 100
            }),
            serde_json::json!({
                "format": "a2ui_render",
                "content": {
                    "schema_version": "a2ui.v1",
                    "kind": "panel",
                    "title": digest.title,
                    "description": "Deterministic digest derived from an existing thread artifact.",
                    "layout": { "type": "stack", "gap": "md" },
                    "workflow_family_context": workflow_family_context.clone(),
                    "nodes": digest_nodes
                },
                "priority": 90
            }),
        ],
        vec![serde_json::json!({"id": source_message.id.clone(), "rel": "digests"})],
        vec![],
        persist,
    )?;

    if persist {
        store_private_app_message(
            &state.db,
            &state.metrics,
            &state.relay_tx,
            user_id,
            digest_message.clone(),
        )
        .await
        .map_err(|e| e.to_string())?;
    }

    Ok(ContentDigestOutcome {
        digest_message,
        title: digest.title,
        summary: digest.summary,
        action_items: digest.action_items,
    })
}

fn dataset_view_context(
    message: &AFPMessage,
) -> (
    Option<f64>,
    Vec<String>,
    Option<Vec<String>>,
    Option<Vec<Vec<String>>>,
) {
    let table_content = message
        .views
        .iter()
        .find(|view| view.get("format").and_then(serde_json::Value::as_str) == Some("table"))
        .and_then(|view| view.get("content"));

    let confidence = table_content
        .and_then(|content| content.get("confidence_overall"))
        .and_then(serde_json::Value::as_f64);
    let warnings = table_content
        .and_then(|content| content.get("warnings"))
        .and_then(serde_json::Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(serde_json::Value::as_str)
                .map(str::to_string)
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    let columns = table_content
        .and_then(|content| content.get("columns"))
        .and_then(serde_json::Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(serde_json::Value::as_str)
                .map(str::to_string)
                .collect::<Vec<_>>()
        });
    let rows = table_content
        .and_then(|content| content.get("rows"))
        .and_then(serde_json::Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(|row| {
                    row.as_object().map(|object| {
                        let source_columns = columns.as_ref();
                        let ordered_keys = source_columns
                            .cloned()
                            .unwrap_or_else(|| object.keys().cloned().collect::<Vec<_>>());
                        ordered_keys
                            .iter()
                            .map(|key| {
                                object
                                    .get(key)
                                    .and_then(serde_json::Value::as_str)
                                    .unwrap_or_default()
                                    .to_string()
                            })
                            .collect::<Vec<_>>()
                    })
                })
                .collect::<Vec<_>>()
        });
    (confidence, warnings, columns, rows)
}

pub(super) async fn ingest_document_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(req): Json<IngestDocumentRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    enforce_rate_limit(
        &state,
        authenticated_rate_limit_key("ingest_document", &headers),
        RateLimitPolicy {
            max_requests: 10,
            window: Duration::from_secs(60),
        },
    )
    .await?;

    let user = authenticated_user(&state.db, &headers).await?;
    let resolved_source = resolve_document_source(&state.db, &headers, &req).await?;
    let mime = resolved_source
        .mime_type
        .as_deref()
        .unwrap_or("application/pdf");
    let parser = select_parser(mime, req.parser.as_deref());

    let _req_meta = AfpMultimodalIngestRequest {
        source_url: resolved_source.source_url.clone().unwrap_or_else(|| {
            resolved_source
                .source_attachment_id
                .as_ref()
                .map(|attachment_id| format!("attachment://{attachment_id}"))
                .unwrap_or_else(|| "attachment://embedded".to_string())
        }),
        source_kind: Some(resolved_source.source_kind.clone()),
        source_message_id: resolved_source.source_message_id.clone(),
        source_attachment_id: resolved_source.source_attachment_id.clone(),
        thread_id: req.thread_id.clone(),
        mime_type: mime.to_string(),
        parser_family: parser.to_string(),
        suppress_intermediates: true,
    };
    tracing::info!(
        user_id = %user.id,
        thread_id = %req.thread_id,
        parser,
        source_kind = %resolved_source.source_kind,
        "multimodal_ingest_request: starting document parse"
    );

    let (text, page_count, title) = call_parser(parser, &resolved_source, mime)
        .await
        .map_err(|e| (StatusCode::BAD_GATEWAY, e))?;
    let parser_cost_usd = estimate_document_ingest_cost_usd(parser);
    let supertags = extend_supertags_for_extraction(
        infer_attachment_supertags(
            title.as_deref(),
            title.as_deref(),
            Some(mime),
            AttachmentRetentionMode::KeepFile,
            KnowledgeOrganizationMode::ConnectedNotes,
        ),
        parser,
        false,
    );

    let parsed = AfpParsedDocument {
        content_type: "markdown".to_string(),
        parser_used: parser.to_string(),
        source_url: resolved_source.source_url.clone(),
        source_attachment_id: resolved_source.source_attachment_id.clone(),
        content_text: text.clone(),
        page_count,
        title: title.clone(),
    };

    let msg_id = store_ingested_document_message(
        &state,
        &user.id,
        &req.thread_id,
        vec![user.id.clone()],
        parsed,
        &resolved_source.source_kind,
        resolved_source.source_message_id.clone(),
        resolved_source.source_attachment_id.clone(),
        title.clone(),
        Some(mime.to_string()),
        supertags,
        AttachmentRetentionMode::KeepFile,
        KnowledgeOrganizationMode::ConnectedNotes,
        Some(parser.to_string()),
        false,
    )
    .await?;

    tracing::info!(
        user_id = %user.id,
        thread_id = %req.thread_id,
        msg_id = %msg_id,
        parser,
        "multimodal_ingest: parsed_document stored"
    );

    record_ingest_cost(
        &state,
        &user.id,
        &req.thread_id,
        parser_cost_usd,
        AFP_TYPE_PARSED_DOCUMENT,
        &format!("document_parser:{parser}"),
        serde_json::json!({
            "parser_family": parser,
            "mime_type": mime,
            "page_count": page_count,
            "source_kind": resolved_source.source_kind,
            "source_message_id": resolved_source.source_message_id,
            "source_attachment_id": resolved_source.source_attachment_id,
        }),
    )
    .await;

    Ok(Json(serde_json::json!({
        "message_id": msg_id,
        "thread_id": req.thread_id,
        "type": AFP_TYPE_PARSED_DOCUMENT,
        "parser_used": parser,
        "content_type": "markdown",
        "source_kind": resolved_source.source_kind,
        "source_message_id": resolved_source.source_message_id,
        "source_attachment_id": resolved_source.source_attachment_id,
        "page_count": page_count,
        "title": title,
    })))
}

pub(super) async fn ingest_audio_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(req): Json<IngestAudioRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    enforce_rate_limit(
        &state,
        authenticated_rate_limit_key("ingest_audio", &headers),
        RateLimitPolicy {
            max_requests: 5,
            window: Duration::from_secs(60),
        },
    )
    .await?;

    let user = authenticated_user(&state.db, &headers).await?;
    let resolved_source = resolve_audio_source(&state.db, &headers, &req).await?;
    let model = select_whisper_model(req.model.as_deref());

    tracing::info!(
        user_id = %user.id,
        thread_id = %req.thread_id,
        model = %model,
        source_kind = %resolved_source.source_kind,
        "multimodal_ingest_request: starting audio transcription"
    );

    let (text, language, duration_seconds, segments) =
        call_whisper(&resolved_source, &model, req.language.as_deref())
            .await
            .map_err(|e| (StatusCode::BAD_GATEWAY, e))?;
    let transcription_cost_usd = estimate_audio_transcription_cost_usd(duration_seconds);
    let supertags = extend_supertags_for_extraction(
        infer_attachment_supertags(
            None,
            None,
            resolved_source.mime_type.as_deref(),
            AttachmentRetentionMode::KeepFile,
            KnowledgeOrganizationMode::ConnectedNotes,
        ),
        &model,
        false,
    );

    let transcript = AfpTranscript {
        model_used: model.clone(),
        source_url: resolved_source.source_url.clone(),
        source_attachment_id: resolved_source.source_attachment_id.clone(),
        language: language.clone(),
        duration_seconds,
        text: text.clone(),
        segments,
    };

    let msg_id = store_ingested_transcript_message(
        &state,
        &user.id,
        &req.thread_id,
        vec![user.id.clone()],
        transcript,
        &resolved_source.source_kind,
        resolved_source.source_message_id.clone(),
        resolved_source.source_attachment_id.clone(),
        None,
        resolved_source.mime_type.clone(),
        supertags,
        AttachmentRetentionMode::KeepFile,
        KnowledgeOrganizationMode::ConnectedNotes,
        Some(model.clone()),
        false,
    )
    .await?;
    let word_count = text.split_whitespace().count();

    tracing::info!(
        user_id = %user.id,
        thread_id = %req.thread_id,
        msg_id = %msg_id,
        model = %model,
        "multimodal_ingest: transcript stored"
    );

    record_ingest_cost(
        &state,
        &user.id,
        &req.thread_id,
        transcription_cost_usd,
        AFP_TYPE_TRANSCRIPT,
        &format!("audio_transcription:{model}"),
        serde_json::json!({
            "model": model,
            "language": language,
            "duration_seconds": duration_seconds,
            "word_count": word_count,
            "source_kind": resolved_source.source_kind,
            "source_message_id": resolved_source.source_message_id,
            "source_attachment_id": resolved_source.source_attachment_id,
        }),
    )
    .await;

    Ok(Json(serde_json::json!({
        "message_id": msg_id,
        "thread_id": req.thread_id,
        "type": AFP_TYPE_TRANSCRIPT,
        "model_used": model,
        "source_kind": resolved_source.source_kind,
        "source_message_id": resolved_source.source_message_id,
        "source_attachment_id": resolved_source.source_attachment_id,
        "language": language,
        "duration_seconds": duration_seconds,
        "word_count": word_count,
    })))
}

pub(super) async fn ingest_attachment_batch_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(req): Json<AttachmentBatchIngestRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    enforce_rate_limit(
        &state,
        authenticated_rate_limit_key("ingest_attachment_batch", &headers),
        RateLimitPolicy {
            max_requests: 6,
            window: Duration::from_secs(60),
        },
    )
    .await?;

    if req.uploads.is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            "At least one attachment upload is required.".to_string(),
        ));
    }
    if req.uploads.len() > ATTACHMENT_BATCH_MAX_UPLOADS {
        return Err((
            StatusCode::PAYLOAD_TOO_LARGE,
            format!(
                "Attachment batch exceeds the limit of {} uploads.",
                ATTACHMENT_BATCH_MAX_UPLOADS
            ),
        ));
    }

    let user = authenticated_user(&state.db, &headers).await?;
    let retention_mode = parse_attachment_retention_mode(&req.retention_mode);
    let knowledge_mode = parse_knowledge_organization_mode(req.knowledge_mode.as_deref());
    let mut items = Vec::new();
    let mut cleanup_message_ids = Vec::new();

    for upload in &req.uploads {
        let source_message = match lookup_private_message(
            &state.db,
            &user.id,
            &upload.source_message_id,
        )
        .await
        {
            Ok(message) => message,
            Err((status, message)) => {
                items.push(serde_json::json!({
                    "source_message_id": upload.source_message_id,
                    "source_attachment_id": upload.attachment_id,
                    "file_name": upload.file_name,
                    "mime_type": upload.mime_type,
                    "output_message_id": serde_json::Value::Null,
                    "output_type": serde_json::Value::Null,
                    "supertags": [],
                    "extraction_mode": serde_json::Value::Null,
                    "inline_extracted": false,
                    "support_mode": "not_supported_yet",
                    "support_label": "Missing source",
                    "support_description": "The uploaded source message could not be loaded for note synthesis.",
                    "cost_usd": serde_json::Value::Null,
                    "cost_source": serde_json::Value::Null,
                    "academic_kind": serde_json::Value::Null,
                "academic_course_tag": serde_json::Value::Null,
                "academic_week_tag": serde_json::Value::Null,
                "academic_lecture_tag": serde_json::Value::Null,
                "academic_chapter_tag": serde_json::Value::Null,
                "academic_unit_tag": serde_json::Value::Null,
                "academic_summary": serde_json::Value::Null,
                    "zettelkasten_stage": serde_json::Value::Null,
                    "kept_source_file": matches!(retention_mode, AttachmentRetentionMode::KeepFile),
                    "ephemeral_output": matches!(retention_mode, AttachmentRetentionMode::KeepNothing),
                    "ingested": false,
                    "error": message,
                    "status_code": status.as_u16(),
                }));
                continue;
            }
        };

        let ingest_result = async {
            let resolved = resolve_source_from_message(
                &source_message,
                upload.attachment_id.as_deref(),
                upload.mime_type.as_deref(),
            )
            .await
            .map_err(|err| (StatusCode::BAD_REQUEST, err))?;
            let file_name = upload
                .file_name
                .clone()
                .or_else(|| source_message.attachments.first().and_then(attachment_name));
            let effective_mime = upload
                .mime_type
                .clone()
                .or_else(|| resolved.mime_type.clone())
                .or_else(|| upload.inline_content_type.clone());
            let inline_payload = inline_text_for_upload(upload);
            let (support_mode, support_label, support_description) = attachment_support_descriptor(
                file_name.as_deref(),
                effective_mime.as_deref(),
                inline_payload.is_some(),
            );
            let base_supertags = infer_attachment_supertags(
                req.query.as_deref(),
                file_name.as_deref(),
                effective_mime.as_deref(),
                retention_mode,
                knowledge_mode,
            );
            let ephemeral_output = matches!(retention_mode, AttachmentRetentionMode::KeepNothing);
            if matches!(support_mode, AttachmentSupportMode::NotSupportedYet) {
                return Err((
                    StatusCode::UNPROCESSABLE_ENTITY,
                    support_description.to_string(),
                ));
            }
            let output = if is_audio_like_source(effective_mime.as_deref(), file_name.as_deref()) {
                let model = select_whisper_model(None);
                let (text, language, duration_seconds, segments) =
                    call_whisper(&resolved, &model, None)
                        .await
                        .map_err(|err| (StatusCode::BAD_GATEWAY, err))?;
                let cost_usd = estimate_audio_transcription_cost_usd(duration_seconds);
                let supertags =
                    extend_supertags_for_extraction(base_supertags.clone(), &model, false);
                let semantic_metadata = infer_attachment_semantic_metadata(
                    &supertags,
                    file_name.as_deref(),
                    knowledge_mode,
                );
                let transcript = AfpTranscript {
                    model_used: model.clone(),
                    source_url: resolved.source_url.clone(),
                    source_attachment_id: resolved.source_attachment_id.clone(),
                    language,
                    duration_seconds,
                    text,
                    segments,
                };
                let output_message_id = store_ingested_transcript_message(
                    &state,
                    &user.id,
                    &req.thread_id,
                    vec![user.id.clone()],
                    transcript,
                    &resolved.source_kind,
                    resolved.source_message_id.clone(),
                    resolved.source_attachment_id.clone(),
                    file_name.clone(),
                    effective_mime.clone(),
                    supertags.clone(),
                    retention_mode,
                    knowledge_mode,
                    Some(model.clone()),
                    ephemeral_output,
                )
                .await?;
                AttachmentIngestOutcome {
                    source_message_id: upload.source_message_id.clone(),
                    source_attachment_id: resolved.source_attachment_id.clone(),
                    file_name: file_name.clone(),
                    mime_type: effective_mime.clone(),
                    output_message_id,
                    output_type: AFP_TYPE_TRANSCRIPT.to_string(),
                    supertags,
                    extraction_mode: model.clone(),
                    inline_extracted: false,
                    support_mode: "server_processing",
                    support_label,
                    support_description,
                    cost_usd: Some(cost_usd),
                    cost_source: Some(format!("audio_transcription:{model}")),
                    academic_kind: semantic_metadata.academic_kind,
                    academic_course_tag: semantic_metadata.academic_course_tag,
                    academic_week_tag: semantic_metadata.academic_week_tag,
                    academic_lecture_tag: semantic_metadata.academic_lecture_tag,
                    academic_chapter_tag: semantic_metadata.academic_chapter_tag,
                    academic_unit_tag: semantic_metadata.academic_unit_tag,
                    academic_summary: semantic_metadata.academic_summary,
                    zettelkasten_stage: semantic_metadata.zettelkasten_stage,
                }
            } else if is_image_like_source(effective_mime.as_deref(), file_name.as_deref()) {
                let mime = effective_mime.as_deref().unwrap_or("image/png");
                let text = call_image_ocr(&resolved, mime, file_name.as_deref())
                    .await
                    .map_err(|err| (StatusCode::BAD_GATEWAY, err))?;
                let cost_usd = estimate_image_ocr_cost_usd();
                let supertags = extend_supertags_for_extraction(
                    base_supertags.clone(),
                    "openai_image_ocr",
                    false,
                );
                let semantic_metadata = infer_attachment_semantic_metadata(
                    &supertags,
                    file_name.as_deref(),
                    knowledge_mode,
                );
                let parsed = AfpParsedDocument {
                    content_type: "text/plain".to_string(),
                    parser_used: "openai_image_ocr".to_string(),
                    source_url: resolved.source_url.clone(),
                    source_attachment_id: resolved.source_attachment_id.clone(),
                    content_text: text,
                    page_count: None,
                    title: file_name.clone(),
                };
                let output_message_id = store_ingested_document_message(
                    &state,
                    &user.id,
                    &req.thread_id,
                    vec![user.id.clone()],
                    parsed,
                    &resolved.source_kind,
                    resolved.source_message_id.clone(),
                    resolved.source_attachment_id.clone(),
                    file_name.clone(),
                    Some(mime.to_string()),
                    supertags.clone(),
                    retention_mode,
                    knowledge_mode,
                    Some("openai_image_ocr".to_string()),
                    ephemeral_output,
                )
                .await?;
                AttachmentIngestOutcome {
                    source_message_id: upload.source_message_id.clone(),
                    source_attachment_id: resolved.source_attachment_id.clone(),
                    file_name: file_name.clone(),
                    mime_type: effective_mime.clone(),
                    output_message_id,
                    output_type: AFP_TYPE_PARSED_DOCUMENT.to_string(),
                    supertags,
                    extraction_mode: "openai_image_ocr".to_string(),
                    inline_extracted: false,
                    support_mode: "server_processing",
                    support_label,
                    support_description,
                    cost_usd: Some(cost_usd),
                    cost_source: Some("image_ocr:openai".to_string()),
                    academic_kind: semantic_metadata.academic_kind,
                    academic_course_tag: semantic_metadata.academic_course_tag,
                    academic_week_tag: semantic_metadata.academic_week_tag,
                    academic_lecture_tag: semantic_metadata.academic_lecture_tag,
                    academic_chapter_tag: semantic_metadata.academic_chapter_tag,
                    academic_unit_tag: semantic_metadata.academic_unit_tag,
                    academic_summary: semantic_metadata.academic_summary,
                    zettelkasten_stage: semantic_metadata.zettelkasten_stage,
                }
            } else if let Some((inline_text, inline_content_type, extraction_mode)) = inline_payload
            {
                let supertags =
                    extend_supertags_for_extraction(base_supertags.clone(), extraction_mode, true);
                let semantic_metadata = infer_attachment_semantic_metadata(
                    &supertags,
                    file_name.as_deref(),
                    knowledge_mode,
                );
                let parsed = AfpParsedDocument {
                    content_type: inline_content_type.to_string(),
                    parser_used: extraction_mode.to_string(),
                    source_url: resolved.source_url.clone(),
                    source_attachment_id: resolved.source_attachment_id.clone(),
                    content_text: inline_text.to_string(),
                    page_count: None,
                    title: file_name.clone(),
                };
                let output_message_id = store_ingested_document_message(
                    &state,
                    &user.id,
                    &req.thread_id,
                    vec![user.id.clone()],
                    parsed,
                    &resolved.source_kind,
                    resolved.source_message_id.clone(),
                    resolved.source_attachment_id.clone(),
                    file_name.clone(),
                    effective_mime.clone(),
                    supertags.clone(),
                    retention_mode,
                    knowledge_mode,
                    Some(extraction_mode.to_string()),
                    ephemeral_output,
                )
                .await?;
                AttachmentIngestOutcome {
                    source_message_id: upload.source_message_id.clone(),
                    source_attachment_id: resolved.source_attachment_id.clone(),
                    file_name: file_name.clone(),
                    mime_type: effective_mime.clone(),
                    output_message_id,
                    output_type: AFP_TYPE_PARSED_DOCUMENT.to_string(),
                    supertags,
                    extraction_mode: extraction_mode.to_string(),
                    inline_extracted: true,
                    support_mode: "inline_text",
                    support_label,
                    support_description,
                    cost_usd: None,
                    cost_source: None,
                    academic_kind: semantic_metadata.academic_kind,
                    academic_course_tag: semantic_metadata.academic_course_tag,
                    academic_week_tag: semantic_metadata.academic_week_tag,
                    academic_lecture_tag: semantic_metadata.academic_lecture_tag,
                    academic_chapter_tag: semantic_metadata.academic_chapter_tag,
                    academic_unit_tag: semantic_metadata.academic_unit_tag,
                    academic_summary: semantic_metadata.academic_summary,
                    zettelkasten_stage: semantic_metadata.zettelkasten_stage,
                }
            } else {
                let mime = effective_mime.as_deref().unwrap_or("application/pdf");
                let parser = select_parser(mime, None);
                let (text, page_count, title) = call_parser(parser, &resolved, mime)
                    .await
                    .map_err(|err| (StatusCode::BAD_GATEWAY, err))?;
                let cost_usd = estimate_document_ingest_cost_usd(parser);
                let supertags =
                    extend_supertags_for_extraction(base_supertags.clone(), parser, false);
                let semantic_metadata = infer_attachment_semantic_metadata(
                    &supertags,
                    file_name.as_deref(),
                    knowledge_mode,
                );
                let parsed = AfpParsedDocument {
                    content_type: "markdown".to_string(),
                    parser_used: parser.to_string(),
                    source_url: resolved.source_url.clone(),
                    source_attachment_id: resolved.source_attachment_id.clone(),
                    content_text: text,
                    page_count,
                    title,
                };
                let output_message_id = store_ingested_document_message(
                    &state,
                    &user.id,
                    &req.thread_id,
                    vec![user.id.clone()],
                    parsed,
                    &resolved.source_kind,
                    resolved.source_message_id.clone(),
                    resolved.source_attachment_id.clone(),
                    file_name.clone(),
                    Some(mime.to_string()),
                    supertags.clone(),
                    retention_mode,
                    knowledge_mode,
                    Some(parser.to_string()),
                    ephemeral_output,
                )
                .await?;
                AttachmentIngestOutcome {
                    source_message_id: upload.source_message_id.clone(),
                    source_attachment_id: resolved.source_attachment_id.clone(),
                    file_name: file_name.clone(),
                    mime_type: effective_mime.clone(),
                    output_message_id,
                    output_type: AFP_TYPE_PARSED_DOCUMENT.to_string(),
                    supertags,
                    extraction_mode: parser.to_string(),
                    inline_extracted: false,
                    support_mode: "server_processing",
                    support_label,
                    support_description,
                    cost_usd: Some(cost_usd),
                    cost_source: Some(format!("document_parser:{parser}")),
                    academic_kind: semantic_metadata.academic_kind,
                    academic_course_tag: semantic_metadata.academic_course_tag,
                    academic_week_tag: semantic_metadata.academic_week_tag,
                    academic_lecture_tag: semantic_metadata.academic_lecture_tag,
                    academic_chapter_tag: semantic_metadata.academic_chapter_tag,
                    academic_unit_tag: semantic_metadata.academic_unit_tag,
                    academic_summary: semantic_metadata.academic_summary,
                    zettelkasten_stage: semantic_metadata.zettelkasten_stage,
                }
            };

            if let Some(cost_source) = output.cost_source.as_deref() {
                if output.cost_usd.unwrap_or(0.0) > 0.0 {
                    record_ingest_cost(
                        &state,
                        &user.id,
                        &req.thread_id,
                        output.cost_usd.unwrap_or(0.0),
                        &output.output_type,
                        cost_source,
                        serde_json::json!({
                            "source_kind": resolved.source_kind,
                            "source_message_id": resolved.source_message_id,
                            "source_attachment_id": resolved.source_attachment_id,
                            "file_name": file_name,
                            "mime_type": effective_mime,
                            "extraction_mode": output.extraction_mode,
                            "support_mode": output.support_mode,
                        }),
                    )
                    .await;
                }
            }

            if !matches!(retention_mode, AttachmentRetentionMode::KeepFile) {
                cleanup_uploaded_source_message(&state, &user.id, &source_message).await?;
            }
            if ephemeral_output {
                cleanup_message_ids.push(output.output_message_id.clone());
            }
            Ok::<serde_json::Value, (StatusCode, String)>(serde_json::json!({
                "source_message_id": output.source_message_id,
                "source_attachment_id": output.source_attachment_id,
                "file_name": output.file_name,
                "mime_type": output.mime_type,
                "output_message_id": output.output_message_id,
                "output_type": output.output_type,
                "supertags": output.supertags,
                "extraction_mode": output.extraction_mode,
                "inline_extracted": output.inline_extracted,
                "support_mode": output.support_mode,
                "support_label": output.support_label,
                "support_description": output.support_description,
                "cost_usd": output.cost_usd,
                "cost_source": output.cost_source,
                "academic_kind": output.academic_kind,
                "academic_course_tag": output.academic_course_tag,
                "academic_week_tag": output.academic_week_tag,
                "academic_lecture_tag": output.academic_lecture_tag,
                "academic_chapter_tag": output.academic_chapter_tag,
                "academic_unit_tag": output.academic_unit_tag,
                "academic_summary": output.academic_summary,
                "zettelkasten_stage": output.zettelkasten_stage,
                "kept_source_file": matches!(retention_mode, AttachmentRetentionMode::KeepFile),
                "ephemeral_output": matches!(retention_mode, AttachmentRetentionMode::KeepNothing),
                "attachment_retention_mode": retention_mode_value(retention_mode),
                "attachment_retention_label": retention_mode_label(retention_mode),
                "source_persisted": retention_source_persisted(retention_mode),
                "derived_content_persisted": retention_derived_content_persisted(retention_mode),
                "cleanup_required": retention_cleanup_required(retention_mode),
                "knowledge_mode": knowledge_organization_mode_value(knowledge_mode),
                "ingested": true,
                "error": serde_json::Value::Null,
            }))
        }
        .await;

        match ingest_result {
            Ok(item) => items.push(item),
            Err((status, message)) => {
                if !matches!(retention_mode, AttachmentRetentionMode::KeepFile) {
                    let _ =
                        cleanup_uploaded_source_message(&state, &user.id, &source_message).await;
                }
                let file_name = upload
                    .file_name
                    .clone()
                    .or_else(|| source_message.attachments.first().and_then(attachment_name));
                let effective_mime = upload.mime_type.clone();
                let (support_mode, support_label, support_description) =
                    attachment_support_descriptor(
                        file_name.as_deref(),
                        effective_mime.as_deref(),
                        inline_text_for_upload(upload).is_some(),
                    );
                items.push(serde_json::json!({
                    "source_message_id": upload.source_message_id,
                    "source_attachment_id": upload.attachment_id,
                    "file_name": file_name,
                    "mime_type": effective_mime,
                    "output_message_id": serde_json::Value::Null,
                    "output_type": serde_json::Value::Null,
                    "supertags": [],
                    "extraction_mode": serde_json::Value::Null,
                    "inline_extracted": false,
                    "support_mode": match support_mode {
                        AttachmentSupportMode::InlineText => "inline_text",
                        AttachmentSupportMode::ServerProcessing => "server_processing",
                        AttachmentSupportMode::NotSupportedYet => "not_supported_yet",
                    },
                    "support_label": support_label,
                    "support_description": support_description,
                    "cost_usd": serde_json::Value::Null,
                    "cost_source": serde_json::Value::Null,
                    "academic_kind": serde_json::Value::Null,
                    "academic_course_tag": serde_json::Value::Null,
                    "academic_week_tag": serde_json::Value::Null,
                    "academic_lecture_tag": serde_json::Value::Null,
                    "academic_chapter_tag": serde_json::Value::Null,
                    "academic_unit_tag": serde_json::Value::Null,
                    "academic_summary": serde_json::Value::Null,
                    "zettelkasten_stage": serde_json::Value::Null,
                    "kept_source_file": matches!(retention_mode, AttachmentRetentionMode::KeepFile),
                    "ephemeral_output": matches!(retention_mode, AttachmentRetentionMode::KeepNothing),
                    "attachment_retention_mode": retention_mode_value(retention_mode),
                    "attachment_retention_label": retention_mode_label(retention_mode),
                    "source_persisted": retention_source_persisted(retention_mode),
                    "derived_content_persisted": retention_derived_content_persisted(retention_mode),
                    "cleanup_required": retention_cleanup_required(retention_mode),
                    "knowledge_mode": knowledge_organization_mode_value(knowledge_mode),
                    "ingested": false,
                    "error": message,
                    "status_code": status.as_u16(),
                }));
            }
        }
    }

    Ok(Json(serde_json::json!({
        "thread_id": req.thread_id,
        "retention_mode": req.retention_mode,
        "knowledge_mode": knowledge_organization_mode_value(knowledge_mode),
        "items": items,
        "cleanup_message_ids": cleanup_message_ids,
    })))
}

pub(super) async fn cleanup_ingest_outputs_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(req): Json<CleanupIngestOutputsRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    enforce_rate_limit(
        &state,
        authenticated_rate_limit_key("ingest_cleanup", &headers),
        RateLimitPolicy {
            max_requests: 12,
            window: Duration::from_secs(60),
        },
    )
    .await?;

    if req.message_ids.is_empty() {
        return Ok(Json(serde_json::json!({
            "deleted_count": 0u64,
            "skipped_count": 0u64,
        })));
    }
    if req.message_ids.len() > ATTACHMENT_CLEANUP_MAX_MESSAGE_IDS {
        return Err((
            StatusCode::PAYLOAD_TOO_LARGE,
            format!(
                "Cleanup request exceeds the limit of {} message IDs.",
                ATTACHMENT_CLEANUP_MAX_MESSAGE_IDS
            ),
        ));
    }

    let user = authenticated_user(&state.db, &headers).await?;
    let mut deleted_count = 0u64;
    let mut skipped_count = 0u64;
    let mut seen_message_ids = BTreeSet::new();
    for message_id in req.message_ids {
        if !seen_message_ids.insert(message_id.clone()) {
            skipped_count += 1;
            continue;
        }
        let message_info = state
            .db
            .private_message_type_and_metadata_by_id(&user.id, &message_id)
            .await
            .map_err(internal_error)
            .map_err(status_to_http)?;
        let Some((message_type, metadata)) = message_info else {
            skipped_count += 1;
            continue;
        };
        if !cleanup_target_is_ephemeral_ingest_output(&message_type, metadata.as_ref()) {
            skipped_count += 1;
            continue;
        }
        deleted_count += state
            .db
            .delete_private_message_by_id(&user.id, &message_id)
            .await
            .map_err(internal_error)
            .map_err(status_to_http)?;
    }
    Ok(Json(serde_json::json!({
        "deleted_count": deleted_count,
        "skipped_count": skipped_count,
    })))
}

pub(super) async fn persist_ingest_outputs_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(req): Json<PersistIngestOutputsRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    enforce_rate_limit(
        &state,
        authenticated_rate_limit_key("ingest_persist", &headers),
        RateLimitPolicy {
            max_requests: 12,
            window: Duration::from_secs(60),
        },
    )
    .await?;

    if req.message_ids.is_empty() {
        return Ok(Json(serde_json::json!({
            "persisted_count": 0u64,
            "skipped_count": 0u64,
        })));
    }
    if req.message_ids.len() > ATTACHMENT_CLEANUP_MAX_MESSAGE_IDS {
        return Err((
            StatusCode::PAYLOAD_TOO_LARGE,
            format!(
                "Persist request exceeds the limit of {} message IDs.",
                ATTACHMENT_CLEANUP_MAX_MESSAGE_IDS
            ),
        ));
    }

    let user = authenticated_user(&state.db, &headers).await?;
    let mut persisted_count = 0u64;
    let mut skipped_count = 0u64;
    let mut seen_message_ids = BTreeSet::new();
    for message_id in req.message_ids {
        if !seen_message_ids.insert(message_id.clone()) {
            skipped_count += 1;
            continue;
        }
        let mut message = match lookup_private_message(&state.db, &user.id, &message_id).await {
            Ok(message) => message,
            Err((StatusCode::NOT_FOUND, _)) => {
                skipped_count += 1;
                continue;
            }
            Err(err) => return Err(err),
        };
        if persist_ephemeral_ingest_output(&mut message).is_err() {
            skipped_count += 1;
            continue;
        }
        state
            .db
            .upsert_private_message(
                &user.id,
                &super::app_to_proto(message.clone()),
                message.content.clone(),
            )
            .await
            .map_err(internal_error)
            .map_err(status_to_http)?;
        persisted_count += 1;
    }

    Ok(Json(serde_json::json!({
        "persisted_count": persisted_count,
        "skipped_count": skipped_count,
    })))
}

pub(super) async fn extract_document_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(req): Json<ExtractDocumentRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    enforce_rate_limit(
        &state,
        authenticated_rate_limit_key("extract_document", &headers),
        RateLimitPolicy {
            max_requests: 10,
            window: Duration::from_secs(60),
        },
    )
    .await?;

    let user = authenticated_user(&state.db, &headers).await?;
    let thread_messages = thread_messages_for_headers(&state.db, &headers, &req.thread_id).await?;
    let source_message = thread_messages
        .into_iter()
        .find(|message| message.id == req.source_message_id)
        .map(proto_to_app)
        .ok_or_else(|| {
            (
                StatusCode::NOT_FOUND,
                format!(
                    "source_message_id '{}' was not found in thread '{}'",
                    req.source_message_id, req.thread_id
                ),
            )
        })?;

    if source_message.r#type != AFP_TYPE_PARSED_DOCUMENT {
        return Err((
            StatusCode::BAD_REQUEST,
            format!(
                "source_message_id '{}' must reference a parsed_document message",
                req.source_message_id
            ),
        ));
    }

    let parsed: AfpParsedDocument = serde_json::from_value(source_message.content.clone())
        .map_err(|_| {
            (
                StatusCode::BAD_REQUEST,
                "parsed_document content is invalid".to_string(),
            )
        })?;
    let (columns, rows, warnings, confidence) = parse_dataset_from_text(
        &parsed.content_text,
        req.delimiter.as_deref(),
        req.has_header,
    )
    .map_err(|err| (StatusCode::BAD_REQUEST, err))?;

    let records = rows_to_table_values(&columns, &rows);
    let extract_result = AfpDocumentExtractResult {
        source_message_id: source_message.id.clone(),
        extraction_mode: "rows".to_string(),
        schema: columns.clone(),
        records,
        confidence_summary: Some(serde_json::json!({
            "overall": confidence,
            "row_count": rows.len(),
            "column_count": columns.len(),
        })),
        cell_provenance: None,
        warnings: warnings.clone(),
    };

    let dataset_id = format!("dataset_{}", Ulid::new());
    let dataset_title = req
        .title
        .clone()
        .filter(|value| !value.trim().is_empty())
        .or_else(|| parsed.title.clone())
        .unwrap_or_else(|| "Extracted Dataset".to_string());
    let workflow_family_context =
        crate::workflow_instance_contracts::workflow_family_context_from_message(&source_message);
    let dataset = AfpTabularDataset {
        dataset_id: dataset_id.clone(),
        title: dataset_title.clone(),
        columns: columns.clone(),
        rows: rows.clone(),
        source_message_ids: vec![source_message.id.clone()],
        quality_status: quality_status_from_confidence(confidence, &warnings),
        workflow_family_context: workflow_family_context.clone(),
    };

    let extract_message = new_server_message(
        "omnyid://server/extract".to_string(),
        vec![user.id.clone()],
        req.thread_id.clone(),
        AFP_TYPE_DOCUMENT_EXTRACT_RESULT,
        serde_json::to_value(&extract_result).unwrap_or_default(),
        vec![serde_json::json!({
            "format": "table",
            "content": {
                "label": "Extraction Preview",
                "columns": columns,
                "rows": rows_to_table_values(&dataset.columns, &rows),
                "quality_status": dataset.quality_status,
                "confidence_overall": confidence,
                "warnings": warnings,
                "workflow_family_context": workflow_family_context.clone(),
            }
        })],
        vec![serde_json::json!({"id": source_message.id, "rel": "extracts"})],
        vec![],
        true,
    )
    .map_err(internal_http_error)?;

    let dataset_message = new_server_message(
        "omnyid://server/extract".to_string(),
        vec![user.id.clone()],
        req.thread_id.clone(),
        AFP_TYPE_TABULAR_DATASET,
        serde_json::to_value(&dataset).unwrap_or_default(),
        vec![serde_json::json!({
            "format": "table",
            "content": {
                "label": dataset.title,
                "dataset_id": dataset.dataset_id,
                "columns": dataset.columns,
                "rows": rows_to_table_values(&dataset.columns, &dataset.rows),
                "source_message_ids": dataset.source_message_ids,
                "quality_status": dataset.quality_status,
                "confidence_overall": confidence,
                "warnings": warnings,
                "workflow_family_context": workflow_family_context.clone(),
            }
        })],
        vec![serde_json::json!({"id": source_message.id, "rel": "derived_from"})],
        vec![],
        true,
    )
    .map_err(internal_http_error)?;

    let extract_message_id = extract_message.id.clone();
    let dataset_message_id = dataset_message.id.clone();
    store_private_app_message(
        &state.db,
        &state.metrics,
        &state.relay_tx,
        &user.id,
        extract_message,
    )
    .await
    .map_err(internal_http_error)?;
    store_private_app_message(
        &state.db,
        &state.metrics,
        &state.relay_tx,
        &user.id,
        dataset_message,
    )
    .await
    .map_err(internal_http_error)?;

    Ok(Json(serde_json::json!({
        "extract_message_id": extract_message_id,
        "dataset_message_id": dataset_message_id,
        "thread_id": req.thread_id,
        "dataset_id": dataset_id,
        "row_count": dataset.rows.len(),
        "column_count": dataset.columns.len(),
        "quality_status": dataset.quality_status,
        "confidence_overall": confidence,
        "needs_review": dataset.quality_status == "review_required",
        "warnings": warnings,
    })))
}

pub(super) async fn review_dataset_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(req): Json<ReviewDatasetRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    enforce_rate_limit(
        &state,
        authenticated_rate_limit_key("review_dataset", &headers),
        RateLimitPolicy {
            max_requests: 20,
            window: Duration::from_secs(60),
        },
    )
    .await?;

    let user = authenticated_user(&state.db, &headers).await?;
    let decision = req.decision.trim().to_ascii_lowercase();
    if decision != "approved" && decision != "revised" {
        return Err((
            StatusCode::BAD_REQUEST,
            "decision must be approved or revised".to_string(),
        ));
    }

    let thread_messages = thread_messages_for_headers(&state.db, &headers, &req.thread_id).await?;
    let source_message = thread_messages
        .into_iter()
        .find(|message| message.id == req.dataset_message_id)
        .map(proto_to_app)
        .ok_or_else(|| {
            (
                StatusCode::NOT_FOUND,
                format!(
                    "dataset_message_id '{}' was not found in thread '{}'",
                    req.dataset_message_id, req.thread_id
                ),
            )
        })?;

    if source_message.r#type != AFP_TYPE_TABULAR_DATASET {
        return Err((
            StatusCode::BAD_REQUEST,
            format!(
                "dataset_message_id '{}' must reference a tabular_dataset message",
                req.dataset_message_id
            ),
        ));
    }

    let source_dataset: AfpTabularDataset = serde_json::from_value(source_message.content.clone())
        .map_err(|_| {
            (
                StatusCode::BAD_REQUEST,
                "tabular_dataset content is invalid".to_string(),
            )
        })?;

    let revised_title = req
        .title
        .clone()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| source_dataset.title.clone());
    let revised_columns = req
        .columns
        .clone()
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| source_dataset.columns.clone());
    let revised_rows = req
        .rows
        .clone()
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| source_dataset.rows.clone());

    if revised_columns.is_empty() || revised_rows.is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            "reviewed datasets must include at least one column and one row".to_string(),
        ));
    }
    if revised_rows
        .iter()
        .any(|row| row.len() != revised_columns.len())
    {
        return Err((
            StatusCode::BAD_REQUEST,
            "all reviewed dataset rows must match the column count".to_string(),
        ));
    }
    if decision == "revised"
        && revised_title == source_dataset.title
        && revised_columns == source_dataset.columns
        && revised_rows == source_dataset.rows
        && req.notes.is_empty()
    {
        return Err((
            StatusCode::BAD_REQUEST,
            "revised review requires changed data, changed title, or review notes".to_string(),
        ));
    }

    let (confidence_overall, warnings, _, _) = dataset_view_context(&source_message);
    let workflow_family_context =
        crate::workflow_instance_contracts::workflow_family_context_from_message(&source_message);
    let revision = AfpDatasetRevision {
        dataset_id: source_dataset.dataset_id.clone(),
        source_dataset_message_id: source_message.id.clone(),
        columns: revised_columns.clone(),
        rows: revised_rows.clone(),
        notes: req.notes.clone(),
    };
    let quality_status = if decision == "approved" {
        "approved".to_string()
    } else {
        "reviewed".to_string()
    };
    let reviewed_dataset = AfpTabularDataset {
        dataset_id: source_dataset.dataset_id.clone(),
        title: revised_title.clone(),
        columns: revised_columns.clone(),
        rows: revised_rows.clone(),
        source_message_ids: source_dataset.source_message_ids.clone(),
        quality_status: quality_status.clone(),
        workflow_family_context: workflow_family_context.clone(),
    };
    let revision_label = if decision == "approved" {
        "Dataset Approval"
    } else {
        "Dataset Revision"
    };
    let review_summary = if decision == "approved" {
        "Approved for downstream export and charting."
    } else {
        "Revised and promoted for downstream export and charting."
    };

    let revision_message = new_server_message(
        "omnyid://server/review".to_string(),
        vec![user.id.clone()],
        req.thread_id.clone(),
        AFP_TYPE_DATASET_REVISION,
        serde_json::to_value(&revision).unwrap_or_default(),
        vec![serde_json::json!({
            "format": "table",
            "content": {
                "label": revision_label,
                "dataset_id": revision.dataset_id,
                "columns": revised_columns.clone(),
                "rows": rows_to_table_values(&revision.columns, &revision.rows),
                "quality_status": quality_status.clone(),
                "notes": revision.notes.clone(),
                "summary": review_summary,
                "confidence_overall": confidence_overall,
                "warnings": warnings.clone(),
                "workflow_family_context": workflow_family_context.clone(),
            }
        })],
        vec![serde_json::json!({"id": source_message.id, "rel": "revises"})],
        vec![],
        true,
    )
    .map_err(internal_http_error)?;

    let reviewed_dataset_message = new_server_message(
        "omnyid://server/review".to_string(),
        vec![user.id.clone()],
        req.thread_id.clone(),
        AFP_TYPE_TABULAR_DATASET,
        serde_json::to_value(&reviewed_dataset).unwrap_or_default(),
        vec![serde_json::json!({
            "format": "table",
            "content": {
                "label": reviewed_dataset.title,
                "dataset_id": reviewed_dataset.dataset_id,
                "columns": reviewed_dataset.columns,
                "rows": rows_to_table_values(&reviewed_dataset.columns, &reviewed_dataset.rows),
                "source_message_ids": reviewed_dataset.source_message_ids,
                "quality_status": reviewed_dataset.quality_status,
                "notes": req.notes.clone(),
                "summary": review_summary,
                "confidence_overall": confidence_overall,
                "warnings": warnings,
                "previous_dataset_message_id": source_message.id,
                "supersedes_dataset_message_id": source_message.id,
                "workflow_family_context": workflow_family_context.clone(),
            }
        })],
        vec![
            serde_json::json!({"id": source_message.id, "rel": "supersedes"}),
            serde_json::json!({"id": revision_message.id.clone(), "rel": "approved_by"}),
        ],
        vec![],
        true,
    )
    .map_err(internal_http_error)?;

    let revision_message_id = revision_message.id.clone();
    let reviewed_dataset_message_id = reviewed_dataset_message.id.clone();
    store_private_app_message(
        &state.db,
        &state.metrics,
        &state.relay_tx,
        &user.id,
        revision_message,
    )
    .await
    .map_err(internal_http_error)?;
    store_private_app_message(
        &state.db,
        &state.metrics,
        &state.relay_tx,
        &user.id,
        reviewed_dataset_message,
    )
    .await
    .map_err(internal_http_error)?;

    Ok(Json(serde_json::json!({
        "thread_id": req.thread_id,
        "prior_dataset_message_id": source_message.id,
        "revision_message_id": revision_message_id,
        "reviewed_dataset_message_id": reviewed_dataset_message_id,
        "dataset_id": reviewed_dataset.dataset_id,
        "decision": decision,
        "quality_status": quality_status,
        "row_count": reviewed_dataset.rows.len(),
        "column_count": reviewed_dataset.columns.len(),
        "notes": req.notes,
    })))
}

pub(super) async fn create_chart_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(req): Json<CreateChartRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    enforce_rate_limit(
        &state,
        authenticated_rate_limit_key("create_chart", &headers),
        RateLimitPolicy {
            max_requests: 20,
            window: Duration::from_secs(60),
        },
    )
    .await?;

    let user = authenticated_user(&state.db, &headers).await?;
    let thread_messages = thread_messages_for_headers(&state.db, &headers, &req.thread_id).await?;
    let source_message = thread_messages
        .into_iter()
        .find(|message| message.id == req.dataset_message_id)
        .map(proto_to_app)
        .ok_or_else(|| {
            (
                StatusCode::NOT_FOUND,
                format!(
                    "dataset_message_id '{}' was not found in thread '{}'",
                    req.dataset_message_id, req.thread_id
                ),
            )
        })?;

    if source_message.r#type != AFP_TYPE_TABULAR_DATASET {
        return Err((
            StatusCode::BAD_REQUEST,
            format!(
                "dataset_message_id '{}' must reference a tabular_dataset message",
                req.dataset_message_id
            ),
        ));
    }

    let dataset: AfpTabularDataset = serde_json::from_value(source_message.content.clone())
        .map_err(|_| {
            (
                StatusCode::BAD_REQUEST,
                "tabular_dataset content is invalid".to_string(),
            )
        })?;
    let chart_type = normalize_chart_type(req.chart_type.as_deref());
    let (label_column, value_columns) =
        select_chart_columns(&dataset, &req).map_err(|err| (StatusCode::BAD_REQUEST, err))?;
    let chart_title = req
        .title
        .clone()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| format!("{} Chart", dataset.title));
    let workflow_family_context =
        crate::workflow_instance_contracts::workflow_family_context_from_message(&source_message);
    let chart_spec = AfpChartSpec {
        dataset_id: dataset.dataset_id.clone(),
        chart_type: chart_type.clone(),
        label_column: label_column.clone(),
        value_columns: value_columns.clone(),
        title: Some(chart_title.clone()),
        workflow_family_context: workflow_family_context.clone(),
    };
    let mut chart_view = build_chart_view_content(
        &dataset,
        &chart_type,
        &label_column,
        &value_columns,
        &chart_title,
    )
    .map_err(|err| (StatusCode::BAD_REQUEST, err))?;
    crate::workflow_instance_contracts::attach_workflow_family_context(
        &mut chart_view,
        workflow_family_context.as_ref(),
    );

    let chart_message = new_server_message(
        "omnyid://server/chart".to_string(),
        vec![user.id.clone()],
        req.thread_id.clone(),
        AFP_TYPE_CHART_SPEC,
        serde_json::to_value(&chart_spec).unwrap_or_default(),
        vec![serde_json::json!({
            "format": "chart_view",
            "content": chart_view,
            "priority": 100
        })],
        vec![serde_json::json!({"id": source_message.id, "rel": "visualizes"})],
        vec![],
        true,
    )
    .map_err(internal_http_error)?;

    let chart_message_id = chart_message.id.clone();
    store_private_app_message(
        &state.db,
        &state.metrics,
        &state.relay_tx,
        &user.id,
        chart_message,
    )
    .await
    .map_err(internal_http_error)?;

    Ok(Json(serde_json::json!({
        "thread_id": req.thread_id,
        "chart_message_id": chart_message_id,
        "dataset_id": dataset.dataset_id,
        "chart_type": chart_type,
        "label_column": label_column,
        "value_columns": value_columns,
        "title": chart_title,
    })))
}

pub(super) async fn ingest_weather_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(req): Json<IngestWeatherRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    enforce_rate_limit(
        &state,
        authenticated_rate_limit_key("ingest_weather", &headers),
        RateLimitPolicy {
            max_requests: 20,
            window: Duration::from_secs(60),
        },
    )
    .await?;

    let user = authenticated_user(&state.db, &headers).await?;
    let days = req.days.unwrap_or(7).clamp(1, 14);
    let location_query = req.location_query.trim();
    if location_query.is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            "location_query is required".to_string(),
        ));
    }

    let outcome = ingest_weather_for_user(
        &state,
        &user.id,
        &req.thread_id,
        location_query,
        days,
        req.auto_chart.unwrap_or(true),
        true,
    )
    .await
    .map_err(|err| (StatusCode::BAD_GATEWAY, err))?;

    let mut response = serde_json::json!({
        "thread_id": req.thread_id,
        "dataset_message_id": outcome.dataset_message.id,
        "dataset_id": outcome.dataset_id,
        "title": outcome.title,
        "location": {
            "name": outcome.location_label,
        },
        "days": outcome.days,
        "row_count": outcome
            .dataset_message
            .content
            .get("rows")
            .and_then(serde_json::Value::as_array)
            .map(|rows| rows.len())
            .unwrap_or(0),
    });

    if let Some(chart_message) = outcome.chart_message {
        response["chart_message_id"] = serde_json::json!(chart_message.id);
    }

    Ok(Json(response))
}

pub(super) async fn ingest_budget_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(req): Json<IngestBudgetRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    enforce_rate_limit(
        &state,
        authenticated_rate_limit_key("ingest_budget", &headers),
        RateLimitPolicy {
            max_requests: 20,
            window: Duration::from_secs(60),
        },
    )
    .await?;

    let user = authenticated_user(&state.db, &headers).await?;
    let outcome = ingest_budget_projection_for_user(
        &state,
        &user.id,
        &req.thread_id,
        req.title.as_deref(),
        req.persona.as_deref(),
        req.months,
        req.monthly_income,
        req.fixed_expenses,
        req.variable_expenses,
        req.savings_goal,
        req.auto_chart.unwrap_or(true),
        true,
    )
    .await
    .map_err(|err| (StatusCode::BAD_GATEWAY, err))?;

    Ok(Json(serde_json::json!({
        "thread_id": req.thread_id,
        "dataset_message_id": outcome.dataset_message.id,
        "chart_message_id": outcome.chart_message.as_ref().map(|message| message.id.clone()),
        "dataset_id": outcome.dataset_id,
        "title": outcome.title,
        "months": outcome.months,
        "warnings": outcome.warnings,
    })))
}

pub(super) async fn digest_content_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(req): Json<DigestContentRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    enforce_rate_limit(
        &state,
        authenticated_rate_limit_key("digest_content", &headers),
        RateLimitPolicy {
            max_requests: 20,
            window: Duration::from_secs(60),
        },
    )
    .await?;

    let user = authenticated_user(&state.db, &headers).await?;
    let thread_messages = thread_messages_for_headers(&state.db, &headers, &req.thread_id).await?;
    let source_message = thread_messages
        .into_iter()
        .map(proto_to_app)
        .find(|message| message.id == req.source_message_id)
        .ok_or_else(|| {
            (
                StatusCode::BAD_REQUEST,
                format!(
                    "source_message_id '{}' was not found in thread '{}'",
                    req.source_message_id, req.thread_id
                ),
            )
        })?;

    let outcome = digest_content_for_user(&state, &user.id, &req.thread_id, &source_message, true)
        .await
        .map_err(|err| (StatusCode::BAD_REQUEST, err))?;

    Ok(Json(serde_json::json!({
        "thread_id": req.thread_id,
        "digest_message_id": outcome.digest_message.id,
        "title": outcome.title,
        "summary": outcome.summary,
        "action_items": outcome.action_items,
    })))
}

// -- POST /ingest/drop — sidebar drag-and-drop ingest -------------------------

/// Payload sent by the frontend when the user drops a file, URL, or text
/// snippet onto the sidebar.  The server stores a `knowledge_card` AFP message
/// so the Knowledge Curator daemon can pick it up in the next backfill pass.
#[derive(serde::Deserialize)]
pub(super) struct DropIngestRequest {
    /// "file" | "url" | "text"
    pub kind: String,
    /// Human-readable label (file name, URL string, or first line of text).
    pub name: String,
    /// UTF-8 content: base64-encoded for files, raw for URL/text.
    pub content: String,
    #[serde(default)]
    pub mime_type: Option<String>,
    /// Optional thread to link the card to.  Defaults to a per-drop thread.
    #[serde(default)]
    pub thread_id: Option<String>,
}

pub(super) async fn ingest_drop_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(req): Json<DropIngestRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    enforce_rate_limit(
        &state,
        authenticated_rate_limit_key("ingest_drop", &headers),
        RateLimitPolicy {
            max_requests: 60,
            window: Duration::from_secs(60),
        },
    )
    .await?;

    let user = authenticated_user(&state.db, &headers).await?;

    let card_id = ulid::Ulid::new().to_string();
    let thread_id = req
        .thread_id
        .clone()
        .unwrap_or_else(|| format!("thread.drop.{card_id}"));

    let content = serde_json::json!({
        "card_id": card_id,
        "source_id": card_id,
        "summary": format!("Drop-ingested {}: {}", req.kind, req.name),
        "supertags": [],
        "entities": [],
        "card_json": {
            "kind": req.kind,
            "name": req.name,
            "content": req.content,
            "mime_type": req.mime_type,
        },
        "model_version": "drop_ingest_v1",
    });

    let views = vec![serde_json::json!({
        "format": "knowledge_card",
        "content": {
            "title": req.name,
            "kind": req.kind,
            "mime_type": req.mime_type,
        }
    })];

    let agent_id = format!(
        "omnyid://server/ingest-drop@{}",
        std::env::var("OMNYID_DOMAIN").unwrap_or_else(|_| "local".to_string())
    );

    let message = new_server_message(
        agent_id,
        vec![user.id.clone()],
        thread_id.clone(),
        "knowledge_card",
        content,
        views,
        vec![],
        vec![],
        true,
    )
    .map_err(internal_http_error)?;

    let msg_id = message.id.clone();
    store_private_app_message(
        &state.db,
        &state.metrics,
        &state.relay_tx,
        &user.id,
        message,
    )
    .await
    .map_err(internal_http_error)?;

    tracing::info!(
        user_id = %user.id,
        thread_id = %thread_id,
        msg_id = %msg_id,
        kind = %req.kind,
        name = %req.name,
        "ingest_drop: knowledge_card stored"
    );

    Ok(Json(serde_json::json!({
        "message_id": msg_id,
        "thread_id": thread_id,
        "card_id": card_id,
        "kind": req.kind,
        "name": req.name,
    })))
}

#[cfg(test)]
mod tests {
    use super::*;
    use base64::Engine as _;

    #[tokio::test]
    async fn resolve_source_from_message_prefers_content_source_url() {
        let message = AFPMessage {
            protocol: "afp-v1".to_string(),
            id: "msg_1".to_string(),
            thread_id: "thread_1".to_string(),
            parent_id: None,
            from: "omnyid://test/source".to_string(),
            to: vec![],
            timestamp: "2026-01-01T00:00:00Z".to_string(),
            r#type: AFP_TYPE_PARSED_DOCUMENT.to_string(),
            kind: None,
            supertags: vec![],
            subtype: None,
            content: serde_json::json!({
                "source_url": "https://example.com/report.pdf",
                "source_attachment_id": "att_123",
                "mime_type": "application/pdf"
            }),
            metadata: None,
            signature: String::new(),
            encryption: None,
            views: vec![],
            references: vec![],
            typed_refs: vec![],
            attachments: vec![],
            store_in_relational: true,
            prev_hash: None,
        };

        let resolved = resolve_source_from_message(&message, None, None)
            .await
            .expect("message source should resolve");
        assert_eq!(
            resolved.source_url.as_deref(),
            Some("https://example.com/report.pdf")
        );
        assert_eq!(resolved.source_kind, "afp_message");
        assert_eq!(resolved.source_message_id.as_deref(), Some("msg_1"));
        assert_eq!(resolved.source_attachment_id.as_deref(), Some("att_123"));
        assert_eq!(resolved.mime_type.as_deref(), Some("application/pdf"));
    }

    #[tokio::test]
    async fn resolve_source_from_message_uses_attachment_storage_url() {
        let message = AFPMessage {
            protocol: "afp-v1".to_string(),
            id: "msg_2".to_string(),
            thread_id: "thread_1".to_string(),
            parent_id: None,
            from: "omnyid://test/source".to_string(),
            to: vec![],
            timestamp: "2026-01-01T00:00:00Z".to_string(),
            r#type: AFP_TYPE_PARSED_DOCUMENT.to_string(),
            kind: None,
            supertags: vec![],
            subtype: None,
            content: serde_json::json!({}),
            metadata: None,
            signature: String::new(),
            encryption: None,
            views: vec![],
            references: vec![],
            typed_refs: vec![],
            attachments: vec![serde_json::json!({
                "id": "att_456",
                "mime_type": "audio/mpeg",
                "storage": { "download_url": "https://cdn.example.com/audio.mp3" }
            })],
            store_in_relational: true,
            prev_hash: None,
        };

        let resolved = resolve_source_from_message(&message, None, None)
            .await
            .expect("attachment-backed source should resolve");
        assert_eq!(
            resolved.source_url.as_deref(),
            Some("https://cdn.example.com/audio.mp3")
        );
        assert_eq!(resolved.source_attachment_id.as_deref(), Some("att_456"));
        assert_eq!(resolved.mime_type.as_deref(), Some("audio/mpeg"));
    }

    #[tokio::test]
    async fn resolve_source_from_message_decodes_inline_attachment() {
        let inline_payload =
            base64::engine::general_purpose::STANDARD.encode("date,temp\n2026-05-01,22");
        let message = AFPMessage {
            protocol: "afp-v1".to_string(),
            id: "msg_3".to_string(),
            thread_id: "thread_1".to_string(),
            parent_id: None,
            from: "omnyid://test/source".to_string(),
            to: vec![],
            timestamp: "2026-01-01T00:00:00Z".to_string(),
            r#type: AFP_TYPE_PARSED_DOCUMENT.to_string(),
            kind: None,
            supertags: vec![],
            subtype: None,
            content: serde_json::json!({}),
            metadata: None,
            signature: String::new(),
            encryption: None,
            views: vec![],
            references: vec![],
            typed_refs: vec![],
            attachments: vec![serde_json::json!({
                "id": "att_inline",
                "name": "weather.csv",
                "mime_type": "text/csv",
                "storage": { "kind": "inline_base64", "data_base64": inline_payload }
            })],
            store_in_relational: true,
            prev_hash: None,
        };

        let resolved = resolve_source_from_message(&message, Some("att_inline"), None)
            .await
            .expect("inline attachment should resolve");
        assert_eq!(resolved.source_kind, "afp_message_attachment");
        assert_eq!(resolved.source_url, None);
        assert_eq!(resolved.source_attachment_id.as_deref(), Some("att_inline"));
        match resolved.payload {
            ResolvedSourcePayload::InlineBytes { bytes, file_name } => {
                assert_eq!(
                    String::from_utf8(bytes).unwrap(),
                    "date,temp\n2026-05-01,22"
                );
                assert_eq!(file_name.as_deref(), Some("weather.csv"));
            }
            ResolvedSourcePayload::RemoteUrl(_) => panic!("expected inline bytes"),
        }
    }

    #[test]
    fn attachment_support_descriptor_marks_audio_as_server_processing() {
        let (mode, label, description) =
            attachment_support_descriptor(Some("lecture-week3.m4a"), Some("audio/mp4"), false);
        assert_eq!(mode, AttachmentSupportMode::ServerProcessing);
        assert_eq!(label, "Server read");
        assert!(description.contains("server-side"));
    }

    #[test]
    fn attachment_support_descriptor_marks_legacy_office_as_gap() {
        let (mode, label, description) =
            attachment_support_descriptor(Some("lecture_notes.ppt"), None, false);
        assert_eq!(mode, AttachmentSupportMode::NotSupportedYet);
        assert_eq!(label, "Legacy gap");
        assert!(description.contains("legacy file format"));
    }

    #[test]
    fn attachment_support_descriptor_marks_inline_text_as_ready() {
        let (mode, label, description) =
            attachment_support_descriptor(Some("summary.md"), Some("text/markdown"), true);
        assert_eq!(mode, AttachmentSupportMode::InlineText);
        assert_eq!(label, "Ready now");
        assert!(description.contains("immediately"));
    }

    #[test]
    fn attachment_support_descriptor_marks_pdf_without_parser_as_gap() {
        let (mode, label, description) =
            attachment_support_descriptor(Some("scan.pdf"), Some("application/pdf"), false);
        assert_eq!(mode, AttachmentSupportMode::NotSupportedYet);
        assert_eq!(label, "PDF parser gap");
        assert!(description.contains("no server PDF parser"));
    }

    #[test]
    fn cleanup_target_guard_accepts_ephemeral_connected_notes_outputs() {
        assert!(cleanup_target_is_ephemeral_ingest_output(
            AFP_TYPE_PARSED_DOCUMENT,
            Some(&serde_json::json!({
                "knowledge_pipeline": "connected_notes_ingest",
                "ephemeral_output": true
            })),
        ));
        assert!(cleanup_target_is_ephemeral_ingest_output(
            AFP_TYPE_TRANSCRIPT,
            Some(&serde_json::json!({
                "knowledge_pipeline": "connected_notes_ingest",
                "ephemeral_output": true
            })),
        ));
    }

    #[test]
    fn cleanup_target_guard_rejects_non_ephemeral_or_unrelated_messages() {
        assert!(!cleanup_target_is_ephemeral_ingest_output(
            AFP_TYPE_PARSED_DOCUMENT,
            Some(&serde_json::json!({
                "knowledge_pipeline": "connected_notes_ingest",
                "ephemeral_output": false
            })),
        ));
        assert!(!cleanup_target_is_ephemeral_ingest_output(
            "note",
            Some(&serde_json::json!({
                "knowledge_pipeline": "connected_notes_ingest",
                "ephemeral_output": true
            })),
        ));
        assert!(!cleanup_target_is_ephemeral_ingest_output(
            AFP_TYPE_TRANSCRIPT,
            Some(&serde_json::json!({
                "knowledge_pipeline": "other_pipeline",
                "ephemeral_output": true
            })),
        ));
        assert!(!cleanup_target_is_ephemeral_ingest_output(
            AFP_TYPE_TRANSCRIPT,
            None,
        ));
    }

    #[test]
    fn persist_ephemeral_ingest_output_promotes_retention_contract_and_supertags() {
        let mut message = AFPMessage {
            id: "msg.persist.1".to_string(),
            thread_id: "thread.persist.1".to_string(),
            from: "omnyid://server/test".to_string(),
            to: vec!["user_123".to_string()],
            timestamp: "2026-09-02T00:00:00Z".to_string(),
            r#type: AFP_TYPE_PARSED_DOCUMENT.to_string(),
            supertags: vec![
                "knowledge:connected_notes".to_string(),
                "retention:keep_nothing".to_string(),
                "zk:source_note".to_string(),
            ],
            content: serde_json::json!({
                "title": "Week 3 Notes",
                "content_text": "Important idea"
            }),
            metadata: Some(serde_json::json!({
                "knowledge_pipeline": "connected_notes_ingest",
                "ephemeral_output": true,
                "cleanup_required": true,
                "derived_content_persisted": false,
                "source_persisted": false,
                "attachment_retention_mode": "keep_nothing",
                "attachment_retention_label": "Keep nothing after this run",
                "retention_mode": "retention:keep_nothing",
                "knowledge_mode": "zettelkasten"
            })),
            ..Default::default()
        };

        persist_ephemeral_ingest_output(&mut message)
            .expect("ephemeral output should be persistable");

        assert!(
            message
                .supertags
                .iter()
                .any(|tag| tag == "retention:keep_extracted_only")
        );
        assert!(
            !message
                .supertags
                .iter()
                .any(|tag| tag == "retention:keep_nothing")
        );
        assert!(message.supertags.iter().any(|tag| tag == "zk:source_note"));
        assert_eq!(
            message
                .metadata
                .as_ref()
                .and_then(|metadata| metadata.get("ephemeral_output"))
                .and_then(serde_json::Value::as_bool),
            Some(false)
        );
        assert_eq!(
            message
                .metadata
                .as_ref()
                .and_then(|metadata| metadata.get("cleanup_required"))
                .and_then(serde_json::Value::as_bool),
            Some(false)
        );
        assert_eq!(
            message
                .metadata
                .as_ref()
                .and_then(|metadata| metadata.get("derived_content_persisted"))
                .and_then(serde_json::Value::as_bool),
            Some(true)
        );
        assert_eq!(
            message
                .metadata
                .as_ref()
                .and_then(|metadata| metadata.get("attachment_retention_mode"))
                .and_then(serde_json::Value::as_str),
            Some("keep_extracted_only")
        );
    }

    #[test]
    fn attachment_batch_limits_stay_within_interactive_bounds() {
        assert!(ATTACHMENT_BATCH_MAX_UPLOADS >= 1);
        assert!(ATTACHMENT_BATCH_MAX_UPLOADS <= 24);
        assert!(ATTACHMENT_CLEANUP_MAX_MESSAGE_IDS >= ATTACHMENT_BATCH_MAX_UPLOADS);
    }

    #[test]
    fn extend_supertags_for_extraction_adds_pipeline_and_extraction_tags() {
        let tags = extend_supertags_for_extraction(
            vec![
                "knowledge:connected_notes".to_string(),
                "resource:study_material".to_string(),
            ],
            "openai_image_ocr",
            false,
        );
        assert!(tags.iter().any(|tag| tag == "pipeline:ocr"));
        assert!(tags.iter().any(|tag| tag == "source:ocr_text"));
        assert!(tags.iter().any(|tag| tag == "extraction:openai_image_ocr"));
    }

    #[test]
    fn extend_supertags_for_extraction_marks_inline_client_extracts() {
        let tags = extend_supertags_for_extraction(
            vec!["knowledge:connected_notes".to_string()],
            "client_text_read",
            true,
        );
        assert!(tags.iter().any(|tag| tag == "pipeline:inline_extract"));
        assert!(tags.iter().any(|tag| tag == "pipeline:client_extract"));
        assert!(tags.iter().any(|tag| tag == "extraction:client_text_read"));
    }

    #[test]
    fn infer_attachment_supertags_detects_academic_slide_material() {
        let tags = infer_attachment_supertags(
            Some("summarise week 3 biology lecture"),
            Some("Biology Week 3 Lecture Slides.pptx"),
            Some("application/vnd.openxmlformats-officedocument.presentationml.presentation"),
            AttachmentRetentionMode::KeepExtractedOnly,
            KnowledgeOrganizationMode::ConnectedNotes,
        );
        assert!(tags.iter().any(|tag| tag == "academic:lecture"));
        assert!(tags.iter().any(|tag| tag == "academic:slides"));
        assert!(tags.iter().any(|tag| tag == "resource:slide_deck"));
        assert!(tags.iter().any(|tag| tag == "week:3"));
        assert!(tags.iter().any(|tag| tag == "topic:biology"));
    }

    #[test]
    fn infer_attachment_supertags_adds_zettelkasten_overlay_tags() {
        let tags = infer_attachment_supertags(
            Some("compare this reading with my previous note"),
            Some("Decision Theory Reading.pdf"),
            Some("application/pdf"),
            AttachmentRetentionMode::KeepExtractedOnly,
            KnowledgeOrganizationMode::Zettelkasten,
        );
        assert!(tags.iter().any(|tag| tag == "resource:zettelkasten"));
        assert!(tags.iter().any(|tag| tag == "knowledge:zettelkasten"));
        assert!(tags.iter().any(|tag| tag == "zk:source_note"));
        assert!(tags.iter().any(|tag| tag == "zk:review_pending"));
        assert!(tags.iter().any(|tag| tag == "knowledge_mode:zettelkasten"));
    }

    #[test]
    fn infer_attachment_supertags_extracts_course_week_and_instructor_context() {
        let tags = infer_attachment_supertags(
            Some("summarise week 4 for course econ 101 with professor smith"),
            Some("ECON101 Week 4 Tutorial Notes.pdf"),
            Some("application/pdf"),
            AttachmentRetentionMode::KeepExtractedOnly,
            KnowledgeOrganizationMode::ConnectedNotes,
        );
        assert!(tags.iter().any(|tag| tag == "course:econ101"));
        assert!(tags.iter().any(|tag| tag == "week:4"));
        assert!(tags.iter().any(|tag| tag == "instructor:smith"));
        assert!(tags.iter().any(|tag| tag == "resource:tutorial_sheet"));
        assert!(tags.iter().any(|tag| tag == "resource:study_notes"));
    }

    #[test]
    fn infer_attachment_semantic_metadata_summarizes_academic_context() {
        let metadata = infer_attachment_semantic_metadata(
            &[
                "resource:study_material".to_string(),
                "academic:lecture".to_string(),
                "academic:slides".to_string(),
                "course:bio101".to_string(),
                "week:3".to_string(),
                "lecture:3".to_string(),
                "chapter:4".to_string(),
                "unit:cellular-respiration".to_string(),
            ],
            Some("BIO101 Week 3 Lecture Slides.pdf"),
            KnowledgeOrganizationMode::Zettelkasten,
        );
        assert_eq!(metadata.academic_kind.as_deref(), Some("lecture slides"));
        assert_eq!(
            metadata.academic_course_tag.as_deref(),
            Some("course:bio101")
        );
        assert_eq!(metadata.academic_week_tag.as_deref(), Some("week:3"));
        assert_eq!(metadata.academic_lecture_tag.as_deref(), Some("lecture:3"));
        assert_eq!(metadata.academic_chapter_tag.as_deref(), Some("chapter:4"));
        assert_eq!(
            metadata.academic_unit_tag.as_deref(),
            Some("unit:cellular-respiration")
        );
        assert_eq!(
            metadata.academic_summary.as_deref(),
            Some(
                "lecture slides | course bio101 | week 3 | lecture 3 | chapter 4 | unit cellular-respiration organized for study retrieval."
            )
        );
        assert_eq!(
            metadata.zettelkasten_stage.as_deref(),
            Some("source_note_review_pending")
        );
        assert_eq!(
            metadata.zettelkasten_entry_type.as_deref(),
            Some("source_note")
        );
        assert!(
            metadata
                .zettelkasten_next_action
                .as_deref()
                .unwrap_or_default()
                .contains("write a permanent note")
        );
        assert_eq!(
            metadata.knowledge_graph_group_key.as_deref(),
            Some("course:bio101")
        );
        assert!(metadata.knowledge_graph_seed);
        assert!(
            metadata
                .knowledge_graph_link_tags
                .iter()
                .any(|tag| tag == "course:bio101")
        );
    }

    #[test]
    fn infer_attachment_semantic_metadata_uses_source_name_as_graph_fallback() {
        let metadata = infer_attachment_semantic_metadata(
            &["knowledge_mode:connected_notes".to_string()],
            Some("Decision fatigue reading notes.pdf"),
            KnowledgeOrganizationMode::ConnectedNotes,
        );
        assert_eq!(
            metadata.knowledge_graph_group_key.as_deref(),
            Some("source:decision_fatigue_reading_notes_pdf")
        );
        assert!(metadata.knowledge_graph_seed);
        assert!(metadata.zettelkasten_entry_type.is_none());
    }

    #[test]
    fn retention_contract_flags_match_each_mode() {
        assert_eq!(
            retention_mode_value(AttachmentRetentionMode::KeepFile),
            "keep_file"
        );
        assert_eq!(
            retention_mode_label(AttachmentRetentionMode::KeepFile),
            "Keep files and extracted knowledge"
        );
        assert_eq!(
            retention_source_persisted(AttachmentRetentionMode::KeepFile),
            true
        );
        assert_eq!(
            retention_derived_content_persisted(AttachmentRetentionMode::KeepFile),
            true
        );
        assert_eq!(
            retention_cleanup_required(AttachmentRetentionMode::KeepFile),
            false
        );

        assert_eq!(
            retention_mode_value(AttachmentRetentionMode::KeepExtractedOnly),
            "keep_extracted_only"
        );
        assert_eq!(
            retention_mode_label(AttachmentRetentionMode::KeepExtractedOnly),
            "Keep extracted knowledge only"
        );
        assert_eq!(
            retention_source_persisted(AttachmentRetentionMode::KeepExtractedOnly),
            false
        );
        assert_eq!(
            retention_derived_content_persisted(AttachmentRetentionMode::KeepExtractedOnly),
            true
        );
        assert_eq!(
            retention_cleanup_required(AttachmentRetentionMode::KeepExtractedOnly),
            false
        );

        assert_eq!(
            retention_mode_value(AttachmentRetentionMode::KeepNothing),
            "keep_nothing"
        );
        assert_eq!(
            retention_mode_label(AttachmentRetentionMode::KeepNothing),
            "Keep nothing after this run"
        );
        assert_eq!(
            retention_source_persisted(AttachmentRetentionMode::KeepNothing),
            false
        );
        assert_eq!(
            retention_derived_content_persisted(AttachmentRetentionMode::KeepNothing),
            false
        );
        assert_eq!(
            retention_cleanup_required(AttachmentRetentionMode::KeepNothing),
            true
        );
    }

    #[test]
    fn select_parser_returns_pdf_unavailable_when_no_pdf_parser_configured() {
        assert_eq!(select_parser("application/pdf", None), "pdf_unavailable");
    }

    #[tokio::test]
    async fn call_parser_rejects_pdf_when_parser_is_unavailable() {
        let source = ResolvedIngestSource {
            payload: ResolvedSourcePayload::RemoteUrl("https://example.com/file.pdf".to_string()),
            source_url: Some("https://example.com/file.pdf".to_string()),
            source_kind: "web_url".to_string(),
            source_message_id: None,
            source_attachment_id: None,
            mime_type: Some("application/pdf".to_string()),
        };
        let err = call_parser("pdf_unavailable", &source, "application/pdf")
            .await
            .expect_err("pdf parser should fail explicitly when unavailable");
        assert!(err.contains("PDF parsing is not configured"));
    }

    #[test]
    fn parse_dataset_from_text_extracts_header_and_rows() {
        let text = "date,temperature,rain\n2026-05-01,22,0\n2026-05-02,18,4";
        let (columns, rows, warnings, confidence) =
            parse_dataset_from_text(text, None, Some(true)).expect("dataset should parse");
        assert_eq!(columns, vec!["date", "temperature", "rain"]);
        assert_eq!(rows.len(), 2);
        assert!(warnings.is_empty());
        assert!(confidence > 0.8);
    }

    #[test]
    fn quality_status_from_confidence_requires_review_when_low() {
        assert_eq!(
            quality_status_from_confidence(0.61, &["mismatch".to_string()]),
            "review_required"
        );
    }

    #[test]
    fn rows_to_table_values_preserves_column_order() {
        let columns = vec!["date".to_string(), "temperature".to_string()];
        let rows = vec![vec!["2026-05-01".to_string(), "22".to_string()]];
        let values = rows_to_table_values(&columns, &rows);
        assert_eq!(values.len(), 1);
        assert_eq!(values[0]["date"], "2026-05-01");
        assert_eq!(values[0]["temperature"], "22");
    }

    #[tokio::test]
    async fn validate_remote_source_url_rejects_private_and_link_local_hosts() {
        let err = validate_remote_source_url("http://169.254.169.254/latest/meta-data")
            .await
            .expect_err("metadata host should be blocked");
        assert_eq!(err.0, StatusCode::BAD_REQUEST);
        assert!(err.1.contains("169.254.169.254"));

        let err = validate_remote_source_url("https://localhost/secrets")
            .await
            .expect_err("localhost should be blocked");
        assert_eq!(err.0, StatusCode::BAD_REQUEST);
        assert!(err.1.contains("localhost"));
    }

    #[tokio::test]
    async fn validate_remote_source_url_allows_public_hosts() {
        validate_remote_source_url("https://example.com/report.pdf")
            .await
            .expect("public host should be allowed");
    }

    #[test]
    fn select_chart_columns_prefers_numeric_columns() {
        let dataset = AfpTabularDataset {
            dataset_id: "dataset_1".to_string(),
            title: "Weather".to_string(),
            columns: vec![
                "date".to_string(),
                "temperature".to_string(),
                "rain".to_string(),
            ],
            rows: vec![
                vec!["2026-05-01".to_string(), "22".to_string(), "0".to_string()],
                vec!["2026-05-02".to_string(), "18".to_string(), "4".to_string()],
            ],
            source_message_ids: vec![],
            quality_status: "approved".to_string(),
            workflow_family_context: None,
        };
        let req = CreateChartRequest {
            thread_id: "thread_1".to_string(),
            dataset_message_id: "msg_1".to_string(),
            chart_type: None,
            label_column: None,
            value_columns: None,
            title: None,
        };

        let (label_column, value_columns) =
            select_chart_columns(&dataset, &req).expect("chart columns should resolve");
        assert_eq!(label_column, "date");
        assert_eq!(value_columns, vec!["temperature", "rain"]);
    }

    #[test]
    fn build_weather_dataset_creates_daily_rows() {
        let location = OpenMeteoGeocodeResult {
            name: "Sydney".to_string(),
            latitude: -33.86,
            longitude: 151.21,
            country: Some("Australia".to_string()),
            admin1: Some("New South Wales".to_string()),
            timezone: Some("Australia/Sydney".to_string()),
        };
        let forecast = OpenMeteoForecastResponse {
            daily: OpenMeteoDailyForecast {
                time: vec!["2026-05-13".to_string(), "2026-05-14".to_string()],
                temperature_2m_max: vec![22.0, 20.0],
                temperature_2m_min: vec![15.0, 14.0],
                precipitation_sum: vec![0.0, 3.2],
                weather_code: vec![1, 61],
            },
        };

        let dataset =
            build_weather_dataset(&location, forecast).expect("weather dataset should build");
        assert_eq!(dataset.quality_status, "approved");
        assert_eq!(dataset.columns[0], "date");
        assert_eq!(dataset.rows.len(), 2);
        assert_eq!(dataset.rows[0][1], "22");
        assert!(dataset.title.contains("Sydney"));
    }

    #[test]
    fn build_budget_projection_dataset_marks_missing_inputs_as_draft() {
        let (dataset, warnings) = build_budget_projection_dataset(
            "Freelancer Budget Projection".to_string(),
            3,
            Some(5000.0),
            None,
            Some(1200.0),
            Some(800.0),
        );
        assert_eq!(dataset.quality_status, "draft");
        assert_eq!(dataset.rows.len(), 3);
        assert_eq!(dataset.columns[0], "month");
        assert_eq!(dataset.rows[0][5], "3000.00");
        assert_eq!(dataset.rows[0][6], "3000.00");
        assert!(
            warnings
                .iter()
                .any(|warning| warning.contains("Fixed expenses"))
        );
    }

    #[test]
    fn build_content_digest_extracts_summary_and_actions() {
        let source_message = AFPMessage {
            protocol: "afp-v1".to_string(),
            id: "msg_transcript".to_string(),
            thread_id: "thread_1".to_string(),
            parent_id: None,
            from: "omnyid://test/source".to_string(),
            to: vec![],
            timestamp: "2026-01-01T00:00:00Z".to_string(),
            r#type: AFP_TYPE_TRANSCRIPT.to_string(),
            kind: None,
            supertags: vec![],
            subtype: None,
            content: serde_json::json!({
                "model_used": "whisper-1",
                "text": "We agreed to ship the export fix this week. Action: update the release checklist. Next step: notify support once the patch lands.",
                "segments": []
            }),
            metadata: None,
            signature: String::new(),
            encryption: None,
            views: vec![],
            references: vec![],
            typed_refs: vec![],
            attachments: vec![],
            store_in_relational: false,
            prev_hash: None,
        };

        let digest = build_content_digest(&source_message).expect("digest should build");
        assert!(digest.summary.contains("ship the export fix"));
        assert!(!digest.action_items.is_empty());
        assert_eq!(digest.source_message_type, AFP_TYPE_TRANSCRIPT);
    }

    #[test]
    fn document_ingest_cost_estimate_is_zero_for_local_parsers() {
        assert_eq!(estimate_document_ingest_cost_usd("readability"), 0.0);
        assert_eq!(estimate_document_ingest_cost_usd("unstructured"), 0.0);
    }

    #[test]
    fn document_ingest_cost_estimate_is_positive_for_remote_parsers() {
        assert!(estimate_document_ingest_cost_usd("mineru") > 0.0);
        assert!(estimate_document_ingest_cost_usd("llamaparse") > 0.0);
    }

    #[test]
    fn audio_transcription_cost_estimate_scales_with_duration() {
        assert_eq!(estimate_audio_transcription_cost_usd(None), 0.0);
        let short = estimate_audio_transcription_cost_usd(Some(30.0));
        let long = estimate_audio_transcription_cost_usd(Some(180.0));
        assert!(short > 0.0);
        assert!(long > short);
    }

    #[test]
    fn ingest_routes_sanitize_message_construction_failures() {
        let source = include_str!("ingest_routes.rs");
        let route_sections = [
            (
                "pub(super) async fn ingest_document_http(",
                "pub(super) async fn ingest_audio_http(",
            ),
            (
                "pub(super) async fn ingest_audio_http(",
                "pub(super) async fn extract_document_http(",
            ),
            (
                "pub(super) async fn extract_document_http(",
                "pub(super) async fn review_dataset_http(",
            ),
            (
                "pub(super) async fn review_dataset_http(",
                "pub(super) async fn create_chart_http(",
            ),
            (
                "pub(super) async fn create_chart_http(",
                "pub(super) async fn ingest_weather_http(",
            ),
            ("pub(super) async fn ingest_drop_http(", "#[cfg(test)]"),
        ]
        .map(|(start, end)| {
            source
                .split(start)
                .nth(1)
                .and_then(|section| section.split(end).next())
                .expect("ingest handler section")
        });
        let delegated_constructor_sections = [
            (
                "async fn store_ingested_document_message(",
                "async fn store_ingested_transcript_message(",
            ),
            (
                "async fn store_ingested_transcript_message(",
                "fn parse_attachment_retention_mode(",
            ),
        ]
        .map(|(start, end)| {
            source
                .split(start)
                .nth(1)
                .and_then(|section| section.split(end).next())
                .expect("delegated ingest constructor section")
        });
        assert!(
            route_sections[2..]
                .iter()
                .all(|section| section.contains(".map_err(internal_http_error)?;")),
            "ingest routes should sanitize AFP message construction failures"
        );
        assert!(
            delegated_constructor_sections
                .iter()
                .all(|section| section.contains(".map_err(internal_http_error)?;")),
            "delegated ingest constructors should sanitize AFP message construction failures"
        );
        assert!(
            route_sections.iter().all(|section| !section
                .contains(".map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;")),
            "ingest routes should not echo raw internal constructor errors"
        );
        assert!(
            delegated_constructor_sections.iter().all(|section| !section
                .contains(".map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;")),
            "delegated ingest constructors should not echo raw internal constructor errors"
        );
    }
}
