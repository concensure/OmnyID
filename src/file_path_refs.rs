use serde_json::Value;

pub fn message_file_path_refs(message: &Value) -> Vec<String> {
    [
        &message["path"],
        &message["file_path"],
        &message["relative_path"],
        &message["absolute_path"],
        &message["content"]["path"],
        &message["content"]["file_path"],
        &message["content"]["relative_path"],
        &message["content"]["absolute_path"],
        &message["metadata"]["path"],
        &message["metadata"]["file_path"],
        &message["metadata"]["relative_path"],
        &message["metadata"]["absolute_path"],
        &message["content"]["metadata"]["path"],
        &message["content"]["metadata"]["file_path"],
        &message["content"]["metadata"]["relative_path"],
        &message["content"]["metadata"]["absolute_path"],
    ]
    .iter()
    .filter_map(|value| value.as_str())
    .filter_map(normalize_file_path_ref)
    .collect()
}

pub fn normalize_file_path_ref(raw: &str) -> Option<String> {
    let normalized = raw.trim();
    if normalized.is_empty() {
        return None;
    }
    if normalized.starts_with("file:") {
        return Some(normalized.to_string());
    }
    Some(format!("file:{normalized}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn message_file_path_refs_normalizes_supported_fields() {
        let message = json!({
            "content": { "file_path": "notes/launch-plan.md" },
            "metadata": { "absolute_path": "file:/tmp/brief.md" }
        });

        let refs = message_file_path_refs(&message);
        assert!(refs.contains(&"file:notes/launch-plan.md".to_string()));
        assert!(refs.contains(&"file:/tmp/brief.md".to_string()));
    }
}
