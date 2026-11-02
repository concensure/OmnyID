import test from "node:test";
import assert from "node:assert/strict";

import {
  messageIdFromResponse,
  normalizeAgentMemoryResponse,
  normalizeAgentPreferences,
  normalizeAliasCheckResult,
  normalizeAliasRecord,
  normalizeAuthUser,
  normalizeCalendarEventResponse,
  normalizeCapabilitiesResponse,
  normalizeCapabilityDescriptorResponse,
  normalizeClaimNeighborhoodResponse,
  normalizeEncKeyResponse,
  normalizeExportFileResponse,
  normalizeExtractDocumentResponse,
  normalizeLlmProvidersResponse,
  normalizeAgentSearchResponse,
  normalizeAutoArchiveApproveResponse,
  normalizeAutoArchiveCandidatesResponse,
  normalizeBacklinksGraphResponse,
  normalizeBacklinksResponse,
  normalizeBillingCheckoutResponse,
  normalizeBillingStatus,
  normalizeCalendarEventsResponse,
  normalizeContinuitySummaryResponse,
  normalizeCostBudget,
  normalizeCostProfitSummary,
  normalizeCostSummary,
  normalizeDaemonsResponse,
  normalizeDaemonHeartbeatResponse,
  normalizeDashboardBootstrap,
  normalizeDeviceSyncPoliciesResponse,
  normalizeAdminWeddingVendorsResponse,
  normalizeAdminThirdPartyToolPolicyPayload,
  normalizeWeddingLiveEvidenceResponse,
  normalizeWeddingOnboardingStateResponse,
  normalizeWeddingVendorContactResponse,
  normalizeOkResponse,
  normalizeObjectMessagesResponse,
  normalizeOrchestrationResponse,
  normalizeParaArchiveResponse,
  normalizeParaArchivedResponse,
  normalizeParaClassifyResponse,
  normalizeParaItemsResponse,
  normalizePersonaResponse,
  normalizePersonasResponse,
  normalizePlanningQueryResponse,
  normalizeReferenceMessagesResponse,
  normalizeRuntimeBackupManifestResponse,
  normalizeRuntimeBackupsResponse,
  normalizeRuntimeLogsResponse,
  normalizeRuntimeRecoveryPacketResponse,
  normalizeRuntimeRestoreDrillsResponse,
  normalizeRuntimeUpdatesResponse,
  normalizeRuntimeWorkspaceFileResponse,
  normalizeRuntimeWorkspaceFilesResponse,
  normalizeSkillCapsuleCatalogResponse,
  normalizeSkillCapsuleGenerateResponse,
  normalizeSpendHistoryResponse,
  normalizeSupertagDefinitionsResponse,
  normalizeSupertagMessagesResponse,
  normalizeThreadSummariesResponse,
  normalizeTokenBudgetStatus,
  normalizeToolConnectionsResponse,
  normalizeToolConnectionResponse,
  normalizeToolConnectionDisconnectResponse,
  normalizeTopSupertagsResponse,
  normalizeUndoActionResponse,
  normalizeUiCommandResponse,
  normalizeComposioStatusResponse,
  normalizeComposioLinkResponse,
  normalizeUrlResponse,
  normalizeUserLlmProvider,
  normalizeWorkspaceSkillSelectionResponse,
  normalizeInternalWorkflowEventIngestResponse,
  normalizeSavedWorkflowResponse,
  normalizeWorkflowActionResponse,
  normalizeWorkflowCompileResponse,
  normalizeWorkflowConnectorAdaptersResponse,
  normalizeWorkflowDeploymentsResponse,
  normalizeWorkflowDescribeResponse,
  normalizeWorkflowListResponse,
  normalizeWorkflowPatchResponse,
  normalizeWorkflowRunsResponse,
  normalizeWorkflowRunStartResponse,
  normalizeWorkflowSaveResponse,
  normalizeWorkflowTriggerDispatchResponse,
  normalizeWorkflowTriggerObservationsResponse,
  normalizeWorkflowTriggerRegistrationsResponse,
  normalizeWorkflowValidationResponse,
  normalizeWorkflowWaitResumeDecisionResponse,
  normalizeWorkflowWaitResumeListResponse,
  normalizeWorkflowWebhookIngressResponse,
} from "../src/lib/api.ts";

test("wedding onboarding normalizer keeps the persisted admin data-sharing choice", () => {
  assert.deepEqual(normalizeWeddingOnboardingStateResponse({
    onboarding_state: {
      user_id: "user-1",
      wedding_plan_id: "wedding-plan-1",
      intake_variant: "wedding_site",
      entry_source: "wedding_site",
      admin_data_consent: true,
      created_at: "2026-11-02T00:00:00Z",
      updated_at: "2026-11-02T00:01:00Z",
    },
  }).onboardingState, {
    userId: "user-1",
    weddingPlanId: "wedding-plan-1",
    intakeVariant: "wedding_site",
    entrySource: "wedding_site",
    adminDataConsent: true,
    createdAt: "2026-11-02T00:00:00Z",
    updatedAt: "2026-11-02T00:01:00Z",
  });
});

test("api response normalizers filter malformed list rows and keep safe defaults", () => {
  assert.deepEqual(normalizeDaemonsResponse({
    daemons: [
      { daemon_id: "daemon_1", status: "active", stale_minutes: 3, policy_config: { a: 1 } },
      { daemon_id: 7, status: "bad" },
    ],
  }).daemons, [
    {
      daemon_id: "daemon_1",
      daemon_kind: "",
      display_name: "",
      status: "active",
      workflow_id: undefined,
      delegated_key_id: "",
      last_heartbeat_at: undefined,
      created_at: "",
      revoked_at: undefined,
      policy_config: { a: 1 },
      stale_minutes: 3,
    },
  ]);

  assert.deepEqual(normalizeTopSupertagsResponse({
    supertags: [{ tag: "project:x", count: 4 }, { tag: "", count: 1 }, { tag: "bad", count: Number.NaN }],
  }), {
    supertags: [{ tag: "project:x", count: 4 }, { tag: "bad", count: 0 }],
  });

  assert.deepEqual(normalizeToolConnectionsResponse({
    connections: [{ id: "c1", tool_slug: "gmail", tool_name: "", mcp_server_url: 3, connected_at: "now" }, {}],
  }).connections, [
    { id: "c1", tool_slug: "gmail", tool_name: "", mcp_server_url: "", connected_at: "now" },
  ]);
});

test("api response normalizers handle persona, search, calendar, and continuity payloads", () => {
  assert.deepEqual(normalizePersonasResponse({
    personas: [
      { id: "p1", name: "Coach", skills_json: ["plan", 2], lora_confidence_score: 0.7, lora_genome_active: true, is_active: true },
      { name: "missing id" },
    ],
  }).personas[0], {
    id: "p1",
    owner_user_id: "",
    name: "Coach",
    soul_md: "",
    writing_style: "",
    skills_json: ["plan"],
    labels_json: ["plan"],
    lora_confidence_score: 0.7,
    lora_genome_active: true,
    is_active: true,
    created_at: "",
    updated_at: "",
  });

  assert.deepEqual(normalizeAgentSearchResponse({ agents: [{ id: "a1" }, { id: 2 }] }), {
    agents: [{ id: "a1", agent_id: "a1", name: "Unnamed agent", status: "unknown" }],
  });

  assert.deepEqual(normalizeCalendarEventsResponse({
    events: [{ id: "evt_1", status: "unsupported", all_day: "yes", profile: { kind: "meeting" } }],
  }).events[0], {
    id: "evt_1",
    title: "Untitled event",
    description: undefined,
    start_at: "",
    end_at: undefined,
    all_day: false,
    location: undefined,
    status: "confirmed",
    note_kind: undefined,
    prep_lead_minutes: undefined,
    profile: { kind: "meeting" },
  });

  assert.deepEqual(normalizeContinuitySummaryResponse({
    messages: [{ id: "m1", content: "not record" }, { id: null }],
  }), {
    messages: [{ id: "m1", type: "continuity", content: {}, timestamp: "" }],
  });
});

test("api response normalizers keep PARA wrappers stable", () => {
  assert.deepEqual(normalizeParaItemsResponse({
    items: [{ id: "cls_1", target_id: "msg_1", para_tags: ["project:x", 4], status: "weird" }, { id: "bad" }],
  }), {
    items: [{
      id: "cls_1",
      target_id: "msg_1",
      para_tags: ["project:x"],
      status: "active",
      reason: undefined,
      context: undefined,
      archived_at: undefined,
      created_at: "",
      updated_at: "",
    }],
  });

  assert.deepEqual(normalizeParaArchivedResponse({
    archive: [{ id: "arch_1", target_id: "msg_2", para_tags: ["archive:x"], updated_at: "later" }],
  }).archive[0], {
    id: "arch_1",
    target_id: "msg_2",
    para_tags: ["archive:x"],
    reason: undefined,
    context: undefined,
    archived_at: undefined,
    updated_at: "later",
  });

  assert.deepEqual(normalizeAutoArchiveCandidatesResponse({
    candidates: [{ id: "cand_1", target_id: "msg_3", para_tags: ["resource:x"] }, { target_id: "bad" }],
  }), {
    candidates: [{ id: "cand_1", target_id: "msg_3", para_tags: ["resource:x"], created_at: "" }],
  });

  assert.deepEqual(normalizeAutoArchiveApproveResponse({ archived: "many" }), { archived: 0 });
});

test("api command response normalizers throw when required ids are absent", () => {
  assert.equal(messageIdFromResponse({ message_id: "msg_1" }), "msg_1");
  assert.throws(() => messageIdFromResponse({ ok: true }), /message id/i);

  assert.deepEqual(normalizeParaClassifyResponse({ id: "cls_1", target_id: "msg_1" }), {
    id: "cls_1",
    target_id: "msg_1",
  });
  assert.throws(() => normalizeParaClassifyResponse({ id: "cls_1" }), /classification id/i);

  assert.deepEqual(normalizeParaArchiveResponse({ archived: true, target_id: "msg_1" }), {
    archived: true,
    target_id: "msg_1",
  });
  assert.throws(() => normalizeParaArchiveResponse({ archived: true }), /target id/i);

  assert.equal(normalizePersonaResponse({ persona: { id: "p1" } }).persona.id, "p1");
  assert.throws(() => normalizePersonaResponse({ persona: null }), /persona/i);
});

test("workflow response normalizers filter list containers and preserve command contracts", () => {
  assert.deepEqual(normalizeWorkflowListResponse({
    workflows: [{ workflow_id: "wf_1", title: "Valid" }, { title: "missing id" }],
  }).workflows.map((workflow) => workflow.workflow_id), ["wf_1"]);

  assert.deepEqual(normalizeWorkflowSaveResponse({
    saved: "yes",
    workflow: { workflow_id: "wf_2" },
  }), {
    saved: false,
    workflow: {
      workflow_id: "wf_2",
      owner_user_id: "",
      title: "wf_2",
      description: undefined,
      favorite: false,
      preset_kinds: [],
      graph: {},
      latest_ir: undefined,
      trigger_readiness_summary: undefined,
      created_at: "",
      updated_at: "",
      archived_at: undefined,
    },
  });
  assert.throws(() => normalizeWorkflowSaveResponse({ saved: true }), /saved workflow/i);

  assert.deepEqual(normalizeWorkflowPatchResponse({
    patched: true,
    ir_invalidated: 1,
    workflow: { workflow_id: "wf_3" },
  }), {
    patched: true,
    ir_invalidated: false,
    workflow: {
      workflow_id: "wf_3",
      owner_user_id: "",
      title: "wf_3",
      description: undefined,
      favorite: false,
      preset_kinds: [],
      graph: {},
      latest_ir: undefined,
      trigger_readiness_summary: undefined,
      created_at: "",
      updated_at: "",
      archived_at: undefined,
    },
  });
  assert.throws(() => normalizeWorkflowPatchResponse({ workflow: {} }), /patched workflow/i);
});

