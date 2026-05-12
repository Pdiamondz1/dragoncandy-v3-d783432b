# Campaign, Auth, and Help Center Fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 6 issues — auth lockout bug, orphaned campaign entries, My Campaigns styling, decorative avatar removal, campaign content review UX, and Help Center content refresh with screenshots.

**Architecture:** Each fix is independent and touches a separate area of the codebase. The auth fix introduces a new Supabase edge function using the service-role pattern established by `verify-email`. The Help Center refresh adds two new categories (requiring a CHECK constraint migration) and rewrites all article content with live screenshots captured via browser automation.

**Tech Stack:** React + TypeScript, Supabase (Postgres, Edge Functions, Storage), Tailwind CSS, React Query, Deno (edge functions)

**Spec:** `docs/superpowers/specs/2026-05-12-campaign-auth-helpcenter-fixes-design.md`

---

## Task 1: Auth — Create `verify-on-password-reset` Edge Function

**Files:**
- Create: `supabase/functions/verify-on-password-reset/index.ts`

This edge function sets `email_verified = true` using the service role key. It follows the exact same pattern as `supabase/functions/verify-email/index.ts:69-71` (service-role client creation) and `:147-150` (profile update). The caller must be authenticated and can only verify their own profile.

- [ ] **Step 1: Create the edge function**

```typescript
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = (req: Request) => {
  const origin = req.headers.get("origin") ?? "";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(req) });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Authenticate the caller
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    const bearerToken = authHeader.replace("Bearer ", "");
    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey);
    const { data: { user: caller }, error: authError } = await supabaseAuth.auth.getUser(bearerToken);
    if (authError || !caller) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    // Use service role to update profile (bypasses RLS)
    const supabase = createClient(supabaseUrl, serviceKey);
    const { error: profileError } = await supabase
      .from("profiles")
      .update({ email_verified: true })
      .eq("id", caller.id);

    if (profileError) {
      console.error("verify-on-password-reset: profile update error", profileError);
      return new Response(
        JSON.stringify({ error: "Could not verify email" }),
        { status: 500, headers: { ...corsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders(req), "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("verify-on-password-reset: unexpected error", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders(req), "Content-Type": "application/json" } }
    );
  }
});
```

- [ ] **Step 2: Verify the function deploys**

Run: `npx supabase functions deploy verify-on-password-reset --no-verify-jwt`

Note: `--no-verify-jwt` is used because the function handles its own auth via the Authorization header (same pattern as `send-verification-email`). Alternatively, if the project uses Supabase's default JWT verification, omit this flag and the bearer token check is redundant — but match the existing pattern used by `send-verification-email`.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/verify-on-password-reset/index.ts
git commit -m "feat: add verify-on-password-reset edge function"
```

---

## Task 2: Auth — Call Edge Function from UpdatePassword Page

**Files:**
- Modify: `src/pages/UpdatePassword.tsx:31-43`

The edge function call must happen **after** `supabase.auth.updateUser({ password })` succeeds and **before** the `cleanupAuthState()` + `signOut()` + redirect sequence.

- [ ] **Step 1: Add the edge function invocation**

In `src/pages/UpdatePassword.tsx`, replace lines 31-43:

```typescript
// BEFORE (lines 31-43):
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;

      toast({ title: "Password updated", description: "Please log in with your new password." });

      // Clean up any lingering sessions and force a fresh login
      try {
        cleanupAuthState();
        await supabase.auth.signOut({ scope: 'global' });
      } catch {}

      window.location.href = "/auth?mode=login";
```

```typescript
// AFTER:
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;

      // Auto-verify email — proves ownership via password reset link
      try {
        await supabase.functions.invoke('verify-on-password-reset');
      } catch {}

      toast({ title: "Password updated", description: "Please log in with your new password." });

      try {
        cleanupAuthState();
        await supabase.auth.signOut({ scope: 'global' });
      } catch {}

      window.location.href = "/auth?mode=login";
