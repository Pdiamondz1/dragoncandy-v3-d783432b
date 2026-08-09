---
title: Donny Social Tools
type: concept
created: 2026-08-09
updated: 2026-08-09
sources: [2026-08-09-donny-social-tools-repair.md]
tags: [donny, outstand, social, edge-functions, security, measurement, mcp]
---
# Donny Social Tools

How Donny posts, schedules, and reports on a business's social accounts — the `social_*`
tool surface on `donny-orchestrator`, repaired in place on 2026-08-09 after **7 calls and
0 successes** in its entire recorded history.

Sibling of [[Donny Data Visibility & Quick-Action Routing]] (same backend, same
invented-cause failure mode) and [[Honest Analytics]] (the sample-size rule these tools now
obey). The measurement substrate they read is [[Social Measurement Spine]].

## The governing rules

Four, and each one is enforced by structure rather than by prompt text:

1. **Donny never supplies, sees, or guesses a tenant identifier.** The account is resolved
   server-side from the authenticated user.
2. **Donny never offers a capability with no implementation behind it.** A tool the model
   cannot call cannot be promised to a user.
3. **Donny never states a cause the code did not report.**
4. **The LLM cannot publish.** Publishing happens on a human tap, from the client, on the
   normal posting path.

## What was actually broken

The trigger was a prod session where Donny claimed he had *"no visibility into which
Instagram account is connected to your Harbormill organization"*, told the owner to go find
an **"account ID"** under Social Media settings, and promised to post once he had it. The
app knew the account (one connected, `@areyouaman`, one click away), the settings page
**shows no account ID anywhere**, and he could not post regardless.

The prod audit overturned **two standing project claims**, both of which had been repeated
in planning documents. This is the durable lesson: *a claim in a planning doc is not
evidence.*

### "Instrumentation is missing" — false

`donny_tool_executions` held **158 rows**. The claim described a bug fixed on 2026-07-18
(nullable `message_id`, corrected column names) and had been stale since. The table had
already caught this failure: 7 `social_*` calls on Aug 7, **7 errors**, every one carrying
the identical stored output —

```json
{"content":[{"text":"Social tool error: {\"error\":\"unauthorized\"}","type":"text"}],"isError":true}
```

So no instrumentation work was in scope. The observability existed and did its job; nobody
was reading it. (See [[Reading Agent Traces]] for the general shape of this.)

### "The cause is the bogus `account_id`" — false

The bridge sent `SUPABASE_SERVICE_ROLE_KEY` as the `Authorization` header to
`outstand-proxy`, which authenticates by running that header through `auth.getUser()` on the
**anon** client. A service-role token resolves to **no user** → 401, returned *before* path
extraction and long before the account-ownership check.

Two further breakages sat latent inside the same request:

- **Wrong addressing.** The bridge sent an `{action}` **body field**; `outstand-proxy` routes
  by **URL path**. A POST to the bare function URL resolves to `/`, matches no branch, and
  default-denies `403 path_not_allowed`.
- **A dead header.** `x-outstand-user-id` appears in exactly one file in the whole
  `supabase/functions/` tree — the sender.

**This bridge had never been able to succeed.** It was not subtly broken.

The fabricated id was real but **separate**. All 7 tools declared `account_id` as required
with no enum or hint, and nothing ever told the model a real value — no
`social_list_accounts` tool, no accounts in the system prompt. So the model sent
`"harbormill"`, the org name. The server-side default `args.account_id ?? defaultAccountId`
could not catch it: **`??` only fires on `null`/`undefined`**, so a fabricated non-empty
string survives it. Had auth been correct this would have surfaced as `403
forbidden_account` — a **different signature** from the 401 observed. Latent, not causal.

### The failure mode nobody could count

With zero connected accounts the bridge returned `null` and the orchestrator returned a
canned string **without writing to `donny_tool_executions`**. So the 7 logged errors were
necessarily from users who *did* have an account; the no-accounts path had never been
counted once. It now logs.

## The repair

### Surface: 7 tools → 4

