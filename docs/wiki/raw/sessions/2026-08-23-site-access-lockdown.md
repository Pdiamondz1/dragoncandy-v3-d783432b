# Session — site access lockdown (private preview)

Date: 2026-08-23
Branch: `worktree-DC-app-security-access`
Spec: `docs/superpowers/specs/2026-08-23-site-access-lockdown-design.md`
Plan: `docs/superpowers/plans/2026-08-23-site-access-lockdown.md`
Runbook: `docs/runbooks/site-access-lockdown.md`

## The ask

dragoncandy.com was public and not ready to be. Anyone could find it and sign up.
The founder wanted it live online but reachable only by people with accounts and by
stakeholders — landing page included, explicitly not exempt.

## What shipped

Two independent layers. Neither substitutes for the other, and only one of them is
the control that actually stops signup.

**Layer 1 — Supabase public signup off.** This is the load-bearing control, and it is
a dashboard setting, not code. `VITE_SUPABASE_ANON_KEY` ships in the browser bundle,
so anyone can POST straight at the auth endpoint. Requests to `supabase.co` never
traverse Vercel, so **no amount of front-end or edge work can stop a signup.** Any
design that treated the password as the anti-signup control would have been wrong at
the premise. New accounts now arrive by invite.

**Layer 2 — an HTTP Basic password at the edge**, as Vercel Routing Middleware:
`middleware.ts` (a thin shim) plus `gate/decide.ts` (a pure, unit-tested decision
function, 26 tests). Chosen over Vercel's built-in deployment protection because the
project is on Hobby, where protection cannot cover custom domains.

**Layer 3 — signed `?k=` bypass links** rather than open path carve-outs. Carving out
a path on an SPA does not expose a page, it exposes the whole bundle, because
`vercel.json` rewrites every unmatched path to `/index.html`.

**Layer 4** — `robots.txt` is `Disallow: /`. **Layer 5** — the dead client-side gate
deleted.

## Key decisions

**A 401 challenge, never a redirect to a gate page.** The 401 makes the browser
re-request the *identical* URL after the prompt, so a Supabase password-reset link's
`#access_token` fragment survives. A redirect drops the fragment and breaks resets
silently. This one choice also removed the need for bypass tokens in email flows, and
avoided putting any secret into a `VITE_` variable.

**Fail closed, with an explicit kill switch.** A missing secret or password yields a
challenge, never a pass. That makes "delete the variables" the *wrong* rollback — it
locks everyone out — so `SITE_GATE_ENABLED` exists as the lever instead.

**No gate variable may carry a `VITE_` prefix.** A `VITE_` variable is compiled into
the browser bundle, which would publish the password.

**Only allowlist a path that has a real file under `public/`.** See the `/.well-known`
defect below — this is the rule that came out of it.

## Defects found in review (the valuable part)

**The allowlist had two entries with no backing file.** `/.well-known/` and
`/apple-app-site-association` were allowlisted, neither exists under `public/`, and
`vercel.json` rewrites unmatched paths to `/index.html` — so both served the SPA shell
to anonymous browsers, falsifying in practice the invariant the spec asserted in
writing. Found by Codex. Fixed by reducing the allowlist to `/robots.txt` and
`/favicon.ico`, and by rewriting the spec's allowlist section as a *rule* rather than
a list.

**`atob()` returns Latin-1 while the challenge advertises `charset="UTF-8"`.** A
non-ASCII `SITE_PASSWORD` would have been rejected — locking everyone out of a
fail-closed system. Fixed with `TextDecoder('utf-8', { fatal: true })`.

**The Lighthouse exemption was written in a place that cannot work.**
`assert.assertions: {'is-crawlable': 'off'}` disables an assertion *on an audit*; the
gate asserts `categories:seo`, which reads the score Lighthouse already computed at
collect time. Lighthouse weights this audit at 93/23 specifically so failing it fails
the category. Measured on the real build: **0.69** with the audit, **1.00** with it
skipped, and it was the only failing audit. CI would have gone red on the PR. It has
to be `skipAudits` at collect time.

**And the obvious fix for that still fails.** An `LHCI_COLLECT__SETTINGS__*` env var
**replaces** the config file's whole `settings` object, and the desktop job already
sets the preset that way — so `collect.settings.skipAudits` in `lighthouserc.cjs`
arrived in the report as `null` and SEO read 0.69 again. It ships as an env var on
both jobs; the file keeps a copy as the local default and says why it is not enough.
(The scalar is fine: LHCI coerces it — a real run reported
`configSettings.skipAudits == ["is-crawlable"]`, the audit absent, seo 1.00.)

**Returning bare `undefined` to continue is a Next.js convention, not the
framework-agnostic contract.** Vercel's Routing Middleware docs give an explicit
no-op for non-Next frameworks: `next()` from `@vercel/functions`. If `undefined` did
not continue, every authorised request would break — in production only, where no
preview can show it. Now `return next()`.

