import test from 'node:test';
import assert from 'node:assert/strict';

import {
  approvalDecisionActionTitle,
  approvalDecisionLabel,
  approvalOptionActionTitle,
  approvalOptionLabel,
  approvalPendingCountSummary,
  approvalPendingStatusLabel,
  approvalRequestTitle,
  approvalContinuationSummary,
  approvalRequiredStatusLabel,
  approvalEventLabel,
  approvalModeLabel,
  approvalStatusLabel,
  approvalDecisionResultSummary,
  approvalDraftPreviewLines,
  approvalDraftPreviewSummary,
  approvalReviewDetailLines,
  approvalReviewTrustSummary,
  approvalReviewKindLabel,
  artifactSummaryLeadLine,
  artifactSummaryDisplayedLines,
  artifactSummaryScopeCue,
  artifactSummarySupportingLines,
  autonomyDecisionSummary,
  CONTINUITY_ACTION_DECISION_PREFIX,
  CONTINUITY_PRIORITY_DECISION_ID,
  consequencePreviewSummary,
  contextPackObjectSearchTarget,
  decisionFromActionItem,
  decisionFromPriorityCard,
  decisionIdFromActionItem,
  evidenceKindsSummary,
  fieldEngineFamilyLabel,
  isContinuitySyntheticDecisionId,
  latestFieldEnginePrimaryTypeFromMessages,
  outcomeFeedbackDetail,
  outcomeFeedbackLabel,
  outcomeFeedbackTone,
  preparedDraftActionLabel,
  preparedDraftClassLabel,
  preparedDraftDestinationForItem,
  preparedDraftDestinationForItems,
  preparedDraftOutcomeFeedbackForItem,
  preparedDraftHeading,
  preparedDraftIntro,
  latestFieldEngineSummaryFromMessages,
  priorityRationaleSummary,
  provenanceCueSummary,
  resolveContextItemNavigationTarget,
  resolveContextItemTargetLabel,
  resolveContextPackNavigationTarget,
  resolveContinuityNavigationTarget,
  resolveResponseNavigationTarget,
  resolveContinuityTargetLabel,
  responseItemPreparedDraftAnchorLabels,
  responseItemPreparedDraftAnchorSummary,
  responseItemPreparedDraftDisplayedSummaryLines,
  responseItemPreparedDraftLeadSummary,
  responseItemPreparedDraftScopeCue,
  responseItemOutcomeFeedbackForItem,
  responseItemPreparedDraftSupportingSummaryLines,
  sourceCountSummary,
  summarizeReferenceLabels,
  visibleStateFields,
} from '../dist/continuity.js';

test('resolveContinuityTargetLabel prefers linked_target_label first', () => {
  const label = resolveContinuityTargetLabel({
    linked_target_label: 'Aurora rollout thread',
    reference_labels: ['Fallback label'],
    reference_refs: ['thread:aurora'],
  });

  assert.equal(label, 'Aurora rollout thread');
});

test('resolveContinuityTargetLabel resolves message title from loaded messages', () => {
  const label = resolveContinuityTargetLabel({
    reference_refs: ['message:msg_123'],
    messages: [
      {
        id: 'msg_123',
        thread_id: 'thread_aurora',
        content: { title: 'Vendor renewal memo' },
      },
    ],
  });

  assert.equal(label, 'Vendor renewal memo');
});

test('resolveContinuityTargetLabel resolves thread title from summaries', () => {
  const label = resolveContinuityTargetLabel({
    source_refs: ['thread:aurora-rollout'],
    thread_summaries: [{ thread_id: 'aurora-rollout', title: 'Aurora rollout thread' }],
  });

  assert.equal(label, 'Aurora rollout thread');
});

test('resolveContinuityTargetLabel humanizes unresolved reference refs', () => {
  const label = resolveContinuityTargetLabel({
    reference_refs: ['thread:project_aurora'],
  });

  assert.equal(label, 'Thread: project aurora');
});

test('resolveContinuityTargetLabel prefers file labels and humanizes file refs', () => {
  assert.equal(
    resolveContinuityTargetLabel({
      file_labels: ['launch-brief.md'],
      file_refs: ['file:docs/launch-brief.md'],
    }),
    'launch-brief.md',
  );
  assert.equal(
    resolveContinuityTargetLabel({
      file_refs: ['file:docs/launch-brief.md'],
    }),
    'launch-brief.md',
  );
});

