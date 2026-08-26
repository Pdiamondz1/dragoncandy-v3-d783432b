---
title: Proxy CORS Wildcard Session
type: source
created: 2026-08-26
updated: 2026-08-26
sources: [raw/sessions/2026-08-26-proxy-cors-wildcard.md]
tags: [cors, edge-functions, supabase, outstand, deploy, security-posture]
---

# Proxy CORS Wildcard Session

Summary of the 2026-08-26 session that removed `Access-Control-Allow-Origin: *` from
`outstand-proxy` and `social-proxy` — the only 2 of 125 deployed edge functions serving a
wildcard origin (PR #539, merged `8bd8b3c0`, deployed and swept the same day). Follow-up to the
[[Edge-Function Deploy & Bundling]] `.io` sweep earlier that day, which found this and
deliberately left it out because it is repo source rather than a stale bundle.

## Key claims

- **Not a live hole.** Neither proxy set `Access-Control-Allow-Credentials`, so a cross-origin
  page still could not read a response without already holding the user's JWT, which lives in
  localStorage on our own origin. Consistency and defence in depth, not an incident.
- **They diverged because the shared helper did not fit.** Both need a wider `Allow-Headers`
  than `_shared/cors.ts` provides (`accept`, `x-org-unit-id`, and outstand's two delegation
  headers), and `outstand-proxy` serves five verbs where the helper allows POST. Calling
  `corsHeaders` would have broken them, so copying the block was the path of least resistance.
- **The fix shares the origin DECISION, not the header list.** `resolveAllowedOrigin(req)` is
  exported separately so each caller keeps its own headers and methods.
- **The origin is stamped at the response boundary**, because both build most responses in
  module-level `jsonResponse` helpers with no `req` in scope (28 and 41 call sites). Caching the
  origin in module state would be a **cross-request bug** — Deno serves concurrent requests in
  one isolate — and is recorded in the helper as the tempting wrong answer.
- **`Vary: Origin` appends rather than overwrites.** The platform already sets
  `Vary: Accept-Encoding`; prod reads `Vary: Accept-Encoding, Origin` after the deploy.
- **Two Codex findings were declined on measurement.** `*.vercel.app` is a shared domain, so
  allow-listing it would be worse than the wildcard removed. And `http://127.0.0.1:8080` was
  measured against prod: `donny-orchestrator`, `create-notification` and
  `release-creator-payout` already refuse it, so local dev never could call them — these two
  were the last exception. Adding localhost to `ALLOWED` would widen CORS on all 125 functions
  including payouts, so it was left to an owner.

## Accepted cost

Developing social features locally now fails. Stated rather than buried; the prod measurement
behind the decision lives in the `_shared/cors.ts` doc comment so it can be reversed
deliberately, in one place.

## Verification

Identical probe before and after, so differences are attributable: `evil.example` moved from `*`
to `https://dragoncandy.com` (the fix), `capacitor://localhost` echoes itself (the iOS shell
keeps working), `verify_jwt` unchanged, and the wide `Allow-Headers` and five verbs were
preserved — narrowing either was the real way this could have broken working features. Fleet
sweep after: ok = 107, nocors = 18, **wildcard = 0**, 125 exactly.

## See Also

- [[Edge-Function Deploy & Bundling]] — carries the full write-up and the `.io` sweep it follows
- [[Cross-Tenant Proxy Authorization]] — the other body of work on these two functions
