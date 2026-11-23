-- 0067: Finance Guardian — bank accounts and transaction ledger
-- All financial data is user-scoped and E2EE-ready (amount_cents stored in plaintext;
-- encrypt at rest via the homeserver env var OMNYID_ENCRYPT_FINANCE if required).

CREATE TABLE IF NOT EXISTS finance_accounts (
  account_id    TEXT        PRIMARY KEY,
  user_id       TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label         TEXT        NOT NULL,
  institution   TEXT,
  account_type  TEXT        NOT NULL DEFAULT 'checking',
  currency      TEXT        NOT NULL DEFAULT 'AUD',
  source        TEXT        NOT NULL DEFAULT 'manual',
  external_id   TEXT,
  masked_number TEXT,
  enabled       BOOLEAN     NOT NULL DEFAULT true,
  afp_message_id TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS finance_accounts_user_idx
  ON finance_accounts(user_id);

CREATE TABLE IF NOT EXISTS finance_transactions (
  txn_id        TEXT        PRIMARY KEY,
  user_id       TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_id    TEXT        NOT NULL REFERENCES finance_accounts(account_id) ON DELETE CASCADE,
  txn_date      DATE        NOT NULL,
  amount_cents  BIGINT      NOT NULL,
  currency      TEXT        NOT NULL DEFAULT 'AUD',
  description   TEXT        NOT NULL DEFAULT '',
  merchant_name TEXT,
  category      TEXT,
  is_anomaly    BOOLEAN     NOT NULL DEFAULT false,
  anomaly_reason TEXT,
  afp_message_id TEXT,
  metadata      JSONB       NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS finance_txn_user_date_idx
  ON finance_transactions(user_id, txn_date DESC);

CREATE INDEX IF NOT EXISTS finance_txn_account_date_idx
  ON finance_transactions(account_id, txn_date DESC);

CREATE INDEX IF NOT EXISTS finance_txn_category_idx
  ON finance_transactions(user_id, category);

CREATE INDEX IF NOT EXISTS finance_txn_anomaly_idx
  ON finance_transactions(user_id, is_anomaly)
  WHERE is_anomaly = true;
