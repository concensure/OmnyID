use anyhow::{Context, Result, bail};
use chrono::{DateTime, Duration, Utc};
use chrono_tz::Australia::Sydney;
use omnyid_homeserver::{afp::Message, db::Db};
use serde::Serialize;
use serde_json::{Value, json};
use std::{env, fs, path::PathBuf};
use ulid::Ulid;

const OPERATOR_EMAIL: &str = "growth-operator@omnyid.test";
const ORDINARY_EMAIL: &str = "growth-ordinary@omnyid.test";
const PARTNER_EMAIL: &str = "growth-partner@omnyid.test";

#[derive(Serialize)]
struct GrowthSeedManifest {
    schema_version: u8,
    operator_email: &'static str,
    ordinary_email: &'static str,
    partner_email: &'static str,
    report_from: String,
    report_through: String,
    paid_plan_id: String,
    direct_plan_id: String,
    expected_landing_sessions: i64,
    expected_registered_weddings: i64,
    expected_activated_weddings: i64,
    expected_returned_weddings: i64,
    expected_paid_weddings: i64,
    expected_gross_minor: i64,
    expected_refunded_minor: i64,
}

fn required(name: &str) -> Result<String> {
    env::var(name)
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .with_context(|| format!("{name} is required"))
}

fn assert_safe_database_url(value: &str) -> Result<()> {
    if !(value.starts_with("postgres://") || value.starts_with("postgresql://"))
        || !value.contains("@127.0.0.1:")
        || !value.ends_with("/omnyid_test")
    {
        bail!("refusing non-disposable database; expected 127.0.0.1 and /omnyid_test");
    }
    Ok(())
}

fn assert_safe_api_origin(value: &str) -> Result<()> {
    let parsed = reqwest::Url::parse(value).context("OMNYID_E2E_API_ORIGIN must be a URL")?;
    if parsed.scheme() != "http"
        || parsed.host_str() != Some("127.0.0.1")
        || parsed.path() != "/"
        || parsed.query().is_some()
        || parsed.fragment().is_some()
    {
        bail!("refusing non-loopback homeserver origin");
    }
    Ok(())
}

async fn ingest_visit(
    client: &reqwest::Client,
    origin: &str,
    visit_id: &str,
    event_id: &str,
    source: Option<&str>,
    medium: Option<&str>,
    campaign: Option<&str>,
) -> Result<()> {
    let batch = json!({
        "schema_version":"public-measurement.v1","visit_id":visit_id,
        "session":{
            "utm_source":source,"utm_medium":medium,"utm_campaign":campaign,
            "utm_content":null,"utm_term":null,"intent":"starting",
            "ad_click_present":source.is_some(),"referrer_class":if source.is_some(){"social"}else{"direct"},
            "referrer_host":null,"device_class":"mobile","language":"en","landing_path":"/wedding/"
        },
        "events":[{"event_id":event_id,"event":"wedding_landing_view","page":"/wedding/","props":{}}]
    });
    for _ in 0..2 {
        let response = client
            .post(format!("{origin}/wedding/e"))
            .json(&batch)
            .send()
            .await?;
        if response.status() != reqwest::StatusCode::NO_CONTENT {
            bail!("measurement route returned {}", response.status());
        }
    }
    Ok(())
}

async fn register(
    client: &reqwest::Client,
    origin: &str,
    email: &str,
    password: &str,
    acquisition_visit_id: Option<&str>,
) -> Result<()> {
    let response = client
        .post(format!("{origin}/auth/register"))
        .json(&json!({
            "email":email,"password":password,"display_name":email.split('@').next(),
            "source":"growth_e2e","acquisition_visit_id":acquisition_visit_id
        }))
        .send()
        .await?;
    if !response.status().is_success() {
        bail!("registration route rejected {email}: {}", response.status());
    }
    Ok(())
}

