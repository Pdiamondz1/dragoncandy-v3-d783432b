# Domain migration: `dragoncandy.io` → `dragoncandy.com`

**Date:** 2026-08-09
**Status:** Phase 1 implemented; Phases 2–6 designed
**Branch:** `feat/domain-dot-com-migration`

## 1. Why

The production domain moves to `dragoncandy.com`. `.io` stays registered and permanently
301s to `.com`, so existing invite links, verification emails, bookmarks and search results
keep working and SEO authority transfers.

**The migration was already partly, and badly, underway when this work started.** Verified
live on 2026-08-09, not inferred:

- `www.dragoncandy.com` was **already attached to Vercel and publicly serving the app**
  (HTTP 200, `Server: Vercel`, real DragonCandy `<title>`).
- **No `.com` origin was in any allow-list.** Proven by preflight:
  `OPTIONS /functions/v1/capture-lead` with `Origin: https://www.dragoncandy.com` returned
  `Access-Control-Allow-Origin: https://dragoncandy.io`. The origins don't match, so the
  browser blocked **every** edge-function call — login, signup, lead capture, Donny, payments.
  The page rendered; nothing behind it worked.
- `https://dragoncandy.com` (apex) **failed TLS** (`curl` exit 60). Its A-record set mixed
  Vercel's `216.198.79.1` with two GoDaddy parking IPs (`15.197.148.33`, `3.33.130.190`).
- GoTrue probe (bogus-token `/auth/v1/verify`, with an unlisted control): **Site URL was
  `https://dragoncandy.io`**; the redirect allow-list held `dragoncandy.io`, `www.`,
  `internal.` and **no `.com` entry**. An unlisted redirect does not error — GoTrue silently
  falls back to Site URL, which is exactly how this stays invisible.

So the first job was not to migrate. It was to stop `.com` being publicly broken.

## 2. Decisions

| Decision | Choice |
|---|---|
| Old domain | Keep `.io` registered, permanent 301 → `.com` |
| Canonical form | **Apex** `dragoncandy.com` (matches `.io` today) |
| Internal host | `internal.dragoncandy.com` moves too |
| Email sending domain | **Deferred** — links inside emails change now, `from:` addresses do not |
| Contact mailboxes | Created separately; `mailto:` flip gated on a receive test |
| Rollout | Fix forward — additive allow-lists first |

## 3. Environment (verified)

| | `.io` | `.com` |
|---|---|---|
| DNS host | Cloudflare | **GoDaddy** |
| Web | Vercel `76.76.21.21` | Vercel `216.198.79.1` + 2 stale parking IPs |
| Mail (MX) | IONOS | **Google Workspace** |
| Resend sending domain | `notify.dragoncandy.io`, DKIM valid | none |

The two domains sit in **different DNS providers**. Keeping `.com` on GoDaddy is deliberate:
its Workspace MX, SPF and site-verification records already work there, and moving the zone
would risk mail for no benefit.

## 4. Governing principle — expand → switch → redirect → contract

Every allow-list accepts **both** domains before any traffic moves; `.io` is removed **last,
or never**. No single change ever has to be correct on both sides simultaneously.

## 5. Phase 1 — EXPAND (this change)

Additive only. `.io` behaviour is byte-identical; `.com` starts working.

### Code

- **New `supabase/functions/_shared/origins.ts`** — the single source of truth for trusted
  origins, exported as narrow groups (`APP_ORIGINS`, `WWW_APP_ORIGINS`,
  `INTERNAL_APP_ORIGINS`, the two Lovable previews, `DEFAULT_ORIGIN`).
- **New `src/lib/allowedOrigins.ts`** — the frontend mirror. The duplication is forced: Deno
  edge functions and the Vite bundle are separate runtimes and cannot import across it.
- Rewritten to compose from those: `_shared/cors.ts`, `verify-email`,
  `create-package-order-escrow`, `src/pages/AuthPage.tsx`.

**Why groups instead of one flat set.** The four consumers do not trust the same hosts:
`cors.ts` includes the internal AIOS host, `verify-email` does not; two include the
`dragoncandy-v3` Lovable preview, two only `dragoncandy-preview`. A single shared set would
have silently widened two of them. Each consumer composes the set it already had, so adding
a TLD is one edit here instead of four edits that are easy to make three of.

**Membership shape was deliberately preserved.** Adding `.com` twins of existing entries is
migration work; changing which *kinds* of host a list trusts is a separate security decision
and is out of scope. `AuthPage`'s list in particular is a **credential boundary** — it gates
where a session `access_token` is written into a redirect URL.

