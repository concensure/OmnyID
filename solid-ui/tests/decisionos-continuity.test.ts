import test from 'node:test';
import assert from 'node:assert/strict';
import { topThreadFreshnessState } from 'afp-ts/retrieval';

import {
  decisionOsContinuityLaneSummaryFromStateFieldSummary,
  decisionOsPreferredProactiveLaneSuggestion,
  decisionOsProactiveLaneState,
  decisionOsSimulatorPreviewLaneSelections,
  decisionOsSimulatorPreviewLaneSelection,
  decisionOsSimulatorPreviewLaneSummary,
} from '../src/lib/decisionosContinuityLaneState.ts';
import {
  buildDecisionOsUpdateDetail,
  dispatchDecisionOsUpdateEvent,
  decisionOsBriefing,
  decisionOsContinuityPrimaryMode,
  decisionOsSuggestedMood,
  latestDecisionOsUpdateDetail,
  readDecisionOsUpdateEventDetail,
  subscribeDecisionOsUpdateEvent,
} from '../src/lib/decisionosContinuity.ts';
import {
  decisionOsLeadingThreadCue,
  decisionOsThreadRetrievalBadges,
  decisionOsThreadSupportState,
} from '../src/lib/decisionosThreadRetrievalState.ts';

const emptySummary = {
  count: 0,
  fields: [],
  hasVisible: false,
  leadingField: null,
} as const;

test('decisionos continuity lane summary falls back to response anchors when scope line is absent', () => {
  const lane = decisionOsContinuityLaneSummaryFromStateFieldSummary(
    emptySummary,
    [
      {
        id: 'resp_1',
        title: 'Reply to Aurora vendor',
        channel: 'email',
        urgency: 'today',
        confidence: 'high',
        response_due_hint: 'Today',
        suggested_action: 'Review prepared reply',
        prepared_draft_available: true,
        prepared_draft_summary_lines: [
          'Prepared response draft is ready for vendor follow-up.',
          'File anchors: launch-brief.md.',
        ],
        prepared_draft_object_labels: ['Vendor contract'],
        source_refs: ['message:msg_1'],
      },
    ],
    [],
    [],
    'focused',
  );

  assert.equal(lane.title, 'Prepared response ready');
  assert.equal(lane.detail, 'Prepared response draft is ready for vendor follow-up.');
  assert.equal(lane.reason, 'prepared response ready, anchored to vendor contract, launch-brief.md');
});

test('decisionos continuity lane summary uses active prepared-response wording outside focused mode', () => {
  const lane = decisionOsContinuityLaneSummaryFromStateFieldSummary(
    emptySummary,
    [
      {
        id: 'resp_2',
        title: 'Reply to Aurora vendor',
        channel: 'email',
        urgency: 'today',
        confidence: 'high',
        response_due_hint: 'Today',
        suggested_action: 'Review prepared reply',
        prepared_draft_available: true,
        prepared_draft_summary_lines: [
          'Prepared response draft is ready for vendor follow-up.',
          'Object anchors: Vendor contract.',
        ],
        source_refs: ['message:msg_2'],
      },
    ],
    [],
    [],
    'steady',
  );

  assert.equal(lane.title, 'Response continuity active');
  assert.equal(lane.badge, 'active');
  assert.equal(lane.reason, 'prepared response continuity active, anchored to vendor contract');
});

test('decisionos continuity lane summary distinguishes prepared decision support and workspace work', () => {
  const decisionLane = decisionOsContinuityLaneSummaryFromStateFieldSummary(
    emptySummary,
    [
      {
        prepared_draft_class: 'decision_memo',
        prepared_draft_summary_lines: [
          'Prepared renewal review is ready for Aurora Fiber.',
          'Object anchors: Aurora Fiber renewal.',
        ],
      },
    ],
    [],
    [],
    'focused',
  );
  assert.equal(decisionLane.title, 'Prepared decision support ready');
  assert.equal(decisionLane.reason, 'prepared decision support ready, anchored to aurora fiber renewal');

  const workspaceLane = decisionOsContinuityLaneSummaryFromStateFieldSummary(
    emptySummary,
    [
      {
        prepared_draft_class: 'project_prep_note',
        prepared_draft_summary_lines: [
          'Prepared project prep note is ready for launch planning.',
          'Object anchors: Launch brief.',
        ],
      },
    ],
    [],
    [],
    'steady',
  );
  assert.equal(workspaceLane.title, 'Prepared work continuity active');
  assert.equal(workspaceLane.reason, 'prepared work continuity active, anchored to launch brief');
});

