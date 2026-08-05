-- Creator Packages v1e — NOTIFICATIONS. One server-authoritative trigger fires a single edge function on every
-- package_orders state transition a participant should hear about. Doing it in an AFTER UPDATE trigger (rather
-- than at each RPC/edge-fn call site) means the notification fires no matter WHAT caused the transition — the
-- creator's submit RPC, the guest's revision RPC, the verify/payout edge fns, or the auto-approve cron — and it
-- works for guest buyers who have no account. pg_net queues the POST asynchronously, so this NEVER blocks or can
-- fail the underlying money-path transaction. Depends on 20260804120100 (package_orders) + 20260804120700 (delivery).
--
-- URL + bearer come from Supabase VAULT, NOT the app.settings.* GUCs. Those GUCs are UNSET in this prod project
-- (verified 2026-08-05: current_setting('app.settings.supabase_url', true) returns null), which is exactly why
-- the GUC-based toast-token-refresh + donny-nudge triggers are silently dead in prod. This trigger instead
-- mirrors the working scheduled fleet (auto-approve-content-cron, content-performance-capture-cron,
-- dre-award-cron): it reads both values from vault.decrypted_secrets at fire time, env-agnostic.
--
-- PREREQUISITE Vault secret — register per environment, out-of-band, BEFORE this trigger can deliver (same
-- pattern as auto_approve_content_url; the URL is the full function endpoint, so there is no per-env
-- string-building and a stray db push can't bake in a wrong project ref):
--   select vault.create_secret(
--     'https://<project-ref>.supabase.co/functions/v1/notify-package-order', 'package_order_notify_url');
--   -- aios_ingest_key must already hold the project's sb_secret_… service-role key (shared with AIOS);
--   -- notify-package-order authorizes this bearer via _shared/ingest-auth.ts (isAuthorizedIngest).

CREATE EXTENSION IF NOT EXISTS pg_net;  -- already present in prod (used by the cron fleet); no-op if installed

CREATE OR REPLACE FUNCTION public.notify_package_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  -- Vault-sourced (see header): the dead app.settings.* GUCs would make every POST below a silent no-op.
  _url   text := (select decrypted_secret from vault.decrypted_secrets where name = 'package_order_notify_url');
  _key   text := (select decrypted_secret from vault.decrypted_secrets where name = 'aios_ingest_key');
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

  -- Fire-and-forget. pg_net's net.http_post enqueues and returns immediately, so a notification NEVER blocks or
  -- fails the money-path transaction. If the Vault secrets aren't registered (null), skip — but RAISE WARNING so
  -- a mis-provisioned environment surfaces in the postgres logs instead of silently dropping every notice (the
  -- exact silent-failure mode the dead-GUC pattern caused).
  IF _url IS NOT NULL AND _key IS NOT NULL THEN
    PERFORM net.http_post(
      url := _url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || _key
      ),
      body := jsonb_build_object('orderId', NEW.id, 'event', _event)
    );
  ELSE
    RAISE WARNING 'notify_package_order: package_order_notify_url/aios_ingest_key Vault secret missing — notification (%) for order % dropped', _event, NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

-- Only participants of the row can ever be the target, and the edge function re-derives recipients from the
-- order itself — the trigger passes only the id + event, never PII. DROP-then-CREATE so a re-apply is idempotent.
DROP TRIGGER IF EXISTS trg_notify_package_order ON public.package_orders;
CREATE TRIGGER trg_notify_package_order
  AFTER UPDATE ON public.package_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_package_order();

COMMENT ON FUNCTION public.notify_package_order() IS
  'AFTER UPDATE on package_orders: fires the notify-package-order edge function (async, best-effort) once per meaningful state transition (order_placed / delivered / revision_requested / completed). URL+bearer from Vault (package_order_notify_url + aios_ingest_key), not the dead app.settings.* GUCs. Server-authoritative — independent of which caller drove the transition; works for guest buyers.';
