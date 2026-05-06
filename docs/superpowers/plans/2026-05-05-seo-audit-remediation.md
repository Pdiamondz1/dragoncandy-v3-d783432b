# SEO Audit Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all SEO issues from the audit (Issues 1-3, 5-11) so DragonCandy stops showing "Lovable Generated Project" in search results and social shares, gains proper per-page titles/descriptions, structured data, and passes Lighthouse SEO at 95+.

**Architecture:** Install `react-helmet-async` and create a reusable `<SEO>` component that every public page renders. Replace Lovable placeholder meta in `index.html`. Add `sitemap.xml`, fix heading hierarchy, improve a11y, clean up unused deps.

**Tech Stack:** React 18, TypeScript, react-helmet-async, Vite, Tailwind CSS

---

## File Map

| Action | File | Responsibility |
|--------|------|---------------|
| Create | `src/components/SEO.tsx` | Reusable SEO head management component |
| Create | `public/sitemap.xml` | Static sitemap for crawlers |
| Modify | `index.html` | Replace Lovable placeholder meta tags |
| Modify | `src/main.tsx` | Wrap App in HelmetProvider |
| Modify | `public/robots.txt` | Add Sitemap directive |
| Modify | `src/lib/siteGate.ts` | Expand PUBLIC_PATH_PREFIXES |
| Modify | `src/pages/Index.tsx` | Add SEO |
| Modify | `src/pages/LandingPage.tsx` | Add SEO |
| Modify | `src/pages/AuthPage.tsx` | Add SEO |
| Modify | `src/pages/ForgotPassword.tsx` | Replace setSEO with SEO component |
| Modify | `src/pages/UpdatePassword.tsx` | Replace setSEO with SEO component |
| Modify | `src/pages/VerifyEmail.tsx` | Add SEO (noindex) |
| Modify | `src/pages/PricingPage.tsx` | Add SEO + Product JSON-LD |
| Modify | `src/pages/PublicCreatorProfile.tsx` | Add SEO + Person JSON-LD + fix alt text |
| Modify | `src/pages/PublicBusinessProfile.tsx` | Add SEO + Organization JSON-LD + fix alt text |
| Modify | `src/pages/PromotionSubmissionPage.tsx` | Add SEO |
| Modify | `src/pages/InviteAcceptPage.tsx` | Add SEO (noindex) |
| Modify | `src/pages/NotFound.tsx` | Add SEO (noindex) |
| Modify | `src/pages/help/HelpCenter.tsx` | Add SEO |
| Modify | `src/pages/help/HelpArticlePage.tsx` | Add SEO + Article JSON-LD |
| Modify | `src/pages/help/promotions/HelpBriefPage.tsx` | Add SEO + Article JSON-LD |
| Modify | 15 component files | Demote h1 to h2 |
| Modify | `src/components/campaigns/MediaGallery.tsx` | div onClick to button |
| Modify | `src/components/campaign-creator/EditableField.tsx` | div onClick to button |
| Modify | `package.json` | Remove sharp, install; add react-helmet-async |

---

### Task 1: Install react-helmet-async and clean up unused deps

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install react-helmet-async**

Run:
```bash
npm install react-helmet-async
```

Expected: package.json gains `"react-helmet-async"` in dependencies. No errors.

- [ ] **Step 2: Remove unused dependencies**

Run:
```bash
npm uninstall sharp install
```

Expected: `"sharp"` removed from devDependencies, `"install"` removed from dependencies. No errors.

- [ ] **Step 3: Verify build**

Run:
```bash
npm run build
```

