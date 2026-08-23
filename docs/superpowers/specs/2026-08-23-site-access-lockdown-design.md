---
title: Site access lockdown — private preview
date: 2026-08-23
status: design
branch: worktree-DC-app-security-access
---

# Site access lockdown — private preview

## Problem

`dragoncandy.com` is open to the world and the product is not ready for it.
Anyone can find the site, create an account, and act inside a live marketplace
alongside ~30 real users — publishing campaigns, messaging people, uploading to
DragonShare, and spending real Anthropic budget through Donny.

The team is on Vercel's **hobby** plan. The project's deployment protection reads
`ssoProtection: all_except_custom_domains`, so `*.vercel.app` is gated and the
custom domain — the one people actually reach — is not.

A gate already exists and is switched off. `src/components/SiteGateGuard.tsx`
returns its children with the real logic commented out; the password
`dragoncandy2026` is a string constant in `src/pages/SiteGate.tsx`, which means
it ships inside the JavaScript bundle. Its allowlist also let `/auth` through, so
it never gated signup even when it was on.

## Decisions taken

Confirmed with the founder before this spec was written:

1. **The whole domain goes behind one password.** The marketing landing page is
   not exempt.
2. **Public signup is turned off.** New accounts exist only by invite.
3. **Links can be shared without handing out the site password**, via a bypass
   token.

## The threat this does and does not address

The password stops discovery and casual poking. It does **not** stop account
creation, and cannot: `VITE_SUPABASE_ANON_KEY` ships in the bundle, so anyone can
POST directly to the Supabase auth endpoint without ever loading a page served by
Vercel. Requests to `supabase.co` never traverse Vercel and no middleware will
ever see them.

Disabling signup is therefore not an optional extra. It is the control that
answers the stated problem; the password is the front door around it.

## Design

### Layer 1 — Supabase: public signup off

Supabase Dashboard → Authentication → Sign In / Providers → disable
**Allow new users to sign up**. Enforced by GoTrue server-side, so it holds
regardless of how the request arrives.

Consequences:

- `supabase.auth.signUp` (two call sites: `src/components/auth/AuthForm.tsx:47`
  and `src/components/auth/AuthenticationModal.tsx:41`) begins returning a
  `422 signup_disabled`. Both must render an honest "DragonCandy is in private
  preview — ask for an invite" state instead of a generic failure.
- Existing users are unaffected. Login, refresh and password reset all continue.
- New accounts are created by invite from the Supabase dashboard, or by
  `auth.admin.inviteUserByEmail` from a service-role edge function.

### Layer 2 — `middleware.ts`: an edge password on the production hosts

A framework-agnostic Vercel **Routing Middleware** at the repo root. It is a
default export from `middleware.ts` and requires no framework support, so it
works for this Vite SPA. It runs before routing, so it fires ahead of the
`/(.*)` → `/index.html` rewrite in `vercel.json`, and ahead of the CDN.

Behaviour, in order:

1. **Not production, or not enabled → pass.** Gate only when
   `VERCEL_ENV === 'production'` **and** `SITE_GATE_ENABLED === '1'`.
   Preview deployments are already covered by Vercel's own SSO protection;
   double-gating them adds nothing and breaks the E2E smoke suite (below).
   `SITE_GATE_ENABLED` is the kill switch — see Rollback.
2. **Static allowlist → pass.** `/robots.txt`, `/favicon.ico`. The rule behind
   the list, not just the list itself: a path may only be allowlisted if a real
   file exists for it under `public/`, because `vercel.json` rewrites every
   unmatched path to `/index.html` — allowlisting a path with no backing file
   does not serve "nothing", it serves the SPA shell to an unauthenticated
   browser. That is why `/.well-known/*` and `/apple-app-site-association`
   were removed from this list: neither has a file in `public/` today, so both
   were quietly serving the shell to anyone who requested them (Codex second
   review caught `/.well-known/*`; `/apple-app-site-association` had the
   identical defect). If an `apple-app-site-association` file is ever added
   for iOS universal links, it must be added to `public/` and to this
   allowlist in the same change — Apple looks for it at
   `/apple-app-site-association` and at
   `/.well-known/apple-app-site-association`, so both paths need it.

   `/sitemap.xml` is **not** allowlisted. De-listing the site and simultaneously
   publishing a machine-readable index of every route is self-defeating, and the
   sitemap is the one static file that does leak something — the route map.
3. **`?k=<token>` matching `SITE_BYPASS_TOKEN` → set the gate cookie, then
   `302` to the same URL with `k` stripped and every other parameter preserved.**
4. **Valid gate cookie → pass.** An HMAC of an expiry timestamp, signed with
   `SITE_GATE_SECRET`, `HttpOnly` + `Secure` + `SameSite=Lax`, 30-day lifetime.
   A plain "unlocked=true" cookie is forgeable in devtools and is not used.
