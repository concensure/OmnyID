use serde_json::Value;
use std::collections::HashSet;

pub fn message_source_message_refs(message: &Value) -> Vec<String> {
    collect_string_refs(&[
        message.get("source_message_id"),
        message.get("source_id"),
        message
            .get("content")
            .and_then(|content| content.get("source_message_id")),
        message
            .get("content")
            .and_then(|content| content.get("source_id")),
        message
            .get("metadata")
            .and_then(|metadata| metadata.get("source_message_id")),
        message
            .get("metadata")
            .and_then(|metadata| metadata.get("source_id")),
    ])
}

pub fn message_source_attachment_refs(message: &Value) -> Vec<String> {
    collect_string_refs(&[
        message.get("source_attachment_id"),
        message
            .get("content")
            .and_then(|content| content.get("source_attachment_id")),
        message
            .get("metadata")
            .and_then(|metadata| metadata.get("source_attachment_id")),
    ])
}

pub fn message_open_question_refs(message: &Value) -> Vec<String> {
    collect_string_refs(&[
        message.get("open_question_id"),
        message.get("question_id"),
        message
            .get("content")
            .and_then(|content| content.get("open_question_id")),
        message
            .get("content")
            .and_then(|content| content.get("question_id")),
        message
            .get("metadata")
            .and_then(|metadata| metadata.get("open_question_id")),
        message
            .get("metadata")
            .and_then(|metadata| metadata.get("question_id")),
        message
            .get("metadata")
            .and_then(|metadata| metadata.get("searchable_metadata"))
            .and_then(|metadata| metadata.get("open_question_id")),
        message
            .get("metadata")
            .and_then(|metadata| metadata.get("searchable_metadata"))
            .and_then(|metadata| metadata.get("question_id")),
    ])
}

fn collect_string_refs(values: &[Option<&Value>]) -> Vec<String> {
    let mut refs = Vec::new();
    let mut seen = HashSet::new();
    for value in values {
        let Some(source_id) = value.and_then(Value::as_str).map(str::trim) else {
            continue;
        };
        if source_id.is_empty() || !seen.insert(source_id.to_string()) {
            continue;
        }
        refs.push(source_id.to_string());
    }
    refs
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn message_open_question_refs_collects_known_question_shapes() {
        let message = json!({
            "content": { "open_question_id": "question:venue" },
            "metadata": {
                "question_id": "question:budget",
                "searchable_metadata": { "open_question_id": "question:venue" }
            }
        });

        let refs = message_open_question_refs(&message);

        assert_eq!(
            refs,
            vec!["question:venue".to_string(), "question:budget".to_string()]
        );
    }
}
