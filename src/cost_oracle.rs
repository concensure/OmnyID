//! cost_oracle.rs — Cost-aware orchestration engine for OmnyID.
//!
//! This module provides:
//!
//! - [`Budget`]             — hard limits on USD, API calls, LLM tokens
//! - [`ExecutionContext`]   — live budget state propagated through every run
//! - [`CostOracle`]         — shared singleton for estimation, tracking, enforcement
//! - [`ApiTierSelector`]    — picks the right API given budget pressure
//! - [`CacheEngine`]        — multi-layer in-process + DB-backed cache
//! - [`BudgetEnforcer`]     — pre-flight check + strategy downgrade decisions
//!
//! # Integration points
//!
//! 1. `MasterOrchestrator::run()` calls `CostOracle::begin_run()` before planning.
//! 2. Before each task delegation, calls `BudgetEnforcer::check()`.
//! 3. After each task, calls `CostOracle::record_cost()`.
//! 4. HTTP handler `GET /api/cost/summary` returns aggregated data.
//! 5. HTTP handler `GET /api/cost/budget` returns the user's active budget.
//! 6. HTTP handler `POST /api/cost/budget` upserts a budget config.

use chrono::Utc;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use sqlx::PgPool;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::{debug, info, warn};
use ulid::Ulid;

// ── Budget ────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Budget {
    /// Hard USD cap for the entire run
    pub max_cost_usd: f64,
    /// Hard API call cap
    pub max_api_calls: u32,
    /// Hard LLM token cap
    pub max_llm_tokens: u64,
    /// Soft limit as fraction of hard limit (0.0–1.0). Beyond this, degrade.
    pub soft_limit_ratio: f64,
}

impl Default for Budget {
    fn default() -> Self {
        Self {
            max_cost_usd: 0.10,
            max_api_calls: 20,
            max_llm_tokens: 50_000,
            soft_limit_ratio: 0.80,
        }
    }
}

impl Budget {
    pub fn soft_usd(&self) -> f64 {
        self.max_cost_usd * self.soft_limit_ratio
    }
    pub fn soft_api_calls(&self) -> u32 {
        // clamp ratio to [0,1] before cast so a misconfigured DB value can't produce > max
        let ratio = self.soft_limit_ratio.clamp(0.0, 1.0);
        (self.max_api_calls as f64 * ratio) as u32
    }
    pub fn soft_tokens(&self) -> u64 {
        let ratio = self.soft_limit_ratio.clamp(0.0, 1.0);
        (self.max_llm_tokens as f64 * ratio) as u64
    }
}

// ── Execution context ─────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ExecutionStatus {
    Active,
    Degraded,
    Halted,
    Completed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExecutionContext {
    pub run_id: String,
    pub user_id: String,
    pub workflow_id: Option<String>,
    pub budget: Budget,
    pub cost_so_far: f64,
    pub api_calls_so_far: u32,
    pub tokens_so_far: u64,
    /// Current retrieval stage (1 = cheap, 2 = moderate, 3 = expensive)
    pub current_stage: u8,
    pub status: ExecutionStatus,
}

impl ExecutionContext {
    pub fn new(
        run_id: String,
        user_id: String,
        workflow_id: Option<String>,
        budget: Budget,
    ) -> Self {
        Self {
            run_id,
            user_id,
            workflow_id,
            budget,
            cost_so_far: 0.0,
            api_calls_so_far: 0,
            tokens_so_far: 0,
            current_stage: 1,
            status: ExecutionStatus::Active,
        }
    }

    pub fn budget_status(&self) -> BudgetStatus {
        if self.cost_so_far >= self.budget.max_cost_usd
            || self.api_calls_so_far >= self.budget.max_api_calls
            || self.tokens_so_far >= self.budget.max_llm_tokens
        {
            return BudgetStatus::HardExceeded;
        }
        if self.cost_so_far >= self.budget.soft_usd()
            || self.api_calls_so_far >= self.budget.soft_api_calls()
            || self.tokens_so_far >= self.budget.soft_tokens()
        {
            return BudgetStatus::SoftExceeded;
        }
        BudgetStatus::Ok
    }

