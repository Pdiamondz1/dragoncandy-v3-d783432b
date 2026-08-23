-- Per-user YouTube channel connections, for READ-ONLY analytics.
--
-- Scope model: this integration does NOT publish. Publishing to YouTube stays
-- with Outstand; direct platform APIs exist to supply the analytics Outstand
-- never shipped (founder decision 2026-08-23). So the granted scopes are
-- `youtube.readonly` + `yt-analytics.readonly` and nothing here writes to
-- YouTube. If publishing is ever brought in-house, that is a new scope, a new
-- Google verification, and a deliberate decision — not an incremental edit.
--
-- Token table is SERVICE-ROLE-ONLY by construction, the same shape as
-- `google_workspace_accounts` (20260612020000): RLS is enabled and NO policies
-- exist for any role, so no client JWT can read or write a row under any policy
-- combination. Unlike that table this one ALSO revokes the ambient grants,
-- because it stores refresh tokens and the project has twice learned that a
-- column-level REVOKE is a no-op against Supabase's table-wide GRANT
-- (20260804174854, 20260805163247, and the `outstand_post_ownership` note in
-- docs/DATABASE_SCHEMA.md). Grants and RLS are independent gates; a future
-- migration that re-grants the table still hits RLS-with-no-policy.
--
-- The UI learns connection state exclusively through youtube_connection_status(),
-- which never returns a token column.

CREATE TABLE IF NOT EXISTS public.youtube_channel_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

  -- YouTube's own channel id (`UC…`), read back from channels.list?mine=true
  -- rather than accepted from any client. One Google account can own several
  -- channels (brand accounts are common for restaurants), and the user picks
  -- which at consent time.
  channel_id text NOT NULL,
  channel_title text,

  -- From the id_token, for display and support only. Never used for authorization.
  google_email text,

  -- What Google ACTUALLY granted, which can be a subset of what was requested.
  -- Read this before calling an API rather than assuming the request succeeded.
  scopes text[] NOT NULL DEFAULT '{}',

  refresh_token text NOT NULL,
  access_token text,
  access_token_expires_at timestamptz,

  -- Two states, both with a writer. 'active' is set on connect;
  -- 'needs_reconnect' is set when Google rejects the stored refresh token
  -- (`invalid_grant`), and is the state a user can fix by re-consenting.
  --
  -- There is deliberately NO 'revoked' value. `youtube-disconnect` revokes at
  -- Google and DELETES the row, so a disconnected connection is an absent row —
  -- a 'revoked' status would be CHECK vocabulary with no writer, which this
  -- project has already shipped twice as a live defect (posting_schedule_status
  -- 'completed' and 'failed', both rendered by the UI and written by nothing).
  --
  -- NOTE the trap this status will surface first: while the Google Cloud app is
  -- in **Testing** publishing status, Google expires refresh tokens 7 days after
  -- consent for External apps. Every connection will flip to 'needs_reconnect' a
  -- week after it is made, and that is a console setting, NOT a bug in the
  -- refresh code. See the memory note `youtube-google-cloud-oauth`.
  status text NOT NULL CHECK (status IN ('active','needs_reconnect')) DEFAULT 'active',
  last_error text,

  connected_at timestamptz NOT NULL DEFAULT now(),
  last_synced_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- Per-channel, not per-user: a user may legitimately link more than one
  -- channel, and a UNIQUE(user_id) would silently replace the first on the
  -- second connect. This also supplies the (user_id, …) index the status
  -- lookup needs, so no separate index on user_id is created.
  UNIQUE (user_id, channel_id)
);

ALTER TABLE public.youtube_channel_connections ENABLE ROW LEVEL SECURITY;
-- Deliberately NO policies: service-role access only.

-- Table-level, not column-level — see the header comment.
REVOKE ALL ON public.youtube_channel_connections FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.youtube_channel_connections TO service_role;

CREATE TRIGGER trg_youtube_channel_connections_updated_at
  BEFORE UPDATE ON public.youtube_channel_connections
  FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

-- ---------------------------------------------------------------------------
-- Caller-scoped connection status. Takes NO arguments: identity comes only from
-- auth.uid(), so there is no parameter a caller could point at another user
-- (the `dre_my_standing` pattern, 20260807120000). Returns no token column.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.youtube_connection_status()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'channel_id',      c.channel_id,
        'channel_title',   c.channel_title,
        'google_email',    c.google_email,
        'scopes',          to_jsonb(c.scopes),
        'status',          c.status,
        'connected',       c.status = 'active',
        'needs_reconnect', c.status = 'needs_reconnect',
        'connected_at',    c.connected_at,
        'last_synced_at',  c.last_synced_at
      )
      ORDER BY c.connected_at
    ),
    '[]'::jsonb
  )
  FROM public.youtube_channel_connections c
  WHERE c.user_id = auth.uid();
$$;

-- A bare `REVOKE ... FROM PUBLIC` does not lock down a SECURITY DEFINER
-- function against Supabase's default privileges; anon must be named.
REVOKE EXECUTE ON FUNCTION public.youtube_connection_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.youtube_connection_status() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Verification. Expected result: exactly one row, `service_role`. Any anon or
-- authenticated row means the REVOKE did not take — do not assume it did
-- because the migration succeeded.
-- ---------------------------------------------------------------------------
-- SELECT grantee, privilege_type
--   FROM information_schema.role_table_grants
--  WHERE table_name = 'youtube_channel_connections'
--  GROUP BY grantee, privilege_type ORDER BY grantee;
