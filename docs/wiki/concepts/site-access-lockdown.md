---
title: Site Access Lockdown (Private Preview)
type: concept
created: 2026-08-23
updated: 2026-08-26
sources: [2026-08-23-site-access-lockdown.md, 2026-08-26-static-privacy-page.md]
tags: [security, vercel, middleware, authentication, supabase, lighthouse, private-preview, gotcha]
---
# Site Access Lockdown (Private Preview)

**Status (2026-08-23): built, reviewed, PR #482 open, and NOT live.** None of the four Vercel
variables is set.

**Separate the gate's BEHAVIOUR from the middleware's WIRING — this page originally conflated them
and the conflation hid a total outage.** The behaviour is production-only: on a preview
`VERCEL_ENV` is `'preview'`, so `decide()` returns `pass` and nobody is challenged. **The wiring is
not production-only.** Vercel imports and runs `middleware.ts` on every preview request, so a
preview proves that Vercel picks up a root `middleware.ts` in a Vite project, that the runtime
resolves its imports, and that `next()` continues to the origin.

That distinction was learned the expensive way. This page's first version said the wiring "has never
executed — not on a preview deploy, not in CI, not locally", and on the strength of that nobody
looked at the preview. The preview was returning **500 on every request**
(`MIDDLEWARE_INVOCATION_FAILED`) because of an extensionless import. See
"Node ESM does not add extensions" below.

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
served the app shell. Codex found it; the spec states the *rule* rather than a list, because a list
invites additions and the rule does not.

The allowlist is now `/robots.txt`, `/favicon.ico` and **`/privacy.html`** (2026-08-26, #547 — this
line read "exactly `/robots.txt` and `/favicon.ico`" until then). The third entry is the rule being
obeyed, not bent: it is a real generated file, and the change that added it also made the rule
**machine-checked** rather than merely stated — see below.

The same reasoning is why **`/promo/:promotionId` is deliberately not allowlisted** even though both
promotion surfaces still generate QR codes pointing at it, and those QR codes now lead to a password
box. It is an SPA route. Allowlisting it would reopen exactly the hole above. The founder confirmed
on 2026-08-23 that no promo QR code is live, so the cost today is zero — but **re-open this decision
before any promo QR is printed or shared**. The documented workaround is `/promo/<id>?k=<token>`.

Sharing a link without handing out the password is what the signed `?k=` bypass exists for: it mints
a 30-day HMAC-signed cookie and strips itself from the URL.

## The rule was true, stated, and enforced by nothing — until #547

`decide.ts` had carried the rule above in a doc comment since 2026-08-23, and every reader agreed
with it. Nothing checked it. That is the same shape as this codebase's four recorded column-level
`REVOKE` no-ops: a correct statement with no mechanism behind it, which holds exactly as long as
everyone who touches the file happens to read the comment.

`gate/decide.test.ts` now walks the **real** `ALLOWED_EXACT` set — exported for the purpose — and
asserts every entry has a file under `public/`. Because it walks the set rather than a copy of it, a
future entry is covered by the act of being added. Two controls, in opposite directions: the set must
hold at least three entries, since an empty set would pass vacuously; and
`apple-app-site-association` must NOT exist, proving `existsSync` can return `false` here at all.
Forced red by hand: allowlisting `/apple-app-site-association` fails with `"has no file"`, and the
pre-existing behavioural test fails alongside it.

## The privacy policy: a deadlock that was never a decision

§5's **first** founder-action item said switching `SITE_GATE_ENABLED` on "breaks every pending
platform review", because Google, Meta, TikTok and X each require an **anonymously reachable**
privacy policy and `/privacy` answers 401 with everything else. Read plainly: the lockdown and the
connector approvals are mutually exclusive, so pick one.

Nothing about the business forces that. It is an artifact of how the gate is built. **A "decision" in
a planning doc is sometimes an unexamined engineering constraint wearing a decision's clothes** — and
this one survived at the top of the list precisely because it reads as a genuine trade-off, right up
until you ask why the two are coupled at all.

The fix obeys the allowlist rule instead of bending it. `public/privacy.html` is a real file,
**generated** from the app's own policy source (`src/pages/legal/PrivacyPolicyBody.tsx`, extracted
hook-free so it renders with no React context) by `npm run legal:static`. `/privacy` itself stays
gated; the pretty URL is still a SPA route and allowlisting it would serve the whole product.

