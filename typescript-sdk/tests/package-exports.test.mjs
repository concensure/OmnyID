import test from 'node:test';
import assert from 'node:assert/strict';

import * as rootSdk from 'afp-ts';
import * as continuitySdk from 'afp-ts/continuity';
import * as retrievalSdk from 'afp-ts/retrieval';
import * as workflowsSdk from 'afp-ts/workflows';
import * as semanticRouterSdk from 'afp-ts/semantic-router';
import * as workspaceAssistanceSdk from 'afp-ts/workspace-assistance';

test('root SDK re-exports continuity helpers', () => {
  assert.equal(typeof rootSdk.resolveContinuityTargetLabel, 'function');
  assert.equal(typeof rootSdk.contextPackObjectSearchTarget, 'function');
  assert.equal(typeof rootSdk.summarizeReferenceLabels, 'function');
  assert.equal(typeof rootSdk.artifactSummaryScopeCue, 'function');
  assert.equal(typeof rootSdk.responseItemPreparedDraftScopeCue, 'function');
  assert.equal(typeof rootSdk.approvalDraftPreviewLines, 'function');
  assert.equal(typeof rootSdk.approvalDraftPreviewSummary, 'function');
  assert.equal(typeof rootSdk.parseObjectMessagesResponse, 'function');
  assert.equal(typeof rootSdk.parseThreadSummariesResponse, 'function');
  assert.equal(typeof rootSdk.objectRetrievalStateSummary, 'function');
  assert.equal(typeof rootSdk.threadRetrievalStateSummary, 'function');
  assert.equal(typeof rootSdk.retrievalStateSummary, 'function');
  assert.equal(typeof rootSdk.detectWorkspaceAssistTopic, 'function');
  assert.equal(typeof rootSdk.selectWorkspaceAssistSuggestion, 'function');
});

test('workspace assistance subpath exposes topic detection and suggestion helpers', () => {
  const topic = workspaceAssistanceSdk.detectWorkspaceAssistTopic({
    app_label: 'Python runner editor',
    document_title: 'Aurora rollout helper',
    file_path: 'workspace/aurora_rollout.py',
    editor_text: '# Aurora rollout helper\nprint("hi")',
    recent_activity_titles: ['Aurora launch prep'],
  });
  assert.equal(topic?.label, 'Aurora rollout helper');

  const suggestion = workspaceAssistanceSdk.selectWorkspaceAssistSuggestion({
    topic,
    candidates: [
      {
        status: 'context_ready',
        title: 'Aurora topic pack',
        summary: 'Grouped continuity around Aurora rollout work.',
        detail_lines: ['Project Aurora is already active in continuity.'],
        labels: ['Project Aurora'],
        destination_view: 'home',
      },
    ],
  });

  assert.equal(suggestion?.status, 'context_ready');
  assert.equal(suggestion?.title, 'Aurora topic pack');
});

test('workspace assistance prefers fresher equally relevant response draft suggestions', () => {
  const topic = workspaceAssistanceSdk.detectWorkspaceAssistTopic({
    app_label: 'Thread reply composer',
    document_title: 'Aurora vendor reply',
    editor_text: 'Need to send the Aurora vendor response today.',
    recent_activity_titles: ['Aurora vendor thread'],
  });

  const suggestion = workspaceAssistanceSdk.selectWorkspaceAssistSuggestion({
    topic,
    candidates: [
      {
        status: 'draft_ready',
        artifact_kind: 'response_draft',
        title: 'Aurora vendor reply draft',
        summary: 'Prepared vendor response draft for Aurora follow-up.',
        detail_lines: ['Response draft is ready for review.'],
        labels: ['Aurora vendor'],
        destination_view: 'response_queue',
        freshness_score: 1.2,
      },
      {
        status: 'draft_ready',
        artifact_kind: 'response_draft',
        title: 'Aurora vendor reply draft (cached)',
        summary: 'Prepared vendor response draft for Aurora follow-up.',
        detail_lines: ['Cached response draft remains available.'],
        labels: ['Aurora vendor'],
        destination_view: 'response_queue',
        freshness_score: 0,
      },
    ],
  });

  assert.equal(suggestion?.title, 'Aurora vendor reply draft');
  assert.equal(suggestion?.artifact_kind, 'response_draft');
});

test('workspace assistance freshness bias does not outrank unrelated candidates', () => {
  const topic = workspaceAssistanceSdk.detectWorkspaceAssistTopic({
    app_label: 'Python runner editor',
    document_title: 'Aurora rollout helper',
    editor_text: 'Implement Aurora rollout retry guard.',
    recent_activity_titles: ['Aurora launch prep'],
  });

  const suggestion = workspaceAssistanceSdk.selectWorkspaceAssistSuggestion({
    topic,
    candidates: [
      {
        status: 'context_ready',
        artifact_kind: 'context_pack',
        title: 'Aurora rollout context pack',
        summary: 'Grouped continuity around Aurora rollout work.',
        detail_lines: ['Aurora launch prep is active.'],
        labels: ['Project Aurora'],
        destination_view: 'home',
        freshness_score: 0,
      },
      {
        status: 'draft_ready',
        artifact_kind: 'response_draft',
        title: 'Vendor reply draft',
        summary: 'Prepared response draft for unrelated vendor follow-up.',
        detail_lines: ['Response draft refreshed after draft shift.'],
        labels: ['Vendor reply'],
        destination_view: 'response_queue',
        freshness_score: 1.2,
      },
    ],
  });

  assert.equal(suggestion?.title, 'Aurora rollout context pack');
  assert.equal(suggestion?.artifact_kind, 'context_pack');
});

test('workspace assistance falls back to optional research when local context is weak for external current topics', () => {
  const topic = workspaceAssistanceSdk.detectWorkspaceAssistTopic({
    app_label: 'Email workspace',
    document_title: 'Latest Composio API pricing 2026',
    editor_text: 'Need current Composio API pricing and release notes for rollout planning.',
    recent_activity_titles: ['Connector rollout follow-up'],
  });

  const suggestion = workspaceAssistanceSdk.selectWorkspaceAssistSuggestion({
    topic,
    candidates: [
      {
        status: 'brief_ready',
        artifact_kind: 'continuity_brief',
        title: 'Connector continuity brief',
        summary: 'General rollout continuity remains active.',
        detail_lines: ['Review current continuity.'],
        destination_view: 'home',
        freshness_score: 0,
      },
    ],
  });

  assert.equal(suggestion?.artifact_kind, 'research_prompt');
  assert.equal(suggestion?.destination_view, 'search');
  assert.equal(suggestion?.research_query, 'Latest Composio API pricing 2026');
  assert.equal(suggestion?.title, 'Research current Latest Composio API pricing 2026');
});

test('workspace assistance keeps local prepared context first even for external current topics when the match is grounded', () => {
  const topic = workspaceAssistanceSdk.detectWorkspaceAssistTopic({
    app_label: 'Email workspace',
    document_title: 'Latest supplier pricing 2026',
    editor_text: 'Need the latest supplier pricing and current contract deltas.',
    recent_activity_titles: ['Supplier pricing review'],
  });

  const suggestion = workspaceAssistanceSdk.selectWorkspaceAssistSuggestion({
    topic,
    candidates: [
      {
        status: 'context_ready',
        artifact_kind: 'context_pack',
        title: 'Supplier pricing context pack',
        summary: 'Prepared context with current supplier comparison notes and contract anchors.',
        detail_lines: ['Meeting tomorrow.', 'Linked: Supplier contract'],
        labels: ['Supplier contract'],
        destination_view: 'home',
        freshness_score: 0.35,
      },
    ],
  });

  assert.equal(suggestion?.artifact_kind, 'context_pack');
  assert.equal(suggestion?.destination_view, 'home');
});

test('workspace assistance exposes artifact-aware refresh provenance wording', () => {
  assert.equal(
    workspaceAssistanceSdk.workspaceAssistRefreshOriginLabel('draft_change', 'response_draft'),
    'Refreshed response draft after draft shift',
  );
  assert.equal(
    workspaceAssistanceSdk.workspaceAssistRefreshOriginLabel('surface_entry', 'continuity_brief'),
    'Refreshed continuity brief on surface entry',
  );
  assert.equal(
    workspaceAssistanceSdk.workspaceAssistRefreshOriginLabel('cached', 'context_pack'),
    'Using current context pack',
  );
});

