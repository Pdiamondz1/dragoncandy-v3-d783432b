# Anonymous Brief Generator — repair + Layered-v1 abuse hardening + thin-page guardrail

- **Date:** 2026-06-28
- **Branch:** `fix/anonymous-brief-generator` (worktree `DC-Dezzy-AI-2`)
- **Status:** design approved (founder); revised after spec-review round 1 (6 issues addressed)

## Context — the bug (confirmed in prod, not theory)

The landing page's free brief generator (`BriefGeneratorPreview`, rendered in `DonnySection`
behind the "Try it now — paste a link" CTA) **fails 100% of the time in prod**. Reproduced
twice (curl + edge logs): `generate-anonymous-brief` → **HTTP 500**, caused by a same-instant
**HTTP 401** from `donny-campaign-generate`.

**Root cause:** `generate-anonymous-brief` calls the core generator `donny-campaign-generate`
server-to-server with the **service-role key** as the bearer. `donny-campaign-generate`
authenticates the caller via `supabaseUser.auth.getUser()` (a real user JWT) or a Donny OAuth
token (`donny-campaign-generate/index.ts:234-267`) — neither is satisfied by a service-role key —
so it returns 401 before parsing the body. (It was double-broken: the proxy also forwards `{ url }`,
which neither the new-format `source_type` path nor the legacy `source_url` path reads; auth fails
first, so this is moot once we stop delegating.)

The value is already signup-gated (a guest sees one preview; `handleSaveAndSignUp` stores
`pendingBrief` and routes to signup). So the asset at risk from abuse is **cost** (each call is a
URL fetch + an Anthropic call against the 15%-of-revenue AI cap), not data.

## Goal

