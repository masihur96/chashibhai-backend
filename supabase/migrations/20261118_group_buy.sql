-- ==============================================================================
-- Module 9 — Group Buy Migration
-- Tables: buying_groups, group_members, group_messages
-- ==============================================================================

CREATE TABLE IF NOT EXISTS buying_groups (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name              TEXT NOT NULL,
  product_name      TEXT NOT NULL,
  category          TEXT NOT NULL,
  target_quantity   NUMERIC(10,2) NOT NULL,
  filled_quantity   NUMERIC(10,2) DEFAULT 0,
  price_per_kg      NUMERIC(10,2) NOT NULL,
  delivery_location TEXT NOT NULL,
  created_by        UUID NOT NULL REFERENCES profiles(id),
  linked_demand_id  UUID REFERENCES demand_posts(id),
  expiry_date       TIMESTAMPTZ NOT NULL,
  status            TEXT CHECK (status IN ('open','active','fulfilled','cancelled')) DEFAULT 'open',
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS group_members (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id              UUID NOT NULL REFERENCES buying_groups(id) ON DELETE CASCADE,
  user_id               UUID NOT NULL REFERENCES profiles(id),
  contribution_quantity NUMERIC(10,2) NOT NULL,
  is_paid               BOOLEAN DEFAULT FALSE,
  joined_at             TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (group_id, user_id)
);

CREATE TABLE IF NOT EXISTS group_messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id    UUID NOT NULL REFERENCES buying_groups(id) ON DELETE CASCADE,
  sender_id   UUID NOT NULL REFERENCES profiles(id),
  message     TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_buying_groups_created_by ON buying_groups(created_by);
CREATE INDEX IF NOT EXISTS idx_buying_groups_status ON buying_groups(status);
CREATE INDEX IF NOT EXISTS idx_buying_groups_category ON buying_groups(category);
CREATE INDEX IF NOT EXISTS idx_group_members_group_id ON group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_group_members_user_id ON group_members(user_id);
CREATE INDEX IF NOT EXISTS idx_group_messages_group_id ON group_messages(group_id);
CREATE INDEX IF NOT EXISTS idx_group_messages_created_at ON group_messages(created_at);
