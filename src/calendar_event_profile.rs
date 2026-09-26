/*
 * @module-id: rust.calendar-event-profile
 * @primary-capability: rust.source-module
 * @locs-version: 2.0
 * @stability: active
 * @owner: omnyid
 */

use serde_json::{Value, json};

use crate::background_watcher_heuristics::normalise_academic_event_type;

pub fn classify_schedule_anchor_type(
    title: &str,
    description: Option<&str>,
    location: Option<&str>,
) -> Option<&'static str> {
    let combined = format!(
        "{} {} {}",
        title,
        description.unwrap_or_default(),
        location.unwrap_or_default()
    )
    .to_lowercase();
    if combined.contains("interview")
        || combined.contains("screening")
        || combined.contains("candidate")
    {
        Some("interview")
    } else if combined.contains("doctor")
        || combined.contains("dentist")
        || combined.contains("physio")
        || combined.contains("therapy")
        || combined.contains("medical")
        || combined.contains("clinic")
        || combined.contains("hospital")
    {
        Some("medical")
    } else if combined.contains("meeting")
        || combined.contains("sync")
        || combined.contains("standup")
        || combined.contains("review")
        || combined.contains("retro")
        || combined.contains("briefing")
        || combined.contains("agenda")
        || combined.contains("1:1")
        || combined.contains("1on1")
    {
        Some("meeting")
    } else if combined.contains("pickup")
        || combined.contains("dropoff")
        || combined.contains("school run")
        || combined.contains("delivery")
        || combined.contains("airport")
    {
        Some("logistics")
    } else {
        None
    }
}

pub fn event_has_agenda_signal(description: Option<&str>) -> bool {
    let description = description.unwrap_or_default().to_lowercase();
    description.contains("agenda")
        || description.contains("topics")
        || description.contains("discussion")
        || description.contains("briefing")
}

pub fn event_has_high_importance_signal(title: &str, description: Option<&str>) -> bool {
    let combined = format!("{} {}", title, description.unwrap_or_default()).to_lowercase();
    combined.contains("board")
        || combined.contains("exec")
        || combined.contains("executive")
        || combined.contains("investor")
        || combined.contains("final interview")
        || combined.contains("panel interview")
        || combined.contains("critical")
        || combined.contains("launch")
}

pub fn schedule_focus_kind(anchor_type: &str) -> &'static str {
    match anchor_type {
        "interview" => "interview_prep",
        "medical" => "appointment_buffer",
        "logistics" => "logistics_buffer",
        _ => "meeting_prep",
    }
}

pub fn schedule_anchor_note_kind(
    anchor_type: Option<&str>,
    title: &str,
    description: Option<&str>,
) -> Option<&'static str> {
    match anchor_type.unwrap_or("meeting") {
        "meeting" if event_has_high_importance_signal(title, description) => {
            Some("high_stakes_prep")
        }
        "meeting" if event_has_agenda_signal(description) => Some("general_prep"),
        "meeting" => Some("missing_agenda"),
        "interview" => Some("high_stakes_prep"),
        "medical" => Some("arrival_buffer"),
        "logistics" => Some("travel_buffer"),
        _ => Some("general_prep"),
    }
}

pub fn schedule_anchor_prep_lead_minutes(
    anchor_type: Option<&str>,
    note_kind: Option<&str>,
) -> Option<i64> {
    Some(
        match (
            anchor_type.unwrap_or("meeting"),
            note_kind.unwrap_or("general_prep"),
        ) {
            ("interview", _) => 60,
            ("meeting", "high_stakes_prep") => 60,
            ("meeting", "missing_agenda") => 45,
            ("medical", _) => 30,
            ("logistics", _) => 30,
            _ => 30,
        },
    )
}

pub fn calendar_event_profile_from_fields(
    title: &str,
    description: Option<&str>,
    location: Option<&str>,
    all_day: bool,
) -> Value {
    let academic_source = description
        .map(|value| format!("{title} {value}"))
        .unwrap_or_else(|| title.to_string());
    let academic_event_type = match normalise_academic_event_type(&academic_source) {
        "academic_exam" => Some("academic_exam"),
        "academic_submission" => Some("academic_submission"),
        _ => None,
    };
    let schedule_anchor_type = classify_schedule_anchor_type(title, description, location);
    let schedule_note_kind = schedule_anchor_note_kind(schedule_anchor_type, title, description);
    let prep_lead_minutes =
        schedule_anchor_prep_lead_minutes(schedule_anchor_type, schedule_note_kind);
    json!({
        "academic_event_type": academic_event_type,
        "schedule_anchor_type": schedule_anchor_type,
        "schedule_focus_kind": schedule_anchor_type.map(schedule_focus_kind),
        "schedule_note_kind": schedule_note_kind,
        "prep_lead_minutes": prep_lead_minutes,
        "has_agenda_signal": event_has_agenda_signal(description),
        "has_high_importance_signal": event_has_high_importance_signal(title, description),
        "location_present": location.is_some(),
        "description_present": description.is_some(),
        "all_day": all_day,
    })
}
