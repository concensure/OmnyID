/*
 * @module-id: rust.proactive-heuristics-extended
 * @primary-capability: rust.source-module
 * @locs-version: 2.0
 * @stability: active
 * @owner: omnyid
 */

/// Extended heuristic library â€” categorised packs for everyday usage.
///
/// Each heuristic belongs to a named pack. Users (or the agent's pack suggester)
/// enable/disable packs; only heuristics in enabled packs participate in
/// evaluation.  All heuristics use existing AFP passive-event subtypes so no
/// new event schema is required.
///
/// Pack IDs:
///   "meeting"   â€” Meeting Intelligence (prep, outcomes, cognitive load)
///   "email"     â€” Email Intelligence (urgency, organisation, timing)
///   "deadline"  â€” Deadline Management (escalation, clustering, risk)
///   "finance"   â€” Finance & Tax (bills, cashflow, compliance)
///   "transport" â€” Mobility & Transit (needs external API data at runtime)
///   "weather"   â€” Weather & Events (needs weather API â€” lower fidelity without it)
use crate::proactive_engine::{ActionTemplate, ProactiveHeuristic};
use serde_json::json;

// â”€â”€ Meeting Intelligence Pack â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

pub fn meeting_heuristics() -> Vec<ProactiveHeuristic> {
    vec![
        // M-01: No agenda 24h before meeting
        ProactiveHeuristic {
            id: "meeting-no-agenda-24h".to_string(),
            name: "Meeting Agenda Missing".to_string(),
            trigger_event_type: "calendar_event_starting_soon".to_string(),
            conditions: json!({ "hours_until_start_max": 24.0 }),
            action_template: ActionTemplate {
                action_label: "Create agenda".to_string(),
                description: "This meeting starts within 24h and no agenda has been filed. Draft a short agenda to keep the meeting focused?".to_string(),
                urgency: "medium".to_string(),
            },
            confidence_threshold: 0.7,
            enabled: true,
        },
        // M-02: Attendee briefing not opened
        ProactiveHeuristic {
            id: "meeting-attendee-briefing".to_string(),
            name: "External Attendee Briefing".to_string(),
            trigger_event_type: "calendar_event_starting_soon".to_string(),
            conditions: json!({ "has_external_attendees": true }),
            action_template: ActionTemplate {
                action_label: "Surface attendee summaries".to_string(),
                description: "This meeting includes external attendees and no briefing notes have been opened. Review past interactions?".to_string(),
                urgency: "medium".to_string(),
            },
            confidence_threshold: 0.65,
            enabled: true,
        },
        // M-03: Meeting repeatedly rescheduled
        ProactiveHeuristic {
            id: "meeting-coordination-instability".to_string(),
            name: "Repeated Rescheduling Detected".to_string(),
            trigger_event_type: "calendar_event_rescheduled".to_string(),
            conditions: json!({ "reschedule_count_min": 2 }),
            action_template: ActionTemplate {
                action_label: "Flag coordination issue".to_string(),
                description: "This meeting has been rescheduled multiple times. Investigate the coordination issue or convert to async?".to_string(),
                urgency: "low".to_string(),
            },
            confidence_threshold: 0.6,
            enabled: true,
        },
        // M-04: Large group, no facilitator
        ProactiveHeuristic {
            id: "meeting-no-facilitator".to_string(),
            name: "Large Meeting Without Facilitator".to_string(),
            trigger_event_type: "calendar_event_starting_soon".to_string(),
            conditions: json!({ "attendee_count_min": 8, "has_facilitator": false }),
            action_template: ActionTemplate {
                action_label: "Assign facilitator".to_string(),
                description: "This meeting has 8+ attendees and no facilitator assigned. Designate a note-taker and facilitator before it begins?".to_string(),
                urgency: "medium".to_string(),
            },
            confidence_threshold: 0.65,
            enabled: true,
        },
        // M-05: Back-to-back emotionally intense meetings
        ProactiveHeuristic {
            id: "meeting-decompression-buffer".to_string(),
            name: "Decompression Buffer Needed".to_string(),
            trigger_event_type: "calendar_event_completed".to_string(),
            conditions: json!({ "meeting_tag": "intense", "next_meeting_gap_minutes_max": 15 }),
            action_template: ActionTemplate {
                action_label: "Insert recovery break".to_string(),
                description: "An intense meeting just ended and you have another starting soon. Block 10 minutes for decompression?".to_string(),
                urgency: "medium".to_string(),
            },
            confidence_threshold: 0.6,
            enabled: true,
        },
        // M-06: No action items after meeting
        ProactiveHeuristic {
            id: "meeting-no-action-items".to_string(),
            name: "Action Items Not Captured".to_string(),
            trigger_event_type: "calendar_event_completed".to_string(),
            conditions: json!({ "action_items_recorded": false }),
            action_template: ActionTemplate {
                action_label: "Extract action items".to_string(),
                description: "This meeting ended without any action items recorded. Extract and assign tasks now?".to_string(),
                urgency: "medium".to_string(),
            },
            confidence_threshold: 0.65,
            enabled: true,
        },
        // M-07: Urgent keyword in transcript
        ProactiveHeuristic {
            id: "meeting-urgent-keyword".to_string(),
            name: "Urgent Topic Detected".to_string(),
            trigger_event_type: "calendar_event_completed".to_string(),
            conditions: json!({ "transcript_contains": "urgent" }),
            action_template: ActionTemplate {
                action_label: "Escalate follow-up".to_string(),
                description: "The meeting transcript contained urgent language. Escalate the follow-up priority?".to_string(),
                urgency: "high".to_string(),
            },
            confidence_threshold: 0.7,
            enabled: true,
        },
        // M-08: Client meeting ended with no same-day follow-up
        ProactiveHeuristic {
            id: "meeting-client-same-day-followup".to_string(),
            name: "Same-Day Client Follow-Up".to_string(),
            trigger_event_type: "calendar_event_completed".to_string(),
            conditions: json!({ "meeting_tag": "client", "positive_outcome": true }),
            action_template: ActionTemplate {
                action_label: "Send follow-up today".to_string(),
                description: "Client meeting ended on a positive note. Sending a same-day follow-up significantly improves conversion. Draft now?".to_string(),
                urgency: "high".to_string(),
            },
            confidence_threshold: 0.7,
            enabled: true,
        },
        // M-09: >4 heavy meetings in one day
        ProactiveHeuristic {
            id: "meeting-cognitive-overload".to_string(),
            name: "Cognitive Overload Risk".to_string(),
            trigger_event_type: "calendar_event_starting_soon".to_string(),
            conditions: json!({ "daily_meeting_count_min": 4, "meeting_tag": "heavy" }),
            action_template: ActionTemplate {
                action_label: "Reduce notifications today".to_string(),
                description: "You have 4+ cognitively heavy meetings today. Non-essential notifications will be batched to protect focus.".to_string(),
                urgency: "medium".to_string(),
            },
            confidence_threshold: 0.65,
            enabled: true,
        },
        // M-10: Meeting cancellation frequency increasing
        ProactiveHeuristic {
            id: "meeting-cancellation-trend".to_string(),
            name: "Stakeholder Disengagement Risk".to_string(),
            trigger_event_type: "calendar_event_cancelled".to_string(),
            conditions: json!({ "cancellation_streak_min": 2 }),
            action_template: ActionTemplate {
                action_label: "Investigate disengagement".to_string(),
                description: "This recurring meeting has been cancelled multiple times recently. Reach out to investigate stakeholder availability?".to_string(),
                urgency: "medium".to_string(),
            },
            confidence_threshold: 0.6,
            enabled: true,
        },
        // M-11: Meeting discussed financial commitments
        ProactiveHeuristic {
            id: "meeting-financial-commitment".to_string(),
            name: "Financial Commitment in Meeting".to_string(),
            trigger_event_type: "calendar_event_completed".to_string(),
            conditions: json!({ "transcript_contains": "payment" }),
            action_template: ActionTemplate {
                action_label: "Link to accounting".to_string(),
                description: "A financial commitment was discussed in this meeting. Link it to your accounting workflow to track?".to_string(),
                urgency: "high".to_string(),
            },
            confidence_threshold: 0.7,
            enabled: true,
        },
        // M-12: High-stakes presentation upcoming
        ProactiveHeuristic {
            id: "meeting-rehearsal-block".to_string(),
            name: "Rehearsal Time Needed".to_string(),
            trigger_event_type: "calendar_event_starting_soon".to_string(),
            conditions: json!({ "meeting_tag": "presentation", "hours_until_start_max": 48.0 }),
            action_template: ActionTemplate {
                action_label: "Block rehearsal time".to_string(),
                description: "A high-stakes presentation is coming up within 48h. Block dedicated rehearsal time now?".to_string(),
                urgency: "high".to_string(),
            },
            confidence_threshold: 0.7,
            enabled: true,
        },
    ]
}