test('resolveContextItemNavigationTarget prefers thread refs over message refs', () => {
  const target = resolveContextItemNavigationTarget({
    sourceRefs: ['message:msg_123', 'thread:aurora-rollout'],
  });

  assert.deepEqual(target, { view: 'threads', threadId: 'aurora-rollout' });
});

test('resolveContextItemTargetLabel matches the chosen thread target', () => {
  const label = resolveContextItemTargetLabel({
    sourceRefs: ['message:msg_123', 'thread:aurora-rollout'],
  });

  assert.equal(label, 'Thread: aurora rollout');
});

test('summarizeReferenceLabels prefers explicit labels and truncates by limit', () => {
  const summary = summarizeReferenceLabels({
    reference_labels: ['Aurora rollout', 'Budget review', 'Vendor follow-up'],
    reference_refs: ['thread:aurora', 'thread:budget'],
    limit: 2,
  });

  assert.equal(summary, 'Linked objects: Aurora rollout, Budget review, ...');
});

test('summarizeReferenceLabels falls back to refs when labels are absent', () => {
  const summary = summarizeReferenceLabels({
    reference_refs: ['thread:aurora', 'message:msg_123'],
    limit: 2,
  });

  assert.equal(summary, 'Linked objects: thread:aurora, message:msg_123.');
});

test('sourceCountSummary pluralizes source counts', () => {
  assert.equal(sourceCountSummary(['a']), 'Based on 1 source');
  assert.equal(sourceCountSummary(['a', 'b']), 'Based on 2 sources');
  assert.equal(sourceCountSummary([]), null);
});

test('prepared draft lead summary prefers structured draft identity over generic continuity lead', () => {
  const input = {
    prepared_draft_lead_summary:
      'Surfaced around linked object focus on project aurora. Approval remains in the loop.',
    prepared_draft_summary_lines: [
      'Surfaced around linked object focus on project aurora. Approval remains in the loop.',
      'Draft: Reply draft for Customer demo',
      'Confirm the next meeting time and attach the agenda draft.',
      'Next action: Review and send email reply',
    ],
    prepared_draft_summary: 'Prepared an email reply draft for review.',
  };

  assert.equal(
    responseItemPreparedDraftLeadSummary(input),
    'Draft: Reply draft for Customer demo',
  );
  assert.deepEqual(responseItemPreparedDraftSupportingSummaryLines(input), [
    'Surfaced around linked object focus on project aurora. Approval remains in the loop.',
    'Confirm the next meeting time and attach the agenda draft.',
    'Next action: Review and send email reply',
  ]);
  assert.deepEqual(responseItemPreparedDraftDisplayedSummaryLines(input), [
    'Draft: Reply draft for Customer demo',
    'Surfaced around linked object focus on project aurora. Approval remains in the loop.',
    'Confirm the next meeting time and attach the agenda draft.',
    'Next action: Review and send email reply',
  ]);
});

test('artifact summary helpers prefer structured draft identity over generic scope context', () => {
  const lines = [
    'Scope: family coordination',
    'Draft: Reply draft for Parent teacher follow-up',
    'Next action: Review and send email reply',
    'Summary: Confirms Friday pickup timing.',
  ];

  assert.equal(
    artifactSummaryLeadLine({
      artifact_summary_lines: lines,
      description: 'Generic draft description.',
    }),
    'Draft: Reply draft for Parent teacher follow-up',
  );
  assert.deepEqual(
    artifactSummarySupportingLines({
      artifact_summary_lines: lines,
      description: 'Generic draft description.',
    }),
    [
      'Scope: family coordination',
      'Next action: Review and send email reply',
      'Summary: Confirms Friday pickup timing.',
    ],
  );
  assert.deepEqual(
    artifactSummaryDisplayedLines({
      artifact_summary_lines: lines,
      description: 'Generic draft description.',
    }),
    [
      'Draft: Reply draft for Parent teacher follow-up',
      'Scope: family coordination',
      'Next action: Review and send email reply',
      'Summary: Confirms Friday pickup timing.',
    ],
  );
  assert.equal(
    artifactSummaryScopeCue({
      artifact_summary_lines: lines,
      description: 'Generic draft description.',
    }),
    'family coordination',
  );
});

test('prepared draft scope cue reads from displayed lead and supporting summary lines', () => {
  assert.equal(
    responseItemPreparedDraftScopeCue({
      prepared_draft_lead_summary:
        'Surfaced around linked object focus on school coordination.',
      prepared_draft_summary_lines: [
        'Surfaced around linked object focus on school coordination.',
        'Draft: Reply draft for Parent teacher follow-up',
        'Scope: Family coordination',
        'Next action: Review and send email reply',
      ],
      prepared_draft_summary: 'Generic prepared draft summary.',
    }),
    'Family coordination',
  );
});