test('decisionos continuity lane summary prefers prepared context summary over title and falls back to title', () => {
  const summaryFirstLane = decisionOsContinuityLaneSummaryFromStateFieldSummary(
    emptySummary,
    [],
    [
      {
        title: 'Aurora context pack',
        summary: 'Grouped continuity around Aurora rollout work.',
      },
    ],
    [],
    'focused',
  );
  assert.equal(summaryFirstLane.title, 'Prepared context ready');
  assert.equal(summaryFirstLane.detail, 'Grouped continuity around Aurora rollout work.');

  const titleFallbackLane = decisionOsContinuityLaneSummaryFromStateFieldSummary(
    emptySummary,
    [],
    [
      {
        title: 'Aurora context pack',
        summary: '   ',
      },
    ],
    [],
    'focused',
  );
  assert.equal(titleFallbackLane.title, 'Prepared context ready');
  assert.equal(titleFallbackLane.detail, 'Aurora context pack');
});

test('decisionos continuity lane summary derives simulator preview lane copy from shared preview state', () => {
  assert.deepEqual(
    decisionOsSimulatorPreviewLaneSummary({
      kind: 'simulator_approval_preview',
      title: 'Approval preview',
      selection_reason: 'Nearest high-stakes event needs protected prep.',
      artifact_summary_lines: ['Protect 45 minutes before the interview'],
      draft_preview: {
        label: 'Draft hold',
        content: 'Hold Tue 3pm',
        content_type: 'text',
      },
    }),
    {
      detail: 'Protect 45 minutes before the interview',
      reason: 'Nearest high-stakes event needs protected prep.',
    },
  );

  assert.deepEqual(
    decisionOsSimulatorPreviewLaneSummary({
      kind: 'simulator_reversible_preview',
      title: 'Reversible preview',
      description: 'Preview a reversible internal change.',
    }),
    {
      detail: 'Preview a reversible internal change.',
      reason: 'Preview a reversible internal change.',
    },
  );

  assert.deepEqual(
    decisionOsSimulatorPreviewLaneSummary({
      kind: 'simulator_conflict_fusion',
      title: 'Fusion preview',
      artifact_summary_lines: ['Keep approval and reversible paths together'],
    }),
    {
      detail: 'Keep approval and reversible paths together',
      reason: 'Bounded simulator projection prepared one comparison that keeps approval and reversible paths together.',
    },
  );

  assert.equal(
    decisionOsSimulatorPreviewLaneSummary({ kind: 'prepared_draft' }),
    null,
  );
  assert.equal(
    decisionOsSimulatorPreviewLaneSummary({
      kind: 'simulator_approval_preview',
      title: 'Approval preview',
      selection_reason: 'Nearest high-stakes event needs protected prep.',
      artifact_summary_lines: ['Protect 45 minutes before the interview'],
    })?.detail ?? null,
    'Protect 45 minutes before the interview',
  );
  assert.equal(
    decisionOsSimulatorPreviewLaneSummary({ kind: 'prepared_draft' })?.detail ?? null,
    null,
  );
});

