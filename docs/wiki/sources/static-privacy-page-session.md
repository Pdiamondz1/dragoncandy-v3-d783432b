---
title: Static Privacy Page Session
type: source
created: 2026-08-26
updated: 2026-08-26
sources: [2026-08-26-static-privacy-page.md]
tags: [security, vercel, middleware, private-preview, legal, generators, guards, gotcha]
---
# Static Privacy Page Session

2026-08-26. `public/privacy.html` — a real, generated, self-contained privacy policy that
the site gate allowlists — so switching `SITE_GATE_ENABLED` on no longer breaks four
platform reviews. PR #547 (`f467b3ed`), live and verified on prod. Full mechanics live on
[[Site Access Lockdown (Private Preview)]].

## A deadlock that was never a decision

`PROJECT_CONTEXT` §5's **first** founder-action item said the gate is "a decision, not a
task", because switching it on breaks every pending platform review: Google, Meta, TikTok
and X each require an **anonymously reachable** privacy policy, and `/privacy` answers 401
with everything else. Read plainly, the lockdown and the connector approvals were mutually
exclusive.

Nothing about the business forces that. It is an artifact of how the gate is built.

**A "decision" in a planning doc is sometimes an unexamined engineering constraint wearing a
decision's clothes.** This one sat at the top of the list because it reads as a genuine
trade-off — lock the site *or* get approved — right up until you ask why the two are coupled.

## The obvious fix would have un-gated the site

Adding `/privacy` to the allowlist looks like a one-line config change. `gate/decide.ts`'s
own comment says why not: `vercel.json` rewrites every unmatched path to `/index.html`, so
allowlisting a path with no backing file serves the **SPA shell**. And because the app talks
straight to `supabase.co`, which never traverses Vercel, that shell is a working product,
not a screenshot.

So the fix obeys the rule instead of bending it: a real generated file at
`public/privacy.html`, with `/privacy` still gated.

## The rule was enforced by nothing until this change

That allowlist rule had been in a doc comment since 2026-08-23 and nothing checked it — the
same shape as this codebase's four recorded column-level `REVOKE` no-ops: a correct statement
with no mechanism behind it. `gate/decide.test.ts` now walks the **real** `ALLOWED_EXACT` set
and asserts every entry has a file under `public/`, with controls in both directions (the set
must hold ≥3 entries, since an empty one passes vacuously; and a known-absent path must still
read as absent).

## Design points worth carrying

Generated rather than hand-written, because a hand-written copy is a fork of a legal document
that nothing keeps in step — and the "Last updated" date is what a reader uses to decide
whether to trust it. Fully self-contained, because with the gate on the CSS bundle and fonts
answer 401 too. Committed rather than built on the fly, because Vite copies `public/` at the
*start* of a build. And the generator **refuses to run** unless the gate allowlists what it
produces, so the two useless-apart halves cannot land apart.

## A toolchain trap, and a probe that lied

`npx tsx` resolves the ROOT `tsconfig.json`, which is solution-style and carries no `jsx`
setting, so esbuild uses the classic transform — and the failure surfaces in the *imported
component* as `ReferenceError: React is not defined`, pointing at a file that looks fine.
Adding `jsx` to the root config does **not** fix it; naming `tsconfig.app.json` does. The
ineffective root edit was reverted rather than left in as cargo.

The first prod verification reported failure, and **the probe was at fault**: it polled until
`/privacy.html` returned `200`, but the SPA catch-all answers 200 for every path, so the exit
condition could not distinguish "deployed" from "not deployed". A control settled it —
`robots.txt` serves real text, proving static files beat the rewrite — and re-polling on
*content* showed it had landed in 30 seconds. **Third instance this session of waiting on a
signal whose success and failure states are identical.**

## Register the right URL

`/privacy.html` goes in the Google, Meta, TikTok and X consoles. It works gated **and**
ungated; `/privacy` only ever works ungated.

## See Also

- [[Site Access Lockdown (Private Preview)]] — the gate, the allowlist rule, and the full detail
- [[Verify Before Reporting]] — the probe-with-a-control discipline this session leaned on three times
