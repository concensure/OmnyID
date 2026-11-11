// @locs-version: 2.0
// A slice, not a fixed-size array: a hardcoded length here has previously drifted out of
// sync with the actual entry count (caught by `cargo check` failing after adding a new
// migration), silently breaking the build. A slice can't drift — its length is inherent.
pub const MIGRATIONS: &[(&str, &str, &str)] = &[
    (
        "0001_init",
        "Initial Omnyid schema baseline",
        include_str!("../../postgres/migrations/0001_init.sql"),
    ),
    (
        "0002_workflow_state",
        "Workflow state, delivery receipts, sync devices, and personalization tables",
        include_str!("../../postgres/migrations/0002_workflow_state.sql"),
    ),
    (
        "0003_accounts",
        "User accounts, sessions, and managed agent records",
        include_str!("../../postgres/migrations/0003_accounts.sql"),
    ),
    (
        "0004_runtime_deployments",
        "Per-user runtime deployment records for isolated agent frameworks",
        include_str!("../../postgres/migrations/0004_runtime_deployments.sql"),
    ),
    (
        "0005_user_onboarding",
        "Persisted onboarding state for account setup and gated runtime deployment",
        include_str!("../../postgres/migrations/0005_user_onboarding.sql"),
    ),
    (
        "0006_waitlist_submissions",
        "Persisted waitlist submissions with delivery fallback state",
        include_str!("../../postgres/migrations/0006_waitlist_submissions.sql"),
    ),
    (
        "0007_support_access",
        "Support access grants with time-limited consent and revoke support",
        include_str!("../../postgres/migrations/0007_support_access.sql"),
    ),
    (
        "0008_runtime_backups",
        "Hosted runtime backup metadata, retention policy, and snapshot inventory",
        include_str!("../../postgres/migrations/0008_runtime_backups.sql"),
    ),
    (
        "0009_runtime_restore_drills",
        "Runtime restore drill records for backup rehearsal and audit history",
        include_str!("../../postgres/migrations/0009_runtime_restore_drills.sql"),
    ),
    (
        "0010_runtime_update_policies",
        "Hosted runtime update policies for scaffold refresh checks and manual apply control",
        include_str!("../../postgres/migrations/0010_runtime_update_policies.sql"),
    ),
    (
        "0011_runtime_update_audit",
        "Hosted runtime update check and apply audit events",
        include_str!("../../postgres/migrations/0011_runtime_update_audit.sql"),
    ),
    (
        "0012_sync_device_policies",
        "Per-device sync policy registry for local-first clients",
        include_str!("../../postgres/migrations/0012_sync_device_policies.sql"),
    ),
    (
        "0013_sync_device_tokens",
        "Per-device sync access tokens for local-first client boundaries",
        include_str!("../../postgres/migrations/0013_sync_device_tokens.sql"),
    ),
    (
        "0014_runtime_runner_policy_events",
        "Metadata-only audit history for hosted Python runner policy changes",
        include_str!("../../postgres/migrations/0014_runtime_runner_policy_events.sql"),
    ),
    (
        "0015_peer_key_cache",
        "Durable peer key cache and key rotation audit for Phase 2 key lifecycle",
        include_str!("../../postgres/migrations/0015_peer_key_cache.sql"),
    ),
    (
        "0016_billing",
        "Billing subscriptions and Stripe webhook event history for Phase 12 cloud tier",
        include_str!("../../postgres/migrations/0016_billing.sql"),
    ),
    (
        "0017_agent_template",
        "Per-user agent instances, task queue, LLM config, and usage log with RLS",
        include_str!("../../postgres/migrations/0017_agent_template.sql"),
    ),
    (
        "0018_webauthn",
        "Passkey credentials and ephemeral challenges for WebAuthn/passkey authentication",
        include_str!("../../postgres/migrations/0018_webauthn.sql"),
    ),
    (
        "0019_master_agent",
        "Master agent orchestration: soul/memory, ephemeral agents, LoRA, focus items, triggers, delegations",
        include_str!("../../postgres/migrations/0019_master_agent.sql"),
    ),
    (
        "0020_gmail_tokens",
        "Per-user Gmail OAuth token storage",
        include_str!("../../postgres/migrations/0020_gmail_tokens.sql"),
    ),
    (
        "0021_capability_registry",
        "Structured capability descriptors for agent AgentCard and Python SDK @capability decorator",
        include_str!("../../postgres/migrations/0021_capability_registry.sql"),
    ),
    (
        "0022_follow_engage",
        "Agent follow subscriptions and feed engagement metrics",
        include_str!("../../postgres/migrations/0022_follow_engage.sql"),
    ),
    (
        "0023_llm_runpod_calendar",
        "Add runpod backend to LLM config check constraint + calendar_events table",
        include_str!("../../postgres/migrations/0023_llm_runpod_calendar.sql"),
    ),
    (
        "0024_aliases",
        "Global agent alias registry with uniqueness, format constraints, and 30-day change cooldown",
        include_str!("../../postgres/migrations/0024_aliases.sql"),
    ),
    (
        "0025_agent_preferences",
        "Per-user agent optimization preferences (optimization_mode, auto_confirm_threshold, show_cost_estimates)",
        include_str!("../../postgres/migrations/0025_agent_preferences.sql"),
    ),
    (
        "0026_message_taxonomy",
        "Optional subtype and metadata columns for broad stable AFP message taxonomy",
        include_str!("../../postgres/migrations/0026_message_taxonomy.sql"),
    ),
    (
        "0027_delegation_hardening",
        "Per-node capability validation, outbound allowlist, and context snapshot on agent_delegations",
        include_str!("../../postgres/migrations/0027_delegation_hardening.sql"),
    ),
    (
        "0028_trigger_hardening",
        "Public replay-nonce deduplication table for trigger activation idempotency",
        include_str!("../../postgres/migrations/0028_trigger_hardening.sql"),
    ),
    (
        "0029_webhook_ingress_routing",
        "Global public-schema routing table for unauthenticated webhook ingress",
        include_str!("../../postgres/migrations/0029_webhook_ingress_routing.sql"),
    ),
    (
        "0030_email_trigger_queue",
        "Global queue for email ingest events consumed by the email trigger dispatcher",
        include_str!("../../postgres/migrations/0030_email_trigger_queue.sql"),
    ),
    (
        "0031_file_drop_trigger_queue",
        "Global queue for file-drop/watcher events consumed by the file-drop trigger dispatcher",
        include_str!("../../postgres/migrations/0031_file_drop_trigger_queue.sql"),
    ),
    (
        "0032_internal_event_queue",
        "Global queue for internal workflow runtime events consumed by the internal event dispatcher",
        include_str!("../../postgres/migrations/0032_internal_event_queue.sql"),
    ),
    (
        "0033_knowledge_curator_daemons",
        "Knowledge Curator, daemon registrations, archive index, and daemon heartbeats",
        include_str!("../../postgres/migrations/0033_knowledge_curator_daemons.sql"),
    ),
    (
        "0034_agent_settings",
        "Per-agent settings including workflow auto-approve",
        include_str!("../../postgres/migrations/0034_agent_settings.sql"),
    ),
    (
        "0035_cost_tracking",
        "Cost tracking cache and trend state",
        include_str!("../../postgres/migrations/0035_cost_tracking.sql"),
    ),
    (
        "0036_daemon_runtime_support",
        "Daemon runtime support and storage defaults",
        include_str!("../../postgres/migrations/0036_daemon_runtime_support.sql"),
    ),
    (
        "0037_supertag_definitions",
        "User-authored supertag definition rules and derived index for the Knowledge Curator",
        include_str!("../../postgres/migrations/0037_supertag_definitions.sql"),
    ),
    (
        "0038_openai_compat_backend",
        "OpenAI-compatible backend support for LLM providers and request routing",
        include_str!("../../postgres/migrations/0038_openai_compat_backend.sql"),
    ),
    (
        "0039_training_mode",
        "Training-mode state and persistence for guided agent refinement flows",
        include_str!("../../postgres/migrations/0039_training_mode.sql"),
    ),
    (
        "0040_profit_guardrails",
        "Idempotent cost events and monthly margin alert dedupe",
        include_str!("../../postgres/migrations/0040_profit_guardrails.sql"),
    ),
    (
        "0041_capability_enabled_flag",
        "Adds enabled boolean to agent_capability_registry for dashboard toggle without data loss",
        include_str!("../../postgres/migrations/0041_capability_enabled_flag.sql"),
    ),
    (
        "0042_spaces",
        "Space/workspace persistence for user-owned organizational surfaces",
        include_str!("../../postgres/migrations/0042_spaces.sql"),
    ),
    (
        "0043_mcp_tool_connections",
        "Per-user MCP tool connection registry with server URL and encrypted API key",
        include_str!("../../postgres/migrations/0043_mcp_tool_connections.sql"),
    ),
    (
        "0044_tool_descriptor",
        "Tool descriptor registry for MCP/function tool metadata and versioning",
        include_str!("../../postgres/migrations/0044_tool_descriptor.sql"),
    ),
    (
        "0045_proactive",
        "Proactive agent tables: heuristics, behavioral_memory, outcomes, token_log; passive_event index",
        include_str!("../../postgres/migrations/0045_proactive.sql"),
    ),
    (
        "0046_temporal_summary",
        "Temporal memory materialized view: per entity_type decay-weighted recency score, refreshed every 30 min",
        include_str!("../../postgres/migrations/0046_temporal_summary.sql"),
    ),
    (
        "0047_heuristic_packs",
        "User heuristic pack preferences, autonomy tier overrides, and proactive action audit log",
        include_str!("../../postgres/migrations/0047_heuristic_packs.sql"),
    ),
    (
        "0048_proactivity_level",
        "Per-user proactivity level (1-3) and notification silence window",
        include_str!("../../postgres/migrations/0048_proactivity_level.sql"),
    ),
    (
        "0049_notification_source_filters",
        "Granular calendar/email notification-source filters in user agent preferences",
        include_str!("../../postgres/migrations/0049_notification_source_filters.sql"),
    ),
    (
        "0050_map_provider",
        "Configurable map provider settings and persisted provider selection",
        include_str!("../../postgres/migrations/0050_map_provider.sql"),
    ),
    (
        "0051_background_watcher",
        "Background watcher persistence for heuristics, runs, and surfaced signals",
        include_str!("../../postgres/migrations/0051_background_watcher.sql"),
    ),
    (
        "0052_content_preview",
        "Short plaintext content_preview column on public messages for metadata-first search",
        include_str!("../../postgres/migrations/0052_content_preview.sql"),
    ),
    (
        "0053_typed_refs_backlinks",
        "Preserve typed semantic edge labels on backlink rows for claim-graph retrieval",
        include_str!("../../postgres/migrations/0053_typed_refs_backlinks.sql"),
    ),
    (
        "0054_knowledge_triple_index",
        "Server-side indexed subject-predicate-object triples for reliable knowledge queries",
        include_str!("../../postgres/migrations/0054_knowledge_triple_index.sql"),
    ),
    (
        "0055_email_contact_groups",
        "Email contact groups and supplier/friend classification support for response policies",
        include_str!("../../postgres/migrations/0055_email_contact_groups.sql"),
    ),
    (
        "0056_proactive_privacy",
        "Privacy controls and policy state for proactive analysis and surfacing",
        include_str!("../../postgres/migrations/0056_proactive_privacy.sql"),
    ),
    (
        "0057_fix_archive_projection_keys",
        "Archive projection key repair for continuity-safe archive lookups",
        include_str!("../../postgres/migrations/0057_fix_archive_projection_keys.sql"),
    ),
    (
        "0058_agent_personas",
        "Agent persona templates, activation state, and customization persistence",
        include_str!("../../postgres/migrations/0058_agent_personas.sql"),
    ),
    (
        "0059_auth_tokens_email_verify",
        "Email verification and auth token persistence for account verification flows",
        include_str!("../../postgres/migrations/0059_auth_tokens_email_verify.sql"),
    ),
    (
        "0060_archive_index_composite_key",
        "Composite archive index keys for stable archive joins and projections",
        include_str!("../../postgres/migrations/0060_archive_index_composite_key.sql"),
    ),
    (
        "0061_rate_limit_log",
        "Rate-limit event log for operational throttling analysis and audit",
        include_str!("../../postgres/migrations/0061_rate_limit_log.sql"),
    ),
    (
        "0062_anon_dashboard_sessions",
        "Anonymous dashboard session gate table for per-fingerprint trial quota (GAP-126)",
        include_str!("../../postgres/migrations/0062_anon_dashboard_sessions.sql"),
    ),
    (
        "0063_outbound_email_receipts_unique",
        "Unique constraint on (message_id, provider) for idempotent delivery upserts (GAP-134)",
        include_str!("../../postgres/migrations/0063_outbound_email_receipts_unique.sql"),
    ),
    (
        "0064_afp_kind_and_seaweedfs",
        "Add top-level AFP kind column/index support for public and tenant message tables",
        include_str!("../../postgres/migrations/0064_afp_kind_and_seaweedfs.sql"),
    ),
    (
        "0065_user_goals",
        "User goal tracking for agent-inferred and user-confirmed long-term objectives",
        include_str!("../../postgres/migrations/0065_user_goals.sql"),
    ),
    (
        "0066_news_subscriptions",
        "User-defined news feed channel subscriptions",
        include_str!("../../postgres/migrations/0066_news_subscriptions.sql"),
    ),
    (
        "0067_finance_guardian",
        "Finance Guardian bank-account and transaction-ledger foundations",
        include_str!("../../postgres/migrations/0067_finance_guardian.sql"),
    ),
    (
        "0068_para_archive",
        "PARA classification overlay for archived AFP references",
        include_str!("../../postgres/migrations/0068_para_archive.sql"),
    ),
    (
        "0069_router_index",
        "Local semantic-router replica index tables",
        include_str!("../../postgres/migrations/0069_router_index.sql"),
    ),
    (
        "0070_heuristic_ema",
        "Per-user heuristic EMA adaptation state",
        include_str!("../../postgres/migrations/0070_heuristic_ema.sql"),
    ),
    (
        "0070_router_metadata_facets",
        "Metadata facet columns for local semantic-router filtering",
        include_str!("../../postgres/migrations/0070_router_metadata_facets.sql"),
    ),
    (
        "0071_afp_top_level_supertags",
        "Add first-class top-level AFP supertags column/index support for public and tenant message tables",
        include_str!("../../postgres/migrations/0071_afp_top_level_supertags.sql"),
    ),
    (
        "0072_reference_facets",
        "Persist derived AFP reference target/type facets for indexed relational retrieval",
        include_str!("../../postgres/migrations/0072_reference_facets.sql"),
    ),
    (
        "0072_router_reference_facets",
        "Align local semantic-router reference facets with canonical AFP references",
        include_str!("../../postgres/migrations/0072_router_reference_facets.sql"),
    ),
    (
        "0073_supertag_hierarchy",
        "Optional hierarchy metadata for AFP supertag definitions",
        include_str!("../../postgres/migrations/0073_supertag_hierarchy.sql"),
    ),
    (
        "0074_router_metadata_terms",
        "Persist exact metadata terms in the local semantic-router index",
        include_str!("../../postgres/migrations/0074_router_metadata_terms.sql"),
    ),
    (
        "0075_afp_coordination_notify",
        "Postgres LISTEN/NOTIFY bridge for AFP coordination wakeups",
        include_str!("../../postgres/migrations/0075_afp_coordination_notify.sql"),
    ),
    (
        "0076_billing_archive_only_mode",
        "Billing archive-only mode flag on subscriptions",
        include_str!("../../postgres/migrations/0076_billing_archive_only_mode.sql"),
    ),
    (
        "0077_user_connected_capabilities",
        "Canonical per-user connected capability registry across provider integrations",
        include_str!("../../postgres/migrations/0077_user_connected_capabilities.sql"),
    ),
    (
        "0078_personal_automation_conversations",
        "Durable per-user personal automation conversation registry",
        include_str!("../../postgres/migrations/0078_personal_automation_conversations.sql"),
    ),
    (
        "0079_composio_tool_connection_identity",
        "Per-user Composio connected-account identity metadata for tool connections",
        include_str!("../../postgres/migrations/0079_composio_tool_connection_identity.sql"),
    ),
    (
        "0080_user_account_status",
        "Persist operator-controlled user account status for suspension enforcement",
        include_str!("../../postgres/migrations/0080_user_account_status.sql"),
    ),
    (
        "0081_daemon_heartbeat_retention",
        "Index-backed 48-hour daemon heartbeat retention hardening",
        include_str!("../../postgres/migrations/0081_daemon_heartbeat_retention.sql"),
    ),
    (
        "0082_external_tool_usage",
        "Per-user external tool usage events for provider-level billing and usage summaries",
        include_str!("../../postgres/migrations/0082_external_tool_usage.sql"),
    ),
    (
        "0083_operator_runtime_remediation_receipts",
        "Bounded operator-issued remediation receipts for manual runtime cleanup audit",
        include_str!("../../postgres/migrations/0083_operator_runtime_remediation_receipts.sql"),
    ),
    (
        "0084_operator_runtime_remediation_receipt_completion",
        "Lifecycle completion and proof fields for operator remediation receipts",
        include_str!(
            "../../postgres/migrations/0084_operator_runtime_remediation_receipt_completion.sql"
        ),
    ),
    (
        "0085_wedding_vendor_seed_details",
        "Source-backed wedding vendor seed directory for early vendor search coverage",
        include_str!("../../postgres/migrations/0085_wedding_vendor_seed_details.sql"),
    ),
    (
        "0086_wedding_waitlist_signups",
        "Wedding marketing-site waitlist signups (email, name, expected wedding date)",
        include_str!("../../postgres/migrations/0086_wedding_waitlist_signups.sql"),
    ),
    (
        "0087_google_calendar_tokens",
        "Per-user Google Calendar OAuth token storage plus sync bookkeeping columns on calendar_events",
        include_str!("../../postgres/migrations/0087_google_calendar_tokens.sql"),
    ),
    (
        "0088_editable_wedding_vendor_directory",
        "Editable wedding vendor directory with photo slots and per-user outreach follow-up state",
        include_str!("../../postgres/migrations/0088_editable_wedding_vendor_directory.sql"),
    ),
    (
        "0089_wedding_venue_seed_sydney_and_regional_nsw",
        "Source-backed seed of 10 Sydney and 10 regional NSW wedding venues into the editable vendor directory",
        include_str!(
            "../../postgres/migrations/0089_wedding_venue_seed_sydney_and_regional_nsw.sql"
        ),
    ),
    (
        "0090_wedding_user_onboarding_state",
        "Per-account record of which wedding intake variant a user has already seen, so it stays consistent across devices",
        include_str!("../../postgres/migrations/0090_wedding_user_onboarding_state.sql"),
    ),
    (
        "0091_afp_daemon_messages",
        "Public daemon AFP message store used by authenticated workspace summaries",
        include_str!("../../postgres/migrations/0091_afp_daemon_messages.sql"),
    ),
    (
        "0093_wedding_vendor_outreach_thread_keys",
        "Outbound message id and vendor email columns on wedding_vendor_user_contacts, used to match inbound Gmail replies back to the vendor they came from",
        include_str!("../../postgres/migrations/0093_wedding_vendor_outreach_thread_keys.sql"),
    ),
    (
        "0094_wedding_vendor_ranking_evidence",
        "Per-attribute wedding vendor evidence with authority and confidence, plus append-only per-couple vendor availability state, with a seed backfill of officially stated venue capacities",
        include_str!("../../postgres/migrations/0094_wedding_vendor_ranking_evidence.sql"),
    ),
    (
        "0095_wedding_vendor_photo_provenance",
        "Source URL, retrieval time, and licence metadata for editable wedding vendor photo slots",
        include_str!("../../postgres/migrations/0095_wedding_vendor_photo_provenance.sql"),
    ),
    (
        "0096_wedding_vendor_directory_export",
        "Stable Oracle-compatible wedding vendor directory export, including the derived photo count",
        include_str!("../../postgres/migrations/0096_wedding_vendor_directory_export.sql"),
    ),
    (
        "0098_wedding_vendor_shortlist_run_claims",
        "Server-side idempotency claims for one wedding vendor shortlist run per material fingerprint and ranking policy",
        include_str!("../../postgres/migrations/0098_wedding_vendor_shortlist_run_claims.sql"),
    ),
    (
        "0099_single_demo_seed_message",
        "Retain one clearly labelled demo seed message per tenant and remove the legacy synthetic seed graph",
        include_str!("../../postgres/migrations/0099_single_demo_seed_message.sql"),
    ),
    (
        "0100_wedding_vendor_rooms",
        "Per-vendor rooms with pricing, inclusions, and Seaweed FS-backed room photos",
        include_str!("../../postgres/migrations/0100_wedding_vendor_rooms.sql"),
    ),
    (
        "0101_wedding_vendor_claims",
        "Vendor claim state, roles, verification codes, and magic-link token storage",
        include_str!("../../postgres/migrations/0101_wedding_vendor_claims.sql"),
    ),
    (
        "0102_wedding_vendor_owner_profile",
        "Owner-supplied vendor profile, public assets, and linked AgentCard records",
        include_str!("../../postgres/migrations/0102_wedding_vendor_owner_profile.sql"),
    ),
    (
        "0103_wedding_vendor_subscriptions_and_enquiries",
        "Vendor subscription, ciphertext-only wedding enquiry relay, and listing statistics",
        include_str!(
            "../../postgres/migrations/0103_wedding_vendor_subscriptions_and_enquiries.sql"
        ),
    ),
    (
        "0104_wedding_vendor_photo_licences",
        "Versioned vendor photo licence receipts required for live owner images",
        include_str!("../../postgres/migrations/0104_wedding_vendor_photo_licences.sql"),
    ),
    (
        "0105_wedding_vendor_owner_photo_removal",
        "Fourteen-day retention and server-side purge scheduling for owner photo removals",
        include_str!("../../postgres/migrations/0105_wedding_vendor_owner_photo_removal.sql"),
    ),
    (
        "0106_wedding_vendor_mackay_family_estate",
        "Production seed for the searchable Mackay Family Estate directory record",
        include_str!("../../postgres/migrations/0106_wedding_vendor_mackay_family_estate.sql"),
    ),
    (
        "0107_wedding_newsletter_subscribers",
        "Wedding blog newsletter subscribers with one-click unsubscribe tokens",
        include_str!("../../postgres/migrations/0107_wedding_newsletter_subscribers.sql"),
    ),
    (
        "0108_wedding_vendor_email_relay_foundation",
        "Disabled wedding vendor relay masks, encrypted thread sidecars, provider-event dedupe, and rebuildable read projection",
        include_str!("../../postgres/migrations/0108_wedding_vendor_email_relay_foundation.sql"),
    ),
    (
        "0109_wedding_vendor_category_canonicalization",
        "Canonical comparable wedding vendor categories and A2Z Weddings photography classification",
        include_str!("../../postgres/migrations/0109_wedding_vendor_category_canonicalization.sql"),
    ),
    (
        "0110_remove_spurious_a2z_vendor_reply",
        "Remove a synthetic A2Z outreach draft that was incorrectly projected as a reply",
        include_str!("../../postgres/migrations/0110_remove_spurious_a2z_vendor_reply.sql"),
    ),
    (
        "0111_wedding_vendor_aco_on_the_pier",
        "Official ACO On The Pier venue enquiry contact",
        include_str!("../../postgres/migrations/0111_wedding_vendor_aco_on_the_pier.sql"),
    ),
    (
        "0112_quotation_response_capabilities",
        "Hashed transaction-scoped quotation response capabilities, sessions, rate limits, and content-free audit",
        include_str!("../../postgres/migrations/0112_quotation_response_capabilities.sql"),
    ),
    (
        "0113_quotation_response_capability_expiry",
        "Auditable terminal expiry state for quotation response capabilities",
        include_str!("../../postgres/migrations/0113_quotation_response_capability_expiry.sql"),
    ),
    (
        "0114_quotation_vendor_response_transport",
        "Ciphertext-only claimed-vendor quotation response routing and durable content-free receipts",
        include_str!("../../postgres/migrations/0114_quotation_vendor_response_transport.sql"),
    ),
    (
        "0115_wedding_vendor_ownership_proofs",
        "Expiring non-exclusive vendor claims and verified ownership proof receipts",
        include_str!("../../postgres/migrations/0115_wedding_vendor_ownership_proofs.sql"),
    ),
    (
        "0116_wedding_vendor_sender_identities",
        "Stable verified-vendor sender masks and response identity bindings",
        include_str!("../../postgres/migrations/0116_wedding_vendor_sender_identities.sql"),
    ),
    (
        "0117_vendor_email_worker_ingress",
        "Authenticated replay-safe encrypted Cloudflare Email Worker quarantine",
        include_str!("../../postgres/migrations/0117_vendor_email_worker_ingress.sql"),
    ),
    (
        "0118_curator_audit_retention",
        "Created-at index for batched seven-day curator audit retention",
        include_str!("../../postgres/migrations/0118_curator_audit_retention.sql"),
    ),
    (
        "0119_recipient_held_email_envelopes",
        "Recipient AgentCard key binding for user-only email ciphertext decryption",
        include_str!("../../postgres/migrations/0119_recipient_held_email_envelopes.sql"),
    ),
    (
        "0120_wedding_blog_publications",
        "Durable sanitised wedding blog publications managed by operators",
        include_str!("../../postgres/migrations/0120_wedding_blog_publications.sql"),
    ),
    (
        "0121_wedding_quote_study",
        "Consent-bound unencrypted SeaweedFS quote study submissions and analysis receipts",
        include_str!("../../postgres/migrations/0121_wedding_quote_study.sql"),
    ),
    (
        "0122_practice_projections",
        "Rebuildable permission-scoped professional practice indexes",
        include_str!("../../postgres/migrations/0122_practice_projections.sql"),
    ),
    (
        "0123_wedding_vendor_email_delivery_suppressions",
        "Hashed vendor-mail bounce and complaint retry suppressions",
        include_str!(
            "../../postgres/migrations/0123_wedding_vendor_email_delivery_suppressions.sql"
        ),
    ),
    (
        "0124_wedding_runsheet_projection_commits",
        "Atomic content-light checkpoints and idempotency receipts for AFP-backed wedding run-sheet projection",
        include_str!("../../postgres/migrations/0124_wedding_runsheet_projection_commits.sql"),
    ),
    (
        "0125_remove_operator_wedding_follow_up_fixtures",
        "Surgical cleanup of receipt-bound operator wedding follow-up fixtures",
        include_str!(
            "../../postgres/migrations/0125_remove_operator_wedding_follow_up_fixtures.sql"
        ),
    ),
    (
        "0126_wedding_runsheet_share_grants",
        "Content-light expiring grants and vendor acknowledgements for hosted Wedding run-sheet views",
        include_str!("../../postgres/migrations/0126_wedding_runsheet_share_grants.sql"),
    ),
    (
        "0127_wedding_rsvp_capability_grants",
        "Digest-only expiring household capability grants for Wedding RSVP invitations",
        include_str!("../../postgres/migrations/0127_wedding_rsvp_capability_grants.sql"),
    ),
    (
        "0128_wedding_boundary_governance",
        "Content-light helper grants and idempotency receipts for server-authoritative Wedding Family Boundaries",
        include_str!("../../postgres/migrations/0128_wedding_boundary_governance.sql"),
    ),
    (
        "0129_wedding_boundary_delegates_and_private_notes",
        "Authenticated scoped Family Boundary delegates and opaque mutable private-note records",
        include_str!(
            "../../postgres/migrations/0129_wedding_boundary_delegates_and_private_notes.sql"
        ),
    ),
    (
        "0130_operational_retention_and_legacy_watcher",
        "Global rate-limit retention index and retirement of unsupported watcher registrations",
        include_str!("../../postgres/migrations/0130_operational_retention_and_legacy_watcher.sql"),
    ),
    (
        "0131_wedding_binder_requests",
        "Privacy-minimised Wedding Day Binder delivery and double opt-in receipts",
        include_str!("../../postgres/migrations/0131_wedding_binder_requests.sql"),
    ),
    (
        "0132_wedding_site_measurement",
        "Cookie-free non-identifying first-party Wedding site measurement",
        include_str!("../../postgres/migrations/0132_wedding_site_measurement.sql"),
    ),
    (
        "0133_operator_email_relay",
        "False-default authenticated operational alias relay with encrypted routing",
        include_str!("../../postgres/migrations/0133_operator_email_relay.sql"),
    ),
    (
        "0134_wedding_vendor_listing_proposals",
        "Private reviewed proposals for businesses absent from the Wedding vendor directory",
        include_str!("../../postgres/migrations/0134_wedding_vendor_listing_proposals.sql"),
    ),
    (
        "0135_wedding_onboarding_admin_data_consent",
        "Explicit account-scoped Wedding onboarding consent for de-identified admin research sharing",
        include_str!("../../postgres/migrations/0135_wedding_onboarding_admin_data_consent.sql"),
    ),
    (
        "0136_platform_funded_ai_usage",
        "Transactional reservations and receipts for hard-capped platform-funded AI",
        include_str!("../../postgres/migrations/0136_platform_funded_ai_usage.sql"),
    ),
    (
        "0137_wedding_site_measurement_idempotency",
        "Replay-safe public measurement identity and visit-scoped uniqueness",
        include_str!("../../postgres/migrations/0137_wedding_site_measurement_idempotency.sql"),
    ),
    (
        "0138_growth_acquisition_identity",
        "Privacy-bounded same-session acquisition touches and identity links",
        include_str!("../../postgres/migrations/0138_growth_acquisition_identity.sql"),
    ),
    (
        "0139_growth_activation_projection",
        "Content-free Wedding activation and meaningful-activity projection",
        include_str!("../../postgres/migrations/0139_growth_activation_projection.sql"),
    ),
    (
        "0140_growth_payment_projection",
        "Live Wedding payment, refund, maturity, and revisioned variable-cost projection",
        include_str!("../../postgres/migrations/0140_growth_payment_projection.sql"),
    ),
    (
        "0141_growth_spend_import",
        "Immutable advertising spend imports, rows, corrections, and operator audit",
        include_str!("../../postgres/migrations/0141_growth_spend_import.sql"),
    ),
    (
        "0142_growth_daily_rollups",
        "Content-free Sydney-time Growth daily rollups and projector checkpoint",
        include_str!("../../postgres/migrations/0142_growth_daily_rollups.sql"),
    ),
    (
        "0143_growth_benchmark_revisions",
        "Append-only Growth targets and operator audit",
        include_str!("../../postgres/migrations/0143_growth_benchmark_revisions.sql"),
    ),
    (
        "0144_wedding_task_assignment_delivery",
        "Idempotent Wedding task assignment email and recipient-agent delivery receipts",
        include_str!("../../postgres/migrations/0144_wedding_task_assignment_delivery.sql"),
    ),
    (
        "0145_wedding_invite_proposal_batches",
        "Content-free approval batches and replay-safe per-vendor Invite Proposal delivery receipts",
        include_str!("../../postgres/migrations/0145_wedding_invite_proposal_batches.sql"),
    ),
    (
        "0146_agent_persona_ui_and_weekly_reports",
        "Account-scoped persona presentation preferences and replay-safe weekly operator report receipts",
        include_str!("../../postgres/migrations/0146_agent_persona_ui_and_weekly_reports.sql"),
    ),
    (
        "0147_wedding_musician_vendor_listings",
        "Claimable Sydney musician vendor listings and source-backed discovery attributes",
        include_str!("../../postgres/migrations/0147_wedding_musician_vendor_listings.sql"),
    ),
    (
        "0148_wedding_invite_proposal_opportunities",
        "Category proposal opportunities, expiring referral capabilities, responses, and privacy-bounded metrics",
        include_str!("../../postgres/migrations/0148_wedding_invite_proposal_opportunities.sql"),
    ),
    (
        "0149_wedding_vendor_limited_specials",
        "False-default vendor-controlled date-and-session specials with encrypted private pricing, safe management capabilities, enquiry links, and content-light audit",
        include_str!("../../postgres/migrations/0149_wedding_vendor_limited_specials.sql"),
    ),
    (
        "0150_wedding_rsvp_contact_detail_requests",
        "Explicit household RSVP contact-detail requests using the existing expiring capability",
        include_str!("../../postgres/migrations/0150_wedding_rsvp_contact_detail_requests.sql"),
    ),
    (
        "0151_wedding_vendor_special_offer_updates",
        "Auditable verified-vendor edits for draft and paused Limited Specials",
        include_str!("../../postgres/migrations/0151_wedding_vendor_special_offer_updates.sql"),
    ),
    (
        "0152_wedding_vendor_special_link_analytics_and_rsvp_video",
        "Content-light vendor management-link adoption, explicit availability evidence, and optional Loom RSVP greetings",
        include_str!(
            "../../postgres/migrations/0152_wedding_vendor_special_link_analytics_and_rsvp_video.sql"
        ),
    ),
    (
        "0153_wedding_admin_data_consent_audit",
        "Auditable false-default consent for content-free Wedding product statistics",
        include_str!("../../postgres/migrations/0153_wedding_admin_data_consent_audit.sql"),
    ),
    (
        "0154_wedding_invite_proposal_vendor_feeds",
        "Expiring vendor-bound Invite Proposal lead feeds and typed private responses",
        include_str!("../../postgres/migrations/0154_wedding_invite_proposal_vendor_feeds.sql"),
    ),
    (
        "0155_wedding_quote_share_events",
        "Content-free public Wedding quote-comparison PDF delivery receipts",
        include_str!("../../postgres/migrations/0155_wedding_quote_share_events.sql"),
    ),
    (
        "0156_gmail_alpha_access_requests",
        "Account-scoped operator approval for the Gmail alpha integration",
        include_str!("../../postgres/migrations/0156_gmail_alpha_access_requests.sql"),
    ),
    (
        "0157_wedding_vendor_portal_extensions",
        "Revisioned vendor publishing, named resource calendars, scoped team roles, notification preferences and existing subscription entitlements",
        include_str!("../../postgres/migrations/0157_wedding_vendor_portal_extensions.sql"),
    ),
    (
        "0158_wedding_celebrant_consultations",
        "Verified Sydney celebrant consultation windows, live capacity, phone verification and content-light callback lifecycle evidence",
        include_str!("../../postgres/migrations/0158_wedding_celebrant_consultations.sql"),
    ),
    (
        "0159_wedding_celebrant_profiles_and_management_links",
        "Official-site celebrant profiles and vendor-scoped consultation calendar management capabilities",
        include_str!(
            "../../postgres/migrations/0159_wedding_celebrant_profiles_and_management_links.sql"
        ),
    ),
    (
        "0160_wedding_vendor_funnel_metric_indexes",
        "Content-free indexes for qualified-couple, availability-maintenance and completed venue-enquiry operator trends",
        include_str!("../../postgres/migrations/0160_wedding_vendor_funnel_metric_indexes.sql"),
    ),
    (
        "0161_wedding_reviews",
        "AFP-backed Wedding review lifecycle, evidence references, moderation and deterministic public projections",
        include_str!("../../postgres/migrations/0161_wedding_reviews.sql"),
    ),
    (
        "0162_wedding_review_evidence_access",
        "Audited operator access and fail-closed purge execution for protected Wedding review evidence",
        include_str!("../../postgres/migrations/0162_wedding_review_evidence_access.sql"),
    ),
];
