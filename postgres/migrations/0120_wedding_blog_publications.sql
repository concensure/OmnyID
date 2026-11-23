-- Operator-published wedding articles live in Postgres so application source
-- deploys cannot erase them. Only sanitised fragments are stored.
CREATE TABLE IF NOT EXISTS wedding_blog_publications (
    publication_id TEXT PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
    title TEXT NOT NULL CHECK (char_length(title) BETWEEN 3 AND 140),
    summary TEXT NOT NULL CHECK (char_length(summary) BETWEEN 10 AND 320),
    category TEXT NOT NULL CHECK (category IN (
        'planning', 'budget', 'legal', 'ai-trust', 'vendors', 'etiquette', 'real-weddings'
    )),
    sanitized_html TEXT NOT NULL CHECK (octet_length(sanitized_html) BETWEEN 20 AND 262144),
    content_sha256 TEXT NOT NULL CHECK (content_sha256 ~ '^[a-f0-9]{64}$'),
    status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('draft', 'published', 'archived')),
    revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
    updated_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    published_at TIMESTAMPTZ,
    CHECK ((status = 'published') = (published_at IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_wedding_blog_publications_live
    ON wedding_blog_publications (published_at DESC)
    WHERE status = 'published';
