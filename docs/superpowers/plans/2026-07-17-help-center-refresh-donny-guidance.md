# Help Center refresh + Donny guidance-agent fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring `dragoncandy.io/help` current with everything shipped since May 2026 AND fix Donny's `guidance_agent` so it can actually read the help center — one coherent update serving both the human reader and Donny.

**Architecture:** The help page is DB-driven (`help_articles` table → `HelpCenter.tsx`/`HelpArticlePage.tsx`). We (1) fix `donny-orchestrator/agents/guidance.ts` to query the real schema + add a self-maintaining `search_vector` full-text column so Donny's `textSearch` works; (2) refresh stale article bodies and insert new articles (Crews, DragonFeed, near-me search, DC Points/Creator Standing) via SQL migrations following the established `UPDATE … WHERE slug` / `INSERT` pattern; (3) add one new `rewards` category (DB CHECK + frontend `CATEGORIES` array). Deploy ordering: migration → edge fn → frontend.

**Tech Stack:** Supabase Postgres (migrations via MCP `apply_migration` under the `careful` gate — no local DB), Deno edge functions (`donny-orchestrator`, `verify_jwt=true`), React 18 + TS + Vite frontend, vitest for pure helpers.

**Spec:** `docs/superpowers/specs/2026-07-17-help-center-refresh-donny-guidance-design.md`

---

## File Structure

| File | Create/Modify | Responsibility |
|------|---------------|----------------|
| `supabase/functions/donny-orchestrator/agents/guidance-helpers.ts` | Create | Pure `stripHtml()` excerpt helper (no `esm.sh` imports → vitest-loadable). |
| `supabase/functions/donny-orchestrator/agents/guidance-helpers.test.ts` | Create | vitest for `stripHtml`. |
| `supabase/functions/donny-orchestrator/agents/guidance.ts` | Modify | Query real schema (`body` + `search_vector` textSearch), build excerpts via `stripHtml`, drop the dead `related_paths` block. |
| `supabase/migrations/20260717120000_help_articles_search_and_rewards_category.sql` | Create | `search_vector` generated column + GIN index; extend category CHECK with `'rewards'`. |
| `supabase/migrations/20260717120001_help_articles_content_2026_07.sql` | Create | `UPDATE` stale bodies (donny_ai ×4, launch/apply) + `INSERT` 5 new articles. |
| `src/pages/help/HelpCenter.tsx` | Modify | Add `rewards` entry to `CATEGORIES` + extend the lucide import. |
| `docs/wiki/concepts/help-center-and-guidance.md` | Create (Task 8) | Wiki concept page documenting the `help_articles` ⇄ `guidance_agent` schema contract. |

**Deploy note (no local Postgres):** migrations are applied to **prod** via the Supabase MCP under the `careful` gate; SQL correctness is verified by review + the apply's success + post-apply row checks. Do **not** attempt `supabase db reset`/local apply.

---

## Task 1: `stripHtml` excerpt helper (TDD)

**Files:**
- Create: `supabase/functions/donny-orchestrator/agents/guidance-helpers.ts`
- Test: `supabase/functions/donny-orchestrator/agents/guidance-helpers.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// supabase/functions/donny-orchestrator/agents/guidance-helpers.test.ts
import { describe, it, expect } from "vitest";
import { stripHtml } from "./guidance-helpers.ts";

describe("stripHtml", () => {
  it("removes tags and collapses whitespace", () => {
    const html = "<p>Hello <strong>world</strong></p>\n<ul><li>one</li><li>two</li></ul>";
    expect(stripHtml(html, 200)).toBe("Hello world one two");
  });

  it("truncates to maxLen without cutting mid-run past the limit", () => {
    const out = stripHtml("<p>" + "a".repeat(500) + "</p>", 200);
    expect(out.length).toBe(200);
  });

  it("is null/undefined-safe", () => {
    expect(stripHtml(undefined, 200)).toBe("");
    expect(stripHtml(null, 200)).toBe("");
    expect(stripHtml("", 200)).toBe("");
  });

  it("decodes the common named entities help bodies use", () => {
    expect(stripHtml("<p>Tips &amp; tricks &mdash; go</p>", 200)).toBe("Tips & tricks — go");
  });

  it("defaults maxLen to 200 when omitted", () => {
    expect(stripHtml("<p>" + "b".repeat(300) + "</p>")).toHaveLength(200);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd "C:/GIT/dragoncandy-v3-d783432b/.claude/worktrees/dc-help-page" && npx vitest run supabase/functions/donny-orchestrator/agents/guidance-helpers.test.ts`