test('dashboard proactive suggestion schema preserves simulator preview boundary fields', () => {
  const approvalSuggestion = rootSdk.ProactiveSuggestionSchema.parse({
    id: 'simulator:approval_preview',
    kind: 'simulator_approval_preview',
    title: 'Review simulator approval preview',
    description: 'Bounded simulator projection found an approval-gated path.',
    requires_approval: true,
    preview_only: true,
    preview_boundary_summary:
      'Bounded simulator preview only. This remains approval-gated and does not execute external work.',
    approval_kind: 'send',
    draft_preview: {
      label: 'Email: Aurora summary',
      content: 'Draft summary body',
      content_type: 'text',
    },
  });

  const reversibleSuggestion = rootSdk.ProactiveSuggestionSchema.parse({
    id: 'simulator:reversible_preview',
    kind: 'simulator_reversible_preview',
    title: 'Review reversible simulator preview',
    description: 'Bounded simulator projection prepared a reversible internal preview.',
    requires_approval: false,
    preview_only: true,
    preview_boundary_summary:
      'Bounded simulator preview only. This stays inside reversible execution pathways and does not execute external work.',
  });

  const fusionSuggestion = rootSdk.ProactiveSuggestionSchema.parse({
    id: 'simulator:fusion_preview',
    kind: 'simulator_conflict_fusion',
    title: 'Review simulator fusion preview',
    description:
      'Bounded simulator projection prepared one comparison that keeps approval and reversible paths together.',
    requires_approval: false,
    preview_only: true,
    preview_boundary_summary:
      'Bounded simulator preview only. This keeps approval and reversible options together for review and does not execute external work.',
  });

  assert.equal(approvalSuggestion.preview_only, true);
  assert.equal(
    approvalSuggestion.preview_boundary_summary,
    'Bounded simulator preview only. This remains approval-gated and does not execute external work.',
  );
  assert.equal(approvalSuggestion.approval_kind, 'send');
  assert.equal(approvalSuggestion.draft_preview?.label, 'Email: Aurora summary');
  assert.equal(reversibleSuggestion.preview_only, true);
  assert.equal(
    reversibleSuggestion.preview_boundary_summary,
    'Bounded simulator preview only. This stays inside reversible execution pathways and does not execute external work.',
  );
  assert.equal(fusionSuggestion.preview_only, true);
  assert.equal(
    fusionSuggestion.preview_boundary_summary,
    'Bounded simulator preview only. This keeps approval and reversible options together for review and does not execute external work.',
  );
});

test('workspace assistance builds stable shared surface keys', () => {
  assert.equal(
    workspaceAssistanceSdk.buildWorkspaceAssistSurfaceKey({ surface: 'runner' }),
    'runner',
  );
  assert.equal(
    workspaceAssistanceSdk.buildWorkspaceAssistSurfaceKey({ surface: 'email' }),
    'email',
  );
  assert.equal(
    workspaceAssistanceSdk.buildWorkspaceAssistSurfaceKey({ surface: 'thread', threadId: 'aurora' }),
    'thread:aurora',
  );
  assert.equal(
    workspaceAssistanceSdk.buildWorkspaceAssistSurfaceKey({ surface: 'thread' }),
    null,
  );
});

test('continuity exposes bounded reason summaries for due and reactivated work', () => {
  assert.equal(
    continuitySdk.boundedReasonSummary({
      draft_class: 'meeting_brief',
      response_due_hint: 'Tomorrow at 9am',
    }),
    'Meeting tomorrow.',
  );
  assert.equal(
    continuitySdk.boundedReasonSummary({
      draft_class: 'follow_up_draft',
      selection_reason: 'Continuity reactivated an existing follow-up thread.',
    }),
    'Follow-up chain reactivated.',
  );
  assert.equal(
    continuitySdk.boundedReasonSummary({
      pack_kind: 'obligation_pack',
      kind: 'context_pack',
    }),
    'High queue pressure.',
  );
});

test('continuity distinguishes duplicate raw reason text from bounded reason summaries', () => {
  assert.equal(
    continuitySdk.hasDistinctReasonSummary('Due today.', 'Due today.'),
    false,
  );
  assert.equal(
    continuitySdk.hasDistinctReasonSummary(
      'Prepared because the follow-up chain reactivated.',
      'Follow-up chain reactivated.',
    ),
    true,
  );
  assert.equal(
    continuitySdk.hasDistinctReasonSummary('Review the contract reply.', null),
    true,
  );
});

test('workspace assistance coordinator throttles repeated surface-entry refreshes', () => {
  const coordinator = workspaceAssistanceSdk.createWorkspaceAssistRefreshCoordinator();

  assert.equal(
    coordinator.requestSurfaceKeyEntry({ surfaceKey: 'runner', now: 1_000 }),
    true,
  );
  assert.equal(
    coordinator.requestSurfaceKeyEntry({ surfaceKey: 'runner', now: 10_000 }),
    false,
  );
  assert.equal(
    coordinator.requestSurfaceKeyEntry({ surfaceKey: 'runner', now: 16_100 }),
    true,
  );
});

test('workspace assistance coordinator throttles unchanged draft signatures and resets by channel', () => {
  const coordinator = workspaceAssistanceSdk.createWorkspaceAssistRefreshCoordinator();
  const draftInput = {
    channelId: 'thread:aurora',
    surfaceKey: 'thread:aurora',
    documentTitle: 'Aurora vendor reply',
    text: 'Need to send the Aurora vendor response with updated contract terms today.',
  };

  assert.equal(
    coordinator.requestDraftChange({ ...draftInput, now: 2_000 }),
    true,
  );
  assert.equal(
    coordinator.requestDraftChange({ ...draftInput, now: 12_000 }),
    false,
  );
  coordinator.resetDraftChannel('thread:aurora');
  assert.equal(
    coordinator.requestDraftChange({ ...draftInput, now: 13_000 }),
    false,
  );
  assert.equal(
    coordinator.requestDraftChange({
      ...draftInput,
      text: `${draftInput.text} Also confirm the revised launch dependency timeline.`,
      now: 14_000,
    }),
    true,
  );
});

test('workspace assistance draft signatures stay bounded and ignore short drafts', () => {
  assert.equal(
    workspaceAssistanceSdk.workspaceAssistDraftRefreshSignature({
      surfaceKey: 'note',
      documentTitle: 'Aurora',
      text: 'Short draft',
    }),
    null,
  );

  const signature = workspaceAssistanceSdk.workspaceAssistDraftRefreshSignature({
    surfaceKey: 'runner',
    documentTitle: 'Aurora rollout helper',
    filePath: 'workspace/aurora_rollout.py',
    text: 'Implement Aurora retry guard and release readiness checks for the runner workspace.',
  });

  assert.equal(signature?.startsWith('runner::Aurora rollout helper::workspace/aurora_rollout.py::'), true);
});

test('workspace assistance builds dashboard candidates with artifact-aware mapping and freshness', () => {
  const candidates = workspaceAssistanceSdk.buildWorkspaceAssistCandidatesFromDashboard(
    {
      continuity_context_pack_items: [
        {
          title: 'Aurora context pack',
          summary: 'Grouped continuity around Aurora rollout work.',
          confidence: 'high',
          why_surfaced: 'Aurora surfaced across active thread neighborhoods.',
          reference_labels: ['Project Aurora'],
          object_labels: ['Launch checklist'],
          file_labels: ['launch-brief.md'],
          evidence_kinds: ['same_file_path'],
        },
      ],
      continuity_prepared_draft_items: [
        {
          draft_class: 'communication_reply',
          title: 'Aurora vendor reply',
          summary: 'Prepared reply draft for the Aurora vendor thread.',
          confidence: 'high',
          suggested_action: 'Review and send the prepared reply.',
          response_due_hint: 'Due today',
          selection_reason: 'Recent vendor follow-up',
          object_labels: ['Vendor contract'],
        },
      ],
      continuity_response_items: [
        {
          title: 'Aurora response queue item',
          prepared_draft_available: true,
          prepared_draft_lead_summary: 'Prepared response draft is ready for Aurora vendor follow-up.',
          prepared_draft_summary_lines: [
            'Draft uses the latest contract deltas.',
            'File anchors: launch-brief.md.',
          ],
          prepared_draft_selection_reason: 'Reply pressure is elevated',
          prepared_draft_object_labels: ['Vendor contract'],
          response_due_hint: 'Due this afternoon',
        },
      ],
      continuity_brief: {
        title: 'Aurora continuity brief',
        suggested_actions: ['Re-open the Aurora decision queue.'],
      },
      continuity_priority_card: {
        description: 'Aurora remains the most active continuity focus.',
        object_labels: ['Launch checklist'],
      },
      continuity_primary_mode: 'priority_card',
    },
    { refreshOrigin: 'draft_change' },
  );

  assert.equal(candidates.length, 4);
  assert.deepEqual(
    candidates.map((candidate) => ({
      title: candidate.title,
      artifact_kind: candidate.artifact_kind,
      destination_view: candidate.destination_view,
      freshness_score: candidate.freshness_score,
    })),
    [
      {
        title: 'Aurora context pack',
        artifact_kind: 'context_pack',
        destination_view: 'home',
        freshness_score: 0.35,
      },
      {
        title: 'Aurora vendor reply',
        artifact_kind: 'prepared_draft',
        destination_view: 'response_queue',
        freshness_score: 0.9,
      },
      {
        title: 'Aurora response queue item',
        artifact_kind: 'response_draft',
        destination_view: 'response_queue',
        freshness_score: 1.2,
      },
      {
        title: 'Aurora continuity brief',
        artifact_kind: 'continuity_brief',
        destination_view: 'home',
        freshness_score: 0.15,
      },
    ],
  );
  assert.deepEqual(candidates[0].labels, ['Project Aurora', 'Launch checklist', 'launch-brief.md']);
  assert.deepEqual(candidates[0].hints, ['Evidence: same_file_path']);
  assert.deepEqual(candidates[1].labels, ['Vendor contract']);
  assert.deepEqual(candidates[2].labels, ['Vendor contract', 'launch-brief.md']);
  assert.equal(candidates[2].summary, 'Prepared response draft is ready for Aurora vendor follow-up.');
});