1. Make the free brief generator **work** for anonymous landing visitors.
2. **Bound the cost** of an unauthenticated, AI-spending endpoint (Layered v1).
3. Surface a **thin/unreadable-page signal** so the preview can honestly flag a poor result
   (the runtime half of the false-advertising fix shipped as copy in PR #204).

Non-goal: changing the logged-in in-app campaign flow. `donny-campaign-generate` is **untouched**.

## Error/response contract (foundational — drove several fixes)

`supabase.functions.invoke` exposes the response body as `data` **only on a 2xx status** (on
non-2xx it returns `error` and `data = null`). Therefore **every handled outcome returns HTTP 200**
with a discriminator the client reads; only an *unexpected* server fault returns 500 (caught by the
client's generic toast). This is why the existing `rate_limited` path (returned as **429** today)
is dead — the frontend's `if (data?.error === 'rate_limited')` never sees a 429 body.

| Outcome | HTTP | Body |
|---|---|---|
| Success | 200 | `{ campaign_name, campaign_description, target_audience, content_suggestions, source_quality }` |
| Per-IP limit hit | 200 | `{ error: "rate_limited" }` |
| Global daily cap hit / cap-count query failed (fail-closed) | 200 | `{ error: "capacity" }` |
| URL fetch/extract failed | 200 | `{ error: "fetch_failed" }` |
| Model call / JSON parse failed | 200 | `{ error: "generation_failed" }` |
| Honeypot filled (bot) | 200 | `{ error: "rate_limited" }` (benign; no fetch, no model call, no row) |
| Bad/missing URL | 400 | `{ error: "..." }` (pre-generation validation; client shows inline) |
| Unexpected fault | 500 | `{ error: "Internal server error" }` (client generic catch) |

The frontend handles each `error` discriminator with a friendly message; `fetch_failed` /
`generation_failed` map to "Couldn't generate from that link — try another."

## Design

### 1. Self-contained generation (the repair)

`generate-anonymous-brief` stops delegating and does the work itself (it already owns the rate-limit
+ record-save):

1. Honeypot check → URL validation + **hardened SSRF guard** (§SSRF) → global cap → per-IP cap
   (best-effort) — cheapest/most-protective first, before any spend.
2. Fetch + extract the page (title / meta description / stripped body text), `redirect: "manual"`,
   8s timeout, bot UA.
3. **One Haiku call**, model **hardcoded** `claude-haiku-4-5-20251001` with `max_tokens: 768`, via
   `_shared/anthropic-fetch` (`anthropicFetch`) to `https://api.anthropic.com/v1/messages` with
   `ANTHROPIC_API_KEY`. **Do NOT use `getModelConfig`** — it has no `generate-anonymous-brief`
   routing entry and falls through to **SONNET/4096**, defeating the cost control. A strict-JSON
   system prompt returns the brief fields below.
4. Parse `data.content[0].text` → `JSON.parse` (on throw → `{error:'generation_failed'}`) → return.
5. Save the `campaign_brief_generations` record (user_id null) **only on success**; insert failure
   is non-blocking (still return the brief).

**Success body** (matches `GeneratedBrief` in `BriefGeneratorPreview.tsx`):
```jsonc
{
  "campaign_name": "…",
  "campaign_description": "…",
  "target_audience": "…",
  "content_suggestions": ["…", "…", "…"],
  "source_quality": { "readable": true, "chars": 1234 }   // additive, see §3
}
```

Per-call cost logging (`logCost`) is **skipped** for v1 (needs a `userId`; anonymous has none;
the global cap is the real cost control). Deferred nicety.

### 2. Layered-v1 abuse hardening

- **Global daily cap (the keystone, honestly best-effort).** Before generating, count today's
  anonymous rows (`campaign_brief_generations` where `user_id is null` and
  `generated_at >= todayStart`). If `>= GLOBAL_DAILY_CAP` (**150**) → `{error:'capacity'}`. If the
  count query itself errors → **fail-closed** (`{error:'capacity'}`, no spend). This is **not
  atomic** — count happens before the row is saved, so a concurrent burst can overshoot 150. That is
  acceptable because each allowed call is **Haiku at 768 tokens (sub-cent)**: even a few thousand
  burst calls is low-tens-of-dollars, not runaway. An atomic/short-window counter is deferred (only
  needed if real abuse appears). The cap converts "unbounded cost" into "bounded + briefly
  unavailable," which is the goal.
- **Per-IP cap (best-effort).** **Do not claim an un-spoofable IP.** The real client IP header on
  Supabase Edge is not contractually documented, and the previous `x-forwarded-for.split(',')[0]`
  is client-spoofable while the rightmost entry is a constant infra hop (would throttle the whole
  platform). **Implementation step:** first log all candidates on prod
  (`x-forwarded-for` full chain, `x-real-ip`, `cf-connecting-ip`) from a real browser hit and pick
  the header that actually **varies per client**; use that. Normalize the value to a valid Postgres
  `inet` (the `campaign_brief_generations.ip_address` column type) or **null**; if it can't be
  parsed to a valid inet, **skip** the per-IP check (never block, never 500 on a bad IP) — the
  global cap still covers cost. Keep the per-IP limit at **1/day** as a friction layer, not a
  guarantee.
- **Honeypot.** `BriefGeneratorPreview` renders a hardened decoy text field — off-screen
  (not `display:none`, which some bots skip), `aria-hidden`, `tabIndex={-1}`, `autoComplete="off"`,
  and a **non-autofill-prone name** (e.g. `subject_hp`, not `company_website`) to avoid
  password-manager false-positives. If the request's honeypot is non-empty → return
  `{error:'rate_limited'}` immediately (no fetch, no model call, no row) so a bot gets a benign,
  brief-less response.
- **Cheap + bounded.** Hardcoded Haiku + `max_tokens: 768` → each allowed call is a few cents.

### SSRF guard (hardened — this is now an unauthenticated internet-facing fetcher)

The existing guard is hostname-string-only and insufficient. Replace with:
- **Scheme:** allow only `http:` / `https:`.
- **Host encodings:** reject non-dotted-quad numeric hosts (decimal `2130706433`, hex `0x7f...`,
  octal) — parse and resolve them to their IPv4 before the private-range check, or reject outright.
- **IPv4 private/link-local/loopback:** existing `10/8`, `172.16/12`, `192.168/16`, plus
  `127/8`, `169.254/16`, `0.0.0.0`.
- **IPv6:** block `::1`, `fc00::/7` (ULA), `fe80::/10` (link-local), and IPv4-mapped forms.
- **Redirects:** `redirect: "manual"`; if the response is a 3xx, re-validate the `Location` target
  against the same guard and follow at most 1–2 hops manually (a public URL can 302 to
  `http://169.254.169.254/…`). Reject if a hop fails validation.
- **Residual risk accepted for v1:** DNS-rebinding (a public hostname that resolves to an internal
  IP) is not fully closable in the Deno edge runtime without raw DNS resolution; documented as a
  known limitation. (`donny-campaign-generate` shares the same weak guard but is out of scope and
  not internet-open the same way; not touched here.)

### 3. Thin-page guardrail signal

The fn computes `source_quality`:
- `chars` = length of the extracted body text (post-strip).
- `readable` = fetch succeeded **and** `chars >= THIN_CHARS_THRESHOLD` (**200**).

The brief is **still generated and returned** when `readable=false` (the model can use the
title/URL). The preview reads `source_quality` and, when `readable===false`, renders a gentle
inline note in the brief-reveal view: "We couldn't pull much from that page — try your homepage or
menu for a sharper draft." Non-blocking; the draft still shows.

### 4. Frontend (`BriefGeneratorPreview.tsx`)

- Add the hardened hidden honeypot field; include it in the invoke body.
- Map each `data.error` discriminator to a friendly state: `rate_limited` and `capacity` →
  existing "one free brief / maxed — sign up" messaging; `fetch_failed` / `generation_failed` →
  "Couldn't generate from that link — try another." (All arrive as **200**, so `data` is present.)
- Read `data.source_quality`; when `readable===false`, show the thin-page note alongside the brief.
- (Copy/placeholder already updated in PR #204.)

## Files

- **Rewrite** `supabase/functions/generate-anonymous-brief/index.ts` — self-contained generation +
  Layered-v1 controls + hardened SSRF + `source_quality` + the 200-discriminator contract. Uses
  `_shared/cors`, `_shared/anthropic-fetch`. Deploy via Supabase MCP/CLI (`verify_jwt` unchanged).
- **Create** `supabase/functions/generate-anonymous-brief/lib.ts` — pure, unit-testable helpers
  (no `https://` imports so Vitest can load them): `extractClientIp(headers)` → valid-inet|null,
  `isHoneypotTripped(body)`, `isBlockedTarget(url)` (the hardened SSRF predicate),
  `computeSourceQuality(extracted)`, `parseBrief(modelText)`.
- **Edit** `src/components/landing/BriefGeneratorPreview.tsx` — honeypot, error discriminators,
  thin-page note.
- **No change** to `donny-campaign-generate`, `_shared/model-routing.ts`, or any other edge fn.

## Constants (founder-approved defaults)

| Name | Value |
|------|-------|
| `GLOBAL_DAILY_CAP` | 150 / day (anonymous) — best-effort, non-atomic |
| per-IP cap | 1 / day — best-effort (IP header chosen empirically) |
| `THIN_CHARS_THRESHOLD` | 200 chars |
| model | `claude-haiku-4-5-20251001` (hardcoded, NOT via getModelConfig) |
| `max_tokens` | 768 |
| fetch timeout | 8s; max redirect hops 1–2 (manual, re-validated) |

## Testing / verification

1. `npm run build` + `npm run typecheck` (frontend; expected green).
2. Vitest the pure `lib.ts` helpers: `extractClientIp` (valid/invalid/missing → inet|null),
   `isBlockedTarget` (private v4, IPv6 ULA/link-local, numeric/hex host, non-http scheme, public
   pass), `isHoneypotTripped`, `computeSourceQuality` (≥/< threshold), `parseBrief` (valid/garbage).
3. **Empirically pick the client-IP header**: deploy, hit from a real browser, read prod logs for
   `x-forwarded-for`/`x-real-ip`/`cf-connecting-ip`, confirm which varies per client; wire it.
4. Deploy the edge fn; curl-verify on prod with the anon key:
   - content-rich URL → `200` brief + `source_quality.readable=true`.
   - thin/near-empty URL → `200` brief + `source_quality.readable=false`.
   - honeypot filled → `200 {error:'rate_limited'}`, **no new `campaign_brief_generations` row**.
   - redirect-to-internal URL → blocked (`fetch_failed`), not fetched.
   - per-IP second call same day → `200 {error:'rate_limited'}` (200, not 429).
5. `codex-review` over the branch; fix until clean; relay verdict.
6. Browser-verify the live preview end-to-end (paste a URL → brief renders; thin URL → note shows).
7. `knowledge-sync` (concept page + index/log + PROJECT_CONTEXT bullet); sync RAG after merge.

## Non-overlap

Touches only `generate-anonymous-brief` + `BriefGeneratorPreview` — **not** `aios-playbook-run`
(the sister `DC-Dezzy-AI` worktree's file) — so no cross-worktree conflict.

## Deferred (explicitly out of scope)

- **Cloudflare Turnstile** (invisible bot challenge) — stronger bot defense; deferred until abuse
  appears, since the global cap bounds cost. (Founder chose Layered v1.)
- **Atomic / short-window global counter** — only needed if burst abuse materializes.
- **Per-call cost logging** to the AI cost ledger for anonymous briefs (needs a sentinel user).
- **DNS-rebinding-proof SSRF** — needs raw DNS resolution unavailable in the edge runtime.
- **Sharing the brief-generation core** with `donny-campaign-generate` — refactors the working core
  fn; not worth the blast radius for v1.
