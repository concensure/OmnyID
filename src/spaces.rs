/*
 * @module-id: rust.spaces
 * @primary-capability: rust.source-module
 * @locs-version: 2.0
 * @stability: active
 * @owner: omnyid
 */

use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use ulid::Ulid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Space {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub owner_user_id: String,
    pub afp_thread_id: String,
    pub is_public: bool,
    pub settings: serde_json::Value,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpaceMember {
    pub id: String,
    pub space_id: String,
    pub user_id: String,
    pub agent_id: Option<String>,
    pub role: String,
    pub joined_at: String,
    pub invited_by: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpaceMessage {
    pub id: String,
    pub space_id: String,
    pub afp_message_id: String,
    pub from_agent: String,
    pub author_user_id: String,
    pub r#type: String,
    pub subtype: Option<String>,
    pub content: serde_json::Value,
    pub created_at: String,
}

pub struct SpaceManager {
    pool: PgPool,
}

impl SpaceManager {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    pub async fn create_space(
        &self,
        owner_user_id: &str,
        name: &str,
        description: Option<&str>,
        is_public: bool,
    ) -> Result<Space, sqlx::Error> {
        let id = Ulid::new().to_string();
        let afp_thread_id = format!("space:{}", &id);
        let now = chrono::Utc::now().to_rfc3339();

        sqlx::query("SELECT set_config('app.current_user_id', $1, true)")
            .bind(owner_user_id)
            .execute(&self.pool)
            .await?;

        sqlx::query(
            r#"
            INSERT INTO spaces (id, name, description, owner_user_id, afp_thread_id, is_public, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7::timestamptz, $7::timestamptz)
            "#,
        )
        .bind(&id)
        .bind(name)
        .bind(description)
        .bind(owner_user_id)
        .bind(&afp_thread_id)
        .bind(is_public)
        .bind(&now)
        .execute(&self.pool)
        .await?;

        // Owner is automatically an admin member
        let member_id = Ulid::new().to_string();
        sqlx::query(
            r#"
            INSERT INTO space_members (id, space_id, user_id, role, joined_at)
            VALUES ($1, $2, $3, 'admin', $4::timestamptz)
            ON CONFLICT (space_id, user_id) DO NOTHING
            "#,
        )
        .bind(&member_id)
        .bind(&id)
        .bind(owner_user_id)
        .bind(&now)
        .execute(&self.pool)
        .await?;

        Ok(Space {
            id,
            name: name.to_string(),
            description: description.map(String::from),
            owner_user_id: owner_user_id.to_string(),
            afp_thread_id,
            is_public,
            settings: serde_json::json!({}),
            created_at: now.clone(),
            updated_at: now,
        })
    }

    pub async fn get_space(
        &self,
        space_id: &str,
        requesting_user_id: &str,
    ) -> Result<Option<Space>, sqlx::Error> {
        sqlx::query("SELECT set_config('app.current_user_id', $1, true)")
            .bind(requesting_user_id)
            .execute(&self.pool)
            .await?;

        let row = sqlx::query(
            r#"
            SELECT s.id, s.name, s.description, s.owner_user_id, s.afp_thread_id,
                   s.is_public, s.settings, s.created_at, s.updated_at
            FROM spaces s
            WHERE s.id = $1
              AND (
                s.owner_user_id = $2
                OR s.is_public = TRUE
                OR EXISTS (SELECT 1 FROM space_members sm WHERE sm.space_id = s.id AND sm.user_id = $2)
              )
            "#,
        )
        .bind(space_id)
        .bind(requesting_user_id)
        .fetch_optional(&self.pool)
        .await?;

        Ok(row.map(|r| {
            use sqlx::Row;
            Space {
                id: r.try_get("id").unwrap_or_default(),
                name: r.try_get("name").unwrap_or_default(),
                description: r.try_get("description").ok().flatten(),
                owner_user_id: r.try_get("owner_user_id").unwrap_or_default(),
                afp_thread_id: r.try_get("afp_thread_id").unwrap_or_default(),
                is_public: r.try_get("is_public").unwrap_or(false),
                settings: r.try_get("settings").unwrap_or(serde_json::json!({})),
                created_at: r
                    .try_get::<chrono::DateTime<chrono::Utc>, _>("created_at")
                    .map(|d| d.to_rfc3339())
                    .unwrap_or_default(),
                updated_at: r
                    .try_get::<chrono::DateTime<chrono::Utc>, _>("updated_at")
                    .map(|d| d.to_rfc3339())
                    .unwrap_or_default(),
            }
        }))
    }

    pub async fn list_spaces_for_user(&self, user_id: &str) -> Result<Vec<Space>, sqlx::Error> {
        sqlx::query("SELECT set_config('app.current_user_id', $1, true)")
            .bind(user_id)
            .execute(&self.pool)
            .await?;

        let rows = sqlx::query(
            r#"
            SELECT s.id, s.name, s.description, s.owner_user_id, s.afp_thread_id,
                   s.is_public, s.settings, s.created_at, s.updated_at
            FROM spaces s
            WHERE s.owner_user_id = $1
               OR EXISTS (SELECT 1 FROM space_members sm WHERE sm.space_id = s.id AND sm.user_id = $1)
            ORDER BY s.updated_at DESC
            LIMIT 50
            "#,
        )
        .bind(user_id)
        .fetch_all(&self.pool)
        .await?;

        Ok(rows
            .iter()
            .map(|r| {
                use sqlx::Row;
                Space {
                    id: r.try_get("id").unwrap_or_default(),
                    name: r.try_get("name").unwrap_or_default(),
                    description: r.try_get("description").ok().flatten(),
                    owner_user_id: r.try_get("owner_user_id").unwrap_or_default(),
                    afp_thread_id: r.try_get("afp_thread_id").unwrap_or_default(),
                    is_public: r.try_get("is_public").unwrap_or(false),
                    settings: r.try_get("settings").unwrap_or(serde_json::json!({})),
                    created_at: r
                        .try_get::<chrono::DateTime<chrono::Utc>, _>("created_at")
                        .map(|d| d.to_rfc3339())
                        .unwrap_or_default(),
                    updated_at: r
                        .try_get::<chrono::DateTime<chrono::Utc>, _>("updated_at")
                        .map(|d| d.to_rfc3339())
                        .unwrap_or_default(),
                }
            })
            .collect())
    }

    pub async fn join_space(
        &self,
        space_id: &str,
        user_id: &str,
        agent_id: Option<&str>,
    ) -> Result<SpaceMember, sqlx::Error> {
        sqlx::query("SELECT set_config('app.current_user_id', $1, true)")
            .bind(user_id)
            .execute(&self.pool)
            .await?;

        let id = Ulid::new().to_string();
        let now = chrono::Utc::now().to_rfc3339();

        sqlx::query(
            r#"
            INSERT INTO space_members (id, space_id, user_id, agent_id, role, joined_at)
            VALUES ($1, $2, $3, $4, 'contributor', $5::timestamptz)
            ON CONFLICT (space_id, user_id) DO UPDATE SET agent_id = EXCLUDED.agent_id
            "#,
        )
        .bind(&id)
        .bind(space_id)
        .bind(user_id)
        .bind(agent_id)
        .bind(&now)
        .execute(&self.pool)
        .await?;

        Ok(SpaceMember {
            id,
            space_id: space_id.to_string(),
            user_id: user_id.to_string(),
            agent_id: agent_id.map(String::from),
            role: "contributor".to_string(),
            joined_at: now,
            invited_by: None,
        })
    }

    pub async fn leave_space(&self, space_id: &str, user_id: &str) -> Result<bool, sqlx::Error> {
        sqlx::query("SELECT set_config('app.current_user_id', $1, true)")
            .bind(user_id)
            .execute(&self.pool)
            .await?;

        let result = sqlx::query("DELETE FROM space_members WHERE space_id = $1 AND user_id = $2")
            .bind(space_id)
            .bind(user_id)
            .execute(&self.pool)
            .await?;

        Ok(result.rows_affected() > 0)
    }

    pub async fn post_message(
        &self,
        space_id: &str,
        afp_message_id: &str,
        from_agent: &str,
        author_user_id: &str,
        msg_type: &str,
        subtype: Option<&str>,
        content: serde_json::Value,
    ) -> Result<SpaceMessage, sqlx::Error> {
        sqlx::query("SELECT set_config('app.current_user_id', $1, true)")
            .bind(author_user_id)
            .execute(&self.pool)
            .await?;

        let id = Ulid::new().to_string();
        let now = chrono::Utc::now().to_rfc3339();

        sqlx::query(
            r#"
            INSERT INTO space_messages (id, space_id, afp_message_id, from_agent, author_user_id, type, subtype, content, created_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::timestamptz)
            "#,
        )
        .bind(&id)
        .bind(space_id)
        .bind(afp_message_id)
        .bind(from_agent)
        .bind(author_user_id)
        .bind(msg_type)
        .bind(subtype)
        .bind(&content)
        .bind(&now)
        .execute(&self.pool)
        .await?;

        // Bump space updated_at
        sqlx::query("UPDATE spaces SET updated_at = $1::timestamptz WHERE id = $2")
            .bind(&now)
            .bind(space_id)
            .execute(&self.pool)
            .await?;

        Ok(SpaceMessage {
            id,
            space_id: space_id.to_string(),
            afp_message_id: afp_message_id.to_string(),
            from_agent: from_agent.to_string(),
            author_user_id: author_user_id.to_string(),
            r#type: msg_type.to_string(),
            subtype: subtype.map(String::from),
            content,
            created_at: now,
        })
    }

    pub async fn list_messages(
        &self,
        space_id: &str,
        user_id: &str,
        limit: i64,
        before_id: Option<&str>,
    ) -> Result<Vec<SpaceMessage>, sqlx::Error> {
        sqlx::query("SELECT set_config('app.current_user_id', $1, true)")
            .bind(user_id)
            .execute(&self.pool)
            .await?;

        let rows = if let Some(bid) = before_id {
            sqlx::query(
                r#"
                SELECT id, space_id, afp_message_id, from_agent, author_user_id, type, subtype, content, created_at
                FROM space_messages
                WHERE space_id = $1 AND created_at < (SELECT created_at FROM space_messages WHERE id = $2)
                ORDER BY created_at DESC LIMIT $3
                "#,
            )
            .bind(space_id).bind(bid).bind(limit)
            .fetch_all(&self.pool).await?
        } else {
            sqlx::query(
                r#"
                SELECT id, space_id, afp_message_id, from_agent, author_user_id, type, subtype, content, created_at
                FROM space_messages
                WHERE space_id = $1
                ORDER BY created_at DESC LIMIT $2
                "#,
            )
            .bind(space_id).bind(limit)
            .fetch_all(&self.pool).await?
        };

        Ok(rows
            .iter()
            .map(|r| {
                use sqlx::Row;
                SpaceMessage {
                    id: r.try_get("id").unwrap_or_default(),
                    space_id: r.try_get("space_id").unwrap_or_default(),
                    afp_message_id: r.try_get("afp_message_id").unwrap_or_default(),
                    from_agent: r.try_get("from_agent").unwrap_or_default(),
                    author_user_id: r.try_get("author_user_id").unwrap_or_default(),
                    r#type: r.try_get("type").unwrap_or_default(),
                    subtype: r.try_get("subtype").ok().flatten(),
                    content: r.try_get("content").unwrap_or(serde_json::json!({})),
                    created_at: r
                        .try_get::<chrono::DateTime<chrono::Utc>, _>("created_at")
                        .map(|d| d.to_rfc3339())
                        .unwrap_or_default(),
                }
            })
            .collect())
    }

    pub async fn list_members(
        &self,
        space_id: &str,
        user_id: &str,
    ) -> Result<Vec<SpaceMember>, sqlx::Error> {
        sqlx::query("SELECT set_config('app.current_user_id', $1, true)")
            .bind(user_id)
            .execute(&self.pool)
            .await?;

        let rows = sqlx::query(
            r#"
            SELECT id, space_id, user_id, agent_id, role::text, joined_at, invited_by
            FROM space_members
            WHERE space_id = $1
            ORDER BY joined_at ASC
            "#,
        )
        .bind(space_id)
        .fetch_all(&self.pool)
        .await?;

        Ok(rows
            .iter()
            .map(|r| {
                use sqlx::Row;
                SpaceMember {
                    id: r.try_get("id").unwrap_or_default(),
                    space_id: r.try_get("space_id").unwrap_or_default(),
                    user_id: r.try_get("user_id").unwrap_or_default(),
                    agent_id: r.try_get("agent_id").ok().flatten(),
                    role: r
                        .try_get("role")
                        .unwrap_or_else(|_| "contributor".to_string()),
                    joined_at: r
                        .try_get::<chrono::DateTime<chrono::Utc>, _>("joined_at")
                        .map(|d| d.to_rfc3339())
                        .unwrap_or_default(),
                    invited_by: r.try_get("invited_by").ok().flatten(),
                }
            })
            .collect())
    }
}
