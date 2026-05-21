# Core Documentation Refresh — Design Spec

> **Date:** 2026-05-20
> **Author:** Dame Williams + Claude Code
> **Status:** Draft

## Context

DragonCandy's core documentation files have drifted from reality over months of active development. Codebase metrics are wrong (42 edge functions documented vs. 67 actual), timelines reference "next month" without dates, 30+ database tables are undocumented, the provider hierarchy in CLAUDE.md doesn't match App.tsx, and ~45 docs in `docs/` contain significant overlap and duplication.

This creates four problems:
1. **Launch prep** — docs can't be trusted during launch decisions
2. **Investor/partner readiness** — docs tell an inaccurate story
3. **Onboarding** — new team members and Claude Code sessions get stale context
4. **Daily development** — bad context leads to bad decisions and wasted work

The launch date has shifted (no firm date — blocked on content delivery system bugs). TheCirqle and OpenClaw references are no longer relevant. Completed audits and improvement plans are cluttering the active docs folder.

## Approach

**Update + Consolidate + Archive (Approach B):**
1. Update the four core docs with accurate data from the codebase
2. Consolidate overlapping strategy/pricing/improvement docs into single sources of truth
3. Archive completed audit and improvement docs to `docs/archive/`

End state: ~22 active markdown docs (down from ~33 markdown + ~16 binary/non-markdown), each with a clear non-overlapping purpose. Binary files (PDFs, DOCX, HTML, JSON) remain in place untouched.

---

## Part 1: Core Doc Updates

### 1.1 CLAUDE.md

**Provider Hierarchy** — Replace current hierarchy with actual App.tsx structure:
```
ErrorBoundary → ThemeProvider → QueryClientProvider → LazyMotion → AuthProvider
  → AnalyticsProvider
    ├─ ErrorBoundary (widget) → PerformanceMonitor  (isolated sibling)
    └─ TooltipProvider
        ├─ Toaster + Sonner  (toast notifications)
        └─ BrowserRouter → AppLayout
            → DonnyProviderWithAuth (non-public pages only)
            → AuthenticatedShell (global inactivity timeout)
            → SiteGateGuard → AnimatedRoutes → DonnyDesktopPanel + HelpBriefDrawer
```

**Tech Stack** — Update to:
- Add: Framer Motion (lazy-loaded), Outstand.so (social media integration), Google Maps (geocoding)
- Update: "67 deployable edge functions" (was ~60; `supabase/functions/` has 68 dirs but `_shared/` is a utility dir, not a function)
- Remove: "GPT-4o tasks migrating to Claude" (migration complete)
- Clarify: Anthropic API is backend-only via edge functions (not frontend SDK)

**Key Modules** — Add:
- Outstand integration: `src/integrations/outstand/Provider.tsx`, 17 hooks in `src/hooks/outstand/`
- Auth system: app-level loading guard, 3-hour global inactivity timeout via `AuthenticatedShell` (defined inline in `src/App.tsx`)

**Key Documents list** — Update to reflect consolidated doc structure (remove references to archived files, add any new key docs).

Source files:
- `src/App.tsx` (provider hierarchy)
- `package.json` (dependencies)
- `supabase/functions/` (edge function count)
- `src/integrations/outstand/` (Outstand integration)
- `src/App.tsx` (AuthenticatedShell is defined inline here)

### 1.2 PROJECT_CONTEXT.md

**Section 4 (Current State):**
- Metrics: "59 pages, 162 hooks, 67 edge functions" with "As of 2026-05-20" date stamp
- Launch: Replace "Production launch targeted next month" with "Production launch date TBD — blocked on content delivery system stability and bug resolution"
- Users/revenue: Keep "Pre-revenue" but add date context
- Operating cost: Verify or update ~$295/mo figure

**Section 5 (Active Workstreams):**
- Replace stale "9-prompt Claude Code sequence" with current focus areas:
  - Content delivery system stabilization
  - Auth session management (app-level guard, inactivity timeout)
  - Outstand social media integration (phases 1-3 complete, phase 4 in scope)
  - Dashboard UX polish (pill badges, avatar caching, status sync)
  - RLS compliance and query optimization