test('approval draft preview helpers normalize structured separators into lines and summary text', () => {
  const preview = {
    content:
      'Draft: Reply draft for Parent teacher follow-up | Next action: Review and send email reply | Summary: Confirms Friday pickup timing.',
    content_type: 'text',
  };

  assert.deepEqual(approvalDraftPreviewLines(preview), [
    'Draft: Reply draft for Parent teacher follow-up',
    'Next action: Review and send email reply',
    'Summary: Confirms Friday pickup timing.',
  ]);
  assert.equal(
    approvalDraftPreviewSummary({ draft_preview: preview }),
    'Draft: Reply draft for Parent teacher follow-up Next action: Review and send email reply Summary: Confirms Friday pickup timing.',
  );
});

test('approval draft preview helpers still normalize legacy encoded bullet separators', () => {
  const preview = {
    content:
      'Merchant: Luna Cafe ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ Amount: $12.40 ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ Artifact path: receipts/luna-cafe.json',
    content_type: 'text',
  };

  assert.deepEqual(approvalDraftPreviewLines(preview), [
    'Merchant: Luna Cafe',
    'Amount: $12.40',
    'Artifact path: receipts/luna-cafe.json',
  ]);
});

test('artifact summary helpers fall back to approval draft preview lines when explicit artifact lines are absent', () => {
  const preview = {
    content:
      'Draft: Reply draft for Customer demo | Next action: Review and send email reply | Artifact path: .skillcapsule/email/reply.md',
    content_type: 'text',
  };

  assert.equal(
    artifactSummaryLeadLine({
      draft_preview: preview,
      description: 'Bounded simulator projection found an approval-gated path.',
    }),
    'Draft: Reply draft for Customer demo',
  );
  assert.deepEqual(
    artifactSummarySupportingLines({
      draft_preview: preview,
      description: 'Bounded simulator projection found an approval-gated path.',
    }),
    [
      'Next action: Review and send email reply',
      'Artifact path: .skillcapsule/email/reply.md',
    ],
  );
  assert.deepEqual(
    artifactSummaryDisplayedLines({
      draft_preview: preview,
      description: 'Bounded simulator projection found an approval-gated path.',
    }),
    [
      'Draft: Reply draft for Customer demo',
      'Next action: Review and send email reply',
      'Artifact path: .skillcapsule/email/reply.md',
    ],
  );
});

test('approval draft preview summary compacts code previews with truncation', () => {
  const preview = {
    content: 'x'.repeat(120),
    content_type: 'code',
  };

  const summary = approvalDraftPreviewSummary({ draft_preview: preview });
  assert.equal(summary?.length, 96);
  assert.ok(summary?.endsWith('...'));
});

test('latestFieldEngineSummaryFromMessages prefers direct metadata summary', () => {
  const summary = latestFieldEngineSummaryFromMessages([
    {
      id: 'msg_1',
      thread_id: 'thread_1',
      type: 'state_snapshot',
      metadata: {
        field_engine_summary: {
          summary: 'Knowledge field shows active pressure with density 0.62 and momentum -0.16.',
        },
      },
    },
  ]);

  assert.equal(
    summary,
    'Knowledge field shows active pressure with density 0.62 and momentum -0.16.',
  );
});

test('latestFieldEngineSummaryFromMessages falls back to synthesizer handoff summary', () => {
  const summary = latestFieldEngineSummaryFromMessages([
    {
      id: 'msg_2',
      thread_id: 'thread_2',
      type: 'state_synthesis',
      metadata: {
        synthesizer_handoff: {
          field_engine_summary:
            'Goal field shows active pressure with density 0.58 and momentum 0.21.',
        },
      },
    },
  ]);

  assert.equal(
    summary,
    'Goal field shows active pressure with density 0.58 and momentum 0.21.',
  );
});

test('latestFieldEnginePrimaryTypeFromMessages prefers direct metadata type', () => {
  const primaryType = latestFieldEnginePrimaryTypeFromMessages([
    {
      id: 'msg_1',
      thread_id: 'thread_1',
      type: 'state_snapshot',
      metadata: {
        field_engine_summary: {
          primary_field_type: 'attention',
          summary: 'Attention field shows active pressure with density 0.68 and momentum -0.29.',
        },
      },
    },
  ]);

  assert.equal(primaryType, 'attention');
});

