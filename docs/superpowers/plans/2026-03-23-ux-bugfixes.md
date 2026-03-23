# Post-UX-Update Bugfixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 6 bugs and visual issues identified after the DragonCandy UX frontend theme update.

**Architecture:** All fixes are independent frontend changes except Fix 6 (infrastructure verification). Each task modifies a small set of files with no cross-dependencies between tasks.

**Tech Stack:** React, TypeScript, Tailwind CSS, Supabase Edge Functions

**Spec:** `docs/superpowers/specs/2026-03-23-ux-bugfixes-design.md`

---

### Task 1: Fix Transparent Logo Imports

**Files:**
- Modify: `src/components/MobileTopNav.tsx:4`
- Modify: `src/components/DashboardLayout.tsx:5`
- Modify: `src/components/DesktopGate.tsx:2`
- Modify: `src/components/landing/Header.tsx:4`
- Modify: `src/components/messages/MessageBubbleEnhanced.tsx:3`
- Modify: `src/components/creator-profile/CreatorPortfolioModal.tsx:2`
- Modify: `src/components/creator-profile/CreatorProfileSetupHeader.tsx:3`
- Modify: `src/components/campaigns/CampaignSwipeCard.tsx:6`
- Modify: `src/pages/AuthPage.tsx:10`
- Modify: `src/pages/CreatorCampaignMarketplace.tsx:17`
- Modify: `src/pages/PublicCreatorProfile.tsx:10`
- Modify: `src/pages/PublicBusinessProfile.tsx:11`
- Modify: `scripts/generate-icons.mjs:6`

- [ ] **Step 1: Update all logo imports**

In every file listed above, replace the import path:

```
dragon-candy-logo.png
```

with:

```
Transparent_DragonCandy_logo.png
```

The import variable name stays the same in each file (e.g., `dragonCandyLogo`, `logo`). Only the path string changes.

- [ ] **Step 2: Verify the app compiles**

Run: `npm run dev`
Expected: No broken image icons, logo displays with transparent background in headers and all components.

- [ ] **Step 3: Commit**

```bash
git add src/components/MobileTopNav.tsx src/components/DashboardLayout.tsx src/components/DesktopGate.tsx src/components/landing/Header.tsx src/components/messages/MessageBubbleEnhanced.tsx src/components/creator-profile/CreatorPortfolioModal.tsx src/components/creator-profile/CreatorProfileSetupHeader.tsx src/components/campaigns/CampaignSwipeCard.tsx src/pages/AuthPage.tsx src/pages/CreatorCampaignMarketplace.tsx src/pages/PublicCreatorProfile.tsx src/pages/PublicBusinessProfile.tsx
git commit -m "fix: update all logo imports to use transparent background version"
```

---

### Task 2: Fix Mobile Overflow Issues

**Files:**
- Modify: `src/pages/CreatorEarnings.tsx`
- Modify: `src/pages/CampaignWizard.tsx`
- Modify: `src/pages/CampaignsPage.tsx`
- Potentially modify: other pages found during audit

- [ ] **Step 1: Run the app and audit pages at 375px width**

Run: `npm run dev`

Open Chrome DevTools, set viewport to 375px width. Visit each page and check for horizontal scrollbar or content extending past the viewport. Focus on:
- CreatorEarnings
- CampaignWizard (all steps)
- CampaignsPage
- Then sweep remaining pages

Document which elements overflow and why (fixed widths, missing overflow containment, padding/margin issues, flex children not shrinking).

- [ ] **Step 2: Apply targeted overflow fixes**

For each overflow element found, apply the minimal fix:
- Stat grids with fixed widths → add `overflow-hidden` or `min-w-0` on flex children
- Form sections wider than viewport → add `max-w-full` or `overflow-x-auto`
- Content pushing past edges → ensure `px-4` gutters and `w-full` constraints
- Tables or horizontal layouts → wrap in `overflow-x-auto` container

Common patterns:
```tsx
// Flex children that won't shrink
<div className="min-w-0 flex-1">...</div>

// Wide content that needs scroll
<div className="overflow-x-auto">...</div>

// Inputs/buttons breaking out
<input className="w-full max-w-full" />
```

- [ ] **Step 3: Verify fixes at 375px**

Re-check each fixed page at 375px. No horizontal scrollbar should appear on any page.

- [ ] **Step 4: Commit**

```bash
git add -u
git commit -m "fix: resolve mobile overflow issues on CreatorEarnings, CampaignWizard, CampaignsPage"
```

Update commit message to include all pages that were fixed.

---

### Task 3: Landing Page Dragon Feed

**Files:**
- Modify: `src/pages/LandingPage.tsx`
- Modify: `src/components/landing/PortfolioStrip.tsx`
- Modify: `tailwind.config.ts`
- Delete: `src/components/landing/CreatorPortfolioFeed.tsx`
- Delete: `src/components/landing/CreatorFeedColumn.tsx`

