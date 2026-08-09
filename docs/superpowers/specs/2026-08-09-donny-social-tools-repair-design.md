# Donny's social tools — repair in place

**Date:** 2026-08-09
**Status:** approved (founder), not yet planned
**Branch:** TBD at planning time
**Supersedes nothing.** Partially overlaps `2026-08-01-outstand-zernio-cutover-design.md` — see §9.

---

## 1. Why this exists

On 2026-08-09, driving the founder's own logged-in prod session, Donny was asked to
post to Instagram. He replied that he had **"no visibility into which Instagram account
is connected to your Harbormill organization,"** asked the owner to go find an
**"account ID"** under Social Media settings, and promised **"Once you provide that
account ID, I can post."**

All three parts are wrong, and each is a separate defect:

- The app plainly knows the account. `/dashboard/business/social` shows **1 connected
  account, `@areyouaman`**, one click away.
- The Social Media page **displays no account ID anywhere** — a handle, an avatar and a
  radio button. The instruction is not followable.
- He cannot post. `social_*` has never once succeeded.

This is the **third recorded instance** of Donny inventing a cause for his own failure
(see [[Donny Data Visibility & Quick-Action Routing]] and the 2026-08-09 session notes).

## 2. What the audit established

Run against **production**, not assumed. Two of the three things this project believed
about `social_*` were false, and both had been repeated in planning documents.

### 2.1 Instrumentation is NOT missing — it already caught this

`donny_tool_executions` holds **158 rows**. The standing claim that it "has zero rows for
every consumer sub-agent" described a bug **fixed on 2026-07-18** (`message_id` nullable
+ corrected column names) and has been stale ever since.

| tool | calls | errors | message_id NULL | window |
|---|---|---|---|---|
| `search_internal_knowledge` | 47 | 0 | 0 | Jun 11 – Jul 21 |
| `get_platform_stats` | 21 | 0 | 0 | Jun 11 – Jul 21 |
| *(9 more internal-Donny tools)* | 83 | 0 | 0 | Jun – Jul |
| **`social_get_post_analytics`** | **2** | **2** | **2** | **Aug 7** |
| **`social_get_account_metrics`** | **2** | **2** | **2** | **Aug 7** |
| **`social_get_optimal_times`** | **2** | **2** | **2** | **Aug 7** |
| **`social_get_audience_insights`** | **1** | **1** | **1** | **Aug 7** |

Every `social_*` row carries the same stored output:

```json
{"content":[{"text":"Social tool error: {\"error\":\"unauthorized\"}","type":"text"}],"isError":true}
```

**Consequence for this design: no instrumentation work is in scope.** The observability
existed and did its job. What was missing was someone reading it.

### 2.2 The cause is an auth + contract mismatch, not a bad `account_id`

`_shared/outstand-mcp.ts:92-105` posts to `outstand-proxy` with:

```ts
headers: {
  "Authorization": `Bearer ${serviceKey}`,   // SUPABASE_SERVICE_ROLE_KEY
  "Content-Type": "application/json",
  "x-outstand-user-id": config.userId,
},
body: JSON.stringify({ action: rawName, ...enrichedArgs }),
```

`outstand-proxy/index.ts:143-149` authenticates by running that header through
`auth.getUser()` on the **anon** client, expecting the caller's session JWT. A
service-role token resolves to no user, so it returns `401 {"error":"unauthorized"}` at
`index.ts:826-829` — **before** `extractOutstandPath()` (`:834`) and long before
`enforceScope()` (`:883`), which is where the account-ownership check actually lives.

Three independent breakages sit in that one request:

1. **Wrong credential.** Service-role key where a user JWT is required. → the observed 401.
2. **Wrong addressing.** `outstand-proxy` routes by **URL path**; the bridge sends an
   `{action}` body field. A POST to the bare function URL resolves to path `/`, matching
   no branch, and default-denies with `403 {"error":"path_not_allowed"}`
   (`outstand-proxy/index.ts:571`). This is latent behind the 401.
3. **Dead header.** `x-outstand-user-id` appears in exactly one file in the entire
   `supabase/functions/` tree — the sender. Nothing reads it.

**This bridge has never been able to succeed.** It is not subtly broken.

### 2.3 `account_id` is a real but *separate* defect

All 7 tools declare `account_id: {type: "string"}` as **required**
(`_shared/outstand-mcp.ts:11-19`), with no enum, pattern, or length hint. Nothing ever
tells the model a real value:

- No `social_list_accounts` tool exists.
- `buildSystemPrompt()` (`donny-orchestrator/index.ts:46-78`) injects `full_name`,
  `user_role`, `page_path`, `org_tier` and RAG chunks — no accounts.
- `account_id` does not appear anywhere in `donny-orchestrator/` outside the shared bridge.

Real ids are opaque 5-character strings. Prod `business_outstand_accounts`, active rows only:

| id | platform | handle |
|---|---|---|
| `LEnjV` | instagram | `areyouaman` |
| `I2pgX` | youtube | `@josephcastelo149` |