test('latestFieldEnginePrimaryTypeFromMessages falls back to synthesizer handoff type', () => {
  const primaryType = latestFieldEnginePrimaryTypeFromMessages([
    {
      id: 'msg_2',
      thread_id: 'thread_2',
      type: 'state_synthesis',
      metadata: {
        synthesizer_handoff: {
          field_engine_primary_type: 'knowledge',
        },
      },
    },
  ]);

  assert.equal(primaryType, 'knowledge');
});

test('fieldEngineFamilyLabel humanizes known field families', () => {
  assert.equal(fieldEngineFamilyLabel('attention'), 'Attention pressure');
  assert.equal(fieldEngineFamilyLabel('interest'), 'Interest pressure');
  assert.equal(fieldEngineFamilyLabel('obligation'), 'Obligation pressure');
  assert.equal(fieldEngineFamilyLabel('relationship'), 'Relationship pressure');
  assert.equal(fieldEngineFamilyLabel('project'), 'Project pressure');
  assert.equal(fieldEngineFamilyLabel('goal'), 'Goal pressure');
  assert.equal(fieldEngineFamilyLabel('opportunity'), 'Opportunity pressure');
  assert.equal(fieldEngineFamilyLabel('knowledge'), 'Knowledge pressure');
  assert.equal(fieldEngineFamilyLabel('decision'), 'Decision pressure');
  assert.equal(fieldEngineFamilyLabel('unknown'), null);
});