// â”€â”€ Email Intelligence Pack â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

pub fn email_heuristics() -> Vec<ProactiveHeuristic> {
    vec![
        // E-01: VIP contact unanswered >12h
        ProactiveHeuristic {
            id: "email-vip-unanswered".to_string(),
            name: "VIP Email Unanswered".to_string(),
            trigger_event_type: "email_thread_idle".to_string(),
            conditions: json!({ "sender_tag": "vip", "idle_hours_threshold": 12 }),
            action_template: ActionTemplate {
                action_label: "Respond to VIP".to_string(),
                description: "An email from a VIP contact has gone unanswered for 12+ hours. Reply promptly to maintain the relationship?".to_string(),
                urgency: "high".to_string(),
            },
            confidence_threshold: 0.75,
            enabled: true,
        },
        // E-02: Deadline language in email
        ProactiveHeuristic {
            id: "email-deadline-obligation".to_string(),
            name: "Deadline Detected in Email".to_string(),
            trigger_event_type: "email_received".to_string(),
            conditions: json!({ "contains_deadline_language": true }),
            action_template: ActionTemplate {
                action_label: "Extract obligation".to_string(),
                description: "An email contains deadline language. Extract and track the obligation to your task list?".to_string(),
                urgency: "high".to_string(),
            },
            confidence_threshold: 0.7,
            enabled: true,
        },
        // E-03: Client waiting >24h without acknowledgement
        ProactiveHeuristic {
            id: "email-client-waiting".to_string(),
            name: "Client Awaiting Response".to_string(),
            trigger_event_type: "email_thread_idle".to_string(),
            conditions: json!({ "sender_tag": "client", "idle_hours_threshold": 24 }),
            action_template: ActionTemplate {
                action_label: "Send acknowledgement".to_string(),
                description: "A client has been waiting more than 24h for a reply. Send an acknowledgement to maintain trust?".to_string(),
                urgency: "high".to_string(),
            },
            confidence_threshold: 0.7,
            enabled: true,
        },
        // E-04: Newsletter unopened 30d
        ProactiveHeuristic {
            id: "email-newsletter-stale".to_string(),
            name: "Unread Newsletter".to_string(),
            trigger_event_type: "email_thread_idle".to_string(),
            conditions: json!({ "email_tag": "newsletter", "idle_hours_threshold": 720 }),
            action_template: ActionTemplate {
                action_label: "Unsubscribe".to_string(),
                description: "A newsletter hasn't been opened in 30 days. Unsubscribe to reduce inbox noise?".to_string(),
                urgency: "low".to_string(),
            },
            confidence_threshold: 0.6,
            enabled: true,
        },
        // E-05: Thread sentiment deteriorating
        ProactiveHeuristic {
            id: "email-sentiment-risk".to_string(),
            name: "Email Thread Sentiment Declining".to_string(),
            trigger_event_type: "email_received".to_string(),
            conditions: json!({ "sentiment_direction": "declining" }),
            action_template: ActionTemplate {
                action_label: "Switch to careful mode".to_string(),
                description: "The tone of this email thread is deteriorating. Switch to careful response mode?".to_string(),
                urgency: "high".to_string(),
            },
            confidence_threshold: 0.7,
            enabled: true,
        },
        // E-06: Thread exceeds 20 replies
        ProactiveHeuristic {
            id: "email-thread-too-long".to_string(),
            name: "Email Thread Too Long".to_string(),
            trigger_event_type: "email_thread_idle".to_string(),
            conditions: json!({ "reply_count_min": 20 }),
            action_template: ActionTemplate {
                action_label: "Generate summary".to_string(),
                description: "This email thread has 20+ replies. Generate a concise summary before responding?".to_string(),
                urgency: "medium".to_string(),
            },
            confidence_threshold: 0.65,
            enabled: true,
        },
        // E-07: Inbox volume spike >3x baseline
        ProactiveHeuristic {
            id: "email-inbox-spike".to_string(),
            name: "Inbox Volume Spike".to_string(),
            trigger_event_type: "email_inbox_spike".to_string(),
            conditions: json!({ "spike_multiplier_min": 3.0 }),
            action_template: ActionTemplate {
                action_label: "Switch to digest mode".to_string(),
                description: "Your inbox volume is 3x above normal. Switch to digest mode to maintain focus?".to_string(),
                urgency: "medium".to_string(),
            },
            confidence_threshold: 0.65,
            enabled: true,
        },
        // E-08: Approval request pending
        ProactiveHeuristic {
            id: "email-approval-pending".to_string(),
            name: "Approval Request Detected".to_string(),
            trigger_event_type: "email_received".to_string(),
            conditions: json!({ "contains_approval_request": true }),
            action_template: ActionTemplate {
                action_label: "Track approval".to_string(),
                description: "This email contains an approval request. Track it as a pending dependency?".to_string(),
                urgency: "medium".to_string(),
            },
            confidence_threshold: 0.65,
            enabled: true,
        },
        // E-09: Unsent high-value draft >24h
        ProactiveHeuristic {
            id: "email-draft-unsent".to_string(),
            name: "High-Value Draft Unsent".to_string(),
            trigger_event_type: "email_draft_idle".to_string(),
            conditions: json!({ "draft_tag": "important", "idle_hours_threshold": 24 }),
            action_template: ActionTemplate {
                action_label: "Send or discard draft".to_string(),
                description: "An important email draft has been unsent for 24+ hours. Send it or decide to discard?".to_string(),
                urgency: "medium".to_string(),
            },
            confidence_threshold: 0.6,
            enabled: true,
        },
        // E-10: Same sender emailing repeatedly (escalation)
        ProactiveHeuristic {
            id: "email-repeated-sender".to_string(),
            name: "Persistent Sender".to_string(),
            trigger_event_type: "email_received".to_string(),
            conditions: json!({ "sender_frequency_min": 3, "window_hours": 24 }),
            action_template: ActionTemplate {
                action_label: "Escalate visibility".to_string(),
                description: "The same sender has emailed you 3+ times today without a response. Escalate to your attention now?".to_string(),
                urgency: "high".to_string(),
            },
            confidence_threshold: 0.7,
            enabled: true,
        },
        // E-11: Invoice detected â€” extract due date
        ProactiveHeuristic {
            id: "email-invoice-due-date".to_string(),
            name: "Invoice Received".to_string(),
            trigger_event_type: "email_received".to_string(),
            conditions: json!({ "email_tag": "invoice" }),
            action_template: ActionTemplate {
                action_label: "Extract due date".to_string(),
                description: "An invoice was received. Extract the due date and link it to your finance tracker?".to_string(),
                urgency: "medium".to_string(),
            },
            confidence_threshold: 0.65,
            enabled: true,
        },
        // E-12: Multiple unanswered obligations in inbox
        ProactiveHeuristic {
            id: "email-obligation-digest".to_string(),
            name: "Obligation Backlog".to_string(),
            trigger_event_type: "email_inbox_spike".to_string(),
            conditions: json!({ "unanswered_obligation_count_min": 5 }),
            action_template: ActionTemplate {
                action_label: "Generate obligation digest".to_string(),
                description: "You have 5+ unanswered email obligations. Generate a prioritised digest?".to_string(),
                urgency: "medium".to_string(),
            },
            confidence_threshold: 0.65,
            enabled: true,
        },
    ]
}

