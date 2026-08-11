# Donny-first creator dashboard — prod audit (the input Phase 3 needs)

**Status:** audit complete, verified against prod 2026-08-10. **No code written.** Execution
needs a fresh session (shells locked in the originating session).

**Why this file exists:** the business dashboard's scope was set by a prod audit, not by the
mockup — only 4 Donny tools verifiably worked, so it shipped 3 taps and routed nothing to
`social_*`. The same discipline applies here, and this is that audit. Do not pick creator taps
by analogy to the business ones.

---

## What's structurally in the way

- `DonnyHome` hardcodes `<DashboardLayout userRole="business_client">` at **two** sites. It is
  not role-generic despite taking a `userRole` prop for the thread.
- `DonnyHome` is mounted **only** in `BusinessDashboard.tsx`.
- `CreatorDashboard.tsx` has **no** Donny canvas — a "Donny tools" section and a
  `ContentIdeaCard`, nothing else.
- `DonnyThreadRegion` and `DonnyHomePrompt` are **already role-parameterized**. Reuse as-is;
  do not fork them.

So Phase 3 = generalize the shell to take a role + supply creator-specific attention items and
taps. It is not a component copy.

**Mobile:** the business viewport is founder-verified good as of 2026-08-10. Match its sizing
(`max-h-[calc(100dvh-12rem)] min-h-[20rem]` on the block) rather than re-deriving it.

---

## Tool audit: zero creator executions, ever

`donny_tool_executions` contains **not one row** from a `content_creator`. Every row is
`business_client`, and most are the founder's *internal* AIOS Donny (`get_platform_stats`,
`get_cost_stats`, `search_internal_knowledge`, `workspace_*`) — not consumer Donny at all.

The orchestrator registers ten agents, none role-gated at dispatch: `campaign_agent`,
`find_creators`, `prepare_campaign`, `dragonshare_agent`, `billing_agent`, `guidance_agent`,
`rewards_agent`, `general_agent`, `web_search`, `read_url`.

Creator-plausible: **`rewards_agent`, `dragonshare_agent`, `billing_agent`, `guidance_agent`.**
None has ever been exercised by a creator. **A tap routing to an agent nobody has seen return
something real for a creator is not shippable.**

*(Separately: `social_get_post_analytics` now has `status='success'` rows, latest 2026-08-10
04:35 UTC — the acceptance signal `PROJECT_CONTEXT.md` still lists as never having existed.
Update that entry.)*

---

## Subject audit: there IS material (this is the good news)

Counted on prod 2026-08-10. Rule from [[check-for-subjects-before-building]]: count rows before
designing, or you ship a beautiful empty state.

| Signal | Count | Verdict as an attention item |
|---|---|---|
| Pending campaign invitations | **17** | **Strongest.** Real, and the biggest single bucket. |
| Open public campaigns (`published`, non-crew) | **24** | Real supply — "find work" has somewhere to go. |
| Creators with DC Points | **26** (118 events) | Real — `rewards_agent` has genuine data. |
| Active collabs, `content_status='pending'` | **5** | Real work queue — content not started. |
| Pending applications | **3** | Thin but real — awaiting a business reply. |
| Creators payout-ready (`stripe_onboarding_complete`) | **3 of 18** | **The biggest real gap.** |
| Creators with a pending balance | **1** ($360) | Too thin to be a standing tap. |
| DragonShare posts (all creators) | **10** | Thin — `dragonshare_agent` is weak today. |

Total creators: **18**. Collaborations: 16 (11 approved/completed, 5 pending/active).

### The finding worth acting on

**15 of 18 creators cannot get paid.** Only 3 have completed Stripe payout onboarding. That is
the single highest-value thing Donny could surface to a creator, it sits directly on the
revenue path, and nothing on the current dashboard says it.

### Copy constraint on invitations — do not get this wrong

An invitation is **a nudge to apply, not an assignment**: the campaign is already public, the
invite carries zero priority, and there is deliberately **no Accept button** (#382). Wording
like "You've been selected" or an Accept affordance would be a lie the DB doesn't back. See
[[campaign-invitations]].

---

## Shape

**FOUNDER DECISION (2026-08-10): payout setup is the top item.** Not a proposal — build it
first in the attention list. Rationale: a creator who cannot receive money has a broken loop,
and 15 of 18 are in that state today.

**Attention list:**
1. **Finish payout setup** — fires when `stripe_onboarding_complete = false` (15 of 18)
2. Pending invitations (17) — "N businesses want you to apply"
3. Content not started on active collaborations (5)
4. Applications awaiting a reply (3)

### One conditioning rule on item 1 — do not skip this

Rank payout setup top **when the creator has money coming or work in flight** — a pending
balance, an active collaboration, or an approved/completed collab. For a creator with *none* of
those, it must rank **below "find work"**.

This is not second-guessing the decision; it is what makes the decision land. `PROJECT_CONTEXT`
§7 is explicit: *"Setup disguised as action. Every onboarding step should feel like progress
toward a goal, not homework. Show value first, then collect what you need. Never ask users to
configure before they understand why."* Telling a brand-new creator with zero earnings to go do
Stripe onboarding is precisely configure-before-you-understand-why. Telling a creator with $360
sitting in a pending balance is urgent and concrete.

Both cases are live on prod right now: 1 creator has a pending balance, and most of the other 17
have never earned anything.

And it must **disappear entirely** for the 3 who are already set up — a permanently-parked dead
item at the top of the list trains people to ignore the whole region.

**Taps** — three, mirroring the business version's restraint:
1. **Find work** → 24 open campaigns, real supply
2. **My standing** → `rewards_agent`, 26 creators with points
3. **Get paid / finish setup** → `billing_agent`, branching on payout-ready

Deliberately **not** a tap: `dragonshare_agent` (10 posts total, too thin to lead with).

**If the tap audit comes back weaker than this on live testing, ship two, not three.** The
business version already set that precedent, and a tap that leads somewhere empty is worse than
no tap — it's the first thing a creator sees.

---

## Out of scope

Brand role — gated behind `BRAND_ROLE_ENABLED`, deliberately hidden.

## Gates

Codex second review before the PR. Both-viewport `verify-prod` after merge.
