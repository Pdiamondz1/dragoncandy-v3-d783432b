---
title: Domain Migration (.io → .com)
type: concept
created: 2026-08-09
updated: 2026-08-09
sources: [2026-08-09-dotcom-phase1-and-esm-sh-bundler-outage.md]
tags: [domain, dns, cors, auth, vercel, migration]
---
# Domain Migration (.io → .com)

Moving production from `dragoncandy.io` to `dragoncandy.com`. `.io` stays registered and
eventually 301s to `.com`, so existing invite links, verification emails, bookmarks and search
results keep working and SEO authority transfers.

## Governing principle: expand → switch → redirect → contract

Every allow-list accepts **both** domains before any traffic moves, and `.io` is removed
**last, or never**. At no point does a single change have to be correct on both sides at once.

Phase 1 (EXPAND) is purely additive and fully reversible. It makes `.com` *work*; it does not
make it canonical.

## Phase 1 was not a migration — it was stopping a live breakage

Verified on prod 2026-08-09, before any code was written: **`www.dragoncandy.com` was already
attached to Vercel and publicly serving the app**, while no `.com` origin appeared in any
allow-list. The page rendered and then nothing worked.

| Symptom | Cause |
|---|---|
| Every edge-function call blocked in-browser | `OPTIONS` with `Origin: https://www.dragoncandy.com` returned `Access-Control-Allow-Origin: https://dragoncandy.io` — 82 functions: login, signup, payments, Donny |
| Apex failed TLS | A records mixed Vercel's `216.198.79.1` with two leftover **GoDaddy parking IPs** holding no certificate |
| Auth redirects silently wrong | GoTrue Site URL was `.io` and the allow-list held **no `.com` entry**; an unlisted redirect doesn't error, it falls back to Site URL |

## One source of truth per runtime, exported as narrow groups

The same origin list had been copy-pasted in four places — which is exactly how one gets
missed. Phase 1 collapsed it into `supabase/functions/_shared/origins.ts` (Deno) and
`src/lib/allowedOrigins.ts` (Vite). **The duplication between those two is forced**: separate
runtimes cannot import across the boundary.

**They export narrow named groups (`APP_ORIGINS` / `WWW_APP_ORIGINS` / `INTERNAL_APP_ORIGINS`
/ the Lovable hosts), NOT one flat set** — because the four consumers do not trust the same
hosts. `cors.ts` includes the internal AIOS host; `verify-email` does not. Flattening them
while "just refactoring" would have silently widened three allow-lists.

`src/lib/allowedOrigins.ts` gates where a session `access_token` is written into a redirect
URL, so it is a **credential boundary**, not a convenience list — and it excludes the internal
host deliberately.

## The guard that would have silently stopped protecting

`supabase/scripts/staging-login.mjs` refuses to mint a passwordless session against
production. Its check was `/(^|\.)dragoncandy\.io$/`. **The moment `.com` became production,
that guard would have stopped matching and stopped protecting** — while still looking correct
in review. It is a deny-list, so widening it to both TLDs *tightens* it.

Generalizable: when a safety check hard-codes the thing being migrated, migrating breaks the
check, not the feature — and nothing fails loudly.

## Verification: a probe without a control proves nothing

Both probes used throughout carry an **unlisted control**, because both fail *open* into
something that looks like success:

- **CORS** — `OPTIONS <fn> -H "Origin: <o>"`; the returned `Access-Control-Allow-Origin` must
  equal the origin sent. An unlisted origin gets the default `.io` back, which is a 200 with a
  plausible header. Without the control, "it returned a header" reads as a pass.
- **GoTrue** — bogus-token `/auth/v1/verify?...&redirect_to=<url>`, then read `Location`. An
  allow-listed URL echoes back; an unlisted one **silently falls back to Site URL** rather than
  erroring.

