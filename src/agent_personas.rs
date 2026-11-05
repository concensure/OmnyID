/*
 * @module-id: rust.agent-personas
 * @primary-capability: rust.source-module
 * @locs-version: 2.0
 * @stability: active
 * @owner: omnyid
 */

use base64::Engine as _;
use serde::{Deserialize, Serialize};
use ulid::Ulid;

use crate::db::Db;

const DEFAULT_WRITING_STYLE: &str = "balanced";
const MAX_PERSONA_IMAGE_BYTES: usize = 128 * 1024;
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
    pub image_data_url: Option<String>,
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
    pub image_data_url: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdatePersonaRequest {
    pub name: Option<String>,
    pub soul_md: Option<String>,
    pub writing_style: Option<String>,
    #[serde(default, alias = "skills")]
    pub labels: Option<Vec<String>>,
    #[serde(default)]
    pub image_data_url: Option<Option<String>>,
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

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct AgentUiPreferences {
    pub owner_user_id: String,
    pub persona_fab_visible: bool,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
pub struct UpdateAgentUiPreferencesRequest {
    pub persona_fab_visible: bool,
}

pub fn sanitize_persona_image_data_url(value: Option<&str>) -> Result<Option<String>, String> {
    let Some(value) = value.map(str::trim).filter(|value| !value.is_empty()) else {
        return Ok(None);
    };
    let (prefix, encoded) = value
        .split_once(',')
        .ok_or_else(|| "persona image must be a data URL".to_string())?;
    if !matches!(
        prefix.to_ascii_lowercase().as_str(),
        "data:image/webp;base64" | "data:image/jpeg;base64" | "data:image/png;base64"
    ) {
        return Err("persona image must be WebP, JPEG, or PNG".to_string());
    }
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(encoded)
        .map_err(|_| "persona image is not valid base64".to_string())?;
    if bytes.is_empty() || bytes.len() > MAX_PERSONA_IMAGE_BYTES {
        return Err("persona image must be between 1 byte and 128 KB".to_string());
    }
    Ok(Some(value.to_string()))
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
    pub async fn get_agent_ui_preferences(
        &self,
        user_id: &str,
    ) -> Result<AgentUiPreferences, sqlx::Error> {
        sqlx::query_as::<_, AgentUiPreferences>(
            r#"INSERT INTO user_agent_ui_preferences (owner_user_id)
               VALUES ($1)
               ON CONFLICT (owner_user_id) DO UPDATE
               SET owner_user_id = EXCLUDED.owner_user_id
               RETURNING owner_user_id, persona_fab_visible, updated_at::text"#,
        )
        .bind(user_id)
        .fetch_one(&self.pool)
        .await
    }

    pub async fn update_agent_ui_preferences(
        &self,
        user_id: &str,
        persona_fab_visible: bool,
    ) -> Result<AgentUiPreferences, sqlx::Error> {
        sqlx::query_as::<_, AgentUiPreferences>(
            r#"INSERT INTO user_agent_ui_preferences (owner_user_id, persona_fab_visible)
               VALUES ($1, $2)
               ON CONFLICT (owner_user_id) DO UPDATE
               SET persona_fab_visible = EXCLUDED.persona_fab_visible,
                   updated_at = NOW()
               RETURNING owner_user_id, persona_fab_visible, updated_at::text"#,
        )
        .bind(user_id)
        .bind(persona_fab_visible)
        .fetch_one(&self.pool)
        .await
    }

    pub async fn list_agent_personas(
        &self,
        user_id: &str,
    ) -> Result<Vec<AgentPersona>, sqlx::Error> {
        sqlx::query_as::<_, AgentPersona>(
            "SELECT id, owner_user_id, name, soul_md, writing_style, skills_json, image_data_url, lora_confidence_score, lora_genome_active, is_active, created_at::text, updated_at::text FROM agent_personas WHERE owner_user_id = $1 ORDER BY created_at ASC",
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
        let image_data_url = sanitize_persona_image_data_url(req.image_data_url.as_deref())
            .map_err(|error| sqlx::Error::Protocol(error))?;
        sqlx::query_as::<_, AgentPersona>(
            r#"INSERT INTO agent_personas
                (id, owner_user_id, name, soul_md, writing_style, skills_json, image_data_url)
               VALUES ($1, $2, $3, $4, $5, $6, $7)
               RETURNING id, owner_user_id, name, soul_md, writing_style, skills_json, image_data_url, lora_confidence_score, lora_genome_active, is_active, created_at::text, updated_at::text"#,
        )
        .bind(&id)
        .bind(user_id)
        .bind(&name)
        .bind(&soul_md)
        .bind(&writing_style)
        .bind(&skills)
        .bind(&image_data_url)
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
            "SELECT id, owner_user_id, name, soul_md, writing_style, skills_json, image_data_url, lora_confidence_score, lora_genome_active, is_active, created_at::text, updated_at::text FROM agent_personas WHERE id = $1 AND owner_user_id = $2",
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
        let image_data_url = match req.image_data_url.as_ref() {
            Some(value) => {
                sanitize_persona_image_data_url(value.as_deref()).map_err(sqlx::Error::Protocol)?
            }
            None => existing.image_data_url.clone(),
        };

        let updated = sqlx::query_as::<_, AgentPersona>(
            r#"UPDATE agent_personas
               SET name                  = $3,
                   soul_md               = $4,
                   writing_style         = $5,
                   skills_json           = $6,
                   image_data_url        = $7,
                   lora_confidence_score = $8,
                   updated_at            = NOW()
               WHERE id = $1 AND owner_user_id = $2
               RETURNING id, owner_user_id, name, soul_md, writing_style, skills_json, image_data_url, lora_confidence_score, lora_genome_active, is_active, created_at::text, updated_at::text"#,
        )
        .bind(persona_id)
        .bind(user_id)
        .bind(&next_name)
        .bind(&next_soul_md)
        .bind(&next_writing_style)
        .bind(&skills)
        .bind(&image_data_url)
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
            "SELECT id, owner_user_id, name, soul_md, writing_style, skills_json, image_data_url, lora_confidence_score, lora_genome_active, is_active, created_at::text, updated_at::text FROM agent_personas WHERE owner_user_id = $1 AND is_active = TRUE ORDER BY updated_at DESC LIMIT 1",
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
        restyle_user_facing_text, sanitize_persona_image_data_url, sanitize_persona_labels,
        sanitize_persona_name, sanitize_persona_soul_md, sanitize_persona_writing_style,
    };

    fn sample_persona() -> AgentPersona {
        AgentPersona {
            id: "persona_1".to_string(),
            owner_user_id: "user_1".to_string(),
            name: "Mary".to_string(),
            soul_md: "Keep the tone calm, warm, and quietly proactive.".to_string(),
            writing_style: "warm".to_string(),
            skills_json: serde_json::json!(["email", "notes"]),
            image_data_url: None,
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
    fn persona_image_validation_accepts_small_images_and_rejects_active_content() {
        assert_eq!(
            sanitize_persona_image_data_url(Some("data:image/webp;base64,AQID")).unwrap(),
            Some("data:image/webp;base64,AQID".to_string())
        );
        assert!(
            sanitize_persona_image_data_url(Some("data:image/svg+xml;base64,PHN2Zz4=")).is_err()
        );
        assert!(sanitize_persona_image_data_url(Some("https://example.com/avatar.png")).is_err());
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
