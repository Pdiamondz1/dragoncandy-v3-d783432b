# Enhanced Campaign Creation Wizard — Design Spec

**Date:** 2026-04-03
**Scope:** Phase 1 — Database migration, reusable components, enhanced 4-step wizard, hooks
**Approach:** Enhance existing `CampaignWizard.tsx` and its infrastructure

---

## 1. Database Migration

### 1.1 New Table: `campaign_media`

Stores all media attached to campaigns — reference images, reference videos, AI previews, and raw footage.

```sql
CREATE TABLE campaign_media (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE NOT NULL,
  uploaded_by UUID REFERENCES profiles(id) NOT NULL,
  media_type TEXT NOT NULL CHECK (media_type IN ('reference_image', 'reference_video', 'ai_preview', 'raw_footage')),
  file_url TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size_bytes BIGINT,
  mime_type TEXT,
  duration_seconds NUMERIC,
  thumbnail_url TEXT,
  sort_order INTEGER DEFAULT 0,
  ai_analysis JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_campaign_media_campaign ON campaign_media(campaign_id);
CREATE INDEX idx_campaign_media_type ON campaign_media(campaign_id, media_type);

ALTER TABLE campaign_media ENABLE ROW LEVEL SECURITY;

-- Separate policies for clarity and safety
CREATE POLICY "Business owners can read their campaign media"
  ON campaign_media FOR SELECT
  USING (
    uploaded_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM campaigns c WHERE c.id = campaign_media.campaign_id AND c.user_id = auth.uid()
    )
  );

CREATE POLICY "Business owners can insert campaign media"
  ON campaign_media FOR INSERT
  WITH CHECK (uploaded_by = auth.uid());

CREATE POLICY "Business owners can update their campaign media"
  ON campaign_media FOR UPDATE
  USING (uploaded_by = auth.uid());

CREATE POLICY "Business owners can delete their campaign media"
  ON campaign_media FOR DELETE
  USING (
    uploaded_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM campaigns c WHERE c.id = campaign_media.campaign_id AND c.user_id = auth.uid()
    )
  );

CREATE POLICY "Creators can view media for published campaigns"
  ON campaign_media FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM campaigns c
      WHERE c.id = campaign_media.campaign_id
      AND c.status IN ('published', 'active')
    )
  );
```

**Note:** The existing `campaigns` table uses `c.user_id` (not `c.business_id`). RLS policies use `user_id` to match. INSERT policy uses explicit `WITH CHECK` to ensure `uploaded_by` is always the authenticated user.

### 1.2 New Table: `campaign_deliverables`

Individual content pieces within a campaign.

```sql
CREATE TABLE campaign_deliverables (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE NOT NULL,
  content_type TEXT NOT NULL CHECK (content_type IN ('photo', 'video_reel', 'story', 'carousel', 'tiktok', 'youtube_short')),
  platform TEXT NOT NULL CHECK (platform IN ('instagram', 'tiktok', 'facebook', 'youtube', 'google_business', 'multi_platform')),
  description TEXT,
  aspect_ratio TEXT DEFAULT '9:16' CHECK (aspect_ratio IN ('9:16', '16:9', '1:1', '4:5')),
  max_duration_seconds INTEGER,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'submitted', 'revision_requested', 'approved')),
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_campaign_deliverables_campaign ON campaign_deliverables(campaign_id);

ALTER TABLE campaign_deliverables ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Business owners manage deliverables"
  ON campaign_deliverables FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM campaigns c WHERE c.id = campaign_deliverables.campaign_id AND c.user_id = auth.uid()
    )
  );

CREATE POLICY "Creators view deliverables for visible campaigns"
  ON campaign_deliverables FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM campaigns c
      WHERE c.id = campaign_deliverables.campaign_id
      AND c.status IN ('published', 'active')
    )
  );
```

### 1.3 New Columns on `campaigns`

```sql
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS content_source TEXT
  DEFAULT 'creator_shoots'
  CHECK (content_source IN ('creator_shoots', 'business_footage', 'hybrid'));

ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS ai_preview_status TEXT
  DEFAULT 'none'
  CHECK (ai_preview_status IN ('none', 'generating', 'ready', 'approved', 'rejected'));

ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS ai_preview_prompt TEXT;
```

### 1.4 Storage Bucket

The existing `campaign-assets` bucket can be used, OR create a new `campaign-media` bucket via Supabase Dashboard:
- Public: false (signed URLs for access)
- File size limit: 100MB
- Allowed MIME types: image/jpeg, image/png, image/webp, video/mp4, video/quicktime, video/webm

