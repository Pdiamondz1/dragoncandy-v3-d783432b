# DragonCandy Content Delivery System — End-to-End Audit Rubric

Grade the agent's work across 5 stages. Each stage scores 0–20 points (total 100).
A score of 0 for the entire rubric if `npm run build` or `npm run typecheck` fails.
A score of 0 for the entire rubric if changes are batched into a single PR instead of one PR per fix.

---

## STAGE 1 — Campaign Launch (20 pts)

Trace: Restaurant creates campaign via wizard → publishes → notifications sent.

Key files:
- `src/hooks/useBrandCampaignWizard.ts`
- `src/hooks/useCampaignMutations.ts`
- `src/components/brand-campaigns/BrandCampaignBriefStep.tsx`
- `src/components/brand-campaigns/BrandCampaignDetailsStep.tsx`
- `src/components/brand-campaigns/BrandCampaignReviewStep.tsx`

### Criteria

- **[10 pts] Campaign wizard sets `pricing_type` explicitly.**
  The wizard must set `pricing_type` ('fixed' or 'bid_range') on the campaign record based on user input. Currently implicit — the wizard collects budget range but doesn't guide the pricing_type choice.

- **[5 pts] Duplicate campaign preserves deliverables and media.**
  `useDuplicateCampaign()` in `useCampaignMutations.ts` copies the campaign row but not `campaign_deliverables` or `campaign_media` records. The duplicate should carry over associated deliverable specs and media assets.

- **[5 pts] Email notification batched (not N+1).**
  Lines 84–162 in `useCampaignMutations.ts` fire individual notifications per user on campaign publish. Refactor to use a single batch notification edge function or queue.

---

## STAGE 2 — Creator Invite / Apply (20 pts)

Trace: Business invites creator OR creator discovers campaign and applies.

Key files:
- `src/hooks/useCampaignInvitations.ts`
- `supabase/functions/send-campaign-invitation/index.ts`
- `src/hooks/useCreateApplication.ts`
- `src/components/campaigns/CampaignApplyForm.tsx`
- `src/components/campaigns/OneTapApplySheet.tsx`

### Criteria

- **[8 pts] Invitation duplicate check uses row-level lock or upsert.**
  Lines 100–114 in `send-campaign-invitation/index.ts` check for existing pending invitations without locking. Two simultaneous invites can bypass deduplication. Fix with `INSERT ... ON CONFLICT DO NOTHING` or `SELECT ... FOR UPDATE`.

- **[4 pts] Invitations have `expires_at` with configurable TTL.**
  The `campaign_invitations` table has no expiration mechanism. Add an `expires_at` column (nullable, default 7 days from creation). Update queries to filter out expired invitations.

- **[4 pts] Creator can re-apply after rejection (status-aware unique constraint).**
  `useCreateApplication.ts` lines 56–61 fail if an application already exists (unique constraint on campaign_id + creator_id). After rejection, the creator should be able to submit a new application. Use a partial unique index excluding 'rejected' status, or soft-delete rejected applications.

- **[4 pts] Application + invitation status sync is atomic.**
  When a creator applies via an invitation, the application insert and invitation status update must happen in a single transaction. Currently they are separate operations that can partially fail.

---

## STAGE 3 — Pricing / Counter-Offer / Acceptance (20 pts)

Trace: Fixed rate or counter-offer negotiation → acceptance → collaboration creation → escrow payment.

Key files:
- `src/hooks/useCounterOffers.ts`
- `src/hooks/useManageApplication.ts`
- `src/components/campaigns/CounterOfferModal.tsx`
- `src/components/campaigns/CounterOfferThread.tsx`
- `src/components/campaigns/ApplicationCard.tsx`
- `supabase/functions/create-campaign-escrow/index.ts`

### Criteria

- **[6 pts] Counter-offer supersession uses SELECT FOR UPDATE or atomic CTE.**
  Lines 71–76 in `useCounterOffers.ts` update old offers to 'declined' AFTER the new one is inserted. Two simultaneous counters from the same party can both remain pending. Wrap in a Postgres function with row-level locking.

- **[6 pts] Escrow → campaign.active transition is atomic (no split state).**
  Lines 96–109 in `useManageApplication.ts` create the collaboration then separately check escrow status. If escrow status changes between these operations, a collaboration exists but the campaign isn't activated. These operations must be atomic — use a Postgres function or edge function that handles both in a transaction.

- **[4 pts] `agreed_rate` column persisted on application after negotiation.**
  Currently the system uses `application.proposed_rate` as the agreed rate, conflating the creator's initial ask with the final agreement. Add an `agreed_rate` column to `campaign_applications` and set it when a counter-offer is accepted.

- **[4 pts] Other pending applications auto-declined when collaboration created.**
  When a business accepts an application and creates a collaboration, other pending applications for the same campaign are not automatically declined. They should be set to 'rejected' with an auto-generated reason.

---

## STAGE 4 — Content Delivery / Approval / Payment (20 pts)

Trace: Creator uploads content → business reviews → approve/reject → payment release.

