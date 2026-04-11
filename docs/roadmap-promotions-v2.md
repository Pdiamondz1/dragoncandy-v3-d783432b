# Promotions v2 — Toast Integration Roadmap

**Reference:** Toast API overview — https://doc.toasttab.com/doc/devguide/apiOverview.html
**Target launch:** Production, next week. **Workflow:** Claude Code CLI @ `C:/GIT/dragoncandy/`.

## Build Philosophy
- One task = one commit. `npm run build` green between each.
- `git pull origin main --rebase` before every session.
- Preserve all `lg:` Tailwind classes — mobile-only changes allowed.
- No new dependencies without explicit approval.
- Ledger-first for any Toast state mutation.
- Audit-before-change gate on Phase 0 is non-negotiable.

## Toast Access Tier Risk (read before Phase 2)
Toast classifies APIs by integration type (partner, custom, standard, analytics). Discount **writes** (`POST /config/v2/discounts`) generally require partner or custom tier. v1 will ship with:
- **Standard access** for `config` (menu reads) and `orders` (redemption webhook reads).
- **Fallback for discount push:** if partner tier is not yet approved, sync is **one-way read-only** from Toast and DragonCandy continues to own discount code generation internally. Phase 3 has a branch point for this.

---

## Phase 0 — Audit Gate (read-only)
- [x] **TASK-001** — Audit existing Promotions feature for Toast collision points
  Files: `src/features/promotions/**`, `supabase/migrations/**`
  Notes: Output `audit-promotions-v2.md`. STOP if the prior Promotions audit prompt is mid-flight. Confirm shapes of `promotion_redemptions`, `promotion_submissions`. Confirm current Toast tier status with Dame.

## Phase 1 — Ledger & Schema Foundation
- [x] **TASK-002** — `toast_connections` table with pgsodium encryption + RLS
  Files: `supabase/migrations/20260412_toast_connections.sql`
- [x] **TASK-003** — `toast_sync_events` ledger table + unique index on `toast_event_guid`
  Files: `supabase/migrations/20260412_toast_sync_events.sql`
- [x] **TASK-004** — Extend `promotion_submissions` with `social_handles jsonb DEFAULT '{}'`
  Files: `supabase/migrations/20260412_social_handles.sql`
- [x] **TASK-005** — Toast read-model views: menu_performance, traffic_patterns, redemption_history
  Files: `supabase/migrations/20260412_toast_views.sql`

## Phase 2 — Toast OAuth & Token Refresh
- [x] **TASK-006** — Edge Function `toast-oauth-start` (signed state cookie)
  Files: `supabase/functions/toast-oauth-start/index.ts`
- [x] **TASK-007** — Edge Function `toast-oauth-callback` (exchange, encrypt, persist)
  Files: `supabase/functions/toast-oauth-callback/index.ts`
- [x] **TASK-008** — Edge Function `toast-token-refresh` + pg_cron every 30min
  Files: `supabase/functions/toast-token-refresh/index.ts`, `supabase/migrations/20260412_cron.sql`
- [x] **TASK-009** — Restaurant Settings: "Connect Toast" card with status pill
  Files: `src/features/settings/ToastConnectionCard.tsx`

## Phase 3 — Discount Sync (branch on tier)
- [x] **TASK-010** — Edge Function `toast-discount-push` (ledger-first) — **GATED on partner tier**
  Files: `supabase/functions/toast-discount-push/index.ts`
  Notes: If standard-only at launch, stub this function to log intent and skip the Toast call. Ship internal code generation as before.
- [x] **TASK-011** — Hook promotion publish/edit/end to `toast-discount-push`
  Files: `src/features/promotions/hooks/usePromotionMutations.ts`
- [ ] **TASK-012** — Sync status badge (Synced / Pending / Failed / Tier-Unavailable)
  Files: `src/features/promotions/components/SyncStatusBadge.tsx`

## Phase 4 — Inbound Redemption Webhook
- [ ] **TASK-013** — Edge Function `toast-redemption-webhook` with HMAC verification
  Files: `supabase/functions/toast-redemption-webhook/index.ts`
  Notes: Reject unsigned. Idempotent via `toast_event_guid`. Ledger write before `promotion_redemptions` update.
- [ ] **TASK-014** — Redemption counter + sparkline on Promotion detail
  Files: `src/features/promotions/components/RedemptionMetrics.tsx`

## Phase 5 — Social Handle Capture
- [ ] **TASK-015** — 5 optional handle fields on submission form (IG, TikTok, FB, X, YouTube)
  Files: `src/features/promotions/submission/SubmissionForm.tsx`
- [ ] **TASK-016** — Stub `validateHandle(platform, handle)` returning `{valid:true}`
  Files: `src/lib/social/validateHandle.ts`
- [ ] **TASK-017** — Display handles in restaurant submission review panel
  Files: `src/features/promotions/review/SubmissionRow.tsx`

## Phase 6 — Donny Toast Intelligence
- [ ] **TASK-018** — Edge Function `donny-toast-context` aggregating 3 views
  Files: `supabase/functions/donny-toast-context/index.ts`
- [ ] **TASK-019** — Register `get_toast_insights` tool in Donny + system prompt update
  Files: `supabase/functions/donny-chat/tools.ts`, `supabase/functions/donny-chat/system-prompt.ts`
- [ ] **TASK-020** — "Ask Donny for campaign ideas" CTA on Promotions index
  Files: `src/features/promotions/components/DonnyCampaignCTA.tsx`

## Phase 7 — How-To Briefs (MDX)
- [ ] **TASK-021** — `/help/promotions/$slug` route + MDX loader
  Files: `src/routes/help/promotions/$slug.tsx`, `vite.config.ts`
- [ ] **TASK-022** — Author 5 MDX briefs
  Files: `src/content/help/promotions/{connect-toast,create-promotion,customer-flow,read-donny-insights,troubleshooting}.mdx`
- [ ] **TASK-023** — "?" tooltips on Promotions UI deep-linking to briefs
  Files: `src/features/promotions/components/HelpTooltip.tsx`
- [ ] **TASK-024** — Donny deep-link handler for `open help: <slug>`
  Files: `src/features/donny/deepLinks.ts`

## Phase 8 — Global Donny Dock
- [ ] **TASK-025** — `DonnyDock.tsx` floating chat icon, portal-rendered
  Files: `src/components/DonnyDock.tsx`
  Notes: `fixed bottom-4 right-4 z-50`. Mobile 56px, desktop `lg:w-14 lg:h-14`. Teal pulse, pink hover.
- [ ] **TASK-026** — Mount `DonnyDock` in root layout; hide on `/auth/*`
  Files: `src/App.tsx`

## Phase 9 — Pre-Launch Hardening
- [ ] **TASK-027** — E2E: connect Toast → publish → simulated webhook → redemption count
  Files: `tests/e2e/toast-integration.spec.ts`
- [ ] **TASK-028** — Mobile + desktop QA on Lovable preview; `lg:` screenshot baselines
  Files: `qa-promotions-v2.md`
- [ ] **TASK-029** — Runbook: token rotation, webhook replay, disconnect flow
  Files: `docs/runbooks/toast.md`

---

## Agent Session Guide
Each session: (1) `git pull --rebase`, (2) read this file, (3) execute the next unchecked task only, (4) `npm run build`, (5) commit with message `TASK-NNN: <desc>`, (6) mark `- [x]`, (7) push, (8) verify on Lovable preview, (9) stop.