Expected: FAIL — `Cannot find module './guidance-helpers.ts'` / `stripHtml is not a function`.

- [ ] **Step 3: Write the minimal implementation**

```ts
// supabase/functions/donny-orchestrator/agents/guidance-helpers.ts
// Pure, dependency-free (no https://esm.sh imports) so vitest can load it directly.
// Turns a help article's HTML body into a short plain-text excerpt for Donny's context.

const ENTITIES: Record<string, string> = {
  "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"',
  "&#39;": "'", "&apos;": "'", "&mdash;": "—", "&ndash;": "–", "&nbsp;": " ",
};

export function stripHtml(html: string | null | undefined, maxLen = 200): string {
  if (!html) return "";
  const text = html
    .replace(/<[^>]*>/g, " ")                                  // drop tags
    .replace(/&[a-zA-Z#0-9]+;/g, (m) => ENTITIES[m] ?? " ")   // decode common entities
    .replace(/\s+/g, " ")                                      // collapse whitespace
    .trim();
  return text.length > maxLen ? text.slice(0, maxLen) : text;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run supabase/functions/donny-orchestrator/agents/guidance-helpers.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/donny-orchestrator/agents/guidance-helpers.ts supabase/functions/donny-orchestrator/agents/guidance-helpers.test.ts
git commit -m "feat(donny): add stripHtml excerpt helper for guidance agent"
```

---

## Task 2: Rewrite `guidance.ts` to the real schema

**Files:**
- Modify: `supabase/functions/donny-orchestrator/agents/guidance.ts`

**Context:** The current file selects nonexistent `content`, `textSearch`es a nonexistent `search_vector`, and `ilike`s a nonexistent `related_paths` — returning zero articles. After Task 3's migration, `search_vector` will exist. This task changes the code to match `body` + `search_vector` and removes the `related_paths` page-context block. Preserve the return contract `{ context, suggested_actions }`.

- [ ] **Step 1: Replace the file body**

```ts
// supabase/functions/donny-orchestrator/agents/guidance.ts
import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SubAgentResult, UserContext } from "../types.ts";
import { stripHtml } from "./guidance-helpers.ts";

export async function execute(
  supabase: SupabaseClient,
  input: Record<string, unknown>,
  _userContext: UserContext
): Promise<SubAgentResult> {
  const query = (input.query as string) ?? "";
  const pagePath = (input.page_path as string) ?? "";
  const userRole = (input.user_role as string) ?? "";

  try {
    // Full-text search over the generated search_vector column (title + body + search_terms).
    const { data: articles, error } = await supabase
      .from("help_articles")
      .select("id, title, body, category, slug")
      .textSearch("search_vector", query, { type: "plain", config: "english" })
      .limit(5);

    if (error) {
      console.warn("[guidance_agent] text search failed:", error.message);
    }

    const allArticles = (articles ?? []).slice(0, 5);

    const articleRefs = allArticles.map((a) => ({
      title: a.title,
      category: a.category,
      slug: a.slug,
      excerpt: stripHtml(a.body, 200),
    }));

    const suggestedActions: Array<{ label: string; route: string }> = [];
    for (const article of allArticles.slice(0, 2)) {
      suggestedActions.push({
        label: `Read: ${article.title}`,
        route: `/help/${article.slug}`,
      });
    }

    // Fallback when the search found nothing.
    if (suggestedActions.length === 0) {
      suggestedActions.push({ label: "View help center", route: "/help" });
    }

    const context = JSON.stringify({
      articles: articleRefs,
      page_path: pagePath,
      user_role: userRole,
    });

    return { context, suggested_actions: suggestedActions };
  } catch (err) {
    console.error("[guidance_agent] error:", err);
    return {
      context: "Unable to fetch guidance articles at this time.",
      suggested_actions: [{ label: "Visit help center", route: "/help" }],
    };
  }
}
```

**Notes:**
- The `deduplicateById` helper and the `pageArticles`/`related_paths` block are removed (no page-context source; deferred per spec). `page_path`/`user_role` are still passed through in `context` for the model.
- The old role-specific fallback `/help?category=creator` is dropped — `HelpCenter` doesn't read a `category` query param, so it was a dead route param. A single `/help` fallback is honest.
- `SubAgentResult` already types `{ context, suggested_actions? }` — no type change needed. Verify by reading `../types.ts`.

- [ ] **Step 2: Typecheck-adjacent verification (no local Deno test for this file)**

