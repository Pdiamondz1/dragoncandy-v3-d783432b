---
title: Origin Story & Knowledge-Sync Automation Session
type: source
created: 2026-06-22
updated: 2026-06-22
sources: [2026-06-21-origin-story-and-sync-automation.md]
tags: [origin-story, knowledge-sync, donny-rag, strategy-library, git-hooks, dev-workflow, founders]
---
# Origin Story & Knowledge-Sync Automation Session

Session of 2026-06-21/22 on branch `worktree-DC-Donny-and-bug-fixing4`, 9 PRs (#154–#162).
Two threads: authoring the canonical DragonCandy origin story into the AIOS strategy library,
and building automation so syncing Donny's knowledge no longer needs the prod secret pasted by
hand. See [[Knowledge-Sync Automation]] and [[Self-Improving App]].

## Key claims

- **The origin story is canonical content, now in the strategy library.**
  `docs/dragoncandy-origin-story.md` holds a tight Version A (~290w) + medium Version B
  (~510w) + a tagline block (lead: *"Don't run your social media. Just ask Donny."*). Synced
  into `internal_docs` (`/internal/strategy`) and `donny_knowledge` scope=internal.
- **Founder canon corrected this session:** the name is **Joe Castelo** (single L — the draft's
  "Castello" was wrong and briefly shipped into the RAG before correction); **Joe = CEO** and
  also leads sales (was modeled as CRO). Swept "Joe (CRO)" → CEO across 8 refs / 7 files; left
  function labels ("Sales & Partnerships") and a dated historical spec untouched.
- **The three-sided vision is ONE story, not three.** A first draft added separate
  creator-/brand-facing variants; founder direction was to **weave** the creator and brand
  perspectives into the single narrative (the *"Joe's wall was everyone's"* turn), bundled with
  the DragonCandy vision — Donny serving restaurants, creators, and brands.
- **Knowledge-sync is now one command or fully automatic.** `npm run sync:internal` /
  `sync:wiki` (no key on the command line), plus an auto post-merge git hook that re-syncs
  Donny's RAG whenever a main-checkout merge touches `docs/`. Survives fresh clones via a
  committed installer run on `npm install`.

## Notable specifics / gotchas

- Windows dynamic-import of a `C:\…` path throws `ERR_UNSUPPORTED_ESM_URL_SCHEME`; use
  `pathToFileURL(path).href`.
- Verify a real sync by `content ilike '%phrase%'` on BOTH `internal_docs.content_md` and
  `donny_knowledge.content` (column is `content`, NOT `full_content`); counts/`max(updated_at)`
  are false checks (updates don't bump `updated_at`).
- The hook only syncs if the secret is reachable in the shell that triggers the merge — a
  `setx` var reaches only later-opened terminals, so the gitignored `.env.sync.local` is the
  bulletproof store.
- Open founder item: **rotate the `sb_secret` prod service-role key** (it surfaced in the
  session transcript).

## See Also
- [[Knowledge-Sync Automation]]
- [[Self-Improving App]]
- [[Donny AI]]
- [[DragonCandy Platform]]