Four things the design encodes, each easy to get wrong by hand:

- **Generated, not written.** A hand-written copy is a fork of a legal document that nothing keeps in
  step, and the one field guaranteed to change — the "Last updated" date — is what a reader uses to
  decide whether to trust the page.
- **Fully self-contained.** With the gate on, everything not allowlisted answers 401, including the
  CSS bundle and the fonts. All styling is inline and there are no image requests; `/favicon.ico` is
  the single external reference, and only because it is itself allowlisted.
- **Committed, not built on the fly.** Vite copies `public/` at the *start* of a build, so generating
  into it mid-build is too late — and a `prebuild` hook would make every plain `npm run build` depend
  on the script. The committed artifact keeps a fresh checkout correct; the test keeps it honest.
- **`rel="canonical"` points at `/privacy`.** Ungated, the React route is where a human should land,
  and two indexable URLs for one policy is duplicate content. While gated that target 401s — accepted,
  since the whole site is de-listed then, which is also why `/sitemap.xml` stays off the allowlist.

**The two halves cannot land apart.** The generator refuses to write unless `decide.ts` allowlists
what it produces: a file nobody allowlists is 401'd like everything else, and an allowlisted path
with no file serves the shell. That is precisely what this page already asked of a future
`apple-app-site-association` — in prose.

Verified on prod 2026-08-26: `/privacy.html` serves 7,782 bytes, all 11 numbered sections, and is
**byte-identical** to `origin/main`'s copy, while `/privacy` still returns the React SPA and
`/nope.html` returns the shell — demonstrating rather than arguing why the pathless allowlist entry
would have been a disaster.

**Register `/privacy.html`, not `/privacy`, in the four platform consoles.** It works gated *and*
ungated; the pretty URL only ever works ungated.

**Left open:** whether `/privacy` should collapse into the static page entirely — one URL, no drift
risk at all — which would delete the React route and change what a logged-in user sees. A product
decision, not a cleanup. → [[Static Privacy Page Session]] · #547

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

## Node ESM does not add extensions, and Vercel does not bundle middleware

`import { decide } from './gate/decide'` type-checks, passes every unit test, builds clean, and
**crashes the middleware on Vercel**. The platform transpiles `middleware.ts` to `middleware.js` and
runs it as **Node ESM without bundling**, and Node's ESM resolver does not append extensions. The
import throws `ERR_MODULE_NOT_FOUND` at module load, which surfaces as
`MIDDLEWARE_INVOCATION_FAILED` and **500 on every request the matcher covers** — here, everything.

In production that is a total outage, arriving the instant the deployment goes live and unfixable by
the `SITE_GATE_ENABLED` kill switch, because the crash happens before any of the gate's logic runs.

The fix is one character group: `'./gate/decide.js'`. TypeScript maps `.js` back to the `.ts` file
under `moduleResolution: bundler`, so the typecheck is unaffected — which is exactly why nothing
local caught it.

**What caught it was the e2e smoke suite**, which drives a real browser against the PR's preview
deployment and failed with "waiting for locator('a:has-text(\"Log in\")')". The page it was waiting
on said *"This Routing Middleware has crashed."* A test that looks like it only covers login is the
only thing in the pipeline that loads the real deployed middleware.

**The generalisable rule: a local toolchain that resolves imports for you cannot tell you whether
the deployment target will.** Vite, Vitest and `tsc` all resolve extensionless specifiers. Node ESM
does not. Any file the platform runs *without* bundling — middleware, edge config, a raw ESM script —
needs explicit extensions, and no amount of local green proves it.

## What still cannot be proven before production

The gate's *behaviour* is production-only, so these stay assumed until the deploy:

- that a real browser's Basic-credential prompt admits and then replays credentials to every
  same-origin subresource — bundle chunks, fonts, the landing reels — for the whole session
- that the `#access_token` fragment on a password-reset link survives the challenge in practice
- that the `/landing/reels/(.*)` public cache rule behaves across a per-visitor gate

The wiring items that used to sit in this list — Vercel picking up the file, the runtime resolving
imports, the matcher applying, `next()` continuing — **are provable on a preview**, and one of them
was proven false there.

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
