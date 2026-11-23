import test from 'node:test';
import assert from 'node:assert/strict';

import {
  describeWorkflowTerminationContract,
  expandWorkflowIntent,
  presetDefaultTriggerConfig,
  presetStarterBlueprintsForPreset,
  templateForPreset,
} from '../dist/workflows.js';

test('calendar coordinator uses the runtime-supported appointment trigger by default', () => {
  const trigger = presetDefaultTriggerConfig('calendar_coordinator');

  assert.deepEqual(trigger, {
    trigger_family: 'event',
    trigger_kind: 'internal_event',
    event_source: 'calendar',
    event_type: 'appointment_approaching',
  });
});

test('email guardian terminates as a reviewable reply draft', () => {
  const starter = presetStarterBlueprintsForPreset('email_guardian');
  const finalNode = starter.at(-1);

  assert.equal(finalNode?.kind, 'termination');
  assert.equal(finalNode?.label, 'Inbox Summary');
  assert.deepEqual(finalNode?.config?.final_schema, {
    workflow: 'email_guardian',
    summary_mode: 'reviewable_reply_draft',
    structured_output_keys: ['reply_draft', 'triage_notes'],
    external_write: false,
  });
});

test('calendar coordinator terminates as a reviewable schedule recommendation', () => {
  const starter = presetStarterBlueprintsForPreset('calendar_coordinator');
  const finalNode = starter.at(-1);

  assert.equal(finalNode?.kind, 'termination');
  assert.equal(finalNode?.label, 'Schedule Summary');
  assert.deepEqual(finalNode?.config?.final_schema, {
    workflow: 'calendar_coordinator',
    summary_mode: 'reviewable_schedule_recommendation',
    structured_output_keys: ['recommended_slot', 'scheduling_notes', 'calendar_context'],
    external_write: false,
  });
});

test('receipt tracker terminates as a reviewable receipt entry', () => {
  const starter = presetStarterBlueprintsForPreset('receipt_tracker');
  const finalNode = starter.at(-1);

  assert.equal(finalNode?.kind, 'termination');
  assert.equal(finalNode?.label, 'Ledger Update Summary');
  assert.deepEqual(finalNode?.config?.final_schema, {
    workflow: 'receipt_tracker',
    summary_mode: 'reviewable_receipt_entry',
    structured_output_keys: ['receipt_entry', 'receipt_notes'],
    external_write: false,
  });
});

test('study planner terminates as a draft study plan summary', () => {
  const starter = presetStarterBlueprintsForPreset('study_planner');
  const finalNode = starter.at(-1);

  assert.equal(finalNode?.kind, 'termination');
  assert.equal(finalNode?.label, 'Study Plan Summary');
  assert.deepEqual(finalNode?.config?.final_schema, {
    workflow: 'study_planner',
    summary_mode: 'draft_study_plan',
    structured_output_keys: ['study_blocks', 'reminders', 'study_input_context', 'calendar_context'],
    external_write: false,
  });
});

test('research assistant terminates as a structured research brief', () => {
  const starter = presetStarterBlueprintsForPreset('research_assistant');
  const finalNode = starter.at(-1);

  assert.equal(finalNode?.kind, 'termination');
  assert.equal(finalNode?.label, 'Research Summary');
  assert.deepEqual(finalNode?.config?.final_schema, {
    workflow: 'research_assistant',
    summary_mode: 'research_brief',
    structured_output_keys: ['research_brief', 'key_findings', 'source_refs'],
    external_write: false,
    include_sources: true,
  });
});

test('finance guardian terminates as a structured finance digest', () => {
  const starter = presetStarterBlueprintsForPreset('finance_guardian');
  const finalNode = starter.at(-1);

  assert.equal(finalNode?.kind, 'termination');
  assert.equal(finalNode?.label, 'Finance Digest');
  assert.deepEqual(finalNode?.config?.final_schema, {
    workflow: 'finance_guardian',
    summary_mode: 'finance_digest',
    structured_output_keys: ['finance_digest', 'anomaly_notes', 'finance_input_context'],
    external_write: false,
  });
});

test('travel booker terminates as a reviewable booking recommendation', () => {
  const starter = presetStarterBlueprintsForPreset('travel_booker');
  const finalNode = starter.at(-1);

  assert.equal(finalNode?.kind, 'termination');
  assert.equal(finalNode?.label, 'Travel Options Summary');
  assert.deepEqual(finalNode?.config?.final_schema, {
    workflow: 'travel_booker',
    summary_mode: 'reviewable_booking_recommendation',
    structured_output_keys: ['booking_recommendation', 'booking_notes'],
    external_write: false,
  });
});

