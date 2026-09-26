/*
 * @module-id: rust.agent-personas
 * @primary-capability: rust.source-module
 * @locs-version: 2.0
 * @stability: active
 * @owner: omnyid
 */

use serde::{Deserialize, Serialize};
use ulid::Ulid;

use crate::db::Db;

const DEFAULT_WRITING_STYLE: &str = "balanced";
const ALLOWED_WRITING_STYLES: &[&str] = &[
    "balanced",
    "concise",
    "warm",
    "formal",
    "creative",
    "analytical",
];

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct AgentPersona {
    pub id: String,
    pub owner_user_id: String,
    pub name: String,
    pub soul_md: String,
    pub writing_style: String,
    pub skills_json: serde_json::Value,
    pub lora_confidence_score: f64,
    pub lora_genome_active: bool,
    pub is_active: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreatePersonaRequest {
    pub name: String,
    pub soul_md: Option<String>,
    pub writing_style: Option<String>,
    #[serde(default, alias = "skills")]
    pub labels: Option<Vec<String>>,
}

#[derive(Debug, Deserialize)]
pub struct UpdatePersonaRequest {
    pub name: Option<String>,
    pub soul_md: Option<String>,
    pub writing_style: Option<String>,
    #[serde(default, alias = "skills")]
    pub labels: Option<Vec<String>>,
    pub lora_confidence_score: Option<f64>,
}

pub fn sanitize_persona_name(value: &str) -> String {
    value.trim().to_string()
}

pub fn sanitize_persona_soul_md(value: &str) -> String {
    value.trim().to_string()
}

pub fn sanitize_persona_writing_style(value: &str) -> String {
    let normalized = value.trim().to_lowercase();
    if ALLOWED_WRITING_STYLES.contains(&normalized.as_str()) {
        normalized
    } else {
        DEFAULT_WRITING_STYLE.to_string()
    }
}

pub fn sanitize_persona_labels(values: &[String]) -> Vec<String> {
    let mut labels = Vec::new();
    for value in values {
        let normalized = value.trim();
        if normalized.is_empty() {
            continue;
        }
        let compact = normalized.chars().take(32).collect::<String>();
        if labels.iter().any(|existing| existing == &compact) {
            continue;
        }
        labels.push(compact);
        if labels.len() >= 24 {
            break;
        }
    }
    labels
}

pub fn build_user_facing_persona_prompt(persona: &AgentPersona) -> String {
    let mut lines = vec![
        "Active persona override for user-facing language only:".to_string(),
        format!("- Persona name: {}", persona.name),
        format!("- Writing style preset: {}", persona.writing_style),
        "- Apply this persona only to tone, emotional warmth, empathy, directness, brevity, and phrasing."
            .to_string(),
        "- If the base agent soul suggests a different tone, this persona takes precedence for user-visible wording."
            .to_string(),
        "- Do not change facts, priorities, tool choices, policy boundaries, approval requirements, or structured data."
            .to_string(),
        "- Do not mention the persona unless the user explicitly asks about it.".to_string(),
        "- When drafting a direct reply, note, or email for the user, keep the substance intact and restyle only the final wording."
            .to_string(),
    ];
    if !persona.soul_md.trim().is_empty() {
        lines.push(String::new());
        lines.push("Persona guidance:".to_string());
        lines.push(persona.soul_md.trim().to_string());
    }
    lines.join("\n")
}

fn writing_style_prefix(writing_style: &str) -> &'static str {
    match writing_style {
        "concise" => "Briefly: ",
        "warm" => "Here is a calm first pass: ",
        "formal" => "Assessment: ",
        "creative" => "Draft sketch: ",
        "analytical" => "Analysis: ",
        _ => "",
    }
}

pub fn restyle_user_facing_text(text: &str, persona: &AgentPersona) -> String {
    let prefix = writing_style_prefix(&persona.writing_style);
    if prefix.is_empty() || text.trim().is_empty() || text.starts_with(prefix) {
        return text.to_string();
    }
    format!("{prefix}{text}")
}

impl Db {
    pub async fn list_agent_personas(
        &self,
        user_id: &str,
    ) -> Result<Vec<AgentPersona>, sqlx::Error> {
        sqlx::query_as::<_, AgentPersona>(
            "SELECT id, owner_user_id, name, soul_md, writing_style, skills_json, lora_confidence_score, lora_genome_active, is_active, created_at::text, updated_at::text FROM agent_personas WHERE owner_user_id = $1 ORDER BY created_at ASC",
        )
        .bind(user_id)
        .fetch_all(&self.pool)
        .await
    }

