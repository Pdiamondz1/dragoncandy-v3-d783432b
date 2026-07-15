# Vercel Prod Cutover — dragoncandy.io off Lovable hosting

> **Why.** Lovable's editor is slow / crashes on mobile WebKit ("A problem repeatedly
> occurred" on lovable.dev itself — their app, not ours), its publish step crashes, and its
> deploys take tens of minutes. Vercel already builds this exact repo on every PR (the QA
> staging gate) **and already runs a Production deployment on every merge to `main`** — so
> the cutover is: verify env scopes → attach domains → flip DNS at Cloudflare. Fully
> reversible (rollback = DNS only). Decided 2026-07-15, superseding the 2026-06-02 QA-gate
> decision "Lovable stays the prod host" (a scoping choice, not a technical blocker).

## Facts

| Thing | Value |
|-|-|
| Vercel project | `dragoncandy-v3-d783432b` (team `dragon-candy-s-projects`) |
| Prod Supabase | `zocahiffooqdybdhguqv` (`https://zocahiffooqdybdhguqv.supabase.co`) |
| Staging Supabase (Preview scope ONLY) | `mhffqrawgizhprbobcta` |
| Domains to attach | `dragoncandy.io`, `www.dragoncandy.io`, `internal.dragoncandy.io` |
| DNS host | **Cloudflare** (`melina`/`merlin.ns.cloudflare.com`) |
| Pre-cutover DNS (rollback target) | apex + `www`: Cloudflare-proxied → Lovable origin; `internal`: A `185.158.133.1` (Lovable, DNS-only) — **capture exact records from the Cloudflare dashboard before editing** (proxied records hide the origin) |
| Frontend build env vars | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_STRIPE_PUBLISHABLE_KEY`, `VITE_GOOGLE_MAPS_API_KEY` |

What does NOT move: Supabase (DB, Auth, 80 edge functions — Lovable never deployed
those), Stripe webhooks (they point at Supabase edge functions), the CSP (an `index.html`
meta tag that travels with the app), Supabase Auth redirect allow-list (the domain is
unchanged). `vercel.json` already carries the SPA rewrite every deep link needs.

## Phase 0 — Pre-flight (no user impact; do all of this BEFORE touching DNS)

1. **Env-var scopes — HARD GATE.** Vercel dashboard → Project → Settings → Environment
   Variables. Required end state:
   - **Production scope:** `VITE_SUPABASE_URL` = prod URL, `VITE_SUPABASE_ANON_KEY` =
     prod anon key (the public value in `src/integrations/supabase/client.ts`),
     `VITE_STRIPE_PUBLISHABLE_KEY` = the test `pk_test_…SkFix…` key,
     `VITE_GOOGLE_MAPS_API_KEY` = same value the Lovable prod build uses (copy from
     Lovable project settings; if missing, maps/geocoding silently degrade — the code
     falls back to `''`).
   - **Preview scope:** keeps the STAGING values. **If any staging value is scoped to
     "Production" or "All Environments", fix it before proceeding** — otherwise
     dragoncandy.io would serve a frontend pointed at staging Supabase.
   - (Supabase URL/anon key and the Stripe pk have hardcoded prod fallbacks in code, so
     an *absent* var is safe; a *staging-valued* var in Production scope is the danger.)
2. **Fresh Production build.** Redeploy `main` from the Vercel dashboard (or merge any
   PR) so a Production deployment exists that was built with the verified env vars.
3. **Verify that deployment** (its URL is behind Vercel SSO — open it logged into
   Vercel, or use the protection-bypass query param):
   - App loads; DevTools Network shows calls to `zocahiffooqdybdhguqv.supabase.co`
     (NOT `mhffqrawgizhprbobcta`).
   - A deep link (e.g. `/auth`) renders instead of 404 (SPA rewrite working).
   - Login with a test account works; `/version.json` serves.
4. **Deployment Protection mode.** Settings → Deployment Protection must be **Standard
   Protection** (deployment URLs protected; a custom production domain is public). If it
   is "All Deployments", dragoncandy.io itself would 401 after cutover — change it.

## Phase 1 — Attach domains + DNS (Cloudflare)

1. In the Cloudflare dashboard, **screenshot/record the current records** for `@`, `www`,
   and `internal` (rollback target).
2. Vercel dashboard → Project → Settings → Domains → add `dragoncandy.io`,
   `www.dragoncandy.io`, `internal.dragoncandy.io`. Set `www` → redirect to apex (matches
   current behavior). Vercel will display the records it wants.
3. In Cloudflare, update the records (typical values — follow what Vercel displays):
   - `@` (apex): `A 76.76.21.21`
   - `www`: `CNAME cname.vercel-dns.com`
   - `internal`: `CNAME cname.vercel-dns.com` (replaces the Lovable A record)
   - **Cloudflare gotcha:** either set these records to **DNS only** (gray cloud —
     simplest, recommended), or if you keep the orange-cloud proxy, set SSL/TLS mode to
     **Full (Strict)** — proxied-with-Flexible causes redirect loops in front of Vercel.
4. Wait for Vercel to show all three domains as verified with valid certs (minutes).

## Phase 2 — Verify prod

Run the `verify-prod` skill against dragoncandy.io (both viewports + console errors), and
additionally confirm:
- `internal.dragoncandy.io` still lands on the internal surface (host-aware alias).
- Login + a campaign-browse smoke on the consumer app.
- Deploys are now ~1–3 min after merge — the old tens-of-minutes bundle-hash polling
  window shrinks accordingly.

## Phase 3 — Retire Lovable publishing (AFTER a stable window)

- **Leave the Lovable-hosted site published for a few days** — it is the instant rollback
  target (rollback = restore the Cloudflare records; Lovable keeps serving as long as it
  stays published).
- Keep the Lovable project **connected to GitHub** if the founder still wants Lovable AI
  edits — its commits land on GitHub and now deploy via Vercel in minutes; its publish
  button is simply no longer part of the pipeline. The `client.ts`
  Lovable-regen-reversion watch item stays alive as long as Lovable stays connected.
- Then: unpublish the Lovable site / detach the custom domain there, and re-evaluate the
  $50/mo Lovable plan (its only remaining role is the AI editor).

## Rollback

Restore the captured Cloudflare records for `@`, `www`, and `internal`. Nothing else to
undo — Lovable is still publishing until Phase 3, and the Vercel domains can stay
attached (they just stop receiving traffic).

## Gotchas / invariants

- **e2e gate unaffected:** `.github/workflows/e2e.yml` reacts only to *Preview*
  deployment_status events — Vercel Production deploys do not (and should not) trigger
  the staging smoke suite.
- **Edge functions never deployed by the frontend host** — keep deploying via Supabase
  CLI/MCP (`careful` + `edge-function-reviewer` gates), exactly as before.
- **Preview scope stays staging** — the QA gate (per-PR previews against staging
  Supabase, Playwright smoke) is untouched by this cutover.
- **Verify env-var scopes any time a var is added** — the Production/Preview split is
  now load-bearing in a way it wasn't when Lovable served prod.