**Decision:** Use the existing `campaign-assets` bucket with a path convention: `campaigns/{campaign_id}/media/{media_type}/{filename}`. This avoids creating a new bucket.

---

## 2. New Components

All new components go in `src/components/campaigns/` (matching the existing directory with 60+ campaign components).

### 2.1 `ContentSourceSelector.tsx`

**Purpose:** Radio group with visual cards for selecting how content will be sourced.

**Props:**
```typescript
interface ContentSourceSelectorProps {
  value: 'creator_shoots' | 'business_footage' | 'hybrid';
  onChange: (value: 'creator_shoots' | 'business_footage' | 'hybrid') => void;
}
```

**Design:**
- 3 card-style radio options, stacked vertically on mobile, horizontal on desktop
- Each card: icon (Lucide: `Camera`, `Film`, `Layers`) + title + subtitle
- Selected card: teal border (`border-2 border-dc-teal`) + light teal bg
- Unselected: gray border, white bg
- Default selected: "Creator shoots new content"

### 2.2 `MediaUploader.tsx`

**Purpose:** Drag-and-drop file upload for campaign media, built on patterns from `EnhancedFileUpload.tsx`.

**Props:**
```typescript
interface MediaUploaderProps {
  mediaType: 'reference_image' | 'reference_video' | 'raw_footage';
  maxFiles: number;           // default 10
  campaignId?: string;        // undefined during wizard (pre-save)
  onFilesChange: (files: StagedFile[]) => void;
  className?: string;
}

interface StagedFile {
  file: File;
  preview: string;            // object URL for thumbnail
  name: string;
  size: number;
  type: string;               // MIME type
  duration?: number;           // video duration in seconds
}
```

**Key behavior:**
- During wizard creation (no campaignId yet), files are staged in memory — NOT uploaded to Supabase
- Files are uploaded to Supabase Storage only on campaign save/launch (Step 4)
- This avoids orphaned uploads when users abandon the wizard
- Accepts: images (jpg, png, webp up to 50MB) and videos (mp4, mov, webm up to 100MB)
- Client-side video duration validation: max 60 seconds
- Shows upload progress when actual upload happens
- Thumbnail grid with: preview, file name, size badge, remove (X) button
- Videos show play icon overlay on thumbnail
- Uses `react-dropzone` (already installed in project)

### 2.3 `MediaGallery.tsx`

**Purpose:** Displays uploaded media in a responsive grid.

**Props:**
```typescript
interface MediaGalleryProps {
  media: CampaignMediaItem[];
  editable?: boolean;         // show remove/reorder controls
  showTypeFilter?: boolean;   // filter tabs by media_type
  onRemove?: (mediaId: string) => void;
  onReorder?: (mediaIds: string[]) => void;
}

interface CampaignMediaItem {
  id: string;
  media_type: 'reference_image' | 'reference_video' | 'ai_preview' | 'raw_footage';
  file_url: string;
  file_name: string;
  file_size_bytes?: number;
  mime_type?: string;
  duration_seconds?: number;
  thumbnail_url?: string;
}
```

**Design:**
- Responsive grid: 2 cols mobile, 3 cols tablet, 4 cols desktop
- Images: thumbnail with lightbox on click (use existing Dialog/Sheet)
- Videos: thumbnail with play icon overlay, inline `<video>` player on click
- Type badge on each item (Photo / Video)
- When `editable`: remove X button in top-right corner of each item
- When `showTypeFilter`: tab bar at top (Reference | AI Preview | Raw Footage)

### 2.4 `DeliverableBuilder.tsx`

**Purpose:** Card-based list for defining campaign deliverables.

**Props:**
```typescript
interface DeliverableBuilderProps {
  deliverables: Deliverable[];
  onChange: (deliverables: Deliverable[]) => void;
}

interface Deliverable {
  id: string;                 // client-side UUID
  content_type: 'photo' | 'video_reel' | 'story' | 'carousel' | 'tiktok' | 'youtube_short';
  platform: 'instagram' | 'tiktok' | 'facebook' | 'youtube' | 'google_business' | 'multi_platform';
  aspect_ratio: '9:16' | '16:9' | '1:1' | '4:5';
  max_duration_seconds?: number;
  description?: string;
}
```

**Design:**
- Each deliverable is a Card with:
  - Content type dropdown (Photo, Video Reel, Story, Carousel, TikTok, YouTube Short)
  - Platform dropdown (Instagram, TikTok, Facebook, YouTube, Google Business, Multi-Platform)
  - Aspect ratio selector (4 pill buttons)
  - Max duration input (number, seconds — only shown for video types)
  - Description textarea (optional, placeholder: "Specific instructions for this piece...")
  - Remove button (trash icon) — disabled when only 1 deliverable remains
