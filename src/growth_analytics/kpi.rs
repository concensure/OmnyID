use chrono::{DateTime, Datelike, Days, Duration, NaiveDate, TimeZone, Utc};
use chrono_tz::Australia::Sydney;
use serde::Serialize;
use std::collections::{BTreeMap, BTreeSet};

pub const KPI_DEFINITION_VERSION: &str = "growth-kpi-v1";

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case", tag = "state")]
pub enum KpiResult {
    Available {
        numerator: i64,
        denominator: i64,
        value: i64,
        unit: &'static str,
    },
    Provisional {
        numerator: i64,
        denominator: i64,
        mature_on: NaiveDate,
    },
    Unavailable {
        reason: &'static str,
        numerator: i64,
        denominator: i64,
    },
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
pub struct ReportWindow {
    pub timezone: &'static str,
    pub start_date: NaiveDate,
    pub end_date_exclusive: NaiveDate,
    pub start_utc: DateTime<Utc>,
    pub end_utc: DateTime<Utc>,
}

pub fn sydney_day_window(date: NaiveDate) -> Option<ReportWindow> {
    let end_date = date.checked_add_days(Days::new(1))?;
    let start = Sydney
        .from_local_datetime(&date.and_hms_opt(0, 0, 0)?)
        .single()?;
    let end = Sydney
        .from_local_datetime(&end_date.and_hms_opt(0, 0, 0)?)
        .single()?;
    Some(ReportWindow {
        timezone: "Australia/Sydney",
        start_date: date,
        end_date_exclusive: end_date,
        start_utc: start.with_timezone(&Utc),
        end_utc: end.with_timezone(&Utc),
    })
}

pub fn trailing_sydney_window(end_date_exclusive: NaiveDate, days: u64) -> Option<ReportWindow> {
    if days == 0 {
        return None;
    }
    let start_date = end_date_exclusive.checked_sub_days(Days::new(days))?;
    let start = sydney_day_window(start_date)?.start_utc;
    let end = sydney_day_window(end_date_exclusive)?.start_utc;
    Some(ReportWindow {
        timezone: "Australia/Sydney",
        start_date,
        end_date_exclusive,
        start_utc: start,
        end_utc: end,
    })
}

pub fn previous_window(current: &ReportWindow) -> Option<ReportWindow> {
    let days = (current.end_date_exclusive - current.start_date).num_days();
    trailing_sydney_window(current.start_date, days.try_into().ok()?)
}

pub fn cost_per_unit(spend_aud_minor: i64, denominator: i64, complete: bool) -> KpiResult {
    if !complete {
        return KpiResult::Unavailable {
            reason: "incomplete_spend",
            numerator: spend_aud_minor,
            denominator,
        };
    }
    if denominator <= 0 {
        return KpiResult::Unavailable {
            reason: "zero_denominator",
            numerator: spend_aud_minor,
            denominator,
        };
    }
    KpiResult::Available {
        numerator: spend_aud_minor,
        denominator,
        value: spend_aud_minor / denominator,
        unit: "aud_minor_per_unit",
    }
}

pub fn percentage_rate(numerator: i64, denominator: i64, zero_reason: &'static str) -> KpiResult {
    if denominator <= 0 {
        return KpiResult::Unavailable {
            reason: zero_reason,
            numerator,
            denominator,
        };
    }
    KpiResult::Available {
        numerator,
        denominator,
        value: numerator.saturating_mul(10_000) / denominator,
        unit: "basis_points",
    }
}

pub fn maturity_rate(
    numerator: i64,
    denominator: i64,
    mature_on: NaiveDate,
    report_date: NaiveDate,
    zero_reason: &'static str,
) -> KpiResult {
    if report_date < mature_on {
        return KpiResult::Provisional {
            numerator,
            denominator,
            mature_on,
        };
    }
    percentage_rate(numerator, denominator, zero_reason)
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ReturnObservation {
    pub wedding_plan_id: String,
    pub activation_date: NaiveDate,
    pub activity_dates: Vec<NaiveDate>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
pub struct WeeklyReturnCohort {
    pub week_start: NaiveDate,
    pub eligible_weddings: i64,
    pub returned_weddings: i64,
    pub immature_weddings: i64,
    pub result: KpiResult,
}

fn monday(date: NaiveDate) -> NaiveDate {
    date - Duration::days(i64::from(date.weekday().num_days_from_monday()))
}

pub fn weekly_return_cohorts(
    observations: &[ReturnObservation],
    report_date: NaiveDate,
) -> Vec<WeeklyReturnCohort> {
    let mut unique = BTreeMap::<String, (NaiveDate, BTreeSet<NaiveDate>)>::new();
    for observation in observations {
        let entry = unique
            .entry(observation.wedding_plan_id.clone())
            .or_insert_with(|| (observation.activation_date, BTreeSet::new()));
        entry.0 = entry.0.min(observation.activation_date);
        entry.1.extend(observation.activity_dates.iter().copied());
    }
    let mut grouped = BTreeMap::<NaiveDate, Vec<(NaiveDate, BTreeSet<NaiveDate>)>>::new();
    for (_, (activation_date, activity_dates)) in unique {
        grouped
            .entry(monday(activation_date))
            .or_default()
            .push((activation_date, activity_dates));
    }
    grouped
        .into_iter()
        .map(|(week_start, rows)| {
            let mut eligible = 0_i64;
            let mut returned = 0_i64;
            let mut immature = 0_i64;
            let mut latest_maturity = week_start;
            for (activation_date, activity_dates) in rows {
                let mature_on = activation_date + Duration::days(8);
                latest_maturity = latest_maturity.max(mature_on);
                if report_date < mature_on {
                    immature += 1;
                    continue;
                }
                eligible += 1;
                let qualifying_days = activity_dates
                    .iter()
                    .filter_map(|date| (*date - activation_date).num_days().try_into().ok())
                    .collect::<BTreeSet<u64>>();
                if qualifying_days.iter().any(|day| (1..=7).contains(day)) {
                    returned += 1;
                }
            }
            let result = if eligible == 0 && immature > 0 {
                KpiResult::Provisional {
                    numerator: 0,
                    denominator: 0,
                    mature_on: latest_maturity,
                }
            } else {
                percentage_rate(returned, eligible, "no_mature_activated_weddings")
            };
            WeeklyReturnCohort {
                week_start,
                eligible_weddings: eligible,
                returned_weddings: returned,
                immature_weddings: immature,
                result,
            }
        })
        .collect()
}

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq, Serialize)]
pub struct LandingViewCounts {
    pub first_party_eligible: i64,
    pub meta_reported: i64,
}

impl LandingViewCounts {
    pub fn cost_per_first_party_visit(self, spend_aud_minor: i64, complete: bool) -> KpiResult {
        cost_per_unit(spend_aud_minor, self.first_party_eligible, complete)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn date(value: &str) -> NaiveDate {
        NaiveDate::parse_from_str(value, "%Y-%m-%d").unwrap()
    }

    #[test]
    fn sydney_windows_cover_dst_days_without_assuming_twenty_four_hours() {
        let autumn = sydney_day_window(date("2026-04-05")).unwrap();
        let spring = sydney_day_window(date("2026-10-04")).unwrap();
        assert_eq!(autumn.end_utc - autumn.start_utc, Duration::hours(25));
        assert_eq!(spring.end_utc - spring.start_utc, Duration::hours(23));
        let current = trailing_sydney_window(date("2026-11-01"), 7).unwrap();
        let previous = previous_window(&current).unwrap();
        assert_eq!(previous.end_date_exclusive, current.start_date);
        assert_eq!(
            (previous.end_date_exclusive - previous.start_date).num_days(),
            7
        );
    }

    #[test]
    fn cost_and_rate_examples_are_exact_and_zero_safe() {
        assert_eq!(
            cost_per_unit(20_000, 100, true),
            KpiResult::Available {
                numerator: 20_000,
                denominator: 100,
                value: 200,
                unit: "aud_minor_per_unit"
            }
        );
        assert_eq!(
            cost_per_unit(20_000, 0, true),
            KpiResult::Unavailable {
                reason: "zero_denominator",
                numerator: 20_000,
                denominator: 0
            }
        );
        assert_eq!(
            cost_per_unit(20_000, 10, false),
            KpiResult::Unavailable {
                reason: "incomplete_spend",
                numerator: 20_000,
                denominator: 10
            }
        );
        assert_eq!(
            percentage_rate(2, 10, "no_signups"),
            KpiResult::Available {
                numerator: 2,
                denominator: 10,
                value: 2_000,
                unit: "basis_points"
            }
        );
    }

    #[test]
    fn return_cohorts_dedupe_weddings_exclude_day_zero_and_show_immaturity() {
        let rows = vec![
            ReturnObservation {
                wedding_plan_id: "wedding_plan:one".into(),
                activation_date: date("2026-10-26"),
                activity_dates: vec![date("2026-10-26"), date("2026-10-28")],
            },
            ReturnObservation {
                wedding_plan_id: "wedding_plan:one".into(),
                activation_date: date("2026-10-26"),
                activity_dates: vec![date("2026-10-29")],
            },
            ReturnObservation {
                wedding_plan_id: "wedding_plan:two".into(),
                activation_date: date("2026-11-02"),
                activity_dates: vec![date("2026-11-03")],
            },
        ];
        let cohorts = weekly_return_cohorts(&rows, date("2026-11-04"));
        assert_eq!(cohorts.len(), 2);
        assert_eq!(cohorts[0].eligible_weddings, 1);
        assert_eq!(cohorts[0].returned_weddings, 1);
        assert_eq!(cohorts[1].immature_weddings, 1);
        assert!(matches!(cohorts[1].result, KpiResult::Provisional { .. }));
    }

    #[test]
    fn meta_landing_views_never_enter_first_party_cost_denominator() {
        let views = LandingViewCounts {
            first_party_eligible: 100,
            meta_reported: 900,
        };
        assert_eq!(
            views.cost_per_first_party_visit(20_000, true),
            KpiResult::Available {
                numerator: 20_000,
                denominator: 100,
                value: 200,
                unit: "aud_minor_per_unit"
            }
        );
    }
}