5. **`Authorization: Basic` matching `SITE_PASSWORD` → pass, and set no cookie.**
6. **Otherwise → `401` with `WWW-Authenticate: Basic realm="DragonCandy private
   preview"`**, `Cache-Control: private, no-store`.

**Only the `?k=` branch mints a cookie, and it is the only branch that can.** A
framework-agnostic middleware signals "continue to the origin" by returning
`undefined`, and there is no documented way to attach a `Set-Cookie` header to
that. This costs nothing, because a browser caches Basic credentials per origin
and realm and resends them automatically on every subsequent request — the cookie
would be redundant. It is needed only on the bypass-link path, where no
credentials are ever supplied, and that path already returns a real `302` response
to hang the header on.

A consequence worth stating: because the browser holds the credentials rather than
a cookie we control, **there is no server-side logout**. Clearing an admitted
visitor requires changing `SITE_PASSWORD`.

Every gate response carries `Cache-Control: private, no-store` so the CDN never
caches a `401` for an authorised visitor or an authorised body for an anonymous
one. Note `vercel.json` sets `public, max-age=86400` on `/landing/reels/(.*)`;
the middleware runs ahead of that cache, but because the gate is production-only
this pairing cannot be exercised on a preview — confirm it on production, in the
same pass as the other production checks below.

Environment variables, all **Production scope only**, none prefixed `VITE_`
(a `VITE_` variable is compiled into the bundle and would be readable by anyone):

| Variable | Purpose |
|---|---|
| `SITE_GATE_ENABLED` | Kill switch. The gate runs only when this is exactly `1` |
| `SITE_PASSWORD` | The shared password |
| `SITE_BYPASS_TOKEN` | The `?k=` value for shared links |
| `SITE_GATE_SECRET` | HMAC key signing the gate cookie and comparing secrets |

**The gate fails closed.** If it is enabled in production but `SITE_PASSWORD` or
`SITE_GATE_SECRET` is missing, every request is challenged and nobody — including
the founder — gets in. That is deliberate. The alternative, passing traffic when a
variable is absent, means a typo'd or deleted variable silently reopens the site
with no signal at all, which is the exact failure mode this codebase has been
bitten by repeatedly (see `PROJECT_CONTEXT.md` §5 on `handle_updated_at`). A
locked-out site is noticed in seconds; a silently unlocked one is not noticed for
weeks. `SITE_GATE_ENABLED` exists so that recovery does not depend on guessing
which variable is wrong.

#### Why a `401` challenge and not a redirect to a gate page

This is the load-bearing choice in the design and it is not cosmetic.

A `401` makes the browser prompt and then **re-request the identical URL** —
query string and fragment intact. A fragment is never sent to a server, and on a
redirect the browser re-attaches the original fragment to a target that has none
(this repo already documents that behaviour in
`supabase/functions/_shared/origins.ts`). So a redirect-based gate would carry
`#access_token=…` onto the gate page and drop it on the way out.

That matters because two live flows depend on it:

- `src/pages/ForgotPassword.tsx:23` sets
  `redirectTo: ${publicOrigin()}/auth/update-password`, and GoTrue appends the
  session as a `#access_token=…` fragment.
- `supabase/functions/send-verification-email/index.ts:112` builds
  `${appUrl}/verify-email?token=…`.

Under a `401` challenge both survive untouched: the recipient sees one password
prompt and lands on the right page with its credentials attached. **No bypass
token is needed for either, and none should be added** — putting `SITE_BYPASS_TOKEN`
into a `VITE_` variable would publish it in the bundle, and putting it into a
Supabase edge-function secret would give it a second home to rotate.

The cost is an unbranded browser password box. That is acceptable for a private
preview. A branded form can replace it later without changing the security model,
but only as a page that submits credentials — never as a redirect.

### Layer 3 — `?k=` bypass links

`SITE_BYPASS_TOKEN` exists for links sent to people who must reach one page
without being handed the site password. The immediate case is the unlisted
investor deck: `/pitch?k=<token>` opens directly, while a bare `/pitch` still
prompts.

The token grants **full site access for the cookie's lifetime**, not access to
one path. It is a convenience for trusted recipients, not a scoping mechanism.
Rotate it by changing the Vercel variable; existing cookies survive until they
expire, which is why the cookie is HMAC'd over an expiry rather than being a
bearer copy of the token.

### Layer 4 — stop advertising the site

`public/robots.txt` currently names Googlebot, Bingbot, Twitterbot and
`facebookexternalhit` and allows each of them everything, and advertises a
sitemap on line 16. It becomes, in full:

```
User-agent: *
Disallow: /
```

The `Sitemap:` line goes with the rest. `public/sitemap.xml` stays in the repo —
it is behind the gate and will be wanted again at launch.

The existing `noindex` prop on `src/components/SEO.tsx:40` is left alone; it is
per-page and orthogonal.

