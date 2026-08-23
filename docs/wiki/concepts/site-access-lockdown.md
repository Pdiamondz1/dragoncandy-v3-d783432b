---
title: Site Access Lockdown (Private Preview)
type: concept
created: 2026-08-23
updated: 2026-08-23
sources: [2026-08-23-site-access-lockdown.md]
tags: [security, vercel, middleware, authentication, supabase, lighthouse, private-preview, gotcha]
---
# Site Access Lockdown (Private Preview)

**Status (2026-08-23): built, reviewed, and NOT live.** The branch is unmerged, no PR is open, and
none of the four Vercel variables is set. **The gate is production-only by design, so nothing about
its wiring has ever executed** — not on a preview deploy, not in CI, not locally. What is proven is
the decision logic (26 unit tests) and the documents. What is assumed is everything Vercel does with
them. Read the "What cannot be proven before production" section before trusting any of this as a
description of a running system.

The runbook is `docs/runbooks/site-access-lockdown.md` and is the single source of truth for the
cutover. This page is the *why*.

## The premise that shapes everything

dragoncandy.com was public and not ready to be. The obvious framing — "put a password on it so
nobody can sign up" — is wrong at the premise, and getting that right first determined the whole
design.

**A password cannot stop a signup.** `VITE_SUPABASE_ANON_KEY` ships in the browser bundle, so anyone
who has ever loaded the site holds a working credential. Requests to `supabase.co` never traverse
Vercel, so no middleware, edge function, or front-end guard is even on the path. The only control
that stops account creation is **Supabase's own "Allow new users to sign up" toggle**.

So the work is two independent layers, and it matters which one does what:

1. **Supabase public signup off** — the load-bearing control. A dashboard setting, not code.
2. **An HTTP Basic password at the edge** — stops discovery and casual poking. It does **not**
   protect Supabase.

Neither substitutes for the other. A reader who remembers only one thing from this page should
remember that the password is the *lesser* of the two controls.

## Why edge middleware, and why a 401

Vercel's built-in deployment protection cannot cover custom domains on the Hobby plan, so the gate
is `middleware.ts` (a thin shim) over `gate/decide.ts` (a pure, unit-tested decision function).
Splitting them is what makes any of this testable: `decide()` takes a `Request` and an env bag and
returns `pass | challenge | redirect`, with no Vercel imports and no I/O.

**The gate answers with a `401` challenge and never a redirect to a gate page.** This is the
load-bearing decision. After the browser prompt, a `401` makes the browser re-request the
**identical URL** — so a Supabase password-reset link's `#access_token` fragment survives. A
redirect to `/gate?next=…` drops the fragment, and password resets break silently for everyone.
That single choice also removed the need for bypass tokens in email flows, and avoided putting any
secret into a `VITE_` variable.

Two rules follow and are not negotiable:

- **No gate variable may carry a `VITE_` prefix.** A `VITE_` variable is compiled into the browser
  bundle, which would publish the password. See [[Local/Production Boundary & Repo Joinability]] for
  the sibling failure.
- **The gate fails closed.** A missing secret or password yields a challenge, never a pass. That
  makes "delete the variables" the *wrong* rollback — it locks everyone out — which is why
  `SITE_GATE_ENABLED` exists as an explicit kill switch.

## Only allowlist a path that has a real file under `public/`

`vercel.json` rewrites every unmatched path to `/index.html`. So **allowlisting a path with no
backing file does not serve "nothing" — it serves the SPA shell**, and with it the entire JS bundle,
to an anonymous browser.

This is not theoretical. The first implementation allowlisted `/.well-known/` and
`/apple-app-site-association` for Apple's association file. Neither exists under `public/`. Both
served the app shell. Codex found it; the allowlist is now exactly `/robots.txt` and `/favicon.ico`,
and the spec states the *rule* rather than a list, because a list invites additions and the rule
does not.

The same reasoning is why **`/promo/:promotionId` is deliberately not allowlisted** even though both
promotion surfaces still generate QR codes pointing at it, and those QR codes now lead to a password
box. It is an SPA route. Allowlisting it would reopen exactly the hole above. The founder confirmed
on 2026-08-23 that no promo QR code is live, so the cost today is zero — but **re-open this decision
before any promo QR is printed or shared**. The documented workaround is `/promo/<id>?k=<token>`.