- "+ Add Deliverable" button at bottom (disabled when 10 reached)
- Header shows total count: "3 pieces of content"
- Min 1, max 10

### 2.5 `MoodBoard.tsx`

**Purpose:** Displays the AI-generated mood board from the preview step.

The existing Edge Function generates mood boards with: `color_palette`, `typography { heading, body }`, `layout_description`, `reference_descriptions[]`. The component props align with this output, plus a `title` from the preview record.

**Props:**
```typescript
interface MoodBoardProps {
  title: string;
  colorPalette: string[];          // hex codes from Edge Function
  typography?: {
    heading: string;
    body: string;
  };
  layoutDescription: string;       // maps to Edge Function's layout_description
  referenceDescriptions?: string[]; // maps to Edge Function's reference_descriptions
}
```

**Design:**
- Title as section heading
- Color palette as circular swatches in a row
- Typography notes as secondary text
- Layout description as body text
- Reference descriptions as a bulleted list (if provided)

### 2.6 `Storyboard.tsx`

**Purpose:** Displays shot/frame descriptions from the AI preview.

The existing Edge Function generates storyboards as flat `frames[]` with: `frame_number`, `duration_seconds`, `scene_description`, `camera_angle`, `text_overlay`, `transition`. A transformation layer in the `useDonnyPreview` hook groups these by deliverable when possible.

**Props:**
```typescript
interface StoryboardProps {
  frames: StoryboardFrame[];
  title?: string;
}

interface StoryboardFrame {
  frame_number: number;
  scene_description: string;
  duration_seconds?: number;
  camera_angle?: string;
  text_overlay?: string;
  transition?: string;
}
```

**Design:**
- Card with title (e.g. "Storyboard")
- Numbered frame list: "Frame 1: Close-up of..." with camera angle and duration
- Text overlay and transition notes shown as secondary details per frame

### 2.7 `CostBreakdown.tsx`

**Purpose:** Shows cost breakdown on the Review step.

**Props:**
```typescript
interface CostBreakdownProps {
  deliverableCount: number;
  budgetTotal: number;
  baseCostPerDeliverable: number;  // budgetTotal / deliverableCount
  premiumAmount: number;           // DragonDash premium (0 if standard)
  deliveryType: string;            // 'standard' | 'expedited' | 'dragonrush'
}
```

**Design:**
- Clean list: base cost per deliverable, DragonDash premium (if applicable), total
- "Donny will match you with creators in your area" note at bottom

---

## 3. Enhanced Wizard Flow

### 3.0 Step Mapping (Existing → New)

The existing wizard has 6 steps (0-5). The new wizard consolidates into 4 steps:

| Existing Step | Existing Component | New Step | Action |
|---|---|---|---|
| 0: Delivery Tier | `DeliveryTierStep` | Step 2 (Details) | Merged into Details as timeline toggle |
| 1: Campaign Goal | `CampaignGoalStep` | Step 1 (Brief) | Enhanced with ContentSourceSelector + MediaUploader |
| 2: AI Analysis | `CampaignAnalysisDisplay` | Step 2 (Details) | AI-generated fields shown in Details step |
| 3: Customize | `CampaignCustomizeForm` | Step 2 (Details) | Merged into editable Details step |
| 4: Timeline/Budget | `CampaignTimelineBudgetStep` | Step 2 (Details) | Budget + timeline in Details step |
| 5: Finalize | `CampaignFinalizeStep` | Step 4 (Review) | Enhanced with media gallery + deliverables list |
| — | NEW | Step 3 (AI Preview) | New step for mood board + storyboard |

The consolidation reduces friction: Steps 0, 2, 3, and 4 all contained related "campaign details" that are now on one scrollable page (Step 2). The new Step 3 (AI Preview) replaces the old analysis display with a richer visual preview.

### 3.0.1 Auto-Save as Draft (Critical Workflow)

The AI Preview step (Step 3) calls the `donny-campaign-preview` Edge Function, which requires a `campaign_id`. Since the campaign doesn't exist yet during wizard creation, the wizard **auto-saves the campaign as a draft** when transitioning from Step 2 to Step 3:

1. User completes Step 2 ("Campaign Details") and clicks "Next"
2. Before showing Step 3, the wizard creates the campaign in Supabase with `status: 'draft'`
3. This gives us a `campaign_id` for the Edge Function call and for media uploads
4. If the user abandons the wizard, the draft remains (can be resumed from dashboard)
5. On "Launch" in Step 4, the draft is updated to `status: 'published'`

This also means media uploads can happen immediately after Step 2 instead of being staged in memory. However, for Step 1 (before draft exists), reference media and raw footage are still staged in memory and uploaded when the draft is created.

### 3.1 State Management

Extend the existing `useCampaignWizard.ts` hook to include:

```typescript
// New state fields to add to wizard state
interface EnhancedWizardState {
  // Existing fields preserved...

  // New fields:
  contentSource: 'creator_shoots' | 'business_footage' | 'hybrid';
  referenceMedia: StagedFile[];
  rawFootage: StagedFile[];
  deliverables: Deliverable[];
  aiPreview: {
    status: 'none' | 'generating' | 'ready' | 'approved' | 'rejected';
    moodBoard: MoodBoardData | null;
    storyboard: StoryboardEntry[] | null;
    referenceAnalysis: string | null;
  };
}
```

### 3.2 Step 1: "What Do You Need?"

**File:** New component `CampaignBriefStep.tsx` (or enhance existing `CampaignGoalStep.tsx`)

**Layout (top to bottom):**
1. Existing input method tabs (URL paste / text description / quick presets)
2. `ContentSourceSelector` — always visible below tabs
3. "Show creators what you're looking for" heading + `MediaUploader` (reference media, max 5, optional)
4. "Upload your footage for the creator" heading + `MediaUploader` (raw footage, max 10) — only visible when content source is `business_footage` or `hybrid`

### 3.3 Step 2: "Campaign Details"

**File:** Enhance existing campaign details step components

**Layout:**
1. AI-generated fields (title, description, target audience, key messaging) — keep existing
2. `DeliverableBuilder` — replaces simple deliverables field
3. Budget slider/input — keep existing, add per-deliverable estimate display
4. Timeline toggle (Standard / DragonDash) — keep existing

### 3.4 Step 3: "AI Visual Preview" (NEW)

**File:** New component `CampaignAIPreviewStep.tsx`

**On entering step:**
- Call `donny-campaign-preview` Edge Function with action `"generate"` and preview types `["mood_board", "storyboard"]`
- Show loading state: "Donny is creating a visual preview of your campaign..."
- On success: display `MoodBoard` + `Storyboard` components

**Actions:**
- "Regenerate Preview" — calls Edge Function with action `"regenerate"`
- "Edit Preview" — makes storyboard text editable inline
- "Approve & Continue" — calls Edge Function with action `"approve"`, sets `ai_preview_status = 'approved'`, proceeds to Step 4
- "Skip Preview" — sets `ai_preview_status = 'none'`, proceeds to Step 4

### 3.5 Step 4: "Review & Launch"

**File:** Enhance existing `CampaignFinalizeStep.tsx`

**Layout:**
1. Campaign summary card (title, description, audience, content source badge, timeline badge, budget, deadline)
2. Deliverables list (numbered, each with type icon + platform + description preview)
3. Media section: `MediaGallery` showing reference media + AI preview summary + raw footage thumbnails
4. `CostBreakdown`
5. "Launch Campaign" button (teal, full-width mobile) + "Save as Draft" (outlined)
6. "Edit" links on each section to jump back to that step

**On Launch:**
1. Create/update campaign in Supabase `campaigns` table (including new columns)
2. Insert deliverables into `campaign_deliverables` table
3. Upload staged media files to Supabase Storage
4. Create `campaign_media` records for each uploaded file
5. Set campaign status to `published`
6. Navigate to dashboard with success toast

---

## 4. Hooks

### 4.1 `useCampaignMedia.ts`

```typescript
export const useCampaignMedia = (campaignId: string | undefined) => {
  return useQuery({
    queryKey: ['campaign_media', campaignId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('campaign_media')
        .select('id, campaign_id, media_type, file_url, file_name, file_size_bytes, mime_type, duration_seconds, thumbnail_url, sort_order, ai_analysis, created_at')
        .eq('campaign_id', campaignId!)
        .order('sort_order');
      if (error) throw error;
      return data;
    },
    enabled: !!campaignId,
  });
};
```

### 4.2 `useCampaignDeliverables.ts`

