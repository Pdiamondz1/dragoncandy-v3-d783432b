# 2026-08-09 — `.com` migration Phase 1, the esm.sh bundler outage, and an 82-function redeploy

Raw session source. Immutable — do not edit after ingest.

Covers three efforts on one thread: PR #414 (domain Phase 1, merged), PR #415 (the
bundler fix, merged), and the fleet redeploy + verification that made Phase 1 real.
The middle one was not planned — it was an outage I caused and then had to diagnose.

---

## 1. The `.com` migration was already underway, and already broken

Verified live before any code was written:

- `www.dragoncandy.com` was **already attached to Vercel and publicly serving the app**
  (HTTP 200, real title).
- **No `.com` origin was in any allow-list.** Proven by preflight: `OPTIONS
  /functions/v1/capture-lead` with `Origin: https://www.dragoncandy.com` returned
  `Access-Control-Allow-Origin: https://dragoncandy.io`. Origins don't match ⇒ the browser
  blocks the call. That is **82 edge functions** — login, signup, payments, Donny.
- `https://dragoncandy.com` (apex) **failed TLS**: its A records mixed Vercel's
  `216.198.79.1` with two leftover GoDaddy parking IPs holding no certificate.
- GoTrue probe (bogus-token `/auth/v1/verify`, **with an unlisted control**): Site URL was
  `https://dragoncandy.io`, and the redirect allow-list held **no `.com` entry at all**.

So the page rendered and nothing worked. The first job was not migrating — it was stopping
`.com` being publicly broken.

**Governing principle: expand → switch → redirect → contract.** Every allow-list accepts
BOTH domains before any traffic moves; `.io` is removed last, or never. Phase 1 is purely
additive and fully reversible.

### What Phase 1 shipped (PR #414)

