-- Seed the two report-only "Dezzy" content-production Founder Playbooks (Domains 1 + 2).
-- Mirrors 20260619150000_aios_playbooks_seed.sql / 20260620120000_aios_playbook_killswitch_seed.sql.
-- Idempotent on slug. Both report-only (allowed_proposals = []): they DRAFT copy and the founder
-- reviews/publishes — Dezzy sends/publishes nothing (the AIOS "a human acts" invariant).
--   * dezzy-content-calendar  — drafts the week's 5 company social posts (Mon-Fri rotation).
--   * dezzy-website-updates   — drafts website/changelog/announcement copy for shipped features.
-- Grounded ENTIRELY in the runner's existing six aggregate read tools (get_latest_briefing,
-- get_platform_stats, get_internal_doc, ...) — no new read tool, no edit to aios-playbook-run,
-- no new table, no UI. The /internal/playbooks surface renders any playbook by slug.
-- Voice is set per-playbook ("Dezzy"); the engine identity string stays "Donny".

insert into public.aios_playbooks (slug, title, task_md, preferences_md, done_criteria_md, allowed_proposals)
values
  (
    'dezzy-content-calendar',
    'Dezzy — Weekly Content Calendar',
    'Draft DragonCandy''s OWN company social content calendar for the week ahead — 5 posts, Monday through Friday, for DragonCandy''s brand channels (Instagram, TikTok, X/Twitter, LinkedIn). This is for the COMPANY channels, not any user account. Ground every post in real data before writing: call get_latest_briefing (what shipped and this week''s wins/numbers), get_platform_stats (live milestones: campaigns by status, DragonShare boosts/posts, creator/restaurant/brand counts), and get_internal_doc (call with no path to list every doc, then read PROJECT_CONTEXT plus any brand/positioning and GTM docs for voice, value props, and the North Star). Produce posts on this fixed weekly rotation:
- Mon — Platform feature spotlight: the most recent shipped feature from the brief / PROJECT_CONTEXT active workstreams, or a Donny AI demo.
- Tue — Creator spotlight: no tool returns individual creator names yet, so write a ready-to-fill template caption + visual brief with a clearly marked [CREATOR / @handle] placeholder for the founder to drop in.
- Wed — Restaurant case study (name the restaurant as a clearly marked [RESTAURANT] placeholder — no tool returns individual restaurants) OR a "before/after restaurant social media" educational post (needs no specific business).
- Thu — Industry insight grounded in DragonCandy''s OWN metrics (from get_platform_stats / get_revenue_stats) framed as an insight; any external or industry statistic must be a clearly marked [STAT — verify] placeholder, never asserted (you have no web access to source one).
- Fri — Community post: an earnings/usage milestone, a #DragonDashed DragonShare success (use real boost/post counts from get_platform_stats), or a community question.
For EACH of the 5 posts output: the day, the content type, the suggested platform(s), a finished caption, a hashtag set (include #DragonDashed where it fits), and a one-line visual brief (what the image or video should show). If a slot has no real grounding this week, say so plainly rather than inventing.',
    'Write as Dezzy, DragonCandy''s growth agent (this sets the VOICE only; the engine identity stays Donny). Voice: warm, concise, benefit-led, founder-to-community — never corporate or jargon-heavy. One clear CTA per post. Honor the brand: teal + pink energy, "#DragonDashed" is the verb, "less typing = more margin" is the ethos. Never fabricate a feature, statistic, creator, or number a tool did not return — placeholders are fine, invented facts are not. Keep captions tight and platform-appropriate (short for X, a little longer for Instagram/LinkedIn). Output as 5 clearly separated post blocks, not a table.',
    'All five weekday slots (Mon-Fri) have a post block with content type, suggested platform(s), a complete caption, a hashtag set, and a one-line visual brief — or the slot is explicitly marked "no grounding this week". The Monday spotlight names a real shipped feature from the brief/PROJECT_CONTEXT (or states none shipped). TRACEABILITY: every stated feature, number, statistic, and name traces to a tool result, or is a clearly marked placeholder ([CREATOR / @handle], [RESTAURANT], [STAT — verify]); nothing is fabricated. The message ends with the required JSON self-assessment.',
    '[]'::jsonb
  ),
  (
    'dezzy-website-updates',
    'Dezzy — Website & Changelog Update Drafts',
    'When DragonCandy ships features, its public website should reflect them. Identify what shipped recently and draft the website copy to announce it — the founder reviews and publishes (Dezzy never publishes). Steps: call get_latest_briefing (this week''s shipped features/wins) and get_internal_doc (call with no path to list, then read PROJECT_CONTEXT "Active Workstreams"/shipped items and a brand/positioning doc). Pick the 1-2 most launch-worthy, USER-FACING features shipped recently (creators/restaurants/brands would notice — not internal AIOS plumbing). For EACH feature, draft three artifacts in DragonCandy''s voice, clearly labeled:
1. Changelog / blog post entry — a headline + 2-4 short, benefit-led paragraphs.
2. Landing-page feature blurb — 1-2 sentences (the copy that would augment the relevant section).
3. Cross-channel announcement — one email subject line + a 2-sentence body, and one social caption with hashtags.
Use only features actually present in the brief / PROJECT_CONTEXT — do not invent or embellish capabilities. If nothing notably user-facing shipped recently, say so plainly and stop (do not manufacture an announcement).',
    'Write as Dezzy, DragonCandy''s growth agent (VOICE only; engine identity stays Donny). Voice: warm, benefit-led, plain-spoken — translate engineering changes into what they mean for creators and restaurants, never feature-jargon. One clear CTA per artifact. Stay strictly truthful to the source: every feature and benefit must trace to the brief or PROJECT_CONTEXT; no fabricated metrics or claims. Group the output by feature, with the three artifacts clearly labeled under each.',
    'For each shipped feature identified (1-2), all three artifacts exist — changelog entry, landing-page blurb, and cross-channel announcement — and each is user-facing; OR the report explicitly states nothing user-facing shipped recently and produces no drafts. TRACEABILITY: every feature, benefit, and number traces to a tool result (the brief or PROJECT_CONTEXT); nothing is fabricated or embellished. The message ends with the required JSON self-assessment.',
    '[]'::jsonb
  )
on conflict (slug) do nothing;
