# 2026-08-08 — DC Points discoverability (#398) and the FORCE_INTERNAL bug that killed the consumer wiki sync (#401)

Follow-on session to #378 ([[Dragon Rewards Engine (DRE)]] — DC Points visibility). #378 merged
as `859e8b25`; this session shipped two follow-ups, both merged and prod-verified.

## 1. #378 landed: merge, deploy, verify

- Merged `859e8b25` after the Codex gate finally cleared (3 rounds — see below).
- Deployed both edge functions with **different flags**, boot-checked against
  `list_edge_functions`: `dre-award-engine` v8 → **v9** (`verify_jwt=false`, cron-invoked, correct)
  and `donny-orchestrator` v73 → **v74** (`verify_jwt=true`, consumer surface, correct).
- Codex round 3 came back clean. Rounds 1 and 2 each caught **the same defect in a different
  place**: a non-creator role falling back to the business branch. Round 1 = `/rewards` reachable
  by a brand account. Round 2 = `donny-orchestrator/agents/rewards.ts`, where
  `agg?.role === "content_creator" ? "creator." : "business."` handed a brand user the entire
  business earn catalog **through generated prose** — invisible to any UI review. Fixed by
  resolving the role explicitly and returning early. The guard is now stated in four places
  (chip, page, catalog, sub-agent), each cross-referencing the others.

## 2. Founder report → #398 (discoverability)

Founder, against prod, minutes after #378 shipped:

> On the dashboard the DC points section is not clickable and there's no page for it in the
> navigation panel

Both real. #378 built the page, chip, notification and Donny agent but left the two dashboard
cards inert. **A balance with nowhere to click is the same dead end as the "+200 DC Points" bell
that started the whole thread** — it just moved one screen over.

- `DragonPointsCard` became a `Link` to `/rewards` (chevron, hover, `aria-label`). Business and
  creator dashboards share the component, so one change fixed the "points on two dashboards"
  half of the original complaint.
- "DC Points" added to the business + creator **sidebar nav** and **drawer menu**. Not the mobile
  bottom nav — 5 slots, full.
- Brand excluded — the **5th** place that decision is written down. A test asserts it.
- **Two gates, not one.** Role lives in the static nav arrays; the `DRAGON_REWARDS_ENABLED`
  launch flag is a hook, so it is applied at both render sites via `withDcPointsGate()`. Without
  the second gate, flipping the flag off leaves a nav entry pointing at a page that renders
  "DC Points are not available." — recreating the dead end being fixed.
- The existing `dragon-rewards-gate.test.tsx` needed a `MemoryRouter` (a `Link` throws without a
  Router) and gained an assertion that the card targets `/rewards`.

## 3. The bigger find → #401 (the consumer wiki sync was dead)

Asked to fix a suspected design flaw in #378's `FORCE_INTERNAL`, I tested the mechanism before
redesigning it. The test failed immediately — and the diagnosis was wrong twice before it was
right, which is the useful part.

**Wrong diagnosis #1:** "duplicate rows for one wiki path = the leak." False. `donny_knowledge`
holds **two source_id namespaces** for the same path by design — `wiki:<dir>/<slug>` (consumer,
from `sync-wiki-to-donny.mjs`) and `internal-<dir>:<slug>` (internal, from
`sync-internal-docs.mjs`). Two audiences, two rows. Duplication proves nothing.

**Wrong diagnosis #2:** "`FORCE_INTERNAL` strands the consumer row." False. It targets the
consumer row's own `source_id`, so it flips exactly the row it should.

**Actual root cause:** the `FORCE_INTERNAL` set named
`analyses/dragoncandy-dragon-rewards-engine-dre-full-system-spec.md` — **a file that does not
exist.** It had already been split into `dre-part-1-points-economy.md` and
`dre-part-2-community-and-implementation.md`. I built the set from the **`donny_knowledge` rows**
instead of the filesystem, and a stale orphan row still carried the deleted file's path. The DB
looked authoritative because *a row outlives its file*.

Consequences:

1. The guard added in #378 for exactly this case **fired correctly and aborted the sync** — before
   any network call. Because `sync:wiki` runs unattended from the `post-merge` hook, the only
   symptom was a consumer RAG that **silently stopped updating**. Every docs-touching merge after
   #378 skipped it.
2. The #378 migration targeted that same non-existent path, so it "succeeded" by updating an
   orphan row while **never covering the two pages that actually leaked**. `dre-part-2` contains
   "🏆 Leaderboards & Community Mechanics" and point redemption — none of it built — and its
   consumer row was verified reachable on prod.
3. The guard's message reported only a count ("expected 2, found 1"), naming that a path was
   wrong but not **which**.

Fixes in #401: correct paths (3, all verified with `ls`), a guard that **names the missing
entries**, and a test asserting every entry exists on disk (one assertion per entry).
Mutation-tested — restoring the bad path fails 2 tests.

**Aborting the whole sync is kept deliberately.** A renamed page is still in the scan under its
new name, so continuing would publish it to the consumer RAG at `scope null`. Refusing to sync is
the safe failure; the fix is a better error message, not a softer guard.

## 4. Prod repair (direct writes, founder-approved)

- Re-scoped 3 leaking consumer rows to `internal` (`concepts/dragon-rewards-engine.md`,
  `dre-part-1`, `dre-part-2`).
- Ran the corrected sync: **106 pages, 0 errors**. Re-checked the leak query **after** a sync —
  a sync is what used to revert the fix — **0 consumer-reachable DRE rows**. First time that has
  been true through the real code path rather than a manual `UPDATE`.
- Deleted **2 orphan rows** whose files no longer exist
  (`...-dre-full-system-spec.md`, `...-dame-ai-the-business-growth-agent-system-spec.md`). Both
  `scope=internal` (never leaking), both frozen at 2026-06-27, content confirmed covered by their
  split replacements. Found by a general check: rows the syncs did *not* touch are exactly the
  orphans (`updated_at < now() - interval '2 hours'` right after a full sync).

## 5. Prod verification

Desktop, real business account, live prod, post-#398 deploy (`index-C7oKqHTm.js`):

- `/rewards` renders all four blocks; balance **4,300 / Rising**; tier gap as a sentence
  ("Established needs 3 more completed campaigns."); labeled history.
- Three routes to `/rewards` confirmed: sidebar nav item, top-bar chip
  (`aria-label="4,300 DC Points"`), and the now-clickable card (`aria-label="View your DC Points"`).
- **0 console errors** on a cleared buffer + cold load.

**Mobile viewport BLOCKED** — `resize_window` reports success but `innerWidth` stays 1707 and the
mobile media query does not match, so using it would be a false pass. Verified empirically this
session rather than trusting the prior note. Real mobile emulation needs CDP
`setDeviceMetricsOverride`.

**A false alarm worth recording:** a cold load of `/rewards` appeared to crash into the
ErrorBoundary with `Failed to fetch dynamically imported module: .../DcPointsPage-jsp2muck.js`.
Not a DC Points bug — a newer deploy had landed, and Vercel's SPA rewrite serves **`200 text/html`
(index.html)** for a missing asset, so a stale tab's dynamic import fails in a way that reads like
a crash. Affects **every lazy route**, not this feature. Worth a separate decision (chunk-load-error
auto-reload); not fixed here.

## 6. Also this session

- `main` checkout had an **unpushed local commit** (`bacb1eb6`, a `worktree-cleanup/SKILL.md`
  doc improvement) blocking `--ff-only`. Preserved on branch
  `preserve/worktree-cleanup-skill-doc` before resetting — **not discarded**. Still needs a PR.
