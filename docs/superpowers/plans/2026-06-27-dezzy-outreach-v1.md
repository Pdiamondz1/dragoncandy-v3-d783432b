# Dezzy AI — Outreach Machine v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a report-only `dezzy-outreach` Founder Playbook that drafts personalized reactivation outreach (stalled campaigns, dormant creators, lapsed restaurants) for the founder to copy-send — surfaced at `/internal/playbooks/dezzy-outreach`, sending nothing.

**Architecture:** Reuse the existing AIOS Founder-Playbook rails. Add ONE admin-gated read tool, `get_reactivation_targets`, to the `aios-playbook-run` edge function (backed by its existing service-role `admin` client — no migration/RPC/RLS change). All segment/anti-join/shaping logic lives in a pure, vitest-tested module `reactivation.ts`; the edge function does small bounded `.select()` fetches and delegates. The playbook itself is one seed row in `aios_playbooks`.

**Tech Stack:** Deno edge function (Supabase), `@supabase/supabase-js` v2, Anthropic Claude (Sonnet 4), Vitest for the pure module, SQL migration for the seed.

**Spec:** `docs/superpowers/specs/2026-06-27-dezzy-outreach-v1-design.md`

---

## File Structure

| File | Responsibility |
|------|----------------|
| `supabase/functions/aios-playbook-run/reactivation.ts` | **NEW.** Pure helpers: segment computation (anti-joins, dormancy thresholds), handle selection, capping, result assembly. No Deno/https/supabase imports → vitest-loadable (mirrors `donny-chat/history.ts`, `doc-edits.ts`). |
| `supabase/functions/aios-playbook-run/reactivation.test.ts` | **NEW.** Vitest unit tests for the pure module. |
| `supabase/functions/aios-playbook-run/index.ts` | **MODIFY.** Add the `get_reactivation_targets` tool definition; thread the `admin` client into `executeReadTool`; add the case that fetches + delegates to `reactivation.ts`. |
| `supabase/migrations/<ts>_seed_dezzy_outreach_playbook.sql` | **NEW.** Idempotent seed of the `dezzy-outreach` playbook row. |
| `docs/wiki/analyses/the-core-idea-two-agents-one-company.md` + a new concept page | **MODIFY/NEW (knowledge-sync, Task 5).** Record the Dezzy-as-playbook-suite pattern. |

**Import gotcha (established repo pattern):** the Deno `index.ts` imports the pure module **with** the extension (`./reactivation.ts`); the vitest test imports it **without** (`./reactivation`). Same file, two importers. Do not "fix" either to match the other.

**Run commands from the worktree (footgun):** the shell's default cwd is the MAIN checkout, not this worktree — prefix `cd "C:/GIT/dragoncandy-v3-d783432b/.claude/worktrees/DC-Dezzy-AI"` before any `npm` / `npx vitest` / `git` so they act on these files (else they run against stale main and pass blind). The Task 1 vitest commands below show this prefix explicitly; apply the same `cd` to every `npm` / `npx vitest` / `git` command in this plan.

**Scale caveat (note in code, do not solve):** the tool fetches whole small tables and does set logic in JS — correct and trivial at pre-launch sizes (≤ double digits). At thousands of rows this must move to SQL/pagination; out of scope for v1.

---

### Task 1: Pure reactivation module (`reactivation.ts`) — TDD