Expected: Build succeeds. No import errors from removed packages.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add react-helmet-async, remove unused sharp and install deps"
```

---

### Task 2: Replace index.html Lovable placeholder meta tags

**Files:**
- Modify: `index.html:19-31`

- [ ] **Step 1: Replace the meta tags in index.html**

Replace lines 19-31 (from `<title>DragonCandy</title>` through the closing twitter:image tag) with:

```html
    <!-- Primary -->
    <title>DragonCandy - AI-Powered Marketplace for Brands & Creators</title>
    <meta name="description" content="DragonCandy connects restaurants, brands, and content creators for short-form social media campaigns. Powered by Donny AI." />
    <meta name="author" content="DragonCandy" />
    <link rel="canonical" href="https://dragoncandy.io/" />

    <!-- Open Graph -->
    <meta property="og:site_name" content="DragonCandy" />
    <meta property="og:title" content="DragonCandy - AI-Powered Marketplace for Brands & Creators" />
    <meta property="og:description" content="Connect with content creators for short-form social campaigns. Powered by Donny AI." />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="https://dragoncandy.io/" />
    <meta property="og:image" content="https://dragoncandy.io/icons/icon-512.png" />
    <meta property="og:image:width" content="512" />
    <meta property="og:image:height" content="512" />
    <meta property="og:locale" content="en_US" />

    <!-- Twitter -->
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:site" content="@dragoncandy" />
    <meta name="twitter:title" content="DragonCandy" />
    <meta name="twitter:description" content="AI-powered marketplace for brands and creators." />
    <meta name="twitter:image" content="https://dragoncandy.io/icons/icon-512.png" />

    <!-- Organization JSON-LD -->
    <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      "name": "DragonCandy",
      "url": "https://dragoncandy.io",
      "logo": "https://dragoncandy.io/icons/icon-512.png",
      "description": "AI-powered marketplace connecting brands with content creators.",
      "sameAs": []
    }
    </script>
```

- [ ] **Step 2: Verify build**

Run:
```bash
npm run build
```

Expected: Build succeeds. Check `dist/index.html` contains "DragonCandy - AI-Powered Marketplace" in the title.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "fix(seo): replace Lovable placeholder meta tags with DragonCandy branding"
```

---

### Task 3: Create SEO component and wire HelmetProvider

**Files:**
- Create: `src/components/SEO.tsx`
- Modify: `src/main.tsx:1-18`

- [ ] **Step 1: Create SEO.tsx**

Create `src/components/SEO.tsx`:

```tsx
import { Helmet } from "react-helmet-async";

interface SEOProps {
  title: string;
  description: string;
  path: string;
  image?: string;
  type?: "website" | "article" | "profile";
  noindex?: boolean;
  jsonLd?: Record<string, unknown>;
}

const SITE_URL = "https://dragoncandy.io";
const DEFAULT_IMAGE = `${SITE_URL}/icons/icon-512.png`;

export function SEO({
  title,
  description,
  path,
  image = DEFAULT_IMAGE,
  type = "website",
  noindex = false,
  jsonLd,
}: SEOProps) {
  const url = `${SITE_URL}${path}`;
  const fullTitle = title.includes("DragonCandy")
    ? title
    : `${title} - DragonCandy`;

  return (
    <Helmet>
      <title>{fullTitle}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={url} />
      {noindex && <meta name="robots" content="noindex,nofollow" />}

      <meta property="og:type" content={type} />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={url} />
      <meta property="og:image" content={image} />
      <meta property="og:site_name" content="DragonCandy" />

      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={image} />

      {jsonLd && (
        <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
      )}
    </Helmet>
  );
}
```

- [ ] **Step 2: Wrap App in HelmetProvider in main.tsx**

In `src/main.tsx`, add the import at the top:

```tsx
import { HelmetProvider } from "react-helmet-async";
```

Then wrap the `<App />` in the render call:

```tsx
createRoot(root).render(
  <HelmetProvider>
    <App />
  </HelmetProvider>
);
```

The catch block's fallback HTML does not need HelmetProvider since React has failed to mount.

- [ ] **Step 3: Verify build + typecheck**

Run:
```bash
npm run build && npm run typecheck
```

