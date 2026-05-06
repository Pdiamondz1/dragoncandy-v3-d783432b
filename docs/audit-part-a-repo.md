# Audit Part A -- Repo-Wide Grep Sweep

Generated: 2026-04-10  
Scope: `src/` directory of dragoncandy-v3  
Status: **Catalog only -- no triage, no fixes proposed**

---

## 1. `getPublicUrl` -- Every Call Site

**Zero call sites use the Supabase image transform proxy** (`/storage/v1/render/image/public/...?width=...&quality=75`). Every URL returned from `getPublicUrl` is passed raw to `<img>` or `<video>` tags -- full-resolution originals are served directly to the client.

### 1.1 `src/hooks/useProfileData.ts:36`
```ts
const { data } = supabase.storage.from('profile-assets').getPublicUrl(filePath);
return data.publicUrl;
```
- **Used for:** avatar images (creator `avatar_url`, business `logo_url`)
- **Flag:** Raw URL passed to UI; no resize/quality transform

### 1.2 `src/hooks/useProfileData.ts:68`
```ts
const avatarUrl = getPublicUrl(creatorProfile?.avatar_url);
```
- **Flag:** Calls the helper above; same raw-URL issue

### 1.3 `src/hooks/useProfileData.ts:85`
```ts
const avatarUrl = getPublicUrl(businessProfile?.logo_url);
```
- **Flag:** Same as 1.2

### 1.4 `src/components/creator-browse/CreatorProfileModal.tsx:117`
```ts
const { data: urlData } = supabase.storage
  .from('profile-assets')
  .getPublicUrl(url);
return urlData.publicUrl;
```
- **Used for:** Portfolio image URLs inside the modal grid
- **Flag:** Raw URL; rendered in `<img>` at `:440` and `<video>` at `:429` without transform

### 1.5 `src/components/campaigns/CampaignApplyForm.tsx:86`
```ts
const { data } = supabase.storage
  .from('profile-assets')
  .getPublicUrl(path);
return data.publicUrl;
```
- **Used for:** Portfolio thumbnail grid in the apply form
- **Flag:** Raw URL; rendered in `<img>` at `:242` without transform

### 1.6 `src/lib/storage/uploadProfileAsset.ts:86`
```ts
const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(path);
```
- **Used for:** Returns the public URL after uploading
- **Flag:** Raw URL returned to caller; no transform applied

### 1.7 `src/pages/PublicCreatorProfile.tsx:174`
```ts
const { data } = supabase.storage
  .from('profile-assets')
  .getPublicUrl(path);
return data.publicUrl;
```
- **Used for:** Public profile portfolio grid
- **Flag:** Raw URL; rendered in `<img>` and `<video>` at `:357` without transform

### 1.8 `src/hooks/usePromotionSubmission.ts:74`
```ts
const { data: urlData } = supabase.storage
  .from('promotion-videos')
  .getPublicUrl(fileName);
```
- **Used for:** Promotion video submission URL
- **Flag:** Raw URL; passed to `<video>` tags downstream

### 1.9 `src/hooks/useUploadCampaignMedia.ts:72`
```ts
const { data: urlData } = supabase.storage
  .from('campaign-assets')
  .getPublicUrl(filePath);
```
- **Used for:** Campaign media (images/video reference material)
- **Flag:** Raw URL stored in DB; no transform

### 1.10 `src/hooks/useVideoUrl.ts:25`
```ts
const { data } = supabase.storage
  .from(bucketName)
  .getPublicUrl(filePath);
setResolvedUrl(data.publicUrl);
```
- **Used for:** Resolving promotion video playback URLs
- **Flag:** Raw URL; set directly as `<video src=>`

---

## 2. `<img>` / `<Image>` -- Every Usage Rendering Creator/Campaign/Reel/Content Media

### 2.1 `src/components/brand-browse/BrandCreatorCard.tsx:74`
```tsx
<img
  src={avatarUrl}
  alt={creator.creator_name}
  className="w-12 h-12 rounded-full ring-2 ring-teal-400 object-cover flex-shrink-0"
  loading="lazy"
  onError={() => setAvatarUrl(null)}
/>
```
- **Missing:** explicit width/height attributes
- **Has:** `loading="lazy"`, null-src fallback (onError sets null -> shows initials div)

