/*
 * @module-id: rust.mood-carry-forward
 * @primary-capability: rust.source-module
 * @locs-version: 2.0
 * @stability: active
 * @owner: omnyid
 */

/// Mood Carry-Forward â€” emotional context persistence across sessions.
///
/// Records user mood check-ins as `mood_record:check_in` AFP messages and
/// propagates the most recent mood into new sessions as
/// `mood_record:carry_forward` messages.  The Master Agent reads the
/// carried-forward mood to calibrate tone, priority ordering, and proactivity.
///
/// Valence and energy values are stored as normalised floats so the agent can
/// reason about them without interpreting emoji or free-text labels.
use chrono::Utc;
use serde_json::{Value, json};
use ulid::Ulid;

use crate::message::{
    AFP_SUBTYPE_MOOD_RECORD_CARRY_FORWARD, AFP_SUBTYPE_MOOD_RECORD_CHECK_IN, AFP_TYPE_MOOD_RECORD,
    AfpMoodRecordContent,
};

// â”€â”€ Mood label constants â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

pub const MOOD_ENERGISED: &str = "energised";
pub const MOOD_FOCUSED: &str = "focused";
pub const MOOD_NEUTRAL: &str = "neutral";
pub const MOOD_TIRED: &str = "tired";
pub const MOOD_STRESSED: &str = "stressed";
pub const MOOD_ANXIOUS: &str = "anxious";
pub const MOOD_HAPPY: &str = "happy";

/// Canonical valence and energy defaults for each mood label.
/// Callers may override these with measured values.
pub fn default_valence_energy(mood: &str) -> (f32, f32) {
    match mood {
        MOOD_ENERGISED => (0.7, 0.9),
        MOOD_FOCUSED => (0.4, 0.7),
        MOOD_NEUTRAL => (0.0, 0.5),
        MOOD_TIRED => (-0.2, 0.2),
        MOOD_STRESSED => (-0.5, 0.6),
        MOOD_ANXIOUS => (-0.6, 0.4),
        MOOD_HAPPY => (0.9, 0.8),
        _ => (0.0, 0.5),
    }
}

// â”€â”€ Trend analysis â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

#[derive(Debug, Clone, PartialEq)]
pub enum MoodTrend {
    Improving,
    Stable,
    Declining,
    Insufficient, // fewer than 2 records
}

impl MoodTrend {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Improving => "improving",
            Self::Stable => "stable",
            Self::Declining => "declining",
            Self::Insufficient => "insufficient",
        }
    }
}

/// Compute trend from a time-ordered slice of mood records (oldest â†’ newest).
/// Uses the average valence of the first half vs. second half.
pub fn compute_trend(records: &[AfpMoodRecordContent]) -> MoodTrend {
    if records.len() < 2 {
        return MoodTrend::Insufficient;
    }
    let mid = records.len() / 2;
    let first_avg: f64 = records[..mid].iter().map(|r| r.valence).sum::<f64>() / mid as f64;
    let second_avg: f64 =
        records[mid..].iter().map(|r| r.valence).sum::<f64>() / (records.len() - mid) as f64;
    let delta = second_avg - first_avg;
    if delta > 0.15 {
        MoodTrend::Improving
    } else if delta < -0.15 {
        MoodTrend::Declining
    } else {
        MoodTrend::Stable
    }
}

// â”€â”€ Session carry-forward â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/// Identify the most recent `mood_record` from a flat slice of AFP messages.
/// Returns `None` if no mood records are present.
pub fn latest_mood(messages: &[Value]) -> Option<AfpMoodRecordContent> {
    messages
        .iter()
        .filter(|m| m["type"].as_str() == Some(AFP_TYPE_MOOD_RECORD))
        .filter_map(|m| serde_json::from_value::<AfpMoodRecordContent>(m["content"].clone()).ok())
        .max_by(|a, b| a.recorded_at.cmp(&b.recorded_at))
}

/// Derive a carry-forward record from a prior mood record.
/// Slightly decays valence toward neutral over time to avoid stale context.
pub fn carry_forward(
    prior: &AfpMoodRecordContent,
    prior_message_id: &str,
    new_session_id: &str,
) -> AfpMoodRecordContent {
    // Decay: pull valence 10% toward 0 each carry-forward step.
    let decayed_valence = prior.valence * 0.90;
    AfpMoodRecordContent {
        mood: prior.mood.clone(),
        valence: decayed_valence,
        energy: prior.energy,
        context_note: None,
        session_id: Some(new_session_id.to_string()),
        recorded_at: Utc::now().to_rfc3339(),
        carry_forward_from: Some(prior_message_id.to_string()),
        ..Default::default()
    }
}

// â”€â”€ AFP builders â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/// Build a `mood_record:check_in` AFP message.
pub fn build_mood_check_in_afp(
    owner_user_id: &str,
    thread_id: &str,
    mood: &str,
    context_note: Option<&str>,
    session_id: Option<&str>,
) -> Value {
    let (valence, energy) = default_valence_energy(mood);
    let content = AfpMoodRecordContent {
        mood: mood.to_string(),
        valence: valence.into(),
        energy: energy.into(),
        context_note: context_note.map(str::to_string),
        session_id: session_id.map(str::to_string),
        recorded_at: Utc::now().to_rfc3339(),
        carry_forward_from: None,
        ..Default::default()
    };
    json!({
        "protocol": "afp-v1",
        "id": Ulid::new().to_string(),
        "thread_id": thread_id,
        "from": "mood_agent",
        "to": [owner_user_id],
        "timestamp": Utc::now().to_rfc3339(),
        "type": AFP_TYPE_MOOD_RECORD,
        "subtype": AFP_SUBTYPE_MOOD_RECORD_CHECK_IN,
        "content": serde_json::to_value(&content).unwrap_or(Value::Null),
        "metadata": { "store": true },
        "store_in_relational": true,
    })
}

