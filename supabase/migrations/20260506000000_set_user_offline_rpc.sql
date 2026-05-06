-- RPC function for marking a user offline on tab close (called via fetch keepalive from beforeunload)
-- Uses SECURITY DEFINER so the anon-key request can update the row without user-level RLS.

CREATE OR REPLACE FUNCTION public.set_user_offline(p_user_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE public.user_presence
  SET status = 'offline', updated_at = now(), last_seen = now()
  WHERE user_id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute to anon and authenticated roles
GRANT EXECUTE ON FUNCTION public.set_user_offline(UUID) TO anon;
GRANT EXECUTE ON FUNCTION public.set_user_offline(UUID) TO authenticated;

-- NOTE: For stale presence cleanup, configure pg_cron via Supabase Dashboard:
-- SELECT cron.schedule(
--   'cleanup-stale-presence',
--   '*/5 * * * *',
--   $$UPDATE public.user_presence SET status = 'offline' WHERE status = 'online' AND updated_at < now() - interval '5 minutes'$$
-- );