### 2.2 `src/components/creator-browse/CreatorCard.tsx:144`
```tsx
<img
  src={thumbnailUrl}
  alt={creator.creator_name}
  className="w-full h-full object-cover"
  loading="lazy"
  onError={() => setThumbnailUrl(null)}
/>
```
- **Missing:** explicit width/height attributes
- **Has:** `loading="lazy"`, null-src fallback (onError sets null -> shows initials div)

### 2.3 `src/components/creator-browse/CreatorProfileModal.tsx:437-440`
```tsx
<img
  src={url}
  alt={`Portfolio ${index + 1}`}
  className="w-full h-full object-cover"
  loading="lazy"
  decoding="async"
/>
```
- **Missing:** explicit width/height
- **Has:** `loading="lazy"`, no null-src fallback (if `url` is broken, image tag renders broken)

### 2.4 `src/components/campaigns/CampaignApplyForm.tsx:242`
```tsx
<img src={url} alt={`Portfolio ${i + 1}`} className="w-full h-full object-cover" />
```
- **Missing:** `loading="lazy"`, explicit width/height, null-src fallback

### 2.5 `src/components/campaigns/ActiveCampaignCard.tsx:73`
```tsx
<img src={businessLogo} alt={businessName} className="w-full h-full object-cover" />
```
- **Missing:** `loading="lazy"`, explicit width/height
- **Has:** conditional render (only shown if `businessLogo` is truthy) -- acts as null-guard

### 2.6 `src/components/campaigns/CampaignDetailModal.tsx:108`
```tsx
<img src={businessLogo} alt={businessName} className="w-full h-full object-cover" />
```
- **Missing:** `loading="lazy"`, explicit width/height
- **Has:** conditional render (truthy guard on `businessLogo`)

### 2.7 `src/components/campaigns/CampaignDetailModal.tsx:303`
```tsx
<img src={businessLogo} alt={businessName} className="w-full h-full object-cover" />
```
- **Missing:** `loading="lazy"`, explicit width/height
- **Has:** conditional render (truthy guard)

### 2.8 `src/components/campaigns/CampaignSwipeCard.tsx:273`
```tsx
<img src={businessLogo} alt={businessName} className="w-full h-full object-cover" />
```
- **Missing:** `loading="lazy"`, explicit width/height
- **Has:** conditional render (truthy guard)

### 2.9 `src/components/campaigns/CompletedCampaignCard.tsx:77`
```tsx
<img src={businessLogo} alt={businessName} className="w-full h-full object-cover" />
```
- **Missing:** `loading="lazy"`, explicit width/height
- **Has:** conditional render (truthy guard)

### 2.10 `src/components/campaigns/CreatorApplicationCard.tsx:82`
```tsx
<img src={businessLogo} alt={businessName} className="w-full h-full object-cover" />
```
- **Missing:** `loading="lazy"`, explicit width/height
- **Has:** conditional render (truthy guard)

### 2.11 `src/components/creator-profile/CurrentPortfolioDisplay.tsx:144`
```tsx
<img 
  src={item.url} 
  alt="Portfolio item"
  className="w-full h-full object-cover transition-transform group-hover:scale-105"
  onLoad={() => handleMediaLoad(item.path)}
  onError={() => handleMediaError(item.path)}
/>
```
- **Missing:** `loading="lazy"`, explicit width/height
- **Has:** onError handler (sets `hasError` state -> shows fallback)

### 2.12 `src/components/donny/DonnyRichCard.tsx:19`
```tsx
<img src={card.data.avatar_url} alt={card.data.name} className="w-full h-full object-cover" />
```
- **Missing:** `loading="lazy"`, explicit width/height, null-src fallback
- **Has:** conditional render (truthy guard on `avatar_url`)

### 2.13 `src/components/landing/PortfolioStrip.tsx:27-31`
```tsx
<img
  src={item.url}
  alt={`Portfolio work by ${item.creatorName}`}
  className="w-full h-full object-cover"
  loading="lazy"
/>
```
- **Missing:** explicit width/height, null-src fallback
- **Has:** `loading="lazy"`; outer `if (item.url)` acts as null guard