### Verification links follow the signup origin

`send-verification-email` built its link as `APP_URL || inferredOrigin || '…io'`. Because
`APP_URL` is set in prod it always won, so a `.com` signup would receive a `.io` link and
verify onto a host the user never chose — and sessions are origin-scoped, so they end up
signed in on the wrong one. Caught by the Codex second review.

Now the request origin wins **if it is allow-listed**, falling back to `APP_URL` then
`DEFAULT_ORIGIN`. This also closes a latent hole: `inferredOrigin` was built from raw
`Origin`/`Referer` headers with **no gate**, and is interpolated into a *token-bearing* link.
It was harmless only because `APP_URL` happened to be set and took precedence — one unset env
var away from letting a caller aim a legitimate-looking DragonCandy verification email at a
domain they control. The allow-list mirrors `verify-email`'s, so a link we mint is always one
that function will honour.

`send-welcome-email` has the same `APP_URL` shape (and a wrong `https://lovable.app`
fallback) but is deliberately left to Phase 2: its CTAs are navigational, whereas the
verification link gates account activation.

### Other allow-lists and guards

- `_shared/google-workspace.ts` — `REDIRECT_HOSTS` gains the `.com` hosts **and `www` on both
  TLDs**. Must land with the matching Google Cloud console URIs or the flow 403s `bad_host`.
  Six URIs are now required: apex, `www` and `internal` × both TLDs, each
  `https://<host>/internal/workspace/callback`.

  **`www` is not decoration.** Measured 2026-08-09: `https://www.dragoncandy.io` returns
  **HTTP 200, not a redirect** — the `www` → apex redirect the Vercel cutover runbook
  describes is **not actually live**, on either domain (`.com` currently redirects the *other*
  way, apex → `www`). The caller sends `window.location.hostname`, so `/internal/workspace` on
  `www` fails `bad_host` before Google consent. That is a **pre-existing live bug on `.io`**,
  caught by the Codex second review of this branch; listing `www` fixes it instead of
  depending on a redirect that does not exist.
- `index.html` — CSP `img-src` gains `https://dragoncandy.com`.
- **`supabase/scripts/staging-login.mjs`** — the production-safety guard matched only
  `/(^|\.)dragoncandy\.io$/`. Once `.com` is production that guard **silently stops
  protecting**, letting a staging-session script target prod. Now matches both TLDs.
- Tests: `internalHost.test.ts` gains `.com` coverage; new `allowedOrigins.test.ts` pins the
  credential boundary (both TLDs in, internal host out, lookalikes/scheme slips rejected).

### Infrastructure (dashboards, not code)

1. **GoDaddy DNS** — delete the two parking A records so the apex gets a valid Vercel cert.
2. **Vercel** — attach all three `.com` domains; apex primary, `www` → apex; Deployment
   Protection stays "Standard Protection". Note that `www` → apex is **not currently live on
   either domain** (`.io` serves `www` with a 200; `.com` redirects apex → `www`), so this is
   a change to make, not a state to assume. The code no longer depends on it either way.
3. **Supabase Auth** — *add* `https://dragoncandy.com/**`, `https://www.dragoncandy.com/**`,
   `https://internal.dragoncandy.com/**`. Keep every `.io` entry; leave Site URL on `.io`.
4. **Google Cloud OAuth** — add the two `.com` callback URIs, keep the `.io` pair.
5. **Google Maps API key** — add `.com` to the HTTP-referrer restrictions, or maps and
   geocoding degrade **silently**.

### Deploy

**All 83 edge functions importing `_shared/cors.ts` must be redeployed** — a shared-module
change only takes effect per redeployed function, and a failed bundle silently keeps the old
version. Deploy in batches, verify each.

### Gate (all must pass before Phase 2)

- Preflight from each `.com` origin echoes **that origin** back, not `.io`.
- GoTrue probe: each `.com` URL echoes back instead of falling back to Site URL. **Always
  include an unlisted control** or the probe has no discriminating power.
- `curl https://dragoncandy.com` succeeds without `-k`.
- Login works on `.com`, desktop + mobile, console clean. `.io` unchanged.

## 6. Phase 2 — SWITCH canonical

Config first (no deploy): Supabase secrets `APP_URL` / `PUBLIC_SITE_URL` /
`DRAGONCANDY_APP_URL` → `.com`; Auth **Site URL** → `.com`; `GOOGLE_ALLOWED_DOMAIN`.

