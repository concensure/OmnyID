/*
 * @module-id: rust.search-tags
 * @primary-capability: rust.source-module
 * @locs-version: 2.0
 * @stability: active
 * @owner: omnyid
 */

pub fn extract_hash_supertags(query: &str) -> Vec<String> {
    let mut tags = std::collections::BTreeSet::new();
    for token in query.split_whitespace() {
        let trimmed = token.trim_matches(|ch: char| {
            matches!(
                ch,
                ',' | '.' | ';' | ':' | '(' | ')' | '[' | ']' | '{' | '}' | '"' | '\''
            )
        });
        let Some(stripped) = trimmed.strip_prefix('#') else {
            continue;
        };
        if stripped.is_empty() {
            continue;
        }
        tags.insert(stripped.to_lowercase());
    }
    tags.into_iter().collect()
}

pub fn extract_kind_filter(query: &str) -> Option<String> {
    query.split_whitespace().find_map(|token| {
        let trimmed = token.trim_matches(|ch: char| {
            matches!(
                ch,
                ',' | '.' | ';' | ':' | '(' | ')' | '[' | ']' | '{' | '}' | '"' | '\''
            )
        });
        let value = trimmed.strip_prefix("kind:")?;
        let normalized = value
            .trim()
            .trim_matches(|ch: char| {
                matches!(
                    ch,
                    ',' | '.' | ';' | ':' | '(' | ')' | '[' | ']' | '{' | '}' | '"' | '\''
                )
            })
            .to_ascii_lowercase();
        (!normalized.is_empty()).then_some(normalized)
    })
}

pub fn extract_reference_targets(query: &str) -> Vec<String> {
    let mut targets = std::collections::BTreeSet::new();
    for token in query.split_whitespace() {
        let trimmed = token.trim_matches(|ch: char| {
            matches!(
                ch,
                ',' | '.' | ';' | ':' | '(' | ')' | '[' | ']' | '{' | '}' | '"' | '\''
            )
        });
        let value = ["target:", "ref:", "reference:"]
            .iter()
            .find_map(|prefix| trimmed.strip_prefix(prefix));
        let Some(value) = value else {
            continue;
        };
        let normalized = value
            .trim()
            .trim_matches(|ch: char| {
                matches!(
                    ch,
                    ',' | '.' | ';' | ':' | '(' | ')' | '[' | ']' | '{' | '}' | '"' | '\''
                )
            })
            .to_string();
        if !normalized.is_empty() {
            targets.insert(normalized);
        }
    }
    targets.into_iter().collect()
}

pub fn extract_reference_type_filter(query: &str) -> Option<String> {
    query.split_whitespace().find_map(|token| {
        let trimmed = token.trim_matches(|ch: char| {
            matches!(
                ch,
                ',' | '.' | ';' | ':' | '(' | ')' | '[' | ']' | '{' | '}' | '"' | '\''
            )
        });
        let value = ["reftype:", "reference_type:", "ref_type:"]
            .iter()
            .find_map(|prefix| trimmed.strip_prefix(prefix))?;
        let normalized = value
            .trim()
            .trim_matches(|ch: char| {
                matches!(
                    ch,
                    ',' | '.' | ';' | ':' | '(' | ')' | '[' | ']' | '{' | '}' | '"' | '\''
                )
            })
            .to_ascii_lowercase();
        (!normalized.is_empty()).then_some(normalized)
    })
}

pub fn extract_link_type_filter(query: &str) -> Option<String> {
    query.split_whitespace().find_map(|token| {
        let trimmed = token.trim_matches(|ch: char| {
            matches!(
                ch,
                ',' | '.' | ';' | ':' | '(' | ')' | '[' | ']' | '{' | '}' | '"' | '\''
            )
        });
        let value = ["link:", "linktype:", "relation:"]
            .iter()
            .find_map(|prefix| trimmed.strip_prefix(prefix))?;
        let normalized = value
            .trim()
            .trim_matches(|ch: char| {
                matches!(
                    ch,
                    ',' | '.' | ';' | ':' | '(' | ')' | '[' | ']' | '{' | '}' | '"' | '\''
                )
            })
            .to_ascii_lowercase();
        (!normalized.is_empty()).then_some(normalized)
    })
}