    pub fn can_afford(&self, estimated_usd: f64, estimated_tokens: u64) -> bool {
        self.cost_so_far + estimated_usd <= self.budget.max_cost_usd
            && self.tokens_so_far + estimated_tokens <= self.budget.max_llm_tokens
            // use < instead of saturating +1 to avoid u32 overflow at max_api_calls == u32::MAX
            && self.api_calls_so_far < self.budget.max_api_calls
    }

    /// Apply a cost event and update status accordingly.
    pub fn apply_cost(&mut self, usd: f64, tokens: u64, is_api_call: bool) {
        self.cost_so_far += usd;
        self.tokens_so_far = self.tokens_so_far.saturating_add(tokens);
        if is_api_call {
            self.api_calls_so_far = self.api_calls_so_far.saturating_add(1);
        }
        self.status = match self.budget_status() {
            BudgetStatus::HardExceeded => ExecutionStatus::Halted,
            BudgetStatus::SoftExceeded => ExecutionStatus::Degraded,
            BudgetStatus::Ok => ExecutionStatus::Active,
        };
    }

    /// Max retrieval stage allowed given current budget pressure.
    pub fn allowed_stage(&self) -> u8 {
        match self.budget_status() {
            BudgetStatus::HardExceeded => 1,
            BudgetStatus::SoftExceeded => 2,
            BudgetStatus::Ok => 3,
        }
    }
}

// ── Budget status ─────────────────────────────────────────────────────────────

#[derive(Debug, Clone, PartialEq)]
pub enum BudgetStatus {
    Ok,
    SoftExceeded,
    HardExceeded,
}

// ── API tier ──────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
pub enum ApiTier {
    Free = 1,      // DuckDuckGo, static data, cached LLM
    Moderate = 2,  // OpenWeather, Skyscanner basic
    Expensive = 3, // Amadeus, Booking.com, Google Maps
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApiDescriptor {
    pub name: String,
    pub tier: ApiTier,
    pub task_types: Vec<String>,
    pub cost_usd_per_call: f64,
    pub requires_key: bool,
}

/// Built-in API catalogue.
pub fn api_catalogue() -> Vec<ApiDescriptor> {
    vec![
        ApiDescriptor {
            name: "duckduckgo".into(),
            tier: ApiTier::Free,
            task_types: vec!["search".into()],
            cost_usd_per_call: 0.0,
            requires_key: false,
        },
        ApiDescriptor {
            name: "llm_cache_lookup".into(),
            tier: ApiTier::Free,
            task_types: vec!["llm".into(), "reasoning".into()],
            cost_usd_per_call: 0.0001,
            requires_key: false,
        },
        ApiDescriptor {
            name: "static_knowledge".into(),
            tier: ApiTier::Free,
            task_types: vec!["facts".into(), "definitions".into()],
            cost_usd_per_call: 0.0,
            requires_key: false,
        },
        ApiDescriptor {
            name: "openweather_free".into(),
            tier: ApiTier::Moderate,
            task_types: vec!["weather".into()],
            cost_usd_per_call: 0.0001,
            requires_key: true,
        },
        ApiDescriptor {
            name: "skyscanner_basic".into(),
            tier: ApiTier::Moderate,
            task_types: vec!["flights".into()],
            cost_usd_per_call: 0.001,
            requires_key: true,
        },
        ApiDescriptor {
            name: "openweather_pro".into(),
            tier: ApiTier::Moderate,
            task_types: vec!["weather".into()],
            cost_usd_per_call: 0.0005,
            requires_key: true,
        },
        ApiDescriptor {
            name: "amadeus_search".into(),
            tier: ApiTier::Expensive,
            task_types: vec!["flights".into(), "booking".into()],
            cost_usd_per_call: 0.005,
            requires_key: true,
        },
        ApiDescriptor {
            name: "booking_com".into(),
            tier: ApiTier::Expensive,
            task_types: vec!["accommodation".into()],
            cost_usd_per_call: 0.003,
            requires_key: true,
        },
        ApiDescriptor {
            name: "google_maps".into(),
            tier: ApiTier::Expensive,
            task_types: vec!["map".into(), "activities".into()],
            cost_usd_per_call: 0.002,
            requires_key: true,
        },
    ]
}

// ── API tier selector ─────────────────────────────────────────────────────────

pub struct ApiTierSelector {
    catalogue: Vec<ApiDescriptor>,
}

impl ApiTierSelector {
    pub fn new() -> Self {
        Self {
            catalogue: api_catalogue(),
        }
    }

