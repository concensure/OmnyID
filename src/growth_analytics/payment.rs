use serde_json::Value;

pub const PAYMENT_DEFINITION_VERSION: &str = "payment-v1";

pub fn stripe_checkout_binding_params(
    account_id: &str,
    wedding_plan_id: &str,
    stripe_price_id: &str,
) -> Vec<(String, String)> {
    [
        ("metadata[wedding_plan_id]", wedding_plan_id),
        ("metadata[stripe_price_id]", stripe_price_id),
        ("payment_intent_data[metadata][account_id]", account_id),
        (
            "payment_intent_data[metadata][wedding_plan_id]",
            wedding_plan_id,
        ),
        (
            "payment_intent_data[metadata][billing_product]",
            "omnyid_wedding",
        ),
        (
            "payment_intent_data[metadata][stripe_price_id]",
            stripe_price_id,
        ),
    ]
    .into_iter()
    .map(|(key, value)| (key.to_string(), value.to_string()))
    .collect()
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum PaymentEventKind {
    Success,
    Refund,
}

impl PaymentEventKind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Success => "success",
            Self::Refund => "refund",
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ApprovedPaymentEvent {
    pub kind: PaymentEventKind,
    pub owner_user_id: Option<String>,
    pub wedding_plan_id: Option<String>,
    pub stripe_transaction_id: String,
    pub amount_minor: i64,
    pub tax_minor: Option<i64>,
    pub currency: String,
    pub stripe_price_id: Option<String>,
    pub product_key: Option<String>,
    pub occurred_at_unix: i64,
}

fn bounded_text(value: Option<&Value>, max_len: usize) -> Option<String> {
    let value = value?.as_str()?.trim();
    (!value.is_empty() && value.len() <= max_len && !value.chars().any(char::is_control))
        .then(|| value.to_string())
}

fn currency(value: Option<&Value>) -> Option<String> {
    let value = bounded_text(value, 3)?.to_ascii_lowercase();
    (value.len() == 3 && value.bytes().all(|byte| byte.is_ascii_lowercase())).then_some(value)
}

fn metadata<'a>(object: &'a Value, key: &str) -> Option<&'a Value> {
    object.pointer(&format!("/metadata/{key}"))
}

fn server_binding(
    object: &Value,
) -> (
    Option<String>,
    Option<String>,
    Option<String>,
    Option<String>,
) {
    let owner = bounded_text(metadata(object, "account_id"), 200);
    let plan = bounded_text(metadata(object, "wedding_plan_id"), 200)
        .filter(|value| value.starts_with("wedding_plan:"));
    let price = bounded_text(metadata(object, "stripe_price_id"), 200)
        .filter(|value| value.starts_with("price_"));
    let product = bounded_text(metadata(object, "billing_product"), 100)
        .filter(|value| value == "omnyid_wedding");
    (owner, plan, price, product)
}

