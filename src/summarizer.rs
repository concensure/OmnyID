use serde_json::Value;

pub fn generate_summary_and_embedding(content: &Value) -> (String, Vec<f32>) {
    let text = content["text"]
        .as_str()
        .or_else(|| content["body"].as_str())
        .unwrap_or("No text");
    let summary = format!("Summary: {}", text.chars().take(120).collect::<String>());
    let embedding = vec![0.1; 768];

    (summary, embedding)
}

pub fn extract_references(content: &Value) -> Vec<String> {
    content["references"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|value| value.as_str().map(|item| item.to_string()))
                .collect()
        })
        .unwrap_or_default()
}
