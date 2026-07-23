-- Atomic credit-and-mark for the pending-balance payout path (release-creator-payout).
--
-- Replaces the two separate steps the pending path used before — `increment_pending_balance` (a
-- NON-idempotent `pending_balance += amount`) followed by a separate finalize that flipped state — which
-- had two re-entrancy holes: (1) a concurrent double-invocation (double-click, retried fetch, the cron
-- racing a manual release) could credit the wallet twice; (2) a retry after a finalize failure could
-- credit again, because nothing durably recorded "already credited".
--
-- This function makes crediting the wallet and setting the durable `payout_executed_at` marker ONE
-- row-locked transaction: either we credit AND mark, or we do nothing. The `FOR UPDATE` lock serializes
-- concurrent invocations, and the `payout_executed_at IS NOT NULL` check makes it credit-at-most-once.
-- After it returns 'credited', release-creator-payout's early re-entry guard short-circuits every later
-- invocation to finalize-only. See docs/wiki/concepts/payout-finalization-consistency.md.
--
-- Service-role only, mirroring `increment_pending_balance` and the other payout-path functions
-- (transition_content_status): the edge function calls it with the service-role key. EXECUTE is revoked
-- from public/anon/authenticated AND an in-body role guard rejects any non-service-role caller.
CREATE OR REPLACE FUNCTION public.credit_pending_balance_for_payout(
  p_collaboration_id uuid,
  p_user_id uuid,
  p_amount numeric
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_already boolean;
  v_creator_id uuid;
  caller_role text;
BEGIN
  -- Server-only: the edge fn calls with the service-role key (matches increment_pending_balance).
  caller_role := coalesce(current_setting('request.jwt.claims', true)::json->>'role', '');
  IF caller_role <> 'service_role' THEN
    RAISE EXCEPTION 'credit_pending_balance_for_payout is server-only';
  END IF;

  -- Row-lock the collaboration so concurrent payout invocations serialize here. The lock + the marker
  -- check + both UPDATEs are one atomic transaction — no window where the wallet is credited without the
  -- marker (or vice-versa).
  SELECT (payout_executed_at IS NOT NULL), creator_id
  INTO v_already, v_creator_id
  FROM campaign_collaborations
  WHERE id = p_collaboration_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'collaboration % not found', p_collaboration_id;
  END IF;

  -- Belt-and-suspenders: the wallet-credit target MUST be this collaboration's own creator. Blocks a
  -- future/mis-wired service-role caller from crediting an unrelated user against this collaboration
  -- (the caller derives p_user_id from the same row today, so this only ever fires on a real bug).
  IF v_creator_id IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'p_user_id % does not match collaboration % creator %', p_user_id, p_collaboration_id, v_creator_id;
  END IF;

  IF v_already THEN
    -- A prior call (or a concurrent winner holding the lock before us) already paid this out. Do NOT
    -- credit again. release-creator-payout treats this as finalize-only.
    RETURN 'already';
  END IF;

  UPDATE creator_profiles
  SET pending_balance = COALESCE(pending_balance, 0) + p_amount
  WHERE user_id = p_user_id;

  -- Never mark "paid" if there was no wallet row to credit — roll back the whole tx so a retry can be
  -- surfaced instead of silently marking a payout that never landed anywhere.
  IF NOT FOUND THEN
    RAISE EXCEPTION 'creator_profiles row not found for user % — cannot credit pending balance', p_user_id;
  END IF;

  UPDATE campaign_collaborations
  SET payout_executed_at = now()
  WHERE id = p_collaboration_id;

  RETURN 'credited';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.credit_pending_balance_for_payout(uuid, uuid, numeric) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.credit_pending_balance_for_payout(uuid, uuid, numeric) TO service_role;

COMMENT ON FUNCTION public.credit_pending_balance_for_payout(uuid, uuid, numeric) IS
  'Atomic credit-and-mark for the pending-balance payout path: row-locks the collaboration, credits creator_profiles.pending_balance and sets payout_executed_at in one transaction, and returns ''credited'' or ''already''. Service-role only. Replaces the non-idempotent increment_pending_balance in release-creator-payout.';
