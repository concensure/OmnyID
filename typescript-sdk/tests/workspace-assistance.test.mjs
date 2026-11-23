import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildWorkspaceAssistCandidatesFromDashboard,
} from '../dist/workspace-assistance.js';

test('workspace assist response drafts prefer structured lead and supporting summary lines', () => {
  const candidates = buildWorkspaceAssistCandidatesFromDashboard({
    continuity_response_items: [
      {
        title: 'Parent teacher thread',
        prepared_draft_available: true,
        prepared_draft_summary: 'Generic reply draft summary.',
        prepared_draft_lead_summary:
          'Surfaced around linked object focus on school coordination.',
        prepared_draft_summary_lines: [
          'Surfaced around linked object focus on school coordination.',
          'Draft: Reply draft for Parent teacher follow-up',
          'Next action: Review and send email reply',
          'Summary: Confirms Friday pickup timing.',
        ],
        prepared_draft_selection_reason: 'Needs a same-day parent reply.',
        prepared_draft_object_labels: ['School calendar'],
        response_due_hint: 'today',
        source_refs: ['thread:parent-teacher'],
      },
    ],
  });

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].artifact_kind, 'response_draft');
  assert.equal(candidates[0].summary, 'Draft: Reply draft for Parent teacher follow-up');
  assert.deepEqual(candidates[0].detail_lines, [
    'Surfaced around linked object focus on school coordination.',
    'Next action: Review and send email reply',
    'Summary: Confirms Friday pickup timing.',
  ]);
});