test("workflow trigger and connector normalizers reject malformed rows", () => {
  assert.deepEqual(normalizeWorkflowTriggerRegistrationsResponse({
    registrations: [
      { registration_id: "reg_1", registration_status: "paused", descriptor_json: { trigger: true }, retry_count: 2 },
      { registration_status: "registered" },
    ],
  }).registrations[0], {
    registration_id: "reg_1",
    workflow_id: "",
    deployment_id: "",
    owner_user_id: "",
    environment: "",
    trigger_node_id: "",
    manifest_node_id: "",
    trigger_family: "",
    trigger_kind: "",
    registration_status: "paused",
    idempotency_key: "",
    dedup_hash: undefined,
    descriptor_json: { trigger: true },
    last_fired_at: undefined,
    next_fire_at: undefined,
    retry_count: 2,
    created_at: "",
    updated_at: "",
  });

  assert.deepEqual(normalizeWorkflowTriggerObservationsResponse({
    workflow_id: "wf_1",
    trigger_observations: [{ observation_id: "obs_1", hybrid_decision_chain: "bad", run_initiation_trace: null }, {}],
  }).trigger_observations[0]?.run_initiation_trace, {
    run_id: "",
    workflow_id: "",
    deployment_id: "",
    trigger_node_id: "",
  });

  assert.deepEqual(normalizeWorkflowConnectorAdaptersResponse({
    connector_families: ["gmail", 4],
    adapters: [{ connector_family: "gmail", auth_modes: ["oauth", 9], metadata_tool_call: true }, { description: "bad" }],
  }), {
    connector_families: ["gmail"],
    adapters: [{
      connector_family: "gmail",
      description: "",
      execution_path: "",
      afp_discovery_subtype: undefined,
      afp_request_subtype: undefined,
      afp_result_subtype: undefined,
      metadata_tool_call: true,
      metadata_store_default: false,
      auth_modes: ["oauth"],
      side_effect_policy: "",
      bypass_llm_routing: false,
    }],
  });
});

test("small API contract normalizers cover ok, url, key, and LLM provider responses", () => {
  assert.deepEqual(normalizeOkResponse({ ok: "true" }), { ok: false });
  assert.deepEqual(normalizeUrlResponse({ url: "https://example.test" }), { url: "https://example.test" });
  assert.throws(() => normalizeUrlResponse({}), /URL/i);

  assert.deepEqual(normalizeOrchestrationResponse({ status: "queued", message_id: "msg_1", thread_id: 7 }), {
    status: "queued",
    message_id: "msg_1",
    thread_id: undefined,
  });

  assert.deepEqual(normalizeEncKeyResponse({ enc_key_hex: "abc", algorithm: "" }), {
    enc_key_hex: "abc",
    algorithm: "",
  });
  assert.throws(() => normalizeEncKeyResponse({ algorithm: "x" }), /encryption key/i);

  assert.deepEqual(normalizeExportFileResponse({ filename: "brief.csv", size_bytes: "many", ok: true }), {
    ok: true,
    filename: "brief.csv",
    size_bytes: 0,
    download_url: undefined,
    data: undefined,
    mime_type: undefined,
    workflow_family_context: undefined,
    summary: undefined,
    format: undefined,
  });

  assert.deepEqual(normalizeUserLlmProvider({ id: "provider_1", priority: 5, is_default: true }), {
    id: "provider_1",
    name: "provider_1",
    provider: "",
    display_name: "",
    backend: "",
    model: "",
    model_id: "",
    is_default: true,
    priority: 5,
    has_api_key: false,
    consent_given: false,
  });

  assert.deepEqual(normalizeLlmProvidersResponse({
    providers: [{ id: "provider_1" }, { name: "missing id" }],
  }).providers.map((provider) => provider.id), ["provider_1"]);
});

test("wedding vendor admin normalizers preserve editable vendor and contact state", () => {
  const vendors = normalizeAdminWeddingVendorsResponse({
    vendors: [
      {
        vendor_id: "vendor_1",
        vendor_slug: "harbour-venue",
        vendor_name: "Harbour Venue",
        category: "Venue",
        service_area: "Sydney, NSW",
        address: "1 Harbour St, Sydney NSW",
        contact_email: "events@example.test",
        status: "active",
        evidence: { address: "1 Harbour St, Sydney NSW" },
        caveat_labels: ["Request quote"],
        created_at: "2026-09-19T00:00:00Z",
        updated_at: "2026-09-19T00:00:00Z",
        photos: [
          {
            photo_id: "photo_1",
            vendor_id: "vendor_1",
            slot: 1,
            photo_url: "https://cdn.example.test/venue.jpg",
            alt_text: "Harbour ballroom",
          },
        ],
        user_contact: {
          contact_id: "contact_1",
          user_id: "user_1",
          vendor_id: "vendor_1",
          contact_method: "personal_email",
          last_contact_at: "2026-09-19T01:00:00Z",
          follow_up_due_at: "2026-09-22T01:00:00Z",
          created_at: "2026-09-19T01:00:00Z",
          updated_at: "2026-09-19T01:00:00Z",
        },
      },
      { vendor_name: "missing id" },
    ],
  });

  assert.equal(vendors.vendors.length, 1);
  assert.equal(vendors.vendors[0]?.address, "1 Harbour St, Sydney NSW");
  assert.equal(vendors.vendors[0]?.photos[0]?.slot, 1);
  assert.equal(vendors.vendors[0]?.photos[0]?.sourceLabel, null);
  assert.equal(vendors.vendors[0]?.userContact?.contactMethod, "personal_email");
  assert.equal(vendors.vendors[0]?.userContact?.followUpDueAt, "2026-09-22T01:00:00Z");

  const contact = normalizeWeddingVendorContactResponse({
    contact: {
      contact_id: "contact_1",
      user_id: "user_1",
      vendor_id: "vendor_1",
      contact_method: "agent_email_draft",
      last_contact_at: "2026-09-19T01:00:00Z",
      follow_up_due_at: "2026-09-22T01:00:00Z",
      receipt_ref: "gmail:message-1",
      notes: "Awaiting venue package.",
      created_at: "2026-09-19T01:00:00Z",
      updated_at: "2026-09-19T01:00:00Z",
    },
  }).contact;

  assert.equal(contact?.contactMethod, "agent_email_draft");
  assert.equal(contact?.followUpDueAt, "2026-09-22T01:00:00Z");
  assert.equal(contact?.responseReceivedAt, null);
});

test("wedding live evidence normalizer strips secret-shaped provider fields", () => {
  const evidence = normalizeWeddingLiveEvidenceResponse({
    ok: true,
    status: "partial",
    locationsRequested: 1,
    geocodes: [{
      query: "Sydney Opera House",
      provider: "google_maps",
      apiKey: "must-not-leak",
      results: [{ display_name: "Sydney Opera House", lat: -33.8568, lng: 151.2153 }],
    }],
    weather: [{
      query: "Sydney",
      provider: "weatherapi",
      provider_secret: "must-not-leak",
      current: { temp_c: 21 },
    }],
    failures: ["weather stale"],
    receiptMetadata: { receipt_id: "wedding_live_evidence:workspace:01" },
    guardrails: ["Keys stay server-side."],
  });

  assert.equal(evidence.ok, true);
  assert.equal(evidence.geocodes[0]?.query, "Sydney Opera House");
  assert.equal(evidence.weather[0]?.provider, "weatherapi");
  assert.doesNotMatch(JSON.stringify(evidence), /must-not-leak/);
  assert.deepEqual(evidence.failures, ["weather stale"]);
});

test("knowledge response normalizers filter backlinks, graph edges, and AFP message rows", () => {
  assert.deepEqual(normalizeBacklinksResponse({
    message_id: "msg_1",
    count: 2,
    backlinks: [
      { backlink_id: "bl_1", source_id: "s1", target_id: "t1", direction: "sideways", similarity: 0.5, entities: ["A", 2] },
      { source_id: "missing backlink id" },
    ],
  }), {
    message_id: "msg_1",
    backlinks: [{
      backlink_id: "bl_1",
      source_id: "s1",
      target_id: "t1",
      direction: "inbound",
      link_kind: "",
      similarity: 0.5,
      entities: ["A"],
      created_at: "",
    }],
    count: 2,
  });

  assert.deepEqual(normalizeBacklinksGraphResponse({
    root: "msg_1",
    depth: 2,
    nodes: ["msg_1", 7],
    edges: [{ backlink_id: "edge_1", source_id: "msg_1", target_id: "msg_2" }, {}],
  }), {
    root: "msg_1",
    depth: 2,
    nodes: ["msg_1"],
    edges: [{
      backlink_id: "edge_1",
      source_id: "msg_1",
      target_id: "msg_2",
      link_kind: "",
      similarity: 0,
      entities: [],
      created_at: "",
    }],
    node_count: 0,
    edge_count: 0,
  });

  assert.deepEqual(normalizeSupertagMessagesResponse({
    tags: ["project:x", 1],
    match: "all",
    count: Number.NaN,
    messages: [{ id: "msg_1" }, { content: "missing id" }],
  }), {
    tags: ["project:x"],
    kind: undefined,
    match: "all",
    count: 0,
    limit: undefined,
    offset: undefined,
    next_offset: null,
    has_more: undefined,
    messages: [{ id: "msg_1" }],
  });

  assert.deepEqual(normalizeReferenceMessagesResponse({
    targets: ["msg_1", 2],
    reference_type: "source",
    messages: [{ id: "msg_2" }, null],
  }), {
    targets: ["msg_1"],
    reference_type: "source",
    link_type: undefined,
    kind: undefined,
    count: 0,
    messages: [{ id: "msg_2" }],
  });
});

test("object and thread summary response normalizers sanitize facets and retrieval state", () => {
  const objectResponse = normalizeObjectMessagesResponse({
    tags: ["project:x"],
    reference_targets: ["msg_1"],
    metadata_keys: ["client"],
    metadata_values: [4],
    match: "unsupported",
    facet_suggestions: {
      kinds: [{ value: "note", count: 3 }, { count: 1 }],
      metadata_terms: "bad",
    },
    facet_next_moves: {
      tags: [{ value: "project:y", count: 2, score: 0.8, rationale: "related" }],
    },
    retrieval_state: { summary: "Fresh", badges: ["indexed", 9] },
    messages: [{ id: "msg_1" }, { type: "missing id" }],
  });
  assert.equal(objectResponse.match, "any");
  assert.deepEqual(objectResponse.facet_suggestions?.kinds, [{ value: "note", count: 3 }]);
  assert.deepEqual(objectResponse.facet_suggestions?.metadata_terms, []);
  assert.deepEqual(objectResponse.facet_next_moves?.tags, [{ value: "project:y", count: 2, score: 0.8, rationale: "related" }]);
  assert.deepEqual(objectResponse.retrieval_state, { summary: "Fresh", badges: ["indexed"] });
  assert.deepEqual(objectResponse.messages, [{ id: "msg_1" }]);

  const threadResponse = normalizeThreadSummariesResponse({
    tags: ["project:x"],
    thread_ids: ["thread_1", 5],
    match: "all",
    facet_suggestions: { metadata_terms: [{ value: "client:acme", count: 2 }] },
    thread_summaries: [{ thread_id: "thread_1" }, { id: "missing thread id" }],
  });
  assert.equal(threadResponse.match, "all");
  assert.deepEqual(threadResponse.thread_ids, ["thread_1"]);
  assert.deepEqual(threadResponse.facet_suggestions?.metadata_terms, [{ value: "client:acme", count: 2 }]);
  assert.deepEqual(threadResponse.thread_summaries, [{ thread_id: "thread_1" }]);
});

