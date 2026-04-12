-- Create donny_nudges table for ambient notification layer
CREATE TABLE IF NOT EXISTS public.donny_nudges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('application', 'content', 'milestone', 'payment', 'invitation', 'match')),
  source_table text NOT NULL,
  source_id uuid NOT NULL,
  raw_data jsonb NOT NULL DEFAULT '{}',
  summary text NOT NULL,
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('high', 'medium', 'low')),
  actions jsonb NOT NULL DEFAULT '[]',
  read_at timestamptz,
  acted_at timestamptz,
  dismissed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Index for fast user queries (active nudges)
CREATE INDEX idx_donny_nudges_user_active
  ON public.donny_nudges (user_id, created_at DESC)
  WHERE acted_at IS NULL AND dismissed_at IS NULL;

-- Index for source deduplication
CREATE UNIQUE INDEX idx_donny_nudges_source
  ON public.donny_nudges (user_id, source_table, source_id);

-- Enable RLS
ALTER TABLE public.donny_nudges ENABLE ROW LEVEL SECURITY;

-- Users can only read their own nudges
CREATE POLICY "Users can read own nudges"
  ON public.donny_nudges FOR SELECT
  USING (auth.uid() = user_id);

-- Users can update their own nudges (mark read, acted, dismissed)
CREATE POLICY "Users can update own nudges"
  ON public.donny_nudges FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- No INSERT policy needed — the service role (used by edge functions) bypasses RLS.
-- If client-side inserts are ever needed, add a restricted policy.

-- Enable realtime for nudges
ALTER PUBLICATION supabase_realtime ADD TABLE public.donny_nudges;