**Files:**
- Create: `supabase/functions/aios-playbook-run/reactivation.ts`
- Test: `supabase/functions/aios-playbook-run/reactivation.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// supabase/functions/aios-playbook-run/reactivation.test.ts
import { describe, it, expect } from "vitest";
import {
  pickHandle, daysBetween,
  computeStalledCampaigns, computeDormantCreators, computeLapsedRestaurants,
  buildReactivationTargets, TARGET_CAP,
} from "./reactivation";

const NOW = "2026-06-27T00:00:00.000Z";
const ago = (d: number) => new Date(Date.parse(NOW) - d * 86_400_000).toISOString();

describe("pickHandle", () => {
  it("prefers instagram, falls back in order, null when none", () => {
    expect(pickHandle({ instagram_url: "ig", tiktok_url: "tt" })).toEqual({ channel: "instagram", handle: "ig" });
    expect(pickHandle({ tiktok_url: "tt", youtube_url: "yt" })).toEqual({ channel: "tiktok", handle: "tt" });
    expect(pickHandle({ website_url: "w" })).toEqual({ channel: "website", handle: "w" });
    expect(pickHandle({})).toBeNull();
  });
});

describe("computeStalledCampaigns", () => {
  const biz = { "u-biz": { user_id: "u-biz", business_name: "Joe's", instagram_url: "joeig" } };
  const crt = { "u-crt": { user_id: "u-crt", creator_name: "Mia", tiktok_url: "miatt", created_at: ago(40) } };

  it("flags a >14d published campaign with no collaboration (no-creator blocker)", () => {
    const out = computeStalledCampaigns({
      campaigns: [{ id: "c1", title: "Tacos", user_id: "u-biz", created_at: ago(20), updated_at: ago(20) }],
      collaborations: [], businessByUserId: biz, creatorByUserId: crt, nowIso: NOW,
    });
    expect(out).toHaveLength(1);
    expect(out[0].blocker).toMatch(/no creator/i);
    expect(out[0].business_handle).toEqual({ channel: "instagram", handle: "joeig" });
    expect(out[0].creator_name).toBeNull();
    expect(out[0].days_stalled).toBe(20);
  });

  it("flags an unfinished collaboration and attaches the creator", () => {
    const out = computeStalledCampaigns({
      campaigns: [{ id: "c1", title: "Tacos", user_id: "u-biz", created_at: ago(30), updated_at: ago(30) }],
      collaborations: [{ campaign_id: "c1", creator_id: "u-crt", status: "active", content_status: "in_progress", updated_at: ago(20), completed_at: null }],
      businessByUserId: biz, creatorByUserId: crt, nowIso: NOW,
    });
    expect(out[0].blocker).toMatch(/finish/i);
    expect(out[0].creator_name).toBe("Mia");
    expect(out[0].creator_handle).toEqual({ channel: "tiktok", handle: "miatt" });
  });

  it("excludes campaigns with a completed collaboration and those <14d old", () => {
    const completed = computeStalledCampaigns({
      campaigns: [{ id: "c1", title: "X", user_id: "u-biz", created_at: ago(30), updated_at: ago(30) }],
      collaborations: [{ campaign_id: "c1", creator_id: "u-crt", status: "completed", content_status: "delivered", updated_at: ago(5), completed_at: ago(5) }],
      businessByUserId: biz, creatorByUserId: crt, nowIso: NOW,
    });
    expect(completed).toHaveLength(0);
    const fresh = computeStalledCampaigns({
      campaigns: [{ id: "c2", title: "Y", user_id: "u-biz", created_at: ago(3), updated_at: ago(3) }],
      collaborations: [], businessByUserId: biz, creatorByUserId: crt, nowIso: NOW,
    });
    expect(fresh).toHaveLength(0);
  });
});

describe("computeDormantCreators", () => {
  const creators = [
    { user_id: "a", creator_name: "Ana", instagram_url: "anaig", created_at: ago(60), skills: ["food"] },
    { user_id: "b", creator_name: "Ben", created_at: ago(60) },         // active recently
    { user_id: "c", creator_name: "Cy", created_at: ago(3) },           // too new
  ];
  it("returns only stale, >7d-old creators with days_since_activity (null = never)", () => {
    const out = computeDormantCreators({
      creators, lastActivityByUserId: { b: ago(2) }, nowIso: NOW,
    });
    expect(out.map((c) => c.creator_name)).toEqual(["Ana"]);
    expect(out[0].days_since_activity).toBeNull();
    expect(out[0].handle).toEqual({ channel: "instagram", handle: "anaig" });
  });
});

describe("computeLapsedRestaurants", () => {
  const restaurants = [
    { user_id: "r1", business_name: "R1", instagram_url: "r1ig", created_at: ago(30) },   // never launched
    { user_id: "r2", business_name: "R2", created_at: ago(30) },                           // launched + boosted
    { user_id: "r3", business_name: "R3", created_at: ago(3) },                            // too new
  ];
  it("flags >7d restaurants missing a campaign or a boost, with a reason", () => {
    const out = computeLapsedRestaurants({
      restaurants, campaignOwnerIds: ["r2"], boosterIds: ["r2"], nowIso: NOW,
    });
    expect(out.map((r) => r.business_name)).toEqual(["R1"]);
    expect(out[0].reason).toMatch(/never/i);
  });
});

describe("buildReactivationTargets caps each segment at TARGET_CAP and reports totals", () => {
  it("caps items but reports the true total", () => {
    const many = Array.from({ length: TARGET_CAP + 5 }, (_, i) => ({
      user_id: `u${i}`, creator_name: `C${i}`, created_at: ago(60),
    }));
    const res = buildReactivationTargets({
      nowIso: NOW, campaigns: [], collaborations: [], businessByUserId: {}, creatorByUserId: {},
      creators: many, lastActivityByUserId: {}, restaurants: [], campaignOwnerIds: [], boosterIds: [],
    });
    expect(res.dormant_creators.items).toHaveLength(TARGET_CAP);
    expect(res.dormant_creators.total).toBe(TARGET_CAP + 5);
    expect(res.generated_at).toBe(NOW);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd "C:/GIT/dragoncandy-v3-d783432b/.claude/worktrees/DC-Dezzy-AI" && npx vitest run supabase/functions/aios-playbook-run/reactivation.test.ts`
