-- Help Articles: add a full-text search_vector (so Donny's guidance_agent textSearch works)
-- and a new 'rewards' category. Additive + non-destructive.
--
-- NOTE: a GENERATED column using to_tsvector('english', …) is rejected by Postgres as
-- "generation expression is not immutable" (resolving the text-search config is not
-- immutable). The canonical pattern is a plain tsvector column kept in sync by a trigger,
-- plus a one-time backfill of existing rows.

-- 1) Plain tsvector column + trigger over title/body/search_terms.
ALTER TABLE public.help_articles
  ADD COLUMN IF NOT EXISTS search_vector tsvector;

CREATE OR REPLACE FUNCTION public.help_articles_set_search_vector()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  NEW.search_vector := to_tsvector('english',
    coalesce(NEW.title, '') || ' ' ||
    coalesce(NEW.body, '') || ' ' ||
    coalesce(array_to_string(NEW.search_terms, ' '), ''));
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_help_articles_search_vector ON public.help_articles;
CREATE TRIGGER trg_help_articles_search_vector
  BEFORE INSERT OR UPDATE OF title, body, search_terms
  ON public.help_articles
  FOR EACH ROW
  EXECUTE FUNCTION public.help_articles_set_search_vector();

-- Backfill existing rows (the trigger only fires on future writes).
UPDATE public.help_articles
  SET search_vector = to_tsvector('english',
    coalesce(title, '') || ' ' ||
    coalesce(body, '') || ' ' ||
    coalesce(array_to_string(search_terms, ' '), ''));

CREATE INDEX IF NOT EXISTS idx_help_articles_search_vector
  ON public.help_articles USING gin (search_vector);

-- 2) Add the 'rewards' category to the CHECK constraint.
ALTER TABLE public.help_articles
  DROP CONSTRAINT IF EXISTS help_articles_category_check;

ALTER TABLE public.help_articles
  ADD CONSTRAINT help_articles_category_check
  CHECK (category IN (
    'getting_started', 'campaigns', 'dragonshare', 'billing',
    'account', 'donny_ai', 'messaging', 'rewards'
  ));