### 2.14 `src/pages/PublicCreatorProfile.tsx:357` (inside portfolio grid)
```tsx
{/* rendered inside portfolioUrls.map -- see Section 3 */}
```
- **Missing:** `loading="lazy"`, explicit width/height, null-src fallback on `<img>` variant (the `<video>` variant also has no error handling)

### 2.15 `src/components/brand-browse/ShortlistDrawer.tsx:33`
```tsx
<img src={url} alt="" className="w-full h-full object-cover" loading="lazy" onError={() => setFailed(true)} />
```
- **Missing:** explicit width/height
- **Has:** `loading="lazy"`, onError fallback

---

## 3. `.map()` -- Loops Dereferencing Image Fields Over Creators/Campaigns/Reels/Content

### 3.1 `src/pages/BrandCreators.tsx:216`
```tsx
{filteredCreators.map((creator) => (
  <BrandCreatorCard key={creator.id} creator={creator} ... />
))}
```
- **Flag:** `creator.avatar_url` is dereferenced inside `BrandCreatorCard` (`:27-28`) with a `if (!creator.avatar_url) return` guard -- safe for null avatar. But no guard on `creator.creator_name` being null/undefined at `:44` (used for initials, could crash on `.split(' ')`).

### 3.2 `src/components/creator-browse/CreatorBrowseContent.tsx:76`
```tsx
{filteredCreators.map((creator) => (
  <CreatorCard key={creator.id} creator={creator} />
))}
```
- **Flag:** `CreatorCard` at `:49` maps over `creator.portfolio_urls` -- guarded by `if (!creator.portfolio_urls || creator.portfolio_urls.length === 0)`. Safe null guard. But `creator.avatar_url` resolved at `:79` -- guarded. OK.

### 3.3 `src/components/creator-browse/CreatorProfileModal.tsx:111`
```tsx
data.portfolio_urls.map(async (url: string) => {
  ...
  const { data: urlData } = supabase.storage
    .from('profile-assets')
    .getPublicUrl(url);
  return urlData.publicUrl;
})
```
- **Flag:** Guarded by `if (data.portfolio_urls && data.portfolio_urls.length > 0)`. Safe null guard. But individual `url` entries are not null-checked -- a null entry in the array would call `getPublicUrl(null)`.

### 3.4 `src/components/creator-browse/CreatorProfileModal.tsx:417`
```tsx
{portfolioUrls.map((url, index) => {
  const contentType = getContentType(url);
  const isVideo = contentType === 'Reel';
  return (
    <button ...>
      {isVideo ? <video src={url} ... /> : <img src={url} ... />}
    </button>
  );
})}
```
- **Flag:** No null-guard on individual `url` -- if `portfolioUrls` contains a null/undefined entry, `getContentType(url)` may throw and `src={url}` will render `src="undefined"`.

### 3.5 `src/pages/PublicCreatorProfile.tsx:167`
```tsx
profile.portfolio_urls.map(async (path) => {
  ...
  const { data } = supabase.storage
    .from('profile-assets')
    .getPublicUrl(path);
  return data.publicUrl;
})
```
- **Flag:** Guarded by `if (!profile?.portfolio_urls)`. Individual `path` entries not null-checked.

### 3.6 `src/components/campaigns/CampaignApplyForm.tsx:82-88`
```tsx
portfolioItems.map(async (path) => {
  const { data } = supabase.storage
    .from('profile-assets')
    .getPublicUrl(path);
  return data.publicUrl;
})
```
- **Flag:** `path` not null-checked before `getPublicUrl(path)`.

### 3.7 `src/components/creator-browse/CreatorCard.tsx:49`
```tsx
creator.portfolio_urls.map(async (url) => {
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  try {
    const { data } = await supabase.storage
      .from('profile-assets')
      .createSignedUrl(url, 3600);
    return data?.signedUrl ?? null;
  } catch { return null; }
})
```
- **Flag:** `url.startsWith(...)` will throw if `url` is null/undefined. No null-guard on individual array entries.

### 3.8 `src/components/landing/PortfolioStrip.tsx:53`
```tsx
{marqueeItems.map((item, index) => (
  <MarqueeItem key={`${item.id}-${index}`} item={item} />
))}
```
- **Flag:** `MarqueeItem` checks `if (item.url)` before rendering `<img>/<video>`. Safe null guard.

