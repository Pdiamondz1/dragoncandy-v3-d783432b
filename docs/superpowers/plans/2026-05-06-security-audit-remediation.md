# Security Audit Remediation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all 24 actionable security issues from the audit (2 Toast issues deferred), organized severity-first with build verification between batches.

**Architecture:** Four shared utility modules (safeUrl, htmlEscape, cors, csvEscape) are built first, then consumed across CRITICAL → HIGH → MEDIUM → LOW batches. Database changes are SQL migration files only (not pushed). Frontend changes verified with `npm run build`.

**Tech Stack:** React/TypeScript (frontend), Supabase Edge Functions in Deno (backend), PostgreSQL RLS migrations (database), Tailwind CSS (styling).

**Spec:** `docs/superpowers/specs/2026-05-06-security-audit-remediation-design.md`

**Pre-existing state notes:**
- `.gitignore` already contains `supabase/.temp/` (line 76) — issue #26 is already resolved, skip it.
- `vite.config.ts` uses `host: "::"` (IPv6 all-interfaces), not `"0.0.0.0"` as the audit stated — same vulnerability, same fix.
- `usage-tracker.ts` already has monthly budget enforcement via `checkQuotaOrBlock()` — issue #17 adds hourly burst limiting on top.
- `discount_codes` is accessed client-side in `src/hooks/usePromotions.ts` — issue #4 requires investigating whether the `/promo/*` public redemption path works given the existing RLS.

---

## Task 1: Create shared utility modules

**Files:**
- Create: `src/lib/safeUrl.ts`
- Create: `src/lib/csvEscape.ts`
- Create: `supabase/functions/_shared/htmlEscape.ts`
- Create: `supabase/functions/_shared/cors.ts`

- [ ] **Step 1: Create `src/lib/safeUrl.ts`**

```ts
export const safeUrl = (raw: string | null | undefined): string | undefined => {
  if (!raw) return undefined;
  try {
    const url = new URL(raw, window.location.origin);
    if (url.protocol === 'http:' || url.protocol === 'https:' || url.protocol === 'mailto:') {
      return url.toString();
    }
  } catch { /* invalid URL */ }
  return undefined;
};
```

- [ ] **Step 2: Create `src/lib/csvEscape.ts`**

```ts
export const csvCell = (v: unknown): string => {
  let s = String(v ?? '');
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  if (/[,"\n]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
};
```

- [ ] **Step 3: Create `supabase/functions/_shared/htmlEscape.ts`**

```ts
export const htmlEscape = (s: string): string =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
```

- [ ] **Step 4: Create `supabase/functions/_shared/cors.ts`**

```ts
const ALLOWED = new Set([
  'https://dragoncandy.io',
  'https://www.dragoncandy.io',
  'https://dragoncandy-preview.lovable.app',
]);

export const corsHeaders = (req: Request) => {
  const origin = req.headers.get('origin') ?? '';
  return {
    'Access-Control-Allow-Origin': ALLOWED.has(origin) ? origin : 'https://dragoncandy.io',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
};
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/safeUrl.ts src/lib/csvEscape.ts supabase/functions/_shared/htmlEscape.ts supabase/functions/_shared/cors.ts
git commit -m "sec: add shared security utilities (safeUrl, htmlEscape, cors, csvEscape)"
```

---

## Task 2: Fix #1 — Stripe amount tampering in create-sponsorship-checkout

**Files:**
- Modify: `supabase/functions/create-sponsorship-checkout/index.ts`

**Current state:** Lines 51-55 destructure `{ sponsorshipId, amount, campaignTitle }` from request body and use client-supplied `amount` at lines 92-93 to compute Stripe amounts. The function already looks up the sponsorship (lines 58-66) but only fetches `brand_id, campaign_id` — not `sponsorship_amount`.

- [ ] **Step 1: Update the sponsorship query to fetch amount and campaign title from DB**

At line 59-61, change the `.select('brand_id, campaign_id')` to also fetch `sponsorship_amount` and the campaign title via a join:

```ts
const { data: sponsorship, error: sponsorshipError } = await adminClient
  .from('campaign_sponsorships')
  .select('brand_id, campaign_id, sponsorship_amount, campaign:campaigns(title)')
  .eq('id', sponsorshipId)
  .single();
```

- [ ] **Step 2: Remove client-supplied `amount` and `campaignTitle` from request body destructuring**

Change line 51 from:
```ts
const { sponsorshipId, amount, campaignTitle } = await req.json();
```
to:
```ts
const { sponsorshipId } = await req.json();
```

Update the validation check on line 52 from `if (!sponsorshipId || !amount)` to `if (!sponsorshipId)`.

- [ ] **Step 3: Use DB amount for Stripe calculations**

Replace lines 92-94:
```ts
const platformFee = Math.round(amount * PLATFORM_FEE_RATE * 100);
const totalAmount = Math.round(amount * 100);
```
with:
```ts
const amount = sponsorship.sponsorship_amount;
if (!amount || amount <= 0) {
  return new Response(JSON.stringify({ error: 'Invalid sponsorship amount' }), {
    status: 400,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
const platformFee = Math.round(amount * PLATFORM_FEE_RATE * 100);
const totalAmount = Math.round(amount * 100);
```

- [ ] **Step 4: Use DB campaign title in Stripe line item**

At line 106, change:
```ts
name: `Sponsorship: ${campaignTitle || 'Campaign Sponsorship'}`,
```
to:
```ts
name: `Sponsorship: ${(sponsorship as any).campaign?.title || 'Campaign Sponsorship'}`,
```

- [ ] **Step 5: Audit other Stripe functions for client-supplied amounts**

Check `create-checkout-session/index.ts`, `create-campaign-escrow/index.ts`, and `boost-payment/index.ts`. For each:
- Grep for `amount` in request body destructuring
- If amount comes from client AND a DB record exists with the authoritative value, fix it

