# DragonShare Notifications + Dashboard Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make DragonShare a first-class citizen in the notification system (in-app bell + email + Donny) and on both dashboards (folded into the activity feed + a dedicated card), mirroring how campaigns work.

**Architecture:** A single new service-role edge function `dragonshare-notify` owns all DragonShare notification fanout — it calls `create-notification` (bell + email, preference-aware) per recipient and inserts `donny_nudges` rows directly, plus a proactive Donny chat message on new submissions only. It is invoked from the application layer (the submit hook, the decline hook, and `fulfill-boost.ts`) — never from SQL triggers — so it sidesteps the `pg_net`/GUC path that is unset (and silently broken) in production. Dashboard surfaces derive from the RLS-readable `dragonshare_posts` / `dragonshare_boosts` / `dragonshare_payouts` tables.

**Tech Stack:** React 18 + TypeScript (strict), Vite, Tailwind (`dc-*` tokens), React Query, Vitest; Supabase (Postgres + RLS + Deno edge functions), Resend (email).

**Spec:** `docs/superpowers/specs/2026-06-01-dragonshare-notifications-dashboard-parity-design.md`

---

## Deviations from the spec (read first)

The spec is approved; these two corrections were discovered while grounding the plan in code and **supersede** the spec where they conflict:

1. **Dashboard data source is NOT `dragonshare_events`.** That table has RLS enabled with **no SELECT policy**, so the frontend cannot read it. The dedicated card and feed derivations use the already-RLS-readable tables the existing DragonShare hooks query successfully: `dragonshare_posts` (creator's own; org's incoming), `dragonshare_boosts` (org's boosts), `dragonshare_payouts` (creator's payouts).
2. **Business "fold into the feed" is satisfied by the dedicated card.** The creator dashboard has a generic "Recent Activity" feed to fold DragonShare into (Task 8). The business dashboard has no equivalent generic feed (only "Your Campaigns"), so its DragonShare feed presence IS the dedicated card (Task 7) — we do not jam DragonShare rows into the campaigns list.

## Notification contracts (reference — used across tasks)

- **`create-notification`** (`supabase/functions/create-notification/index.ts`) accepts a POST with body
  `{ recipientId, type, category, title, body, actionUrl?, icon?, data?, forceDelivery?, emailType? }`.
  Callable server-to-server when `Authorization: Bearer <SERVICE_ROLE_KEY>` (its `isService` path). It always inserts the bell row, then emails via `send-notification-email` when the category's `email` pref is true (or `forceDelivery`). Email type resolves from `emailType` or its internal `NOTIFICATION_TYPE_TO_EMAIL_TYPE`.
- **`donny_nudges`** row shape (insert directly, service role): `{ user_id, type, source_table, source_id, summary, priority, actions, raw_data }`. `type` CHECK allows only `('application','content','milestone','payment','invitation','match')`. Unique on `(user_id, source_table, source_id)` → upsert with `onConflict` + `ignoreDuplicates`. Actions are rendered by `DonnyNudgeCard`; a `navigate` action uses `{ action:'navigate', payload:{ route } , variant, label }` (see `DonnyProvider.tsx:249`).
- **`donny_messages`** quick_actions use `{ label, action:'navigate', url }` / `{ label, action:'dismiss' }` (see `DonnyMessage.tsx:95`).
- **Event recipients/types:** submission→restaurant owner (`dragonshare_submission`); boost paid→creator (`dragonshare_boost`) + restaurant owner (`dragonshare_boost_receipt`); decline→creator (`dragonshare_declined`). Category for all four: `dragonshare`.

---

## Task 1: Notification types, `dragonshare` category, and routing (frontend only)

Pure frontend foundation. No backend dependency; safe to build/push on its own. Adding the category makes the settings UI and bell filter tabs include DragonShare automatically (they read `CATEGORY_META`), except the settings section's hardcoded list (updated below).

**Files:**
- Modify: `src/types/notifications.ts`
- Modify: `src/lib/getNotificationRoute.ts`
- Modify: `src/components/notifications/NotificationItem.tsx:14-20` (add `dragonshare` to `CATEGORY_BG`)
- Modify: `src/components/settings/NotificationPreferencesSection.tsx:8` (add `'dragonshare'` to `CATEGORIES`)
- Modify: `src/hooks/useNotificationPreferences.ts:32-33` (default-merge fallback)
- Test: `src/lib/getNotificationRoute.test.ts` (new)

- [ ] **Step 1: Write failing tests for routing**