    /// Select the best (highest quality within budget) API for a task type.
    pub fn select(&self, task_type: &str, ctx: &ExecutionContext) -> Option<&ApiDescriptor> {
        let max_tier = match ctx.budget_status() {
            BudgetStatus::HardExceeded => ApiTier::Free,
            BudgetStatus::SoftExceeded => ApiTier::Moderate,
            BudgetStatus::Ok => ApiTier::Expensive,
        };

        // Best = highest tier ≤ max_tier that handles this task type
        self.catalogue
            .iter()
            .filter(|a| a.task_types.iter().any(|t| t == task_type) && a.tier <= max_tier)
            .max_by_key(|a| a.tier as u8)
    }

    pub fn estimate_cost(&self, task_type: &str, ctx: &ExecutionContext) -> f64 {
        self.select(task_type, ctx)
            .map(|a| a.cost_usd_per_call)
            .unwrap_or(0.0)
    }
}

impl Default for ApiTierSelector {
    fn default() -> Self {
        Self::new()
    }
}

// ── Downgrade strategy ────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum DowngradeAction {
    UseCache { cache_key: String },
    UseEstimate { card_type: String },
    SkipCard { card_type: String },
    ReduceTokens { new_max_tokens: u64 },
    DelayNode { node_id: String, delay_ms: u64 },
    UseTier { tier: u8 },
}

pub fn compute_downgrade(
    ctx: &ExecutionContext,
    card_type: &str,
    estimated_usd: f64,
) -> DowngradeAction {
    let expensive_cards = ["flights", "accommodation", "booking"];
    let stage3_cards = expensive_cards;

    match ctx.budget_status() {
        BudgetStatus::HardExceeded => {
            if stage3_cards.contains(&card_type) {
                DowngradeAction::SkipCard {
                    card_type: card_type.to_string(),
                }
            } else {
                DowngradeAction::UseTier { tier: 1 }
            }
        }
        _ if ctx.cost_so_far + estimated_usd > ctx.budget.max_cost_usd => {
            if stage3_cards.contains(&card_type) {
                DowngradeAction::UseEstimate {
                    card_type: card_type.to_string(),
                }
            } else {
                DowngradeAction::UseTier { tier: 2 }
            }
        }
        _ => DowngradeAction::UseTier {
            tier: ctx.allowed_stage(),
        },
    }
}

// ── Budget enforcer ───────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PreflightResult {
    pub allowed: bool,
    pub reason: Option<String>,
    pub downgrade: Option<DowngradeAction>,
    pub effective_tier: u8,
}

pub struct BudgetEnforcer {}

impl BudgetEnforcer {
    pub fn new() -> Self {
        Self {}
    }

    /// Pre-flight check before executing a node/task.
    pub fn check(
        &self,
        ctx: &ExecutionContext,
        task_type: &str,
        card_type: Option<&str>,
        estimated_usd: f64,
    ) -> PreflightResult {
        match ctx.budget_status() {
            BudgetStatus::HardExceeded => {
                warn!(
                    "run_id={} hard budget exceeded; blocking task={}",
                    ctx.run_id, task_type
                );
                PreflightResult {
                    allowed: false,
                    reason: Some("Hard budget limit exceeded".into()),
                    downgrade: card_type.map(|c| DowngradeAction::SkipCard {
                        card_type: c.to_string(),
                    }),
                    effective_tier: 1,
                }
            }
            BudgetStatus::SoftExceeded => {
                let downgrade = card_type.map(|c| compute_downgrade(ctx, c, estimated_usd));
                warn!(
                    "run_id={} soft budget exceeded; degrading task={}",
                    ctx.run_id, task_type
                );
                PreflightResult {
                    allowed: true,
                    reason: Some("Soft budget limit — degraded mode".into()),
                    downgrade,
                    effective_tier: 2,
                }
            }
            BudgetStatus::Ok => {
                debug!("run_id={} budget ok; task={}", ctx.run_id, task_type);
                PreflightResult {
                    allowed: true,
                    reason: None,
                    downgrade: None,
                    effective_tier: ctx.allowed_stage(),
                }
            }
        }
    }
}