fn afp_message(id: &str, timestamp: DateTime<Utc>, subtype: &str, content: &Value) -> Message {
    Message {
        protocol: "afp-v1".into(),
        id: id.into(),
        thread_id: "growth-e2e".into(),
        parent_id: String::new(),
        from: "test://growth-e2e".into(),
        to: vec!["agent://wedding-planning".into()],
        timestamp: timestamp.to_rfc3339(),
        r#type: "ledger".into(),
        kind: Some(subtype.into()),
        supertags: vec!["template:wedding_planning".into(), "e2e_fixture".into()],
        content: content.to_string(),
        signature: "growth-e2e-signature".into(),
        encryption: "{}".into(),
        views: "[]".into(),
        references: "[]".into(),
        attachments: "[]".into(),
        store_in_relational: true,
        subtype: subtype.into(),
        metadata: json!({"test_fixture":true}).to_string(),
    }
}

async fn seed_plan(
    db: &Db,
    user_id: &str,
    plan_id: &str,
    registered_at: DateTime<Utc>,
    include_return: bool,
) -> Result<()> {
    db.ensure_user_private_schema(user_id).await?;
    db.upsert_wedding_user_onboarding_state(user_id, plan_id, "growth_e2e", "growth_e2e", None)
        .await?;
    db.attach_same_session_acquisition_to_wedding(user_id, plan_id)
        .await?;
    let intake = json!({"kind":"wedding_intake_profile","wedding_plan_id":plan_id});
    db.store_private_message(
        user_id,
        &afp_message(
            &format!("growth-intake-{}", Ulid::new()),
            registered_at + Duration::days(1),
            "wedding_intake_profile",
            &intake,
        ),
        intake,
    )
    .await?;
    if include_return {
        let decision = json!({
            "kind":"wedding_decision_selection","wedding_plan_id":plan_id,
            "decision_id":"growth-e2e-decision","budget_decision":true
        });
        db.store_private_message(
            user_id,
            &afp_message(
                &format!("growth-return-{}", Ulid::new()),
                registered_at + Duration::days(3),
                "wedding_decision_selection",
                &decision,
            ),
            decision,
        )
        .await?;
    }
    Ok(())
}

async fn seed_payment(
    db: &Db,
    owner_user_id: &str,
    plan_id: &str,
    registered_at: DateTime<Utc>,
) -> Result<()> {
    let paid_at = registered_at + Duration::days(5);
    let transaction_id = format!("pi_growth_{}", Ulid::new());
    let success_id = format!("evt_growth_success_{}", Ulid::new());
    let success = json!({
        "id":success_id,"type":"checkout.session.completed","livemode":true,"created":paid_at.timestamp(),
        "data":{"object":{"mode":"payment","payment_status":"paid","payment_intent":transaction_id,
            "amount_total":4900,"currency":"aud","total_details":{"amount_tax":445},
            "metadata":{"account_id":owner_user_id,"wedding_plan_id":plan_id,
                "stripe_price_id":"price_live_growth_e2e","billing_product":"omnyid_wedding"}}}
    });
    db.record_billing_event(
        Some(owner_user_id),
        &success_id,
        "checkout.session.completed",
        &success,
    )
    .await?;
    db.project_growth_payment_payload(&success_id, &success)
        .await?;
    let refund_id = format!("evt_growth_refund_{}", Ulid::new());
    let refund = json!({
        "id":refund_id,"type":"charge.refunded","livemode":true,
        "created":(paid_at + Duration::days(1)).timestamp(),
        "data":{"object":{"paid":true,"payment_intent":transaction_id,
            "amount_refunded":1000,"currency":"aud","metadata":{}}}
    });
    db.record_billing_event(None, &refund_id, "charge.refunded", &refund)
        .await?;
    db.project_growth_payment_payload(&refund_id, &refund)
        .await?;
    Ok(())
}

