-- AIOS PR 8: bug & error findings — the first report-only self-improving loop.
-- Written ONLY by the service-role aios-report-ingest function (the sweep agent
-- never touches tables directly); admins triage from /internal/findings.
-- Admin-only in both directions: findings may reference internals (stack
-- traces, user ids), so stakeholders never see them (decision #2).

CREATE TABLE IF NOT EXISTS public.aios_findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  severity text NOT NULL CHECK (severity IN ('critical','high','medium','low')),
  title text NOT NULL,
  summary_md text NOT NULL,
  evidence jsonb NOT NULL DEFAULT '{}',
  source text NOT NULL DEFAULT 'bug-sweep-agent',
  status text NOT NULL CHECK (status IN ('open','acknowledged','resolved','wontfix')) DEFAULT 'open',
  -- Stable dedup key computed by the agent (e.g. "edge:donny-chat:anthropic-400").
  -- Re-sweeps upsert on it: occurrences bump instead of duplicate rows, and a
  -- recurrence of a RESOLVED finding reopens it (regression signal).
  fingerprint text UNIQUE,
  occurrences integer NOT NULL DEFAULT 1,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_aios_findings_status ON public.aios_findings (status, severity);

ALTER TABLE public.aios_findings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "aios_findings_admin_select" ON public.aios_findings;
CREATE POLICY "aios_findings_admin_select" ON public.aios_findings
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- Triage: admins update status. No INSERT/DELETE for app users — rows arrive
-- via the service-role ingest function only.
DROP POLICY IF EXISTS "aios_findings_admin_update" ON public.aios_findings;
CREATE POLICY "aios_findings_admin_update" ON public.aios_findings
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TRIGGER trg_aios_findings_updated_at
  BEFORE UPDATE ON public.aios_findings
  FOR EACH ROW EXECUTE FUNCTION handle_updated_at();