The model sent `"harbormill"` — the org name. There is a server-side default
(`outstand-mcp.ts:78,85`: `args.account_id ?? defaultAccountId`) but `??` only fires on
`null`/`undefined`, so **a fabricated non-empty string survives it**.

Had auth been correct, this would surface as `403 forbidden_account`
(`outstand-proxy/index.ts:425-431`) — a *different* signature from the 401 actually
observed. **Latent, not causal.** It must still be fixed; it is simply not why the tools
are at 0/7 today.

### 2.4 Three of the seven tools have no backing operation at all

`2026-08-01-outstand-zernio-cutover-design.md:369-386` already records this:
`get_optimal_times`, `get_audience_insights`, `list_scheduled` have **"no backing gateway
op — DROP all three… Do not claim they work."** They are currently offered to the model.

### 2.5 One failure mode is genuinely invisible

When the caller has **zero** connected accounts, `createOutstandMcpBridge()` returns
`null` (`outstand-mcp.ts:46-47`) and `donny-orchestrator/index.ts:504-505` returns a
canned string **without writing to `donny_tool_executions`**. So the 7 logged errors are
necessarily from users who *did* have a connected account. The no-accounts path has never
been counted.

## 3. Goals

1. `social_create_post` and `social_schedule_post` work end-to-end against a real
   connected account, with the owner confirming before anything is published.
2. Donny never supplies, sees, or guesses a tenant identifier.
3. Donny never offers a capability that has no implementation behind it.
4. Donny never states a cause for a failure that the code did not actually report.
5. Social numbers obey the same sample-size bar as the Analytics page.

## 4. Non-goals

- **No provider migration.** This repairs the Outstand path in place. The Zernio cutover
  is a separate, already-specced piece of work (§9).
- **No new instrumentation.** §2.1 — it exists and works.
- **No autonomous publishing.** Explicitly rejected by the founder; see §6.
- **No new analytics surfaces.** The Analytics page is unchanged.
- **No role-gating workstream** unless §8's check shows one is needed.

## 5. The tool surface: 7 → 4

| tool | disposition |
|---|---|
| `social_create_post` | **keep**, becomes propose-then-confirm (§6) |
| `social_schedule_post` | **keep**, becomes propose-then-confirm (§6) |
| `social_get_post_analytics` | **keep**, sample-size gated (§7) |
| `social_get_account_metrics` | **keep**, sample-size gated (§7) |
| `social_get_optimal_times` | **DROP** — no backing op (§2.4) |
| `social_get_audience_insights` | **DROP** — no backing op (§2.4) |
| `social_list_scheduled` | **DROP** — no backing op (§2.4) |

Dropping means **removing from `REST_FALLBACK_TOOLS`**, so the model is never offered
them. A tool the model cannot call cannot be promised to a user.

Note `filterToolsByTier()` (`outstand-mcp.ts:32-37`) currently restricts free-tier orgs to
`get_post_analytics`, `get_account_metrics`, `get_audience_insights`. Since the third is
being dropped, that tier list must be updated in the same change or free-tier orgs lose a
tool silently and gain nothing.

### 5.1 `account_id` is removed from every remaining schema

The parameter is deleted from the tool schemas entirely. The bridge resolves the account
server-side from the authenticated user:

- **exactly one active account** → use it, no question asked
- **more than one** → the tool returns a disambiguation payload listing **handles and
  platforms, never ids**, and Donny asks which one
- **zero** → an honest "no account connected" result, **and it is logged** (§2.5)

"Active" means `business_outstand_accounts.status = 'active'` for the caller. Note prod
holds rows with `status` of `error` and `revoked` (9 rows, only 2 active), so filtering on
`!= 'revoked'` — what `getUserAccountIds()` does today (`outstand-mcp.ts:23-30`) — would
select accounts in an `error` state. Tighten to `= 'active'`.

This is the project's standing rule: **a grant may rest only on a fact the client cannot
assert** ([[The social proxy IS the tenant boundary]]). It also makes the
`403 forbidden_account` class unreachable rather than merely handled.

## 6. Publishing is two steps, structurally

**Decision (founder, 2026-08-09): draft → owner confirms.** Rationale: publishing is
irreversible and public; a misread request lands on a real business's feed before the
owner sees it, and deleting a post does not un-see it.

`social_create_post` **does not publish**. It returns a draft, which the client renders as
a card through the existing `donny_messages.rich_cards` jsonb side-channel — already built
and shipped for the web-chat creator cards, so no schema change. The card:

- names the target account by **handle and platform** (`@areyouaman · Instagram`), never by id
- shows the caption and any media exactly as they will post
- carries a **Post it** action and an **Edit** action

Publishing happens **on the tap**, from the authenticated client through the normal
posting path — not from the model's tool call. The LLM therefore *cannot* publish. This is
enforced by where the code lives, not by a prompt instruction that a model may ignore.

`social_schedule_post` follows the identical shape, with the scheduled time stated in the
card.