// â”€â”€ Deadline Management Pack â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

pub fn deadline_heuristics() -> Vec<ProactiveHeuristic> {
    vec![
        // D-01: Deadline within 72h, work not started
        ProactiveHeuristic {
            id: "deadline-72h-escalation".to_string(),
            name: "Deadline Approaching â€” Not Started".to_string(),
            trigger_event_type: "deadline_approaching".to_string(),
            conditions: json!({ "hours_remaining_max": 72.0, "work_started": false }),
            action_template: ActionTemplate {
                action_label: "Start now".to_string(),
                description: "A deadline is 72h away and work hasn't started. Escalate priority and block time?".to_string(),
                urgency: "high".to_string(),
            },
            confidence_threshold: 0.75,
            enabled: true,
        },
        // D-02: Multiple deadlines cluster on same day
        ProactiveHeuristic {
            id: "deadline-same-day-cluster".to_string(),
            name: "Deadline Cluster".to_string(),
            trigger_event_type: "deadline_approaching".to_string(),
            conditions: json!({ "same_day_deadline_count_min": 3 }),
            action_template: ActionTemplate {
                action_label: "Re-sequence workload".to_string(),
                description: "Three or more deadlines cluster on the same day. Re-sequence the workload to reduce risk?".to_string(),
                urgency: "high".to_string(),
            },
            confidence_threshold: 0.7,
            enabled: true,
        },
        // D-03: Deadline overlaps public holiday
        ProactiveHeuristic {
            id: "deadline-public-holiday".to_string(),
            name: "Deadline Near Public Holiday".to_string(),
            trigger_event_type: "deadline_approaching".to_string(),
            conditions: json!({ "overlaps_public_holiday": true }),
            action_template: ActionTemplate {
                action_label: "Advance reminders".to_string(),
                description: "This deadline falls near a public holiday. Advance all related reminders and prepare early?".to_string(),
                urgency: "high".to_string(),
            },
            confidence_threshold: 0.7,
            enabled: true,
        },
        // D-04: Deadline carries financial penalty
        ProactiveHeuristic {
            id: "deadline-financial-penalty".to_string(),
            name: "Financial Penalty Deadline".to_string(),
            trigger_event_type: "deadline_approaching".to_string(),
            conditions: json!({ "has_financial_penalty": true }),
            action_template: ActionTemplate {
                action_label: "Increase urgency".to_string(),
                description: "This deadline is linked to a financial penalty. Increase urgency weighting and escalate?".to_string(),
                urgency: "high".to_string(),
            },
            confidence_threshold: 0.8,
            enabled: true,
        },
        // D-05: Dependency incomplete
        ProactiveHeuristic {
            id: "deadline-dependency-blocked".to_string(),
            name: "Dependency Incomplete".to_string(),
            trigger_event_type: "deadline_approaching".to_string(),
            conditions: json!({ "has_incomplete_dependency": true, "hours_remaining_max": 96.0 }),
            action_template: ActionTemplate {
                action_label: "Flag blocked dependency".to_string(),
                description: "A required dependency is incomplete with this deadline approaching. Flag the downstream risk?".to_string(),
                urgency: "high".to_string(),
            },
            confidence_threshold: 0.75,
            enabled: true,
        },
        // D-06: Deadline repeatedly postponed
        ProactiveHeuristic {
            id: "deadline-strategic-neglect".to_string(),
            name: "Repeatedly Postponed Deadline".to_string(),
            trigger_event_type: "deadline_rescheduled".to_string(),
            conditions: json!({ "postpone_count_min": 3 }),
            action_template: ActionTemplate {
                action_label: "Flag strategic neglect".to_string(),
                description: "This deadline has been postponed 3+ times. Flag it as strategically neglected and resolve?".to_string(),
                urgency: "medium".to_string(),
            },
            confidence_threshold: 0.65,
            enabled: true,
        },
        // D-07: Task with high complexity, fragmented calendar
        ProactiveHeuristic {
            id: "deadline-focus-block-needed".to_string(),
            name: "Complex Task Needs Focus Block".to_string(),
            trigger_event_type: "deadline_approaching".to_string(),
            conditions: json!({ "task_complexity": "high", "calendar_fragmented": true }),
            action_template: ActionTemplate {
                action_label: "Protect uninterrupted block".to_string(),
                description: "This complex task needs uninterrupted time but your calendar is fragmented. Block focus time?".to_string(),
                urgency: "medium".to_string(),
            },
            confidence_threshold: 0.65,
            enabled: true,
        },
        // D-08: Deadline missed silently
        ProactiveHeuristic {
            id: "deadline-silent-miss".to_string(),
            name: "Deadline Exceeded Without Notice".to_string(),
            trigger_event_type: "deadline_exceeded".to_string(),
            conditions: json!({}),
            action_template: ActionTemplate {
                action_label: "Generate accountability review".to_string(),
                description: "A deadline was exceeded without a flag or escalation. Generate an accountability review to prevent recurrence?".to_string(),
                urgency: "high".to_string(),
            },
            confidence_threshold: 0.8,
            enabled: true,
        },
        // D-09: Third-party approval needed
        ProactiveHeuristic {
            id: "deadline-approval-latency".to_string(),
            name: "Third-Party Approval Pending".to_string(),
            trigger_event_type: "deadline_approaching".to_string(),
            conditions: json!({ "requires_external_approval": true, "hours_remaining_max": 120.0 }),
            action_template: ActionTemplate {
                action_label: "Track approval latency".to_string(),
                description: "This deadline requires third-party approval and time is running short. Send a reminder to the approver?".to_string(),
                urgency: "high".to_string(),
            },
            confidence_threshold: 0.75,
            enabled: true,
        },
        // D-10: Tax filing due within 30 days
        ProactiveHeuristic {
            id: "deadline-tax-preparation".to_string(),
            name: "Tax Filing Approaching".to_string(),
            trigger_event_type: "deadline_approaching".to_string(),
            conditions: json!({ "deadline_tag": "tax", "days_remaining_max": 30 }),
            action_template: ActionTemplate {
                action_label: "Start preparation".to_string(),
                description: "A tax filing deadline is within 30 days. Begin staged preparation reminders?".to_string(),
                urgency: "high".to_string(),
            },
            confidence_threshold: 0.75,
            enabled: true,
        },
    ]
}