#[tokio::main]
async fn main() -> Result<()> {
    let database_url = required("DATABASE_URL")?;
    let origin = required("OMNYID_E2E_API_ORIGIN")?;
    let password = required("OMNYID_E2E_PASSWORD")?;
    let output = PathBuf::from(required("OMNYID_E2E_SEED_MANIFEST")?);
    assert_safe_database_url(&database_url)?;
    assert_safe_api_origin(&origin)?;
    if password.len() < 16 {
        bail!("OMNYID_E2E_PASSWORD must be at least 16 characters");
    }

    let paid_visit = "growpaid0001";
    let direct_visit = "growdirect01";
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(20))
        .build()?;
    ingest_visit(
        &client,
        &origin,
        paid_visit,
        "growthpaidview01",
        Some("instagram"),
        Some("paid"),
        Some("growth_pilot"),
    )
    .await?;
    ingest_visit(
        &client,
        &origin,
        direct_visit,
        "growthdirectvw01",
        None,
        None,
        None,
    )
    .await?;
    register(
        &client,
        &origin,
        OPERATOR_EMAIL,
        &password,
        Some(paid_visit),
    )
    .await?;
    register(
        &client,
        &origin,
        ORDINARY_EMAIL,
        &password,
        Some(direct_visit),
    )
    .await?;
    register(&client, &origin, PARTNER_EMAIL, &password, None).await?;

    let db = Db::new(&database_url).await?;
    let now = Utc::now();
    let paid_registered = now - Duration::days(20);
    let direct_registered = now - Duration::days(15);
    let paid_user = db
        .find_user_by_email(OPERATOR_EMAIL)
        .await?
        .context("operator account")?;
    let direct_user = db
        .find_user_by_email(ORDINARY_EMAIL)
        .await?
        .context("ordinary account")?;
    let partner_user = db
        .find_user_by_email(PARTNER_EMAIL)
        .await?
        .context("partner account")?;
    for user in [&paid_user, &direct_user, &partner_user] {
        db.mark_email_verified(&user.id).await?;
    }
    for (user_id, registered_at, visit_id) in [
        (&paid_user.id, paid_registered, paid_visit),
        (&direct_user.id, direct_registered, direct_visit),
    ] {
        sqlx::query("UPDATE users SET created_at=$2 WHERE id=$1")
            .bind(user_id)
            .bind(registered_at)
            .execute(&db.pool)
            .await?;
        sqlx::query("UPDATE wedding_site_sessions SET first_seen=$2 WHERE visit_id=$1")
            .bind(visit_id)
            .bind(registered_at)
            .execute(&db.pool)
            .await?;
        sqlx::query("UPDATE wedding_site_events SET occurred_at=$2 WHERE visit_id=$1")
            .bind(visit_id)
            .bind(registered_at)
            .execute(&db.pool)
            .await?;
        sqlx::query(
            "UPDATE growth_acquisition_touches SET first_seen=$2,expires_at=$3 WHERE visit_id=$1",
        )
        .bind(visit_id)
        .bind(registered_at)
        .bind(registered_at + Duration::days(30))
        .execute(&db.pool)
        .await?;
        sqlx::query("UPDATE growth_identity_links SET linked_at=$2,expires_at=$3 WHERE user_id=$1")
            .bind(user_id)
            .bind(registered_at)
            .bind(registered_at + Duration::days(30))
            .execute(&db.pool)
            .await?;
    }
    let paid_plan = "wedding_plan:growth-paid".to_string();
    let direct_plan = "wedding_plan:growth-direct".to_string();
    seed_plan(&db, &paid_user.id, &paid_plan, paid_registered, true).await?;
    seed_plan(&db, &direct_user.id, &direct_plan, direct_registered, false).await?;
    db.upsert_wedding_user_onboarding_state(
        &partner_user.id,
        &paid_plan,
        "growth_e2e_partner",
        "growth_e2e",
        None,
    )
    .await?;
    seed_payment(&db, &paid_user.id, &paid_plan, paid_registered).await?;

    let today = now.with_timezone(&Sydney).date_naive();
    let manifest = GrowthSeedManifest {
        schema_version: 1,
        operator_email: OPERATOR_EMAIL,
        ordinary_email: ORDINARY_EMAIL,
        partner_email: PARTNER_EMAIL,
        report_from: (today - Duration::days(29)).to_string(),
        report_through: today.to_string(),
        paid_plan_id: paid_plan,
        direct_plan_id: direct_plan,
        expected_landing_sessions: 2,
        expected_registered_weddings: 2,
        expected_activated_weddings: 2,
        expected_returned_weddings: 1,
        expected_paid_weddings: 1,
        expected_gross_minor: 4900,
        expected_refunded_minor: 1000,
    };
    fs::write(&output, serde_json::to_vec_pretty(&manifest)?)?;
    println!("seeded Growth fixtures through public measurement and registration routes");
    Ok(())
}
