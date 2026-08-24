-- Recovered 2026-08-24 from production's migration ledger, which was the only
-- place this migration existed. Version 20260611083939 IS recorded on production.
-- This is a record of what ran, not a migration: see README.md in this directory.
-- Everything below the blank line is the ledger's SQL, verbatim.

-- Drift fix (2026-06-11): repo migration 20260503000000_donny_cost_architecture.sql
-- was never applied to prod — donny_cost_ledger/donny_usage missing, so cost
-- logging and donny-cost-rollup have been failing silently. Applied verbatim.

CREATE TABLE IF NOT EXISTS donny_cost_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  edge_function text NOT NULL,
  model text NOT NULL,
  tier text NOT NULL CHECK (tier IN ('T0', 'T1', 'T2', 'T3')),
  input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  estimated_cost_usd numeric(10,6) NOT NULL DEFAULT 0,
  fallback boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE donny_cost_ledger ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_donny_cost_ledger_user_created
  ON donny_cost_ledger (user_id, created_at);

CREATE INDEX IF NOT EXISTS idx_donny_cost_ledger_created
  ON donny_cost_ledger (created_at);

-- No public policies — admin/service-role access only.

CREATE TABLE IF NOT EXISTS donny_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  actions_used integer NOT NULL DEFAULT 0,
  actions_budget integer NOT NULL DEFAULT 50,
  current_stage text NOT NULL DEFAULT 'full_power'
    CHECK (current_stage IN ('full_power', 'conservation', 'essential')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, period_start)
);

ALTER TABLE donny_usage ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "users_read_own_usage"
    ON donny_usage FOR SELECT
    USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
