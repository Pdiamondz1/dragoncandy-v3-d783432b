# Dezzy AI — Weekly SEO Article (Domain 6 SEO slice, report-only) — Design Spec

- **Date:** 2026-06-28
- **Status:** Draft (for review)
- **Branch/worktree:** `DC-Dezzy-AI-2` (branch `feat/aios-dezzy-seo-articles`)
- **Source idea:** `docs/wiki/analyses/dragoncandy-dame-ai-the-business-growth-agent-system-spec.md` §Domain 6
  ("SEO & Organic Discovery")
- **Suite siblings:** `dezzy-outreach` (#3), `dezzy-content-calendar`/`dezzy-website-updates` (#1+#2),
  `dezzy-weekly-brief` (#5), `dezzy-press-events-agent` (#4). Concept:
  `docs/wiki/concepts/dezzy-agent-playbook-suite.md`.

## 1. Context & problem

Domain 6 (the Amplification Engine / "automatic economy of scale") is **multi-piece**, and most of it is
**gated on data that does not exist yet** (verified read-only against prod, project `zocahiffooqdybdhguqv`):

- DRE-milestone celebration posts (the headline economy-of-scale core) — `dragon_point_events`,
  `dragon_point_balances`, and `dragonshare_engagement` are **empty** (PR #196 applied the DRE *schema* to
  prod but held the award-engine cron pending an edge-fn deploy), and there is **no milestone/tier-change
  event** to read (tier is a current-state text column, no history). → **gated.**
- Restaurant case studies — no restaurant is near the "10th campaign" threshold. → gated.
- Referral thank-yous — **no referral table exists.** → blocked.
- Boost-performing-content (>1k views) — `dragonshare_engagement` empty. → blocked.

The one piece **feasible now** is **SEO & Organic Discovery**: drafting genuinely-useful articles that target
high-intent search terms, a $0-cost organic-acquisition channel that compounds over 6–12 months. It needs
**no row-level/DRE/engagement data** — only DragonCandy's positioning + the marketplace balance — so it ships
as a **pure-seed Founder Playbook**, exactly like `dezzy-content-calendar` / `dezzy-website-updates`.

**Invariant preserved:** report-only — Dezzy drafts; the founder reviews and publishes to the blog.

## 2. Verified constraint (why this is a pure seed)

`aios-playbook-run` already exposes `get_internal_doc` (reads the strategy library, incl. PROJECT_CONTEXT in
full), `get_platform_stats` (live role counts), and the mandatory `done_check` + report-only mode
(`allowed_proposals: []`). `/internal/playbooks` renders any playbook by slug. An SEO article is generative
prose grounded in positioning — no new tool, no edit to `aios-playbook-run`, no table, no UI. **Just a seed
row.**

## 3. Goals / non-goals

**Goals (v1):** a report-only `dezzy-seo-articles` Founder Playbook that, on demand, drafts **one**
publish-ready SEO article targeting a high-intent search term for organic acquisition, at
`/internal/playbooks/dezzy-seo-articles`.

**Non-goals (deferred / gated):**
- The DRE-milestone celebration core + restaurant case studies + referral thank-yous +
  boost-performing-content — gated/blocked (§1); reopen when the DRE award engine is live + emits milestone
  events (and when a referral system / engagement data exist).
- Auto-publishing to the blog (founder publishes manually — same draft-only invariant as the other playbooks).
- Multi-article batches / a content backlog (v1 drafts one article per run).
- A run-history tool to avoid repeating topics (mitigated by the grounded selection heuristic, §4.1).

## 4. Design

One idempotent row in `aios_playbooks` (`allowed_proposals: '[]'`, report-only). Voice "Dezzy"; engine
identity stays "Donny".

### 4.1 `dezzy-seo-articles` — "Dezzy — Weekly SEO Article"

**Grounded topic selection (no run-history needed).** Call `get_platform_stats` (creator vs restaurant
counts → which side of the marketplace is under-supplied) and `get_internal_doc` (PROJECT_CONTEXT
positioning, North Star, GTM phase, target metros, origin story). Pick **this week's target** = a high-intent
keyword for the side to grow, from this menu (seeded from spec §Domain 6; the model may also pick a closely
related long-tail variant in the same intent):
- *creator acquisition:* "how to get paid as a food creator", "food content creator jobs near me \[metro]",
  "how much do food influencers charge", "how to become a food content creator"
- *restaurant acquisition:* "best way to get social media content for my restaurant", "how to find local
  food influencers", "restaurant social media marketing ideas", "how to get more customers with social media"
- **GTM override:** honor PROJECT_CONTEXT's GTM rule (**creators are onboarded before restaurants** in a new
  market). If that conflicts with the raw under-supplied count, the **GTM phase wins** — state which rule you
  applied and why.

**task_md** — Draft ONE publish-ready SEO article for dragoncandy.io/blog targeting that keyword. Output:
- the **target keyword**, the **search intent**, and **which side it acquires** (creator / restaurant);
- an **SEO title** (~60 chars, keyword-led), a **meta description** (~155 chars), and a **URL slug**;
- an **H1** + a full multi-section body (H2/H3) that is **genuinely useful to the reader** (real, specific
  how-to help — Google E-E-A-T — not thin or keyword-stuffed);
- **one** natural DragonCandy CTA, naming which page it links to;
- 2–3 suggested internal links.
The how-to substance is general expertise written for the audience (that's fine); but **any DragonCandy-
specific number, claim, feature, or page path must trace to `get_internal_doc` or `get_platform_stats` (a
tool result), or be a clearly-marked placeholder** — never invent a metric, testimonial, feature, or URL.
**Links/CTA targets:** no tool enumerates the site's routes or existing blog posts, so treat the CTA target
and internal links as **suggestions the founder confirms at publish** — write any specific path you can't
verify from a tool as a bracketed placeholder (e.g. `[CONFIRM PATH: /for-creators]`), never a confident
invented URL. (Reuse the bracketed-placeholder convention from the other Dezzy playbooks.) Pre-revenue you
will rarely have a DragonCandy number worth citing — that's expected; lean on useful advice, not stats.

**preferences_md** — Write as Dezzy, DragonCandy's growth agent (VOICE only; engine identity stays "Donny").
Helpful, benefit-led, plain-spoken, credible (E-E-A-T) — **never spammy or keyword-stuffed**; the reader
should get real value whether or not they sign up. Since DragonCandy has **no published case studies or
testimonials yet**, earn credibility through the **depth and specificity of the advice** — never reach for a
fabricated proof point to hit the E-E-A-T bar. One clear CTA. Markdown article, no pipe tables. Never
fabricate a DragonCandy stat, quote, feature, or URL — clearly-marked placeholders are fine, invented facts
are not.

**done_criteria_md** — The article has: target keyword + intent + audience; SEO title; meta description;
slug; H1 + a multi-section useful body; exactly one DragonCandy CTA (with its link target); 2–3 suggested
internal links. The body is genuinely useful (not thin/keyword-stuffed). TRACEABILITY: every
DragonCandy-specific number, claim, feature, and page path traces to a tool result or is a clearly-marked
placeholder (e.g. `[CONFIRM PATH: …]`); nothing — no stat, feature, testimonial, or URL — is fabricated.
Ends with the required JSON self-assessment.

**allowed_proposals** — `[]`.

### 4.2 Mechanism (v1 = pull)
The founder opens `/internal/playbooks/dezzy-seo-articles`, clicks **Run now** (weekly, during the Monday
review), reviews the article, and publishes it to the blog. Reuses the run UI, `aios_playbook_runs` storage,
the in-flight guard, and the done-check chip — no new UI.

## 5. Scope of change

- **Create:** `supabase/migrations/20260628120000_aios_dezzy_seo_articles_seed.sql` — one idempotent
  `INSERT ... ON CONFLICT (slug) DO NOTHING;`, mirroring the prior Dezzy seeds.
- **Create:** this spec.
- **Knowledge-sync:** extend `docs/wiki/concepts/dezzy-agent-playbook-suite.md` (Domain 6 SEO slice shipped;
  the milestone economy-of-scale core remains gated on the DRE); `index.md`, `log.md`; PROJECT_CONTEXT bullet.
- **None of:** new table, new RPC/tool, edit to `aios-playbook-run` / any edge function, new secret, new UI,
  schedule, or `donny-chat` change.

## 6. Verification

1. `npm run build` from the worktree cwd (no source change → expected green).
2. Apply the seed to prod (`zocahiffooqdybdhguqv`) via Supabase MCP `apply_migration`; confirm
   `select slug, title, allowed_proposals, status from aios_playbooks where slug = 'dezzy-seo-articles';`
   (active, report-only).
3. As admin, open `/internal/playbooks/dezzy-seo-articles` → **Run now**.
4. Eyeball the run: a complete, genuinely-useful article on a target keyword chosen for the under-supplied
   side; all SEO fields present; one CTA; no fabricated DragonCandy stats; done-check chip reads **Done**.
5. `codex-review` (`codex review --base origin/main`); fix, re-run until clean; relay verdict.
6. `knowledge-sync`; after merge, post-merge hook syncs the RAG.

## 7. Risks

- **Topic repetition across weeks** — no run-history tool, so successive runs could repeat a keyword. Mitigated
  by the grounded selection heuristic (under-supplied side + GTM phase shifts the target as the marketplace
  changes); a run-history-aware selector is a v2 if repetition proves real.
- **Thin / spammy SEO output** — mitigated by the E-E-A-T "genuinely useful" requirement in
  `preferences_md` + the done-criteria + the founder publish-review gate.
- **No-fabrication** — DragonCandy claims must trace to a tool or be a marked placeholder; the general how-to
  advice is legitimately the model's expertise (not a fabricated fact about DragonCandy).
- **Output token ceiling** — report-only runs at `max_tokens: 8192`; one article fits comfortably.

## 8. Open questions for review

1. One article per run (Plan), or draft a small batch? (Plan: one — quality over volume, matches the
   weekly cadence.)
2. Grounded auto-selection of the keyword (Plan), or let the founder pass the topic in? (Plan: auto-select
   from the under-supplied side; the founder can always re-run or edit. A topic-input parameter would need a
   run-arg path the playbook runner doesn't expose today.)
3. Seed via migration vs the `/internal/playbooks` UI? (Plan: migration, reproducible/in-repo.)