test('workspace assistance dashboard candidate builder omits unavailable response drafts', () => {
  const candidates = workspaceAssistanceSdk.buildWorkspaceAssistCandidatesFromDashboard(
    {
      continuity_response_items: [
        {
          title: 'Unavailable response item',
          prepared_draft_available: false,
          prepared_draft_summary: 'Should not surface.',
        },
      ],
    },
    { refreshOrigin: 'cached' },
  );

  assert.deepEqual(candidates, []);
});

test('workspace assistance builds recent titles from dashboard payload in stable order', () => {
  const titles = workspaceAssistanceSdk.buildWorkspaceAssistRecentTitlesFromDashboard({
    continuity_priority_card: {
      title: 'Aurora priority card',
      description: 'Aurora remains active.',
    },
    continuity_brief: {
      title: 'Aurora continuity brief',
      suggested_actions: ['Review Aurora queue'],
    },
    continuity_context_pack_items: [
      { title: 'Aurora context pack', summary: 'Grouped context.', why_surfaced: 'Active' },
      { title: 'Aurora context pack', summary: 'Duplicate title.', why_surfaced: 'Duplicate' },
      { title: 'Vendor contract pack', summary: 'Contract context.', why_surfaced: 'Linked' },
    ],
    thread_summaries: [
      { title: 'Aurora vendor thread' },
      { title: 'Launch checklist thread' },
      { title: 'Board prep thread' },
      { title: 'Ignored fourth thread' },
    ],
  });

  assert.deepEqual(titles, [
    'Aurora priority card',
    'Aurora continuity brief',
    'Aurora context pack',
    'Vendor contract pack',
    'Aurora vendor thread',
    'Launch checklist thread',
    'Board prep thread',
  ]);
});

test('continuity subpath exposes the same helper behavior as the root export', () => {
  const input = {
    reference_refs: ['thread:project_aurora'],
    thread_summaries: [{ thread_id: 'project_aurora', title: 'Project Aurora' }],
  };

  assert.equal(
    rootSdk.resolveContinuityTargetLabel(input),
    continuitySdk.resolveContinuityTargetLabel(input),
  );

  assert.equal(
    rootSdk.summarizeReferenceLabels({
      reference_labels: ['Project Aurora', 'Vendor renewal'],
      limit: 1,
    }),
    continuitySdk.summarizeReferenceLabels({
      reference_labels: ['Project Aurora', 'Vendor renewal'],
      limit: 1,
    }),
  );
  assert.equal(
    continuitySdk.artifactSummaryScopeCue({
      artifact_summary_lines: [
        'Draft: Reply draft for Parent teacher follow-up',
        'Scope: Family coordination',
      ],
    }),
    'Family coordination',
  );
  assert.equal(
    continuitySdk.responseItemPreparedDraftScopeCue({
      prepared_draft_summary_lines: [
        'Draft: Reply draft for Parent teacher follow-up',
        'Scope: Family coordination',
      ],
    }),
    'Family coordination',
  );
  assert.deepEqual(
    continuitySdk.approvalDraftPreviewLines({
      label: 'Receipt review',
      content:
        'Merchant: Luna Cafe | Amount: $12.40 | Artifact path: receipts/2026-07-29-luna-cafe.json',
      content_type: 'text',
    }),
    [
      'Merchant: Luna Cafe',
      'Amount: $12.40',
      'Artifact path: receipts/2026-07-29-luna-cafe.json',
    ],
  );
  assert.equal(
    continuitySdk.approvalDraftPreviewSummary({
      draft_preview: {
        label: 'Receipt review',
        content:
          'Merchant: Luna Cafe | Amount: $12.40 | Artifact path: receipts/2026-07-29-luna-cafe.json',
        content_type: 'text',
      },
      maxLength: 80,
    }),
    'Merchant: Luna Cafe Amount: $12.40 Artifact path: receipts/2026-07-29-luna-ca...',
  );
  assert.deepEqual(
    rootSdk.approvalDraftPreviewLines({
      label: 'Receipt review',
      content:
        'Merchant: Luna Cafe | Amount: $12.40 | Artifact path: receipts/2026-07-29-luna-cafe.json',
      content_type: 'text',
    }),
    continuitySdk.approvalDraftPreviewLines({
      label: 'Receipt review',
      content:
        'Merchant: Luna Cafe | Amount: $12.40 | Artifact path: receipts/2026-07-29-luna-cafe.json',
      content_type: 'text',
    }),
  );
  assert.equal(
    rootSdk.approvalDraftPreviewSummary({
      draft_preview: {
        label: 'Receipt review',
        content:
          'Merchant: Luna Cafe | Amount: $12.40 | Artifact path: receipts/2026-07-29-luna-cafe.json',
        content_type: 'text',
      },
      maxLength: 80,
    }),
    continuitySdk.approvalDraftPreviewSummary({
      draft_preview: {
        label: 'Receipt review',
        content:
          'Merchant: Luna Cafe | Amount: $12.40 | Artifact path: receipts/2026-07-29-luna-cafe.json',
        content_type: 'text',
      },
      maxLength: 80,
    }),
  );
});

test('continuity helpers humanize file refs consistently', () => {
  const input = {
    source_refs: ['file:docs/launch-brief.md'],
  };

  assert.equal(
    rootSdk.resolveContinuityTargetLabel(input),
    'launch-brief.md',
  );
  assert.equal(
    continuitySdk.resolveContinuityTargetLabel(input),
    'launch-brief.md',
  );
  assert.deepEqual(
    continuitySdk.contextPackObjectSearchTarget({
      file_refs: ['file:docs/launch-brief.md'],
    }),
    {
      query: 'target:file:docs/launch-brief.md',
      focusObjectId: 'file:docs/launch-brief.md',
    },
  );
});

