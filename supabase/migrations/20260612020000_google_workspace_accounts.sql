-- GW PR 1: per-user Google Workspace connections (AIOS Connections pillar).
-- Token table is SERVICE-ROLE-ONLY by construction: RLS is enabled and NO
-- policies exist for any role, so no client JWT can read or write a row under
-- any policy combination. The UI learns connection state exclusively through
-- google_connection_status(), which never exposes token columns.
-- Spec: docs/superpowers/specs/2026-06-11-google-workspace-connections-design.md §3.A

CREATE TABLE IF NOT EXISTS public.google_workspace_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  google_email text NOT NULL,
  scopes text[] NOT NULL DEFAULT '{}',
  refresh_token text NOT NULL,
  access_token text,
  access_token_expires_at timestamptz,
  dc_folder_id text,
  status text NOT NULL CHECK (status IN ('active','needs_reconnect','revoked')) DEFAULT 'active',
  connected_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.google_workspace_accounts ENABLE ROW LEVEL SECURITY;
-- Deliberately NO policies: service-role access only.

CREATE TRIGGER trg_google_workspace_accounts_updated_at
  BEFORE UPDATE ON public.google_workspace_accounts
  FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

-- Connection status for the CALLER only — no token columns in the return type.
CREATE OR REPLACE FUNCTION public.google_connection_status()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  acct record;
BEGIN
  IF NOT public.is_internal_user() THEN
    RAISE EXCEPTION 'forbidden: internal access required';
  END IF;

  SELECT google_email, scopes, status, dc_folder_id IS NOT NULL AS has_folder, connected_at
    INTO acct
    FROM public.google_workspace_accounts
   WHERE user_id = auth.uid();

  IF NOT FOUND THEN
    RETURN jsonb_build_object('connected', false);
  END IF;

  RETURN jsonb_build_object(
    'connected', acct.status = 'active',
    'needs_reconnect', acct.status = 'needs_reconnect',
    'google_email', acct.google_email,
    'scopes', to_jsonb(acct.scopes),
    'has_folder', acct.has_folder,
    'connected_at', acct.connected_at
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.google_connection_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.google_connection_status() TO authenticated, service_role;