// â”€â”€ Finance & Tax Pack â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

pub fn finance_heuristics() -> Vec<ProactiveHeuristic> {
    vec![
        // F-01: Bill due within 3 days
        ProactiveHeuristic {
            id: "finance-bill-due-soon".to_string(),
            name: "Bill Due Within 3 Days".to_string(),
            trigger_event_type: "bill_due_approaching".to_string(),
            conditions: json!({ "days_until_due_max": 3 }),
            action_template: ActionTemplate {
                action_label: "Pay now".to_string(),
                description: "A bill is due within 3 days. Review and pay to avoid late fees?".to_string(),
                urgency: "high".to_string(),
            },
            confidence_threshold: 0.8,
            enabled: true,
        },
        // F-02: Cashflow projection negative
        ProactiveHeuristic {
            id: "finance-cashflow-negative".to_string(),
            name: "Negative Cashflow Forecast".to_string(),
            trigger_event_type: "finance_projection_updated".to_string(),
            conditions: json!({ "cashflow_30d_positive": false }),
            action_template: ActionTemplate {
                action_label: "Prioritise receivables".to_string(),
                description: "Your 30-day cashflow projection is negative. Follow up on outstanding receivables now?".to_string(),
                urgency: "high".to_string(),
            },
            confidence_threshold: 0.8,
            enabled: true,
        },
        // F-03: ATO/tax deadline approaching
        ProactiveHeuristic {
            id: "finance-ato-deadline".to_string(),
            name: "ATO Compliance Deadline".to_string(),
            trigger_event_type: "deadline_approaching".to_string(),
            conditions: json!({ "deadline_tag": "ato" }),
            action_template: ActionTemplate {
                action_label: "Escalate compliance".to_string(),
                description: "An ATO deadline is approaching. Escalate visibility and confirm all documents are ready?".to_string(),
                urgency: "high".to_string(),
            },
            confidence_threshold: 0.85,
            enabled: true,
        },
        // F-04: Insurance renewal near expiry
        ProactiveHeuristic {
            id: "finance-insurance-renewal".to_string(),
            name: "Insurance Renewal Approaching".to_string(),
            trigger_event_type: "deadline_approaching".to_string(),
            conditions: json!({ "deadline_tag": "insurance_renewal" }),
            action_template: ActionTemplate {
                action_label: "Compare alternatives".to_string(),
                description: "An insurance policy is near renewal. Compare market alternatives before auto-renewing?".to_string(),
                urgency: "medium".to_string(),
            },
            confidence_threshold: 0.7,
            enabled: true,
        },
        // F-05: Client payment delayed beyond baseline
        ProactiveHeuristic {
            id: "finance-payment-overdue".to_string(),
            name: "Client Payment Overdue".to_string(),
            trigger_event_type: "invoice_overdue".to_string(),
            conditions: json!({ "overdue_days_min": 7 }),
            action_template: ActionTemplate {
                action_label: "Start collection workflow".to_string(),
                description: "A client payment is overdue by 7+ days. Begin the collection follow-up workflow?".to_string(),
                urgency: "high".to_string(),
            },
            confidence_threshold: 0.75,
            enabled: true,
        },
        // F-06: Quarterly BAS due
        ProactiveHeuristic {
            id: "finance-bas-due".to_string(),
            name: "BAS Deadline Approaching".to_string(),
            trigger_event_type: "deadline_approaching".to_string(),
            conditions: json!({ "deadline_tag": "bas" }),
            action_template: ActionTemplate {
                action_label: "Prepare BAS".to_string(),
                description: "Your quarterly Business Activity Statement is due. Begin staged preparation?".to_string(),
                urgency: "high".to_string(),
            },
            confidence_threshold: 0.8,
            enabled: true,
        },
        // F-07: Subscription unused 90 days
        ProactiveHeuristic {
            id: "finance-subscription-unused".to_string(),
            name: "Unused Subscription Detected".to_string(),
            trigger_event_type: "subscription_event".to_string(),
            conditions: json!({ "days_since_last_use_min": 90 }),
            action_template: ActionTemplate {
                action_label: "Cancel subscription".to_string(),
                description: "A paid subscription hasn't been used in 90 days. Cancel to stop unnecessary spend?".to_string(),
                urgency: "low".to_string(),
            },
            confidence_threshold: 0.65,
            enabled: true,
        },
        // F-08: Multiple large expenses clustering
        ProactiveHeuristic {
            id: "finance-liquidity-stress".to_string(),
            name: "Liquidity Stress Predicted".to_string(),
            trigger_event_type: "finance_projection_updated".to_string(),
            conditions: json!({ "large_expense_cluster": true }),
            action_template: ActionTemplate {
                action_label: "Review liquidity plan".to_string(),
                description: "Multiple large expenses are clustering in the same period. Review your liquidity plan?".to_string(),
                urgency: "high".to_string(),
            },
            confidence_threshold: 0.75,
            enabled: true,
        },
        // F-09: Government fee expiry approaching
        ProactiveHeuristic {
            id: "finance-govt-fee-expiry".to_string(),
            name: "Government Fee Expiry".to_string(),
            trigger_event_type: "deadline_approaching".to_string(),
            conditions: json!({ "deadline_tag": "government_fee" }),
            action_template: ActionTemplate {
                action_label: "Prepare renewal".to_string(),
                description: "A government fee or licence renewal is approaching expiry. Prepare the renewal workflow?".to_string(),
                urgency: "medium".to_string(),
            },
            confidence_threshold: 0.7,
            enabled: true,
        },
        // F-10: User repeatedly delays financial admin
        ProactiveHeuristic {
            id: "finance-admin-block".to_string(),
            name: "Financial Admin Deferred".to_string(),
            trigger_event_type: "task_deferred".to_string(),
            conditions: json!({ "task_tag": "finance_admin", "defer_count_min": 3 }),
            action_template: ActionTemplate {
                action_label: "Schedule protected finance block".to_string(),
                description: "You've deferred financial admin tasks 3+ times. Schedule a protected block to clear them?".to_string(),
                urgency: "medium".to_string(),
            },
            confidence_threshold: 0.65,
            enabled: true,
        },
    ]
}