```typescript
export const useCampaignDeliverables = (campaignId: string | undefined) => {
  return useQuery({
    queryKey: ['campaign_deliverables', campaignId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('campaign_deliverables')
        .select('id, campaign_id, content_type, platform, description, aspect_ratio, max_duration_seconds, status, sort_order, created_at')
        .eq('campaign_id', campaignId!)
        .order('sort_order');
      if (error) throw error;
      return data;
    },
    enabled: !!campaignId,
  });
};
```

### 4.3 `useUploadCampaignMedia.ts`

Mutation hook that:
1. Uploads file to Supabase Storage at `campaign-assets/campaigns/{campaignId}/media/{mediaType}/{filename}`
2. Creates a `campaign_media` record
3. Invalidates `campaign_media` query cache

### 4.4 `useDonnyPreview.ts`

Mutation hook that:
1. Calls `donny-campaign-preview` Edge Function with `action: "generate"`
2. Passes campaign data + preview types
3. Returns generated mood board + storyboard data
4. Updates `campaigns.ai_preview_status` to `ready`

---

## 5. File Inventory

### New Files:
- `supabase/migrations/YYYYMMDD_campaign_media_deliverables.sql`
- `src/components/campaigns/ContentSourceSelector.tsx`
- `src/components/campaigns/MediaUploader.tsx`
- `src/components/campaigns/MediaGallery.tsx`
- `src/components/campaigns/DeliverableBuilder.tsx`
- `src/components/campaigns/MoodBoard.tsx`
- `src/components/campaigns/Storyboard.tsx`
- `src/components/campaigns/CostBreakdown.tsx`
- `src/components/campaigns/CampaignBriefStep.tsx`
- `src/components/campaigns/CampaignAIPreviewStep.tsx`
- `src/hooks/useCampaignMedia.ts`
- `src/hooks/useCampaignDeliverables.ts`
- `src/hooks/useUploadCampaignMedia.ts`
- `src/hooks/useDonnyPreview.ts`

### Modified Files:
- `src/hooks/useCampaignWizard.ts` — extend state with new fields
- `src/pages/CampaignWizard.tsx` — add new steps to wizard flow, consolidate 6→4 steps
- `src/components/campaigns/CampaignFinalizeStep.tsx` — enhance review step
- `src/integrations/supabase/types.ts` — regenerate after migration (`npx supabase gen types typescript`)

### NOT Modified:
- Landing page, login/auth, browse creators, creator profile, messaging
- Existing Supabase Edge Functions (donny-campaign-preview used as-is)
- Dashboard page
- Any non-campaign components

### Post-Migration Step:
After running the database migration, regenerate Supabase types:
```bash
npx supabase gen types typescript --project-id zocahiffooqdybdhguqv > src/integrations/supabase/types.ts
```

---

## 6. Key Design Decisions

**Staged uploads (not immediate):** Media files are held in browser memory during wizard creation and only uploaded to Supabase on campaign save/launch. This prevents orphaned files when users abandon the wizard mid-flow.

**Single `campaign_media` table:** Using a `media_type` discriminator keeps queries simple. One query fetches all media for a campaign, filtered by type in the UI tabs.

**Reusing existing Edge Function:** The `donny-campaign-preview` Edge Function already supports mood boards, storyboards, and approval workflows. No need to create a new one — we wire the UI to the existing API.

**Existing storage bucket:** Using `campaign-assets` with path conventions avoids creating a new bucket and its associated RLS policies.

**`user_id` not `business_id`:** The existing `campaigns` table uses `user_id` as the foreign key to `profiles`. All RLS policies reference `user_id` to stay consistent.

**Edge Function column fix (prerequisite):** The existing `donny-campaign-preview` Edge Function queries `budget` and `niche` columns that don't exist on the `campaigns` table (actual columns: `budget_min`, `budget_max`, no `niche`). The Edge Function's select statement needs updating to `budget_min, budget_max, goals, style, tone, platforms, deliverables` before Step 3 can function correctly. This is a small fix in the Edge Function's campaign data fetch.

**Auto-save as draft:** The campaign is auto-saved as a draft when transitioning from Step 2 → Step 3. This solves the `campaign_id` chicken-and-egg problem (Edge Function needs a campaign_id, but wizard hasn't saved yet). Abandoned drafts persist and can be resumed.

**Component props match Edge Function output:** MoodBoard and Storyboard component props are aligned with the existing Edge Function's actual output schema, not the Enhanced Prompt 8 spec's idealized schema. This avoids modifying the Edge Function in Phase 1.

**Memory limit for staged files:** MediaUploader enforces a 300MB total staged file limit across all uploaders in the wizard. Videos are the concern — 10 files at 100MB each would be 1GB. The limit prevents browser memory issues.