```

- [ ] **Step 2: Verify the build passes**

Run: `npm run build`
Expected: No TypeScript errors. The `supabase.functions.invoke` call is already used elsewhere in the codebase (e.g., `MyCampaignsPage.tsx:48`).

- [ ] **Step 3: Commit**

```bash
git add src/pages/UpdatePassword.tsx
git commit -m "feat: auto-verify email on successful password reset"
```

---

## Task 3: Auth — Add Resend Verification Button on Login Failure

**Files:**
- Modify: `src/pages/AuthPage.tsx:85-90` and error rendering areas (~lines 218-222, 250-254)

When the `email_verified` check fails, instead of signing out immediately and showing a dead-end error, we defer the signOut so the user can click "Resend verification email." The `send-verification-email` edge function requires an active session (bearer token), so the user must remain authenticated until they either resend or explicitly dismiss.

**Important:** `AuthPage.tsx` uses `toast` from `sonner` (line 9), NOT shadcn's `useToast`. All toast calls must use sonner-style: `toast.success('...')`, `toast.error('...')`.

- [ ] **Step 1: Add state and resend handler**

At the top of the `AuthPage` component (near the existing state declarations around line 25), add:

```typescript
const [resendCooldown, setResendCooldown] = useState(0);
const [needsVerification, setNeedsVerification] = useState(false);
```

Add a `useEffect` for the cooldown timer:

```typescript
useEffect(() => {
  if (resendCooldown <= 0) return;
  const timer = setTimeout(() => setResendCooldown((c) => c - 1), 1000);
  return () => clearTimeout(timer);
}, [resendCooldown]);
```

Add a resend handler function. This works because we deferred signOut — the user still has an active session:

```typescript
const handleResendVerification = async () => {
  if (!user || resendCooldown > 0) return;
  setResendCooldown(60);
  try {
    await supabase.functions.invoke('send-verification-email', {
      body: {
        email: user.email,
        name: user.user_metadata?.full_name || '',
        userId: user.id,
      },
    });
    toast.success('Verification email sent! Check your inbox.');
  } catch {
    toast.error('Could not send email. Please try again.');
  }
};

const handleDismissVerification = async () => {
  setNeedsVerification(false);
  setError(null);
  await supabase.auth.signOut();
};
```

- [ ] **Step 2: Defer signOut in the email_verified check**

Replace `AuthPage.tsx:85-90`:

```typescript
// BEFORE:
      if (profile && profile.email_verified !== true) {
        await supabase.auth.signOut();
        setError('Please verify your email before continuing. Check your inbox for the verification link.');
        return;
      }
```

```typescript
// AFTER:
      if (profile && profile.email_verified !== true) {
        setNeedsVerification(true);
        setError('verify_email');
        return;
      }
```

The session stays alive so `handleResendVerification` can call the edge function. SignOut happens when the user clicks "Back to login" via `handleDismissVerification`.

- [ ] **Step 3: Render the resend UI in the error display areas**

There are two places where `{error && ...}` is rendered — one in the login section (~line 218-222) and one in the signup section (~line 250-254). Replace **both** instances:

```tsx
// BEFORE (appears twice, ~lines 218-222 and 250-254):
          {error && (
            <div className="text-sm text-red-600 bg-red-50 px-4 py-2 rounded-xl mt-3 max-w-sm md:max-w-md mx-auto">
              {error}
            </div>
          )}
```

```tsx
// AFTER (use this for both instances):
          {error === 'verify_email' ? (
            <div className="bg-red-50 px-4 py-3 rounded-xl mt-3 max-w-sm md:max-w-md mx-auto text-center space-y-2">
              <p className="text-sm text-red-600">
                Please verify your email before continuing. Check your inbox for the verification link.
              </p>
              <button
                onClick={handleResendVerification}
                disabled={resendCooldown > 0}
                className="text-sm font-semibold text-dc-teal hover:text-dc-teal-dark disabled:text-gray-400 transition-colors"
              >
                {resendCooldown > 0
                  ? `Resend in ${resendCooldown}s`
                  : 'Resend verification email'}
              </button>
              <button
                onClick={handleDismissVerification}
                className="block mx-auto text-xs text-gray-500 hover:text-gray-700 transition-colors"
              >
                Back to login
              </button>
            </div>
          ) : error ? (
            <div className="text-sm text-red-600 bg-red-50 px-4 py-2 rounded-xl mt-3 max-w-sm md:max-w-md mx-auto">
              {error}
            </div>
          ) : null}