test("auth, capability, alias, and preference normalizers enforce shallow contracts", () => {
  assert.deepEqual(normalizeAuthUser({
    id: "user_1",
    email: "me@example.test",
    display_name: "",
    auth_provider: "password",
  }), {
    id: "user_1",
    email: "me@example.test",
    display_name: "",
    auth_provider: "password",
  });
  assert.throws(() => normalizeAuthUser({ email: "missing-id@example.test" }), /user session/i);

  assert.deepEqual(normalizeCapabilitiesResponse({
    capabilities: [
      { id: "cap_1", approval_mode: "autonomous", tags: ["mail", 5], input_schema: { type: "object" }, enabled: true },
      { name: "missing id" },
    ],
  }), [{
    id: "cap_1",
    name: "cap_1",
    description: "",
    input_schema: { type: "object" },
    output_schema: undefined,
    version: "",
    tags: ["mail"],
    approval_mode: "autonomous",
    created_at: "",
    enabled: true,
  }]);
  assert.equal(normalizeCapabilityDescriptorResponse({ id: "cap_2", approval_mode: "unsupported" }).approval_mode, "human_approval_required");
  assert.throws(() => normalizeCapabilityDescriptorResponse({ name: "missing id" }), /capability descriptor/i);

  assert.deepEqual(normalizeAliasCheckResult({ available: 1, valid: true, reason: 3 }), {
    available: false,
    valid: true,
    reason: "",
  });
  assert.deepEqual(normalizeAliasRecord({ alias: "oz", agent_id: 7, display_address: "oz@agent" }), {
    alias: "oz",
    agent_id: undefined,
    display_address: "oz@agent",
    created_at: undefined,
    last_changed_at: undefined,
    next_change_at: undefined,
  });

  assert.deepEqual(normalizeAgentPreferences({
    optimization_mode: "fast",
    auto_confirm_threshold_cents: Number.NaN,
    show_cost_estimates: true,
    response_queue_policy: { supplier_due_hours: 8, friend_due_hours: "soon" },
  }), {
    optimization_mode: "balanced",
    auto_confirm_threshold_cents: 0,
    show_cost_estimates: true,
    default_store_in_history: false,
    response_queue_policy: {
      supplier_due_hours: 8,
      friend_due_hours: 48,
      general_due_hours: 36,
      prioritize_with_local_llm: true,
      allow_remote_fallback: true,
    },
  });
});

test("skill capsule normalizers sanitize catalog and command payloads", () => {
  assert.deepEqual(normalizeSkillCapsuleCatalogResponse({
    available: true,
    configured: "yes",
    catalog: [
      { id: "skill_1", title: "Research", surfaces: ["tool", 9], tags: ["ai", null] },
      { title: "missing id" },
    ],
    warnings: ["limited", 3],
    workspace: {
      selected_skill_ids: ["skill_1", 7],
      reasoning_guidance: ["prefer local", false],
      selected_skill_summaries: [{ id: "skill_1", title: "Research", surfaces: ["tool"] }, {}],
    },
  }), {
    available: true,
    configured: undefined,
    catalog: [{
      id: "skill_1",
      title: "Research",
      category: "",
      description: "",
      integration_mode: "",
      surfaces: ["tool"],
      existing_runtime_fit: "",
      compose_scaffold: undefined,
      compose_placeholder: undefined,
      capsule_kind: undefined,
      tags: ["ai"],
    }],
    warnings: ["limited"],
    workspace: {
      selected_skill_ids: ["skill_1"],
      reasoning_guidance: ["prefer local"],
      selected_skill_summaries: [{
        id: "skill_1",
        title: "Research",
        category: "",
        capsule_kind: "",
        integration_mode: "",
        surfaces: ["tool"],
      }],
    },
  });

  assert.equal(normalizeSkillCapsuleGenerateResponse({ entry: { id: "skill_2" } }).entry.title, "skill_2");
  assert.throws(() => normalizeSkillCapsuleGenerateResponse({ entry: null }), /skill capsule/i);

  assert.deepEqual(normalizeWorkspaceSkillSelectionResponse({
    selected_skill_ids: ["skill_1", 5],
    warnings: ["missing dependency", null],
  }), {
    selected_skill_ids: ["skill_1"],
    reasoning_guidance: undefined,
    selected_skill_summaries: undefined,
    warnings: ["missing dependency"],
  });
});

test("tool connection response normalizers keep server-owned ids and status safe", () => {
  assert.deepEqual(normalizeToolConnectionResponse({
    ok: true,
    connection: {
      id: "conn_1",
      tool_slug: "github",
      tool_name: "GitHub",
      mcp_server_url: "https://mcp.example.com",
      connected_at: "2026-08-13T00:00:00Z",
      connection_provider: "composio",
      api_key_enc: "must-not-matter",
    },
  }), {
    ok: true,
    connection: {
      id: "conn_1",
      tool_slug: "github",
      tool_name: "GitHub",
      mcp_server_url: "https://mcp.example.com",
      connected_at: "2026-08-13T00:00:00Z",
      connection_provider: "composio",
    },
  });
  assert.throws(() => normalizeToolConnectionResponse({ ok: true }), /tool connection/i);
  assert.deepEqual(normalizeComposioStatusResponse({ configured: true, usable: "yes" }), {
    configured: true,
    usable: false,
    http_status: undefined,
    failure_reason: undefined,
  });
  assert.deepEqual(normalizeComposioStatusResponse({
    configured: true,
    usable: false,
    http_status: 401,
    failure_reason: "unauthorized",
  }), {
    configured: true,
    usable: false,
    http_status: 401,
    failure_reason: "unauthorized",
  });
  assert.deepEqual(normalizeComposioLinkResponse({
    ok: true,
    redirect_url: "https://provider.example.com/oauth/start",
    tool_slug: "github",
    toolkit_slug: "github",
  }), {
    ok: true,
    redirect_url: "https://provider.example.com/oauth/start",
    tool_slug: "github",
    toolkit_slug: "github",
  });
  assert.throws(() => normalizeComposioLinkResponse({ ok: true }), /Composio redirect URL/i);
  assert.deepEqual(normalizeToolConnectionDisconnectResponse({
    ok: true,
    disconnected: true,
    revoke_attempted: true,
    upstream_revocation_supported: true,
    capability_registry_refreshed: true,
    cleared_capability_count: 3,
    invalidate_local_cache_keys: ["connected_apps_storage"],
    session_cleanup_recommended: false,
    connection_provider: "composio",
    provider_secret: "must-not-matter",
  }), {
    ok: true,
    disconnected: true,
    revoke_attempted: true,
    upstream_revocation_supported: true,
    capability_registry_refreshed: true,
    cleared_capability_count: 3,
    invalidate_local_cache_keys: ["connected_apps_storage"],
    session_cleanup_recommended: false,
    connection_provider: "composio",
  });
  assert.deepEqual(normalizeToolConnectionDisconnectResponse({
    ok: "yes",
    disconnected: null,
    revoke_attempted: "no",
    upstream_revocation_supported: 1,
    capability_registry_refreshed: "no",
    cleared_capability_count: "many",
    invalidate_local_cache_keys: [1, "tools_local_connections"],
    session_cleanup_recommended: "maybe",
    connection_provider: 42,
  }), {
    ok: false,
    disconnected: false,
    revoke_attempted: false,
    upstream_revocation_supported: false,
    capability_registry_refreshed: false,
    cleared_capability_count: 0,
    invalidate_local_cache_keys: ["tools_local_connections"],
    session_cleanup_recommended: false,
    connection_provider: undefined,
  });
});

test("runtime recovery packet normalizer keeps optional operational guidance typed and bounded", () => {
  assert.deepEqual(normalizeRuntimeRecoveryPacketResponse({
    generated_at: "2026-08-28T09:00:00Z",
    packet_version: "omnyid-runtime-recovery-v1",
    packet_name: "runtime-recovery.json",
    user: {
      id: "user_1",
      email: "ops@example.com",
      display_name: "Ops User",
      auth_provider: "",
    },
    runtime_deployment: null,
    recovery_checklist: ["step 1", null],
    privacy_notes: ["metadata only"],
    runtime_backups: {
      policy: {
        retention_days: 14,
        storage_mode: "metadata_only_hosted",
        support_disabled_by_default: true,
      },
      entries: [],
    },
    runtime_restore_drills: { entries: [] },
    runtime_updates: {
      policy: {
        update_channel: "stable",
        auto_apply: "manual_only",
        support_disabled_by_default: true,
      },
      current_version: "1.0.0",
      latest_version: "1.0.0",
      update_available: false,
      runtime_status: "not_deployed",
      entries: [],
    },
    operational_guidance: {
      status: "no_go",
      summary: "Execute the bounded operational-history cleanup, rerun proof, and refresh the gate.",
      command: "./scripts/oracle-prune-operational-history.ps1 -Apply",
      source: "artifacts/production-go-no-go-current/production-go-no-go.json",
      pressure_status: "operational_history_present",
      pressure_total_rows: 19800,
      cleanup_mode: "dry_run",
      generated_at: "2026-08-28T08:55:00Z",
      ignored_secret: "must-not-matter",
    },
  }), {
    generated_at: "2026-08-28T09:00:00Z",
    packet_version: "omnyid-runtime-recovery-v1",
    packet_name: "runtime-recovery.json",
    user: {
      id: "user_1",
      email: "ops@example.com",
      display_name: "Ops User",
      auth_provider: "",
    },
    runtime_deployment: null,
    recovery_checklist: ["step 1"],
    privacy_notes: ["metadata only"],
    runtime_backups: {
      policy: {
        retention_days: 14,
        storage_mode: "metadata_only_hosted",
        last_snapshot_at: undefined,
        support_disabled_by_default: true,
      },
      entries: [],
    },
    runtime_restore_drills: { entries: [] },
    runtime_updates: {
      policy: {
        update_channel: "stable",
        auto_apply: "manual_only",
        support_disabled_by_default: true,
      },
      current_version: "1.0.0",
      latest_version: "1.0.0",
      update_available: false,
      runtime_status: "not_deployed",
      framework: undefined,
      last_checked_at: undefined,
      last_applied_at: undefined,
      entries: [],
      panel: undefined,
    },
    operational_guidance: {
      status: "no_go",
      summary: "Execute the bounded operational-history cleanup, rerun proof, and refresh the gate.",
      command: "./scripts/oracle-prune-operational-history.ps1 -Apply",
      source: "artifacts/production-go-no-go-current/production-go-no-go.json",
      pressure_status: "operational_history_present",
      pressure_total_rows: 19800,
      cleanup_mode: "dry_run",
      generated_at: "2026-08-28T08:55:00Z",
    },
  });
});

