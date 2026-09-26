/*
 * @locs-version: 1.1
 * @module-id: gateway.notion
 * @module-name: NotionGateway
 * @category: gateway
 * @domain: external-integration
 * @primary-capability: notion-page-creation
 * @sub-capabilities: block-append,markdown-conversion
 * @version: 1.0.0
 * @stability: draft
 * @state-model: stateless
 * @side-effects: explicit
 * @inputs: NotionConfig, title, markdown content
 * @outputs: NotionPageRef (page_id, url)
 * @dependencies: [reqwest, serde_json]
 * @guard-mode: editable
 */

//! Notion REST API gateway.
//!
//! Sends authenticated requests to the Notion API v1. Config is sourced from
//! environment variables `OMNYID_NOTION_TOKEN` and `OMNYID_NOTION_DATABASE_ID`.
//! When the token is absent all write functions return `Ok` with a stub ref
//! so orchestration continues gracefully without a real Notion account.

use std::sync::OnceLock;

// GAP-097: shared client for connection pooling across all Notion API calls.
static NOTION_CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
fn notion_client() -> &'static reqwest::Client {
    NOTION_CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(30))
            .build()
            .unwrap_or_default()
    })
}

/* locs:section id=types edit=editable role=contract */

/// Auth and routing config for the Notion API.
pub struct NotionConfig {
    pub token: String,
    pub database_id: String,
}

/// Reference to a created or updated Notion page.
#[derive(Debug, Clone)]
pub struct NotionPageRef {
    pub page_id: String,
    pub url: String,
}

/* locs:end */

/* locs:section id=impl edit=editable role=implementation */

/// Create a new page in the configured Notion database.
///
/// `markdown` is split into one paragraph block per non-empty line.
/// Returns a stub ref when `cfg.token` is empty (integration not configured).
pub async fn post_page(
    cfg: &NotionConfig,
    title: &str,
    markdown: &str,
) -> Result<NotionPageRef, String> {
    if cfg.token.is_empty() {
        return Ok(NotionPageRef {
            page_id: "stub-not-configured".into(),
            url: String::new(),
        });
    }

    let blocks = markdown_to_blocks(markdown);

    let body = serde_json::json!({
        "parent": {
            "type": "database_id",
            "database_id": cfg.database_id
        },
        "properties": {
            "title": {
                "title": [
                    { "text": { "content": title } }
                ]
            }
        },
        "children": blocks
    });

    let resp = notion_client()
        .post("https://api.notion.com/v1/pages")
        .header("Authorization", format!("Bearer {}", cfg.token))
        .header("Content-Type", "application/json")
        .header("Notion-Version", "2022-06-28")
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("Notion API error {status}: {text}"));
    }

    let json: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    let page_id = json["id"].as_str().unwrap_or("").to_string();
    let url = json["url"].as_str().unwrap_or("").to_string();

    Ok(NotionPageRef { page_id, url })
}

/// Append blocks to an existing Notion page.
pub async fn append_block(cfg: &NotionConfig, page_id: &str, markdown: &str) -> Result<(), String> {
    if cfg.token.is_empty() {
        return Ok(());
    }

    let blocks = markdown_to_blocks(markdown);
    let body = serde_json::json!({ "children": blocks });

    let resp = notion_client()
        .patch(format!(
            "https://api.notion.com/v1/blocks/{page_id}/children"
        ))
        .header("Authorization", format!("Bearer {}", cfg.token))
        .header("Content-Type", "application/json")
        .header("Notion-Version", "2022-06-28")
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("Notion append error {status}: {text}"));
    }

    Ok(())
}

/* locs:end */

/* locs:section id=helpers edit=editable role=implementation */

fn markdown_to_blocks(markdown: &str) -> Vec<serde_json::Value> {
    markdown
        .lines()
        .filter(|l| !l.trim().is_empty())
        .map(|line| {
            serde_json::json!({
                "object": "block",
                "type": "paragraph",
                "paragraph": {
                    "rich_text": [
                        { "type": "text", "text": { "content": line } }
                    ]
                }
            })
        })
        .collect()
}

/* locs:end */

/* locs:section id=tests edit=editable role=example */

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_token_returns_stub() {
        let rt = tokio::runtime::Runtime::new().unwrap();
        let cfg = NotionConfig {
            token: String::new(),
            database_id: String::new(),
        };
        let result = rt.block_on(post_page(&cfg, "Test", "Some content"));
        assert!(result.is_ok());
        assert_eq!(result.unwrap().page_id, "stub-not-configured");
    }

    #[test]
    fn markdown_to_blocks_splits_lines() {
        let blocks = markdown_to_blocks("Line one\nLine two\n\nLine three");
        assert_eq!(blocks.len(), 3);
    }

    #[test]
    fn notion_client_is_shared_singleton() {
        assert!(std::ptr::eq(notion_client(), notion_client()));
    }
}

/* locs:end */
