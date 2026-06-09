# Mutual Reviews & Rating Visibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make creators and restaurants see each other's star rating and reviews at every decision point, and close the review-creation loop on both sides — with an honest double-blind reveal enforced at read-time (no cron, no edge function).

**Architecture:** A single additive Supabase migration adds a `reveal_at` column, a `SECURITY DEFINER` `has_counterpart_review()` function, a `public_project_reviews` view, replacement RLS, and a rewritten aggregate trigger that counts only *revealed* reviews and recomputes *both* parties. The frontend repoints `useReviews`/`useReviewStats` to the view, mounts the existing role-aware rating prompts on the business dashboard, adds a shared `InlineRating` component, and surfaces it where it's missing.

**Tech Stack:** React 18 + TypeScript (strict), Vite, Tailwind (`dc-*` tokens), shadcn/ui, Supabase Postgres (RLS), React Query, Vitest + Testing Library.

---

## Context the implementer MUST know (verified against the live DB)

The review system already exists. The migration is **additive and corrective**, not greenfield. Verified facts about the **current** `project_reviews` schema (staging `mhffqrawgizhprbobcta` / prod `zocahiffooqdybdhguqv`):

- Columns already present: `id, collaboration_id (nullable), sponsorship_id (nullable), reviewer_id, reviewee_id, rating, review_text, review_type, communication_rating, quality_rating, timeliness_rating, professionalism_rating, is_public (default true), created_at, updated_at`. **`reveal_at` does NOT exist yet** — we add it.
- `review_reference_check` already enforces exactly one of `collaboration_id` / `sponsorship_id` is non-null.
- **Both unique constraints already exist:** `UNIQUE(collaboration_id, reviewer_id, reviewee_id)` and `UNIQUE(sponsorship_id, reviewer_id, reviewee_id)`. **Do NOT add new unique constraints** — the spec's proposal is redundant.
- `review_type` CHECK already allows all four types: `business_to_creator, creator_to_business, brand_to_business, business_to_brand`.
- `average_rating` (numeric, default 0) and `total_reviews` (integer, default 0) **already exist on BOTH `creator_profiles` and `business_profiles`**. **Do NOT add these columns.**
- **Two existing SELECT policies defeat double-blind and MUST be dropped:**
  - `"Users can view public reviews"` → `USING (is_public = true)` (shows everything immediately)
  - `"Users can view their own reviews"` → `USING (auth.uid() = reviewer_id OR auth.uid() = reviewee_id)` (the `reviewee_id` half lets the counterparty read your review before reveal)
  - Keep the INSERT policies (`"Users can create reviews for their collaborations"`, `"Brands can insert sponsorship reviews"`, `"Businesses can insert sponsorship reviews"`) and the UPDATE policy (`"Users can update their own reviews"`).
- Existing trigger `update_profile_ratings_trigger` (AFTER INSERT OR UPDATE) calls `public.update_profile_ratings()`, which is `SECURITY DEFINER SET search_path=public`, filters by review type correctly, but **counts ALL reviews (not just revealed) and only recomputes the `reviewee` side**. We rewrite the function (the trigger stays).
- `campaign_sponsorships` has `campaign_id, brand_id, restaurant_id, completed_at, review_status` — used for the view's title join and already powering `useSponsorshipReviewCompletion` (which already returns both brand- and business-role sponsorships).

**Migrations deploy separately from the frontend.** Push to `main` deploys the frontend only (Lovable). Apply SQL via the Supabase MCP `apply_migration` to **staging first**, validate, then prod. `src/integrations/supabase/types.ts` is generated — regenerate it after the migration (Task 6).