Create `src/lib/getNotificationRoute.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { getNotificationRoute } from './getNotificationRoute';
import type { PushNotification } from '@/types/notifications';

function make(type: string, data: Record<string, unknown> | null, action_url: string | null = null): PushNotification {
  return {
    id: '1', user_id: 'u', title: 't', body: 'b',
    type: type as PushNotification['type'],
    category: 'dragonshare', action_url, actor_id: null, actor_name: null,
    icon: null, data, read_at: null, sent_at: null, created_at: '2026-06-01T00:00:00Z',
  };
}

describe('getNotificationRoute — DragonShare', () => {
  it('routes submission to business dragonshare with highlight', () => {
    expect(getNotificationRoute(make('dragonshare_submission', { post_id: 'p1' })))
      .toBe('/dashboard/business/dragonshare?highlight=p1');
  });
  it('routes boost receipt to business dragonshare', () => {
    expect(getNotificationRoute(make('dragonshare_boost_receipt', { post_id: 'p1' })))
      .toBe('/dashboard/business/dragonshare?highlight=p1');
  });
  it('routes boost payout to creator dragonshare with highlight', () => {
    expect(getNotificationRoute(make('dragonshare_boost', { post_id: 'p1' })))
      .toBe('/dashboard/creator/dragonshare?highlight=p1');
  });
  it('routes decline to creator dragonshare', () => {
    expect(getNotificationRoute(make('dragonshare_declined', { post_id: 'p1' })))
      .toBe('/dashboard/creator/dragonshare?highlight=p1');
  });
  it('falls back to base route when post_id missing', () => {
    expect(getNotificationRoute(make('dragonshare_boost', {})))
      .toBe('/dashboard/creator/dragonshare');
  });
  it('honors an explicit action_url first', () => {
    expect(getNotificationRoute(make('dragonshare_boost', { post_id: 'p1' }, '/x')))
      .toBe('/x');
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

Run: `npx vitest run src/lib/getNotificationRoute.test.ts`
Expected: FAIL (no DragonShare cases; they hit `default → null`).

- [ ] **Step 3: Add the type union + category + metadata**

In `src/types/notifications.ts`:
- Add to `NotificationType` union (near line 27): `| 'dragonshare_submission'` and `| 'dragonshare_boost_receipt'` (keep `dragonshare_boost`, `dragonshare_declined`).
- Add `'dragonshare'` to `NotificationCategory` (line 1):
  ```ts
  export type NotificationCategory = 'campaigns' | 'messages' | 'transactions' | 'content' | 'account' | 'dragonshare';
  ```
- Add `dragonshare: ChannelPreferences;` to the `PreferencesMatrix` interface (after `account`).
- Add to `DEFAULT_PREFERENCES_MATRIX`: `dragonshare: { in_app: true, email: true, sms: false },`
- Add to `CATEGORY_META`: `dragonshare: { label: 'DragonShare', icon: '🐉', description: 'Submissions, boosts, and payouts' },`
- Add to `NOTIFICATION_TYPE_TO_EMAIL_TYPE`:
  ```ts
  dragonshare_submission: 'dragonshare_submission',
  dragonshare_boost: 'dragonshare_boost',
  dragonshare_boost_receipt: 'dragonshare_boost_receipt',
  dragonshare_declined: 'dragonshare_declined',
  ```

- [ ] **Step 4: Add routing cases**

In `src/lib/getNotificationRoute.ts`, add before `default:`:

```ts
    case 'dragonshare_submission':
    case 'dragonshare_boost_receipt':
      return data?.post_id
        ? `/dashboard/business/dragonshare?highlight=${data.post_id}`
        : '/dashboard/business/dragonshare';

    case 'dragonshare_boost':
    case 'dragonshare_declined':
      return data?.post_id
        ? `/dashboard/creator/dragonshare?highlight=${data.post_id}`
        : '/dashboard/creator/dragonshare';
