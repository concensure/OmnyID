/*
 * @module-id: rust.bento-card
 * @primary-capability: rust.source-module
 * @locs-version: 2.0
 * @stability: active
 * @owner: omnyid
 */

/// Bento Card â€” composable multi-cell information panels for the Master Agent.
///
/// The agent emits a `bento_card:render` AFP message when it needs to present
/// heterogeneous signals (metrics, lists, trends, status badges) as a single
/// spatial snapshot.  Each slot carries a `variant` that tells the renderer
/// how to display the data without the agent specifying layout CSS.
///
/// Decision heuristic (encoded in `should_use_bento`):
///   - 3 or more distinct signal types in one answer â†’ bento
///   - A "summary", "overview", or "how am I doing" query â†’ bento
///   - Single time-series or tabular rows â†’ graph / table instead
use chrono::Utc;
use serde_json::{Value, json};
use ulid::Ulid;

use crate::message::{
    AFP_SUBTYPE_BENTO_CARD_RENDER, AFP_TYPE_BENTO_CARD, AfpBentoCardContent, AfpBentoSlot,
};

// â”€â”€ Variant constants â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

pub const VARIANT_METRIC: &str = "metric";
pub const VARIANT_LIST: &str = "list";
pub const VARIANT_TEXT: &str = "text";
pub const VARIANT_BADGE: &str = "badge";
pub const VARIANT_SPARKLINE: &str = "sparkline";
pub const VARIANT_PROGRESS: &str = "progress";
pub const VARIANT_IMAGE: &str = "image";

pub const COLOR_GREEN: &str = "green";
pub const COLOR_RED: &str = "red";
pub const COLOR_YELLOW: &str = "yellow";
pub const COLOR_INDIGO: &str = "indigo";
pub const COLOR_ZINC: &str = "zinc";

pub const TREND_UP: &str = "up";
pub const TREND_DOWN: &str = "down";
pub const TREND_FLAT: &str = "flat";

// â”€â”€ Decision heuristic â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/// Estimate whether a bento card is more appropriate than a single-type card.
///
/// `signal_type_count` is the number of distinct data kinds the agent wants to
/// show (e.g. a metric + a list + a status badge = 3).  `query_hint` is an
/// optional keyword from the user query ("overview", "summary", "status",
/// "how am I doing", "dashboard").
pub fn should_use_bento(signal_type_count: usize, query_hint: &str) -> bool {
    if signal_type_count >= 3 {
        return true;
    }
    let q = query_hint.to_lowercase();
    let summary_keywords = [
        "overview",
        "summary",
        "status",
        "dashboard",
        "how am i",
        "digest",
        "snapshot",
    ];
    summary_keywords.iter().any(|kw| q.contains(kw))
}

// â”€â”€ Slot builder helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/// Build a metric slot â€” a large number with a label and optional trend/colour.
pub fn metric_slot(
    slot_id: &str,
    label: &str,
    value: &str,
    sub_label: Option<&str>,
    trend: Option<&str>,
    color: Option<&str>,
) -> AfpBentoSlot {
    AfpBentoSlot {
        slot_id: slot_id.to_string(),
        col_span: 1,
        row_span: 1,
        variant: VARIANT_METRIC.to_string(),
        label: Some(label.to_string()),
        value: Some(value.to_string()),
        sub_label: sub_label.map(str::to_string),
        trend: trend.map(str::to_string),
        color: color.map(str::to_string),
        items: vec![],
        ..Default::default()
    }
}

/// Build a list slot â€” a labelled bullet list (up to ~5 items reads well).
pub fn list_slot(slot_id: &str, label: &str, items: Vec<&str>, col_span: u8) -> AfpBentoSlot {
    AfpBentoSlot {
        slot_id: slot_id.to_string(),
        col_span,
        row_span: 1,
        variant: VARIANT_LIST.to_string(),
        label: Some(label.to_string()),
        value: None,
        sub_label: None,
        trend: None,
        color: None,
        items: items
            .into_iter()
            .map(|s| Value::String(s.to_string()))
            .collect(),
        ..Default::default()
    }
}