test('decisionos continuity lane summary derives proactive detail and queued reason from shared state', () => {
  assert.deepEqual(
    decisionOsProactiveLaneState({
      kind: 'prepared_draft',
      title: 'Prepared suggestion',
      description: 'Grouped continuity around launch planning.',
      artifact_summary_lines: ['Scope: Launch planning'],
      memory_space: 'workspace',
      human_only: true,
      selection_reason: 'Prepared work is already assembled and ready for review in the current continuity context.',
    }),
    {
      detail: 'Grouped continuity around launch planning.',
      reason: 'Prepared work is already assembled and ready for review in the current continuity context.',
      scopeCue: 'Launch planning',
      rank: [0, 0, 1, ''],
    },
  );

  assert.deepEqual(
    decisionOsProactiveLaneState({
      kind: 'simulator_reversible_preview',
      title: 'Reversible preview',
      description: 'Preview a reversible internal change.',
    }),
    {
      detail: 'Preview a reversible internal change.',
      reason: 'Preview a reversible internal change.',
      scopeCue: null,
      rank: [3, 1, 1, ''],
    },
  );

  assert.deepEqual(
    decisionOsProactiveLaneState({
      kind: 'simulator_conflict_fusion',
      title: 'Fusion preview',
      artifact_summary_lines: ['Keep approval and reversible paths together'],
    }),
    {
      detail: 'Keep approval and reversible paths together',
      reason: 'Bounded simulator projection prepared one comparison that keeps approval and reversible paths together.',
      scopeCue: null,
      rank: [3, 1, 1, ''],
    },
  );

  assert.equal(decisionOsProactiveLaneState(null), null);
});

test('decisionos continuity lane summary derives proactive ranking state from shared state', () => {
  assert.deepEqual(
    decisionOsProactiveLaneState({
      id: 'draft_1',
      kind: 'prepared_draft',
      description: 'Prepared from recent continuity state.',
      artifact_summary_lines: ['Scope: Launch planning'],
      requires_approval: true,
      selection_reason: 'Prepared work is already assembled and ready for review in the current continuity context.',
    }),
    {
      detail: 'Prepared from recent continuity state.',
      reason: 'Prepared work is already assembled and ready for review in the current continuity context.',
      scopeCue: 'Launch planning',
      rank: [0, 0, 0, 'draft_1'],
    },
  );

  assert.deepEqual(
    decisionOsProactiveLaneState({
      id: 'preview_1',
      kind: 'simulator_approval_preview',
      title: 'Approval preview',
      selection_reason: 'Nearest high-stakes event needs protected prep.',
      artifact_summary_lines: ['Protect 45 minutes before the interview'],
    }),
    {
      detail: 'Protect 45 minutes before the interview',
      reason: 'Nearest high-stakes event needs protected prep.',
      scopeCue: null,
      rank: [3, 1, 1, 'preview_1'],
    },
  );

  assert.equal(decisionOsProactiveLaneState(null), null);
});

test('decisionos continuity lane summary selects the preferred proactive suggestion from shared state', () => {
  const preferred = decisionOsPreferredProactiveLaneSuggestion([
    {
      id: 'preview_1',
      kind: 'simulator_approval_preview',
      title: 'Approval preview',
      selection_reason: 'Nearest high-stakes event needs protected prep.',
      artifact_summary_lines: ['Protect 45 minutes before the interview'],
    },
    {
      id: 'draft_1',
      kind: 'prepared_draft',
      description: 'Prepared from recent continuity state.',
      artifact_summary_lines: ['Scope: Launch planning'],
      requires_approval: true,
      selection_reason: 'Prepared work is already assembled and ready for review in the current continuity context.',
    },
  ]);

  assert.deepEqual(preferred, {
    item: {
      id: 'draft_1',
      kind: 'prepared_draft',
      description: 'Prepared from recent continuity state.',
      artifact_summary_lines: ['Scope: Launch planning'],
      requires_approval: true,
      selection_reason: 'Prepared work is already assembled and ready for review in the current continuity context.',
    },
    state: {
      detail: 'Prepared from recent continuity state.',
      reason: 'Prepared work is already assembled and ready for review in the current continuity context.',
      scopeCue: 'Launch planning',
      rank: [0, 0, 0, 'draft_1'],
    },
  });

  assert.equal(decisionOsPreferredProactiveLaneSuggestion([]), null);
});

test('decisionos continuity lane summary selects simulator preview summaries by kind from shared state', () => {
  const selection = decisionOsSimulatorPreviewLaneSelection([
    {
      id: 'preview_1',
      kind: 'simulator_approval_preview',
      title: 'Approval preview',
      selection_reason: 'Nearest high-stakes event needs protected prep.',
      artifact_summary_lines: ['Protect 45 minutes before the interview'],
    },
    {
      id: 'preview_2',
      kind: 'simulator_reversible_preview',
      title: 'Reversible preview',
      description: 'Preview a reversible internal change.',
    },
  ], 'simulator_reversible_preview');

  assert.deepEqual(selection, {
    item: {
      id: 'preview_2',
      kind: 'simulator_reversible_preview',
      title: 'Reversible preview',
      description: 'Preview a reversible internal change.',
    },
    summary: {
      detail: 'Preview a reversible internal change.',
      reason: 'Preview a reversible internal change.',
    },
  });

  assert.equal(
    decisionOsSimulatorPreviewLaneSelection([], 'simulator_approval_preview'),
    null,
  );
});