- [ ] **Step 1: Remove old feed from LandingPage**

In `src/pages/LandingPage.tsx`:

Remove the import on line 6:
```tsx
import { CreatorPortfolioFeed } from "@/components/landing/CreatorPortfolioFeed";
```

Remove the usage on line 27:
```tsx
      <CreatorPortfolioFeed />
```

- [ ] **Step 2: Convert PortfolioStrip to infinite marquee**

Replace the contents of `src/components/landing/PortfolioStrip.tsx` with:

```tsx
import React from "react";
import { useCreatorPortfolioFeed } from "@/hooks/useCreatorPortfolioFeed";

const placeholderTiles = [
  { id: "p1", bg: "bg-gray-200" },
  { id: "p2", bg: "bg-gray-300" },
  { id: "p3", bg: "bg-gray-400" },
  { id: "p4", bg: "bg-gray-200" },
  { id: "p5", bg: "bg-gray-300" },
  { id: "p6", bg: "bg-gray-400" },
];

function MarqueeItem({ item }: { item: { id: string; url?: string; type?: string; creatorName?: string; bg?: string } }) {
  if (item.url) {
    return (
      <div className="flex-shrink-0 w-28 h-28 md:w-40 md:h-40 overflow-hidden">
        {item.type === "video" ? (
          <video
            src={item.url}
            className="w-full h-full object-cover"
            muted
            loop
            playsInline
            autoPlay
            preload="metadata"
          />
        ) : (
          <img
            src={item.url}
            alt={`Portfolio work by ${item.creatorName}`}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        )}
      </div>
    );
  }

  return <div className={`flex-shrink-0 w-28 h-28 md:w-40 md:h-40 ${item.bg}`} />;
}

export const PortfolioStrip: React.FC = () => {
  const { portfolioMedia, loading } = useCreatorPortfolioFeed();

  const hasRealContent = !loading && portfolioMedia.length > 0;
  const items = hasRealContent ? portfolioMedia : placeholderTiles;

  // Duplicate items to create seamless loop
  const marqueeItems = [...items, ...items];

  return (
    <div className="w-full overflow-hidden">
      <div className="flex animate-marquee">
        {marqueeItems.map((item, index) => (
          <MarqueeItem key={`${item.id}-${index}`} item={item} />
        ))}
      </div>
    </div>
  );
};
```

- [ ] **Step 3: Add marquee keyframes to Tailwind config**

In `tailwind.config.ts`, add to the `extend.animation` section:

```ts
marquee: "marquee 30s linear infinite",
```

And in `extend.keyframes`:

```ts
marquee: {
  "0%": { transform: "translateX(0)" },
  "100%": { transform: "translateX(-50%)" },
},
```

The `-50%` works because we duplicated the items — when the first set scrolls fully off-screen, the second set is in the exact same position, creating a seamless loop.

- [ ] **Step 4: Delete old feed components**

Delete these files:
- `src/components/landing/CreatorPortfolioFeed.tsx`
- `src/components/landing/CreatorFeedColumn.tsx`

- [ ] **Step 5: Verify**

Run: `npm run dev`
Visit the landing page. The old side columns should be gone. The bottom strip should scroll horizontally in an infinite loop.

- [ ] **Step 6: Commit**

```bash
git add src/pages/LandingPage.tsx src/components/landing/PortfolioStrip.tsx tailwind.config.ts
git rm src/components/landing/CreatorPortfolioFeed.tsx src/components/landing/CreatorFeedColumn.tsx
git commit -m "fix: remove old Dragon Feed side columns, convert bottom strip to infinite marquee"
```

---

### Task 4: Creator Portfolio Scrollability

**Files:**
- Modify: `src/components/creator-profile/CreatorPortfolioModal.tsx`

- [ ] **Step 1: Fix single-item duplicate and scrollability**

In `src/components/creator-profile/CreatorPortfolioModal.tsx`, replace the thumbnail gallery section (lines 92-120) with:

```tsx
      {/* Thumbnail gallery — only show if more than 1 image */}
      {total > 1 && (
        <div className="flex gap-2 px-4 pb-4 flex-shrink-0 overflow-x-auto">
          {images.map((image, index) => (
            <button
              key={index}
              onClick={() => onIndexChange(index)}
              className={`h-20 rounded-lg overflow-hidden relative flex-shrink-0 min-w-[80px] transition-opacity ${
                index === currentIndex
                  ? 'ring-2 ring-teal-400 opacity-100'
                  : 'opacity-60 hover:opacity-80'
              }`}
              aria-label={`View image ${index + 1}${image.artistName ? ` by ${image.artistName}` : ''}`}
              aria-pressed={index === currentIndex}
            >
              <img
                src={image.url}
                alt={image.artistName || `Portfolio image ${index + 1}`}
                className="w-full h-full object-cover"
              />
              {image.artistName && (
                <span className="absolute bottom-1 left-2 text-white text-xs drop-shadow leading-tight">
                  {image.artistName}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
```