Run: `cd "C:/GIT/dragoncandy-v3-d783432b/.claude/worktrees/dc-help-page" && npx vitest run supabase/functions/donny-orchestrator`
Expected: PASS — existing `routes.test.ts` + `agents/web.test.ts` + the new `guidance-helpers.test.ts` all green (this file has no direct unit test; its behavior is covered by the live-verify in Task 7).

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/donny-orchestrator/agents/guidance.ts
git commit -m "fix(donny): guidance agent reads real help_articles schema (body + search_vector)"
```

---

## Task 3: Migration A — `search_vector` + GIN index + `rewards` category

**Files:**
- Create: `supabase/migrations/20260717120000_help_articles_search_and_rewards_category.sql`

- [ ] **Step 1: Write the migration**

> **Gotcha (hit + fixed at deploy):** a `GENERATED ALWAYS AS (to_tsvector('english', …)) STORED`
> column is rejected — `ERROR 42P17: generation expression is not immutable`. Use a plain `tsvector`
> column + a `BEFORE INSERT OR UPDATE OF title, body, search_terms` trigger + a one-time backfill.

```sql
-- 1) Plain tsvector column kept in sync by a trigger over title/body/search_terms.
ALTER TABLE public.help_articles ADD COLUMN IF NOT EXISTS search_vector tsvector;

CREATE OR REPLACE FUNCTION public.help_articles_set_search_vector() RETURNS trigger
LANGUAGE plpgsql AS $fn$
BEGIN
  NEW.search_vector := to_tsvector('english',
    coalesce(NEW.title,'') || ' ' || coalesce(NEW.body,'') || ' ' ||
    coalesce(array_to_string(NEW.search_terms,' '),''));
  RETURN NEW;
END; $fn$;

DROP TRIGGER IF EXISTS trg_help_articles_search_vector ON public.help_articles;
CREATE TRIGGER trg_help_articles_search_vector
  BEFORE INSERT OR UPDATE OF title, body, search_terms
  ON public.help_articles FOR EACH ROW
  EXECUTE FUNCTION public.help_articles_set_search_vector();

-- Backfill existing rows (the trigger only fires on future writes).
UPDATE public.help_articles SET search_vector = to_tsvector('english',
  coalesce(title,'') || ' ' || coalesce(body,'') || ' ' ||
  coalesce(array_to_string(search_terms,' '),''));

CREATE INDEX IF NOT EXISTS idx_help_articles_search_vector
  ON public.help_articles USING gin (search_vector);

-- 2) Add the 'rewards' category to the CHECK constraint.
ALTER TABLE public.help_articles DROP CONSTRAINT IF EXISTS help_articles_category_check;
ALTER TABLE public.help_articles ADD CONSTRAINT help_articles_category_check
  CHECK (category IN ('getting_started','campaigns','dragonshare','billing',
                      'account','donny_ai','messaging','rewards'));
```

- [ ] **Step 2: Self-review the SQL**

Confirm: the generated expression uses only immutable functions (`to_tsvector('english', …)` 2-arg form, `array_to_string`, `coalesce`) so the generated column is valid; the CHECK list is the existing 7 values **plus** `rewards`. Do not apply yet — application happens in Task 7 under the `careful` gate.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260717120000_help_articles_search_and_rewards_category.sql
git commit -m "feat(help): add help_articles search_vector + GIN + rewards category (migration)"
```

---

## Task 4: Migration B — content refresh + new articles

**Files:**
- Create: `supabase/migrations/20260717120001_help_articles_content_2026_07.sql`

**Copy rules (must hold for every body below):**
- Match the existing HTML pattern: intro `<p>`, `<ol>` steps, `<h3>Tips</h3>` + `<ul>`. No new `<img>` (text-first).
- Use **live UI labels verbatim**: nav is **"Crews"** and **"Dragon Feed"**; the rewards currency label in the UI is **"DC Points"** with tier badges **Rising → Established → Pro → Elite → Icon**. (The documented "Reputation (Rep)" rename is NOT in the live `DragonPointsCard.tsx`; copy matches the live UI and the discrepancy is flagged in the PR — see spec §5.)
- Do not promise features that aren't live (e.g. Dragon Rewards award *notifications* depend on `go_live_at`, which may still be the sentinel — describe standing/points/badges, not alerts).

- [ ] **Step 1: Write the migration — refresh (UPDATE) block**

