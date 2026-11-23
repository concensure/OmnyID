/*
 * @module-id: server.search-workflows
 * @primary-capability: server.command-bar.workflow-detection
 * @sub-capabilities: workflow-family-routing, query-shape-parsing, artifact-source-selection
 * @locs-version: 2.0
 * @stability: active
 * @owner: omnyid-server
 */

use crate::message::AFPMessage;

#[derive(Clone, Debug, PartialEq)]
pub(super) struct BudgetQueryDetails {
    pub(super) persona: Option<String>,
    pub(super) months: u8,
    pub(super) monthly_income: Option<f64>,
    pub(super) fixed_expenses: Option<f64>,
    pub(super) variable_expenses: Option<f64>,
    pub(super) savings_goal: Option<f64>,
}

pub(super) fn digest_query_requested(query: &str) -> bool {
    let lowered = query.to_ascii_lowercase();
    [
        "summarize",
        "summary",
        "digest",
        "recap",
        "meeting notes",
        "meeting summary",
    ]
    .iter()
    .any(|token| lowered.contains(token))
}

pub(super) fn select_digest_source_message(
    messages: &[AFPMessage],
    query: &str,
) -> Option<AFPMessage> {
    let lowered = query.to_ascii_lowercase();
    let preferred_type = if lowered.contains("meeting") || lowered.contains("transcript") {
        Some(crate::message::AFP_TYPE_TRANSCRIPT)
    } else if lowered.contains("document") || lowered.contains("pdf") {
        Some(crate::message::AFP_TYPE_PARSED_DOCUMENT)
    } else {
        None
    };

    if let Some(preferred_type) = preferred_type {
        if let Some(message) = messages
            .iter()
            .rev()
            .find(|message| message.r#type == preferred_type)
            .cloned()
        {
            return Some(message);
        }
    }

    messages
        .iter()
        .rev()
        .find(|message| {
            message.r#type == crate::message::AFP_TYPE_TRANSCRIPT
                || message.r#type == crate::message::AFP_TYPE_PARSED_DOCUMENT
        })
        .cloned()
}

pub(crate) fn weather_query_details(query: &str) -> Option<(String, u8)> {
    let lowered = query.to_ascii_lowercase();
    let weather_tokens = [
        "weather",
        "forecast",
        "temperature",
        "rain",
        "precipitation",
    ];
    if !weather_tokens.iter().any(|token| lowered.contains(token)) {
        return None;
    }

    let mut days = if lowered.contains("tomorrow") {
        1
    } else if lowered.contains("next week")
        || lowered.contains("this week")
        || lowered.contains("7-day")
    {
        7
    } else if lowered.contains("next month") || lowered.contains("monthly") {
        14
    } else {
        7
    };

    for word in lowered.split(|ch: char| !ch.is_ascii_alphanumeric()) {
        if let Ok(value) = word.parse::<u8>() {
            if (1..=14).contains(&value) {
                days = value;
                break;
            }
        }
    }

    let candidate = if let Some(index) = lowered.rfind(" in ") {
        query[index + 4..].trim()
    } else {
        query
    };

    let stopwords = [
        "show",
        "me",
        "the",
        "a",
        "an",
        "weather",
        "forecast",
        "temperature",
        "temperatures",
        "rain",
        "precipitation",
        "for",
        "next",
        "this",
        "week",
        "month",
        "day",
        "days",
        "tomorrow",
        "today",
        "chart",
        "graph",
        "outlook",
        "trend",
        "please",
        "what",
        "is",
        "whats",
        "what's",
    ];
    let location = candidate
        .split_whitespace()
        .filter(|word| {
            let cleaned = word
                .trim_matches(|ch: char| !ch.is_ascii_alphanumeric())
                .to_ascii_lowercase();
            !cleaned.is_empty()
                && !stopwords.contains(&cleaned.as_str())
                && cleaned.parse::<u8>().is_err()
        })
        .collect::<Vec<_>>()
        .join(" ")
        .trim()
        .to_string();

    if location.is_empty() {
        None
    } else {
        Some((location, days))
    }
}

fn parse_query_amount_tokens(query: &str) -> Vec<(usize, String, f64)> {
    query
        .split_whitespace()
        .enumerate()
        .filter_map(|(index, raw)| {
            let cleaned = raw
                .trim_matches(|ch: char| {
                    !(ch.is_ascii_alphanumeric() || ch == '.' || ch == ',' || ch == '$')
                })
                .trim_start_matches('$')
                .replace(',', "");
            cleaned
                .parse::<f64>()
                .ok()
                .map(|value| (index, raw.to_ascii_lowercase(), value))
        })
        .collect()
}

pub(super) fn budget_query_details(query: &str) -> Option<BudgetQueryDetails> {
    let lowered = query.to_ascii_lowercase();
    let finance_tokens = [
        "budget",
        "cash flow",
        "cashflow",
        "expense",
        "expenses",
        "income",
    ];
    if !finance_tokens.iter().any(|token| lowered.contains(token)) {
        return None;
    }

    let mut months = 6;
    for word in lowered.split(|ch: char| !ch.is_ascii_alphanumeric()) {
        if let Ok(value) = word.parse::<u8>() {
            if (1..=12).contains(&value) {
                months = value;
                break;
            }
        }
    }

    let persona = if lowered.contains("freelancer") {
        Some("Freelancer".to_string())
    } else if lowered.contains("family") {
        Some("Family".to_string())
    } else if lowered.contains("student") {
        Some("Student".to_string())
    } else {
        None
    };

    let lowered_tokens = lowered
        .split_whitespace()
        .map(str::to_string)
        .collect::<Vec<_>>();
    let mut monthly_income = None;
    let mut fixed_expenses = None;
    let mut variable_expenses = None;
    let mut savings_goal = None;
    for (index, raw_token, value) in parse_query_amount_tokens(query) {
        let prev1 = index
            .checked_sub(1)
            .and_then(|position| lowered_tokens.get(position))
            .map(String::as_str)
            .unwrap_or("");
        let prev2 = index
            .checked_sub(2)
            .and_then(|position| lowered_tokens.get(position))
            .map(String::as_str)
            .unwrap_or("");
        let next1 = lowered_tokens
            .get(index + 1)
            .map(String::as_str)
            .unwrap_or("");
        let local_context = [prev2, prev1, next1].join(" ");
        if local_context.contains("month") || local_context.contains("months") {
            continue;
        }
        if monthly_income.is_none() && matches!(prev1, "income" | "revenue" | "salary") {
            monthly_income = Some(value);
            continue;
        }
        if monthly_income.is_none() && prev2 == "income" && matches!(prev1, "of" | "at") {
            monthly_income = Some(value);
            continue;
        }
        if fixed_expenses.is_none() && matches!(prev1, "rent" | "mortgage" | "housing") {
            fixed_expenses = Some(value);
            continue;
        }
        if fixed_expenses.is_none() && prev1 == "fixed" && next1.starts_with("expense") {
            fixed_expenses = Some(value);
            continue;
        }
        if savings_goal.is_none()
            && (matches!(prev1, "save" | "savings" | "goal")
                || (prev2 == "savings" && prev1 == "goal"))
        {
            savings_goal = Some(value);
            continue;
        }
        if variable_expenses.is_none()
            && matches!(
                prev1,
                "expense" | "expenses" | "spend" | "utilities" | "groceries"
            )
        {
            variable_expenses = Some(value);
            continue;
        }
        if variable_expenses.is_none() && prev1 == "variable" && next1.starts_with("expense") {
            variable_expenses = Some(value);
            continue;
        }
        if raw_token.starts_with('$') {
            if monthly_income.is_none() {
                monthly_income = Some(value);
            } else if fixed_expenses.is_none() {
                fixed_expenses = Some(value);
            } else if variable_expenses.is_none() {
                variable_expenses = Some(value);
            }
        }
    }

    Some(BudgetQueryDetails {
        persona,
        months,
        monthly_income,
        fixed_expenses,
        variable_expenses,
        savings_goal,
    })
}