test("document, planning, and claim-neighborhood normalizers keep UI shells safe", () => {
  assert.deepEqual(normalizeCalendarEventResponse({ id: "evt_2", title: "Meet", prep_lead_minutes: Number.NaN }), {
    id: "evt_2",
    title: "Meet",
    description: undefined,
    start_at: "",
    end_at: undefined,
    all_day: false,
    location: undefined,
    status: "confirmed",
    note_kind: undefined,
    prep_lead_minutes: undefined,
    profile: undefined,
  });
  assert.throws(() => normalizeCalendarEventResponse({ title: "missing id" }), /calendar event/i);

  assert.deepEqual(normalizeExtractDocumentResponse({ row_count: 3, column_count: "many", quality_status: 9 }), {
    row_count: 3,
    column_count: 0,
    quality_status: "",
  });

  const planning = normalizePlanningQueryResponse({
    thread_id: "thread_1",
    options: [
      { id: "opt_1", title: "Ship", description: 7, risk_flags: ["scope", 3], follow_up_chips: ["tighten"] },
      { description: "missing title" },
    ],
    assumptions: [{ key: "budget", value: 500, editable: true }, { value: "missing key" }],
    unresolved: ["owner", 1],
    comparison_headers: ["Cost", null],
    comparison_rows: [{ label: "A", values: ["low", 2] }, { values: ["missing label"] }],
  });
  assert.deepEqual(planning.options, [{
    id: "opt_1",
    title: "Ship",
    description: "",
    rationale: "",
    metric_label: undefined,
    metric_value: undefined,
    confidence: undefined,
    risk_flags: ["scope"],
    follow_up_chips: ["tighten"],
  }]);
  assert.deepEqual(planning.assumptions, [{ key: "budget", value: "", label: undefined, editable: true }]);
  assert.deepEqual(planning.unresolved, ["owner"]);
  assert.deepEqual(planning.comparison_headers, ["Cost"]);
  assert.deepEqual(planning.comparison_rows, [{ label: "A", values: ["low"] }]);

  assert.deepEqual(normalizeClaimNeighborhoodResponse({
    a2ui: { card: true },
    filters: "bad",
    groups: [{ id: "supporting" }],
    message_id: 4,
  }), {
    a2ui: { card: true },
    filters: undefined,
    groups: [{ id: "supporting" }],
    message_id: undefined,
  });
});

test("thread-adjacent command normalizers enforce ids and sanitize daemon heartbeat data", () => {
  assert.deepEqual(normalizeDaemonHeartbeatResponse({
    daemon: { daemon_id: "daemon_1", status: "active" },
    heartbeat: { heartbeat_id: "hb_1", daemon_id: "daemon_1", metrics: "bad", created_at: "now" },
  }), {
    daemon: {
      daemon_id: "daemon_1",
      daemon_kind: "",
      display_name: "",
      status: "active",
      workflow_id: undefined,
      delegated_key_id: "",
      last_heartbeat_at: undefined,
      created_at: "",
      revoked_at: undefined,
      policy_config: undefined,
      stale_minutes: undefined,
    },
    heartbeat: {
      heartbeat_id: "hb_1",
      daemon_id: "daemon_1",
      user_id: "",
      metrics: {},
      created_at: "now",
    },
  });
  assert.throws(() => normalizeDaemonHeartbeatResponse({ heartbeat: { heartbeat_id: "hb_1" } }), /daemon/i);

  assert.deepEqual(normalizeUndoActionResponse({
    thread_id: "thread_1",
    checkpoint_message_id: "msg_checkpoint",
    summary: "Reverted",
    target_message_id: 4,
  }), {
    status: "",
    thread_id: "thread_1",
    checkpoint_message_id: "msg_checkpoint",
    revert_request_message_id: "",
    revert_result_message_id: "",
    target_message_id: "",
    summary: "Reverted",
  });
  assert.throws(() => normalizeUndoActionResponse({ thread_id: "thread_1" }), /undo action ids/i);
});

test("cost, billing, and spend normalizers avoid trusting malformed numeric fields", () => {
  assert.deepEqual(normalizeCostSummary({
    user_id: "user_1",
    total_usd: 12.5,
    total_tokens: Number.NaN,
    event_count: 3,
  }), {
    user_id: "user_1",
    total_usd: 12.5,
    total_tokens: 0,
    event_count: 3,
    run_count: 0,
  });

  assert.deepEqual(normalizeCostBudget({
    user_id: 7,
    max_cost_usd: 50,
    max_api_calls: "many",
    max_llm_tokens: 1000,
    soft_limit_ratio: 0.8,
    degradation_policy: "downgrade",
  }), {
    user_id: undefined,
    max_cost_usd: 50,
    max_api_calls: 0,
    max_llm_tokens: 1000,
    soft_limit_ratio: 0.8,
    degradation_policy: "downgrade",
  });

  assert.deepEqual(normalizeCostProfitSummary({
    pricing_tier: "pro",
    margin_guard_active: true,
    deep_queries_today: Number.POSITIVE_INFINITY,
  }).deep_queries_today, 0);

  assert.deepEqual(normalizeSpendHistoryResponse({
    days: 7,
    history: [{ day: "2026-08-13", cost_usd: 1.2, api_calls: "ten", tokens: 300 }, { cost_usd: 2 }],
  }), {
    days: 7,
    history: [{ day: "2026-08-13", cost_usd: 1.2, api_calls: 0, tokens: 300 }],
  });

  assert.deepEqual(normalizeBillingStatus({
      plan: "pro",
      status: "active",
      storage_quota_bytes: 100,
      storage_used_bytes: Number.NaN,
      checkout_available: true,
      quota_state: "ok",
      operational_guidance: {
        status: "no_go",
        summary: "Execute bounded cleanup before trusting runtime pressure state.",
        command: "./scripts/oracle-prune-operational-history.ps1 -Apply",
        source: "artifacts/production-go-no-go-current/production-go-no-go.json",
        pressure_status: "operational_history_present",
        pressure_total_rows: 19800,
        cleanup_mode: "dry_run",
        generated_at: "2026-08-28T08:55:00Z",
      },
    }), {
      plan: "pro",
      status: "active",
      stripe_customer_id: undefined,
    stripe_subscription_id: undefined,
    current_period_end: undefined,
    checkout_available: true,
    billing_portal_available: undefined,
    archive_only_enabled: undefined,
    storage_quota_bytes: 100,
    max_single_upload_bytes: undefined,
    storage_used_bytes: undefined,
    storage_remaining_bytes: undefined,
      storage_addon_count: undefined,
      quota_state: "ok",
      archive_only_available: undefined,
      archive_only_warning: undefined,
      operational_guidance: {
        status: "no_go",
        summary: "Execute bounded cleanup before trusting runtime pressure state.",
        command: "./scripts/oracle-prune-operational-history.ps1 -Apply",
        source: "artifacts/production-go-no-go-current/production-go-no-go.json",
        pressure_status: "operational_history_present",
        pressure_total_rows: 19800,
        cleanup_mode: "dry_run",
        generated_at: "2026-08-28T08:55:00Z",
      },
      external_tool_billing: undefined,
    });

  assert.deepEqual(normalizeBillingStatus({
      plan: "free",
      status: "inactive",
      external_tool_billing: {
      current_month_start: "2026-08-01T00:00:00Z",
      total_estimated_cost_usd: 12.5,
      connected_estimated_cost_usd: 0,
      built_in_estimated_cost_usd: 0,
      currency: "USD",
      coverage: undefined,
      categories: [
        {
          billing_category: "search_api",
          total_quantity: 44,
          total_estimated_cost_usd: 8.25,
          event_count: 3,
        },
      ],
      items: [
        {
          provider_category: "search_api",
          billing_category: "search_api",
          tool_slug: "exa",
          tool_name: "Exa",
          provider_key: "exa",
          provider_origin: "built_in",
          usage_unit: "requests",
          total_quantity: 44,
          total_estimated_cost_usd: 8.25,
          latest_occurred_at: "2026-08-26T12:00:00Z",
          event_count: 3,
        },
      ],
      recent_events: [
        {
          id: "evt_1",
          tool_slug: "exa",
          tool_name: "Exa",
          provider_key: "exa",
          provider_origin: "built_in",
          provider_category: "search_api",
          billing_category: "search_api",
          usage_unit: "requests",
          quantity: 10,
          estimated_cost_usd: 1.2,
          currency: "USD",
          source: "manual",
          occurred_at: "2026-08-26T12:00:00Z",
          recorded_at: "2026-08-26T12:00:01Z",
        },
      ],
      connected_tools: [
        {
          tool_slug: "newsapi-org",
          tool_name: "NewsAPI.org",
          connection_provider: "direct",
          connected_at: "2026-08-26T10:00:00Z",
          provider_key: "newsapi-org",
          provider_origin: "connected",
          provider_category: "news_api",
          billing_model: "free_dev_only",
          pricing_summary: "Free tier allows about 100 requests per day.",
          free_tier_summary: "Dev only",
          production_caveat: "Not licensed for production",
          pricing_source_url: "https://example.test/pricing",
          default_usage_unit: "requests",
        },
      ],
    },
  }), {
    plan: "free",
    status: "inactive",
    stripe_customer_id: undefined,
    stripe_subscription_id: undefined,
    current_period_end: undefined,
    checkout_available: undefined,
    billing_portal_available: undefined,
    archive_only_enabled: undefined,
    storage_quota_bytes: undefined,
    max_single_upload_bytes: undefined,
    storage_used_bytes: undefined,
    storage_remaining_bytes: undefined,
      storage_addon_count: undefined,
      quota_state: undefined,
      archive_only_available: undefined,
      archive_only_warning: undefined,
      operational_guidance: undefined,
      external_tool_billing: {
        current_month_start: "2026-08-01T00:00:00Z",
        total_estimated_cost_usd: 12.5,
      connected_estimated_cost_usd: 0,
      built_in_estimated_cost_usd: 0,
      currency: "USD",
      coverage: undefined,
      categories: [
        {
          billing_category: "search_api",
          total_quantity: 44,
          total_estimated_cost_usd: 8.25,
          event_count: 3,
        },
      ],
      items: [
        {
          provider_category: "search_api",
          billing_category: "search_api",
          tool_slug: "exa",
          tool_name: "Exa",
          provider_key: "exa",
          provider_origin: "built_in",
          usage_unit: "requests",
          total_quantity: 44,
          total_estimated_cost_usd: 8.25,
          latest_occurred_at: "2026-08-26T12:00:00Z",
          event_count: 3,
        },
      ],
      recent_events: [
        {
          id: "evt_1",
          tool_slug: "exa",
          tool_name: "Exa",
          provider_key: "exa",
          provider_origin: "built_in",
          provider_category: "search_api",
          billing_category: "search_api",
          usage_unit: "requests",
          quantity: 10,
          estimated_cost_usd: 1.2,
          currency: "USD",
          source: "manual",
          occurred_at: "2026-08-26T12:00:00Z",
          recorded_at: "2026-08-26T12:00:01Z",
        },
      ],
      connected_tools: [
        {
          tool_slug: "newsapi-org",
          tool_name: "NewsAPI.org",
          connection_provider: "direct",
          connected_at: "2026-08-26T10:00:00Z",
          provider_key: "newsapi-org",
          provider_origin: "connected",
          provider_category: "news_api",
          billing_model: "free_dev_only",
          pricing_summary: "Free tier allows about 100 requests per day.",
          free_tier_summary: "Dev only",
          production_caveat: "Not licensed for production",
          pricing_source_url: "https://example.test/pricing",
          default_usage_unit: "requests",
        },
      ],
    },
  });
  assert.deepEqual(normalizeBillingCheckoutResponse({ url: "https://billing.example.test", plan: "pro" }), {
    url: "https://billing.example.test",
    plan: "pro",
  });
  assert.deepEqual(normalizeAdminThirdPartyToolPolicyPayload({
    policies: [
      {
        toolId: "weatherapi",
        enabledForAllUsers: false,
        enabledForWeddingTemplate: true,
        monthlyFreeQuotaLabel: "1m calls",
        quotaUsedLabel: null,
      },
      {
        toolId: 3,
        enabledForWeddingTemplate: true,
      },
    ],
    updatedAt: "2026-09-25T10:00:00Z",
    sourceLabel: "oracle-admin-policy",
  }), {
    policies: [{
      toolId: "weatherapi",
      enabledForAllUsers: false,
      enabledForWeddingTemplate: true,
      monthlyFreeQuotaLabel: "1m calls",
      quotaUsedLabel: null,
    }],
    updatedAt: "2026-09-25T10:00:00Z",
    sourceLabel: "oracle-admin-policy",
  });
});

