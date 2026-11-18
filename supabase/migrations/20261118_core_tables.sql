-- ==============================================================================
-- Core Tables Migration: Products, Demands, Bids, Negotiations, Orders, Escrow
-- ==============================================================================

-- 1. Ensure profiles table has all required columns
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_banned BOOLEAN DEFAULT FALSE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS rating DOUBLE PRECISION DEFAULT 0.0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS rating_count INT DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS district TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS fcm_token TEXT;

-- 2. Products table
CREATE TABLE IF NOT EXISTS products (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farmer_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  product_name  TEXT NOT NULL,
  image_url     TEXT,
  quantity      NUMERIC(10, 2) NOT NULL,
  unit          TEXT DEFAULT 'KG',
  minimum_price NUMERIC(10, 2) NOT NULL,
  trade_type    TEXT NOT NULL,
  category      TEXT NOT NULL,
  status        TEXT DEFAULT 'active',
  start_time    TIMESTAMPTZ NOT NULL,
  end_time      TIMESTAMPTZ NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_products_farmer_id ON products(farmer_id);
CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_trade_type ON products(trade_type);

-- 3. Bids table
CREATE TABLE IF NOT EXISTS bids (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  buyer_id   UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  amount     NUMERIC(10, 2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT bid_higher UNIQUE (product_id, buyer_id)
);

CREATE INDEX IF NOT EXISTS idx_bids_product_id ON bids(product_id);
CREATE INDEX IF NOT EXISTS idx_bids_buyer_id ON bids(buyer_id);

-- 4. Demand Posts table
CREATE TABLE IF NOT EXISTS demand_posts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id          UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  product_name      TEXT NOT NULL,
  quantity          NUMERIC(10, 2) NOT NULL,
  calling_price     NUMERIC(10, 2) NOT NULL,
  delivery_location TEXT NOT NULL,
  expiry_time       TIMESTAMPTZ NOT NULL,
  status            TEXT DEFAULT 'active',
  trade_type        TEXT NOT NULL,
  image_url         TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_demand_posts_buyer_id ON demand_posts(buyer_id);
CREATE INDEX IF NOT EXISTS idx_demand_posts_status ON demand_posts(status);

-- 5. Demand Offers table
CREATE TABLE IF NOT EXISTS demand_offers (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  demand_id   UUID NOT NULL REFERENCES demand_posts(id) ON DELETE CASCADE,
  farmer_id   UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  offer_price NUMERIC(10, 2) NOT NULL,
  note        TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_demand_offers_demand_id ON demand_offers(demand_id);
CREATE INDEX IF NOT EXISTS idx_demand_offers_farmer_id ON demand_offers(farmer_id);

-- 6. Negotiations table
CREATE TABLE IF NOT EXISTS negotiations (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  demand_id  UUID REFERENCES demand_posts(id) ON DELETE SET NULL,
  buyer_id   UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  farmer_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status     TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_negotiations_buyer_id ON negotiations(buyer_id);
CREATE INDEX IF NOT EXISTS idx_negotiations_farmer_id ON negotiations(farmer_id);
CREATE INDEX IF NOT EXISTS idx_negotiations_product_id ON negotiations(product_id);
CREATE INDEX IF NOT EXISTS idx_negotiations_demand_id ON negotiations(demand_id);

-- 7. Negotiation Offers table
CREATE TABLE IF NOT EXISTS negotiation_offers (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  negotiation_id UUID NOT NULL REFERENCES negotiations(id) ON DELETE CASCADE,
  sender_id      UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  amount         NUMERIC(10, 2) NOT NULL,
  note           TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_negotiation_offers_negotiation_id ON negotiation_offers(negotiation_id);
CREATE INDEX IF NOT EXISTS idx_negotiation_offers_sender_id ON negotiation_offers(sender_id);

-- 8. Orders table
CREATE TABLE IF NOT EXISTS orders (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supply_id   UUID REFERENCES products(id) ON DELETE SET NULL,
  demand_id   UUID REFERENCES demand_posts(id) ON DELETE SET NULL,
  buyer_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  farmer_id   UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  final_price NUMERIC(10, 2) NOT NULL,
  quantity    NUMERIC(10, 2) NOT NULL,
  commission  NUMERIC(10, 2) NOT NULL,
  status      TEXT DEFAULT 'pending',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orders_buyer_id ON orders(buyer_id);
CREATE INDEX IF NOT EXISTS idx_orders_farmer_id ON orders(farmer_id);
CREATE INDEX IF NOT EXISTS idx_orders_supply_id ON orders(supply_id);
CREATE INDEX IF NOT EXISTS idx_orders_demand_id ON orders(demand_id);

-- 9. Transactions table
CREATE TABLE IF NOT EXISTS transactions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  order_id   UUID REFERENCES orders(id) ON DELETE SET NULL,
  type       TEXT NOT NULL,
  amount     NUMERIC(12, 2) NOT NULL,
  note       TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_order_id ON transactions(order_id);

-- 10. Escrow Locks table
CREATE TABLE IF NOT EXISTS escrow_locks (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id   UUID UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
  buyer_id   UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  amount     NUMERIC(12, 2) NOT NULL,
  status     TEXT DEFAULT 'locked',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_escrow_locks_buyer_id ON escrow_locks(buyer_id);
CREATE INDEX IF NOT EXISTS idx_escrow_locks_order_id ON escrow_locks(order_id);