```

- [ ] **Step 5: Run tests — verify they pass**

Run: `npx vitest run src/lib/getNotificationRoute.test.ts`
Expected: PASS (6/6).

- [ ] **Step 6: Wire the category into the remaining consumers**

- `src/components/notifications/NotificationItem.tsx` — add to `CATEGORY_BG`: `dragonshare: 'bg-dc-teal',`
- `src/components/settings/NotificationPreferencesSection.tsx:8` — add `'dragonshare'`:
  ```ts
  const CATEGORIES: NotificationCategory[] = ['campaigns', 'messages', 'transactions', 'content', 'dragonshare', 'account'];
  ```
- `src/hooks/useNotificationPreferences.ts` — replace the `matrix` fallback (lines 32-33) so existing users (whose stored matrix has no `dragonshare` key) don't crash `matrix[category][channel.key]`:
  ```ts
  const stored = (query.data?.preferences_matrix as Partial<PreferencesMatrix> | undefined) ?? {};
  const matrix: PreferencesMatrix = { ...DEFAULT_PREFERENCES_MATRIX, ...stored };
  ```

- [ ] **Step 7: Typecheck, build, and full test run**

Run: `npm run typecheck` → Expected: exit 0 (the new required `dragonshare` key on `PreferencesMatrix` must be satisfied everywhere it's constructed; if a literal matrix is built elsewhere, the compiler will flag it — fix by adding the key).
Run: `npx vitest run src/lib/getNotificationRoute.test.ts` → PASS.
Run: `npm run build` → Expected: success.

- [ ] **Step 8: Commit**

```bash
git add src/types/notifications.ts src/lib/getNotificationRoute.ts src/lib/getNotificationRoute.test.ts src/components/notifications/NotificationItem.tsx src/components/settings/NotificationPreferencesSection.tsx src/hooks/useNotificationPreferences.ts
git commit -m "feat(dragonshare): add dragonshare notification category, types, and routing"
```

---

## Task 2: `create-notification` map + email templates (backend)

Make `create-notification` resolve DragonShare email types and default the `dragonshare` category to email-on; add the four Resend templates.

**Files:**
- Modify: `supabase/functions/create-notification/index.ts:22-41` and `:119-125`
- Modify: `supabase/functions/send-notification-email/index.ts` (templates + supported-type list)

- [ ] **Step 1: Extend the edge function's type map and default matrix**

In `create-notification/index.ts`, add to its `NOTIFICATION_TYPE_TO_EMAIL_TYPE` (keep in sync with `src/types`):
```ts
  dragonshare_submission: 'dragonshare_submission',
  dragonshare_boost: 'dragonshare_boost',
  dragonshare_boost_receipt: 'dragonshare_boost_receipt',
  dragonshare_declined: 'dragonshare_declined',
```
And add to the `defaultMatrix` (around line 119) so users with no stored pref still get email:
```ts
  dragonshare:  { email: true, sms: false },
```

- [ ] **Step 2: Add the four email templates**

In `send-notification-email/index.ts`, add four entries to the `templates` record and to the supported-types list, matching the existing brand HTML structure (teal/pink gradient header + single CTA). Use the inbound `data` fields the notify function will pass (`creator_name`, `business_name`, `payout_dollars`, `post_id`). Base URL + wrapper already exist in the file — mirror an existing template (e.g. `campaign_published`). Templates:
- `dragonshare_submission` → "{creator_name} shared a post about you", CTA "Review & boost" → `${baseUrl}/dashboard/business/dragonshare`.
- `dragonshare_boost` → "Your post got boosted 🎉 — ${payout_dollars} is on the way", CTA "See it on DragonShare" → `${baseUrl}/dashboard/creator/dragonshare`.
- `dragonshare_boost_receipt` → "Your boost is live — drafted for one-tap posting", CTA "Open Social" → `${baseUrl}/dashboard/business/social`.
- `dragonshare_declined` → encouraging "Not selected this time — your content's still great", CTA "Share more" → `${baseUrl}/dashboard/creator/dragonshare`.

- [ ] **Step 3: Deploy both edge functions (preserve verify_jwt)**

Use Supabase MCP `deploy_edge_function` for `create-notification` and `send-notification-email`. Confirm each keeps its current `verify_jwt` setting (do not flip it). Verify with `get_edge_function` that the new code is live.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/create-notification/index.ts supabase/functions/send-notification-email/index.ts
git commit -m "feat(dragonshare): create-notification email mapping + 4 DragonShare email templates"
```

---

## Task 3: `dragonshare-notify` edge function (backend, new)

The single fanout. Service-role internally; accepts an authenticated user JWT or the service key (it does its own privileged work, like `create-notification`). One handler, three events.

**Files:**
- Create: `supabase/functions/dragonshare-notify/index.ts`

- [ ] **Step 1: Implement the function**

Request body: `{ event: 'submission' | 'boost_paid' | 'declined', post_id?: string, boost_id?: string, creator_id?: string, creator_payout_cents?: number }`.

Skeleton (fill in helpers; uses the service-role client for all reads/writes so it can resolve and write across users):

```ts
import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

async function notify(recipientId: string, type: string, title: string, body: string, actionUrl: string, icon: string, data: Record<string, unknown>) {
  try {
    await fetch(`${SUPABASE_URL}/functions/v1/create-notification`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SERVICE_KEY}` },
      body: JSON.stringify({ recipientId, type, category: 'dragonshare', title, body, actionUrl, icon, data }),
    });
  } catch (e) { console.warn('[dragonshare-notify] create-notification failed:', (e as Error).message); }
}

