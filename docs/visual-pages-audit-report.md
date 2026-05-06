# Visual Pages Audit Report — P0/P1/P2 Triage

Generated: 2026-04-10  
Sources: `audit-part-a-repo.md`, `audit-part-b-browser.md`, `audit-part-c-supabase.md`

---

## P0 — Directly Causes Crash/Reset

Ordered by highest leverage first.

---

### P0-1: CreatorCard eagerly resolves signed URLs for ALL creators' portfolios on page load

**File:** `src/components/creator-browse/CreatorCard.tsx:41-67`  
**Viewport:** Both (mobile crash, desktop bandwidth waste)

**Current code:**
```tsx
useEffect(() => {
  const loadPortfolioImages = async () => {
    if (!creator.portfolio_urls || creator.portfolio_urls.length === 0) {
      setResolvedPortfolioUrls([]);
      return;
    }
    const resolved = await Promise.all(
      creator.portfolio_urls.map(async (url) => {
        if (url.startsWith('http://') || url.startsWith('https://')) return url;
        try {
          const { data } = await supabase.storage
            .from('profile-assets')
            .createSignedUrl(url, 3600);
          return data?.signedUrl ?? null;
        } catch { return null; }
      })
    );
    const valid = resolved.filter((u): u is string => u !== null);
    setResolvedPortfolioUrls(valid);
  };
  loadPortfolioImages();
}, [creator.portfolio_urls]);
```

**Problem:** Every `CreatorCard` resolves signed URLs for the creator's **entire** portfolio on mount — not just the thumbnail. With 4 creators this fires 30+ signed URL requests. With 50 creators this would fire 500+. The browser then eagerly downloads every file (including .mov and .mp4) at full resolution. On mobile, this triggers OOM tab crashes.

**Proposed fix:** Resolve only `portfolio_urls[0]` for the card thumbnail; defer full portfolio resolution to `CreatorProfileModal` when the modal actually opens.

**Blast radius:** 1 file (`CreatorCard.tsx`). `CreatorProfileModal.tsx` already independently resolves portfolio URLs on modal open — no downstream breakage.

---

### P0-2: Portfolio images served at full DSLR resolution as 269px thumbnails (no Supabase image transform)

**File:** `src/components/creator-browse/CreatorProfileModal.tsx:115-118`  
**Viewport:** Both (mobile crash from ~880 MB decoded memory, desktop ~880 MB GPU waste)

**Current code:**
```tsx
const { data: urlData } = supabase.storage
  .from('profile-assets')
  .getPublicUrl(url);
return urlData.publicUrl;
```

**Problem:** Portfolio images (up to 6192x4128 DSLR photos) are served raw. Charlie Smith's 10 photos decode to ~220 megapixels = ~880 MB of decoded pixel memory just for 269x269 thumbnails. Mobile devices with 2-4 GB RAM will OOM.

**Proposed fix:** Replace `getPublicUrl(url)` with Supabase image transform URL: `/storage/v1/render/image/public/profile-assets/${url}?width=540&quality=75` (2x for 269px display), falling back to raw URL for video files.

**Blast radius:** 1 file (`CreatorProfileModal.tsx`). Same pattern should also be applied in `CreatorCard.tsx`, `PublicCreatorProfile.tsx`, `CampaignApplyForm.tsx`, and `useProfileData.ts` (covered in P1), but the modal is the crash site.

---

### P0-3: All portfolio videos load simultaneously with no lazy loading or poster thumbnails

**File:** `src/components/creator-browse/CreatorProfileModal.tsx:429-435`  
**Viewport:** Both (mobile crash, desktop bandwidth waste)

**Current code:**
```tsx
<video
  src={url}
  className="w-full h-full object-cover"
  muted
  playsInline
  preload="metadata"
/>
```

**Problem:** Dominick Commesso's modal loads **13 `<video>` elements simultaneously**, all with `preload="metadata"`. The browser downloads and buffers all 13 video files to extract the first frame. With no poster images and no `preload="none"`, this is a combinatorial download/decode bomb on mobile.

**Proposed fix:** Change to `preload="none"`, generate a poster thumbnail URL via Supabase image transform (for image items) or use a static video placeholder, and only load the video `src` when the user clicks to play or when the element enters the viewport.

**Blast radius:** 1 file (`CreatorProfileModal.tsx`). The `<video>` tag at line 429 is the only one rendered in the portfolio grid. The lightbox at `PortfolioLightbox.tsx:104` uses `autoPlay` intentionally and is fine (single video at a time).

---

### P0-4: Null entries in `portfolio_urls` array crash `.startsWith()` in CreatorCard

