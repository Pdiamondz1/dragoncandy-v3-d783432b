# Session — invitation/application integrity + `create-notification` authorization

**Date:** 2026-08-08
**Branches:** PR #387 (`fix/invitation-integrity`, open) · `fix/notification-authorization`
**Predecessor:** PR #382 (AI Creator Match auto-run + invite clarity), already synced
**Prod state:** migrations `20260808010000` · `20260808020000` · `20260808030000` applied;
`create-notification` deployed through **v46**; `send-campaign-invitation` **v63**.

Three authorization holes, all pre-existing, all found while shipping the invite-clarity UX
of #382 rather than by looking for them. Each was **proven on prod inside a rolled-back
transaction** before being fixed, and re-proven after. None was introduced by #382.

---

## 1. `campaign_invitations` UPDATE — forged status, repointed campaign

The policy was `USING (auth.uid() = creator_id)` with **no `WITH CHECK`**.

**I got this wrong first and had to correct it to the founder.** I claimed `creator_id` was
rewritable. It was not: **Postgres defaults an omitted `WITH CHECK` on UPDATE to the `USING`
expression**, so `creator_id` *was* pinned — verified, not assumed. The real hole was
everything else the row carried:

- **Forged `status='accepted'`** with no application behind it. The owner's match card then
  reads "Applied — review them" (the very badge #382 had just added) pointing at nothing.
- **Repointed `campaign_id`.** This one manufactures apply rights, because an *invited*
  creator may apply to a campaign that has left `published`.

Fixed by `20260808010000`: `USING (creator AND status='pending')` /
`WITH CHECK (creator AND status='declined')` — decline-only — **plus column privileges**:

```sql
revoke update on public.campaign_invitations from authenticated, anon;
grant  update (status) on public.campaign_invitations to authenticated;
```

The GRANTs are not belt-and-braces. **RLS `WITH CHECK` sees only the NEW row — there is no
`OLD` in a policy** — so "`campaign_id` must not change" is *inexpressible* as a policy.
Column privileges are the only correct tool for that class.

The migration self-asserts the resulting grant set is exactly `authenticated:status`, and
the assertion's filter includes **`PUBLIC`** — a table-wide `GRANT … TO PUBLIC` is recorded
under that grantee, so omitting it would have made the assertion unfailable.

`useDeclineInvitation`, the one legitimate client write, still works.

## 2. `apply_to_campaign` — eligibility checked on only one branch

The RPC checked eligibility **only** on its `group_id IS NOT NULL` (crew) branch. For an
ordinary campaign it fell through to the INSERT with no status check and no role check —
and being `SECURITY DEFINER` it **bypassed the `campaign_applications` INSERT policy that
carries exactly those rules** via `can_create_application`.

Proven: impersonating a real creator, someone with no invitation applied to an **`active`**
campaign that already had a hired creator. Draft/completed/cancelled were equally reachable.

The fix calls **the policy's own predicate** rather than re-implementing it — two copies of
an authorization rule drift, one does not — OR-ed with "has a non-`rejected` application
already", because the RPC is an upsert and that is how counter-offers amend a row the
creator legitimately holds.

> **The durable lesson: a `SECURITY DEFINER` RPC silently opts out of the RLS policy
> protecting the table it writes.** Here the policy was correct the entire time; the
> function simply never consulted it. Whenever a DEFINER RPC writes an RLS-protected table,
> check that it re-asserts the policy's predicate.

## 3. `create-notification` — authenticated its caller, then discarded it

The function called `auth.getUser()` and **never referenced the `user` object again**.
Every field written — including `recipientId` and `actorId` — came from the request body and
was inserted with the **service role**. For any type in `NOTIFICATION_TYPE_TO_EMAIL_TYPE` it
also sent a **real outbound email**.

So any authenticated user could put a notification with arbitrary text and an arbitrary
in-app link into **any** other user's feed, attributed to **any** actor, and email them.

Sharpening it: [[Notification Delivery]] documents `send-notification-email` as having a
self-only gate *specifically to prevent email enumeration* — and then instructs all frontend
code to route around that gate through `create-notification`, because its internal send uses
the service key. **The recommended path around the guard had no guard of its own.**

### The fix, in three layers

**Layer 1 — derive the actor from the JWT.** Verified first: every `actorId` anywhere in
`src/` is already the caller's own id, so this is a no-op for every real call site and
removes impersonation outright. `actorName` is resolved server-side too, since a
caller-supplied display name is what makes a spoofed notification convincing.

**Layer 2 — a recipient gate, `can_notify_user(actor, recipient)`.** Clause set derived two
independent ways and cross-checked:

- **Backtested** against all 91 actor-bearing rows in `push_notifications` (18 types,
  May–Aug 2026). Campaign ∪ conversation ∪ crew ∪ org covers **89/91**.
- **Enumerated** across all 32 client call sites — which caught what history could not,
  because the type had never fired on prod: **sponsorship** (brand ↔ restaurant via
  `campaign_sponsorships`). Added.

Note the indirection that made sponsorship easy to get wrong: `brand_id`/`restaurant_id` are
FKs to `business_profiles.id`, **not** `auth.users`. Comparing them to a user id would never
match — and would fail *silently*, as a 403 nobody could explain.

**A correction I made to my own design mid-build:** I had flagged cold contact from a public
profile (`ContactCreatorModal` / `ContactRestaurantModal`) as a case needing its own
exemption. It does not. Both modals `await` conversation creation *before* notifying, so
`conversation_participants` rows already exist and the conversation clause covers them. There
is deliberately **no "open type" branch** — but this rests on an ordering dependency, so if
that sequencing is ever inverted, cold contact will start silently 403ing.

**Layer 3 — server-composed copy where the caller must not choose the words.** Applies to
`content_liked`, the one type reachable with no prior relationship (anyone may like a public
post). It is authorized against the **referenced post** instead — the recipient must own the
content — and since ownership is the *only* check, free-text `title`/`body`/`actionUrl` would
leave exactly the stranger-phishing vector this change exists to close. So the server writes
that copy.

Result: 89/89 real notifications still pass, 0 blocked. Across every user pair, **30 allowed
/ 1,692 blocked**.

---

## The Codex loop — six rounds, six real findings, all mine

Every round found something genuine in my own work; round 6 came back clean. Recording them
because the *pattern* is the lesson, not any single defect.

| Round | Finding | Why it mattered |
|---|---|---|
| 1 | `content_liked` still a stranger-phishing vector | Undercut the exact claim the change made |
| 1 | `left_at` / `invitation_status` ignored | Stale relationships authorized live ones |
| 2 | Templating **bypassable** — `data` spread *after* the server's values | The fix didn't hold |
| 2 | Ignoring `emailType` **killed 7 legitimate email flows** | A regression I introduced |
| 3 | Flat allow-list permitted **template confusion** | `type: content_liked` + `emailType: sponsorship_completed` |
| 4 | `file_uploaded` still let the client pick the **role** variant | Type bound; role inside it not |
| 5 | The undetermined-role **fallback** re-opened round 4 | Omitting `collaboration_id` forced the creator template |
| 6 | — clean — | |

**Round 5 is the most instructive, because I had considered that exact case and argued myself
out of it.** I let an underivable role fall through to the type map's `file_uploaded_by_creator`,
reasoning it was "the same email this type has always sent when no `emailType` was supplied, so
not a regression." True, and irrelevant: because the client no longer sends `emailType`, omitting
`data.collaboration_id` had become the *only* remaining way to choose the wrong role-worded
email — a shorter route to the defect round 4 closed.

> **"No worse than before" is the wrong bar.** The test is whether the claim the code now makes
> — that this variant comes from database facts — is actually true. A fallback that lets the
> caller opt out of a derivation defeats the derivation, however defensible it looked in
> isolation.

The fix suppresses the **email only**; the bell row is already written, so the recipient still
learns about the upload, and we simply decline to send mail asserting a role we could not
verify. Checked (not assumed) that no legitimate flow loses mail — that check is exactly what
round 2 caught me skipping.

**The through-line: I kept answering "is this value allowed?" when the question was "allowed
*for what*?"** Each fix was correct as far as it went and left the next gap open. Round 3
bound the template to its notification type; round 4 found the one type that *carries a role*,
so binding the type wasn't enough.

Round 4's fix derives the file-upload variant from the collaboration — the caller is either
its `creator_id` or the campaign's `user_id`, both database facts. Both sides are checked
explicitly rather than inferring "not the creator ⇒ the business", because several people can
pass the relationship gate on one campaign while only two are parties to that collaboration.
Verified over all 16 real collaborations on prod: every one resolves a definite role on both
sides, 0 ambiguous, 0 orphan campaigns — so the "undetermined" fallback never fires for a
legitimate caller.

With the role derived, every remaining client-selectable template is `emailType === type`, so
the keyed map collapsed to a Set plus an identity check.

**Round 2's second finding is the one to remember**: tightening a security control silently
broke 7 working email flows. Ignoring an untrusted input is not automatically safe — it is a
behaviour change, and it needs the same "what does this break?" pass as any other.

## Verified / not verified

**Verified.** Migrations `20260808010000`/`020000`/`030000` applied and each hole re-proven
closed. `create-notification` **boot-checked on prod after the final deploy** — an anon-key POST
returned the *function's own* `{"error":"Unauthorized"}` (not the platform's `{"code":401,…}`),
proving the module loaded and `_shared/cors.ts` bundled, with nothing written and no mail sent.
The `file_uploaded` derivation was checked against **all 16 real collaborations** on prod: every
one resolves a definite role on both sides, 0 ambiguous, 0 orphan campaigns. Codex clean at
round 6; `edge-function-reviewer` PASS.

**Not verified.**

- **The both-viewport visual pass on PR #382's UI has NOT been run.** Not a code concern — it
  needs a signed-in prod session, and the tab sat on `/auth` throughout. Unrun, not passed.
- No `create-notification` request has exercised the new paths with a **real user JWT** — prod
  has had zero traffic on this function in 24h (pre-revenue). The authorization logic is proven
  at the SQL layer (`can_notify_user`: 89/89 historical rows pass, 1,692/1,722 cross-user pairs
  refused) and the function boots, but the end-to-end path is unexercised.

## See Also

- [[Notification Delivery]] — the choke point this hardened; its `emailType ?? map[type]`
  line documented the hole as a feature
- [[Service-Role Data Exposure]] — the defect class: service-role code bypassing RLS
- [[Campaign Invitations]] — what an invitation is, and why "Invite" is a nudge to apply