async function upsertNudge(sb: ReturnType<typeof createClient>, userId: string, nudgeType: string, sourceTable: string, sourceId: string, summary: string, actions: unknown[]) {
  try {
    await sb.from('donny_nudges').upsert(
      { user_id: userId, type: nudgeType, source_table: sourceTable, source_id: sourceId, summary, priority: 'high', actions, raw_data: {} },
      { onConflict: 'user_id,source_table,source_id', ignoreDuplicates: true },
    );
  } catch (e) { console.warn('[dragonshare-notify] nudge failed:', (e as Error).message); }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders(req) });
  try {
    const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const { event, post_id, boost_id, creator_id, creator_payout_cents } = await req.json();

    if (event === 'submission') {
      // Resolve post → org owner, creator name, clean business name
      const { data: post } = await sb.from('dragonshare_posts')
        .select('id, creator_id, target_org_id, content_type').eq('id', post_id).single();
      if (!post) return ok();
      const ownerId = await resolveOrgOwner(sb, post.target_org_id);
      if (!ownerId) return ok();
      const creatorName = await fullName(sb, post.creator_id);
      const route = `/dashboard/business/dragonshare?highlight=${post.id}`;
      await notify(ownerId, 'dragonshare_submission', `${creatorName} shared a post about you`,
        `New ${post.content_type} awaiting your boost decision.`, route, 'star',
        { post_id: post.id, creator_name: creatorName, content_type: post.content_type });
      await upsertNudge(sb, ownerId, 'content', 'dragonshare_posts', post.id,
        `${creatorName} shared a post about you — review & boost it.`,
        [{ label: 'Review & boost', variant: 'primary', action: 'navigate', payload: { route } },
         { label: 'Later', variant: 'ghost', action: 'dismiss', payload: {} }]);
      await postDonnyChatMessage(sb, ownerId, creatorName, post.content_type, route); // submission only
      return ok();
    }

    if (event === 'boost_paid') {
      const { data: boost } = await sb.from('dragonshare_boosts')
        .select('id, post_id, boosting_org_id, creator_payout_cents').eq('id', boost_id).single();
      if (!boost) return ok();
      const pid = post_id ?? boost.post_id;
      const payoutCents = creator_payout_cents ?? boost.creator_payout_cents ?? 0;
      const payoutDollars = Math.round(payoutCents / 100);
      const { data: post } = await sb.from('dragonshare_posts').select('creator_id').eq('id', pid).single();
      const creatorId = creator_id ?? post?.creator_id;
      const businessName = await cleanBusinessName(sb, boost.boosting_org_id);
      if (creatorId) {
        const route = `/dashboard/creator/dragonshare?highlight=${pid}`;
        await notify(creatorId, 'dragonshare_boost', 'Your post got boosted! 🎉',
          `${businessName} boosted your content — $${payoutDollars} is on the way.`, route, 'dollar',
          { post_id: pid, boost_id: boost.id, payout_dollars: payoutDollars, business_name: businessName });
        await upsertNudge(sb, creatorId, 'payment', 'dragonshare_boosts', boost.id,
          `${businessName} boosted your post — $${payoutDollars} is on the way!`,
          [{ label: 'View', variant: 'primary', action: 'navigate', payload: { route } }]);
      }
      const ownerId = await resolveOrgOwner(sb, boost.boosting_org_id);
      if (ownerId) {
        await notify(ownerId, 'dragonshare_boost_receipt', 'Your boost is live',
          `Your boosted content is drafted for one-tap posting.`, '/dashboard/business/social', 'check',
          { post_id: pid, boost_id: boost.id });
        await upsertNudge(sb, ownerId, 'content', 'dragonshare_boosts', boost.id,
          `Your boost is live — review the draft and post it.`,
          [{ label: 'Review draft', variant: 'primary', action: 'navigate', payload: { route: '/dashboard/business/social' } }]);
      }
      return ok();
    }

    if (event === 'declined') {
      const { data: post } = await sb.from('dragonshare_posts').select('id, creator_id').eq('id', post_id).single();
      if (!post) return ok();
      const route = `/dashboard/creator/dragonshare?highlight=${post.id}`;
      await notify(post.creator_id, 'dragonshare_declined', 'Not selected this time',
        `A restaurant passed on this post — your content's still great. Share more and keep earning!`, route, 'default',
        { post_id: post.id });
      await upsertNudge(sb, post.creator_id, 'content', 'dragonshare_posts', `${post.id}-declined`,
        `A restaurant passed this time — share more, keep earning!`,
        [{ label: 'Share more', variant: 'primary', action: 'navigate', payload: { route: '/dashboard/creator/dragonshare' } }]);
      return ok();
    }

    return ok();
  } catch (e) {
    console.error('[dragonshare-notify] error:', (e as Error).message);
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: json(req) });
  }
});
```

Helpers to implement in-file:
- `resolveOrgOwner(sb, orgId)` → `org_members` where `org_id=orgId, role='owner', invitation_status='active'` limit 1 → `user_id` (or null).
- `fullName(sb, userId)` → `profiles.full_name` (fallback `'A creator'`).
- `cleanBusinessName(sb, orgId)` → coalesce the owner's `business_profiles.business_name`, else `organizations.name`, else `'A restaurant'` (mirror `resolve_dragonshare_orgs`).
- `postDonnyChatMessage(sb, ownerId, creatorName, contentType, route)` → find-or-create `donny_conversations` (`user_id=ownerId, archived_at is null`, newest; else insert), insert `donny_messages` (`role:'assistant'`, content names the creator + content type, `quick_actions:[{label:'Review & boost', action:'navigate', url: route},{label:'Later', action:'dismiss'}]`), bump `last_message_at`. Wrap in try/catch.
- `ok()` / `json(req)` small helpers returning 200 JSON with `corsHeaders`.

Note: `boost_status` writes are guarded by a trigger (`trg_ds_posts_block_self_verify`) — this function never writes them, so no conflict. The `donny_nudges.type` values used are all CHECK-valid (`content`, `payment`).

- [ ] **Step 2: Deploy and smoke-test**

Deploy via Supabase MCP `deploy_edge_function` (name `dragonshare-notify`). For a function called server-to-server and from the authenticated frontend, set `verify_jwt: false` (it authorizes via the service key it holds; the frontend invoke still sends the anon/JWT which is fine). Confirm with `get_edge_function`.
Smoke-test each branch with a real id from the DB (use `execute_sql` to grab a `post_id`/`boost_id`), invoking via `curl` or MCP, and confirm a `push_notifications` row + `donny_nudges` row (+ `donny_messages` for submission) appear. Clean up test rows after.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/dragonshare-notify/index.ts
git commit -m "feat(dragonshare): add dragonshare-notify fanout edge function (bell + email + Donny)"
```

