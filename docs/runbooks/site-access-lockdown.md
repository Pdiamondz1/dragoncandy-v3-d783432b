# Runbook — site access lockdown (private preview)

Design: `docs/superpowers/specs/2026-08-23-site-access-lockdown-design.md`

## What is switched on

Two independent layers. **Both are needed**; neither substitutes for the other.

1. **Supabase public signup off** — the only control that stops account
   creation. The `VITE_SUPABASE_ANON_KEY` ships in the browser bundle, so anyone
   can POST straight at the auth endpoint without ever loading a page served by
   Vercel. Requests to `supabase.co` never traverse Vercel, so no middleware can
   see them.
2. **An edge password on the production hosts** — stops discovery and casual
   poking. It does not protect Supabase.

## Generating the secrets

Run locally, once. Keep the output in the password manager, not in git:

```bash
node -e "console.log('SITE_GATE_SECRET=' + crypto.randomUUID() + crypto.randomUUID())"
node -e "console.log('SITE_BYPASS_TOKEN=' + crypto.randomUUID())"
```

Choose `SITE_PASSWORD` yourself — it is the one a human types.

## Vercel variables

Project `dragoncandy-v3-d783432b`, team `dragon-candy-s-projects`.
Dashboard → Settings → Environment Variables. **Production scope only.**

| Variable | Value |
|---|---|
| `SITE_GATE_ENABLED` | `1` |
| `SITE_PASSWORD` | the shared password |
| `SITE_BYPASS_TOKEN` | generated above |
| `SITE_GATE_SECRET` | generated above |

**Never prefix any of these with `VITE_`.** A `VITE_` variable is compiled into
the browser bundle, which would publish the password.

**An environment-variable change does not reach a deployment that is already
running.** Vercel's own documentation is explicit: *"Changes to environment
variables are not applied to previous deployments, they only apply to new
deployments."* So after setting or changing any of these, redeploy — Deployments
→ the current production deployment → ⋯ → **Redeploy**. Reusing the existing
build cache is fine; nothing here needs a rebuild, only a new deployment record.
From the CLI: `vercel redeploy --prod`.

That cuts both ways, so the sequence matters: set all four variables **first**,
and only then deploy the change that ships `middleware.ts`. A deployment that
goes out ahead of them runs with them unset, and with `SITE_GATE_ENABLED` absent
the gate does nothing — the site ships open while the dashboard looks locked
down.

## Supabase

Dashboard → Authentication → Sign In / Providers → turn **off** "Allow new users
to sign up".

Creating an account after this:

- Dashboard → Authentication → Users → **Invite user**, or
- `auth.admin.inviteUserByEmail` from a service-role edge function.

**Every invite must go out with the site password, or as a `?k=` link.** The
invite email points at `SITE_URL` — dragoncandy.com — which is now behind the
edge gate, so the person you just invited meets an unbranded browser password box
before they ever see Supabase. They have no reason to expect it and no password
to type. Either state the site password in the same message, or hand them
`https://dragoncandy.com/?k=<SITE_BYPASS_TOKEN>` first so the gate cookie is
already set when they click the invite. This is the seam between the two layers:
Layer 1 creates the account, Layer 2 challenges the link it sends.

## Verifying on production

The gate is production-only, so **none of this can be checked on a preview
deploy.** Run every check below after merging, in a private window.

- [ ] `curl -sI https://dragoncandy.com/ | head -1` → `HTTP/2 401`
- [ ] `curl -sI https://dragoncandy.com/robots.txt | head -1` → `HTTP/2 200`
- [ ] `curl -s https://dragoncandy.com/robots.txt` → `Disallow: /`
- [ ] `curl -sI https://dragoncandy.com/sitemap.xml | head -1` → `HTTP/2 401`
- [ ] `curl -sI -u ":$SITE_PASSWORD" https://dragoncandy.com/ | head -1` → `HTTP/2 200`
- [ ] A bundle asset is refused anonymously. Take a real filename from the page
      source after logging in, then: `curl -sI https://dragoncandy.com/assets/<file>.js | head -1` → `HTTP/2 401`
- [ ] `curl -sI "https://dragoncandy.com/pitch?k=$SITE_BYPASS_TOKEN" | head -1` → `HTTP/2 302`,
      and the response carries `Set-Cookie: dc_gate=...`
- [ ] `curl -sI https://dragoncandy.com/pitch | head -1` → `HTTP/2 401`
- [ ] In a browser: `https://dragoncandy.com` prompts, the password admits, the
      landing page renders, and the console is clean. Check desktop **and**
      mobile viewports (`CLAUDE.md`).
- [ ] Reels still play, and are not served stale to an anonymous visitor:
      `curl -sI https://dragoncandy.com/landing/reels/<file> | head -1` → `HTTP/2 401`