```

This preserves the existing container styling (`bg-red-50`, `rounded-xl`, `max-w-sm md:max-w-md mx-auto`) while adding the resend button and a "Back to login" dismiss action that triggers signOut.

- [ ] **Step 4: Verify the build passes**

Run: `npm run build`
Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add src/pages/AuthPage.tsx
git commit -m "feat: add resend verification email button with 60s cooldown on login"
```

---

## Task 4: Auth — Align VerifiedRoute Error Messaging

**Files:**
- Modify: `src/components/VerifiedRoute.tsx:16-18`

The `VerifiedRoute` toast says "Please verify your email to continue" but redirects to `/auth?mode=login` where the user will now see the resend button. The messaging should be consistent.

- [ ] **Step 1: Update the toast message**

In `src/components/VerifiedRoute.tsx:17`, change:

```typescript
// BEFORE:
      toast.error('Please verify your email to continue. Check your inbox for the verification link.');
```

```typescript
// AFTER:
      toast.error('Please verify your email to continue. You can resend the verification email from the login page.');
```

- [ ] **Step 2: Verify the build passes**

Run: `npm run build`

- [ ] **Step 3: Commit**

```bash
git add src/components/VerifiedRoute.tsx
git commit -m "fix: align VerifiedRoute toast with new resend option on login page"
```

---

## Task 5: Filter "Unknown Campaign" Entries from Creator Dashboard

**Files:**
- Modify: `src/hooks/useCreatorRecentActivity.ts:42-53,74-97`

Filter out entries where the campaign join returns null (deleted campaigns).

- [ ] **Step 1: Add null-campaign filter to applications loop**

In `src/hooks/useCreatorRecentActivity.ts`, replace lines 42-53:

```typescript
// BEFORE:
        applications?.forEach((app) => {
            const campaignArr = app.campaigns as { title: string }[] | null;
            const campaignTitle = campaignArr?.[0]?.title;
            activities.push({
              id: app.id,
              type: 'application',
              status: app.status,
              description: `Applied to "${campaignTitle || 'Unknown Campaign'}" campaign`,
              created_at: app.created_at,
              campaign_id: app.campaign_id,
            });
          });
```

```typescript
// AFTER:
        applications?.forEach((app) => {
            const campaignArr = app.campaigns as { title: string }[] | null;
            const campaignTitle = campaignArr?.[0]?.title;
            if (!campaignTitle) return;
            activities.push({
              id: app.id,
              type: 'application',
              status: app.status,
              description: `Applied to "${campaignTitle}" campaign`,
              created_at: app.created_at,
              campaign_id: app.campaign_id,
            });
          });
```

- [ ] **Step 2: Add null-campaign filter to collaborations loop**

Replace lines 74-97:

```typescript
// BEFORE:
          collaborations?.forEach((collab) => {
            const collabCampaignArr = collab.campaigns as { title: string }[] | null;
            const campaignTitle = collabCampaignArr?.[0]?.title;
            let description = '';
            switch (collab.status) {
              case 'active':
                description = `Started working on "${campaignTitle || 'Unknown Campaign'}"`;
                break;
              case 'completed':
                description = `Completed project "${campaignTitle || 'Unknown Campaign'}"`;
                break;
              default:
                description = `Project "${campaignTitle || 'Unknown Campaign'}" status updated`;
            }

            activities.push({
              id: collab.id,
              type: 'collaboration',
              status: collab.status,
              description,
              created_at: collab.updated_at,
              campaign_id: collab.campaign_id,
            });
          });
```

```typescript
// AFTER:
          collaborations?.forEach((collab) => {
            const collabCampaignArr = collab.campaigns as { title: string }[] | null;
            const campaignTitle = collabCampaignArr?.[0]?.title;
            if (!campaignTitle) return;
            let description = '';
            switch (collab.status) {
              case 'active':
                description = `Started working on "${campaignTitle}"`;
                break;
              case 'completed':
                description = `Completed project "${campaignTitle}"`;
                break;
              default:
                description = `Project "${campaignTitle}" status updated`;
            }

            activities.push({
              id: collab.id,
              type: 'collaboration',
              status: collab.status,
              description,
              created_at: collab.updated_at,
              campaign_id: collab.campaign_id,
            });
          });
```