## 7. Numbers are sample-size gated

`MIN_POSTS_FOR_SIGNAL = 3`, the threshold the rest of the product already uses.

Below it, Donny states the actual count and declines the comparative claim — he may report
raw figures for the posts that exist, but must not name a trend, a "best" anything, or a
rate. At or above it, he reports normally and still states N.

**Do not create a third copy of the constant.** It exists twice today:
`src/lib/postPerformance.ts:20` and
`supabase/functions/content-strategy-recommend/brief.ts:4`. Edge functions cannot import
from `src/`. Plan: move the canonical value to `supabase/functions/_shared/`, have
`content-strategy-recommend/brief.ts` import it (a one-line change; its existing tests pin
the value at 3 and must still pass), and have the new social code import the same. Leave
`src/lib/postPerformance.ts` as the frontend copy with a pointer comment — `src/` cannot
reach `supabase/functions/_shared/`.

## 8. The bridge fix

Three changes in `_shared/outstand-mcp.ts`, all confirmed viable:

1. **Forward the caller's JWT.** `donny-orchestrator/index.ts:275` already captures
   `authHeader` and builds a user-scoped client with it at `:281-284`. Thread that into
   `createOutstandMcpBridge()` and send it instead of `SUPABASE_SERVICE_ROLE_KEY`.
   *(This is the 401.)*
2. **Address real proxy paths.** Replace the `{action, ...args}` body with requests to the
   paths `outstand-proxy` actually routes (`extractOutstandPath()`,
   `outstand-proxy/index.ts:123-136`). Each surviving tool maps to one path + method.
   *(This is the latent `path_not_allowed`.)*
3. **Delete `x-outstand-user-id`.** Nothing reads it.

**Verify during planning, before writing code:** that `outstand-proxy` exposes a route
serving each of the four surviving tools. If a route is missing for an analytics tool,
that tool joins the DROP list in §5 rather than acquiring a new proxy endpoint — this
design does not add gateway surface.

**Role gating** appears already handled by data: the bridge is only built when the caller
has rows in `business_outstand_accounts`, which a creator would not. Confirm this in
planning; if it holds, no work is needed and no separate workstream should be opened.

## 9. Relationship to the Zernio cutover

`2026-08-01-outstand-zernio-cutover-design.md` calls for rewriting this bridge as
`social-mcp.ts` against a `{op, args}` contract. That remains the destination.

The founder chose to repair in place first so the capability lands now rather than waiting
on the migration. The overlap is bounded and understood: §8's path mapping is rewritten at
cutover; **§5 (tool surface), §5.1 (account_id deletion), §6 (confirm gate) and §7
(sample-size gate) are provider-agnostic and carry over unchanged.**

## 10. Error handling

- Tool errors return a **caller-safe reason string** derived from the actual response, so
  Donny relays what happened instead of inventing a cause. He has now told a user their
  accounts "may not be connected" while an active row sat in the table, three times.
- The already-shipped prompt rule ("Never end on a dead end… only name a page you actually
  know exists") makes him name `/dashboard/business/social` — verified working live on
  2026-08-09.
- The zero-accounts branch writes a `donny_tool_executions` row (`status='error'`) so the
  case is countable.
- No raw provider error text reaches the user; no ids appear in user-facing copy.

## 11. Data model

**No migration.** `donny_tool_executions` exists with `message_id` nullable;
`donny_messages.rich_cards` exists as nullable jsonb. Nothing new is stored.

## 12. Testing

- **Pure unit tests** for account resolution (one / many / zero / `error`-status rows) and
  for the sample-size gate at n = 0, 1, 2, 3, 4 — no network, no mocks beyond fixtures.
- **Path-mapping tests** asserting each surviving tool produces the exact method + path
  `outstand-proxy` routes, so breakage (2) cannot silently return.
- **A regression test that the dropped tools are absent** from the offered tool list,
  including under every tier branch of `filterToolsByTier()`.
- **Edge-function typecheck gate** — `outstand-mcp.ts` is a `_shared` module and inherits
  into every importer; it must stay in the gated set.
- **Prod verification is the acceptance bar**, not local tests: one real post proposed and
  confirmed on `@areyouaman`, and `donny_tool_executions` showing `status='success'` for it.
  `social_*` has zero successful rows in its entire history, so "it works" means a row
  exists that never has before.

## 13. Risks

- **The four surviving tools may not all have a proxy route.** Mitigated by §8's
  pre-implementation check; the answer is to drop the tool, not to build gateway surface.
- **Repairing a path that is scheduled for replacement.** Accepted deliberately by the
  founder; bounded in §9.
- **The confirm card is a new client surface** on a component (`rich_cards`) whose only
  existing consumer is creator cards. Reuse must not regress that.
- **Only one account on prod is genuinely postable** (`LEnjV`), and it belongs to the
  founder's own org — so the multi-account disambiguation branch cannot be proven on prod
  data. It must be covered by unit tests and stated as unproven end-to-end.
