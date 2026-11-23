/*
 * @module-id: rust.prompt-guidance
 * @primary-capability: rust.source-module
 * @locs-version: 2.0
 * @stability: active
 * @owner: omnyid
 */

pub fn append_reasoning_guidance(
    base_prompt: &str,
    reasoning_guidance: &[String],
    scope: &str,
) -> String {
    if reasoning_guidance.is_empty() {
        return base_prompt.to_string();
    }

    let guidance_lines = reasoning_guidance
        .iter()
        .map(|line| format!("- {line}"))
        .collect::<Vec<_>>()
        .join("\n");

    format!(
        "{base_prompt}\n\n# Enabled workspace reasoning guidance\nApply the following user-selected reasoning guidance while handling this {scope}. These instructions refine reasoning style and do not override explicit user intent, safety policy, tool boundaries, event evidence, granted capabilities, or output-format requirements.\n{guidance_lines}"
    )
}

#[cfg(test)]
mod tests {
    use super::append_reasoning_guidance;

    #[test]
    fn append_reasoning_guidance_is_noop_without_guidance() {
        let base = "Base prompt";
        assert_eq!(append_reasoning_guidance(base, &[], "testing"), base);
    }

    #[test]
    fn append_reasoning_guidance_appends_guidance_lines() {
        let prompt = append_reasoning_guidance(
            "Base prompt",
            &[
                "Use grounded reasoning.".to_string(),
                "Run a brief reflection pass.".to_string(),
            ],
            "testing",
        );

        assert!(prompt.contains("# Enabled workspace reasoning guidance"));
        assert!(prompt.contains("- Use grounded reasoning."));
        assert!(prompt.contains("- Run a brief reflection pass."));
        assert!(prompt.contains("testing"));
    }
}