test('decisionos continuity lane summary selects approval and reversible simulator previews together', () => {
  assert.deepEqual(
    decisionOsSimulatorPreviewLaneSelections([
      {
        id: 'preview_1',
        kind: 'simulator_approval_preview',
        title: 'Approval preview',
        selection_reason: 'Nearest high-stakes event needs protected prep.',
        artifact_summary_lines: ['Protect 45 minutes before the interview'],
      },
      {
        id: 'preview_2',
        kind: 'simulator_reversible_preview',
        title: 'Reversible preview',
        description: 'Preview a reversible internal change.',
      },
      {
        id: 'preview_3',
        kind: 'simulator_conflict_fusion',
        title: 'Fusion preview',
        artifact_summary_lines: ['Keep approval and reversible paths together'],
      },
    ]),
    {
      approval: {
        item: {
          id: 'preview_1',
          kind: 'simulator_approval_preview',
          title: 'Approval preview',
          selection_reason: 'Nearest high-stakes event needs protected prep.',
          artifact_summary_lines: ['Protect 45 minutes before the interview'],
        },
        summary: {
          detail: 'Protect 45 minutes before the interview',
          reason: 'Nearest high-stakes event needs protected prep.',
        },
      },
      reversible: {
        item: {
          id: 'preview_2',
          kind: 'simulator_reversible_preview',
          title: 'Reversible preview',
          description: 'Preview a reversible internal change.',
        },
        summary: {
          detail: 'Preview a reversible internal change.',
          reason: 'Preview a reversible internal change.',
        },
      },
      fusion: {
        item: {
          id: 'preview_3',
          kind: 'simulator_conflict_fusion',
          title: 'Fusion preview',
          artifact_summary_lines: ['Keep approval and reversible paths together'],
        },
        summary: {
          detail: 'Keep approval and reversible paths together',
          reason: 'Bounded simulator projection prepared one comparison that keeps approval and reversible paths together.',
        },
      },
    },
  );
});

test('decisionos top thread freshness summary maps compact retrieval badges', () => {
  assert.equal(
    topThreadFreshnessState({
      summary: 'Top surfaced thread is still fresh in the current result window.',
      badges: ['fresh-top-thread'],
    })?.summary ?? null,
    'Top thread context is fresh.',
  );
  assert.equal(
    topThreadFreshnessState({
      summary: 'Top surfaced thread remains active within the current result window.',
      badges: ['active-top-thread'],
    })?.summary ?? null,
    'Top thread context remains active.',
  );
  assert.equal(
    topThreadFreshnessState({
      summary: 'Top surfaced thread is older context that still ranks highly.',
      badges: ['stale-top-thread'],
    })?.summary ?? null,
    'Top thread context is older but still relevant.',
  );
  assert.deepEqual(
    topThreadFreshnessState({
      summary: 'Top surfaced thread remains active within the current result window.',
      badges: ['active-top-thread'],
    }),
    {
      badge: 'Top thread active',
      summary: 'Top thread context remains active.',
      tone: 'info',
    },
  );
  assert.deepEqual(
    decisionOsThreadRetrievalBadges([
      'fresh-top-thread',
      'fresh thread support',
      'older thread support',
      'linked-neighborhood',
      'high-confidence',
    ]),
    ['linked-neighborhood', 'high-confidence'],
  );
  assert.deepEqual(
    decisionOsThreadSupportState({
      summary: 'Thread discovery is older thread support.',
      badges: ['older-thread supported'],
    }),
    {
      badge: 'Older thread support',
      summary: 'Older thread evidence is still driving this retrieval.',
      tone: 'warning',
    },
  );
  assert.equal(
    decisionOsLeadingThreadCue({
      summary:
        'Thread discovery is text-guided. Top surfaced thread is still fresh in the current result window. Leading neighborhood cue: project:aurora.',
      badges: ['fresh-top-thread'],
    }),
    'project:aurora',
  );
  assert.equal(
    decisionOsLeadingThreadCue({
      summary: 'Thread discovery is text-guided.',
      badges: [],
    }),
    null,
  );
});