- [ ] **The password-reset round trip.** Request a reset for a real account,
      open the emailed link, enter the site password at the prompt, and confirm
      the page loads *with a session* and the password can actually be changed.
      This is the most important check here: it is what the `401`-not-redirect
      design exists to protect, and a redirect-based gate would fail it silently.
- [ ] Signup is refused: attempt to create an account and confirm the invite-only
      message appears rather than "Signups not allowed for this instance".
- [ ] **The invite round trip.** Invite a real address, then open the emailed link
      the way the recipient will: in a private window, with only what you sent
      them. Confirm the site password (or the `?k=` link) actually admits them and
      the invite completes. An invite that lands on a password box nobody was
      given is the predictable way this pair of layers fails a real person.
- [ ] The middleware matcher excludes `/_vercel/`, and `vercel.json` rewrites
      `/(.*)` to `/index.html`. Confirm an unrecognised path under that prefix is
      not quietly served the SPA shell:
      `curl -s https://dragoncandy.com/_vercel/nonexistent | head -c 200` → must
      NOT return HTML. (Do not "fix" this by narrowing the matcher — it exists so
      Vercel's own toolbar and protection endpoints keep working.)

## Rollback

Set `SITE_GATE_ENABLED` to `0` in the Vercel dashboard, **then redeploy** —
Deployments → ⋯ → **Redeploy** (the existing build is fine; no rebuild is needed),
or `vercel redeploy --prod`. The variable change alone changes nothing: Vercel
applies environment variables to new deployments only, never to one already
running. No git operation is involved either way.

**Do not roll back by deleting `SITE_PASSWORD`.** The gate fails closed, so a
missing password challenges every request — that locks everyone out instead of
opening the site. This is deliberate: a silently reopened site goes unnoticed for
weeks, a locked one for seconds.

If the middleware itself is broken rather than misconfigured, revert the commit
adding `middleware.ts` and redeploy; with no middleware present Vercel serves the
site exactly as before.

## Known limits, stated so nobody rediscovers them

- **The native iOS app is not gated.** It serves from `capacitor://localhost` and
  never asks Vercel for HTML, so the middleware never sees it. Anyone with a
  TestFlight build reaches the app without the site password.
- **There is no logout, and clearing an admitted visitor takes two different
  levers.** Browsers cache Basic credentials per origin and realm, so a
  password-holder is cleared by changing `SITE_PASSWORD` (and redeploying).
  That does nothing to a `?k=` recipient: their cookie is signed over an expiry
  alone and carries no copy of the password, so they keep the whole site for up
  to 30 days after any password change. Only rotating `SITE_GATE_SECRET`
  invalidates gate cookies — and it invalidates every one of them at once,
  including your own. Rotating `SITE_BYPASS_TOKEN` stops new links working; it
  does not touch cookies already minted.
- **The bypass token grants the whole site**, not one page, for the cookie's
  30-day life. `/pitch?k=…` is a quieter second password, not a scoped share.
- **`internal.dragoncandy.com` is gated too.** Stakeholders see the password
  prompt before the `/internal` admin login. `/internal`'s own authorization is
  unchanged.
- **A manual Playwright run against production now needs credentials.** Pass
  them via `httpCredentials`; do not commit the password into
  `playwright.config.ts`. CI is unaffected — `e2e.yml` runs against Preview
  deployments, which the gate deliberately skips.
- **Printed `/promo/<id>` QR codes now lead to a password box.** The deleted
  client-side gate allowlisted `/promo/` by name for exactly this reason, and the
  edge gate does not: `/promo/:promotionId` is an SPA route with no file under
  `public/`, so allowlisting it would serve the whole JavaScript bundle to any
  anonymous browser — the defect already found and closed for `/.well-known/*`.
  `PromotionCard.tsx` and `PromotionDetailPage.tsx` still generate those QR
  codes, so any code already printed or sitting on a restaurant table now sends a
  member of the public to a browser password prompt. Until launch, share a
  promotion as `https://dragoncandy.com/promo/<id>?k=<SITE_BYPASS_TOKEN>` — the
  redirect strips `k` and sets the gate cookie, so the recipient lands on the
  promotion. Note that hands them the whole site for 30 days; it is a private
  preview, not a public share.
- **At public launch**, three things revert together: `SITE_GATE_ENABLED=0` (plus
  the redeploy that makes it real), `public/robots.txt`, and the `is-crawlable`
  skip. The third one lives in **two** places and both must go: the
  `LHCI_COLLECT__SETTINGS__SKIP_AUDITS: is-crawlable` env var on **both** jobs in
  `.github/workflows/lighthouse-ci.yml`, and the matching `collect.settings`
  default in `lighthouserc.cjs`. It has to be skipped at collect time, not
  silenced at assert time — an assertion cannot change a category score
  Lighthouse has already computed, and an `LHCI_COLLECT__SETTINGS__*` env var
  replaces the config file's whole `settings` object, so the file's copy is only
  a local default and does not reach CI on its own.
