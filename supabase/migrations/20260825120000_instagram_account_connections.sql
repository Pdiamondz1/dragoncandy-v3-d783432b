-- Per-user Instagram account connections, for READ-ONLY insights.
--
-- Scope model: this integration does NOT publish. Publishing to Instagram stays
-- with Outstand; direct platform APIs exist to supply the analytics Outstand
-- never shipped (founder decision 2026-08-23). The requested permissions are
-- `instagram_business_basic` + `instagram_business_manage_insights` and nothing
-- writes to Instagram. Bringing publishing in-house is another Meta App Review
-- and a deliberate decision — not an incremental edit.
--
-- Token table is SERVICE-ROLE-ONLY by construction, the same shape as
-- `youtube_channel_connections` (20260823170000): RLS enabled and NO policies
-- for any role, PLUS the ambient grants revoked, because a column-level REVOKE
-- is a documented no-op against Supabase's table-wide GRANT (20260804174854,
-- 20260805163247). Grants and RLS are independent gates; a future migration that
-- re-grants the table still hits RLS-with-no-policy.
--
-- The UI learns connection state exclusively through instagram_connection_status(),
-- which never returns a token column.

CREATE TABLE IF NOT EXISTS public.instagram_account_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

  -- Instagram's own scoped user id, read back from /me rather than accepted from
  -- any client — the identity comes from the token, so it is not something a
  -- caller can assert. Same reasoning as the YouTube channel id, and the same
  -- class of defect as the client-writable `outstand_post_id` that #366 closed.
  ig_user_id text NOT NULL,
  username text,

  -- BUSINESS | MEDIA_CREATOR | PERSONAL. Stored because it decides what Meta
  -- will serve: several insights are unavailable outside business/creator
  -- accounts, so this is how a legitimately empty result is told apart from a
  -- broken one.
  account_type text,

  -- NULLABLE ON PURPOSE, and never defaulted to 0. Meta does not report a
  -- follower count for every account type, and 0 would read as "an account with
  -- no followers" — the fabricated-zero mistake [[Honest Analytics]] exists to
  -- prevent. It matters concretely: Meta refuses follower demographics below
  -- 100 followers, so this is the column that explains an empty demographic
  -- response.
  followers_count integer,

  -- What Meta ACTUALLY granted, which can be a subset of what was requested.
  -- Read before calling an API rather than assuming the request succeeded.
  permissions text[] NOT NULL DEFAULT '{}',

  -- ---------------------------------------------------------------------------
  -- THE TOKEN MODEL, which is NOT YouTube's and is the reason this table has
  -- columns that one does not.
  --
  -- Instagram has no refresh token. The long-lived access token IS the
  -- credential, valid 60 days, and `ig_refresh_token` extends that same token —
  -- but only while it is STILL VALID and at least 24 HOURS OLD. Both conditions
  -- need a stored issue time, which is why `token_issued_at` exists here and has
  -- no counterpart in `youtube_channel_connections`.
  --
  -- The consequence to keep in mind when reading any code that touches this
  -- table: an expired Instagram token is NOT recoverable. There is no
  -- credential left that can mint another one. Only the user re-consenting
  -- restores the connection, which is why refresh happens early rather than on
  -- expiry, and why a scheduled sweep exists for accounts nobody opens.
  -- ---------------------------------------------------------------------------
  access_token text NOT NULL,
  token_issued_at timestamptz,
  token_expires_at timestamptz,

  -- Two states, both with a writer. 'active' on connect; 'needs_reconnect' when
  -- Meta rejects the token or it lapsed before a refresh landed, which is the
  -- state a user can fix by re-consenting.
  --
  -- Deliberately NO 'revoked' value. Disconnect DELETES the row, so a
  -- disconnected connection is an absent row. A 'revoked' status would be CHECK
  -- vocabulary with no writer, which this project has already shipped twice as a
  -- live defect (posting_schedule_status 'completed' and 'failed', both rendered
  -- by the UI and written by nothing).
  status text NOT NULL CHECK (status IN ('active','needs_reconnect')) DEFAULT 'active',
  last_error text,

  connected_at timestamptz NOT NULL DEFAULT now(),
  last_synced_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- Per-account, not per-user: a user may legitimately link more than one
  -- Instagram account, and UNIQUE(user_id) would silently replace the first on
  -- the second connect. Also supplies the (user_id, …) index the status lookup
  -- needs, so no separate index on user_id is created.
  UNIQUE (user_id, ig_user_id)
);

ALTER TABLE public.instagram_account_connections ENABLE ROW LEVEL SECURITY;
-- Deliberately NO policies: service-role access only.

-- Table-level, not column-level — see the header comment.
REVOKE ALL ON public.instagram_account_connections FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.instagram_account_connections TO service_role;

-- Partial index for the refresh sweep: it only ever scans live connections
-- approaching expiry, so the index excludes everything else. `status` is in the
-- predicate rather than the key because the sweep filters on it identically
-- every time.
CREATE INDEX IF NOT EXISTS idx_iac_active_expiry
  ON public.instagram_account_connections (token_expires_at)
  WHERE status = 'active';

-- Idempotent, unlike the YouTube table's trigger. `CREATE TRIGGER` has no
-- `IF NOT EXISTS`, and 20260823170000 therefore could not be re-run — which
-- forced its ledger row to be written by hand on prod. One extra line here
-- avoids repeating that.
DROP TRIGGER IF EXISTS trg_instagram_account_connections_updated_at
  ON public.instagram_account_connections;
CREATE TRIGGER trg_instagram_account_connections_updated_at
  BEFORE UPDATE ON public.instagram_account_connections
  FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

-- ---------------------------------------------------------------------------
-- Caller-scoped connection status. Takes NO arguments: identity comes only from
-- auth.uid(), so there is no parameter a caller could point at another user (the
-- `dre_my_standing` pattern, 20260807120000). Returns no token column.
--
-- `token_expires_at` IS exposed, unlike anything in the YouTube equivalent,
-- because here it is user-facing information rather than an implementation
-- detail: an Instagram connection genuinely does end on a date, and a UI that
-- cannot say when would leave a business to discover it from an empty chart.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.instagram_connection_status()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'ig_user_id',       c.ig_user_id,
        'username',         c.username,
        'account_type',     c.account_type,
        'followers_count',  c.followers_count,
        'permissions',      to_jsonb(c.permissions),
        'status',           c.status,
        'connected',        c.status = 'active',
        'needs_reconnect',  c.status = 'needs_reconnect',
        'connected_at',     c.connected_at,
        'last_synced_at',   c.last_synced_at,
        'token_expires_at', c.token_expires_at
      )
      ORDER BY c.connected_at
    ),
    '[]'::jsonb
  )
  FROM public.instagram_account_connections c
  WHERE c.user_id = auth.uid();
$$;

-- A bare `REVOKE ... FROM PUBLIC` does not lock down a SECURITY DEFINER
-- function against Supabase's default privileges; anon must be named.
REVOKE EXECUTE ON FUNCTION public.instagram_connection_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.instagram_connection_status() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Verification. Expected result: exactly one row, `service_role`. Any anon or
-- authenticated row means the REVOKE did not take — do not assume it did
-- because the migration succeeded.
-- ---------------------------------------------------------------------------
-- SELECT grantee, privilege_type
--   FROM information_schema.role_table_grants
--  WHERE table_name = 'instagram_account_connections'
--  GROUP BY grantee, privilege_type ORDER BY grantee;
