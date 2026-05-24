---
title: Donny Audit Phase 2 Session
type: source
created: 2026-05-06
updated: 2026-05-24
sources: [raw/sessions/2026-05-06-190856-donny-audit-phase2.md]
tags: [donny, streaming, quota, sse]
---

# Donny Audit Phase 2 Session

Session from 2026-05-06 (19:08) covering Donny AI quota enforcement and
SSE streaming implementation. Added `checkQuotaOrBlock` to enforce
monthly action budgets, applied quota checks in both the orchestrator
and chat edge functions, implemented SSE response format for streaming
Donny responses to the frontend, and built frontend streaming support
with retry logic and upgrade CTAs when quota is exhausted.

## Key Decisions

- Implemented quota enforcement at the edge function layer (not
  client-side) via `checkQuotaOrBlock`, which queries the
  `donny_actions` table for the current month's usage count and
  compares against the tier's budget. This prevents bypass.
- Used SSE wrapping (Server-Sent Events with discrete event messages)
  rather than true progressive token streaming, because the current
  Anthropic API integration returns complete responses and the SSE
  format provides chunked delivery with built-in retry semantics.
- Supported dual auth paths: primary session-based auth for the web app,
  with OAuth token fallback for API consumers using Donny's OAuth
  client registration system.

## Patterns Discovered

- SSE wrapping (sending complete logical chunks as SSE events) is
  simpler than progressive streaming when the upstream API returns
  complete responses. It still provides perceived responsiveness via
  chunked delivery.
- Dual auth (session + OAuth fallback) requires checking both paths in
  sequence and normalizing the user identity before proceeding to
  authorization — the edge function extracts the user from whichever
  auth method succeeds first.
- Context pass-through for DonnyProvider ensures conversation state
  persists across route navigation without re-fetching, using React
  context rather than URL state.
- Quota exhaustion should show an upgrade CTA (not just an error) to
  convert the friction into a revenue opportunity.

## See Also

- [[Donny AI]]
- [[Pricing Architecture]]