test('retrieval subpath exposes the same helper behavior as the root export', () => {
  const objectPayload = {
    retrieval_state: {
      summary: 'Current ranking is narrowing-first.',
      badges: ['narrowing-first'],
    },
    facet_next_moves: {
      kinds: [{ rationale: 'strong narrowing power' }],
    },
  };

  assert.equal(
    rootSdk.objectRetrievalStateSummary({ result: objectPayload }),
    retrievalSdk.objectRetrievalStateSummary({ result: objectPayload }),
  );
  assert.deepEqual(
    rootSdk.objectRetrievalStateBadges({ result: objectPayload }),
    retrievalSdk.objectRetrievalStateBadges({ result: objectPayload }),
  );
  assert.equal(retrievalSdk.humanizeRetrievalBadge('fresh-object supported'), 'fresh object support');
  assert.equal(retrievalSdk.humanizeRetrievalBadge('older-object supported'), 'older object support');
  assert.equal(retrievalSdk.humanizeRetrievalBadge('fresh-thread supported'), 'fresh thread support');
  assert.equal(retrievalSdk.humanizeRetrievalBadge('older-thread supported'), 'older thread support');
  assert.equal(retrievalSdk.retrievalBadgeTone('fresh object support'), 'info');
  assert.equal(retrievalSdk.retrievalBadgeTone('older object support'), 'warning');
  assert.equal(retrievalSdk.retrievalBadgeTone('fresh thread support'), 'info');
  assert.equal(retrievalSdk.retrievalBadgeTone('older thread support'), 'warning');
  assert.equal(
    rootSdk.retrievalStateSummary({ summary: 'Thread discovery is kind-focused.' }),
    retrievalSdk.retrievalStateSummary({ summary: 'Thread discovery is kind-focused.' }),
  );
  assert.equal(
    rootSdk.objectFacetCountLabel('reference_target', 'msg_1', 3),
    'target:msg_1 · 3',
  );
  assert.deepEqual(
    retrievalSdk.flattenObjectFacetNextMoves({
      kinds: [{ value: 'task', count: 3, score: 0.9, rationale: 'strong narrowing power' }],
      tags: [{ value: 'aurora', count: 2, score: 0.8, rationale: 'local continuity' }],
      metadata_terms: [{ value: 'memory_space:work', count: 2, score: 0.7, rationale: 'active-state pressure' }],
    }),
    [
      {
        family: 'kind',
        value: 'task',
        count: 3,
        score: 0.9,
        rationale: 'strong narrowing power',
        label: 'kind:task',
      },
      {
        family: 'tag',
        value: 'aurora',
        count: 2,
        score: 0.8,
        rationale: 'local continuity',
        label: '#aurora',
      },
      {
        family: 'metadata_term',
        value: 'memory_space:work',
        count: 2,
        score: 0.7,
        rationale: 'active-state pressure',
        label: 'work context',
      },
    ],
  );
  assert.equal(
    retrievalSdk.objectFacetCountLabel('metadata_term', 'memory_space:work', 2),
    'work context · 2',
  );
  assert.equal(
    retrievalSdk.threadSummaryPrimaryText({
      thread_id: 'aurora',
      title: 'Project Aurora',
      preview: 'Launch prep',
    }),
    'Project Aurora',
  );
  assert.equal(
    retrievalSdk.threadSummaryMetaLine({
      thread_id: 'aurora',
      dominant_kind: 'project',
      activity_freshness: 'fresh',
      message_count: 4,
      supertags: ['aurora'],
    }),
    'project · fresh · 4 msgs · #aurora',
  );
  assert.equal(
    retrievalSdk.threadRetrievalStateSummary({
      state: { summary: 'Thread discovery is kind-focused.', badges: ['kind-focused'] },
      launchContext: {
        sourceLabel: 'Dashboard feed',
        reason: 'Refine the currently surfaced thread neighborhood',
      },
    }),
    'Launched from dashboard feed. Refine the currently surfaced thread neighborhood Thread discovery is kind-focused.',
  );
  assert.deepEqual(
    retrievalSdk.threadRetrievalStateBadges({
      state: { summary: 'Thread discovery is kind-focused.', badges: ['kind-focused'] },
      launchContext: { sourceLabel: 'Dashboard feed' },
    }),
    ['from Dashboard feed', 'kind-focused'],
  );
  assert.equal(
    rootSdk.threadRetrievalStateSummary({
      state: { summary: 'Thread discovery is kind-focused.', badges: ['kind-focused'] },
      launchContext: {
        sourceLabel: 'Dashboard feed',
        reason: 'Refine the currently surfaced thread neighborhood',
      },
    }),
    retrievalSdk.threadRetrievalStateSummary({
      state: { summary: 'Thread discovery is kind-focused.', badges: ['kind-focused'] },
      launchContext: {
        sourceLabel: 'Dashboard feed',
        reason: 'Refine the currently surfaced thread neighborhood',
      },
    }),
  );
  assert.equal(
    retrievalSdk.continuityThreadSearchQuery({
      title: 'Vendor follow up',
      linked_target_label: 'Thread: project_aurora',
      panel_kind: 'response_queue',
    }),
    'project aurora kind:communication',
  );
  assert.equal(
    retrievalSdk.continuityThreadSearchQuery({
      title: 'Context pack',
      file_labels: ['launch-brief.md'],
      file_refs: ['file:docs/launch-brief.md'],
    }),
    'launch brief.md',
  );
  assert.equal(
    rootSdk.continuityThreadSearchQuery({
      title: 'Decision memo',
      draft_class: 'decision_memo',
      reference_labels: ['Object: roadmap_review'],
    }),
    'roadmap review kind:decision',
  );
  assert.equal(
    retrievalSdk.threadSummaryRefineQuery({
      thread_id: 'aurora',
      dominant_kind: 'project',
      supertags: ['aurora', 'project:aurora'],
      metadata_terms: ['memory_space:work', 'author_type:human', 'owner:ozan'],
    }),
    'kind:project #aurora memory_space:work author_type:human',
  );
  assert.equal(
    rootSdk.threadSummaryRefineQuery({
      thread_id: 'support',
      dominant_kind: null,
      supertags: ['followup'],
    }),
    '#followup',
  );
  assert.equal(
    retrievalSdk.objectFacetMoveDisplayLabel({
      family: 'reference_target',
      value: 'msg_1',
      count: 3,
      label: 'target:msg_1',
    }),
    'target:msg_1 · 3',
  );
  assert.equal(
    retrievalSdk.threadFacetCountLabel('tag', 'aurora', 3),
    '#aurora · 3',
  );
  assert.deepEqual(
    retrievalSdk.flattenThreadFacetNextMoves({
      kinds: [{ value: 'project', count: 2, score: 0.91, rationale: 'active-state pressure + local continuity + strong narrowing power' }],
      tags: [{ value: 'aurora', count: 2, score: 0.84, rationale: 'local continuity + strong narrowing power' }],
      metadata_terms: [{ value: 'memory_space:work', count: 2, score: 0.8, rationale: 'local continuity + strong narrowing power' }],
    }),
    [
      {
        family: 'kind',
        value: 'project',
        count: 2,
        score: 0.91,
        rationale: 'active-state pressure + local continuity + strong narrowing power',
        label: 'kind:project',
      },
      {
        family: 'tag',
        value: 'aurora',
        count: 2,
        score: 0.84,
        rationale: 'local continuity + strong narrowing power',
        label: '#aurora',
      },
      {
        family: 'metadata_term',
        value: 'memory_space:work',
        count: 2,
        score: 0.8,
        rationale: 'local continuity + strong narrowing power',
        label: 'work context',
      },
    ],
  );
  assert.equal(
    retrievalSdk.threadFacetCountLabel('metadata_term', 'memory_space:work', 2),
    'work context · 2',
  );
});

test('workflows subpath exposes expected schemas and helpers', () => {
  assert.equal(workflowsSdk.WorkflowSchemaVersionSchema.parse('omnyid-workflow.v1'), 'omnyid-workflow.v1');
  assert.equal(typeof workflowsSdk.expandWorkflowIntent, 'function');

  const expansion = workflowsSdk.expandWorkflowIntent('research competitor pricing and summarize findings');
  assert.equal(expansion.preset_kind, 'research_assistant');
  assert.equal(typeof expansion.optimization_mode, 'string');
});

test('semantic-router subpath exposes expected router utilities', () => {
  assert.equal(typeof semanticRouterSdk.parseQuery, 'function');
  assert.equal(typeof semanticRouterSdk.createRouter, 'function');
  assert.equal(typeof semanticRouterSdk.SemanticRouter, 'function');

  const parsed = semanticRouterSdk.parseQuery('#aurora kind:project vendor renewal');
  assert.ok(Array.isArray(parsed.supertags));
  assert.ok(parsed.supertags.includes('aurora'));
  assert.ok(parsed.kinds.includes('project'));
});

test('semantic-router parseQuery preserves explicit structured filters without leaking them into free text', () => {
  const parsed = semanticRouterSdk.parseQuery(
    'kind:project thread:aurora-rollout from:background_watcher after:2026-06-01 before:2026-06-15 vendor renewal',
  );

  assert.ok(parsed.kinds.includes('project'));
  assert.deepEqual(parsed.threadIds, ['aurora-rollout']);
  assert.deepEqual(parsed.fromAgents, ['background_watcher']);
  assert.equal(parsed.timeRange?.from?.startsWith('2026-06-01T00:00:00.000Z'), true);
  assert.equal(parsed.timeRange?.to?.startsWith('2026-06-15T23:59:59.999Z'), true);
  assert.equal(parsed.freeText, 'vendor renewal');
  assert.equal(parsed.metadataKeys.includes('kind'), false);
  assert.equal(parsed.metadataKeys.includes('thread'), false);
  assert.equal(parsed.metadataKeys.includes('from'), false);
});

test('semantic-router parseQuery maps action aliases onto suggested action metadata facets', () => {
  const parsed = semanticRouterSdk.parseQuery(
    'action:reply next:review suggested_action:approve suggested_actions:send vendor renewal',
  );

  assert.equal(
    parsed.metadataKeys.includes('metadata.searchable_metadata.suggested_actions'),
    true,
  );
  assert.equal(parsed.metadataValues.includes('reply'), true);
  assert.equal(parsed.metadataValues.includes('review'), true);
  assert.equal(parsed.metadataValues.includes('approve'), true);
  assert.equal(parsed.metadataValues.includes('send'), true);
  assert.deepEqual(
    parsed.metadataTerms.slice().sort(),
    [
      'suggested_actions:approve',
      'suggested_actions:reply',
      'suggested_actions:review',
      'suggested_actions:send',
    ],
  );
  assert.equal(parsed.freeText, 'vendor renewal');
});

test('semantic-router parseQuery maps memory and authorship aliases onto searchable metadata facets', () => {
  const parsed = semanticRouterSdk.parseQuery(
    'memory:work space:personal author:human author_type:agent author_id:user_01 mask:private author_mask:public vendor renewal',
  );

  assert.equal(
    parsed.metadataKeys.includes('metadata.searchable_metadata.memory_space'),
    true,
  );
  assert.equal(
    parsed.metadataKeys.includes('metadata.searchable_metadata.author_type'),
    true,
  );
  assert.equal(
    parsed.metadataKeys.includes('metadata.searchable_metadata.author_id'),
    true,
  );
  assert.equal(
    parsed.metadataKeys.includes('metadata.searchable_metadata.author_mask'),
    true,
  );
  assert.deepEqual(
    parsed.metadataValues.slice().sort(),
    ['agent', 'human', 'personal', 'private', 'public', 'user_01', 'work'],
  );
  assert.deepEqual(
    parsed.metadataTerms.slice().sort(),
    [
      'author_id:user_01',
      'author_mask:private',
      'author_mask:public',
      'author_type:agent',
      'author_type:human',
      'memory_space:personal',
      'memory_space:work',
    ],
  );
  assert.equal(parsed.freeText, 'vendor renewal');
});

