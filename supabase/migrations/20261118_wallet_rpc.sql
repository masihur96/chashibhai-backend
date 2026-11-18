-- Supabase RPC function for atomic wallet balance updates & transaction logging
-- Run this in your Supabase SQL Editor or apply via Supabase CLI migrations.

CREATE OR REPLACE FUNCTION update_wallet_balance(
  p_user_id UUID,
  p_amount NUMERIC,
  p_type TEXT,
  p_order_id UUID DEFAULT NULL,
  p_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_balance NUMERIC;
  v_new_balance NUMERIC;
  v_transaction_id UUID;
BEGIN
  -- 1. Lock user profile row for atomic update
  SELECT wallet_balance INTO v_current_balance
  FROM profiles
  WHERE id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User profile not found for id %', p_user_id;
  END IF;

  v_current_balance := COALESCE(v_current_balance, 0.0);

  -- 2. Validate sufficient funds for debit operations (withdrawals, escrow lock)
  IF p_amount < 0 AND (v_current_balance + p_amount) < 0 THEN
    RAISE EXCEPTION 'Insufficient wallet balance. Current: %, requested debit: %',
      v_current_balance, ABS(p_amount);
  END IF;

  v_new_balance := v_current_balance + p_amount;

  -- 3. Update profile balance
  UPDATE profiles
  SET wallet_balance = v_new_balance,
      updated_at = NOW()
  WHERE id = p_user_id;

  -- 4. Record transaction log
  INSERT INTO transactions (user_id, order_id, type, amount, note, created_at)
  VALUES (p_user_id, p_order_id, p_type, ABS(p_amount), p_note, NOW())
  RETURNING id INTO v_transaction_id;

  RETURN jsonb_build_object(
    'success', true,
    'userId', p_user_id,
    'previousBalance', v_current_balance,
    'newBalance', v_new_balance,
    'amount', ABS(p_amount),
    'transactionId', v_transaction_id,
    'type', p_type
  );
END;
$$;
