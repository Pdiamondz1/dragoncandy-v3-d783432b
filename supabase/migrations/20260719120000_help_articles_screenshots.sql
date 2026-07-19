-- Embed refreshed feature screenshots into the new-feature help articles.
--
-- The images live in the public `help-screenshots` storage bucket (uploaded
-- 2026-07-19). We insert each <img> right after the article's intro <p> using a
-- targeted regexp_replace on the FIRST </p> — Postgres replaces only the first
-- match when the 'g' flag is absent, so the intro paragraph's closing tag is the
-- anchor and we never transcribe the full body (zero drift risk). Each UPDATE is
-- idempotent (guarded on the filename) and bumps updated_at; the
-- trg_help_articles_search_vector trigger reindexes on the body change.
--
-- <img> markup matches the existing convention (see 20260512000001):
--   class="rounded-xl shadow-md my-4 max-w-full" + descriptive alt.

UPDATE public.help_articles
SET body = regexp_replace(
      body, '</p>',
      $img$</p>

<img src="https://zocahiffooqdybdhguqv.supabase.co/storage/v1/object/public/help-screenshots/help-launch-campaign.png" class="rounded-xl shadow-md my-4 max-w-full" alt="The Create a Campaign screen where you paste a link or describe your business and Donny drafts the campaign" />$img$
    ),
    updated_at = now()
WHERE slug = 'launch-campaign'
  AND body NOT LIKE '%help-launch-campaign.png%';

UPDATE public.help_articles
SET body = regexp_replace(
      body, '</p>',
      $img$</p>

<img src="https://zocahiffooqdybdhguqv.supabase.co/storage/v1/object/public/help-screenshots/help-find-creators-near-me.png" class="rounded-xl shadow-md my-4 max-w-full" alt="The Find Creators page with the near-me location and distance control, showing creators sorted by distance with miles-away labels" />$img$
    ),
    updated_at = now()
WHERE slug = 'find-creators-near-me'
  AND body NOT LIKE '%help-find-creators-near-me.png%';

UPDATE public.help_articles
SET body = regexp_replace(
      body, '</p>',
      $img$</p>

<img src="https://zocahiffooqdybdhguqv.supabase.co/storage/v1/object/public/help-screenshots/help-creator-crews.png" class="rounded-xl shadow-md my-4 max-w-full" alt="The Crews page showing a private crew of trusted creators for free, ambassador-style collaborations" />$img$
    ),
    updated_at = now()
WHERE slug = 'creator-crews'
  AND body NOT LIKE '%help-creator-crews.png%';

UPDATE public.help_articles
SET body = regexp_replace(
      body, '</p>',
      $img$</p>

<img src="https://zocahiffooqdybdhguqv.supabase.co/storage/v1/object/public/help-screenshots/help-apply-campaign.png" class="rounded-xl shadow-md my-4 max-w-full" alt="A campaign detail with the Apply for This Campaign button" />$img$
    ),
    updated_at = now()
WHERE slug = 'apply-campaign'
  AND body NOT LIKE '%help-apply-campaign.png%';

UPDATE public.help_articles
SET body = regexp_replace(
      body, '</p>',
      $img$</p>

<img src="https://zocahiffooqdybdhguqv.supabase.co/storage/v1/object/public/help-screenshots/help-dragon-feed.png" class="rounded-xl shadow-md my-4 max-w-full" alt="The Dragon Feed grid of creator content with the location and distance creator search" />$img$
    ),
    updated_at = now()
WHERE slug = 'dragon-feed'
  AND body NOT LIKE '%help-dragon-feed.png%';

UPDATE public.help_articles
SET body = regexp_replace(
      body, '</p>',
      $img$</p>

<img src="https://zocahiffooqdybdhguqv.supabase.co/storage/v1/object/public/help-screenshots/help-dragon-rewards.png" class="rounded-xl shadow-md my-4 max-w-full" alt="The creator dashboard showing the DC Points balance and current standing tier" />$img$
    ),
    updated_at = now()
WHERE slug = 'dragon-rewards'
  AND body NOT LIKE '%help-dragon-rewards.png%';

UPDATE public.help_articles
SET body = regexp_replace(
      body, '</p>',
      $img$</p>

<img src="https://zocahiffooqdybdhguqv.supabase.co/storage/v1/object/public/help-screenshots/help-what-is-donny.png" class="rounded-xl shadow-md my-4 max-w-full" alt="The Donny assistant panel with quick actions and help suggestions" />$img$
    ),
    updated_at = now()
WHERE slug = 'what-is-donny'
  AND body NOT LIKE '%help-what-is-donny.png%';