pub fn extract_metadata_term_pairs(query: &str) -> Vec<(String, String)> {
    let mut pairs = std::collections::BTreeSet::new();
    for token in query.split_whitespace() {
        let trimmed = token.trim_matches(|ch: char| {
            matches!(
                ch,
                ',' | '.' | ';' | '(' | ')' | '[' | ']' | '{' | '}' | '"' | '\''
            )
        });
        let Some((key, value)) = trimmed.split_once(':') else {
            continue;
        };
        let normalized_key = key.trim().to_ascii_lowercase();
        if matches!(
            normalized_key.as_str(),
            "action" | "next" | "suggested_action" | "suggested_actions"
        ) {
            let normalized_value = value
                .trim()
                .trim_matches(|ch: char| {
                    matches!(
                        ch,
                        ',' | '.' | ';' | ':' | '(' | ')' | '[' | ']' | '{' | '}' | '"' | '\''
                    )
                })
                .to_string();
            if !normalized_value.is_empty() {
                pairs.insert(("suggested_actions".to_string(), normalized_value));
            }
            continue;
        }
        if matches!(normalized_key.as_str(), "state" | "status") {
            let normalized_value = value
                .trim()
                .trim_matches(|ch: char| {
                    matches!(
                        ch,
                        ',' | '.' | ';' | ':' | '(' | ')' | '[' | ']' | '{' | '}' | '"' | '\''
                    )
                })
                .to_string();
            if !normalized_value.is_empty() {
                pairs.insert(("status".to_string(), normalized_value));
            }
            continue;
        }
        if matches!(normalized_key.as_str(), "importance" | "priority") {
            let normalized_value = value
                .trim()
                .trim_matches(|ch: char| {
                    matches!(
                        ch,
                        ',' | '.' | ';' | ':' | '(' | ')' | '[' | ']' | '{' | '}' | '"' | '\''
                    )
                })
                .to_string();
            if !normalized_value.is_empty() {
                pairs.insert(("priority".to_string(), normalized_value));
            }
            continue;
        }
        if matches!(normalized_key.as_str(), "area" | "domain") {
            let normalized_value = value
                .trim()
                .trim_matches(|ch: char| {
                    matches!(
                        ch,
                        ',' | '.' | ';' | ':' | '(' | ')' | '[' | ']' | '{' | '}' | '"' | '\''
                    )
                })
                .to_string();
            if !normalized_value.is_empty() {
                pairs.insert(("domain".to_string(), normalized_value));
            }
            continue;
        }
        if matches!(
            normalized_key.as_str(),
            "due" | "followup" | "follow_up" | "follow_up_at"
        ) {
            let normalized_value = value
                .trim()
                .trim_matches(|ch: char| {
                    matches!(
                        ch,
                        ',' | '.' | ';' | ':' | '(' | ')' | '[' | ']' | '{' | '}' | '"' | '\''
                    )
                })
                .to_ascii_lowercase();
            let normalized_value = match normalized_value.as_str() {
                "due" => "today".to_string(),
                _ => normalized_value,
            };
            if !normalized_value.is_empty() {
                pairs.insert(("follow_up_at".to_string(), normalized_value));
            }
            continue;
        }
        if matches!(
            normalized_key.as_str(),
            "memory" | "space" | "scope" | "workspace" | "memory_space"
        ) {
            let normalized_value = value
                .trim()
                .trim_matches(|ch: char| {
                    matches!(
                        ch,
                        ',' | '.' | ';' | ':' | '(' | ')' | '[' | ']' | '{' | '}' | '"' | '\''
                    )
                })
                .to_string();
            if !normalized_value.is_empty() {
                pairs.insert(("memory_space".to_string(), normalized_value));
            }
            continue;
        }
        if matches!(
            normalized_key.as_str(),
            "author" | "authored" | "author_type"
        ) {
            let normalized_value = value
                .trim()
                .trim_matches(|ch: char| {
                    matches!(
                        ch,
                        ',' | '.' | ';' | ':' | '(' | ')' | '[' | ']' | '{' | '}' | '"' | '\''
                    )
                })
                .to_string();
            if !normalized_value.is_empty() {
                pairs.insert(("author_type".to_string(), normalized_value));
            }
            continue;
        }
        if matches!(normalized_key.as_str(), "author_id") {
            let normalized_value = value
                .trim()
                .trim_matches(|ch: char| {
                    matches!(
                        ch,
                        ',' | '.' | ';' | ':' | '(' | ')' | '[' | ']' | '{' | '}' | '"' | '\''
                    )
                })
                .to_string();
            if !normalized_value.is_empty() {
                pairs.insert(("author_id".to_string(), normalized_value));
            }
            continue;
        }
        if matches!(normalized_key.as_str(), "mask" | "author_mask") {
            let normalized_value = value
                .trim()
                .trim_matches(|ch: char| {
                    matches!(
                        ch,
                        ',' | '.' | ';' | ':' | '(' | ')' | '[' | ']' | '{' | '}' | '"' | '\''
                    )
                })
                .to_string();
            if !normalized_value.is_empty() {
                pairs.insert(("author_mask".to_string(), normalized_value));
            }
            continue;
        }
        if matches!(
            normalized_key.as_str(),
            "kind"
                | "target"
                | "ref"
                | "reference"
                | "reftype"
                | "reference_type"
                | "ref_type"
                | "link"
                | "linktype"
                | "relation"
                | "thread"
                | "thread_id"
                | "from"
                | "agent"
                | "sender"
                | "after"
                | "before"
                | "on"
        ) {
            continue;
        }
        let normalized_value = value
            .trim()
            .trim_matches(|ch: char| {
                matches!(
                    ch,
                    ',' | '.' | ';' | ':' | '(' | ')' | '[' | ']' | '{' | '}' | '"' | '\''
                )
            })
            .to_string();
        if !normalized_key.is_empty() && !normalized_value.is_empty() {
            pairs.insert((normalized_key, normalized_value));
        }
    }
    pairs.into_iter().collect()
}

