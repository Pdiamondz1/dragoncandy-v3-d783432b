# PROMPT — Content Delivery & Payment Flow Audit (Business↔Creator + Brand↔Creator)

**Status:** Pre-launch quality sweep — run after the Promotions audit. This is the highest-stakes area in the entire app: money moves here, and bugs in the delivery↔payment loop create real financial exposure for DragonCandy, the business, and the creator.
**Scope:** Two related flows audited in sequence:
  1. **Section A** — Business/Restaurant ↔ Creator content delivery + payment (1 creator per campaign, hyper-local, includes DragonDash rush)
  2. **Section B** — Brand/Sponsor ↔ Creator content delivery + payment (N creators per campaign, budget pool, usage rights, exclusivity)
**Workflow:** TWO phases. Phase 1 = read-only audit producing a triaged bug report. Phase 2 = fix one item at a time with plan approval per item. `npm run build` between commits. `git pull origin main --rebase` before starting.

---

## Why this audit matters more than the others

The campaign creation, profile, and promotions flows fail in obvious ways — blank screens, missing buttons, broken uploads. The delivery + payment flow can fail in **silent and expensive** ways: a creator gets paid twice, a business gets charged but the funds never escrow, a webhook arrives out of order and the state machine corrupts, a raw asset gets exposed to a creator who never paid for it, a Stripe dispute hits and the platform has no audit trail to defend itself. None of those bugs cause a blank screen — they cause refund requests, chargebacks, and trust loss right at launch.

Treat every Stripe call, every state transition, and every webhook handler as a potential financial bug until proven otherwise.

## Spec reference — what the docs say "should" exist

From the Engineering Blueprint (Steps 8A/8B/8C) and the V2 playbook, the intended end-state for delivery + payment is:

- **Step 8A** — Donny AI visual preview with delivery-tier guardrails (already covered in earlier prompts)
- **Step 8B** — Delivery tier alignment for Standard / DragonDash tiers (timing windows, scope caps)
- **Step 8C** — Secure content delivery pipeline with watermarked previews and Stripe Connect–tied accept / revision / reject workflow

The Creator side spec says "Payment via Stripe upon approval" appears on the campaign card, and "Stripe Connect for creator payouts (already planned)" appears in the TheCirqle translation table. **Whether 8C is fully built, partially built, or stubbed is unknown** — the audit phase below discovers the actual implementation state before recommending fixes.

---

## PHASE 1 — The audit prompt

Paste this entire block into Claude Code CLI at `C:\GIT\dragoncandy-v3-d783432b`. It runs the full discovery + analysis for **both** flows in one read-only pass, writes two report files, then stops.

