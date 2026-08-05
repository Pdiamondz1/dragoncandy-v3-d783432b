# Live cross-tenant metric read via `social_post_log` (found 2026-08-05)

Surfaced by the `data-exposure-reviewer` during measurement-spine Task 5, then verified
independently against prod RLS. **Pre-existing and live today** — not introduced by the
measurement-spine branch, though that branch increases the traffic through the same path.

## The chain, every link verified on prod

1. **Anyone authenticated can write any `outstand_post_id`.**
   `social_post_log` INSERT policy: `with_check (auth.uid() = user_id)`. It constrains *who owns
   the row* and nothing else. `outstand_post_id` is unconstrained.

2. **A cron job then fetches that post's real analytics.**
   `content-performance-capture` (service role) enumerates `social_post_log`, and for each row
   calls `GET /posts/{outstand_post_id}/analytics` with the **org-wide** `OUTSTAND_API_KEY` —
   which can read every post in the DragonCandy Outstand org, not just the caller's. It writes
   `content_performance` with `user_id = <the row's user_id>`.

3. **The planter reads the result.**
   `content_performance` SELECT policy: `(select auth.uid()) = user_id`. Own-row — and the row
   was created under the planter's id.

**Net:** any authenticated user can harvest another tenant's post-level engagement metrics by
inserting one row naming that tenant's Outstand post id. No service-role access needed, no
signature, no admin role. Exposure is engagement metrics (views/likes/reach/etc.), not
credentials or PII.

**Difficulty:** requires knowing or guessing an Outstand post id. They are short base62 strings
(`9dyJS`), so guessing a *specific* victim's id is impractical but enumeration is not obviously
infeasible, and a collaborator on a campaign may simply know one.

## The second, related hole

The same shape exists on the webhook path that measurement-spine Task 5 extends.
`outstand-webhook` matches `donny_scheduled_posts` on `metadata->>'outstand_post_id'` with no
owner scoping, and that table's INSERT policy is `with_check (user_id = auth.uid())` — **metadata
contents are entirely unchecked**. So a planted row can capture a genuine `post.published` event
for someone else's post.

## Why the obvious fix does not work

The natural remedy — verify the schedule row's `user_id` owns one of the event's
`socialAccounts[].accountId` via `business_outstand_accounts` — is **circular**. That table's
INSERT policy is:

```
with_check ((user_id = auth.uid()) AND (business_id IN (select id from business_profiles where user_id = auth.uid())))
```

It constrains `user_id` and `business_id` but **not `outstand_social_account_id`**. A user can
claim any provider account id, so the ownership table is itself client-asserted and cannot be
trusted as an authority. The reviewer flagged this caveat and it is correct.

## What an actual fix looks like

The root cause is that **provider-account ownership is asserted by the client instead of
established by the server.** Sketch, in dependency order:

1. `business_outstand_accounts.outstand_social_account_id` becomes **server-written only** — set
   by the OAuth callback with the service-role key — plus a UNIQUE constraint so one provider
   account maps to at most one DragonCandy user. Revoke client INSERT/UPDATE of that column.
2. With ownership trustworthy, `outstand-webhook` can require the matched schedule row's
   `user_id` to own one of the event's account ids, and `content-performance-capture` can require
   the same of each `social_post_log` row before spending an API call on it.
3. Drop the client INSERT policy on `social_post_log` once the webhook is the proven writer —
   sequencing matters, because `DonnyProvider` and `useSponsorshipAmplification` still insert
   client-side today and only DonnyProvider supplies `dragonshare_post_id`.

Step 1 is an auth change. Per CLAUDE.md it needs explicit founder confirmation before anyone
touches it, and it is out of scope for the measurement spine.

## Status

- Measurement-spine **Task 5 code does not create this** and is not blocked by it.
- **Deploying `outstand-webhook` should wait** for a decision, since the deploy is what starts
  routing new rows through the unverified path at volume.
- Related: [[Service-Role Data Exposure]] — same family as the findings remediated in #307/#308.