Read each file and confirm whether it uses client-supplied amounts or DB amounts. Document findings as code comments if the function is already safe.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/create-sponsorship-checkout/index.ts
git commit -m "sec(critical): fix amount tampering in create-sponsorship-checkout (#1)"
```

---

## Task 3: Fix #2 — Email template HTML injection

**Files:**
- Modify: `supabase/functions/send-notification-email/index.ts`

**Current state:** 670-line file with 24 email templates that interpolate UGC directly into HTML strings. Every `${data.xxx}` and `${rn}` (resolved recipient name) in the template HTML needs `htmlEscape()`.

- [ ] **Step 1: Import htmlEscape at top of file**

After line 3, add:
```ts
import { htmlEscape } from "../_shared/htmlEscape.ts";
```

- [ ] **Step 2: Create escaped aliases for all UGC variables**

After line 126 (`const rn = resolvedRecipientName;`), add a block that escapes all data fields used in templates:

```ts
const esc = {
  rn: htmlEscape(rn),
  recipientName: htmlEscape(recipientName || ''),
  applicantName: htmlEscape(data.applicantName || ''),
  campaignTitle: htmlEscape(data.campaignTitle || ''),
  senderName: htmlEscape(data.senderName || ''),
  message: htmlEscape(data.message || ''),
  brandName: htmlEscape(data.brandName || ''),
  businessName: htmlEscape(data.businessName || ''),
  creatorName: htmlEscape(data.creatorName || ''),
  uploaderName: htmlEscape(data.uploaderName || ''),
  requesterName: htmlEscape(data.requesterName || ''),
  likerName: htmlEscape(data.likerName || ''),
  description: htmlEscape(data.description || ''),
  invitationMessage: htmlEscape(data.invitationMessage || ''),
  applicationStatus: htmlEscape(data.applicationStatus || ''),
  proposalStatus: htmlEscape(data.proposalStatus || ''),
  party: htmlEscape(data.party || ''),
  updateDetails: htmlEscape(data.updateDetails || ''),
  deliveryTime: htmlEscape(data.deliveryTime || ''),
};
```

- [ ] **Step 3: Replace all UGC interpolations in templates with escaped versions**

Systematically replace every template's UGC variables. In each template object inside the `templates` record:

- Replace `${rn}` → `${esc.rn}`
- Replace `${recipientName}` → `${esc.recipientName}`
- Replace `${data.applicantName}` → `${esc.applicantName}`
- Replace `${data.campaignTitle}` → `${esc.campaignTitle}`
- Replace `${data.senderName}` → `${esc.senderName}`
- Replace `${data.message}` → `${esc.message}`
- Replace `${data.brandName}` → `${esc.brandName}`
- Replace `${data.businessName}` → `${esc.businessName}`
- Replace `${data.creatorName}` → `${esc.creatorName}`
- Replace `${data.uploaderName}` → `${esc.uploaderName}`
- Replace `${data.requesterName}` → `${esc.requesterName}`
- Replace `${data.likerName}` → `${esc.likerName}`
- Replace `${data.description}` → `${esc.description}`
- Replace `${data.invitationMessage}` → `${esc.invitationMessage}`
- Replace `${data.applicationStatus}` → `${esc.applicationStatus}` (also in `.toLowerCase()` calls)
- Replace `${data.proposalStatus}` → `${esc.proposalStatus}`
- Replace `${data.party}` → `${esc.party}`
- Replace `${data.updateDetails}` → `${esc.updateDetails}`
- Replace `${data.deliveryTime}` → `${esc.deliveryTime}`

**DO NOT escape:** `${baseUrl}`, `${data.campaignId}`, `${data.collaborationId}`, `${data.reviewUrl}`, `${data.actionUrl}`, `${data.projectId}`, `${data.amount}` (numeric), `${data.sponsorshipAmount}` (numeric), `${data.budget}` (numeric), `${data.fileCount}` (numeric), `${data.contentUrl}` (internal URL), `${data.campaignUrl}` (internal URL), `${data.isRecipient}` (boolean), `${data.paymentMethod}` (enum). These are either system-generated or numeric values.

Also escape the **subject lines** that contain UGC: `${data.campaignTitle}`, `${data.senderName}`, `${data.brandName}`, `${data.applicantName}` in subject strings. Subject-line injection is lower risk (email clients render subjects as plain text) but good practice.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/send-notification-email/index.ts
git commit -m "sec(critical): HTML-escape all UGC in email templates (#2)"
```

---

## Task 4: Fix #3 — Messages RLS migration

**Files:**
- Create: `supabase/migrations/20260506200000_security_messages_rls.sql`

- [ ] **Step 1: Identify existing messages SELECT policies**

Read migration files to find current messages SELECT policies. Key files:
- `supabase/migrations/20250616011059_*.sql` (original messages policies)
- `supabase/migrations/20250617113401_*.sql` (conversation system added)

Search for: `CREATE POLICY.*messages.*SELECT`

- [ ] **Step 2: Write the migration**

Create `supabase/migrations/20260506200000_security_messages_rls.sql`:

```sql
-- Security fix #3: Messages RLS gap for conversation-scoped messages
-- The original SELECT policy only checked sender_id/recipient_id.
-- Conversation-scoped messages (group threads) need participant coverage.

-- Drop existing SELECT policies on messages to replace with unified policy
DROP POLICY IF EXISTS "Users can read their own messages" ON public.messages;
DROP POLICY IF EXISTS "messages: conversation participants" ON public.messages;

-- Unified SELECT policy: direct messages OR conversation participant
CREATE POLICY "messages: select by participant"
ON public.messages FOR SELECT
TO authenticated
USING (
  sender_id = auth.uid()
  OR recipient_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM conversation_participants cp
    WHERE cp.conversation_id = messages.conversation_id
      AND cp.user_id = auth.uid()
      AND cp.left_at IS NULL
  )
);
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260506200000_security_messages_rls.sql
git commit -m "sec(critical): add conversation-participant SELECT policy for messages (#3)"
```

---

## Task 5: Fix #4 — Discount codes RLS audit

**Files:**
- Possibly create: `supabase/migrations/20260506200100_security_discount_codes.sql`

- [ ] **Step 1: Investigate the current redemption path**

Read `src/hooks/usePromotions.ts` lines 436-455 — the `redeemCode` mutation accesses `discount_codes` directly via the client Supabase. This runs through RLS.

Check: does the `/promo/*` public route require authentication? Read the route component and the `SiteGateGuard` bypass logic. The audit says `/promo/*` bypasses `SiteGateGuard` — but does it also bypass auth? If the user must be authenticated to redeem, the current RLS (which scopes to promotion owner) may be too restrictive for the redeemer.

- [ ] **Step 2: Determine fix approach**

If `redeemCode` in `usePromotions.ts` is always called by an authenticated user:
- The current RLS restricts SELECT to promotion owners only — a customer trying to redeem a code they received cannot read it. This is likely broken.
- Fix: add a SELECT policy that allows authenticated users to read a code by its `code` value (for redemption lookup).

