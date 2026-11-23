/*
 * @module-id: rust.memory-workspace
 * @primary-capability: rust.source-module
 * @locs-version: 2.0
 * @stability: active
 * @owner: omnyid
 */

use serde_json::{Map, Value};

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct MemoryWorkspaceScope {
    pub memory_space: Option<String>,
    pub author_mask: Option<String>,
    pub author_type: Option<String>,
    pub author_id: Option<String>,
    pub is_human_authored: Option<bool>,
    pub human_only: Option<bool>,
}

pub fn apply_workspace_scope_metadata(
    metadata: &mut Map<String, Value>,
    scope: Option<&MemoryWorkspaceScope>,
) {
    let Some(scope) = scope else {
        return;
    };

    if let Some(memory_space) = scope.memory_space.as_ref() {
        metadata.insert(
            "memory_space".to_string(),
            Value::String(memory_space.clone()),
        );
    }
    if let Some(author_mask) = scope.author_mask.as_ref() {
        metadata.insert(
            "author_mask".to_string(),
            Value::String(author_mask.clone()),
        );
    }
    if let Some(author_type) = scope.author_type.as_ref() {
        metadata.insert(
            "author_type".to_string(),
            Value::String(author_type.clone()),
        );
    }
    if let Some(author_id) = scope.author_id.as_ref() {
        metadata.insert("author_id".to_string(), Value::String(author_id.clone()));
    }
    if let Some(is_human_authored) = scope.is_human_authored {
        metadata.insert(
            "is_human_authored".to_string(),
            Value::Bool(is_human_authored),
        );
    }
    if let Some(human_only) = scope.human_only {
        metadata.insert("human_only".to_string(), Value::Bool(human_only));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn apply_workspace_scope_metadata_populates_optional_fields() {
        let mut metadata = Map::new();
        apply_workspace_scope_metadata(
            &mut metadata,
            Some(&MemoryWorkspaceScope {
                memory_space: Some("work".to_string()),
                author_mask: Some("private".to_string()),
                author_type: Some("human".to_string()),
                author_id: Some("user_root".to_string()),
                is_human_authored: Some(true),
                human_only: Some(true),
            }),
        );

        assert_eq!(
            metadata.get("memory_space").and_then(Value::as_str),
            Some("work")
        );
        assert_eq!(
            metadata.get("author_mask").and_then(Value::as_str),
            Some("private")
        );
        assert_eq!(
            metadata.get("author_type").and_then(Value::as_str),
            Some("human")
        );
        assert_eq!(
            metadata.get("author_id").and_then(Value::as_str),
            Some("user_root")
        );
        assert_eq!(
            metadata.get("is_human_authored").and_then(Value::as_bool),
            Some(true)
        );
        assert_eq!(
            metadata.get("human_only").and_then(Value::as_bool),
            Some(true)
        );
    }
}