// â”€â”€ Transport Pack (requires external API) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

pub fn transport_heuristics() -> Vec<ProactiveHeuristic> {
    vec![
        // T-01: User historically misses specific service
        ProactiveHeuristic {
            id: "transport-adjust-departure".to_string(),
            name: "Habitual Missed Service".to_string(),
            trigger_event_type: "calendar_event_starting_soon".to_string(),
            conditions: json!({ "historical_late_arrival": true }),
            action_template: ActionTemplate {
                action_label: "Leave 15 minutes earlier".to_string(),
                description: "Your travel history shows you often miss this service. Leave 15 minutes earlier than planned?".to_string(),
                urgency: "medium".to_string(),
            },
            confidence_threshold: 0.65,
            enabled: true,
        },
        // T-02: Real-time delay exceeds tolerance
        ProactiveHeuristic {
            id: "transport-rideshare-threshold".to_string(),
            name: "Transit Delay â€” Switch to Rideshare".to_string(),
            trigger_event_type: "transport_delay_detected".to_string(),
            conditions: json!({ "delay_minutes_min": 20 }),
            action_template: ActionTemplate {
                action_label: "Book rideshare".to_string(),
                description: "Your planned transit route has a 20+ minute delay. Switch to rideshare to arrive on time?".to_string(),
                urgency: "high".to_string(),
            },
            confidence_threshold: 0.75,
            enabled: true,
        },
        // T-03: Last service cutoff approaching
        ProactiveHeuristic {
            id: "transport-last-service".to_string(),
            name: "Last Service Cutoff".to_string(),
            trigger_event_type: "transport_service_alert".to_string(),
            conditions: json!({ "alert_type": "last_service" }),
            action_template: ActionTemplate {
                action_label: "Leave now or arrange alternate".to_string(),
                description: "The last service on your planned route is approaching. Leave now or arrange a rideshare fallback?".to_string(),
                urgency: "high".to_string(),
            },
            confidence_threshold: 0.8,
            enabled: true,
        },
        // T-04: Meeting departure buffer â€” calculated via Maps API
        ProactiveHeuristic {
            id: "transport-departure-buffer".to_string(),
            name: "Leave Now for Meeting".to_string(),
            trigger_event_type: "calendar_event_starting_soon".to_string(),
            conditions: json!({ "has_location": true, "minutes_until_start_max": 90.0 }),
            action_template: ActionTemplate {
                action_label: "Get directions".to_string(),
                description: "Your next meeting has a physical location. Calculate travel time and check if you need to leave now?".to_string(),
                urgency: "high".to_string(),
            },
            confidence_threshold: 0.75,
            enabled: true,
        },
        // T-05: User near a relevant POI from their to-do / shopping list
        ProactiveHeuristic {
            id: "transport-nearby-errand".to_string(),
            name: "Nearby Errand Opportunity".to_string(),
            trigger_event_type: "location_event".to_string(),
            conditions: json!({ "has_pending_tasks": true }),
            action_template: ActionTemplate {
                action_label: "View nearby errands".to_string(),
                description: "You're near a place that matches pending tasks on your list. Complete them while you're here?".to_string(),
                urgency: "low".to_string(),
            },
            confidence_threshold: 0.6,
            enabled: true,
        },
        // T-06: Geofence entered â€” proactive context
        ProactiveHeuristic {
            id: "transport-geofence-enter".to_string(),
            name: "Location Zone Entered".to_string(),
            trigger_event_type: "location_event".to_string(),
            conditions: json!({ "source": "geofence" }),
            action_template: ActionTemplate {
                action_label: "View zone actions".to_string(),
                description: "You've entered a zone with pending actions. Review what's relevant here?".to_string(),
                urgency: "medium".to_string(),
            },
            confidence_threshold: 0.7,
            enabled: true,
        },
        // T-07: Travel congestion â€” leave earlier than planned
        ProactiveHeuristic {
            id: "transport-congestion-alert".to_string(),
            name: "Traffic Congestion â€” Leave Earlier".to_string(),
            trigger_event_type: "calendar_event_starting_soon".to_string(),
            conditions: json!({ "has_location": true, "congestion_detected": true }),
            action_template: ActionTemplate {
                action_label: "Leave earlier".to_string(),
                description: "Traffic on your planned route is heavier than usual. Leave earlier to arrive on time?".to_string(),
                urgency: "high".to_string(),
            },
            confidence_threshold: 0.8,
            enabled: true,
        },
    ]
}

