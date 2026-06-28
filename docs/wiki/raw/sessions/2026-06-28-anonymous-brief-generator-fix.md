# Session — Anonymous brief generator repair + Layered-v1 hardening + thin-page guardrail

- **Date:** 2026-06-28
- **Branch:** `fix/anonymous-brief-generator` (worktree `DC-Dezzy-AI-2`)
- **Spec:** `docs/superpowers/specs/2026-06-28-anonymous-brief-generator-fix-design.md`

## How this surfaced

While scoping a small "thin-page" guardrail for the landing's free brief preview
(`BriefGeneratorPreview` in `DonnySection`, behind "Try it now — paste a link"), investigation
found the whole feature was **500ing on every call in prod** — confirmed by curl + edge logs
(paired `generate-anonymous-brief` 500 ← `donny-campaign-generate` 401 at identical timestamps).
The guardrail task absorbed into a full repair.

## Root cause

`generate-anonymous-brief` delegated generation to the **user-gated** `donny-campaign-generate`,
calling it server-to-server with the **service-role key** as bearer. `donny-campaign-generate`
authenticates only a real user JWT or a Donny OAuth token, so it 401'd before parsing the body →
the proxy returned 500. (Also forwarded `{url}` where the generator wants `{source_url}`/`source_type`,
but auth failed first.) **Lesson:** a service-role bearer does NOT authenticate to a function that
gates on `auth.getUser()` — an anonymous flow can't borrow a user-gated function.

## Fix — self-contained + Layered-v1 + thin-page signal

`generate-anonymous-brief` is now self-contained (it already owned the IP rate-limit + record save;
it just shouldn't delegate). `donny-campaign-generate` is **untouched** (zero blast radius on the
logged-in flow).

- **Generation:** own fetch+extract → one **hardcoded Haiku** call (`claude-haiku-4-5-20251001`,
  `max_tokens 768`) via `_shared/anthropic-fetch`. NOT `getModelConfig` — it has no
  `generate-anonymous-brief` routing entry and falls through to **Sonnet/4096**, defeating the cost
  control (a Codex/spec-review catch).
- **Error contract:** every handled outcome returns **HTTP 200** with an `error` discriminator
  (`rate_limited` | `capacity` | `fetch_failed` | `generation_failed`). Reason: `supabase.functions.invoke`
  exposes the body only on 2xx, so the previous **429** `rate_limited` path was dead in the UI.
- **Layered-v1 abuse hardening** (founder-chosen level; Turnstile deferred):
  - **Global daily cap** 150 (best-effort, fail-closed on count error) — the real cost ceiling,
    bounded by Haiku's sub-cent cost even under a non-atomic burst.
  - **Per-IP/day** 1 — best-effort over an empirically-chosen client-IP header
    (cf-connecting-ip → x-real-ip → first XFF), normalized to a valid `inet` or skipped.
  - **Honeypot** (`subject_hp`, off-screen hardened field) → benign 200 no-op.
  - **Hardened SSRF guard** (`lib.isBlockedTarget`): http(s) only; numeric/hex/octal host encodings;
    IPv4 private/loopback/link-local; IPv6 ULA/link-local/mapped; internal hostnames; `redirect:"manual"`
    + per-hop re-validation. DNS-rebinding is a documented residual (no DNS resolution in the edge runtime).
- **Thin-page signal:** `source_quality {readable, chars}` on the response → the preview shows a gentle
  "couldn't pull much from that page — try your homepage/menu" note (the brief still generates).

## Two Codex P1s caught + fixed (real bypasses)

1. **Trailing-dot FQDN** (`http://metadata.google.internal./`) — `URL.hostname` keeps the dot, so the
   exact/`endsWith` denylist (and the numeric check) missed it → SSRF bypass. Fix: strip trailing dots
   before the guard.
2. **Malformed IPv6 cap bypass** — a spoofed `cf-connecting-ip: :` passed the loose `isValidInet`, then
   errored as a Postgres `inet` on the per-IP query AND the success insert → **no row saved** → bypassed
   BOTH the per-IP limit and the global-cap accounting (unlimited Haiku spend). Fix: strict IPv6
   validation → bad value becomes `null` → null-IP row still saves → cap holds.

## Files

- `supabase/functions/generate-anonymous-brief/index.ts` — rewritten (self-contained).
- `supabase/functions/generate-anonymous-brief/lib.ts` — pure helpers (extractClientIp, isValidInet,
  isBlockedTarget, extractContent, computeSourceQuality, parseBrief, isHoneypotTripped).
- `supabase/functions/generate-anonymous-brief/lib.test.ts` — 28 vitest cases.
- `src/components/landing/BriefGeneratorPreview.tsx` — honeypot field, error discriminators, thin-page note.
- No change to `donny-campaign-generate` or `_shared/model-routing.ts`.

## Verification

- lib tests 28/28; typecheck + build green; **Codex clean** after the two P1 fixes.
- Deployed via Supabase CLI (`verify_jwt=true` preserved). Live curl on prod:
  valid URL → 200 brief; `169.254.169.254` & `metadata.google.internal.` → 400; honeypot → 200 no-op;
  second call same IP → 200 rate_limited (per-IP detection works).
- Spec passed an independent spec-review (6 issues fixed, then Approved) before implementation.

## Deferred

Cloudflare Turnstile; atomic/short-window global counter; per-call cost logging (needs a sentinel user);
DNS-rebinding-proof SSRF; sharing the generation core with `donny-campaign-generate`.