test('semantic-router parseQuery maps standardized metadata aliases onto searchable metadata facets', () => {
  const parsed = semanticRouterSdk.parseQuery(
    'status:active priority:high domain:work followup:today follow_up:tomorrow follow_up_at:friday vendor renewal',
  );

  assert.equal(
    parsed.metadataKeys.includes('metadata.searchable_metadata.status'),
    true,
  );
  assert.equal(
    parsed.metadataKeys.includes('metadata.searchable_metadata.priority'),
    true,
  );
  assert.equal(
    parsed.metadataKeys.includes('metadata.searchable_metadata.domain'),
    true,
  );
  assert.equal(
    parsed.metadataKeys.includes('metadata.searchable_metadata.follow_up_at'),
    true,
  );
  assert.deepEqual(
    parsed.metadataTerms.slice().sort(),
    [
      'domain:work',
      'follow_up_at:friday',
      'follow_up_at:today',
      'follow_up_at:tomorrow',
      'priority:high',
      'status:active',
    ],
  );
  assert.equal(parsed.freeText, 'vendor renewal');
});

test('semantic-router layerMetadata gives a bounded lift to candidates whose suggested actions match the query intent', async () => {
  const parsed = semanticRouterSdk.parseQuery('action:reply vendor renewal');
  const candidates = await semanticRouterSdk.layerMetadata(
    {
      queryMetadata: async () => [
        {
          message_id: 'msg_no_action_match',
          thread_id: 'thread_1',
          from_agent: 'watcher',
          timestamp: '2026-06-20T10:00:00Z',
          type: 'note',
          kind: 'note',
          supertags: ['aurora'],
          referenceTargets: [],
          referenceTypes: [],
          linkTypes: [],
          entities: [],
          searchable_summary: 'General vendor renewal note',
          searchable_metadata: { suggested_actions: ['Review prepared context'] },
          salience: 0.7,
          body_available: true,
        },
        {
          message_id: 'msg_action_match',
          thread_id: 'thread_2',
          from_agent: 'watcher',
          timestamp: '2026-06-20T10:00:00Z',
          type: 'note',
          kind: 'note',
          supertags: ['aurora'],
          referenceTargets: [],
          referenceTypes: [],
          linkTypes: [],
          entities: [],
          searchable_summary: 'Vendor renewal reply draft',
          searchable_metadata: { suggested_actions: ['Reply in thread'] },
          salience: 0.7,
          body_available: true,
        },
      ],
      fullTextSearch: async () => [],
      vectorSearch: async () => [],
      neighbors: async () => [],
      decryptBodies: async () => new Map(),
      embed: async () => [],
    },
    parsed,
    10,
  );

  const noMatch = candidates.find(candidate => candidate.message.message_id === 'msg_no_action_match');
  const match = candidates.find(candidate => candidate.message.message_id === 'msg_action_match');

  assert.ok((match?.scores.metadata ?? 0) > (noMatch?.scores.metadata ?? 0));
  assert.ok(match?.provenance[0]?.includes('suggested action match'));
});

test('semantic-router layerMetadata gives a bounded lift to candidates whose memory and authorship facets match the query intent', async () => {
  const parsed = semanticRouterSdk.parseQuery('memory:work author:human author_id:user_01 mask:private vendor renewal');
  const candidates = await semanticRouterSdk.layerMetadata(
    {
      queryMetadata: async () => [
        {
          message_id: 'msg_no_facet_match',
          thread_id: 'thread_1',
          from_agent: 'watcher',
          timestamp: '2026-06-20T10:00:00Z',
          type: 'note',
          kind: 'note',
          supertags: ['aurora'],
          referenceTargets: [],
          referenceTypes: [],
          linkTypes: [],
          entities: [],
          searchable_summary: 'General vendor renewal note',
          searchable_metadata: {
            memory_space: 'personal',
            author_type: 'agent',
            author_id: 'agent_01',
            author_mask: 'public',
          },
          salience: 0.7,
          body_available: true,
        },
        {
          message_id: 'msg_facet_match',
          thread_id: 'thread_2',
          from_agent: 'watcher',
          timestamp: '2026-06-20T10:00:00Z',
          type: 'note',
          kind: 'note',
          supertags: ['aurora'],
          referenceTargets: [],
          referenceTypes: [],
          linkTypes: [],
          entities: [],
          searchable_summary: 'Work memory from the user',
          searchable_metadata: {
            memory_space: 'work',
            author_type: 'human',
            author_id: 'user_01',
            author_mask: 'private',
          },
          salience: 0.7,
          body_available: true,
        },
      ],
      fullTextSearch: async () => [],
      vectorSearch: async () => [],
      neighbors: async () => [],
      decryptBodies: async () => new Map(),
      embed: async () => [],
    },
    parsed,
    10,
  );

  const noMatch = candidates.find(candidate => candidate.message.message_id === 'msg_no_facet_match');
  const match = candidates.find(candidate => candidate.message.message_id === 'msg_facet_match');

  assert.ok((match?.scores.metadata ?? 0) > (noMatch?.scores.metadata ?? 0));
  assert.ok(match?.provenance[0]?.includes('memory space match'));
  assert.ok(match?.provenance[0]?.includes('authorship match'));
});

test('semantic-router shouldRun skips deep when shallow shortlist is already decisive', () => {
  const parsed = semanticRouterSdk.parseQuery('vendor renewal timeline');
  const soFar = [
    {
      message: {
        message_id: 'msg_1',
        thread_id: 'thread_1',
        from_agent: 'watcher',
        timestamp: '2026-06-20T10:00:00Z',
        type: 'note',
        kind: 'note',
        supertags: ['aurora'],
        referenceTargets: [],
        referenceTypes: [],
        linkTypes: [],
        entities: [],
        searchable_summary: 'Decisive shallow hit',
        salience: 0.9,
        body_available: true,
      },
      scores: { lexical: 0.94 },
      fused: 0.94,
      provenance: ['lexical'],
    },
    {
      message: {
        message_id: 'msg_2',
        thread_id: 'thread_2',
        from_agent: 'watcher',
        timestamp: '2026-06-20T11:00:00Z',
        type: 'note',
        kind: 'note',
        supertags: ['aurora'],
        referenceTargets: [],
        referenceTypes: [],
        linkTypes: [],
        entities: [],
        searchable_summary: 'Secondary shallow hit',
        salience: 0.7,
        body_available: true,
      },
      scores: { lexical: 0.7 },
      fused: 0.8,
      provenance: ['lexical'],
    },
  ];

  assert.equal(semanticRouterSdk.shouldRun('deep', parsed, soFar), false);
});

test('semantic-router shouldRun skips vector when shallow shortlist is already decisive', () => {
  const parsed = semanticRouterSdk.parseQuery('vendor renewal timeline');
  const soFar = [
    {
      message: {
        message_id: 'msg_1',
        thread_id: 'thread_1',
        from_agent: 'watcher',
        timestamp: '2026-06-20T10:00:00Z',
        type: 'note',
        kind: 'note',
        supertags: ['aurora'],
        referenceTargets: [],
        referenceTypes: [],
        linkTypes: [],
        entities: [],
        searchable_summary: 'Decisive lexical hit',
        salience: 0.9,
        body_available: true,
      },
      scores: { lexical: 0.95 },
      fused: 0.95,
      provenance: ['lexical'],
    },
    {
      message: {
        message_id: 'msg_2',
        thread_id: 'thread_2',
        from_agent: 'watcher',
        timestamp: '2026-06-20T11:00:00Z',
        type: 'note',
        kind: 'note',
        supertags: ['aurora'],
        referenceTargets: [],
        referenceTypes: [],
        linkTypes: [],
        entities: [],
        searchable_summary: 'Secondary lexical hit',
        salience: 0.7,
        body_available: true,
      },
      scores: { lexical: 0.74 },
      fused: 0.82,
      provenance: ['lexical'],
    },
  ];

  assert.equal(semanticRouterSdk.shouldRun('vector', parsed, soFar), false);
});

test('semantic-router shouldRun keeps vector enabled for ambiguous shortlist', () => {
  const parsed = semanticRouterSdk.parseQuery('vendor renewal timeline');
  const soFar = [
    {
      message: {
        message_id: 'msg_1',
        thread_id: 'thread_1',
        from_agent: 'watcher',
        timestamp: '2026-06-20T10:00:00Z',
        type: 'note',
        kind: 'note',
        supertags: ['aurora'],
        referenceTargets: [],
        referenceTypes: [],
        linkTypes: [],
        entities: [],
        searchable_summary: 'Planning note',
        salience: 0.9,
        body_available: true,
      },
      scores: { lexical: 0.67 },
      fused: 0.79,
      provenance: ['lexical'],
    },
    {
      message: {
        message_id: 'msg_2',
        thread_id: 'thread_2',
        from_agent: 'watcher',
        timestamp: '2026-06-20T11:00:00Z',
        type: 'note',
        kind: 'note',
        supertags: ['aurora'],
        referenceTargets: [],
        referenceTypes: [],
        linkTypes: [],
        entities: [],
        searchable_summary: 'Another plausible lexical hit',
        salience: 0.7,
        body_available: true,
      },
      scores: { lexical: 0.64 },
      fused: 0.75,
      provenance: ['lexical'],
    },
  ];

  assert.equal(semanticRouterSdk.shouldRun('vector', parsed, soFar), true);
});

