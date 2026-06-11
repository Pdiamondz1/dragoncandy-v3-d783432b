-- AIOS PR 3: daily platform-weight snapshots (DB size, storage bytes, row
-- counts, user counts) powering the /internal/weight trend charts and the
-- "time to scale compute/disk" alerts.
--
-- Cron calls capture_platform_weight() DIRECTLY via SQL — deliberate deviation
-- from the Vault-HTTP pattern (content-performance-capture): there is no
-- external API here, so the simpler path removes the silent-null-bearer
-- failure class entirely. See the AIOS design spec §C.

CREATE TABLE IF NOT EXISTS public.platform_weight (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  captured_at timestamptz NOT NULL DEFAULT now(),
  db_bytes bigint NOT NULL,
  storage_bytes bigint NOT NULL,
  users_total integer NOT NULL,
  row_counts jsonb NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_platform_weight_captured
  ON public.platform_weight (captured_at);

ALTER TABLE public.platform_weight ENABLE ROW LEVEL SECURITY;

-- Internal users (admin + stakeholder) read; writes only via the
-- security-definer capture function / service role.
DROP POLICY IF EXISTS "platform_weight_internal_select" ON public.platform_weight;
CREATE POLICY "platform_weight_internal_select" ON public.platform_weight
  FOR SELECT TO authenticated
  USING (public.is_internal_user());

CREATE OR REPLACE FUNCTION public.capture_platform_weight()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.platform_weight (db_bytes, storage_bytes, users_total, row_counts)
  VALUES (
    pg_database_size(current_database()),
    (SELECT coalesce(sum((metadata->>'size')::bigint), 0) FROM storage.objects),
    (SELECT count(*) FROM profiles),
    jsonb_build_object(
      'profiles', (SELECT count(*) FROM profiles),
      'campaigns', (SELECT count(*) FROM campaigns),
      'dragonshare_posts', (SELECT count(*) FROM dragonshare_posts),
      'dragonshare_boosts', (SELECT count(*) FROM dragonshare_boosts),
      'promotions', (SELECT count(*) FROM promotions),
      'messages', (SELECT count(*) FROM messages),
      'analytics_events', (SELECT count(*) FROM analytics_events),
      'content_performance', (SELECT count(*) FROM content_performance),
      'donny_knowledge', (SELECT count(*) FROM donny_knowledge),
      'file_uploads', (SELECT count(*) FROM file_uploads)
    )
  );
END;
$$;

-- Cron/service only — not callable by app users.
REVOKE EXECUTE ON FUNCTION public.capture_platform_weight() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.capture_platform_weight() TO service_role;

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- cron.schedule upserts by job name, so re-applying is idempotent.
SELECT cron.schedule(
  'platform-weight-capture',
  '30 8 * * *',                         -- daily 08:30 UTC
  $$SELECT public.capture_platform_weight();$$
);

-- Seed the first snapshot so charts render immediately.
SELECT public.capture_platform_weight();