pub fn extract_metadata_terms(query: &str) -> (Vec<String>, Vec<String>) {
    let mut keys = std::collections::BTreeSet::new();
    let mut values = std::collections::BTreeSet::new();
    for (key, value) in extract_metadata_term_pairs(query) {
        match key.as_str() {
            "suggested_actions" => {
                keys.insert("metadata.searchable_metadata.suggested_actions".to_string());
            }
            "status" => {
                keys.insert("metadata.searchable_metadata.status".to_string());
            }
            "priority" => {
                keys.insert("metadata.searchable_metadata.priority".to_string());
            }
            "domain" => {
                keys.insert("metadata.searchable_metadata.domain".to_string());
            }
            "follow_up_at" => {
                keys.insert("metadata.searchable_metadata.follow_up_at".to_string());
            }
            "memory_space" => {
                keys.insert("metadata.searchable_metadata.memory_space".to_string());
            }
            "author_type" => {
                keys.insert("metadata.searchable_metadata.author_type".to_string());
            }
            "author_id" => {
                keys.insert("metadata.searchable_metadata.author_id".to_string());
            }
            "author_mask" => {
                keys.insert("metadata.searchable_metadata.author_mask".to_string());
            }
            _ => {
                keys.insert(key);
            }
        }
        values.insert(value);
    }
    (keys.into_iter().collect(), values.into_iter().collect())
}

pub fn strip_hash_supertags_from_query(query: &str) -> String {
    strip_structured_search_terms(query)
}

