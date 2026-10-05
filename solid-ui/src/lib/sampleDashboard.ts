// @locs-version: 1.0
import type { AfpMessage, DashboardBootstrap, Session, ThreadSummary } from "@/lib/api";
import { afpRecord } from "@/lib/afpMessageRecord";

const SAMPLE_COVERAGE_KINDS = [
  "email",
  "task",
  "note",
  "calendar_event",
  "database_record",
  "knowledge_card",
  "backlink_update",
  "insight",
] as const;

function isoMinutesAgo(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

function buildMessage(input: {
  id: string;
  threadId: string;
  from: string;
  type: string;
  kind?: string;
  subtype?: string;
  supertags: string[];
  minutesAgo: number;
  content: Record<string, unknown>;
}): AfpMessage {
  return {
    id: input.id,
    thread_id: input.threadId,
    from: input.from,
    to: ["agent:master@omnyid.com"],
    timestamp: isoMinutesAgo(input.minutesAgo),
    type: input.type,
    kind: input.kind ?? input.type,
    subtype: input.subtype ?? null,
    supertags: input.supertags,
    content: input.content,
    metadata: {
      source: "sample_bootstrap",
      is_sample: true,
    },
    views: [],
    attachments: [],
    references: [],
  };
}

function buildThreadSummaries(messages: AfpMessage[]): ThreadSummary[] {
  const grouped = new Map<string, AfpMessage[]>();
  for (const message of messages) {
    const bucket = grouped.get(message.thread_id) ?? [];
    bucket.push(message);
    grouped.set(message.thread_id, bucket);
  }
  return [...grouped.entries()]
    .map(([threadId, threadMessages]) => {
      const ordered = [...threadMessages].sort((left, right) => left.timestamp.localeCompare(right.timestamp));
      const first = ordered[0];
      const last = ordered[ordered.length - 1];
      const firstContent = afpRecord(first.content);
      const lastContent = afpRecord(last.content);
      const title =
        sampleScalarString(firstContent["subject"])
        || sampleScalarString(firstContent["title"])
        || sampleScalarString(firstContent["summary"])
        || sampleScalarString(firstContent["description"])
        || first.type;
      const previewSource =
        sampleScalarString(lastContent["preview"])
        || sampleScalarString(lastContent["body"])
        || sampleScalarString(lastContent["text"])
        || sampleScalarString(lastContent["description"])
        || title;
      return {
        thread_id: threadId,
        title,
        preview: previewSource.slice(0, 120),
        message_count: ordered.length,
        last_message_at: last.timestamp,
        activity_freshness: "active",
        dominant_kind: last.kind ?? first.kind ?? null,
        supertags: [...new Set(ordered.flatMap((message) => message.supertags ?? []))],
        metadata_terms: [],
        score: 1,
      };
    })
    .sort((left, right) => right.last_message_at.localeCompare(left.last_message_at));
}

function sampleScalarString(value: unknown, fallback = ""): string {
  return typeof value === "string" || typeof value === "number" ? String(value) : fallback;
}

function messageCoverageKind(message: AfpMessage): string {
  return String(message.kind ?? message.type ?? "").trim().toLowerCase();
}

function hasConnectedSampleCoverage(messages: AfpMessage[]): boolean {
  if (messages.length === 0) return false;
  const kinds = new Set(messages.map(messageCoverageKind));
  return SAMPLE_COVERAGE_KINDS.every((kind) => kinds.has(kind));
}

function mergeUniqueById<T extends { id: string }>(primary: T[], fallback: T[]): T[] {
  const seen = new Set(primary.map((entry) => entry.id));
  return [
    ...primary,
    ...fallback.filter((entry) => !seen.has(entry.id)),
  ];
}

function mergeUniqueThreadSummaries(primary: ThreadSummary[], fallback: ThreadSummary[]): ThreadSummary[] {
  const seen = new Set(primary.map((entry) => entry.thread_id));
  return [
    ...primary,
    ...fallback.filter((entry) => !seen.has(entry.thread_id)),
  ];
}

function mergeOptionalArray<T extends { id: string }>(primary: T[] | null | undefined, fallback: T[]): T[] {
  return (primary?.length ?? 0) > 0 ? mergeUniqueById(primary ?? [], fallback) : fallback;
}

export function buildSampleDashboardBootstrap(
  user: Session["user"] | null | undefined,
): DashboardBootstrap {
  const resolvedUser = user ?? {
    id: "guest-sample",
    email: "guest@omnyid.local",
    display_name: "Guest",
    auth_provider: "guest",
  };

  const messages: AfpMessage[] = [
    buildMessage({
      id: "sample-email-1",
      threadId: "thread-product-launch",
      from: "alex@northstar-systems.com",
      type: "email",
      kind: "email",
      supertags: ["Launch Ops", "Vendor:Northstar"],
      minutesAgo: 18,
      content: {
        subject: "Northstar onboarding assets due Friday",
        preview: "Supplier confirmed the onboarding deck and pricing sheet will be ready by Friday afternoon.",
        body: "Supplier confirmed the onboarding deck and pricing sheet will be ready by Friday afternoon. They need final approval on the launch narrative by Thursday.",
        sender: "Alex L.",
        sender_detail: "Northstar Systems",
        labels: ["supplier", "launch"],
      },
    }),
    buildMessage({
      id: "sample-task-1",
      threadId: "thread-product-launch",
      from: "agent:master@omnyid.com",
      type: "task",
      kind: "task",
      supertags: ["Launch Ops", "Vendor:Northstar"],
      minutesAgo: 12,
      content: {
        title: "Approve Northstar launch narrative",
        summary: "Approve the final supplier-facing launch narrative before Thursday 4pm.",
        due_date: new Date(Date.now() + 28 * 60 * 60 * 1000).toISOString(),
        priority: "high",
      },
    }),
    buildMessage({
      id: "sample-note-1",
      threadId: "thread-product-launch",
      from: resolvedUser.email,
      type: "note",
      kind: "note",
      supertags: ["Launch Ops", "Vendor:Northstar"],
      minutesAgo: 8,
      content: {
        title: "Launch ops brief",
        preview: "One launch thread now ties supplier approvals, launch assets, and customer messaging into a single operating picture.",
        body: "One launch thread now ties supplier approvals, launch assets, and customer messaging into a single operating picture. The shared supertag connects the note, email, and task views.",
      },
    }),
    buildMessage({
      id: "sample-calendar-1",
      threadId: "thread-product-launch",
      from: "agent:calendar@omnyid.com",
      type: "calendar_event",
      kind: "calendar_event",
      supertags: ["Launch Ops", "Vendor:Northstar"],
      minutesAgo: 4,
      content: {
        title: "Northstar final review",
        summary: "Review supplier launch assets and sign off on customer-facing copy.",
        start_at: new Date(Date.now() + 26 * 60 * 60 * 1000).toISOString(),
        end_at: new Date(Date.now() + 27 * 60 * 60 * 1000).toISOString(),
        location: "Workspace review room",
      },
    }),
    buildMessage({
      id: "sample-email-2",
      threadId: "thread-hiring",
      from: "sarah@talentloop.io",
      type: "email",
      kind: "email",
      supertags: ["Hiring Sprint", "Candidate:Alex"],
      minutesAgo: 42,
      content: {
        subject: "Candidate Alex availability for final interview",
        preview: "Sarah shared three times for the final interview and attached candidate notes.",
        body: "Sarah shared three times for the final interview and attached candidate notes. Strong fit for cross-functional operations leadership.",
        sender: "Sarah M.",
        sender_detail: "TalentLoop",
        labels: ["hiring"],
      },
    }),
    buildMessage({
      id: "sample-note-2",
      threadId: "thread-hiring",
      from: resolvedUser.email,
      type: "note",
      kind: "note",
      supertags: ["Hiring Sprint", "Candidate:Alex"],
      minutesAgo: 33,
      content: {
        title: "Candidate Alex interview notes",
        preview: "Strong systems thinking, calm under pressure, and clear supplier-side experience.",
        body: "Strong systems thinking, calm under pressure, and clear supplier-side experience. Connected to the same hiring supertags as the recruiter email and final interview prep task.",
      },
    }),
    buildMessage({
      id: "sample-task-2",
      threadId: "thread-hiring",
      from: "agent:master@omnyid.com",
      type: "task",
      kind: "task",
      supertags: ["Hiring Sprint", "Candidate:Alex"],
      minutesAgo: 25,
      content: {
        title: "Prepare final interview scorecard",
        summary: "Condense candidate notes into a final interview scorecard with clear hire / no-hire criteria.",
        due_date: new Date(Date.now() + 52 * 60 * 60 * 1000).toISOString(),
        priority: "medium",
      },
    }),
    buildMessage({
      id: "sample-db-1",
      threadId: "thread-database-customers",
      from: resolvedUser.email,
      type: "database_record",
      kind: "database_record",
      supertags: ["Pipeline", "Launch Ops"],
      minutesAgo: 55,
      content: {
        kind: "database_record",
        table: "Launch Accounts",
        data: {
          account: "Northstar Systems",
          status: "Review",
          renewal_date: "2026-07-12",
          owner: "JD",
          notes: "Needs launch narrative approval",
        },
      },
    }),
    buildMessage({
      id: "sample-db-2",
      threadId: "thread-database-customers",
      from: resolvedUser.email,
      type: "database_record",
      kind: "database_record",
      supertags: ["Pipeline", "Hiring Sprint"],
      minutesAgo: 51,
      content: {
        kind: "database_record",
        table: "Hiring Pipeline",
        data: {
          candidate: "Alex M.",
          stage: "Final interview",
          owner: "Sarah",
          score: 9,
          notes: "Ops-heavy role fit",
        },
      },
    }),
    buildMessage({
      id: "sample-knowledge-1",
      threadId: "thread-product-launch",
      from: "agent:curator@omnyid.com",
      type: "knowledge_card",
      kind: "knowledge_card",
      supertags: ["Launch Ops", "Vendor:Northstar"],
      minutesAgo: 6,
      content: {
        title: "Northstar launch dependency",
        summary: "Launch readiness depends on one supplier narrative approval and one final review block shared across email, tasks, notes, and calendar.",
        supertags: ["Launch Ops", "Vendor:Northstar"],
      },
    }),
    buildMessage({
      id: "sample-knowledge-2",
      threadId: "thread-hiring",
      from: "agent:curator@omnyid.com",
      type: "knowledge_card",
      kind: "knowledge_card",
      supertags: ["Hiring Sprint", "Candidate:Alex"],
      minutesAgo: 21,
      content: {
        title: "Candidate Alex decision context",
        summary: "Interview timing, recruiter coordination, and evaluation notes all point to one shared final-hiring decision path.",
        supertags: ["Hiring Sprint", "Candidate:Alex"],
      },
    }),
    buildMessage({
      id: "sample-backlink-1",
      threadId: "thread-product-launch",
      from: "agent:curator@omnyid.com",
      type: "backlink_update",
      kind: "backlink_update",
      supertags: ["Launch Ops", "Vendor:Northstar"],
      minutesAgo: 5,
      content: {
        source_id: "sample-knowledge-1",
        target_id: "sample-note-1",
        target_title: "Launch ops brief",
        relation: "summarizes",
      },
    }),
    buildMessage({
      id: "sample-backlink-2",
      threadId: "thread-product-launch",
      from: "agent:curator@omnyid.com",
      type: "backlink_update",
      kind: "backlink_update",
      supertags: ["Launch Ops", "Vendor:Northstar"],
      minutesAgo: 5,
      content: {
        source_id: "sample-knowledge-1",
        target_id: "sample-task-1",
        target_title: "Approve Northstar launch narrative",
        relation: "depends on",
      },
    }),
    buildMessage({
      id: "sample-backlink-3",
      threadId: "thread-hiring",
      from: "agent:curator@omnyid.com",
      type: "backlink_update",
      kind: "backlink_update",
      supertags: ["Hiring Sprint", "Candidate:Alex"],
      minutesAgo: 20,
      content: {
        source_id: "sample-knowledge-2",
        target_id: "sample-note-2",
        target_title: "Candidate Alex interview notes",
        relation: "grounded by",
      },
    }),
    buildMessage({
      id: "sample-insight-1",
      threadId: "thread-product-launch",
      from: "agent:curator@omnyid.com",
      type: "insight",
      kind: "insight",
      supertags: ["Launch Ops"],
      minutesAgo: 3,
      content: {
        topic: "Launch Ops",
        body: "Supplier approvals and launch preparation are clustering around one thread, so reviewing one object resolves multiple surfaces at once.",
        count: 4,
      },
    }),
    buildMessage({
      id: "sample-email-3",
      threadId: "thread-renewal-risk",
      from: "mia@greenfieldhealth.com",
      type: "email",
      kind: "email",
      supertags: ["Renewal Risk", "Account:Greenfield", "DecisionOS"],
      minutesAgo: 64,
      content: {
        subject: "Greenfield renewal is stalling without executive response",
        preview: "Mia flagged legal, pricing, and rollout concerns and asked for an executive-level response before Friday.",
        body: "Mia flagged legal, pricing, and rollout concerns and asked for an executive-level response before Friday. If we do not respond with a concrete recovery plan, the renewal is likely to slip into procurement review.",
        sender: "Mia R.",
        sender_detail: "Greenfield Health",
        labels: ["renewal", "exec-attention"],
      },
    }),
    buildMessage({
      id: "sample-task-3",
      threadId: "thread-renewal-risk",
      from: "agent:master@omnyid.com",
      type: "task",
      kind: "task",
      supertags: ["Renewal Risk", "Account:Greenfield", "DecisionOS"],
      minutesAgo: 57,
      content: {
        title: "Draft Greenfield renewal recovery plan",
        summary: "Bundle pricing guardrails, legal answer ownership, and rollout commitments into one executive response packet.",
        due_date: new Date(Date.now() + 18 * 60 * 60 * 1000).toISOString(),
        priority: "high",
      },
    }),
    buildMessage({
      id: "sample-note-3",
      threadId: "thread-renewal-risk",
      from: resolvedUser.email,
      type: "note",
      kind: "note",
      supertags: ["Renewal Risk", "Account:Greenfield", "DecisionOS"],
      minutesAgo: 49,
      content: {
        title: "Greenfield renewal pressure map",
        preview: "The same account pressure now spans customer email, legal dependencies, pricing concerns, and a likely executive response path.",
        body: "The same account pressure now spans customer email, legal dependencies, pricing concerns, and a likely executive response path. DecisionOS should treat this as one bounded renewal risk rather than four separate tasks.",
      },
    }),
    buildMessage({
      id: "sample-email-4",
      threadId: "thread-storage-policy",
      from: "ops@omnyid.com",
      type: "email",
      kind: "email",
      supertags: ["Storage Policy", "Archive Mode", "DecisionOS"],
      minutesAgo: 82,
      content: {
        subject: "Hosted storage pricing rollout draft",
        preview: "Ops circulated the 1GB free / 2GB paid / +10GB add-on pricing language for hosted rollout.",
        body: "Ops circulated the 1GB free, 2GB paid, and +10GB add-on pricing language for hosted rollout. The note asks for clear archive-only warning text so users understand workflow performance tradeoffs.",
        sender: "Ops Desk",
        sender_detail: "OmnyID Operations",
        labels: ["pricing", "storage"],
      },
    }),
    buildMessage({
      id: "sample-task-4",
      threadId: "thread-storage-policy",
      from: "agent:master@omnyid.com",
      type: "task",
      kind: "task",
      supertags: ["Storage Policy", "Archive Mode", "DecisionOS"],
      minutesAgo: 74,
      content: {
        title: "Finalize archive-only warning copy",
        summary: "Make the quota upgrade path and archive-mode performance warning visible in both cost and upload surfaces.",
        due_date: new Date(Date.now() + 34 * 60 * 60 * 1000).toISOString(),
        priority: "medium",
      },
    }),
    buildMessage({
      id: "sample-db-3",
      threadId: "thread-renewal-risk",
      from: resolvedUser.email,
      type: "database_record",
      kind: "database_record",
      supertags: ["Renewal Risk", "Account:Greenfield", "DecisionOS"],
      minutesAgo: 46,
      content: {
        kind: "database_record",
        table: "Renewal Watchlist",
        data: {
          account: "Greenfield Health",
          status: "At risk",
          owner: "Founder",
          renewal_date: "2026-07-09",
          blockers: "Legal turnaround, pricing exceptions",
        },
      },
    }),
    buildMessage({
      id: "sample-knowledge-3",
      threadId: "thread-renewal-risk",
      from: "agent:curator@omnyid.com",
      type: "knowledge_card",
      kind: "knowledge_card",
      supertags: ["Renewal Risk", "Account:Greenfield", "DecisionOS"],
      minutesAgo: 43,
      content: {
        title: "Greenfield renewal risk packet",
        summary: "Customer pressure, pricing decisions, legal follow-up, and executive response drafting all collapse into one renewal decision object.",
        supertags: ["Renewal Risk", "Account:Greenfield", "DecisionOS"],
      },
    }),
    buildMessage({
      id: "sample-knowledge-4",
      threadId: "thread-storage-policy",
      from: "agent:curator@omnyid.com",
      type: "knowledge_card",
      kind: "knowledge_card",
      supertags: ["Storage Policy", "Archive Mode", "DecisionOS"],
      minutesAgo: 69,
      content: {
        title: "Hosted storage tier policy",
        summary: "Quota warnings, archive-only behavior, and add-on pricing belong to one storage policy object that should show up in both billing and upload flows.",
        supertags: ["Storage Policy", "Archive Mode", "DecisionOS"],
      },
    }),
    buildMessage({
      id: "sample-backlink-4",
      threadId: "thread-renewal-risk",
      from: "agent:curator@omnyid.com",
      type: "backlink_update",
      kind: "backlink_update",
      supertags: ["Renewal Risk", "Account:Greenfield", "DecisionOS"],
      minutesAgo: 41,
      content: {
        source_id: "sample-knowledge-3",
        target_id: "sample-email-3",
        target_title: "Greenfield renewal is stalling without executive response",
        relation: "surfaced by",
      },
    }),
    buildMessage({
      id: "sample-backlink-5",
      threadId: "thread-renewal-risk",
      from: "agent:curator@omnyid.com",
      type: "backlink_update",
      kind: "backlink_update",
      supertags: ["Renewal Risk", "Account:Greenfield", "DecisionOS"],
      minutesAgo: 40,
      content: {
        source_id: "sample-knowledge-3",
        target_id: "sample-task-3",
        target_title: "Draft Greenfield renewal recovery plan",
        relation: "organizes",
      },
    }),
    buildMessage({
      id: "sample-backlink-6",
      threadId: "thread-storage-policy",
      from: "agent:curator@omnyid.com",
      type: "backlink_update",
      kind: "backlink_update",
      supertags: ["Storage Policy", "Archive Mode", "DecisionOS"],
      minutesAgo: 68,
      content: {
        source_id: "sample-knowledge-4",
        target_id: "sample-task-4",
        target_title: "Finalize archive-only warning copy",
        relation: "depends on",
      },
    }),
    buildMessage({
      id: "sample-insight-2",
      threadId: "thread-renewal-risk",
      from: "agent:curator@omnyid.com",
      type: "insight",
      kind: "insight",
      supertags: ["DecisionOS", "Renewal Risk"],
      minutesAgo: 38,
      content: {
        topic: "DecisionOS",
        body: "Decision pressure is clustering around one renewal packet and one storage-policy packet, so both should surface as bounded queue objects rather than scattered updates.",
        count: 6,
      },
    }),
  ];

  return {
    user: resolvedUser,
    agents: [{ agent_id: "agent:master@omnyid.com", label: "Master Agent" }],
    messages,
    thread_summaries: buildThreadSummaries(messages),
    proactive_suggestions: [
      {
        id: "sample-suggestion-1",
        kind: "prepared_draft",
        title: "Approve the supplier launch narrative",
        description: "Northstar is waiting on one decision that also affects the launch note, task, and calendar event.",
        action_label: "Review launch thread",
        destination_view: "threads",
        readiness: "ready_now",
        source_refs: ["sample-email-1", "sample-task-1", "sample-note-1"],
        source_count: 3,
      },
      {
        id: "sample-suggestion-2",
        kind: "decision_queue",
        title: "Resolve the Greenfield renewal packet",
        description: "Customer risk, pricing, legal, and executive response work are already linked through one decision object.",
        action_label: "Open DecisionOS queue",
        destination_view: "decision_queue",
        readiness: "ready_now",
        source_refs: ["sample-email-3", "sample-task-3", "sample-knowledge-3"],
        source_count: 3,
      },
    ],
    continuity_action_items: [
      {
        id: "sample-action-1",
        title: "Approve the Greenfield renewal recovery plan",
        category: "renewal_risk",
        urgency: "high",
        confidence: "high",
        requires_approval: true,
        suggested_action: "Approve recovery packet",
        surface_hint: "decision_queue",
        source_refs: ["sample-email-3", "sample-task-3", "sample-knowledge-3"],
        memory_space: "accounts/greenfield",
      },
      {
        id: "sample-action-2",
        title: "Finalize storage quota and archive-mode rollout copy",
        category: "product_policy",
        urgency: "medium",
        confidence: "high",
        requires_approval: false,
        suggested_action: "Publish pricing rollout copy",
        surface_hint: "decision_queue",
        source_refs: ["sample-email-4", "sample-task-4", "sample-knowledge-4"],
        memory_space: "product/hosted-storage",
      },
    ],
    continuity_response_items: [
      {
        id: "sample-response-1",
        title: "Reply to Mia with the renewal recovery path",
        channel: "email",
        urgency: "high",
        confidence: "high",
        response_due_hint: "Today by 5pm",
        suggested_action: "Send executive response",
        prepared_draft_id: "sample-draft-1",
        prepared_draft_summary: "Executive reply covering pricing, legal timing, and rollout assurance.",
        prepared_draft_readiness: "ready_now",
        prepared_draft_body: "Mia, here is the recovery path we can commit to by Friday: 1) pricing guardrails today, 2) legal turnaround by tomorrow noon, 3) rollout checkpoint with your team before procurement review.",
        prepared_draft_class: "executive_reply",
        prepared_draft_selection_reason: "All relevant renewal evidence is already clustered in one thread.",
        prepared_draft_available: true,
        prepared_draft_requires_approval: true,
        prepared_draft_lead_summary: "One bounded reply can unblock the renewal.",
        prepared_draft_summary_lines: [
          "Addresses pricing guardrails",
          "Commits to a legal turnaround owner",
          "Sets a rollout checkpoint before procurement",
        ],
        prepared_draft_object_refs: ["sample-knowledge-3"],
        prepared_draft_object_labels: ["Greenfield renewal risk packet"],
        prepared_draft_thread_retrieval_state: {
          summary: "Renewal evidence refreshed 2 minutes ago",
          badges: ["email", "task", "knowledge"],
        },
        source_refs: ["sample-email-3", "sample-note-3", "sample-task-3"],
      },
      {
        id: "sample-response-2",
        title: "Respond to ops with the final hosted storage pricing decision",
        channel: "email",
        urgency: "medium",
        confidence: "high",
        response_due_hint: "Tomorrow morning",
        suggested_action: "Confirm pricing rollout",
        source_refs: ["sample-email-4", "sample-knowledge-4"],
      },
    ],
    continuity_prepared_draft_items: [
      {
        id: "sample-draft-1",
        draft_class: "executive_reply",
        title: "Greenfield executive recovery reply",
        channel: "email",
        summary: "Executive response for a renewal at risk, grounded in pricing, legal, and rollout commitments.",
        body: "Mia, thanks for surfacing the renewal blockers directly. We are locking pricing guardrails today, assigning legal turnaround ownership by tomorrow noon, and reserving a rollout checkpoint with your team before procurement review.",
        confidence: "high",
        readiness: "ready_now",
        response_due_hint: "Today by 5pm",
        requires_approval: true,
        suggested_action: "Review and send",
        selection_reason: "The draft covers every live blocker already captured in the renewal packet.",
        source_refs: ["sample-email-3", "sample-note-3", "sample-db-3"],
        object_refs: ["sample-knowledge-3"],
        object_labels: ["Greenfield renewal risk packet"],
      },
    ],
    continuity_context_pack_items: [
      {
        id: "sample-context-pack-1",
        pack_kind: "decision_packet",
        title: "Greenfield renewal packet",
        summary: "Customer pressure, pricing guardrails, legal timing, and rollout commitments assembled for one executive decision.",
        confidence: "high",
        why_surfaced: "Multiple linked signals now point to the same renewal decision.",
        anchor_refs: ["sample-knowledge-3"],
        source_refs: ["sample-email-3", "sample-task-3", "sample-db-3"],
        reference_refs: ["sample-note-3"],
        reference_labels: ["Greenfield renewal pressure map"],
        object_refs: ["sample-knowledge-3"],
        object_labels: ["Greenfield renewal risk packet"],
        file_refs: [],
        file_labels: [],
        evidence_kinds: ["email", "task", "database_record", "knowledge_card"],
        thread_retrieval_state: {
          summary: "Decision packet refreshed from linked evidence",
          badges: ["linked", "fresh"],
        },
      },
    ],
    continuity_priority_card: {
      title: "Greenfield renewal needs one executive decision",
      description: "Pricing, legal, and rollout answers are already linked. One approved response path can stabilize the renewal before Friday.",
      panel_kind: "decision_packet",
      requires_approval: true,
      action_label: "Review decision packet",
      surface_hint: "decision_queue",
      confidence: "high",
      prepared_draft_class: "executive_reply",
      selection_reason: "This is the highest-pressure bounded decision in the current sample set.",
      linked_target_label: "Greenfield renewal packet",
      source_refs: ["sample-email-3", "sample-task-3", "sample-knowledge-3"],
      object_refs: ["sample-knowledge-3"],
      object_labels: ["Greenfield renewal risk packet"],
      memory_space: "accounts/greenfield",
      author_mask: "agent",
      author_type: "agent",
      author_id: "agent:curator@omnyid.com",
      is_human_authored: false,
      human_only: false,
      thread_retrieval_state: {
        summary: "Evidence synchronized across email, task, and knowledge views",
        badges: ["renewal", "decision", "ready"],
      },
    },
    cost_snapshot: {
      total_usd: 18.4,
      total_tokens: 286400,
      event_count: 42,
      run_count: 11,
      monthly_budget_usd: 120,
      soft_limit_ratio: 0.7,
      recent_spend_usd_14d: 5.2,
      cost_month_usd: 18.4,
      estimated_monthly_margin_usd: 71.6,
      deep_queries_today: 4,
      daily_deep_query_limit: 12,
      margin_guard_active: false,
      usage_guard_active: false,
    },
  };
}

export function mergeDashboardBootstrapWithSample(
  live: DashboardBootstrap | null,
  sample: DashboardBootstrap,
): DashboardBootstrap {
  if (!live) return sample;

  const liveMessages = live.messages ?? [];
  const needsConnectedSample = !hasConnectedSampleCoverage(liveMessages);
  const mergedMessages = needsConnectedSample
    ? mergeUniqueById(liveMessages, sample.messages)
    : liveMessages;
  const mergedThreadSummaries = needsConnectedSample
    ? mergeUniqueThreadSummaries(live.thread_summaries ?? [], sample.thread_summaries ?? [])
    : ((live.thread_summaries?.length ?? 0) > 0
      ? live.thread_summaries
      : sample.thread_summaries);
  const mergedProactiveSuggestions = needsConnectedSample
    ? mergeUniqueById(live.proactive_suggestions ?? [], sample.proactive_suggestions ?? [])
    : ((live.proactive_suggestions?.length ?? 0) > 0
      ? live.proactive_suggestions
      : sample.proactive_suggestions);
  const mergedContinuityActionItems = needsConnectedSample
    ? mergeOptionalArray(live.continuity_action_items, sample.continuity_action_items ?? [])
    : ((live.continuity_action_items?.length ?? 0) > 0
      ? live.continuity_action_items
      : sample.continuity_action_items);
  const mergedContinuityResponseItems = needsConnectedSample
    ? mergeOptionalArray(live.continuity_response_items, sample.continuity_response_items ?? [])
    : ((live.continuity_response_items?.length ?? 0) > 0
      ? live.continuity_response_items
      : sample.continuity_response_items);
  const mergedPreparedDraftItems = needsConnectedSample
    ? mergeOptionalArray(live.continuity_prepared_draft_items, sample.continuity_prepared_draft_items ?? [])
    : ((live.continuity_prepared_draft_items?.length ?? 0) > 0
      ? live.continuity_prepared_draft_items
      : sample.continuity_prepared_draft_items);
  const mergedContextPackItems = needsConnectedSample
    ? mergeOptionalArray(live.continuity_context_pack_items, sample.continuity_context_pack_items ?? [])
    : ((live.continuity_context_pack_items?.length ?? 0) > 0
      ? live.continuity_context_pack_items
      : sample.continuity_context_pack_items);
  const mergedPriorityCard = live.continuity_priority_card ?? sample.continuity_priority_card;

  return {
    ...sample,
    ...live,
    user: live.user,
    agents: (live.agents?.length ?? 0) > 0 ? live.agents : sample.agents,
    messages: mergedMessages,
    thread_summaries: mergedThreadSummaries,
    proactive_suggestions: mergedProactiveSuggestions,
    continuity_action_items: mergedContinuityActionItems,
    continuity_response_items: mergedContinuityResponseItems,
    continuity_prepared_draft_items: mergedPreparedDraftItems,
    continuity_context_pack_items: mergedContextPackItems,
    continuity_priority_card: mergedPriorityCard,
    cost_snapshot: live.cost_snapshot ?? sample.cost_snapshot,
  };
}
