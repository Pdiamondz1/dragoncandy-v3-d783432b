---
title: Anonymous Brief Generator
type: concept
created: 2026-06-28
updated: 2026-06-28
sources: [2026-06-28-anonymous-brief-generator-fix.md]
tags: [landing, edge-functions, ssrf, abuse-prevention, ai-cost, donny]
---
# Anonymous Brief Generator

The landing page's free **"paste a URL → campaign brief"** teaser (`BriefGeneratorPreview` inside
`DonnySection`, CTA "Try it now — paste a link"). It calls the `generate-anonymous-brief` edge
function (no login; `verify_jwt=true`, satisfied by the public anon key). The value is signup-gated —
a guest sees one preview; saving/using the brief forces signup — so the asset to defend is **AI cost**,
not data. Sibling of the [[Landing Lead Capture]] pipeline (the other hardened anonymous landing endpoint).

## Key Decisions

- **Self-contained, never delegate to a user-gated function.** The function does its own
  fetch+extract + a single model call. It must NOT call the user-gated `donny-campaign-generate` —
  that function authenticates via `auth.getUser()` / Donny OAuth, and a **service-role bearer does not
  satisfy that** (→ 401). (This was the root-cause bug: the whole feature 500'd in prod for an unknown
  period because the proxy delegated with the service-role key.)
- **Hardcode the cheap model.** Uses `claude-haiku-4-5-20251001` + `max_tokens 768` directly via
  `_shared/anthropic-fetch`. Do **not** use `getModelConfig` here — it has no routing entry for this
  function and silently falls through to **Sonnet/4096**, the opposite of the cost control.
- **HTTP-200 error-discriminator contract.** `supabase.functions.invoke` exposes the response body
  only on a 2xx status. So every *handled* outcome returns **200** with an `error` field
  (`rate_limited` | `capacity` | `fetch_failed` | `generation_failed`); only an unexpected fault is 500.
  (A prior `rate_limited` returned as **429** was dead in the UI for exactly this reason.)
- **Layered-v1 abuse model** (cost defense for an unauthenticated AI endpoint; Turnstile deferred):
  - **Global daily cap** (150/day, fail-closed on the count query) is the *real* ceiling — it holds even
    under IP rotation. It is **best-effort/non-atomic** (count-before-insert), but worst-case burst cost
    is bounded by Haiku's sub-cent per call.
  - **Per-IP/day** (1) is **best-effort** over an empirically-chosen client-IP header
    (cf-connecting-ip → x-real-ip → first `x-forwarded-for`), normalized to a valid Postgres `inet` or
    **skipped**. The rightmost XFF entry is a *constant infra hop* on Supabase — using it would throttle
    the whole platform, so per-IP is never claimed to be un-spoofable.
  - **Honeypot** (`subject_hp`, an off-screen hardened field) → benign 200 no-op (no fetch/model/row).
  - **Hardened SSRF guard** (`isBlockedTarget`): http(s) only; reject numeric/hex/octal host encodings;
    block IPv4 private/loopback/link-local, IPv6 ULA/link-local/mapped, and internal hostnames;
    `redirect:"manual"` with per-hop re-validation; **strip FQDN trailing dots** before the checks.
- **Thin-page guardrail.** Because the function owns extraction, it returns `source_quality {readable,
  chars}`; the preview shows a gentle "try your homepage/menu" note when `readable=false`. This is the
  runtime half of the honest-framing copy fix (see PR #204 landing copy).

## Known Issues / Residual Risk

- **Global cap is non-atomic** (TOCTOU): a concurrent burst can overshoot 150/day. Accepted — bounded by
  Haiku cost. An atomic/short-window counter is deferred until real abuse appears.
- **DNS-rebinding** (a public hostname resolving to an internal IP) is not closed — the Deno edge runtime
  can't resolve DNS before the fetch. Documented residual.
- **`getModelConfig` trap:** any new edge function that calls `getModelConfig(name)` without adding a
  `FUNCTION_ROUTING[name]` entry silently gets Sonnet/4096. Add a routing entry or hardcode.
- **Cap accounting depends on the row insert.** A value that isn't a valid `inet` would make the insert
  throw and leave no row, bypassing the cap — which is why `isValidInet` must be strict (a bare `:`
  previously slipped through). Bad IP → `null` → row still saves → cap holds.

## See Also

- [[Landing Lead Capture]] — the other hardened anonymous landing endpoint (honeypot + fail-open IP
  throttle + closed-anon-DML table); same "defend a public endpoint" family, different fail posture
  (lead capture fails *open* to never drop a real lead; this fails *closed* to never overspend).
- [[Donny AI]] — the campaign-generation brain; the logged-in path is `donny-campaign-generate`.