test('decisionos continuity update event detail normalizes atomic queue contracts from bootstrap-only payloads', () => {
  const detail = readDecisionOsUpdateEventDetail(new CustomEvent('x', {
    detail: {
      continuityPrimaryMode: 'priority_card',
      operationalBootstrap: {
        messages: [],
        action_log: [],
        proactive_suggestions: [{ id: 'pro_1' }],
        continuity_brief: null,
        continuity_action_items: [
          {
            id: 'action_1',
            title: 'Review legacy queue item',
            category: 'review',
            urgency: 'medium',
            confidence: 'medium',
            requires_approval: false,
            suggested_action: 'Open',
            source_refs: ['thread:legacy'],
          },
        ],
        continuity_context_panel_items: [{ id: 'ctx_1', label: 'Legacy context' }],
        continuity_context_pack_items: [{ id: 'pack_1' }],
        continuity_priority_card: {
          title: 'Legacy queue priority',
          description: 'Bootstrap-only update detail',
          panel_kind: 'priority',
          requires_approval: false,
          action_label: 'Open',
        },
      },
    },
  }));

  assert.ok(detail);
  assert.deepEqual(detail?.queueState, {
    queuePriorityCard: {
      title: 'Legacy queue priority',
      description: 'Bootstrap-only update detail',
      panel_kind: 'priority',
      requires_approval: false,
      action_label: 'Open',
    },
    queueActionItems: [
      {
        id: 'action_1',
        title: 'Review legacy queue item',
        category: 'review',
        urgency: 'medium',
        confidence: 'medium',
        requires_approval: false,
        suggested_action: 'Open',
        source_refs: ['thread:legacy'],
      },
    ],
    queueContextPanelItems: [{ id: 'ctx_1', label: 'Legacy context' }],
    queueActionOverflowCount: 0,
    queueActionOverflowSummary: null,
  });
  assert.deepEqual(detail?.queueCompanionState, {
    responseItems: [],
    preparedDraftItems: [],
    contextPackItems: [{ id: 'pack_1' }],
    proactiveSuggestions: [{ id: 'pro_1' }],
  });
});

test('decisionos continuity update event detail keeps event-only decisions outside the normalized core', () => {
  const rawEvent = new CustomEvent('x', {
    detail: {
      decisions: [{ id: 'decision_1', title: 'Event-only decision' }],
      continuityPrimaryMode: 'priority_card',
      operationalBootstrap: {
        messages: [],
        action_log: [],
        proactive_suggestions: [],
        continuity_brief: null,
        continuity_action_items: [],
        continuity_context_panel_items: [],
        continuity_context_pack_items: [],
        continuity_priority_card: {
          title: 'Priority from event',
          description: 'Event payload should normalize without leaking decisions.',
          panel_kind: 'priority',
          requires_approval: false,
          action_label: 'Open',
        },
      },
    },
  });

  const detail = readDecisionOsUpdateEventDetail(rawEvent);

  assert.ok(detail);
  assert.deepEqual(detail?.decisions, [{ id: 'decision_1', title: 'Event-only decision' }]);
  assert.deepEqual(
    Object.keys(detail ?? {}).sort(),
    [
      'continuityPrimaryMode',
      'decisions',
      'operationalBootstrap',
      'queueCompanionState',
      'queueState',
      'suggestedMood',
    ],
  );
});

test('decisionos continuity update event detail returns null for non-object event detail', () => {
  assert.equal(
    readDecisionOsUpdateEventDetail(new CustomEvent('x', { detail: 'invalid-detail' })),
    null,
  );
  assert.equal(
    readDecisionOsUpdateEventDetail(new CustomEvent('x', { detail: 42 })),
    null,
  );
});