```sql
-- Help Articles content refresh (2026-07) + new articles.
-- Established pattern: UPDATE existing rows by slug (dollar-quoted bodies), then INSERT new rows.

-- ── Donny AI: what-is-donny ───────────────────────────────────────────────
UPDATE help_articles SET
  body = $body$
<p>Donny is DragonCandy's built-in AI assistant. It lives in the chat panel on every screen (the "Ask Donny" launcher) and helps you get things done with far less typing — generating campaigns, finding creators, answering how-to questions, and pointing you to the right screen.</p>

<h3>What Donny can do</h3>
<ul>
  <li><strong>Build campaigns for you</strong> — describe what you want (or paste a website/menu link) and Donny drafts a full campaign brief you can edit and launch.</li>
  <li><strong>Find creators</strong> — ask "find creators near me" and Donny returns a ranked list of creator cards with distance, plus buttons to view a portfolio or invite them.</li>
  <li><strong>Answer how-to questions</strong> — ask how any feature works and Donny pulls the matching help articles.</li>
  <li><strong>Look things up on the web</strong> — Donny can search the web and read a page when a question needs current, outside information.</li>
  <li><strong>Suggest next steps</strong> — Donny offers quick actions that take you straight to the right screen.</li>
</ul>

<h3>Tips</h3>
<ul>
  <li>Be specific — "Draft a weekend brunch Reel campaign for creators near me" beats "help with a campaign."</li>
  <li>Donny is a co-pilot, not an autopilot — you review and confirm before anything goes live.</li>
  <li>The more campaigns you run, the better Donny's suggestions get.</li>
</ul>
$body$,
  search_terms = ARRAY['donny','ai','assistant','chat','what is donny','help','find creators','campaign','web search']
WHERE slug = 'what-is-donny';

-- ── Donny AI: donny-help-briefs ───────────────────────────────────────────
UPDATE help_articles SET
  body = $body$
<p>Donny is available throughout the app to answer questions and take actions for you. Open the chat from the "Ask Donny" launcher on any dashboard or campaign screen.</p>

<ol>
  <li>Open Donny from the "Ask Donny" launcher (a side panel on desktop, a slide-up chat on mobile).</li>
  <li>Type your question or request — for example "How do crews work?", "Find creators near me", or "Draft a taco Tuesday campaign."</li>
  <li>Donny replies with an answer, a ready-to-edit draft, creator cards, or a quick action button that jumps you to the right screen.</li>
  <li>Review Donny's suggestion and confirm — nothing is published without you.</li>
</ol>

<h3>Tips</h3>
<ul>
  <li>Ask Donny to explain any feature — "What is a match score?" or "How do I get paid?" — and it pulls the matching help articles.</li>
  <li>The clearer your request, the better the result. Include the platform, goal, and audience where relevant.</li>
  <li>Donny is included with your plan — how much you can use scales with your plan tier.</li>
</ul>
$body$,
  search_terms = ARRAY['donny','ask donny','chat','help','brief','questions','assistant','quick actions']
WHERE slug = 'donny-help-briefs';

-- ── Donny AI: donny-campaign-suggestions ──────────────────────────────────
UPDATE help_articles SET
  body = $body$
<p>Stuck on what to run next? Ask Donny for campaign ideas. Donny drafts complete campaign concepts — title, angle, budget guidance, and the platforms and creator types that fit — grounded in your business profile.</p>

<ol>
  <li>Open Donny and ask for ideas — e.g. "Give me 3 campaign ideas for this month" or "Draft a campaign to promote our new brunch menu."</li>
  <li>Donny returns ready-to-edit campaign concepts, including a bolder "wildcard" idea to push your thinking.</li>
  <li>Pick one, tweak any field, and launch — or ask Donny to regenerate for fresh options.</li>
</ol>

<h3>Tips</h3>
<ul>
  <li>Paste a link to your website or menu and Donny will tailor the ideas to what you actually sell.</li>
  <li>Tell Donny the occasion (a holiday, a game day, a slow weeknight) for more targeted concepts.</li>
  <li>You can always edit a generated brief before it goes live — treat it as a strong first draft.</li>
</ul>
$body$,
  search_terms = ARRAY['donny','campaign ideas','suggestions','generate','brief','wildcard','inspiration']
WHERE slug = 'donny-campaign-suggestions';

-- ── Donny AI: donny-match-scores ──────────────────────────────────────────
UPDATE help_articles SET
  body = $body$
<p>A match score rates how well a creator fits a specific campaign, so you can spot the strongest candidates fast. Higher means a better fit. It is a guide, not a gate — you always make the final call.</p>

<h3>What the score weighs</h3>
<ul>
  <li><strong>Location</strong> — how close the creator is to your business (nearest creators score higher, but distance never rules anyone out entirely).</li>
  <li><strong>Niche & content fit</strong> — how well the creator's skills and content match your campaign.</li>
  <li><strong>Track record</strong> — ratings and past campaign performance on DragonCandy.</li>
  <li><strong>Profile completeness</strong> — creators with complete, linked profiles score higher.</li>
</ul>

<h3>Tips</h3>
<ul>
  <li><strong>Creators:</strong> completing your profile, linking your socials, and earning good ratings all raise your scores.</li>
  <li><strong>Businesses:</strong> use "Find creators near me" or ask Donny to surface your best-fit creators first.</li>
  <li>Scores refresh as profiles, ratings, and locations change.</li>
</ul>
$body$,
  search_terms = ARRAY['match score','matching','fit','creator','algorithm','location','ranking']
WHERE slug = 'donny-match-scores';

-- ── Campaigns: launch-campaign ────────────────────────────────────────────
UPDATE help_articles SET
  body = $body$
<p>Launching a campaign is how you connect with creators who will promote your business. The fastest path is to let Donny draft it for you, then review and publish.</p>

<ol>
  <li>Open Donny and describe your campaign (or paste your website/menu link) — Donny drafts the title, brief, budget guidance, and recommended platforms.</li>
  <li>Prefer to build it yourself? Start a new campaign from your dashboard and fill in the brief, budget, and deliverables.</li>
  <li>Review the details — a clear single deliverable (e.g. "one 60-second Reel") attracts more applicants than a vague brief.</li>
  <li>Set your dates and any location or audience requirements.</li>
  <li>Publish — your campaign goes live to the creator marketplace within minutes.</li>
</ol>

<h3>Tips</h3>
<ul>
  <li>Set your budget before launch — you can raise it later, but lowering it after applications arrive is disruptive.</li>
  <li>Want it private? Post to a <strong>crew</strong> instead so only your invited creators see it (see "Creator crews & private campaigns").</li>
  <li>Need content fast? Use the DragonDash option for rush delivery.</li>
</ul>
$body$,
  search_terms = ARRAY['launch','campaign','create','publish','brief','donny','budget','deliverable']
WHERE slug = 'launch-campaign';

-- ── Campaigns: apply-campaign ─────────────────────────────────────────────
UPDATE help_articles SET
  body = $body$
<p>As a creator, applying to campaigns is how you earn on DragonCandy. Each campaign shows a match score against your profile so you can spot the best fits quickly.</p>

<ol>
  <li>Open the <strong>Campaigns</strong> marketplace and browse available campaigns — your match score appears on each card.</li>
  <li>Tap a card to read the full brief, budget, and deliverables.</li>
  <li>Tap <strong>Apply</strong> and add a short note on why you're a great fit.</li>
  <li>You'll get a notification when the business responds.</li>
</ol>

<h3>Tips</h3>
<ul>
  <li>Focus on campaigns where your match score is high — acceptance rates are much better.</li>
  <li>A short personal note lifts your odds, even on lower-scoring campaigns.</li>
  <li>If a business adds you to a <strong>crew</strong>, its crew campaigns are free to apply to with a single tap — no payment step (see "Joining a crew").</li>
</ul>
$body$,
  search_terms = ARRAY['apply','campaign','creator','pitch','match score','crew','marketplace']
WHERE slug = 'apply-campaign';

-- Stamp every refreshed row so the help center shows a genuine refresh date
-- (not the stale 2026-05-12 insert date). If any UPDATE above used a wrong slug it
-- silently matches 0 rows — the Task 7 Step 3 slug + content checks catch that.
UPDATE help_articles SET updated_at = now()
WHERE slug IN (
  'what-is-donny','donny-help-briefs','donny-campaign-suggestions',
  'donny-match-scores','launch-campaign','apply-campaign'
);
```

