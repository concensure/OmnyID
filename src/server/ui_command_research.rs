/*
 * @module-id: rust.server.ui-command-research
 * @primary-capability: rust.source-module
 * @locs-version: 2.0
 * @stability: active
 * @owner: omnyid
 */

use serde_json::Value;

use super::types::UiCommandLink;

pub(super) async fn record_duckduckgo_usage(
    db: &crate::db::Db,
    user_id: &str,
    query: &str,
    result_count: usize,
) {
    let query_length = query.trim().chars().count();
    let metadata = serde_json::json!({
        "query_length": query_length,
        "result_count": result_count.min(1000),
    });
    let _ = db
        .record_user_external_tool_usage_event(&crate::db::UserExternalToolUsageEventInsert {
            user_id: user_id.to_string(),
            tool_slug: "duckduckgo".to_string(),
            tool_name: "DuckDuckGo".to_string(),
            provider_key: "duckduckgo".to_string(),
            provider_category: "search_api".to_string(),
            billing_category: "search_api".to_string(),
            usage_unit: "requests".to_string(),
            quantity: 1.0,
            estimated_cost_usd: 0.0,
            currency: Some("USD".to_string()),
            source: Some("ui_command_research".to_string()),
            occurred_at: None,
            metadata_json: Some(metadata),
        })
        .await;
}

pub(super) async fn fetch_ddg_results(query: &str) -> Vec<(String, String, String)> {
    let encoded = urlencoding_encode(query);
    let url = format!(
        "https://api.duckduckgo.com/?q={encoded}&format=json&no_redirect=1&no_html=1&skip_disambig=1"
    );
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .user_agent("OmnyID-Agent/1.0")
        .build()
        .unwrap_or_default();
    let Ok(resp) = client.get(&url).send().await else {
        return vec![];
    };
    let Ok(json) = resp.json::<Value>().await else {
        return vec![];
    };

    let mut results: Vec<(String, String, String)> = vec![];

    if let (Some(text), Some(source_url)) = (
        json["AbstractText"].as_str().filter(|s| !s.is_empty()),
        json["AbstractURL"].as_str().filter(|s| !s.is_empty()),
    ) {
        let source = json["AbstractSource"].as_str().unwrap_or("Web").to_string();
        results.push((source, source_url.to_string(), text.to_string()));
    }

    if let Some(answer) = json["Answer"].as_str().filter(|s| !s.is_empty()) {
        results.push((
            "DuckDuckGo Answer".to_string(),
            String::new(),
            answer.to_string(),
        ));
    }

    if let Some(topics) = json["RelatedTopics"].as_array() {
        for topic in topics.iter().take(4) {
            if let (Some(text), Some(link)) = (
                topic["Text"].as_str().filter(|s| !s.is_empty()),
                topic["FirstURL"].as_str().filter(|s| !s.is_empty()),
            ) {
                let title = topic["Name"].as_str().unwrap_or("Related").to_string();
                results.push((title, link.to_string(), text.to_string()));
            }
        }
    }

    if let Some(res_arr) = json["Results"].as_array() {
        for res in res_arr.iter().take(3) {
            if let (Some(text), Some(link)) = (
                res["Text"].as_str().filter(|s| !s.is_empty()),
                res["FirstURL"].as_str().filter(|s| !s.is_empty()),
            ) {
                results.push(("Result".to_string(), link.to_string(), text.to_string()));
            }
        }
    }

    results
}

fn urlencoding_encode(s: &str) -> String {
    s.chars()
        .flat_map(|c| {
            if c.is_alphanumeric() || matches!(c, '-' | '_' | '.' | '~') {
                vec![c]
            } else if c == ' ' {
                vec!['+']
            } else {
                let bytes = c.to_string().into_bytes();
                bytes
                    .iter()
                    .flat_map(|b| {
                        let hi = (b >> 4) as u8;
                        let lo = (b & 0xF) as u8;
                        let hex = |n: u8| if n < 10 { b'0' + n } else { b'a' + n - 10 };
                        vec!['%', hex(hi) as char, hex(lo) as char]
                    })
                    .collect::<Vec<char>>()
            }
        })
        .collect()
}

