# Session: the Donny-first dashboard answers in place — and the markdown table that reached the user as pipes

**Date:** 2026-08-09
**Branch:** `feat/donny-dashboard-inline-chat`
**Trigger:** the founder's own acceptance test of the repaired `social_*` tools, run on prod.

---

## 1. What actually happened first: the acceptance signal finally exists

The `social_*` repair (PR #416) shipped with one thing unproven — the acceptance bar it set for
itself. That bar was a `status='success'` row in `donny_tool_executions` for a `social_*` tool,
which **had never existed in that table's history**: 7 rows, all `error`, none since Aug 7, two of
them for tools that no longer exist.

The founder signed in on prod and asked Donny about their Instagram posts. Result, read from the
table rather than inferred from the screenshot:

- `tool_name = social_get_post_analytics`, `status = success`, `2026-08-09 23:23:57`.
- Stored output: `{"post_count":1, "has_signal":false, "caveat":"Based on 1 measured post — too few
  to name a trend, a best anything, or a rate."}`

And Donny obeyed the gate: no "best posting time", no top-content claim, an explicit statement of
what it would need instead. **[[Honest Analytics]] held under a real user, not a probe.**

That is the first end-to-end success for this feature since it was built.

## 2. Two defects the same screenshot exposed — different in kind

The founder's report: *"Donny responded back but it opened the chat instead of keeping the
conversation and details in the dashboard. Plus the beginning of Donny's response looks like a
drawing or chart that cannot be read."*

### 2a. The table (a straight defect)

The "drawing or chart" was a markdown table arriving as literal pipes:
`| Metric | Total | |------|-----|| Views |1|`.

**Root cause: `DonnyMessage.tsx` ran `ReactMarkdown` with no `remark-gfm`.** Tables, strikethrough
and autolinks are GitHub-Flavored Markdown; they are **not** base CommonMark. The tell was in the
same message — the `**bold**` rendered perfectly, because bold *is* CommonMark. So the parser was
working; it simply had no table grammar loaded, and a pipe row is just a paragraph to it.

Fixed at **both** layers, deliberately:

- **Source** — `_shared/social-analytics.ts` now tells the model to write plain lines. The figures
  are four numbers; a 5-column grid does not fit a ~370px chat bubble *even when it renders*.
- **Net** — `remark-gfm` + table components, because the model is free-form and will emit a table
  again some day. The table scrolls inside its own `overflow-x-auto` container rather than widening
  the bubble, and the header earns its weight from `font-semibold` + a hairline, never a grey band
  ([[Light App Kit]]'s no-gray rule).

**Packaging gotcha:** `npm install remark-gfm --save` put it in **devDependencies**. A runtime
import in devDeps works locally and on any install that includes dev deps, then breaks on a clean
production install. Moved to `dependencies`.

### 2b. The panel (not a bug — Phase A behaving as designed)

Phase A's prompt box was a **launcher**: `handlePromptSubmit` called `openDonnyWithContext`, which
`open()`s the panel, `expand()`s it, then sends. The suggestion taps did the same. Nothing was
broken; the design was wrong for the surface. Told to the founder as such rather than relabelled as
a defect.

The founder chose **"Answer inline on the dashboard"** — the conversation renders in the dashboard
body and never leaves the page.

## 3. The design doc's §13 warning is what saved this

`DonnyHome.tsx`'s header comment pointed at the design doc's §13: seven hazards Phase B had to
resolve. Reading it before building prevented shipping something broken.

**The load-bearing blocker was not in that list.** `useDonny` gates its queries on
`stage !== 'closed'`. An inline thread rendered with the panel shut would therefore show a
**permanently empty box** — and empty is indistinguishable from "no messages yet", so it would have
looked fine in review and failed for the user.

**The chosen fix is smaller than the spec's.** The spec proposed a new `inline` stage, which drags
in `close()`/`collapse()` guards plus an audit of all six components that branch on `stage`. But
`stage` was conflating two different things: **whether the panel is visible** vs **whether the
conversation is live**. Separating them with a ref-counted `registerInlineConversation()` leaves
`stage` byte-unchanged, so the nav button, desktop panel, mobile sheet and tour anchors behave
exactly as today — and hazards 2, 3, 4 and 7 **dissolve rather than being solved**.

A **count, not a boolean**: two inline surfaces, or a remount whose new effect runs before the old
cleanup, must not switch the conversation off underneath the surface still showing it.

Hazards 1 and 6 were handled by extracting **`DonnyThread`** out of `DonnyChatView` — one
implementation for both surfaces. It deliberately renders **no panel header** (an inline
collapse/close would be a second Donny on one screen) and **owns no scroll container and no
`h-full`**, because those differ per surface: the panel is a fixed-height flex column that scrolls
itself, the dashboard sits in normal page flow scrolled by `#main-content`.

## 4. The defect I put in and then found in my own diff

The inline thread auto-scrolls to follow a reply. Its comment promised it would **not** fire on
arrival — a dashboard should open on the greeting and the attention list, not the bottom of
yesterday's thread. **The code did not keep that promise.**

It inferred "a reply arrived" from the **message count growing**. On arrival the count grows
`0 → N` as the query resolves, which is indistinguishable from a new reply. So returning to the
dashboard scrolled straight past the greeting — and **only sometimes**: with the thread already in
the React Query cache the count never grew and it behaved correctly. Right about half the time,
unreproducible the other half.

**Asking is something the user DOES — record it, don't infer it.** One `ask()` helper now wraps
every send from this page (prompt box, suggestion taps, attention-list CTA), so the scroll intent
is set in exactly one place and cannot drift between the three.

This is the same shape as the [[Honest Analytics]] measurement traps and the `fetchActiveAccounts`
finding on the previous branch: **a signal that is not about the thing it is being read as.** Count
growth is not "the user asked"; it is "rows appeared".

Negative control: arming the scroll unconditionally fails the new arrival test (and takes two
neighbouring tests with it, since jsdom has no `scrollIntoView` to call).

## 5. Testing notes worth keeping

- **`DonnyProvider.inlineConversation.test.tsx` asserts the ARGUMENT passed to `useDonny`, not
  rendered messages.** With the query disabled the hook returns `[]`, which is indistinguishable
  from "no messages yet" — that exact ambiguity is how this would have shipped broken, so the test
  cannot rely on it.
- **Two existing `DonnyHome` tests pinned the OLD panel-opening behaviour.** They were re-pinned to
  the new contract *and* given an explicit `expect(openDonnyWithContextMock).not.toHaveBeenCalled()`
  — asserting only the new call would still pass if **both** fired, which is precisely the reported
  defect.
- **jsdom has no `scrollIntoView`.** Stub it on `Element.prototype` rather than spying.
- **Vitest "Failed to start forks worker" is not a flake** — it is an invalidated Vite dep cache
  (here, from the `remark-gfm` install). `rm -rf node_modules/.vite` fixes it. Cost two false
  alarms this session.

## 5b. What the review loop found AFTER the work read as finished

Three more defects, none of which any of the passing tests would have caught, and all three in
code the plan and I authored rather than in anything pre-existing.

### Codex P1 — the dependency move was only half done

`package.json` moved `remark-gfm` to `dependencies`; **`package-lock.json` was never regenerated**
and still recorded it under root `devDependencies` with the package entry flagged `dev: true`. So
`npm ci --omit=dev` would build a production tree **missing a module `DonnyMessage` imports at
runtime**. Verified by reading the lock, not by assuming.

**This is the same trap as the original devDependencies mistake, one layer down.** Fixing the
symptom that was visible (`package.json`) left the file that actually governs installs wrong.

### Codex P2 round 1 — a failed first ask did nothing at all

The inline thread rendered only when there was a message or a live stream. But the prompt box and
the taps are live from first paint while the conversation query only starts once the registration
effect runs, so a quick tap on a cold load reaches `useDonny` with `conversation === null`, where it
throws `No active conversation` **without inserting anything**. `onError` did `setError`, so the
error existed the whole time — the dashboard simply never rendered the container that would have
shown it. **The tap did nothing: no answer, no error, no retry.**

The panel never had this hole, because `DonnyChatView` renders the thread unconditionally. The gate
is what this branch introduced.

### Codex P2 round 2 — the fix for that produced a DEAD BUTTON

Adding `|| !!error` made the failure visible and stopped there. Verified in `useDonny`:
`lastUserMessage` is initialised to `""` and assigned on the line **after** the throw, and `retry()`
guards on that ref being non-empty. So the error now rendered a **"Try Again" that does literally
nothing when clicked** — a dead control, the same class as the twelve dead `/settings/*` CTAs
([[Donny Data Visibility & Quick-Action Routing]]).

**"The failure is visible now" is not the bar. The bar is whether the thing the user did works.**
The ask is now **queued**: no conversation yet ⇒ hold the text, send it when one arrives. Nothing
typed is dropped, there is no dead affordance, and the thread shows the typing indicator meanwhile
so the tap is visibly acknowledged. One slot, last-wins — the window is a single round-trip, so two
asks inside it means the user changed their mind. The error branch stays for real failures (quota,
network) once a conversation exists, where retry genuinely works.

### Codex P2 round 3 — a follow-up typed mid-answer vanished

`useDonny.sendMessage` opens with `if (isSendingRef.current) return;` — a **silent return**, no
throw, no error — while `DonnyHomePrompt.handleSubmit` cleared the input unconditionally. So a
follow-up typed while Donny was still answering **disappeared from the box and was never sent**.
The panel was never exposed to this: it passes `disabled={isStreaming}` to `DonnyChatInput`. The
gap is what this branch introduced by giving the dashboard a live chat surface without the guard
that makes one safe.

Fixed by disabling the input and the chips while busy (the panel's established pattern, with a
`Donny is answering…` placeholder so the state is legible), **plus** the `busy` check inside
`handleSubmit` — because Enter submits the form without ever consulting the button's `disabled`
state, and clearing the box for a send that will not happen is precisely how the message was lost.

### Incidental finding: `DonnyProposalCta`'s `kind: 'ask'` variant is never constructed

Found while trying to write a test for the queue's `isStreaming` branch. `buildDonnyProposals.ts`
declares `| { kind: 'ask'; label: string; message: string }` and **nothing in `src/` builds one**,
so `handleProposalAction`'s else-branch is unreachable today. Left in place (it is Phase A's, not
this branch's, and plausibly intended for a near-future proposal type) — but the queue's
`isStreaming` branch is documented as a **guard rather than a live path**, so the next person to
ship an `ask` proposal does not silently reintroduce the dropped-message defect.

**The through-line across all four, and across the previous branch's `fetchActiveAccounts`
finding: a fix must be judged against the claim it makes, not against what it replaced.** Half a
dependency move, a visible-but-unrecoverable error, a comment promising a scroll behaviour the code
did not implement, and an input that accepts text it will not send are all the same failure — the
code asserts more than it delivers.

## 6. Review gates

- **`data-exposure-reviewer`: PASS.** Notable because it did the right work rather than eyeballing
  the diff: `social-analytics.ts` contains **no query or predicate at all** (it only aggregates
  `PerfRow[]` the caller already fetched), so the reviewer went and read the file that *does* hold
  the scoping — `outstand-mcp.ts`, **not in this diff** — and confirmed `.eq('user_id',
  config.userId)` and the `verified_at` gate are unchanged. It also verified
  `registerInlineConversation` widens *when* the already-scoped queries may run, never *what* they
  are scoped to, with the React Query keys on `user.id` and RLS as a second layer.
- **Codex:** the first two runs produced **no verdict** — one killed by a session compaction, one
  hitting the 10-minute cap. **An incomplete Codex run is a failed gate, not a pass**
  ([[feedback_codex_second_review]]). Re-run against the final diff.
- **CI's edge-function typecheck does not cover this file** — both importers are on
  `.typecheck-ignore`. A hand-run `deno check` stands in for it (clean).

## 7. Files

**Frontend**
- `src/components/donny/DonnyThread.tsx` (new) — the shared thread; no header, no scroller.
- `src/components/donny/DonnyChatView.tsx` — delegates to it.
- `src/components/donny/DonnyHome.tsx` — inline thread, `ask()`, registration effect.
- `src/components/donny/DonnyMessage.tsx` — `remark-gfm` + table components.
- `src/contexts/DonnyProvider.tsx` — `registerInlineConversation`, ref-counted `enabled`.
- `package.json` — `remark-gfm` moved dev → runtime.

**Edge function (needs a SEPARATE deploy — merging ships frontend only)**
- `supabase/functions/_shared/social-analytics.ts` — `NARROW_BUBBLE_FORMAT` instruction, imported by
  `outstand-mcp.ts` → **`donny-orchestrator`**.

**Tests:** `DonnyThread.test.tsx` (new), `DonnyProvider.inlineConversation.test.tsx` (new),
`DonnyMessage.test.tsx` (+2), `DonnyHome.test.tsx` (2 re-pinned, +7).

**No migration. No RLS change. No auth change.**

## 8. Still open

- Deploy `donny-orchestrator` after merge — the format instruction is edge-function code.
- **Both-viewport `verify-prod` has never been run on any task in this line of work.**