**File:** `src/components/creator-browse/CreatorCard.tsx:50`  
**Viewport:** Both

**Current code:**
```tsx
creator.portfolio_urls.map(async (url) => {
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
```

**Problem:** If `portfolio_urls` contains a `null` or `undefined` entry (stale DB data, partial upload), `url.startsWith(...)` throws `TypeError: Cannot read properties of null (reading 'startsWith')`. This is an unguarded `.map()` over user-controlled data. The error bubbles up and crashes the component tree (caught only by the global ErrorBoundary).

**Proposed fix:** Add a null-guard: `if (!url) return null;` as the first line inside the `.map()` callback.

**Blast radius:** 1 file (`CreatorCard.tsx`). Same pattern exists in `CreatorProfileModal.tsx:111` and `PublicCreatorProfile.tsx:167` (covered in P1) but those have a slightly different code path.

---

## P1 — Performance Degradation That Could Trigger Crash Under Load

---

### P1-1: `onAuthStateChange` does not filter TOKEN_REFRESHED — causes subscription churn every ~60 min

**File:** `src/contexts/AuthContext.tsx:187-236`  
**Viewport:** Both

**Problem:** Every `TOKEN_REFRESHED` event calls `setUser(session?.user)` creating a new object reference. This re-triggers every `useEffect` keyed on `[user]`:
- `useNotifications.ts:36` and `:445` — tears down and recreates 3 Realtime channels
- `useProfileData.ts:136` — tears down and recreates profile subscription + refetches

With 3 channels × every 60 min, this is a slow bleed that compounds with multiple tabs open. Under heavy use (many tabs, frequent navigations), the subscription churn can stack up and degrade performance.

**Proposed fix:** Filter the event: only run `setUser`/`setSession`/`fetchProfile` for `SIGNED_IN`, `SIGNED_OUT`, `USER_UPDATED`, and `PASSWORD_RECOVERY` — skip `TOKEN_REFRESHED` and `MFA_CHALLENGE_VERIFIED`.

**Blast radius:** 1 file (`AuthContext.tsx`). All downstream hooks benefit automatically.

---

### P1-2: Business logo (1024x1024) served at 36x36 on every authenticated page — 809x oversized

**File:** `src/hooks/useProfileData.ts:36`  
**Viewport:** Both

**Problem:** `getPublicUrl(businessProfile.logo_url)` returns the raw 1024x1024 logo. Displayed at 36x36 in the sidebar on every page. Decodes to ~4 MB of pixel memory per page. Not a crash alone, but adds to the memory budget on mobile.

**Proposed fix:** Use Supabase image transform with `?width=72&quality=75` (2x for 36px display).

**Blast radius:** 1 file (`useProfileData.ts`). Affects all pages with the sidebar logo.

---

### P1-3: Null-guard missing in `CreatorProfileModal` portfolio URL map and render loop

**File:** `src/components/creator-browse/CreatorProfileModal.tsx:111` and `:417`  
**Viewport:** Both

**Problem:** Individual `url` entries are not null-checked before `getPublicUrl(url)` at `:111` or `getContentType(url)` at `:418`. A null entry would cause a runtime error, crashing the modal.

**Proposed fix:** Add `if (!url) return null;` in the `.map()` at `:111` and `.filter(Boolean)` on the result; add `if (!url) return null;` in the render `.map()` at `:417`.

**Blast radius:** 1 file (`CreatorProfileModal.tsx`).

---

### P1-4: `PublicCreatorProfile` portfolio URL resolution — same oversized + null-unsafe pattern

**File:** `src/pages/PublicCreatorProfile.tsx:167-174`  
**Viewport:** Both

**Problem:** Same raw `getPublicUrl` (no transform) and no null-guard on individual `path` entries. Public profile is externally linked — a creator sharing their profile could crash a visitor's mobile browser.

**Proposed fix:** Apply image transform for images, null-guard individual paths.

**Blast radius:** 1 file (`PublicCreatorProfile.tsx`).

---

### P1-5: Landing page PortfolioStrip duplicates oversized images 2x for marquee

**File:** `src/components/landing/PortfolioStrip.tsx:53`  
**Viewport:** Both (especially mobile first-visit)

**Problem:** Marquee duplicates the item array 2x for seamless scroll. Each portfolio image is 1170x2532 displayed at 160x160 (116x oversized). 4 unique images × 2 = 8 full-resolution downloads. This is the public landing page — first impression for every visitor.

**Proposed fix:** Use Supabase image transform with `?width=320&quality=75`.