**A fail-OPEN branch sat ahead of all the fail-closed logic.**
`env.vercelEnv !== 'production'` passes every request when `VERCEL_ENV` is *absent* —
and it is a system variable that can be switched off and is not injected by
`vercel deploy --prebuilt`. The site would silently reopen while the dashboard still
read `SITE_GATE_ENABLED=1`. Now `env.vercelEnv && env.vercelEnv !== 'production'`.

**The rollback lever was documented by a mechanism Vercel does not have.** Four
documents said an env-var change reaches a running deployment. Vercel's docs are
explicit that it does not — you must redeploy. This was the emergency path for a
deliberately fail-closed system: the one instruction that must be right. It also
makes the setup order load-bearing in the other direction — the four variables must
exist *before* the deployment that first ships `middleware.ts`, or the gate ships
inert while the dashboard looks locked down.

**The manifest link would 401 on every page load.** A `<link rel="manifest">` with no
`crossorigin` is fetched with credentials mode "omit", so the browser will not attach
its cached Basic credentials. Fixed with `crossorigin="use-credentials"`.

**A claim asserted in five places was false.** "A pass structurally cannot carry a
`Set-Cookie`" — `next({ headers })` can set them. Behaviour did not change (the
Basic branch still sets no cookie) but the *rationale* did: browsers cache Basic
credentials per origin and realm and replay them automatically, so a cookie is
redundant. It is a choice, not a limit. The fifth occurrence was a test name, found
by searching rather than trusting line numbers.

**Two copies of the runbook drifted.** The plan embedded a full copy as the heredoc
its Task 7 writes, and a fix wave updated only part of it — leaving the copy stating
the exact revocation claim the correction existed to kill. Replaced with a pointer.

## Consequences accepted, not overlooked

`/promo/:promotionId` now challenges, and both promotion surfaces still generate QR
codes pointing at it. It is deliberately **not** allowlisted — it is an SPA route with
no backing file, so allowlisting would serve the whole bundle. The founder confirmed
on 2026-08-23 that **no promo QR code is live**, so this costs nothing today. It is a
documented Known limit with a `?k=` workaround. Re-open before any promo QR is printed.

Supabase invite emails link to the site, which now challenges — so every invite must
travel with the password or be sent as a `?k=` link.

Revocation takes two different levers: changing `SITE_PASSWORD` evicts Basic-credential
holders, but a `?k=` recipient holds a cookie signed over an expiry alone and keeps the
site for up to 30 days. Only rotating `SITE_GATE_SECRET` invalidates cookies, and it
invalidates every one at once.

## What is NOT proven

The middleware is production-only by design, so it cannot be exercised on a preview
deploy. Four things stay assumed until the deploy: that Vercel picks up a root
`middleware.ts` in a Vite project on this plan, that the `nodejs` runtime resolves
`node:process`, that the matcher applies as written, and that `next()` continues to
the origin (the review reduced this last one from a guess to the documented contract).
The Lighthouse 1.00 was measured locally, not by CI — the first green
`lighthouse-ci.yml` on the PR remains the proof.

## Method notes worth keeping

**A stale `vite preview` from the main checkout was holding port 8080** — the port
`lighthouserc.cjs` points at. A local Lighthouse check would have audited someone
else's build and read green. Found by `lsof` after the served `robots.txt` did not
match `dist/robots.txt`.

**The red half of a red-green cycle was never observed.** The plan's step said
"Expected: FAIL on categories:seo" and `lhci` could not be run locally at the time, so
the step was recorded as SKIPPED and an unobserved "Expected: PASS" travelled all the
way to the merge gate. The Critical defect lived in exactly that gap.

## Files

Created: `gate/decide.ts`, `gate/decide.test.ts`, `middleware.ts`,
`src/lib/signupDisabled.ts` + test, `docs/runbooks/site-access-lockdown.md`.
Deleted: `src/components/SiteGateGuard.tsx`, `src/lib/siteGate.ts`,
`src/pages/SiteGate.tsx` (which held `dragoncandy2026` as a bundled string constant).
Modified: `src/App.tsx`, `src/components/auth/AuthForm.tsx`,
`src/components/auth/AuthenticationModal.tsx`, `public/robots.txt`,
`lighthouserc.cjs`, `.github/workflows/lighthouse-ci.yml`, `index.html`,
`tsconfig.app.json`, `CLAUDE.md`, `.gitignore`, `package.json`.
Dependency added: `@vercel/functions@3.9.5` (runtime).
No migration. No RLS change. No edge-function change.

## Review record

Six task reviews (0 Critical each), a final whole-branch review (1 Critical, 5
Important, 4 Minor — all closed), a scoped re-review (all ten closed, 3 residuals,
all closed), and three Codex passes, the last clean:
"The edge-gate logic is coherent, fail-closed, and covered by focused tests... no
actionable correctness regression was identified."