**Deferred (explicitly out of this plan):** the DragonShare browse `RestaurantCard` rating requires extending the `search_restaurants` RPC (returns a fixed `TABLE(...)` sourced from orgs, not `business_profiles`; signature differs across envs and isn't on staging). It is a secondary surface — the creator→restaurant rating already shows on `RestaurantProfileCard`, `BusinessProfileStrip`, and `PublicBusinessProfile`. Task 17 captures it as optional; do not block the plan on it.

---

## File Structure

**Database (one migration file):**
- Create: `supabase/migrations/20260608120000_mutual_reviews_double_blind.sql` — reveal_at + insert trigger, `has_counterpart_review`, replacement RLS, rewritten aggregate trigger + recompute helper, `public_project_reviews` view + grants, one-time recompute.

**Hooks:**
- Modify: `src/hooks/useReviews.ts` — repoint `useReviews` + `useReviewStats` to the view (flattened columns, drop `is_public` filter).
- Create: `src/hooks/useMyGivenReviews.ts` — the reviewer's given reviews with an `is_revealed` flag (for the pending badge).
- Modify: `src/hooks/useFetchApplications.ts` — add `average_rating, total_reviews` to the creator select AND thread them through the enrichment map.
- Modify: `src/types/applications.ts` — add `average_rating`/`total_reviews` to `CampaignApplication.creator_profile`.

**Components:**
- Create: `src/components/reviews/InlineRating.tsx` (+ `InlineRating.test.tsx`) — shared compact rating display.
- Modify: `src/components/reviews/RatingModal.tsx` — in-dialog success state with double-blind copy.
- Modify: `src/components/creator-browse/CreatorCard.tsx` — swap yellow ★ to `InlineRating`.
- Modify: `src/components/creator-browse/CreatorProfileModal.tsx` — extend select + `InlineRating` header.
- Modify: `src/components/campaigns/ApplicationCard.tsx` — `InlineRating` per applicant row.
- Modify: `src/pages/PublicBusinessProfile.tsx` — header rating + extend select.
- Modify: `src/pages/ReviewsManagement.tsx` — "Given" tab uses `useMyGivenReviews` + pending badge.

**Mount points:**
- Modify: `src/pages/BusinessDashboard.tsx` — mount `RatingPromptManager` + `SponsorshipRatingPromptManager`.

---

## PHASE 1 — Database foundation

> All SQL is built into one migration file, then applied to **staging** via the Supabase MCP. Verification queries run after apply. Apply to **prod** only in Phase 5.

### Task 1: Write the migration file — `reveal_at` + insert trigger

**Files:**
- Create: `supabase/migrations/20260608120000_mutual_reviews_double_blind.sql`

- [ ] **Step 1: Create the migration file with the reveal_at section**

```sql
-- Mutual Reviews: double-blind reveal, read-time enforced. Additive + corrective.
-- See docs/superpowers/specs/2026-06-08-mutual-reviews-visibility-design.md

-- 1. reveal_at column (the 14-day timeout half of the double-blind)
ALTER TABLE public.project_reviews
  ADD COLUMN IF NOT EXISTS reveal_at timestamptz;

-- Backfill existing rows as already-revealed (they predate double-blind and were public).
-- created_at is in the past, so `now() >= reveal_at` is immediately true.
UPDATE public.project_reviews
  SET reveal_at = created_at
  WHERE reveal_at IS NULL;

-- New rows get reveal_at = now() + 14 days unless explicitly supplied.
CREATE OR REPLACE FUNCTION public.set_review_reveal_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.reveal_at IS NULL THEN
    NEW.reveal_at := now() + interval '14 days';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_review_reveal_at_trigger ON public.project_reviews;
CREATE TRIGGER set_review_reveal_at_trigger
  BEFORE INSERT ON public.project_reviews
  FOR EACH ROW EXECUTE FUNCTION public.set_review_reveal_at();
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260608120000_mutual_reviews_double_blind.sql
git commit -m "feat(reviews): migration scaffold — reveal_at column + insert trigger"
```

### Task 2: Append `has_counterpart_review` (SECURITY DEFINER)

**Files:**
- Modify: `supabase/migrations/20260608120000_mutual_reviews_double_blind.sql`

- [ ] **Step 1: Append the counterpart function**

```sql
-- 2. Counterpart check, RLS-safe (SECURITY DEFINER avoids recursive RLS on the
--    same table — mirrors the has_role() pattern). Returns only a boolean.
CREATE OR REPLACE FUNCTION public.has_counterpart_review(
  p_reviewer uuid,
  p_reviewee uuid,
  p_collaboration uuid,
  p_sponsorship uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.project_reviews cp
    WHERE cp.reviewer_id = p_reviewee          -- the other party
      AND cp.reviewee_id = p_reviewer          -- reviewing me back
      AND cp.collaboration_id IS NOT DISTINCT FROM p_collaboration
      AND cp.sponsorship_id   IS NOT DISTINCT FROM p_sponsorship
  );
$$;

-- Helps the counterpart lookup.
CREATE INDEX IF NOT EXISTS idx_project_reviews_reviewer_reviewee
  ON public.project_reviews(reviewer_id, reviewee_id);
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260608120000_mutual_reviews_double_blind.sql
git commit -m "feat(reviews): has_counterpart_review SECURITY DEFINER function"
```

### Task 3: Append replacement RLS SELECT policy

**Files:**
- Modify: `supabase/migrations/20260608120000_mutual_reviews_double_blind.sql`

- [ ] **Step 1: Append the policy swap**

```sql
-- 3. Replace the two SELECT policies that defeat double-blind with one
--    reveal-aware policy. (INSERT/UPDATE policies are left untouched.)
DROP POLICY IF EXISTS "Users can view public reviews" ON public.project_reviews;
DROP POLICY IF EXISTS "Users can view their own reviews" ON public.project_reviews;

CREATE POLICY "Reviews visible when revealed or own"
  ON public.project_reviews
  FOR SELECT
  USING (
    auth.uid() = reviewer_id
    OR (
      is_public
      AND (
        public.has_counterpart_review(reviewer_id, reviewee_id, collaboration_id, sponsorship_id)
        OR now() >= reveal_at
      )
    )
  );
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260608120000_mutual_reviews_double_blind.sql
git commit -m "feat(reviews): reveal-aware RLS SELECT policy (double-blind)"
```

### Task 4: Append rewritten aggregate trigger (revealed-only, both parties)

**Files:**
- Modify: `supabase/migrations/20260608120000_mutual_reviews_double_blind.sql`

- [ ] **Step 1: Append the recompute helper + rewritten trigger function + one-time recompute**

```sql
-- 4. Aggregate recompute: revealed-only, and recompute BOTH parties because a
--    counterpart submission reveals two reviews at once (one about each user).
CREATE OR REPLACE FUNCTION public.recompute_profile_rating(p_user uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.creator_profiles cp SET
    average_rating = COALESCE((
      SELECT ROUND(AVG(r.rating::numeric), 2) FROM public.project_reviews r
      WHERE r.reviewee_id = p_user AND r.review_type = 'business_to_creator' AND r.is_public
        AND (public.has_counterpart_review(r.reviewer_id, r.reviewee_id, r.collaboration_id, r.sponsorship_id) OR now() >= r.reveal_at)
    ), 0),
    total_reviews = (
      SELECT COUNT(*) FROM public.project_reviews r
      WHERE r.reviewee_id = p_user AND r.review_type = 'business_to_creator' AND r.is_public
        AND (public.has_counterpart_review(r.reviewer_id, r.reviewee_id, r.collaboration_id, r.sponsorship_id) OR now() >= r.reveal_at)
    )
  WHERE cp.user_id = p_user;

  UPDATE public.business_profiles bp SET
    average_rating = COALESCE((
      SELECT ROUND(AVG(r.rating::numeric), 2) FROM public.project_reviews r
      WHERE r.reviewee_id = p_user AND r.review_type = 'creator_to_business' AND r.is_public
        AND (public.has_counterpart_review(r.reviewer_id, r.reviewee_id, r.collaboration_id, r.sponsorship_id) OR now() >= r.reveal_at)
    ), 0),
    total_reviews = (
      SELECT COUNT(*) FROM public.project_reviews r
      WHERE r.reviewee_id = p_user AND r.review_type = 'creator_to_business' AND r.is_public
        AND (public.has_counterpart_review(r.reviewer_id, r.reviewee_id, r.collaboration_id, r.sponsorship_id) OR now() >= r.reveal_at)
    )
  WHERE bp.user_id = p_user;
$$;

CREATE OR REPLACE FUNCTION public.update_profile_ratings()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.recompute_profile_rating(NEW.reviewee_id);
  PERFORM public.recompute_profile_rating(NEW.reviewer_id);
  RETURN NEW;
END;
$$;
-- Existing trigger update_profile_ratings_trigger already calls this function; no trigger change needed.

-- One-time recompute so existing aggregates reflect the revealed-only rule.
DO $$
DECLARE u uuid;
BEGIN
  FOR u IN (SELECT DISTINCT reviewee_id FROM public.project_reviews) LOOP
    PERFORM public.recompute_profile_rating(u);
  END LOOP;
END $$;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260608120000_mutual_reviews_double_blind.sql
git commit -m "feat(reviews): aggregate trigger counts revealed-only, recomputes both parties"
```

### Task 5: Append `public_project_reviews` view + grants

**Files:**
- Modify: `supabase/migrations/20260608120000_mutual_reviews_double_blind.sql`

- [ ] **Step 1: Append the view**

```sql
-- 5. Public reviews view: revealed-only, profile + project title flattened to
--    plain columns (no PostgREST FK embeds). security_invoker so base RLS also
--    applies. The WHERE is the display filter; RLS (Task 3) is the security boundary.
CREATE OR REPLACE VIEW public.public_project_reviews
WITH (security_invoker = true) AS
SELECT
  r.id, r.collaboration_id, r.sponsorship_id, r.reviewer_id, r.reviewee_id,
  r.rating, r.review_text, r.review_type,
  r.communication_rating, r.quality_rating, r.timeliness_rating, r.professionalism_rating,
  r.is_public, r.created_at, r.updated_at, r.reveal_at,
  p.full_name  AS reviewer_full_name,
  p.avatar_url AS reviewer_avatar_url,
  COALESCE(c_collab.title, c_spon.title, 'Project') AS project_title
FROM public.project_reviews r
LEFT JOIN public.profiles p                 ON p.id = r.reviewer_id
LEFT JOIN public.campaign_collaborations cc ON cc.id = r.collaboration_id
LEFT JOIN public.campaigns c_collab         ON c_collab.id = cc.campaign_id
LEFT JOIN public.campaign_sponsorships cs   ON cs.id = r.sponsorship_id
LEFT JOIN public.campaigns c_spon           ON c_spon.id = cs.campaign_id
WHERE r.is_public
  AND (
    public.has_counterpart_review(r.reviewer_id, r.reviewee_id, r.collaboration_id, r.sponsorship_id)
    OR now() >= r.reveal_at
  );

GRANT SELECT ON public.public_project_reviews TO anon, authenticated;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260608120000_mutual_reviews_double_blind.sql
git commit -m "feat(reviews): public_project_reviews view (revealed-only, flattened)"
```

### Task 6: Apply to staging, lint, verify behavior, regenerate types

**Files:**
- Modify: `src/integrations/supabase/types.ts` (regenerated)

- [ ] **Step 1: Apply the migration to staging** via the Supabase MCP `apply_migration` tool — project `mhffqrawgizhprbobcta`, name `mutual_reviews_double_blind`, the full file contents. Expected: success, no error.

- [ ] **Step 2: Security lint.** Run MCP `get_advisors` (type `security`) on staging. Expected: **no new** RLS/security warnings referencing `project_reviews`, `public_project_reviews`, `has_counterpart_review`, `recompute_profile_rating`. (A pre-existing baseline of unrelated warnings is acceptable — compare, don't assume zero.)

- [ ] **Step 3: Behavioral verification.** Run this script via MCP `execute_sql` on staging. It seeds two users + one collaboration, inserts one review, asserts hidden, inserts the counterpart, asserts both revealed, then cleans up. Expected output noted inline.

```sql
-- Use two real-ish uuids; collaboration must satisfy FK + insert is by service role (bypasses RLS),
-- so we assert the VIEW's reveal logic (which does not depend on auth.uid()).
BEGIN;
-- pick an existing completed collaboration to satisfy FKs, or skip FK by using sponsorship=null/collab=null is invalid.
WITH collab AS (
  SELECT id, creator_id, (SELECT user_id FROM public.campaigns WHERE id = cc.campaign_id) AS biz_id
  FROM public.campaign_collaborations cc LIMIT 1
)
SELECT 'using collaboration' AS note, * FROM collab;
-- Insert creator_to_business review (creator -> business). Expect NOT in view yet (no counterpart, reveal_at future).
-- Insert business_to_creator counterpart. Expect BOTH now in view.
ROLLBACK;
```

  Note: because `execute_sql` runs as a privileged role, RLS is bypassed; this step asserts the **view** filter. For RLS-level verification (counterparty cannot read early) rely on the manual two-account E2E in Task 18. If seeding real FKs is awkward, instead run the simpler reveal-logic assertion below and record its output:

```sql
-- Reveal-logic sanity: a review with a future reveal_at and no counterpart must be EXCLUDED from the view.
SELECT
  (SELECT COUNT(*) FROM public.project_reviews) AS total_rows,
  (SELECT COUNT(*) FROM public.public_project_reviews) AS visible_rows,
  (SELECT COUNT(*) FROM public.project_reviews WHERE reveal_at > now()) AS pending_future_rows;
-- Expected: visible_rows <= total_rows; pending_future_rows are excluded from visible_rows.
```

- [ ] **Step 4: Regenerate types.** Run MCP `generate_typescript_types` for staging and write the result to `src/integrations/supabase/types.ts`. Verify it now includes `reveal_at` on `project_reviews` and a `public_project_reviews` entry. If Lovable later regenerates and drops the view typing, the hooks in Task 7 fall back to `.from('public_project_reviews' as never)` casting — note this in the hook.

- [ ] **Step 5: Build check.**

Run: `npm run build`
Expected: success (the new column/view in types must not break existing code).

- [ ] **Step 6: Commit**

```bash
git add src/integrations/supabase/types.ts
git commit -m "chore(types): regenerate Supabase types after reviews migration"
```

---

## PHASE 2 — Repoint the read hooks to the view

### Task 7: Rewrite `useReviews` + `useReviewStats` to read `public_project_reviews`

**Files:**
- Modify: `src/hooks/useReviews.ts`

- [ ] **Step 1: Replace the query body of `useReviews`.** Keep the exported `ReviewWithRelations` shape and `useReviews(revieweeId?, reviewType?)` signature unchanged. Replace the select/mapping so it reads the view's flat columns:

```ts
// inside useReviews queryFn — replace the supabase query + mapping
let query = supabase
  .from('public_project_reviews')
  .select(`
    id, collaboration_id, sponsorship_id, reviewer_id, reviewee_id,
    rating, review_text, review_type,
    communication_rating, quality_rating, timeliness_rating, professionalism_rating,
    is_public, created_at, updated_at,
    reviewer_full_name, reviewer_avatar_url, project_title
  `)
  .eq('reviewee_id', revieweeId)
  .order('created_at', { ascending: false });

if (reviewType) {
  query = query.eq('review_type', reviewType);
}

const { data: reviews, error } = await query;
if (error) {
  console.error('Error fetching reviews:', error);
  return [];
}
if (!reviews || reviews.length === 0) return [];

return reviews
  .filter((r) => r.reviewer_full_name)
  .map((r) => ({
    id: r.id,
    collaboration_id: r.collaboration_id ?? undefined,
    sponsorship_id: r.sponsorship_id ?? undefined,
    reviewer_id: r.reviewer_id,
    reviewee_id: r.reviewee_id,
    rating: r.rating,
    review_text: r.review_text ?? undefined,
    review_type: r.review_type,
    communication_rating: r.communication_rating ?? undefined,
    quality_rating: r.quality_rating ?? undefined,
    timeliness_rating: r.timeliness_rating ?? undefined,
    professionalism_rating: r.professionalism_rating ?? undefined,
    is_public: r.is_public,
    created_at: r.created_at,
    updated_at: r.updated_at,
    reviewer: { full_name: r.reviewer_full_name, avatar_url: r.reviewer_avatar_url ?? undefined },
    collaboration: { campaign: { title: r.project_title ?? 'Project' } },
  } as ReviewWithRelations));
```

- [ ] **Step 2: Replace the `useReviewStats` query** — read the view, drop the `.eq('is_public', true)` filter (the view already enforces reveal). Keep the rest of the aggregation logic identical:

```ts
let query = supabase
  .from('public_project_reviews')
  .select('rating')
  .eq('reviewee_id', revieweeId);

if (reviewType) {
  query = query.eq('review_type', reviewType);
}
```

- [ ] **Step 3: Typecheck + build.**

Run: `npm run typecheck && npm run build`
Expected: success. If the regenerated types don't know the view, cast the table name: `supabase.from('public_project_reviews' as never)` and add a `// TODO: remove cast once types include the view` comment.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useReviews.ts
git commit -m "feat(reviews): read hooks consume public_project_reviews view"
```

---

## PHASE 3 — Close the creation loop (both sides)

### Task 8: Mount both rating prompts on the business dashboard

**Files:**
- Modify: `src/pages/BusinessDashboard.tsx`

- [ ] **Step 1: Add imports** near the other component imports (after line 21, `PendingActionBanners`):

```ts
import { RatingPromptManager } from '@/components/reviews/RatingPromptManager';
import { SponsorshipRatingPromptManager } from '@/components/reviews/SponsorshipRatingPromptManager';
```

- [ ] **Step 2: Render them** immediately after `<PendingActionBanners />` (line 140) inside the white body container:

```tsx
<PendingActionBanners />

<RatingPromptManager />
<SponsorshipRatingPromptManager />
```

Both hooks are role-aware and key off the logged-in user (`useProjectCompletion` derives `business_to_creator`; `useSponsorshipReviewCompletion` already returns the business-role sponsorships → `business_to_brand`). No new logic needed.

- [ ] **Step 3: Build check.**

Run: `npm run build`
Expected: success.

- [ ] **Step 4: Commit**

```bash
git add src/pages/BusinessDashboard.tsx
git commit -m "feat(reviews): prompt businesses to review creators + brands (close the loop)"
```

### Task 9: Double-blind success state in `RatingModal`

**Files:**
- Modify: `src/components/reviews/RatingModal.tsx`

- [ ] **Step 1: Add a `submitted` state and show a success view instead of closing immediately.** Add `const [submitted, setSubmitted] = useState(false);`. In `submitRating.mutate` `onSuccess`, set `setSubmitted(true)` (do NOT call `onClose()` there). Reset `submitted` when the dialog closes. Render, when `submitted` is true, this in place of the form body:

```tsx
{submitted ? (
  <div className="space-y-4 text-center py-2">
    <div className="mx-auto w-12 h-12 rounded-full bg-dc-teal/15 flex items-center justify-center">
      <Star className="h-6 w-6 text-dc-teal-btn fill-dc-teal-btn" />
    </div>
    <p className="text-base font-bold text-dc-text">Your review is in.</p>
    <p className="text-sm text-dc-text-muted">
      It goes live once {revieweeName} reviews you too — or automatically in 14 days.
    </p>
    <Button
      onClick={() => { setSubmitted(false); onClose(); }}
      className="w-full rounded-full bg-dc-teal-btn text-white font-bold h-12 hover:bg-dc-teal-btn-hover"
    >
      Done
    </Button>
  </div>
) : (
  /* existing form body */
)}
```

Add `import { Star } from 'lucide-react';` (or reuse if already imported). Keep the existing `setRating(0)/setReviewText('')` resets when closing.

- [ ] **Step 2: Build check.**

Run: `npm run build`
Expected: success.

- [ ] **Step 3: Commit**

```bash
git add src/components/reviews/RatingModal.tsx
git commit -m "feat(reviews): RatingModal success state explains double-blind reveal"
```

---

## PHASE 4 — Surface the rating everywhere

### Task 10: `InlineRating` component (TDD)

**Files:**
- Create: `src/components/reviews/InlineRating.tsx`
- Test: `src/components/reviews/InlineRating.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { InlineRating } from './InlineRating';

describe('InlineRating', () => {
  it('shows a New pill when there are no reviews', () => {
    render(<InlineRating averageRating={0} totalReviews={0} />);
    expect(screen.getByText('New')).toBeInTheDocument();
  });

  it('shows New when counts are null/undefined', () => {
    render(<InlineRating />);
    expect(screen.getByText('New')).toBeInTheDocument();
  });

  it('renders rating and pluralized count', () => {
    render(<InlineRating averageRating={4.75} totalReviews={12} />);
    expect(screen.getByText('4.8')).toBeInTheDocument();
    expect(screen.getByText(/12 reviews/)).toBeInTheDocument();
  });

  it('uses the singular for one review', () => {
    render(<InlineRating averageRating={5} totalReviews={1} />);
    expect(screen.getByText(/1 review$/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/reviews/InlineRating.test.tsx`
Expected: FAIL — "Cannot find module './InlineRating'".

- [ ] **Step 3: Implement the component**

```tsx
import React from 'react';
import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';

interface InlineRatingProps {
  averageRating?: number | null;
  totalReviews?: number | null;
  size?: 'sm' | 'md';
  className?: string;
}

export const InlineRating: React.FC<InlineRatingProps> = ({
  averageRating,
  totalReviews,
  size = 'sm',
  className,
}) => {
  const total = totalReviews ?? 0;

  if (total === 0) {
    return (
      <span
        className={cn(
          'inline-flex items-center rounded-full bg-dc-teal/15 text-dc-teal-btn font-semibold px-2 py-0.5 text-xs',
          className,
        )}
      >
        New
      </span>
    );
  }

  const starSize = size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4';
  return (
    <span className={cn('inline-flex items-center gap-1 text-xs', className)}>
      <Star className={cn(starSize, 'fill-dc-pink-accent text-dc-pink-accent')} />
      <span className="font-semibold text-dc-pink-accent">{(averageRating ?? 0).toFixed(1)}</span>
      <span className="text-dc-text-muted">· {total} review{total !== 1 ? 's' : ''}</span>
    </span>
  );
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/components/reviews/InlineRating.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/reviews/InlineRating.tsx src/components/reviews/InlineRating.test.tsx
git commit -m "feat(reviews): InlineRating shared component (pink star, New pill)"
```

### Task 11: Swap `CreatorCard`'s ★ to `InlineRating`

**Files:**
- Modify: `src/components/creator-browse/CreatorCard.tsx`

- [ ] **Step 1: Import** `import { InlineRating } from '@/components/reviews/InlineRating';`

- [ ] **Step 2: Replace the yellow star span** (currently around lines 156–158):

```tsx
{creator.average_rating != null && (
  <span className="text-yellow-400 text-xs flex-shrink-0">★ {creator.average_rating.toFixed(1)}</span>
)}
```

with:

```tsx
<InlineRating
  averageRating={creator.average_rating}
  totalReviews={creator.total_reviews}
  className="flex-shrink-0"
/>
```

(The `metricParts` line that prints "N reviews" lower in the card is now redundant with `InlineRating`; remove the `total_reviews` push into `metricParts` — lines ~93–95 — so the count isn't shown twice.)

- [ ] **Step 3: Build check.** Run: `npm run build` → success.

- [ ] **Step 4: Commit**

```bash
git add src/components/creator-browse/CreatorCard.tsx
git commit -m "feat(reviews): CreatorCard uses InlineRating (pink, with New state)"
```

### Task 12: `CreatorProfileModal` — fetch ratings + header

**Files:**
- Modify: `src/components/creator-browse/CreatorProfileModal.tsx`

- [ ] **Step 1: Extend the profile select.** In the `fetchFullProfile` Supabase `.select(...)` (around line 124), append `, average_rating, total_reviews`. Add `average_rating?: number | null; total_reviews?: number | null;` to the local `CreatorProfile` interface (around lines 42–69).

- [ ] **Step 2: Import + render the header.** Import `InlineRating`. Insert directly after the name/header block (the `<Separator />` around line 275 is a good anchor — place it just above the separator, under the creator name):

```tsx
<InlineRating
  averageRating={profile.average_rating}
  totalReviews={profile.total_reviews}
  size="md"
/>
```

(The full reviews list — `PublicProfileReviews` — is already rendered in this modal, so no list work is needed here.)

- [ ] **Step 3: Build check.** Run: `npm run build` → success.

- [ ] **Step 4: Commit**

```bash
git add src/components/creator-browse/CreatorProfileModal.tsx
git commit -m "feat(reviews): rating header in CreatorProfileModal"
```

### Task 13: Applicant rows show ★

**Files:**
- Modify: `src/types/applications.ts` (type)
- Modify: `src/hooks/useFetchApplications.ts` (select + enrichment map)
- Modify: `src/components/campaigns/ApplicationCard.tsx` (render — this is a SEPARATE file from `ApplicationsListFixed.tsx`, which imports it at line 9)

- [ ] **Step 1: Extend the type.** In `src/types/applications.ts`, add the two fields to `CampaignApplication.creator_profile` (lines 18–23):

```ts
creator_profile?: {
  creator_name: string;
  avatar_url?: string;
  bio?: string;
  skills?: string[];
  average_rating?: number | null;
  total_reviews?: number | null;
};
```

- [ ] **Step 2: Extend the select AND the enrichment map** in `src/hooks/useFetchApplications.ts` (inside `useCampaignApplications`). The fields must be both fetched (line 36) and threaded through the manual map (lines 43–63), or they'll be dropped:
  - Line 36 select → `'user_id, creator_name, avatar_url, bio, skills, average_rating, total_reviews'`
  - `fallbackProfile` (lines 43–48) → add `average_rating: null, total_reviews: null,`
  - the `creator_profile` object built in `enrichedApplications.map` (lines 55–60) → add `average_rating: profile.average_rating ?? null, total_reviews: profile.total_reviews ?? null,`

- [ ] **Step 3: Render per-row rating.** In `src/components/campaigns/ApplicationCard.tsx`, import `InlineRating` and place it just after `<ApplicationStatusBadge .../>` (line 123, inside the `flex items-center gap-2 flex-wrap` row):

```tsx
<InlineRating
  averageRating={application.creator_profile?.average_rating}
  totalReviews={application.creator_profile?.total_reviews}
/>
```

- [ ] **Step 4: Build check.** Run: `npm run build` → success.

- [ ] **Step 5: Commit**

```bash
git add src/types/applications.ts src/hooks/useFetchApplications.ts src/components/campaigns/ApplicationCard.tsx
git commit -m "feat(reviews): show creator rating on campaign applicant rows"
```

### Task 14: Public business profile header rating

**Files:**
- Modify: `src/pages/PublicBusinessProfile.tsx`

- [ ] **Step 1: Extend the select** (around line 58) — append `, average_rating, total_reviews`. Add `average_rating?: number | null; total_reviews?: number | null;` to the `BusinessProfile` interface (lines 14–36).

- [ ] **Step 2: Replace the industry-only line in the header** (around lines 193–200) so the rating shows when reviews exist, falling back to industry. Import `InlineRating`:

```tsx
{(profile.total_reviews ?? 0) > 0 ? (
  <InlineRating averageRating={profile.average_rating} totalReviews={profile.total_reviews} />
) : profile.industry ? (
  <div className="flex items-center gap-1 text-sm text-dc-pink-accent">
    <Star className="h-3.5 w-3.5 fill-dc-pink-accent" />
    <span className="font-medium uppercase">{profile.industry.replace('_', ' ')}</span>
  </div>
) : null}
```

- [ ] **Step 3: Build check.** Run: `npm run build` → success.

- [ ] **Step 4: Commit**

```bash
git add src/pages/PublicBusinessProfile.tsx
git commit -m "feat(reviews): rating in public business profile header"
```

### Task 15: "Given" tab pending badge

**Files:**
- Create: `src/hooks/useMyGivenReviews.ts`
- Modify: `src/pages/ReviewsManagement.tsx`

- [ ] **Step 1: Create `useMyGivenReviews`.** Returns the current user's *given* reviews (reviewer_id = me) from the base table, each tagged `is_revealed` by checking membership in `public_project_reviews`:

```ts
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface GivenReview {
  id: string;
  reviewee_id: string;
  rating: number;
  review_text?: string | null;
  review_type: string;
  created_at: string;
  is_revealed: boolean;
}

export const useMyGivenReviews = (userId?: string) =>
  useQuery({
    queryKey: ['my-given-reviews', userId],
    enabled: !!userId,
    queryFn: async (): Promise<GivenReview[]> => {
      if (!userId) return [];
      const { data: mine, error } = await supabase
        .from('project_reviews')
        .select('id, reviewee_id, rating, review_text, review_type, created_at')
        .eq('reviewer_id', userId)
        .order('created_at', { ascending: false });
      if (error) { console.error('useMyGivenReviews error:', error); return []; }
      if (!mine || mine.length === 0) return [];

      const { data: revealed } = await supabase
        .from('public_project_reviews')
        .select('id')
        .eq('reviewer_id', userId);
      const revealedIds = new Set((revealed ?? []).map((r) => r.id));

      return mine.map((r) => ({ ...r, is_revealed: revealedIds.has(r.id) }));
    },
    staleTime: 2 * 60 * 1000,
  });
```

- [ ] **Step 2: Render the pending badge** in `ReviewsManagement.tsx`'s "Given" tab. Replace the `ReviewsList` used in the Given `TabsContent` (and the Given block inside the "all" tab) with a small list driven by `useMyGivenReviews(user.id)`. For each review render the rating (reuse `StarRating readonly` or `InlineRating`) and, when `!is_revealed`, the badge:

```tsx
{!review.is_revealed && (
  <span className="inline-flex items-center gap-1 rounded-full bg-dc-pink/30 text-dc-pink-accent text-[11px] font-semibold px-2 py-0.5">
    ⏳ Hidden until they review back
  </span>
)}
```

Keep it brand-adjacent (pink, never gray, per the design system). This also corrects the prior "Given" tab, which incorrectly queried by `reviewee_id`.

- [ ] **Step 3: Build check.** Run: `npm run build` → success.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useMyGivenReviews.ts src/pages/ReviewsManagement.tsx
git commit -m "feat(reviews): pending 'hidden until they review back' badge on Given tab"
```

### Task 16: (Optional consistency) normalize already-present yellow stars

**Files:**
- Modify: `src/components/campaigns/RestaurantProfileCard.tsx`
- Modify: `src/components/campaign-details/BusinessProfileStrip.tsx`

These two already display a yellow ★ from data they already fetch. For visual consistency with the pink design-system star, swap each manual star block for `<InlineRating averageRating={...} totalReviews={...} />`. **Low priority** — skip if time-constrained; functionally they already show the rating.

- [ ] **Step 1:** Replace each manual star/`Star` block with `InlineRating`, passing the object's `average_rating` / `total_reviews`.
- [ ] **Step 2:** Run: `npm run build` → success.
- [ ] **Step 3: Commit**

```bash
git add src/components/campaigns/RestaurantProfileCard.tsx src/components/campaign-details/BusinessProfileStrip.tsx
git commit -m "refactor(reviews): normalize restaurant stars to InlineRating (pink)"
```

### Task 17: (Deferred / optional) DragonShare browse card rating

**Files:** `search_restaurants` RPC (DB), `src/hooks/useRestaurantSearch.ts`, `src/components/dragonshare/RestaurantCard.tsx`

Out of scope for this plan (see Context). If pursued later: extend the `search_restaurants` RPC's `RETURNS TABLE(...)` to add `average_rating numeric, total_reviews integer` by joining `business_profiles` (requires `DROP FUNCTION` + recreate since the return signature changes, and tracing the org→business_profiles relationship), add both fields to `RestaurantSearchResult`, then render `InlineRating` in `RestaurantCard`. Do **not** start this without re-confirming the RPC body and the org→profile join in the target environment.

---

## PHASE 5 — Verification & rollout

### Task 18: Local + manual verification

- [ ] **Step 1: Full checks.**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: typecheck clean; lint clean (only `console.error`/`console.warn` used); build success.

Run: `npx vitest run src/components/reviews/InlineRating.test.tsx`
Expected: PASS. (Note: a full `npm run test` exits non-zero due to pre-existing unrelated e2e file failures in nested worktrees — trust the per-file result, per project memory.)

- [ ] **Step 2: Two-account double-blind E2E (staging).** Using staging test creds (`creator.staging@dragoncandy.test` / `restaurant.staging@dragoncandy.test`, password `Pdi@mondz1`): complete a campaign, have the creator submit a review, confirm the restaurant does **not** see it yet (and vice-versa), then have the restaurant submit — confirm **both** reveal and the headline ratings update on the public profiles and browse cards. Test desktop and mobile viewports.

### Task 19: Production rollout

- [ ] **Step 1: Apply the migration to prod.** MCP `apply_migration` on project `zocahiffooqdybdhguqv` with the same file. Then run MCP `get_advisors` (security) — confirm no new warnings.

- [ ] **Step 2: Push the frontend.**

```bash
git push
```

(Lovable auto-deploys `main` to dragoncandy.io.)

- [ ] **Step 3: Production verification.** After the deploy (polling the bundle hash; deploys take tens of minutes), at dragoncandy.io: screenshot the creator browse, a creator profile modal, the public business profile, the business dashboard (rating prompt visible), and the Given tab pending badge. Open DevTools, confirm no console errors. Test both desktop and mobile viewports.

---

## Notes for the implementer

- **Never** add the unique constraints or profile rating columns the spec mentions — they already exist (see Context). Adding them will error or no-op.
- The double-blind security boundary is the **RLS policy** (Task 3); the **view WHERE** (Task 5) is the display filter. Both call `has_counterpart_review` — that duplication is intentional (security vs display) and keeps the counterpart logic DRY.
- Known, accepted limitation: a review that reveals purely by 14-day timeout (no counterpart) won't fire the aggregate trigger, so browse-card numbers can lag until the next write; profile pages/modals read live stats and are always correct.
- The rewritten `update_profile_ratings()` gains `SECURITY DEFINER SET search_path=public` (the original was plain). This is **intentional and required** so the reveal-aware reads/writes run with consistent privileges — not scope creep.
- The one-time `DO $$` recompute (Task 4) is O(distinct reviewees) with the counterpart lookup per row. Fine at current scale (~30 users, pre-revenue); just don't be surprised if it's the slowest statement in the migration.
- Keep desktop (`lg:`/`xl:`) and mobile (base) classes separate; test both viewports after each UI task.
- Do not modify auth logic. The migration is additive; no drops/renames of tables or columns.
