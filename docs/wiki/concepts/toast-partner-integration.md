---
title: Toast Partner Integration
type: concept
created: 2026-08-23
updated: 2026-08-23
sources: []
tags: [toast, pos, integrations, authentication, partnerships]
---
# Toast Partner Integration

DragonCandy has six deployed `toast-*` edge functions, four Toast migrations, a settings
card, five help articles, an e2e spec and an operations runbook. It has never had Toast
credentials, and the code implements an authentication flow Toast does not offer.

Both halves of that sentence matter, and they were established separately.

## Toast's API is not OAuth

Verified 2026-08-23 against `doc.toasttab.com/doc/devguide/authentication.html`:

- **No authorization endpoint.** No user redirect, no authorization code, no consent screen.
- **No refresh token.** A partner POSTs `clientId`, `clientSecret` and
  `userAccessType: TOAST_MACHINE_CLIENT` to `/authentication/v1/authentication/login`,
  receives a JWT in `accessToken` with an `expiresIn` (about an hour), and logs in again
  when it lapses. Re-authentication is a repeat of the original call, not a distinct grant.
- **Restaurant access is granted restaurant-side.** The restaurant goes to Toast Web →
  Integrations → Integration management → Browse & purchase integrations → *Add Now*, and
  picks which locations the partner may see. The partner learns about it by asking Toast
  which restaurants it can access. Each subsequent request names one of them in the
  `Toast-Restaurant-External-ID` header, holding that restaurant's Toast GUID.

There is no point in that sequence where the restaurant leaves DragonCandy's UI, and no
point where DragonCandy receives a per-restaurant token.

## What the repo built instead

`toast-oauth-start` mints a signed state cookie and redirects the user to
`TOAST_OAUTH_AUTHORIZE_URL`. `toast-oauth-callback` exchanges an authorization `code` at
`TOAST_OAUTH_TOKEN_URL`. `toast-token-refresh` runs a 30-minute `pg_cron` job performing a
`refresh_token` grant for any connection expiring within 45 minutes. `toast_connections`
stores a `refresh_token`. `docs/runbooks/toast.md` §1 tells an operator what to do when
Toast returns `invalid_grant` on a refresh.

None of those endpoints, grants or error codes exist. The whole shape is a competent
implementation of a generic OAuth2 authorization-code integration, applied to a vendor that
does not use one.

**The tell was in the code the entire time: every Toast URL is an environment variable.**
Nobody hardcoded `ws-api.toasttab.com` because nobody had the documentation to hardcode.
A URL that should be a constant showing up as configuration is evidence the author was
working from a template rather than a spec — the same smell as a schema field with no
vocabulary ([[Campaign Target Audience]]).

## Why nothing is broken

The integration is deployed dark and fails closed, which is the one thing it got right.
Each function guards on its Toast env vars and returns HTTP 503 `toast_not_configured`
when they are absent. No `TOAST_*` secret exists on prod (checked via
`supabase secrets list`, which **is** listable — see the note in `PROJECT_CONTEXT.md` §5),
and zero `%toast%` tables exist on prod: the four migrations were never applied.

So the blast radius today is zero. The cost is entirely future: anyone reading the repo
concludes the integration is one credential away from working, and budgets accordingly.
`PROJECT_CONTEXT.md` listed Toast POS under **Active integrations** until 2026-08-23 — a
claim `SHIPPED_LOG.md` had already contradicted in writing two weeks earlier, and which
nothing read. Same failure mode as the `**Pending:**` clauses described in §5: *a
present-tense claim about prod is a claim with an expiry date.*

## The partnership process

Applying is three steps, and only the first is self-service. Accept the API Documentation
License Agreement at `pos.toasttab.com/api-documentation-license-agreement`; Toast emails
instructions and a link; complete the actual application form.

**Step 1 was submitted 2026-08-23** as Dragon Candy LLC from `dame@dragoncandy.com`.

**That agreement expires by its own terms.** §3(d) terminates it six months from the
effective date — **2027-02-23** — unless the application has been accepted or rejected
first. Toast's application page warns of a response backlog. The deadline can therefore
pass with nobody having done anything wrong; the remedy is to re-accept and continue.

Reaching production is eight stages: Application → Discovery → Partner Agreement →
Development Kickoff → Certification → Alpha → Beta → General Availability. **Sandbox**
credentials require approval from Toast's compliance, privacy, security and legal teams
*plus* a signed partner agreement *plus* an assigned Toast integration representative.
**Production** credentials require a one-hour interactive certification demo. Alpha is a
single restaurant for at least a week; beta is three to five locations over several weeks.

That is where the 6–12 month estimate comes from, and it is almost entirely other people's
calendars — which is the argument for applying long before the code is ready, not after.

## Known Issues

- The auth layer needs rewriting before sandbox credentials are useful. Budget for it.
- `toast_connections.refresh_token` and `token_expires_at`'s refresh semantics are dead
  once the model is corrected; `token_expires_at` itself survives (Toast returns
  `expiresIn`).
- `docs/runbooks/toast.md` §1 documents a recovery procedure for an error class that
  cannot occur. §2 (webhook replay) and §3 (disconnect) are less affected but were written
  against the same assumptions.
- The four migrations have never been applied to prod, so they have never been exercised.
  Treat them as unreviewed.

## See Also

- [[verify_jwt Is Not Authorization]] — the other case where a platform default was mistaken
  for a guarantee.
- [[Updated-At Trigger Drift]] — the canonical `recorded ≠ actual` failure in this project.