Sharing a link without handing out the password is what the signed `?k=` bypass exists for: it mints
a 30-day HMAC-signed cookie and strips itself from the URL.

## Two ways to be admitted, and therefore two ways to revoke

This asymmetry is easy to get wrong under pressure, which is when someone will need it:

| Held by | Evicted by |
|---|---|
| Basic credentials (typed the password) | changing `SITE_PASSWORD` |
| A `?k=` cookie | rotating `SITE_GATE_SECRET` — **and it evicts everyone at once** |

Changing the password does **not** touch a `?k=` recipient, who keeps the whole site for up to 30
days. Rotating `SITE_BYPASS_TOKEN` stops new links working but does not invalidate cookies already
minted.

## The rollback lever needs a redeploy — and so does the setup

Four documents originally said that changing an environment variable in the Vercel dashboard reaches
the running production deployment. **It does not.** Vercel's documentation is explicit: *"Changes to
environment variables are not applied to previous deployments, they only apply to new deployments."*

For a deliberately fail-closed system this is the one instruction that must be right, because the
scenario is: the gate misfires, the site is 401-ing for everyone including the founder, they set
`SITE_GATE_ENABLED=0` as instructed — and nothing changes. So: **set the variable, then redeploy.**

The same mechanism makes the setup order load-bearing in the other direction. **All four variables
must exist before the deployment that first ships `middleware.ts`**, or the gate ships inert while
the dashboard looks locked down.

## The Lighthouse trap: silencing an audit does not change a category score

`robots.txt` is `Disallow: /` while the site is private, which fails Lighthouse's `is-crawlable`
audit. The obvious remedy is wrong twice over, and both halves cost a CI failure.

**First**, `assert.assertions: {'is-crawlable': 'off'}` is inert against this gate. An LHCI *category*
assertion reads `lhr.categories.seo.score`, which Lighthouse computed at collect time; turning off an
assertion **on an audit** cannot change a number that already exists. Lighthouse weights this audit
at `93/23` precisely so that failing it fails the category. Measured on the real build: **0.69** with
the audit and **1.00** with it skipped, and it was the *only* failing audit against a `0.95` bar. It
has to be `skipAudits`, at collect time, where the category renormalises over the audits that remain.

**Second**, putting `collect.settings.skipAudits` in `lighthouserc.cjs` *also* fails. An
`LHCI_COLLECT__SETTINGS__*` environment variable **replaces the config file's whole `settings`
object**, and the desktop job already sets the preset that way — so the file's copy arrived in the
report as `skipAudits: null` and SEO read 0.69 again. It ships as an env var on **both** jobs; the
file keeps a copy as the local default and says why that is not enough.

The scalar form is fine — LHCI coerces it. A real run reported
`configSettings.skipAudits == ["is-crawlable"]`, the audit absent from the report entirely, and
`categories:seo` 1.00.

**Turn all of this back on at public launch, in the same change that restores `public/robots.txt`.**

## `undefined` is not the continue signal

Framework-agnostic Routing Middleware continues to the origin by returning **`next()` from
`@vercel/functions`** — Vercel's docs carry an explicit no-op example for non-Next frameworks.
Returning a bare `undefined` is a Next.js convention that the framework-agnostic docs never state.

The risk is asymmetric and invisible: if `undefined` did not continue, **every authorised request
would break**, in production only, where the gate is the sole thing that runs it and no preview can
show it. One dependency buys the documented contract.

A related claim was asserted in **five** places and was simply false: *"a pass structurally cannot
carry a `Set-Cookie`."* `next({ headers })` can set response headers. The behaviour did not change —
the Basic-auth branch still sets no cookie — but the *reason* did: browsers cache Basic credentials
per origin and realm and replay them automatically, so a cookie is redundant. **It is a choice, not
a limit**, and recording it as a limit would have had the next person design around a constraint
that does not exist.

## A fail-open branch in front of fail-closed logic

`decide()` opened with `if (env.vercelEnv !== 'production') return { kind: 'pass' }`, so that
previews stay usable. That passes every request when `VERCEL_ENV` is **absent**, not merely when it
is `'preview'` — and `VERCEL_ENV` is a *system* variable, available only while the project's
"Automatically expose System Environment Variables" setting is on, and not injected at all by
`vercel deploy --prebuilt`.