test('semantic-router shouldRun keeps deep enabled for ambiguous shortlist with body evidence', () => {
  const parsed = semanticRouterSdk.parseQuery('vendor renewal timeline');
  const soFar = [
    {
      message: {
        message_id: 'msg_1',
        thread_id: 'thread_1',
        from_agent: 'watcher',
        timestamp: '2026-06-20T10:00:00Z',
        type: 'note',
        kind: 'note',
        supertags: ['aurora'],
        referenceTargets: [],
        referenceTypes: [],
        linkTypes: [],
        entities: [],
        searchable_summary: 'Planning note',
        salience: 0.9,
        body_available: true,
      },
      scores: { lexical: 0.68, topology: 0.32 },
      fused: 0.81,
      provenance: ['lexical', 'topology'],
    },
    {
      message: {
        message_id: 'msg_2',
        thread_id: 'thread_2',
        from_agent: 'watcher',
        timestamp: '2026-06-20T11:00:00Z',
        type: 'note',
        kind: 'note',
        supertags: ['aurora'],
        referenceTargets: [],
        referenceTypes: [],
        linkTypes: [],
        entities: [],
        searchable_summary: 'Another plausible hit',
        salience: 0.7,
        body_available: true,
      },
      scores: { lexical: 0.66 },
      fused: 0.77,
      provenance: ['lexical'],
    },
  ];

  assert.equal(semanticRouterSdk.shouldRun('deep', parsed, soFar), true);
});

test('semantic-router topology expansion propagates multi-hop scores in depth order', async () => {
  const neighbors = [
    {
      source_message_id: 'seed_1',
      target_message_id: 'hop_1',
      link_type: 'same_topic',
      weight: 0.9,
      depth: 1,
      target: {
        message_id: 'hop_1',
        thread_id: 'thread_hop_1',
        from_agent: 'watcher',
        timestamp: '2026-06-20T10:00:00Z',
        type: 'knowledge_link',
        kind: 'knowledge_link',
        supertags: ['aurora'],
        referenceTargets: [],
        referenceTypes: [],
        linkTypes: ['same_topic'],
        entities: [],
        searchable_summary: 'First hop',
        salience: 0.6,
        body_available: false,
      },
    },
    {
      source_message_id: 'hop_1',
      target_message_id: 'hop_2',
      link_type: 'follows_up',
      weight: 0.8,
      depth: 2,
      target: {
        message_id: 'hop_2',
        thread_id: 'thread_hop_2',
        from_agent: 'watcher',
        timestamp: '2026-06-21T10:00:00Z',
        type: 'knowledge_link',
        kind: 'knowledge_link',
        supertags: ['aurora'],
        referenceTargets: [],
        referenceTypes: [],
        linkTypes: ['follows_up'],
        entities: [],
        searchable_summary: 'Second hop',
        salience: 0.5,
        body_available: false,
      },
    },
  ];

  const fakeStore = {
    queryMetadata: async () => [],
    fullTextSearch: async () => [],
    vectorSearch: async () => [],
    neighbors: async () => neighbors,
    decryptBodies: async () => new Map(),
    embed: async () => [],
  };

  const results = await semanticRouterSdk.layerTopology(
    fakeStore,
    [
      {
        message: {
          message_id: 'seed_1',
          thread_id: 'thread_seed',
          from_agent: 'watcher',
          timestamp: '2026-06-19T10:00:00Z',
          type: 'note',
          kind: 'note',
          supertags: ['aurora'],
          referenceTargets: [],
          referenceTypes: [],
          linkTypes: [],
          entities: [],
          searchable_summary: 'Seed',
          salience: 0.9,
          body_available: false,
        },
        scores: { lexical: 0.8 },
        fused: 0.8,
        provenance: ['seed'],
      },
    ],
    4,
    2,
  );

  assert.equal(results[0]?.message.message_id, 'hop_1');
  assert.equal(results[0]?.provenance[0], 'topology: hop 1 same_topic (w=0.90) from seed_1');
  const secondHop = results.find((candidate) => candidate.message.message_id === 'hop_2');
  assert.ok(secondHop);
  assert.equal(secondHop.provenance[0], 'topology: hop 2 follows_up (w=0.80) from hop_1');
  assert.ok(secondHop.fused < results[0].fused);
});

test('semantic-router render hints reflect structured query shape and avoid redundant refinements', () => {
  const hint = semanticRouterSdk.renderHint(
    [
      {
        message: {
          message_id: 'msg_1',
          thread_id: 'thread_aurora',
          from_agent: 'background_watcher',
          timestamp: '2026-06-20T10:00:00Z',
          type: 'project_note',
          kind: 'project',
          supertags: ['aurora', 'launch'],
          referenceTargets: [],
          referenceTypes: [],
          linkTypes: [],
          entities: [],
          searchable_summary: 'Vendor renewal plan for Aurora launch',
          salience: 0.9,
          body_available: false,
        },
        scores: { lexical: 0.8 },
        fused: 0.8,
        provenance: ['lexical'],
      },
      {
        message: {
          message_id: 'msg_2',
          thread_id: 'thread_aurora',
          from_agent: 'background_watcher',
          timestamp: '2026-06-21T10:00:00Z',
          type: 'project_note',
          kind: 'project',
          supertags: ['aurora', 'supplier'],
          referenceTargets: [],
          referenceTypes: [],
          linkTypes: [],
          entities: [],
          searchable_summary: 'Supplier timeline notes',
          salience: 0.7,
          body_available: false,
        },
        scores: { lexical: 0.7 },
        fused: 0.7,
        provenance: ['lexical'],
      },
    ],
    'lexical',
    0.52,
    {
      kinds: ['project'],
      supertags: ['aurora'],
      freeText: 'vendor renewal',
    },
  );

  assert.equal(hint.title, 'project matching "vendor renewal"');
  assert.equal(hint.groupBy, 'supertag');
  assert.equal(hint.refineSuggestions.includes('Only #aurora'), false);
  assert.equal(hint.refineSuggestions.includes('Only from background_watcher'), true);
  assert.equal(hint.refineSuggestions.includes('Only this thread'), true);
});

test('semantic-router deep retrieval reranks by body evidence and extracts denser excerpts', async () => {
  const shortlist = [
    {
      message: {
        message_id: 'msg_1',
        thread_id: 'thread_1',
        from_agent: 'watcher',
        timestamp: '2026-06-20T10:00:00Z',
        type: 'note',
        kind: 'note',
        supertags: ['aurora'],
        referenceTargets: [],
        referenceTypes: [],
        linkTypes: [],
        entities: [],
        searchable_summary: 'Weak summary',
        salience: 0.5,
        body_available: true,
      },
      scores: { lexical: 0.74 },
      fused: 0.74,
      provenance: ['lexical'],
    },
    {
      message: {
        message_id: 'msg_2',
        thread_id: 'thread_2',
        from_agent: 'watcher',
        timestamp: '2026-06-20T11:00:00Z',
        type: 'note',
        kind: 'note',
        supertags: ['aurora'],
        referenceTargets: [],
        referenceTypes: [],
        linkTypes: [],
        entities: [],
        searchable_summary: 'Stronger summary',
        salience: 0.8,
        body_available: true,
      },
      scores: { lexical: 0.7 },
      fused: 0.7,
      provenance: ['lexical'],
    },
  ];

  const fakeStore = {
    queryMetadata: async () => [],
    fullTextSearch: async () => [],
    vectorSearch: async () => [],
    neighbors: async () => [],
    decryptBodies: async () =>
      new Map([
        [
          'msg_1',
          'This note mentions vendors and planning, but the renewal timeline is vague and only references one supplier touchpoint.',
        ],
        [
          'msg_2',
          'Aurora vendor renewal timeline is confirmed. The vendor renewal timeline includes supplier approval, renewal checklist, and the final renewal timeline handoff.',
        ],
      ]),
    embed: async () => [],
  };

  const budget = new semanticRouterSdk.BudgetTracker({
    maxDecryptions: 2,
    maxTokens: 500,
  });

  const reranked = await semanticRouterSdk.layerDeep(
    fakeStore,
    shortlist,
    'vendor renewal timeline',
    budget,
  );

  assert.equal(reranked[0]?.message.message_id, 'msg_2');
  assert.equal(typeof reranked[0]?.scores.deep, 'number');
  assert.ok((reranked[0]?.scores.deep ?? 0) > (reranked[1]?.scores.deep ?? 0));
  assert.ok(reranked[0]?.provenance.at(-1)?.includes('matched') || reranked[0]?.provenance.at(-1)?.includes('exact phrase'));
  assert.ok(reranked[0]?.decryptedExcerpt?.toLowerCase().includes('vendor renewal timeline'));
});