    pub async fn create_agent_persona(
        &self,
        user_id: &str,
        req: &CreatePersonaRequest,
    ) -> Result<AgentPersona, sqlx::Error> {
        let id = Ulid::new().to_string();
        let name = sanitize_persona_name(&req.name);
        let soul_md = req
            .soul_md
            .as_deref()
            .map(sanitize_persona_soul_md)
            .unwrap_or_default();
        let writing_style = req
            .writing_style
            .as_deref()
            .map(sanitize_persona_writing_style)
            .unwrap_or_else(|| DEFAULT_WRITING_STYLE.to_string());
        let labels = sanitize_persona_labels(req.labels.as_deref().unwrap_or(&[]));
        let skills = serde_json::to_value(labels).unwrap_or(serde_json::json!([]));
        sqlx::query_as::<_, AgentPersona>(
            r#"INSERT INTO agent_personas
                (id, owner_user_id, name, soul_md, writing_style, skills_json)
               VALUES ($1, $2, $3, $4, $5, $6)
               RETURNING id, owner_user_id, name, soul_md, writing_style, skills_json, lora_confidence_score, lora_genome_active, is_active, created_at::text, updated_at::text"#,
        )
        .bind(&id)
        .bind(user_id)
        .bind(&name)
        .bind(&soul_md)
        .bind(&writing_style)
        .bind(&skills)
        .fetch_one(&self.pool)
        .await
    }

    pub async fn update_agent_persona(
        &self,
        user_id: &str,
        persona_id: &str,
        req: &UpdatePersonaRequest,
    ) -> Result<Option<AgentPersona>, sqlx::Error> {
        let existing = sqlx::query_as::<_, AgentPersona>(
            "SELECT id, owner_user_id, name, soul_md, writing_style, skills_json, lora_confidence_score, lora_genome_active, is_active, created_at::text, updated_at::text FROM agent_personas WHERE id = $1 AND owner_user_id = $2",
        )
        .bind(persona_id)
        .bind(user_id)
        .fetch_optional(&self.pool)
        .await?;

        let Some(existing) = existing else {
            return Ok(None);
        };

        let next_name = req
            .name
            .as_deref()
            .map(sanitize_persona_name)
            .unwrap_or_else(|| existing.name.clone());
        let next_soul_md = req
            .soul_md
            .as_deref()
            .map(sanitize_persona_soul_md)
            .unwrap_or_else(|| existing.soul_md.clone());
        let next_writing_style = req
            .writing_style
            .as_deref()
            .map(sanitize_persona_writing_style)
            .unwrap_or_else(|| existing.writing_style.clone());
        let skills = req
            .labels
            .as_ref()
            .map(|labels| {
                serde_json::to_value(sanitize_persona_labels(labels))
                    .unwrap_or(serde_json::json!([]))
            })
            .unwrap_or_else(|| existing.skills_json.clone());

        let updated = sqlx::query_as::<_, AgentPersona>(
            r#"UPDATE agent_personas
               SET name                  = $3,
                   soul_md               = $4,
                   writing_style         = $5,
                   skills_json           = $6,
                   lora_confidence_score = $7,
                   updated_at            = NOW()
               WHERE id = $1 AND owner_user_id = $2
               RETURNING id, owner_user_id, name, soul_md, writing_style, skills_json, lora_confidence_score, lora_genome_active, is_active, created_at::text, updated_at::text"#,
        )
        .bind(persona_id)
        .bind(user_id)
        .bind(&next_name)
        .bind(&next_soul_md)
        .bind(&next_writing_style)
        .bind(&skills)
        .bind(req.lora_confidence_score.unwrap_or(existing.lora_confidence_score))
        .fetch_optional(&self.pool)
        .await?;

        Ok(updated)
    }

    pub async fn activate_agent_persona(
        &self,
        user_id: &str,
        persona_id: &str,
    ) -> Result<bool, sqlx::Error> {
        let mut tx = self.pool.begin().await?;
        let exists = sqlx::query_scalar::<_, bool>(
            "SELECT EXISTS(SELECT 1 FROM agent_personas WHERE id = $1 AND owner_user_id = $2)",
        )
        .bind(persona_id)
        .bind(user_id)
        .fetch_one(&mut *tx)
        .await?;
        if !exists {
            tx.rollback().await?;
            return Ok(false);
        }
        sqlx::query(
            "UPDATE agent_personas SET is_active = FALSE, updated_at = NOW() WHERE owner_user_id = $1",
        )
        .bind(user_id)
        .execute(&mut *tx)
        .await?;
        // Activate the target
        let rows = sqlx::query(
            "UPDATE agent_personas SET is_active = TRUE, updated_at = NOW() WHERE id = $1 AND owner_user_id = $2",
        )
        .bind(persona_id)
        .bind(user_id)
        .execute(&mut *tx)
        .await?
        .rows_affected();
        tx.commit().await?;
        Ok(rows > 0)
    }