test('content publisher terminates as a reviewable publication draft', () => {
  const starter = presetStarterBlueprintsForPreset('content_publisher');
  const finalNode = starter.at(-1);

  assert.equal(finalNode?.kind, 'termination');
  assert.equal(finalNode?.label, 'Publishing Summary');
  assert.deepEqual(finalNode?.config?.final_schema, {
    workflow: 'content_publisher',
    summary_mode: 'reviewable_publication_draft',
    structured_output_keys: ['publication_draft', 'publication_notes'],
    external_write: false,
    visibility: 'public',
  });
});

test('wedding vendor operator carries guarded live provider policy', () => {
  const starter = presetStarterBlueprintsForPreset('wedding_vendor_operator');
  const agentNode = starter[0];
  const vendorSearchNode = starter.find((node) => node.label === 'Live Vendor Discovery');
  const liveEvidenceNode = starter.find((node) => node.label === 'Map And Weather Evidence');
  const mergeNode = starter.find((node) => node.label === 'Vendor Evidence Merge');
  const approvalNode = starter.find((node) => node.label === 'Vendor Outreach Review');
  const finalNode = starter.at(-1);

  assert.equal(agentNode?.kind, 'agent');
  assert.equal(agentNode?.policy?.approval_mode, 'human_approval_required');
  assert.equal(agentNode?.policy?.max_cost_cents, 150);
  assert.deepEqual(agentNode?.policy?.outbound_allowlist, [
    'brave_search',
    'google_places',
    'google_maps',
    'weatherapi',
    'overpass',
    'gmail',
  ]);
  assert.equal(agentNode?.metadata?.heartbeat_interval_minutes, 60);
  assert.equal(vendorSearchNode?.policy?.max_cost_cents, 80);
  assert.deepEqual(vendorSearchNode?.policy?.outbound_allowlist, ['brave_search', 'google_places', 'overpass']);
  assert.equal(liveEvidenceNode?.metadata?.weather_guardrail, 'planning_evidence_not_day_of_safety_clearance');
  assert.equal(mergeNode?.metadata?.merge_policy, 'append_only_evidence_preserve_user_approvals');
  assert.equal(approvalNode?.policy?.approval_mode, 'human_approval_required');
  assert.deepEqual(approvalNode?.policy?.outbound_allowlist, ['gmail']);
  assert.deepEqual(finalNode?.config?.final_schema, {
    workflow: 'wedding_vendor_operator',
    summary_mode: 'reviewable_vendor_operations_packet',
    structured_output_keys: ['vendor_notes', 'quote_actions', 'blocked_items', 'provider_receipts'],
    external_write: false,
    evidence_required: true,
  });
});

test('calendar coordinator termination contract is described as reviewable output', () => {
  const starter = presetStarterBlueprintsForPreset('calendar_coordinator');
  const finalNode = starter.at(-1);
  const descriptor = describeWorkflowTerminationContract(finalNode?.config ?? {});

  assert.deepEqual(descriptor, {
    output_kind: 'chat_reply',
    workflow: 'calendar_coordinator',
    summary_mode: 'reviewable_schedule_recommendation',
    structured_output_keys: ['recommended_slot', 'scheduling_notes', 'calendar_context'],
    external_write: false,
    headline: 'Reviewable schedule recommendation',
    detail: 'Returns a recommended slot and scheduling notes for review before any external write.',
  });
});

test('email guardian termination contract is described as reviewable reply output', () => {
  const starter = presetStarterBlueprintsForPreset('email_guardian');
  const finalNode = starter.at(-1);
  const descriptor = describeWorkflowTerminationContract(finalNode?.config ?? {});

  assert.deepEqual(descriptor, {
    output_kind: 'chat_reply',
    workflow: 'email_guardian',
    summary_mode: 'reviewable_reply_draft',
    structured_output_keys: ['reply_draft', 'triage_notes'],
    external_write: false,
    headline: 'Reviewable reply draft',
    detail: 'Returns a reply draft and triage notes for review before any external send.',
  });
});

test('receipt tracker termination contract is described as a reviewable receipt entry', () => {
  const starter = presetStarterBlueprintsForPreset('receipt_tracker');
  const finalNode = starter.at(-1);
  const descriptor = describeWorkflowTerminationContract(finalNode?.config ?? {});

  assert.deepEqual(descriptor, {
    output_kind: 'chat_reply',
    workflow: 'receipt_tracker',
    summary_mode: 'reviewable_receipt_entry',
    structured_output_keys: ['receipt_entry', 'receipt_notes'],
    external_write: false,
    headline: 'Reviewable receipt entry',
    detail: 'Returns a categorized receipt entry and posting notes for review before any ledger write.',
  });
});

test('study planner termination contract is described as a draft plan', () => {
  const starter = presetStarterBlueprintsForPreset('study_planner');
  const finalNode = starter.at(-1);
  const descriptor = describeWorkflowTerminationContract(finalNode?.config ?? {});

  assert.deepEqual(descriptor, {
    output_kind: 'chat_reply',
    workflow: 'study_planner',
    summary_mode: 'draft_study_plan',
    structured_output_keys: ['study_blocks', 'reminders', 'study_input_context', 'calendar_context'],
    external_write: false,
    headline: 'Draft study plan',
    detail: 'Returns study blocks, reminders, and pending study-input context as a draft plan for review.',
  });
});

