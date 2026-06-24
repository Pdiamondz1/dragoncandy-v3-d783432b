# Session: DragonCandy origin story + knowledge-sync automation (2026-06-21/22)

Branch: `worktree-DC-Donny-and-bug-fixing4`. 9 PRs merged (#154–#162). Two threads:
(1) authored the canonical origin story into the AIOS strategy library, and (2) built
reusable automation so syncing Donny's knowledge no longer needs the secret pasted by hand.

## Thread 1 — DragonCandy origin story (content)

- Created `docs/dragoncandy-origin-story.md` (PRs #154/#155/#159/#160/#162), synced into the
  AIOS strategy library (`internal_docs`, `/internal/strategy`) and internal Donny RAG
  (`donny_knowledge` scope=internal) via `npm run sync:internal`.
- Structure: a tight **Version A** (~290w, deck/social) + medium **Version B** (~510w,
  About/investor memo), plus a tagline block (lead homepage hero: *"Don't run your social
  media. Just ask Donny."*).
- **Founder direction — three-sided vision is ONE story, not three.** First draft added
  separate creator-facing + brand-facing variants; founder corrected: the creator and brand
  perspectives must be **woven into the single narrative**, bundled with the DragonCandy
  vision. Resolved with the *"Joe's wall was everyone's"* turn — the same grind hitting
  restaurants, creators, and brands becomes the marketplace vision, Donny serving all three.
- **Canonical facts corrected this session:**
  - Name is **Joe Castelo** (single L). The draft used "Castello" (double L) — wrong — which
    shipped into the story and RAG before the fix; corrected everywhere.
  - **Joe = CEO** (he also leads sales), not CPO/CRO. PROJECT_CONTEXT §1 →
    "Joe Castelo — CEO, Sales & Partnerships" (was "CRO, Sales & Partnerships").
  - Swept lingering "Joe (CRO)" / "Chief Revenue Officer" → CEO across 8 refs / 7 files
    (cost model, staffing-plan HTML C-title card, 5 wiki pages). No separate CRO exists, so
    org-structure lines ("AE under Joe", "reports to Joe") stay valid as (CEO). Left **function
    labels** ("Sales & Partnerships" / "Product & Technology" — parallel each other, not
    titles) and a **dated historical spec** (2026-05-03 pdf-redesign) untouched.
  - Other canon: trio "traded ideas for **weeks**" (not one night); input north-star vision =
    launch a paid campaign by **looking through smart eyewear** first, then voice/photo/tap.

## Thread 2 — Knowledge-sync automation (the reusable pattern, keystone)

Problem: syncing the strategy library / Donny RAG meant pasting the prod service-role key on
the command line every time (and it leaked into the chat transcript). Built three layers so a
knowledge change propagates to Donny with zero manual key handling.

- **Layer 1 — npm aliases + secret resolver (PR #156).** `npm run sync:internal` →
  `sync-internal-docs.mjs`; `npm run sync:wiki` → `sync-wiki-to-donny.mjs`. Both go through a
  new `supabase/scripts/with-env.mjs` that resolves the secret (an **env var wins**, else the
  **gitignored** `supabase/scripts/.env.sync.local`) and defaults `DONNY_SYNC_URL` to the prod
  `donny-knowledge-sync` endpoint, then dynamic-imports the target script.
  - **Windows gotcha (caught by verification):** dynamic `import()` of an absolute Windows path
    (`C:\…`) throws `ERR_UNSUPPORTED_ESM_URL_SCHEME` (`C:` parsed as a URL scheme). Fix:
    import via `pathToFileURL(path).href`.
  - Setup options: a one-time `setx SUPABASE_SECRET_KEY …` (env var, reaches terminals opened
    *after* it) OR paste the key into `.env.sync.local` (reaches every shell). `.env.example`
    documents both; `.gitignore` got an explicit entry.
- **Layer 2 — auto post-merge git hook (PR #157).** `scripts/hooks/post-merge` runs both syncs
  in the background when the **main** checkout fast-forwards (merge/pull) and `docs/` changed;
  logs to `.git/knowledge-sync.log`. Self-guards to the main checkout (skips worktrees via
  `git-dir != git-common-dir`), never blocks the merge, idempotent.
- **Layer 3 — committed installer so it survives fresh clones (PR #157).** `scripts/hooks/` is
  the committed source; `scripts/install-hooks.mjs` copies it into the **common** `.git/hooks/`
  (shared across worktrees). Wired to `package.json` `"prepare"` (runs on `npm install`); also
  `npm run hooks:install`. Normalizes CRLF→LF for `/bin/sh` on Windows; no-op outside a git
  repo so CI tarball installs don't fail.
- **CLAUDE.md** worktree-workflow section documents the hook (PR #158).

### Gotchas / decisions worth keeping

- **The hook only succeeds if the key is reachable in the shell that triggers the merge.** A
  `setx` var only reaches *later-opened* terminals; a merge triggered by a process that
  predates the `setx` (e.g. Claude's Bash tool) won't see it and falls back to the file. So the
  bulletproof setup is the key in `.env.sync.local`. Proven live: a docs/ merge fired the hook,
  which auto-synced with `errors=0` using the file key.
- **Verify a real sync by content, not exit code / counts.** Query `content ilike '%phrase%'`
  on the changed page in BOTH `internal_docs.content_md` and `donny_knowledge.content`. Column
  is **`content`** (NOT `full_content`). Confirms the new text actually embedded. (Updates
  don't bump `updated_at`; only inserts do — so count/max(updated_at) is a false check.)
- **Squash-merge + same-branch follow-ups conflict.** After a squash-merge, the worktree branch
  diverges from main; the next docs change conflicts on the same file. Workflow that worked:
  `git merge origin/main` into the branch (keep ours / resolve) before each new push, then
  admin-squash-merge.
- **Harmless background-exit noise:** the backgrounded node sync occasionally prints
  `Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)` (libuv on Windows) *after* `Done.` —
  it doesn't affect the sync result or git.

## Affected files (no schema / RLS / edge-fn / secret changes)

- New: `docs/dragoncandy-origin-story.md`, `supabase/scripts/with-env.mjs`,
  `supabase/scripts/.env.sync.local.example`, `scripts/hooks/post-merge`,
  `scripts/install-hooks.mjs`, `.git/hooks/post-merge` (installed, local).
- Edited: `package.json` (sync:internal/sync:wiki/prepare/hooks:install), `.gitignore`,
  `CLAUDE.md`, `docs/PROJECT_CONTEXT.md`, plus the CRO→CEO sweep across the cost model, staffing
  HTML, and 5 wiki pages.

## Open items (founder)

- **Rotate the `sb_secret` prod service-role key** — it appeared in this session's transcript
  (and is the value now in `.env.sync.local` + the `setx` var). Rotate in Supabase, then update
  both stores.
- Optional: update the one dated spec's "Joe (CRO/Sales)" for full consistency; clean up this
  worktree (from another checkout) after the branch is done.
