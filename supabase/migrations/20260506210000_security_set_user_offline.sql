-- Restrict set_user_offline: revoke anon access, add auth.uid() check
-- Previously any anonymous request could force any user offline.

REVOKE EXECUTE ON FUNCTION public.set_user_offline(UUID) FROM anon;

CREATE OR REPLACE FUNCTION public.set_user_offline(p_user_id UUID)
RETURNS void AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;
  IF auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'can only set own presence';
  END IF;
  UPDATE public.user_presence
  SET status = 'offline', updated_at = now(), last_seen = now()
  WHERE user_id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