```markdown
/using-superpowers
/design-flow

You are working in C:\GIT\dragoncandy-v3-d783432b. This is PHASE 1 of 2 — a
READ-ONLY end-to-end audit of the content delivery and payment flow
on DragonCandy. Two related flows in scope:

  SECTION A — Business/Restaurant ↔ Creator
  SECTION B — Brand/Sponsor      ↔ Creator

Do NOT write or modify any code in this phase. Output two audit
report files and STOP.

CONTEXT: DragonCandy is pre-launch next week. The delivery+payment
flow is the highest-stakes area in the app — bugs here create real
financial exposure (double-payouts, missed escrow, exposed raw assets,
unrecoverable disputes). The Engineering Blueprint specifies Step 8C
as "secure content delivery pipeline with watermarked previews and
Stripe Connect-tied accept/revision/reject workflow." It is unknown
whether 8C is fully built, partially built, or stubbed. Discover and
report.

DISCIPLINE:
- READ-ONLY phase. No edits, no migrations, no commits, no Stripe
  CLI calls that mutate state, no test transactions.
- Treat every Stripe call, state transition, and webhook handler as a
  potential financial bug until proven otherwise.
- If the discovery phase reveals the delivery flow is mostly stubbed,
  STOP and report that finding — fixing stubs is feature work, not
  a bug-fix prompt.
- If you cannot find a Stripe Connect integration at all, STOP and
  report — that's a launch-blocker decision the user needs to make
  before any audit is useful.

====================================================================
DISCOVERY — Map both flows (read-only)
====================================================================

1. CODE DISCOVERY (grep, list, summarize — do not modify):
   - Grep for: stripe, Stripe, paymentIntent, payment_intent, transfer,
     payout, escrow, application_fee, connect, capture, refund,
     webhook, accept, reject, revise, revision, deliver, delivery,
     watermark, signed_url, signedUrl, presigned
   - Identify:
     * src/lib/stripe/* or src/lib/payments/*
     * src/pages/business/Deliveries*, src/pages/business/Approvals*
     * src/pages/creator/Submissions*, src/pages/creator/Earnings*
     * src/pages/brand/Approvals*, src/pages/brand/Payouts*
     * src/components/delivery/*, src/components/review/*
     * Hooks: useStripeAccount, useDelivery, useApproval, usePayout
     * supabase/functions/stripe-*, supabase/functions/payment-*,
       supabase/functions/delivery-*
     * supabase/functions/*-webhook* (any webhook handlers)
   - For each file, note what it does in one sentence.

2. DATABASE DISCOVERY:
   - Read supabase/migrations/ for any table mentioning:
     deliveries, submissions, content_submissions, approvals, reviews,
     revisions, payments, payouts, transfers, stripe_accounts,
     stripe_customers, escrow, ledger, transactions, application_fees,
     usage_rights, exclusivity, brand_campaign_creators
   - Document for EACH relevant table:
     * Columns + types
     * Foreign keys
     * Indexes
     * RLS policies (with the actual USING / WITH CHECK clauses)
     * Generated columns or triggers
   - Specifically check whether there is a ledger / transactions /
     immutable audit table. If none exists, FLAG as P0 — payment
     systems without an audit trail are indefensible in disputes.

3. EDGE FUNCTION DISCOVERY:
   - List every function under supabase/functions/ that touches
     Stripe, delivery state, or payouts.
   - For each:
     * Input shape / expected payload
     * Output shape
     * What it mutates in the DB
     * Whether it verifies caller identity (auth.uid() check OR
       Stripe signature for webhooks)
     * Whether it is idempotent (does running it twice with the same
       input produce the same result?)
     * Whether it has try/catch and what happens on failure
   - Identify the Stripe webhook handler specifically. If none exists,
     FLAG as P0.

4. STORAGE DISCOVERY:
   - Find the bucket(s) used for creator-submitted content.
     Likely: creator-submissions, deliverables, content-uploads.
   - For each:
     * Public or private?
     * RLS policies on storage.objects?
     * Path convention (does it include user_id or campaign_id?)
     * Are watermarked previews stored separately from raw originals?
     * Do raw originals have an ACCESS GUARD that requires
       payment-completed status before serving?

5. STRIPE CONNECT STATE:
   - Find where stripe_account_id is stored on creators.
   - Find the onboarding flow (Connect Express or Standard?).
   - Find how the platform creates PaymentIntents — is capture_method
     'manual' (escrow-style) or 'automatic' (charge immediately)?
   - Find how transfers are made to creators (transfer_data on the
     PaymentIntent, or separate Transfer API call after capture?).
   - Find where application_fee_amount or platform fee is computed.
     Confirm the take rate matches business spec (15–20% per the
     Moat playbook).
   - Find currency handling (assume USD-only for v1; flag any
     multi-currency complexity as P2).

6. ENV / SECRETS:
   - Confirm STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, and
     STRIPE_CONNECT_CLIENT_ID are referenced via env vars (NEVER
     hardcoded). If hardcoded → P0.
   - Confirm test keys (sk_test_*) are used in dev/preview and live
     keys (sk_live_*) are gated by environment.

====================================================================
SECTION A — BUSINESS/RESTAURANT ↔ CREATOR FLOW
====================================================================

Trace each step from "creator accepts campaign" through "creator
receives payout." For each step, walk the code and document failure
modes.

A-FLOW 1 — Creator accepts campaign / commits to delivery
  - What state transition happens? (campaign.status, creator_assignment
    row, application status)
  - Does this trigger a PaymentIntent.create with capture_method='manual'
    so funds are authorized but not captured? If charge happens on
    accept rather than approval, FLAG — escrow is broken.
  - Is the business notified? Is the creator's deadline clock started?

A-FLOW 2 — Creator uploads delivered content
  - Bucket + path? Uses uploadProfileAsset helper (the one we built in
    prompt-0-profile-upload-fix.md) or a raw supabase.storage call?
  - Does the upload generate or queue a watermarked preview? If yes,
    where and how (Edge Function, Sharp/ffmpeg, third-party API)?
  - Is the raw original stored in a private path that REQUIRES a
    signed URL or post-approval gate? If raw is in a public bucket,
    FLAG as P0 — creators get paid for unlicensed exposure.
  - State transition: submission row created with status='pending_review'?
  - Multi-deliverable handling: per-deliverable status, or whole-batch?

A-FLOW 3 — Business reviews submission (accept / revise / reject)
  - Where does the business see pending submissions? (dashboard widget,
    notifications, dedicated approvals page)
  - Three-button state machine: ACCEPT → APPROVED, REVISE → REVISION_REQUESTED,
    REJECT → REJECTED. Confirm all three exist and are wired.
  - Revision count limit — is it enforced? (e.g., max 2 revision rounds
    before auto-escalation). If no limit, FLAG as P1 — revision spirals
    are a known marketplace failure mode.
  - Reject path: does it refund the business and unlock the creator from
    the campaign? Or does it leave funds in limbo?
  - Auto-approval timer: if the business doesn't respond within X hours
    (e.g., 48hr for Standard, 24hr for Express, 4hr for DragonDash),
    does an auto-approval fire? If no timer, FLAG as P1 — creators
    get stuck waiting forever.

A-FLOW 4 — Approval triggers capture + transfer + payout
  - On APPROVED, does the code call PaymentIntent.capture()?
  - After capture, does the code create a Transfer to the creator's
    Stripe Connect account, MINUS the platform fee?
  - Is the transfer made via transfer_data on the original PI, OR via a
    separate Transfer.create call? Both work, but ONE must be true and
    consistent. Mixing them creates duplicate-payout risk.
  - Is the transaction logged to a ledger / audit table BEFORE the
    Stripe call? (Write-then-call pattern survives crashes mid-flow.)
  - Is the platform fee correctly computed? (15–20% per spec — pull the
    actual constant from the code and report it.)
  - Does the creator's raw asset become accessible to the business at
    this point (signed URL, marked as released)?

A-FLOW 5 — Webhook handlers (Stripe → DragonCandy)
  - Confirm a webhook handler exists for at minimum:
    * payment_intent.succeeded
    * payment_intent.payment_failed
    * payment_intent.canceled
    * charge.refunded
    * charge.dispute.created
    * transfer.created / transfer.failed
    * payout.paid / payout.failed
    * account.updated (Connect onboarding state changes)
  - Signature verification: is constructEvent called with the raw body
    and STRIPE_WEBHOOK_SECRET? If not → P0 (anyone can fake events).
  - Idempotency: is event.id checked against a processed_events table
    before mutating state? If not → P0 (Stripe retries cause
    double-processing).
  - Out-of-order events: does the handler tolerate webhooks arriving in
    reverse order, or does it assume strict sequence?
  - Failure handling: on a 500 from your handler, Stripe will retry —
    is the handler safe to retry?

A-FLOW 6 — Refund / dispute path
  - Manual refund flow for the business if the creator no-shows or
    delivers garbage?
  - Dispute (chargeback) handler — does the platform have evidence
    submission wired, or does it just eat the loss?
  - Does the ledger reflect refunds and disputes as separate entries
    rather than mutating the original payment row?

A-FLOW 7 — DragonDash rush premium
  - Is the rush premium computed as a markup on the base rate (50–100%
    per spec)?
  - Does the creator receive the premium share (per spec: incentivized
    by the premium), or does the platform keep all of it?
  - Confirm the split is documented somewhere in code or a constants file.

A-FLOW 8 — Tax / 1099
  - Does Stripe Connect Express handle 1099 generation, or is it on the
    platform? (Spec says Connect handles it — confirm.)
  - Are creator earnings aggregated for the calendar year for the
    creator's earnings dashboard?

A-FLOW 9 — Creator payout dashboard
  - Can the creator see: pending earnings, available balance, paid out,
    next payout date?
  - Does this match Stripe's actual state, or is it a stale local copy?
  - On Stripe Connect Express, does the "View Stripe Dashboard" link
    open the express dashboard correctly?

A-FLOW 10 — Business spend dashboard
  - Can the business see: total spent, pending approvals, refunded,
    upcoming charges?
  - Does it match the ledger?

====================================================================
SECTION B — BRAND/SPONSOR ↔ CREATOR FLOW
====================================================================

The Brand flow shares infrastructure with Section A but differs in
critical ways. Audit ONLY the deltas — do not re-walk shared steps.

B-FLOW 1 — Brand campaign engages N creators (not 1)
  - Where is the per-creator state stored? (likely a join table like
    brand_campaign_creators with status per creator)
  - Does each creator get an INDIVIDUAL PaymentIntent / authorization,
    or is there ONE pooled charge that gets split? Both patterns are
    valid but they fail differently — document which one is in use.
  - Per-creator payout cap from the wizard: is it enforced server-side?
    A client-only cap is bypassable.

B-FLOW 2 — Budget pool accounting
  - Brand wizard says "budget pool + per-creator payout cap." Where is
    the pool tracked? Is there a running balance updated atomically as
    creators are paid out?
  - Race condition check: if two creators are approved simultaneously
    and the remaining pool can only fund one, does the system block
    the second correctly? (Look for FOR UPDATE locks or atomic decrement
    via Postgres function — if not present, FLAG as P0.)
  - When pool is exhausted, are remaining unaccepted creators
    auto-released?

B-FLOW 3 — Required deliverable mix (e.g., 3 reels + 5 stories + 1 carousel)
  - Is the mix tracked at the campaign level or per creator?
  - If per creator: does the system enforce that the creator delivers
    THEIR assigned mix?
  - If at campaign level: is there allocation logic that assigns
    mix slots to creators? Or does it rely on first-come-first-serve?

B-FLOW 4 — Per-creator approval
  - Brand reviews each creator's submission independently?
  - Does approving creator A automatically affect creator B in any way
    (e.g., updating shared pool counters)?
  - Are partial-batch approvals supported (approve 4 of 5 deliverables)?

B-FLOW 5 — Usage rights window (30 / 60 / 90 days, perpetual)
  - Is the usage window stored on the campaign record?
  - Is there ANY enforcement of the window? (e.g., a flag that flips
    after expiration, a notification to the brand, signed URL TTL
    matching the window)
  - If the field exists but no enforcement runs against it, FLAG as
    P1 — selling usage rights you don't enforce is a legal liability.

B-FLOW 6 — Exclusivity (no competitor brands for X days)
  - Is the exclusivity window stored?
  - Does the system block the creator from accepting campaigns from
    competitor brands during the window? (Likely needs a brand tag /
    industry field and a check at campaign-acceptance time.)
  - If no enforcement, FLAG as P1 — creators will breach unknowingly.

B-FLOW 7 — Brand-side payouts and reporting
  - Brand spend dashboard: total committed, paid out, pool remaining,
    creators engaged, deliverables received?
  - Per-creator breakdown of who delivered what?

====================================================================
BUG / ISSUE CHECKLIST — apply to BOTH sections
====================================================================

For each item: PRESENT / ABSENT / NEEDS_INFO. Be specific about file
paths and line numbers when possible.

PAYMENT INTEGRITY:
[ ] Webhook signature verification on every Stripe webhook handler
[ ] Idempotency check via event.id and processed_events table
[ ] Out-of-order webhook tolerance
[ ] Manual capture (escrow) on PaymentIntent creation, not auto capture
[ ] Capture happens ONLY on approval, never on submission
[ ] Transfer to creator happens ONLY after capture
[ ] Platform fee is computed server-side and matches the spec'd take rate
[ ] Ledger / audit table written BEFORE Stripe call, updated AFTER
[ ] No code path can create a Transfer without a corresponding ledger entry
[ ] Refund flow uses Stripe Refund API and writes a ledger entry
[ ] Dispute handler exists and at minimum logs to a queue for human review
[ ] Stripe keys are env vars, not hardcoded; test vs live gated by environment

CONTENT SECURITY:
[ ] Raw creator-submitted content lives in a PRIVATE bucket
[ ] Watermarked previews live separately and are served to the
    business pre-approval
[ ] Raw asset access is gated by an approval-status check OR a
    signed URL issued only after capture succeeds
[ ] Signed URLs have a finite TTL (not 24-hour catch-all)
[ ] No code path returns a raw URL to the business before payment

STATE MACHINE INTEGRITY:
[ ] Submission status transitions are explicit (no random string updates)
[ ] Illegal transitions are blocked (e.g., REJECTED → APPROVED)
[ ] State changes are atomic (transaction-wrapped, not multi-statement
    with no rollback)
[ ] Auto-approval timer exists and is implemented as a scheduled
    function, not a client-side setTimeout
[ ] Revision limit enforced server-side

AUTHORIZATION / RLS:
[ ] Creator can only see their own submissions and earnings
[ ] Business can only see submissions for campaigns they own
[ ] Brand can only see submissions for campaigns they sponsor
[ ] Edge functions verify caller role before mutating delivery state
[ ] Cross-role data leakage tested (creator can't read business
    payment details, business can't read creator stripe_account_id)

ERROR / EMPTY / LOADING STATES (carry over from earlier audits):
[ ] Every async fetch wrapped in try/catch with toast on failure
[ ] Loading skeletons on submissions list, approvals queue, earnings
[ ] Empty states for "no submissions yet," "no pending approvals,"
    "no earnings yet"
[ ] ErrorBoundary wraps the delivery + payment routes
[ ] No raw Stripe error messages bleeding into UI (sanitize and
    map to user-friendly copy)

UX CLARITY:
[ ] Business clearly understands when they will be charged
    (on accept vs on approval)
[ ] Creator clearly understands when they will be paid
    (on approval, with payout schedule)
[ ] Approval / revision / reject buttons are visually distinct and
    have confirmation dialogs for irreversible actions
[ ] Reject action requires a reason (free text) so the creator knows why
[ ] Revision request requires specific notes (not just a button)
[ ] DragonDash deadline countdown visible to both sides
[ ] Refund request flow is discoverable but not too easy (friction is
    intentional)

DESIGN SYSTEM (carry over):
[ ] Teal #4DD9C0 / pink #F9A8D4 / 12px radius / shared shadcn components
[ ] Preserved lg: classes
[ ] Mobile renders at 375px without overflow

PERFORMANCE / RELIABILITY:
[ ] Webhook handler responds in under 5 seconds (Stripe's timeout)
    — heavy work deferred to a background queue
[ ] Submissions list paginated (not unbounded)
[ ] No N+1 queries between submissions and their related entities
[ ] Edge function cold-start on payment paths kept under 2s

OBSERVABILITY:
[ ] Console.error / console.log left in production code? List them.
[ ] Any Sentry or equivalent error tracking? (If not, flag for
    post-launch.)
[ ] Webhook event log queryable from the admin / DB?

====================================================================
DELIVERABLES — Two audit report files
====================================================================

Write TWO files at the repo root:

  delivery-payment-audit-business.md  (Section A findings)
  delivery-payment-audit-brand.md     (Section B findings)

Each file uses this structure:

1. EXECUTIVE SUMMARY
   - 3–5 sentences. State whether the flow is ready to launch, ready
     with fixes, or fundamentally not built. Be blunt — this is the
     money path.

2. IMPLEMENTATION STATE
   - What's built end-to-end vs stubbed vs missing entirely.
   - Confidence level (high / medium / low) for each.

3. FILE / TABLE / FUNCTION INVENTORY
   - Every touched file, table, edge function, bucket, env var.

4. FLOW-BY-FLOW WALKTHROUGH
   - For each flow listed in Section A or B, document: current code
     path, identified failure modes, severity.

5. TRIAGED BUG LIST
   - P0 (BLOCKS LAUNCH — financial exposure): hardcoded keys, missing
     webhook signature verification, no idempotency, raw assets
     publicly accessible, capture-on-submission, missing ledger,
     RLS leaks on payment data.
   - P1 (SHOULD FIX BEFORE LAUNCH): missing auto-approval timer, no
     revision limit, missing usage-rights enforcement, missing
     dispute handler, broken empty/loading states, no error toasts.
   - P2 (POST-LAUNCH): observability gaps, performance optimizations,
     UX polish, multi-currency, advanced reporting.
   - For each: one-sentence description, file:line, recommended fix
     in one sentence, effort estimate (S/M/L), and EXPLICIT financial
     risk if left unfixed.

6. ROOT-CAUSE PATTERNS
   - If multiple bugs share a cause (e.g., "no shared payment helper —
     Stripe is called inline from 4 places"), call it out and recommend
     a single helper.

7. OPEN QUESTIONS
   - Anything that requires a product decision from the user, not a
     code fix. Examples: "Should auto-approval be 24 or 48 hours for
     Standard tier?", "Should the platform absorb chargebacks under
     $50 to avoid dispute friction?"

8. POST-LAUNCH RECOMMENDATIONS
   - Items that are out of scope for next week but important for the
     first 90 days. (Sentry, ledger reconciliation cron, monthly
     payout report, etc.)

====================================================================
PROTECT / STOP CONDITIONS
====================================================================

- DO NOT modify any code in this phase. No commits. No git ops
  beyond reads. No supabase mutations. No Stripe API calls (not even
  read-only — the Stripe SDK initialization itself can leak info in
  logs).
- If Stripe Connect is not integrated AT ALL, STOP and report —
  the user needs to decide whether to defer launch or scope-cut to
  manual payouts before any audit work matters.
- If 8C is mostly a stub, STOP and report — fixing stubs is feature
  work, not a bug-fix prompt.
- Do not read files outside the delivery + payment scope unless they
  are directly imported by code in scope.

STOP when both audit reports are written and wait for my approval on
which P0/P1 items to fix in Phase 2.
```

