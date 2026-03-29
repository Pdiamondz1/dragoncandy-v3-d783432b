-- =============================================================================
-- Donny OAuth Codes + schema patches for OAuth flow
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. CREATE donny_oauth_codes
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS donny_oauth_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code_hash text NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES donny_oauth_clients(id) ON DELETE CASCADE,
  redirect_uri text NOT NULL,
  scopes text[] NOT NULL,
  code_challenge text NOT NULL,
  code_challenge_method text NOT NULL DEFAULT 'S256',
  expires_at timestamptz NOT NULL,
  used boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_donny_oauth_codes_code_hash
  ON donny_oauth_codes(code_hash);

ALTER TABLE donny_oauth_codes ENABLE ROW LEVEL SECURITY;

-- No user-facing RLS policies — all access via service_role key

-- ---------------------------------------------------------------------------
-- 2. ALTER donny_oauth_clients — make client_secret_hash nullable
-- ---------------------------------------------------------------------------
ALTER TABLE donny_oauth_clients
  ALTER COLUMN client_secret_hash DROP NOT NULL;

-- ---------------------------------------------------------------------------
-- 3. ADD index on donny_oauth_tokens.refresh_token_hash
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_donny_oauth_tokens_refresh_token_hash
  ON donny_oauth_tokens(refresh_token_hash);
