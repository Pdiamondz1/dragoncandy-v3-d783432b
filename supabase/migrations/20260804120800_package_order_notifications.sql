-- Creator Packages v1e — NOTIFICATIONS. One server-authoritative trigger fires a single edge function on every
-- package_orders state transition a participant should hear about. Doing it in an AFTER UPDATE trigger (rather
-- than at each RPC/edge-fn call site) means the notification fires no matter WHAT caused the transition — the
-- creator's submit RPC, the guest's revision RPC, the verify/payout edge fns, or the auto-approve cron — and it
-- works for guest buyers who have no account. Mirrors the proven donny-nudge trigger pattern (net.http_post via
-- app.settings.*, fire-and-forget). pg_net queues the POST asynchronously, so this NEVER blocks or can fail the
-- underlying money-path transaction. Depends on 20260804120100 (package_orders) + 20260804120700 (delivery).

CREATE EXTENSION IF NOT EXISTS pg_net;  -- already present in prod (used by the cron fleet); no-op if installed

CREATE OR REPLACE FUNCTION public.notify_package_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _url text := current_setting('app.settings.supabase_url', true);
  _key text := current_setting('app.settings.service_role_key', true);
  _event text := NULL;
BEGIN
  -- Detect the ONE meaningful transition on this UPDATE via OLD→NEW. Each guard requires the column to have
  -- ACTUALLY changed to the target (OLD IS DISTINCT FROM target), so the many intermediate writes on the payout
  -- path (held→releasing→released, retried idempotent finalize) never re-fire — their OLD already equals NEW.
  -- ELSIF makes the classification exclusive; at most one event per UPDATE.
  IF NEW.escrow_status = 'held' AND OLD.escrow_status IS DISTINCT FROM 'held'
     AND NEW.order_status = 'in_progress' THEN
    _event := 'order_placed';         -- → creator: a new paid order is waiting to be delivered
  ELSIF NEW.content_status = 'submitted' AND OLD.content_status IS DISTINCT FROM 'submitted' THEN
    _event := 'delivered';            -- → buyer: your content is ready to review/approve (also re-fires on a re-delivery after a revision)
  ELSIF NEW.order_status = 'revision_requested' AND OLD.order_status IS DISTINCT FROM 'revision_requested' THEN
    _event := 'revision_requested';   -- → creator: the buyer asked for a change
  ELSIF NEW.order_status = 'completed' AND OLD.order_status IS DISTINCT FROM 'completed' THEN
    _event := 'completed';            -- → creator: approved & paid (+ buyer receipt)
  END IF;

  IF _event IS NULL THEN
    RETURN NEW;
  END IF;

  -- Fire-and-forget. If the app.settings.* GUCs aren't configured (null), skip silently — notifications are
  -- best-effort and must NEVER fail an order transition. pg_net's net.http_post enqueues and returns immediately.
  IF _url IS NOT NULL AND _key IS NOT NULL THEN
    PERFORM net.http_post(
      url := _url || '/functions/v1/notify-package-order',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || _key
      ),
      body := jsonb_build_object('orderId', NEW.id, 'event', _event)
    );
  END IF;

  RETURN NEW;
END;
$$;

-- Only participants of the row can ever be the target, and the edge function re-derives recipients from the
-- order itself — the trigger passes only the id + event, never PII.
CREATE TRIGGER trg_notify_package_order
  AFTER UPDATE ON public.package_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_package_order();

COMMENT ON FUNCTION public.notify_package_order() IS
  'AFTER UPDATE on package_orders: fires the notify-package-order edge function (async, best-effort) once per meaningful state transition (order_placed / delivered / revision_requested / completed). Server-authoritative — independent of which caller drove the transition; works for guest buyers.';