### 3.9 `src/components/creator-profile/CurrentPortfolioDisplay.tsx:133`
```tsx
{portfolioItems.map((item) => (
  <div key={item.path} className="relative aspect-square ...">
    {item.hasError ? (fallback) : item.type === 'image' ? (<img src={item.url} ...>) : (<video src={item.url} ...>)}
  </div>
))}
```
- **Flag:** `item.url` could be undefined. `item.hasError` checked first -- but if `item.url` is undefined and `item.hasError` is false, renders `<img src={undefined}>`.

---

## 4. `supabase.channel()` / `.subscribe()` -- Realtime Subscriptions

### 4.1 `src/hooks/useBusinessDragonFeed.ts:100-119`
```ts
const channel = supabase
  .channel('dragon-feed-updates')
  .on('postgres_changes', { event: 'UPDATE', ... })
  .subscribe();

return () => { supabase.removeChannel(channel); };
```
- **Cleanup:** YES (`removeChannel` in useEffect return)

### 4.2 `src/hooks/useDonny.ts:94-114`
```ts
const channel = supabase
  .channel(`donny-messages-${conversation.id}`)
  .on('postgres_changes', { event: 'INSERT', ... })
  .subscribe();

channelRef.current = channel;
return () => { supabase.removeChannel(channel); };
```
- **Cleanup:** YES (`removeChannel` in useEffect return)

### 4.3 `src/hooks/useNotifications.ts:225-444`
Three channels created in a single useEffect:
```ts
const applicationChannel = supabase.channel('application-updates')...subscribe();  // :246
const sponsorshipChannel = supabase.channel('sponsorship-updates')...subscribe();  // :373
const likesChannel = supabase.channel('content-likes')...subscribe();  // :438

return () => {
  supabase.removeChannel(applicationChannel);  // :441
  supabase.removeChannel(sponsorshipChannel);  // :442
  supabase.removeChannel(likesChannel);         // :443
};
```
- **Cleanup:** YES (all three removed)
- **Flag:** useEffect depends on `[user]`. If `user` object reference changes on token refresh, all three channels are torn down and re-created. This is a potential **subscription churn** issue.

### 4.4 `src/hooks/useMessageQueries.ts:95-107`
```ts
const channel = supabase
  .channel(`messages-${campaignId}-${conversationId}`)
  .on('postgres_changes', { event: 'INSERT', ... })
  .subscribe();

return () => { supabase.removeChannel(channel); };
```
- **Cleanup:** YES

### 4.5 `src/hooks/useProfileData.ts:117-135`
```ts
const subscription = supabase
  .channel(`profile_changes_${user.id}`)
  .on('postgres_changes', { event: '*', ... })
  .subscribe();

return () => { subscription.unsubscribe(); };
```
- **Cleanup:** YES (uses `.unsubscribe()` instead of `removeChannel` -- both valid)
- **Flag:** useEffect depends on `[user, profile]`. If `user` or `profile` object reference changes on token refresh, subscription is torn down and re-created.

### 4.6 `src/hooks/useTypingIndicator.ts:22-54`
```ts
const channelInstance = supabase
  .channel(`typing-${campaignId}`)
  .on('presence', { event: 'sync' }, ...)
  .subscribe((status: string) => { ... });

return () => {
  if (channelInstance) { supabase.removeChannel(channelInstance); }
  setChannel(null);
};
```
- **Cleanup:** YES

### 4.7 `src/hooks/useUserPresence.ts:43-62`
```ts
const channel = supabase
  .channel('user-presence-changes')
  .on('postgres_changes', { event: '*', ... })
  .subscribe();

return () => {
  console.log('Cleaning up presence subscription');
  supabase.removeChannel(channel);
};
```
- **Cleanup:** YES

---

## 5. `onAuthStateChange` -- Refetch Storm Risk