impl Default for BudgetEnforcer {
    fn default() -> Self {
        Self::new()
    }
}

// ── In-process cache (L3 — session-scoped) ────────────────────────────────────

#[derive(Debug, Clone)]
struct CacheEntry {
    data: serde_json::Value,
    expires_at: i64, // Unix timestamp seconds
}

/// Multi-layer cache.
///
/// - L3 (session) — in-process `HashMap`, evicted when run completes.
///   Keyed by `{run_id}:{cache_key}`.
/// - L1/L2 (global / user) — PostgreSQL-backed (cache_entries + user_cache_entries).
///   Read-through and write-through via async helpers.
pub struct CacheEngine {
    /// In-process session cache
    session: Arc<RwLock<HashMap<String, CacheEntry>>>,
    db: PgPool,
}

impl CacheEngine {
    pub fn new(db: PgPool) -> Self {
        Self {
            session: Arc::new(RwLock::new(HashMap::new())),
            db,
        }
    }

    // ── Session cache (L3) ────────────────────────────────────────────────────

    pub async fn session_get(&self, run_id: &str, key: &str) -> Option<serde_json::Value> {
        let k = format!("{run_id}:{key}");
        let guard = self.session.read().await;
        let entry = guard.get(&k)?;
        let now = Utc::now().timestamp();
        if entry.expires_at < now {
            return None;
        }
        Some(entry.data.clone())
    }

    pub async fn session_set(
        &self,
        run_id: &str,
        key: &str,
        data: serde_json::Value,
        ttl_secs: i64,
    ) {
        let k = format!("{run_id}:{key}");
        let expires_at = Utc::now().timestamp() + ttl_secs;
        let mut guard = self.session.write().await;
        guard.insert(k, CacheEntry { data, expires_at });
    }

    pub async fn session_evict_run(&self, run_id: &str) {
        let prefix = format!("{run_id}:");
        let mut guard = self.session.write().await;
        guard.retain(|k, _| !k.starts_with(&prefix));
    }

    // ── Global cache (L1) — PostgreSQL ────────────────────────────────────────

    pub async fn global_get(&self, cache_key: &str) -> Option<serde_json::Value> {
        // GAP-112: use a plain SELECT to avoid row-level write locks on reads.
        // The hit_count increment runs fire-and-forget in the background.
        use sqlx::Row;
        let row = sqlx::query(
            r#"SELECT data FROM cache_entries
                WHERE cache_key = $1 AND expires_at > now()"#,
        )
        .bind(cache_key)
        .fetch_optional(&self.db)
        .await
        .ok()??;
        let data = row.try_get::<serde_json::Value, _>("data").ok()?;

        let db = self.db.clone();
        let key = cache_key.to_string();
        tokio::spawn(async move {
            let _ = sqlx::query(
                "UPDATE cache_entries SET hit_count = hit_count + 1, last_hit_at = now() \
                 WHERE cache_key = $1",
            )
            .bind(&key)
            .execute(&db)
            .await;
        });

        Some(data)
    }

