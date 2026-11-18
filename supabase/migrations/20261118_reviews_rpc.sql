-- ==============================================================================
-- Module 10 — Reviews Migration & Atomic Rating Recalculation RPC
-- ==============================================================================

CREATE TABLE IF NOT EXISTS reviews (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reviewer_id UUID NOT NULL REFERENCES profiles(id),
  reviewee_id UUID NOT NULL REFERENCES profiles(id),
  order_id    UUID REFERENCES orders(id),
  rating      NUMERIC(2,1) CHECK (rating >= 1 AND rating <= 5) NOT NULL,
  comment     TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_reviewer_order UNIQUE (reviewer_id, order_id)
);

CREATE INDEX IF NOT EXISTS idx_reviews_reviewee_id ON reviews(reviewee_id);
CREATE INDEX IF NOT EXISTS idx_reviews_reviewer_id ON reviews(reviewer_id);
CREATE INDEX IF NOT EXISTS idx_reviews_order_id ON reviews(order_id);

-- Atomic stored procedure to recalculate user rating
CREATE OR REPLACE FUNCTION update_user_rating(
  p_user_id UUID,
  p_rating NUMERIC
)
RETURNS TABLE (
  new_rating NUMERIC,
  new_rating_count INT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_rating NUMERIC;
  v_current_count INT;
  v_calc_rating NUMERIC;
  v_calc_count INT;
BEGIN
  -- Lock the profile row for atomic update
  SELECT COALESCE(rating, 0.0), COALESCE(rating_count, 0)
  INTO v_current_rating, v_current_count
  FROM profiles
  WHERE id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User profile with ID % not found', p_user_id;
  END IF;

  v_calc_count := v_current_count + 1;
  v_calc_rating := ROUND(((v_current_rating * v_current_count + p_rating) / v_calc_count)::NUMERIC, 2);

  UPDATE profiles
  SET
    rating = v_calc_rating,
    rating_count = v_calc_count,
    updated_at = NOW()
  WHERE id = p_user_id;

  RETURN QUERY SELECT v_calc_rating, v_calc_count;
END;
$$;