---

## Task 4: Invocation wiring (frontend + fulfill-boost)

Add the new path. During the interim (until Task 5 retires the raw inserts), the boost/decline creator bell may appear twice — this is the safe failure mode (no gap). Keep tasks 4 and 5 close together.

**Files:**
- Modify: `src/hooks/useDragonShare.ts` (`useSubmitDragonSharePost` `onSuccess`)
- Modify: `src/hooks/useDeclineDragonSharePost.ts` (`onSuccess`)
- Modify: `supabase/functions/_shared/fulfill-boost.ts` (after the post is marked boosted, on the non-`alreadyDone` branch)

- [ ] **Step 1: Submit hook fires submission notify**

In `useSubmitDragonSharePost`, capture the inserted row id and invoke notify in `onSuccess` (fire-and-forget; never block the success dialog):

```ts
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: KEYS.creatorPosts(user?.id) });
      if (data?.id) {
        supabase.functions.invoke('dragonshare-notify', {
          body: { event: 'submission', post_id: data.id },
        }).catch((e) => console.warn('dragonshare-notify (submission) failed:', e));
      }
    },
```
(`mutationFn` already returns the row with `id`.)

- [ ] **Step 2: Decline hook fires declined notify**

`useDeclineDragonSharePost` currently discards the postId after the RPC. Pass it into `onSuccess`:

```ts
    mutationFn: async (postId: string) => {
      const { error } = await supabase.rpc('decline_dragonshare_post', { p_post_id: postId });
      if (error) throw error;
      return postId;
    },
    onSuccess: (postId) => {
      toast.success('Passed — no payment made. The creator keeps their post.');
      queryClient.invalidateQueries({ queryKey: ['dragonshare-posts'] });
      supabase.functions.invoke('dragonshare-notify', {
        body: { event: 'declined', post_id: postId },
      }).catch((e) => console.warn('dragonshare-notify (declined) failed:', e));
    },
```
Add the `supabase` import if not present.

- [ ] **Step 3: fulfill-boost fires boost_paid notify**

In `_shared/fulfill-boost.ts`, on the non-`alreadyDone` branch (after the `dragonshare_posts` update at line 74, alongside the existing social-hook block), add a fire-and-forget call passing the values already in scope:

