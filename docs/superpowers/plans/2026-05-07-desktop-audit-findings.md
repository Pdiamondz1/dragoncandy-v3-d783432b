# Desktop UX Audit Findings

**Date:** 2026-05-07
**Scope:** All pages at md (768px) and lg (1024px) breakpoints
**Result:** 12 findings (0 HIGH, 6 MEDIUM, 6 LOW)

## Content Width — Missing max-width constraints

| Severity | File | Line | Issue | Fix |
|----------|------|------|-------|-----|
| MEDIUM | `src/pages/BrandCampaignDetails.tsx` | 88 | No max-width, stretches edge-to-edge | Add `md:max-w-5xl md:mx-auto` |
| MEDIUM | `src/pages/CampaignEditPage.tsx` | 231 | Form inputs stretch full width | Add `md:max-w-3xl md:mx-auto` |
| MEDIUM | `src/pages/PublicCreatorProfile.tsx` | 264 | Profile stretches on 1440px+ | Add `md:max-w-3xl md:mx-auto` |
| MEDIUM | `src/pages/PublicBusinessProfile.tsx` | 132 | Same as PublicCreatorProfile | Add `md:max-w-3xl md:mx-auto` |
| LOW | `src/pages/AdminDragonShareLedger.tsx` | 85 | Admin table stretches | Add `max-w-5xl mx-auto` |
| LOW | `src/pages/AdminDragonShareQueue.tsx` | 43 | Admin page stretches | Add `max-w-4xl mx-auto` |
| LOW | `src/pages/CreatorDragonShare.tsx` | 38 | Cards stretch full width | Add `max-w-3xl mx-auto` |
| LOW | `src/pages/BusinessDragonShare.tsx` | 45 | Dashboard stretches | Add `max-w-4xl mx-auto` |

## Bottom Nav Padding — Dead space on desktop

| Severity | File | Line | Issue | Fix |
|----------|------|------|-------|-----|
| MEDIUM | `src/pages/BrandCampaignDetails.tsx` | 113 | `pb-28` dead space | Add `md:pb-6` |
| MEDIUM | `src/pages/CampaignEditPage.tsx` | 231 | `pb-28` dead space | Add `md:pb-6` |
| MEDIUM | `src/pages/BrandCreateCampaign.tsx` | 57 | `pb-28` dead space | Add `md:pb-6` |
| MEDIUM | `src/pages/CampaignWizard.tsx` | 72 | `pb-28` dead space | Add `md:pb-6` |
| LOW | `src/pages/CampaignDetailsPage.tsx` | 169 | `pb-24` dead space | Add `md:pb-0` |
| LOW | `src/pages/PromotionDetailPage.tsx` | 245 | `pb-24` dead space | Add `md:pb-0` |

## No Issues Found

- **Touch-only interactions**: All swipe UIs already have desktop alternatives
- **Grid layouts**: Consistently use `md:grid-cols-*` variants
- **Text sizing**: Adequate scaling across breakpoints
- **Modals/drawers**: Already constrained with `lg:max-w-*`
