# Handoff — `create-notification` authorization

**Date:** 2026-08-08
**Status:** scoped and designed, NOT yet built
**Predecessor work:** PR #382 (invite UX), PR #387 (two authorization holes, migrations already applied to prod)

## The problem

`supabase/functions/create-notification/index.ts` performs **zero authorization**.

Lines 82–97 authenticate the caller — and then **discard the `user` object entirely**; it is never
referenced again. Everything written on line 115 comes from the request body:

```ts
recipientId, type, category, title, body, actionUrl, actorId, actorName, icon, data, emailData
```

…and is inserted into `push_notifications` with the **service role**. For types present in
`NOTIFICATION_TYPE_TO_EMAIL_TYPE` it also triggers a **real outbound email** to the recipient.

So any authenticated user can put a notification with arbitrary text and an arbitrary in-app link
into **any** other user's feed, attributed to **any** actor, and cause them to be emailed.

Pre-existing; surfaced by the `data-exposure-reviewer` pass on PR #387. Not widened by that PR.

## What is already established (do not redo this)

### 1. `actorId` can be derived from the JWT with zero breakage — VERIFIED

`grep -rhn "actorId:" src/` returns **every** occurrence as `user.id` / `user!.id` / `user?.id`,
or threaded through a helper whose callers pass the same, or a test fixture (`'owner1'`). No
legitimate caller ever passes a different actor.

⇒ Deriving `actorId` server-side from the verified caller is a **no-op for every real call site**
and removes impersonation outright. This is the single highest-value, lowest-risk change. Do it
unconditionally for non-service callers.

### 2. A generic relationship rule backtests at 89/91 — VERIFIED against prod

`push_notifications` holds 143 rows (91 with an actor, 18 distinct types, May–Aug 2026). A rule of
"actor and recipient share a **campaign** (owner ↔ applicant/collaborator/invitee), a
**conversation**, a **crew**, or an **org**" was backtested against all 91 actor-bearing rows:

| type | n | would pass | would block |
|---|---|---|---|
| content_liked | 2 | 0 | **2** |
| campaign_invitation | 30 | 30 | 0 |
| counter_offer_responded | 14 | 14 | 0 |
| application_received | 11 | 11 | 0 |
| counter_offer_received | 11 | 11 | 0 |
| application_accepted | 7 | 7 | 0 |
| file_uploaded | 6 | 6 | 0 |
| message_received | 4 | 4 | 0 |
| group_invitation | 3 | 3 | 0 |
| group_invite_accepted | 3 | 3 | 0 |

Column names that cost time: `org_members.org_id` (NOT `organization_id`), `creator_groups.owner_id`,
`creator_group_members.creator_id`, `dragonshare_posts.creator_id`.

### 3. The backtest is NOT sufficient on its own — THE KEY FINDING

Enumerating all 32 client call sites (`grep -rn "recipientId:" src/`) found **two classes the
backtest could never have caught, because neither type has ever fired in prod**:

- **Sponsorship** — `useSponsorshipComplete.ts` (4 sites), `useSponsorshipProposals.ts` (1).
  Brand ↔ restaurant via `campaign_sponsorships`. Not modelled by the four clauses. Add it.
- **Cold contact** — `components/creator-profile/ContactCreatorModal.tsx:77` and
  `ContactRestaurantModal.tsx:49`. These reach someone from their **public profile**, with no
  prior relationship.

  **CORRECTED during the build — this is NOT a gap.** Both modals `await
  createConversation.mutateAsync(...)` *before* sending, so a `conversation_participants` row
  already exists by the time any notification fires, and the conversation clause covers it. I
  flagged it as an open type and was wrong; the fix is simpler than this handoff first said.

⇒ The only genuinely uncovered type is **`content_liked`**. No "open" bucket and no server-side
templating layer is required (see the Design section, amended).

## The design

Three layers. Layer 1 stands alone and can ship first.

**Layer 1 — derive `actorId` from the verified JWT.** Unconditional for non-service callers.
Ignore any body-supplied `actorId`/`actorName`; resolve the display name server-side. Zero
breakage (see §1). Kills impersonation.

**Layer 2 — per-type recipient policy.** Not one blanket rule. Three buckets:

| bucket | types | rule |
|---|---|---|
| relationship-bound | everything except `content_liked` | `can_notify_user(actor, recipient)` — campaign ∪ conversation ∪ crew ∪ org ∪ **sponsorship** |
| entity-referenced | `content_liked` | verify `data.content_id` → `dragonshare_posts.creator_id = recipientId`. Server-verifiable, not client-assertable |

Service-role callers (`isService`, all 6 edge-function call sites) bypass entirely — unchanged.
Fail closed: if the authorization check itself errors, return 503, because an unavailable check is
not permission.

**Layer 3 — server-side templating — NOT NEEDED for this pass.** It existed to protect the "open"
bucket, and the open bucket turned out to be empty (see the correction in §3). Arbitrary
`title`/`body`/`actionUrl` is still a latent concern in principle, but with every caller now
required to have a real relationship with the recipient, it is no longer a stranger-phishing
vector. Making `create-notification` a type-safe templated RPC across all 32 call sites remains a
worthwhile future refactor, not a security blocker.

## Build order

1. Layer 1 alone, deploy, verify a real notification still works end-to-end.
2. `can_notify_user(actor, recipient)` as `SECURITY DEFINER`, `search_path=public`,
   service-role-only EXECUTE. **Re-run the backtest against `push_notifications` after writing
   it** — it must still return ≥89/91, and the 2 `content_liked` rows must be covered by the
   entity rule.
3. Layer 2 wiring with the per-type buckets, then Layer 3 templating for the open bucket.

## Traps

- **Fail-closed is only safe once every one of the 32 call sites is classified.** The list is in
  §3; re-derive it with `grep -rn "recipientId:" src/` if the code has moved on.
- `create-notification` deliberately does **not** email `campaign_invitation`
  (`create-notification/index.ts:26-28`) because `send-campaign-invitation` owns that email. Don't
  "fix" the omission.
- Local dev **cannot** call prod edge functions — `_shared/cors.ts` allows only 4 prod origins, so
  `127.0.0.1` fails with `FunctionsFetchError`. Verify on prod, not locally.
- The pre-push hook runs typecheck + build; pushes can exceed a 10-minute foreground timeout. Use
  `run_in_background` and confirm with `git ls-remote`.
- Prove authorization changes red→green on prod inside a **rolled-back** transaction
  (`set_config('request.jwt.claim.sub', …)` + `SET LOCAL ROLE authenticated`, then `RAISE` to abort).
  That is how both PR #387 holes were demonstrated and confirmed closed.

## State at handoff

**This work is now BUILT and DEPLOYED — the handoff above records the design reasoning, which is
still the reason the code looks the way it does. Read it before changing the clause set.**

- PR #387 open, all gates green (Codex clean, data-exposure findings closed), migrations
  `20260808010000` + `20260808020000` applied to prod and verified red→green.
- Branch **`fix/notification-authorization`**, commit **`d0e3020f`**, worktree
  `.claude/worktrees/dc-improvements-17`.
- **Live on prod:** `create-notification` **v42** (deployed, boot-checked) and migration
  `20260808030000_can_notify_user` (applied).
- **Proven on prod after deploy:** unrelated pair → `false`; a real historical actor/recipient pair
  → `true`; across every user pair, **1,692 blocked / 30 allowed**.
- `edge-function-reviewer`: PASS. Its two corrections were applied — a stale comment claiming an
  "open type" branch that does not exist, and my miscount of "6 edge-function callers" (there are
  **2**: `dre-award-engine`, `dragonshare-notify`).

### NOT done — pick this up here

1. **Codex second review has NOT produced a verdict.** It was started three times and killed each
   time before output. It is a required gate; do not record it as passed. Run:
   `codex review --base main --title "create-notification recipient authorization"`
2. **Branch not pushed, PR not opened.** `git push -u origin fix/notification-authorization`
   (the pre-push hook runs typecheck + build, ~10 min — run it where it won't be interrupted).
3. **`knowledge-sync`** for this workstream (wiki page + SHIPPED_LOG + §5).
4. **Follow-up, not a blocker:** `title`/`body`/`actionUrl` are still free text for callers who DO
   have a relationship. Far smaller than the stranger-phishing surface now closed; wants a
   server-side templating pass across the 32 call sites.

### Environment note

Every background task in the originating session was killed within seconds (4 in a row: Codex ×2,
push ×2), and the machine had been pinned at 100% CPU by concurrent worktree dev servers. Both
remaining steps exceed the 10-minute foreground cap, so run them from a normal terminal.