- Remove "Social media auto-posting integration playbook staged" (replaced by Outstand integration)
- Update workflow discipline to reflect current single-agent pattern

**Section 6 (On the Horizon):**
- Replace "Production launch (next month)" with "Production launch (date TBD)"
- Remove TheCirqle reference
- Remove OpenClaw multi-agent references (or mark as "deferred indefinitely")
- Update social API status (Outstand handles Instagram/TikTok/YouTube)
- Keep Toast partnership, trademark, patent items — update timelines if needed

**Section 7 (Key Principles):**
- Remove "Parallel agents = merge conflict risk during launch week" (OpenClaw deferred)
- Keep all other principles (they're still valid)

**Section 10 (Stack & Resources):**
- Add: Outstand.so (social media integration), Google Maps API
- Remove: "OpenAI embeddings (RAG for Donny)" if no longer used (verify)
- Remove: "OpenClaw (WSL-based, self-hosted agent gateway)" or mark deferred
- Update key documents list to match consolidated structure
- Remove phantom references: `dragoncandy-prelaunch-fixes.md` and `DragonCandy_GTM_Capital_CAC_Playbook.md` (neither file exists in the repo)

Source files:
- `src/pages/` directory (page count)
- `src/hooks/` directory (hook count)
- `supabase/functions/` directory (function count)
- Recent git log (active workstreams)
- `.claude/handoffs/` (latest state)

### 1.3 DESIGN_SYSTEM.md

**Minor updates only:**
- Add note in Design Rules: "Opacity variants (e.g., `bg-dc-teal/12`, `bg-dc-pink/50`) are permitted for layering and hover states"
- Verify all color hex values still match `tailwind.config.ts` (spot-check confirmed they do)

Source: `tailwind.config.ts`

### 1.4 DATABASE_SCHEMA.md

**Add new sections for undocumented tables:**

**Donny AI** (~10 tables):
| Table | Purpose |
|-------|---------|
| `donny_actions` | Tracked Donny AI actions and their outcomes |
| `donny_conversations` | Donny AI conversation threads |
| `donny_messages` | Individual messages in Donny conversations |
| `donny_help_logs` | Help requests and resolutions via Donny |
| `donny_knowledge` | Donny's knowledge base entries |
| `donny_nudges` | Proactive nudge definitions and delivery tracking |
| `donny_tool_executions` | Tool call logs from Donny orchestrator |
| `donny_oauth_clients` | OAuth client registrations for Donny API |
| `donny_oauth_codes` | OAuth authorization codes |
| `donny_oauth_tokens` | OAuth access/refresh tokens |
| `donny_campaign_previews` | Donny AI campaign preview data |

**DragonShare** (~5 tables):
| Table | Purpose |
|-------|---------|
| `dragonshare_boosts` | Content boost campaigns |
| `dragonshare_engagement` | Engagement tracking on shared content |
| `dragonshare_events` | DragonShare lifecycle events |
| `dragonshare_payouts` | Creator payouts from DragonShare |
| `dragonshare_posts` | Shared content posts |

**Payments & Revenue** (~3 tables):
| Table | Purpose |
|-------|---------|
| `payment_events` | Payment lifecycle events (ledger) |
| `stripe_webhook_events` | Raw Stripe webhook event log |
| `rush_surcharge_log` | DragonDash rush surcharge records |

**Campaign Extensions** (~5 tables):
| Table | Purpose |
|-------|---------|
| `campaign_brief_generations` | AI-generated campaign briefs |
| `campaign_media` | Media assets attached to campaigns |
| `campaign_social_hooks` | Social media hooks for campaigns |
| `campaign_deliverables` | Deliverable specifications and tracking |
| `campaign_templates` | Reusable campaign templates |

**Organizations** (~3 tables):
| Table | Purpose |
|-------|---------|
| `organizations` | Parent organization entities |
| `org_units` | Organizational units (locations/divisions) |
| `org_members` | Organization membership records |

**Account Management** (~2 tables):
| Table | Purpose |
|-------|---------|
| `account_deletion_requests` | User account deletion requests (GDPR) |
| `force_gdpr_erasure` | Forced data erasure records |

**Additional tables** to verify and document:
- `business_outstand_accounts`, `business_contexts`
- `creator_automation_preferences`
- `delegated_posting_permissions`
- `help_articles`, `help_article_feedback`
- `pricing_funnel_events`
- `brand_shortlists`
- `triple_post_sessions`, `social_post_log`

Source: `src/integrations/supabase/types.ts`

---

## Part 2: Strategy Doc Consolidation

### 2.1 Pricing Consolidation (3 → 1 primary)

**Keep as source of truth:** `docs/STRIPE_PRICES.md`
- Expand to include: tier definitions, take rates, seat limits, AI credit budgets, delivery premiums, rush surcharges
- All values pulled from implementation (see pricing data in design conversation)

**Update:** `docs/DragonCandy_Pricing_Profitability_Briefing_v2.md`
- Replace inline price values with "See STRIPE_PRICES.md for current pricing"
- Keep strategy/projection content (unique)

**Archive:** `Plan.md` (root) → `docs/archive/Plan.md`
- Pricing migration plan — work is completed

### 2.2 Strategy Consolidation (3 → 2)

**Keep + update:** `docs/DragonCandy_Strategy_Briefing.md`
- Remove TheCirqle/OpenClaw references
- Merge unique content from `DragonCandy_Path_to_Multi-million_annual_profit.md`
- Fix stale facts

**Archive:** `docs/DragonCandy_Path_to_Multi-million_annual_profit.md` → `docs/archive/`
- Content is a subset of Strategy Briefing + Pricing v2

**Keep + update:** `docs/DragonCandy_Moat_Playbook.md`
- Update stale timelines to absolute dates
- Remove TheCirqle/OpenClaw references

### 2.3 Improvement Plans (3 → archive)

All three are mostly completed:
- `docs/dragoncandy-improvement-plan.md` → `docs/archive/`
- `docs/creator-brand-improvement-plan.md` → `docs/archive/`
- `docs/runbooks/DragonCandy_V2_Improvement_Playbook.md` → `docs/archive/`

### 2.4 Audits (8 → archive)

All findings mostly acted on:
- `docs/audit-part-a-repo.md` → `docs/archive/`
- `docs/audit-part-b-browser.md` → `docs/archive/`
- `docs/audit-part-c-supabase.md` → `docs/archive/`
- `docs/prompt-delivery-payment-audit.md` → `docs/archive/`
- `docs/delivery-payment-audit-brand.md` → `docs/archive/`
- `docs/delivery-payment-audit-business.md` → `docs/archive/`
- `docs/visual-pages-audit-report.md` → `docs/archive/`
- `docs/prompts-visual-pages-crash-fix.md` → `docs/archive/`
- `docs/Creator_Brand_Improvement_Briefing.md` → `docs/archive/`

### 2.5 Design System Dedup

**Update:** `docs/prd.md`
- Replace its design system section (color tables, typography, button specs) with: "See docs/DESIGN_SYSTEM.md for design tokens and component patterns"
- Keep all other PRD content (user flows, feature specs, etc.)

### 2.6 Remaining Updates

**Update stale facts in these files (keep in place):**
- `docs/product-vision.md` — remove TheCirqle/OpenClaw refs, fix stale metrics
- `docs/product-roadmap.md` — update completion status of tasks
- `docs/DragonCandy_Engineering_Blueprint.md` — remove TheCirqle translation section, OpenClaw refs
- `docs/DragonCandy_Infrastructure_Capacity_Report.md` — verify metrics
- `docs/content-delivery-system-flows.md` — verify against current implementation
- `docs/Content_Delivery_Social_Posting_System.md` — update with Outstand integration status

**Keep as-is (no changes needed):**
- `docs/gtm.md`
- `docs/dragoncandy-launch-partner-brief.md`
- `docs/roadmap-promotions-v2.md`
- `docs/STRIPE_PRICES.md` (after expansion)
- `docs/donny-ai-audit.txt` (empty — delete or archive)

---

## Part 3: End State

### Active docs (~22):

**Core (auto-loaded by CLAUDE.md):**
1. `CLAUDE.md` — developer guidance
2. `docs/PROJECT_CONTEXT.md` — project state & operating instructions
3. `docs/DESIGN_SYSTEM.md` — design tokens & patterns
4. `docs/DATABASE_SCHEMA.md` — complete schema reference

**Strategy & Business:**
5. `docs/product-vision.md` — vision, mission, values
6. `docs/DragonCandy_Strategy_Briefing.md` — competitive strategy + profitability path
7. `docs/DragonCandy_Moat_Playbook.md` — competitive defensibility
8. `docs/DragonCandy_Pricing_Profitability_Briefing_v2.md` — financial projections & strategy
9. `docs/DragonCandy_Infrastructure_Capacity_Report.md` — scaling roadmap

**Product & Technical:**
10. `docs/prd.md` — product requirements
11. `docs/product-roadmap.md` — phased roadmap
12. `docs/STRIPE_PRICES.md` — pricing source of truth
13. `docs/content-delivery-system-flows.md` — state machines & flows
14. `docs/Content_Delivery_Social_Posting_System.md` — social posting flow

**Operations:**
15. `docs/gtm.md` — go-to-market strategy
16. `docs/dragoncandy-launch-partner-brief.md` — partner brief
17. `docs/roadmap-promotions-v2.md` — promotions feature roadmap
18. `docs/DragonCandy_Engineering_Blueprint.md` — build guidance
19. `docs/DragonCandy_Org_Staffing_Plan.html` — org chart

**Runbooks:**
20. `docs/runbooks/dragoncandy-launch-improvement-playbook.md`
21. `docs/runbooks/prompt-visual-pages-crash-fix-playbook.md`
22. `docs/runbooks/toast.md`

### Archived (~15 files in `docs/archive/`):
All completed audits, improvement plans, and superseded pricing docs.

### Binary/non-markdown files (out of scope for content updates, keep in place):
- `docs/DragonCandy_Pricing_Profitability_Briefing.pdf`
- `docs/DragonCandy_x_Outstand-so_Social_Media_Integration_Strategy.pdf`
- `docs/Ally_report.pdf`
- `docs/DragonCandy_Strategy_Mindmap.json`
- `docs/DragonCandy_Org_Staffing_Plan.html`
- `docs/code-architecture-audit.docx`, `realtime-edge-cases-audit.docx`, `security-audit.docx`, `seo-audit.docx`
- `docs/connect-toast.mdx`
- `docs/lighthouse-*/`, `docs/pdf/`, `docs/help-screenshots/` directories

These files are not updated as part of this spec. They remain in their current locations.

---

## Verification Plan

1. **Per-file verification**: After each doc update, diff against source files to confirm accuracy
2. **Build check**: `npm run build` after all changes to ensure nothing breaks
3. **Cross-reference check**: Verify no active doc references an archived file
4. **CLAUDE.md import check**: Confirm `@docs/...` imports still resolve
5. **Pricing consistency**: Verify all remaining docs that mention prices reference STRIPE_PRICES.md or match implementation values
6. **No-gray check**: Confirm no updates introduce gray backgrounds/badges (per design constraint)

## Execution Order

1. Create `docs/archive/` directory
2. Update core docs: CLAUDE.md → PROJECT_CONTEXT.md → DATABASE_SCHEMA.md → DESIGN_SYSTEM.md
3. Expand STRIPE_PRICES.md with full pricing data
4. Update strategy docs (remove stale references, merge Path_to_Multi_million into Strategy_Briefing)
5. Update PRD.md (replace design system duplication with reference)
6. Update remaining docs (product-vision, product-roadmap, Engineering Blueprint, etc.)
7. Archive completed docs
8. Cross-reference verification pass
9. Final `npm run build`