/// Build a text slot â€” a title + free-form prose body.
pub fn text_slot(slot_id: &str, label: &str, body: &str, col_span: u8) -> AfpBentoSlot {
    AfpBentoSlot {
        slot_id: slot_id.to_string(),
        col_span,
        row_span: 1,
        variant: VARIANT_TEXT.to_string(),
        label: Some(label.to_string()),
        value: Some(body.to_string()),
        sub_label: None,
        trend: None,
        color: None,
        items: vec![],
        ..Default::default()
    }
}

/// Build a badge slot â€” a single status pill.
pub fn badge_slot(slot_id: &str, label: &str, badge_text: &str, color: &str) -> AfpBentoSlot {
    AfpBentoSlot {
        slot_id: slot_id.to_string(),
        col_span: 1,
        row_span: 1,
        variant: VARIANT_BADGE.to_string(),
        label: Some(label.to_string()),
        value: Some(badge_text.to_string()),
        sub_label: None,
        trend: None,
        color: Some(color.to_string()),
        items: vec![],
        ..Default::default()
    }
}

/// Build a sparkline slot â€” a series of numeric data points rendered as a
/// mini line chart.  Points are `f64` values; the renderer auto-scales them.
pub fn sparkline_slot(
    slot_id: &str,
    label: &str,
    points: Vec<f64>,
    sub_label: Option<&str>,
    trend: Option<&str>,
    color: Option<&str>,
    col_span: u8,
) -> AfpBentoSlot {
    let items = points.into_iter().map(|p| json!(p)).collect();
    AfpBentoSlot {
        slot_id: slot_id.to_string(),
        col_span,
        row_span: 1,
        variant: VARIANT_SPARKLINE.to_string(),
        label: Some(label.to_string()),
        value: None,
        sub_label: sub_label.map(str::to_string),
        trend: trend.map(str::to_string),
        color: color.map(str::to_string),
        items,
        ..Default::default()
    }
}

/// Build a progress slot â€” a labelled horizontal progress bar (0â€“100).
pub fn progress_slot(
    slot_id: &str,
    label: &str,
    pct: f32,
    sub_label: Option<&str>,
    color: Option<&str>,
    col_span: u8,
) -> AfpBentoSlot {
    AfpBentoSlot {
        slot_id: slot_id.to_string(),
        col_span,
        row_span: 1,
        variant: VARIANT_PROGRESS.to_string(),
        label: Some(label.to_string()),
        value: Some(format!("{:.0}", pct.clamp(0.0, 100.0))),
        sub_label: sub_label.map(str::to_string),
        trend: None,
        color: color.map(str::to_string),
        items: vec![],
        ..Default::default()
    }
}

// â”€â”€ AFP builder â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/// Assemble a `bento_card:render` AFP message (for direct rendering pipelines
/// that read `bento_card` AFP type, e.g. the `ui/` workspace grid).
pub fn build_bento_card_afp(
    owner_user_id: &str,
    thread_id: &str,
    title: &str,
    subtitle: Option<&str>,
    slots: Vec<AfpBentoSlot>,
) -> Value {
    let content = AfpBentoCardContent {
        card_id: Ulid::new().to_string(),
        title: title.to_string(),
        subtitle: subtitle.map(str::to_string),
        slots,
        composed_at: Utc::now().to_rfc3339(),
        ..Default::default()
    };
    json!({
        "protocol": "afp-v1",
        "id": Ulid::new().to_string(),
        "thread_id": thread_id,
        "from": "master_agent",
        "to": [owner_user_id],
        "timestamp": Utc::now().to_rfc3339(),
        "type": AFP_TYPE_BENTO_CARD,
        "subtype": AFP_SUBTYPE_BENTO_CARD_RENDER,
        "content": serde_json::to_value(&content).unwrap_or(Value::Null),
        "metadata": { "store": true },
        "store_in_relational": true,
    })
}