/// Build a `mood_record:carry_forward` AFP message for session start.
pub fn build_mood_carry_forward_afp(
    owner_user_id: &str,
    thread_id: &str,
    prior: &AfpMoodRecordContent,
    prior_message_id: &str,
    new_session_id: &str,
) -> Value {
    let content = carry_forward(prior, prior_message_id, new_session_id);
    json!({
        "protocol": "afp-v1",
        "id": Ulid::new().to_string(),
        "thread_id": thread_id,
        "from": "mood_agent",
        "to": [owner_user_id],
        "timestamp": Utc::now().to_rfc3339(),
        "type": AFP_TYPE_MOOD_RECORD,
        "subtype": AFP_SUBTYPE_MOOD_RECORD_CARRY_FORWARD,
        "content": serde_json::to_value(&content).unwrap_or(Value::Null),
        "metadata": { "store": true, "carry_forward": true },
        "store_in_relational": true,
    })
}

// â”€â”€ Tests â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

#[cfg(test)]
mod tests {
    use super::*;

    fn record(mood: &str, valence: f32) -> AfpMoodRecordContent {
        AfpMoodRecordContent {
            mood: mood.to_string(),
            valence: valence.into(),
            energy: 0.5,
            recorded_at: Utc::now().to_rfc3339(),
            ..Default::default()
        }
    }

    #[test]
    fn default_valence_energy_known_moods() {
        let (v, e) = default_valence_energy(MOOD_ENERGISED);
        assert!(v > 0.0 && e > 0.0);
        let (v, _) = default_valence_energy(MOOD_ANXIOUS);
        assert!(v < 0.0);
    }

    #[test]
    fn compute_trend_improving() {
        let records = vec![
            record("tired", -0.2),
            record("neutral", 0.0),
            record("focused", 0.4),
            record("energised", 0.7),
        ];
        assert_eq!(compute_trend(&records), MoodTrend::Improving);
    }

    #[test]
    fn compute_trend_declining() {
        let records = vec![
            record("energised", 0.7),
            record("focused", 0.4),
            record("neutral", 0.0),
            record("tired", -0.2),
        ];
        assert_eq!(compute_trend(&records), MoodTrend::Declining);
    }

    #[test]
    fn compute_trend_stable() {
        let records = vec![record("neutral", 0.0), record("neutral", 0.05)];
        assert_eq!(compute_trend(&records), MoodTrend::Stable);
    }

    #[test]
    fn compute_trend_insufficient() {
        assert_eq!(
            compute_trend(&[record("neutral", 0.0)]),
            MoodTrend::Insufficient
        );
        assert_eq!(compute_trend(&[]), MoodTrend::Insufficient);
    }

    #[test]
    fn carry_forward_decays_valence() {
        let prior = record(MOOD_STRESSED, -0.5);
        let cf = carry_forward(&prior, "msg_01", "session_02");
        assert!(
            cf.valence.abs() < prior.valence.abs(),
            "carry-forward should decay toward neutral"
        );
        assert_eq!(cf.carry_forward_from.as_deref(), Some("msg_01"));
    }

    #[test]
    fn latest_mood_returns_most_recent() {
        let t1 = "2026-05-01T10:00:00Z";
        let t2 = "2026-05-02T10:00:00Z";
        let msgs = vec![
            json!({
                "type": AFP_TYPE_MOOD_RECORD,
                "content": { "mood": "tired", "valence": -0.2, "energy": 0.2, "recorded_at": t1 }
            }),
            json!({
                "type": AFP_TYPE_MOOD_RECORD,
                "content": { "mood": "focused", "valence": 0.4, "energy": 0.7, "recorded_at": t2 }
            }),
        ];
        let mood = latest_mood(&msgs);
        assert!(mood.is_some());
        assert_eq!(mood.unwrap().mood, MOOD_FOCUSED);
    }

    #[test]
    fn build_mood_check_in_has_correct_type() {
        let afp = build_mood_check_in_afp("user_01", "thread_01", MOOD_ENERGISED, None, None);
        assert_eq!(afp["type"].as_str(), Some(AFP_TYPE_MOOD_RECORD));
        assert_eq!(
            afp["subtype"].as_str(),
            Some(AFP_SUBTYPE_MOOD_RECORD_CHECK_IN)
        );
    }

    #[test]
    fn build_carry_forward_has_correct_subtype() {
        let prior = record(MOOD_FOCUSED, 0.4);
        let afp =
            build_mood_carry_forward_afp("user_01", "thread_01", &prior, "msg_01", "session_02");
        assert_eq!(
            afp["subtype"].as_str(),
            Some(AFP_SUBTYPE_MOOD_RECORD_CARRY_FORWARD)
        );
    }
}