// â”€â”€ Weather & Events Pack (requires weather/events API) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

pub fn weather_heuristics() -> Vec<ProactiveHeuristic> {
    vec![
        // W-01: Heavy rain during outdoor work
        ProactiveHeuristic {
            id: "weather-rain-outdoor-work".to_string(),
            name: "Rain Forecast â€” Outdoor Work".to_string(),
            trigger_event_type: "weather_alert".to_string(),
            conditions: json!({ "alert_type": "heavy_rain", "has_outdoor_work": true }),
            action_template: ActionTemplate {
                action_label: "Reschedule outdoor tasks".to_string(),
                description: "Heavy rain is forecast during outdoor work. Reschedule to avoid disruption?".to_string(),
                urgency: "high".to_string(),
            },
            confidence_threshold: 0.7,
            enabled: true,
        },
        // W-02: Heatwave â€” reduce outdoor intensity
        ProactiveHeuristic {
            id: "weather-heatwave-outdoor".to_string(),
            name: "Heatwave Warning".to_string(),
            trigger_event_type: "weather_alert".to_string(),
            conditions: json!({ "alert_type": "heatwave" }),
            action_template: ActionTemplate {
                action_label: "Reduce outdoor workload".to_string(),
                description: "A heatwave is forecast. Reduce outdoor workload intensity and ensure hydration breaks?".to_string(),
                urgency: "medium".to_string(),
            },
            confidence_threshold: 0.7,
            enabled: true,
        },
        // W-03: Stadium/concert dispersal overlaps travel
        ProactiveHeuristic {
            id: "weather-event-congestion".to_string(),
            name: "Major Event Congestion".to_string(),
            trigger_event_type: "event_congestion_alert".to_string(),
            conditions: json!({ "event_size_min": 10000 }),
            action_template: ActionTemplate {
                action_label: "Adjust departure time".to_string(),
                description: "A major event near your route will cause significant congestion. Adjust departure time?".to_string(),
                urgency: "medium".to_string(),
            },
            confidence_threshold: 0.65,
            enabled: true,
        },
    ]
}

