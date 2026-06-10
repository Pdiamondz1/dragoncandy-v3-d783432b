-- Autoresearch → Donny: allow the wiki research loop to sync verified pages into
-- donny_knowledge as a distinct, auditable source type, with idempotent upserts.
--
-- Additive only: widens an existing CHECK constraint and adds an index. No columns
-- dropped or renamed. Donny's existing RAG retrieval (match_donny_knowledge) picks up
-- 'wiki' rows automatically — no retrieval change needed.

-- 1. Extend source_type to include 'wiki'.
ALTER TABLE public.donny_knowledge
  DROP CONSTRAINT IF EXISTS donny_knowledge_source_type_check;

ALTER TABLE public.donny_knowledge
  ADD CONSTRAINT donny_knowledge_source_type_check
  CHECK (source_type = ANY (ARRAY[
    'help_article'::text,
    'feature_doc'::text,
    'pricing'::text,
    'tour'::text,
    'dragonshare'::text,
    'campaign'::text,
    'wiki'::text
  ]));

-- 2. Idempotency: one knowledge row per wiki page. The sync keys on
--    metadata->>'source_id' (e.g. 'wiki:concepts/self-improving-app'), so re-syncing
--    a page updates its row instead of duplicating it.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_donny_knowledge_wiki_source_id
  ON public.donny_knowledge ((metadata->>'source_id'))
  WHERE source_type = 'wiki';