    pub async fn global_set(
        &self,
        cache_key: &str,
        data: &serde_json::Value,
        data_type: &str,
        stage: i16,
        ttl_secs: i64,
        cost_saved: f64,
    ) {
        let expires_at = (Utc::now() + chrono::Duration::seconds(ttl_secs)).to_rfc3339();
        let _ = sqlx::query(
            r#"INSERT INTO cache_entries
                      (cache_key, data, data_type, stage, expires_at, cost_usd_saved)
               VALUES ($1, $2, $3, $4, $5::TIMESTAMPTZ, $6)
               ON CONFLICT (cache_key) DO UPDATE
                  SET data           = EXCLUDED.data,
                      expires_at     = EXCLUDED.expires_at,
                      cost_usd_saved = cache_entries.cost_usd_saved + EXCLUDED.cost_usd_saved"#,
        )
        .bind(cache_key)
        .bind(data)
        .bind(data_type)
        .bind(stage)
        .bind(&expires_at)
        .bind(cost_saved)
        .execute(&self.db)
        .await;
    }

    // ── User cache (L2) — PostgreSQL ──────────────────────────────────────────

    pub async fn user_get(&self, user_id: &str, cache_key: &str) -> Option<serde_json::Value> {
        // GAP-112: plain SELECT to avoid write-lock contention on hot cache rows.
        let row = sqlx::query(
            r#"SELECT data FROM user_cache_entries
                WHERE user_id = $1 AND cache_key = $2 AND expires_at > now()"#,
        )
        .bind(user_id)
        .bind(cache_key)
        .fetch_optional(&self.db)
        .await
        .ok()??;

        use sqlx::Row;
        let data = row.try_get::<serde_json::Value, _>("data").ok()?;

        let db = self.db.clone();
        let uid = user_id.to_string();
        let key = cache_key.to_string();
        tokio::spawn(async move {
            let _ = sqlx::query(
                "UPDATE user_cache_entries SET hit_count = hit_count + 1 \
                 WHERE user_id = $1 AND cache_key = $2",
            )
            .bind(&uid)
            .bind(&key)
            .execute(&db)
            .await;
        });

        Some(data)
    }

    pub async fn user_set(
        &self,
        user_id: &str,
        cache_key: &str,
        data: &serde_json::Value,
        data_type: &str,
        stage: i16,
        ttl_secs: i64,
    ) {
        let expires_at = (Utc::now() + chrono::Duration::seconds(ttl_secs)).to_rfc3339();
        let _ = sqlx::query(
            r#"INSERT INTO user_cache_entries
                      (user_id, cache_key, data, data_type, stage, expires_at)
               VALUES ($1, $2, $3, $4, $5, $6::TIMESTAMPTZ)
               ON CONFLICT (user_id, cache_key) DO UPDATE
                  SET data       = EXCLUDED.data,
                      expires_at = EXCLUDED.expires_at"#,
        )
        .bind(user_id)
        .bind(cache_key)
        .bind(data)
        .bind(data_type)
        .bind(stage)
        .bind(&expires_at)
        .execute(&self.db)
        .await;
    }

    // ── Multi-layer read-through ──────────────────────────────────────────────

    /// Try session → global (L1) → user (L2), in that order.
    pub async fn get_any(
        &self,
        run_id: &str,
        user_id: &str,
        cache_key: &str,
    ) -> Option<(serde_json::Value, &'static str)> {
        if let Some(v) = self.session_get(run_id, cache_key).await {
            return Some((v, "session_cache"));
        }
        if let Some(v) = self.global_get(cache_key).await {
            return Some((v, "l1_cache"));
        }
        if let Some(v) = self.user_get(user_id, cache_key).await {
            return Some((v, "l2_cache"));
        }
        None
    }
}

// ── Cache key builder ─────────────────────────────────────────────────────────

/// Deterministic SHA-256 cache key from a JSON-serializable parameters map.
pub fn build_cache_key(params: &serde_json::Value) -> String {
    // Sort keys for determinism by serialising as a BTreeMap
    let canonical = match params.as_object() {
        Some(m) => {
            let sorted: std::collections::BTreeMap<_, _> = m.iter().collect();
            serde_json::to_string(&sorted).unwrap_or_default()
        }
        None => serde_json::to_string(params).unwrap_or_default(),
    };
    let hash = Sha256::digest(canonical.as_bytes());
    hex::encode(hash)
}

