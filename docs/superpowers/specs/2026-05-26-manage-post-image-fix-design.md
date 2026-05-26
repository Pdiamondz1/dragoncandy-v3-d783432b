# Manage Post Popup — Image Display Fix

## Context

When clicking a scheduled post on the Social Calendar, the "Manage Post" popup shows the DragonCandy logo fallback instead of the actual content image. This has always been broken since the feature was built.

**Root cause**: `PostManagementPanel.tsx` reads `post.containers[0].media[0].url` from the Outstand API response and renders it directly as an `<img src>`. The Outstand-hosted media URLs are not directly accessible in the browser (likely authentication or CORS restrictions), so the `onError` handler fires and displays the branded gradient placeholder.

**Key insight**: The original media URLs are already stored locally in `donny_scheduled_posts.media_urls` as Supabase Storage URLs, which are publicly accessible. The component already queries this table for plan context but doesn't fetch `media_urls`.

## Design

Modify `src/components/outstand/PostManagementPanel.tsx` — no other files change.

### 1. Extend the plan-context query

The existing query (lines 67–88) matches `donny_scheduled_posts` by scheduled time within a ±1 minute window. Add `media_urls` to the `.select()` clause and return it in the result:

```tsx
.select('plan_group_id, campaign_id, media_urls')
```

Return `mediaUrls: match.media_urls as string[] | null` in the query result object. The `donny_scheduled_posts` table is not in the generated Supabase types, so the explicit cast ensures type safety.

### 2. Compute display URL

After extracting `heroMedia` from the Outstand post data, compute a `displayUrl` that prefers the local Supabase Storage URL:

```tsx
const localMediaUrl = planContext?.mediaUrls?.[0];
const displayUrl = localMediaUrl ?? heroMedia?.url;
```

### 3. Update rendering logic

- Change the render condition from `{heroMedia && ...}` to `{displayUrl && ...}` so images display even when Outstand's container has no media
- Use `displayUrl` as the `src` for both `<img>` and `VideoFrameThumbnail`
- Detect video content via `heroMedia?.contentType` OR URL extension matching
- Keep the existing `onError → heroMediaError → logo fallback` chain
- Reset `heroMediaError` when `planContext?.mediaUrls` changes: the plan-context query loads asynchronously via React Query. If the Outstand URL fails first (setting `heroMediaError = true`) before `planContext` arrives with a valid local URL, the error state would be stuck. Add `planContext?.mediaUrls` to the existing `useEffect` dependency array so the error resets when local URLs become available.

### Fallback chain

1. Local Supabase Storage URL from `donny_scheduled_posts.media_urls`
2. Outstand API media URL from `post.containers[0].media[0].url`
3. Branded gradient placeholder with DragonCandy logo

### Edge cases

- **Posts without `donny_scheduled_posts` records** (e.g., created directly in Outstand UI or via cross-post): fall back to Outstand URL, then logo placeholder. Acceptable since most calendar posts come through Donny scheduling.
- **Video content**: detected via `heroMedia.contentType` (from Outstand metadata) or URL extension matching (`.mp4`, `.mov`, `.webm`, `.m4v`). VideoFrameThumbnail receives `displayUrl`.
- **Time-window matching**: inherited from existing ±1 minute plan-context query. Works reliably for Donny-scheduled posts since scheduling times are precise.

## Files Modified

- `src/components/outstand/PostManagementPanel.tsx` — extend query select, compute displayUrl, update render logic

## Verification

1. Run `npm run build` to verify TypeScript compilation
2. Log in as restaurant account, navigate to Content Calendar
3. Click a scheduled post — verify the actual content image renders in the Manage Post popup
4. Verify video posts still render thumbnails correctly
5. Test both desktop and mobile viewports
6. Check Chrome DevTools console for errors