test("supertag definition normalizer filters malformed definition rows", () => {
  assert.deepEqual(normalizeSupertagDefinitionsResponse({
    definitions: [
      {
        definition_id: "def_1",
        tag_name: "project:x",
        keywords: ["x", 3],
        folder_scope: ["work"],
        parent_tags: [null, "project"],
        alias_tags: ["x-alias"],
        hierarchy_mode: 4,
        afp_message_id: "msg_1",
      },
      { definition_id: "missing tag name" },
    ],
  }), {
    definitions: [{
      definition_id: "def_1",
      tag_name: "project:x",
      keywords: ["x"],
      folder_scope: ["work"],
      parent_tags: ["project"],
      alias_tags: ["x-alias"],
      hierarchy_mode: "",
      afp_message_id: "msg_1",
      created_at: "",
    }],
  });
});

test("runtime and device normalizers sanitize dashboard containers", () => {
  assert.deepEqual(normalizeDeviceSyncPoliciesResponse({
    entries: [
      { device_id: "device_1", requires_local_key_material: true, sync_slices: { inbox: true }, notes_summary: "bad" },
      { agent_id: "missing device id" },
    ],
  }), {
    entries: [{
      device_id: "device_1",
      agent_id: "",
      device_class: "",
      policy_profile: "",
      sync_slices: { inbox: true },
      requires_local_key_material: true,
      last_bundle_at: "",
      last_used_at: undefined,
      updated_at: "",
      notes_summary: null,
    }],
  });

  assert.deepEqual(normalizeRuntimeBackupsResponse({
    policy: { retention_days: 14, storage_mode: "local", support_disabled_by_default: true },
    entries: [{ id: "backup_1", file_count: Number.NaN, manifest_summary: { files: 3 } }, { status: "missing id" }],
  }), {
    policy: {
      retention_days: 14,
      storage_mode: "local",
      last_snapshot_at: undefined,
      support_disabled_by_default: true,
    },
    entries: [{
      id: "backup_1",
      snapshot_type: "",
      storage_mode: "",
      status: "",
      file_count: 0,
      total_workspace_bytes: 0,
      artifact_size_bytes: 0,
      created_at: "",
      expires_at: "",
      manifest_summary: { files: 3 },
    }],
  });

  assert.deepEqual(normalizeRuntimeRestoreDrillsResponse({
    entries: [{ id: "drill_1", backup_id: "backup_1", completed_at: null, notes_summary: [] }, {}],
  }), {
    entries: [{
      id: "drill_1",
      backup_id: "backup_1",
      status: "",
      started_at: "",
      completed_at: null,
      notes_summary: null,
    }],
  });

  assert.deepEqual(normalizeRuntimeUpdatesResponse({
    policy: { update_channel: "stable", auto_apply: "manual_only" },
    update_available: true,
    entries: [{ id: "update_1", action: "check", notes_summary: { ok: true } }, { action: "missing id" }],
    panel: "bad",
  }), {
    policy: {
      update_channel: "stable",
      auto_apply: "manual_only",
      support_disabled_by_default: false,
    },
    current_version: "",
    latest_version: "",
    update_available: true,
    runtime_status: "",
    framework: undefined,
    last_checked_at: undefined,
    last_applied_at: undefined,
    entries: [{
      id: "update_1",
      action: "check",
      from_version: undefined,
      to_version: undefined,
      status: "",
      created_at: "",
      notes_summary: { ok: true },
    }],
    panel: undefined,
  });
});

test("runtime manifest, recovery packet, token budget, and memory normalizers cover command shells", () => {
  assert.deepEqual(normalizeRuntimeBackupManifestResponse({
    id: "backup_1",
    storage_mode: "local",
    manifest_json: "bad",
  }), {
    id: "backup_1",
    storage_mode: "local",
    created_at: "",
    expires_at: "",
    manifest_json: null,
  });
  assert.throws(() => normalizeRuntimeBackupManifestResponse({ storage_mode: "local" }), /runtime backup manifest/i);

  const packet = normalizeRuntimeRecoveryPacketResponse({
    generated_at: "now",
    user: { id: "user_1", email: "me@example.test" },
    recovery_checklist: ["download", 4],
    privacy_notes: ["local only"],
    runtime_backups: { entries: [{ id: "backup_1" }] },
    runtime_restore_drills: { entries: [{ id: "drill_1" }] },
    runtime_updates: { entries: [{ id: "update_1" }] },
  });
  assert.equal(packet.user.id, "user_1");
  assert.deepEqual(packet.recovery_checklist, ["download"]);
  assert.deepEqual(packet.runtime_backups.entries.map((entry) => entry.id), ["backup_1"]);
  assert.throws(() => normalizeRuntimeRecoveryPacketResponse({ user: null }), /user session/i);

  assert.deepEqual(normalizeTokenBudgetStatus({
    status: "bad",
    budget_cents: 1000,
    used_cents: Number.NaN,
    escalation_enabled: true,
  }), {
    status: "ok",
    budget_cents: 1000,
    used_cents: 0,
    remaining_cents: 0,
    reset_at: "",
    daily_used_tokens: 0,
    daily_limit_tokens: 0,
    usage_pct: 0,
    escalation_enabled: true,
  });

  assert.deepEqual(normalizeAgentMemoryResponse({
    configured: true,
    query: { q: "roadmap" },
    memories: [{ id: "mem_1", content: 3, confidence: Number.POSITIVE_INFINITY, citations: ["c1", 7] }, {}],
    warnings: [{ code: "stale", message: "Index stale", memory_id: null }, { code: "bad" }],
    pointer_bundle: { token_estimate: 42, pointers_text: "Use mem_1", items: "bad" },
  }), {
    configured: true,
    available: undefined,
    source: undefined,
    agent_id: undefined,
    query: { q: "roadmap" },
    memories: [{
      id: "mem_1",
      content: "",
      created_at: "",
      updated_at: undefined,
      tier: undefined,
      type: undefined,
      status: undefined,
      confidence: undefined,
      namespace: undefined,
      role: undefined,
      repo_state_hash: undefined,
      citations: ["c1"],
    }],
    items: undefined,
    evidence: undefined,
    warnings: [{ code: "stale", message: "Index stale", memory_id: null }],
    pointer_bundle: {
      items: [],
      token_estimate: 42,
      pointers_text: "Use mem_1",
      harness: undefined,
    },
    message: undefined,
  });
});

test("runtime workspace normalizers filter malformed files and logs", () => {
  assert.deepEqual(normalizeRuntimeWorkspaceFilesResponse({
    framework: "python",
    active_file_id: 7,
    files: [
      { file_id: "file_1", relative_path: "main.py", label: 5, language: "python", editable: true },
      { file_id: "bad" },
      null,
    ],
  }), {
    framework: "python",
    active_file_id: undefined,
    files: [{
      file_id: "file_1",
      label: "main.py",
      relative_path: "main.py",
      language: "python",
      editable: true,
    }],
  });

  assert.deepEqual(normalizeRuntimeWorkspaceFileResponse({
    file_id: "file_1",
    relative_path: "main.py",
    content: "print('ok')",
    updated_at: 123,
  }), {
    file_id: "file_1",
    label: "main.py",
    relative_path: "main.py",
    language: "",
    editable: false,
    content: "print('ok')",
    updated_at: "",
  });
  assert.equal(normalizeRuntimeWorkspaceFileResponse({ file_id: "file_1", relative_path: "main.py" }), null);

  assert.deepEqual(normalizeRuntimeLogsResponse({ lines: ["one", 2, "two"], source: 7 }), {
    lines: ["one", "two"],
    source: undefined,
  });
  assert.deepEqual(normalizeRuntimeLogsResponse(null), { lines: [] });
});

test("ui command response normalizer sanitizes optional preview fields", () => {
  assert.deepEqual(normalizeUiCommandResponse({
    intent: "orchestrate",
    suggested_view: "threads",
    preferred_view: 4,
    summary: "Plan",
    engine: "primary",
    links: [
      { title: "Doc", url: "/doc", kind: "source", origin: null },
      { title: "Bad" },
    ],
    bullets: ["one", 2, "two"],
    card_id: 17,
    boundary: ["bad"],
    runner_draft: {
      target_file_id: "file_1",
      title: 8,
      content: "print('ok')",
      requires_confirmation: true,
    },
    preview_message: { id: "msg_1", content: {} },
  }), {
    intent: "orchestrate",
    suggested_view: "threads",
    preferred_view: undefined,
    summary: "Plan",
    engine: "primary",
    links: [{ title: "Doc", url: "/doc", kind: "source", origin: null }],
    boundary: undefined,
    bullets: ["one", "two"],
    card_id: undefined,
    preview_message: { id: "msg_1", content: {} },
    runner_draft: {
      target_file_id: "file_1",
      title: "",
      content: "print('ok')",
      requires_confirmation: true,
    },
  });

  assert.deepEqual(normalizeUiCommandResponse(null), {
    intent: "",
    suggested_view: "",
    preferred_view: undefined,
    summary: "",
    engine: "",
    links: [],
    boundary: undefined,
    bullets: [],
    card_id: undefined,
    preview_message: null,
    runner_draft: null,
  });
});

