# Session — Dezzy AI Weekly SEO Article (Domain 6 SEO slice)

- **Date:** 2026-06-28
- **Branch:** `feat/aios-dezzy-seo-articles` (worktree `DC-Dezzy-AI-2`)
- **Spec:** `docs/superpowers/specs/2026-06-28-dezzy-seo-articles-design.md`
- **Source idea:** `docs/wiki/analyses/dragoncandy-dame-ai-the-business-growth-agent-system-spec.md` §Domain 6
  ("SEO & Organic Discovery")
- **Suite siblings:** `dezzy-outreach` (#3), `dezzy-content-calendar`/`dezzy-website-updates` (#1+#2),
  `dezzy-weekly-brief` (#5), `dezzy-press-events-agent` (#4).

## What shipped

The **SEO / organic-discovery slice of Domain 6** — a fifth report-only Dezzy Founder Playbook:

- **`dezzy-seo-articles` — "Dezzy — Weekly SEO Article"**: drafts ONE publish-ready SEO article per run
  targeting a high-intent search term for $0 organic acquisition (creators or restaurants). Founder reviews
  + publishes to the blog. Grounded selection via `get_platform_stats` (which marketplace side to grow) +
  `get_internal_doc` (positioning, GTM phase). Pure-seed playbook — no new tool, no `aios-playbook-run`
  edit, no table/UI.

## Key decision — Domain 6 is mostly GATED; only the SEO slice was feasible

A read-only prod probe (project `zocahiffooqdybdhguqv`) showed Domain 6's headline "economy of scale" core
**cannot be built yet**:
- `dragon_point_events`, `dragon_point_balances`, `dragonshare_engagement` are all **empty** — PR #196
  applied the DRE *schema* to prod but held the award-engine cron pending an edge-fn deploy, so no
  points/tiers/badges are awarded, and there is **no milestone/tier-change event** to read (tier is a
  current-state text column, no history).
- **No referral table exists** → referral thank-yous blocked.
- No restaurant is near the "10th campaign" threshold → case studies gated.

So the milestone-celebration core, case studies, referral thank-yous, and boost-performing-content are
**deferred/gated** (they reopen when the DRE award engine is live + emits milestone events). The **SEO
article** piece needs none of that data — only positioning + the marketplace balance — so it ships now as a
pure seed (the project's "don't build a recommender against a dark signal" discipline: build the feasible
lever, gate the dark ones).

## Disciplines (carried in the seed)

- **E-E-A-T, genuinely useful** — not thin/keyword-stuffed; since DragonCandy has no published case
  studies/testimonials yet, credibility comes from depth, never fabricated proof points.
- **No fabrication** — any DragonCandy stat/claim/feature/page-path traces to a tool (`get_internal_doc` /
  `get_platform_stats`) or is a clearly-marked placeholder; links/CTA targets are founder-confirmed
  (`[CONFIRM PATH: …]`), never invented URLs.
- **GTM override** — "creators onboarded before restaurants" wins over a raw under-supplied count.

## Review

- spec-reviewer Approved (2 issues fixed: the no-fab source mismatch where task_md named only
  `get_platform_stats` while positioning comes from `get_internal_doc`; and ungroundable link/CTA targets →
  founder-confirmed placeholders). Codex-clean.
- First live run is founder-triggered (admin session at `/internal/playbooks/dezzy-seo-articles`).

## Affected files / artifacts

- `supabase/migrations/20260628120000_aios_dezzy_seo_articles_seed.sql`
- `docs/superpowers/specs/2026-06-28-dezzy-seo-articles-design.md`
- **No** `src/`, edge-function, table (beyond the seed INSERT), RLS, secret, or OAuth change.
