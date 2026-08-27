# A static privacy policy the site gate can serve

**Date:** 2026-08-26
**Type:** session extract (code change; PR #547, merged `f467b3ed`, live on prod)

## The deadlock, and why it was never a decision

`PROJECT_CONTEXT` §5's **first** founder-action item said the site gate is "a
decision, not a task", because switching `SITE_GATE_ENABLED` on "breaks every
pending platform review" — the allowlist is exactly `/robots.txt` and
`/favicon.ico`, so `/` and `/privacy` answer 401, and Google, Meta, TikTok and X
each require an anonymously reachable privacy policy.

Read plainly, that says the lockdown and the connector approvals are mutually
exclusive. But nothing about the *business* forces that. It is an artifact of how
the gate is built, and it is fixable in an afternoon.

**The generalisable half: a "decision" in a planning doc is sometimes an
unexamined engineering constraint wearing a decision's clothes.** This one had sat
at the top of the list, and the reason it survived is that it reads as a genuine
trade-off — lock the site *or* get approved — right up until you ask why the two
are coupled at all.

## The obvious fix is wrong, and the gate already said so

Add `/privacy` to the allowlist. `gate/decide.ts`'s own comment explains why not:

> a path may only be listed here if a real file exists for it under `public/`.
> `vercel.json` rewrites every unmatched path to `/index.html`, so allowlisting a
> path with no backing file does not serve "nothing" — it serves the SPA shell.

`/privacy` is a React route. There is no file. Allowlisting it serves the whole
application to an anonymous browser — and because the app talks straight to
`supabase.co`, which never traverses Vercel, that shell is a **working product**,
not a screenshot. A one-line config change would have quietly un-gated the site
while looking like it did the opposite.

That rule was not hypothetical: the lockdown's own first implementation
allowlisted `/.well-known/` and `/apple-app-site-association`, neither of which
existed, and both served the shell. Codex caught it then.

## What shipped

A real file at `public/privacy.html`, allowlisted — and **generated**, not typed.

- `src/pages/legal/PrivacyPolicyBody.tsx` — the policy TEXT, extracted hook-free
  so it renders with no React context at all. `PrivacyPolicy.tsx` is now only the
  in-app chrome around it.
- `scripts/build-legal-static.ts` (`npm run legal:static`) — `renderToStaticMarkup`
  into a self-contained page.
- `gate/decide.ts` — `/privacy.html` on the allowlist, with the reasoning beside it.

**The generator refuses to run unless the gate allowlists what it produces.** A
file nobody allowlists is 401'd like everything else; an allowlisted path with no
file serves the SPA shell. The two halves are useless apart, so they must not be
able to land apart. Note this is exactly what the existing comment asks of a future
`apple-app-site-association` — *in prose*, hoping someone reads it.

## Four things the design encodes

**(1) Generated, because a hand-written copy is a fork of a legal document.**
Nothing would keep it in step, and the field guaranteed to change —
`PRIVACY_LAST_UPDATED` — is the one a reader uses to decide whether to trust the
page. One source, two renderers.

**(2) Fully self-contained.** When the gate is on, *everything* not allowlisted
answers 401 — `/assets/*.css`, `/fonts/*`, `/logo.webp`. A stylesheet link would
leave a reviewer looking at unstyled text on the one page we are asking them to
judge us by. All CSS is inline; there are no image requests. `/favicon.ico` is the
single external reference, and only because it is itself allowlisted.

**(3) Committed, not built on the fly.** Vite copies `public/` at the *start* of a
build, so generating into it mid-build is too late, and a `prebuild` hook would
make every plain `npm run build` depend on this script. Committing keeps a fresh
checkout correct; the test is what keeps it honest.

**(4) `rel="canonical"` points at `/privacy`, not at itself.** Ungated, the React
route is where a human should land, and two indexable URLs for one policy is
duplicate content. While gated the canonical target 401s — accepted, because the
whole site is de-listed then and `/sitemap.xml` is deliberately not allowlisted for
the same reason.

## The guards, and the prose one of them replaces

`src/pages/legal/privacyStatic.test.ts` compares the **whole** committed file to a
fresh render. Whole, not sampled: sampling cannot see a *deleted* section, and a
privacy policy missing a section is exactly the failure a sampled check waves
through. Plus self-containment (no `<script>`, no stylesheet, no `src=`,
same-origin hrefs exactly `["/favicon.ico"]`) and contiguous numbered sections.

`gate/decide.test.ts` now walks the **real** `ALLOWED_EXACT` set and asserts every
entry has a file under `public/`. **That rule had been stated in prose in
`decide.ts` since 2026-08-23 and nothing checked it** — the same shape as the
column-REVOKE no-op recorded four times over: a correct statement that no mechanism
enforces. Controls in both directions: the set must hold ≥3 entries (an empty set
passes vacuously), and `apple-app-site-association` must NOT exist, proving
`existsSync` can return false here at all.

There is also a test that `/privacy` itself still challenges — allowlisting the
pretty URL was the obvious move and the wrong one, so it is pinned rather than left
to memory.

**All four forced red by hand:**

| guard | forced-red result |
|---|---|
| whole-file comparison | bumped the date without regenerating → 2 failures |
| contiguous sections | deleted §7 and regenerated → `expected [1,2,3,4,5,6,8,9,10,11] to deeply equal […]` |
| every allowlisted path has a file | allowlisted `/apple-app-site-association` → `"has no file"` |
| the generator's refusal | removed the allowlist entry → refuses, exit 1 |

## A toolchain trap

`npx tsx` resolves the **root** `tsconfig.json`, which is solution-style
(`files: []` + `references`) and carries no `jsx` setting — so esbuild falls back to
the **classic** transform. The failure surfaces not in the script but in the
*imported component*, at render time, as `ReferenceError: React is not defined`
pointing at a file that looks perfectly fine.

**Adding `jsx` to the root config does not fix it; naming `tsconfig.app.json`
does.** The root edit was tried, measured as ineffective, and reverted rather than
left in as cargo — a change that does nothing is worse than no change, because the
next reader assumes it is load-bearing.

## Verification on prod, and a probe that lied

`https://dragoncandy.com/privacy.html` serves 7,782 bytes, all 11 numbered
sections, the correct entity and contact address, and is **byte-identical** to
`origin/main`'s copy. Controls: `/privacy` still returns the React SPA, and
`/nope.html` returns the SPA shell — which demonstrates on prod, rather than
argues, why allowlisting a pathless URL would have been a disaster.

**The first verification reported failure, and the probe was at fault.** The wait
loop polled until `/privacy.html` returned `200` — but the SPA catch-all answers
200 for *every* path, so the exit condition could not distinguish "deployed" from
"not deployed", and it broke on the first request. The page then read as the SPA
shell and looked like a broken change.

What settled it was a **control**: `robots.txt` serves real text today, which
proves static files beat the catch-all rewrite. Re-polled on **content** rather
than status, and it had landed within 30 seconds.

**Third instance this session of the same error: waiting on a signal whose success
and failure states are identical.** The other two were an RAG probe run before a
background sync had finished, and a `mergeStateStatus: BLOCKED` where every visible
check was green because the *missing* one was required. The fix is the same each
time — poll the thing you actually care about, and pair it with a control that
could have come out the other way.

## What this does and does not change

Nothing to deploy: it is a Vercel artifact that ships on merge. The gate is still
**off** in production, so nothing changed for any visitor today.

**What changed, stated precisely — the first draft of this file overstated it as "no
longer breaks four app reviews".** Two rounds of the Codex second review narrowed it,
and both narrowings matter:

- **The legal URLs.** Every console asks for a privacy URL **and a terms URL on the
  same form**, so shipping only `privacy.html` left an anonymously inaccessible legal
  URL in a live submission. The runbook briefly hedged that as "TikTok does not appear
  to fetch it" — an assumption about a reviewer's behaviour, not a basis for calling a
  platform unblocked. `terms.html` now ships alongside, from the same generator.
  Register **`/privacy.html` and `/terms.html`**, never the pretty routes.
- **Google needs more than legal pages.** Its verification also requires the
  **HOMEPAGE** reachable by a reviewer signed in to nothing, and `/` is the SPA and
  still 401s. Nothing here touched that.

So: **Meta, TikTok and X are unblocked. Google is not** — it still needs the gate off
during verification, or a static homepage nobody has built.
→ `docs/runbooks/google-oauth-demo-video.md`

**Left open deliberately:** whether `/privacy` should collapse into the static page
entirely. That would delete the React route, give one URL instead of two, and
remove the drift risk at its root — but it changes what a logged-in user sees, so
it is a product decision, not a cleanup.