test('approval review helpers summarize approval kind and autonomy rationale', () => {
    assert.equal(approvalDecisionLabel('approved'), 'Approve');
    assert.equal(approvalDecisionLabel('rejected'), 'Reject');
    assert.equal(
      approvalDecisionLabel('approved', 'export_generation'),
      'Approve & generate',
    );
    assert.equal(
      approvalDecisionLabel('approved', 'outbound_send'),
      'Approve & send',
    );
    assert.equal(
      approvalDecisionLabel('approved', 'change_proposal'),
      'Apply changes',
    );
    assert.equal(
      approvalDecisionLabel('approved', 'change_set'),
      'Apply selected edits',
    );
    assert.equal(
      approvalDecisionActionTitle('rejected'),
      'Reject and stop this work before it continues.',
    );
    assert.equal(
      approvalDecisionActionTitle('approved', 'export_generation'),
      'Approve and generate this export file.',
    );
    assert.equal(
      approvalDecisionActionTitle('approved', 'outbound_send'),
      'Approve and send this message.',
    );
    assert.equal(
      approvalDecisionActionTitle('approved', 'change_proposal'),
      'Apply this proposed change to your workspace.',
    );
    assert.equal(
      approvalDecisionActionTitle('approved', 'change_set'),
      'Apply the selected coordinated edits to your workspace.',
    );
    assert.equal(approvalPendingStatusLabel(), 'Awaiting your approval');
    assert.equal(approvalPendingCountSummary(1), '1 task awaiting your approval');
    assert.equal(approvalPendingCountSummary(3), '3 tasks awaiting your approval');
    assert.equal(
      approvalPendingCountSummary(2, 'approval'),
      '2 approvals awaiting your approval',
    );
    assert.equal(approvalRequestTitle(), 'Approval required');
    assert.equal(
      approvalRequestTitle('shell_command'),
      'Shell command requires your approval',
    );
    assert.equal(
      approvalContinuationSummary('branch'),
      'Approval required before this branch can continue.',
    );
    assert.equal(
      approvalContinuationSummary(),
      'Approval required before this work can continue.',
    );
    assert.equal(approvalRequiredStatusLabel(), 'Needs approval');
    assert.equal(approvalEventLabel('request'), 'Awaiting approval');
    assert.equal(approvalEventLabel('approved'), 'Approval granted');
    assert.equal(approvalEventLabel('rejected'), 'Approval rejected');
    assert.equal(approvalModeLabel('autonomous'), 'Autonomous');
    assert.equal(approvalModeLabel('suggest_only'), 'Suggest only');
    assert.equal(approvalModeLabel('human_approval_required'), 'Requires approval');
    assert.equal(approvalModeLabel('custom_mode'), 'custom mode');
    assert.equal(approvalStatusLabel('approved'), 'Approved');
    assert.equal(approvalStatusLabel('rejected'), 'Rejected');
    assert.equal(approvalStatusLabel('pending'), 'Pending');
    assert.equal(approvalStatusLabel('awaiting_approval'), 'awaiting approval');
    assert.equal(approvalOptionLabel('approved'), 'Approve');
    assert.equal(approvalOptionLabel('rejected'), 'Reject');
    assert.equal(approvalOptionLabel('use_cached_result'), 'use cached result');
    assert.equal(
      approvalOptionActionTitle('approved'),
      'Approve and let this work continue.',
    );
    assert.equal(approvalOptionActionTitle('use_cached_result'), undefined);
    assert.equal(
      approvalDecisionResultSummary({ decision: 'approved', context: 'queued_execution' }),
      'Approved and queued for execution.',
  );
  assert.equal(
    approvalDecisionResultSummary({ decision: 'approved', context: 'outbound_send' }),
    'Approved and sent on your behalf.',
  );
  assert.equal(
    approvalDecisionResultSummary({ decision: 'approved', context: 'export_generation' }),
    'Approved and generated the export file.',
  );
  assert.equal(
    approvalDecisionResultSummary({ decision: 'approved', context: 'change_proposal' }),
    'Applied the proposed change to your workspace.',
  );
  assert.equal(
    approvalDecisionResultSummary({ decision: 'approved', context: 'change_set' }),
    'Applied the selected edits to your workspace.',
  );
  assert.equal(
    approvalDecisionResultSummary({ decision: 'rejected', context: 'shell_command' }),
    'Command rejected. The agent will stop and report back.',
  );
  assert.equal(
    approvalDecisionResultSummary({ decision: 'rejected', context: 'outbound_send' }),
    'Send rejected. The draft is kept for your review.',
  );
  assert.equal(
    approvalDecisionResultSummary({ decision: 'rejected', context: 'export_generation' }),
    'Export rejected. Nothing was generated.',
  );
  assert.equal(
    approvalDecisionResultSummary({ decision: 'rejected', context: 'change_proposal' }),
    'Change rejected. Nothing was applied.',
  );
  assert.equal(
    approvalDecisionResultSummary({ decision: 'rejected', context: 'change_set' }),
    'Change set rejected. Nothing was applied.',
  );
  assert.equal(approvalReviewKindLabel('destructive'), 'Destructive approval');
  assert.equal(
    autonomyDecisionSummary({
      autonomy_level: 'request_approval',
      reason: 'Workflow approval decision was recorded at an explicit approval boundary.',
    }),
    'Approval boundary: Workflow approval decision was recorded at an explicit approval boundary.',
  );
  assert.deepEqual(
    approvalReviewDetailLines({
      approvalReview: {
        reason: 'This action modifies system state.',
        provenance_summary: 'Requested from the shell command queue.',
        source_refs: ['thread:aurora', 'message:msg_1'],
        consequence_summary_lines: ['Files may be changed immediately.'],
      },
      autonomyDecision: {
        autonomy_level: 'request_approval',
        reason: 'The action crosses a destructive boundary.',
      },
    }),
    [
      'This action modifies system state.',
      'Requested from the shell command queue.',
      'Based on 2 sources',
      'Files may be changed immediately.',
      'Approval boundary: The action crosses a destructive boundary.',
    ],
  );
  assert.equal(
    approvalReviewTrustSummary({
      source_refs: ['thread:aurora', 'message:msg_1'],
      provenance_summary: 'Requested from the shell command queue.',
      consequence_summary_lines: ['Files may be changed immediately.'],
    }),
    'Based on 2 sources Requested from the shell command queue. Files may be changed immediately.',
  );
});

test('autonomy decision summary normalizes the fuller autonomy ladder and legacy action autonomy', () => {
  assert.equal(
    autonomyDecisionSummary({
      autonomy_level: 'observe_only',
      reason: 'Monitor this state without preparing or surfacing work yet.',
    }),
    'observe only: Monitor this state without preparing or surfacing work yet.',
  );
  assert.equal(
    autonomyDecisionSummary({
      autonomy_level: 'draft_silently',
      reason: 'Quietly draft the next step before any interruption.',
    }),
    'draft silently: Quietly draft the next step before any interruption.',
  );
  assert.equal(
    autonomyDecisionSummary({
      autonomy_level: 'execute_reversible',
      reason: 'This stays inside a reversible execution pathway.',
    }),
    'execute reversible: This stays inside a reversible execution pathway.',
  );
  assert.equal(
    autonomyDecisionSummary({
      action_autonomy: 'hard_confirm',
      reason: 'Legacy action autonomy still maps to the approval boundary.',
    }),
    'Approval boundary: Legacy action autonomy still maps to the approval boundary.',
  );
  assert.equal(
    autonomyDecisionSummary({
      action_autonomy: 'soft_confirm',
      reason: 'Legacy soft confirmation stays reversible.',
    }),
    'execute reversible: Legacy soft confirmation stays reversible.',
  );
});

