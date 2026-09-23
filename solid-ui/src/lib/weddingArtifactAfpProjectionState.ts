// @locs-version: 2.0
import type { AfpMessage, SendAfpMessageInput } from "@/lib/api";
import type { WeddingGeneratedArtifact } from "@/lib/weddingArtifactGenerationState";
import { buildWeddingArtifactExportManifest } from "@/lib/weddingExportState";
import {
  safeWeddingLabel,
  type WeddingPlanningMetadata,
} from "@/lib/weddingPlanningTemplateState";

export const WEDDING_ARTIFACT_AFP_PROJECTIONS_KEY = "omnyid.wedding-artifact-afp-projections";

function clean(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function uniqueStrings(values: readonly unknown[], limit = 48): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const item = clean(value);
    const key = item?.toLowerCase();
    if (!item || !key || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
    if (result.length >= limit) break;
  }
  return result;
}

function artifactMessageId(artifactId: string): string {
  return `afp-wedding-artifact:${safeWeddingLabel(artifactId)}`;
}

function isWeddingImportArtifact(artifact: WeddingGeneratedArtifact): boolean {
  const supertags = artifact.summary.metadata.supertags;
  return supertags.some((tag) => /^wedding_import(?:$|:)/i.test(tag))
    || artifact.summary.id.startsWith("wedding_import:")
    || uniqueStrings([
      ...artifact.summary.sourceLabels,
      ...(artifact.input.searchLabels ?? []),
    ]).some((label) => (
      /^wedding_import(?:$|:)/i.test(label)
      || /original upload/i.test(label)
      || /\b(?:csv|tsv|excel|xlsx?|ods) import:/i.test(label)
      || /\bsource:\s*[^,]+\.(?:csv|tsv|xlsx?|ods)\b/i.test(label)
    ));
}

function sourceLabelsForProjection(artifact: WeddingGeneratedArtifact): string[] {
  const sourceLabels = uniqueStrings(artifact.summary.sourceLabels);
  if (!isWeddingImportArtifact(artifact)) return sourceLabels;
  return sourceLabels.length > 0 ? ["Imported private planning file"] : [];
}

function sourceLinksForProjection(artifact: WeddingGeneratedArtifact) {
  return isWeddingImportArtifact(artifact) ? [] : artifact.summary.sourceLinks;
}

function titleForProjection(artifact: WeddingGeneratedArtifact): string {
  return isWeddingImportArtifact(artifact) ? "Imported private planning file" : artifact.summary.title;
}

