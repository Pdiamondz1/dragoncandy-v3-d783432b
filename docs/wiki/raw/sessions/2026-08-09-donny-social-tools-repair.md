# Donny's `social_*` tools — repaired in place (2026-08-09)

Branch `feat/donny-social-tools-repair`. Spec:
`docs/superpowers/specs/2026-08-09-donny-social-tools-repair-design.md`.
Plan: `docs/superpowers/plans/2026-08-09-donny-social-tools-repair.md`.

## The report

Driving the founder's own signed-in prod session, Donny was asked to post to
Instagram. He said he had **"no visibility into which Instagram account is connected
to your Harbormill organization,"** told the owner to go find an **"account ID"** under
Social Media settings, and promised **"Once you provide that account ID, I can post."**

Three separate defects in one reply:

- The app plainly knows the account — `/dashboard/business/social` shows one connected
  account, `@areyouaman`, one click away.
- The Social Media page **displays no account ID anywhere**. A handle, an avatar, a radio
  button. The instruction was not followable.
- He cannot post at all. `social_*` had never once succeeded.

This was the **third recorded instance** of Donny inventing a cause for his own failure.

## What the prod audit overturned

The audit ran against production. **Two standing project claims turned out to be false**,
and both had been repeated in planning documents — which is the reason the spec opens with
the audit rather than the fix.

**1. "Instrumentation is missing."** `donny_tool_executions` held **158 rows**. The claim
described a bug fixed on 2026-07-18 (nullable `message_id` + corrected column names) and had
been stale ever since. The table had already caught this failure — 7 `social_*` calls on
Aug 7, **7 errors, 0 successes**, every one carrying the identical stored output:

```json
{"content":[{"text":"Social tool error: {\"error\":\"unauthorized\"}","type":"text"}],"isError":true}
```

So **no instrumentation work was in scope**. The observability existed and did its job.
What was missing was someone reading it.

**2. "The cause is the bogus `account_id`."** It was not. The bridge sent
`SUPABASE_SERVICE_ROLE_KEY` as the `Authorization` header to `outstand-proxy`, which
authenticates by running that header through `auth.getUser()` on the **anon** client. A
service-role token resolves to **no user**, so the proxy returned 401 *before* path
extraction and long before the account-ownership check. Two more breakages sat latent in the
same request: the bridge addressed the proxy with an `{action}` **body field** while the
proxy routes by **URL path** (a POST to the bare function URL resolves to `/`, matching no
branch → `403 path_not_allowed`), and it sent an `x-outstand-user-id` header that appears in
exactly one file in the whole `supabase/functions/` tree — the sender.

**This bridge had never been able to succeed.** It was not subtly broken.

The fabricated `account_id` was real but **separate**: all 7 tools declared `account_id` as
required with no enum or hint, nothing ever told the model a real value (no
`social_list_accounts` tool, no accounts in the system prompt), so the model sent
`"harbormill"` — the org name. The server-side default `args.account_id ?? defaultAccountId`
could not catch it, because `??` only fires on `null`/`undefined`. Had auth been correct this
would have surfaced as `403 forbidden_account` — a **different signature** from the 401
actually observed. Latent, not causal.

**A third invisible failure mode:** when the caller has zero connected accounts the bridge
returned `null` and the orchestrator returned a canned string **without writing to
`donny_tool_executions`**. So the 7 logged errors were necessarily from users who *did* have
an account; the no-accounts path had never been counted.

## What shipped

**The tool surface: 7 → 4.** `get_optimal_times`, `get_audience_insights` and
`list_scheduled` have **no backing operation** — a fact already recorded in the Zernio
cutover spec and ignored since. They were offered to the model anyway. Removed, so the model
is never offered them: *a tool the model cannot call cannot be promised to a user.*
`filterToolsByTier` was updated in the same change, since free-tier orgs' list contained one
of the dropped three.

**`account_id` deleted from every schema.** The bridge resolves the account server-side from
the authenticated user: exactly one active account → use it silently; more than one → return
a disambiguation payload listing **handles and platforms, never ids**; zero → an honest "no
account connected" result, **and it is now logged**. This makes the `403 forbidden_account`
class unreachable rather than merely handled — the project's standing rule that *a grant may
rest only on a fact the client cannot assert*.

"Active" means `status = 'active'`, not the old `!= 'revoked'`. Prod holds `error`-status
rows alongside `active` ones for the same handle, so the old filter could hand back a dead
account as the default — and one user (7cc82738) holds 2 `error` + 2 `revoked` + 0 `active`,
so the old gate built a bridge and offered all four tools to someone none of them could serve.