The failure is the shape this project keeps meeting: the site silently reopens while
`SITE_GATE_ENABLED` still reads `1` in the dashboard and nothing looks wrong — *recorded ≠ actual*,
the same class as [[Updated-At Trigger Drift]]. The guard is now
`env.vercelEnv && env.vercelEnv !== 'production'`: preview still passes, absence falls through to
the fail-closed path.

## Credentials and subresources

`index.html`'s `<link rel="manifest">` needed `crossorigin="use-credentials"`. Per the HTML spec a
manifest link with no `crossorigin` attribute is fetched with credentials mode **omit**, so the
browser will not attach its cached Basic credentials, and every page load logs a `401` — directly
contradicting the runbook's "the console is clean" check, and costing PWA install and theme-color.

Same-origin fonts and icons are unaffected: a bare `crossorigin` means credentials mode
"same-origin", which *does* send them.

## The dead gate that had to go

A client-side `SiteGateGuard` already existed, switched off, holding `dragoncandy2026` as a **string
constant in the shipped bundle**. Its allowlist also let `/auth` through, so it never gated signup
even when it was on.

**A gate rendered by the app cannot gate the app** — the bundle has already been served by the time
it runs. Worse, because the iOS Capacitor shell ships that same bundle, a client-side gate would put
a password screen in front of the native app, which serves from `capacitor://localhost` and never
asks Vercel for HTML at all. Deleted, and `CLAUDE.md`'s provider hierarchy corrected, since it had
gone on documenting the component.

## What cannot be proven before production

The gate is production-only by design. Four things stay assumed until the deploy:

- that Vercel picks up a file-convention `middleware.ts` in a **Vite** project on this account's plan
- that the `nodejs` runtime resolves `node:process`
- that the matcher regex is applied as written
- that `next()` continues to the origin (review reduced this from a guess to the documented contract)

Also unmeasured: that browsers replay Basic credentials to every same-origin subresource — bundle
chunks, fonts, the landing reels — for the whole session. This is how Chrome, Firefox and Safari
behave, but there is no test for it.

And the Lighthouse `1.00` above was measured locally, not by CI. **The first green
`lighthouse-ci.yml` on the PR is the proof, and merging on a skipped or unrun Lighthouse job would
throw it away.**

## Method notes worth keeping

**When a probe returns the wrong thing, suspect the instrument.** A stale `vite preview` from the
*main checkout* was holding port 8080 — the port `lighthouserc.cjs` points at. A local Lighthouse
run would have audited a different build entirely and read green. Caught only because the served
`robots.txt` did not match `dist/robots.txt`. Same family as the `RCPT TO` probe in
[[Domain Migration (.io → .com)]] and the zero-returning scroll probe in
[[Mobile Viewport & Fixed Positioning]].

**The red half of a red-green cycle is not optional.** The plan's step said *"Expected: FAIL on
categories:seo"* and `lhci` could not be run locally when the config was written, so the step was
honestly recorded as SKIPPED — and an unobserved *"Expected: PASS"* travelled all the way to the
merge gate. The Critical defect lived in exactly that gap. **A verification step that was skipped
proves nothing, and a pipeline that carries its expected result forward will launder the skip into
an assertion.**

**One copy of an operational document.** The implementation plan embedded a full copy of the runbook
as the heredoc its final task writes. A fix wave updated the runbook and only part of the copy,
leaving the copy stating the exact revocation claim the correction existed to kill — and anyone
regenerating the runbook from the plan would have reinstated it. Replaced with a pointer.

## See Also

- [[verify_jwt Is Not Authorization]] — the sibling lesson: a platform gate that looks like an auth
  check and is not. Both pages turn on the anon key being public.
- [[Local/Production Boundary & Repo Joinability]] — the other place a build-time variable leaked
  something it should not.
- [[Updated-At Trigger Drift]] — *recorded ≠ actual*, the class the `VERCEL_ENV` fail-open belongs to.
- [[QA CI/CD Gate]] — the Lighthouse gate this work had to keep honest.
- [[Domain Migration (.io → .com)]] — where the `.com` canonical origin the runbook checks came from.