- [ ] **Step 3: Verify the build passes**

Run: `npm run build`

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useCreatorRecentActivity.ts
git commit -m "fix: filter out deleted campaign entries from creator recent activity"
```

---

## Task 6: Remove "D" Avatar from Available Campaigns

**Files:**
- Modify: `src/pages/CreatorCampaignMarketplace.tsx:114-130`

Delete the user-initial avatar badge and simplify the header layout.

- [ ] **Step 1: Remove the avatar badge**

In `src/pages/CreatorCampaignMarketplace.tsx`, replace lines 114-131:

```tsx
// BEFORE:
        <PageHeader>
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <h1 className="text-xl font-bold text-gray-900 leading-tight">Campaigns</h1>
              <div className="flex items-center gap-1 mt-0.5">
                <MapPin className="w-3.5 h-3.5 text-dc-pink-accent flex-shrink-0" aria-hidden="true" />
                <span className="text-xs text-gray-600">
                  {availableFilteredCount} campaign{availableFilteredCount !== 1 ? 's' : ''} available
                </span>
              </div>
            </div>
            <div className="w-10 h-10 rounded-full ring-2 ring-dc-teal overflow-hidden bg-dc-pink-bg flex items-center justify-center flex-shrink-0">
              <span className="text-sm font-bold text-dc-teal-dark">
                {user?.email?.charAt(0).toUpperCase() ?? 'C'}
              </span>
            </div>
          </div>
        </PageHeader>
```

```tsx
// AFTER:
        <PageHeader>
          <div>
            <h1 className="text-xl font-bold text-gray-900 leading-tight">Campaigns</h1>
            <div className="flex items-center gap-1 mt-0.5">
              <MapPin className="w-3.5 h-3.5 text-dc-pink-accent flex-shrink-0" aria-hidden="true" />
              <span className="text-xs text-gray-600">
                {availableFilteredCount} campaign{availableFilteredCount !== 1 ? 's' : ''} available
              </span>
            </div>
          </div>
        </PageHeader>
```

- [ ] **Step 2: Verify the build passes**

Run: `npm run build`

- [ ] **Step 3: Commit**

```bash
git add src/pages/CreatorCampaignMarketplace.tsx
git commit -m "fix: remove redundant user-initial avatar from campaigns marketplace header"
```

---

## Task 7: My Campaigns Page — Wrap in DashboardLayout + White Background

**Files:**
- Modify: `src/pages/MyCampaignsPage.tsx`

Wrap the page in `DashboardLayout`, replace pink gradient with white, and remove the custom back-arrow header.

- [ ] **Step 1: Add DashboardLayout import**

Add at the top of `MyCampaignsPage.tsx`:

```typescript
import { DashboardLayout } from '@/components/DashboardLayout';
```

- [ ] **Step 2: Replace the outer wrapper and remove custom header**

Replace lines 52-67 (the outer div + custom header):

```tsx
// BEFORE:
  return (
    <div className="min-h-screen bg-gradient-to-b from-pink-200 to-pink-100">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button onClick={() => navigate('/dashboard/creator')} className="text-gray-700">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="text-xl font-bold text-gray-900 tracking-wide">MY CAMPAIGNS</h1>
        </div>
        {totalCount > 0 && (
          <span className="bg-dc-teal text-white text-xs font-semibold px-2.5 py-0.5 rounded-full">
            {totalCount}
          </span>
        )}
      </div>
```

```tsx
// AFTER:
  return (
    <DashboardLayout userRole="content_creator">
      <div className="bg-white min-h-full">
        {/* Page title */}
        <div className="px-4 pt-4 pb-3 flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-900 tracking-wide">MY CAMPAIGNS</h1>
          {totalCount > 0 && (
            <span className="bg-dc-teal text-white text-xs font-semibold px-2.5 py-0.5 rounded-full">
              {totalCount}
            </span>
          )}
        </div>
```

- [ ] **Step 3: Replace the closing div**

Replace the closing `</div>` at line 164 (the last one that closes `min-h-screen`):

```tsx
// BEFORE:
    </div>
  );
```

```tsx
// AFTER:
      </div>
    </DashboardLayout>
  );