Each has a hardcoded `|| 'https://dragoncandy.io'` fallback, so a *forgotten* secret looks
like working behaviour while quietly keeping the old domain alive. Verify by observed output,
never by "I set it."

Then the literals with no env indirection: `SEO.tsx` `SITE_URL` (drives every canonical and
og:url), `index.html` meta + JSON-LD, `sitemap.xml`, `robots.txt`, JSON-LD in the three public
profile/help pages, the hardcoded redirects (`donny-oauth-authorize`, `invite-member`,
`send-campaign-invitation`, both Connect-account origin fallbacks, `test-mode-connect`), email
body links/images, internal-surface copy, `playwright.config.ts`, and `DEFAULT_ORIGIN` in
`_shared/origins.ts` + `src/lib/allowedOrigins.ts`.

**Two latent bugs to fix here** (both wrong today, independent of this migration):
`send-welcome-email` falls back to `https://lovable.app`, and `create-sponsorship-checkout`
falls back to the Lovable preview host.

**Sessions are origin-scoped.** Anyone logged in on `.io` will not be logged in on `.com` and
must sign in again. Unavoidable — worth telling users rather than surprising them.

## 7. Phase 3 — 301

Vercel: all three `.io` domains redirect, path-preserving, to `.com`. **Keep `.io` in every
allow-list.** Verify old deep links (`/help/<slug>`, `/creator/<slug>`, a campaign invite, an
email-verification link). Google Search Console: add `.com`, submit sitemap, Change of Address.

## 8. Phase 4 — content and knowledge

A **new migration** to `UPDATE` the 4 `help_articles` rows carrying the domain — editing the
old seed migrations changes nothing in prod. Then `donny-knowledge-seed.ts`, the AIOS SEO
playbook prompt, `docs/**`, and a re-run of `sync:internal` + `sync:wiki` so the 27
`donny_knowledge` and 19 `internal_docs` rows regenerate.

## 9. Phase 5 — mail (deferred)

Only once the new mailboxes exist and a **real test email to each has been received**: flip
the 6 `mailto:` sites and `stripe-webhook`'s `admin@` recipient. Separately, add
`notify.dragoncandy.com` in Resend, publish DKIM at GoDaddy, verify, and only then flip the 8
`from:` addresses. Keep `notify.dragoncandy.io` verified until `.com` sends are proven — an
unverified sending domain fails *all* transactional email at once.

## 10. Phase 6 — CONTRACT (optional)

Pruning `.io` from the allow-lists costs nothing to skip. Recommendation: don't.

## 11. Must NOT change

| Item | Why |
|---|---|
| `io.dragoncandy.app` (Capacitor `appId`, iOS bundle id) | A reverse-DNS **identifier**, not a URL. Changing it means a new App Store listing and users lose the install. |
| `@synthetic.dragoncandy.test` (~90 sites) | Reserved-TLD marker; source of truth for the synthetic-user safety spine (triggers, purge RPCs, email suppression). |
| `dragoncandy_campaign_draft`, `dragoncandy2026`, Stripe `platform: "dragoncandy"`, repo slug, `@dragoncandy` handle | Identifiers that merely contain the brand string. |

## 12. Open items

- **`TOAST_OAUTH_REDIRECT_URI`** — value is env-only; the doc-comment says it is the edge
  function callback (`*.supabase.co`, unaffected). **Read the live secret before assuming.**
- **Outstand social-connect redirect** — built at runtime from `window.location.origin`;
  whether Outstand allow-lists redirect hosts server-side is undocumented.
- **Lovable custom domain** — the Vercel cutover's Phase 3 detach may never have run.
- Whether the Workspace org on `.com` is the DragonCandy org (bears on `GOOGLE_ALLOWED_DOMAIN`
  and the long-blocked Chat bot).
- **Known inconsistency, deliberately not fixed here:** `verify-email` omits the internal AIOS
  host while `cors.ts` includes it. Pre-existing; changing it is a security decision, not
  migration work.

## 13. What this deletes / simplifies / automates

- **Deletes:** four copy-pasted origin lists collapse to two modules (one per runtime).
- **Simplifies:** adding or retiring a domain is now a one-line edit per runtime.
- **Automates:** nothing new — deliberately. The riskiest steps (DNS, Site URL, Resend
  verification) stay manual and gated, because an automated flip of a broken process just
  breaks faster.
