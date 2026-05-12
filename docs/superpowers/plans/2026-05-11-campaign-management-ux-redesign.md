# Campaign Management UX Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the business campaign detail page around status-driven banners with clear CTAs, add collapsible sections, fix desktop layouts, enhance the payment timeline with campaign context and Stripe links, and add pending action banners to the dashboard.

**Architecture:** New `CampaignStatusBanner` component replaces `CampaignDetailHeader` and absorbs `EscrowPaymentAlert`. All campaign detail sections wrapped in extended `CollapsibleBriefSection`. `PaymentTimeline` gets a campaign header card. New `PendingActionBanners` component added to `BusinessDashboard`. Each task is independent and produces a buildable state.

**Tech Stack:** React, TypeScript, Tailwind CSS, Radix UI (Collapsible), React Query, Supabase, Lucide icons

**Spec:** `docs/superpowers/specs/2026-05-11-campaign-management-ux-redesign.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/lib/campaignPhase.ts` | Modify | Update Draft badge class from gray to teal |
| `src/components/campaign-details/CollapsibleBriefSection.tsx` | Modify | Add optional `subtitle` prop |
| `src/components/campaigns/detail/CampaignStatusBanner.tsx` | Create | Status-driven banner with per-state rendering + kebab menu |
| `src/pages/CampaignDetailsPage.tsx` | Modify | Replace header/escrow with status banner, restructure layout, widen max-width |
| `src/components/campaigns/detail/CollapsibleCampaignDetails.tsx` | Modify | Refactor into individual CollapsibleBriefSection wrappers with subtitles |
| `src/components/campaigns/CampaignCard.tsx` | Modify | Add Draft CTA, action-needed card emphasis |
| `src/pages/CampaignsPage.tsx` | Modify | Widen max-width, inline Create button on desktop |
| `src/components/payments/PaymentTimeline.tsx` | Modify | Add campaign header card with name + Stripe link |
| `src/components/dashboard/PendingActionBanners.tsx` | Create | Dashboard notification banners for campaigns awaiting action |
| `src/hooks/usePendingActions.ts` | Create | Hook to query pending applications and unreviewed content |
| `src/pages/BusinessDashboard.tsx` | Modify | Render PendingActionBanners above content |

---

### Task 1: Update Draft badge class in campaignPhase.ts

**Files:**
- Modify: `src/lib/campaignPhase.ts:51-52`

- [ ] **Step 1: Update getStatusBadgeClass for draft**

In `src/lib/campaignPhase.ts`, find `getStatusBadgeClass` and change the `draft` case and default:

```typescript
// Change from:
case 'draft':     return 'bg-gray-200 text-gray-700';
// To:
case 'draft':     return 'bg-teal-50 text-teal-700';
```

```typescript
// Change from:
default:          return 'bg-gray-200 text-gray-700';
// To:
default:          return 'bg-teal-50 text-teal-700';
```

- [ ] **Step 2: Build and verify**

