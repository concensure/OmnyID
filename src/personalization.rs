use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum FeedbackSignal {
    Approved,
    Rejected,
    Edited,
    Ignored,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct PersonalizationEvent {
    pub event_id: String,
    pub thread_id: String,
    pub message_id: String,
    pub actor_agent_id: String,
    pub signal: FeedbackSignal,
    pub rationale: Option<String>,
    pub captured_at: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ArtifactStatus {
    Draft,
    Active,
    Paused,
    RolledBack,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct LoraArtifact {
    pub artifact_id: String,
    pub base_model: String,
    pub storage_uri: String,
    pub version: String,
    pub status: ArtifactStatus,
    pub created_at: String,
    pub supersedes: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct TrainingSchedule {
    pub cadence_days: u16,
    pub max_examples_per_run: u32,
    pub require_device_locality: bool,
}

impl TrainingSchedule {
    pub fn weekly_default() -> Self {
        Self {
            cadence_days: 7,
            max_examples_per_run: 2_000,
            require_device_locality: true,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{
        ArtifactStatus, FeedbackSignal, LoraArtifact, PersonalizationEvent, TrainingSchedule,
    };

    #[test]
    fn weekly_schedule_defaults_to_local_training() {
        let schedule = TrainingSchedule::weekly_default();
        assert_eq!(schedule.cadence_days, 7);
        assert!(schedule.require_device_locality);
    }

    #[test]
    fn personalization_events_capture_user_feedback_scope() {
        let event = PersonalizationEvent {
            event_id: "evt_approval_01".to_string(),
            thread_id: "thread_inbox_01".to_string(),
            message_id: "msg_action_01".to_string(),
            actor_agent_id: "agent:assistant@omnyid.ai".to_string(),
            signal: FeedbackSignal::Approved,
            rationale: Some("This matched my tone and triage preference".to_string()),
            captured_at: "2026-03-20T00:00:00Z".to_string(),
        };
        let artifact = LoraArtifact {
            artifact_id: "lora_user_01".to_string(),
            base_model: "gpt-oss-local".to_string(),
            storage_uri: "file:///omnyid/lora/user_01.gguf".to_string(),
            version: "2026-03-20.1".to_string(),
            status: ArtifactStatus::Draft,
            created_at: "2026-03-20T00:00:00Z".to_string(),
            supersedes: None,
        };

        assert_eq!(event.signal, FeedbackSignal::Approved);
        assert_eq!(artifact.status, ArtifactStatus::Draft);
    }
}