test('semantic-router deep retrieval prioritizes ambiguous shortlist bodies before decisive shallow hits', async () => {
  const shortlist = [
    {
      message: {
        message_id: 'msg_decisive',
        thread_id: 'thread_1',
        from_agent: 'watcher',
        timestamp: '2026-06-20T10:00:00Z',
        type: 'note',
        kind: 'note',
        supertags: ['aurora'],
        referenceTargets: [],
        referenceTypes: [],
        linkTypes: [],
        entities: [],
        searchable_summary: 'Exact vendor renewal timeline summary already exposed',
        salience: 0.9,
        body_available: true,
      },
      scores: { lexical: 0.94 },
      fused: 0.94,
      provenance: ['lexical'],
    },
    {
      message: {
        message_id: 'msg_ambiguous',
        thread_id: 'thread_2',
        from_agent: 'watcher',
        timestamp: '2026-06-20T11:00:00Z',
        type: 'note',
        kind: 'note',
        supertags: ['aurora'],
        referenceTargets: [],
        referenceTypes: [],
        linkTypes: [],
        entities: [],
        searchable_summary: 'Planning note',
        salience: 0.7,
        body_available: true,
      },
      scores: { lexical: 0.62, topology: 0.31 },
      fused: 0.89,
      provenance: ['lexical', 'topology'],
    },
  ];

  const fakeStore = {
    queryMetadata: async () => [],
    fullTextSearch: async () => [],
    vectorSearch: async () => [],
    neighbors: async () => [],
    decryptBodies: async () =>
      new Map([
        [
          'msg_decisive',
          'This body repeats the already decisive summary without adding more specific vendor timeline detail.',
        ],
        [
          'msg_ambiguous',
          'The hidden body confirms the vendor renewal timeline slipped to Friday after legal review and procurement signoff.',
        ],
      ]),
    embed: async () => [],
  };

  const budget = new semanticRouterSdk.BudgetTracker({
    maxDecryptions: 1,
    maxTokens: 160,
    maxLatencyMs: 500,
    maxWorkingSet: 10,
    maxEmbeddings: 0,
  });

  const reranked = await semanticRouterSdk.layerDeep(
    fakeStore,
    shortlist,
    'vendor renewal timeline',
    budget,
  );

  const decisive = reranked.find((candidate) => candidate.message.message_id === 'msg_decisive');
  const ambiguous = reranked.find((candidate) => candidate.message.message_id === 'msg_ambiguous');

  assert.equal(typeof ambiguous?.scores.deep, 'number');
  assert.equal(decisive?.scores.deep, undefined);
  assert.ok((ambiguous?.decryptedExcerpt ?? '').toLowerCase().includes('vendor renewal timeline'));
});

test('semantic-router route prefers corroborated higher-salience candidates over insertion-order ties', async () => {
  const candidateA = {
    message_id: 'msg_a',
    thread_id: 'thread_a',
    from_agent: 'watcher',
    timestamp: '2026-06-20T11:00:00Z',
    type: 'note',
    kind: 'note',
    supertags: ['aurora'],
    referenceTargets: [],
    referenceTypes: [],
    linkTypes: [],
    entities: [],
    searchable_summary: 'Vendor renewal timeline confirmed',
    salience: 0.95,
    body_available: true,
  };
  const candidateB = {
    message_id: 'msg_b',
    thread_id: 'thread_b',
    from_agent: 'watcher',
    timestamp: '2026-06-20T10:00:00Z',
    type: 'note',
    kind: 'note',
    supertags: ['aurora'],
    referenceTargets: [],
    referenceTypes: [],
    linkTypes: [],
    entities: [],
    searchable_summary: 'Vendor planning note',
    salience: 0.35,
    body_available: true,
  };

  const fakeStore = {
    queryMetadata: async () => [candidateB, candidateA],
    fullTextSearch: async () => [
      { message: candidateA, score: 0.82 },
      { message: candidateB, score: 0.82 },
    ],
    vectorSearch: async () => [],
    neighbors: async () => [],
    decryptBodies: async () => new Map(),
    embed: async () => [],
  };

  const router = new semanticRouterSdk.SemanticRouter(fakeStore);
  const result = await router.route({
    text: 'vendor renewal timeline',
    limit: 2,
    budget: {
      maxEmbeddings: 0,
      maxDecryptions: 0,
      maxTokens: 0,
      maxLatencyMs: 500,
      maxWorkingSet: 10,
    },
  });

  assert.equal(result.candidates[0]?.message.message_id, 'msg_a');
  assert.equal(result.candidates[1]?.message.message_id, 'msg_b');
});

test('semantic-router route gives a bounded freshness lift for near-tied candidates', async () => {
  const fresher = {
    message_id: 'msg_fresh',
    thread_id: 'thread_fresh',
    from_agent: 'watcher',
    timestamp: '2026-06-20T11:00:00Z',
    type: 'note',
    kind: 'note',
    supertags: ['aurora'],
    referenceTargets: [],
    referenceTypes: [],
    linkTypes: [],
    entities: [],
    searchable_summary: 'Recent vendor renewal note',
    salience: 0.5,
    body_available: true,
  };
  const older = {
    message_id: 'msg_old',
    thread_id: 'thread_old',
    from_agent: 'watcher',
    timestamp: '2026-03-20T11:00:00Z',
    type: 'note',
    kind: 'note',
    supertags: ['aurora'],
    referenceTargets: [],
    referenceTypes: [],
    linkTypes: [],
    entities: [],
    searchable_summary: 'Older vendor renewal note',
    salience: 0.5,
    body_available: true,
  };

  const fakeStore = {
    queryMetadata: async () => [older, fresher],
    fullTextSearch: async () => [
      { message: older, score: 0.82 },
      { message: fresher, score: 0.82 },
    ],
    vectorSearch: async () => [],
    neighbors: async () => [],
    decryptBodies: async () => new Map(),
    embed: async () => [],
  };

  const router = new semanticRouterSdk.SemanticRouter(fakeStore);
  const result = await router.route({
    text: 'vendor renewal timeline',
    limit: 2,
    budget: {
      maxEmbeddings: 0,
      maxDecryptions: 0,
      maxTokens: 0,
      maxLatencyMs: 500,
      maxWorkingSet: 10,
    },
  });

  assert.equal(result.candidates[0]?.message.message_id, 'msg_fresh');
  assert.equal(result.candidates[1]?.message.message_id, 'msg_old');
});

test('root SDK parses object-messages retrieval payloads', () => {
  const parsed = rootSdk.parseObjectMessagesResponse({
    query: 'kind:task #aurora',
    free_text: 'vendor renewal',
    facet_next_moves: {
      kinds: [{ value: 'task', count: 3, score: 0.92, rationale: 'focused object anchor + strong narrowing power' }],
      tags: [],
      reference_targets: [],
      reference_types: [],
      link_types: [],
      metadata_terms: [],
    },
    retrieval_state: {
      summary: 'Current ranking is focused-object anchored, narrowing-first.',
      badges: ['focused object', 'narrowing-first'],
    },
    count: 1,
    messages: [{
      id: 'msg_1',
      sender: 'system',
      thread_id: 'aurora',
      timestamp: '2026-06-17T10:00:00Z',
      type: 'ledger',
      content: { title: 'Renew vendor contract' },
      metadata: {},
      views: [],
    }],
  });

  assert.equal(parsed.count, 1);
  assert.equal(parsed.retrieval_state?.badges.includes('focused object'), true);
  assert.equal(parsed.facet_next_moves?.kinds[0]?.rationale.includes('narrowing power'), true);
});