**This breaks CI and must be fixed in the same change.** `lighthouserc.cjs:23`
asserts `categories:seo` at `['error', { minScore: 0.95 }]`, and blocking
crawlers fails Lighthouse's `is-crawlable` audit, taking the category under that
bar. Set `is-crawlable` to `off` in `assertions` with a comment naming this spec
and the condition for restoring it (public launch), rather than lowering the
category threshold — lowering the threshold would also stop catching the real SEO
regressions the gate was put there for.

### Layer 5 — delete the old gate

Remove `src/components/SiteGateGuard.tsx`, `src/lib/siteGate.ts` and
`src/pages/SiteGate.tsx`, and the `<SiteGateGuard>` wrapper in `src/App.tsx:472`.

Two reasons, beyond tidiness. A hardcoded password sitting in the repo next to a
working gate is an invitation to re-enable the wrong one. And because the iOS app
ships this same bundle (`capacitor.config.ts` sets `webDir: 'dist'` with no
`server.url`), any client-side gate would put a password screen in front of the
native app as well.

## What is deliberately not covered

**The native iOS app is not gated.** It serves from `capacitor://localhost` and
never requests HTML from Vercel, so the middleware never sees it. This is the
right outcome — TestFlight distribution is already invite-only — but it means the
website and the app now have different front doors. Anyone holding a TestFlight
build reaches the app without the site password.

**Supabase is not gated.** Edge functions, PostgREST and Auth are on
`supabase.co`. Layer 1 is the whole of the protection there, backed by the
existing RLS.

**Stripe webhooks are unaffected.** They target Supabase edge functions, not
`dragoncandy.com`.

## Consequences to handle

| Surface | Effect | Action |
|---|---|---|
| E2E smoke (`.github/workflows/e2e.yml`) | Runs on **Preview** deploys only, already passing `VERCEL_AUTOMATION_BYPASS_SECRET` | None — the production-only condition keeps it clear |
| `playwright.config.ts:5` | Defaults `PLAYWRIGHT_BASE_URL` to `https://dragoncandy.com` | Any manual prod run now needs `httpCredentials`. Document it; do not wire the password into the config |
| Lighthouse CI | Collects from `http://localhost:8080/landing` via `npm run preview` | Unaffected by middleware. Only the `robots.txt` SEO assertion needs the change above |
| `npm run dev` | Vite, does not execute Vercel middleware | Unaffected. The gate cannot be tested locally without `vercel dev` |
| `capture-lead` / landing lead form | Behind the gate, so effectively dead | Accepted — no public traffic to capture during a private preview |
| `internal.dragoncandy.com` | Gated like every other production host | Accepted; stakeholders have the password, and `/internal` keeps its own admin authorization |
| Apple App Store review | Reviewers use the native app, which is ungated | Org enrollment `5HA89RBHQH` is already approved. A re-check of the website would hit the `401` — the static allowlist only covers `robots.txt`/`favicon.ico`, no Apple verification file exists in `public/` today, and the marketing page isn't allowlisted either |

## Testing

- **Unit** — the middleware's decision function is extracted as a pure
  `decide(request, env)` returning `pass | challenge | bypass` and tested
  directly: non-production passes; each allowlisted static path passes; a correct
  and an incorrect `?k=` diverge; a forged cookie is rejected; an expired cookie
  is rejected; a correct Basic credential passes; an absent header challenges.
  Query parameters other than `k` survive the bypass redirect.
- **Preview deploy** — the gate is production-only, so it cannot be proven on a
  preview. Verify on production immediately after merge: an incognito window gets
  the prompt; the password admits; `/assets/*` `401`s without the cookie;
  `robots.txt` returns 200 without it; `/pitch?k=…` opens directly and `/pitch`
  does not.
- **Both viewports** — the standard `verify-prod` pass, with console errors
  checked, per `CLAUDE.md`.
- **The flows the `401` choice exists to protect** — request a password reset and
  follow the emailed link through the prompt; confirm the session lands and the
  password can be changed. This is the single most important manual check in the
  change, because a redirect-based gate would fail it silently.

## Rollback

Set `SITE_GATE_ENABLED` to `0` in the Vercel dashboard. Vercel applies an
environment-variable change to the running production deployment without a
rebuild, so this is the fastest lever and needs no git operation. **Do not roll
back by deleting `SITE_PASSWORD`** — the gate fails closed, so that locks
everyone out rather than opening the site.

If the middleware itself is broken rather than misconfigured, revert the commit
that adds `middleware.ts` and redeploy; with no middleware present, Vercel serves
the site exactly as it does today.

Re-enabling signup is one Supabase toggle. Nothing in this design writes to the
database, so there is no migration to reverse.

## Out of scope

Per-user invite codes, a self-serve waitlist, an approval holding pen backed by
`profiles.access_status`, and Vercel Pro's built-in Password Protection — the
last considered and rejected because the middleware achieves the same coverage at
no cost.
