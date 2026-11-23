use chrono::NaiveDate;
use csv::{ReaderBuilder, StringRecord, Trim};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, BTreeSet};

pub const MAX_SPEND_CSV_BYTES: usize = 5 * 1024 * 1024;
pub const MAX_SPEND_CSV_ROWS: usize = 20_000;
const MAX_CELL_BYTES: usize = 4_096;

#[derive(Clone, Copy, Debug, Deserialize, Eq, Ord, PartialEq, PartialOrd, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum SpendGrain {
    Account,
    Campaign,
    AdSet,
    Ad,
    Creative,
    Placement,
}

impl SpendGrain {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Account => "account",
            Self::Campaign => "campaign",
            Self::AdSet => "ad_set",
            Self::Ad => "ad",
            Self::Creative => "creative",
            Self::Placement => "placement",
        }
    }
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct SpendConversion {
    pub source_currency: String,
    pub aud_rate_micros: i64,
    pub source: String,
    pub date: NaiveDate,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
pub struct SpendValidationError {
    pub row: Option<usize>,
    pub field: Option<String>,
    pub code: String,
    pub message: String,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
pub struct SpendImportRow {
    pub source_row_number: usize,
    pub source_row_digest: String,
    pub spend_date: NaiveDate,
    pub platform: String,
    pub account_id: Option<String>,
    pub account_name: Option<String>,
    pub campaign_id: Option<String>,
    pub campaign_name: Option<String>,
    pub ad_set_id: Option<String>,
    pub ad_set_name: Option<String>,
    pub ad_id: Option<String>,
    pub ad_name: Option<String>,
    pub creative_id: Option<String>,
    pub creative_name: Option<String>,
    pub placement: Option<String>,
    pub grain: SpendGrain,
    pub source_spend_minor: i64,
    pub source_currency: String,
    pub aud_spend_minor: i64,
    pub aud_rate_micros: i64,
    pub conversion_source: String,
    pub conversion_date: NaiveDate,
    pub impressions: Option<i64>,
    pub clicks: Option<i64>,
    pub platform_landing_views: Option<i64>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
pub struct SpendImportPreview {
    pub content_sha256: String,
    pub file_bytes: usize,
    pub source_row_count: usize,
    pub mapping: BTreeMap<String, String>,
    pub rows: Vec<SpendImportRow>,
    pub errors: Vec<SpendValidationError>,
    pub grains: BTreeSet<SpendGrain>,
    pub requires_grain_selection: bool,
    pub formula_like_cells: usize,
}

impl SpendImportPreview {
    pub fn committable_rows(
        &self,
        selected: Option<SpendGrain>,
    ) -> Result<Vec<SpendImportRow>, String> {
        if !self.errors.is_empty() {
            return Err("preview contains validation errors".into());
        }
        if self.requires_grain_selection && selected.is_none() {
            return Err("mixed aggregation grains require an explicit selected grain".into());
        }
        let rows = self
            .rows
            .iter()
            .filter(|row| selected.is_none_or(|grain| row.grain == grain))
            .cloned()
            .collect::<Vec<_>>();
        if rows.is_empty() {
            return Err("the selected grain has no rows".into());
        }
        Ok(rows)
    }
}

#[derive(Clone, Copy)]
struct Columns {
    date: usize,
    spend: usize,
    currency: Option<usize>,
    platform: Option<usize>,
    account_id: Option<usize>,
    account_name: Option<usize>,
    campaign_id: Option<usize>,
    campaign_name: Option<usize>,
    ad_set_id: Option<usize>,
    ad_set_name: Option<usize>,
    ad_id: Option<usize>,
    ad_name: Option<usize>,
    creative_id: Option<usize>,
    creative_name: Option<usize>,
    placement: Option<usize>,
    impressions: Option<usize>,
    clicks: Option<usize>,
    landing_views: Option<usize>,
}

fn normalized_header(value: &str) -> String {
    value
        .trim_start_matches('\u{feff}')
        .trim()
        .to_ascii_lowercase()
        .chars()
        .map(|value| {
            if value.is_ascii_alphanumeric() {
                value
            } else {
                '_'
            }
        })
        .collect::<String>()
        .split('_')
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join("_")
}

fn column(headers: &[String], aliases: &[&str]) -> Option<usize> {
    headers
        .iter()
        .position(|header| aliases.iter().any(|alias| header == alias))
}

fn columns(headers: &StringRecord) -> Result<(Columns, BTreeMap<String, String>), String> {
    let normalized = headers.iter().map(normalized_header).collect::<Vec<_>>();
    let date = column(
        &normalized,
        &["date", "day", "reporting_starts", "reporting_start"],
    )
    .ok_or("missing date column")?;
    let spend =
        column(&normalized, &["amount_spent", "spend", "cost"]).ok_or("missing spend column")?;
    let optional = |aliases: &[&str]| column(&normalized, aliases);
    let columns = Columns {
        date,
        spend,
        currency: optional(&["currency", "account_currency"]),
        platform: optional(&["platform", "publisher_platform"]),
        account_id: optional(&["account_id", "ad_account_id"]),
        account_name: optional(&["account_name", "ad_account_name"]),
        campaign_id: optional(&["campaign_id"]),
        campaign_name: optional(&["campaign_name"]),
        ad_set_id: optional(&["ad_set_id", "adset_id"]),
        ad_set_name: optional(&["ad_set_name", "adset_name"]),
        ad_id: optional(&["ad_id"]),
        ad_name: optional(&["ad_name"]),
        creative_id: optional(&["creative_id"]),
        creative_name: optional(&["creative_name"]),
        placement: optional(&["placement", "platform_position"]),
        impressions: optional(&["impressions"]),
        clicks: optional(&["clicks", "link_clicks"]),
        landing_views: optional(&["landing_page_views", "platform_landing_views", "lpv"]),
    };
    let mut mapping = BTreeMap::new();
    for (canonical, index) in [
        ("date", Some(columns.date)),
        ("spend", Some(columns.spend)),
        ("currency", columns.currency),
        ("platform", columns.platform),
        ("account_id", columns.account_id),
        ("campaign_id", columns.campaign_id),
        ("ad_set_id", columns.ad_set_id),
        ("ad_id", columns.ad_id),
        ("creative_id", columns.creative_id),
        ("placement", columns.placement),
        ("impressions", columns.impressions),
        ("clicks", columns.clicks),
        ("platform_landing_views", columns.landing_views),
    ] {
        if let Some(index) = index {
            mapping.insert(canonical.to_string(), headers[index].to_string());
        }
    }
    Ok((columns, mapping))
}

fn text(record: &StringRecord, index: Option<usize>) -> Option<String> {
    let value = record.get(index?)?.trim();
    (!value.is_empty()).then(|| value.to_string())
}

fn bounded_dimension(value: Option<String>) -> Result<Option<String>, String> {
    match value {
        Some(value) if value.len() > 500 || value.chars().any(char::is_control) => {
            Err("dimension exceeds its safe text limit".into())
        }
        value => Ok(value),
    }
}

fn parse_date(value: &str) -> Option<NaiveDate> {
    ["%Y-%m-%d", "%d/%m/%Y", "%m/%d/%Y"]
        .iter()
        .find_map(|format| NaiveDate::parse_from_str(value.trim(), format).ok())
}

fn parse_nonnegative(value: Option<&str>) -> Result<Option<i64>, String> {
    let Some(value) = value.map(str::trim).filter(|value| !value.is_empty()) else {
        return Ok(None);
    };
    value
        .replace(',', "")
        .parse::<i64>()
        .ok()
        .filter(|value| *value >= 0)
        .map(Some)
        .ok_or_else(|| "expected a non-negative whole number".into())
}

fn parse_money_minor(value: &str) -> Result<i64, String> {
    let normalized = value.trim().replace(',', "");
    if normalized.starts_with(['=', '+', '-', '@']) || normalized.is_empty() {
        return Err("spend must be a non-negative decimal amount".into());
    }
    let (whole, fraction) = normalized.split_once('.').unwrap_or((&normalized, ""));
    if !whole.bytes().all(|byte| byte.is_ascii_digit())
        || fraction.len() > 2
        || !fraction.bytes().all(|byte| byte.is_ascii_digit())
    {
        return Err("spend must use at most two decimal places".into());
    }
    let whole = whole.parse::<i64>().map_err(|_| "spend is too large")?;
    let fraction = format!("{fraction:0<2}")
        .parse::<i64>()
        .map_err(|_| "invalid spend")?;
    whole
        .checked_mul(100)
        .and_then(|value| value.checked_add(fraction))
        .ok_or_else(|| "spend is too large".into())
}

fn currency(value: Option<String>, fallback: &SpendConversion) -> Result<String, String> {
    let value = value
        .unwrap_or_else(|| fallback.source_currency.clone())
        .to_ascii_uppercase();
    (value.len() == 3 && value.bytes().all(|byte| byte.is_ascii_uppercase()))
        .then_some(value)
        .ok_or_else(|| "currency must be a three-letter code".into())
}

fn aud_minor(
    source_minor: i64,
    currency: &str,
    conversion: &SpendConversion,
) -> Result<i64, String> {
    let rate = if currency == "AUD" {
        1_000_000
    } else {
        conversion.aud_rate_micros
    };
    if rate <= 0
        || (currency != "AUD" && currency != conversion.source_currency.to_ascii_uppercase())
    {
        return Err("reviewed AUD conversion does not match the source currency".into());
    }
    source_minor
        .checked_mul(rate)
        .and_then(|value| value.checked_add(500_000))
        .map(|value| value / 1_000_000)
        .ok_or_else(|| "converted spend is too large".into())
}

fn row_grain(row: &SpendImportRow) -> SpendGrain {
    if row.placement.is_some() {
        SpendGrain::Placement
    } else if row.creative_id.is_some() || row.creative_name.is_some() {
        SpendGrain::Creative
    } else if row.ad_id.is_some() || row.ad_name.is_some() {
        SpendGrain::Ad
    } else if row.ad_set_id.is_some() || row.ad_set_name.is_some() {
        SpendGrain::AdSet
    } else if row.campaign_id.is_some() || row.campaign_name.is_some() {
        SpendGrain::Campaign
    } else {
        SpendGrain::Account
    }
}

fn digest<T: Serialize>(value: &T) -> String {
    let bytes = serde_json::to_vec(value).unwrap_or_default();
    hex::encode(Sha256::digest(bytes))
}

pub fn formula_safe_cell(value: &str) -> String {
    if value.trim_start().starts_with(['=', '+', '-', '@']) {
        format!("'{value}")
    } else {
        value.to_string()
    }
}

pub fn preview_spend_csv(
    bytes: &[u8],
    default_platform: &str,
    conversion: &SpendConversion,
) -> SpendImportPreview {
    let content_sha256 = hex::encode(Sha256::digest(bytes));
    let mut preview = SpendImportPreview {
        content_sha256,
        file_bytes: bytes.len(),
        source_row_count: 0,
        mapping: BTreeMap::new(),
        rows: Vec::new(),
        errors: Vec::new(),
        grains: BTreeSet::new(),
        requires_grain_selection: false,
        formula_like_cells: 0,
    };
    if bytes.is_empty() || bytes.len() > MAX_SPEND_CSV_BYTES {
        preview.errors.push(SpendValidationError {
            row: None,
            field: None,
            code: "file_size".into(),
            message: "CSV must be between 1 byte and 5 MiB".into(),
        });
        return preview;
    }
    if conversion.source.len() > 200
        || conversion.source.trim().is_empty()
        || conversion.aud_rate_micros <= 0
    {
        preview.errors.push(SpendValidationError {
            row: None,
            field: Some("conversion".into()),
            code: "conversion".into(),
            message: "reviewed AUD conversion metadata is incomplete".into(),
        });
        return preview;
    }
    let mut reader = ReaderBuilder::new()
        .trim(Trim::All)
        .flexible(false)
        .from_reader(bytes);
    let headers = match reader.headers() {
        Ok(headers) if headers.len() <= 64 => headers.clone(),
        Ok(_) => {
            preview.errors.push(SpendValidationError {
                row: None,
                field: None,
                code: "column_limit".into(),
                message: "CSV exceeds 64 columns".into(),
            });
            return preview;
        }
        Err(_) => {
            preview.errors.push(SpendValidationError {
                row: None,
                field: None,
                code: "csv".into(),
                message: "CSV header is invalid UTF-8 or syntax".into(),
            });
            return preview;
        }
    };
    let (columns, mapping) = match columns(&headers) {
        Ok(value) => value,
        Err(message) => {
            preview.errors.push(SpendValidationError {
                row: None,
                field: None,
                code: "mapping".into(),
                message,
            });
            return preview;
        }
    };
    preview.mapping = mapping;
    for (offset, record) in reader.records().enumerate() {
        let row_number = offset + 2;
        if offset >= MAX_SPEND_CSV_ROWS {
            preview.errors.push(SpendValidationError {
                row: None,
                field: None,
                code: "row_limit".into(),
                message: "CSV exceeds 20,000 data rows".into(),
            });
            break;
        }
        let record = match record {
            Ok(record) if record.iter().all(|cell| cell.len() <= MAX_CELL_BYTES) => record,
            Ok(_) => {
                preview.errors.push(SpendValidationError {
                    row: Some(row_number),
                    field: None,
                    code: "cell_limit".into(),
                    message: "a cell exceeds 4,096 bytes".into(),
                });
                continue;
            }
            Err(_) => {
                preview.errors.push(SpendValidationError {
                    row: Some(row_number),
                    field: None,
                    code: "csv".into(),
                    message: "row has invalid CSV syntax or width".into(),
                });
                continue;
            }
        };
        preview.source_row_count += 1;
        preview.formula_like_cells += record
            .iter()
            .filter(|cell| cell.trim_start().starts_with(['=', '+', '-', '@']))
            .count();
        match parse_row(&record, row_number, columns, default_platform, conversion) {
            Ok(row) => {
                preview.grains.insert(row.grain);
                preview.rows.push(row);
            }
            Err((field, message)) => preview.errors.push(SpendValidationError {
                row: Some(row_number),
                field: Some(field),
                code: "row".into(),
                message,
            }),
        }
    }
    if preview.source_row_count == 0 {
        preview.errors.push(SpendValidationError {
            row: None,
            field: None,
            code: "empty".into(),
            message: "CSV has no data rows".into(),
        });
    }
    preview.requires_grain_selection = preview.grains.len() > 1;
    preview
}

fn parse_row(
    record: &StringRecord,
    row_number: usize,
    columns: Columns,
    default_platform: &str,
    conversion: &SpendConversion,
) -> Result<SpendImportRow, (String, String)> {
    let field_error = |field: &str, error: String| (field.to_string(), error);
    let spend_date = parse_date(record.get(columns.date).unwrap_or_default()).ok_or_else(|| {
        field_error(
            "date",
            "date must be YYYY-MM-DD, DD/MM/YYYY or MM/DD/YYYY".into(),
        )
    })?;
    let source_spend_minor = parse_money_minor(record.get(columns.spend).unwrap_or_default())
        .map_err(|error| field_error("spend", error))?;
    let source_currency = currency(text(record, columns.currency), conversion)
        .map_err(|error| field_error("currency", error))?;
    let aud_spend_minor = aud_minor(source_spend_minor, &source_currency, conversion)
        .map_err(|error| field_error("conversion", error))?;
    let bounded = |value| bounded_dimension(value).map_err(|error| field_error("dimension", error));
    let mut row = SpendImportRow {
        source_row_number: row_number,
        source_row_digest: String::new(),
        spend_date,
        platform: text(record, columns.platform)
            .unwrap_or_else(|| default_platform.trim().to_string()),
        account_id: bounded(text(record, columns.account_id))?,
        account_name: bounded(text(record, columns.account_name))?,
        campaign_id: bounded(text(record, columns.campaign_id))?,
        campaign_name: bounded(text(record, columns.campaign_name))?,
        ad_set_id: bounded(text(record, columns.ad_set_id))?,
        ad_set_name: bounded(text(record, columns.ad_set_name))?,
        ad_id: bounded(text(record, columns.ad_id))?,
        ad_name: bounded(text(record, columns.ad_name))?,
        creative_id: bounded(text(record, columns.creative_id))?,
        creative_name: bounded(text(record, columns.creative_name))?,
        placement: bounded(text(record, columns.placement))?,
        grain: SpendGrain::Account,
        source_spend_minor,
        source_currency,
        aud_spend_minor,
        aud_rate_micros: if conversion.source_currency.eq_ignore_ascii_case("AUD") {
            1_000_000
        } else {
            conversion.aud_rate_micros
        },
        conversion_source: conversion.source.trim().to_string(),
        conversion_date: conversion.date,
        impressions: parse_nonnegative(record.get(columns.impressions.unwrap_or(usize::MAX)))
            .map_err(|error| field_error("impressions", error))?,
        clicks: parse_nonnegative(record.get(columns.clicks.unwrap_or(usize::MAX)))
            .map_err(|error| field_error("clicks", error))?,
        platform_landing_views: parse_nonnegative(
            record.get(columns.landing_views.unwrap_or(usize::MAX)),
        )
        .map_err(|error| field_error("platform_landing_views", error))?,
    };
    if row.platform.is_empty() || row.platform.len() > 40 {
        return Err(field_error(
            "platform",
            "platform is required and limited to 40 characters".into(),
        ));
    }
    row.grain = row_grain(&row);
    row.source_row_digest = digest(&(
        row.spend_date,
        &row.platform,
        &row.account_id,
        &row.campaign_id,
        &row.ad_set_id,
        &row.ad_id,
        &row.creative_id,
        &row.placement,
        row.grain,
        row.source_spend_minor,
        &row.source_currency,
        row.impressions,
        row.clicks,
        row.platform_landing_views,
    ));
    Ok(row)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn conversion(currency: &str) -> SpendConversion {
        SpendConversion {
            source_currency: currency.into(),
            aud_rate_micros: 1_500_000,
            source: "Operator-reviewed RBA daily rate".into(),
            date: NaiveDate::from_ymd_opt(2026, 11, 3).unwrap(),
        }
    }

    #[test]
    fn previews_meta_rows_and_requires_a_mixed_grain_choice() {
        let csv = b"Date,Campaign ID,Campaign name,Ad set ID,Amount spent,Currency,Impressions,Landing page views\n2026-11-01,c1,Spring,,10.50,AUD,100,8\n2026-11-01,c1,Spring,s1,3.25,AUD,40,3\n";
        let preview = preview_spend_csv(csv, "meta", &conversion("AUD"));
        assert!(preview.errors.is_empty(), "{:?}", preview.errors);
        assert!(preview.requires_grain_selection);
        assert_eq!(
            preview
                .committable_rows(Some(SpendGrain::AdSet))
                .unwrap()
                .len(),
            1
        );
        assert!(preview.committable_rows(None).is_err());
    }

    #[test]
    fn duplicate_content_and_rows_have_stable_digests() {
        let csv = b"Date,Campaign ID,Amount spent,Currency\n2026-11-01,c1,10.50,AUD\n";
        let one = preview_spend_csv(csv, "meta", &conversion("AUD"));
        let two = preview_spend_csv(csv, "meta", &conversion("AUD"));
        assert_eq!(one.content_sha256, two.content_sha256);
        assert_eq!(one.rows[0].source_row_digest, two.rows[0].source_row_digest);
        assert_eq!(one.rows[0].source_spend_minor, 1050);
    }

    #[test]
    fn conversion_and_formula_cells_are_bounded_and_safe() {
        let csv =
            b"Date,Campaign name,Amount spent,Currency\n2026-11-01,=IMPORTXML(foo),2.00,USD\n";
        let preview = preview_spend_csv(csv, "meta", &conversion("USD"));
        assert!(preview.errors.is_empty());
        assert_eq!(preview.rows[0].aud_spend_minor, 300);
        assert_eq!(preview.formula_like_cells, 1);
        assert_eq!(formula_safe_cell("=1+1"), "'=1+1");
        assert_eq!(formula_safe_cell("ordinary"), "ordinary");
    }

    #[test]
    fn malformed_unbounded_and_negative_inputs_fail_closed() {
        let oversized = vec![b'a'; MAX_SPEND_CSV_BYTES + 1];
        assert_eq!(
            preview_spend_csv(&oversized, "meta", &conversion("AUD")).errors[0].code,
            "file_size"
        );
        let negative = b"Date,Amount spent,Currency\n2026-11-01,-2.00,AUD\n";
        assert!(
            !preview_spend_csv(negative, "meta", &conversion("AUD"))
                .errors
                .is_empty()
        );
        let missing = b"Campaign,Amount spent\nSpring,2.00\n";
        assert_eq!(
            preview_spend_csv(missing, "meta", &conversion("AUD")).errors[0].code,
            "mapping"
        );
    }
}
