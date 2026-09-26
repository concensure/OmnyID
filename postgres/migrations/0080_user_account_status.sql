ALTER TABLE users
ADD COLUMN IF NOT EXISTS account_status TEXT NOT NULL DEFAULT 'active';

ALTER TABLE users
ADD COLUMN IF NOT EXISTS account_status_reason TEXT;

UPDATE users
SET account_status = 'active'
WHERE account_status IS NULL OR btrim(account_status) = '';