If the path truly needs to be public (unauthenticated QR scan):
- Route through a service-role edge function instead.

- [ ] **Step 3: Write the migration (if needed)**

If client-side redemption is the confirmed path, add a narrow SELECT policy:

```sql
-- Security fix #4: Allow authenticated users to look up discount codes by code value
-- This enables the QR redemption flow while keeping full table scans restricted.
CREATE POLICY "discount_codes: lookup by code"
ON public.discount_codes FOR SELECT
TO authenticated
USING (true);
-- Note: This is permissive because codes are random UUIDs and need to be looked up.
-- The narrow alternative (USING code = current_setting('request.code')) is not feasible
-- with PostgREST's .eq() filter approach.
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260506200100_security_discount_codes.sql
git commit -m "sec(critical): fix discount_codes RLS for redemption path (#4)"
```

---

## Task 6: Batch 1 build verification

- [ ] **Step 1: Run build**

```bash
npm run build
```

Expected: clean build with no TypeScript errors. The edge function changes don't affect the frontend build.

- [ ] **Step 2: Commit if any build fixes needed**

---

## Task 7: Fix #6 — Social media URL XSS

**Files:**
- Modify: `src/components/creator-browse/CreatorProfileModal.tsx`
- Modify: `src/components/campaigns/RestaurantProfileCard.tsx`

- [ ] **Step 1: Fix CreatorProfileModal.tsx**

Add import at top:
```ts
import { safeUrl } from '@/lib/safeUrl';
```

At line 270 (website_url link), wrap the href:
```tsx
<a href={safeUrl(profile.website_url)} target="_blank" rel="noopener noreferrer">
```

In `getSocialLinks()` (lines 174-195), wrap each URL:
```ts
if (profile.instagram_url) {
  links.push({ icon: Instagram, url: safeUrl(profile.instagram_url), label: 'Instagram' });
}
```
Do the same for `tiktok_url`, `youtube_url`, `facebook_url`, `linkedin_url`, `x_url`. Update the type of `url` in the links array to `string | undefined` and skip rendering links where `url` is undefined.

At line 437, the social links render `<a href={url}>` — since `url` can now be `undefined`, filter out entries where url is falsy before rendering:
```ts
{getSocialLinks().filter(l => l.url).map(({ icon: Icon, url, label }) => (
```

- [ ] **Step 2: Fix RestaurantProfileCard.tsx**

Add import at top:
```ts
import { safeUrl } from '@/lib/safeUrl';
```

At line 97 (website_url):
```tsx
{restaurant.website_url && safeUrl(restaurant.website_url) && (
  <Button variant="outline" size="sm" asChild>
    <a href={safeUrl(restaurant.website_url)} target="_blank" rel="noopener noreferrer">
```

At line 106 (instagram_url):
```tsx
{restaurant.instagram_url && safeUrl(restaurant.instagram_url) && (
  <Button variant="outline" size="sm" asChild>
    <a href={safeUrl(restaurant.instagram_url)} target="_blank" rel="noopener noreferrer">
```

- [ ] **Step 3: Search for other user-supplied href patterns in the codebase**

```bash
grep -rn "href={.*_url}" src/ --include="*.tsx" --include="*.ts"
```

Fix any additional instances found.

- [ ] **Step 4: Commit**

```bash
git add src/components/creator-browse/CreatorProfileModal.tsx src/components/campaigns/RestaurantProfileCard.tsx
git commit -m "sec(high): validate user-supplied URLs against javascript: XSS (#6)"
```

---

## Task 8: Fix #7 — React Query cache on logout

**Files:**
- Modify: `src/hooks/useLogout.ts`

**Current state (lines 12-25):**
```ts
const logout = async () => {
  try {
    await clearChat();
    queryClient.removeQueries({
      predicate: (query) =>
        typeof query.queryKey[0] === 'string' &&
        query.queryKey[0].startsWith('donny'),
    });
    await signOut();
    navigate('/landing');
  } catch (error) {
```

- [ ] **Step 1: Replace selective removeQueries with full clear()**

Replace lines 14-20 with:
```ts
await clearChat();
await signOut();
queryClient.clear();
navigate('/landing');
```

The `queryClient.clear()` is a superset of the previous `removeQueries` call. Place it after `signOut()` but before `navigate()`.

- [ ] **Step 2: Commit**

```bash
git add src/hooks/useLogout.ts
git commit -m "sec(high): clear React Query cache on logout to prevent cross-user data leak (#7)"
```

---

## Task 9: Fix #8 — Profile-assets bucket private + signed URLs

**Files:**
- Create: `supabase/migrations/20260506200200_security_profile_assets_private.sql`
- Create: `src/hooks/useSignedUrl.ts`
- Modify: 13 files that reference `profile-assets` or `getPublicUrl.*profile`

This is the highest-touch change. The migration makes the bucket private; the frontend must switch from public URLs to signed URLs.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260506200200_security_profile_assets_private.sql`:

```sql
-- Security fix #8: Make profile-assets bucket private
-- Public bucket exposes KYC-adjacent assets (profile images, logos).
-- After this migration, all access requires signed URLs or authenticated requests.

UPDATE storage.buckets SET public = false WHERE id = 'profile-assets';

-- Storage RLS: owner can upload/update their own files
CREATE POLICY "profile_assets_owner_insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'profile-assets'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "profile_assets_owner_update"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'profile-assets'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Any authenticated user can read profile assets (avatars are semi-public)
CREATE POLICY "profile_assets_authenticated_read"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'profile-assets');
```

- [ ] **Step 2: Create `src/hooks/useSignedUrl.ts` utility hook**

```ts
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

const signedUrlCache = new Map<string, { url: string; expiresAt: number }>();
const SIGNED_URL_TTL = 3500;