Run: `npm run build`
Expected: Clean build, no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/campaignPhase.ts
git commit -m "fix: replace gray draft badge with teal — no gray in DragonCandy"
```

---

### Task 2: Add subtitle prop to CollapsibleBriefSection

**Files:**
- Modify: `src/components/campaign-details/CollapsibleBriefSection.tsx`

- [ ] **Step 1: Add subtitle prop to interface and render**

Replace the full component file with:

```typescript
import type { ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from '@/components/ui/collapsible';

interface CollapsibleBriefSectionProps {
  title: string;
  subtitle?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}

export function CollapsibleBriefSection({
  title,
  subtitle,
  defaultOpen = false,
  children,
}: CollapsibleBriefSectionProps) {
  return (
    <Collapsible defaultOpen={defaultOpen}>
      <CollapsibleTrigger className="flex w-full items-center justify-between py-1 group">
        <div className="flex items-center gap-2 min-w-0">
          <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider shrink-0">
            {title}
          </h3>
          {subtitle && (
            <span className="text-xs text-gray-500 truncate">{subtitle}</span>
          )}
        </div>
        <ChevronDown className="h-4 w-4 text-gray-500 transition-transform duration-200 group-data-[state=open]:rotate-180 shrink-0 ml-2" />
      </CollapsibleTrigger>
      <CollapsibleContent className="overflow-hidden data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up">
        <div className="pt-3">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  );
}
```

- [ ] **Step 2: Build and verify**

Run: `npm run build`
Expected: Clean build. Existing usages pass no `subtitle` and work unchanged.

- [ ] **Step 3: Commit**

```bash
git add src/components/campaign-details/CollapsibleBriefSection.tsx
git commit -m "feat: add subtitle prop to CollapsibleBriefSection for preview hints"
```

---

### Task 3: Create CampaignStatusBanner component

**Files:**
- Create: `src/components/campaigns/detail/CampaignStatusBanner.tsx`

This is the core new component. It derives a banner state from campaign phase, status, application count, and step, then renders a state-specific banner with headline, subtext, CTAs, and the overflow menu.

- [ ] **Step 1: Create the component file**

Create `src/components/campaigns/detail/CampaignStatusBanner.tsx`:

```typescript
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  MoreHorizontal,
  Pencil,
  AlertTriangle,
  Megaphone,
  Clock,
  Eye,
  Rocket,
  CheckCircle,
  XCircle,
  Loader2,
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import {
  type CampaignPhase,
  type ProjectStep,
  needsBusinessAction,
  PROJECT_STEPS,
  getStepIndex,
} from '@/lib/campaignPhase';

type BannerState =
  | 'draft'
  | 'payment_pending'
  | 'published'
  | 'pending_review'
  | 'action_needed'
  | 'active'
  | 'completed'
  | 'cancelled';

interface CampaignStatusBannerProps {
  campaign: {
    id: string;
    title: string;
    status: string;
    escrow_status?: string | null;
  };
  phase: CampaignPhase;
  currentStep: ProjectStep | null;
  applicationCount: number;
  oldestApplicantName?: string | null;
  oldestApplicantDaysAgo?: number;
  creatorName?: string | null;
  deliverableCount?: number;
  hasReviewed?: boolean;
  isLoading?: boolean;
  isError?: boolean;
  onRetry?: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onRelaunch: () => void;
  onPayEscrow: () => void;
  onReviewApplications: () => void;
  onReviewContent: () => void;
  onRequestRevision: () => void;
  onViewDeliverables: () => void;
  onLeaveReview: () => void;
  isPayingEscrow?: boolean;
}

function deriveBannerState(
  phase: CampaignPhase,
  status: string,
  escrowStatus: string | null | undefined,
  applicationCount: number,
  step: ProjectStep | null,
): BannerState {
  if (phase === 'cancelled') return 'cancelled';
  if (phase === 'completed') return 'completed';
  if (phase === 'active_delivery') {
    return step && needsBusinessAction(step) ? 'action_needed' : 'active';
  }
  // pre_hire
  if (status === 'draft') return 'draft';
  if (escrowStatus === 'pending') return 'payment_pending';
  if (applicationCount > 0) return 'pending_review';
  return 'published';
}

const bannerStyles: Record<BannerState, string> = {
  draft: 'bg-teal-50 border-2 border-teal-300',
  payment_pending: 'bg-amber-50 border-2 border-amber-400',
  published: 'bg-teal-50 border-2 border-teal-300',
  pending_review: 'bg-amber-50 border-2 border-amber-400',
  action_needed: 'bg-pink-50 border-2 border-pink-400',
  active: 'bg-teal-50 border-2 border-teal-300',
  completed: 'bg-green-50 border-2 border-green-300',
  cancelled: 'bg-red-50 border-2 border-red-300',
};

const bannerIcons: Record<BannerState, React.ReactNode> = {
  draft: <Pencil className="h-5 w-5 text-teal-600" />,
  payment_pending: <AlertTriangle className="h-5 w-5 text-amber-600" />,
  published: <Megaphone className="h-5 w-5 text-teal-600" />,
  pending_review: <Clock className="h-5 w-5 text-amber-600" />,
  action_needed: <Eye className="h-5 w-5 text-pink-600" />,
  active: <Rocket className="h-5 w-5 text-teal-600" />,
  completed: <CheckCircle className="h-5 w-5 text-green-600" />,
  cancelled: <XCircle className="h-5 w-5 text-red-600" />,
};

export const CampaignStatusBanner: React.FC<CampaignStatusBannerProps> = ({
  campaign,
  phase,
  currentStep,
  applicationCount,
  oldestApplicantName,
  oldestApplicantDaysAgo,
  creatorName,
  deliverableCount,
  hasReviewed,
  isLoading,
  isError,
  onRetry,
  onEdit,
  onDelete,
  onRelaunch,
  onPayEscrow,
  onReviewApplications,
  onReviewContent,
  onRequestRevision,
  onViewDeliverables,
  onLeaveReview,
  isPayingEscrow,
}) => {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  if (isLoading) {
    return <Skeleton className="h-24 rounded-xl bg-teal-50" />;
  }

  if (isError) {
    return (
      <div className="bg-teal-50 border-2 border-teal-300 rounded-2xl p-4 flex items-center justify-between">
        <span className="text-sm font-semibold text-teal-800">Unable to load campaign status</span>
        <Button size="sm" variant="outline" className="rounded-full border-teal-300 text-teal-600" onClick={onRetry}>
          Try Again
        </Button>
      </div>
    );
  }

  const state = deriveBannerState(phase, campaign.status, campaign.escrow_status, applicationCount, currentStep);

  const canDelete = phase === 'pre_hire' && campaign.escrow_status !== 'held';
  const canEdit = phase === 'pre_hire';
  const canRelaunch = phase === 'completed' || phase === 'cancelled';
  const showMenu = canEdit || canDelete || canRelaunch;

  const renderHeadline = (): string => {
    switch (state) {
      case 'draft': return 'Draft — Not Published';
      case 'payment_pending': return 'Payment Required to Publish';
      case 'published': return 'Campaign Published — Awaiting Applications';
      case 'pending_review':
        return applicationCount === 1
          ? '1 Application Awaiting Your Review'
          : `${applicationCount} Applications Awaiting Your Review`;
      case 'action_needed': return 'Content Ready for Your Review';
      case 'active': return 'Campaign In Progress';
      case 'completed': return 'Campaign Completed';
      case 'cancelled': return 'Campaign Cancelled';
    }
  };

  const renderSubtext = (): string => {
    switch (state) {
      case 'draft': return 'This campaign hasn\'t been published yet. Review and publish when ready.';
      case 'payment_pending': return 'Complete your Stripe checkout to make this campaign visible to creators.';
      case 'published': return 'Your campaign is live. Creators can now discover and apply.';
      case 'pending_review':
        if (applicationCount === 1 && oldestApplicantName) {
          return `${oldestApplicantName} applied ${oldestApplicantDaysAgo ?? 0} day${(oldestApplicantDaysAgo ?? 0) !== 1 ? 's' : ''} ago. Review their profile to accept or decline.`;
        }
        return `${applicationCount} creators have applied.${oldestApplicantName ? ` Oldest: ${oldestApplicantName}, ${oldestApplicantDaysAgo ?? 0} day${(oldestApplicantDaysAgo ?? 0) !== 1 ? 's' : ''} ago.` : ''}`;
      case 'action_needed':
        return `${creatorName ?? 'Creator'} submitted ${deliverableCount ?? 0} deliverable${(deliverableCount ?? 0) !== 1 ? 's' : ''}. Approve to release payment, or request revisions.`;
      case 'active': {
        if (currentStep) {
          const idx = getStepIndex(currentStep);
          const stepInfo = PROJECT_STEPS[idx];
          return `Step ${idx + 1} of ${PROJECT_STEPS.length} — ${stepInfo.label}`;
        }
        return 'Campaign is in active delivery.';
      }
      case 'completed': return 'All deliverables received and payment released.';
      case 'cancelled': return 'This campaign is no longer active.';
    }
  };

  const renderCtas = () => {
    switch (state) {
      case 'draft':
        return (
          <Button onClick={onEdit} className="rounded-full bg-teal-400 hover:bg-teal-500 text-white font-semibold w-full lg:w-auto">
            Edit Draft
          </Button>
        );
      case 'payment_pending':
        return (
          <Button onClick={onPayEscrow} disabled={isPayingEscrow} className="rounded-full bg-amber-500 hover:bg-amber-600 text-white font-semibold w-full lg:w-auto">
            {isPayingEscrow ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Processing…</> : 'Pay & Publish'}
          </Button>
        );
      case 'published':
        return null;
      case 'pending_review':
        return (
          <Button onClick={onReviewApplications} className="rounded-full bg-amber-500 hover:bg-amber-600 text-white font-semibold w-full lg:w-auto">
            Review Applications →
          </Button>
        );
      case 'action_needed':
        return (
          <div className="flex gap-2 w-full lg:w-auto">
            <Button onClick={onReviewContent} className="rounded-full bg-teal-400 hover:bg-teal-500 text-white font-semibold flex-1 lg:flex-none">
              Review & Approve
            </Button>
            <Button onClick={onRequestRevision} variant="outline" className="rounded-full border-pink-400 text-pink-600 hover:bg-pink-50 font-semibold flex-1 lg:flex-none">
              Request Revision
            </Button>
          </div>
        );
      case 'active':
        return null;
      case 'completed':
        return hasReviewed ? (
          <Button onClick={onViewDeliverables} className="rounded-full bg-green-500 hover:bg-green-600 text-white font-semibold w-full lg:w-auto">
            View Deliverables
          </Button>
        ) : (
          <Button onClick={onLeaveReview} className="rounded-full bg-green-500 hover:bg-green-600 text-white font-semibold w-full lg:w-auto">
            Leave a Review
          </Button>
        );
      case 'cancelled':
        return (
          <div className="flex gap-2 w-full lg:w-auto">
            <Button onClick={onRelaunch} className="rounded-full bg-teal-400 hover:bg-teal-500 text-white font-semibold flex-1 lg:flex-none">
              Re-Launch Campaign
            </Button>
            <Button onClick={() => setShowDeleteConfirm(true)} variant="outline" className="rounded-full border-red-300 text-red-600 hover:bg-red-50 font-semibold flex-1 lg:flex-none">
              Delete
            </Button>
          </div>
        );
    }
  };

  const renderProgressBar = () => {
    if (state !== 'active' || !currentStep) return null;
    const idx = getStepIndex(currentStep);
    const progress = ((idx + 1) / PROJECT_STEPS.length) * 100;
    return (
      <div className="h-1.5 bg-teal-100 rounded-full mt-2 overflow-hidden">
        <div className="h-full bg-teal-400 rounded-full transition-all" style={{ width: `${progress}%` }} />
      </div>
    );
  };

  return (
    <>
      <div className={`${bannerStyles[state]} rounded-2xl p-4`}>
        <div className="flex items-start gap-3">
          <div className="mt-0.5 shrink-0">{bannerIcons[state]}</div>
          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-bold text-sm text-gray-900">{renderHeadline()}</p>
                <p className="text-xs text-gray-600 mt-0.5">{renderSubtext()}</p>
              </div>
              {showMenu && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 rounded-full shrink-0">
                      <MoreHorizontal className="h-4 w-4" />
                      <span className="sr-only">More options</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {canEdit && <DropdownMenuItem onClick={onEdit}>Edit Campaign</DropdownMenuItem>}
                    {canDelete && (
                      <DropdownMenuItem onClick={() => setShowDeleteConfirm(true)} className="text-red-600">
                        Delete Campaign
                      </DropdownMenuItem>
                    )}
                    {canRelaunch && <DropdownMenuItem onClick={onRelaunch}>Re-Launch Campaign</DropdownMenuItem>}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
            {renderProgressBar()}
            <div className="pt-1">{renderCtas()}</div>
          </div>
        </div>
      </div>

      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Campaign</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete "{campaign.title}". This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-full">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={onDelete} className="rounded-full bg-red-500 hover:bg-red-600 text-white">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
```

- [ ] **Step 2: Build and verify**

Run: `npm run build`
Expected: Clean build. Component is not yet imported anywhere — this is a new file.

- [ ] **Step 3: Commit**

```bash
git add src/components/campaigns/detail/CampaignStatusBanner.tsx
git commit -m "feat: add CampaignStatusBanner with per-state banners and CTAs"
```

---

### Task 4: Integrate CampaignStatusBanner into CampaignDetailsPage

**Files:**
- Modify: `src/pages/CampaignDetailsPage.tsx`

This task replaces `CampaignDetailHeader` and `EscrowPaymentAlert` with the new `CampaignStatusBanner`, restructures the business view section layout, and widens the desktop max-width.

- [ ] **Step 1: Update imports**

In `src/pages/CampaignDetailsPage.tsx`, make these import changes:

1. Add `useEffect` to the React import:

```typescript
// Change from:
import React, { useState } from 'react';
// To:
import React, { useState, useEffect } from 'react';
```

2. Replace the old header/escrow imports with the new status banner:

```typescript
// Remove these two lines:
import { CampaignDetailHeader } from '@/components/campaigns/detail/CampaignDetailHeader';
import { EscrowPaymentAlert } from '@/components/campaigns/detail/EscrowPaymentAlert';

// Add this line:
import { CampaignStatusBanner } from '@/components/campaigns/detail/CampaignStatusBanner';
```

3. Add these new imports:

```typescript
import { useCampaignApplicationsCount } from '@/hooks/useCampaignApplicationsCount';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
```

4. Extend the existing `@tanstack/react-query` import to include `useQueryClient`:

```typescript
// Change from:
import { useQuery } from '@tanstack/react-query';
// To:
import { useQuery, useQueryClient } from '@tanstack/react-query';
```

- [ ] **Step 2: Add application count, escrow payment, and Stripe redirect handling**

Inside the component, after the `deleteCampaign` and `duplicateCampaign` hooks, add:

```typescript
const { toast } = useToast();
const queryClient = useQueryClient();

// Application count for the status banner
const { data: applicationCounts } = useCampaignApplicationsCount(id ?? '');
const applicationCount = applicationCounts?.total ?? 0;

// Escrow payment state
const [isPayingEscrow, setIsPayingEscrow] = useState(false);
```

Add the Stripe redirect handler (ported from `EscrowPaymentAlert` which is being removed). Place this `useEffect` after the state declarations. **Important:** The file already declares `const searchParams = new URLSearchParams(location.search)` at line 50 — reuse that variable, do NOT declare a new one:

```typescript
// Handle Stripe redirect back to detail page
useEffect(() => {
  const paymentParam = searchParams.get('payment');
  if (!paymentParam || !id) return;

  if (paymentParam === 'success') {
    const verify = async () => {
      try {
        const { data, error } = await supabase.functions.invoke('verify-campaign-escrow', {
          body: { campaignId: id },
        });
        if (error) throw error;
        if (data?.success) {
          toast({ title: 'Payment Confirmed!', description: 'Your campaign is now published and visible to creators.' });
          queryClient.invalidateQueries({ queryKey: ['campaigns'] });
          queryClient.invalidateQueries({ queryKey: ['campaign', id] });
        } else {
          toast({ variant: 'destructive', title: 'Payment Pending', description: 'Payment not yet confirmed. Please refresh.' });
        }
      } catch {
        toast({ variant: 'destructive', title: 'Verification Failed', description: 'Could not verify payment. Please refresh.' });
      }
    };
    void verify();
  } else if (paymentParam === 'cancelled') {
    toast({ title: 'Payment Cancelled', description: 'Your campaign was saved as a draft. You can pay escrow later.' });
  }

  // Clear the payment param from the URL
  navigate(location.pathname, { replace: true });
// eslint-disable-next-line react-hooks/exhaustive-deps
}, []);
```

Add the escrow payment handler:

```typescript
const handlePayEscrow = async () => {
  if (!campaign) return;
  setIsPayingEscrow(true);
  try {
    const { data: verifyData } = await supabase.functions.invoke('verify-campaign-escrow', {
      body: { campaignId: campaign.id },
    });
    if (verifyData?.success && verifyData?.status === 'held') {
      toast({ title: 'Payment Already Verified!', description: 'Your campaign is published.' });
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      queryClient.invalidateQueries({ queryKey: ['campaign', campaign.id] });
      setIsPayingEscrow(false);
      return;
    }
  } catch { /* proceed to checkout */ }

  const checkoutWindow = window.open('about:blank', '_blank');
  try {
    const { data, error } = await supabase.functions.invoke('create-campaign-escrow', {
      body: {
        campaignId: campaign.id,
        amount: campaign.fixed_price || 0,
        deliveryFee: campaign.delivery_fee || 0,
        campaignTitle: campaign.title,
        deliveryType: campaign.delivery_type || 'standard',
      },
    });
    if (error) throw error;
    if (data?.alreadyPaid) {
      checkoutWindow?.close();
      toast({ title: 'Already Paid', description: 'This campaign has already been paid for.' });
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      setIsPayingEscrow(false);
      return;
    }
    if (data?.url && checkoutWindow) {
      checkoutWindow.location.href = data.url;
    } else if (data?.url) {
      checkoutWindow?.close();
      toast({ title: 'Popup Blocked', description: 'Click below to open payment.',
        action: <Button variant="outline" size="sm" onClick={() => window.open(data.url, '_blank')}>Open Payment</Button>,
      });
    }
  } catch {
    checkoutWindow?.close();
    toast({ variant: 'destructive', title: 'Payment Failed', description: 'Could not initiate payment.' });
  } finally {
    setIsPayingEscrow(false);
  }
};
```

- [ ] **Step 3: Replace the business view header and escrow alert**

In the business view return block (starting around line 279), replace the `md:max-w-4xl` with `lg:max-w-6xl`:

```typescript
// Change from:
<div className="w-full max-w-full md:max-w-4xl md:mx-auto p-4 space-y-4 pb-24 md:pb-6">
// To:
<div className="w-full max-w-full lg:max-w-6xl md:mx-auto p-4 space-y-4 pb-24 md:pb-6">
```

Replace the `<CampaignDetailHeader>` and `{phase === 'pre_hire' && campaign.escrow_status === 'pending' && (<EscrowPaymentAlert .../>)}` block with:

```tsx
<CampaignStatusBanner
  campaign={campaign}
  phase={phase}
  currentStep={currentStep}
  applicationCount={applicationCount}
  creatorName={creatorData?.creator_name}
  isLoading={false}
  onEdit={() => navigate(`/dashboard/business/campaigns/${id}/edit`)}
  onDelete={handleDelete}
  onRelaunch={handleRelaunch}
  onPayEscrow={handlePayEscrow}
  onReviewApplications={() => {
    const el = document.getElementById('applications-section');
    el?.scrollIntoView({ behavior: 'smooth' });
  }}
  onReviewContent={() => {
    const el = document.getElementById('content-review-section');
    el?.scrollIntoView({ behavior: 'smooth' });
  }}
  onRequestRevision={() => {
    const el = document.getElementById('content-review-section');
    el?.scrollIntoView({ behavior: 'smooth' });
  }}
  onViewDeliverables={() => {
    const el = document.getElementById('deliverables-section');
    el?.scrollIntoView({ behavior: 'smooth' });
  }}
  onLeaveReview={() => setShowRatingModal(true)}
  isPayingEscrow={isPayingEscrow}
/>
```

Also remove the standalone `EscrowPaymentAlert` block that was conditionally rendered.

- [ ] **Step 4: Also widen the loading skeleton max-width**

Around line 268, change the loading skeleton wrapper:

```typescript
// Change from:
<div className="w-full max-w-full md:max-w-4xl md:mx-auto p-4 space-y-4">
// To:
<div className="w-full max-w-full lg:max-w-6xl md:mx-auto p-4 space-y-4">
```

- [ ] **Step 5: Build and verify**

Run: `npm run build`
Expected: Clean build. The page now renders `CampaignStatusBanner` instead of `CampaignDetailHeader` + `EscrowPaymentAlert`.

- [ ] **Step 6: Commit**

```bash
git add src/pages/CampaignDetailsPage.tsx
git commit -m "feat: integrate CampaignStatusBanner into campaign detail page"
```

---

### Task 5: Restructure collapsible sections on campaign detail page

**Files:**
- Modify: `src/components/campaigns/detail/CollapsibleCampaignDetails.tsx`
- Modify: `src/pages/CampaignDetailsPage.tsx`

This task refactors the single `CollapsibleCampaignDetails` block into individual `CollapsibleBriefSection` wrappers for each detail section, with subtitle hints and phase-based auto-expand rules. The existing `CampaignDetailsOverview` renders 4 sections (`CampaignOverviewSection`, `ContentRequirementsSection`, `CompensationSection`, `LogisticsSection`) inside one collapsible — these need to be individually collapsible.

- [ ] **Step 1: Rewrite CollapsibleCampaignDetails to render individual sections**

Replace the full content of `src/components/campaigns/detail/CollapsibleCampaignDetails.tsx`:

```typescript
import React from 'react';
import { CollapsibleBriefSection } from '@/components/campaign-details/CollapsibleBriefSection';
import { CampaignOverviewSection } from '@/components/campaign-details/sections/CampaignOverviewSection';
import { ContentRequirementsSection } from '@/components/campaign-details/sections/ContentRequirementsSection';
import { CompensationSection } from '@/components/campaign-details/sections/CompensationSection';
import { LogisticsSection } from '@/components/campaign-details/sections/LogisticsSection';
import type { Campaign } from '@/hooks/useCampaignQueries';
import type { CampaignPhase } from '@/lib/campaignPhase';
import { formatBudget } from '@/lib/campaignPhase';

interface CollapsibleCampaignDetailsProps {
  campaign: Campaign;
  phase: CampaignPhase;
}

function buildOverviewSubtitle(campaign: Campaign): string {
  const parts: string[] = [];
  const budget = formatBudget(campaign);
  if (budget) parts.push(budget);
  if (campaign.platforms?.length) parts.push(campaign.platforms.slice(0, 2).join(', '));
  return parts.join(' · ');
}

export const CollapsibleCampaignDetails: React.FC<CollapsibleCampaignDetailsProps> = ({
  campaign,
  phase,
}) => {
  const overviewOpen = phase === 'pre_hire' || phase === 'cancelled';

  return (
    <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden lg:sticky lg:top-4 p-4 space-y-1">
      <CollapsibleBriefSection
        title="Campaign Overview"
        subtitle={buildOverviewSubtitle(campaign)}
        defaultOpen={overviewOpen}
      >
        <CampaignOverviewSection campaign={campaign} />
      </CollapsibleBriefSection>

      <CollapsibleBriefSection title="Content Requirements">
        <ContentRequirementsSection campaign={campaign} campaignId={campaign.id} />
      </CollapsibleBriefSection>

      <CollapsibleBriefSection title="Compensation & Terms">
        <CompensationSection campaign={campaign} campaignId={campaign.id} role="business" />
      </CollapsibleBriefSection>

      <CollapsibleBriefSection title="Logistics & Targeting">
        <LogisticsSection campaign={campaign} />
      </CollapsibleBriefSection>
    </div>
  );
};
```

- [ ] **Step 2: Build and verify**

Run: `npm run build`
Expected: Clean build. The campaign detail sidebar now shows 4 individually collapsible sections instead of one monolithic block.

- [ ] **Step 3: Commit**

```bash
git add src/components/campaigns/detail/CollapsibleCampaignDetails.tsx
git commit -m "refactor: split campaign details into individual collapsible sections with subtitles"
```

---

### Task 6: Add Draft CTA and action-needed emphasis to CampaignCard

**Files:**
- Modify: `src/components/campaigns/CampaignCard.tsx`

- [ ] **Step 1: Add `campaignStatus` param and draft branch to `getCtaLabel`**

In `src/components/campaigns/CampaignCard.tsx`, find the `getCtaLabel` function (starts around line 31). Add `campaignStatus: string` as the last parameter and insert the draft check after `'View Progress'` but before the `applicationCount` check:

```typescript
// Change from:
function getCtaLabel(
  phase: CampaignPhase,
  step: ProjectStep | null,
  escrowStatus: string | null | undefined,
  applicationCount: number
): string {
// To:
function getCtaLabel(
  phase: CampaignPhase,
  step: ProjectStep | null,
  escrowStatus: string | null | undefined,
  applicationCount: number,
  campaignStatus: string,
): string {
```

Then add this line after `if (phase === 'active_delivery') return 'View Progress';`:

```typescript
  if (campaignStatus === 'draft') return 'Edit Draft';
```

- [ ] **Step 2: Add Edit Draft case to `getCtaClass`**

In the `getCtaClass` function (starts around line 46), add a new line before the `return` fallback:

```typescript
  if (label === 'Edit Draft') return 'rounded-full bg-teal-400 hover:bg-teal-500 text-white font-semibold w-full';
```

- [ ] **Step 3: Update the `getCtaLabel` call site**

Find the call site (around line 90):

```typescript
// Change from:
const ctaLabel = getCtaLabel(phase, step, campaign.escrow_status, applicationCount);
// To:
const ctaLabel = getCtaLabel(phase, step, campaign.escrow_status, applicationCount, campaign.status);
```

- [ ] **Step 4: Add draft route to `handleCta`**

Find `handleCta` (around line 162). Add the draft route after the escrow check:

```typescript
// Change from:
const handleCta = () => {
  if (ctaLabel === 'Pay & Publish →') { handlePayEscrow(); return; }
  navigate(`/dashboard/business/campaigns/${campaign.id}`);
};
// To:
const handleCta = () => {
  if (ctaLabel === 'Pay & Publish →') { handlePayEscrow(); return; }
  if (ctaLabel === 'Edit Draft') {
    navigate(`/dashboard/business/campaigns/${campaign.id}/edit`);
    return;
  }
  navigate(`/dashboard/business/campaigns/${campaign.id}`);
};
```

- [ ] **Step 5: Add action-needed card emphasis**

Find the `<Card>` element (around line 170):

```typescript
// Change from:
<Card className="overflow-hidden hover:shadow-lg transition-shadow duration-200 border border-gray-200">
// To:
<Card className={`overflow-hidden hover:shadow-lg transition-shadow duration-200 ${
  phase === 'active_delivery' && step && needsBusinessAction(step)
    ? 'border-2 border-pink-400 bg-pink-50/50'
    : 'border border-gray-200'
}`}>
```

- [ ] **Step 6: Build and verify**

Run: `npm run build`
Expected: Clean build.

- [ ] **Step 7: Commit**

```bash
git add src/components/campaigns/CampaignCard.tsx
git commit -m "feat: add Edit Draft CTA and pink emphasis for action-needed campaign cards"
```

---

### Task 7: Fix CampaignsPage desktop layout

**Files:**
- Modify: `src/pages/CampaignsPage.tsx`

- [ ] **Step 1: Widen max-width**

In `src/pages/CampaignsPage.tsx`, find the outer container (around line 106):

```typescript
// Change from:
<div className="min-h-screen bg-white overflow-x-hidden w-full max-w-full md:max-w-4xl md:mx-auto">
// To:
<div className="min-h-screen bg-white overflow-x-hidden w-full max-w-full lg:max-w-6xl md:mx-auto">
```

- [ ] **Step 2: Inline the Create button on desktop**

Find the Create Campaign CTA section (around line 124-132):

```typescript
// Change from:
<div className="px-4 pt-3 pb-1">
  <button
    onClick={() => navigate('/dashboard/business/campaigns/create')}
    className="w-full bg-teal-400 text-white font-bold py-3 rounded-full text-[15px] hover:bg-teal-500 transition-colors"
  >
    Create a Campaign
  </button>
</div>
// To:
<div className="px-4 pt-3 pb-1 lg:flex lg:justify-between lg:items-center">
  <h2 className="text-lg font-bold uppercase tracking-wide text-teal-500 hidden lg:block">
    Campaigns
  </h2>
  <button
    onClick={() => navigate('/dashboard/business/campaigns/create')}
    className="w-full lg:w-auto bg-teal-400 text-white font-bold py-3 px-6 rounded-full text-[15px] hover:bg-teal-500 transition-colors"
  >
    + Create Campaign
  </button>
</div>
```

- [ ] **Step 3: Build and verify**

Run: `npm run build`
Expected: Clean build.

- [ ] **Step 4: Commit**

```bash
git add src/pages/CampaignsPage.tsx
git commit -m "feat: fix campaigns list desktop layout — wider max-width with inline Create button"
```

---

### Task 8: Add campaign header card and Stripe link to PaymentTimeline

**Files:**
- Modify: `src/components/payments/PaymentTimeline.tsx`

**Important:** `useCampaign(campaignId)` wraps `useCampaignById`, which only selects from the `campaigns` table — it does NOT return `creator_name`. To get the creator name, we need a lightweight inline query that joins `campaign_collaborations` → `creator_profiles`.

- [ ] **Step 1: Add imports and Stripe URL helper**

At the top of `src/components/payments/PaymentTimeline.tsx`, add these imports alongside the existing ones:

```typescript
import { ExternalLink } from "lucide-react";
import { useCampaign } from "@/hooks/useCampaigns";
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
```

Add this helper function before the `PaymentTimeline` component:

```typescript
function getStripeUrl(stripeId: string | null): string {
  if (!stripeId) return 'https://dashboard.stripe.com/test/payments';
  if (stripeId.startsWith('tr_')) return `https://dashboard.stripe.com/test/connect/transfers/${stripeId}`;
  if (stripeId.startsWith('pi_') || stripeId.startsWith('ch_')) return `https://dashboard.stripe.com/test/payments/${stripeId}`;
  return 'https://dashboard.stripe.com/test/payments';
}
```

- [ ] **Step 2: Destructure `campaignId` and add queries**

The `PaymentTimeline` component's props interface already declares `campaignId: string`, but the component body doesn't destructure it. Update the destructuring to include it:

```typescript
// Change from:
export function PaymentTimeline({ entityType, entityId, userRole, variant }: PaymentTimelineProps) {
// To:
export function PaymentTimeline({ entityType, entityId, campaignId, userRole, variant }: PaymentTimelineProps) {
```

Inside the component, after the `usePaymentTimeline` call, add:

```typescript
const { campaign } = useCampaign(campaignId);

// Fetch creator name via collaboration (useCampaign doesn't include it)
// FK campaign_collaborations_creator_id_fkey references `profiles` (not creator_profiles)
const { data: creatorName } = useQuery({
  queryKey: ['campaign-creator-name', campaignId],
  queryFn: async () => {
    const { data } = await supabase
      .from('campaign_collaborations')
      .select('profiles!campaign_collaborations_creator_id_fkey(full_name)')
      .eq('campaign_id', campaignId)
      .limit(1)
      .maybeSingle();
    const profile = data?.profiles as unknown as { full_name: string | null } | null;
    return profile?.full_name ?? null;
  },
  enabled: !!campaignId,
  staleTime: 300_000,
});
```

- [ ] **Step 3: Render campaign header card above timeline**

After the loading skeleton `return` and the `if (error || !events?.length) return null;` check, add:

```typescript
const latestStripeId = [...events].reverse().find(e => e.stripe_id)?.stripe_id ?? null;
```

Then inside the `return` JSX, before the `<h3>` heading, add:

```tsx
{/* Campaign header card */}
{variant === 'full' && campaign && (
  <div className="flex items-center justify-between p-3 bg-teal-50 border border-teal-200 rounded-xl mb-4">
    <div className="flex items-center gap-2 min-w-0">
      <span className="text-sm">🎬</span>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-gray-900 truncate">{campaign.title}</p>
        {creatorName && (
          <p className="text-xs text-gray-500">with {creatorName}</p>
        )}
      </div>
    </div>
    <a
      href={getStripeUrl(latestStripeId)}
      target="_blank"
      rel="noopener noreferrer"
      className="text-xs text-teal-600 font-medium hover:underline flex items-center gap-1 shrink-0 ml-2"
    >
      View in Stripe <ExternalLink className="h-3 w-3" />
    </a>
  </div>
)}
```

- [ ] **Step 4: Build and verify**

Run: `npm run build`
Expected: Clean build.

- [ ] **Step 5: Commit**

```bash
git add src/components/payments/PaymentTimeline.tsx
git commit -m "feat: add campaign header card with Stripe link to PaymentTimeline"
```

---

### Task 9: Create PendingActionBanners and usePendingActions hook

**Files:**
- Create: `src/hooks/usePendingActions.ts`
- Create: `src/components/dashboard/PendingActionBanners.tsx`

- [ ] **Step 1: Create the usePendingActions hook**

Create `src/hooks/usePendingActions.ts`:

```typescript
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface PendingAction {
  campaignId: string;
  campaignTitle: string;
  actionType: 'review_application' | 'review_content';
  creatorName: string;
  daysAgo: number;
}

export function usePendingActions() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['pending-actions', user?.id],
    queryFn: async (): Promise<PendingAction[]> => {
      const actions: PendingAction[] = [];

      // Pending applications
      // FK: campaign_applications_creator_id_fkey → profiles (column: creator_id)
      const { data: pendingApps } = await supabase
        .from('campaign_applications')
        .select(`
          id,
          created_at,
          campaign_id,
          campaigns!inner(title, user_id),
          profiles!campaign_applications_creator_id_fkey(full_name)
        `)
        .eq('status', 'pending')
        .eq('campaigns.user_id', user!.id);

      if (pendingApps) {
        for (const app of pendingApps) {
          const createdAt = new Date(app.created_at);
          const daysAgo = Math.floor((Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24));
          const campaign = app.campaigns as unknown as { title: string; user_id: string };
          const profile = app.profiles as unknown as { full_name: string | null };
          actions.push({
            campaignId: app.campaign_id,
            campaignTitle: campaign?.title ?? 'Untitled Campaign',
            actionType: 'review_application',
            creatorName: profile?.full_name ?? 'A creator',
            daysAgo,
          });
        }
      }

      // Content submitted but not reviewed
      // FK: campaign_collaborations_creator_id_fkey → profiles (column: creator_id)
      const { data: pendingContent } = await supabase
        .from('campaign_collaborations')
        .select(`
          id,
          updated_at,
          campaign_id,
          campaigns!inner(title, user_id),
          profiles!campaign_collaborations_creator_id_fkey(full_name)
        `)
        .eq('content_status', 'submitted')
        .eq('status', 'active')
        .eq('campaigns.user_id', user!.id);

      if (pendingContent) {
        for (const collab of pendingContent) {
          const updatedAt = new Date(collab.updated_at);
          const daysAgo = Math.floor((Date.now() - updatedAt.getTime()) / (1000 * 60 * 60 * 24));
          const campaign = collab.campaigns as unknown as { title: string; user_id: string };
          const profile = collab.profiles as unknown as { full_name: string | null };
          actions.push({
            campaignId: collab.campaign_id,
            campaignTitle: campaign?.title ?? 'Untitled Campaign',
            actionType: 'review_content',
            creatorName: profile?.full_name ?? 'A creator',
            daysAgo,
          });
        }
      }

      return actions;
    },
    enabled: !!user?.id,
    refetchOnWindowFocus: true,
    staleTime: 60_000,
  });
}
```

- [ ] **Step 2: Create the PendingActionBanners component**

Create `src/components/dashboard/PendingActionBanners.tsx`:

```typescript
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, Eye, X } from 'lucide-react';
import { usePendingActions, type PendingAction } from '@/hooks/usePendingActions';

function isDismissed(campaignId: string): boolean {
  try {
    const key = `pendingBannerDismissed_${campaignId}`;
    const val = localStorage.getItem(key);
    if (!val) return false;
    const dismissedAt = new Date(val).getTime();
    return Date.now() - dismissedAt < 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

function dismiss(campaignId: string) {
  try {
    localStorage.setItem(`pendingBannerDismissed_${campaignId}`, new Date().toISOString());
  } catch { /* localStorage unavailable */ }
}

function ActionBanner({ action, onDismiss }: { action: PendingAction; onDismiss: () => void }) {
  const navigate = useNavigate();
  const icon = action.actionType === 'review_application'
    ? <Clock className="h-4 w-4 text-amber-600 shrink-0" />
    : <Eye className="h-4 w-4 text-pink-600 shrink-0" />;

  const message = action.actionType === 'review_application'
    ? `${action.creatorName} applied to "${action.campaignTitle}" ${action.daysAgo} day${action.daysAgo !== 1 ? 's' : ''} ago`
    : `${action.creatorName} submitted content for "${action.campaignTitle}" ${action.daysAgo} day${action.daysAgo !== 1 ? 's' : ''} ago`;

  const ctaLabel = action.actionType === 'review_application' ? 'Review Application →' : 'Review Content →';

  return (
    <div className="bg-amber-50 border border-amber-300 rounded-xl p-3 flex items-center gap-3">
      {icon}
      <p className="text-sm text-gray-800 flex-1 min-w-0">
        {message} —{' '}
        <button
          onClick={() => navigate(`/dashboard/business/campaigns/${action.campaignId}`)}
          className="font-semibold text-amber-700 hover:underline"
        >
          {ctaLabel}
        </button>
      </p>
      <button
        onClick={(e) => { e.stopPropagation(); onDismiss(); }}
        className="text-gray-400 hover:text-gray-600 shrink-0"
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

export function PendingActionBanners() {
  const { data: actions, isLoading, isError } = usePendingActions();
  const [dismissed, setDismissed] = React.useState<Set<string>>(new Set());

  if (isLoading || isError || !actions?.length) return null;

  const visible = actions.filter(a => !isDismissed(a.campaignId) && !dismissed.has(a.campaignId));
  if (visible.length === 0) return null;

  const shown = visible.slice(0, 3);
  const remaining = visible.length - 3;

  const handleDismiss = (campaignId: string) => {
    dismiss(campaignId);
    setDismissed(prev => new Set(prev).add(campaignId));
  };

  return (
    <div className="space-y-2">
      {shown.map(action => (
        <ActionBanner
          key={`${action.actionType}-${action.campaignId}`}
          action={action}
          onDismiss={() => handleDismiss(action.campaignId)}
        />
      ))}
      {remaining > 0 && (
        <p className="text-xs text-amber-600 font-medium pl-1">
          + {remaining} more campaign{remaining !== 1 ? 's' : ''} need attention
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Build and verify**

Run: `npm run build`
Expected: Clean build. Components not yet imported into the dashboard.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/usePendingActions.ts src/components/dashboard/PendingActionBanners.tsx
git commit -m "feat: add PendingActionBanners component and usePendingActions hook"
```

---

### Task 10: Integrate PendingActionBanners into BusinessDashboard

**Files:**
- Modify: `src/pages/BusinessDashboard.tsx`

- [ ] **Step 1: Import and render PendingActionBanners**

In `src/pages/BusinessDashboard.tsx`, add the import:

```typescript
import { PendingActionBanners } from '@/components/dashboard/PendingActionBanners';
```

Find the main content area (around line 106). Look for the `<div className="max-w-2xl lg:max-w-4xl mx-auto space-y-6">` wrapper and add `<PendingActionBanners />` as the first child inside it:

```tsx
<div className="max-w-2xl lg:max-w-4xl mx-auto space-y-6">
  <PendingActionBanners />
  {/* existing content continues below */}
```

- [ ] **Step 2: Build and verify**

Run: `npm run build`
Expected: Clean build.

- [ ] **Step 3: Commit**

```bash
git add src/pages/BusinessDashboard.tsx
git commit -m "feat: add PendingActionBanners to business dashboard"
```

---

### Task 11: Manual QA and cleanup

This task is not automated — it is a checklist for manual verification in the browser.

- [ ] **Step 1: Start dev server**

Run: `npm run dev`

- [ ] **Step 2: Test each campaign state on desktop (1024px+)**

Navigate to `/dashboard/business/campaigns` and verify:
- [ ] 2-column grid layout on desktop
- [ ] "Create Campaign" button is inline with heading
- [ ] Draft cards show "Edit Draft" CTA
- [ ] Action-needed cards have pink border/background
- [ ] Cards with escrow pending show "Pay & Publish →"

- [ ] **Step 3: Test campaign detail pages on desktop**

For each campaign state, navigate to the detail page and verify:
- [ ] Status banner renders with correct headline, subtext, and CTAs
- [ ] Kebab menu works (Edit, Delete, Re-Launch options per phase)
- [ ] Collapsible sections expand/collapse with chevron animation
- [ ] Right sidebar is sticky on desktop
- [ ] Campaign overview auto-expands on drafts
- [ ] Project progress auto-expands on active campaigns

- [ ] **Step 4: Test on mobile viewport (375px)**

Resize browser and verify:
- [ ] Single column layout on campaigns list
- [ ] Full-width Create button
- [ ] Status banner CTAs are full-width
- [ ] All sections stack vertically and collapse properly
- [ ] No horizontal overflow

- [ ] **Step 5: Test Payment Timeline**

Navigate to `/dashboard/payments` and verify:
- [ ] Campaign header card shows above each payment group
- [ ] Campaign name and creator name are displayed
- [ ] "View in Stripe ↗" link opens correct Stripe Dashboard URL

- [ ] **Step 6: Test PendingActionBanners on dashboard**

Navigate to `/dashboard/business` and verify:
- [ ] Banners appear for campaigns with pending applications or submitted content
- [ ] Dismiss button works and banner stays dismissed
- [ ] CTA links navigate to the correct campaign detail page

- [ ] **Step 7: Final build check**

Run: `npm run build`
Expected: Clean build with zero errors.

---

## Deferred Items

- **Filter chrome hiding on Pending applications view:** The spec calls for hiding filter controls, search bar, and sort options by default on the applications section, accessible via a "Filters" toggle. This is a UX refinement that can be done as a follow-up without blocking the core redesign.
