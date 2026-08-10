---
title: Domain Migration (.io → .com)
type: concept
created: 2026-08-09
updated: 2026-08-10
sources: [2026-08-09-dotcom-phase1-and-esm-sh-bundler-outage.md, 2026-08-09-ios-testflight-first-build.md, 2026-08-10-dotcom-phase2-canonical-switch.md]
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

## Phase 2 — SWITCH (code shipped 2026-08-10; config founder-owned)

**Apex is canonical.** The Vercel primary was flipped, so `www` → apex is now a **308,
path- and query-preserving** (verified) — previously apex 308'd to www, the reverse of the plan.

**Code (shipped).** `src/components/SEO.tsx`'s `SITE_URL` is the single constant every canonical
link and `og:url` derives from — the highest-leverage line in the change. Plus `index.html`
metadata, sitemap, `robots.txt`, three JSON-LD blocks, redirect/origin fallbacks in eleven edge
functions, email **bodies** (links and images only, never a `from:`), internal surface copy, and
`DEFAULT_ORIGIN`. Two pre-existing bugs fixed en route: `send-welcome-email` fell back to
`https://lovable.app` (3 sites) and `create-sponsorship-checkout` to the Lovable *preview* host.

**Config (still founder-owned).** `APP_URL` / `PUBLIC_SITE_URL` / `DRAGONCANDY_APP_URL` →
`https://dragoncandy.com`, and GoTrue **Site URL** → apex. Each secret has a hard-coded
`|| 'https://dragoncandy.io'` fallback, so a *forgotten* one looks like working behaviour —
verify by observed output, never by "I set it".

### The intent was recorded three times and the change still didn't happen

Codex caught [P2] that `DEFAULT_ORIGIN` was still `.io`. Three places had already said Phase 2
would move it: the constant's own doc comment, the iOS TestFlight spec, and this migration's
design doc §2b. **And [[iOS TestFlight First Build]] had gone further** — it named the omission
as an open risk, in writing, before Phase 2 was drafted.

**A previous session spotted the gap, wrote it in the wiki, and the next session shipped without
it.** Writing something down is not the same as it being consulted; the knowledge layer only pays
off if something *reads* it at the moment of the decision. That is an argument for the review
gates, not against the wiki — Codex, which had never read any of it, found it from the diff alone.

`DEFAULT_ORIGIN` is cosmetic **as a CORS fallback** (an unlisted origin is blocked by exact-match
ACAO whatever the header says) but it also mints user-facing URLs in `verify-email`,
`send-verification-email` and `create-package-order-escrow` when their env var is unset. All
three prefer a trusted `Origin` or the env var first, so ordinary browser traffic already
resolved to `.com`; the fallback fires only for a request with no trusted `Origin`.

That page's companion claim — that the flip "would force a sweep" of the ~77 un-redeployed
functions — is an **overstatement, now corrected**: `_shared/*` bundles per function at deploy
time, so a non-redeployed function simply keeps emitting `.io` cosmetically. Mixed fleet state
costs nothing. The flip supplies a *reason* to sweep, not a requirement.

### Reading a secret's value without exposing it

`supabase secrets list` returns each secret's name, **SHA-256 digest** and `updated_at`. The
digest is a plain SHA-256 of the value, so a candidate can be tested for exact equality —
`printf '%s' "https://dragoncandy.io" | sha256sum` matched `APP_URL`'s digest, establishing its
value without ever seeing it. Works for any low-cardinality secret (a URL, a domain, a flag);
useless against a real key, which is precisely why it is safe.

## Remaining phases

- **Phase 3 — REDIRECT.** Path-preserving 301 on all three `.io` domains. **Keep `.io` in every
  allow-list** — in-flight email links and cached SPA sessions still need it.
- **Phase 4 — content/knowledge**, **Phase 5 — mail** (deferred; a dead support address is
  worse than an old one), **Phase 6 — CONTRACT** (optional; recommendation: don't).

**Sessions are origin-scoped `localStorage`.** Anyone logged in on `.io` will not be logged in
on `.com` and must sign in again. Unavoidable, not a bug — worth telling the ~42 real users
rather than surprising them.

## Must NOT change

~~`io.dragoncandy.app`~~ → **`com.dragoncandy.app`** (Capacitor appId / iOS bundle id).
**Superseded 2026-08-09** — see `2026-08-09-ios-testflight-first-build-design.md`. A
reverse-DNS **identifier**, not a URL, and genuinely immutable — but only from the moment an
App Store Connect record exists. None did, so it was changed to match the now-primary domain
while that was still free. The original reason ("a new listing and users lose the install")
presumed a listing and users; there were neither. From record creation onward this row applies
again, permanently. And `@synthetic.dragoncandy.test`, the reserved-TLD marker the entire
synthetic-user safety spine keys on.

## Known Issues

> **Three entries here were resolved on 2026-08-10 and are kept, struck through, with the date.**
> All three were written in the present tense about production, which is the failure mode this
> whole page keeps documenting: a claim about prod has an expiry, and nothing here detects its
> own staleness. Resolutions are recorded rather than deleted so the pattern stays visible.

- ~~The `www`→apex redirect is not live on either domain~~ — **resolved 2026-08-10 on `.com`.**
  Apex is now canonical and `www` → apex is a 308, path- and query-preserving (verified). The
  `.io` side is unchanged and still returns 200 on `www`; it is a pre-existing `.io` bug and
  Phase 3 supersedes it.
- ~~Auth-gated surfaces are unverified on `.com`~~ — **resolved 2026-08-10.** Desktop verified
  in the founder's signed-in Chrome with direct CORS measurement; mobile confirmed by the
  founder. This closes the last open item on the Phase 1 gate.
- ~~`LEADS_NOTIFY_EMAIL` is still unset~~ — **it was set on 2026-08-07**, i.e. this entry was
  already false when written. It survived because a doc asserted edge secrets were not listable,
  so nobody ran the check. They are listable. **A claim that something is unverifiable is itself
  a claim** — verify it before repeating it. Lead capture never depended on it anyway: the row
  is inserted first and the email is best-effort.
- Phase 1 was interrupted by an unrelated prod outage — see
  [[Edge-Function Deploy & Bundling]].
- **Open:** the ~77 edge functions outside the Phase 1 fan-out still carry the pre-`.com`
  `DEFAULT_ORIGIN` until redeployed. Harmless (see Phase 2 above) and nothing forces it.

## See Also

- [[Edge-Function Deploy & Bundling]] — why 82 functions needed individual redeploys
- [[Landing Redesign & Public Lead Capture]] — `capture-lead`, the canary for this migration
- [[verify_jwt Is Not Authorization]] — the same merged-vs-deployed gap
