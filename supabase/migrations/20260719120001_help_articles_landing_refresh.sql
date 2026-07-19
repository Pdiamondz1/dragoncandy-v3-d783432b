-- Refresh the landing-page screenshot on the three sign-up articles.
--
-- The May 2026 `help-landing-page.png` predates two full landing redesigns and
-- is stale. The experimental storage CLI can't overwrite an object in place, so
-- we uploaded the fresh capture as a NEW file (`help-landing-page-2026-07.png`,
-- 2026-07-19) and repoint the three sign-up articles to it. `replace` swaps the
-- single <img src> in each body; guarded on the old filename so it's idempotent.
-- The old `help-landing-page.png` stays in the bucket as an unused spare.

UPDATE public.help_articles
SET body = replace(body, 'help-landing-page.png', 'help-landing-page-2026-07.png'),
    updated_at = now()
WHERE slug IN ('signup-brand', 'signup-creator', 'signup-restaurant')
  AND body LIKE '%help-landing-page.png%';
