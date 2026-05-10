# UGC & DragonShare Social Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire auto-scheduling and one-tap social posting into UGC Promotion approvals and DragonShare boosts, with a new Drafts tab surfacing all pending posts.

**Architecture:** Two new Supabase Edge Functions (`fire-promotion-social-hook`, `fire-dragonshare-social-hook`) mirror the existing `fire-campaign-social-hook` Stage 4 auto-draft pattern. Each resolves parties, checks Outstand accounts, generates AI captions via `social-caption`, creates drafts in `donny_scheduled_posts`, and drops nudges into `donny_nudges`. A new `DraftsTab` in OutstandManager surfaces drafts with one-tap publish. One migration extends `social_post_log.post_type`.

**Tech Stack:** Supabase Edge Functions (Deno), React/TypeScript, TanStack Query, Tailwind CSS, Supabase JS client v2, Outstand proxy

**Spec:** `docs/superpowers/specs/2026-05-10-ugc-dragonshare-social-integration-design.md`

---

## File Structure

### New files
| File | Responsibility |
|------|---------------|
| `supabase/migrations/20260510200000_extend_social_post_log_post_type.sql` | Extend CHECK constraint to accept `ugc_promotion` and `dragonshare` |
| `supabase/functions/fire-promotion-social-hook/index.ts` | UGC approval → business social draft + nudge |
| `supabase/functions/fire-dragonshare-social-hook/index.ts` | DragonShare boost → triple-post drafts + nudges |
| `src/components/outstand/DraftsTab.tsx` | Drafts tab showing `donny_scheduled_posts` drafts with Post Now / Edit |
| `src/hooks/useDraftPosts.ts` | React Query hook for fetching draft posts from `donny_scheduled_posts` |

### Modified files
| File | Change |
|------|--------|
| `supabase/functions/social-caption/index.ts` | Add `source`/`context` fields, source-specific prompts, relax validation |
| `src/hooks/usePromotions.ts` | Fire-and-forget call to `fire-promotion-social-hook` on approval |
| `supabase/functions/boost-payment/index.ts` | Fire-and-forget call to `fire-dragonshare-social-hook` after boost |
| `src/pages/OutstandManager.tsx` | Add Drafts tab with count badge |
| `src/contexts/DonnyProvider.tsx` | Map `metadata.source` to `post_type` in `social_post_log` insert |
| `supabase/functions/fire-campaign-social-hook/index.ts` | Fix navigate routes from `/content-calendar` to `/social` |

---

### Task 1: Extend social_post_log CHECK Constraint

**Files:**
- Create: `supabase/migrations/20260510200000_extend_social_post_log_post_type.sql`

**Context:** The existing `social_post_log` table (in `supabase/migrations/20260509100001_social_post_log.sql`) has `CHECK (post_type IN ('amplification', 'cross_post', 'standalone', 'campaign'))`. The new flows need `ugc_promotion` and `dragonshare` values. This must be done first so later tasks can insert these values.

- [ ] **Step 1: Create the migration file**

```sql
-- Extend social_post_log.post_type to support UGC promotion and DragonShare sources
ALTER TABLE social_post_log
  DROP CONSTRAINT IF EXISTS social_post_log_post_type_check;

ALTER TABLE social_post_log
  ADD CONSTRAINT social_post_log_post_type_check
  CHECK (post_type IN ('amplification', 'cross_post', 'standalone', 'campaign', 'ugc_promotion', 'dragonshare'));
```

- [ ] **Step 2: Verify the migration is valid SQL**

Run: `npx supabase db lint`
Expected: No errors for this migration file.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260510200000_extend_social_post_log_post_type.sql
git commit -m "chore: extend social_post_log post_type CHECK for UGC and DragonShare"
```

---

### Task 2: Extend social-caption with Source-Specific Prompts

**Files:**
- Modify: `supabase/functions/social-caption/index.ts`

**Context:** The existing `social-caption` edge function (116 lines) accepts `campaign_title`, `campaign_description`, `content_type`, `party_role`, `platform`, `user_id` and uses `ROLE_PROMPTS` to generate platform-specific captions via Claude Haiku. We need to add optional `source` and `context` fields, add source-specific prompt templates, and relax validation so `campaign_title` isn't required for non-campaign sources.

**Reference:** Read `supabase/functions/social-caption/index.ts` for current structure. Note the imports: `anthropicFetch`, `getModelConfig`, `logCost`, `corsHeaders`.

- [ ] **Step 1: Update the CaptionRequest interface**

In `supabase/functions/social-caption/index.ts`, update the `CaptionRequest` interface (currently at lines 12-19) to add two optional fields:

```typescript
interface CaptionRequest {
  campaign_title: string;
  campaign_description: string;
  content_type: string;
  party_role: "restaurant" | "creator" | "brand";
  platform: string;
  user_id: string;
  source?: "campaign" | "promotion" | "dragonshare";
  context?: Record<string, string>;
}
```

- [ ] **Step 2: Add source-specific prompt maps**

After the existing `ROLE_PROMPTS` object (lines 21-28), add two new prompt maps:

```typescript
const PROMOTION_PROMPT =
  "You are writing a social media caption for a restaurant sharing a customer's video review. Celebrate the customer, mention the promotion, keep it authentic and grateful. Include a call-to-action inviting others to participate.";