---

## PHASE 2 — The fix prompt (use AFTER you approve the audit)

Do not paste this until you've read both `delivery-payment-audit-business.md` and `delivery-payment-audit-brand.md` and selected which items to fix. Fill in `{{BUG_LIST}}` with the items you want addressed, in priority order, sourced from BOTH reports.

```markdown
/using-superpowers
/design-flow

You are working in C:\GIT\dragoncandy-v3-d783432b. This is PHASE 2 of 2 — fixing
specific bugs identified in delivery-payment-audit-business.md and
delivery-payment-audit-brand.md.

CONTEXT: Phase 1 produced two audit reports for the highest-stakes
area in the app: content delivery and payment. I have selected the
following items to fix, in this exact priority order. Each item is
tagged [BIZ] or [BRAND] to indicate which flow it belongs to (some
fixes apply to both — those are tagged [SHARED]).

{{BUG_LIST}}

(Example format:
  1. P0 [SHARED]: Stripe webhook handler does not verify signatures —
     supabase/functions/stripe-webhook/index.ts
  2. P0 [SHARED]: PaymentIntent uses capture_method='automatic' so funds
     are captured on accept instead of escrowed —
     supabase/functions/create-payment-intent/index.ts:42
  3. P0 [BIZ]: Raw creator submissions stored in public bucket —
     supabase/migrations/...
  4. P0 [BRAND]: Brand budget pool decrement is not atomic, race
     condition possible — supabase/functions/approve-brand-submission/index.ts
  5. P1 [SHARED]: No auto-approval timer for stale pending reviews
  6. P1 [BIZ]: Reject action does not refund the business
  7. P1 [BRAND]: Usage rights window field exists but no enforcement
)

DISCIPLINE RULES — non-negotiable, this is the money path:
- Fix ONE item at a time. NEVER batch payment-related changes.
- Between each fix: npm run build must pass.
- Between each fix: one commit with a descriptive message.
- Between each fix: STOP and wait for my approval before starting
  the next.
- Stripe-touching changes require an EXTRA verification step:
  test in Stripe test mode (sk_test_*) using the Stripe CLI or
  test card numbers, NEVER live mode, until I approve switching.
- Preserve every `lg:` Tailwind class.
- Do not introduce new dependencies unless the audit explicitly
  recommended one (e.g., a queue library) AND I approve.
- Do not refactor unrelated code. Note follow-ups for post-launch.
- Reuse existing patterns:
  * uploadProfileAsset helper for any media uploads
  * Existing toast utility
  * Existing ErrorBoundary
  * Shared design tokens and shadcn components
  * Existing ledger / audit table if one exists; if not, the FIRST
    fix in the queue MUST be to create it (see below)

LEDGER-FIRST RULE:
If the audit found NO ledger / audit table, the first fix MUST be to
create one BEFORE any other Stripe-touching fixes. The ledger is the
foundation that every other payment fix depends on. The migration
should:
- Create a `payment_ledger` table (or similar): id, created_at,
  campaign_id, creator_id, business_id (or brand_id), amount_cents,
  currency, type (authorize/capture/transfer/refund/dispute/fee),
  stripe_object_id, stripe_event_id (nullable), status, metadata jsonb
- Index on stripe_event_id for idempotency lookups
- Index on (campaign_id, type) for reconciliation queries
- RLS: business/brand can read their own rows, creator can read
  rows where they are the recipient, no one can update or delete
  (append-only)
- A processed_webhook_events table for idempotency:
  event_id (unique), received_at, type, payload jsonb
This is NOT optional — every subsequent payment fix writes to it.

FOR EACH ITEM IN THE LIST:

1. Read the relevant files to confirm the bug is still present.
2. If the fix touches Stripe, the database, or RLS: write a SHORT
   plan (3–5 bullet points) PLUS a "blast radius" note describing
   what data and what flows could be affected if the fix is wrong.
3. STOP and wait for my approval of the plan + blast radius.
4. On approval: make the fix.
5. Run npm run build. If it fails, iterate until it passes.
6. For Stripe-touching fixes: test in Stripe test mode using test
   card numbers (4242 4242 4242 4242 for success, 4000 0000 0000 0002
   for decline, 4000 0000 0000 0259 for dispute). Walk the entire
   happy path AND at least one error path.
7. Add success / error / loading states matching the pattern from
   prompt-0-profile-upload-fix.md:
     * Success toast (teal, 2.5s, role=status)
     * Error toast with specific reason
     * Skeleton loader during fetches
     * Confirmation dialogs on irreversible actions (capture,
       refund, dispute response)
8. For ANY mutation that touches money, write a ledger entry FIRST
   (in the same DB transaction as the state change), THEN call
   Stripe. On Stripe error, mark the ledger entry as 'failed' but
   never delete it. The ledger is the source of truth.
9. Commit with message format:
     fix(payments): <one-line>
     fix(delivery): <one-line>
     feat(payments): <one-line> for additive fixes
   Tag the commit body with [BIZ] / [BRAND] / [SHARED] for traceability.
10. Report: what changed, which files, build status, test mode
    verification result.
11. STOP and wait for approval on the next item.

PROTECT:
- Do NOT touch live Stripe keys or live mode under any circumstance.
  Test mode only until I explicitly approve a live test.
- Do NOT modify existing ledger entries — append-only.
- Do NOT change auth, profile, campaign creation, or promotions
  features outside the delivery+payment scope.
- Do NOT drop or restructure existing payment-related tables — add
  columns or new tables via new migrations.
- Do NOT change RLS on payment tables without an explicit plan and
  approval.
- Preserve all `lg:` desktop Tailwind classes.

VERIFY (after ALL approved fixes are committed):
- npm run build succeeds with zero new warnings
- supabase db push applies all new migrations cleanly
- Stripe test mode end-to-end walkthrough:

  BUSINESS↔CREATOR HAPPY PATH:
  1. Business creates campaign, accepts a creator
  2. PaymentIntent created with capture_method='manual', funds
     authorized but not captured (verify in Stripe dashboard test mode)
  3. Creator uploads deliverable → watermarked preview visible to
     business, raw asset NOT accessible
  4. Business clicks Approve → Stripe capture fires → Transfer to
     creator's test Connect account → ledger entries written
  5. Creator's earnings dashboard reflects new pending payout
  6. Raw asset now accessible to business via signed URL with TTL

  BUSINESS↔CREATOR REVISION PATH:
  7. New campaign, creator uploads → business clicks "Request revision"
     with notes → submission goes to REVISION_REQUESTED → creator can
     re-upload → second review → approve → capture/transfer fires once

  BUSINESS↔CREATOR REJECT PATH:
  8. New campaign, creator uploads → business clicks "Reject" with
     reason → PaymentIntent canceled → no transfer → ledger reflects
     refund/cancellation

  AUTO-APPROVAL TIMER:
  9. Submission left untouched past the deadline → scheduled function
     auto-approves → capture/transfer fires (verify in test mode by
     setting a short test interval)

  BRAND↔CREATOR HAPPY PATH:
  10. Brand creates sponsorship with budget pool of $X, engages
      3 creators
  11. Each creator has their own PI / authorization within the pool
  12. Approve creator 1 → pool decrements atomically → ledger entry
  13. Approve creator 2 simultaneously (use two browser tabs or
      concurrent edge function calls) → confirm no double-spend

  BRAND↔CREATOR USAGE RIGHTS:
  14. Approve a creator with 30-day usage window → confirm enforcement
      flag flips after expiration (test by manually adjusting the
      timestamp in DB)

  WEBHOOK REPLAY:
  15. Use Stripe CLI to replay a payment_intent.succeeded event twice
      → confirm the second one is a no-op via processed_webhook_events

  SIGNATURE TAMPERING:
  16. Send a fake POST to the webhook endpoint without a valid
      signature → confirm rejection

- Lovable preview at 375px and 1440px:
  * Business approvals page renders cleanly
  * Creator earnings page renders cleanly
  * Brand campaign approvals page renders cleanly
  * No raw error messages, no blank screens

FINAL COMMIT AND PUSH:
  git push origin main

REPORT:
- Total items fixed (with [BIZ]/[BRAND]/[SHARED] tags)
- Total items deferred (and why)
- Total new commits
- Stripe test mode results for each happy + error path
- Any regressions noticed
- Any production readiness concerns BEFORE going live with Stripe
  live keys
- Recommendations for the live-mode cutover sequence
```

