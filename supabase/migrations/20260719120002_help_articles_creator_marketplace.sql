-- Rename "public marketplace" -> "creator marketplace" in the business crews article.
--
-- The campaign builder's "Post to" selector now labels the public option
-- "Creator marketplace" (src/components/campaigns/GroupTargetSelect.tsx) — from a
-- business's point of view what they post into is the pool of creators, not an
-- abstract "public". The business-only `creator-crews` article used the old phrase,
-- so a business reading /help saw wording the app no longer uses.
--
-- Scoped to that one slug on purpose: the creator-facing sibling article and the
-- pricing/legal pages use "marketplace" in contexts that are correct as written.
-- Guarded on the old phrase so re-running is a no-op.

UPDATE public.help_articles
SET body = replace(body, 'the public marketplace', 'the creator marketplace'),
    updated_at = now()
WHERE slug = 'creator-crews'
  AND body LIKE '%the public marketplace%';
