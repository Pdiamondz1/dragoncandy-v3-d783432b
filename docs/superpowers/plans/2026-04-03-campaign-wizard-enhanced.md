# Enhanced Campaign Creation Wizard — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enhance the existing campaign wizard with media uploads, a multi-deliverable builder, AI visual preview step, and a polished review & launch step.

**Architecture:** Extend the existing `useCampaignWizard` hook and `CampaignWizard.tsx` page to consolidate from 6 steps to 4. New reusable components (`MediaUploader`, `DeliverableBuilder`, etc.) compose into new wizard steps. Auto-save-as-draft on Step 2→3 transition provides a `campaign_id` for the Edge Function and media uploads.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, shadcn/ui, react-hook-form + zod, react-dropzone, TanStack Query, Supabase (Postgres + Storage + Edge Functions), Lucide icons.

**Spec:** `docs/superpowers/specs/2026-04-03-campaign-wizard-enhanced-design.md`

---

## Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/20260403000000_campaign_media_deliverables.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- supabase/migrations/20260403000000_campaign_media_deliverables.sql

-- ============================================
-- campaign_media table
-- ============================================
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

-- ============================================
-- campaign_deliverables table
-- ============================================
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

-- ============================================
-- New columns on campaigns
-- ============================================
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS content_source TEXT
  DEFAULT 'creator_shoots'
  CHECK (content_source IN ('creator_shoots', 'business_footage', 'hybrid'));

ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS ai_preview_status TEXT
  DEFAULT 'none'
  CHECK (ai_preview_status IN ('none', 'generating', 'ready', 'approved', 'rejected'));

ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS ai_preview_prompt TEXT;
```

- [ ] **Step 2: Verify the SQL is valid**

Run: `cd supabase && cat migrations/20260403000000_campaign_media_deliverables.sql | head -5`
Expected: File exists and starts with `-- supabase/migrations/...`

Note: This migration is applied via Supabase Dashboard (Migrations tab) or `supabase db push`. Do NOT run it locally — the project uses a remote Supabase instance.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260403000000_campaign_media_deliverables.sql
git commit -m "feat: add campaign_media and campaign_deliverables tables"
```

---

## Task 1.5: Fix Edge Function Column Names (Prerequisite for AI Preview)

**Files:**
- Modify: `supabase/functions/donny-campaign-preview/index.ts`

The existing Edge Function queries `budget` and `niche` columns that do not exist on the `campaigns` table. The actual columns are `budget_min`, `budget_max`, and there is no `niche` column. This must be fixed before the AI Preview step (Task 9) can work.

- [ ] **Step 1: Fix the campaign data select statement**

Find the `.select("id, title, description, budget, niche")` call in the Edge Function and replace it with:
```typescript
.select("id, title, description, budget_min, budget_max, goals, style, tone, platforms, deliverables, content_source, delivery_type")
```

Also update any references to `budget` or `niche` in the system prompt construction to use the correct column names.

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/donny-campaign-preview/index.ts
git commit -m "fix: update donny-campaign-preview to use correct campaign column names"
```

**Note:** This Edge Function change must be deployed to the remote Supabase project for the AI Preview step to work at runtime.

---

## Task 2: TypeScript Types

**Files:**
- Create: `src/types/campaignMedia.ts`

- [ ] **Step 1: Create shared types for campaign media and deliverables**

```typescript
// src/types/campaignMedia.ts

export type ContentSource = 'creator_shoots' | 'business_footage' | 'hybrid';
export type MediaType = 'reference_image' | 'reference_video' | 'ai_preview' | 'raw_footage';
export type ContentType = 'photo' | 'video_reel' | 'story' | 'carousel' | 'tiktok' | 'youtube_short';
export type Platform = 'instagram' | 'tiktok' | 'facebook' | 'youtube' | 'google_business' | 'multi_platform';
export type AspectRatio = '9:16' | '16:9' | '1:1' | '4:5';
export type DeliverableStatus = 'pending' | 'in_progress' | 'submitted' | 'revision_requested' | 'approved';
export type AIPreviewStatus = 'none' | 'generating' | 'ready' | 'approved' | 'rejected';