### 5.1 `src/contexts/AuthContext.tsx:187-242`
```ts
const { data: { subscription } } = supabase.auth.onAuthStateChange(
  async (event, session) => {
    setSession(session);
    setUser(session?.user ?? null);
    
    if (session?.user) {
      setTimeout(async () => {
        let profileData = await fetchProfile(session.user.id);
        ...
        setProfile(profileData);
      }, 0);
    } else {
      setProfile(null);
      setLoading(false);
    }
  }
);

return () => { subscription.unsubscribe(); };
```
- **Flag:** `onAuthStateChange` fires on EVERY event including `TOKEN_REFRESHED`. Each fire calls `setSession(session)` and `setUser(session?.user)`, which creates **new object references** for both `session` and `user`. Any downstream `useEffect` or `useQuery` keyed on `user` (e.g., `useNotifications` at `[user]`, `useProfileData` at `[user, profile]`) will re-run on every token refresh (~every 60 minutes), tearing down and re-creating Realtime subscriptions and re-fetching profile data.
- **No filtering** by event type -- `TOKEN_REFRESHED`, `SIGNED_IN`, `SIGNED_OUT`, `USER_UPDATED`, `MFA_CHALLENGE_VERIFIED` all trigger the same code path.
- The `setTimeout(..., 0)` defers `fetchProfile` but doesn't prevent the state updates that trigger downstream cascades.

---

## 6. ErrorBoundary -- Route Coverage & Logging

### 6.1 Global ErrorBoundary: `src/components/ErrorBoundary.tsx`
- **Wraps:** Entire app at `src/App.tsx:86` (`<ErrorBoundary>` around everything)
- **Also wraps:** `DashboardLayout` children at `src/components/DashboardLayout.tsx:257` (`<ErrorBoundary level="page">`)
- **Logging:**
  ```ts
  // :23
  console.error('[ErrorBoundary] Caught error:', error);
  // :28-31
  console.error('[ErrorBoundary] Component error details:', {
    error: error.message,
    stack: error.stack,
    componentStack: errorInfo.componentStack,
  });
  ```
- **Stack trace logged:** YES (both `error.stack` and `errorInfo.componentStack`)
- **onError prop:** Supported, passed through at `:33`

### 6.2 BrowseCreatorsErrorBoundary: `src/pages/BrandCreators.tsx:21-65`
- **Wraps:** `BrandCreators` page only (`:279`)
- **Logging:**
  ```ts
  console.error('[BrandCreators] Caught render error:', error, info);
  ```
- **Stack trace logged:** YES (error object + errorInfo)

### 6.3 PromotionsErrorBoundary: `src/components/promotions/PromotionsErrorBoundary.tsx:16-61`
- **Wraps:** `/promo/:promotionId` (`:106`) and `/dashboard/business/promotions` (`:285`)
- **Logging:**
  ```ts
  console.error('Promotions error boundary caught an error:', error, errorInfo);
  ```
- **Stack trace logged:** YES

### 6.4 ReviewsErrorBoundary: `src/components/reviews/ReviewsErrorBoundary.tsx:16-61`
- **Wraps:** Unknown from App.tsx -- not referenced in routing; likely used inline within review components
- **Logging:**
  ```ts
  console.error('Reviews error boundary caught an error:', error, errorInfo);
  ```
- **Stack trace logged:** YES

### 6.5 CreatorBrowse page: `src/pages/CreatorBrowse.tsx:74`
- **Wraps:** `CreatorBrowseInner` with `<ErrorBoundary level="page">`

### Coverage gaps:
- **No dedicated ErrorBoundary** around: CampaignSwipeCard, PublicCreatorProfile, PublicBusinessProfile, Messaging pages, BusinessActivity, BusinessProjects, DragonFeed pages
- These rely on the global `ErrorBoundary` at App level + DashboardLayout level -- a crash in these pages shows a generic error, not a domain-specific recovery UI

---

## 7. `<video>` -- Tags Sourcing From Supabase Storage

### 7.1 `src/components/creator-profile/PortfolioLightbox.tsx:104`
```tsx
<video key={item.url} src={item.url} controls className="max-h-[70vh] ..." autoPlay muted />
```
- **Source:** Portfolio URL resolved via `getPublicUrl` from `profile-assets` bucket

### 7.2 `src/pages/BusinessActivity.tsx:153`
```tsx
<video src={item.url} className="w-full h-full object-cover" muted loop playsInline preload="metadata" />
```
- **Source:** Portfolio/feed content from `profile-assets`