test('research assistant termination contract is described as a research brief', () => {
  const starter = presetStarterBlueprintsForPreset('research_assistant');
  const finalNode = starter.at(-1);
  const descriptor = describeWorkflowTerminationContract(finalNode?.config ?? {});

  assert.deepEqual(descriptor, {
    output_kind: 'chat_reply',
    workflow: 'research_assistant',
    summary_mode: 'research_brief',
    structured_output_keys: ['research_brief', 'key_findings', 'source_refs'],
    external_write: false,
    headline: 'Research brief',
    detail: 'Returns a structured research brief with findings and source references without performing external writes.',
  });
});

test('finance guardian termination contract is described as a finance digest', () => {
  const starter = presetStarterBlueprintsForPreset('finance_guardian');
  const finalNode = starter.at(-1);
  const descriptor = describeWorkflowTerminationContract(finalNode?.config ?? {});

  assert.deepEqual(descriptor, {
    output_kind: 'chat_reply',
    workflow: 'finance_guardian',
    summary_mode: 'finance_digest',
    structured_output_keys: ['finance_digest', 'anomaly_notes', 'finance_input_context'],
    external_write: false,
    headline: 'Finance digest',
    detail: 'Returns transaction trends, anomaly notes, and finance context from the user ledger without performing external writes.',
  });
});

test('travel booker termination contract is described as reviewable booking output', () => {
  const starter = presetStarterBlueprintsForPreset('travel_booker');
  const finalNode = starter.at(-1);
  const descriptor = describeWorkflowTerminationContract(finalNode?.config ?? {});

  assert.deepEqual(descriptor, {
    output_kind: 'chat_reply',
    workflow: 'travel_booker',
    summary_mode: 'reviewable_booking_recommendation',
    structured_output_keys: ['booking_recommendation', 'booking_notes'],
    external_write: false,
    headline: 'Reviewable booking recommendation',
    detail: 'Returns a booking recommendation and review notes before any external confirmation.',
  });
});

test('content publisher termination contract is described as reviewable publication output', () => {
  const starter = presetStarterBlueprintsForPreset('content_publisher');
  const finalNode = starter.at(-1);
  const descriptor = describeWorkflowTerminationContract(finalNode?.config ?? {});

  assert.deepEqual(descriptor, {
    output_kind: 'chat_reply',
    workflow: 'content_publisher',
    summary_mode: 'reviewable_publication_draft',
    structured_output_keys: ['publication_draft', 'publication_notes'],
    external_write: false,
    headline: 'Reviewable publication draft',
    detail: 'Returns a publication draft and release notes for review before any public release.',
  });
});

test('wedding vendor operator is routable and described as a reviewable operations packet', () => {
  const expansion = expandWorkflowIntent('Find wedding vendors, compare florist quotes, and send quote replies after approval');
  const trigger = presetDefaultTriggerConfig('wedding_vendor_operator');
  const mapping = templateForPreset('wedding_vendor_operator');
  const finalNode = presetStarterBlueprintsForPreset('wedding_vendor_operator').at(-1);
  const descriptor = describeWorkflowTerminationContract(finalNode?.config ?? {});

  assert.equal(expansion.preset_kind, 'wedding_vendor_operator');
  assert.equal(expansion.requires_approval, true);
  assert.equal(expansion.needs_research_support, true);
  assert.deepEqual(trigger, {
    trigger_family: 'manual',
    trigger_kind: 'manual',
  });
  assert.equal(mapping?.template_id, 'action_guarded');
  assert.equal(mapping?.metadata?.merge_policy, 'structured_merge_with_human_selected_vendor_decisions');
  assert.deepEqual(descriptor, {
    output_kind: 'chat_reply',
    workflow: 'wedding_vendor_operator',
    summary_mode: 'reviewable_vendor_operations_packet',
    structured_output_keys: ['vendor_notes', 'quote_actions', 'blocked_items', 'provider_receipts'],
    external_write: false,
    headline: 'Reviewable vendor operations packet',
    detail: 'Returns source-backed vendor notes, quote actions, blocked items, and provider receipts before any unapproved vendor contact.',
  });
});

test('generic chart outputs also receive a stable termination contract descriptor', () => {
  const descriptor = describeWorkflowTerminationContract({
    output_kind: 'chart_view',
    final_schema: { chart_family: 'series_visualization' },
  });

  assert.deepEqual(descriptor, {
    output_kind: 'chart_view',
    workflow: undefined,
    summary_mode: undefined,
    structured_output_keys: [],
    external_write: null,
    headline: 'Chart view',
    detail: 'Returns chart-ready output for visual review.',
  });
});