- [ ] **Step 2: Append the INSERT block (5 new articles)**

```sql
-- ── New articles (2026-07) ────────────────────────────────────────────────
INSERT INTO public.help_articles (slug, title, body, category, roles, search_terms) VALUES

('creator-crews', 'Creator crews & private campaigns', $body$
<p>A <strong>crew</strong> is your private roster of creators. Post a campaign to a crew and only its members can see it — and they can apply with one tap and no payment. It's the easy way to run repeat, ambassador-style collaborations with creators you trust.</p>

<ol>
  <li>Open <strong>Crews</strong> from your dashboard menu and create a crew (give it a name like "Regulars" or "Summer ambassadors").</li>
  <li>Invite creators to the crew. Each creator gets an invite and joins once they accept — membership is opt-in on both sides.</li>
  <li>Create a campaign and scope it to your crew. Crew campaigns are <strong>free</strong>, so members can apply with a single tap.</li>
  <li>Only active crew members see the campaign — it's never shown in the public marketplace or emailed to other creators.</li>
</ol>

<h3>Tips</h3>
<ul>
  <li>Crews are for organic, ambassador-style collaborations. Your paid marketplace campaigns work exactly as before.</li>
  <li>Build a crew from creators who've already done great work for you, so re-collaborating is one tap away.</li>
  <li>You can remove a member or invite more at any time from the crew's page.</li>
</ul>
$body$, 'campaigns', ARRAY['restaurant']::text[], ARRAY['crew','crews','creator group','private campaign','ambassador','roster','invite creators']),

('creator-crews-creator', 'Joining a crew & applying', $body$
<p>When a business you've worked with adds you to their <strong>crew</strong>, you get early, exclusive access to their private campaigns — and applying is free and instant.</p>

<ol>
  <li>You'll receive an invitation to join a business's crew. Accept it to become a member.</li>
  <li>The business's crew campaigns appear for you in the campaign marketplace's Crews area.</li>
  <li>Because crew campaigns are free, you apply with a single tap — there's no payment step.</li>
  <li>From there it works like any collaboration — create the content and submit it for review. Crew campaigns are free, ambassador-style collaborations, so there's no payout for crew work; your regular paid campaigns still pay out the usual way.</li>
</ol>

<h3>Tips</h3>
<ul>
  <li>Being in a crew is a sign a business likes your work — it's a great source of repeat collaborations.</li>
  <li>You choose whether to join — accepting an invite is always your call, and you can decline.</li>
  <li>You'll be notified when a crew you're in posts something new.</li>
</ul>
$body$, 'campaigns', ARRAY['creator']::text[], ARRAY['crew','crews','join crew','invite','private campaign','one tap','apply']),

('dragon-feed', 'Discovering creators with Dragon Feed', $body$
<p><strong>Dragon Feed</strong> is a scrollable wall of creators' portfolio content — a fast way to discover creators and see the kind of work they make. Open it from <strong>Dragon Feed</strong> in your dashboard menu.</p>

<ol>
  <li>Scroll the feed to browse creator content. On phones it's a single-column, full-screen feed; on desktop it's a grid.</li>
  <li>Tap any post to open it full-screen, where you can like it or message the creator.</li>
  <li>Tap a creator's name or avatar to open their full profile and portfolio.</li>
  <li>Use the search box to find creators by name, or by location — type a ZIP or city and pick a distance (10, 25, 50, 100 miles, or Any) to see creators near a place.</li>
</ol>

<h3>Tips</h3>
<ul>
  <li>Searching by name works everywhere — you'll find a creator no matter where they're based.</li>
  <li>Add a location to narrow the results to creators near you or near a market you care about.</li>
  <li>Found someone great? Open their profile to invite them to a campaign.</li>
</ul>
$body$, 'dragonshare', ARRAY['restaurant','creator']::text[], ARRAY['dragon feed','feed','discover','browse creators','search','zip','radius','portfolio']),

('find-creators-near-me', 'Finding creators near you', $body$
<p>On the Browse Creators page you can filter creators by location and distance, so you can find people who can actually visit your business.</p>

<ol>
  <li>Open <strong>Browse Creators</strong>. By default it shows creators near your saved business location.</li>
  <li>Use the location control to search another area — type a city or ZIP.</li>
  <li>Pick a radius: 10, 25, 50, 100 miles, or "Any" to drop the distance filter.</li>
  <li>Sort by "Nearest first" to put the closest creators at the top — each card shows how many miles away they are.</li>
</ol>

<h3>Tips</h3>
<ul>
  <li>If your near-me search looks empty, widen the radius (or choose "Any") to see more creators.</li>
  <li>Make sure your business location is set in your profile so the default "near me" search is accurate.</li>
  <li>You can also just ask Donny — "find creators near me" — for a ranked list with distances.</li>
</ul>
$body$, 'campaigns', ARRAY['restaurant']::text[], ARRAY['find creators','near me','location','radius','distance','browse creators','nearby']),

('dragon-rewards', 'DC Points & Creator Standing', $body$
<p>DragonCandy rewards active members with <strong>DC Points</strong>. As you use the platform, you earn points and climb a standing ladder — a simple signal of how active and trusted you are.</p>

<h3>How you earn points</h3>
<ul>
  <li>Sharing content and getting it boosted through DragonShare.</li>
  <li>Completing campaigns and collaborations.</li>
  <li>Keeping a complete, up-to-date profile.</li>
  <li>Earning strong ratings on your work.</li>
</ul>

<h3>Your standing</h3>
<p>Your points and activity move you up a five-step ladder: <strong>Rising → Established → Pro → Elite → Icon</strong>. Your current standing shows on your dashboard, and your tier badge appears on your public profile so businesses and creators can see it at a glance.</p>

<h3>Tips</h3>
<ul>
  <li>Standing reflects real activity — completing work and keeping a strong profile is the way up.</li>
  <li>Your points balance is private to you; only your tier badge is shown publicly.</li>
  <li>Keep your profile complete and your ratings high to climb faster.</li>
</ul>
$body$, 'rewards', ARRAY['restaurant','creator']::text[], ARRAY['dc points','points','rewards','creator standing','tier','badge','rising','icon','reputation'])
ON CONFLICT (slug) DO NOTHING;
```