Expected: Both pass with no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/SEO.tsx src/main.tsx
git commit -m "feat(seo): create SEO component and wire HelmetProvider"
```

---

### Task 4: Add SEO to static public pages (Index, Landing, Auth, Pricing, NotFound)

**Files:**
- Modify: `src/pages/Index.tsx`
- Modify: `src/pages/LandingPage.tsx`
- Modify: `src/pages/AuthPage.tsx`
- Modify: `src/pages/PricingPage.tsx`
- Modify: `src/pages/NotFound.tsx`

- [ ] **Step 1: Add SEO to Index.tsx**

Add import at the top of `src/pages/Index.tsx`:
```tsx
import { SEO } from '@/components/SEO';
```

Add `<SEO>` as the first element inside the component's return. Index.tsx currently renders a loading/debug UI before redirecting. Add SEO inside the outermost `<div>` that wraps the loading UI:

```tsx
<SEO
  title="DragonCandy - AI-Powered Marketplace for Brands & Creators"
  description="DragonCandy connects restaurants, brands, and content creators for short-form social media campaigns. Powered by Donny AI."
  path="/"
/>
```

- [ ] **Step 2: Add SEO to LandingPage.tsx**

Add import at the top of `src/pages/LandingPage.tsx`:
```tsx
import { SEO } from '@/components/SEO';
```

Add `<SEO>` as the first child inside the component's returned JSX (before `<Header />`):

```tsx
<SEO
  title="DragonCandy - AI-Powered Marketplace for Brands & Creators"
  description="DragonCandy connects restaurants, brands, and content creators for short-form social media campaigns. Powered by Donny AI."
  path="/landing"
/>
```

- [ ] **Step 3: Add SEO to AuthPage.tsx**

Add import at the top of `src/pages/AuthPage.tsx`:
```tsx
import { SEO } from '@/components/SEO';
```

Add `<SEO>` inside the component's returned JSX (at the top of the outermost container):

```tsx
<SEO
  title="Sign In or Sign Up - DragonCandy"
  description="Log in to DragonCandy or create a brand, restaurant, or creator account in under a minute."
  path="/auth"
/>
```

- [ ] **Step 4: Add SEO + Product JSON-LD to PricingPage.tsx**

Add imports at the top of `src/pages/PricingPage.tsx`:
```tsx
import { SEO } from '@/components/SEO';
import { TIER_PRICES } from '@/lib/pricing/tier-features';
```

Add `<SEO>` as the first child inside the returned `<div className="min-h-screen bg-white">`, before the header div:

```tsx
<SEO
  title="Pricing"
  description="Simple, transparent pricing for restaurants and brands running creator campaigns on DragonCandy. Pay only for content delivered."
  path="/pricing"
  jsonLd={{
    "@context": "https://schema.org",
    "@type": "ItemList",
    "name": "DragonCandy Pricing Plans",
    "itemListElement": [
      { "@type": "Offer", "name": "Free", "price": "0", "priceCurrency": "USD" },
      { "@type": "Offer", "name": "Starter", "price": String(TIER_PRICES.starter.monthly), "priceCurrency": "USD", "billingDuration": "P1M" },
      { "@type": "Offer", "name": "Growth", "price": String(TIER_PRICES.growth.monthly), "priceCurrency": "USD", "billingDuration": "P1M" },
      { "@type": "Offer", "name": "Pro", "price": String(TIER_PRICES.pro.monthly), "priceCurrency": "USD", "billingDuration": "P1M" },
    ],
  }}
/>
```

- [ ] **Step 5: Add SEO to NotFound.tsx**

Add import at the top of `src/pages/NotFound.tsx`:
```tsx
import { SEO } from '@/components/SEO';
```

Add `<SEO>` inside the component's returned JSX with `noindex`:

```tsx
<SEO
  title="Page Not Found"
  description="The page you're looking for doesn't exist."
  path="/404"
  noindex