export function useSignedUrl(
  bucket: string,
  path: string | null | undefined
): string | undefined {
  const [url, setUrl] = useState<string | undefined>(() => {
    if (!path) return undefined;
    const cached = signedUrlCache.get(`${bucket}/${path}`);
    if (cached && cached.expiresAt > Date.now()) return cached.url;
    return undefined;
  });

  useEffect(() => {
    if (!path) { setUrl(undefined); return; }

    const cacheKey = `${bucket}/${path}`;
    const cached = signedUrlCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      setUrl(cached.url);
      return;
    }

    let cancelled = false;
    supabase.storage
      .from(bucket)
      .createSignedUrl(path, SIGNED_URL_TTL)
      .then(({ data }) => {
        if (cancelled || !data?.signedUrl) return;
        signedUrlCache.set(cacheKey, {
          url: data.signedUrl,
          expiresAt: Date.now() + (SIGNED_URL_TTL - 60) * 1000,
        });
        setUrl(data.signedUrl);
      });

    return () => { cancelled = true; };
  }, [bucket, path]);

  return url;
}

export async function getSignedProfileUrl(
  path: string | null | undefined
): Promise<string | undefined> {
  if (!path) return undefined;
  if (path.startsWith('http://') || path.startsWith('https://')) return path;

  const cacheKey = `profile-assets/${path}`;
  const cached = signedUrlCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.url;

  const { data } = await supabase.storage
    .from('profile-assets')
    .createSignedUrl(path, SIGNED_URL_TTL);

  if (data?.signedUrl) {
    signedUrlCache.set(cacheKey, {
      url: data.signedUrl,
      expiresAt: Date.now() + (SIGNED_URL_TTL - 60) * 1000,
    });
    return data.signedUrl;
  }
  return undefined;
}
```

- [ ] **Step 3: Update `src/lib/storage/uploadProfileAsset.ts`**

At line 86, `getPublicUrl` won't work on a private bucket. Change:
```ts
const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(path);
if (!urlData?.publicUrl) {
  throw new UploadError('Failed to resolve public URL.');
}
return { url: urlData.publicUrl, path };
```
to:
```ts
return { url: '', path };
```
The caller should use the `path` to generate signed URLs as needed. The `url` field becomes an empty string that callers should ignore in favor of `path`.

**Callers that destructure `{ url }` and need updating:**
- `src/components/shared/AvatarUpload.tsx:45` — currently uses `url` for avatar display; switch to resolving `path` via `getSignedProfileUrl`
- `src/components/shared/FileUploadSection.tsx:61` and `:99` — uses `url` for preview; switch to `path`
- `src/components/creator-profile/PortfolioUpload.tsx:69` — already destructures `{ path }`, no change needed

- [ ] **Step 4: Update `CreatorProfileModal.tsx` avatar and portfolio resolution**

Replace the `resolveAvatarUrl` function (lines 99-113) and the portfolio URL resolution (lines 144-157) to use `getSignedProfileUrl` for storage paths:

Import at top:
```ts
import { getSignedProfileUrl } from '@/hooks/useSignedUrl';
```

Replace the portfolio URL resolution block (lines 144-157):
```ts
if (data.portfolio_urls && data.portfolio_urls.length > 0) {
  const urls = await Promise.all(
    data.portfolio_urls.map(async (url: string) => {
      if (!url) return null;
      if (url.startsWith('http://') || url.startsWith('https://')) return url;
      return await getSignedProfileUrl(url);
    })
  );
  setPortfolioUrls(urls.filter((u): u is string => u !== null));
}
```

Update `resolveAvatarUrl` to handle signed URLs (when bucket is private, the image-transform proxy URL won't work — use signed URL instead):
```ts
const resolveAvatarUrl = (raw: string | null | undefined): string | undefined => {
  if (!raw) return undefined;
  if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;
  return undefined; // Will be resolved async via useSignedUrl hook
};
```

This component needs an additional `useEffect` for avatar resolution. Add a state variable `avatarUrl` and resolve it asynchronously:
```ts
const [avatarUrl, setAvatarUrl] = useState<string | undefined>();

useEffect(() => {
  if (profile?.avatar_url) {
    if (profile.avatar_url.startsWith('http')) {
      setAvatarUrl(profile.avatar_url);
    } else {
      getSignedProfileUrl(profile.avatar_url).then(setAvatarUrl);
    }
  }
}, [profile?.avatar_url]);
```

Then use `avatarUrl` in the `<AvatarImage>` instead of `resolveAvatarUrl(profile.avatar_url)`.

- [ ] **Step 5: Update remaining 11 files that reference profile-assets**

Run `grep -rn "profile-assets\|getPublicUrl.*profile" src/` and update each file:

1. `src/pages/PublicCreatorProfile.tsx` — avatar/portfolio display
2. `src/components/creator-browse/CreatorCard.tsx` — avatar thumbnail
3. `src/components/creator-profile/CurrentPortfolioDisplay.tsx` — portfolio grid
4. `src/components/campaigns/CampaignApplyForm.tsx` — upload form
5. `src/hooks/useUniqueCreatorPortfolio.ts` — URL resolution
6. `src/hooks/useCreatorPortfolioFeed.ts` — feed URLs
7. `src/components/brand-browse/BrandCreatorCard.tsx` — avatar
8. `src/hooks/useBusinessActivity.ts` — activity display
9. `src/hooks/useBusinessDragonFeed.ts` — feed
10. `src/components/brand-browse/ShortlistDrawer.tsx` — shortlist
11. `src/hooks/useProfileData.ts` — profile data

For each file, the pattern is the same:
- Replace `supabase.storage.from('profile-assets').getPublicUrl(path)` with `getSignedProfileUrl(path)`
- Import `getSignedProfileUrl` from `@/hooks/useSignedUrl`
- If the resolution happens inside a React component render, use the `useSignedUrl` hook instead

- [ ] **Step 6: Run build to verify**

```bash
npm run build
```

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260506200200_security_profile_assets_private.sql src/hooks/useSignedUrl.ts src/lib/storage/uploadProfileAsset.ts
git add src/pages/PublicCreatorProfile.tsx src/components/creator-browse/CreatorCard.tsx src/components/creator-browse/CreatorProfileModal.tsx
git add src/components/creator-profile/CurrentPortfolioDisplay.tsx src/components/campaigns/CampaignApplyForm.tsx
git add src/hooks/useUniqueCreatorPortfolio.ts src/hooks/useCreatorPortfolioFeed.ts
git add src/components/brand-browse/BrandCreatorCard.tsx src/hooks/useBusinessActivity.ts
git add src/hooks/useBusinessDragonFeed.ts src/components/brand-browse/ShortlistDrawer.tsx src/hooks/useProfileData.ts
git commit -m "sec(high): make profile-assets bucket private, migrate to signed URLs (#8)"
```

---

## Task 10: Fix #9 — Server-side MIME validation

