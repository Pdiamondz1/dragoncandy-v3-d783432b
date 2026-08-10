# Session: Donny inline canvas (Phase 1) — the dashboard answers in place

Date: 2026-08-09
Branch: `worktree-dc-improvements-21`
Scope: business role, frontend only. Phase 2 (attachments) and Phase 3 (creator/brand) planned, not built.

## The reported problem

The founder's complaint, from a screenshot of the restaurant dashboard with the Donny panel
docked open: *"we need the Donny to be 'unified' on the Dashboard… when a user enters input on
the prompt, the output should display on the dashboard (not in the chat). There's duplicity
and confusion there for the users."* Plus three concrete input defects: the prompt did not show
the whole text, Enter submitted so you could not paragraph, and there was no way to attach
anything.

The underlying shape: **the page you asked from was never the page that answered.** Typing into
the dashboard prompt opened a docked panel (desktop) or a bottom sheet (mobile) and put the
reply there — two Donnys, one of which covered the thing you were looking at.

## What shipped

A `DonnyCanvas` with two states — resting (greeting, taps, attention list) and thread — that
never leaves the page. Sixteen tasks, subagent-driven, each with its own review gate.

Supporting pieces: a fourth `DonnyStage` value (`'inline'`) with a pure `nextStage()` rulebook
where `'inline'` short-circuits first and makes every panel action inert; a `DonnyComposer`
with a 200px auto-grow cap; `DonnyTurn`/`DonnyThread` for inline rendering; `DonnyMarkdown`
extracted so three consumers share one renderer.

## The lessons worth keeping

### 1. `position: sticky` is inert anywhere inside `DashboardLayout`

The composer was written `sticky bottom-…`, with a code comment asserting the sticky inset
resolves against `#main-content` (the app's real scroller, `flex-1 overflow-auto`). **That
comment was false**, and the fix was written on top of it through eight review rounds.

`DashboardLayout` carries `overflow-x-hidden` on its root (`:182`) and, on mobile, on its
content wrapper (`:309`). Per CSS Overflow 3, an `overflow-x` of `hidden` against an
`overflow-y` of `visible` **computes that `overflow-y` to `auto`** — so those wrappers are the
nearest ancestor scroll container, sitting between the component and `#main-content`. Both are
`min-h-screen` with content-driven height and therefore never scroll, and a sticky box inside a
non-scrolling scrollport never enters its stuck state.

"Read scroll position from `#main-content`" and "sticky resolves against `#main-content`" are
different claims, and only the first is true.

Fixed as `fixed` on mobile (full-bleed is correct — no sidebar — with the `6rem` offset that
clears `MobileBottomNav`), in flow on desktop. **Desktop pinning deliberately deferred**: the
content column is centred beside a collapsible sidebar, so a viewport-fixed bar misaligns
without a measured width that no unit test can verify.

**jsdom loads no CSS, so no test at this tier can ever catch this class of bug.** It took an
independent reviewer and a Codex P2 — reaching the same conclusion separately — to find it.

### 2. A query gated on state that an effect sets does not merely resolve late — it starts late

`useDonny`'s conversation query is `enabled: !!user && stage !== 'closed'`. `DonnyCanvas` only
flips the stage in a **mount effect**. So on a fresh dashboard visit the query does not start
until after first paint, and then still needs a network round trip — while the chips and
composer are live the whole time. A tap in that window hit the `!conversation` guard and
rendered "No active conversation."

**Nine reviews missed this because every test mounted with the conversation already resolved.**
The race was structurally invisible to the suite. Codex found it.

Fixed by queueing sends while the conversation is pending and draining serially, FIFO.

### 3. Green tests are the weakest evidence; the surviving-mutant question is the strongest

Adopted as the working standard for the whole branch: every load-bearing test must be proven to
**fail** against a named, plausible one-token mutation of the production code, and implementers
report what each mutation produced. This caught real holes repeatedly:

- Two button tests passed only because `toHaveBeenCalledWith` succeeds if *any* call matched —
  masking a duplicate-submit bug. Fixed with `toHaveBeenCalledTimes(1)`.
- A "disabled button does not submit" test was **vacuous**: a `disabled` button suppresses
  click natively in jsdom and in browsers alike, so it asserted nothing.
- Most valuable: a mutant that **survived**. Deleting the send queue's explicit re-drain signal
  left the entire suite green, because the drain effect depended on the react-query *mutation
  object*, whose identity changes on every state transition. The queue was continuing on an
  implementation detail nothing stated or tested — a version bump that memoised that object
  would have silently dropped every message after the first. Now keyed on a stable reference.

### 4. A comment is a claim the code makes, and it has to be true

The `sticky` comment did not just fail to help — it actively misdirected eight reviews. Applying
the existing rule ([[Security Fix Bar Is The Claim]]) to comments: judge a comment against
whether what it asserts is true, not against whether it sounds reasonable.

### 5. Verify preconditions before planning, not after

Planning Phases 2 and 3 against the spec would have produced three wrong plans. Checking prod
and `origin/main` first changed all three:

- The orchestrator **never touches `donny_messages`** — the client writes both rows — so
  attachments need two paths (request body for the model, row for redisplay), not one.
- Anthropic caps one image at **5 MB base64**, so the spec's 25 MB is a *storage* cap, not a
  send cap. Images compress client-side; oversized ones are named as unreadable rather than
  silently dropped, same as video.
- **`BRAND_ROLE_ENABLED` does not hide the brand dashboard.** All ten call sites gate signup and
  sponsorship UI; `/dashboard/brand` is registered unconditionally. Brand IS prod-verifiable —
  the opposite of what had been assumed and stated.

Fetching `origin/main` added two more: this branch predated #415 and still carried the
`esm.sh` supabase-js import that **boot-fails on every redeploy** (Phase 2 and 3 both deploy
`donny-orchestrator`), and #416/#417 repaired the `social_*` tools, making the "0/7, never
offer a social chip" constraint in `donnyHomeSuggestions.ts` stale.

### 6. A gate that cannot run is open, not passed

Codex round 2 (post-rebase) was killed four times by machine saturation — ~53–77 concurrent
`node.exe` processes from other worktree sessions; typecheck went from ~2 min to >10 min on the
same commit. A self-inflicted factor was found: a `codex.exe` from attempt 2 **survived its
kill** and competed with attempt 3.

The branch was pushed with the PR deliberately held. Round 1 had already found a real defect
nine reviews missed, so treating an unrun gate as "probably fine" would have been exactly wrong.

## State at end of session

Verified: rebase onto `origin/main` (30 commits, 0 conflicts), 13 files / 159 tests passing,
typecheck clean, `esm.sh` gone from `donny-orchestrator`, migration `20260810013012` applied
with objects verified directly (not via the migration ledger).

Open: the Codex second review, `npm run build` since the rebase, and the both-viewport
`verify-prod` — which has **never** run on this surface (#410, #411 and #413 all shipped
without one).

## See also

- `docs/superpowers/specs/2026-08-09-donny-dashboard-unification-design.md`
- `docs/superpowers/plans/2026-08-09-donny-attachments-phase2.md`
- `docs/superpowers/plans/2026-08-09-donny-all-roles-phase3.md`