Expected: FAIL — `Cannot find module './reactivation'`.

- [ ] **Step 3: Implement the pure module**

```ts
// supabase/functions/aios-playbook-run/reactivation.ts
// Pure helpers for the get_reactivation_targets read tool. NO Deno/https/supabase
// imports at module scope so vitest loads it directly (see history.ts, doc-edits.ts).
// The index.ts case does the bounded DB fetches; this file shapes the rows.
// SCALE: fetches whole small tables + set logic in JS — fine pre-launch; revisit at scale.

export const TARGET_CAP = 15;
export const STALLED_MIN_DAYS = 14;
export const DORMANT_DAYS = 21;
export const MIN_ACCOUNT_DAYS = 7;

export interface Handle { channel: string; handle: string }

export function daysBetween(fromIso: string | null | undefined, nowIso: string): number {
  if (!fromIso) return Infinity;
  return Math.floor((new Date(nowIso).getTime() - new Date(fromIso).getTime()) / 86_400_000);
}

export function pickHandle(p: {
  instagram_url?: string | null; tiktok_url?: string | null;
  youtube_url?: string | null; website_url?: string | null;
}): Handle | null {
  if (p.instagram_url) return { channel: "instagram", handle: p.instagram_url };
  if (p.tiktok_url) return { channel: "tiktok", handle: p.tiktok_url };
  if (p.youtube_url) return { channel: "youtube", handle: p.youtube_url };
  if (p.website_url) return { channel: "website", handle: p.website_url };
  return null;
}

export interface RawCampaign { id: string; title: string | null; user_id: string; created_at: string; updated_at: string | null }
export interface RawCollab { campaign_id: string; creator_id: string | null; status: string | null; content_status: string | null; updated_at: string | null; completed_at: string | null }
export interface RawBusiness { user_id: string; business_name: string | null; instagram_url?: string | null; website_url?: string | null; created_at?: string }
export interface RawCreator { user_id: string; creator_name: string | null; instagram_url?: string | null; tiktok_url?: string | null; youtube_url?: string | null; created_at: string; skills?: string[] | null }
export interface RawRestaurant extends RawBusiness { created_at: string }

export interface StalledTarget {
  campaign_id: string; title: string; days_stalled: number;
  business_name: string | null; business_handle: Handle | null;
  creator_name: string | null; creator_handle: Handle | null; blocker: string;
}
export interface DormantTarget { creator_name: string; handle: Handle | null; days_since_activity: number | null; skills: string[] }
export interface LapsedTarget { business_name: string; handle: Handle | null; days_since_signup: number; reason: string }

export function computeStalledCampaigns(input: {
  campaigns: RawCampaign[]; collaborations: RawCollab[];
  businessByUserId: Record<string, RawBusiness>; creatorByUserId: Record<string, RawCreator>; nowIso: string;
}): StalledTarget[] {
  const { campaigns, collaborations, businessByUserId, creatorByUserId, nowIso } = input;
  const byCampaign = new Map<string, RawCollab[]>();
  for (const c of collaborations) {
    const arr = byCampaign.get(c.campaign_id) ?? [];
    arr.push(c); byCampaign.set(c.campaign_id, arr);
  }
  const out: StalledTarget[] = [];
  for (const cam of campaigns) {
    if (daysBetween(cam.created_at, nowIso) < STALLED_MIN_DAYS) continue;
    const collabs = byCampaign.get(cam.id) ?? [];
    if (collabs.some((c) => c.status === "completed")) continue;
    const biz = businessByUserId[cam.user_id] ?? null;
    let creator: RawCreator | null = null;
    let blocker: string;
    if (collabs.length === 0) {
      blocker = "No creator engaged yet — nudge the business to refresh or invite creators.";
    } else {
      const live = collabs[0];
      creator = live.creator_id ? creatorByUserId[live.creator_id] ?? null : null;
      blocker = "Collaboration started but content not delivered — nudge business + creator to finish.";
    }
    out.push({
      campaign_id: cam.id,
      title: cam.title ?? "(untitled campaign)",
      days_stalled: daysBetween(cam.created_at, nowIso),
      business_name: biz?.business_name ?? null,
      business_handle: biz ? pickHandle(biz) : null,
      creator_name: creator?.creator_name ?? null,
      creator_handle: creator ? pickHandle(creator) : null,
      blocker,
    });
  }
  return out;
}

export function computeDormantCreators(input: {
  creators: RawCreator[]; lastActivityByUserId: Record<string, string>; nowIso: string;
}): DormantTarget[] {
  const { creators, lastActivityByUserId, nowIso } = input;
  const out: DormantTarget[] = [];
  for (const c of creators) {
    if (daysBetween(c.created_at, nowIso) < MIN_ACCOUNT_DAYS) continue;
    const last = lastActivityByUserId[c.user_id];
    const daysSince = last ? daysBetween(last, nowIso) : null;
    if (daysSince !== null && daysSince < DORMANT_DAYS) continue; // recently active
    out.push({
      creator_name: c.creator_name ?? "(unnamed creator)",
      handle: pickHandle(c),
      days_since_activity: daysSince,
      skills: c.skills ?? [],
    });
  }
  return out;
}

export function computeLapsedRestaurants(input: {
  restaurants: RawRestaurant[]; campaignOwnerIds: string[]; boosterIds: string[]; nowIso: string;
}): LapsedTarget[] {
  const { restaurants, nowIso } = input;
  const owners = new Set(input.campaignOwnerIds);
  const boosters = new Set(input.boosterIds);
  const out: LapsedTarget[] = [];
  for (const r of restaurants) {
    if (daysBetween(r.created_at, nowIso) < MIN_ACCOUNT_DAYS) continue;
    const launched = owners.has(r.user_id);
    const boosted = boosters.has(r.user_id);
    if (launched && boosted) continue;
    const reason = !launched && !boosted
      ? "Signed up but never launched a campaign or boosted content."
      : !launched
        ? "Has boosted but never launched a campaign."
        : "Has launched a campaign but never boosted creator content.";
    out.push({
      business_name: r.business_name ?? "(unnamed restaurant)",
      handle: pickHandle(r),
      days_since_signup: daysBetween(r.created_at, nowIso),
      reason,
    });
  }
  return out;
}

export interface Segment<T> { items: T[]; total: number }
export interface ReactivationResult {
  generated_at: string;
  stalled_campaigns: Segment<StalledTarget>;
  dormant_creators: Segment<DormantTarget>;
  lapsed_restaurants: Segment<LapsedTarget>;
}
function cap<T>(arr: T[]): Segment<T> { return { items: arr.slice(0, TARGET_CAP), total: arr.length }; }

export function buildReactivationTargets(input: {
  nowIso: string;
  campaigns: RawCampaign[]; collaborations: RawCollab[];
  businessByUserId: Record<string, RawBusiness>; creatorByUserId: Record<string, RawCreator>;
  creators: RawCreator[]; lastActivityByUserId: Record<string, string>;
  restaurants: RawRestaurant[]; campaignOwnerIds: string[]; boosterIds: string[];
}): ReactivationResult {
  return {
    generated_at: input.nowIso,
    stalled_campaigns: cap(computeStalledCampaigns(input)),
    dormant_creators: cap(computeDormantCreators({ creators: input.creators, lastActivityByUserId: input.lastActivityByUserId, nowIso: input.nowIso })),
    lapsed_restaurants: cap(computeLapsedRestaurants({ restaurants: input.restaurants, campaignOwnerIds: input.campaignOwnerIds, boosterIds: input.boosterIds, nowIso: input.nowIso })),
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd "C:/GIT/dragoncandy-v3-d783432b/.claude/worktrees/DC-Dezzy-AI" && npx vitest run supabase/functions/aios-playbook-run/reactivation.test.ts`
Expected: PASS (all cases). If the repo's vitest picks up unrelated pre-existing failing e2e files, scope strictly to this file's path.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/aios-playbook-run/reactivation.ts supabase/functions/aios-playbook-run/reactivation.test.ts
git commit -m "feat(aios): pure reactivation-target helpers for Dezzy Outreach (tested)"
```

---

### Task 2: Wire `get_reactivation_targets` into the runner

**Files:**
- Modify: `supabase/functions/aios-playbook-run/index.ts` (tool def near line 44-84; `executeReadTool` signature line 181 + call site line 377; add the case near line 233)

- [ ] **Step 1: Add the tool definition** to the end of `READ_TOOL_DEFINITIONS`:

```ts
  {
    name: "get_reactivation_targets",
    description:
      "Reactivation outreach targets from live marketplace data: stalled_campaigns (published/active >14d with no completed collaboration), dormant_creators (no application/post in 21d), lapsed_restaurants (never launched a campaign or never boosted). Each segment returns {items, total}; items carry names + PUBLIC social handles only (NO emails), capped at 15. Use for the Dezzy weekly reactivation outreach playbook.",
    input_schema: { type: "object", properties: {} },
  },
