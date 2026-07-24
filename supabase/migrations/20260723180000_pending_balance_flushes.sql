-- Durable per-flush record: makes transferPendingBalance exactly-once. Each row is a wallet→Stripe
-- transfer keyed on `flush_${id}` (collision-free), with enough stored to rebuild the transfer
-- byte-identically for a reconciliation replay. See docs/wiki/concepts/payout-finalization-consistency.md.
CREATE TABLE IF NOT EXISTS public.pending_balance_flushes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  profile_type text NOT NULL CHECK (profile_type IN ('creator','business')),
  stripe_account_id text NOT NULL,
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  source text NOT NULL CHECK (source IN ('manual','autoflush')),
  status text NOT NULL DEFAULT 'claimed' CHECK (status IN ('claimed','succeeded','failed','stuck')),
  stripe_transfer_id text,
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Reconciliation scans only 'claimed' rows → partial index keeps it cheap and never re-scans terminals.
CREATE INDEX IF NOT EXISTS idx_pbf_claimed_created
  ON public.pending_balance_flushes (created_at) WHERE status = 'claimed';

ALTER TABLE public.pending_balance_flushes ENABLE ROW LEVEL SECURITY;

-- No client access. Internal-team read; service-role full (writes only via the RPCs below).
DROP POLICY IF EXISTS pbf_internal_select ON public.pending_balance_flushes;
CREATE POLICY pbf_internal_select ON public.pending_balance_flushes
  FOR SELECT USING (public.is_internal_user());
DROP POLICY IF EXISTS pbf_service_all ON public.pending_balance_flushes;
CREATE POLICY pbf_service_all ON public.pending_balance_flushes
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- ── claim: atomically zero the balance (if unchanged) AND insert a 'claimed' row; return its id ──
CREATE OR REPLACE FUNCTION public.claim_pending_balance_flush(
  p_user_id uuid, p_profile_type text, p_stripe_account_id text, p_amount_cents integer, p_source text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_balance numeric; v_flush_id uuid; caller_role text;
BEGIN
  caller_role := coalesce(current_setting('request.jwt.claims', true)::json->>'role','');
  IF caller_role <> 'service_role' THEN RAISE EXCEPTION 'claim_pending_balance_flush is server-only'; END IF;

  IF p_profile_type = 'creator' THEN
    SELECT pending_balance INTO v_balance FROM creator_profiles WHERE user_id = p_user_id FOR UPDATE;
  ELSE
    SELECT pending_balance INTO v_balance FROM business_profiles WHERE user_id = p_user_id FOR UPDATE;
  END IF;

  -- Balance changed / not found / non-positive / cents mismatch → caller treats NULL as BALANCE_CHANGED.
  IF v_balance IS NULL OR p_amount_cents <= 0 OR round(v_balance * 100) <> p_amount_cents THEN
    RETURN NULL;
  END IF;

  IF p_profile_type = 'creator' THEN
    UPDATE creator_profiles SET pending_balance = 0 WHERE user_id = p_user_id;
  ELSE
    UPDATE business_profiles SET pending_balance = 0 WHERE user_id = p_user_id;
  END IF;

  INSERT INTO pending_balance_flushes (user_id, profile_type, stripe_account_id, amount_cents, source, status)
  VALUES (p_user_id, p_profile_type, p_stripe_account_id, p_amount_cents, p_source, 'claimed')
  RETURNING id INTO v_flush_id;

  RETURN v_flush_id;
END; $$;

-- ── confirm: mark a claimed row succeeded (money left) ──
CREATE OR REPLACE FUNCTION public.confirm_pending_balance_flush(p_flush_id uuid, p_transfer_id text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE caller_role text;
BEGIN
  caller_role := coalesce(current_setting('request.jwt.claims', true)::json->>'role','');
  IF caller_role <> 'service_role' THEN RAISE EXCEPTION 'confirm_pending_balance_flush is server-only'; END IF;
  UPDATE pending_balance_flushes
    SET status='succeeded', stripe_transfer_id=p_transfer_id, updated_at=now()
    WHERE id=p_flush_id AND status='claimed';
END; $$;

-- ── fail: mark a claimed row failed; optionally restore the balance (definite failures only) ──
CREATE OR REPLACE FUNCTION public.fail_pending_balance_flush(p_flush_id uuid, p_restore boolean, p_error text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE caller_role text; v_user uuid; v_type text; v_cents integer; v_status text;
BEGIN
  caller_role := coalesce(current_setting('request.jwt.claims', true)::json->>'role','');
  IF caller_role <> 'service_role' THEN RAISE EXCEPTION 'fail_pending_balance_flush is server-only'; END IF;

  SELECT user_id, profile_type, amount_cents, status INTO v_user, v_type, v_cents, v_status
    FROM pending_balance_flushes WHERE id = p_flush_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'flush % not found', p_flush_id; END IF;
  IF v_status <> 'claimed' THEN RETURN; END IF;  -- idempotent: only act on a claimed row

  IF p_restore THEN
    IF v_type = 'creator' THEN
      UPDATE creator_profiles SET pending_balance = COALESCE(pending_balance,0) + (v_cents::numeric / 100) WHERE user_id = v_user;
    ELSE
      UPDATE business_profiles SET pending_balance = COALESCE(pending_balance,0) + (v_cents::numeric / 100) WHERE user_id = v_user;
    END IF;
  END IF;

  UPDATE pending_balance_flushes SET status='failed', last_error=p_error, updated_at=now() WHERE id=p_flush_id;
END; $$;

-- ── bump: increment attempt; flip to terminal 'stuck' at the cap (returns the resulting status) ──
CREATE OR REPLACE FUNCTION public.bump_flush_attempt(p_flush_id uuid, p_error text, p_cap integer)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE caller_role text; v_status text;
BEGIN
  caller_role := coalesce(current_setting('request.jwt.claims', true)::json->>'role','');
  IF caller_role <> 'service_role' THEN RAISE EXCEPTION 'bump_flush_attempt is server-only'; END IF;
  UPDATE pending_balance_flushes
    SET attempts = attempts + 1, last_error = p_error, updated_at = now(),
        status = CASE WHEN attempts + 1 >= p_cap AND status = 'claimed' THEN 'stuck' ELSE status END
    WHERE id = p_flush_id AND status = 'claimed'
    RETURNING status INTO v_status;
  RETURN v_status;  -- 'claimed' | 'stuck' | NULL (row wasn't claimed)
END; $$;

REVOKE EXECUTE ON FUNCTION public.claim_pending_balance_flush(uuid,text,text,integer,text) FROM public, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.claim_pending_balance_flush(uuid,text,text,integer,text) TO service_role;
REVOKE EXECUTE ON FUNCTION public.confirm_pending_balance_flush(uuid,text) FROM public, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.confirm_pending_balance_flush(uuid,text) TO service_role;
REVOKE EXECUTE ON FUNCTION public.fail_pending_balance_flush(uuid,boolean,text) FROM public, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.fail_pending_balance_flush(uuid,boolean,text) TO service_role;
REVOKE EXECUTE ON FUNCTION public.bump_flush_attempt(uuid,text,integer) FROM public, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.bump_flush_attempt(uuid,text,integer) TO service_role;