- [ ] **Step 3: Self-review the SQL**

- Every `$body$…$body$` block is balanced; no stray unescaped `$body$` inside bodies.
- All 5 `INSERT` categories are among the allowed set (`campaigns`, `dragonshare`, `rewards`) — `rewards` is valid only after Migration A, which applies first (Task 7 order).
- `roles` arrays are cast `::text[]`; slugs are unique (none collide with the 27 existing slugs).
- No `<img>` tags in new bodies (text-first).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260717120001_help_articles_content_2026_07.sql
git commit -m "feat(help): refresh donny/campaign articles + add crews, dragon-feed, near-me, rewards"
```

---

## Task 5: Frontend — add the `rewards` category

**Files:**
- Modify: `src/pages/help/HelpCenter.tsx` (import line ~5; `CATEGORIES` array ~22-30)

- [ ] **Step 1: Extend the lucide import**

In `src/pages/help/HelpCenter.tsx`, add `Award` to the existing `lucide-react` import:

```ts
import { Search, BookOpen, Megaphone, Zap, CreditCard, Shield, Sparkles, MessageCircle, ChevronDown, ArrowLeft, Award } from "lucide-react";
```

- [ ] **Step 2: Add the `rewards` category entry**

Append to the `CATEGORIES` array (after `account`):

```ts
  { key: "account", label: "Account & Privacy", icon: Shield },
  { key: "rewards", label: "Rewards", icon: Award },
] as const;
```

- [ ] **Step 3: Verify build + typecheck + lint**

Run: `cd "C:/GIT/dragoncandy-v3-d783432b/.claude/worktrees/dc-help-page" && npm run build && npm run typecheck && npm run lint`
Expected: all green. (Icon renders `text-dc-teal` like the others via the existing map — no gray, per DESIGN_SYSTEM.)

- [ ] **Step 4: Commit**

```bash
git add src/pages/help/HelpCenter.tsx
git commit -m "feat(help): add Rewards category to the help center"
```

---

## Task 6: Full test + build gate

- [ ] **Step 1: Run the full pure-test suite**

Run: `cd "C:/GIT/dragoncandy-v3-d783432b/.claude/worktrees/dc-help-page" && npx vitest run`
Expected: "Tests N passed, 0 failed" (ignore the ~pre-existing failed *files* from nested-worktree Playwright e2e specs — trust the passed/failed test counts, per project convention). The new `guidance-helpers.test.ts` is green.

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: succeeds.

---

## Task 7: Deploy + live-verify (careful-gated)

**This task touches prod. Use the `careful` skill before each dangerous step.**

- [ ] **Step 1: Edge-function review**

Dispatch the `edge-function-reviewer` subagent on `donny-orchestrator` (the `guidance.ts` + new `guidance-helpers.ts` change). Fix any PASS-blocking findings and re-run until PASS. Confirm it flags no `verify_jwt` drift (this fn is `verify_jwt=true`).

- [ ] **Step 2: Apply Migration A, then B, to prod (careful gate)**

Invoke `@careful`. Blast radius: adds a generated column + index + CHECK value, then updates 6 rows and inserts 5 rows in `help_articles` (world-readable content table; no destructive op). Apply **A first** (`20260717120000_…`), then **B** (`20260717120001_…`) via the Supabase MCP `apply_migration`.

- [ ] **Step 3: Verify the migration in prod**

Run (MCP `execute_sql`):
```sql
select count(*) filter (where search_vector is not null) as with_vec,
       count(*) as total,
       count(*) filter (where category='rewards') as rewards_rows