const DRAGONSHARE_ROLE_PROMPTS: Record<string, string> = {
  restaurant:
    "You are writing a caption for a restaurant amplifying a creator's content about their business. Thank the creator, highlight the experience, encourage followers to visit.",
  creator:
    "You are writing a caption for a content creator cross-posting their featured content. Reference the restaurant/business, keep it authentic and personal.",
  brand:
    "You are writing a caption for a brand amplifying sponsored content from a creator-restaurant collaboration. Professional co-marketing tone with brand hashtags.",
};
```

- [ ] **Step 3: Update destructuring, validation, and prompt selection**

First, update the destructuring at line 37 to include the new fields:

Change:
```typescript
const { campaign_title, campaign_description, content_type, party_role, platform, user_id } = body;
```
to:
```typescript
const { campaign_title, campaign_description, content_type, party_role, platform, user_id, source, context } = body;
```

Then replace the existing validation block (line 39):

Change:
```typescript
if (!campaign_title || !party_role || !platform || !user_id) {
```
to:
```typescript
if (!party_role || !platform || !user_id) {
```

And update the prompt content construction in the `messages` array to select the right system prompt based on `source`:

```typescript
const title = campaign_title || context?.title || 'Content';
const description = campaign_description || context?.description || '';

let systemPrompt: string;
if (source === 'promotion') {
  const customerName = context?.customer_name || 'a valued customer';
  const promoTitle = context?.promotion_title || title;
  systemPrompt = `${PROMOTION_PROMPT}\n\nCustomer name: ${customerName}\nPromotion: "${promoTitle}"`;
} else if (source === 'dragonshare') {
  systemPrompt = DRAGONSHARE_ROLE_PROMPTS[party_role] ?? DRAGONSHARE_ROLE_PROMPTS.restaurant;
  const creatorName = context?.creator_name || '';
  const businessName = context?.business_name || '';
  if (creatorName) systemPrompt += `\nCreator: ${creatorName}`;
  if (businessName) systemPrompt += `\nBusiness: ${businessName}`;
} else {
  systemPrompt = ROLE_PROMPTS[party_role] ?? ROLE_PROMPTS.restaurant;
}
```

Then update the user message content to use `title` and `description` variables instead of raw `campaign_title`/`campaign_description`.

The full message content becomes:

```typescript
content: `${systemPrompt}

Campaign: "${title}"
Description: ${description || "N/A"}
Content type: ${content_type}
Platform: ${platform}

Write a short, engaging caption (under 200 characters) and suggest 3-5 relevant hashtags.

Respond in JSON: {"caption": "...", "hashtags": ["#tag1", "#tag2"]}`,
```

- [ ] **Step 4: Verify build passes**

Run: `npm run build`
Expected: No errors (edge functions are Deno, so this checks only that no TS imports broke in the React app).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/social-caption/index.ts
git commit -m "feat: add source-specific prompts to social-caption for UGC and DragonShare"
```

---

### Task 3: Create fire-promotion-social-hook Edge Function

**Files:**
- Create: `supabase/functions/fire-promotion-social-hook/index.ts`

**Context:** This edge function is called when a business approves a customer's UGC video submission. It creates one social post draft for the business and one nudge. Pattern mirrors `fire-campaign-social-hook` Stage 4 auto-draft block (lines 118-278 of that file).

**Key references:**
- `supabase/functions/fire-campaign-social-hook/index.ts` — pattern to follow (imports, supabase client setup, cors, try/catch isolation)
- `supabase/functions/_shared/cors.ts` — `corsHeaders(req)` function
- `supabase/migrations/20260325000000_donny_scheduling_and_previews.sql` — `donny_scheduled_posts` schema
- `supabase/migrations/20260411000000_create_donny_nudges.sql` — `donny_nudges` schema, unique index on `(user_id, source_table, source_id)`

- [ ] **Step 1: Create the edge function file**

Create `supabase/functions/fire-promotion-social-hook/index.ts`:

```typescript
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface HookRequest {
  promotion_id: string;
  submission_id: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders(req) });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { promotion_id, submission_id } = (await req.json()) as HookRequest;

    // 1. Fetch promotion
    const { data: promotion } = await supabase
      .from('promotions')
      .select('id, title, description, user_id')
      .eq('id', promotion_id)
      .single();

    if (!promotion) {
      return new Response(JSON.stringify({ error: 'Promotion not found' }), {
        status: 404,
        headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    // 2. Fetch submission
    const { data: submission } = await supabase
      .from('promotion_submissions')
      .select('id, video_url, customer_name, social_handles')
      .eq('id', submission_id)
      .single();

    if (!submission) {
      return new Response(JSON.stringify({ error: 'Submission not found' }), {
        status: 404,
        headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    const businessUserId = promotion.user_id;

    // 3. Check business Outstand account
    const { data: outstandAccounts } = await supabase
      .from('business_outstand_accounts')
      .select('platform, platform_handle')
      .eq('user_id', businessUserId)
      .limit(1);

    if (!outstandAccounts?.length) {
      return new Response(
        JSON.stringify({ ok: true, skipped: true, reason: 'No Outstand account connected' }),
        { headers: { ...corsHeaders(req), 'Content-Type': 'application/json' } },
      );
    }

    const platform = outstandAccounts[0].platform;

    // 4. Collect media URL (video_url is already a full public URL from Supabase storage)
    const mediaUrls: string[] = [];
    if (submission.video_url) {
      mediaUrls.push(submission.video_url);
    }

    // 5. Generate AI caption
    let caption = `Check out this amazing customer video! ${promotion.title}`;
    let hashtags: string[] = [];
    try {
      const captionResp = await fetch(
        `${SUPABASE_URL}/functions/v1/social-caption`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          },
          body: JSON.stringify({
            campaign_title: promotion.title,
            campaign_description: promotion.description || '',
            content_type: 'video',
            party_role: 'restaurant',
            platform,
            user_id: businessUserId,
            source: 'promotion',
            context: {
              customer_name: submission.customer_name,
              promotion_title: promotion.title,
            },
          }),
        },
      );
      if (captionResp.ok) {
        const captionData = await captionResp.json();
        caption = captionData.caption || caption;
        hashtags = captionData.hashtags || [];
      }
    } catch (captionErr) {
      console.warn('[fire-promotion-social-hook] Caption generation failed, using template:', captionErr.message);
    }

    // 6. Get optimal posting time
    let scheduledAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    try {
      const scheduleResp = await fetch(
        `${SUPABASE_URL}/functions/v1/donny-schedule`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          },
          body: JSON.stringify({
            action: 'suggest_times',
            platform,
            content_type: 'video',
          }),
        },
      );
      if (scheduleResp.ok) {
        const scheduleData = await scheduleResp.json();
        if (scheduleData.suggestions?.[0]?.time) {
          scheduledAt = scheduleData.suggestions[0].time;
        }
      }
    } catch (schedErr) {
      console.warn('[fire-promotion-social-hook] Time suggestion failed, using +24h default:', schedErr.message);
    }

    // 7. Insert draft post
    const { data: scheduledPost } = await supabase
      .from('donny_scheduled_posts')
      .insert({
        user_id: businessUserId,
        campaign_id: null,
        platform,
        content_type: 'video',
        caption,
        media_urls: mediaUrls,
        hashtags,
        scheduled_at: scheduledAt,
        status: 'draft',
        ai_suggested_time: true,
        ai_reasoning: 'Auto-drafted by promotion social hook (UGC approval)',
        metadata: { source: 'promotion_social_hook', promotion_id, submission_id },
      })
      .select('id')
      .single();

    // 8. Insert nudge
    await supabase.from('donny_nudges').upsert(
      {
        user_id: businessUserId,
        type: 'content',
        priority: 'high',
        source_table: 'promotion_submissions',
        source_id: submission_id,
        summary: 'Customer video approved — share it on your socials!',
        actions: [
          {
            label: 'Post Now',
            variant: 'primary',
            action: 'post_now',
            payload: {
              scheduled_post_id: scheduledPost?.id ?? null,
            },
          },
          {
            label: 'Review Draft',
            variant: 'secondary',
            action: 'navigate',
            payload: {
              route: '/dashboard/business/social',
            },
          },
        ],
      },
      { onConflict: 'user_id,source_table,source_id', ignoreDuplicates: true },
    );

    return new Response(
      JSON.stringify({ ok: true, draft_id: scheduledPost?.id }),
      { headers: { ...corsHeaders(req), 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    console.error('[fire-promotion-social-hook] Error:', error.message);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' } },
    );
  }
});
```

- [ ] **Step 2: Verify build passes**

Run: `npm run build`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/fire-promotion-social-hook/index.ts
git commit -m "feat: add fire-promotion-social-hook edge function for UGC social drafts"
```

---

### Task 4: Create fire-dragonshare-social-hook Edge Function

**Files:**
- Create: `supabase/functions/fire-dragonshare-social-hook/index.ts`

**Context:** Called after a DragonShare boost completes. Resolves up to three parties (business, creator, brand) and creates a draft + nudge for each. Brand is best-effort via `org_members → campaigns → campaign_sponsorships → business_profiles`.

**Key references:**
- `supabase/functions/fire-campaign-social-hook/index.ts` — per-party try/catch pattern (lines 119-278)
- `supabase/functions/boost-payment/index.ts` — confirms `org_members` table name and fields
- `supabase/migrations/20260427000000_dragonshare.sql` — `dragonshare_posts` and `dragonshare_boosts` schemas

- [ ] **Step 1: Create the edge function file**

Create `supabase/functions/fire-dragonshare-social-hook/index.ts`:

```typescript
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface HookRequest {
  boost_id: string;
  post_id: string;
}

function getNudgeSummary(role: string, creatorName: string, businessName: string): string {
  if (role === 'restaurant') return `You boosted @${creatorName}'s post — amplify it on your channels!`;
  if (role === 'creator') return `Your post got boosted by ${businessName} — cross-post it!`;
  return 'Sponsored content is live — amplify it!';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders(req) });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { boost_id, post_id } = (await req.json()) as HookRequest;

    // 1. Fetch boost
    const { data: boost } = await supabase
      .from('dragonshare_boosts')
      .select('id, boosting_org_id, boosting_user_id')
      .eq('id', boost_id)
      .single();

    if (!boost) {
      return new Response(JSON.stringify({ error: 'Boost not found' }), {
        status: 404,
        headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    // 2. Fetch post
    const { data: post } = await supabase
      .from('dragonshare_posts')
      .select('id, creator_id, target_org_id, post_url, screenshot_url, caption, platform, content_type, hashtags, mentions')
      .eq('id', post_id)
      .single();

    if (!post) {
      return new Response(JSON.stringify({ error: 'Post not found' }), {
        status: 404,
        headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    // 3. Resolve parties
    const parties: { user_id: string; role: string }[] = [];

    // Business: owner of boosting org
    const { data: orgOwner } = await supabase
      .from('org_members')
      .select('user_id')
      .eq('org_id', boost.boosting_org_id)
      .eq('role', 'owner')
      .eq('invitation_status', 'active')
      .limit(1)
      .single();

    if (orgOwner) {
      parties.push({ user_id: orgOwner.user_id, role: 'restaurant' });
    }

    // Creator
    parties.push({ user_id: post.creator_id, role: 'creator' });

    // Brand (best-effort): org owner → campaigns → active sponsorships → brand user
    if (orgOwner) {
      try {
        const { data: orgCampaigns } = await supabase
          .from('campaigns')
          .select('id')
          .eq('user_id', orgOwner.user_id)
          .limit(10);

        if (orgCampaigns?.length) {
          const campaignIds = orgCampaigns.map((c) => c.id);
          const { data: sponsorships } = await supabase
            .from('campaign_sponsorships')
            .select('brand_id')
            .in('campaign_id', campaignIds)
            .in('status', ['active', 'accepted'])
            .limit(1);

          if (sponsorships?.length) {
            const { data: brandProfile } = await supabase
              .from('business_profiles')
              .select('user_id')
              .eq('id', sponsorships[0].brand_id)
              .single();

            if (brandProfile) {
              parties.push({ user_id: brandProfile.user_id, role: 'brand' });
            }
          }
        }
      } catch (brandErr) {
        console.warn('[fire-dragonshare-social-hook] Brand resolution failed (best-effort):', brandErr.message);
      }
    }

    // Fetch business name and creator name for caption context
    const { data: businessProfile } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', orgOwner?.user_id ?? boost.boosting_user_id)
      .single();

    const { data: creatorProfile } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', post.creator_id)
      .single();

    const businessName = businessProfile?.full_name || 'Business';
    const creatorName = creatorProfile?.full_name || 'Creator';

    const ROLE_ROUTES: Record<string, string> = {
      restaurant: '/dashboard/business/social',
      creator: '/dashboard/creator/social',
      brand: '/dashboard/brand/social',
    };

    let draftsCreated = 0;

    // 4. For each party: check Outstand, generate caption, create draft + nudge
    for (const party of parties) {
      try {
        const { data: outstandAccounts } = await supabase
          .from('business_outstand_accounts')
          .select('platform, platform_handle')
          .eq('user_id', party.user_id)
          .limit(1);

        if (!outstandAccounts?.length) continue;

        const platform = outstandAccounts[0].platform;

        // Generate AI caption
        let caption = post.caption || `Amazing content from ${creatorName}!`;
        let hashtags: string[] = post.hashtags || [];
        try {
          const captionResp = await fetch(
            `${SUPABASE_URL}/functions/v1/social-caption`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
              },
              body: JSON.stringify({
                campaign_title: post.caption || 'DragonShare content',
                campaign_description: '',
                content_type: post.content_type || 'photo',
                party_role: party.role,
                platform,
                user_id: party.user_id,
                source: 'dragonshare',
                context: {
                  creator_name: creatorName,
                  business_name: businessName,
                },
              }),
            },
          );
          if (captionResp.ok) {
            const captionData = await captionResp.json();
            caption = captionData.caption || caption;
            hashtags = captionData.hashtags || hashtags;
          }
        } catch (captionErr) {
          console.warn(`[fire-dragonshare-social-hook] Caption failed for ${party.role}:`, captionErr.message);
        }

        // Get optimal posting time
        let scheduledAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
        try {
          const scheduleResp = await fetch(
            `${SUPABASE_URL}/functions/v1/donny-schedule`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
              },
              body: JSON.stringify({
                action: 'suggest_times',
                platform,
                content_type: post.content_type || 'photo',
              }),
            },
          );
          if (scheduleResp.ok) {
            const scheduleData = await scheduleResp.json();
            if (scheduleData.suggestions?.[0]?.time) {
              scheduledAt = scheduleData.suggestions[0].time;
            }
          }
        } catch (schedErr) {
          console.warn(`[fire-dragonshare-social-hook] Schedule failed for ${party.role}:`, schedErr.message);
        }

        // Build media URLs — prefer screenshot, fall back to post_url
        const mediaUrls: string[] = [];
        if (post.screenshot_url) {
          mediaUrls.push(post.screenshot_url);
        } else if (post.post_url) {
          mediaUrls.push(post.post_url);
        }

        // Insert draft post
        const { data: scheduledPost } = await supabase
          .from('donny_scheduled_posts')
          .insert({
            user_id: party.user_id,
            campaign_id: null,
            platform,
            content_type: post.content_type || 'photo',
            caption,
            media_urls: mediaUrls,
            hashtags,
            scheduled_at: scheduledAt,
            status: 'draft',
            ai_suggested_time: true,
            ai_reasoning: 'Auto-drafted by DragonShare social hook (boost)',
            metadata: { source: 'dragonshare_social_hook', boost_id, post_id },
          })
          .select('id')
          .single();

        // Insert nudge
        await supabase.from('donny_nudges').upsert(
          {
            user_id: party.user_id,
            type: 'content',
            priority: 'high',
            source_table: 'dragonshare_boosts',
            source_id: boost_id,
            summary: getNudgeSummary(party.role, creatorName, businessName),
            actions: [
              {
                label: 'Post Now',
                variant: 'primary',
                action: 'post_now',
                payload: {
                  scheduled_post_id: scheduledPost?.id ?? null,
                },
              },
              {
                label: 'Review Draft',
                variant: 'secondary',
                action: 'navigate',
                payload: {
                  route: ROLE_ROUTES[party.role] || '/dashboard/business/social',
                },
              },
            ],
          },
          { onConflict: 'user_id,source_table,source_id', ignoreDuplicates: true },
        );

        draftsCreated++;
      } catch (partyErr) {
        console.warn(`[fire-dragonshare-social-hook] Failed for ${party.role} (${party.user_id}):`, partyErr.message);
      }
    }

    return new Response(
      JSON.stringify({ ok: true, drafts_created: draftsCreated, parties: parties.length }),
      { headers: { ...corsHeaders(req), 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    console.error('[fire-dragonshare-social-hook] Error:', error.message);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' } },
    );
  }
});
```

- [ ] **Step 2: Verify build passes**

Run: `npm run build`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/fire-dragonshare-social-hook/index.ts
git commit -m "feat: add fire-dragonshare-social-hook edge function for triple-post social drafts"
```

---

### Task 5: Wire usePromotions.ts to Call fire-promotion-social-hook

**Files:**
- Modify: `src/hooks/usePromotions.ts:354-374`

**Context:** The `reviewSubmission` mutation in `usePromotions.ts` handles both approval and rejection. At lines 354-373, inside the `if (status === 'approved')` block, it generates a discount code. After that code generation (and before the `send-promotion-notification` call at line 378), we add a fire-and-forget call to `fire-promotion-social-hook`. This must be wrapped in its own try/catch so it never blocks the approval flow.

- [ ] **Step 1: Add the social hook call**

In `src/hooks/usePromotions.ts`, after the discount code generation loop (which ends at line 373 with `}`) and before the notification try/catch block (line 376), insert:

```typescript
      // Fire social hook for auto-draft (fire-and-forget)
      try {
        await supabase.functions.invoke('fire-promotion-social-hook', {
          body: {
            promotion_id: submission.promotion_id,
            submission_id: submissionId,
          },
        });
      } catch (socialHookErr) {
        console.warn('[usePromotions] Social hook failed (non-blocking):', socialHookErr);
      }
```

This goes inside the existing `if (status === 'approved')` block, after line 373 (end of the discount code for-loop).

- [ ] **Step 2: Verify build passes**

Run: `npm run build`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/usePromotions.ts
git commit -m "feat: wire UGC approval to fire-promotion-social-hook"
```

---

### Task 6: Wire boost-payment to Call fire-dragonshare-social-hook

**Files:**
- Modify: `supabase/functions/boost-payment/index.ts:171-173`

**Context:** The `boost-payment` edge function completes at line 171 (`boost_status` updated to `'boosted'`) and then returns success at line 175. Between lines 173 and 175, we add a fire-and-forget call to `fire-dragonshare-social-hook`. Since this is an edge function calling another edge function, we use `fetch` directly (same pattern as `fire-campaign-social-hook` calling `social-caption`).

- [ ] **Step 1: Add the social hook call**

In `supabase/functions/boost-payment/index.ts`, after line 173 (`logStep("Boost complete", ...)`) and before line 175 (`return new Response(...)`), insert:

```typescript
    // Fire social hook for auto-draft (fire-and-forget)
    try {
      await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/fire-dragonshare-social-hook`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
        },
        body: JSON.stringify({ boost_id: boostId, post_id: post_id }),
      });
    } catch (socialHookErr) {
      console.warn('[boost-payment] Social hook failed (non-blocking):', socialHookErr);
    }
```

- [ ] **Step 2: Verify build passes**

Run: `npm run build`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/boost-payment/index.ts
git commit -m "feat: wire DragonShare boost to fire-dragonshare-social-hook"
```

---

### Task 7: Fix fire-campaign-social-hook Navigate Routes

**Files:**
- Modify: `supabase/functions/fire-campaign-social-hook/index.ts:263-268`

**Context:** The existing `fire-campaign-social-hook` creates nudges with navigate routes pointing to `/dashboard/creator/content-calendar` and `/dashboard/business/content-calendar`, which are non-existent routes. The actual social management page is at `/dashboard/{role}/social`. Fix the routes.

- [ ] **Step 1: Update the navigate routes**

In `supabase/functions/fire-campaign-social-hook/index.ts`, find the nudge actions block (around lines 263-268):

```typescript
                    payload: {
                      route: party.role === 'creator'
                        ? '/dashboard/creator/content-calendar'
                        : '/dashboard/business/content-calendar',
                    },
```

Replace with:

```typescript
                    payload: {
                      route: party.role === 'creator'
                        ? '/dashboard/creator/social'
                        : '/dashboard/business/social',
                    },
```

- [ ] **Step 2: Verify build passes**

Run: `npm run build`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/fire-campaign-social-hook/index.ts
git commit -m "fix: update campaign social hook navigate routes to /social"
```

---

### Task 8: Update DonnyProvider — post_type Mapping + publishDraft Function

**Files:**
- Modify: `src/contexts/DonnyProvider.tsx:12-249`

**Context:** Two changes to DonnyProvider:
1. The `post_now` handler inserts into `social_post_log` with `post_type: 'campaign'` hardcoded. We need it to read `metadata.source` from the draft row and map to the correct `post_type`.
2. The DraftsTab needs a way to publish drafts without going through `executeAction` (which requires a valid nudge ID). We extract the publish logic into a standalone `publishDraft` function exposed on the context.

**Key references:**
- `src/contexts/DonnyProvider.tsx` lines 130-184 (post_now handler inside executeAction)
- `src/contexts/DonnyProvider.tsx` lines 12-43 (DonnyContextValue interface)

- [ ] **Step 1: Add publishDraft to the context interface**

In `src/contexts/DonnyProvider.tsx`, add `publishDraft` to the `DonnyContextValue` interface (around line 36, after `clearChat`):

```typescript
  publishDraft: (scheduledPostId: string) => Promise<void>;
```

- [ ] **Step 2: Extract publish logic into a standalone function**

After the `openDonnyWithContext` callback (around line 212), add a new `publishDraft` callback that contains the `post_now` logic currently inside `executeAction`. This function can be called directly by DraftsTab without needing a nudge ID:

```typescript
  const publishDraft = useCallback(async (scheduledPostId: string) => {
    try {
      const postId = scheduledPostId;

      const { data: draft, error: draftErr } = await supabase
        .from('donny_scheduled_posts')
        .select('caption, media_urls, platform, content_type, campaign_id, metadata')
        .eq('id', postId)
        .single();

      if (draftErr || !draft) throw new Error('Could not load draft post');

      const { data: publishData, error: publishErr } = await supabase.functions.invoke(
        'outstand-proxy',
        {
          body: {
            path: '/v1/posts',
            method: 'POST',
            payload: {
              caption: draft.caption,
              media_urls: draft.media_urls,
              platform: draft.platform,
              content_type: draft.content_type,
            },
          },
        },
      );

      if (publishErr) throw publishErr;

      const outstandPostId = publishData?.id ?? publishData?.post_id ?? 'unknown';

      const draftMetadata = (draft as any).metadata as Record<string, unknown> | null;
      const sourceToPostType: Record<string, string> = {
        campaign_social_hook: 'campaign',
        promotion_social_hook: 'ugc_promotion',
        dragonshare_social_hook: 'dragonshare',
      };
      const postType = sourceToPostType[(draftMetadata?.source as string) ?? ''] || 'standalone';

      await supabase
        .from('donny_scheduled_posts')
        .update({ status: 'published', published_at: new Date().toISOString() })
        .eq('id', postId);

      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from('social_post_log').insert({
          user_id: user.id,
          campaign_id: draft.campaign_id,
          outstand_post_id: String(outstandPostId),
          platform: draft.platform,
          post_type: postType,
        });
      }

      toast.success(`Posted to ${draft.platform}!`);
    } catch (err) {
      console.error('[DonnyProvider] publishDraft failed:', err);
      toast.error('Failed to publish post. Please try again.');
    }
  }, []);
```

- [ ] **Step 3: Update the existing post_now handler to call publishDraft**

In the `executeAction` callback, replace the entire `post_now` block (lines 130-184) with a delegation to `publishDraft`:

```typescript
      if (action.action === 'post_now' && action.payload?.scheduled_post_id) {
        await publishDraft(action.payload.scheduled_post_id as string);
        return;
      }
```

- [ ] **Step 4: Add publishDraft to the context value**

In the `useMemo` value object (around line 238), add `publishDraft`:

```typescript
      publishDraft,
```

And add it to the dependency array of the useMemo.

- [ ] **Step 5: Verify build passes**

Run: `npm run build`
Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add src/contexts/DonnyProvider.tsx
git commit -m "feat: extract publishDraft function, add post_type mapping for social_post_log"
```

---

### Task 9: Create useDraftPosts Hook

**Files:**
- Create: `src/hooks/useDraftPosts.ts`

**Context:** The DraftsTab needs to query `donny_scheduled_posts` where `status = 'draft'` for the current user. This hook uses React Query and follows the project's existing hook patterns (see `src/hooks/usePromotions.ts`, `src/hooks/useDonny.ts` for examples). It also provides a mutation for deleting/cancelling drafts.

- [ ] **Step 1: Create the hook file**

Create `src/hooks/useDraftPosts.ts`:

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface DraftPost {
  id: string;
  user_id: string;
  campaign_id: string | null;
  platform: string;
  content_type: string;
  caption: string | null;
  media_urls: string[] | null;
  hashtags: string[] | null;
  scheduled_at: string;
  status: string;
  ai_suggested_time: boolean;
  ai_reasoning: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export function useDraftPosts() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: drafts = [], isLoading } = useQuery<DraftPost[]>({
    queryKey: ['draft-posts', user?.id],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('donny_scheduled_posts')
        .select('id, user_id, campaign_id, platform, content_type, caption, media_urls, hashtags, scheduled_at, status, ai_suggested_time, ai_reasoning, metadata, created_at')
        .eq('user_id', user!.id)
        .eq('status', 'draft')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user?.id,
    staleTime: 30_000,
  });

  const cancelDraft = useMutation({
    mutationFn: async (draftId: string) => {
      const { error } = await (supabase as any)
        .from('donny_scheduled_posts')
        .update({ status: 'cancelled' })
        .eq('id', draftId)
        .eq('user_id', user!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['draft-posts'] });
    },
  });

  return { drafts, isLoading, draftCount: drafts.length, cancelDraft };
}
```

- [ ] **Step 2: Verify build passes**

Run: `npm run build`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useDraftPosts.ts
git commit -m "feat: add useDraftPosts hook for fetching draft social posts"
```

---

### Task 10: Create DraftsTab Component

**Files:**
- Create: `src/components/outstand/DraftsTab.tsx`

**Context:** A new tab for the OutstandManager showing pending draft posts from `donny_scheduled_posts`. Each draft card displays a source badge, platform pill, caption preview, suggested time, and "Post Now" / "Cancel" buttons. Uses `useDraftPosts` hook and `useDonnyContext` for the post_now action.

**Design references:**
- `src/components/outstand/ScheduledTab.tsx` — card layout pattern (white bg, rounded-2xl, border-2 border-dc-teal, p-4)
- `src/components/outstand/CalendarTab.tsx` — platform filter pill styling
- Spec Section 3 source badge colors: Campaign=teal, UGC=pink, DragonShare=yellow, Manual=gray

- [ ] **Step 1: Create the DraftsTab component**

Create `src/components/outstand/DraftsTab.tsx`:

```tsx
import React, { useState } from 'react';
import { FileText, Send, X as XIcon, CalendarClock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DCEmptyState } from '@/components/ui/dc-empty-state';
import { DCSkeleton } from '@/components/ui/dc-skeleton';
import { useDraftPosts, type DraftPost } from '@/hooks/useDraftPosts';
import { useDonnyContext } from '@/contexts/DonnyProvider';
import { useQueryClient } from '@tanstack/react-query';

const SOURCE_BADGES: Record<string, { label: string; className: string }> = {
  campaign_social_hook: { label: 'Campaign', className: 'bg-dc-teal/20 text-dc-teal' },
  promotion_social_hook: { label: 'UGC', className: 'bg-pink-100 text-pink-600' },
  dragonshare_social_hook: { label: 'DragonShare', className: 'bg-yellow-100 text-yellow-800' },
};

const PLATFORM_LABELS: Record<string, string> = {
  instagram: 'Instagram',
  tiktok: 'TikTok',
  facebook: 'Facebook',
  twitter: 'X',
  youtube: 'YouTube',
};

function SourceBadge({ source }: { source: string | undefined }) {
  const badge = SOURCE_BADGES[source ?? ''] ?? { label: 'Manual', className: 'bg-gray-100 text-gray-600' };
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${badge.className}`}>
      {badge.label}
    </span>
  );
}

interface DraftsTabProps {
  onSwitchTab?: (tab: string) => void;
}

export const DraftsTab: React.FC<DraftsTabProps> = ({ onSwitchTab }) => {
  const { drafts, isLoading, cancelDraft } = useDraftPosts();
  const { publishDraft } = useDonnyContext();
  const queryClient = useQueryClient();
  const [publishingId, setPublishingId] = useState<string | null>(null);

  const handlePostNow = async (draft: DraftPost) => {
    setPublishingId(draft.id);
    try {
      await publishDraft(draft.id);
      queryClient.invalidateQueries({ queryKey: ['draft-posts'] });
    } catch (err) {
      console.error('[DraftsTab] Post failed:', err);
    } finally {
      setPublishingId(null);
    }
  };

  if (isLoading) {
    return <DCSkeleton variant="card" count={3} className="mb-3" />;
  }

  if (drafts.length === 0) {
    return (
      <DCEmptyState
        icon={FileText}
        title="No drafts waiting"
        subtitle="When you approve customer videos or get boosted, Donny will prepare posts for you here."
      />
    );
  }

  return (
    <div className="space-y-3">
      {drafts.map((draft) => {
        const source = (draft.metadata as Record<string, unknown>)?.source as string | undefined;
        const scheduledDate = new Date(draft.scheduled_at);
        const captionPreview = draft.caption
          ? draft.caption.length > 120 ? `${draft.caption.slice(0, 120)}…` : draft.caption
          : null;

        return (
          <div key={draft.id} className="bg-white rounded-2xl p-4 border-2 border-dc-teal">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                {/* Source + platform badges */}
                <div className="flex items-center gap-1.5 mb-2">
                  <SourceBadge source={source} />
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                    {PLATFORM_LABELS[draft.platform] || draft.platform}
                  </span>
                </div>

                {/* Suggested time */}
                <p className="text-xs text-gray-500 flex items-center gap-1 mb-1">
                  <CalendarClock className="h-3 w-3" />
                  Suggested: {scheduledDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} at{' '}
                  {scheduledDate.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                </p>

                {/* Caption preview */}
                <p className="text-sm text-gray-900 whitespace-pre-wrap break-words">
                  {captionPreview || <span className="italic text-gray-400">No caption</span>}
                </p>

                {/* Hashtags */}
                {draft.hashtags?.length ? (
                  <p className="text-xs text-dc-teal mt-1">{draft.hashtags.join(' ')}</p>
                ) : null}

                {/* Media thumbnail */}
                {draft.media_urls?.[0] && (
                  <div className="mt-2">
                    <img
                      src={draft.media_urls[0]}
                      alt="Draft media"
                      className="h-16 w-16 rounded-lg object-cover border border-gray-200"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                  </div>
                )}
              </div>

              {/* Action buttons */}
              <div className="flex flex-col gap-2">
                <Button
                  size="sm"
                  onClick={() => handlePostNow(draft)}
                  disabled={publishingId === draft.id}
                  className="rounded-full bg-dc-teal-btn text-white font-bold hover:bg-dc-teal-btn-hover"
                >
                  <Send className="h-3 w-3 mr-1" />
                  {publishingId === draft.id ? 'Posting…' : 'Post Now'}
                </Button>
                <Button
                  variant="dc-outline"
                  size="sm"
                  onClick={() => onSwitchTab?.('compose')}
                  className="rounded-full border-dc-teal text-dc-teal hover:bg-dc-teal/10"
                >
                  Edit
                </Button>
                <Button
                  variant="dc-outline"
                  size="sm"
                  onClick={() => cancelDraft.mutate(draft.id)}
                  disabled={cancelDraft.isPending}
                  className="rounded-full border-pink-300 text-pink-600 hover:bg-pink-50"
                >
                  <XIcon className="h-3 w-3 mr-1" />
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
```

- [ ] **Step 2: Verify build passes**

Run: `npm run build`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/outstand/DraftsTab.tsx
git commit -m "feat: add DraftsTab component for social post drafts"
```

---

### Task 11: Add Drafts Tab to OutstandManager

**Files:**
- Modify: `src/pages/OutstandManager.tsx:1-298`

**Context:** The `OutstandManager` page has tabs for Compose, Calendar, Published, Engagement, Analytics, Sponsorships (brand-only), and Accounts. We need to add a "Drafts" tab between Compose and Calendar with a count badge showing the number of pending drafts.

**Key references:**
- `src/pages/OutstandManager.tsx` lines 24 (VALID_TABS), 214-255 (TabsList), 257-293 (TabsContent)
- The Accounts tab (line 246-254) shows a count badge pattern we can reuse

- [ ] **Step 1: Add imports**

In `src/pages/OutstandManager.tsx`, add the new imports:

After the existing import of `AnalyticsTab` (line 13), add:
```typescript
import { DraftsTab } from '@/components/outstand/DraftsTab';
import { useDraftPosts } from '@/hooks/useDraftPosts';
```

Add `FileText` to the lucide-react import (line 3):
```typescript
import { Send, CalendarDays, BarChart3, MessageCircle, TrendingUp, Link as LinkIcon, RefreshCw, Handshake, FileText } from 'lucide-react';
```

- [ ] **Step 2: Update VALID_TABS**

Change line 24 from:
```typescript
const VALID_TABS = ['compose', 'calendar', 'published', 'engagement', 'analytics', 'sponsorships', 'accounts'] as const;
```
to:
```typescript
const VALID_TABS = ['compose', 'drafts', 'calendar', 'published', 'engagement', 'analytics', 'sponsorships', 'accounts'] as const;
```

- [ ] **Step 3: Add useDraftPosts hook call**

Inside `OutstandManagerInner`, after the `useSanitizeFileInputs()` call (line 67), add:
```typescript
  const { draftCount } = useDraftPosts();
```

- [ ] **Step 4: Add the Drafts tab trigger**

In the TabsList (after the Compose TabsTrigger, around line 219), add:

```tsx
            <TabsTrigger value="drafts" className="flex items-center gap-1 text-xs">
              <FileText className="h-3 w-3" />
              <span className="hidden sm:inline">Drafts</span>
              <span className="sm:hidden">Drafts</span>
              {draftCount > 0 && (
                <span className="ml-1 bg-dc-pink-accent text-white text-xs px-1.5 py-0.5 rounded-full">
                  {draftCount}
                </span>
              )}
            </TabsTrigger>
```

- [ ] **Step 5: Update grid cols count**

Update the TabsList grid class (line 214) to account for the new tab. Change:
```typescript
<TabsList className={`grid w-full ${isBrand ? 'grid-cols-7 overflow-x-auto' : 'grid-cols-6'}`}>
```
to:
```typescript
<TabsList className={`grid w-full ${isBrand ? 'grid-cols-8 overflow-x-auto' : 'grid-cols-7'} overflow-x-auto`}>
```

- [ ] **Step 6: Add the Drafts TabsContent**

After the Compose TabsContent (around line 266), add:
```tsx
          <TabsContent value="drafts">
            <DraftsTab onSwitchTab={setActiveTab} />
          </TabsContent>
```

- [ ] **Step 7: Verify build passes**

Run: `npm run build`
Expected: No errors.

- [ ] **Step 8: Commit**

```bash
git add src/pages/OutstandManager.tsx
git commit -m "feat: add Drafts tab to OutstandManager with count badge"
```

---

### Task 12: Deploy Migration and Verify

**Context:** The `social_post_log` CHECK constraint migration needs to be applied to the remote database. All edge functions are auto-deployed when pushed to main via Lovable.

- [ ] **Step 1: Deploy the migration**

Use the Supabase MCP tool `apply_migration` or run:
```bash
npx supabase db push
```

- [ ] **Step 2: Run full build**

Run: `npm run build`
Expected: Zero errors, clean build.

- [ ] **Step 3: Push to main**

```bash
git push origin main
```

This triggers Lovable auto-deploy. Edge functions will be available after deploy completes.

- [ ] **Step 4: Verify edge functions exist**

Check Supabase dashboard or run:
```bash
npx supabase functions list
```

Confirm these functions appear:
- `fire-promotion-social-hook`
- `fire-dragonshare-social-hook`

---

## Verification Checklist

After all tasks are complete, verify end-to-end:

1. **UGC flow:** Approve a customer video submission → `donny_scheduled_posts` row appears with `metadata.source = 'promotion_social_hook'` → Donny nudge appears for business user → tapping "Post Now" publishes via Outstand → `social_post_log` row inserted with `post_type = 'ugc_promotion'`

2. **DragonShare flow:** Business boosts a creator's post → up to 3 draft rows appear in `donny_scheduled_posts` (business, creator, brand) with `metadata.source = 'dragonshare_social_hook'` → each party gets a nudge → tapping "Post Now" publishes

3. **Drafts tab:** Navigate to `/dashboard/business/social?tab=drafts` → drafts appear with source badges → "Post Now" publishes → draft disappears from list

4. **Navigate routes:** Campaign Stage 4 nudge "Review Draft" button navigates to `/dashboard/{role}/social` (not `/content-calendar`)

5. **social-caption:** New sources produce different caption tones (promotion=UGC celebration, dragonshare=per-role amplification)
