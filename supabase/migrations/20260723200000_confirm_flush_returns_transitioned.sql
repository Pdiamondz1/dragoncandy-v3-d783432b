-- confirm_pending_balance_flush now RETURNS boolean = "did THIS call transition a 'claimed' row to
-- 'succeeded'". Under overlapping reconciliation two invocations can replay the same flush_${id} Stripe
-- key (no double-pay), but the second confirm is a no-op (row already 'succeeded') that returns no error;
-- the caller then wrote a SECOND transfer_created ledger row. Since payment_events is NOT unique on
-- stripe_id and its rows are summed for creator/business totals, that double-counts the payout. Returning
-- whether the row transitioned lets executeFlushTransfer skip the ledger write on a no-op. Codex [P2].
--
-- A return-type change cannot be done with CREATE OR REPLACE ("cannot change return type of existing
-- function"), so DROP + CREATE. Same name + args (uuid, text) → PostgREST RPC calls still resolve, and the
-- currently-deployed edge code (which reads only `error`, ignoring the return value) is unaffected; the
-- refactored edge code that reads the boolean ships alongside this migration.
DROP FUNCTION IF EXISTS public.confirm_pending_balance_flush(uuid, text);

CREATE FUNCTION public.confirm_pending_balance_flush(p_flush_id uuid, p_transfer_id text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE caller_role text; v_updated integer;
BEGIN
  caller_role := coalesce(current_setting('request.jwt.claims', true)::json->>'role','');
  IF caller_role <> 'service_role' THEN RAISE EXCEPTION 'confirm_pending_balance_flush is server-only'; END IF;
  UPDATE pending_balance_flushes
    SET status='succeeded', stripe_transfer_id=p_transfer_id, updated_at=now()
    WHERE id=p_flush_id AND status='claimed';
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;   -- true iff THIS call transitioned the row (else a concurrent run already did)
END; $$;

REVOKE EXECUTE ON FUNCTION public.confirm_pending_balance_flush(uuid,text) FROM public, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.confirm_pending_balance_flush(uuid,text) TO service_role;
