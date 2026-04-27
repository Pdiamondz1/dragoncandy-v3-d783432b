-- Enable pgvector
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

-- Knowledge base for RAG
CREATE TABLE IF NOT EXISTS public.donny_knowledge (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}',
  embedding extensions.vector(1536),
  source_type text NOT NULL CHECK (source_type IN (
    'help_article', 'feature_doc', 'pricing', 'tour', 'dragonshare', 'campaign'
  )),
  search_vector tsvector GENERATED ALWAYS AS (to_tsvector('english', content)) STORED,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- HNSW index for fast cosine similarity (works without pre-populated data)
CREATE INDEX IF NOT EXISTS idx_donny_knowledge_embedding
  ON public.donny_knowledge
  USING hnsw (embedding extensions.vector_cosine_ops);

-- Full-text search fallback index
CREATE INDEX IF NOT EXISTS idx_donny_knowledge_search_vector
  ON public.donny_knowledge USING gin (search_vector);

-- Filtered retrieval
CREATE INDEX IF NOT EXISTS idx_donny_knowledge_source_type
  ON public.donny_knowledge (source_type, created_at);

-- Auto-update timestamp
CREATE TRIGGER trg_donny_knowledge_updated_at
  BEFORE UPDATE ON public.donny_knowledge
  FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

-- RLS: authenticated read, service role full
ALTER TABLE public.donny_knowledge ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read knowledge"
  ON public.donny_knowledge FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service role manages knowledge"
  ON public.donny_knowledge FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);
