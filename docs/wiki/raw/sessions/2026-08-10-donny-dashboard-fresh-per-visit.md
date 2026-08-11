# Session — the Donny dashboard starts fresh every visit (2026-08-10)

## What prompted it

The founder opened the deployed `/dashboard/business` on their phone and rejected the
shape:

> "The long scroll down still exists. We don't need the conversation from yesterday.
> Every prompt is fresh upon visit. The design flow where the conversation just runs
> down endlessly on the mobile and desktop versions is a bad UX design. The current
> conversation should appear above the prompt like Claude and ChatGPT. That animation
> should happen on the dashboard but not have the conversation run endlessly down the
> page. Once the conversation reaches the 'page length' there needs to be a scroller."

Asked how the greeting should behave once a conversation starts, they chose
**"Collapse it"**.

## The thing worth recording: two sessions solved this in parallel

While this branch was building a bounded scroller, **PR #429 merged to `main`** from
`fix/donny-prompt-chrome-and-scroll` — a parallel session acting on a differently-worded
report of the same defect (*"On the Desktop the conversation just keep running down
endlessly and there's no scroll button"*). It shipped:

- `DonnyThreadRegion` — a real bounded scroller with a scroll-to-bottom control
- the composer as a plain flex sibling beneath it
- a `max-h-[calc(100dvh-26rem)]` / `min-h-[20rem]` block
- and a defect this branch had not found: `h-full` on the scroller resolved against
  ancestors with no definite height, computing an **8337px scroller inside a 145px
  parent**, so `overflow-y-auto` had nothing to overflow. Fixed with `min-h-0 flex-1`.

**It was discovered by accident.** A Codex finding about missing `space-y-3` on this
branch's hand-rolled container prompted a look at what the panel did — and `origin/main`
turned out to contain a `DonnyThreadRegion` that did not exist when the branch started.
The `[scope]` check that *would* have caught it (`git log HEAD..origin/main -- <paths>`)
had been run that morning against **core docs only**, and came back clean.

So this branch was **reset onto `main` and rebuilt** to carry only what main lacked.
The bounded-scroller work was discarded, not merged: main's is better on every axis, and
two implementations of one behaviour is worse than either.

## What actually shipped here

**Fresh per visit.** Donny keeps ONE conversation per user, shared with the side panel,
so the dashboard **filters** it rather than forking it — the panel stays continuous, the
model still receives history, only the display is fresh. `visitBaselineId` holds the id
of the last message present when the user first asked here; `visitMessages` is everything
after it. `hasConversation` is keyed on `visitMessages`, so arriving with yesterday's
thread leaves the page in its resting arrangement.

**Slice by id, never by count or clock.** Late-arriving history lands *before* the
baseline in the ordered array and stays excluded, and no client clock is involved — a
skewed one would hide the very reply the user is waiting for.

**The greeting collapses** to its label row once a conversation is running, and the
block's max-height drops **26rem → 12rem** to match. That second half is load-bearing:
reserving room for a hero that is no longer rendered hands the reclaimed ~200px back as
whitespace and leaves the thread exactly the size it was, which is the whole point of
collapsing it. Suggestion chips retire with the hero (`compact` on `DonnyHomePrompt`).

## Codex findings — both real, both about the same confusion

**Round 1: an empty history array is not proof there is no history.** The baseline was
recorded in `ask()`, *above* the "not ready yet, queue it" guard. On a cold dashboard
`messages` is `[]` (its query is `enabled: !!conversation` and defaults to an empty
array), so a quick tap recorded `visitBaselineId = null` — "this user has no history" —
and when yesterday's thread arrived a moment later, all of it fell after the baseline and
rendered. **The founder's exact complaint, reappearing in precisely the fast-tap window
the queue exists for.**

Fixed by taking the send and the baseline at the same instant, in one `dispatch()` both
callers go through, gated on a new `messagesLoaded`.

**Round 2: `isSuccess` is not the same as "current".** React Query keeps `isSuccess` true
while a background refetch runs over **cached** data. With the thread already cached from
the side panel, readiness would be announced over a stale array, and anything added since
(another tab, another device) would land after a baseline taken from it. So
`messagesLoaded = isSuccess && !isFetching`: `isSuccess` answers *"have we ever loaded"*,
which is not the question being asked.

Round 2 also flagged the missing `space-y-3` on this branch's hand-rolled thread
container — a real defect, and the one that led to discovering #429. It is moot now:
`DonnyThreadRegion` carries `space-y-3` on its scroller.

## Tests

33 in `DonnyHome.test.tsx`. Two existing ones became **stronger** rather than merely
adjusted:

- arrival with an existing conversation asserted "thread rendered, page not scrolled";
  it now asserts the thread is **absent**
- the chips asserted `disabled`; they now assert **absence**

Three negative controls, all confirmed: reverting the filter fails 4 tests, disabling the
collapse fails 1, reverting the readiness gate fails 1. Also stubbed
`Element.prototype.scrollIntoView` in `beforeEach` — jsdom implements none, and tests that
merely *ask* now trip the follow-the-reply effect.

Full gates: typecheck 0 errors, lint 0 errors, **2373 passed / 0 failed**, build clean.

## Lessons worth carrying

- **The `[scope]` check is only as wide as the paths you give it.** Run it against the
  **source files the branch touches**, not just the core docs — a docs-clean `origin/main`
  said nothing about `src/components/donny/`, where a merged PR had just reimplemented the
  feature. On a repo with 30+ worktrees, "did someone else already ship this?" is a
  question with a real answer, cheaply available, and it was not asked.
- **When a parallel implementation lands first and is better, delete yours.** Rebuilding
  on top of #429 cost an hour and removed a whole duplicate mechanism. The instinct to
  merge both — or to defend the work already done — produces two answers to one question.
- **An empty collection is three different facts.** "Not loaded", "loaded and empty", and
  "no query ran" are distinguishable only by the query's own state. Any code that treats
  `length === 0` as evidence about the *world* rather than about the *array* is one
  slow network away from being wrong.
- **A prop named after a viewport is wrong the moment the trigger changes.** `pinned`
  meant "mobile, mid-conversation"; the real condition was "mid-conversation, any width".
  `compact` describes what the component does and survived the change.
- **A collapse that frees space must also spend it.** Collapsing the hero without
  shrinking the block's reserved chrome would have produced whitespace instead of a bigger
  thread — the visible change would have been "the greeting disappeared", which is a loss
  with no compensating gain.