---

## Execution checklist

**Phase 1 — Audit**
- [ ] `git pull origin main --rebase`
- [ ] Paste Phase 1 prompt into Claude Code CLI
- [ ] Read both `delivery-payment-audit-business.md` and `delivery-payment-audit-brand.md`
- [ ] If either says "Stripe Connect not integrated" or "8C is mostly stubbed" → STOP and decide whether to defer launch or scope-cut to manual payouts before any fix work
- [ ] Highlight P0s (financial exposure) — these MUST be fixed pre-launch
- [ ] Highlight P1s — pick the ones you can ship before launch
- [ ] Defer P2s to a `delivery-payment-post-launch.md` file

**Phase 2 — Fix**
- [ ] Draft the `{{BUG_LIST}}` in priority order, P0s first
- [ ] If no ledger exists, the FIRST item is "Create payment_ledger and processed_webhook_events tables"
- [ ] Paste Phase 2 prompt with `{{BUG_LIST}}` filled in
- [ ] Approve each plan + blast radius before each fix
- [ ] `npm run build` after each commit
- [ ] Stripe test mode verification after each Stripe-touching fix
- [ ] Final end-to-end test mode walkthrough across all 16 verification steps
- [ ] `git push origin main`
- [ ] Manual smoke test in Stripe test mode one more time before flipping to live keys
- [ ] Live-key cutover ONLY after all P0s are green