**Publishing is two steps, structurally.** Founder decision: publishing is irreversible and
public, so a misread request would land on a real business's feed before the owner saw it.
`social_create_post` **does not publish**. It returns a draft, rendered as a card through the
existing `donny_messages.rich_cards` side-channel (already shipped for creator cards — no
schema change). The card names the account by handle and platform, shows the caption and
media exactly as they will post, and carries **Post it** / **Edit**. Publishing happens on
the tap, from the authenticated client through the normal posting path. **The LLM cannot
publish** — enforced by where the code lives, not by a prompt instruction a model may ignore.
`schedule_post` follows the identical shape, and refuses rather than silently degrading to an
unscheduled draft when it has no usable time.

**The bridge fix itself:** forward the caller's own JWT (the orchestrator already captured
`authHeader`); address the real proxy paths instead of an `{action}` body; delete the dead
header. `authHeader` is **optional** with an explicit refusal, because `donny-auto-pilot` is a
cron with no user JWT and never will have one — it now refuses rather than sending a request
it knows cannot authenticate.

**Numbers are sample-size gated** at `MIN_POSTS_FOR_SIGNAL = 3`, the bar the rest of the
product already uses. The constant existed twice; the canonical copy moved to
`supabase/functions/_shared/social-signal.ts`, `content-strategy-recommend/brief.ts`
re-exports it, and `src/lib/postPerformance.ts` keeps the frontend copy with a pointer comment
(`src/` cannot reach `supabase/functions/_shared/`, and edge functions cannot import from
`src/`).

## Bugs the plan itself caused, caught in review

Worth recording, because they are the reason the review gates exist and every one was in
**plan-authored** code:

- **Cumulative snapshots summed.** `content_performance` stores a **cumulative** snapshot per
  `(post, platform, milestone)` — the 72h row restates everything the 24h row counted. The
  plan's `summarizePerformance` summed every row, roughly **tripling** real totals. Confirmed
  against prod post `XDbxe`/youtube: 24h = 1369 views/5 likes, 72h = 1388/5, 7d = 1388/5 →
  naive summing reports **4145/15**; the truth is **1388/5**. Fixed with
  `mostMatureByPostPlatform()`, which mirrors `get_creator_brief_performance`'s milestone
  `CASE` rank so the two readers of this table never disagree about which snapshot is "the"
  one. Note `post_count` and `totals` are deliberately on **different grains**: a post
  cross-published to two platforms is one post for the sample-size question but two
  independent cumulative series for the totals.
- **A self-contradictory instruction string.** The plan's `draftToolResult` text said
  "posted, published, or scheduled" while the test in the same task asserted
  `not.toMatch(/\bposted\b/i)`.
- **A comment making a false guarantee.** The mandated card-append comment claimed a draft
  "must not be wiped by a later creator lookup", but the pre-existing
  `collectedCards = dispatched.cards ?? []` reassignment discarded it. Split into
  `creatorCards` / `draftCards`, preserving `find_creators`' reset semantics.
- **The `get_account_metrics` sample gate was omitted** despite the spec's own table
  requiring it.
- **A required `authHeader` broke `donny-auto-pilot`** — invisibly, because that function is
  typecheck-ignored.
- **Codex round 1 (P2):** `resolveAccount` asked the user to disambiguate **by handle**, but
  the tool schemas only offered `platform` — an unbreakable ask-loop for two accounts on the
  same platform. Fixed by accepting a `handle` hint, tolerant of a leading `@` and of the
  model echoing the whole `"@handle · Platform"` label back (the platform half is **kept and
  used to narrow**, not discarded — two accounts can share a handle across platforms).
- **Codex round 2 (two P2s, one defect in two places):** neither new `content_performance`
  read gated on `social_post_log.verified_at`, which **both** existing readers of that table
  already apply — the capture job (what is worth measuring) and the Analytics page (what is
  worth showing). `verified_at` is stamped only by server-side code from a signed Outstand
  event, so an unstamped row is client-asserted. Prod holds 9 legacy rows for 3 posts, **6 of
  them fabricated all-zero measurements** the pre-fix capture job wrote whenever the provider
  returned nothing, and **none of the 9 verified**. Ungated, Donny would state those zeros as
  measured fact — and worse, they would **clear the sample-size gate**, so the answer would
  arrive with no caveat at all. *A bar cleared by rows nobody measured is a gate that lies
  while looking rigorous.* Fixed with `social_post_log!inner(verified_at)` + the `.not()`
  filter at both sites (`!inner` alone only proves the joined row exists, not that it is
  stamped), pinned by the bridge's first test file — asserting the **request**, since PostgREST
  applies the filter and a fake client "returning only verified rows" would be testing the fake.
  Negative control was run: with the join stripped, both gate tests fail.