```

- [ ] **Step 4: Remove unused imports**

Remove `ArrowLeft` from the lucide-react import (line 3) and `useNavigate` from react-router-dom if no longer used elsewhere in the file. Keep `useSearchParams`.

- [ ] **Step 5: Verify the build passes**

Run: `npm run build`

- [ ] **Step 6: Commit**

```bash
git add src/pages/MyCampaignsPage.tsx
git commit -m "fix: wrap My Campaigns in DashboardLayout with white background"
```

---

## Task 8: Campaign Content Review — Guard "Ready for Review" State

**Files:**
- Modify: `src/components/campaigns/detail/ContentReviewSection.tsx:54,118,137-168`
- Modify: `src/hooks/useFileQuery.ts:7` (add optional `uploadedBy` parameter)

The current hook `useFileUploads(campaignId, 'deliverable')` fetches all deliverables for the campaign. For multi-creator safety, we need to scope by `uploaded_by = creatorId`.

- [ ] **Step 1: Add `uploadedBy` parameter to `useFileUploads` hook**

In `src/hooks/useFileQuery.ts`, modify the function signature and query:

```typescript
// BEFORE (line 7):
export const useFileUploads = (campaignId?: string, category?: string) => {
```

```typescript
// AFTER:
export const useFileUploads = (campaignId?: string, category?: string, uploadedBy?: string) => {
```

After line 22 (the category filter), add:

```typescript
      if (uploadedBy) {
        query = query.eq('uploaded_by', uploadedBy);
      }
```

Also update the queryKey at line 11:

```typescript
// BEFORE:
    queryKey: ['file-uploads', campaignId, category],
```

```typescript
// AFTER:
    queryKey: ['file-uploads', campaignId, category, uploadedBy],
```

- [ ] **Step 2: Update ContentReviewSection to pass creatorId and guard on empty files**

In `src/components/campaigns/detail/ContentReviewSection.tsx`, change line 54:

```typescript
// BEFORE:
  const { data: files } = useFileUploads(campaignId, 'deliverable');
```

```typescript
// AFTER:
  const { data: files, isLoading: filesLoading } = useFileUploads(campaignId, 'deliverable', creatorId);
```

Replace the early return at line 118:

```typescript
// BEFORE:
  if (contentStatus !== 'submitted') return null;
```

```typescript
// AFTER:
  if (contentStatus !== 'submitted') return null;

  const hasFiles = files && files.length > 0;

  if (!hasFiles && !filesLoading) {
    return (
      <div className="bg-white border-2 border-dc-teal rounded-2xl p-4">
        <div className="flex items-center gap-2">
          <FileCheck className="h-4 w-4 text-dc-teal" />
          <span className="text-sm text-gray-600">
            Waiting for {creatorName} to upload content
          </span>
        </div>
      </div>
    );
  }

  if (filesLoading) {
    return (
      <div className="bg-white border-2 border-dc-teal rounded-2xl p-4">
        <div className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 text-dc-teal animate-spin" />
          <span className="text-sm text-gray-600">Loading content...</span>
        </div>
      </div>
    );
  }
```

- [ ] **Step 3: Verify the build passes**

Run: `npm run build`

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useFileQuery.ts src/components/campaigns/detail/ContentReviewSection.tsx
git commit -m "fix: guard content review on actual file uploads, scope by creator"
```

---

## Task 9: Campaign Content Review — Enhance Preview Gallery

**Files:**
- Modify: `src/components/campaigns/detail/ContentReviewSection.tsx:137-168`

Replace the 56x56px icon-size thumbnails with a reviewable-size gallery. Add a lightbox for full-size viewing.

- [ ] **Step 1: Add Dialog import for lightbox**

Add to the imports at the top of `ContentReviewSection.tsx`:

```typescript
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import { Download, Eye } from 'lucide-react';
```

Add lightbox state inside the component (after the existing state declarations):

```typescript
const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
```

- [ ] **Step 2: Replace the thumbnail grid with a reviewable gallery**

Replace lines 137-168 (the `{files && files.length > 0 && ...}` block):

```tsx
// AFTER:
      {hasFiles && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {files!.slice(0, 6).map(file => {
            const isImage = file.mime_type?.startsWith('image/');
            const isVideo = file.mime_type?.startsWith('video/');
            const publicUrl = supabase.storage.from(file.bucket_name).getPublicUrl(file.file_path).data.publicUrl;
            return (
              <div
                key={file.id}
                className="relative aspect-video rounded-xl border border-gray-200 overflow-hidden bg-gray-50 group"
              >
                {isImage ? (
                  <>
                    <img
                      src={publicUrl}
                      alt={file.original_filename}
                      className="w-full h-full object-cover"
                      onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                    <button
                      onClick={() => setLightboxUrl(publicUrl)}
                      className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center"
                    >
                      <Eye className="h-5 w-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                    </button>
                  </>
                ) : isVideo ? (
                  <div className="w-full h-full flex flex-col items-center justify-center gap-1">
                    <div className="w-10 h-10 rounded-full bg-dc-teal/10 flex items-center justify-center">
                      <span className="text-dc-teal text-lg">&#9654;</span>
                    </div>
                    <span className="text-xs text-gray-500 truncate max-w-[90%] px-2">
                      {file.original_filename}
                    </span>
                  </div>
                ) : (
                  <a
                    href={publicUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full h-full flex flex-col items-center justify-center gap-1 hover:bg-gray-100 transition-colors"
                  >
                    <Download className="h-5 w-5 text-gray-400" />
                    <span className="text-xs text-gray-500 truncate max-w-[90%] px-2">
                      {file.original_filename}
                    </span>
                  </a>
                )}
              </div>
            );
          })}
          {files!.length > 6 && (
            <div className="aspect-video rounded-xl border border-gray-200 bg-gray-50 flex items-center justify-center">
              <span className="text-sm text-gray-500 font-semibold">+{files!.length - 6} more</span>
            </div>
          )}
        </div>
      )}

      {/* Lightbox */}
      <Dialog open={!!lightboxUrl} onOpenChange={() => setLightboxUrl(null)}>
        <DialogContent className="max-w-3xl p-2">
          <DialogTitle className="sr-only">Content preview</DialogTitle>
          {lightboxUrl && (
            <img src={lightboxUrl} alt="Full size preview" className="w-full h-auto rounded-lg" />
          )}
        </DialogContent>
      </Dialog>
```

- [ ] **Step 3: Verify the build passes**

Run: `npm run build`

- [ ] **Step 4: Commit**

```bash
git add src/components/campaigns/detail/ContentReviewSection.tsx
git commit -m "feat: enhance content review with reviewable-size gallery and lightbox"
```

---

## Task 10: Help Center — Migration to Add New Categories

**Files:**
- Create: `supabase/migrations/<timestamp>_help_articles_add_categories.sql`

The `help_articles.category` column has a CHECK constraint (from `20260427120000_help_articles.sql:7`): `check (category in ('getting_started','campaigns','dragonshare','billing','account'))`. We need to drop and recreate this constraint to include `donny_ai` and `messaging`.

- [ ] **Step 1: Create the migration file**

Generate a timestamp and create the migration. Use a timestamp after the existing one (e.g., `20260512000000`):

```sql
-- Add donny_ai and messaging categories to help_articles
ALTER TABLE public.help_articles
  DROP CONSTRAINT IF EXISTS help_articles_category_check;

ALTER TABLE public.help_articles
  ADD CONSTRAINT help_articles_category_check
  CHECK (category IN ('getting_started', 'campaigns', 'dragonshare', 'billing', 'account', 'donny_ai', 'messaging'));
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260512000000_help_articles_add_categories.sql
git commit -m "feat: add donny_ai and messaging categories to help_articles"
```

---

## Task 11: Help Center — Add New Category Icons in UI

**Files:**
- Modify: `src/pages/help/HelpCenter.tsx:5,21-27`

Add the two new categories to the CATEGORIES array with their icons.

- [ ] **Step 1: Update the imports**

In `src/pages/help/HelpCenter.tsx`, update the lucide-react import (line 5):

```typescript
// BEFORE:
import { Search, BookOpen, Megaphone, Zap, CreditCard, Shield, ChevronDown, ArrowLeft } from "lucide-react";
```

```typescript
// AFTER:
import { Search, BookOpen, Megaphone, Zap, CreditCard, Shield, Sparkles, MessageCircle, ChevronDown, ArrowLeft } from "lucide-react";
```

- [ ] **Step 2: Add new categories to the CATEGORIES array**

Replace lines 21-27:

```typescript
// BEFORE:
const CATEGORIES = [
  { key: "getting_started", label: "Getting Started", icon: BookOpen },
  { key: "campaigns", label: "Campaigns", icon: Megaphone },
  { key: "dragonshare", label: "DragonShare", icon: Zap },
  { key: "billing", label: "Billing & Plans", icon: CreditCard },
  { key: "account", label: "Account & Privacy", icon: Shield },
] as const;
```

```typescript
// AFTER:
const CATEGORIES = [
  { key: "getting_started", label: "Getting Started", icon: BookOpen },
  { key: "campaigns", label: "Campaigns", icon: Megaphone },
  { key: "dragonshare", label: "DragonShare", icon: Zap },
  { key: "donny_ai", label: "Donny AI", icon: Sparkles },
  { key: "messaging", label: "Messaging", icon: MessageCircle },
  { key: "billing", label: "Billing & Plans", icon: CreditCard },
  { key: "account", label: "Account & Privacy", icon: Shield },
] as const;
```

- [ ] **Step 3: Update the `openCategories` default**

The `openCategories` state initializer at line 33 already uses `CATEGORIES.map`, so it will automatically include the new categories. No change needed.

- [ ] **Step 4: Verify the build passes**

Run: `npm run build`

- [ ] **Step 5: Commit**

```bash
git add src/pages/help/HelpCenter.tsx
git commit -m "feat: add Donny AI and Messaging categories to Help Center UI"
```

---

## Task 12: Help Center — Capture Live Screenshots

**Files:**
- Screenshots will be uploaded to Supabase Storage `help-screenshots` bucket

Use browser automation to capture screenshots from the live dragoncandy.io site for each Help Center topic. Screenshots should cover:

- [ ] **Step 1: Create the `help-screenshots` storage bucket**

Via Supabase dashboard or SQL migration:

```sql
INSERT INTO storage.buckets (id, name, public)
VALUES ('help-screenshots', 'help-screenshots', true)
ON CONFLICT (id) DO NOTHING;
```

- [ ] **Step 2: Capture screenshots per role and topic**

Use the `browser-use` skill or manual browser automation to capture screenshots from dragoncandy.io. Target screens:

**Getting Started:**
- Restaurant signup flow
- Creator signup flow
- Brand signup flow
- Profile completion screen

**Campaigns:**
- Campaign creation wizard (restaurant/brand view)
- Campaign marketplace (creator view)
- Campaign detail page (both views)
- Content submission / review flow

**DragonShare:**
- DragonShare submission flow (creator)
- DragonShare inbox (brand/restaurant)

**Donny AI:**
- Match score display on campaign cards
- Donny suggestions in action
- Donny help brief drawer

**Messaging:**
- Conversation list
- Active chat view
- File sharing in chat

**Billing & Plans:**
- Pricing tiers page
- Settings billing section

**Account & Privacy:**
- Account settings page
- Team management page

Save screenshots with descriptive filenames: `help-<category>-<topic>.png`

- [ ] **Step 3: Upload screenshots to Supabase Storage**

Upload all captured screenshots to the `help-screenshots` bucket. Note the public URLs for use in article content.

- [ ] **Step 4: Commit any local screenshot assets or upload script**

```bash
git commit -m "feat: capture and upload Help Center screenshots to Supabase Storage"
```

---

## Task 13: Help Center — Rewrite All Article Content + Add New Articles

**Files:**
- Create: `supabase/migrations/<timestamp>_help_articles_content_refresh.sql`

Full content rewrite of all 18 existing articles plus 6-10 new articles for Donny AI and Messaging categories. Each article includes inline `<img>` tags referencing the screenshots from Task 12.

- [ ] **Step 1: Write the migration with updated and new article content**

Create a migration that updates all existing articles and inserts new ones. Use `ON CONFLICT (slug) DO UPDATE` for existing articles and plain INSERT for new ones.

Article structure for each:
- Opening line: what the feature does (1-2 sentences)
- Step-by-step: numbered instructions with screenshot references
- Tips: practical advice
- Screenshots: `<img src="[supabase-storage-url]" alt="[description]" class="rounded-xl shadow-md my-4 max-w-full" />`

Target article list (24-28 total):

**Getting Started (4 existing — update):**
- signup-restaurant, signup-creator, signup-brand, complete-profile

**Campaigns (5 existing — update):**
- launch-campaign, apply-campaign, what-is-dragondash, match-score, approve-content

**DragonShare (4 existing — update):**
- dragonshare-creator, dragonshare-brand, good-boost-amount, creator-payment-timing

**Billing (3 existing — update):**
- pricing-tiers, upgrade-downgrade, refunds

**Account (3 existing — update):**
- delete-account, gdpr-erasure, team-roles

**Donny AI (3-5 new):**
- donny-match-scores: How Donny matches you to campaigns
- donny-suggestions: Using Donny's smart suggestions
- donny-help-briefs: Getting instant help from Donny
- donny-insights: Understanding Donny's analytics insights (if applicable)

**Messaging (3-5 new):**
- messaging-basics: Starting a conversation
- messaging-files: Sharing files in chat
- messaging-presence: Online status and real-time updates
- messaging-notifications: Managing message notifications (if applicable)

- [ ] **Step 2: Verify migration applies cleanly**

Run: `npx supabase db push` (or apply via dashboard)

- [ ] **Step 3: Verify article rendering on HelpArticlePage**

Check that `<img>` tags render correctly within the `prose prose-sm` styling in `HelpArticlePage.tsx:101`. The `whitespace-pre-line` class on the prose container should handle the HTML img tags. If images don't render (because the body is rendered as text, not HTML), this needs a change:

In `src/pages/help/HelpArticlePage.tsx:101`, check if the body is rendered as raw text or HTML:

```tsx
// If currently:
<div className="prose prose-sm max-w-none text-gray-700 leading-relaxed whitespace-pre-line">
  {article.body}
</div>

// Change to render HTML:
<div
  className="prose prose-sm max-w-none text-gray-700 leading-relaxed"
  dangerouslySetInnerHTML={{ __html: article.body }}
/>
```

Note: This is safe because article content is authored by us (seeded via migrations), not user-generated. The RLS policy only allows `service_role` to write articles.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/ src/pages/help/HelpArticlePage.tsx
git commit -m "feat: rewrite all Help Center articles with screenshots and new categories"
```

---

## Task 14: Final Verification

- [ ] **Step 1: Full build check**

Run: `npm run build`
Expected: Zero errors, zero warnings.

- [ ] **Step 2: Manual smoke test checklist**

Run `npm run dev` and verify each fix:

1. **Auth lockout fix:** Create a test account, do NOT verify email, reset password, log in — should succeed (auto-verified). Also verify the "Resend verification email" button appears when email is not verified.
2. **Unknown Campaign:** Log in as creator (Damewillie@gmail.com), check dashboard recent activity — no "Unknown Campaign" entries.
3. **"D" avatar removed:** Navigate to Available Campaigns as creator — no avatar badge in header.
4. **My Campaigns styling:** Navigate to My Campaigns — white background, sidebar nav on desktop, bottom nav on mobile.
5. **Content review guard:** Navigate to a campaign collaboration as restaurant where content_status = 'submitted' — should show content gallery or "Waiting for [name]" if no files.
6. **Help Center:** Navigate to /help — should show 7 categories, articles should have inline screenshots, new Donny AI and Messaging articles visible.

- [ ] **Step 3: Final commit (if any touch-ups needed)**

```bash
git add -A
git commit -m "fix: final touch-ups from smoke testing"
```