test('decisionos continuity update dispatch caches and emits normalized detail', () => {
  let received: Event | null = null;
  const target = new EventTarget();
  target.addEventListener('omnyid:decision-os-update', (event) => {
    received = event;
  });

  dispatchDecisionOsUpdateEvent({
    messages: [],
    action_log: [],
    continuity_handoff: { suggested_mood: 'happy' },
    continuity_primary_mode: 'priority_card',
    proactive_suggestions: [{ id: 'pro_cache_1' }] as any,
    continuity_action_items: [
      {
        id: 'action_cache_1',
        title: 'Review cache contract',
        category: 'review',
        urgency: 'medium',
        confidence: 'medium',
        requires_approval: false,
        suggested_action: 'Open',
        source_refs: ['thread:cache'],
      },
    ] as any,
    continuity_context_panel_items: [{ id: 'ctx_cache_1', label: 'Cache context' }] as any,
    continuity_context_pack_items: [{ id: 'pack_cache_1' }] as any,
    continuity_priority_card: {
      title: 'Cache queue priority',
      description: 'Dispatch should cache normalized continuity detail.',
      panel_kind: 'priority',
      requires_approval: false,
      action_label: 'Open',
    },
  }, target as Window);

  const cached = latestDecisionOsUpdateDetail();
  const receivedDetail = received ? readDecisionOsUpdateEventDetail(received) : null;

  assert.ok(cached);
  assert.ok(receivedDetail);
  assert.deepEqual(receivedDetail, cached);
});

test('decisionos update detail builder emits normalized atomic queue contracts directly', () => {
  const detail = buildDecisionOsUpdateDetail({
    messages: null as any,
    action_log: [],
    continuity_handoff: { suggested_mood: 'focused' },
    continuity_primary_mode: 'priority_card',
    proactive_suggestions: null as any,
    continuity_action_items: [
      {
        id: 'action_1',
        title: 'Review builder contract',
        category: 'review',
        urgency: 'medium',
        confidence: 'medium',
        requires_approval: false,
        suggested_action: 'Open',
        source_refs: ['thread:builder'],
      },
    ] as any,
    continuity_context_panel_items: [{ id: 'ctx_1', label: 'Builder context' }] as any,
    continuity_context_pack_items: [{ id: 'pack_1' }] as any,
    continuity_priority_card: {
      title: 'Builder queue priority',
      description: 'Builder should emit atomic queue state directly.',
      panel_kind: 'priority',
      requires_approval: false,
      action_label: 'Open',
    },
    runtime_updates: null as any,
    calendar_runtime_summary: null as any,
    device_sync_runtime_summary: null as any,
    runtime_deployment: null as any,
    support_access: null as any,
    cost_status: null as any,
    cost_snapshot: null as any,
  });

  assert.equal(detail.suggestedMood, 'focused');
  assert.equal(detail.continuityPrimaryMode, 'priority_card');
  assert.deepEqual(detail.queueState, {
    queuePriorityCard: {
      title: 'Builder queue priority',
      description: 'Builder should emit atomic queue state directly.',
      panel_kind: 'priority',
      requires_approval: false,
      action_label: 'Open',
    },
    queueActionItems: [
      {
        id: 'action_1',
        title: 'Review builder contract',
        category: 'review',
        urgency: 'medium',
        confidence: 'medium',
        requires_approval: false,
        suggested_action: 'Open',
        source_refs: ['thread:builder'],
      },
    ],
    queueContextPanelItems: [{ id: 'ctx_1', label: 'Builder context' }],
    queueActionOverflowCount: 0,
    queueActionOverflowSummary: null,
  });
  assert.deepEqual(detail.queueCompanionState, {
    responseItems: [],
    preparedDraftItems: [],
    contextPackItems: [{ id: 'pack_1' }],
    proactiveSuggestions: [],
  });
  assert.deepEqual(detail.operationalBootstrap?.messages, []);
  assert.deepEqual(detail.operationalBootstrap?.proactive_suggestions, []);
  assert.equal(detail.operationalBootstrap?.runtime_updates, null);
  assert.equal(detail.operationalBootstrap?.calendar_runtime_summary, null);
  assert.equal(detail.operationalBootstrap?.device_sync_runtime_summary, null);
  assert.equal(detail.operationalBootstrap?.runtime_deployment, null);
  assert.equal(detail.operationalBootstrap?.support_access, null);
  assert.equal(detail.operationalBootstrap?.cost_status, null);
  assert.equal(detail.operationalBootstrap?.cost_snapshot, null);
});

