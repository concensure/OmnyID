use serde_json::Value;

pub fn generate_summary_and_embedding(content: &Value) -> (String, Vec<f32>) {
    let text = content["text"]
        .as_str()
        .or_else(|| content["body"].as_str())
        .unwrap_or("No text");
    let summary = format!("Summary: {}", text.chars().take(120).collect::<String>());
    // Sync fallback: uniform placeholder used only when the async path is unavailable
    // (e.g. from db.rs's sync `summary_and_embedding_for_mode` helper).
    let embedding = vec![0.1_f32; 768];
    (summary, embedding)
}

/// Async variant that calls Ollama's `/api/embeddings` endpoint with the
/// `nomic-embed-text` model (768-dim).  On any failure the function falls back
/// silently to the uniform placeholder so that the rest of the curator pipeline
/// is never blocked by an unavailable embedding service.
///
/// `ollama_url` defaults to `http://127.0.0.1:11434` when `None`.
pub async fn generate_embedding_with_ollama(
    ollama_url: Option<&str>,
    model: Option<&str>,
    text: &str,
) -> Vec<f32> {
    let base = ollama_url.unwrap_or("http://127.0.0.1:11434");
    let embedding_model = model.unwrap_or("nomic-embed-text");
    let url = format!("{}/api/embeddings", base.trim_end_matches('/'));

    let body = serde_json::json!({ "model": embedding_model, "prompt": text });
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .unwrap_or_else(|_| reqwest::Client::new());

    let send_result = client.post(&url).json(&body).send().await;

    match send_result {
        Ok(resp) => match resp.json::<Value>().await {
            Ok(json) => {
                if let Some(arr) = json["embedding"].as_array() {
                    let floats: Vec<f32> = arr
                        .iter()
                        .filter_map(|v| v.as_f64().map(|f| f as f32))
                        .collect();
                    if !floats.is_empty() {
                        return floats;
                    }
                }
                vec![0.1_f32; 768]
            }
            Err(_) => vec![0.1_f32; 768],
        },
        Err(_) => vec![0.1_f32; 768],
    }
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
