use std::{collections::BTreeMap, env, fs, path::PathBuf};

use omnyid_homeserver::quotation::{
    CalculationGap, CandidateDisposition, ComparableTotal, ComparisonCandidate, Evidence,
    EvidenceState, RequirementAssessment, RequirementImportance, RequirementStatus, TotalStatus,
    compare_quotations,
};
use serde_json::json;

struct Sample {
    file: &'static str,
    quote_id: &'static str,
    vendor_id: &'static str,
    vendor: &'static str,
    total_minor: i64,
    total_status: TotalStatus,
    evidence_coverage_bps: u16,
    exact_date: bool,
    gaps: Vec<CalculationGap>,
}

fn confirmed(label: &str) -> Evidence {
    Evidence {
        state: EvidenceState::Confirmed,
        anchors: vec![],
        rationale: Some(label.to_string()),
    }
}

fn requirement(id: &str, status: RequirementStatus, rationale: &str) -> RequirementAssessment {
    RequirementAssessment {
        requirement_id: id.to_string(),
        importance: RequirementImportance::Hard,
        status,
        evidence: if status == RequirementStatus::Met {
            confirmed(rationale)
        } else {
            Evidence::unknown(rationale)
        },
    }
}

fn main() {
    let source_dir = env::args().nth(1).map(PathBuf::from).unwrap_or_else(|| {
        PathBuf::from(
            r"C:\Users\ozans\Desktop\projects\OmnyID\Documents\issues\wedding planner\testing",
        )
    });
    let samples = vec![
        Sample {
            file: "quote-1-balmoral-cove-boathouse-sydney.txt",
            quote_id: "balmoral-cove-2027",
            vendor_id: "balmoral-cove-boathouse",
            vendor: "The Boathouse at Balmoral Cove",
            total_minor: 3_035_000,
            total_status: TotalStatus::Complete,
            evidence_coverage_bps: 10_000,
            exact_date: true,
            gaps: vec![],
        },
        Sample {
            file: "quote-2-wollombi-ridge-estate-hunter-valley.txt",
            quote_id: "wollombi-ridge-2027",
            vendor_id: "wollombi-ridge-estate",
            vendor: "Wollombi Ridge Estate",
            total_minor: 3_890_000,
            total_status: TotalStatus::Complete,
            evidence_coverage_bps: 10_000,
            exact_date: true,
            gaps: vec![],
        },
        Sample {
            file: "quote-3-coldstream-barn-yarra-valley.txt",
            quote_id: "coldstream-barn-2027",
            vendor_id: "coldstream-barn-gardens",
            vendor: "Coldstream Barn & Gardens",
            total_minor: 3_663_550,
            total_status: TotalStatus::Complete,
            evidence_coverage_bps: 10_000,
            exact_date: true,
            gaps: vec![CalculationGap {
                code: "headline_total_adjusted".to_string(),
                line_id: Some("mandatory-security".to_string()),
                message:
                    "Comparable total adds the mandatory five-hour security charge including GST."
                        .to_string(),
            }],
        },
        Sample {
            file: "quote-4-tallow-creek-farm-byron-bay.txt",
            quote_id: "tallow-creek-2027",
            vendor_id: "tallow-creek-farm",
            vendor: "Tallow Creek Farm",
            total_minor: 3_730_000,
            total_status: TotalStatus::Ambiguous,
            evidence_coverage_bps: 8_500,
            exact_date: true,
            gaps: vec![CalculationGap {
                code: "variable_consumption".to_string(),
                line_id: Some("beverages".to_string()),
                message: "Beverages are an estimate and overage is settled after the event."
                    .to_string(),
            }],
        },
        Sample {
            file: "quote-5-bayview-pavilion-mornington-peninsula.txt",
            quote_id: "bayview-pavilion-2027",
            vendor_id: "bayview-pavilion",
            vendor: "Bayview Pavilion",
            total_minor: 2_950_000,
            total_status: TotalStatus::Incomplete,
            evidence_coverage_bps: 6_000,
            exact_date: false,
            gaps: vec![CalculationGap {
                code: "from_price".to_string(),
                line_id: Some("package".to_string()),
                message:
                    "The package is priced from $29,500; final numbers and deposit are not stated."
                        .to_string(),
            }],
        },
    ];

    let mut names = BTreeMap::new();
    let mut candidates = Vec::new();
    for sample in samples {
        let source = fs::read_to_string(source_dir.join(sample.file))
            .unwrap_or_else(|error| panic!("could not read {}: {error}", sample.file));
        assert!(
            source.contains("90") || sample.file.contains("bayview"),
            "guest evidence missing in {}",
            sample.file
        );
        assert!(
            source.to_ascii_lowercase().contains("nov") && source.contains("2027"),
            "date evidence missing in {}",
            sample.file
        );
        names.insert(sample.quote_id.to_string(), sample.vendor.to_string());
        candidates.push(ComparisonCandidate {
            quotation_id: sample.quote_id.to_string(),
            version_id: format!("{}-v1", sample.quote_id),
            vendor_id: sample.vendor_id.to_string(),
            total: ComparableTotal {
                quotation_id: sample.quote_id.to_string(),
                version_id: format!("{}-v1", sample.quote_id),
                scenario_id: "priya-daniel-90-guests-2027-11-20".to_string(),
                currency: "AUD".to_string(),
                status: sample.total_status,
                subtotal_minor: Some(sample.total_minor),
                tax_minor: None,
                total_minor: Some(sample.total_minor),
                evidence_coverage_bps: sample.evidence_coverage_bps,
                gaps: sample.gaps,
                formula_trace: vec![],
            },
            requirements: vec![
                requirement(
                    "event_date",
                    if sample.exact_date {
                        RequirementStatus::Met
                    } else {
                        RequirementStatus::Unknown
                    },
                    if sample.exact_date {
                        "Exact event date appears in the quote."
                    } else {
                        "Only November 2027 is stated."
                    },
                ),
                requirement(
                    "guest_count_90",
                    RequirementStatus::Met,
                    "The quote covers 90 guests or a range containing 90.",
                ),
                requirement(
                    "availability",
                    RequirementStatus::Unknown,
                    "The document is a quote, not confirmation that the date remains available.",
                ),
            ],
        });
    }
    let comparison = compare_quotations(
        "priya-daniel-five-venue-quotes",
        "priya-daniel-90-guests-2027-11-20",
        candidates,
    );
    let rows = comparison.candidates.iter().map(|candidate| json!({
        "vendor": names.get(&candidate.quotation_id),
        "display_total": format!("AUD ${:.2}", candidate.total.total_minor.unwrap_or_default() as f64 / 100.0),
        "total_status": candidate.total.status,
        "decision_state": candidate.disposition,
        "confirmed_requirement_coverage_percent": candidate.requirement_coverage_bps as f64 / 100.0,
        "needs_confirmation": candidate.unknown_hard_requirement_ids,
        "important_notes": candidate.total.gaps.iter().map(|gap| gap.message.as_str()).collect::<Vec<_>>(),
    })).collect::<Vec<_>>();
    assert!(
        comparison
            .candidates
            .iter()
            .all(|candidate| candidate.disposition == CandidateDisposition::Conditional)
    );
    println!("{}", serde_json::to_string_pretty(&json!({
        "scenario": {"couple":"Priya Raman and Daniel Whitfield","guests":90,"date":"2027-11-20"},
        "headline":"Five quotes compared · no booking recommendation yet",
        "explanation":"Every option still needs availability confirmed. Estimated, incomplete, and adjusted totals are labelled rather than treated as equivalent fixed prices.",
        "recommended_quotation_id": comparison.recommended_quotation_id,
        "rows": rows,
    })).expect("sample output"));
}
