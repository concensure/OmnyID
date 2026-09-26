use crate::topology_retrieval::TopologyNeighborhoodItem;

pub fn rank_neighborhood_items(items: &mut [TopologyNeighborhoodItem]) {
    items.sort_by(|left, right| {
        topology_resurfacing_score(right)
            .cmp(&topology_resurfacing_score(left))
            .then(left.relation_path.len().cmp(&right.relation_path.len()))
            .then(left.label.cmp(&right.label))
    });
}

pub fn topology_resurfacing_score(item: &TopologyNeighborhoodItem) -> u16 {
    freshness_score(&item.freshness)
        + confidence_score(&item.confidence)
        + relation_path_score(&item.relation_path)
        + unresolvedness_score(item)
        + importance_score(item)
}

fn freshness_score(freshness: &str) -> u16 {
    match freshness {
        "fresh" => 400,
        "active" => 300,
        "reactivated" => 250,
        _ => 100,
    }
}

fn confidence_score(confidence: &str) -> u16 {
    match confidence {
        "high" => 90,
        "medium" => 60,
        _ => 30,
    }
}

fn relation_path_score(path: &[String]) -> u16 {
    let mut score = 0;
    for relation in path {
        score += match relation.as_str() {
            "same_follow_up_chain" => 140,
            "same_relationship" => 90,
            "same_project" => 80,
            "same_file_ledger" | "same_source_message" | "same_source_attachment" => 70,
            "same_area" | "same_resource" => 50,
            "shared_object" => 45,
            "same_thread" | "same_file_path" => 35,
            _ => 20,
        };
    }
    score.min(240)
}

fn unresolvedness_score(item: &TopologyNeighborhoodItem) -> u16 {
    let text = format!(
        "{} {} {}",
        item.label,
        item.why_surfaced,
        item.relation_path.join(" ")
    )
    .to_ascii_lowercase();
    let mut score = 0;
    for cue in [
        "unresolved",
        "open",
        "follow up",
        "follow-up",
        "blocked",
        "waiting",
        "due",
        "deadline",
        "decision",
        "approval",
        "review",
    ] {
        if text.contains(cue) {
            score += 25;
        }
    }
    score.min(120)
}

fn importance_score(item: &TopologyNeighborhoodItem) -> u16 {
    let text = format!("{} {}", item.label, item.why_surfaced).to_ascii_lowercase();
    let mut score = 0;
    for cue in [
        "important",
        "priority",
        "critical",
        "risk",
        "commitment",
        "payment",
        "legal",
        "contract",
    ] {
        if text.contains(cue) {
            score += 20;
        }
    }
    score.min(80)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn item(
        message_id: &str,
        label: &str,
        freshness: &str,
        confidence: &str,
        relation_path: &[&str],
    ) -> TopologyNeighborhoodItem {
        TopologyNeighborhoodItem {
            message_id: message_id.to_string(),
            label: label.to_string(),
            confidence: confidence.to_string(),
            freshness: freshness.to_string(),
            why_surfaced: format!("{label} surfaced through topology."),
            relation_path: relation_path
                .iter()
                .map(|value| value.to_string())
                .collect(),
            source_refs: vec![message_id.to_string()],
            decrypt_needed: false,
        }
    }

    #[test]
    fn reactivated_unresolved_follow_up_can_outrank_plain_active_context() {
        let reactivated = item(
            "follow_up",
            "Unresolved approval follow-up",
            "reactivated",
            "high",
            &["same_follow_up_chain"],
        );
        let active = item(
            "active",
            "Reference note",
            "active",
            "medium",
            &["same_thread"],
        );

        assert!(topology_resurfacing_score(&reactivated) > topology_resurfacing_score(&active));
    }

    #[test]
    fn rank_neighborhood_items_keeps_fresh_critical_items_first() {
        let mut items = vec![
            item(
                "stale",
                "Old background note",
                "stale",
                "high",
                &["same_thread"],
            ),
            item(
                "fresh",
                "Critical payment decision",
                "fresh",
                "medium",
                &["same_project"],
            ),
            item(
                "follow_up",
                "Open follow-up",
                "reactivated",
                "high",
                &["same_follow_up_chain"],
            ),
        ];

        rank_neighborhood_items(&mut items);

        assert_eq!(items[0].message_id, "fresh");
        assert_eq!(items[1].message_id, "follow_up");
    }
}