// ── Cost record ───────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CostRecord {
    pub user_id: String,
    pub workflow_id: Option<String>,
    pub run_id: Option<String>,
    pub node_id: Option<String>,
    pub card_type: Option<String>,
    pub cost_usd: f64,
    pub cost_type: CostType,
    pub api_tier: u8,
    pub tokens_used: Option<u64>,
    pub source: Option<String>,
    pub stage: Option<u8>,
    pub metadata: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CostType {
    Llm,
    Api,
    CacheMiss,
    Embedding,
}

impl CostType {
    fn as_str(&self) -> &str {
        match self {
            CostType::Llm => "llm",
            CostType::Api => "api",
            CostType::CacheMiss => "cache_miss",
            CostType::Embedding => "embedding",
        }
    }
}

// ── CostOracle — main entry point ─────────────────────────────────────────────

/// Shared singleton for cost tracking and budget enforcement.
pub struct CostOracle {
    db: PgPool,
    cache: CacheEngine,
    enforcer: BudgetEnforcer,
    selector: ApiTierSelector,
    /// In-process run registry: run_id → ExecutionContext
    runs: Arc<RwLock<HashMap<String, ExecutionContext>>>,
}

impl CostOracle {
    pub fn new(db: PgPool) -> Self {
        let cache = CacheEngine::new(db.clone());
        Self {
            db,
            cache,
            enforcer: BudgetEnforcer::new(),
            selector: ApiTierSelector::new(),
            runs: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    pub fn cache(&self) -> &CacheEngine {
        &self.cache
    }

    // ── Run lifecycle ─────────────────────────────────────────────────────────

    /// Begin a new run — load per-user budget from DB (or global default).
    pub async fn begin_run(
        &self,
        run_id: &str,
        user_id: &str,
        workflow_id: Option<&str>,
    ) -> ExecutionContext {
        let budget = self.load_budget(user_id).await;
        let ctx = ExecutionContext::new(
            run_id.to_string(),
            user_id.to_string(),
            workflow_id.map(|s| s.to_string()),
            budget.clone(),
        );

        // Persist to execution_contexts table
        let _ = sqlx::query(
            r#"INSERT INTO execution_contexts
                      (run_id, user_id, workflow_id, budget_usd, budget_api_calls, budget_tokens)
               VALUES ($1, $2, $3, $4, $5, $6)
               ON CONFLICT (run_id) DO NOTHING"#,
        )
        .bind(run_id)
        .bind(user_id)
        .bind(workflow_id)
        .bind(budget.max_cost_usd)
        .bind(budget.max_api_calls as i32)
        .bind(budget.max_llm_tokens as i64)
        .execute(&self.db)
        .await;

        let mut guard = self.runs.write().await;
        guard.insert(run_id.to_string(), ctx.clone());
        info!(
            "CostOracle: began run={} user={} budget_usd={}",
            run_id, user_id, budget.max_cost_usd
        );
        ctx
    }

    /// Complete a run — persist final state and evict from in-process registry.
    pub async fn complete_run(&self, run_id: &str) {
        let _ = sqlx::query(
            "UPDATE execution_contexts SET status = 'completed', completed_at = now() WHERE run_id = $1",
        )
        .bind(run_id)
        .execute(&self.db)
        .await;

        self.cache.session_evict_run(run_id).await;
        let mut guard = self.runs.write().await;
        guard.remove(run_id);
        info!("CostOracle: completed run={}", run_id);
    }

    // ── Budget loading ────────────────────────────────────────────────────────

    async fn load_budget(&self, user_id: &str) -> Budget {
        use sqlx::Row;
        let row = sqlx::query(
            r#"SELECT max_cost_usd, max_api_calls, max_llm_tokens, soft_limit_ratio
                 FROM budget_configs
                WHERE user_id = $1 OR user_id IS NULL
                ORDER BY user_id NULLS LAST
                LIMIT 1"#,
        )
        .bind(user_id)
        .fetch_optional(&self.db)
        .await
        .ok()
        .flatten();

        if let Some(r) = row {
            Budget {
                max_cost_usd: r.try_get::<f64, _>("max_cost_usd").unwrap_or(0.10),
                max_api_calls: r.try_get::<i32, _>("max_api_calls").unwrap_or(20) as u32,
                max_llm_tokens: r.try_get::<i64, _>("max_llm_tokens").unwrap_or(50_000) as u64,
                soft_limit_ratio: r.try_get::<f64, _>("soft_limit_ratio").unwrap_or(0.80),
            }
        } else {
            Budget::default()
        }
    }

    // ── Cost recording ────────────────────────────────────────────────────────

    /// Record a cost event and update the in-process ExecutionContext.
    pub async fn record_cost(&self, record: CostRecord) -> ExecutionContext {
        // Write to DB
        let id = Ulid::new().to_string();
        let stage = record.stage.map(|s| s as i16);
        let tokens = record.tokens_used.map(|t| t as i64);
        let tier = record.api_tier as i16;
        let _ = sqlx::query(
            r#"INSERT INTO cost_records
                      (id, user_id, workflow_id, run_id, node_id, card_type,
                       cost_usd, cost_type, api_tier, tokens_used, source, stage, metadata)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)"#,
        )
        .bind(&id)
        .bind(&record.user_id)
        .bind(&record.workflow_id)
        .bind(&record.run_id)
        .bind(&record.node_id)
        .bind(&record.card_type)
        .bind(record.cost_usd)
        .bind(record.cost_type.as_str())
        .bind(tier)
        .bind(tokens)
        .bind(&record.source)
        .bind(stage)
        .bind(&record.metadata)
        .execute(&self.db)
        .await;

        // Update in-process context
        let run_id = record.run_id.as_deref().unwrap_or("");
        let mut guard = self.runs.write().await;
        if let Some(ctx) = guard.get_mut(run_id) {
            let is_api = matches!(record.cost_type, CostType::Api);
            ctx.apply_cost(record.cost_usd, record.tokens_used.unwrap_or(0), is_api);

            // Persist updated totals to DB
            let _ = sqlx::query(
                r#"UPDATE execution_contexts
                      SET spent_usd       = $1,
                          spent_api_calls = $2,
                          spent_tokens    = $3,
                          current_stage   = $4,
                          status = CASE
                            WHEN $1 >= budget_usd   OR $2 >= budget_api_calls OR $3 >= budget_tokens
                              THEN 'halted'
                            WHEN $1 >= budget_usd * soft_limit_ratio
                              THEN 'degraded'
                            ELSE 'active'
                          END
                    WHERE run_id = $5"#,
            )
            .bind(ctx.cost_so_far)
            .bind(ctx.api_calls_so_far as i32)
            .bind(ctx.tokens_so_far as i64)
            .bind(ctx.current_stage as i16)
            .bind(run_id)
            .execute(&self.db)
            .await;

            ctx.clone()
        } else {
            // Run not in cache — construct minimal context
            ExecutionContext::new(
                run_id.to_string(),
                record.user_id,
                record.workflow_id,
                Budget::default(),
            )
        }
    }

    // ── Pre-flight check ──────────────────────────────────────────────────────

    pub async fn preflight(
        &self,
        run_id: &str,
        task_type: &str,
        card_type: Option<&str>,
        estimated_usd: f64,
    ) -> PreflightResult {
        let guard = self.runs.read().await;
        if let Some(ctx) = guard.get(run_id) {
            self.enforcer
                .check(ctx, task_type, card_type, estimated_usd)
        } else {
            // No context found — allow by default (defensive)
            PreflightResult {
                allowed: true,
                reason: Some("No execution context found — allowing by default".into()),
                downgrade: None,
                effective_tier: 3,
            }
        }
    }

    /// Get the current ExecutionContext for a run (if active).
    pub async fn get_context(&self, run_id: &str) -> Option<ExecutionContext> {
        let guard = self.runs.read().await;
        guard.get(run_id).cloned()
    }

    // ── Aggregation queries ───────────────────────────────────────────────────

    pub async fn cost_summary_for_user(&self, user_id: &str) -> serde_json::Value {
        use sqlx::Row;
        let row = sqlx::query(
            r#"SELECT
                   COALESCE(SUM(cost_usd), 0)    AS total_usd,
                   COALESCE(SUM(tokens_used), 0) AS total_tokens,
                   COUNT(*)                       AS event_count,
                   COUNT(DISTINCT run_id)         AS run_count
                 FROM cost_records WHERE user_id = $1"#,
        )
        .bind(user_id)
        .fetch_optional(&self.db)
        .await
        .ok()
        .flatten();

        match row {
            Some(r) => serde_json::json!({
                "user_id":      user_id,
                "total_usd":    r.try_get::<f64, _>("total_usd").unwrap_or(0.0),
                "total_tokens": r.try_get::<i64, _>("total_tokens").unwrap_or(0),
                "event_count":  r.try_get::<i64, _>("event_count").unwrap_or(0),
                "run_count":    r.try_get::<i64, _>("run_count").unwrap_or(0),
            }),
            None => serde_json::json!({ "user_id": user_id, "total_usd": 0 }),
        }
    }

    pub async fn active_budget_for_user(&self, user_id: &str) -> serde_json::Value {
        let budget = self.load_budget(user_id).await;
        serde_json::json!({
            "user_id":        user_id,
            "max_cost_usd":   budget.max_cost_usd,
            "max_api_calls":  budget.max_api_calls,
            "max_llm_tokens": budget.max_llm_tokens,
            "soft_limit_ratio": budget.soft_limit_ratio,
        })
    }

    /// Estimate the cost of executing a specific API task given the run's
    /// current budget status.
    pub async fn estimate_task_cost(&self, run_id: &str, task_type: &str) -> f64 {
        let guard = self.runs.read().await;
        if let Some(ctx) = guard.get(run_id) {
            self.selector.estimate_cost(task_type, ctx)
        } else {
            0.0
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn default_budget() -> Budget {
        Budget::default()
    }

    fn ctx_with_status(status: BudgetStatus) -> ExecutionContext {
        let budget = default_budget();
        let mut ctx = ExecutionContext::new(
            "run-1".to_string(),
            "user-1".to_string(),
            None,
            budget.clone(),
        );

        match status {
            BudgetStatus::Ok => {
                ctx.cost_so_far = 0.0;
                ctx.api_calls_so_far = 0;
                ctx.tokens_so_far = 0;
            }
            BudgetStatus::SoftExceeded => {
                ctx.cost_so_far = budget.soft_usd();
            }
            BudgetStatus::HardExceeded => {
                ctx.cost_so_far = budget.max_cost_usd;
            }
        }

        ctx
    }

    #[test]
    fn api_tier_selector_caps_expensive_tasks_when_budget_is_soft_exceeded() {
        let selector = ApiTierSelector::new();
        let ctx = ctx_with_status(BudgetStatus::SoftExceeded);

        let selected = selector
            .select("flights", &ctx)
            .expect("soft-exceeded budget should still allow a moderate flight API");

        assert_eq!(selected.name, "skyscanner_basic");
        assert_eq!(selected.tier, ApiTier::Moderate);
    }

    #[test]
    fn budget_enforcer_blocks_expensive_cards_when_budget_is_hard_exceeded() {
        let enforcer = BudgetEnforcer::new();
        let ctx = ctx_with_status(BudgetStatus::HardExceeded);

        let result = enforcer.check(&ctx, "flights", Some("flights"), 0.01);

        assert!(!result.allowed);
        assert_eq!(result.effective_tier, 1);
        assert!(matches!(
            result.downgrade,
            Some(DowngradeAction::SkipCard { ref card_type }) if card_type == "flights"
        ));
    }

    #[test]
    fn budget_enforcer_uses_estimate_for_expensive_cards_in_soft_mode() {
        let enforcer = BudgetEnforcer::new();
        let ctx = ctx_with_status(BudgetStatus::SoftExceeded);

        let result = enforcer.check(&ctx, "flights", Some("flights"), 0.03);

        assert!(result.allowed);
        assert_eq!(result.effective_tier, 2);
        assert!(matches!(
            result.downgrade,
            Some(DowngradeAction::UseEstimate { ref card_type }) if card_type == "flights"
        ));
    }
}