`get_optimal_times`, `get_audience_insights` and `list_scheduled` have **no backing
operation** — a fact already recorded in the Zernio cutover spec and ignored since. Removed
from the offered set. `filterToolsByTier` was updated in the same change, because the
free-tier list contained one of the dropped three and would otherwise have lost a tool
silently while gaining nothing.

### `account_id` deleted from every schema

The bridge resolves the account from the authenticated user:

| accounts | behaviour |
|---|---|
| exactly one active | use it, no question asked |
| more than one | return a disambiguation payload listing **handles and platforms, never ids** |
| zero | an honest "no account connected" result — **and it is logged** |

This makes the `403 forbidden_account` class **unreachable** rather than merely handled. It
is the project's standing rule: *a grant may rest only on a fact the client cannot assert*
([[Cross-Tenant Proxy Authorization]]).

"Active" means `status = 'active'`, **not** the old `!= 'revoked'`. Prod holds `error`-status
rows beside `active` ones for the same handle, so the old filter could hand back a dead
account as the default — and one user holds 2 `error` + 2 `revoked` + 0 `active`, so the old
gate built a bridge and offered all four tools to someone none of them could serve.

**Disambiguation has to be answerable.** Codex caught the first version asking *by handle*
while the schemas only offered `platform` — an unbreakable ask-loop for two accounts on the
same platform. The tools now accept a `handle` hint, tolerant of a leading `@` and of the
model echoing the whole `"@handle · Platform"` label back. The platform half of that label is
**kept and used to narrow**, not discarded: two accounts can share a handle across platforms,
and then the platform half is the only thing that separates them. An account with a *null*
handle is matchable by its platform label, because that label is what the user was shown for
it — otherwise it could be offered as a choice and never selected.

### Publishing is two steps, structurally

Founder decision: publishing is irreversible and public, so a misread request lands on a real
business's feed before the owner sees it.

`social_create_post` **does not publish**. It returns a draft, rendered as a card through the
existing `donny_messages.rich_cards` side-channel (already shipped for creator cards, so no
schema change). The card names the account by handle and platform, shows the caption and media
exactly as they will post, and carries **Post it** / **Edit**. Publishing happens on the tap,
from the authenticated client, through the normal posting path.

The LLM therefore *cannot* publish — enforced by **where the code lives**, not by an
instruction a model may ignore. `schedule_post` is identical in shape and **refuses** rather
than degrading to an unscheduled draft when it has no usable time: that is the one path
ending in an irreversible public post, so "a human will probably notice the card says Draft"
is not the bar.

### Numbers obey the sample-size bar

`MIN_POSTS_FOR_SIGNAL = 3`, the threshold the rest of the product already uses
([[Honest Analytics]]). Below it Donny states the actual count and declines the comparative
claim — raw figures yes, a trend/"best"/rate no. The constant existed twice; the canonical
copy now lives at `supabase/functions/_shared/social-signal.ts`, with
`content-strategy-recommend/brief.ts` re-exporting it and `src/lib/postPerformance.ts`
keeping the frontend copy behind a pointer comment (`src/` cannot reach
`supabase/functions/_shared/`, and edge functions cannot import from `src/`).

## The two measurement traps

Both were introduced by the *plan*, both were caught in review, and both produced numbers
that ran perfectly and were wrong.

### Cumulative snapshots are not additive

`content_performance` stores a **cumulative** snapshot per `(post, platform, milestone)` —
the 72h row restates everything the 24h row counted. Summing every row multiplies a post's
real totals by however many milestones have fired. Confirmed against prod post
`XDbxe`/youtube: 24h = 1369 views/5 likes, 72h = 1388/5, 7d = 1388/5 → naive summing reports
**4145/15**; the truth is **1388/5**.

Keep only the most mature snapshot per `(post, platform)` before any arithmetic — the ranking
mirrors `get_creator_brief_performance`'s milestone `CASE`, so the two readers of this table
never disagree about which snapshot is "the" one.

Note that `post_count` and `totals` sit on **different grains on purpose**: a post
cross-published to Instagram *and* YouTube is **one post** for the sample-size question but
**two independent cumulative series** for the totals, because it genuinely reached two
audiences.