One source of truth per runtime instead of four copy-pasted lists:
`supabase/functions/_shared/origins.ts` (new) and `src/lib/allowedOrigins.ts` (new, a forced
mirror — Deno and Vite can't share a module).

**Exported as narrow named groups, not one flat set** — `APP_ORIGINS` / `WWW_APP_ORIGINS` /
`INTERNAL_APP_ORIGINS` / the Lovable hosts. The four consumers do NOT trust the same hosts:
`cors.ts` includes the internal AIOS host, `verify-email` does not. Flattening would have
silently widened three allow-lists while "just refactoring".

`src/lib/allowedOrigins.ts` gates where a session `access_token` is written into a redirect
URL, so it is a **credential boundary**, and it excludes the internal host by design.

Also: `google-workspace.ts` `REDIRECT_HOSTS` → 6 hosts; `index.html` CSP `img-src`; and
`supabase/scripts/staging-login.mjs`, whose prod-safety guard was `/(^|\.)dragoncandy\.io$/`
— the moment `.com` became production that guard would have **silently stopped protecting**.
It's a deny-list, so widening it *tightens* it. Highest-value one-line change in the phase.

Two Codex findings, both verified against live prod before acting, both worse than reported:
1. `REDIRECT_HOSTS` omitted `www` — and `https://www.dragoncandy.io` returns **200, not a
   redirect**, so the `www`→apex redirect the cutover runbook describes **is not live on
   either domain**. Already a live `.io` bug.
2. `send-verification-email` built its link origin from raw `Origin`/`Referer` with **no
   allow-list gate**, interpolated into a **token-bearing** link. Harmless only because
   `APP_URL` happened to be set and took precedence.

### Infrastructure (dashboards, done in the founder's Chrome)

GoDaddy parking A-records deleted (fixes apex TLS); Vercel `.com` domains attached; Supabase
Auth redirect allow-list gained all three `.com` patterns; Google Cloud OAuth redirect URIs
added; Maps key referrers.

Gotchas worth keeping:
- The domain lives in **Joe Castelo's** GoDaddy account, reached by delegate access — not the
  Harbormill account, which holds only `harbormill.net`/`hmfgh.net`.
- A Vercel SPA fallback returns **HTTP 200 with `Content-Type: text/html`** for a missing
  asset. A 200 is NOT proof a JS chunk exists — that false positive sent me to the wrong
  Maps key before I followed the real chunk chain.
- OAuth redirect URIs must live on the **same client** as `GOOGLE_OAUTH_CLIENT_ID`, which is
  on the personal Google Cloud project, not the DragonCandy Workspace org. Adding them to a
  different project would have done nothing.
- A JS `.click()` on Google Cloud's Save silently did not submit; a real coordinate click did.
  Verified by reloading and re-reading the URI list, not by trusting the click.

---

## 2. The outage: Supabase's server-side bundler cannot build supabase-js from esm.sh

`capture-lead` was redeployed as a **deliberate canary** ahead of the fleet redeploy. It
broke: HTTP 500 `{"code":"WORKER_ERROR"}` on **every** request, including `OPTIONS` — which
returns immediately, so the crash is at **boot**, before the handler runs.

Four redeploys with progressively simpler content all failed identically (v9 CLI, v10–v12
MCP), including one stripped to a single self-contained file with no `_shared` imports and no
Resend. **Every hypothesis I formed from the code was wrong** — entrypoint path mismatch, the
new `origins.ts` cross-file import, the `npm:resend` specifier. Each was disproven by the next
experiment. I twice told the founder I'd found the cause; both times I was wrong.

Also ruled out: remote module availability (both URLs returned 200), `verify_jwt` (false
throughout), missing `deno.json` (none exists), a Supabase incident (none), and source drift
(`git log` showed the file unchanged since `ba73cf0f`).

**What actually found it: comparing a broken function against a WORKING one.** `get_edge_function`
on `verify-recaptcha` (v161, serving fine) showed it imports only `deno.land/std@0.168.0` — no
esm.sh. Every failing build carried `esm.sh/@supabase/supabase-js`. That was the only
difference.

### The controlled experiment

One throwaway function (`zz-boot-probe`), seven versions, each differing **only** in imports.
A no-import **baseline first**, or the probe proves nothing:

| Version | Import | Result |
|---|---|---|
| v1 | *(none)* | boots — probe is valid |
| v2 | `deno.land/std@0.190.0/http/server.ts` | boots — **innocent** |
| v3 | `esm.sh/@supabase/supabase-js@2.50.0` | **WORKER_ERROR** |
| v4 | `npm:@supabase/supabase-js@2` | boots, client constructs |
| v5 | `npm:@supabase/supabase-js@2.50.0` | boots, `auth` + `functions` present |
| v6 | `npm:@supabase/supabase-js@2.57.2` | boots, `auth` + `storage` + `rpc` present |
| v7 | `esm.sh/stripe@18.5.0` + `esm.sh/jose@5.9.6` | boots |

**v7 is why the fix is narrow.** esm.sh is NOT broken generally — only for `supabase-js`. So
the 33 Stripe imports and 1 jose import were deliberately left alone. Swapping them would have
been unnecessary churn on the money rail, justified by an assumption rather than a measurement.

Diagnostic facts worth keeping:
- The logs API returns **only request lines, never the boot stack trace**. Four redeploys
  proved nothing; the working-vs-broken comparison took one call.
- The bundler **does** report syntax errors with file + line (it caught a fullwidth-bracket
  typo of mine mid-investigation), so a clean bundle that 500s at runtime means **module
  resolution/eval, not syntax**.
- Docker was not installed, so both the CLI and MCP used the **server-side** bundler. With
  Docker, `supabase functions deploy` bundles locally — the path that built every function
  that was still serving.

### The fix (PR #415)

Literal prefix replace, `https://esm.sh/@supabase/supabase-js@` → `npm:@supabase/supabase-js@`,
across **121 files**. Version-preserving: 79× `@2`, 36× `@2.57.2`, 6× `@2.50.0`. **Not a
library upgrade.** A naive `@2` replace would have corrupted the `@2.5x` pins — hence
prefix-only. Verified by numstat: every one of 121 files shows exactly `1 insertion / 1
deletion`, which also rules out encoding/line-ending damage.

`data-exposure-reviewer` fingerprinted 2483 query/client/key-selection occurrences across 140
files and found them **identical on both sides**, confirming the swap is inert.

---

## 3. The `verify_jwt` audit that generalizes a near-miss

The CLI reads `verify_jwt` from `config.toml` and **defaults undeclared functions to `true`**.
Any function running `false` on prod but undeclared would be silently broken by its own
redeploy. Before the fleet deploy, all 99 live functions were compared against the declarations.

Exactly one hit: `verify-recaptcha` — which has **no source**, so it cannot be deployed. Zero
mismatches otherwise. `donny-knowledge-sync` was declared in #415 for exactly this reason (the
post-merge RAG sync calls it with a bearer key, not a user JWT).