```

- [ ] **Step 2: Import the pure module** at the top of `index.ts` (with the `.ts` extension — Deno):

```ts
import { buildReactivationTargets } from "./reactivation.ts";
```

- [ ] **Step 3: Thread the `admin` client into `executeReadTool`.**
Change the signature to `async function executeReadTool(name, args, userClient, admin: SupabaseClient)` and the call site (≈ line 377) to `await executeReadTool(tu.name, tu.input ?? {}, userClient, admin)`.

- [ ] **Step 4: Add the case** inside `executeReadTool`'s switch (before `default`):

```ts
    case "get_reactivation_targets": {
      const nowIso = new Date().toISOString();
      const [campaignsRes, allCampaignsRes, restaurantsRes, creatorsRes, appsRes, postsRes, boostsRes] = await Promise.all([
        admin.from("campaigns").select("id,title,user_id,created_at,updated_at,status").in("status", ["published", "active"]),
        admin.from("campaigns").select("user_id"), // ALL statuses — for the lapsed-restaurant "never launched" anti-join
        admin.from("business_profiles").select("user_id,business_name,instagram_url,website_url,created_at").eq("account_type", "restaurant"),
        admin.from("creator_profiles").select("user_id,creator_name,instagram_url,tiktok_url,youtube_url,created_at,skills"),
        admin.from("campaign_applications").select("creator_id,created_at"),
        admin.from("dragonshare_posts").select("creator_id,created_at"),
        admin.from("dragonshare_boosts").select("boosting_user_id"),
      ]);
      for (const r of [campaignsRes, allCampaignsRes, restaurantsRes, creatorsRes, appsRes, postsRes, boostsRes]) if (r.error) throw r.error;

      const campaigns = campaignsRes.data ?? [];
      const campaignIds = campaigns.map((c) => c.id);
      const ownerIds = [...new Set(campaigns.map((c) => c.user_id))];

      // Guarded: skip the query when the id list is empty (avoids an empty .in() and keeps types clean).
      let collaborations: Json[] = [];
      if (campaignIds.length) {
        const collabRes = await admin.from("campaign_collaborations")
          .select("campaign_id,creator_id,status,content_status,updated_at,completed_at").in("campaign_id", campaignIds);
        if (collabRes.error) throw collabRes.error;
        collaborations = collabRes.data ?? [];
      }

      let businesses: Json[] = [];
      if (ownerIds.length) {
        const bizRes = await admin.from("business_profiles")
          .select("user_id,business_name,instagram_url,website_url").in("user_id", ownerIds);
        if (bizRes.error) throw bizRes.error;
        businesses = bizRes.data ?? [];
      }

      const creators = creatorsRes.data ?? [];
      const lastActivityByUserId: Record<string, string> = {};
      for (const row of [...(appsRes.data ?? []), ...(postsRes.data ?? [])]) {
        const uid = (row as { creator_id?: string }).creator_id;
        const at = (row as { created_at?: string }).created_at;
        if (!uid || !at) continue;
        if (!lastActivityByUserId[uid] || at > lastActivityByUserId[uid]) lastActivityByUserId[uid] = at;
      }

      return buildReactivationTargets({
        nowIso,
        campaigns,
        collaborations,
        businessByUserId: Object.fromEntries(businesses.map((b) => [b.user_id, b])),
        creatorByUserId: Object.fromEntries(creators.map((c) => [c.user_id, c])),
        creators,
        lastActivityByUserId,
        restaurants: restaurantsRes.data ?? [],
        campaignOwnerIds: (allCampaignsRes.data ?? []).map((c) => c.user_id),
        boosterIds: (boostsRes.data ?? []).map((b) => b.boosting_user_id).filter(Boolean),
      });
    }