    pub async fn get_active_agent_persona(
        &self,
        user_id: &str,
    ) -> Result<Option<AgentPersona>, sqlx::Error> {
        sqlx::query_as::<_, AgentPersona>(
            "SELECT id, owner_user_id, name, soul_md, writing_style, skills_json, lora_confidence_score, lora_genome_active, is_active, created_at::text, updated_at::text FROM agent_personas WHERE owner_user_id = $1 AND is_active = TRUE ORDER BY updated_at DESC LIMIT 1",
        )
        .bind(user_id)
        .fetch_optional(&self.pool)
        .await
    }

    pub async fn delete_agent_persona(
        &self,
        user_id: &str,
        persona_id: &str,
    ) -> Result<bool, sqlx::Error> {
        let rows = sqlx::query("DELETE FROM agent_personas WHERE id = $1 AND owner_user_id = $2")
            .bind(persona_id)
            .bind(user_id)
            .execute(&self.pool)
            .await?
            .rows_affected();
        Ok(rows > 0)
    }
}

pub async fn resolve_active_persona_output_prompt(
    db: &Db,
    user_id: &str,
) -> Result<Option<String>, sqlx::Error> {
    let active = db.get_active_agent_persona(user_id).await?;
    Ok(active.as_ref().map(build_user_facing_persona_prompt))
}

#[cfg(test)]
mod tests {
    use super::{
        AgentPersona, CreatePersonaRequest, build_user_facing_persona_prompt,
        restyle_user_facing_text, sanitize_persona_labels, sanitize_persona_name,
        sanitize_persona_soul_md, sanitize_persona_writing_style,
    };

    fn sample_persona() -> AgentPersona {
        AgentPersona {
            id: "persona_1".to_string(),
            owner_user_id: "user_1".to_string(),
            name: "Mary".to_string(),
            soul_md: "Keep the tone calm, warm, and quietly proactive.".to_string(),
            writing_style: "warm".to_string(),
            skills_json: serde_json::json!(["email", "notes"]),
            lora_confidence_score: 0.0,
            lora_genome_active: false,
            is_active: true,
            created_at: "2026-08-26T00:00:00Z".to_string(),
            updated_at: "2026-08-26T00:00:00Z".to_string(),
        }
    }

    #[test]
    fn sanitize_persona_fields_normalizes_values() {
        assert_eq!(sanitize_persona_name("  Mary  "), "Mary");
        assert_eq!(
            sanitize_persona_soul_md("  Keep replies short.  "),
            "Keep replies short."
        );
        assert_eq!(sanitize_persona_writing_style(" WARM "), "warm");
        assert_eq!(sanitize_persona_writing_style("unknown"), "balanced");
    }

    #[test]
    fn sanitize_persona_labels_trims_deduplicates_and_drops_blank_entries() {
        let labels = sanitize_persona_labels(&[
            " email ".to_string(),
            "".to_string(),
            "notes".to_string(),
            "email".to_string(),
        ]);
        assert_eq!(labels, vec!["email".to_string(), "notes".to_string()]);
    }

    #[test]
    fn persona_prompt_is_explicitly_user_facing_only() {
        let prompt = build_user_facing_persona_prompt(&sample_persona());
        assert!(prompt.contains("user-facing language only"));
        assert!(prompt.contains("Do not change facts"));
        assert!(prompt.contains("takes precedence for user-visible wording"));
        assert!(prompt.contains("Mary"));
        assert!(prompt.contains("Keep the tone calm, warm, and quietly proactive."));
        assert!(!prompt.contains("[\"email\",\"notes\"]"));
        assert!(!prompt.contains("skills_json"));
    }

    #[test]
    fn restyle_user_facing_text_applies_writing_style_prefix_once() {
        let persona = sample_persona();
        assert_eq!(
            restyle_user_facing_text("I drafted the reply.", &persona),
            "Here is a calm first pass: I drafted the reply."
        );
        assert_eq!(
            restyle_user_facing_text("Here is a calm first pass: I drafted the reply.", &persona),
            "Here is a calm first pass: I drafted the reply."
        );
    }

    #[test]
    fn create_persona_request_accepts_legacy_skills_alias() {
        let req: CreatePersonaRequest = serde_json::from_value(serde_json::json!({
            "name": "Warm operator",
            "skills": ["email", "notes"]
        }))
        .expect("legacy skills alias should deserialize");
        assert_eq!(
            req.labels,
            Some(vec!["email".to_string(), "notes".to_string()])
        );
    }
}