/>
```

- [ ] **Step 6: Verify build**

Run:
```bash
npm run build
```

Expected: Build succeeds.

- [ ] **Step 7: Commit**

```bash
git add src/pages/Index.tsx src/pages/LandingPage.tsx src/pages/AuthPage.tsx src/pages/PricingPage.tsx src/pages/NotFound.tsx
git commit -m "feat(seo): add SEO component to Index, Landing, Auth, Pricing, NotFound pages"
```

---

### Task 5: Replace setSEO in ForgotPassword and UpdatePassword, add SEO to VerifyEmail

**Files:**
- Modify: `src/pages/ForgotPassword.tsx:1-39`
- Modify: `src/pages/UpdatePassword.tsx:1-40`
- Modify: `src/pages/VerifyEmail.tsx`

- [ ] **Step 1: Replace setSEO in ForgotPassword.tsx**

In `src/pages/ForgotPassword.tsx`:

1. Add import: `import { SEO } from '@/components/SEO';`
2. Delete the entire `setSEO` function (lines 8-27)
3. Delete the `useEffect` that calls `setSEO` (lines 33-39, which will shift after deletion)
4. Remove `useEffect` from the React import if it's no longer used elsewhere in the file
5. Add `<SEO>` at the top of the returned JSX:

```tsx
<SEO
  title="Reset Password"
  description="Reset your DragonCandy account password via email."
  path="/auth/forgot"
/>
```

- [ ] **Step 2: Replace setSEO in UpdatePassword.tsx**

In `src/pages/UpdatePassword.tsx`:

1. Add import: `import { SEO } from '@/components/SEO';`
2. Delete the entire `setSEO` function (lines 8-27)
3. Delete the `useEffect` that calls `setSEO` (lines 34-40, which will shift after deletion)
4. Check whether `useEffect` is still used elsewhere in the file before removing it from the import
5. Add `<SEO>` at the top of the returned JSX:

```tsx
<SEO
  title="Update Password"
  description="Set a new password for your DragonCandy account."
  path="/auth/update-password"
/>
```

- [ ] **Step 3: Add SEO to VerifyEmail.tsx**

Add import at the top of `src/pages/VerifyEmail.tsx`:
```tsx
import { SEO } from '@/components/SEO';
```

Add `<SEO>` inside the returned JSX with `noindex`:

```tsx
<SEO
  title="Verify Your Email"
  description="Verifying your DragonCandy email address."
  path="/verify-email"
  noindex
/>
```

- [ ] **Step 4: Verify build + typecheck**

Run:
```bash
npm run build && npm run typecheck
```

Expected: Both pass. No unused import warnings.

- [ ] **Step 5: Commit**

```bash
git add src/pages/ForgotPassword.tsx src/pages/UpdatePassword.tsx src/pages/VerifyEmail.tsx
git commit -m "feat(seo): replace manual setSEO with SEO component in auth pages, add SEO to VerifyEmail"
```

---

### Task 6: Add SEO + JSON-LD to dynamic public pages (Creator, Business, Promotion, Help)

**Files:**
- Modify: `src/pages/PublicCreatorProfile.tsx`
- Modify: `src/pages/PublicBusinessProfile.tsx`
- Modify: `src/pages/PromotionSubmissionPage.tsx`
- Modify: `src/pages/InviteAcceptPage.tsx`
- Modify: `src/pages/help/HelpCenter.tsx`
- Modify: `src/pages/help/HelpArticlePage.tsx`
- Modify: `src/pages/help/promotions/HelpBriefPage.tsx`

- [ ] **Step 1: Add SEO + Person JSON-LD to PublicCreatorProfile.tsx**

Add import at the top of `src/pages/PublicCreatorProfile.tsx`:
```tsx
import { SEO } from '@/components/SEO';
```

Add `<SEO>` inside the returned JSX, right after the outermost `<div>` opens (before the hero image section). Use the `profile` state which is available at render time:

```tsx
<SEO
  title={`${profile.creator_name} - Content Creator on DragonCandy`}
  description={profile.bio?.slice(0, 155) ?? `Browse the portfolio, reviews, and rates for ${profile.creator_name} on DragonCandy.`}
  path={`/creator/${slug}`}
  image={profile.avatar_url || undefined}
  type="profile"
  jsonLd={{
    "@context": "https://schema.org",
    "@type": "Person",
    "name": profile.creator_name,
    "image": profile.avatar_url,
    "url": `https://dragoncandy.io/creator/${slug}`,
    "jobTitle": "Content Creator",
  }}
