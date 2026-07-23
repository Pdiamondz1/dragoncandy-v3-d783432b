# posting_schedule_status 'failed' CHECK gap (2026-07-23, PR #326)

Follow-up increment to content-delivery stabilization (after the #325 drift repair), from the
same exploration backlog. A sibling of the state-machine drift, in the post-approval scheduling leg.

## The bug

`confirm-posting-schedule` writes `campaigns.posting_schedule_status = 'failed'` when every post fails
to schedule (`failedCount > 0 && scheduledCount === 0`), and the frontend **already renders a complete
"Schedule Failed" card** for it (`src/components/schedule/CampaignScheduleSection.tsx` — a red card with
a "Review Schedule" button). But the CHECK from `20260527100000_posting_schedule_columns` never included
`'failed'`. So the UPDATE silently violated the constraint (the edge fn only `console.error`s an update
failure), leaving `posting_schedule_status` **stuck at `pending_review`** and the built `'failed'` UI
branch **unreachable dead code**. Neither the business nor the creator ever sees that scheduling failed.

## The fix

One DB-only migration (`20260723130000_add_failed_posting_schedule_status`) adds `'failed'` to the CHECK.
**No code change** — the edge function already writes it and the frontend already renders it. Pure
expansion (0 rows use `'failed'`, so it can't fail on existing data).

## Verification (prod)

- Dry-run in a rolled-back tx: after the expansion, a `'failed'` write that previously violated the CHECK
  **succeeds**.
- Applied: the actual prod CHECK now allows `'failed'`; all 25 campaign rows intact; migration recorded.
- Codex: clean (first pass).

## Durable lesson

Same **recorded-vs-intended CHECK-gap** class as the `content_status` drift ([[Content Delivery State
Machine]]): the code (edge fn + frontend) already expected/wrote a value the DB constraint forbade, so
the write silently failed and the built UI was dead. Verify the **actual prod CHECK** against what the
code writes/renders — not just the migration file.