**Files:**
- Modify: `src/lib/storage/uploadProfileAsset.ts`
- Create: `supabase/functions/validate-upload/index.ts`

- [ ] **Step 1: Add client-side magic byte validation to uploadProfileAsset.ts**

Add a helper function before `uploadProfileAsset`:

```ts
const IMAGE_MAGIC: Array<{ mime: string; bytes: number[] }> = [
  { mime: 'image/jpeg', bytes: [0xFF, 0xD8, 0xFF] },
  { mime: 'image/png', bytes: [0x89, 0x50, 0x4E, 0x47] },
  { mime: 'image/gif', bytes: [0x47, 0x49, 0x46, 0x38] },
  { mime: 'image/webp', bytes: [0x52, 0x49, 0x46, 0x46] },
];

const VIDEO_MAGIC: Array<{ mime: string; bytes: number[] }> = [
  { mime: 'video/mp4', bytes: [0x00, 0x00, 0x00] }, // ftyp box (3rd byte varies)
];

async function validateMagicBytes(file: File, allowedMimes: string[]): Promise<boolean> {
  const buffer = await file.slice(0, 16).arrayBuffer();
  const header = new Uint8Array(buffer);
  const allMagic = [...IMAGE_MAGIC, ...VIDEO_MAGIC].filter(m => allowedMimes.includes(m.mime));
  return allMagic.some(({ bytes }) =>
    bytes.every((b, i) => header[i] === b)
  );
}
```

Call it after MIME type validation in `uploadProfileAsset`:
```ts
const magicValid = await validateMagicBytes(file, allowedTypes);
if (!magicValid) {
  throw new UploadError('File content does not match its declared type.');
}
```

- [ ] **Step 2: Whitelist file extensions**

After line 71, add extension validation:
```ts
const ALLOWED_EXTENSIONS = isPortfolioKind
  ? ['jpg', 'jpeg', 'png', 'webp', 'gif', 'mp4', 'mov']
  : ['jpg', 'jpeg', 'png', 'webp', 'gif'];

const ext = file.name.split('.').pop()?.toLowerCase() || '';
if (!ALLOWED_EXTENSIONS.includes(ext)) {
  throw new UploadError(`File extension .${ext} is not allowed.`);
}
```

- [ ] **Step 3: Create server-side `validate-upload` edge function**

Create `supabase/functions/validate-upload/index.ts`:

```ts
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { corsHeaders } from "../_shared/cors.ts";

const IMAGE_MAGIC: Array<{ mime: string; bytes: number[] }> = [
  { mime: 'image/jpeg', bytes: [0xFF, 0xD8, 0xFF] },
  { mime: 'image/png', bytes: [0x89, 0x50, 0x4E, 0x47] },
  { mime: 'image/gif', bytes: [0x47, 0x49, 0x46, 0x38] },
  { mime: 'image/webp', bytes: [0x52, 0x49, 0x46, 0x46] },
];

const VIDEO_MAGIC: Array<{ mime: string; bytes: number[] }> = [
  { mime: 'video/mp4', bytes: [0x00, 0x00, 0x00] },
];

const ALLOWED_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'mp4', 'mov']);

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders(req) });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? ""
    );
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData.user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401, headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const kind = formData.get("kind") as string | null;

    if (!file || !kind) {
      return new Response(JSON.stringify({ error: "Missing file or kind" }), {
        status: 400, headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Validate extension
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return new Response(JSON.stringify({ error: `Extension .${ext} not allowed` }), {
        status: 400, headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Validate magic bytes
    const headerBytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());
    const allMagic = [...IMAGE_MAGIC, ...VIDEO_MAGIC];
    const magicMatch = allMagic.some(({ bytes }) =>
      bytes.every((b, i) => headerBytes[i] === b)
    );
    if (!magicMatch) {
      return new Response(JSON.stringify({ error: "File content does not match allowed formats" }), {
        status: 400, headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Upload via service role
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );
    const path = `${userData.user.id}/${kind}-${Date.now()}.${ext}`;
    const { error: uploadError } = await adminClient.storage
      .from("profile-assets")
      .upload(path, file, { cacheControl: "3600", upsert: true, contentType: file.type });

    if (uploadError) {
      return new Response(JSON.stringify({ error: uploadError.message }), {
        status: 500, headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ path }), {
      status: 200, headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500, headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/storage/uploadProfileAsset.ts supabase/functions/validate-upload/index.ts
git commit -m "sec(high): add magic-byte validation client-side and server-side upload gate (#9)"
```

---

## Task 11: Fix #10, #11, #12, #13, #14 — RLS tightening migration

**Files:**
- Create: `supabase/migrations/20260506200300_security_rls_tightening.sql`

- [ ] **Step 1: Research existing policies**

Search migrations for existing INSERT policies on `profile_views` and `analytics_events`, UPDATE policies on `campaign_sponsorships`, and all policies on `email_verification_tokens`. Identify exact policy names to drop.

```bash
grep -rn "profile_views\|analytics_events\|campaign_sponsorships\|email_verification_tokens" supabase/migrations/ | grep -i "CREATE POLICY"
```

- [ ] **Step 2: Write the combined RLS tightening migration**

Create `supabase/migrations/20260506200300_security_rls_tightening.sql`:

```sql
-- Security fixes #10, #11, #12, #13, #14 — RLS tightening

-- ============================================================
-- #10: profile_views — restrict anonymous INSERT
-- ============================================================
DROP POLICY IF EXISTS "Anyone can insert profile views" ON public.profile_views;
DROP POLICY IF EXISTS "Profile views are insertable by anyone" ON public.profile_views;

CREATE POLICY "profile_views: authenticated insert"
ON public.profile_views FOR INSERT
TO authenticated
WITH CHECK (viewer_id = auth.uid());

-- Prevent spam: one view per viewer per profile per hour
-- Use AT TIME ZONE 'UTC' to get a deterministic timestamptz → timestamp cast
-- for the expression index (avoids timezone-dependent bucket boundaries).
CREATE UNIQUE INDEX IF NOT EXISTS idx_profile_views_hourly
ON public.profile_views (viewer_id, profile_id, (date_trunc('hour', viewed_at AT TIME ZONE 'UTC')));

-- ============================================================
-- #11: analytics_events — restrict anonymous INSERT
-- ============================================================
DROP POLICY IF EXISTS "Analytics events are insertable by anyone" ON public.analytics_events;

CREATE POLICY "analytics_events: authenticated insert"
ON public.analytics_events FOR INSERT
TO authenticated
WITH CHECK (true);

-- ============================================================
-- #12: user_presence — restrict SELECT to conversation participants
-- ============================================================
DROP POLICY IF EXISTS "Users can view all presence" ON public.user_presence;
DROP POLICY IF EXISTS "Anyone can read presence" ON public.user_presence;

CREATE POLICY "user_presence: self or conversation peer"
ON public.user_presence FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM conversation_participants cp1
    JOIN conversation_participants cp2
      ON cp1.conversation_id = cp2.conversation_id
    WHERE cp1.user_id = auth.uid()
      AND cp2.user_id = user_presence.user_id
      AND cp1.left_at IS NULL
      AND cp2.left_at IS NULL
  )
);

-- Performance index for the self-join
CREATE INDEX IF NOT EXISTS idx_conv_participants_active
ON public.conversation_participants (conversation_id, user_id)
WHERE left_at IS NULL;

-- ============================================================
-- #13: campaign_sponsorships — narrow UPDATE to per-role
-- ============================================================
-- Current policy "Brands and restaurants can update sponsorships" (migration
-- 20251001203644) allows brand_id, restaurant_id, OR campaign_id owners to
-- update ANY column. This lets a brand mutate payment_status or a restaurant
-- change sponsorship_amount. Split into per-role policies.
--
-- Table columns: id, campaign_id, brand_id, restaurant_id, sponsorship_amount,
-- status, proposal_message, terms, created_at, updated_at

DROP POLICY IF EXISTS "Brands and restaurants can update sponsorships" ON public.campaign_sponsorships;

-- Brands can update: status (accept/reject), proposal_message, terms
CREATE POLICY "sponsorships: brand update"
ON public.campaign_sponsorships FOR UPDATE
TO authenticated
USING (
  brand_id IN (
    SELECT id FROM public.business_profiles WHERE user_id = auth.uid()
  )
);

-- Restaurants (campaign owners) can update: status (accept/reject)
CREATE POLICY "sponsorships: restaurant update"
ON public.campaign_sponsorships FOR UPDATE
TO authenticated
USING (
  restaurant_id IN (
    SELECT id FROM public.business_profiles WHERE user_id = auth.uid()
  )
  OR campaign_id IN (
    SELECT id FROM public.campaigns WHERE user_id = auth.uid()
  )
);

-- Note: sponsorship_amount and payment_status should only be mutated by
-- edge functions using service-role client. PostgREST column-level grants
-- are not available via RLS, so this split at least removes the overly-broad
-- third OR condition (campaign owner could update payment fields) and scopes
-- each role to rows they own. For full column-level protection, add a
-- BEFORE UPDATE trigger that rejects changes to sponsorship_amount and
-- payment_status when current_setting('role') != 'service_role'.
-- That trigger is out of scope for this remediation but recommended.

-- ============================================================
-- #14: email_verification_tokens — deny client writes
-- ============================================================
-- Safety: verify-email uses service-role client (bypasses RLS).
CREATE POLICY "email_verif: deny client writes"
ON public.email_verification_tokens FOR ALL
TO authenticated
USING (false)
WITH CHECK (false);
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260506200300_security_rls_tightening.sql
git commit -m "sec(high): tighten RLS on profile_views, analytics_events, user_presence, sponsorships, email_tokens (#10-14)"
```

---

## Task 12: Batch 2 build verification

- [ ] **Step 1: Run build**

```bash
npm run build
```

- [ ] **Step 2: Fix any build errors and commit**

---

## Task 13: Fix #16 — SiteGate cleanup on logout

**Files:**
- Modify: `src/lib/authCleanup.ts`

- [ ] **Step 1: Add SiteGate key cleanup**

After line 10 (after the `localStorage.removeItem` loop), add:

```ts
localStorage.removeItem('dc_site_unlocked_until');
```

After line 18 (after the `sessionStorage.removeItem` loop), add:

```ts
sessionStorage.removeItem('dc_gate_redirect');
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/authCleanup.ts
git commit -m "sec(medium): clear SiteGate unlock token on logout (#16)"
```

---

## Task 14: Fix #17 — LLM rate limiting

**Files:**
- Create: `supabase/migrations/20260506200400_security_llm_rate_limit.sql`
- Modify: `supabase/functions/_shared/usage-tracker.ts`

**Current state:** `usage-tracker.ts` has monthly budget tracking via `donny_usage` table with `checkQuotaOrBlock()`. The hourly burst limit is a separate concern.

- [ ] **Step 1: Write the migration for hourly rate limit table**

Create `supabase/migrations/20260506200400_security_llm_rate_limit.sql`:

```sql
-- Security fix #17: Hourly rate limiting for LLM endpoints
CREATE TABLE IF NOT EXISTS public.llm_hourly_usage (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  hour_bucket timestamptz NOT NULL,
  call_count int NOT NULL DEFAULT 1,
  updated_at timestamptz DEFAULT now(),
  UNIQUE (user_id, hour_bucket)
);

ALTER TABLE public.llm_hourly_usage ENABLE ROW LEVEL SECURITY;

-- Only service-role can read/write (edge functions use admin client)
CREATE POLICY "llm_hourly_usage: service role only"
ON public.llm_hourly_usage FOR ALL
TO authenticated
USING (false)
WITH CHECK (false);

-- Atomic increment function (called via supabaseAdmin.rpc from edge functions)
CREATE OR REPLACE FUNCTION public.increment_llm_hourly_usage(
  p_user_id uuid,
  p_hour_bucket timestamptz
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  INSERT INTO public.llm_hourly_usage (user_id, hour_bucket, call_count)
  VALUES (p_user_id, p_hour_bucket, 1)
  ON CONFLICT (user_id, hour_bucket)
  DO UPDATE SET call_count = llm_hourly_usage.call_count + 1,
               updated_at = now();
$$;

-- Auto-cleanup: rows older than 48 hours can be purged by a cron job
CREATE INDEX idx_llm_hourly_usage_bucket ON public.llm_hourly_usage (hour_bucket);
```

- [ ] **Step 2: Add hourly rate check to usage-tracker.ts**

Add at the bottom of `supabase/functions/_shared/usage-tracker.ts`:

```ts
const HOURLY_LIMITS: Record<string, number> = {
  free: 20,
  starter: 50,
  growth: 200,
  pro: 500,
  enterprise: 2000,
};

function getCurrentHourBucket(): string {
  const now = new Date();
  now.setMinutes(0, 0, 0);
  return now.toISOString();
}

export async function checkHourlyRateLimit(
  supabaseAdmin: SupabaseClient,
  userId: string
): Promise<{ allowed: true } | { allowed: false; retryAfterSeconds: number }> {
  const hourBucket = getCurrentHourBucket();
  const tier = await getUserSubscriptionTier(supabaseAdmin, userId);
  const limit = HOURLY_LIMITS[tier] ?? HOURLY_LIMITS.free;

  const { data } = await supabaseAdmin
    .from("llm_hourly_usage")
    .select("call_count")
    .eq("user_id", userId)
    .eq("hour_bucket", hourBucket)
    .maybeSingle();

  if (data && data.call_count >= limit) {
    const now = new Date();
    const nextHour = new Date(hourBucket);
    nextHour.setHours(nextHour.getHours() + 1);
    return { allowed: false, retryAfterSeconds: Math.ceil((nextHour.getTime() - now.getTime()) / 1000) };
  }

  // Atomic increment via SQL function (created in the migration)
  await supabaseAdmin.rpc("increment_llm_hourly_usage", {
    p_user_id: userId,
    p_hour_bucket: hourBucket,
  });

  return { allowed: true };
}
```

- [ ] **Step 3: Add rate check calls to LLM edge functions**

The following 12 functions call paid LLMs and need the hourly check added at the top (after auth, before LLM call):

1. `chat-assistant/index.ts`
2. `donny-chat/index.ts`
3. `donny-orchestrator/index.ts`
4. `donny-creator-match/index.ts`
5. `donny-campaign-generate/index.ts`
6. `donny-campaign-preview/index.ts`
7. `donny-nudge-frame/index.ts`
8. `donny-apply-pitch/index.ts`
9. `donny-schedule/index.ts`
10. `generate-campaign-analysis/index.ts`
11. `match-creators/index.ts`
12. `generate-embedding/index.ts`

In each function, after the user authentication block, add:

```ts
import { checkHourlyRateLimit } from "../_shared/usage-tracker.ts";

// After user auth:
const rateCheck = await checkHourlyRateLimit(adminClient, user.id);
if (!rateCheck.allowed) {
  return new Response(
    JSON.stringify({ error: 'rate_limited', retry_after: rateCheck.retryAfterSeconds }),
    { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Retry-After': String(rateCheck.retryAfterSeconds) } }
  );
}
```