/>
```

Place this inside the block that renders after loading/error checks (i.e., after the `if (!profile)` guard).

- [ ] **Step 2: Add SEO + Organization JSON-LD to PublicBusinessProfile.tsx**

Add import at the top of `src/pages/PublicBusinessProfile.tsx`:
```tsx
import { SEO } from '@/components/SEO';
```

Add `<SEO>` inside the returned JSX, after the `if (!profile)` guard:

```tsx
<SEO
  title={`${profile.business_name} - DragonCandy`}
  description={`View ${profile.business_name}'s profile, active campaigns, and creator collaborations on DragonCandy.`}
  path={`/business/${slug}`}
  image={profile.logo_url || undefined}
  type="profile"
  jsonLd={{
    "@context": "https://schema.org",
    "@type": "Organization",
    "name": profile.business_name,
    "image": profile.logo_url,
    "url": `https://dragoncandy.io/business/${slug}`,
  }}
/>
```

- [ ] **Step 3: Add SEO to PromotionSubmissionPage.tsx**

Add import at the top of `src/pages/PromotionSubmissionPage.tsx`:
```tsx
import { SEO } from '@/components/SEO';
```

Add `<SEO>` inside the returned JSX after loading/error guards:

```tsx
<SEO
  title={`${promotion.title} - Submit on DragonCandy`}
  description={`Submit content for ${promotion.business_name}'s promotion on DragonCandy.`}
  path={`/promo/${promotionId}`}
/>
```

Note: check the actual property names on the `promotion` object (e.g., `promotion.title` and `promotion.business_name` or similar). Adjust field names to match the actual type.

- [ ] **Step 4: Add SEO to InviteAcceptPage.tsx**

Add import at the top of `src/pages/InviteAcceptPage.tsx`:
```tsx
import { SEO } from '@/components/SEO';
```

Add `<SEO>` at the top of the returned JSX with `noindex`:

```tsx
<SEO
  title="Accept Your DragonCandy Invite"
  description="Accept your invitation to join DragonCandy."
  path="/invite/accept"
  noindex
/>
```

- [ ] **Step 5: Add SEO to HelpCenter.tsx**

Add import at the top of `src/pages/help/HelpCenter.tsx`:
```tsx
import { SEO } from '@/components/SEO';
```

Add `<SEO>` at the top of the returned JSX:

```tsx
<SEO
  title="Help Center"
  description="Guides, FAQs, and tutorials for DragonCandy creators, restaurants, and brands."
  path="/help"
/>
```

- [ ] **Step 6: Add SEO + Article JSON-LD to HelpArticlePage.tsx**

Add import at the top of `src/pages/help/HelpArticlePage.tsx`:
```tsx
import { SEO } from '@/components/SEO';
```

Add `<SEO>` inside the returned JSX after the article data loads (after the loading/error guard):

```tsx
<SEO
  title={`${article.title} - DragonCandy Help`}
  description={article.summary?.slice(0, 155) ?? `Help article: ${article.title}`}
  path={`/help/${slug}`}
  jsonLd={{
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": article.title,
    "url": `https://dragoncandy.io/help/${slug}`,
  }}
/>
```

Note: check the actual property names on the article object. Adjust `article.summary` if the field is named differently.

- [ ] **Step 7: Add SEO to HelpBriefPage.tsx**

Add import at the top of `src/pages/help/promotions/HelpBriefPage.tsx`:
```tsx
import { SEO } from '@/components/SEO';
```

Add `<SEO>` at the top of the returned JSX. HelpBriefPage loads MDX components dynamically. Use the `slug` for the path:

```tsx
<SEO
  title={`${slug?.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) ?? 'Help'} - DragonCandy Help`}
  description={`DragonCandy help guide for ${slug?.replace(/-/g, ' ') ?? 'promotions'}.`}
  path={`/help/promotions/${slug}`}
