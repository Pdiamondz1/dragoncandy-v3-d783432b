# Handoff: Donny dashboard — fresh per visit + collapsing greeting (#428 MERGED)

## Session Metadata
- Created: 2026-08-10 09:44:26
- Project: C:\GIT\dragoncandy-v3-d783432b\.claude\worktrees\dc-improvements-22
- Branch: fix/donny-dashboard-mobile-composer (**merged as `705073e1`, squashed**)
- Session duration: ~1 working day across a compaction

### Recent Commits (for context)
  - 7916fd0b docs(knowledge): the two findings the review loop added after it read as done
  - e0d748d0 fix(donny): when the history won't load, say so — don't guess and don't hang
  - 15795d97 fix(donny): a stream from the side panel is not this visit's conversation
  - 280ad06f docs(knowledge): fresh-per-visit, and the parallel-PR collision that shaped it
  - 0f2f78e8 fix(donny): every visit starts fresh, and the greeting gets out of the way

## Handoff Chain

- **Continues from**: None in `.claude/handoffs/`. The scaffold auto-linked
  `2026-07-24-160538-synthetic-load-runner-matrix.md` by recency; that is a **different
  workstream and unrelated** — do not read it for this. The real lineage is the
  Donny-first dashboard PR chain: **#410 → #411 → #423 → #429 → #428**, all synthesised in
  `docs/wiki/concepts/donny-first-dashboard.md`, which is the document to read first.
- **Supersedes**: None.

## Current State Summary

The work is **finished, merged, deployed and knowledge-synced.** The founder used the shipped
Donny-first dashboard on their phone and rejected the shape: the conversation grew endlessly
down the page, and yesterday's thread was still there on arrival. Two sessions independently
built the bounded scroller; **#429 (a parallel session) merged first and did it better**, so
this branch was reset onto `main` and rebuilt to carry only the remainder — a display filtered
**fresh per visit** plus a **collapsing greeting**. Codex ran four rounds and found five
defects, the last of them on my own fix. All gates green, merged as `705073e1`, RAG sync
verified by content.

**The only thing outstanding is a founder-owned mobile check**, plus one non-urgent wiki
maintenance task. There is no in-flight code.

## Architecture Overview

- **Donny has ONE conversation per user**, keyed `['donny-conversation', user?.id]` in
  `useDonny`, and it is **shared by the side panel and the business dashboard**. Anything a
  surface wants to show differently must be a *filter*, not a fork — that is the central
  design fact of this feature.