test("dashboard bootstrap normalizer sanitizes core collections without inventing absent sections", () => {
  const normalized = normalizeDashboardBootstrap({
    user: { id: "u1", email: "user@example.com", display_name: 9 },
    agents: [{ agent_id: "agent_1", label: "Primary" }, { label: "bad" }],
    messages: [{ id: "msg_1", thread_id: "thread_1", content: {} }, { thread_id: "bad" }],
    thread_summaries: [{ thread_id: "thread_1", title: "Thread" }, { title: "bad" }],
    thread_retrieval_state: { summary: 7, badges: ["fresh", false] },
    action_log: [
      {
        capability_id: "cap_1",
        thread_id: "thread_1",
        status: 4,
        output: "bad",
        reversible_summary: { reversible: true, undo_label: null },
      },
      { capability_id: "bad" },
    ],
    proactive_suggestions: [{
      id: "sug_1",
      title: "Act",
      provenance_cue: "Traceable to the passive event that triggered this proactive heuristic.",
      autonomy_tier: "notify_then_act",
      autonomy_decision: {
        autonomy_level: "request_approval",
        reversibility: "approval_required",
        consequence_level: "high",
        confidence: "high",
        approval_required: true,
        interruption_budget: "immediate",
        reason: "Outbound send remains approval-gated.",
      },
    }, { title: "bad" }],
    cost_snapshot: { total_usd: 1, total_tokens: "bad", usage_guard_active: true },
    runtime_deployment: {
      id: "dep_1",
      framework: "python",
      status: "running",
      workspace_path: "/tmp/work",
      runtime_monitor: { status: "ok", source: "bootstrap", lines: ["ready", 4], updated_at: 8 },
      runtime_status_views: [{ format: "a2ui.v1", content: {} }, { content: {} }],
    },
    operational_guidance: {
      status: "no_go",
      summary: "Execute the bounded operational-history cleanup, rerun proof, and refresh the gate.",
      command: "./scripts/oracle-prune-operational-history.ps1 -Apply",
      source: "artifacts/production-go-no-go-current/production-go-no-go.json",
      pressure_status: "operational_history_present",
      pressure_total_rows: 19800,
      cleanup_mode: "dry_run",
      generated_at: "2026-08-28T08:55:00Z",
    },
    continuity_brief: { source_type: "watcher", title: 9, decision_count: 2, suggested_actions: ["check", 4] },
    continuity_priority_card: {
      title: "Review renewal",
      description: 7,
      panel_kind: "decision",
      requires_approval: true,
      action_label: "Open",
      approval_or_reversibility_hint: "Remains approval-gated before any action runs.",
      provenance_cue: "Grounded in 1 source reference.",
      autonomy_tier: "ask_always",
      autonomy_decision: {
        autonomy_level: "request_approval",
        reason: "Review before continuing.",
        approval_required: true,
      },
      working_set_refs: ["m8", 1],
      active_topic_refs: ["topic_1", false],
      decision_history_refs: ["decision_1", 2],
      project_refs: ["project_1", null],
      thread_refs: ["thread_9", {}],
      object_refs: ["obj_1", 4],
      thread_retrieval_state: { summary: "fresh", badges: ["recent", false] },
    },
    continuity_action_items: [{
      id: "act_1",
      title: "Call back",
      selection_reason: "Suggested next step stays reviewable before execution.",
      approval_or_reversibility_hint: "Stays reviewable before execution.",
      provenance_cue: "Grounded in 1 source reference.",
      autonomy_tier: "notify_then_act",
      autonomy_decision: {
        autonomy_level: "suggest_with_artifact",
        reason: "Suggested next step stays reviewable before execution.",
        approval_required: false,
      },
      source_refs: ["m1", 9],
    }, { title: "bad" }],
    continuity_response_items: [{
      id: "resp_1",
      title: "Reply",
      autonomy_decision: {
        autonomy_level: "suggest_with_artifact",
        reason: "Suggested response work stays reviewable before any outbound action.",
      },
      prepared_draft_autonomy_decision: {
        autonomy_level: "request_approval",
        reason: "Prepared draft still needs explicit approval before any outbound action.",
        approval_required: true,
      },
      source_refs: ["m2", 6],
    }, {}],
    continuity_prepared_draft_items: [{
      id: "draft_1",
      draft_class: "email_reply",
      title: "Draft",
      approval_or_reversibility_hint: "Prepared draft is review-ready; no outbound action runs until you confirm.",
      provenance_cue: "Grounded in 1 source reference.",
      autonomy_tier: "notify_then_act",
      autonomy_decision: {
        autonomy_level: "suggest_with_artifact",
        reason: "Prepared draft is ready for review before any outbound action.",
      },
      source_refs: ["m3", 1],
    }],
    continuity_context_panel_items: [{ id: "ctx_1", label: "Why now", relation_path: ["goal", 5], source_refs: ["m4"] }],
    continuity_watcher_signals: [{ id: "sig_1", signal_key: "renewal", source_refs: ["m5", false] }],
    continuity_context_pack_items: [{ id: "pack_1", pack_kind: "email", title: "Pack", source_refs: ["m6"], evidence_kinds: ["thread", 8] }],
    continuity_state_fields: [{ field_key: "energy", label: "Energy", evidence_refs: ["m7", 3] }],
    conversation_attention_items: [{
      id: "att_1",
      provider: "gmail",
      account_ref: "acct",
      conversation_key: "conv",
      conversation_family: "communications",
      display_label: "Inbox follow-up",
      last_observed_at: "2026-08-13T00:00:00Z",
      needs_attention: true,
      latest_attention_kind: "review",
      summary: 5,
      latest_requires_signature: "yes",
    }],
    conversation_attention_summary: { count: 3, prepared_draft_count: "bad", approval_request_count: 1 },
    workflow_runtime_summary: { workflow_count: 4, active_run_count: "bad" },
    browser_runtime_summary: { task_count: 5, active_task_count: 2, latest_task_goal: 9 },
    task_runtime_summary: { active_draft_task_count: 1, total_draft_task_count: 2, latest_draft_task_id: 7 },
    calendar_runtime_summary: { tentative_hold_count: 1, confirmed_event_count: 2, latest_tentative_prep_lead_minutes: "bad" },
    trust_runtime_summary: { provenance_record_count: 3, audited_action_count: "bad" },
    file_runtime_summary: {
      ledger_create_count: 6,
      latest_ledger_name: 9,
      latest_action_message_id: "msg_file_action_1",
      latest_action_thread_id: 42,
    },
    inbox_runtime_summary: { active_staged_organization_count: 1, latest_provider: false },
    device_sync_runtime_summary: { device_policy_count: 2, used_device_count: 1, latest_device_class: 9 },
    simulator_runtime_summary: {
      enabled_surface_count: 2,
      promotion_enabled_surface_count: "bad",
      review_surface_count: 1,
      sampled_surface_count: null,
      highest_rollout_stage: 7,
      policy_posture_summary: 8,
      latest_observed_at: 8,
      observed_rollout_stage: false,
      observed_calibration_mode: {},
      observed_projection_summary: ["bad"],
      observed_review_summary: 9,
      observed_actionable_event_count: "bad",
      observed_promotion_candidate_count: {},
      observed_review_surface_count: null,
      observed_calibration_notes: ["Deterministic bounded preview stayed within a single rollout.", 9],
      rollout_alignment_status: 6,
      rollout_alignment_summary: false,
      surfaces: [
        {
          surface: "planning",
          enabled: true,
          allow_promotion: false,
          probabilistic_sampling_enabled: false,
          review_surfaces_enabled: false,
          rollout_stage: "shadow",
          calibration_mode: "bounded_deterministic",
          policy_summary: "Simulator preview stays bounded on planning without promotion write-back.",
          calibration_notes: ["Promotion write-back is suppressed by rollout policy."],
        },
        {
          surface: 9,
        },
      ],
    },
    support_access: { status: "granted", access_scope: "runtime", support_disabled_by_default: true, reason: 9 },
    support_access_history: [{ id: "sa_1", status: "granted", access_scope: "runtime", granted_at: "2026-08-13T00:00:00Z", expires_at: "2026-08-14T00:00:00Z" }, {}],
  });

  assert.deepEqual(normalized.user, {
    id: "u1",
    email: "user@example.com",
    display_name: "user@example.com",
    auth_provider: "",
  });
  assert.deepEqual(normalized.agents, [{ agent_id: "agent_1", label: "Primary" }]);
  assert.equal(normalized.messages.length, 1);
  assert.equal(normalized.thread_summaries?.length, 1);
  assert.deepEqual(normalized.thread_retrieval_state, { summary: "", badges: ["fresh"] });
  assert.deepEqual(normalized.action_log?.[0]?.output, {});
  assert.equal(normalized.proactive_suggestions?.length, 1);
  assert.equal(
    normalized.proactive_suggestions?.[0]?.provenance_cue,
    "Traceable to the passive event that triggered this proactive heuristic.",
  );
  assert.equal(normalized.proactive_suggestions?.[0]?.topology_budget_used, 0);
  assert.equal(normalized.proactive_suggestions?.[0]?.working_set_count, 0);
  assert.equal(normalized.proactive_suggestions?.[0]?.active_topic_count, 0);
  assert.equal(normalized.proactive_suggestions?.[0]?.source_count, 0);
  assert.deepEqual(normalized.proactive_suggestions?.[0]?.artifact_summary_lines, []);
  assert.deepEqual(normalized.proactive_suggestions?.[0]?.source_refs, []);
  assert.deepEqual(normalized.proactive_suggestions?.[0]?.reference_refs, []);
  assert.deepEqual(normalized.proactive_suggestions?.[0]?.reference_labels, []);
  assert.deepEqual(normalized.proactive_suggestions?.[0]?.object_refs, []);
  assert.deepEqual(normalized.proactive_suggestions?.[0]?.object_labels, []);
  assert.deepEqual(normalized.proactive_suggestions?.[0]?.file_refs, []);
  assert.deepEqual(normalized.proactive_suggestions?.[0]?.file_labels, []);
  assert.deepEqual(normalized.proactive_suggestions?.[0]?.anchor_refs, []);
  assert.deepEqual(normalized.proactive_suggestions?.[0]?.evidence_kinds, []);
  assert.equal(normalized.proactive_suggestions?.[0]?.autonomy_tier, "notify_then_act");
  assert.deepEqual(normalized.proactive_suggestions?.[0]?.autonomy_decision, {
    autonomy_level: "request_approval",
    reversibility: "approval_required",
    consequence_level: "high",
    confidence: "high",
    approval_required: true,
    interruption_budget: "immediate",
    reason: "Outbound send remains approval-gated.",
  });
  assert.equal(normalized.cost_snapshot?.total_tokens, 0);
  assert.equal(normalized.cost_snapshot?.usage_guard_active, true);
  assert.deepEqual(normalized.continuity_brief, {
    source_type: "watcher",
    title: "",
    decision_count: 2,
    commitment_count: 0,
    critical_change_count: 0,
    suggested_actions: ["check"],
    staleness_at: undefined,
  });
  assert.deepEqual(normalized.continuity_priority_card?.thread_retrieval_state, {
    summary: "fresh",
    badges: ["recent"],
  });
  assert.equal(normalized.continuity_priority_card?.topology_budget_used, 0);
  assert.equal(normalized.continuity_priority_card?.working_set_count, 0);
  assert.equal(normalized.continuity_priority_card?.active_topic_count, 0);
  assert.deepEqual(normalized.continuity_priority_card?.working_set_refs, ["m8"]);
  assert.deepEqual(normalized.continuity_priority_card?.active_topic_refs, ["topic_1"]);
  assert.deepEqual(normalized.continuity_priority_card?.decision_history_refs, ["decision_1"]);
  assert.deepEqual(normalized.continuity_priority_card?.project_refs, ["project_1"]);
  assert.deepEqual(normalized.continuity_priority_card?.thread_refs, ["thread_9"]);
  assert.deepEqual(normalized.continuity_priority_card?.object_labels, []);
  assert.deepEqual(normalized.continuity_priority_card?.file_refs, []);
  assert.deepEqual(normalized.continuity_priority_card?.file_labels, []);
  assert.deepEqual(normalized.continuity_priority_card?.autonomy_decision, {
    autonomy_level: "request_approval",
    reversibility: "approval_required",
    consequence_level: undefined,
    confidence: undefined,
    approval_required: true,
    interruption_budget: undefined,
    reason: "Review before continuing.",
  });
  assert.equal(
    normalized.continuity_priority_card?.approval_or_reversibility_hint,
    "Remains approval-gated before any action runs.",
  );
  assert.equal(
    normalized.continuity_priority_card?.provenance_cue,
    "Grounded in 1 source reference.",
  );
  assert.equal(normalized.continuity_priority_card?.autonomy_tier, "ask_always");
  assert.deepEqual(normalized.continuity_action_items?.[0]?.source_refs, ["m1"]);
  assert.equal(
    normalized.continuity_action_items?.[0]?.selection_reason,
    "Suggested next step stays reviewable before execution.",
  );
  assert.equal(
    normalized.continuity_action_items?.[0]?.approval_or_reversibility_hint,
    "Stays reviewable before execution.",
  );
  assert.equal(
    normalized.continuity_action_items?.[0]?.provenance_cue,
    "Grounded in 1 source reference.",
  );
  assert.equal(
    normalized.continuity_action_items?.[0]?.autonomy_tier,
    "notify_then_act",
  );
  assert.deepEqual(normalized.continuity_action_items?.[0]?.autonomy_decision, {
    autonomy_level: "suggest_with_artifact",
    reversibility: undefined,
    consequence_level: undefined,
    confidence: undefined,
    approval_required: false,
    interruption_budget: undefined,
    reason: "Suggested next step stays reviewable before execution.",
  });
  assert.equal(normalized.continuity_response_items?.length, 1);
  assert.deepEqual(normalized.continuity_response_items?.[0]?.autonomy_decision, {
    autonomy_level: "suggest_with_artifact",
    reversibility: undefined,
    consequence_level: undefined,
    confidence: undefined,
    approval_required: undefined,
    interruption_budget: undefined,
    reason: "Suggested response work stays reviewable before any outbound action.",
  });
  assert.deepEqual(normalized.continuity_response_items?.[0]?.prepared_draft_autonomy_decision, {
    autonomy_level: "request_approval",
    reversibility: "approval_required",
    consequence_level: undefined,
    confidence: undefined,
    approval_required: true,
    interruption_budget: undefined,
    reason: "Prepared draft still needs explicit approval before any outbound action.",
  });
  assert.equal(
    normalized.continuity_prepared_draft_items?.[0]?.approval_or_reversibility_hint,
    "Prepared draft is review-ready; no outbound action runs until you confirm.",
  );
  assert.equal(
    normalized.continuity_prepared_draft_items?.[0]?.provenance_cue,
    "Grounded in 1 source reference.",
  );
  assert.equal(
    normalized.continuity_prepared_draft_items?.[0]?.autonomy_tier,
    "notify_then_act",
  );
  assert.deepEqual(normalized.continuity_prepared_draft_items?.[0]?.autonomy_decision, {
    autonomy_level: "suggest_with_artifact",
    reversibility: undefined,
    consequence_level: undefined,
    confidence: undefined,
    approval_required: undefined,
    interruption_budget: undefined,
    reason: "Prepared draft is ready for review before any outbound action.",
  });
  assert.deepEqual(normalized.continuity_context_panel_items?.[0]?.relation_path, ["goal"]);
  assert.deepEqual(normalized.continuity_watcher_signals?.[0]?.source_refs, ["m5"]);
  assert.deepEqual(normalized.continuity_context_pack_items?.[0]?.evidence_kinds, ["thread"]);
  assert.deepEqual(normalized.continuity_state_fields?.[0]?.evidence_refs, ["m7"]);
  assert.equal(normalized.conversation_attention_items?.[0]?.summary, "");
  assert.equal(normalized.conversation_attention_items?.[0]?.latest_requires_signature, undefined);
  assert.deepEqual(normalized.conversation_attention_summary, {
    count: 3,
    prepared_draft_count: 0,
    approval_request_count: 1,
    background_follow_up_count: 0,
    communication_count: undefined,
    renewal_count: undefined,
    bill_count: undefined,
    form_count: undefined,
  });
  assert.equal(normalized.workflow_runtime_summary?.active_run_count, 0);
  assert.equal(normalized.browser_runtime_summary?.latest_task_goal, undefined);
  assert.equal(normalized.task_runtime_summary?.latest_draft_task_id, undefined);
  assert.equal(normalized.calendar_runtime_summary?.latest_tentative_prep_lead_minutes, undefined);
  assert.equal(normalized.trust_runtime_summary?.audited_action_count, 0);
  assert.equal(normalized.file_runtime_summary?.latest_ledger_name, undefined);
  assert.equal(
    normalized.file_runtime_summary?.latest_action_message_id,
    "msg_file_action_1",
  );
  assert.equal(normalized.file_runtime_summary?.latest_action_thread_id, undefined);
  assert.equal(normalized.inbox_runtime_summary?.latest_provider, undefined);
  assert.equal(normalized.device_sync_runtime_summary?.latest_device_class, undefined);
  assert.equal(normalized.simulator_runtime_summary?.promotion_enabled_surface_count, 0);
  assert.equal(normalized.simulator_runtime_summary?.sampled_surface_count, 0);
  assert.equal(normalized.simulator_runtime_summary?.highest_rollout_stage, "");
  assert.equal(normalized.simulator_runtime_summary?.policy_posture_summary, "");
  assert.equal(normalized.simulator_runtime_summary?.latest_observed_at, undefined);
  assert.equal(normalized.simulator_runtime_summary?.observed_rollout_stage, undefined);
  assert.equal(normalized.simulator_runtime_summary?.observed_calibration_mode, undefined);
  assert.equal(normalized.simulator_runtime_summary?.observed_projection_summary, undefined);
  assert.equal(normalized.simulator_runtime_summary?.observed_review_summary, undefined);
  assert.equal(normalized.simulator_runtime_summary?.observed_actionable_event_count, undefined);
  assert.equal(normalized.simulator_runtime_summary?.observed_promotion_candidate_count, undefined);
  assert.equal(normalized.simulator_runtime_summary?.observed_review_surface_count, null);
  assert.deepEqual(normalized.simulator_runtime_summary?.observed_calibration_notes, [
    "Deterministic bounded preview stayed within a single rollout.",
  ]);
  assert.equal(normalized.simulator_runtime_summary?.rollout_alignment_status, "");
  assert.equal(normalized.simulator_runtime_summary?.rollout_alignment_summary, "");
  assert.deepEqual(normalized.simulator_runtime_summary?.surfaces, [{
    surface: "planning",
    enabled: true,
    allow_promotion: false,
    probabilistic_sampling_enabled: false,
    review_surfaces_enabled: false,
    rollout_stage: "shadow",
    calibration_mode: "bounded_deterministic",
    policy_summary: "Simulator preview stays bounded on planning without promotion write-back.",
    calibration_notes: ["Promotion write-back is suppressed by rollout policy."],
  }]);
  assert.deepEqual(normalized.support_access, {
    status: "granted",
    access_scope: "runtime",
    reason: undefined,
    support_disabled_by_default: true,
    granted_at: undefined,
    expires_at: undefined,
    revoked_at: undefined,
  });
  assert.equal(normalized.support_access_history?.length, 1);
  assert.deepEqual(normalized.runtime_deployment?.runtime_monitor?.lines, ["ready"]);
  assert.equal(normalized.runtime_deployment?.runtime_status_views?.length, 1);
  assert.deepEqual(normalized.operational_guidance, {
    status: "no_go",
    summary: "Execute the bounded operational-history cleanup, rerun proof, and refresh the gate.",
    command: "./scripts/oracle-prune-operational-history.ps1 -Apply",
    source: "artifacts/production-go-no-go-current/production-go-no-go.json",
    pressure_status: "operational_history_present",
    pressure_total_rows: 19800,
    cleanup_mode: "dry_run",
    generated_at: "2026-08-28T08:55:00Z",
  });
  assert.equal(normalized.runtime_updates, undefined);
  assert.equal(normalized.device_sync_policies, undefined);
});

