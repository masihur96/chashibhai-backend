-- ==============================================================================
-- Module 12 — Admin Migration
-- ==============================================================================

-- Add is_banned flag to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_banned BOOLEAN DEFAULT FALSE;

-- JWT/Token Blacklist table
CREATE TABLE IF NOT EXISTS jwt_blacklist (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES profiles(id),
  token       TEXT,
  reason      TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_jwt_blacklist_user_id ON jwt_blacklist(user_id);
CREATE INDEX IF NOT EXISTS idx_profiles_is_banned ON profiles(is_banned);
CREATE INDEX IF NOT EXISTS idx_profiles_nid_verified ON profiles(nid_verified);