from help_articles;
```
Expected: `with_vec = total` (all 32 rows have a vector), `rewards_rows = 1`.

Confirm the refreshes actually matched (a wrong slug would silently no-op):
```sql
select count(*) from help_articles
where slug in ('what-is-donny','donny-help-briefs','donny-campaign-suggestions',
               'donny-match-scores','launch-campaign','apply-campaign')
  and updated_at::date = current_date;   -- expect 6
select count(*) from help_articles where slug='what-is-donny' and body ilike '%Ask Donny%';  -- expect 1
select slug from help_articles where category='rewards';  -- expect dragon-rewards
```

- [ ] **Step 4: Deploy `donny-orchestrator`**

Deploy from the worktree via CLI, preserving `verify_jwt`:
`supabase functions deploy donny-orchestrator --project-ref zocahiffooqdybdhguqv`
(**No** `--no-verify-jwt` — this fn is `verify_jwt=true`.) Boot-check the response.

- [ ] **Step 5: Live-verify Donny's guidance path (all three cases)**

On prod (consumer surface, logged in as a test business — see project memory for credentials):
- (a) Ask Donny "how do I launch a campaign?" and "how do crews work?" → confirm it now returns real article content + a `Read: …` suggested action.
- (b) Ask a nonsense query ("qzxywv nothing") → confirm the safe `/help` fallback action, no error.
- (c) Confirm the role fallback is sane for a creator vs a business session.

- [ ] **Step 6: Merge the frontend PR (after migration is live)**

Open the PR (Codex second review via `@codex-review` first — see Task 8's finish), merge → Vercel deploys. The `rewards` category + new articles then render on `/help`.

- [ ] **Step 7: verify-prod on `/help`**

Use `@verify-prod` (or manually): confirm `/help` renders the new **Rewards** category and the 5 new articles on desktop + mobile, and each new article page opens. Capture console errors (expect none).

---

## Task 8: Finish — knowledge + reviews

- [ ] **Step 1: Wiki concept page (schema contract guardrail)**

Create `docs/wiki/concepts/help-center-and-guidance.md` documenting: the `help_articles` schema (`body`, `search_terms`, generated `search_vector`), that `HelpCenter`/`HelpArticlePage` render `body` (DOMPurify), that Donny's `guidance_agent` (`donny-orchestrator`) must query the **real** columns (`body` + `search_vector`), the `rewards` category lives in two places (DB CHECK + `CATEGORIES` array), and the "DC Points vs Reputation/Rep" naming discrepancy to resolve. Add it to `docs/wiki/index.md` + `log.md`. Then run the `knowledge-sync` skill.

- [ ] **Step 2: Codex second review**

Run `@codex-review` (`codex review --base main --title "Help Center refresh + Donny guidance fix"`) from the worktree. Fix any real findings; re-run until clean. Relay the verdict.

- [ ] **Step 3: Flag open items to the founder (PR description)**

Note in the PR description:
- **Naming:** `DragonPointsCard.tsx` shows **"DC Points"** while PROJECT_CONTEXT documents a rename to **"Reputation (Rep)"**. The help copy matches the live UI; if "Rep" is intended, that's a separate product change.
- **Stale screenshots (deferred, per spec §2 non-goal):** the existing `signup-restaurant` article still embeds the pre-redesign landing screenshot (`help-screenshots/help-landing-page.png`); a few refreshed articles keep dashboard/marketplace screenshots that should be spot-checked. Flag these for a later text-first→screenshot recapture pass; this plan did not rewrite the `signup-*` bodies (their steps are still accurate).

---

## Done criteria

- Donny's `guidance_agent` returns real help articles on prod (live-verified, all three cases).
- `/help` shows refreshed Donny/campaign articles + a Rewards category with 5 new articles, desktop + mobile.
- All migrations applied to prod (32 rows, all with `search_vector`; `rewards` category valid).
- `donny-orchestrator` redeployed with `verify_jwt=true` preserved.
- Full pure-test suite green; build/typecheck/lint green.
- edge-function-reviewer PASS + Codex second review clean.
- Wiki updated + Donny RAG synced; naming discrepancy flagged.
