-- AIOS PR 5: full-markdown store for the /internal/strategy viewer.
-- Strategy/GTM docs must never enter the public Vite bundle; the internal UI
-- fetches them at runtime behind RLS. Rows are written only by the
-- donny-knowledge-sync edge function (service role).
CREATE TABLE IF NOT EXISTS public.internal_docs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  path text NOT NULL UNIQUE,
  title text NOT NULL,
  content_md text NOT NULL,
  tags text[] NOT NULL DEFAULT '{}',
  source_hash text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.internal_docs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "internal_docs_internal_select" ON public.internal_docs;
CREATE POLICY "internal_docs_internal_select" ON public.internal_docs
  FOR SELECT TO authenticated
  USING (public.is_internal_user());

CREATE TRIGGER trg_internal_docs_updated_at
  BEFORE UPDATE ON public.internal_docs
  FOR EACH ROW EXECUTE FUNCTION handle_updated_at();