Note: Each function has a different auth pattern — read the file first to find the right insertion point.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260506200400_security_llm_rate_limit.sql supabase/functions/_shared/usage-tracker.ts
git add supabase/functions/chat-assistant/index.ts supabase/functions/donny-chat/index.ts
git add supabase/functions/donny-orchestrator/index.ts supabase/functions/donny-creator-match/index.ts
git add supabase/functions/donny-campaign-generate/index.ts supabase/functions/donny-campaign-preview/index.ts
git add supabase/functions/donny-nudge-frame/index.ts supabase/functions/donny-apply-pitch/index.ts
git add supabase/functions/donny-schedule/index.ts supabase/functions/generate-campaign-analysis/index.ts
git add supabase/functions/match-creators/index.ts supabase/functions/generate-embedding/index.ts
git commit -m "sec(medium): add hourly rate limiting to all LLM edge functions (#17)"
```

---

## Task 15: Fix #18 — CORS wildcard on all edge functions

**Files:**
- Modify: ~50 of the 55 edge functions in `supabase/functions/*/index.ts` that define a local `corsHeaders` constant. The remaining ~5 functions (e.g. `_shared/`, `stripe-webhook`, `toast-*` webhooks) may not have the constant — check each and skip if absent.

**Pattern to replace in each file:**

Current (varies slightly per function but always this shape):
```ts
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
```

**Replace with** import from shared module:
```ts
import { corsHeaders } from "../_shared/cors.ts";
```

**Then update all usages:**
- `{ headers: corsHeaders }` → `{ headers: corsHeaders(req) }`
- `{ ...corsHeaders, "Content-Type": "application/json" }` → `{ ...corsHeaders(req), "Content-Type": "application/json" }`

For OPTIONS handlers: `return new Response(null, { headers: corsHeaders });` → `return new Response(null, { headers: corsHeaders(req) });`

**The `req` variable must be in scope.** In most functions it's the parameter of `serve(async (req) => { ... })`. For the `send-notification-email` handler function pattern, `req` is the function parameter.

- [ ] **Step 1: List all 55 function directories**

```
auto-approve-content, boost-payment, chat-assistant, check-creator-payout-status,
check-restaurant-payout-status, create-billing-portal-session, create-campaign-escrow,
create-checkout-session, create-creator-connect-account, create-restaurant-connect-account,
create-sponsorship-checkout, donny-analytics-alerts, donny-apply-pitch,
donny-campaign-generate, donny-campaign-preview, donny-chat, donny-cost-rollup,
donny-creator-match, donny-dragonshare-score, donny-nudge-frame, donny-oauth-authorize,
donny-oauth-token, donny-oauth-userinfo, donny-orchestrator, donny-schedule,
donny-toast-context, extend-review, generate-anonymous-brief, generate-campaign-analysis,
generate-embedding, get-stripe-dashboard-link, get-watermarked-preview, invite-member,
match-creators, refund-campaign-escrow, reject-content, release-creator-payout,
release-sponsorship-payout, resolve-dispute, send-campaign-invitation,
send-notification-email, send-promotion-notification, send-verification-email,
send-welcome-email, stripe-webhook, sync-seat-count, toast-discount-push,
toast-oauth-callback, toast-oauth-start, toast-redemption-webhook, toast-token-refresh,
verify-campaign-escrow, verify-email, verify-sponsorship-payment, withdraw-pending-balance
```

- [ ] **Step 2: For each function, apply the mechanical replacement**

Open each `index.ts`, remove the local `corsHeaders` constant, add the import, and update all `corsHeaders` → `corsHeaders(req)` calls. Ensure `req` is in scope at each call site.

Process in batches of ~10 functions at a time, verifying no syntax errors after each batch.

- [ ] **Step 3: Handle edge cases**

Some functions may have `corsHeaders` used in catch blocks or nested functions where `req` might not be in scope. In those cases, capture headers early:
```ts
const headers = corsHeaders(req);
```
and use `headers` throughout.

For `stripe-webhook`, which is called by Stripe (not the browser), CORS headers are technically unnecessary. But keeping them consistent is fine — the origin won't be in the allowlist, so it'll default to `dragoncandy.io`.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/
git commit -m "sec(medium): replace CORS wildcard with origin-checked headers across all edge functions (#18)"
```

---

## Task 16: Fix #19 — Remove SVG from MIME types

**Files:**
- Modify: `src/lib/fileUtils.ts`

- [ ] **Step 1: Remove `image/svg+xml` from ALLOWED_FILE_TYPES**

At line 3, change:
```ts
images: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'],
```
to:
```ts
images: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/fileUtils.ts
git commit -m "sec(medium): remove SVG from allowed image MIME types to prevent stored XSS (#19)"
```

---

## Task 17: Fix #20 — CSV formula injection

**Files:**
- Modify: `src/pages/AdminDragonShareLedger.tsx`

- [ ] **Step 1: Import csvCell and apply to export function**

Add import at top:
```ts
import { csvCell } from '@/lib/csvEscape';
```

At line 72, change:
```ts
const csv = rows.map((r) => r.join(',')).join('\n');
```
to:
```ts
const csv = rows.map((r) => r.map(csvCell).join(',')).join('\n');
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/AdminDragonShareLedger.tsx
git commit -m "sec(medium): escape CSV cells to prevent formula injection in admin export (#20)"
```

---

## Task 18: Fix #21 — CSP meta tag

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Add CSP and referrer meta tags**

After line 9 (`<meta name="apple-mobile-web-app-status-bar-style" ...>`), add:

```html
    <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'unsafe-inline' https://maps.googleapis.com https://www.google.com https://www.gstatic.com https://js.stripe.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https://*.supabase.co https://*.googleusercontent.com https://maps.gstatic.com; media-src 'self' blob: https://*.supabase.co; connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.stripe.com https://www.google.com https://www.recaptcha.net; frame-src https://js.stripe.com https://www.google.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self';">
    <meta name="referrer" content="strict-origin-when-cross-origin">
```

- [ ] **Step 2: Test locally with `npm run dev`**

Open the app in a browser and check the console for CSP violations. If any legitimate resources are blocked, add them to the policy. Common things to check:
- Google Fonts loading
- Supabase realtime websocket connection
- Stripe iframe loading
- reCAPTCHA script loading
- Google Maps (if used)

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "sec(medium): add Content-Security-Policy and referrer-policy meta tags (#21)"
```

---

## Task 19: Fix #23 — Donny markdown link validation

**Files:**
- Modify: `src/components/donny/DonnyMessage.tsx`

- [ ] **Step 1: Import safeUrl and apply to link renderer**

Add import at top:
```ts
import { safeUrl } from '@/lib/safeUrl';
```

At line 70, change:
```tsx
<a href={href} target="_blank" rel="noopener noreferrer" className="text-dc-pink-accent underline underline-offset-2">
```
to:
```tsx
<a href={safeUrl(href) ?? '#'} target="_blank" rel="noopener noreferrer" className="text-dc-pink-accent underline underline-offset-2">
```

- [ ] **Step 2: Commit**

```bash
git add src/components/donny/DonnyMessage.tsx
git commit -m "sec(medium): validate Donny markdown link hrefs against javascript: XSS (#23)"
```

---

## Task 20: Fix #25 — vite.config.ts dev server bind

**Files:**
- Modify: `vite.config.ts`

- [ ] **Step 1: Change host binding**

At line 12, change:
```ts
host: "::",
```
to:
```ts
host: "127.0.0.1",
```

- [ ] **Step 2: Commit**

```bash
git add vite.config.ts
git commit -m "sec(low): bind dev server to localhost only (#25)"
```

---

## Task 21: Batch 3+4 build verification

- [ ] **Step 1: Run build**

```bash
npm run build
```

- [ ] **Step 2: Fix any build errors and commit**

- [ ] **Step 3: Run dev server and smoke-test**

```bash
npm run dev
```

Verify in browser:
- CSP meta tag isn't blocking any resources (check console)
- Profile avatars still render (signed URLs working)
- Donny chat links work normally
- Social media links on creator profiles work
- CSV export from admin ledger works

---

## Task 22: Final verification commit and summary

- [ ] **Step 1: Run final build**

```bash
npm run build
```

- [ ] **Step 2: Review all changes**

```bash
git log --oneline main..HEAD
git diff --stat main
```

Verify the commit history covers all 24 issues (minus #5, #22 deferred and #26 already resolved = 21 actionable commits).

- [ ] **Step 3: Create summary of manual steps needed**

Document for the user:
1. Apply SQL migrations via Supabase CLI: `supabase db push`
2. Deploy edge functions: `supabase functions deploy`
3. Reduce JWT TTL to 15-30 min in Supabase dashboard (#24)
4. Re-run security audit to verify fixes

---

## Appendix: Issue-to-Task Mapping

| Issue | Severity | Task | Status |
|-------|----------|------|--------|
| #1 | CRITICAL | Task 2 | |
| #2 | CRITICAL | Task 3 | |
| #3 | CRITICAL | Task 4 | |
| #4 | CRITICAL | Task 5 | |
| #5 | CRITICAL | Deferred (Toast) | |
| #6 | HIGH | Task 7 | |
| #7 | HIGH | Task 8 | |
| #8 | HIGH | Task 9 | |
| #9 | HIGH | Task 10 | |
| #10 | HIGH | Task 11 | |
| #11 | HIGH | Task 11 | |
| #12 | HIGH | Task 11 | |
| #13 | HIGH | Task 11 | |
| #14 | HIGH | Task 11 | |
| #15 | MEDIUM | Documentation only | |
| #16 | MEDIUM | Task 13 | |
| #17 | MEDIUM | Task 14 | |
| #18 | MEDIUM | Task 15 | |
| #19 | MEDIUM | Task 16 | |
| #20 | MEDIUM | Task 17 | |
| #21 | MEDIUM | Task 18 | |
| #22 | MEDIUM | Deferred (Toast) | |
| #23 | MEDIUM | Task 19 | |
| #24 | LOW | Manual (Supabase dashboard) | |
| #25 | LOW | Task 20 | |
| #26 | LOW | Already resolved | |
