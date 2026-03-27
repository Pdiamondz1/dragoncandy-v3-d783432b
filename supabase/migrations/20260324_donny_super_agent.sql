-- =============================================================================
-- Donny Super Agent — Evolve Migration
-- Adds cross-platform surface tracking, token analytics, actions log,
-- and OAuth client/token tables for SDK embed support.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. ALTER donny_conversations — add surface, context columns, updated_at
-- ---------------------------------------------------------------------------
ALTER TABLE donny_conversations
  ADD COLUMN IF NOT EXISTS surface text NOT NULL DEFAULT 'web',
  ADD COLUMN IF NOT EXISTS context_url text,
  ADD COLUMN IF NOT EXISTS context_metadata jsonb,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_donny_conversations_surface
  ON donny_conversations(surface);

-- ---------------------------------------------------------------------------
-- 2. ALTER donny_messages — add tokens_used, model, expand role constraint
-- ---------------------------------------------------------------------------
ALTER TABLE donny_messages
  ADD COLUMN IF NOT EXISTS tokens_used integer,
  ADD COLUMN IF NOT EXISTS model text;

-- Replace the role CHECK to include 'system' alongside existing values
ALTER TABLE donny_messages DROP CONSTRAINT IF EXISTS donny_messages_role_check;
ALTER TABLE donny_messages
  ADD CONSTRAINT donny_messages_role_check
  CHECK (role IN ('user', 'assistant', 'system', 'tool'));

-- ---------------------------------------------------------------------------
-- 3. CREATE donny_actions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS donny_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid REFERENCES donny_conversations(id) ON DELETE SET NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action_type text NOT NULL,
  action_payload jsonb NOT NULL,
  status text DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'failed')),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_donny_actions_user_id_action_type
  ON donny_actions(user_id, action_type);

ALTER TABLE donny_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own actions"
  ON donny_actions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own actions"
  ON donny_actions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 4. CREATE donny_oauth_clients
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS donny_oauth_clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id text UNIQUE NOT NULL,
  client_secret_hash text NOT NULL,
  client_name text NOT NULL,
  redirect_uris text[] NOT NULL,
  scopes text[] DEFAULT '{donny:chat,profile:read}',
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE donny_oauth_clients ENABLE ROW LEVEL SECURITY;

-- Only service_role can manage OAuth clients (no user-facing policies)
-- All access goes through Edge Functions using the service_role key.

-- ---------------------------------------------------------------------------
-- 5. CREATE donny_oauth_tokens
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS donny_oauth_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES donny_oauth_clients(id) ON DELETE CASCADE,
  access_token_hash text NOT NULL,
  refresh_token_hash text NOT NULL,
  scopes text[] NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_donny_oauth_tokens_access_token_hash
  ON donny_oauth_tokens(access_token_hash);

ALTER TABLE donny_oauth_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own oauth tokens"
  ON donny_oauth_tokens FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can revoke own oauth tokens"
  ON donny_oauth_tokens FOR DELETE
  USING (auth.uid() = user_id);