// â”€â”€ Pack metadata catalogue â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct HeuristicPack {
    pub id: String,
    pub name: String,
    pub description: String,
    pub icon: String,
    /// Roles or workflow patterns that benefit most from this pack.
    pub best_for: Vec<String>,
    /// Whether external API data is required for full fidelity.
    pub requires_external_data: bool,
    pub heuristic_count: usize,
}

pub fn pack_catalogue() -> Vec<HeuristicPack> {
    vec![
        HeuristicPack {
            id: "meeting".to_string(),
            name: "Meeting Intelligence".to_string(),
            description: "Preparation, follow-up, cognitive load management, and stakeholder signals for every meeting.".to_string(),
            icon: "ðŸ“…".to_string(),
            best_for: vec!["executive".to_string(), "consultant".to_string(), "manager".to_string(), "founder".to_string()],
            requires_external_data: false,
            heuristic_count: meeting_heuristics().len(),
        },
        HeuristicPack {
            id: "email".to_string(),
            name: "Email Intelligence".to_string(),
            description: "Priority surfacing, obligation extraction, and inbox health for email-heavy workflows.".to_string(),
            icon: "âœ‰".to_string(),
            best_for: vec!["executive".to_string(), "consultant".to_string(), "salesperson".to_string(), "freelancer".to_string()],
            requires_external_data: false,
            heuristic_count: email_heuristics().len(),
        },
        HeuristicPack {
            id: "deadline".to_string(),
            name: "Deadline Management".to_string(),
            description: "Escalation, clustering, dependency tracking, and missed-deadline analysis.".to_string(),
            icon: "â°".to_string(),
            best_for: vec!["project_manager".to_string(), "academic".to_string(), "consultant".to_string(), "freelancer".to_string()],
            requires_external_data: false,
            heuristic_count: deadline_heuristics().len(),
        },
        HeuristicPack {
            id: "finance".to_string(),
            name: "Finance & Tax".to_string(),
            description: "Bill reminders, cashflow alerts, ATO/BAS compliance, and unused subscription detection.".to_string(),
            icon: "ðŸ’°".to_string(),
            best_for: vec!["business_owner".to_string(), "freelancer".to_string(), "accountant".to_string(), "founder".to_string()],
            requires_external_data: false,
            heuristic_count: finance_heuristics().len(),
        },
        HeuristicPack {
            id: "transport".to_string(),
            name: "Mobility & Transit".to_string(),
            description: "Real-time delay alerts, departure optimisation, and rideshare fallback triggers.".to_string(),
            icon: "ðŸš‡".to_string(),
            best_for: vec!["commuter".to_string(), "field_worker".to_string(), "consultant".to_string()],
            requires_external_data: true,
            heuristic_count: transport_heuristics().len(),
        },
        HeuristicPack {
            id: "weather".to_string(),
            name: "Weather & Events".to_string(),
            description: "Weather risk alerts, outdoor work scheduling, and event-driven congestion predictions.".to_string(),
            icon: "ðŸŒ¦".to_string(),
            best_for: vec!["construction".to_string(), "field_worker".to_string(), "commuter".to_string()],
            requires_external_data: true,
            heuristic_count: weather_heuristics().len(),
        },
    ]
}