test("dashboard bootstrap normalizer requires a user session", () => {
  assert.throws(() => normalizeDashboardBootstrap({ messages: [] }), /user session/i);
  assert.throws(() => normalizeDashboardBootstrap(null), /dashboard bootstrap/i);
});

test("dashboard bootstrap normalizer accepts rust-style autonomy decision fields", () => {
  const normalized = normalizeDashboardBootstrap({
    user: { id: "u1", email: "user@example.com", display_name: "User" },
    proactive_suggestions: [{
      id: "sug_rust_1",
      title: "Review suggestion",
      provenance_cue: "Traceable to proactive heuristic workflow-failure-notify.",
      autonomy_tier: "notify_then_act",
      autonomy_decision: {
        autonomy_level: "suggest_with_artifact",
        reversible: true,
        consequence: "low",
        approval_required: false,
        interruption_budget: "low",
        rationale: "Prepared suggestion remains reviewable.",
      },
    }],
  });

  assert.equal(
    normalized.proactive_suggestions?.[0]?.provenance_cue,
    "Traceable to proactive heuristic workflow-failure-notify.",
  );
  assert.equal(normalized.proactive_suggestions?.[0]?.autonomy_tier, "notify_then_act");
  assert.deepEqual(normalized.proactive_suggestions?.[0]?.autonomy_decision, {
    autonomy_level: "suggest_with_artifact",
    reversibility: "reversible",
    consequence_level: "low",
    confidence: undefined,
    approval_required: false,
    interruption_budget: "low",
    reason: "Prepared suggestion remains reviewable.",
  });
});

test("dashboard bootstrap normalizer drops malformed autonomy tiers while preserving structured decisions", () => {
  const normalized = normalizeDashboardBootstrap({
    user: { id: "u1", email: "user@example.com", display_name: "User" },
    proactive_suggestions: [{
      id: "sug_bad_tier_1",
      title: "Review suggestion",
      autonomy_tier: "definitely_auto",
      autonomy_decision: {
        autonomy_level: "request_approval",
        reversible: false,
        consequence: "high",
        approval_required: true,
        interruption_budget: "high",
        rationale: "Legacy malformed tier should not leak into client state.",
      },
    }],
  });

  assert.equal(normalized.proactive_suggestions?.[0]?.autonomy_tier, undefined);
  assert.deepEqual(normalized.proactive_suggestions?.[0]?.autonomy_decision, {
    autonomy_level: "request_approval",
    reversibility: "approval_required",
    consequence_level: "high",
    confidence: undefined,
    approval_required: true,
    interruption_budget: "high",
    reason: "Legacy malformed tier should not leak into client state.",
  });
});

test("dashboard bootstrap normalizer fail-closes continuity metadata defaults across priority and proactive surfaces", () => {
  const normalized = normalizeDashboardBootstrap({
    user: { id: "u1", email: "user@example.com", display_name: "User" },
    proactive_suggestions: [{
      id: "sug_ctx_1",
      kind: "context_ready",
      title: "Prepared context packet",
      topology_budget_used: "bad",
      working_set_count: null,
      active_topic_count: {},
      working_set_refs: "bad",
      active_topic_refs: "bad",
      source_count: "bad",
      source_refs: "bad",
      reference_refs: "bad",
      decision_history_refs: "bad",
      project_refs: "bad",
      reference_labels: "bad",
      object_refs: "bad",
      object_labels: "bad",
      thread_refs: "bad",
      file_refs: "bad",
      file_labels: "bad",
      anchor_refs: "bad",
      evidence_kinds: "bad",
      artifact_summary_lines: "bad",
    }],
    continuity_priority_card: {
      title: "Review packet",
      description: "Prepared context is ready.",
      panel_kind: "context_ready",
      requires_approval: false,
      action_label: "Open",
      topology_budget_used: "bad",
      working_set_count: null,
      active_topic_count: {},
      working_set_refs: "bad",
      active_topic_refs: "bad",
      decision_history_refs: "bad",
      project_refs: "bad",
      thread_refs: "bad",
      object_refs: "bad",
      object_labels: "bad",
      file_refs: "bad",
      file_labels: "bad",
    },
  });

  assert.equal(normalized.proactive_suggestions?.[0]?.topology_budget_used, 0);
  assert.equal(normalized.proactive_suggestions?.[0]?.working_set_count, 0);
  assert.equal(normalized.proactive_suggestions?.[0]?.active_topic_count, 0);
  assert.deepEqual(normalized.proactive_suggestions?.[0]?.working_set_refs, []);
  assert.deepEqual(normalized.proactive_suggestions?.[0]?.active_topic_refs, []);
  assert.equal(normalized.proactive_suggestions?.[0]?.source_count, 0);
  assert.deepEqual(normalized.proactive_suggestions?.[0]?.source_refs, []);
  assert.deepEqual(normalized.proactive_suggestions?.[0]?.reference_refs, []);
  assert.deepEqual(normalized.proactive_suggestions?.[0]?.decision_history_refs, []);
  assert.deepEqual(normalized.proactive_suggestions?.[0]?.project_refs, []);
  assert.deepEqual(normalized.proactive_suggestions?.[0]?.reference_labels, []);
  assert.deepEqual(normalized.proactive_suggestions?.[0]?.object_refs, []);
  assert.deepEqual(normalized.proactive_suggestions?.[0]?.object_labels, []);
  assert.deepEqual(normalized.proactive_suggestions?.[0]?.thread_refs, []);
  assert.deepEqual(normalized.proactive_suggestions?.[0]?.file_refs, []);
  assert.deepEqual(normalized.proactive_suggestions?.[0]?.file_labels, []);
  assert.deepEqual(normalized.proactive_suggestions?.[0]?.anchor_refs, []);
  assert.deepEqual(normalized.proactive_suggestions?.[0]?.evidence_kinds, []);
  assert.deepEqual(normalized.proactive_suggestions?.[0]?.artifact_summary_lines, []);

  assert.equal(normalized.continuity_priority_card?.topology_budget_used, 0);
  assert.equal(normalized.continuity_priority_card?.working_set_count, 0);
  assert.equal(normalized.continuity_priority_card?.active_topic_count, 0);
  assert.deepEqual(normalized.continuity_priority_card?.working_set_refs, []);
  assert.deepEqual(normalized.continuity_priority_card?.active_topic_refs, []);
  assert.deepEqual(normalized.continuity_priority_card?.decision_history_refs, []);
  assert.deepEqual(normalized.continuity_priority_card?.project_refs, []);
  assert.deepEqual(normalized.continuity_priority_card?.thread_refs, []);
  assert.deepEqual(normalized.continuity_priority_card?.object_refs, []);
  assert.deepEqual(normalized.continuity_priority_card?.object_labels, []);
  assert.deepEqual(normalized.continuity_priority_card?.file_refs, []);
  assert.deepEqual(normalized.continuity_priority_card?.file_labels, []);
});