```ts
  // DragonShare notifications (fire-and-forget)
  try {
    await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/dragonshare-notify`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
      },
      body: JSON.stringify({ event: "boost_paid", boost_id: boostId, post_id: postId, creator_id: creatorId, creator_payout_cents: creatorPayoutCents }),
    });
  } catch (e) {
    console.warn("[fulfill-boost] dragonshare-notify failed (non-blocking):", e);
  }
```
This is the sole completion point and is idempotent, so it covers both the `boost-payment` and `stripe-webhook` callers exactly once.

- [ ] **Step 4: Deploy + build**

Deploy the two edge functions that changed: redeploy `boost-payment` and `stripe-webhook` (they bundle `_shared/fulfill-boost.ts`) via Supabase MCP, preserving `verify_jwt`. Run `npm run typecheck` and `npm run build` (frontend) → success.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useDragonShare.ts src/hooks/useDeclineDragonSharePost.ts supabase/functions/_shared/fulfill-boost.ts
git commit -m "feat(dragonshare): invoke dragonshare-notify on submit, decline, and boost fulfillment"
```

- [ ] **Step 6: Verify the new path in production (before Task 5)**

After Lovable deploys the frontend (poll bundle hash), use the test accounts: creator (`damewillie@gmail.com`) submits a post to Harbormill → confirm the restaurant (`dwilliams@harbormill.net`) gets the bell, email, Donny chat message + nudge. Decline → creator gentle bell + email. (Boost re-verified in Task 5.) Only proceed to Task 5 once submission + decline notifications are confirmed via the new path.

---

## Task 5: Retire the raw push inserts (migration) — after Task 4 verified

Now that `dragonshare-notify` owns delivery, remove the duplicate raw `push_notifications` inserts from the two SQL functions. Keep their state changes + `dragonshare_events` logging.

**Files:**
- Create: `supabase/migrations/20260601190000_dragonshare_retire_raw_notif_inserts.sql`

- [ ] **Step 1: Write the migration**

`CREATE OR REPLACE` both functions, copying their current bodies (from `20260601140000_dragonshare_notifications.sql` and `20260601180000_...`) but deleting the `push_notifications` INSERT blocks:
- `trg_ds_boost_accepted_fn()` — keep the `dragonshare_events` insert; **remove** the `push_notifications` insert + its `BEGIN..EXCEPTION` wrapper and the now-unused name lookups.
- `decline_dragonshare_post(p_post_id uuid)` — keep the membership guard, in-progress-boost guard, `declined_at` update, and `dragonshare_events` insert; **remove** the `push_notifications` insert block.

- [ ] **Step 2: Apply via Supabase MCP and commit as a file**

Apply with `apply_migration` (name `dragonshare_retire_raw_notif_inserts`). Verify with `execute_sql` that `pg_get_functiondef('trg_ds_boost_accepted_fn'::regproc)` no longer contains `push_notifications`.

```bash
git add supabase/migrations/20260601190000_dragonshare_retire_raw_notif_inserts.sql
git commit -m "fix(dragonshare): retire raw push inserts now that dragonshare-notify owns delivery"
```

- [ ] **Step 3: Mandatory regression re-verify**

With the test accounts, run a real test boost → confirm the creator still gets exactly **one** boost-paid bell + email, and the restaurant gets the receipt. Decline another post → creator gets exactly one gentle bell. (This is the just-fixed path — confirm no gap and no double.)

---

## Task 6: DragonShare activity hooks + derive helper (frontend)

Pure mapping helper (unit-tested) + two React Query hooks that read RLS-readable tables. No `dragonshare_events`.

**Files:**
- Create: `src/lib/dragonshareActivity.ts`
- Test: `src/lib/dragonshareActivity.test.ts`
- Create: `src/hooks/useCreatorDragonShareActivity.ts`
- Create: `src/hooks/useBusinessDragonShareActivity.ts`

- [ ] **Step 1: Write failing tests for the derive helper**

Create `src/lib/dragonshareActivity.test.ts`. Define the shape and behavior:

```ts
import { describe, it, expect } from 'vitest';
import { deriveCreatorActivity, type DSPostRow } from './dragonshareActivity';

const base: DSPostRow = {
  id: 'p1', content_type: 'video', submitted_at: '2026-06-01T10:00:00Z',
  boost_status: 'available', declined_at: null, boosts: [],
};

describe('deriveCreatorActivity', () => {
  it('marks a boosted post as paid with payout', () => {
    const rows: DSPostRow[] = [{ ...base, boost_status: 'boosted',
      boosts: [{ status: 'transferred', creator_payout_cents: 2400, transferred_at: '2026-06-02T10:00:00Z' }] }];
    const out = deriveCreatorActivity(rows);
    expect(out[0]).toMatchObject({ kind: 'paid', payoutCents: 2400, postId: 'p1' });
  });
  it('marks a declined post as not_selected', () => {
    const out = deriveCreatorActivity([{ ...base, declined_at: '2026-06-02T10:00:00Z' }]);
    expect(out[0]).toMatchObject({ kind: 'not_selected', postId: 'p1' });
  });
  it('marks an available post as submitted', () => {
    const out = deriveCreatorActivity([base]);
    expect(out[0]).toMatchObject({ kind: 'submitted', postId: 'p1' });
  });
  it('sorts newest first by effective timestamp', () => {
    const out = deriveCreatorActivity([
      { ...base, id: 'old', submitted_at: '2026-05-01T00:00:00Z' },
      { ...base, id: 'new', submitted_at: '2026-06-01T00:00:00Z' },
    ]);
    expect(out.map(a => a.postId)).toEqual(['new', 'old']);
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

Run: `npx vitest run src/lib/dragonshareActivity.test.ts` → FAIL (module/exports missing).

- [ ] **Step 3: Implement the helper**

Create `src/lib/dragonshareActivity.ts` with `DSPostRow`, `DSActivityItem` (`{ kind: 'submitted'|'paid'|'not_selected'; postId; contentType; timestamp; payoutCents? }`), `deriveCreatorActivity(rows)` (priority: boosted→paid using the transferred boost's `creator_payout_cents`/`transferred_at`; else `declined_at`→not_selected; else submitted; sort desc by effective timestamp), and a `deriveBusinessActivity` variant (awaiting decision = `boost_status==='available' && !declined_at`; boosted = recent boosts). Keep functions <30 lines; no `any`.

- [ ] **Step 4: Run tests — verify they pass**

Run: `npx vitest run src/lib/dragonshareActivity.test.ts` → PASS.

- [ ] **Step 5: Implement the hooks**

- `useCreatorDragonShareActivity`: React Query key `['dragonshare-activity','creator', user?.id]`, `enabled: !!user`. Query `dragonshare_posts` (creator's own) with `boosts:dragonshare_boosts(status, creator_payout_cents, transferred_at)` — same join style as `useCreatorDragonSharePosts` — then `deriveCreatorActivity`, slice top 5. Handle error (return []).
- `useBusinessDragonShareActivity(orgId?)`: key `['dragonshare-activity','business', orgId]`, `enabled: !!orgId`. Reuse the `useOrgDragonSharePosts` query shape for awaiting-decision, plus a `dragonshare_boosts` query (`boosting_org_id=orgId`, `status='transferred'`, recent) for boosts-made; map via `deriveBusinessActivity`.

- [ ] **Step 6: Typecheck + commit**

Run: `npm run typecheck` → exit 0. `npx vitest run src/lib/dragonshareActivity.test.ts` → PASS.
```bash
git add src/lib/dragonshareActivity.ts src/lib/dragonshareActivity.test.ts src/hooks/useCreatorDragonShareActivity.ts src/hooks/useBusinessDragonShareActivity.ts
git commit -m "feat(dragonshare): activity derive helper + creator/business activity hooks"
```

---

## Task 7: Dedicated `DragonShareActivityCard` on both dashboards

**Files:**
- Create: `src/components/dragonshare/DragonShareActivityCard.tsx`
- Modify: `src/pages/CreatorDashboard.tsx` (place after the existing DragonShare stat tile body, in the white content area)
- Modify: `src/pages/BusinessDashboard.tsx` (place in the white content area, near "Your Campaigns")

- [ ] **Step 1: Build the card component**

Props: `{ role: 'creator' | 'business'; items: DSActivityItem[]; isLoading: boolean }`. Card chrome matches the dashboard (`border-2 border-dc-teal rounded-2xl bg-white`), heading "DragonShare Activity". Each row: status pill + label + relative time, linking to the role's DragonShare page (`?highlight=<postId>`). Use **brand colors** for pills (teal/pink), never gray (design rule). States: loading (skeletons), empty ("No DragonShare activity yet" + one-line hint), list (top 5). Responsive: base mobile classes; `lg:` only for desktop spacing — never cross-apply.

- [ ] **Step 2: Wire into the creator dashboard**

In `CreatorDashboard.tsx`: import the card + `useCreatorDragonShareActivity`; render it in the white body `space-y-6` block (e.g. right after "Recent Activity"). Pass `items` + `isLoading`.

- [ ] **Step 3: Wire into the business dashboard**

In `BusinessDashboard.tsx`: import the card + `useBusinessDragonShareActivity(org?.id)`; render it in the white body block near "Your Campaigns". (This is the business dashboard's DragonShare feed presence — see Deviation #2.)

- [ ] **Step 4: Typecheck + build + commit**

Run: `npm run typecheck` → 0. `npm run build` → success.
```bash
git add src/components/dragonshare/DragonShareActivityCard.tsx src/pages/CreatorDashboard.tsx src/pages/BusinessDashboard.tsx
git commit -m "feat(dragonshare): dedicated DragonShare activity card on both dashboards"
```

---

## Task 8: Fold DragonShare into the creator Recent Activity feed

**Files:**
- Modify: `src/hooks/useCreatorRecentActivity.ts`

- [ ] **Step 1: Extend the activity union + fetch**

Add `'dragonshare'` to `ActivityItem['type']`. After the campaign queries, fetch the creator's DragonShare posts (same join as Task 6) and push items: paid → `"{business} boosted your post (+$X)"` (status `'completed'`), not_selected → `"A restaurant passed — share again"` (status `'pending'`), submitted → `"Shared a post — awaiting a boost"` (status `'pending'`). Set `created_at` to the effective timestamp; leave `campaign_id` undefined (so the existing renderer shows it as a non-link row). Reuse `deriveCreatorActivity` from Task 6 to avoid duplicated logic (DRY).

- [ ] **Step 2: Verify ordering still holds**

The existing final `sort` by `created_at desc` + `slice(0,6)` now naturally interleaves DragonShare. No renderer change needed (DragonShare rows have no `campaign_id`, so they render as plain rows). Confirm the creator dashboard still builds.

- [ ] **Step 3: Typecheck + build + commit**

Run: `npm run typecheck` → 0. `npm run build` → success.
```bash
git add src/hooks/useCreatorRecentActivity.ts
git commit -m "feat(dragonshare): fold DragonShare events into creator recent activity feed"
```

---

## Task 9: Final review + production verification

- [ ] **Step 1: Full local gate**

Run: `npm run typecheck` → 0; `npm run lint` → no new errors; `npm run test` (vitest run) → green; `npm run build` → success.

- [ ] **Step 2: Push and let Lovable deploy**

Ensure all edge functions/migrations are already applied (Tasks 2–5). Push frontend to `main`; poll the deployed bundle hash before verifying.

- [ ] **Step 3: Production verification (per project workflow — both viewports, console clean)**

Using the test accounts (creator `damewillie@gmail.com`, restaurant `dwilliams@harbormill.net`):
- **Submission:** creator submits a post to Harbormill → restaurant bell shows "shared a post about you", email received, Donny chat message + nudge appear; clicking routes to the business DragonShare page with the post highlighted.
- **Boost paid:** real test boost → creator gets exactly one payout bell + email; restaurant gets the receipt; both see a nudge.
- **Decline:** restaurant passes a post → creator gets one gentle bell + email.
- **Settings:** the new "DragonShare" row appears in notification preferences (in-app + email on); the bell filter shows a "DragonShare" tab.
- **Dashboards:** creator Recent Activity shows DragonShare rows; the dedicated DragonShare Activity card renders on both creator and business dashboards with correct data, loading, and empty states.
- Test **desktop and mobile** viewports separately; open Chrome DevTools and confirm **no console errors** on both roles/viewports.

- [ ] **Step 4: Dispatch the final whole-implementation code review**

Per superpowers:subagent-driven-development, dispatch a final code-reviewer over the full set of commits before finishing the branch.

---

## Notes for the implementer

- **Deploy model:** push to `main` deploys the **frontend only** (Lovable). All edge-function deploys and migrations go through Supabase MCP separately **and** must be committed as files. Preserve each edge function's `verify_jwt` flag on redeploy.
- **No `pg_net`/GUC dependency** anywhere in this work — that path is unset/broken in prod (see spec §2.1). Do not add triggers that call edge functions.
- **Design system:** brand colors only — never gray backgrounds/badges (use teal/pink). Pill buttons (`rounded-full`). Desktop = `lg:`/`xl:` classes; mobile = base classes; never cross-apply.
- **DRY:** `deriveCreatorActivity` is shared by Task 6 (card) and Task 8 (feed). Don't duplicate the status logic.
- **Out of scope:** SMS; Donny chat messages for non-submission events; backfilling history; the pre-existing campaign-nudge GUC gap (track separately).