pub fn strip_structured_search_terms(query: &str) -> String {
    query
        .split_whitespace()
        .filter(|token| {
            let trimmed = token.trim_matches(|ch: char| {
                matches!(
                    ch,
                    ',' | '.' | ';' | ':' | '(' | ')' | '[' | ']' | '{' | '}' | '"' | '\''
                )
            });
            let lowered = trimmed.to_ascii_lowercase();
            !trimmed.starts_with('#')
                && !lowered.starts_with("kind:")
                && !lowered.starts_with("target:")
                && !lowered.starts_with("ref:")
                && !lowered.starts_with("reference:")
                && !lowered.starts_with("reftype:")
                && !lowered.starts_with("reference_type:")
                && !lowered.starts_with("ref_type:")
                && !lowered.starts_with("link:")
                && !lowered.starts_with("linktype:")
                && !lowered.starts_with("relation:")
                && !lowered.starts_with("thread:")
                && !lowered.starts_with("thread_id:")
                && !lowered.starts_with("from:")
                && !lowered.starts_with("agent:")
                && !lowered.starts_with("sender:")
                && !lowered.starts_with("after:")
                && !lowered.starts_with("before:")
                && !lowered.starts_with("on:")
                && !lowered.starts_with("action:")
                && !lowered.starts_with("next:")
                && !lowered.starts_with("suggested_action:")
                && !lowered.starts_with("suggested_actions:")
                && !lowered.starts_with("state:")
                && !lowered.starts_with("status:")
                && !lowered.starts_with("importance:")
                && !lowered.starts_with("priority:")
                && !lowered.starts_with("area:")
                && !lowered.starts_with("domain:")
                && !lowered.starts_with("due:")
                && !lowered.starts_with("followup:")
                && !lowered.starts_with("follow_up:")
                && !lowered.starts_with("follow_up_at:")
                && !lowered.starts_with("memory:")
                && !lowered.starts_with("scope:")
                && !lowered.starts_with("space:")
                && !lowered.starts_with("workspace:")
                && !lowered.starts_with("memory_space:")
                && !lowered.starts_with("author:")
                && !lowered.starts_with("authored:")
                && !lowered.starts_with("author_type:")
                && !lowered.starts_with("author_id:")
                && !lowered.starts_with("mask:")
                && !lowered.starts_with("author_mask:")
        })
        .collect::<Vec<_>>()
        .join(" ")
        .trim()
        .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extract_hash_supertags_normalizes_case_and_punctuation() {
        let tags = extract_hash_supertags("review #ProjectAurora with #Health, then close");
        assert_eq!(
            tags,
            vec!["health".to_string(), "projectaurora".to_string()]
        );
    }

    #[test]
    fn strip_hash_supertags_from_query_keeps_plain_text_terms() {
        let query =
            strip_hash_supertags_from_query("review #ProjectAurora with #Health, then close");
        assert_eq!(query, "review with then close");
    }

    #[test]
    fn extract_kind_filter_normalizes_case_and_punctuation() {
        let kind = extract_kind_filter("review kind:Task, with #Health");
        assert_eq!(kind.as_deref(), Some("task"));
    }

    #[test]
    fn extract_reference_targets_reads_structured_tokens() {
        let targets = extract_reference_targets(
            "review target:msg_1 ref:thread.alpha reference:project_aurora",
        );
        assert_eq!(
            targets,
            vec![
                "msg_1".to_string(),
                "project_aurora".to_string(),
                "thread.alpha".to_string()
            ]
        );
    }

    #[test]
    fn extract_reference_type_filter_reads_structured_tokens() {
        let reference_type = extract_reference_type_filter("review reftype:Supports with #Health");
        assert_eq!(reference_type.as_deref(), Some("supports"));
    }

    #[test]
    fn extract_link_type_filter_reads_structured_tokens() {
        let link_type = extract_link_type_filter("review relation:Part_Of with #Health");
        assert_eq!(link_type.as_deref(), Some("part_of"));
    }

    #[test]
    fn extract_metadata_terms_preserves_generic_metadata_and_maps_standardized_aliases() {
        let (keys, values) = extract_metadata_terms(
            "status:active state:pending priority:high importance:critical domain:work area:ops followup:today owner:ozan target:msg_1 kind:task confidence:0.9",
        );
        assert_eq!(
            keys,
            vec![
                "confidence".to_string(),
                "metadata.searchable_metadata.domain".to_string(),
                "metadata.searchable_metadata.follow_up_at".to_string(),
                "metadata.searchable_metadata.priority".to_string(),
                "metadata.searchable_metadata.status".to_string(),
                "owner".to_string(),
            ]
        );
        assert_eq!(
            values,
            vec![
                "0.9".to_string(),
                "active".to_string(),
                "critical".to_string(),
                "high".to_string(),
                "ops".to_string(),
                "ozan".to_string(),
                "pending".to_string(),
                "today".to_string(),
                "work".to_string()
            ]
        );
    }

    #[test]
    fn extract_metadata_terms_normalizes_followup_due_alias_to_today() {
        let (keys, values) = extract_metadata_terms("followup:due");
        assert_eq!(
            keys,
            vec!["metadata.searchable_metadata.follow_up_at".to_string()]
        );
        assert_eq!(values, vec!["today".to_string()]);
    }

    #[test]
    fn extract_metadata_terms_maps_due_alias_to_follow_up_facet() {
        let (keys, values) = extract_metadata_terms("due:friday");
        assert_eq!(
            keys,
            vec!["metadata.searchable_metadata.follow_up_at".to_string()]
        );
        assert_eq!(values, vec!["friday".to_string()]);
    }

    #[test]
    fn extract_metadata_terms_maps_action_aliases_to_suggested_actions_facet() {
        let (keys, values) = extract_metadata_terms(
            "action:reply next:review suggested_action:approve suggested_actions:send",
        );
        assert_eq!(
            keys,
            vec!["metadata.searchable_metadata.suggested_actions".to_string()]
        );
        assert_eq!(
            values,
            vec![
                "approve".to_string(),
                "reply".to_string(),
                "review".to_string(),
                "send".to_string()
            ]
        );
    }

    #[test]
    fn extract_metadata_terms_maps_memory_and_authorship_aliases_to_searchable_facets() {
        let (keys, values) = extract_metadata_terms(
            "memory:work scope:team space:personal workspace:studio author:human authored:system author_type:agent author_id:user_01 mask:private author_mask:public",
        );
        assert_eq!(
            keys,
            vec![
                "metadata.searchable_metadata.author_id".to_string(),
                "metadata.searchable_metadata.author_mask".to_string(),
                "metadata.searchable_metadata.author_type".to_string(),
                "metadata.searchable_metadata.memory_space".to_string(),
            ]
        );
        assert_eq!(
            values,
            vec![
                "agent".to_string(),
                "human".to_string(),
                "personal".to_string(),
                "private".to_string(),
                "public".to_string(),
                "studio".to_string(),
                "system".to_string(),
                "team".to_string(),
                "user_01".to_string(),
                "work".to_string(),
            ]
        );
    }

    #[test]
    fn strip_structured_search_terms_removes_kind_tags_and_reference_tokens() {
        let query = strip_structured_search_terms(
            "review kind:Task #ProjectAurora target:msg_1 relation:part_of with #Health, then close",
        );
        assert_eq!(query, "review with then close");
    }

    #[test]
    fn strip_structured_search_terms_removes_thread_sender_and_date_tokens() {
        let query = strip_structured_search_terms(
            "review thread:thread.alpha from:background_watcher after:2026-06-01 before:2026-06-30",
        );
        assert_eq!(query, "review");
    }

    #[test]
    fn strip_structured_search_terms_removes_action_alias_tokens() {
        let query = strip_structured_search_terms(
            "review action:reply next:approve suggested_action:send suggested_actions:escalate",
        );
        assert_eq!(query, "review");
    }

    #[test]
    fn strip_structured_search_terms_removes_memory_and_authorship_alias_tokens() {
        let query = strip_structured_search_terms(
            "review memory:work scope:team space:personal workspace:studio author:human authored:system author_type:agent author_id:user_01 mask:private author_mask:public",
        );
        assert_eq!(query, "review");
    }

    #[test]
    fn strip_structured_search_terms_removes_standardized_metadata_alias_tokens() {
        let query = strip_structured_search_terms(
            "review status:active state:pending priority:high importance:critical domain:work area:ops due:friday followup:today follow_up:tomorrow follow_up_at:friday",
        );
        assert_eq!(query, "review");
    }
}