test('evidenceKindsSummary humanizes up to three evidence kinds', () => {
  assert.equal(
    evidenceKindsSummary(['same_project', 'same_follow_up_chain', 'file_context', 'other']),
    'Evidence spans same project, same follow up chain, file context.',
  );
  assert.equal(evidenceKindsSummary([]), null);
});

test('provenanceCueSummary explains grouped continuity evidence and source-backed drafts', () => {
  assert.equal(
    provenanceCueSummary({
      kind: 'context_pack',
      pack_kind: 'topic_pack',
      source_refs: ['thread:aurora'],
      evidence_kinds: ['same_project'],
    }),
    'Traceable to grouped continuity evidence in append-only artifacts.',
  );
  assert.equal(
    provenanceCueSummary({
      draft_class: 'communication_reply',
      source_refs: ['thread:aurora'],
    }),
    'Traceable to the continuity artifacts used to prepare this draft.',
  );
});

test('consequencePreviewSummary explains review-first and context-only paths', () => {
  assert.equal(
    consequencePreviewSummary({ kind: 'context_pack', pack_kind: 'topic_pack' }),
    'Opening this reveals grouped context only; it does not trigger an external action.',
  );
  assert.equal(
    consequencePreviewSummary({ requires_approval: true }),
    'Acting now opens a review step first; no external action runs without approval.',
  );
});

test('priorityRationaleSummary explains approval, linked-object, and prepared-reply pressure', () => {
  assert.equal(
    priorityRationaleSummary({ requires_approval: true }),
    'Prioritized because it crosses an approval boundary.',
  );
  assert.equal(
    priorityRationaleSummary({
      kind: 'context_pack',
      pack_kind: 'topic_pack',
      reference_refs: ['thread:aurora'],
    }),
    'Prioritized because linked objects reinforce the same active topic.',
  );
  assert.equal(
    priorityRationaleSummary({
      draft_class: 'communication_reply',
      readiness: 'ready_now',
      response_due_hint: 'today',
    }),
    'Prioritized because a reply is due soon and already prepared.',
  );
});

test('prepared draft helpers summarize class, action, heading, and intro', () => {
  assert.equal(preparedDraftClassLabel('communication_reply'), 'reply draft');
  assert.equal(
    preparedDraftDestinationForItem({ draft_class: 'communication_reply' }),
    'response_queue',
  );
  assert.equal(
    preparedDraftDestinationForItems([{ draft_class: 'comparison_table' }]),
    'decision_queue',
  );
  assert.equal(
    preparedDraftActionLabel([{ draft_class: 'communication_reply' }]),
    'Open responses',
  );
  assert.equal(
    preparedDraftHeading([{ draft_class: 'comparison_table' }]),
    'Prepared decision support ready for review',
  );
  assert.equal(
    preparedDraftIntro([{ draft_class: 'comparison_table' }]),
    'Quietly prepared from current continuity state to reduce judgment overhead before interruption.',
  );
});

test('outcome feedback helpers summarize label, tone, and detail', () => {
  const feedback = {
    status: 'cooldown_recommended',
    scope: 'family',
    acceptance_rate: 0.32,
  };
  assert.equal(outcomeFeedbackLabel(feedback), 'family cooldown');
  assert.equal(
    outcomeFeedbackTone(feedback),
    'border-amber-300/40 bg-amber-50/85 text-amber-800',
  );
  assert.equal(
    outcomeFeedbackDetail(feedback),
    'Similar variants were often dismissed (32% acceptance), so this is surfaced more cautiously.',
  );
});

test('prepared draft feedback helpers resolve family-matched outcome feedback', () => {
  const suggestions = [
    {
      kind: 'prepared_draft',
      heuristic_family_id: 'reply',
      outcome_feedback: { status: 'trusted' },
    },
  ];

  assert.deepEqual(
    preparedDraftOutcomeFeedbackForItem({ id: 'prepared_draft:reply_1' }, suggestions),
    { status: 'trusted' },
  );
  assert.deepEqual(
    responseItemOutcomeFeedbackForItem(
      { prepared_draft_available: true, prepared_draft_id: 'prepared_draft:reply_2' },
      suggestions,
    ),
    { status: 'trusted' },
  );
  assert.equal(
    responseItemOutcomeFeedbackForItem(
      { prepared_draft_available: false, prepared_draft_id: 'prepared_draft:reply_2' },
      suggestions,
    ),
    undefined,
  );
});