- `DonnyProvider` sits **above the router** and never unmounts, so `useDonny`'s query
  observers live for the whole app session. Consequence: `isFetchedAfterMount` is useless
  here (true from the app's first fetch onward), which is why readiness is
  `isSuccess && !isFetching`.
- Queries are gated on `stage !== 'closed'` (panel visibility). `registerInlineConversation()`
  decouples "panel visible" from "conversation live" so the dashboard can render the thread
  with the panel shut — `stage` is byte-unchanged.
- `DonnyThreadRegion` (from #429) owns the bounded scroller + scroll-to-bottom control;
  `DonnyThread` owns no scroll container so both surfaces can share it.

## Critical Files

| File | Purpose | Relevance |
|------|---------|-----------|
| `src/components/donny/DonnyHome.tsx` | The dashboard body | All of this session's logic |
| `src/components/donny/DonnyThreadRegion.tsx` | Bounded scroller (#429) | Read its comments before touching layout |
| `src/hooks/useDonny.ts` | Shared conversation state | `messagesLoaded` / `messagesErrored` / `retryLoadMessages` added here |
| `src/contexts/DonnyProvider.tsx` | Context surface | Three fields threaded through |
| `src/components/donny/DonnyHome.test.tsx` | 37 tests | `askThenStream()` helper is load-bearing |
| `docs/wiki/concepts/donny-first-dashboard.md` | Synthesis for the whole feature | **Read this first** |

### Key Patterns Discovered

- **Slice a live list by ID, never by count or wall-clock.** Late-arriving history lands
  *before* the baseline in the ordered array and stays excluded; no client clock is involved.
- **An empty collection is three different facts** — "not loaded", "loaded and empty", "no
  query ran". `messages` defaults to `[]` and is `enabled: !!conversation`, so its length says
  nothing about the world.
- **When a flag answers "is it safe to act", failure is a THIRD answer.** Collapsing it into
  "yes" leaks; into "no" hangs forever.
- **Global state is not a page's state.** `isStreaming` / `error` belong to the shared
  conversation; gate on "did the user act *here*".
- **`position: sticky` is INERT inside `DashboardLayout`** (overflow-x-hidden ancestors become
  the scrollport, and they never scroll). Use a real scroll container.
- **`min-h-0 flex-1`, never `h-full`** for a flex-child scroller — percentage heights need a
  definite parent height. jsdom cannot catch this class; only a real-browser measurement can.

## Work Completed

### Tasks Finished

- [x] Fresh-per-visit display filtering (`visitBaselineId` / `visitMessages`)
- [x] Greeting collapses once a conversation runs; block chrome 26rem → 12rem to spend the space
- [x] `compact` on `DonnyHomePrompt` (chips retire mid-conversation)
- [x] `messagesLoaded` / `messagesErrored` / `retryLoadMessages` through `useDonny` + provider
- [x] Honest failure path when history won't load, with the queued ask preserved
- [x] Four Codex rounds to clean; five negative controls
- [x] Knowledge layer: raw session, concept page, `SHIPPED_LOG`, `PROJECT_CONTEXT` §5, wiki log,
      knowledge-sync `MEMORY.md` (two new Lessons)
- [x] Merged `705073e1`; RAG sync verified **by content**, not by timestamp

## Files Modified

| File | Changes | Rationale |
|------|---------|-----------|
| `src/components/donny/DonnyHome.tsx` | baseline/dispatch/askedHere/collapse | The founder's two requirements |
| `src/hooks/useDonny.ts` | readiness + error + refetch | Callers cannot tell the three empty-array cases apart |
| `src/contexts/DonnyProvider.tsx` | 3 fields + fallbacks | Additive; panel ignores them |
| `src/components/donny/DonnyHomePrompt.tsx` | `compact` prop | Chips are cold-start help |
| `src/components/donny/DonnyHome.test.tsx` | 33 → 37 tests | Two got *stronger*, not merely adjusted |
| `docs/**`, `.claude/skills/knowledge-sync/MEMORY.md` | knowledge-sync | Per-session requirement |

## Decisions Made

| Decision | Options Considered | Rationale |
|----------|-------------------|-----------|
| Filter the shared conversation | Fork it; new conversation row; reset endpoint | Zero backend, zero migration, side panel byte-unchanged |
| Discard this branch's scroller, adopt #429's | Merge both; keep mine | #429 merged first and is better (scroll-to-bottom, real-browser `min-h-0` measurement). Two answers to one question is worse than either |
| Baseline keyed on message **id** | count; timestamp | Robust to late-arriving history and to client clock skew |
| `messagesLoaded = isSuccess && !isFetching` | `isSuccess`; `isFetchedAfterMount` | RQ keeps `isSuccess` true during a refetch over cached data; provider never unmounts so `isFetchedAfterMount` is useless |
| Failed history → say so + Retry, keep the queued ask | count error as loaded (leaks); as not-loaded (hangs) | Both collapses are guesses; recovery drains the queue with nothing retyped |
| Collapse greeting AND cut reserved chrome | collapse only | Collapsing without spending the space is just "the greeting vanished" |
| Donny still *receives* history | strip his context too | Both surfaces share one conversation; stripping breaks the panel mid-thread |

## Immediate Next Steps

1. **Founder mobile `verify-prod` on dragoncandy.com** (the only unverified claim). Check:
   answer appears **above** the prompt in a self-scrolling box; greeting collapses when the
   answer starts; returning later shows **no** conversation from the previous visit.
2. **Split the oversized wiki concept pages** — the sync now warns on three:
   `donny-first-dashboard` (24,707 chars), `donny-social-tools` (26,847),
   `service-role-data-exposure` (27,304). Nothing is lost today; they are near the embedding
   ceiling and will silently drop out of semantic retrieval if they keep growing.
3. Nothing else. There is no in-flight code and no open PR from this session.

### Blockers/Open Questions

- [ ] `resize_window` **does not move the rendered viewport** in this environment, so an agent
      cannot do step 1. It needs a real phone. This gap now spans #423, #429 and #428.
- [ ] Two founder-vetoable judgment calls, both currently un-vetoed: Donny still receives prior
      context (display only is fresh), and the attention list stays below the composer.

### Deferred Items

- Wiki page splits (above) — deferred as real work, not to be done hastily at session end.
- Worktree cleanup: **not** done, correctly — the rule excludes the worktree hosting the live
  session, which is this one. A later session may remove
  `.claude/worktrees/dc-improvements-22` and branch `fix/donny-dashboard-mobile-composer`.

## Context for Resuming Agent

## Important Context

**The single most expensive mistake of this session was not a defect — it was building
something already built.** PR #429 merged a bounded scroller from a parallel session while
this branch was building its own, from two different phrasings of one founder complaint. It
was discovered **by accident**, chasing an unrelated Codex finding about `space-y-3`.

The check that would have caught it *had been run that morning and came back clean* — because
it was pointed at the **core docs**, and `origin/main` was docs-clean. It said nothing about
`src/components/donny/`.

> **Run `git log --oneline HEAD..origin/main -- <the dirs this branch edits>` before starting
> and again before finishing.** On a repo with 30+ worktrees, "has someone already shipped
> this?" has a real answer one command away. This is now Lesson `[scope-paths]` in
> `.claude/skills/knowledge-sync/MEMORY.md`.

Second: **Codex caught a defect in my own fix for its previous finding.** Trading a leak for a
deadlock and back again is not progress. When a fix converts one failure mode into its
opposite, the framing is wrong, not the constant.

## Assumptions Made

- Merging ships this — frontend only, no migration, no edge function. **Verified**: the diff
  touches no `supabase/` path.
- Donny keeping prior *context* (while the display is fresh) is what the founder wants. Stated
  explicitly to them twice as vetoable; not vetoed.
- The founder's screenshots showed **prod**, not #428 — verified by grepping `origin/main` for
  `pinComposer` (absent) before responding.

## Potential Gotchas

- **`submit()` in `DonnyHomePrompt` bails while `busy`.** A test that sets `isStreaming` before
  asking cannot ask at all — use the `askThenStream()` helper. Five existing tests were
  silently relying on the page keying off *global* streaming.
- **jsdom implements no `scrollIntoView`**; `beforeEach` stubs it. Any test that merely asks
  will trip the follow-the-reply effect without it.
- **Do not run `prettier` on this repo's source** — it has no matching config and rewrote a
  whole file to double quotes. Match surrounding style by hand.
- **Main-checkout git from inside a worktree session can lock BOTH shells** (the guard then
  refuses even `pwd`; recovery is a new session). Ask the founder to run `refresh-main`.
- The knowledge-sync's own output goes stale fast: an earlier run *this same branch* codified
  the pinned-composer mechanism into `DESIGN_SYSTEM.md`, and a later commit deleted the code.
  See Lesson `[superseded-mechanism]`.

## Environment State

### Tools/Services Used

- Supabase MCP (prod ref `zocahiffooqdybdhguqv`) — read-only verification of `donny_knowledge`
- `gh` CLI — PR edit/merge/checks
- `codex review --base main` — four rounds, clean at round 4
- Vitest / tsc / eslint / vite build — all green (2377 passed, 0 failed)

### Active Processes

- None. All background tasks completed.

### Environment Variables

- `SUPABASE_SECRET_KEY` (name only) — used by the post-merge hook via
  `supabase/scripts/with-env.mjs`; sourced from the gitignored
  `supabase/scripts/.env.sync.local` in the **main checkout**, never in a worktree.

## Related Resources

- `docs/wiki/concepts/donny-first-dashboard.md` — the synthesis; read first
- `docs/wiki/raw/sessions/2026-08-10-donny-dashboard-fresh-per-visit.md` — this session's source
- `docs/SHIPPED_LOG.md` — top entry
- `docs/PROJECT_CONTEXT.md` §5 — status line (names #428 + #429)
- `.claude/skills/knowledge-sync/MEMORY.md` — Lessons `[scope-paths]`, `[superseded-mechanism]`
- PRs: #428 (this), #429 (the parallel scroller), #423 / #411 / #410 (earlier phases)
