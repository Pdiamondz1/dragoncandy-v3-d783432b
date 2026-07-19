# Session — Help Center screenshots + sidebar link & improved search (2026-07-19)

Two founder-driven help-center efforts, shipped as two PRs off the same `dc-help-page` worktree.
Both **frontend + content only** — no schema, RLS, edge function, or secret change. Compounds onto
the existing [[Help Center & Donny Guidance]] concept.

## Effort 1 — Screenshots on help articles (PR #306, merged + prod-verified)

**Ask:** "add screenshots to help page knowledge base features."

**Discovery that reframed it:** an undocumented screenshot system already existed — a **public Supabase
storage bucket `help-screenshots`** (16 PNGs from 2026-05-12) whose images are embedded in article
`body` HTML as `<img src="…/storage/v1/object/public/help-screenshots/<file>.png" class="rounded-xl
shadow-md my-4 max-w-full" alt="…">`. `HelpArticlePage.tsx` already sanitizes `body` (DOMPurify) and
styles `[&_img]`, and CSP `img-src` already allows `https://*.supabase.co`. So the job was **not** "build
a mechanism" — it was **refresh the stale May shots + add screenshots for the new-feature articles that
had none**. (10 of the 16 were referenced by 13 articles; 6 were unused spares.)

**What shipped:**
- **7 new feature screenshots**, captured live from prod via the founder's Chrome (restaurant + creator
  dashboards + logged-out landing), converted JPG→PNG, uploaded to the bucket, and embedded into:
  `launch-campaign`, `find-creators-near-me`, `creator-crews`, `apply-campaign`, `dragon-feed`,
  `dragon-rewards`, `what-is-donny`.
- **1 landing refresh:** the stale May `help-landing-page.png` (two full landing redesigns out of date)
  replaced — but see the CLI gotcha below — and the 3 sign-up articles repointed to the fresh file.
- Two content migrations, applied to prod via MCP: `20260719120000_help_articles_screenshots.sql`
  (embeds the 7) + `20260719120001_help_articles_landing_refresh.sql` (repoints the 3 sign-up articles).

**Key decisions / gotchas:**
- **Reuse the existing bucket**, drop the invented `/public/help-media/` static idea.
- **Donny is untouched:** `guidance_agent` strips HTML to plain text, so screenshots never reach Donny;
  no edge-function change, no `edge-function-reviewer` pass needed. Images are human-help-only.
- **Migration inserts `<img>` via a targeted `regexp_replace(body, '</p>', …)`** (3-arg form replaces
  only the FIRST match), so the intro paragraph's closing tag is the anchor and the full body is never
  transcribed (zero drift). Idempotent (`AND body NOT LIKE '%<file>%'`), bumps `updated_at`, and the
  `search_vector` trigger reindexes automatically. Dry-run confirmed exactly one `<img>` per article and
  that `dragon-rewards` (two `<p>`) was touched only once.
- **CLI upload recipe (hard-won):** `supabase storage cp --experimental --workdir "<linked-repo>"
  "<RELATIVE-src>" "ss:///help-screenshots/<dest>.png"` — from **PowerShell** (Git Bash's MSYS mangles
  the `ss://` arg). The src MUST be **relative** (run from the image dir): an absolute `C:\…` path makes
  cp think it's a local-to-local copy ("LegacyStorageUnsupportedOperationError"). `--project-ref` is NOT
  accepted by `storage cp`; `--workdir` (pointing at the linked project) supplies the link.
- **cp will NOT overwrite** an existing object (409 Duplicate), and `storage rm` **silently no-ops**
  (`deleted:[]`). So to "replace" the landing image, we uploaded a **new** filename
  (`help-landing-page-2026-07.png`) and repointed the 3 sign-up articles via a `replace(body,'old','new')`
  migration — **additive, not an in-place overwrite**. The old file just becomes another unused spare.

**Verified live:** all 7 articles carry exactly one image; the 3 sign-up articles show the fresh landing;
`/help/launch-campaign`, `/help/signup-restaurant`, `/help/dragon-feed` render their screenshots, no
console errors. Codex second review clean.

## Effort 2 — Help in the desktop sidebar + improved `/help` search (PR #310, merged + prod-verified)

**Ask:** (1) make `/help` reachable from the desktop nav sidebar; (2) a search bar on `/help`.

**Discovery:** `/help` **already had a search bar** (subtle, unranked substring). And Help was already in
the desktop **account dropdown** + mobile **drawer** — just not the visible left sidebar nav. So Part 2
was "improve the existing search," not "add one."

**What shipped:**
- **Sidebar Help item** — `{ icon: HelpCircle, label: 'Help', href: '/help' }` added to all three role
  arrays in `src/lib/navConfig.ts` (business/brand/creator), at the bottom by Settings.
  **Note:** `/help` is a **standalone route** (own `PublicPageHeader`, not inside `DashboardLayout`), so
  clicking Help leaves the dashboard shell — there is no in-sidebar active-highlight (a spec-reviewer catch).
- **Improved search** (`src/pages/help/HelpCenter.tsx` + new pure `src/lib/helpSearch.ts`):
  - Prominent, on-brand box (larger, teal focus ring, "Search help articles…").
  - `rankHelpArticles(articles, query)` — **client-side** field-priority ranking (title > search_terms >
    body, word-boundary bonus), **AND-token** semantics, **partial/type-ahead** matching (substring), and
    **HTML-stripped body** so embedded image URLs (`…help-screenshots/…png`) don't pollute results.
    10 unit tests.
  - Ranked flat result list while searching; category tree otherwise.
  - **`?q=` URL param IS the search state** (no separate `useState`) — deep-linkable and back/forward-safe.
    This was a Codex **P2 fix**: the first cut kept a separate `useState` synced *to* the URL but not
    *from* it, so back/forward between searches showed stale results.
  - Compact search box on `HelpArticlePage.tsx` routes to `/help?q=<query>`.

**Key decision:** deliberately **client-side, not server-side `search_vector`.** For a ~32-article corpus,
client-side is instant and type-ahead friendly; server-side full-text adds per-keystroke latency and loses
partial matching. `search_vector` stays Donny's (the `guidance_agent`); the human `/help` search is its own
client-side path.

**Verified live (logged-out, desktop):** branded box; `crew`→5 ranked results (title matches on top);
`campaign`→31; `dragon feed`→2 (AND semantics); typing updates `/help?q=crew`; deep link `/help?q=campaign`
loads pre-searched; article-page search box routes to `/help?q=payment`→11 results. Sidebar Help item is
build-verified (renders only in the logged-in shell; founder was logged out). Codex clean after the P2 fix.

## Landing both PRs

`git push` (send-pack) is env-blocked here, so both PRs were landed via the **gh REST overlay**
(blob→tree→commit→ref + `gh pr create`), base_tree = current `origin/main`, only the changed files, verified
with `gh api compare/main...branch` before opening. `main` moved 30+ commits between the two PRs; base-parity
was re-checked before each overlay.

## Affected files

- Migrations: `20260719120000_help_articles_screenshots.sql`, `20260719120001_help_articles_landing_refresh.sql`
- `src/lib/helpSearch.ts` (+ `.test.ts`), `src/lib/navConfig.ts`
- `src/pages/help/HelpCenter.tsx`, `src/pages/help/HelpArticlePage.tsx`
- Specs: `docs/superpowers/specs/2026-07-19-help-center-screenshots-design.md`,
  `docs/superpowers/specs/2026-07-19-help-sidebar-and-search-design.md`
- Bucket: `help-screenshots` (7 new PNGs + `help-landing-page-2026-07.png`)
