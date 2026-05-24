---
title: Donny Audit Phase 1 Session
type: source
created: 2026-05-06
updated: 2026-05-24
sources: [raw/sessions/2026-05-06-082327-donny-audit-phase1.md]
tags: [donny, security, ai-safety]
---

# Donny Audit Phase 1 Session

Session from 2026-05-06 (08:23) covering security hardening of the
Donny AI system. Implemented role-based tool filtering so each user role
only sees tools relevant to their account type, added prompt injection
defenses via XML-wrapped system instructions, introduced dynamic
max_tokens clamping by subscription tier, added per-tool authorization
checks, improved HelpBriefDrawer accessibility, and ensured logout
clears all Donny-related caches.

## Key Decisions

- Implemented `TOOLS_BY_ROLE` filtering in the orchestrator edge
  function so business clients never see creator-only tools and vice
  versa. This reduces attack surface and prevents confusing tool
  suggestions.
- Wrapped all system prompt content in XML tags as a defense against
  prompt injection — user input that attempts to override instructions
  is structurally separated from system directives.
- Clamped `max_tokens` dynamically based on subscription tier to prevent
  free-tier users from consuming disproportionate API budget. Tier
  mapping aligns with the credit budget table in [[Pricing Architecture]].

## Patterns Discovered

- `TOOLS_BY_ROLE` filtering at the edge function level is simpler and
  more secure than client-side tool filtering, because the client never
  receives tool definitions it should not invoke.
- XML wrapping for system prompts (e.g., `<system>...</system>`) creates
  a structural boundary that makes injection attempts syntactically
  obvious and easier for the model to distinguish from legitimate
  instructions.
- Tier-based token clamping (e.g., Free: 1024, Starter: 2048, Pro: 4096)
  prevents cost spikes without degrading the experience for paying users.
- Logout cache cleanup must include React Query cache, Donny conversation
  state, and any localStorage keys to prevent session bleed.

## See Also

- [[Donny AI]]
- [[Pricing Architecture]]
