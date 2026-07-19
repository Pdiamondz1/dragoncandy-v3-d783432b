# Service-role data-exposure findings — for a dedicated security branch

**Filed:** 2026-07-19
**Source:** first real runs of the new `data-exposure-reviewer` subagent (branch `worktree-dc-improvements-3`)
**Status:** findings verified, **nothing fixed** — this is the input to a separate branch
**Scope decision:** deliberately NOT fixed in the branch that built the reviewer. That branch is
100% markdown; each of these is an edge-function change requiring a deploy, the `careful` gate,
`edge-function-reviewer`, and Codex. Different risk profile, own review cycle.

## How these were found

The `data-exposure-reviewer` subagent (`.claude/agents/data-exposure-reviewer.md`) was dispatched
against a **single 10-line migration** — `20260709120010_campaigns_group_id.sql`, an `ALTER TABLE
... ADD COLUMN group_id` plus an index. Its check-6 fan-out audit reached six service-role edge
functions the diff never touched.

Every finding below was then **independently verified by the controller against `origin/main`** —
not taken on the agent's word — except #6, which is explicitly marked unverified.

These survived **14 Codex rounds** on PR #226, an independent adversarial review, and the entire
PR #246 / #247 / #260 privacy-remediation sweep.

## The unifying defect

A Supabase client built with `SUPABASE_SERVICE_ROLE_KEY` **bypasses RLS entirely**. Every read
below either (a) omits the `profile_visibility='public'` filter that RLS would have applied, or
(b) trusts an id from a request body / LLM tool call without asserting the caller may see it.

## Findings

### 1. `donny-creator-match/index.ts:115` — [high] private-creator enumeration

Service-role read of `creator_profiles`, `.limit(50)`, filtered only by `.eq("is_completed", true)`.
No `profile_visibility` filter.

```
.select("user_id, creator_name, bio, skills, location, city, country,
         base_rate_per_hour, average_rating, instagram_url, tiktok_url,
         youtube_url, avatar_url")
.eq("is_completed", true)
.limit(50)
```

Any authenticated caller (or an OAuth Donny client with `creators:read`) enumerates up to 50
private creators' bio, location, **rate**, and social handles. **No id-guessing required** — this
is the most directly reachable of the set.

**Fix:** add `.eq('profile_visibility','public')`.

### 2. `donny-apply-pitch/index.ts:106` — [high] arbitrary creator profile

`creator_id` is read from the request body (`:94`) and **never compared to `user.id`**. The caller
is authenticated (`:75`) and rate-limited by `user.id` (`:86`), which makes it look guarded — it
is not. Service-role read returns `base_rate_per_hour` and `portfolio_urls` (surfaced verbatim as
`suggested_portfolio_piece_url`), with no visibility filter.

**Fix:** assert `creator_id === user.id` (or a campaign-owner relationship) **and** add
`.eq('profile_visibility','public')`.

### 3. `donny-chat/index.ts:1295` — [high] sibling query site missed

The clearest case, and the one that most vindicates building the reviewer. In the **same file**:

- `:1237` (`match_creators`) — **has** `.eq("profile_visibility", "public")`, with the comment
  `// don't surface private creators via the service role (RLS-bypass)`
- `:1295-1298` (`get_creator_profile`) — reads `creator_profiles` by an **LLM-supplied**
  `args.creator_id`, selecting `base_rate_per_hour, portfolio_urls`, with **no filter**

The fix was applied at one query site and missed at its sibling 58 lines below. Textbook
"second query to the same table in a different code path."

**Fix:** add the same filter at `:1297`.

### 4. `donny-apply-pitch/index.ts:115` — [med] arbitrary campaign, incl. private crew

`campaign_id` from the request body, service-role read of `campaigns` selecting
`title, description, goals, budget_min, budget_max`, with **no owner / participant / `group_id`
assertion**. A private crew campaign — the thing the whole Crews privacy model exists to protect —
is readable by any authenticated non-member. Budget also leaks as a numeric oracle via
`suggested_rate`.

Currently mitigated only by campaign-UUID secrecy, which is not a control.

**Fix:** gate on owner ∨ active group member ∨ collaborator before returning.

### 5. `donny-campaign-preview/index.ts:253` — [med] one of three paths ungated

`handleGenerate` takes `campaign_id` from the body, validates only that it is non-empty and that
`preview_types` is well-formed, then fetches the campaign with `supabaseAdmin` — no ownership
check. Its siblings in the same file **do** gate:

- `handleList` `:444` — `.eq("user_id", userId)`
- `handleApprove` `:482` — `if (existing.user_id !== userId)`

Exposes title/description/goals/style/tone/deliverables/`fixed_price`/budget into AI previews
stored under the **caller's** `user_id`.

**Fix:** add the owner/member assertion before the campaign fetch.

### 6. `donny-chat/index.ts:1362` — [med] **UNVERIFIED BY CONTROLLER**

Agent's claim: `apply_to_campaign` checks only `status === 'published'` then INSERTs into
`campaign_applications` with the service role, bypassing both the `apply_to_campaign` RPC's group
guard and the `can_create_application` RLS `WITH CHECK` that migration `20260709120016` hardened
for crews. If true, a non-member creator could apply into a private crew campaign and, on
acceptance, gain full campaign access via `has_collaboration_on_campaign`.

**Verify this before acting on it.** The other five were checked against `origin/main`; this one
was not.

## Suggested branch shape

1. Verify #6 first — it changes whether this is a read-exposure fix or also a write-path fix.
2. Findings 1–3 are one-line filter/assertion additions; 4–5 need an authorization helper. Consider
   a shared `assertCampaignAccess(admin, campaignId, userId, orgId)` in `_shared/` rather than
   three call-site copies.
3. Per-function: `edge-function-reviewer` → `careful` gate → deploy → boot-check.
4. Run `data-exposure-reviewer` on the branch before Codex (it is now wired into `codex-review`
   step 1).
5. `verify-db-schema` for anything depending on live RLS policy bodies.

## Related

- `.claude/agents/data-exposure-reviewer.md` — the reviewer that found these
- `docs/superpowers/specs/2026-07-19-data-exposure-reviewer-design.md` — why it exists; the boundary
  vs `edge-function-reviewer` ("does it run") and `verify-db-schema` ("does it work")
- `docs/wiki/concepts/ai-creator-matching.md` — the PR #246/#247 privacy work these sit alongside
- `docs/wiki/concepts/creator-groups.md` — the crew privacy model findings 4 and 6 undermine