/>
```

- [ ] **Step 8: Verify build + typecheck**

Run:
```bash
npm run build && npm run typecheck
```

Expected: Both pass.

- [ ] **Step 9: Commit**

```bash
git add src/pages/PublicCreatorProfile.tsx src/pages/PublicBusinessProfile.tsx src/pages/PromotionSubmissionPage.tsx src/pages/InviteAcceptPage.tsx src/pages/help/HelpCenter.tsx src/pages/help/HelpArticlePage.tsx src/pages/help/promotions/HelpBriefPage.tsx
git commit -m "feat(seo): add SEO component and JSON-LD to dynamic public pages"
```

---

### Task 7: Create sitemap.xml, update robots.txt, expand SiteGate allowlist

**Files:**
- Create: `public/sitemap.xml`
- Modify: `public/robots.txt`
- Modify: `src/lib/siteGate.ts:6-8`

- [ ] **Step 1: Create public/sitemap.xml**

Create `public/sitemap.xml`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://dragoncandy.io/</loc><changefreq>weekly</changefreq><priority>1.0</priority></url>
  <url><loc>https://dragoncandy.io/landing</loc><changefreq>weekly</changefreq><priority>0.9</priority></url>
  <url><loc>https://dragoncandy.io/pricing</loc><changefreq>monthly</changefreq><priority>0.8</priority></url>
  <url><loc>https://dragoncandy.io/help</loc><changefreq>weekly</changefreq><priority>0.7</priority></url>
  <url><loc>https://dragoncandy.io/auth</loc><changefreq>monthly</changefreq><priority>0.5</priority></url>
</urlset>
```

- [ ] **Step 2: Append Sitemap directive to robots.txt**

Add a blank line and the Sitemap directive at the end of `public/robots.txt`:

```
Sitemap: https://dragoncandy.io/sitemap.xml
```

- [ ] **Step 3: Expand PUBLIC_PATH_PREFIXES in siteGate.ts**

In `src/lib/siteGate.ts`, replace lines 6-8:

```ts
const PUBLIC_PATH_PREFIXES = [
  '/promo/', // public promotion submission via QR
];
```

With:

```ts
const PUBLIC_PATH_PREFIXES = [
  '/promo/',
  '/landing',
  '/pricing',
  '/help',
  '/auth',
  '/creator/',
  '/business/',
];
```

- [ ] **Step 4: Verify build**

Run:
```bash
npm run build
```

Expected: Build succeeds. `dist/sitemap.xml` exists in build output.

- [ ] **Step 5: Commit**

```bash
git add public/sitemap.xml public/robots.txt src/lib/siteGate.ts
git commit -m "feat(seo): add sitemap.xml, update robots.txt, expand SiteGate public paths"
```

---

### Task 8: Demote child-component h1 tags to h2

**Files (15 components):**
- Modify: `src/components/auth/RoleSelection.tsx:11`
- Modify: `src/components/brand-profile/BrandProfileSetupHeader.tsx:9`
- Modify: `src/components/business-profile/BusinessSettingsHeader.tsx:5`
- Modify: `src/components/creator-profile/CreatorSettingsHeader.tsx:5`
- Modify: `src/components/creator-profile/CreatorProfileSetupHeader.tsx:10`
- Modify: `src/components/campaigns/CampaignWizardHeader.tsx:23`
- Modify: `src/components/campaigns/MarketplaceHeader.tsx:13`
- Modify: `src/components/campaigns/DeliveryTierStep.tsx:52`
- Modify: `src/components/campaigns/AnonymousCampaignLayout.tsx:39`
- Modify: `src/components/creator-browse/CreatorBrowseHeader.tsx:77`
- Modify: `src/components/campaign-details/CampaignHero.tsx:94`
- Modify: `src/components/campaign-creator/DonnyGreeting.tsx:12`
- Modify: `src/components/dashboard/DashboardHero.tsx:18`
- Modify: `src/components/DashboardLayout.tsx:187`
- Modify: `src/components/landing/HeroSection.tsx:10`