test('continuity navigation helpers resolve thread and context-pack targets', () => {
  assert.deepEqual(
    resolveContinuityNavigationTarget(
      { requires_approval: true, source_refs: ['thread:aurora', 'message:msg_1'] },
      [],
    ),
    { view: 'threads', threadId: 'aurora' },
  );
  assert.deepEqual(
    resolveResponseNavigationTarget([
      { urgency: 'urgent', source_refs: ['message:msg_2', 'thread:beta'] },
    ]),
    { view: 'threads', threadId: 'beta' },
  );
  assert.deepEqual(
    resolveContextPackNavigationTarget({
      reference_refs: ['thread:gamma'],
      source_refs: ['message:msg_3'],
    }),
    { view: 'threads', threadId: 'gamma' },
  );
});

test('contextPackObjectSearchTarget prefers object, reference, and file anchors in order', () => {
  assert.deepEqual(
    contextPackObjectSearchTarget({
      object_refs: ['obj_1'],
      reference_refs: ['thread:aurora'],
      file_refs: ['file:docs/launch-brief.md'],
    }),
    {
      query: 'target:obj_1',
      focusObjectId: 'obj_1',
    },
  );
  assert.deepEqual(
    contextPackObjectSearchTarget({
      reference_refs: ['thread:aurora'],
      file_refs: ['file:docs/launch-brief.md'],
    }),
    {
      query: 'target:thread:aurora',
      focusObjectId: 'thread:aurora',
    },
  );
  assert.deepEqual(
    contextPackObjectSearchTarget({
      file_refs: ['file:docs/launch-brief.md'],
    }),
    {
      query: 'target:file:docs/launch-brief.md',
      focusObjectId: 'file:docs/launch-brief.md',
    },
  );
  assert.deepEqual(
    contextPackObjectSearchTarget({
      pack_kind: 'obligation_pack',
    }),
    {
      query: 'kind:task',
    },
  );
});

test('responseItemPreparedDraftAnchorLabels combines object and file anchors from summary lines', () => {
  assert.deepEqual(
    responseItemPreparedDraftAnchorLabels({
      prepared_draft_object_labels: ['Vendor contract'],
      prepared_draft_summary_lines: [
        'Object anchors: Vendor contract.',
        'File anchors: launch-brief.md, launch-plan.md.',
      ],
    }),
    ['Vendor contract', 'launch-brief.md', 'launch-plan.md'],
  );
});

test('responseItemPreparedDraftAnchorSummary builds a bounded shared anchor line', () => {
  assert.equal(
    responseItemPreparedDraftAnchorSummary({
      prepared_draft_object_labels: ['Vendor contract'],
      prepared_draft_summary_lines: [
        'File anchors: launch-brief.md, launch-plan.md.',
      ],
      prefix: 'Anchors',
      limit: 2,
    }),
    'Anchors: Vendor contract, launch-brief.md.',
  );
});

test('continuity decision identity helpers expose stable synthetic ids', () => {
  assert.equal(CONTINUITY_PRIORITY_DECISION_ID, 'continuity-priority-card');
  assert.equal(CONTINUITY_ACTION_DECISION_PREFIX, 'continuity-action:');
  assert.equal(decisionIdFromActionItem({ id: 'act_1' }), 'continuity-action:act_1');
  assert.equal(isContinuitySyntheticDecisionId('continuity-priority-card'), true);
  assert.equal(isContinuitySyntheticDecisionId('continuity-action:act_1'), true);
  assert.equal(isContinuitySyntheticDecisionId('other'), false);
});

test('visibleStateFields keeps active and monitor entries only', () => {
  const visible = visibleStateFields([
    { id: 'a', status: 'active' },
    { id: 'b', status: 'monitor' },
    { id: 'c', status: 'inactive' },
  ]);
  assert.deepEqual(visible, [
    { id: 'a', status: 'active' },
    { id: 'b', status: 'monitor' },
  ]);
});

