-- Migration 0052: content_preview column on public messages table
--
-- Adds a short plaintext preview (≤ 220 chars) extracted at ingest time
-- from unencrypted AFP messages. Used for metadata-first filtering without
-- requiring full decryption. E2EE messages always have NULL here.

ALTER TABLE messages
    ADD COLUMN IF NOT EXISTS content_preview TEXT;

COMMENT ON COLUMN messages.content_preview IS
    'Short plaintext excerpt (≤ 220 chars) for metadata-first search. '
    'NULL for E2EE messages — content is never leaked from ciphertext-only storage.';