```

- [ ] **Step 5: Sanity-build** the frontend (won't type-check Deno, but catches accidental cross-imports): `npm run build` → expect success. Then `npx vitest run supabase/functions/aios-playbook-run/reactivation.test.ts` still green.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/aios-playbook-run/index.ts
git commit -m "feat(aios): get_reactivation_targets read tool in aios-playbook-run"
```

---

### Task 3: Seed migration for the `dezzy-outreach` playbook

**Files:**
- Create: `supabase/migrations/<timestamp>_seed_dezzy_outreach_playbook.sql`

- [ ] **Step 1: Verify the `aios_playbooks` shape first** (so the INSERT matches columns + NOT NULLs + the slug constraint). Via Supabase MCP `execute_sql` on `zocahiffooqdybdhguqv`:

```sql
select column_name, is_nullable, column_default from information_schema.columns
where table_schema='public' and table_name='aios_playbooks' order by ordinal_position;
select conname, contype from pg_constraint where conrelid='public.aios_playbooks'::regclass;
```
Expected: confirm `slug` has a UNIQUE constraint and identify any NOT NULL column without a default (e.g. `created_by`) that the seed must populate. Adjust the INSERT accordingly.

- [ ] **Step 2: Write the migration** (dollar-quoted bodies; idempotent). Fill any required NOT NULL columns found in Step 1.