Key changes:
- Changed `total > 0` to `total > 1` — hides gallery when only 1 image (no duplicate)
- Removed `flex-1` from thumbnail buttons so they keep their `min-w-[80px]` and scroll horizontally via `overflow-x-auto`

- [ ] **Step 2: Verify**

Run: `npm run dev`
- With 1 portfolio item: only hero image shows, no thumbnail gallery, no duplicate
- With multiple items: thumbnails scroll horizontally, tapping a thumbnail updates the hero

- [ ] **Step 3: Commit**

```bash
git add src/components/creator-profile/CreatorPortfolioModal.tsx
git commit -m "fix: hide duplicate thumbnail for single portfolio item, ensure gallery scrolls"
```

---

### Task 5: Donny Button Dragon Emblem

**Files:**
- Create: `src/assets/dragon-emblem.png`
- Modify: `src/components/donny/DonnyNavButton.tsx`

- [ ] **Step 1: Extract dragon emblem from logo**

First check the image dimensions:

```bash
npx sharp-cli -i src/assets/Transparent_DragonCandy_logo.png -- metadata
```

Then crop just the dragon circle from the bottom portion of the logo:

```bash
npx sharp-cli -i src/assets/Transparent_DragonCandy_logo.png -o src/assets/dragon-emblem.png -- extract --top 100 --left 30 --width 150 --height 150
```

Adjust `--top`, `--left`, `--width`, `--height` based on actual dimensions to capture just the dragon circle. The output should show only the dragon on a transparent background.

If `sharp-cli` doesn't work or the crop isn't right, manually crop using any image editor to extract just the circular dragon emblem.

- [ ] **Step 2: Update DonnyNavButton to use the emblem image**

Replace `src/components/donny/DonnyNavButton.tsx`:

```tsx
import { useDonnyDashboard } from '@/hooks/useDonnyDashboard';
import dragonEmblem from '@/assets/dragon-emblem.png';

interface DonnyNavButtonProps {
  onClick: () => void;
}

export function DonnyNavButton({ onClick }: DonnyNavButtonProps) {
  const { data: suggestion } = useDonnyDashboard();
  const hasNotification = !!suggestion;

  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center -mt-4 relative"
    >
      <div className="w-14 h-14 rounded-full bg-gradient-to-br from-[#4DD9C0] to-[#00E5CC] flex items-center justify-center shadow-lg shadow-teal-400/40 border-[3px] border-white">
        <img src={dragonEmblem} alt="Donny" className="h-8 w-8 object-contain" />
      </div>
      {hasNotification && (
        <span className="absolute top-0 right-0 w-3 h-3 bg-[#EC4899] rounded-full border-2 border-white" />
      )}
      <span className="text-[10px] text-[#4DD9C0] font-bold mt-0.5">Donny</span>
    </button>
  );
}
```

Changes: removed `DonnyAvatar` import (unused after emoji removal), added `dragonEmblem` image import, replaced emoji with `<img>` tag.

- [ ] **Step 3: Verify**

Run: `npm run dev`
The bottom nav center button should show the dragon emblem image (not emoji) inside the teal gradient circle.

- [ ] **Step 4: Commit**

```bash
git add src/assets/dragon-emblem.png src/components/donny/DonnyNavButton.tsx
git commit -m "feat: replace Donny button emoji with dragon emblem from logo"
```

---

### Task 6: Verify Donny Edge Function

**Files:** None (infrastructure verification)

- [ ] **Step 1: Verify deployment and secrets**

In the Supabase Dashboard:
1. Go to **Edge Functions** → confirm `donny-chat` is listed and shows a recent deployment timestamp
2. Go to **Edge Functions → Secrets** → confirm these 4 secrets are set:
   - `OPENAI_API_KEY`
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `SUPABASE_ANON_KEY`
3. Go to **SQL Editor** → run: `SELECT COUNT(*) FROM donny_conversations;` — should return a number (confirms table exists). ✅ Already confirmed — returned 2.

- [ ] **Step 2: Test end-to-end**

Run: `npm run dev`
1. Log in as any user
2. Tap the Donny button in bottom nav
3. Send a message like "Hi Donny"
4. Verify a response streams back without errors

- [ ] **Step 3: If errors persist, check logs**

In Supabase Dashboard → **Edge Functions → donny-chat → Logs**. Look for:
- `401` → auth/secret issue
- `500` → code error (check stack trace)
- `404` → function not deployed
- OpenAI errors → API key invalid or rate limited

Fix any issues found based on the log output.
