use anyhow::{Context, Result, bail};
use chrono::{Duration, Utc};
use omnyid_homeserver::db::{Db, UserRecord};
use serde::Serialize;
use serde_json::{Value, json};
use std::{collections::BTreeMap, env, fs, path::PathBuf};
use ulid::Ulid;

const ACCOUNTS: [(&str, &str); 5] = [
    ("mia@omnyid.test", "Mia Test"),
    ("jordan@omnyid.test", "Jordan Test"),
    ("priya@omnyid.test", "Priya Test"),
    ("sam@omnyid.test", "Sam Test"),
    ("alex@omnyid.test", "Alex Test"),
];

#[derive(Serialize)]
struct CoupleFixture {
    owner_email: String,
    owner_user_id: String,
    partner_email: String,
    plan_id: String,
    workspace_id: String,
    catering_household_id: String,
    private_household_id: String,
    catering_person_id: String,
    draft_request_id: String,
}

#[derive(Serialize)]
struct SeedManifest {
    schema_version: u8,
    accounts: BTreeMap<String, String>,
    couples: BTreeMap<String, CoupleFixture>,
    delegate_owner_allowlist: Vec<String>,
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

async fn register(
    client: &reqwest::Client,
    origin: &str,
    email: &str,
    name: &str,
    password: &str,
) -> Result<()> {
    if !email.ends_with("@omnyid.test") {
        bail!("only synthetic @omnyid.test accounts are allowed");
    }
    let response = client
        .post(format!("{origin}/auth/register"))
        .json(
            &json!({"email":email,"password":password,"display_name":name,"source":"wedding_e2e"}),
        )
        .send()
        .await
        .with_context(|| format!("register {email}"))?;
    if !response.status().is_success() {
        bail!("registration route rejected {email}: {}", response.status());
    }
    Ok(())
}

async fn append_fixture(
    db: &Db,
    schema: &str,
    kind: &str,
    plan: &str,
    workspace: &str,
    content: Value,
) -> Result<()> {
    let table = format!("\"{schema}\".messages");
    let query = format!(
        "INSERT INTO {table} (id,thread_id,from_agent,to_agents,timestamp,type,kind,subtype,content,signature,store_in_relational,metadata,\"references\",supertags) VALUES ($1,$2,'test://wedding-full-account',$3,NOW(),'ledger',$4,$4,$5,'test',TRUE,$6,'[]'::jsonb,$7)"
    );
    sqlx::query(&query)
        .bind(Ulid::new().to_string())
        .bind(format!("wedding_boundary:{workspace}"))
        .bind(json!(["agent://wedding-planning"]))
        .bind(kind)
        .bind(content)
        .bind(json!({"weddingPlanId":plan,"responseWorkspaceId":workspace,"test_fixture":true}))
        .bind(vec![
            "template:wedding_planner",
            "wedding_boundary",
            "e2e_fixture",
        ])
        .execute(&db.pool)
        .await?;
    Ok(())
}

async fn seed_couple(
    db: &Db,
    owner: &UserRecord,
    key: &str,
    partner_email: &str,
) -> Result<CoupleFixture> {
    let schema = db.ensure_user_private_schema(&owner.id).await?;
    let plan = format!("e2e-{key}-plan");
    let workspace = format!("e2e-{key}-workspace");
    let catering_household = format!("e2e-{key}-catering-household");
    let private_household = format!("e2e-{key}-private-household");
    let catering_person = format!("e2e-{key}-catering-person");
    let private_person = format!("e2e-{key}-private-person");
    let request = format!("e2e-{key}-draft-request");
    let deadline = (Utc::now() + Duration::days(14)).to_rfc3339();

    for (household, label, person) in [
        (
            &catering_household,
            "Catering coordination",
            &catering_person,
        ),
        (&private_household, "Private family", &private_person),
    ] {
        append_fixture(
            db,
            &schema,
            "wedding_boundary_household",
            &plan,
            &workspace,
            json!({
                "ledger_kind":"wedding_boundary_household","boundary_object_id":household,
                "household_id":household,"display_name":label,"title":label,"status":"active",
                "member_person_ids":[person],"invitation_allocation":2,"request_deadline":deadline,
                "request_window_status":"open","revision":1
            }),
        )
        .await?;
        append_fixture(db, &schema, "wedding_boundary_guest_profile", &plan, &workspace, json!({
            "ledger_kind":"wedding_boundary_guest_profile","boundary_object_id":person,
            "person_id":person,"display_name":format!("{label} contact"),"title":format!("{label} contact"),
            "status":"active","household_id":household,"dietary_note":"must stay private"
        })).await?;
        append_fixture(db, &schema, "wedding_boundary_event_invitation", &plan, &workspace, json!({
            "ledger_kind":"wedding_boundary_event_invitation","boundary_object_id":format!("invite-{person}"),
            "invitation_id":format!("invite-{person}"),"event_id":format!("event-{workspace}"),
            "person_id":person,"invitation_status":"not_invited","plus_one_allowed":false,
            "response_revision":1
        })).await?;
    }
    append_fixture(
        db,
        &schema,
        "wedding_boundary_change_request",
        &plan,
        &workspace,
        json!({
            "ledger_kind":"wedding_boundary_change_request","boundary_object_id":request,
            "request_id":request,"title":"Draft catering guest change","requested_by":"couple",
            "change_type":"plus_one_change","target_household_id":catering_household,
            "target_person_id":catering_person,"proposed_plus_one_allowed":true,
            "request_status":"draft","status":"draft","approval_required":false,
            "approval_gate_recorded":false,"revision":1,"visibility":"couple_only"
        }),
    )
    .await?;

    Ok(CoupleFixture {
        owner_email: owner.email.clone(),
        owner_user_id: owner.id.clone(),
        partner_email: partner_email.to_string(),
        plan_id: plan,
        workspace_id: workspace,
        catering_household_id: catering_household,
        private_household_id: private_household,
        catering_person_id: catering_person,
        draft_request_id: request,
    })
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

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(20))
        .build()?;
    for (email, name) in ACCOUNTS {
        register(&client, &origin, email, name, &password).await?;
    }

    let db = Db::new(&database_url).await?;
    let mut accounts = BTreeMap::new();
    let mut users = BTreeMap::new();
    for (email, _) in ACCOUNTS {
        let user = db
            .find_user_by_email(email)
            .await?
            .with_context(|| format!("missing registered account {email}"))?;
        db.mark_email_verified(&user.id).await?;
        db.ensure_user_private_schema(&user.id).await?;
        accounts.insert(email.to_string(), user.id.clone());
        users.insert(email.to_string(), user);
    }
    let mia = users.get("mia@omnyid.test").expect("mia account");
    let priya = users.get("priya@omnyid.test").expect("priya account");
    let mut couples = BTreeMap::new();
    couples.insert(
        "mia_jordan".into(),
        seed_couple(&db, mia, "mia-jordan", "jordan@omnyid.test").await?,
    );
    couples.insert(
        "priya_sam".into(),
        seed_couple(&db, priya, "priya-sam", "sam@omnyid.test").await?,
    );
    let manifest = SeedManifest {
        schema_version: 1,
        accounts,
        couples,
        delegate_owner_allowlist: vec![mia.id.clone(), priya.id.clone()],
    };
    fs::write(&output, serde_json::to_vec_pretty(&manifest)?)
        .with_context(|| format!("write {}", output.display()))?;
    println!(
        "seeded {} synthetic accounts through /auth/register",
        ACCOUNTS.len()
    );
    Ok(())
}
