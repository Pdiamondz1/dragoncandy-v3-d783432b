# 2026-08-10 — `can_notify_user`'s crew clause was forgeable (#440)

Immutable session source. Follows #419 (publish broadcast → choke point), whose review surfaced this.

## What was wrong

`can_notify_user`'s crew clause joined `creator_group_members` with **no membership-status
filter**. Three facts composed into a hole:

1. `creator_groups` INSERT policy `cg_owner_all` is `WITH CHECK (owner_id = auth.uid())` — **any**
   authenticated user may create a crew. No role check, no business-account requirement.
2. `cgm_owner_insert` is `WITH CHECK (is_creator_group_owner(...) AND status='invited')` —
   **`creator_id` is entirely unconstrained**; the owner names whoever they like.
3. The clause filtered no status.

⇒ Two INSERTs, no consent, a notification channel from any authenticated user to **any** user on
the platform. Proven on prod inside a rolled-back transaction:

```
baseline_can_notify = f   crew_insert_ok = t
member_insert_ok    = t   after_can_notify = t
```

The **actor** was never forgeable (`create-notification` derives `actorId` from the JWT). The
**words and the link were** — on any of the 26 mapped notification types, i.e. a DragonCandy-branded
transactional email with attacker-chosen copy.

## Why the obvious fix would have been a regression

Adding `m.status = 'active'` alone breaks two flows, because neither is active when it fires:

| type | direction | status AT NOTIFY TIME |
|---|---|---|
| `group_invitation` | owner → creator | `invited` (the invite itself) |
| `group_membership_removed` | owner → creator | `removed` — `useCreatorGroupMembers.removeMember` UPDATEs to `removed` **before** dispatching |

Relaxing to `IN ('active','invited','removed')` excludes only `declined` and fixes nothing. This is
the same shape that silently killed 7 working email flows during #387.

## Why `status = 'active'` is nonetheless the right predicate

**An owner cannot write it.** Proven on prod **with a control**, because two denials alone could
just mean a broken probe:

| attempt | result |
|---|---|
| INSERT `status='active'` | **42501** |
| UPDATE to `'active'` | **42501** |
| UPDATE to `'removed'` (control) | **succeeds** |

The only writer of `'active'` is `respond_to_group_invitation()` (SECURITY DEFINER), gated
`WHERE creator_id = auth.uid() AND status='invited'`. The only trigger on the table is
`handle_updated_at`. So `'active'` means **the creator themselves accepted** — a genuine consent
signal, and exactly what a general-purpose channel should require.

## The fix (two halves; the second is not optional)

1. **Migration** — crew clause requires `m.status = 'active'`. The clause now reads honestly: a
   *mutual* crew relationship.
2. **`create-notification`** — a `CREW_COLD_CONTACT_TYPES` branch authorizes the two cold-contact
   types against the **membership row** (caller owns the crew, recipient is the named member,
   status matches the type) and **composes their copy server-side**.

Without (2), (1) would just relocate the hole — "you may notify anyone you can name in a crew row"
is the same problem with extra steps. With (2), a forged row buys an attacker nothing but a
genuine-looking crew invitation *in our own words*, pointed at a fixed in-app URL — which any
business can already legitimately send. Mirrors the existing `content_liked` pattern.

Unaffected, verified at their call sites: `group_campaign_posted` (query already filters `active`),
`group_invite_accepted` (fires after accept), crew `content_submitted`.

## Two live bugs found in review, fixed in the same PR

- **The transactional email could be redirected.** `recipientUserId` was spread **first** in the
  outbound payload, so caller-controlled `data`/`emailData` overwrote it. `send-notification-email`
  skips its `recipientUserId !== caller → 403` guard for service callers — and `create-notification`
  calls it *as* service — so a caller could authorize trivially against themselves
  (`p_actor = p_recipient`) and have a branded email delivered to a **third party, with no
  `push_notifications` row recording it**. Now pinned last.
- **`forceDelivery` overrode the recipient's email opt-out** for user-authenticated callers — the
  one control the "no more than a business can already do" reasoning depends on. Zero callers
  anywhere in `src/` or any edge function, so it is now service-only.

## The repo could not rebuild prod's `can_notify_user`

`supabase_migrations.schema_migrations` records **`20260808120130 can_notify_user_active_relationships`**
with **no file in `supabase/migrations/`** — applied directly via MCP during #387/#396 and never
written back. Consequently the repo body lacked the conversation `left_at` and org
`invitation_status` clauses that prod has (verified case-insensitively; only two files ever defined
the function). **A clean `supabase db push` would have produced the LOOSER function and silently
dropped two authorization tightenings.** `recorded ≠ actual`, in the opposite direction from #325
(recorded but objects missing) and #385. #440 codifies prod's real body, closing this instance —
the class is still unguarded.

## A guard I rejected

Requiring `responded_at IS NOT NULL` for removals, to prove prior membership.
`information_schema.column_privileges` shows **`authenticated` holds UPDATE on `responded_at`**, and
an RLS `WITH CHECK` cannot pin a column (there is no `OLD` row in a policy) — that needs column
GRANTs, exactly as `campaign_invitations` (`20260808010000`) had to do. So it is forgeable by the
same owner and would have been decoration. The overclaiming comment was corrected instead.

**Residual, stated rather than hidden:** an owner can still put a crew-flavoured bell in any user's
feed — bell-only for removal, server-worded for both, fixed URL. Closing it needs a column-grant
revoke or membership history.

## Deploy ordering — the REVERSE of the usual rule

**`create-notification` first, migration second.** The normal rule here is migration-before-code.
Not this time: the code change makes the two cold-contact types stop consulting `can_notify_user`
entirely, so they work under **both** the old and new function bodies. Applying the migration first
would have 403'd every crew invitation and removal until the deploy landed.

## Verification (all on prod)

- Attack re-run against the **live** function after deploy: `forged_row_grants=f`,
  `after_genuine_accept=t`, `self_notify_CONTROL=t` — all rolled back.
- ACL: `anon_exec=false`, `auth_exec=false`, `service_role=true`, `prosecdef=1`.
- Other clauses intact: conversation `left_at`, org `invitation_status`, sponsorship.
- `create-notification` **v53** deployed and boot-verified (its own JSON 401, OPTIONS 200).
- `edge-function-reviewer` **PASS** — `_shared` byte-compared against the live v52 bundle, zero drift.
- `data-exposure-reviewer`: 1 high + 3 low, all addressed or explicitly rejected with reasons.
- **Codex clean.** `deno check`, typecheck, build clean; 239 files / 2381 tests green.

## Note on a reviewer claim that was wrong

A reviewer asserted the **org** clause also lacked its status filter and that `DATABASE_SCHEMA.md`
was false about it. Both wrong — prod filters `invitation_status='active'` on both org sides and
always did. Only the **crew** clause was open. Verified against prod `pg_get_functiondef`, not
migration text. A finding is a lead, not a verdict.
