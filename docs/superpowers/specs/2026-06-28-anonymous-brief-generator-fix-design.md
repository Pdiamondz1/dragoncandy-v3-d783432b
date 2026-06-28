# Anonymous Brief Generator — repair + Layered-v1 abuse hardening + thin-page guardrail

- **Date:** 2026-06-28
- **Branch:** `fix/anonymous-brief-generator` (worktree `DC-Dezzy-AI-2`)
- **Status:** design approved (founder), pre-implementation

## Context — the bug (confirmed in prod, not theory)

The landing page's free brief generator (`BriefGeneratorPreview`, rendered in `DonnySection`
behind the "Try it now — paste a link" CTA) **fails 100% of the time in prod**. Reproduced
twice (curl + edge logs): `generate-anonymous-brief` → **HTTP 500**, caused by a same-instant
**HTTP 401** from `donny-campaign-generate`.

**Root cause:** `generate-anonymous-brief` calls the core generator `donny-campaign-generate`
server-to-server with the **service-role key** as the bearer. `donny-campaign-generate`
authenticates the caller via `supabaseUser.auth.getUser()` (a real user JWT) or a Donny OAuth
token — neither is satisfied by a service-role key — so it returns 401 before it ever parses the
body. (A secondary mismatch exists: the proxy forwards `{ url }` but the generator's new-format
path keys on `source_type` and the legacy path on `source_url`/`page_context.url`; auth fails
first, so this is moot once we stop delegating.)

The value of the feature is already signup-gated (a guest sees one preview; `handleSaveAndSignUp`
stores `pendingBrief` and routes to signup). So the asset at risk from abuse is **cost** (each call
is a URL fetch + an Anthropic call against the 15%-of-revenue AI cap), not data.

## Goal