- **Codex round 3 (one P2):** the same defect one level up. `get_account_metrics` resolves
  **one** account and returns **that account's** engagement rate, but its sample count was
  user-wide — so five measured Instagram posts could certify a YouTube rate. The general rule
  worth keeping: *a gate must be about the same thing as the claim it licenses.* Scoped with
  `.eq('platform', account.platform)`; platform is the finest grain the table offers
  (`content_performance` records a platform, never an account id) and the vocabularies agree —
  checked on prod, all three tables use lowercase provider names. `get_post_analytics` is
  deliberately **not** scoped this way: it reports across everything the user has. The residual
  — two accounts on one platform, which platform-scoping cannot separate — returns a new
  `unattributableSignal`: honest count, no signal, rather than letting a sibling account's posts
  vouch for this one. Latent today (no prod user holds two active accounts on one platform).

## Gotchas worth keeping

- **A remote MCP server's tool list is not a permission, and its schema is not authoritative
  either.** The remote list is used only to decide which names are supported upstream; every
  field of the offered schema comes from our own `SOCIAL_TOOLS`. If the model were shown the
  remote's property set, the `handle` disambiguation property — which exists only on our side
  — would never be advertised, reopening the very ask-loop the fix closed.
- **Model args are forwarded through an allow-list**, never a `...args` spread. `account_id`
  is always the server-resolved one, and no schema declares that key, so it cannot be shadowed
  by a model-emitted alternate selector (`social_account_id`, `socialAccountId`, `accounts`,
  `social_account_ids` — the exact set `extractRequestAccountIds` treats as account selectors)
  reaching this **org-wide-authenticated** upstream call.
- **Stripping ids means stripping `content[].text`, not just top-level keys.** The standard MCP
  shape puts the payload as a JSON-encoded **string** inside `content[].text`; a key-walking
  strip goes straight past it. `mcp-client.ts`'s own error path forwards the upstream body into
  `content[0].text`, so an *error* result can echo the same raw payload — and the same account
  id — as a success one.
- **The MCP-client branch is dead on prod.** All 7 logged failures carry the
  `Social tool error: {"error":"unauthorized"}` string, produced **only** by the REST-fallback
  branch. So the MCP path is latent, not live — but a config flip (`OUTSTAND_MCP_URL`) would
  have re-armed the dropped tools, which is why the intersection above is enforced.

## Known limitation — needs a founder decision

**CT-4b, republish after reload.** The draft card persists to `donny_messages.rich_cards` and
re-renders on load, so after publishing, reopening the conversation shows a live "Post it" on
the same draft — a second tap duplicates a real public post. `donny_messages` has SELECT and
INSERT policies and **no UPDATE policy for any surface** (verified across all nine migrations
that touch it), so closing it needs either a narrow UPDATE RLS policy or a service-role route
— i.e. a migration, which this branch's scope forbids.

## Also true, and stated rather than discovered later

`outstand-mcp.ts` has **never been inside the CI edge-function typecheck gate**. Both the plan
and the spec asserted it was, and both were wrong. The actual blocker is a **supabase-js version
skew**: `donny-orchestrator` imports `supabase-js@2` (floating) while `_shared/outstand-mcp.ts`
pins `@2.57.2`, and the two `SupabaseClient` types are structurally incompatible
(`supabaseUrl` is protected). Pinning the entry file is **not** a one-line fix — tried, and the
error count went from **1 to 18**, because `donny-orchestrator` also imports eight `agents/*.ts`
modules on `@2`; it sits *between* two camps, so pinning the entry just moves the mismatch. The
repo carries three pin styles across edge functions (79× `@2`, 37× `@2.57.2`, 6× `@2.50.0`), so
aligning them is a repo-wide decision with ripple risk, not a tidy-up to smuggle into a feature
branch. Recorded as a ticket for whoever pays down `.typecheck-ignore`.

## Files

New in `supabase/functions/_shared/`: `social-signal.ts`, `outstand-accounts.ts`,
`outstand-mcp-tools.ts`, `outstand-mcp-paths.ts`, `social-draft.ts`, `social-analytics.ts`,
`strip-account-ids.ts` — each with a co-located `*.test.ts`, plus `outstand-mcp.test.ts`.
Modified: `_shared/outstand-mcp.ts`, `donny-orchestrator/index.ts`,
`content-strategy-recommend/brief.ts`, `src/lib/postPerformance.ts` (pointer comment only),
`src/types/donny.ts`, `src/components/donny/DonnyRichCard.tsx`. New frontend:
`src/components/donny/SocialDraftCard.tsx`.

**No migration. No RLS change.**

## Acceptance, not yet met

The proof this work is asking to be judged on is a **`status='success'` row in
`donny_tool_executions` for a `social_*` tool** — which has never existed (7 calls, 0
successes). It cannot be observed until after merge **and** a separate deploy of
`donny-orchestrator`: merging ships the frontend only.