Key files:
- `src/hooks/useProjectFileUpload.ts`
- `src/components/campaigns/detail/ContentReviewSection.tsx`
- `supabase/functions/release-creator-payout/index.ts`
- `supabase/functions/auto-approve-content/index.ts`
- `supabase/functions/reject-content/index.ts`
- `src/hooks/useProjectComplete.ts`
- `supabase/functions/_shared/payment-events.ts`
- `supabase/functions/_shared/platform-fee.ts`

### Criteria

- **[6 pts] Payment event write throws on failure (not fire-and-forget).**
  `_shared/payment-events.ts` lines 20–34 log but don't throw on insert failure. The `writePaymentEvent()` function must throw if the ledger write fails — the payment should not proceed without an audit trail.

- **[6 pts] Platform fee uses org take rate from spec (not hardcoded 5%).**
  `_shared/platform-fee.ts` has `PLATFORM_FEE_RATE = 0.05` but the spec says 15–20%. The `getOrgTakeRate()` function exists but may not be used consistently. Verify all edge functions that calculate fees use `getOrgTakeRate()` and that the default rate aligns with the take-rate ladder in `docs/STRIPE_PRICES.md`.

- **[4 pts] Auto-approve cron handles edge cases (already approved, disputed).**
  `auto-approve-content/index.ts` should skip collaborations that are already approved, auto_approved, rejected, or disputed. Verify the query filter is correct and handles concurrent approval (business approves while cron runs).

- **[4 pts] Dual-completion handshake handles concurrent completion attempts.**
  `useProjectComplete.ts` allows both parties to mark completion. If both click simultaneously, the payout could be triggered twice. Add idempotency — check if payout was already released before invoking `release-creator-payout`.

---

## STAGE 5 — Social Posting via Outstand (20 pts)

Trace: Content approved → auto-draft social posts → schedule → publish via Outstand.

Key files:
- `supabase/functions/fire-campaign-social-hook/index.ts`
- `src/hooks/useDraftPosts.ts`
- `src/hooks/outstand/useTriplePostState.ts`
- `src/hooks/outstand/useDelegatedPermissions.ts`
- `src/hooks/outstand/useCrossPost.ts`
- `supabase/functions/outstand-proxy/index.ts`
- `src/components/outstand/TriplePostOrchestrator.tsx`

### Criteria

- **[6 pts] Social hook invocation has retry logic (not fire-and-forget).**
  `ContentReviewSection.tsx` lines 108–115 invoke `fire-campaign-social-hook` with no error handling or retry. If the network call fails, social posts are never auto-drafted. Add try/catch with at least one retry attempt, and log the failure so it can be addressed manually.

- **[6 pts] Triple-post session triggers action when all parties post.**
  `triple_post_sessions` status is currently purely informational — no logic fires when all parties complete their posts. Add a check (either in `useTriplePostState` or a database trigger) that detects when all non-null party statuses are 'posted' and marks the session as completed.

- **[4 pts] Draft-to-scheduled flow validates Outstand account is connected.**
  `useDraftPosts.scheduleDraft()` should verify the user has an active Outstand account linked (`business_outstand_accounts`) before attempting to schedule. Show a clear error message if the account is disconnected or expired.

- **[4 pts] Fallback handling if Outstand API is unavailable.**
  `fire-campaign-social-hook/index.ts` calls Outstand via the proxy. If Outstand is down, the auto-draft should still create a local draft record (without Outstand-specific scheduling) and notify the user to manually schedule once Outstand is available.

---

## EXISTING AUDIT P0 BUGS (Must also be addressed)

These are from `docs/archive/delivery-payment-audit-business.md` and may already be fixed. The agent must verify each and fix any that remain open:

| ID | Issue | Location |
|---|---|---|
| P0-1 | Campaign-deliverables bucket `public: true` — bypasses RLS | Storage migration |
| P0-2 | No content REJECT path — business can only approve or revise | `ContentApprovalPanel.tsx` / `reject-content` edge function |
| P0-3 | No in-app refund flow — business cannot request refund | Missing edge function |
| P1-1 | No auto-approval timer (may be built now — verify `auto-approve-content`) | Edge function |
| P1-2 | Revision limit client-side only (MAX_REVISIONS=2) | `ContentApprovalPanel.tsx` |
| P1-4 | No confirmation dialog on "Approve & Release Payment" | `ContentReviewSection.tsx` |
| P1-5 | Ledger write is AFTER Stripe transfer, not before | `release-creator-payout/index.ts` |
| P1-7 | Inconsistent Stripe API versions across edge functions | Multiple edge functions |

For each existing bug: verify current state, fix if still open, note as "already fixed" if resolved.

---

## BUILD & PR GATES

- **BUILD GATE:** `npm run build` and `npm run typecheck` must pass after all changes. Score = 0 if either fails.
- **PR GATE:** Each fix must be a separate, focused PR with the bug number in the title (e.g., "fix(stage-2): invitation duplicate check uses upsert [S2-1]"). Score = 0 if changes are batched into a single PR.
- **CODEBASE RULES:** TypeScript strict mode, no `any` types, no `console.log` (only `.error`/`.warn`), `dc-*` Tailwind tokens only, `.select()` field lists in all Supabase queries, Stripe test mode only, never modify auth logic without confirmation, never drop/rename columns.