/// Return all heuristics for a slice of enabled pack IDs.
pub fn heuristics_for_packs(enabled_packs: &[String]) -> Vec<ProactiveHeuristic> {
    let pack_set: std::collections::HashSet<&str> =
        enabled_packs.iter().map(String::as_str).collect();
    let mut result = Vec::new();
    if pack_set.contains("meeting") {
        result.extend(meeting_heuristics());
    }
    if pack_set.contains("email") {
        result.extend(email_heuristics());
    }
    if pack_set.contains("deadline") {
        result.extend(deadline_heuristics());
    }
    if pack_set.contains("finance") {
        result.extend(finance_heuristics());
    }
    if pack_set.contains("transport") {
        result.extend(transport_heuristics());
    }
    if pack_set.contains("weather") {
        result.extend(weather_heuristics());
    }
    result
}

// â”€â”€ Pack suggester â€” infers best packs from behavioral signals â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/// Analyse behavioral memory patterns and temporal summary to recommend packs
/// the user has not yet enabled.  Returns (pack_id, reason) pairs.
pub fn suggest_packs_from_behavior(
    behavioral_memory: &[serde_json::Value],
    temporal_summary: &[serde_json::Value],
    enabled_packs: &[String],
) -> Vec<(String, String)> {
    let enabled: std::collections::HashSet<&str> =
        enabled_packs.iter().map(String::as_str).collect();
    let mut suggestions = Vec::new();

    // Count event types in temporal summary
    let meeting_events = temporal_summary
        .iter()
        .filter(|r| {
            r["event_type"]
                .as_str()
                .map_or(false, |t| t.contains("calendar"))
        })
        .count();
    let email_events = temporal_summary
        .iter()
        .filter(|r| {
            r["event_type"]
                .as_str()
                .map_or(false, |t| t.contains("email"))
        })
        .count();

    // Check behavioral patterns
    let delays_invoicing = behavioral_memory.iter().any(|m| {
        m["pattern_key"]
            .as_str()
            .map_or(false, |k| k.contains("invoice") || k.contains("finance"))
    });
    let heavy_meetings = meeting_events >= 3;
    let heavy_email = email_events >= 5;

    if !enabled.contains("meeting") && heavy_meetings {
        suggestions.push(("meeting".to_string(),
            "Your calendar shows frequent meetings â€” Meeting Intelligence can help with prep, follow-ups, and cognitive load.".to_string()));
    }
    if !enabled.contains("email") && heavy_email {
        suggestions.push(("email".to_string(),
            "Your inbox has high activity â€” Email Intelligence can surface priorities and track obligations automatically.".to_string()));
    }
    if !enabled.contains("finance") && delays_invoicing {
        suggestions.push(("finance".to_string(),
            "I noticed patterns suggesting invoice and finance admin delays â€” Finance & Tax pack can automate reminders.".to_string()));
    }

    suggestions
}

// â”€â”€ Autonomy tier helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