/// Build an `a2ui_render` AFP message that embeds the bento as a `bento_grid`
/// a2ui component.  This is the **primary** path for the Master Agent â€” the
/// solid-ui A2UIRenderer dispatches it inline in any thread without needing a
/// separate section type.
///
/// The `slots` are serialised into `components[0].props.slots` so the a2ui
/// `bento_grid` node renderer can consume them directly.
pub fn build_bento_a2ui_afp(
    owner_user_id: &str,
    thread_id: &str,
    title: &str,
    subtitle: Option<&str>,
    slots: Vec<AfpBentoSlot>,
) -> Value {
    let slots_val = serde_json::to_value(&slots).unwrap_or(Value::Array(vec![]));
    let now = Utc::now().to_rfc3339();
    json!({
        "protocol": "afp-v1",
        "id": Ulid::new().to_string(),
        "thread_id": thread_id,
        "from": "master_agent",
        "to": [owner_user_id],
        "timestamp": now,
        "type": "a2ui_render",
        "subtype": "bento",
        "content": {
            "schema_version": "a2ui.v1",
            "view_id": Ulid::new().to_string(),
            "title": title,
            "description": subtitle,
            "components": [{
                "type": "bento_grid",
                "props": {
                    "title": title,
                    "subtitle": subtitle,
                    "slots": slots_val,
                }
            }]
        },
        "metadata": { "store": true },
        "store_in_relational": true,
    })
}

// â”€â”€ Tests â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn should_use_bento_three_signals() {
        assert!(should_use_bento(3, ""));
        assert!(should_use_bento(5, ""));
    }

    #[test]
    fn should_use_bento_summary_query() {
        assert!(should_use_bento(1, "give me an overview of this week"));
        assert!(should_use_bento(2, "status update please"));
        assert!(should_use_bento(1, "daily digest"));
    }

    #[test]
    fn should_not_use_bento_single_type() {
        assert!(!should_use_bento(1, "show me the revenue chart"));
        assert!(!should_use_bento(2, "list the open tasks"));
    }

    #[test]
    fn metric_slot_fields() {
        let s = metric_slot(
            "s1",
            "Revenue",
            "$12k",
            Some("vs last month"),
            Some(TREND_UP),
            Some(COLOR_GREEN),
        );
        assert_eq!(s.variant, VARIANT_METRIC);
        assert_eq!(s.label.as_deref(), Some("Revenue"));
        assert_eq!(s.trend.as_deref(), Some(TREND_UP));
        assert_eq!(s.color.as_deref(), Some(COLOR_GREEN));
    }

    #[test]
    fn list_slot_items_are_strings() {
        let s = list_slot("s2", "Next actions", vec!["Write spec", "Review PR"], 2);
        assert_eq!(s.items.len(), 2);
        assert_eq!(s.variant, VARIANT_LIST);
        assert_eq!(s.col_span, 2);
    }

    #[test]
    fn sparkline_slot_serialises_points() {
        let s = sparkline_slot(
            "s3",
            "Trend",
            vec![1.0, 2.5, 2.0, 3.0],
            None,
            Some(TREND_UP),
            None,
            2,
        );
        assert_eq!(s.items.len(), 4);
        assert!(s.items[0].is_number());
    }

    #[test]
    fn progress_slot_clamps_value() {
        let s = progress_slot("s4", "Goal", 150.0, None, None, 1);
        assert_eq!(s.value.as_deref(), Some("100"));
    }

    #[test]
    fn badge_slot_has_color() {
        let s = badge_slot("s5", "Status", "On track", COLOR_GREEN);
        assert_eq!(s.variant, VARIANT_BADGE);
        assert_eq!(s.color.as_deref(), Some(COLOR_GREEN));
    }

    #[test]
    fn build_bento_card_afp_type() {
        let slots = vec![
            metric_slot("m1", "Tasks done", "7", None, None, None),
            badge_slot("b1", "Status", "On track", COLOR_GREEN),
        ];
        let afp = build_bento_card_afp("user_01", "thread_01", "Weekly snapshot", None, slots);
        assert_eq!(afp["type"].as_str(), Some(AFP_TYPE_BENTO_CARD));
        assert_eq!(afp["subtype"].as_str(), Some(AFP_SUBTYPE_BENTO_CARD_RENDER));
        let slots_arr = &afp["content"]["slots"];
        assert!(slots_arr.is_array());
        assert_eq!(slots_arr.as_array().unwrap().len(), 2);
    }

    #[test]
    fn bento_card_content_has_card_id() {
        let afp = build_bento_card_afp("u1", "t1", "Test", Some("subtitle"), vec![]);
        assert!(afp["content"]["card_id"].as_str().is_some());
        assert_eq!(afp["content"]["subtitle"].as_str(), Some("subtitle"));
    }
}
