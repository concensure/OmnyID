-- Rebuildable, content-free Wedding payment projection over signed billing_events.
CREATE TABLE IF NOT EXISTS growth_payment_events (
    stripe_event_id TEXT PRIMARY KEY
        REFERENCES billing_events(stripe_event_id) ON DELETE CASCADE,
    event_kind TEXT NOT NULL CHECK (event_kind IN ('success', 'refund')),
    owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    wedding_plan_id TEXT NOT NULL,
    stripe_transaction_id TEXT NOT NULL,
    amount_minor BIGINT NOT NULL CHECK (amount_minor >= 0),
    tax_minor BIGINT,
    currency TEXT NOT NULL CHECK (currency ~ '^[a-z]{3}$'),
    stripe_price_id TEXT NOT NULL CHECK (stripe_price_id LIKE 'price\_%'),
    product_key TEXT NOT NULL CHECK (product_key = 'omnyid_wedding'),
    occurred_at TIMESTAMPTZ NOT NULL,
    definition_version TEXT NOT NULL CHECK (definition_version = 'payment-v1'),
    CHECK (tax_minor IS NULL OR tax_minor >= 0)
);

CREATE TABLE IF NOT EXISTS growth_payment_transactions (
    stripe_transaction_id TEXT PRIMARY KEY,
    owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    wedding_plan_id TEXT NOT NULL,
    success_event_id TEXT NOT NULL UNIQUE
        REFERENCES growth_payment_events(stripe_event_id) ON DELETE CASCADE,
    gross_minor BIGINT NOT NULL CHECK (gross_minor > 0),
    tax_minor BIGINT,
    refunded_minor BIGINT NOT NULL DEFAULT 0 CHECK (refunded_minor >= 0),
    currency TEXT NOT NULL CHECK (currency ~ '^[a-z]{3}$'),
    stripe_price_id TEXT NOT NULL CHECK (stripe_price_id LIKE 'price\_%'),
    product_key TEXT NOT NULL CHECK (product_key = 'omnyid_wedding'),
    paid_at TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL DEFAULT 'paid'
        CHECK (status IN ('paid', 'partially_refunded', 'refunded')),
    definition_version TEXT NOT NULL CHECK (definition_version = 'payment-v1'),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (tax_minor IS NULL OR tax_minor >= 0),
    CHECK (refunded_minor <= gross_minor)
);

CREATE INDEX IF NOT EXISTS idx_growth_payment_transactions_wedding
    ON growth_payment_transactions (owner_user_id, wedding_plan_id, paid_at);
CREATE INDEX IF NOT EXISTS idx_growth_payment_events_transaction
    ON growth_payment_events (stripe_transaction_id, occurred_at);

CREATE TABLE IF NOT EXISTS growth_variable_cost_revisions (
    id BIGSERIAL PRIMARY KEY,
    effective_from TIMESTAMPTZ NOT NULL,
    currency TEXT NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
    payment_fixed_minor BIGINT,
    payment_rate_basis_points INTEGER,
    service_cost_minor BIGINT,
    reason TEXT NOT NULL CHECK (length(reason) BETWEEN 1 AND 500),
    created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (payment_fixed_minor IS NULL OR payment_fixed_minor >= 0),
    CHECK (payment_rate_basis_points IS NULL OR payment_rate_basis_points BETWEEN 0 AND 10000),
    CHECK (service_cost_minor IS NULL OR service_cost_minor >= 0),
    UNIQUE (effective_from, currency)
);

CREATE VIEW growth_wedding_payment_summary AS
SELECT
    tx.owner_user_id,
    tx.wedding_plan_id,
    MIN(tx.paid_at) AS first_paid_at,
    MIN(u.created_at) AS registered_at,
    MIN(u.created_at) + INTERVAL '30 days' AS maturity_at,
    NOW() >= MIN(u.created_at) + INTERVAL '30 days' AS is_30_day_mature,
    MIN(tx.paid_at) <= MIN(u.created_at) + INTERVAL '30 days'
        AS first_purchase_within_30_days,
    COUNT(*) AS transaction_count,
    SUM(tx.gross_minor) AS gross_minor,
    SUM(tx.refunded_minor) AS refunded_minor,
    SUM(tx.gross_minor - tx.refunded_minor) AS net_before_tax_minor,
    BOOL_OR(tx.status IN ('paid', 'partially_refunded')) AS currently_paid
FROM growth_payment_transactions tx
JOIN users u ON u.id = tx.owner_user_id
GROUP BY tx.owner_user_id, tx.wedding_plan_id;

REVOKE ALL ON growth_payment_events FROM PUBLIC;
REVOKE ALL ON growth_payment_transactions FROM PUBLIC;
REVOKE ALL ON growth_variable_cost_revisions FROM PUBLIC;
REVOKE ALL ON growth_wedding_payment_summary FROM PUBLIC;