**A reviewer caught me overreaching here.** My first draft also declared `verify-recaptcha`,
with a commit message claiming a deploy would otherwise flip it. That claim is **false** — a
function with no source is never in the deploy set. `data-exposure-reviewer` flagged it; I
verified (source absent from worktree AND main checkout, deleting commit identified, zero
`src/` callers, only orphan block among all declared functions) and rebuilt both commits so
the false claim never shipped.

---

## 4. The redeploy: 82 functions, 8 canary-verified batches

Order: `capture-lead` canary → AIOS/wiki → content/social hooks → notifications/email → Donny
→ marketplace/integrations → **money last, split three ways** (status/setup → checkout/escrow
→ funds-moving). Zero boot failures.

Verification per batch used the public anon key as a bearer, because an unauthenticated
`OPTIONS` against a `verify_jwt=true` function is rejected by the **gateway at 401 before the
worker boots** — so it cannot distinguish "healthy" from "never booted". A 500 with
`WORKER_ERROR` is the signal being hunted.

**~17 functions were deliberately NOT redeployed** — `stripe-webhook`, the Outstand/Zernio
webhooks, `toast-*`, the cron workers, `outstand-proxy`, `social-proxy`. They carry the `npm:`
swap in the repo but do not import `cors.ts`, so they have no browser origin and are
irrelevant to `.com`. Their deployed builds still use esm.sh and work; the repo change means a
future redeploy is safe. Redeploying them would have been risk without benefit.

---

## 5. Phase 1 acceptance gate — all green

- **CORS:** all 82 echo their own origin. Spot-checked 5 representatives × 3 `.com` origins:
  all correct, and the **unlisted control fell back to `.io` every time** (no leak).
- **GoTrue:** all three `.com` URLs allow-listed, `.io` still listed, control fell back to
  Site URL — the probe discriminates.
- **Apex TLS:** `https://dragoncandy.com` succeeds **without `-k`** (308 → `www`, Vercel's
  current apex→www rule, which Phase 2 flips).
- **Both viewports:** desktop 1280px and **real** mobile 390px (`dpr` 3, `lg:` inactive,
  hamburger nav), zero console errors on both, and a **real browser `fetch`** from
  `https://www.dragoncandy.com` to `capture-lead` returned **200** — a genuine CORS preflight,
  which curl cannot prove.
- `.io` unchanged throughout.

### The mobile-viewport method (this is the reusable part)

In the founder's Chrome, `resize_window` reported "Successfully resized" while `innerWidth`
stayed pinned at **1280**, `innerHeight` at **551**, `outerWidth` at **0**, and
`matchMedia('(min-width:1024px)')` stayed **true**. A screenshot there is a DESKTOP render in
a narrow frame — a false "mobile passes". A same-origin **iframe fallback also failed** (broken
-page icon + cross-origin SecurityError) despite the site serving **no** `X-Frame-Options` and
**no** CSP header, so that dead end is not fixable by a header change.