```sql
-- Seed the Dezzy reactivation outreach playbook (report-only, no proposals).
insert into public.aios_playbooks (slug, title, task_md, preferences_md, done_criteria_md, allowed_proposals, status)
values (
  'dezzy-outreach',
  'Dezzy — Weekly Reactivation Outreach',
  $task$You are running DragonCandy's weekly reactivation outreach for the founders.

1. Call `get_reactivation_targets` once. It returns three segments — stalled_campaigns, dormant_creators, lapsed_restaurants — each as {items, total}, with public social handles (no emails).
2. For EVERY item in each segment, write ONE short, personalized, ready-to-paste outreach message. Personalize ONLY from the item's data (campaign title, days stalled, blocker, dormancy length, reason). Never invent details.
3. Group output by segment with a heading and the count (e.g. "Dormant creators (4 of 4)"). Per item show: target name, suggested channel + handle, and the drafted message in a fenced block for easy copy. If a handle is null, say "no public handle — look up contact in the dashboard".
4. If a segment's items array is empty, say so plainly and continue.
5. End with the required JSON self-assessment block.$task$,
  $prefs$Write every message AS Dezzy, DragonCandy's friendly growth agent — warm, human, concise; never corporate or salesy.
- <= ~60 words per message; one clear call-to-action.
- Open with something specific to them (their campaign, craft, or restaurant).
- Stalled campaigns: name the specific blocker; offer concrete help to move it forward.
- Dormant creators: warm "we miss you"; point to fresh opportunities; no guilt.
- Lapsed restaurants: lead with the value (creators ready to make content about them); low-friction first step.
- At most one emoji; no fake urgency; no promises the platform can't keep.
- These are DRAFTS a human will send: ready-to-paste, real names from the data, no [placeholders].$prefs$,
  $done$- get_reactivation_targets was called and all three segments are addressed.
- Every returned item has a ready-to-paste personalized draft, or its segment was explicitly marked empty.
- Each draft names the real target, references a specific hook from the data, and states a channel.
- No invented targets/numbers/details beyond the tool result; no email addresses.
- Output ends with the JSON self-assessment block.$done$,
  '[]'::jsonb,
  'active'
)
on conflict (slug) do update set
  title = excluded.title, task_md = excluded.task_md,
  preferences_md = excluded.preferences_md, done_criteria_md = excluded.done_criteria_md,
  allowed_proposals = excluded.allowed_proposals, status = 'active';
```

- [ ] **Step 3: Commit the migration file** (apply happens in Task 4):