### 7.3 `src/components/creator-profile/CurrentPortfolioDisplay.tsx:153`
```tsx
<video src={item.url} className="w-full h-full object-cover" muted playsInline preload="metadata" ... />
```
- **Source:** Portfolio URL from `profile-assets` bucket via `getPublicUrl`

### 7.4 `src/components/promotions/VideoUploader.tsx:198`
```tsx
<video src={videoPreview} controls className="w-full h-full object-cover" />
```
- **Source:** Local blob URL (preview, not storage)

### 7.5 `src/components/promotions/VideoUploader.tsx:204`
```tsx
<video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
```
- **Source:** Camera stream via ref

### 7.6 `src/components/landing/PortfolioStrip.tsx:18`
```tsx
<video src={item.url} className="w-full h-full object-cover" muted loop playsInline preload="metadata" />
```
- **Source:** Portfolio URLs resolved in `useCreatorPortfolioFeed` from `profile-assets`

### 7.7 `src/components/promotions/SubmissionCard.tsx:122`
```tsx
<video src={resolvedUrl} controls className="w-full h-full object-cover" preload="metadata" />
```
- **Source:** `useVideoUrl` hook -> `getPublicUrl` from `promotion-videos` bucket

### 7.8 `src/components/landing/PortfolioMediaItem.tsx:40`
```tsx
<video src={url} className={`w-full h-full object-cover ...`} muted loop playsInline preload="metadata" ... />
```
- **Source:** Portfolio URLs from `profile-assets`

### 7.9 `src/pages/PublicCreatorProfile.tsx:357`
```tsx
<video src={url} className="w-full h-full object-cover" muted playsInline preload="metadata" />
```
- **Source:** `getPublicUrl` from `profile-assets` bucket

### 7.10 `src/components/creator-browse/CreatorProfileModal.tsx:429`
```tsx
<video src={url} className="w-full h-full object-cover" muted playsInline preload="metadata" />
```
- **Source:** `getPublicUrl` from `profile-assets` bucket

### 7.11 `src/components/promotions/ApprovedVideosTab.tsx:153`
```tsx
<video src={resolvedUrl} controls className="w-full h-full object-cover" preload="metadata" />
```
- **Source:** `useVideoUrl` hook -> `getPublicUrl` from `promotion-videos` bucket

### 7.12 `src/components/files/FilePreviewContent.tsx:53`
```tsx
<video controls className={`max-w-full max-h-96 rounded-lg ${className}`} src={file_url} />
```
- **Source:** File upload URL (could be any storage bucket)

### 7.13 `src/components/dragon-feed/FeedLightbox.tsx:204`
```tsx
<video ref={videoRef} src={item.url} className="max-h-[80vh] ..." controls autoPlay muted playsInline />
```
- **Source:** Dragon feed content from `profile-assets`

### 7.14 `src/components/projects/ProtectedFilePreview.tsx:154`
```tsx
<video src={previewUrl} controls className="max-w-full max-h-[70vh]" />
```
- **Source:** Signed URL from protected file bucket

### 7.15 `src/components/dragon-feed/DragonFeedCard.tsx:186`
```tsx
<video ref={videoRef} src={media.url} className="w-full h-full object-cover" muted loop playsInline preload="metadata" />
```
- **Source:** Dragon feed content URLs

### 7.16 `src/components/dragon-feed/BusinessDashboardSideFeed.tsx:336`
```tsx
<video ref={videoRef} src={item.url} className="w-full h-full object-cover" muted loop playsInline preload="metadata" />
```
- **Source:** Dragon feed content URLs

### 7.17 `src/components/campaigns/MediaGallery.tsx:119`
```tsx
<video src={item.file_url} controls autoPlay muted className="max-w-full max-h-[60vh] rounded-lg mx-auto" />
```
- **Source:** Campaign media from `campaign-assets` bucket

### 7.18 `src/components/campaigns/MediaUploader.tsx:246`
```tsx
<video src={staged.preview} className="w-full h-full object-cover" muted playsInline preload="metadata" />
```
- **Source:** Local blob URL (staged upload preview)

---

*End of audit. Awaiting acknowledgment before proceeding to triage or fixes.*