### A sample-size gate must count only verifiable rows

Neither new read gated on `social_post_log.verified_at`, which **both** existing readers of
that table already apply — the capture job (what is worth measuring) and the Analytics page
(what is worth showing). `verified_at` is stamped only by server-side code from a signed
Outstand event, so an unstamped row is **client-asserted**.

Prod holds 9 legacy rows for 3 posts, **6 of them fabricated all-zero measurements** the
pre-fix capture job wrote whenever the provider returned nothing, and **none of the 9
verified**. Ungated, Donny states those zeros as measured fact — and worse, they **clear the
sample-size gate**, so the answer arrives with no caveat at all.

> **A bar cleared by rows nobody measured is a gate that lies while looking rigorous.**

Both reads now carry `social_post_log!inner(verified_at)` **and** the `.not()` filter —
`!inner` alone only proves the joined row exists, not that it is stamped. The pinning test
asserts the **request**, not the returned rows: PostgREST applies the filter, so a fake client
"returning only verified rows" would be testing the fake.

### …and count only rows about the thing being claimed

The next Codex round found the same defect one level up, which is why it is worth stating as
a general rule rather than two fixes:

> **A gate must be about the same thing as the claim it licenses.**

`get_account_metrics` resolves **one** account and returns **that account's** engagement rate
— but its sample count was user-wide. Five measured Instagram posts could therefore certify a
YouTube rate. Now scoped with `.eq('platform', account.platform)`. Platform is the finest
grain the table offers (`content_performance` records a platform, never an account id), and
the vocabularies agree — checked on prod 2026-08-09: all three tables use lowercase provider
names (`instagram` / `youtube` / `facebook`). A future divergence returns 0 and caveats, which
is the safe direction.

`get_post_analytics` is deliberately **not** scoped this way: it reports across everything the
user has, so user-wide is what its claim is about.

The residual is handled rather than ignored. Two connected accounts on **one** platform share
that count and it cannot be attributed to either, so the tool returns `unattributableSignal` —
it reports the honest count and refuses the signal, rather than letting a sibling account's
posts vouch for this one. Latent today (no prod user holds two active accounts on one
platform, checked 2026-08-09), but it is precisely the case handle-disambiguation exists for.

## MCP-bridge invariants

- **A remote MCP server's tool list is not a permission, and its schema is not authoritative.**
  The remote list decides only which names are supported upstream; every field of the offered
  schema comes from our own `SOCIAL_TOOLS`. Showing the remote's property set instead would
  drop the `handle` disambiguation property — which exists only on our side — and reopen the
  ask-loop above.
- **Model args are forwarded through an allow-list**, never a `...args` spread. `account_id` is
  always the server-resolved one, and no schema declares that key, so it cannot be shadowed by
  a model-emitted alternate selector (`social_account_id`, `socialAccountId`, `accounts`,
  `social_account_ids` — the exact set `extractRequestAccountIds` treats as account selectors)
  reaching this **org-wide-authenticated** upstream call.
- **Stripping ids means stripping `content[].text`, not just top-level keys.** The standard MCP
  shape puts the payload as a JSON-encoded **string** inside `content[].text`; a key-walking
  strip goes straight past it. `mcp-client.ts`'s own error path forwards the upstream body into
  `content[0].text`, so an *error* result can echo the same raw payload — and the same account
  id — as a success one.
- **The MCP-client branch is dead on prod.** All 7 logged failures carry the
  `Social tool error: {"error":"unauthorized"}` string, produced **only** by the REST-fallback
  branch, so the MCP path is latent. Latent is not safe: a config flip (`OUTSTAND_MCP_URL`)
  would have re-armed the dropped tools, which is why the name intersection is enforced.
- **`authHeader` is optional, with an explicit refusal.** `donny-auto-pilot` is a cron gated on
  a shared secret, with no user JWT and no prospect of one. It refuses rather than sending a
  request known to be unauthenticatable — the same rule the orchestrator's OAuth branch already
  applied.