```bash
git add supabase/migrations/*_seed_dezzy_outreach_playbook.sql
git commit -m "feat(aios): seed dezzy-outreach reactivation playbook"
```

---

### Task 4: Apply, deploy & verify on prod

> No unit test covers the edge wiring or SQL — verify live (the repo's standard for Deno/DB/deploy paths). Read-only probes first; one write (apply migration) + one deploy.

- [ ] **Step 1: Validate the live segment queries** via MCP `execute_sql` (read-only) — confirm each segment returns sensible rows and the joins (`creator_profiles.user_id = *.creator_id`) hold. Spot-check 2-3 targets by hand.

- [ ] **Step 2: Apply the seed migration** via MCP `apply_migration` (name `seed_dezzy_outreach_playbook`). Confirm: `select slug, status, allowed_proposals from aios_playbooks where slug='dezzy-outreach';` → `active`, `[]`.

- [ ] **Step 3: Deploy `aios-playbook-run`** — prefer the **Supabase CLI** (`supabase functions deploy aios-playbook-run --no-verify-jwt`), which auto-bundles every `_shared` dependency from disk and avoids the MCP enumeration footgun. (If using MCP `deploy_edge_function` instead, bundle ALL transitive files: `index.ts`, `reactivation.ts`, `_shared/cors.ts`, `_shared/anthropic-fetch.ts`, `_shared/cost-ledger.ts`, **`_shared/model-routing.ts`** — `cost-ledger` imports it.) **Preserve `verify_jwt=false`** (confirm via `list_edge_functions`, not config.toml). Boot-check: the function should still respond (e.g. an unauth call returns 401, not a boot error).

- [ ] **Step 4: Run the playbook on prod data.** As an admin session (the `/internal/playbooks/dezzy-outreach` **Run** button, or invoke the function with an admin JWT). Then read the result:
```sql
select status, left(result_summary_md, 4000) as preview, done_check
from aios_playbook_runs r join aios_playbooks p on p.id = r.playbook_id
where p.slug = 'dezzy-outreach' order by r.started_at desc limit 1;
```

- [ ] **Step 5: Eyeball the report (acceptance gate).** Confirm: drafts are personalized + ready-to-paste; segment counts match the live data; channels/handles are sane; **no email addresses or non-public PII leaked**; `done_check.done = true`. If quality is off, tune `task_md`/`preferences_md` in the seed migration and re-apply (idempotent) + re-run.

---

### Task 5: Codex review, knowledge-sync, finish branch

- [ ] **Step 1: Full local checks** — `npm run build` (pass) and `npx vitest run supabase/functions/aios-playbook-run/reactivation.test.ts` (pass).
- [ ] **Step 2: Codex second review** — use the `codex-review` skill: `codex review --base main --title "Dezzy Outreach v1"`. Fix any real findings; re-run until clean.
- [ ] **Step 3: Knowledge-sync** — use the `knowledge-sync` skill: update `docs/wiki/analyses/the-core-idea-two-agents-one-company.md` with what shipped; add a concept page (e.g. `docs/wiki/concepts/dezzy-agent-playbook-suite.md`) capturing the "Dezzy = branded suite of Founder Playbooks, not a new runtime" decision and the `get_reactivation_targets` tool; refresh the PROJECT_CONTEXT Active-Workstreams entry. Sync Donny's RAG after merge.
- [ ] **Step 4: Finish the branch** — use the `finishing-a-development-branch` skill (open the PR; the seed migration + edge-fn change are reviewed like any code). Push/PR only on explicit go-ahead (per repo "commit/push when asked" rule).

---

## Intentional v1 simplifications (flagged so they aren't read as spec misses)
- **Stalled / unfinished collaboration:** any non-completed collaboration on a >14d campaign counts as stalled; the spec's `updated_at > 10d` refinement is dropped for v1 (the 14-day campaign-age gate already ensures staleness).
- **Return shape:** the tool returns a single best `handle` per target (via `pickHandle`) rather than the spec §4.1 `handles:{instagram,tiktok,youtube}` sketch — cleaner for the model, consumed free-form.
- **Dormancy signal:** application + DragonShare-post recency only; `auth.users.last_sign_in_at` is intentionally not used in v1.

## Out of scope (do not build — v1.5+)
One-tap / auto-send (in-app message + email), scheduled weekly push, cold outreach / prospect sourcing, the runner's system-prompt "Dezzy" re-skin, and the other five Dezzy domains.