test("workflow lifecycle normalizers sanitize list and command shells", () => {
  assert.deepEqual(normalizeSavedWorkflowResponse({
    workflow_id: "wf_1",
    title: "Draft",
    preset_kinds: ["email", 7],
    graph: "bad",
    latest_ir: {
      manifests: [{ id: "m1" }, "bad"],
      edges: [{ from: "a", to: "b" }, false],
      activation_registration_preview: {
        status: "ready",
        activation_count: 2,
        live_registration_supported: true,
        family_counts: { email: 1, bad: "x" },
        registration_targets: ["gmail", 5],
      },
    },
  }), {
    workflow_id: "wf_1",
    owner_user_id: "",
    title: "Draft",
    description: undefined,
    favorite: false,
    preset_kinds: ["email"],
    graph: {},
    latest_ir: {
      manifests: [{ id: "m1" }],
      edges: [{ from: "a", to: "b" }],
      activation_registration_preview: {
        status: "ready",
        activation_count: 2,
        live_registration_supported: true,
        family_counts: { email: 1 },
        registration_target_counts: {},
        runtime_requirement_counts: {},
        registration_targets: ["gmail"],
        runtime_requirements: [],
        missing_runtime_capabilities: [],
        next_dependency: undefined,
      },
    },
    trigger_readiness_summary: undefined,
    created_at: "",
    updated_at: "",
    archived_at: undefined,
  });
  assert.throws(() => normalizeSavedWorkflowResponse({ title: "missing id" }), /workflow/i);

  assert.deepEqual(normalizeWorkflowListResponse({
    workflows: [
      { workflow_id: "wf_list_1", graph: {}, preset_kinds: ["alpha", 3] },
      { title: "bad" },
    ],
  }).workflows, [{
    workflow_id: "wf_list_1",
    owner_user_id: "",
    title: "wf_list_1",
    description: undefined,
    favorite: false,
    preset_kinds: ["alpha"],
    graph: {},
    latest_ir: undefined,
    trigger_readiness_summary: undefined,
    created_at: "",
    updated_at: "",
    archived_at: undefined,
  }]);

  assert.deepEqual(normalizeWorkflowValidationResponse({
    valid: true,
    errors: ["bad edge", 7],
    warnings: ["slow"],
    summary: {
      workflow_id: 42,
      node_count: 3,
      edge_count: Number.NaN,
      compiled: {
        manifest_count: 2,
        runtime_kind_counts: { browser: 1, bad: "x" },
        afp_message_family_counts: { task: 4 },
      },
    },
    template_suggestions: [{ title: "Daily brief", score: Number.NaN, semantic_roles: ["summary", 3] }, {}],
  }), {
    valid: true,
    errors: ["bad edge"],
    warnings: ["slow"],
    summary: {
      workflow_id: undefined,
      node_count: 3,
      edge_count: 0,
      compiled: {
        manifest_count: 2,
        runtime_kind_counts: { browser: 1 },
        afp_message_family_counts: { task: 4 },
        approval_manifest_count: 0,
        wait_resume_count: 0,
      },
      trigger_readiness_summary: undefined,
    },
    template_suggestions: [{
      title: "Daily brief",
      score: 0,
      template_id: "",
      workflow_family: "",
      implementation_status: "",
      reliability: "",
      already_aligned: false,
      rationale: "",
      advisory: "",
      semantic_roles: ["summary"],
      matched_node_ids: [],
    }],
  });

  assert.deepEqual(normalizeWorkflowCompileResponse({
    compiled: true,
    workflow_id: "wf_1",
    ir: {
      manifests: [{ id: "m2" }, "bad"],
      activation_registration_preview: { activation_count: 1, registration_targets: ["slack", 9] },
    },
    trigger_readiness_summary: { activation_count: Number.POSITIVE_INFINITY, registration_targets: ["gmail", 3] },
  }), {
    compiled: true,
    workflow_id: "wf_1",
    ir: {
      manifests: [{ id: "m2" }],
      activation_registration_preview: {
        status: "",
        activation_count: 1,
        live_registration_supported: false,
        family_counts: {},
        registration_target_counts: {},
        runtime_requirement_counts: {},
        registration_targets: ["slack"],
        runtime_requirements: [],
        missing_runtime_capabilities: [],
        next_dependency: undefined,
      },
    },
    trigger_readiness_summary: {
      status: undefined,
      live_registration_supported: undefined,
      activation_count: undefined,
      registration_targets: ["gmail"],
      runtime_requirements: undefined,
      missing_runtime_capabilities: undefined,
    },
  });
  assert.throws(() => normalizeWorkflowCompileResponse({ compiled: true }), /compiled workflow id/i);

  assert.deepEqual(normalizeWorkflowDeploymentsResponse({
    workflow_id: "wf_1",
    deployments: [{ deployment_id: "dep_1", ir_snapshot: { ok: true }, graph_snapshot: "bad" }, {}],
  }).deployments[0], {
    deployment_id: "dep_1",
    workflow_id: "",
    owner_user_id: "",
    environment: "",
    status: "",
    ir_snapshot: { ok: true },
    trigger_readiness_summary: undefined,
    graph_snapshot: {},
    source_deployment_id: undefined,
    deployed_at: "",
    created_at: "",
  });

  assert.deepEqual(normalizeWorkflowRunsResponse({
    workflow_id: "wf_1",
    runs: [{ run_id: "run_1", timeline: [{ step: 1 }, "bad"], result: "bad" }, {}],
  }).runs[0], {
    run_id: "run_1",
    workflow_id: "",
    deployment_id: "",
    owner_user_id: "",
    status: "",
    trigger_kind: "",
    replay_of_run_id: undefined,
    timeline: [{ step: 1 }],
    result: {},
    started_at: "",
    completed_at: undefined,
    created_at: "",
  });
});

test("workflow command normalizers require durable ids", () => {
  const workflow = { workflow_id: "wf_1", title: "Draft" };
  const run = { run_id: "run_1", workflow_id: "wf_1", timeline: [], result: {} };

  assert.deepEqual(normalizeWorkflowDescribeResponse({
    described: true,
    intent_expansion: { optimization_mode: "speed", requires_approval: true },
    workflow,
  }), {
    described: true,
    saved: undefined,
    intent_expansion: {
      preset_kind: "",
      requires_approval: true,
      needs_branching: false,
      needs_research_support: false,
      public_output: false,
      optimization_mode: "speed",
    },
    workflow: {
      workflow_id: "wf_1",
      owner_user_id: "",
      title: "Draft",
      description: undefined,
      favorite: false,
      preset_kinds: [],
      graph: {},
      latest_ir: undefined,
      trigger_readiness_summary: undefined,
      created_at: "",
      updated_at: "",
      archived_at: undefined,
    },
  });
  assert.throws(() => normalizeWorkflowDescribeResponse({ described: true }), /described workflow/i);

  assert.deepEqual(normalizeWorkflowRunStartResponse({ started: true, run }), {
    started: true,
    workflow_id: "wf_1",
    run: {
      run_id: "run_1",
      workflow_id: "wf_1",
      deployment_id: "",
      owner_user_id: "",
      status: "",
      trigger_kind: "",
      replay_of_run_id: undefined,
      timeline: [],
      result: {},
      started_at: "",
      completed_at: undefined,
      created_at: "",
    },
  });
  assert.throws(() => normalizeWorkflowRunStartResponse({ started: true }), /started workflow run/i);

  assert.deepEqual(normalizeWorkflowWaitResumeListResponse({
    workflow_id: "wf_1",
    run_id: "run_1",
    wait_resume_records: [{ wait_resume_id: "wait_1", descriptor: "bad" }, {}],
  }).wait_resume_records[0]?.descriptor, {});

  assert.deepEqual(normalizeWorkflowWaitResumeDecisionResponse({
    updated: true,
    wait_resume_id: "wait_1",
    decision: "unsupported",
    run,
    decision_dispatch: "bad",
  }).decision, "approved");
  assert.throws(() => normalizeWorkflowWaitResumeDecisionResponse({ wait_resume_id: "wait_1" }), /wait\/resume decision/i);

  assert.deepEqual(normalizeWorkflowActionResponse({
    updated: true,
    deployment_id: 7,
    workflow,
  }), {
    updated: true,
    deployment_id: undefined,
    trigger_readiness_summary: undefined,
    workflow: {
      workflow_id: "wf_1",
      owner_user_id: "",
      title: "Draft",
      description: undefined,
      favorite: false,
      preset_kinds: [],
      graph: {},
      latest_ir: undefined,
      trigger_readiness_summary: undefined,
      created_at: "",
      updated_at: "",
      archived_at: undefined,
    },
  });
  assert.throws(() => normalizeWorkflowActionResponse({ updated: true }), /updated workflow/i);

  assert.deepEqual(normalizeWorkflowTriggerDispatchResponse({ registration_id: "reg_1", dispatched: true }), {
    dispatched: true,
    workflow_id: "",
    deployment_id: "",
    registration_id: "reg_1",
    activation_id: "",
    trigger_kind: "",
    provisional_run_id: "",
    note: "",
  });
  assert.throws(() => normalizeWorkflowTriggerDispatchResponse({ dispatched: true }), /registration id/i);

  assert.deepEqual(normalizeInternalWorkflowEventIngestResponse({ event_id: "evt_1", event_type: 7 }), {
    event_id: "evt_1",
    event_type: "",
    status: "queued",
  });
  assert.throws(() => normalizeInternalWorkflowEventIngestResponse({ status: "queued" }), /workflow event id/i);

  assert.deepEqual(normalizeWorkflowWebhookIngressResponse({ registration_id: "reg_1", accepted: true }), {
    accepted: true,
    registration_id: "reg_1",
    workflow_id: "",
    trigger_kind: "",
    provisional_run_id: "",
    note: "",
  });
  assert.throws(() => normalizeWorkflowWebhookIngressResponse({ accepted: true }), /webhook registration id/i);
});