test('retrieval helpers humanize concentrated and mixed retrieval badges', () => {
  assert.equal(retrievalSdk.humanizeRetrievalBadge('kind-concentrated'), 'kind concentrated');
  assert.equal(retrievalSdk.humanizeRetrievalBadge('mixed neighborhood'), 'mixed results');
  assert.equal(retrievalSdk.retrievalBadgeTone('kind-concentrated'), 'success');
  assert.equal(retrievalSdk.retrievalBadgeTone('mixed neighborhood'), 'warning');
  assert.equal(retrievalSdk.retrievalBadgeTone('narrowing-first'), 'info');
  assert.equal(retrievalSdk.retrievalBadgeTone('work context'), 'info');
  assert.equal(retrievalSdk.retrievalBadgeTone('human authored'), 'info');
  assert.deepEqual(
    retrievalSdk.retrievalStateBadges({
      badges: ['kind-concentrated', 'mixed neighborhood', 'narrowing-first'],
    }),
    ['kind concentrated', 'mixed results', 'narrowing-first'],
  );
  assert.deepEqual(
    retrievalSdk.retrievalScopeBadgesFromQuery(
      'memory_space:work author_type:human status:active priority:high follow_up_at:today domain:work',
    ),
    ['work context', 'human authored', 'active status', 'high priority', 'work domain', 'follow-up today'],
  );
  assert.deepEqual(
    retrievalSdk.objectRetrievalStateBadges({
      result: {
        query: 'memory:work author_type:human status:active priority:high follow_up_at:today domain:work',
        retrieval_state: { badges: ['kind-concentrated'] },
      },
    }),
    ['kind concentrated', 'work context', 'human authored', 'active status', 'high priority', 'work domain', 'follow-up today'],
  );
  assert.deepEqual(
    retrievalSdk.threadRetrievalStateBadges({
      state: { badges: ['mixed neighborhood'] },
      query: 'space:work author_mask:private status:active followup:today',
    }),
    ['mixed results', 'work context', 'private authored', 'active status', 'follow-up today'],
  );
  assert.equal(
    retrievalSdk.retrievalScopeSummaryFromQuery(
      'memory_space:work author_type:human status:active priority:high',
    ),
    'Scoped to work context, human authored, active status, and high priority.',
  );
  assert.equal(
    retrievalSdk.objectRetrievalStateSummary({
      result: {
        query: 'memory:work author_type:human status:active follow_up_at:today',
        retrieval_state: { summary: 'Object retrieval is exact-metadata-filtered.' },
      },
    }),
    'Object retrieval is exact-metadata-filtered. Scoped to work context, human authored, active status, and follow-up today.',
  );
  assert.equal(
    retrievalSdk.threadRetrievalStateSummary({
      state: { summary: 'Thread discovery is exact-metadata-filtered.' },
      query: 'space:work author_mask:private priority:high',
    }),
    'Thread discovery is exact-metadata-filtered. Scoped to work context, private authored, and high priority.',
  );
  assert.deepEqual(
    retrievalSdk.topThreadFreshnessState({
      summary: 'Top surfaced thread remains active within the current result window.',
      badges: ['active-top-thread'],
    }),
    {
      badge: 'Top thread active',
      summary: 'Top thread context remains active.',
      tone: 'info',
    },
  );
  assert.equal(
    retrievalSdk.topThreadFreshnessSummary({
      summary: 'Top surfaced thread is still fresh in the current result window.',
      badges: ['fresh-top-thread'],
    }),
    'Top thread context is fresh.',
  );
  assert.deepEqual(
    retrievalSdk.topObjectFreshnessState({
      summary: 'Top surfaced object result is older context that still ranks highly.',
      badges: ['stale-top-object'],
    }),
    {
      badge: 'Top object stale',
      summary: 'Top object context is older but still relevant.',
      tone: 'warning',
    },
  );
  assert.equal(
    retrievalSdk.topObjectFreshnessSummary({
      summary: 'Top surfaced object result is still fresh in the current result window.',
      badges: ['fresh-top-object'],
    }),
    'Top object context is fresh.',
  );
  assert.equal(
    retrievalSdk.leadingObjectCue({
      summary:
        'Current ranking is active-state weighted. Top surfaced object result is still fresh in the current result window. Leading object cue: aurora.',
      badges: ['fresh-top-object'],
    }),
    'aurora',
  );
  assert.equal(
    retrievalSdk.leadingThreadCue({
      summary:
        'Thread discovery is text-guided. Top surfaced thread is still fresh in the current result window. Leading neighborhood cue: project:aurora.',
      badges: ['fresh-top-thread'],
    }),
    'project:aurora',
  );
  assert.deepEqual(
    retrievalSdk.threadRetrievalStateDisplayBadges({
      state: { badges: ['fresh-top-thread', 'mixed neighborhood'] },
      query: 'space:work',
    }),
    ['mixed results', 'work context'],
  );
  assert.deepEqual(
    retrievalSdk.objectRetrievalStateDisplayBadges({
      result: {
        retrieval_state: { badges: ['fresh-top-object', 'kind-concentrated'] },
      },
    }),
    ['kind concentrated'],
  );
});

test('continuity watcher helpers parse normalized watcher envelopes from state snapshots', () => {
  const message = {
    id: 'snapshot_1',
    thread_id: 'thread_1',
    type: 'state_snapshot',
    content: {
      watcher_signals: [
        {
          id: 'sig_1',
          signal_key: 'watcher:deadline',
          category: 'schedule',
          freshness: 'fresh',
          urgency: 'today',
          confidence: 'high',
          urgency_hint: 'Fresh signal still needs attention today.',
          suppression_status: 'active',
          suppression_reason: 'Watcher surfaced this signal without an active suppression override.',
          escalation_status: 'watch',
          escalation_reason: 'Near-term watcher pressure remains active, but it does not currently justify an interruptive alert.',
          decrypt_needed: true,
          source_type: 'watcher_alert',
          source_subtype: 'deadline_due_today',
          thread_id: 'thread_1',
          source_refs: ['msg_1'],
        },
      ],
    },
  };

  const signals = continuitySdk.watcherSignalsFromMessage(message);
  assert.equal(signals.length, 1);
  assert.equal(signals[0].escalation_status, 'watch');
  assert.equal(signals[0].decrypt_needed, true);
  assert.equal(
    continuitySdk.watcherSignalSummary(signals[0]),
    'Fresh signal still needs attention today.',
  );
  assert.equal(
    continuitySdk.latestWatcherSignalSummaryFromMessages([message]),
    'Fresh signal still needs attention today.',
  );
  assert.equal(
    rootSdk.latestWatcherSignalSummaryFromMessages([message]),
    'Fresh signal still needs attention today.',
  );
});

test('continuity watcher helpers prefer suppression and escalation rationale over generic urgency hints', () => {
  const suppressedSignal = {
    id: 'sig_suppressed',
    signal_key: 'watcher:follow_up',
    category: 'response',
    freshness: 'fresh',
    urgency: 'today',
    confidence: 'medium',
    urgency_hint: 'Fresh signal still needs attention today.',
    suppression_status: 'suppressed',
    suppression_reason:
      'Suppression is currently active, so this signal remains audit-visible without contributing live escalation pressure.',
    escalation_status: 'watch',
    escalation_reason:
      'Near-term watcher pressure remains active, but it does not currently justify an interruptive alert.',
    decrypt_needed: false,
    source_type: 'smart_suggestion',
    source_subtype: 'follow_up',
    thread_id: 'thread_1',
    source_refs: ['msg_2'],
  };
  const escalatedSignal = {
    id: 'sig_required',
    signal_key: 'watcher:deadline',
    category: 'schedule',
    freshness: 'fresh',
    urgency: 'today',
    confidence: 'high',
    urgency_hint: 'Fresh watcher alert is still active now.',
    suppression_status: 'active',
    suppression_reason: 'Watcher surfaced this signal without an active suppression override.',
    escalation_status: 'required',
    escalation_reason:
      'Active watcher alert is time-sensitive and should remain in the live escalation path.',
    decrypt_needed: false,
    source_type: 'watcher_alert',
    source_subtype: 'deadline_due_today',
    thread_id: 'thread_1',
    source_refs: ['msg_3'],
  };

  assert.equal(
    continuitySdk.watcherSignalSummary(suppressedSignal),
    'Suppression is currently active, so this signal remains audit-visible without contributing live escalation pressure.',
  );
  assert.equal(
    continuitySdk.watcherSignalSummary(escalatedSignal),
    'Active watcher alert is time-sensitive and should remain in the live escalation path.',
  );
  assert.equal(
    rootSdk.watcherSignalSummary(suppressedSignal),
    'Suppression is currently active, so this signal remains audit-visible without contributing live escalation pressure.',
  );
});

test('continuity watcher helpers summarize direct watcher AFP messages', () => {
  const alertMessage = {
    id: 'watcher_alert_1',
    thread_id: 'thread_1',
    type: 'watcher_alert',
    content: {
      category: 'safety',
      severity: 'urgent',
      confidence: 0.94,
      message: 'Allergy conflict detected.',
      suggestion: 'Swap the product before checkout.',
    },
  };
  const suggestionMessage = {
    id: 'smart_suggestion_1',
    thread_id: 'thread_1',
    type: 'smart_suggestion',
    content: {
      category: 'study',
      confidence: 0.78,
      title: 'Study block available',
      body: 'A quiet 45-minute study window is open this afternoon.',
    },
  };

  assert.equal(
    continuitySdk.watcherMessageSummary(alertMessage),
    'Urgent safety watcher alert (high confidence).',
  );
  assert.equal(
    continuitySdk.watcherMessageSummary(suggestionMessage),
    'Study watcher suggestion (medium confidence).',
  );
  assert.equal(
    rootSdk.watcherMessageSummary(alertMessage),
    'Urgent safety watcher alert (high confidence).',
  );
});

test('root SDK parses thread-summaries retrieval payloads', () => {
  const parsed = rootSdk.parseThreadSummariesResponse({
    query: 'kind:project #aurora',
    tags: ['aurora'],
    metadata_terms: ['memory_space:work'],
    kind: 'project',
    match: 'all',
    facet_suggestions: {
      kinds: [{ value: 'task', count: 2 }],
      tags: [{ value: 'topic:launch', count: 2 }],
      metadata_terms: [{ value: 'memory_space:work', count: 2 }],
    },
    facet_next_moves: {
      kinds: [{ value: 'task', count: 2, score: 0.88, rationale: 'strong narrowing power' }],
      tags: [{ value: 'topic:launch', count: 2, score: 0.74, rationale: 'local continuity + strong narrowing power' }],
    },
    retrieval_state: {
      summary: 'Thread discovery is tag-filtered, kind-focused.',
      badges: ['tag-filtered', 'kind-focused'],
    },
    count: 1,
    thread_summaries: [{
      thread_id: 'aurora',
      title: 'Project Aurora',
      preview: 'Launch preparation and supplier coordination',
      message_count: 4,
      last_message_at: '2026-06-17T11:00:00Z',
      activity_freshness: 'fresh',
      dominant_kind: 'project',
      supertags: ['aurora', 'project:aurora'],
      score: 9,
    }],
  });

  assert.equal(parsed.count, 1);
  assert.equal(parsed.thread_summaries[0]?.thread_id, 'aurora');
  assert.equal(parsed.thread_summaries[0]?.activity_freshness, 'fresh');
  assert.equal(parsed.retrieval_state?.badges.includes('kind-focused'), true);
  assert.equal(parsed.facet_next_moves?.kinds[0]?.value, 'task');
  assert.equal(parsed.facet_suggestions?.metadata_terms?.[0]?.value, 'memory_space:work');
});