1. Make the free brief generator **work** for anonymous landing visitors.
2. **Bound the cost** of an unauthenticated, AI-spending endpoint (Layered v1).
3. Surface a **thin/unreadable-page signal** so the preview can honestly flag a poor result
   (the runtime half of the false-advertising fix shipped as copy in PR #204).

Non-goal: changing the logged-in in-app campaign flow. `donny-campaign-generate` is **untouched**.

## Design

### 1. Self-contained generation (the repair)

`generate-anonymous-brief` stops delegating to `donny-campaign-generate` and does the work itself
— it already owns the anonymous concerns (rate-limit + saving the `campaign_brief_generations`
record); it only needs to perform the generation in-function:

1. Validate + SSRF-guard the URL (keep the existing checks).
2. Fetch + extract the page (title / meta description / stripped body text) — the same extraction
   approach `donny-campaign-generate.fetchAndExtract` uses (8s timeout, bot UA, strip script/style/tags).
3. One **Haiku** call via the shared `_shared/anthropic-fetch` + `_shared/model-routing` helpers,
   with a brief-generation system prompt + small `max_tokens`, returning strict JSON.
4. Parse → return a brief in the shape the preview already renders.

**Response contract** (matches `GeneratedBrief` in `BriefGeneratorPreview.tsx`):
```jsonc
{
  "campaign_name": "…",          // (or "title")
  "campaign_description": "…",    // (or "description")
  "target_audience": "…",
  "content_suggestions": ["…","…"],
  "source_quality": { "readable": true, "chars": 1234 }   // NEW — see §3
}
```
Existing fields are unchanged for the preview; `source_quality` is additive.

Per-call cost logging (`logCost`) is **skipped** for v1 (it requires a `userId`; anonymous has
none, and the global cap is the real cost control). Noted as a deferred nicety.

### 2. Layered-v1 abuse hardening

- **Global daily cap (the keystone).** Before generating, count today's anonymous rows
  (`campaign_brief_generations` where `user_id is null` and `generated_at >= todayStart`). If
  `>= GLOBAL_DAILY_CAP` (**150**), return `{ error: "capacity" }` (HTTP 200 so the client can show
  a friendly message) → preview shows "Free previews are maxed for today — sign up for unlimited."
  This converts runaway cost into "feature briefly unavailable," independent of IP evasion.
- **Trusted client IP.** Replace the spoofable `x-forwarded-for.split(',')[0]` (a client can
  prepend a forged entry) with a trusted source: prefer `x-real-ip` if present, else the
  **rightmost** `x-forwarded-for` entry (the hop added by Supabase's gateway nearest us). Keep the
  per-IP cap at **1/day**. Now the per-IP limit actually holds.
- **Honeypot.** `BriefGeneratorPreview` renders a visually-hidden, non-interactive decoy field
  (e.g. `company_website`); if the request body's honeypot is non-empty, the fn returns a
  benign success-shaped no-op **without** fetching or calling the model (the `capture-lead` pattern).
- **Cheap + bounded.** Haiku + a small `max_tokens` cap → each allowed call is a few cents.

Order of checks (cheapest/most-protective first): honeypot → URL/SSRF validation → global cap →
per-IP cap → fetch+extract → model call → save record → return.

### 3. Thin-page guardrail signal

Because the fn now performs extraction, it computes `source_quality`:
- `chars` = length of the extracted body text (post-strip).
- `readable` = the fetch succeeded **and** `chars >= THIN_CHARS_THRESHOLD` (**200**).

The brief is **still generated and returned** even when `readable=false` (the model can work from
the title/URL). The preview reads `source_quality` and, when `readable=false`, renders a gentle
inline note: "We couldn't pull much from that page — try your homepage or menu for a sharper draft."
(Non-blocking; the draft still shows.)

### 4. Frontend (`BriefGeneratorPreview.tsx`)

- Add the hidden honeypot field + include it in the invoke body.
- Handle `data.error === 'capacity'` → friendly "maxed for today, sign up" state (sibling to the
  existing `rate_limited` handling).
- Read `data.source_quality` → render the thin-page note in the brief-reveal view when
  `readable === false`.
- (Copy/placeholder already updated in PR #204.)

## Files

- **Rewrite** `supabase/functions/generate-anonymous-brief/index.ts` — self-contained generation +
  Layered-v1 controls + `source_quality`. Uses `_shared/cors`, `_shared/anthropic-fetch`,
  `_shared/model-routing`. Deploy via Supabase MCP/CLI (`verify_jwt` unchanged = true; anon key
  satisfies it).
- **Edit** `src/components/landing/BriefGeneratorPreview.tsx` — honeypot, capacity state,
  thin-page note.
- **Optional pure helper** `supabase/functions/generate-anonymous-brief/lib.ts` (or inline) for
  the unit-testable bits: trusted-IP extraction, honeypot check, `source_quality` computation,
  brief-JSON parse. Vitest where the helper avoids `https://` imports.
- **No change** to `donny-campaign-generate` or any other edge function.

## Constants (founder-approved defaults)

| Name | Value |
|------|-------|
| `GLOBAL_DAILY_CAP` | 150 / day (anonymous) |
| per-IP cap | 1 / day |
| `THIN_CHARS_THRESHOLD` | 200 chars |
| model | Haiku (via model-routing) |
| `max_tokens` | small (brief-sized, ~800) |

## Testing / verification

1. `npm run build` + `npm run typecheck` (frontend; expected green).
2. Unit-test the pure helpers (trusted-IP, honeypot, source_quality, parse).
3. Deploy the edge fn; curl-verify on prod with the anon key:
   - valid content-rich URL → `200` with a brief + `source_quality.readable=true`.
   - thin/near-empty URL → `200` brief + `source_quality.readable=false`.
   - honeypot filled → benign no-op (no model call; verify no new `campaign_brief_generations` row).
   - over-cap (simulate by temporarily lowering the cap or asserting the count path) → `{error:'capacity'}`.
   - forged `x-forwarded-for` prepend → does not bypass the per-IP limit.
4. `codex-review` over the branch; fix until clean; relay verdict.
5. Browser-verify the live preview end-to-end (paste a URL → brief renders; thin URL → note shows).
6. `knowledge-sync` (concept page + index/log + PROJECT_CONTEXT bullet); sync RAG after merge.

## Non-overlap

This change touches only `generate-anonymous-brief` + `BriefGeneratorPreview` — **not**
`aios-playbook-run` (the sister `DC-Dezzy-AI` worktree's file) — so no cross-worktree conflict.

## Deferred (explicitly out of scope)

- **Cloudflare Turnstile** (invisible bot challenge) — stronger bot defense; deferred until abuse
  appears, since the global cap already bounds cost. (Founder chose Layered v1.)
- **Per-call cost logging** to the AI cost ledger for anonymous briefs (needs a sentinel user).
- **Sharing the brief-generation core** with `donny-campaign-generate` via a `_shared` helper —
  reduces duplication but refactors the working core fn; not worth the blast radius for v1.