## The once-only guard (CT-4b)

A draft card is **persisted** into `donny_messages.rich_cards` and re-rendered on every
conversation load, so "already sent" could not live in React component state. Reopening the
conversation re-armed the button on a draft already live on a public feed, and a second tap
posted a duplicate — on the one card whose action cannot be undone.

Closed by `donny_draft_publications` (migration `20260809193254`), an append-only marker keyed
on a `draft_id` now generated server-side when the card is built.

**Why not an UPDATE policy on `donny_messages`.** That table has exactly two policies on prod —
SELECT own and INSERT own — and no UPDATE for any surface. Adding one so the client could
rewrite `rich_cards` would hand every user write access to the stored text of what Donny said,
in order to fix a UI-state problem. And RLS `WITH CHECK` sees only the NEW row, so "only
`rich_cards` may change" is not expressible as a policy at all; it would need column GRANTs on
top. A separate marker is smaller, is enforced by a primary key instead of policy gymnastics,
and leaves `donny_messages` byte-unchanged.

**Ordering is the invariant.** The marker is written **after** the publish succeeds — "row
exists ⇒ it went out", the same rule as `payout_executed_at`. A pre-claim inverts the failure
into the worse one: a draft marked published that never posted, permanently un-postable, with
nothing on the feed to explain why. It follows that a marker write that fails *after* a
successful publish is a **bookkeeping** failure, not a publish failure: it must not re-arm the
button or suggest a retry, because the post is live.

**The card fails closed** on anything short of a definite "not published" — lookup in flight,
lookup failed, or a card with no draft id at all. Without an id there is no way to prove the
draft is unpublished, and the recoverable answer ("ask Donny for a fresh draft") beats a
plausible one.

The draft id is **injected** into `buildDraftCard` rather than generated inside it, keeping that
function pure and its tests free of a crypto stub — the same pattern as `buildDonnyProposals`'
injected `now`. It is a fresh uuid per draft, deliberately **not** a hash of the content: asking
for the same post again after publishing is a legitimate second post.

**Residual, stated rather than discovered later:** if the publish succeeds and the marker write
fails, this session's button stays down but a reload can re-arm that one card. Narrower than
what it replaced, and it fails in the direction of a visible duplicate rather than a silent
one — but it is not zero.

## Known Issues

- **`outstand-mcp.ts` has never been inside the CI edge-function typecheck gate.** Both the
  spec and the plan asserted it was, and both were wrong. The blocker is a **supabase-js
  version skew**: `donny-orchestrator` imports `supabase-js@2` (floating) while
  `_shared/outstand-mcp.ts` pins `@2.57.2`, and the two `SupabaseClient` types are structurally
  incompatible (`supabaseUrl` is protected). Pinning the entry file is **not** a one-line fix —
  tried, and errors went **1 → 18**, because `donny-orchestrator` also imports eight
  `agents/*.ts` modules on `@2`; it sits *between* two camps, so pinning the entry only moves
  the mismatch. The repo carries three pin styles (79× `@2`, 37× `@2.57.2`, 6× `@2.50.0`), so
  aligning them is a repo-wide decision, not a tidy-up to smuggle into a feature branch.
- **Amplification and the MCP path remain unproven on prod** — see [[Social Measurement Spine]].

## Acceptance

The proof this work asks to be judged on is a **`status='success'` row in
`donny_tool_executions` for a `social_*` tool** — which has never existed. It cannot be
observed until after merge **and** a separate deploy of `donny-orchestrator`: merging ships
the frontend only ([[Lovable Edge-Function Deploy Gap]]).

## See Also

- [[Honest Analytics]] — the sample-size rule and the `verified_at` gate these tools inherit
- [[Social Measurement Spine]] — how a post becomes a measured post
- [[Donny Data Visibility & Quick-Action Routing]] — same backend; the first two recorded
  instances of Donny inventing a cause
- [[Cross-Tenant Proxy Authorization]] — why the account is resolved server-side
- [[Reading Agent Traces]] — instrumentation that exists and is not read
