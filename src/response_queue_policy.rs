/*
 * @module-id: rust.response-queue-policy
 * @primary-capability: rust.source-module
 * @locs-version: 2.0
 * @stability: active
 * @owner: omnyid
 */

use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct ResponseQueuePolicy {
    #[serde(default = "default_supplier_due_hours")]
    pub supplier_due_hours: i32,
    #[serde(default = "default_friend_due_hours")]
    pub friend_due_hours: i32,
    #[serde(default = "default_general_due_hours")]
    pub general_due_hours: i32,
    #[serde(default = "default_prioritize_with_local_llm")]
    pub prioritize_with_local_llm: bool,
    #[serde(default = "default_allow_remote_fallback")]
    pub allow_remote_fallback: bool,
}

impl Default for ResponseQueuePolicy {
    fn default() -> Self {
        Self {
            supplier_due_hours: default_supplier_due_hours(),
            friend_due_hours: default_friend_due_hours(),
            general_due_hours: default_general_due_hours(),
            prioritize_with_local_llm: default_prioritize_with_local_llm(),
            allow_remote_fallback: default_allow_remote_fallback(),
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct NotificationSourceFilters {
    #[serde(default = "default_true")]
    pub allow_system: bool,
    #[serde(default = "default_true")]
    pub allow_people: bool,
    #[serde(default = "default_true")]
    pub allow_organizations: bool,
    #[serde(default = "default_true")]
    pub allow_domains: bool,
    #[serde(default)]
    pub allowed_people: Vec<String>,
    #[serde(default)]
    pub allowed_agent_ids: Vec<String>,
    #[serde(default)]
    pub allowed_organizations: Vec<String>,
    #[serde(default)]
    pub allowed_domains: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub response_queue_policy: Option<ResponseQueuePolicy>,
}

impl Default for NotificationSourceFilters {
    fn default() -> Self {
        Self {
            allow_system: true,
            allow_people: true,
            allow_organizations: true,
            allow_domains: true,
            allowed_people: Vec::new(),
            allowed_agent_ids: Vec::new(),
            allowed_organizations: Vec::new(),
            allowed_domains: Vec::new(),
            response_queue_policy: None,
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct AgentExecutionProfile {
    pub mode: String,
    pub max_react_loops: u8,
    pub reflection_level: String,
    pub context_window_policy: String,
}

impl AgentExecutionProfile {
    pub fn from_mode(mode: &str) -> Self {
        match mode {
            "speed" => Self {
                mode: "speed".to_string(),
                max_react_loops: 1,
                reflection_level: "minimal".to_string(),
                context_window_policy: "tight".to_string(),
            },
            "cost" => Self {
                mode: "cost".to_string(),
                max_react_loops: 1,
                reflection_level: "minimal".to_string(),
                context_window_policy: "compact".to_string(),
            },
            _ => Self {
                mode: "balanced".to_string(),
                max_react_loops: 3,
                reflection_level: "adaptive".to_string(),
                context_window_policy: "compact".to_string(),
            },
        }
    }

    pub fn sanitized(&self) -> Self {
        Self::from_mode(&self.mode)
    }
}

fn default_true() -> bool {
    true
}

fn default_supplier_due_hours() -> i32 {
    24
}

fn default_friend_due_hours() -> i32 {
    48
}

fn default_general_due_hours() -> i32 {
    36
}

fn default_prioritize_with_local_llm() -> bool {
    true
}

fn default_allow_remote_fallback() -> bool {
    true
}