pub(super) async fn summarize_search_results(
    query: &str,
    results: &[(String, String, String)],
    backend: &crate::inference::InferenceBackend,
    model: &str,
    reasoning_guidance: &[String],
) -> (String, Vec<String>, Vec<UiCommandLink>) {
    let context = results
        .iter()
        .enumerate()
        .map(|(i, (title, url, snippet))| format!("[{}] {title}\nURL: {url}\n{snippet}", i + 1))
        .collect::<Vec<_>>()
        .join("\n\n");

    let prompt = format!(
        "Search query: \"{query}\"\n\nSearch results:\n{context}\n\nSummarise these results in 3-5 concise bullet points. Return ONLY valid JSON:\n{{\"summary\":\"<1-2 sentence overview>\",\"bullets\":[\"point 1\",\"point 2\",\"point 3\"],\"sources\":[{{\"title\":\"<source title>\",\"url\":\"<url>\",\"snippet\":\"<brief>\"}}]}}"
    );

    let infer_req = crate::inference::InferenceRequest {
        system: summarize_search_results_system_prompt(reasoning_guidance),
        messages: vec![crate::inference::InferenceMessage {
            role: "user".to_string(),
            content: prompt,
        }],
        max_tokens: 800,
        temperature: 0.1,
    };

    let infer_result = crate::inference::dispatch_infer(backend, model, &infer_req).await;

    let Ok(resp) = infer_result else {
        return fallback_from_ddg(results);
    };
    let raw = resp
        .content
        .trim()
        .trim_start_matches("```json")
        .trim_start_matches("```")
        .trim_end_matches("```")
        .trim();
    let Ok(parsed) = serde_json::from_str::<Value>(raw) else {
        return fallback_from_ddg(results);
    };

    let summary = parsed["summary"]
        .as_str()
        .unwrap_or("Research results summarised below.")
        .to_string();
    let bullets: Vec<String> = parsed["bullets"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(String::from))
                .collect()
        })
        .unwrap_or_default();
    let sources = parsed["sources"].as_array().cloned().unwrap_or_default();
    let links: Vec<UiCommandLink> = sources
        .iter()
        .filter_map(|s| {
            Some(UiCommandLink {
                title: s["title"].as_str()?.to_string(),
                url: s["url"].as_str()?.to_string(),
                kind: "source".to_string(),
                origin: Some("external".to_string()),
            })
        })
        .collect();
    (summary, bullets, links)
}

fn summarize_search_results_system_prompt(reasoning_guidance: &[String]) -> String {
    let base = "You are a research assistant. Summarise the provided search results accurately. Return only valid JSON.";
    if reasoning_guidance.is_empty() {
        return base.to_string();
    }

    let guidance_lines = reasoning_guidance
        .iter()
        .map(|line| format!("- {line}"))
        .collect::<Vec<_>>()
        .join("\n");

    format!(
        "{base}\n\n# Enabled workspace reasoning guidance\nApply the following user-selected reasoning guidance while interpreting the search results and drafting the JSON summary. These instructions refine reasoning style and do not override the requirement to stay faithful to the provided evidence.\n{guidance_lines}"
    )
}

pub(super) fn fallback_from_ddg(
    results: &[(String, String, String)],
) -> (String, Vec<String>, Vec<UiCommandLink>) {
    let bullets: Vec<String> = results
        .iter()
        .take(5)
        .map(|(_, _, snippet)| snippet.chars().take(120).collect::<String>())
        .collect();
    let links: Vec<UiCommandLink> = results
        .iter()
        .filter(|(_, url, _)| !url.is_empty())
        .take(5)
        .map(|(title, url, _snippet)| UiCommandLink {
            title: title.clone(),
            url: url.clone(),
            kind: "source".to_string(),
            origin: Some("external".to_string()),
        })
        .collect();
    (
        "Search results summarised from DuckDuckGo instant answers.".to_string(),
        bullets,
        links,
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn duckduckgo_usage_metadata_is_minimal_and_bounded() {
        let query = "latest postgres logical replication slot behavior";
        let query_length = query.trim().chars().count();
        let metadata = json!({
            "query_length": query_length,
            "result_count": 7usize.min(1000),
        });
        assert_eq!(metadata["query_length"].as_u64(), Some(query_length as u64));
        assert_eq!(metadata["result_count"].as_u64(), Some(7));
    }

    #[test]
    fn summarize_search_results_prompt_stays_plain_without_guidance() {
        let prompt = summarize_search_results_system_prompt(&[]);
        assert!(prompt.contains("You are a research assistant."));
        assert!(!prompt.contains("# Enabled workspace reasoning guidance"));
    }

    #[test]
    fn summarize_search_results_prompt_appends_guidance() {
        let prompt = summarize_search_results_system_prompt(&[
            "Use grounded reasoning.".to_string(),
            "Run a brief reflection pass.".to_string(),
        ]);
        assert!(prompt.contains("# Enabled workspace reasoning guidance"));
        assert!(prompt.contains("- Use grounded reasoning."));
        assert!(prompt.contains("- Run a brief reflection pass."));
    }

    #[test]
    fn fallback_from_ddg_limits_and_filters_links() {
        let results = vec![
            (
                "One".to_string(),
                "https://one".to_string(),
                "alpha".repeat(80),
            ),
            ("Two".to_string(), String::new(), "beta".to_string()),
        ];
        let (summary, bullets, links) = fallback_from_ddg(&results);
        assert!(summary.contains("DuckDuckGo"));
        assert_eq!(bullets.len(), 2);
        assert!(bullets[0].len() <= 120);
        assert_eq!(links.len(), 1);
        assert_eq!(links[0].title, "One");
    }
}