export interface CampaignMediaItem {
  id: string;
  campaign_id: string;
  uploaded_by: string;
  media_type: MediaType;
  file_url: string;
  file_name: string;
  file_size_bytes?: number;
  mime_type?: string;
  duration_seconds?: number;
  thumbnail_url?: string;
  sort_order: number;
  ai_analysis?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface CampaignDeliverable {
  id: string;
  campaign_id: string;
  content_type: ContentType;
  platform: Platform;
  description?: string;
  aspect_ratio: AspectRatio;
  max_duration_seconds?: number;
  status: DeliverableStatus;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

/** Client-side staged file (before upload to Supabase) */
export interface StagedFile {
  file: File;
  preview: string;  // object URL for thumbnail
  name: string;
  size: number;
  type: string;     // MIME type
  duration?: number; // video duration in seconds
}

/** Client-side deliverable (before saving to DB) */
export interface Deliverable {
  id: string;       // client-side UUID (crypto.randomUUID())
  content_type: ContentType;
  platform: Platform;
  aspect_ratio: AspectRatio;
  max_duration_seconds?: number;
  description?: string;
}

/** MoodBoard data from Edge Function */
export interface MoodBoardData {
  title: string;
  color_palette: string[];
  typography?: { heading: string; body: string };
  layout_description: string;
  reference_descriptions?: string[];
}

/** Storyboard frame from Edge Function */
export interface StoryboardFrame {
  frame_number: number;
  scene_description: string;
  duration_seconds?: number;
  camera_angle?: string;
  text_overlay?: string;
  transition?: string;
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add src/types/campaignMedia.ts
git commit -m "feat: add TypeScript types for campaign media and deliverables"
```

---

## Task 3: ContentSourceSelector Component

**Files:**
- Create: `src/components/campaigns/ContentSourceSelector.tsx`

- [ ] **Step 1: Create the component**

```typescript
// src/components/campaigns/ContentSourceSelector.tsx

import React from 'react';
import { Camera, Film, Layers } from 'lucide-react';
import type { ContentSource } from '@/types/campaignMedia';

interface ContentSourceSelectorProps {
  value: ContentSource;
  onChange: (value: ContentSource) => void;
}

const options: { value: ContentSource; icon: React.ElementType; title: string; subtitle: string }[] = [
  {
    value: 'creator_shoots',
    icon: Camera,
    title: 'Creator shoots new content',
    subtitle: 'A creator will visit your business and create fresh content',
  },
  {
    value: 'business_footage',
    icon: Film,
    title: 'I have footage — creator edits it',
    subtitle: 'Upload your own photos or video and a creator will produce polished content',
  },
  {
    value: 'hybrid',
    icon: Layers,
    title: 'Mix of both',
    subtitle: 'Some new content + some using your footage',
  },
];

const ContentSourceSelector: React.FC<ContentSourceSelectorProps> = ({ value, onChange }) => {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-gray-900">How will content be created?</h3>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {options.map((option) => {
          const Icon = option.icon;
          const isSelected = value === option.value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(option.value)}
              className={`
                flex items-start gap-3 p-4 rounded-xl border-2 text-left transition-all
                ${isSelected
                  ? 'border-dc-teal bg-teal-50'
                  : 'border-gray-200 bg-white hover:border-gray-300'
                }
              `}
            >
              <div className={`
                w-10 h-10 rounded-full flex items-center justify-center shrink-0
                ${isSelected ? 'bg-dc-teal text-white' : 'bg-gray-100 text-gray-500'}
              `}>
                <Icon className="h-5 w-5" />
              </div>
              <div>
                <p className={`text-sm font-semibold ${isSelected ? 'text-gray-900' : 'text-gray-700'}`}>
                  {option.title}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">{option.subtitle}</p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default ContentSourceSelector;
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add src/components/campaigns/ContentSourceSelector.tsx
git commit -m "feat: add ContentSourceSelector component"
```

---

## Task 4: MediaUploader Component

**Files:**
- Create: `src/components/campaigns/MediaUploader.tsx`

This component stages files in memory (no Supabase upload during wizard). Uses `react-dropzone` (already installed).

- [ ] **Step 1: Create the component**

Build a drag-and-drop uploader that:
- Accepts images (jpg, png, webp ≤50MB) and videos (mp4, mov, webm ≤100MB)
- Validates video duration client-side (≤60 seconds) using `<video>` element
- Shows thumbnail grid with file name, size badge, remove button
- Videos get a play icon overlay
- Enforces `maxFiles` limit
- Calls `onFilesChange` with current `StagedFile[]` on every add/remove
- Shows "(Optional)" badge in the section header when appropriate

Key implementation details:
- Use `useDropzone` from `react-dropzone` with `accept` config for MIME types
- Generate preview URLs via `URL.createObjectURL(file)`
- Clean up object URLs on unmount via `URL.revokeObjectURL`
- For video duration: create a `<video>` element, set `src`, listen for `loadedmetadata`, read `video.duration`
- Track total staged bytes across all uploaders (prop `totalStagedBytes` + `maxTotalBytes` = 300MB)

Reference existing patterns in: `src/components/files/FileUploadDropzone.tsx`

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add src/components/campaigns/MediaUploader.tsx
git commit -m "feat: add MediaUploader component with drag-and-drop staging"
```

---

## Task 5: DeliverableBuilder Component

**Files:**
- Create: `src/components/campaigns/DeliverableBuilder.tsx`

- [ ] **Step 1: Create the component**

Build a card-based list editor for deliverables:
- Each deliverable card contains:
  - `Select` for content_type (Photo, Video Reel, Story, Carousel, TikTok, YouTube Short)
  - `Select` for platform (Instagram, TikTok, Facebook, YouTube, Google Business, Multi-Platform)
  - 4 pill buttons for aspect_ratio (9:16, 16:9, 1:1, 4:5)
  - `Input` for max_duration_seconds (only visible when content_type is video-related: `video_reel`, `story`, `tiktok`, `youtube_short`)
  - `Textarea` for description (optional)
  - Trash icon button to remove (disabled when only 1 deliverable)
- "+ Add Deliverable" button at bottom (disabled at 10)
- Header: "Deliverables" + count badge ("3 pieces of content")
- Uses `Card` from shadcn/ui
- Generates IDs with `crypto.randomUUID()`
- Default new deliverable: `{ content_type: 'video_reel', platform: 'instagram', aspect_ratio: '9:16' }`

Use shadcn/ui components: `Card`, `Select`, `Input`, `Textarea`, `Button`
Use Lucide icons: `Plus`, `Trash2`, `Image`, `Video`, `Film`

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add src/components/campaigns/DeliverableBuilder.tsx
git commit -m "feat: add DeliverableBuilder component"
```

---

## Task 6: Display Components (MoodBoard, Storyboard, CostBreakdown, MediaGallery)

**Files:**
- Create: `src/components/campaigns/MoodBoard.tsx`
- Create: `src/components/campaigns/Storyboard.tsx`
- Create: `src/components/campaigns/CostBreakdown.tsx`
- Create: `src/components/campaigns/MediaGallery.tsx`

These are pure display components with no business logic.

- [ ] **Step 1: Create MoodBoard component**

Props: `{ title, colorPalette, typography?, layoutDescription, referenceDescriptions? }`
- Title as heading
- Color swatches as 32px circles in a row
- Typography notes in secondary text
- Layout description as body text
- Reference descriptions as bulleted list

- [ ] **Step 2: Create Storyboard component**

Props: `{ frames, title? }`
- Title defaults to "Storyboard"
- Numbered frame cards: "Frame N: {scene_description}"
- Each frame shows camera angle, duration, text overlay as small badges/text
- Uses `Card` component per frame

- [ ] **Step 3: Create CostBreakdown component**

Props: `{ deliverableCount, budgetTotal, baseCostPerDeliverable, premiumAmount, deliveryType }`
- List layout: "Base cost per deliverable: $X", "DragonDash premium: $X" (if > 0), "Total: $X"
- Footer note: "Donny will match you with creators in your area"
- Uses subtle background card

- [ ] **Step 4: Create MediaGallery component**

Props: `{ media, editable?, showTypeFilter?, onRemove?, onReorder? }`
- Responsive grid: `grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3`
- Each item: thumbnail image/video, file name, type badge (Photo/Video)
- Images: click to open in `Dialog` (lightbox)
- Videos: play icon overlay, click to show inline `<video>` player in `Dialog`
- When `editable`: X button in top-right
- When `showTypeFilter`: `Tabs` component at top filtering by media_type

- [ ] **Step 5: Verify build**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 6: Commit**

```bash
git add src/components/campaigns/MoodBoard.tsx src/components/campaigns/Storyboard.tsx src/components/campaigns/CostBreakdown.tsx src/components/campaigns/MediaGallery.tsx
git commit -m "feat: add MoodBoard, Storyboard, CostBreakdown, and MediaGallery components"
```

---

## Task 7: React Query Hooks

**Files:**
- Create: `src/hooks/useCampaignMedia.ts`
- Create: `src/hooks/useCampaignDeliverables.ts`
- Create: `src/hooks/useUploadCampaignMedia.ts`
- Create: `src/hooks/useDonnyPreview.ts`

- [ ] **Step 1: Create useCampaignMedia hook**

```typescript
// src/hooks/useCampaignMedia.ts
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { CampaignMediaItem } from '@/types/campaignMedia';

export const useCampaignMedia = (campaignId: string | undefined) => {
  return useQuery({
    queryKey: ['campaign_media', campaignId],
    queryFn: async (): Promise<CampaignMediaItem[]> => {
      const { data, error } = await supabase
        .from('campaign_media')
        .select('id, campaign_id, uploaded_by, media_type, file_url, file_name, file_size_bytes, mime_type, duration_seconds, thumbnail_url, sort_order, ai_analysis, created_at, updated_at')
        .eq('campaign_id', campaignId!)
        .order('sort_order');
      if (error) throw error;
      return data as CampaignMediaItem[];
    },
    enabled: !!campaignId,
  });
};
```

Note: The `campaign_media` table won't exist in the auto-generated `types.ts` until the migration is applied and types are regenerated. Use type assertion (`as CampaignMediaItem[]`) for now. The `.from('campaign_media')` call will show a TypeScript error — suppress with `// @ts-ignore` above the `.from()` call until types are regenerated.

- [ ] **Step 2: Create useCampaignDeliverables hook**

Same pattern as above but for `campaign_deliverables` table. Select: `id, campaign_id, content_type, platform, description, aspect_ratio, max_duration_seconds, status, sort_order, created_at, updated_at`. Return type: `CampaignDeliverable[]`.

- [ ] **Step 3: Create useUploadCampaignMedia hook**

```typescript
// src/hooks/useUploadCampaignMedia.ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import type { StagedFile, MediaType } from '@/types/campaignMedia';

interface UploadParams {
  campaignId: string;
  mediaType: MediaType;
  files: StagedFile[];
}

export const useUploadCampaignMedia = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ campaignId, mediaType, files }: UploadParams) => {
      const results = [];

      for (let i = 0; i < files.length; i++) {
        const staged = files[i];
        const filePath = `campaigns/${campaignId}/media/${mediaType}/${Date.now()}_${staged.name}`;

        // Upload to Supabase Storage
        const { error: uploadError } = await supabase.storage
          .from('campaign-assets')
          .upload(filePath, staged.file);

        if (uploadError) throw uploadError;

        // Get public URL
        const { data: urlData } = supabase.storage
          .from('campaign-assets')
          .getPublicUrl(filePath);

        // Create DB record
        // @ts-ignore — campaign_media not in generated types yet
        const { data, error } = await supabase
          .from('campaign_media')
          .insert({
            campaign_id: campaignId,
            uploaded_by: user!.id,
            media_type: mediaType,
            file_url: urlData.publicUrl,
            file_name: staged.name,
            file_size_bytes: staged.size,
            mime_type: staged.type,
            duration_seconds: staged.duration || null,
            sort_order: i,
          })
          .select()
          .single();

        if (error) throw error;
        results.push(data);
      }

      return results;
    },
    onSuccess: (_, { campaignId }) => {
      queryClient.invalidateQueries({ queryKey: ['campaign_media', campaignId] });
    },
    onError: (error: Error) => {
      toast.error(`Upload failed: ${error.message}`);
    },
  });
};
```

- [ ] **Step 4: Create useDonnyPreview hook**

```typescript
// src/hooks/useDonnyPreview.ts
import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { MoodBoardData, StoryboardFrame } from '@/types/campaignMedia';

interface PreviewParams {
  campaignId: string;
  previewTypes: string[];
  styleNotes?: string;
}

interface PreviewResult {
  previews: Array<{
    id: string;
    preview_type: string;
    title: string;
    description: string;
    preview_data: Record<string, unknown>;
    media_url?: string;
  }>;
}

export const useDonnyPreview = () => {
  return useMutation({
    mutationFn: async ({ campaignId, previewTypes, styleNotes }: PreviewParams): Promise<PreviewResult> => {
      const { data, error } = await supabase.functions.invoke('donny-campaign-preview', {
        body: {
          action: 'generate',
          campaign_id: campaignId,
          preview_types: previewTypes,
          style_notes: styleNotes,
        },
      });

      if (error) throw error;
      return data as PreviewResult;
    },
  });
};

/** Extract MoodBoard data from preview results */
export function extractMoodBoard(previews: PreviewResult['previews']): MoodBoardData | null {
  const moodBoard = previews.find((p) => p.preview_type === 'mood_board');
  if (!moodBoard) return null;

  const pd = moodBoard.preview_data as Record<string, unknown>;
  return {
    title: moodBoard.title,
    color_palette: (pd.color_palette as string[]) || [],
    typography: pd.typography as { heading: string; body: string } | undefined,
    layout_description: (pd.layout_description as string) || '',
    reference_descriptions: pd.reference_descriptions as string[] | undefined,
  };
}

/** Extract Storyboard frames from preview results */
export function extractStoryboard(previews: PreviewResult['previews']): StoryboardFrame[] {
  const storyboard = previews.find((p) => p.preview_type === 'storyboard');
  if (!storyboard) return [];

  const pd = storyboard.preview_data as Record<string, unknown>;
  return (pd.frames as StoryboardFrame[]) || [];
}
```

- [ ] **Step 5: Verify build**

Run: `npm run build`
Expected: Build succeeds (with expected ts-ignore warnings for new tables)

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useCampaignMedia.ts src/hooks/useCampaignDeliverables.ts src/hooks/useUploadCampaignMedia.ts src/hooks/useDonnyPreview.ts
git commit -m "feat: add React Query hooks for campaign media, deliverables, and AI preview"
```

---

## Task 8: CampaignBriefStep (Wizard Step 1)

**Files:**
- Create: `src/components/campaigns/CampaignBriefStep.tsx`

This step combines the existing `CampaignGoalStep` functionality with the new `ContentSourceSelector` and `MediaUploader`.

- [ ] **Step 1: Create the component**

Layout (top to bottom):
1. Card with textarea for campaign goal (reuse existing pattern from `CampaignGoalStep.tsx`)
2. "Generate with AI" button (teal, full-width)
3. `ContentSourceSelector` (always visible)
4. "Show creators what you're looking for (Optional)" + `MediaUploader` for reference media (max 5)
5. "Upload your footage for the creator" + `MediaUploader` for raw footage (max 10) — only visible when `contentSource` is `business_footage` or `hybrid`
6. "Next" button at bottom

Props:
```typescript
interface CampaignBriefStepProps {
  campaignGoal: string;
  setCampaignGoal: (value: string) => void;
  contentSource: ContentSource;
  setContentSource: (value: ContentSource) => void;
  referenceMedia: StagedFile[];
  setReferenceMedia: (files: StagedFile[]) => void;
  rawFootage: StagedFile[];
  setRawFootage: (files: StagedFile[]) => void;
  onGenerateWithAI: () => void;
  isGenerating: boolean;
  onNext: () => void;
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add src/components/campaigns/CampaignBriefStep.tsx
git commit -m "feat: add CampaignBriefStep with content source and media uploads"
```

---

## Task 9: CampaignAIPreviewStep (Wizard Step 3)

**Files:**
- Create: `src/components/campaigns/CampaignAIPreviewStep.tsx`

- [ ] **Step 1: Create the component**

This step calls the `donny-campaign-preview` Edge Function and displays the results.

States:
- **Loading:** "Donny is creating a visual preview..." with spinner
- **Ready:** `MoodBoard` + `Storyboard` display
- **Error:** Error message with "Try Again" button

Props:
```typescript
interface CampaignAIPreviewStepProps {
  campaignId: string;
  onApprove: () => void;
  onSkip: () => void;
  onBack: () => void;
}
```

On mount:
1. Call `useDonnyPreview` mutation with `campaignId` and `previewTypes: ['mood_board', 'storyboard']`
2. On success: extract `MoodBoardData` and `StoryboardFrame[]` using helper functions
3. Display `MoodBoard` and `Storyboard` components

Action buttons:
- "Regenerate Preview" (outline) — calls Edge Function with `action: 'regenerate'`
- "Approve & Continue" (teal) — calls `onApprove`
- "Skip Preview" (ghost) — calls `onSkip`
- "Back" (outline) — calls `onBack`

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add src/components/campaigns/CampaignAIPreviewStep.tsx
git commit -m "feat: add CampaignAIPreviewStep with mood board and storyboard display"
```

---

## Task 10: Enhanced useCampaignWizard Hook

**Files:**
- Modify: `src/hooks/useCampaignWizard.ts`

- [ ] **Step 1: Extend the wizard state**

Add new state fields to the hook:
- `contentSource` (ContentSource, default `'creator_shoots'`)
- `referenceMedia` (StagedFile[], default `[]`)
- `rawFootage` (StagedFile[], default `[]`)
- `deliverables` (Deliverable[], default with 1 empty deliverable)
- `draftCampaignId` (string | null, default `null`)

Add new handlers:
- `setContentSource`
- `setReferenceMedia`
- `setRawFootage`
- `setDeliverables`

Change step count from 6 to 4:
- Step 0 → Brief (was Delivery Tier + Campaign Goal)
- Step 1 → Details (was AI Analysis + Customize + Timeline/Budget)
- Step 2 → AI Preview (NEW)
- Step 3 → Review & Launch (was Finalize)

Update `handleGenerateWithAI` to set `currentStep` to 1 (Details) instead of 2.

Add `handleSaveAsDraft`: creates campaign in Supabase with `status: 'draft'`. Specifically:
1. Insert campaign row with: `title`, `description` (from AI analysis or user input), `goals`, `deliverables` (as TEXT[]), `platforms`, `style`, `tone`, `content_source`, `delivery_type`, `delivery_fee`, `ai_preview_status: 'none'`, `status: 'draft'`
2. Insert `campaign_deliverables` rows for each deliverable in the wizard state
3. Upload staged `referenceMedia` and `rawFootage` files via `useUploadCampaignMedia`
4. Set `draftCampaignId` in state
5. On error: show toast error ("Failed to save draft"), stay on current step

Add `handleContinueToPreview`: calls `handleSaveAsDraft` first (if no `draftCampaignId`), then sets step to 2. Show loading state during draft save.

Update `handleBack` to handle the new 4-step navigation.

Preserve all existing data assembly logic for `FinalCampaignData` but add the new fields (`contentSource`, `deliverables` as structured array).

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useCampaignWizard.ts
git commit -m "feat: extend useCampaignWizard with media, deliverables, and 4-step flow"
```

---

## Task 11: Enhanced CampaignWizard Page

**Files:**
- Modify: `src/pages/CampaignWizard.tsx`

- [ ] **Step 1: Update the wizard page to use 4 steps**

Replace the 6-step `steps` array with 4 steps:
```typescript
const steps = [
  { number: 1, title: 'Brief', active: true },
  { number: 2, title: 'Details', active: false },
  { number: 3, title: 'AI Preview', active: false },
  { number: 4, title: 'Review', active: false },
];
```

Replace the step rendering:
- Step 0: `<CampaignBriefStep>` — new component with campaign goal, content source, media uploaders
- Step 1: Details — Create a new `CampaignDetailsStep.tsx` component that composes:
  1. AI-generated fields from `CampaignCustomizeForm` (title, description, target audience, messaging tags) — extract these as controlled inputs rather than importing the full form component (which has its own "Continue" button)
  2. `DeliverableBuilder` component
  3. Budget section from `CampaignTimelineBudgetStep` — extract the budget slider/input and deadline picker as controlled inputs
  4. Timeline toggle (Standard / DragonDash) — extract from `DeliveryTierStep`
  5. Single "Next" button at the bottom
  This is the biggest layout change — all previously separate steps become one scrollable page with sections.
- Step 2: `<CampaignAIPreviewStep>` — new component
- Step 3: Enhanced `<CampaignFinalizeStep>` — with deliverables list, media gallery, cost breakdown

Update the step counter in the header: `{currentStep + 1}/{steps.length}` (now shows /4)

Wire all new props from the extended `useCampaignWizard` hook.

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 3: Manual test**

Navigate to `/dashboard/business/campaigns/create` and verify:
- Step 1 shows campaign goal, content source, and media uploaders
- Selecting "I have footage" shows the raw footage uploader
- Step 2 shows details form with DeliverableBuilder
- Step 3 shows loading state (AI preview — may fail if Edge Function not deployed, that's OK)
- Step 4 shows review with all data

- [ ] **Step 4: Commit**

```bash
git add src/pages/CampaignWizard.tsx
git commit -m "feat: consolidate campaign wizard to 4-step flow with media and AI preview"
```

---

## Task 12: Enhanced CampaignFinalizeStep

**Files:**
- Modify: `src/components/campaigns/CampaignFinalizeStep.tsx`

- [ ] **Step 1: Add deliverables list, media gallery, and cost breakdown**

Extend the component to accept new props:
```typescript
interface CampaignFinalizeStepProps {
  campaignData: {
    // ...existing fields...
    contentSource?: ContentSource;
    structuredDeliverables?: Deliverable[];
  };
  media?: CampaignMediaItem[];
  onBack: () => void;
  onEditStep?: (step: number) => void;
}
```

Add sections above the existing form:
1. **Campaign Summary Card** — title, description, content source badge, delivery badge, deadline
2. **Deliverables List** — numbered list with type icon + platform badge per deliverable
3. **Media Section** — `MediaGallery` with `showTypeFilter` showing reference + AI preview + footage
4. **Cost Breakdown** — `CostBreakdown` component
5. **Edit links** — "Edit" button per section that calls `onEditStep(stepNumber)`

Keep the existing form (title, description editable), publish checkbox, sponsorship toggle, and submit logic intact.

Extend `handleCreateCampaign` to also:
- Insert `campaign_deliverables` records
- Set `content_source` on the campaign
- Upload any remaining staged media via `useUploadCampaignMedia`

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add src/components/campaigns/CampaignFinalizeStep.tsx
git commit -m "feat: enhance CampaignFinalizeStep with deliverables, media, and cost breakdown"
```

---

## Task 13: Final Integration and Build Verification

**Files:**
- No new files — verification task

- [ ] **Step 1: Full build check**

Run: `npm run build`
Expected: Build succeeds with zero errors

- [ ] **Step 2: Verify no existing pages broke**

Check that these routes still render:
- `/dashboard/business/campaigns` — campaigns list
- `/dashboard/business/campaigns/create` — the enhanced wizard
- `/dashboard/creator/campaigns` — creator marketplace

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "feat: campaign creation wizard with media uploads and AI preview

Complete implementation of Enhanced Prompt 8:
- Database migration for campaign_media and campaign_deliverables
- ContentSourceSelector, MediaUploader, DeliverableBuilder components
- MoodBoard, Storyboard, CostBreakdown, MediaGallery display components
- React Query hooks for media, deliverables, and AI preview
- Consolidated 4-step wizard (Brief → Details → AI Preview → Review)
- Auto-save as draft on Step 2→3 for Edge Function integration"
```

---

## Parallelization Guide

Tasks that can run in parallel (no dependencies between them):
- **Group A** (after Task 2): Tasks 3, 4, 5, 6 — all independent UI components
- **Group B** (after Task 2): Task 7 — hooks are independent of components
- **Task 1.5** (Edge Function fix): can run anytime, but must be done before Task 9
- **Tasks 8 and 9** can also be parallelized (no mutual dependencies)
- **Sequential** (after Groups A + B + 8/9): Tasks 10, 11, 12, 13

**NOT Modified:** `AnonymousCampaignWizard.tsx` — out of scope for this phase.

```
Task 1 (migration) → Task 1.5 (Edge Function fix)
         ↓
    Task 2 (types)
         ↓
    ┌────┼────┬─────┐
    ↓    ↓    ↓     ↓
  T3   T4-5   T6    T7
    └────┼────┘     │
    ┌────┴────┐     │
    ↓         ↓     │
  Task 8    Task 9 ←┘
    └────┬────┘
         ↓
    Task 10 (hook refactor)
         ↓
    Task 11 (wizard page + CampaignDetailsStep)
         ↓
    Task 12 (finalize step)
         ↓
    Task 13 (integration + type regen)
```

**Post-implementation:** After migration is applied to the remote Supabase instance, regenerate types:
```bash
npx supabase gen types typescript --project-id zocahiffooqdybdhguqv > src/integrations/supabase/types.ts
```
Then remove all `// @ts-ignore` comments from hooks and commit.