pub fn approved_payment_event(payload: &Value) -> Option<ApprovedPaymentEvent> {
    if payload.get("livemode").and_then(Value::as_bool) != Some(true) {
        return None;
    }
    let event_type = payload.get("type")?.as_str()?;
    let occurred_at_unix = payload.get("created")?.as_i64()?;
    let object = payload.pointer("/data/object")?;
    let (owner, plan, price, product) = server_binding(object);

    match event_type {
        "checkout.session.completed" | "checkout.session.async_payment_succeeded"
            if object.get("mode").and_then(Value::as_str) == Some("payment")
                && object.get("payment_status").and_then(Value::as_str) == Some("paid") =>
        {
            let amount_minor = object.get("amount_total")?.as_i64()?;
            if amount_minor <= 0 {
                return None;
            }
            Some(ApprovedPaymentEvent {
                kind: PaymentEventKind::Success,
                owner_user_id: Some(owner?),
                wedding_plan_id: Some(plan?),
                stripe_transaction_id: bounded_text(object.get("payment_intent"), 200)
                    .filter(|value| value.starts_with("pi_"))?,
                amount_minor,
                tax_minor: object
                    .pointer("/total_details/amount_tax")
                    .and_then(Value::as_i64)
                    .filter(|value| *value >= 0),
                currency: currency(object.get("currency"))?,
                stripe_price_id: Some(price?),
                product_key: Some(product?),
                occurred_at_unix,
            })
        }
        "charge.refunded" => {
            let amount_minor = object.get("amount_refunded")?.as_i64()?;
            if amount_minor <= 0 || object.get("paid").and_then(Value::as_bool) != Some(true) {
                return None;
            }
            Some(ApprovedPaymentEvent {
                kind: PaymentEventKind::Refund,
                owner_user_id: owner,
                wedding_plan_id: plan,
                stripe_transaction_id: bounded_text(object.get("payment_intent"), 200)
                    .filter(|value| value.starts_with("pi_"))?,
                amount_minor,
                tax_minor: None,
                currency: currency(object.get("currency"))?,
                stripe_price_id: price,
                product_key: product,
                occurred_at_unix,
            })
        }
        _ => None,
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct VariableCostInputs {
    pub payment_fixed_minor: Option<i64>,
    pub payment_rate_basis_points: Option<i32>,
    pub service_cost_minor: Option<i64>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ProfitabilityState {
    Complete {
        net_revenue_minor: i64,
        variable_cost_minor: i64,
        contribution_minor: i64,
    },
    Incomplete {
        missing: Vec<&'static str>,
    },
}

pub fn profitability_state(
    gross_minor: i64,
    refunded_minor: i64,
    tax_minor: Option<i64>,
    costs: VariableCostInputs,
) -> ProfitabilityState {
    let mut missing = Vec::new();
    if tax_minor.is_none() {
        missing.push("tax_minor");
    }
    if costs.payment_fixed_minor.is_none() {
        missing.push("payment_fixed_minor");
    }
    if costs.payment_rate_basis_points.is_none() {
        missing.push("payment_rate_basis_points");
    }
    if costs.service_cost_minor.is_none() {
        missing.push("service_cost_minor");
    }
    if !missing.is_empty() {
        return ProfitabilityState::Incomplete { missing };
    }
    let net_revenue_minor = gross_minor
        .saturating_sub(refunded_minor)
        .saturating_sub(tax_minor.unwrap_or_default());
    let rate_cost = net_revenue_minor.max(0).saturating_mul(i64::from(
        costs.payment_rate_basis_points.unwrap_or_default(),
    )) / 10_000;
    let variable_cost_minor = costs
        .payment_fixed_minor
        .unwrap_or_default()
        .saturating_add(rate_cost)
        .saturating_add(costs.service_cost_minor.unwrap_or_default());
    ProfitabilityState::Complete {
        net_revenue_minor,
        variable_cost_minor,
        contribution_minor: net_revenue_minor.saturating_sub(variable_cost_minor),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn success(livemode: bool) -> Value {
        json!({
            "id":"evt_paid", "type":"checkout.session.completed", "livemode":livemode,
            "created":1_793_750_400,
            "data":{"object":{
                "mode":"payment", "payment_status":"paid", "payment_intent":"pi_one",
                "amount_total":4900, "currency":"aud", "total_details":{"amount_tax":445},
                "metadata":{"account_id":"user-one","wedding_plan_id":"wedding_plan:one",
                    "stripe_price_id":"price_live_one","billing_product":"omnyid_wedding"}
            }}
        })
    }

    #[test]
    fn accepts_exact_live_paid_wedding_checkout() {
        let event = approved_payment_event(&success(true)).unwrap();
        assert_eq!(event.kind, PaymentEventKind::Success);
        assert_eq!(event.amount_minor, 4900);
        assert_eq!(event.tax_minor, Some(445));
        assert_eq!(event.wedding_plan_id.as_deref(), Some("wedding_plan:one"));
        let params = stripe_checkout_binding_params("user-one", "wedding_plan:one", "price_live_one");
        assert!(params.contains(&(
            "payment_intent_data[metadata][wedding_plan_id]".into(),
            "wedding_plan:one".into()
        )));
        assert!(params.contains(&(
            "metadata[stripe_price_id]".into(),
            "price_live_one".into()
        )));
    }

    #[test]
    fn checkout_start_test_mode_and_unbound_payloads_fail_closed() {
        assert!(approved_payment_event(&success(false)).is_none());
        let mut started = success(true);
        started["type"] = json!("checkout.session.created");
        assert!(approved_payment_event(&started).is_none());
        let mut unbound = success(true);
        unbound["data"]["object"]["metadata"]
            .as_object_mut()
            .unwrap()
            .remove("wedding_plan_id");
        assert!(approved_payment_event(&unbound).is_none());
    }

    #[test]
    fn refund_can_correlate_by_payment_intent_without_copying_identity() {
        let event = approved_payment_event(&json!({
            "id":"evt_refund", "type":"charge.refunded", "livemode":true,
            "created":1_793_836_800,
            "data":{"object":{"paid":true,"payment_intent":"pi_one",
                "amount_refunded":4900,"currency":"aud","metadata":{}}}
        }))
        .unwrap();
        assert_eq!(event.kind, PaymentEventKind::Refund);
        assert_eq!(event.owner_user_id, None);
        assert_eq!(event.amount_minor, 4900);
    }

    #[test]
    fn missing_cost_or_tax_is_incomplete_not_an_estimate() {
        assert_eq!(
            profitability_state(
                4900,
                0,
                None,
                VariableCostInputs {
                    payment_fixed_minor: Some(30),
                    payment_rate_basis_points: None,
                    service_cost_minor: Some(500),
                },
            ),
            ProfitabilityState::Incomplete {
                missing: vec!["tax_minor", "payment_rate_basis_points"]
            }
        );
    }

    #[test]
    fn complete_cost_revision_yields_integer_contribution() {
        assert_eq!(
            profitability_state(
                4900,
                900,
                Some(400),
                VariableCostInputs {
                    payment_fixed_minor: Some(30),
                    payment_rate_basis_points: Some(175),
                    service_cost_minor: Some(500),
                },
            ),
            ProfitabilityState::Complete {
                net_revenue_minor: 3600,
                variable_cost_minor: 593,
                contribution_minor: 3007,
            }
        );
    }
}