What worked, first try: **browser-use's own Chrome + CDP
`Emulation.setDeviceMetricsOverride`, applied AFTER page load** (the override does not survive
a navigation), then reading `innerWidth`/`matchMedia` back to prove it took.

I nearly reported mobile as "blocked". Project memory stopped me — it recorded that this exact
verdict had been filed once before and was **too broad**, which is the only reason the working
method got tried.

**Still genuinely blocked:** mobile verification of an **authenticated** surface. browser-use
runs a fresh profile with no session, the founder's Chrome has no session either, and I may
not type a password.

---

## 6. `verify-recaptcha` deleted from prod

Live at v161 with **no source in the repo**, zero `src/` callers, no cron reference, and
`ReCaptcha.tsx` long gone. Deleting it completes
`docs/superpowers/plans/2026-04-30-remove-captcha-from-auth.md`, whose Task 3 deleted the
source and config block but never the deployment. Endpoint now 404s; `/auth` unaffected.

It performed **no caller authorization at all** — accepted any token and proxied to Google
using `RECAPTCHA_SECRET_KEY`. It touched no database, so the exposure was a spendable secret,
not data.

One near-miss: `.lovable/plan.md` describes *restoring* the reCAPTCHA widget and is still in
the repo looking current. Its last commit is **2026-04-28**, two days before the removal
decision — a superseded draft. Its August mtime is a checkout touch, not an edit.

Deployed source archived before deleting, because git only has the repo copy and prod could
have drifted from it.

---

## 7. The regression I caused, and how the knowledge-sync scope check caught it

While this session ran, a **parallel session** merged #416 (repair Donny's `social_*` tools)
at 22:38 UTC and #417 at 22:50 UTC. #416 changed `donny-orchestrator/index.ts`,
`content-strategy-recommend/brief.ts`, `donny-auto-pilot/index.ts` and **nine new `_shared/*`
modules**, and deployed them.

My Donny batch deployed `donny-orchestrator` at **22:54 UTC from `caa7ca97`** — which predates
#416. **My v77 overwrote their v76 with older code, reverting the `social_*` fix.**
`content-strategy-recommend` v17 at 22:53 UTC was the same. Neither was detectable from
anything I could see: both deployed cleanly and passed the boot probe, because stale code
boots perfectly well.

**It was caught by the knowledge-sync `[scope-ordering]` lesson** — the one-command check
(`git log --oneline HEAD..origin/main -- <core docs>`) run BEFORE the first doc edit. It exists
to prevent doc conflicts; here it surfaced a live prod regression.

Repaired: both redeployed from current `origin/main` (v78 / v18), verified by **reading the
deployed source** for #416's symbols (`_shared/social-signal.ts`, `assessSignal`) alongside the
`npm:` specifier — not by the version bump.

**Left for the other session, not silently fixed:** `donny-auto-pilot` is at v47 from 16:08
UTC, which **predates #416**, so its half of that fix was never deployed at all. That gap is
theirs and pre-existing; flagged rather than deployed, since it is their unreviewed-by-me work.

**The durable lesson: a fleet deploy pins itself to one commit, and `origin/main` moves under
it.** Re-check `origin/main` immediately before a multi-function deploy, and again after — a
concurrent merge plus a deploy from a stale tree is a silent revert that every health check
passes.

---

## Not verified / open

- **Auth-gated surfaces on either viewport** — no session available to me.
- **`donny-auto-pilot`** still running pre-#416 code (other session's gap).
- **`LEADS_NOTIFY_EMAIL`** still unset, so `capture-lead` saves leads and notifies nobody.
  Unchanged by this session; `leads` held 0 rows throughout.
- **Phase 2 onward** — Site URL, `APP_URL`, the Vercel apex↔www flip, the `.io` 301, content
  and mail phases. None started.