test('decisionos briefing derives normalized home briefing from operational continuity payloads', () => {
  assert.deepEqual(
    decisionOsBriefing({
      messages: [],
      continuity_brief: {
        title: 'Review Aurora launch state',
        decision_count: 3,
        commitment_count: 2,
      } as any,
      continuity_priority_card: {
        title: 'Approve Aurora vendor reply',
        requires_approval: true,
      } as any,
    }),
    {
      northStar: 'Approve Aurora vendor reply',
      urgentCount: 1,
      highImpactCount: 3,
      completedCount: 0,
      estimatedMinutes: 20,
      totalDecisions: 3,
    },
  );
});

test('decisionos briefing does not derive fallback north star from encrypted state snapshot content', () => {
  assert.equal(
    decisionOsBriefing({
      messages: [
        {
          id: 'encrypted-snapshot',
          thread_id: 'continuity:state:user_01',
          from: 'state',
          timestamp: '2026-08-14T06:00:00Z',
          type: 'state_snapshot',
          content: {
            suggested_actions: ['Hidden wedding decision'],
            decision_queue: [{ id: 'hidden' }],
            critical_changes: [{ id: 'hidden-critical' }],
            ciphertext: 'abc123',
            nonce: 'nonce123',
          },
          encryption: { scheme: 'xchacha20-poly1305', key_id: 'device-key' },
          views: [],
          attachments: [],
        } as any,
      ],
    }),
    null,
  );
});

test('subscribeDecisionOsUpdateEvent relays normalized detail and unsubscribes cleanly', () => {
  const listeners = new Map<string, Set<(event: Event) => void>>();
  const target = {
    addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
      if (typeof listener !== 'function') return;
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(listener as (event: Event) => void);
    },
    removeEventListener(type: string, listener: EventListenerOrEventListenerObject) {
      if (typeof listener !== 'function') return;
      listeners.get(type)?.delete(listener as (event: Event) => void);
    },
    dispatchEvent(event: Event) {
      for (const listener of listeners.get(event.type) ?? []) listener(event);
      return true;
    },
  } as unknown as Window;

  const seen: string[] = [];
  const unsubscribe = subscribeDecisionOsUpdateEvent((detail) => {
    seen.push(detail.suggestedMood ?? 'none');
  }, target);

  target.dispatchEvent(new CustomEvent('omnyid:decision-os-update', {
    detail: buildDecisionOsUpdateDetail({
      messages: [],
      action_log: [],
      continuity_handoff: { suggested_mood: 'focused' },
    }),
  }));
  target.dispatchEvent(new CustomEvent('omnyid:decision-os-update', {
    detail: 'invalid-detail',
  }));

  unsubscribe();
  target.dispatchEvent(new CustomEvent('omnyid:decision-os-update', {
    detail: buildDecisionOsUpdateDetail({
      messages: [],
      action_log: [],
      continuity_handoff: { suggested_mood: 'tired' },
    }),
  }));

  assert.deepEqual(seen, ['focused']);
});

test('decisionos suggested mood validator accepts product moods and rejects unknown values', () => {
  assert.equal(decisionOsSuggestedMood('focused'), 'focused');
  assert.equal(decisionOsSuggestedMood('  HAPPY  '), 'happy');
  assert.equal(decisionOsSuggestedMood('Saturday, July 18, 2026'), null);
  assert.equal(decisionOsSuggestedMood('curious'), null);
});

test('decisionos continuity primary mode validator accepts product modes and rejects unknown values', () => {
  assert.equal(decisionOsContinuityPrimaryMode('priority_card'), 'priority_card');
  assert.equal(decisionOsContinuityPrimaryMode('  BRIEFING_BAR  '), 'briefing_bar');
  assert.equal(decisionOsContinuityPrimaryMode('Saturday, July 18, 2026'), null);
  assert.equal(decisionOsContinuityPrimaryMode('queue-first'), null);
});