## Post-fix follow-up (separate prompts, not now)

- Add a "Payment conventions" section to `CLAUDE.md` documenting: ledger-first rule, manual capture, append-only ledger, signature verification on every webhook, processed_events idempotency. This locks in the patterns so future agents can't reintroduce the bugs.
- Drop P2 items into `delivery-payment-post-launch.md`.
- Schedule a daily ledger reconciliation cron post-launch (compares Supabase ledger to Stripe Balance Transactions).
- Wire Sentry or equivalent error tracking on the webhook handler and payment edge functions before week 2.
- Build a simple admin view for disputes, refunds, and stuck submissions — week 2 work, not launch week.

## Deferred (earn their own prompts)

- Multi-currency support
- Cross-border Connect (international creators)
- Tipping / bonuses on top of base payout
- Subscription billing for the SaaS layer (separate from per-campaign payments)
- Stripe Tax integration
- Advanced fraud rules (Radar)
- Brand sponsorship "matching pool" features (top-up after launch)
- Auto-payout cadence configuration per creator
- Creator referral revenue share

## A note on Phase 1's stop conditions

The audit prompt has explicit stop conditions for "Stripe Connect not integrated" and "8C mostly stubbed." If either fires, **don't push through** — those aren't bugs, they're missing features. Fixing missing features mid-launch-week is how the app ships broken. The right move in either case is:

1. Stop the audit
2. Decide with a clear head whether to (a) delay launch by 1–2 weeks to build the missing pieces properly, or (b) scope-cut the launch to manual payouts (Stripe invoice or Venmo handoff with the platform reconciling by hand) and ship the automated payment rail in week 2
3. If you go with option (b), write a one-page "manual payment SOP" so you know exactly what to do when the first creator gets paid

Better to ship a smaller surface area that works than a bigger surface area that loses money silently.
