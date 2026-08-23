-- KyaPehnu Auth Schema Migration
-- Run once against your Neon DB to create auth tables.

CREATE TABLE IF NOT EXISTS kp_users (
  id            BIGSERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT,                        -- NULL for OAuth-only users
  image         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast username lookups (uniqueness checks during signup)
CREATE UNIQUE INDEX IF NOT EXISTS kp_users_username_idx ON kp_users (username);
CREATE UNIQUE INDEX IF NOT EXISTS kp_users_email_idx    ON kp_users (email);