- [ ] **Step 1: Demote h1 to h2 in all 15 component files**

For each file listed above, find the `<h1` tag and change it to `<h2`, and change the corresponding `</h1>` to `</h2>`. The line numbers are approximate — verify each before editing.

Files and their h1 content:

1. `src/components/auth/RoleSelection.tsx` — "Join DragonCandy"
2. `src/components/brand-profile/BrandProfileSetupHeader.tsx` — "Welcome to DragonCandy"
3. `src/components/business-profile/BusinessSettingsHeader.tsx` — "Account Settings"
4. `src/components/creator-profile/CreatorSettingsHeader.tsx` — "Account Settings"
5. `src/components/creator-profile/CreatorProfileSetupHeader.tsx` — "Complete Your Creator Profile"
6. `src/components/campaigns/CampaignWizardHeader.tsx` — "Campaign Wizard"
7. `src/components/campaigns/MarketplaceHeader.tsx` — "Browse Campaigns"
8. `src/components/campaigns/DeliveryTierStep.tsx` — "How fast do you need it?"
9. `src/components/campaigns/AnonymousCampaignLayout.tsx` — "Campaign Wizard"
10. `src/components/creator-browse/CreatorBrowseHeader.tsx` — "Find Creators"
11. `src/components/campaign-details/CampaignHero.tsx` — dynamic campaign title
12. `src/components/campaign-creator/DonnyGreeting.tsx` — "Create a Campaign"
13. `src/components/dashboard/DashboardHero.tsx` — dynamic welcome message
14. `src/components/DashboardLayout.tsx` — dynamic dashboard label
15. `src/components/landing/HeroSection.tsx` — "Social Media Content for Restaurants..."

For each file, the change is mechanical: `<h1` becomes `<h2` and `</h1>` becomes `</h2>`. Do not change any classes or attributes.

- [ ] **Step 2: Verify build**

Run:
```bash
npm run build
```

Expected: Build succeeds with no errors.

- [ ] **Step 3: Verify h1 count**

Run a grep to confirm only page-level h1 tags remain:
```bash
grep -r "<h1" src/components/ --include="*.tsx" -l
```