Phase 1 gate, all green 2026-08-09: all 82 functions echo their own origin; all three `.com`
URLs allow-listed in GoTrue with the control falling back; `curl https://dragoncandy.com`
succeeds **without `-k`**; both viewports clean; `.io` unchanged.

The strongest single piece of evidence was a **real browser `fetch` from
`https://www.dragoncandy.com`** to `capture-lead` returning 200 — a genuine CORS preflight,
which curl cannot exercise.

## Environment facts (verified, not assumed)

| | `.io` | `.com` |
|---|---|---|
| DNS host | Cloudflare | **GoDaddy** |
| Web | Vercel `76.76.21.21` | Vercel `216.198.79.1` |
| Mail (MX) | IONOS | **Google Workspace** |
| Resend sending domain | `notify.dragoncandy.io`, DKIM valid | none |

The two domains sit in **different DNS providers**, and keeping `.com` on GoDaddy is
deliberate: its Workspace MX, SPF and site-verification records already work there, and moving
the zone would risk mail for no benefit.

Dashboard gotchas that cost time:
- The domain is in **Joe Castelo's** GoDaddy account, reached by delegate access — not the
  Harbormill account.
- **A Vercel SPA fallback returns HTTP 200 with `Content-Type: text/html` for a missing
  asset.** A 200 is not proof a JS chunk exists; that false positive led to the wrong Maps key.
- Google OAuth redirect URIs must be added to the **same client** as `GOOGLE_OAUTH_CLIENT_ID`
  — which lives on the personal Google Cloud project, not the DragonCandy Workspace org.

## Remaining phases

- **Phase 2 — SWITCH.** `APP_URL` / `PUBLIC_SITE_URL` / `DRAGONCANDY_APP_URL` secrets, GoTrue
  Site URL, and the Vercel apex↔www primary (currently apex **308 → www**; the plan is apex
  canonical). Each secret has a hard-coded `|| 'https://dragoncandy.io'` fallback, so a
  *forgotten* one looks like working behaviour — verify by observed output, never by "I set it".
  Plus the hard-coded literals with no env indirection: SEO/metadata, sitemap, robots.txt,
  JSON-LD, redirect builders, email bodies.
- **Phase 3 — REDIRECT.** Path-preserving 301 on all three `.io` domains. **Keep `.io` in every
  allow-list** — in-flight email links and cached SPA sessions still need it.
- **Phase 4 — content/knowledge**, **Phase 5 — mail** (deferred; a dead support address is
  worse than an old one), **Phase 6 — CONTRACT** (optional; recommendation: don't).

**Sessions are origin-scoped `localStorage`.** Anyone logged in on `.io` will not be logged in
on `.com` and must sign in again. Unavoidable, not a bug — worth telling the ~42 real users
rather than surprising them.

## Must NOT change

`io.dragoncandy.app` (Capacitor appId / iOS bundle id) — a reverse-DNS **identifier**, not a
URL; changing it means a new App Store listing and users lose the install. And
`@synthetic.dragoncandy.test`, the reserved-TLD marker the entire synthetic-user safety spine
keys on.

## Known Issues

- **The `www`→apex redirect the Vercel cutover runbook describes is not actually live on
  either domain** — `https://www.dragoncandy.io` returns 200, not a redirect. Found while
  verifying a Codex finding; it is a pre-existing `.io` bug, not a `.com` one.
- **Auth-gated surfaces are unverified on `.com`** on both viewports — no session was available.
- **`LEADS_NOTIFY_EMAIL` is still unset**, so `capture-lead` saves a lead and notifies nobody.
- Phase 1 was interrupted by an unrelated prod outage — see
  [[Edge-Function Deploy & Bundling]].

## See Also

- [[Edge-Function Deploy & Bundling]] — why 82 functions needed individual redeploys
- [[Landing Redesign & Public Lead Capture]] — `capture-lead`, the canary for this migration
- [[verify_jwt Is Not Authorization]] — the same merged-vs-deployed gap