test('visibleStateFields prefers approval and decision lanes over array order', () => {
  const visible = visibleStateFields([
    {
      id: 'scope',
      field_key: 'project_scope_drift',
      status: 'active',
      surface_hint: 'context_panel',
      evidence_refs: ['msg_1'],
    },
    {
      id: 'approval',
      field_key: 'approval_required_work',
      status: 'active',
      surface_hint: 'decision_queue',
      evidence_refs: ['msg_2', 'msg_3'],
    },
    {
      id: 'followup',
      field_key: 'follow_up_pressure',
      status: 'active',
      surface_hint: 'response_queue',
      evidence_refs: ['msg_4'],
    },
  ]);
  assert.deepEqual(
    visible.map((item) => item.id),
    ['approval', 'followup', 'scope'],
  );
});

test('visibleStateFields prefers active fields over monitor fields', () => {
  const visible = visibleStateFields([
    {
      id: 'monitor-decision',
      field_key: 'unresolved_decisions',
      status: 'monitor',
      surface_hint: 'decision_queue',
      evidence_refs: ['msg_1'],
    },
    {
      id: 'active-followup',
      field_key: 'follow_up_pressure',
      status: 'active',
      surface_hint: 'response_queue',
      evidence_refs: ['msg_2', 'msg_3'],
    },
  ]);
  assert.deepEqual(
    visible.map((item) => item.id),
    ['active-followup', 'monitor-decision'],
  );
});

test('continuity decision builders produce stable priority and action decisions', () => {
  const priority = decisionFromPriorityCard({
      title: 'Review Aurora',
      description: 'Approval required for Aurora rollout.',
      panel_kind: 'context_panel',
      requires_approval: true,
      action_label: 'Open context',
      surface_hint: 'context_panel',
      confidence: 'high',
      source_refs: ['thread:aurora-thread'],
    });
  assert.equal(priority.id, CONTINUITY_PRIORITY_DECISION_ID);
  assert.equal(priority.whyBullets[2]?.text, 'Open threads');
  assert.equal(priority.options[0]?.label, 'Open threads');
  assert.equal(priority.options[0]?.detail, 'threads');

  const fallbackPriority = decisionFromPriorityCard({
    title: 'Review Beta',
    description: 'Queue review is ready.',
    panel_kind: 'decision_queue',
    requires_approval: false,
    action_label: 'Open queue',
    surface_hint: 'invalid_lane',
    confidence: 'medium',
    source_refs: ['calendar:review-beta'],
  });
  assert.equal(fallbackPriority.whyBullets[2]?.text, 'Open calendar');
  assert.equal(fallbackPriority.options[0]?.label, 'Open calendar');
  assert.equal(fallbackPriority.options[0]?.detail, 'calendar');

  const invalidPriority = decisionFromPriorityCard({
    title: 'Review Gamma',
    description: 'Unknown route hint should fail closed.',
    panel_kind: 'invalid_panel',
    requires_approval: false,
    action_label: 'Open route',
    surface_hint: 'invalid_lane',
    confidence: 'low',
  });
  assert.equal(invalidPriority.whyBullets[1]?.text, 'Open threads');
  assert.equal(invalidPriority.options[0]?.label, 'Open threads');
  assert.equal(invalidPriority.options[0]?.detail, 'threads');

  const action = decisionFromActionItem({
    id: 'act_1',
    title: 'Send update',
    category: 'follow_up',
    urgency: 'today',
    confidence: 'medium',
    requires_approval: false,
    suggested_action: 'Send stakeholder update',
    source_refs: ['thread:aurora'],
  });
  assert.equal(action.id, 'continuity-action:act_1');
  assert.equal(action.urgency, 'high');
  assert.equal(action.options[0]?.label, 'Send stakeholder update');
  assert.equal(action.options[1]?.label, 'Review later');

  const responseAction = decisionFromActionItem({
    id: 'act_2',
    title: 'Reply to team',
    category: 'response',
    urgency: 'urgent',
    confidence: 'high',
    requires_approval: false,
    suggested_action: 'Review reply draft',
    surface_hint: 'response_queue',
    source_refs: ['thread:reply-thread'],
  });
  assert.equal(responseAction.options[0]?.label, 'Open responses');
  assert.equal(responseAction.options[1]?.label, 'Keep in response queue');

  const approvalAction = decisionFromActionItem({
    id: 'act_3',
    title: 'Approve vendor send',
    category: 'approval',
    urgency: 'urgent',
    confidence: 'high',
    requires_approval: true,
    suggested_action: 'Review approval package',
    surface_hint: 'decision_queue',
    source_refs: ['thread:approval-thread'],
  });
  assert.equal(approvalAction.options[0]?.label, 'Open approval queue');
  assert.equal(approvalAction.options[1]?.label, 'Keep in approval queue');
});
