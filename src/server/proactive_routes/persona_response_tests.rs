// @locs-version: 1.0
use super::*;

#[test]
fn proactive_suggestions_response_restyles_review_copy_for_active_persona() {
    let persona = crate::agent_personas::AgentPersona {
        id: "persona_1".to_string(),
        owner_user_id: "user_1".to_string(),
        name: "Brief".to_string(),
        soul_md: "Keep review copy concise.".to_string(),
        writing_style: "concise".to_string(),
        skills_json: serde_json::json!([]),
        image_data_url: None,
        lora_confidence_score: 0.0,
        lora_genome_active: false,
        is_active: true,
        created_at: "2026-08-26T00:00:00Z".to_string(),
        updated_at: "2026-08-26T00:00:00Z".to_string(),
    };
    let continuity_summary = DashboardContinuityStateResponse {
        latest_state_snapshot_ref: None,
        latest_state_synthesis_ref: None,
        latest_state_snapshot: None,
        latest_state_synthesis: None,
        preferred_state_type: "none".to_string(),
        preferred_state_brief: None,
        preferred_synthesizer_handoff: None,
        preferred_priority_item: None,
        preferred_priority_card: None,
        preferred_action_items: Vec::new(),
        preferred_action_overflow_count: 0,
        preferred_action_overflow_summary: None,
        preferred_response_items: Vec::new(),
        preferred_prepared_draft_items: Vec::new(),
        preferred_context_panel_items: Vec::new(),
        preferred_context_pack_items: Vec::new(),
        preferred_state_fields: Vec::new(),
    };
    let items = vec![serde_json::json!({
        "id": "suggestion_1",
        "kind": "prepared_draft",
        "description": "Prepared response is ready for review.",
        "selection_reason": "Prepared reply is already aligned.",
        "approval_or_reversibility_hint": "Reviewing this suggestion does not execute a side effect.",
        "artifact_summary_lines": ["Suggested timing: Today."],
        "source_refs": ["msg_1"],
        "requires_approval": false,
        "surface_hint": "response_queue",
        "readiness": "ready_now",
        "confidence": "high"
    })];

    let response = build_proactive_suggestions_response_with_persona(
        items,
        continuity_summary,
        None,
        Vec::new(),
        None,
        Some(&persona),
    );

    assert_eq!(
        response.items[0]["description"].as_str(),
        Some("Briefly: Prepared response is ready for review.")
    );
    assert_eq!(
        response.items[0]["selection_reason"].as_str(),
        Some("Briefly: Prepared reply is already aligned.")
    );
    assert_eq!(
        response.items[0]["artifact_summary_lines"][0].as_str(),
        Some("Briefly: Suggested timing: Today.")
    );
}