function markdownForProjectionView(artifact: WeddingGeneratedArtifact): string {
  if (!isWeddingImportArtifact(artifact)) return artifact.markdown;
  return artifact.markdown
    .replace(/^# .+$/m, "# Imported private planning file")
    .replace(/^- File:\s*.+$/m, "- File: Imported private planning file")
    .replace(/\n## Original upload retention\n[\s\S]*?(?=\n## |\s*$)/i, "\n## Original upload retention\n- Original upload receipt retained privately.")
    .replace(/\n## Background synthesis instructions\n[\s\S]*?(?=\n## |\s*$)/i, "");
}

function projectionTags(artifact: WeddingGeneratedArtifact): string[] {
  const summary = artifact.summary;
  const sourceLabels = sourceLabelsForProjection(artifact);
  return uniqueStrings([
    ...summary.metadata.supertags,
    "wedding",
    "wedding_artifact",
    `wedding_artifact:${safeWeddingLabel(summary.kind)}`,
    `approval:${summary.approvalState}`,
    `privacy:${summary.metadata.privacyScope}`,
    ...summary.exportTargets.map((target) => `export:${safeWeddingLabel(target)}`),
    ...sourceLabels.map((source) => `source:${safeWeddingLabel(source)}`),
    ...summary.vendorLabels.map((vendor) => `vendor:${safeWeddingLabel(vendor)}`),
    ...summary.locationLabels.map((location) => `location:${safeWeddingLabel(location)}`),
  ]);
}

function referencesFor(artifact: WeddingGeneratedArtifact, metadata: WeddingPlanningMetadata) {
  return [
    metadata.sourceResponseId
      ? {
        type: "wedding_response",
        target: metadata.sourceResponseId,
        label: "Source response",
      }
      : null,
    ...artifact.summary.linkedTaskIds.map((taskId) => ({
      type: "wedding_task",
      target: taskId,
      label: "Linked planning task",
    })),
    ...artifact.summary.linkedCalendarEventIds.map((eventId) => ({
      type: "wedding_calendar_event",
      target: eventId,
      label: "Linked calendar event",
    })),
  ].filter((value): value is NonNullable<typeof value> => Boolean(value));
}

function inputMetadata(artifact: WeddingGeneratedArtifact): Record<string, unknown> {
  const value = artifact.input.metadata;
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function originalUploadProjectionFields(artifact: WeddingGeneratedArtifact): Record<string, unknown> {
  const metadata = inputMetadata(artifact);
  const status = clean(metadata.originalUploadStatus ?? metadata.original_upload_status);
  if (!status) return {};
  return {
    original_upload_status: status,
    original_upload_message_id: clean(metadata.originalUploadMessageId ?? metadata.original_upload_message_id),
    original_upload_attachment_id: clean(metadata.originalUploadAttachmentId ?? metadata.original_upload_attachment_id),
    original_upload_sha256: clean(metadata.originalUploadSha256 ?? metadata.original_upload_sha256),
    original_upload_file_name: clean(metadata.originalUploadFileName ?? metadata.original_upload_file_name),
    original_upload_mime_type: clean(metadata.originalUploadMimeType ?? metadata.original_upload_mime_type),
    original_upload_size_bytes: typeof metadata.originalUploadSizeBytes === "number"
      ? metadata.originalUploadSizeBytes
      : typeof metadata.original_upload_size_bytes === "number" ? metadata.original_upload_size_bytes : null,
    original_upload_storage: metadata.originalUploadStorage ?? metadata.original_upload_storage ?? null,
    original_upload_failure_label: clean(metadata.originalUploadFailureLabel ?? metadata.original_upload_failure_label),
  };
}

function originalUploadSearchTerms(originalUpload: Record<string, unknown>): string[] {
  if (Object.keys(originalUpload).length === 0) return [];
  return uniqueStrings([
    "original upload retained",
    "private import evidence",
    originalUpload.original_upload_status,
    originalUpload.original_upload_mime_type,
    originalUpload.original_upload_failure_label,
  ]);
}

function projectionMetadata(artifact: WeddingGeneratedArtifact, metadata: WeddingPlanningMetadata) {
  const summary = artifact.summary;
  const manifest = buildWeddingArtifactExportManifest(summary);
  const originalUpload = originalUploadProjectionFields(artifact);
  const importedPrivateEvidence = isWeddingImportArtifact(artifact);
  const projectionTitle = titleForProjection(artifact);
  const sourceLabels = sourceLabelsForProjection(artifact);
  const sourceLinks = sourceLinksForProjection(artifact);
  return {
    origin: "wedding_planning",
    projection: "wedding_generated_artifact_to_afp_file",
    wedding_plan_id: metadata.weddingPlanId,
    response_workspace_id: metadata.responseWorkspaceId,
    source_response_id: metadata.sourceResponseId,
    artifact_id: summary.id,
    artifact_kind: summary.kind,
    artifact_category: summary.category,
    privacy_scope: metadata.privacyScope,
    approval_state: summary.approvalState,
    ready_export_targets: manifest.readyEntries.map((entry) => entry.id),
    planned_export_targets: manifest.plannedEntries.map((entry) => entry.id),
    warning_labels: manifest.warningLabels,
    ...originalUpload,
    imported_private_evidence: importedPrivateEvidence,
    source_label_count: summary.sourceLabels.length,
    source_link_count: summary.sourceLinks.length,
    searchable_terms: uniqueStrings([
      summary.id,
      projectionTitle,
      summary.kind,
      summary.category,
      "wedding planning",
      "wedding artifact",
      metadata.weddingPlanId,
      metadata.responseWorkspaceId,
      metadata.sourceResponseId,
      metadata.privacyScope,
      summary.approvalState,
      ...summary.exportTargets,
      ...sourceLabels,
      ...sourceLinks.flatMap((source) => [source.label, source.url]),
      ...summary.locationLabels,
      ...summary.vendorLabels,
      ...summary.linkedTaskIds,
      ...summary.linkedCalendarEventIds,
      ...originalUploadSearchTerms(originalUpload),
    ], 80),
  };
}

export function weddingGeneratedArtifactToAfpMessage(
  artifact: WeddingGeneratedArtifact,
  nowIso = new Date().toISOString(),
): AfpMessage {
  const summary = artifact.summary;
  const metadata = summary.metadata;
  const manifest = buildWeddingArtifactExportManifest(summary);
  const messageId = artifactMessageId(summary.id);
  const csv = clean(artifact.csv);
  const originalUpload = originalUploadProjectionFields(artifact);
  const projectionTitle = titleForProjection(artifact);
  const projectionMarkdown = markdownForProjectionView(artifact);
  const sourceLabels = sourceLabelsForProjection(artifact);
  const sourceLinks = sourceLinksForProjection(artifact);
  const importedPrivateEvidence = isWeddingImportArtifact(artifact);

  return {
    id: messageId,
    thread_id: `wedding_artifact:${safeWeddingLabel(metadata.responseWorkspaceId)}`,
    from: "system://wedding-planning",
    to: ["agent://files", "agent://wedding-planning"],
    timestamp: nowIso,
    type: "artifact",
    kind: "file",
    subtype: "wedding_artifact",
    supertags: projectionTags(artifact),
    content: {
      kind: "wedding_artifact",
      artifact_id: summary.id,
      artifact_kind: summary.kind,
      title: projectionTitle,
      category: summary.category,
      markdown: artifact.markdown,
      csv,
      csv_ready: Boolean(csv),
      export_targets: manifest.entries.map((entry) => entry.id),
      ready_export_targets: manifest.readyEntries.map((entry) => entry.id),
      planned_export_targets: manifest.plannedEntries.map((entry) => entry.id),
      warning_labels: manifest.warningLabels,
      wedding_plan_id: metadata.weddingPlanId,
      response_workspace_id: metadata.responseWorkspaceId,
      source_response_id: metadata.sourceResponseId,
      privacy_scope: metadata.privacyScope,
      approval_state: summary.approvalState,
      source_labels: sourceLabels,
      source_label_count: summary.sourceLabels.length,
      source_link_count: summary.sourceLinks.length,
      imported_private_evidence: importedPrivateEvidence,
      source_links: sourceLinks,
      location_labels: summary.locationLabels,
      vendor_labels: summary.vendorLabels,
      linked_task_ids: summary.linkedTaskIds,
      linked_calendar_event_ids: summary.linkedCalendarEventIds,
      ...originalUpload,
      original_upload: Object.keys(originalUpload).length > 0 ? originalUpload : null,
    },
    metadata: projectionMetadata(artifact, metadata),
    views: [
      {
        format: "document",
        priority: 1,
        content: {
          artifact_id: summary.id,
          title: projectionTitle,
          artifact_kind: summary.kind,
          category: summary.category,
          markdown: projectionMarkdown,
        },
      },
      ...(csv
        ? [{
          format: "table",
          priority: 2,
          content: {
            artifact_id: summary.id,
            title: projectionTitle,
            artifact_kind: summary.kind,
            csv,
          },
        }]
        : []),
      {
        format: "attachments",
        priority: 3,
        content: {
          artifact_id: summary.id,
          ready_files: manifest.readyEntries.map((entry) => ({
            filename: entry.filename,
            target: entry.id,
            mime_type: entry.mimeType,
            action: entry.action,
          })),
          planned_files: manifest.plannedEntries.map((entry) => ({
            filename: entry.filename,
            target: entry.id,
            mime_type: entry.mimeType,
            action: entry.action,
            detail: entry.detail,
          })),
          warning_labels: manifest.warningLabels,
        },
      },
      ...(summary.approvalState === "pending_user_approval"
        ? [{
          format: "approvals",
          priority: 4,
          content: {
            artifact_id: summary.id,
            approval_state: summary.approvalState,
            title: projectionTitle,
            required_before: ["send_email", "share_artifact", "contact_vendor"],
          },
        }]
        : []),
    ],
    attachments: [],
    references: referencesFor(artifact, metadata),
  };
}

export function weddingGeneratedArtifactsToAfpMessages(
  artifacts: readonly WeddingGeneratedArtifact[],
  nowIso?: string,
): AfpMessage[] {
  return artifacts.map((artifact) => weddingGeneratedArtifactToAfpMessage(artifact, nowIso));
}

function messageToSendInput(message: AfpMessage): SendAfpMessageInput {
  return {
    thread_id: message.thread_id,
    from: message.from,
    to: message.to ?? [],
    timestamp: message.timestamp,
    type: message.type,
    kind: message.kind,
    subtype: message.subtype ?? undefined,
    content: message.content,
    views: message.views,
    attachments: message.attachments,
    references: message.references,
    supertags: message.supertags ?? [],
    metadata: message.metadata,
    store_in_relational: true,
  };
}

export function weddingGeneratedArtifactToAfpSendInput(
  artifact: WeddingGeneratedArtifact,
  nowIso = new Date().toISOString(),
): SendAfpMessageInput {
  return messageToSendInput(weddingGeneratedArtifactToAfpMessage(artifact, nowIso));
}

export function weddingGeneratedArtifactsToAfpSendInputs(
  artifacts: readonly WeddingGeneratedArtifact[],
  nowIso?: string,
): SendAfpMessageInput[] {
  return weddingGeneratedArtifactsToAfpMessages(artifacts, nowIso).map(messageToSendInput);
}

export function loadWeddingArtifactAfpProjectionIds(storage: Storage = localStorage): string[] {
  const raw = storage.getItem(WEDDING_ARTIFACT_AFP_PROJECTIONS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      : [];
  } catch {
    storage.removeItem(WEDDING_ARTIFACT_AFP_PROJECTIONS_KEY);
    return [];
  }
}

export function hasSentWeddingArtifactAfpProjection(id: string, storage: Storage = localStorage): boolean {
  const cleanId = clean(id);
  return cleanId ? loadWeddingArtifactAfpProjectionIds(storage).includes(cleanId) : false;
}

export function markWeddingArtifactAfpProjectionSent(id: string, storage: Storage = localStorage): void {
  const cleanId = clean(id);
  if (!cleanId) return;
  const next = [...new Set([cleanId, ...loadWeddingArtifactAfpProjectionIds(storage)])].slice(0, 300);
  storage.setItem(WEDDING_ARTIFACT_AFP_PROJECTIONS_KEY, JSON.stringify(next));
}

export function unmarkWeddingArtifactAfpProjectionSent(id: string, storage: Storage = localStorage): void {
  const cleanId = clean(id);
  if (!cleanId) return;
  const next = loadWeddingArtifactAfpProjectionIds(storage).filter((value) => value !== cleanId);
  if (next.length > 0) storage.setItem(WEDDING_ARTIFACT_AFP_PROJECTIONS_KEY, JSON.stringify(next));
  else storage.removeItem(WEDDING_ARTIFACT_AFP_PROJECTIONS_KEY);
}