**Blast radius:** 1 file (`PortfolioStrip.tsx`).

---

### P1-6: `CampaignApplyForm` portfolio grid — raw URLs, no lazy loading, no null-guard

**File:** `src/components/campaigns/CampaignApplyForm.tsx:82-88` and `:242`  
**Viewport:** Both

**Problem:** Portfolio thumbnails in the apply form use raw `getPublicUrl` (no transform), the `<img>` at `:242` has no `loading="lazy"`, and `path` is not null-checked.

**Proposed fix:** Add image transform, `loading="lazy"`, and null-guard.

**Blast radius:** 1 file (`CampaignApplyForm.tsx`).

---

## P2 — Hygiene Only

---

### P2-1: 100% of `<img>` tags missing explicit `width`/`height` attributes

**Files:** All files in Audit A Section 2 (15 `<img>` call sites)  
**Impact:** CLS (Cumulative Layout Shift) — visual jank, not a crash. All images use Tailwind sizing (`w-full h-full`, `w-12 h-12`) so layout is constrained, but the browser can't reserve space before load.

---

### P2-2: 23 foreign keys without indexes

**Source:** Audit C Section 2  
**Impact:** Slow JOINs and cascading deletes on secondary tables (`file_comments`, `donny_oauth_*`, `payment_events`, etc.). Not relevant to the crash — these tables aren't queried on Browse Creators or portfolio pages.

---

### P2-3: 5 empty/unused storage buckets

**Source:** Audit C Section 1  
**Impact:** Clutter. `avatars`, `creator-portfolios`, `campaign-assets`, `campaign-media`, `file-uploads` are all empty. Code references `profile-assets` instead.

---

### P2-4: `profile-assets` bucket has no file size limit or MIME restriction

**Source:** Audit C Section 1  
**Impact:** Creators can upload arbitrarily large files. The 6192x4128 DSLR originals and .mov files are a symptom. A file size limit (e.g., 10 MB for images, 50 MB for video) would prevent future oversized uploads.

---

### P2-5: 3 tables with RLS enabled but zero policies

**Source:** Audit C Section 7  
**Tables:** `donny_oauth_clients`, `donny_oauth_codes`, `stripe_webhook_events`  
**Impact:** All API queries to these tables silently return empty. Not crash-related — these are backend/admin tables.

---

### P2-6: ErrorBoundary coverage gaps on secondary pages

**Source:** Audit A Section 6  
**Impact:** CampaignSwipeCard, PublicCreatorProfile, Messaging, DragonFeed lack dedicated error boundaries. A crash in these pages shows a generic recovery UI instead of a domain-specific one.

---

### P2-7: Landing page analytics console error

**Source:** Audit B, Landing Page  
**Impact:** `"Failed to flush analytics batch: [object Object]"` repeated 2x on scroll. Analytics data loss only — no user-facing impact.

---

## Summary Matrix

| ID | Severity | Description | Files | Viewport |
|----|----------|-------------|-------|----------|
| **P0-1** | **P0** | CreatorCard eagerly resolves ALL portfolios on page load | 1 | Both |
| **P0-2** | **P0** | Portfolio images at full DSLR res as 269px thumbnails | 1 | Both |
| **P0-3** | **P0** | 13 videos load simultaneously, no lazy/poster | 1 | Both |
| **P0-4** | **P0** | Null in portfolio_urls crashes `.startsWith()` | 1 | Both |
| P1-1 | P1 | TOKEN_REFRESHED causes subscription churn | 1 | Both |
| P1-2 | P1 | Business logo 1024→36px on every page | 1 | Both |
| P1-3 | P1 | Null-guard missing in modal URL map + render | 1 | Both |
| P1-4 | P1 | PublicCreatorProfile same oversized + null pattern | 1 | Both |
| P1-5 | P1 | Landing marquee duplicates oversized images | 1 | Both |
| P1-6 | P1 | CampaignApplyForm raw URLs, no lazy, no null-guard | 1 | Both |
| P2-1 | P2 | All img tags missing width/height | 15 | Both |
| P2-2 | P2 | 23 FK columns without indexes | DB | N/A |
| P2-3 | P2 | 5 empty storage buckets | Supabase | N/A |
| P2-4 | P2 | profile-assets no file size limit | Supabase | N/A |
| P2-5 | P2 | 3 tables RLS enabled, zero policies | DB | N/A |
| P2-6 | P2 | ErrorBoundary coverage gaps | 5+ | Both |
| P2-7 | P2 | Landing analytics console error | 1 | Both |

---

**Awaiting explicit approval of each P0 by name before any code changes.**