Expected: Only `src/components/creator-profile/CreatorPortfolioModal.tsx` should remain (it's a standalone modal, which is acceptable).

- [ ] **Step 4: Commit**

```bash
git add src/components/auth/RoleSelection.tsx src/components/brand-profile/BrandProfileSetupHeader.tsx src/components/business-profile/BusinessSettingsHeader.tsx src/components/creator-profile/CreatorSettingsHeader.tsx src/components/creator-profile/CreatorProfileSetupHeader.tsx src/components/campaigns/CampaignWizardHeader.tsx src/components/campaigns/MarketplaceHeader.tsx src/components/campaigns/DeliveryTierStep.tsx src/components/campaigns/AnonymousCampaignLayout.tsx src/components/creator-browse/CreatorBrowseHeader.tsx src/components/campaign-details/CampaignHero.tsx src/components/campaign-creator/DonnyGreeting.tsx src/components/dashboard/DashboardHero.tsx src/components/DashboardLayout.tsx src/components/landing/HeroSection.tsx
git commit -m "fix(a11y): demote child-component h1 tags to h2 for proper heading hierarchy"
```

---

### Task 9: Fix alt text on profile images

**Files:**
- Modify: `src/pages/PublicCreatorProfile.tsx:412`
- Modify: `src/pages/PublicBusinessProfile.tsx:222`

- [ ] **Step 1: Fix alt text in PublicCreatorProfile.tsx**

In `src/pages/PublicCreatorProfile.tsx`, find the line (around line 412):

```tsx
alt={`Portfolio item ${index + 1}`}
```

Replace with:

```tsx
alt={`${profile.creator_name} portfolio ${index + 1}`}
```

- [ ] **Step 2: Fix alt text in PublicBusinessProfile.tsx**

In `src/pages/PublicBusinessProfile.tsx`, find the line (around line 222):

```tsx
alt={`Sample content ${index + 2}`}
```

Replace with:

```tsx
alt={`${profile.business_name} content sample ${index + 2}`}
```

- [ ] **Step 3: Verify build**

Run:
```bash
npm run build
```

Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/pages/PublicCreatorProfile.tsx src/pages/PublicBusinessProfile.tsx
git commit -m "fix(a11y): use descriptive alt text with creator/business names on profile images"
```

---

### Task 10: Convert div onClick to button for accessibility

**Files:**
- Modify: `src/components/campaigns/MediaGallery.tsx:49`
- Modify: `src/components/campaign-creator/EditableField.tsx:26`

- [ ] **Step 1: Convert MediaGallery.tsx clickable div to button**

In `src/components/campaigns/MediaGallery.tsx`, find the line (around line 49):

```tsx
<div className="relative group cursor-pointer" onClick={onClick}>
```

Replace with:

```tsx
<button type="button" className="relative group cursor-pointer w-full text-left" onClick={onClick}>
```

And find the corresponding closing `</div>` for this element and replace with `</button>`.

The `w-full text-left` classes ensure the button fills its container and doesn't center text (matching the div's default behavior).

- [ ] **Step 2: Convert EditableField.tsx clickable div to button**

In `src/components/campaign-creator/EditableField.tsx`, find the line (around line 26):

```tsx
<div className="group cursor-pointer" onClick={() => setIsEditing(true)}>
```

Replace with:

```tsx
<button type="button" className="group cursor-pointer w-full text-left" onClick={() => setIsEditing(true)}>
```

And change the corresponding closing `</div>` (line 31) to `</button>`.

- [ ] **Step 3: Verify build**

Run:
```bash
npm run build
```

Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/components/campaigns/MediaGallery.tsx src/components/campaign-creator/EditableField.tsx
git commit -m "fix(a11y): convert interactive div onClick to button for keyboard/screen-reader access"
```

---

### Note: Image lazy loading (Issue 11, partial)

The spec calls for adding `loading="lazy"` to portfolio/profile images. Both `PublicCreatorProfile.tsx` (line 425) and `PublicBusinessProfile.tsx` (line 224) already have `loading="lazy"` on their grid images. No changes needed for lazy loading.

Hero images use CSS `object-cover` inside fixed-height containers, making explicit `width`/`height` attributes impractical (they'd conflict with the responsive layout). CLS is already prevented by the fixed container height (e.g., `h-[40vh]`). No changes needed.

---

### Task 11: Final verification

**Files:** None (verification only)

- [ ] **Step 1: Full build**

Run:
```bash
npm run build
```

Expected: Build succeeds with no errors.

- [ ] **Step 2: Lint**

Run:
```bash
npm run lint
```

Expected: No new lint errors.

- [ ] **Step 3: Typecheck**

Run:
```bash
npm run typecheck
```

Expected: No type errors.

- [ ] **Step 4: Verify index.html in build output**

Check that `dist/index.html` contains:
- Title: "DragonCandy - AI-Powered Marketplace"
- Description: not "Lovable Generated Project"
- OG image: points to dragoncandy.io, not lovable.dev
- twitter:site: "@dragoncandy", not "@lovable_dev"
- Organization JSON-LD script block

- [ ] **Step 5: Verify sitemap in build output**

Check that `dist/sitemap.xml` exists and contains 5 URL entries.

- [ ] **Step 6: Start dev server and spot-check**

Run:
```bash
npm run dev
```

Open `http://localhost:8080` in a browser. Check:
- Page title changes when navigating between routes
- View page source on `/pricing` — should see Helmet-injected meta tags
- No console errors related to helmet or SEO

- [ ] **Step 7: Run Lighthouse SEO audit**

In Chrome DevTools on `http://localhost:8080/landing`:
- Open Lighthouse tab
- Run SEO category audit
- Target: 95+ score

Note any remaining issues for follow-up.
