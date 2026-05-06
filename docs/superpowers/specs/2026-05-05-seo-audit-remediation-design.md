# SEO Audit Remediation Design

> Fixes for Issues 1-3, 5-11 from `docs/seo-audit.docx`. Issue 4
> (prerendering for social unfurls) deferred to a separate follow-up.

## Problem

DragonCandy's index.html ships Lovable's placeholder meta tags ("Lovable
Generated Project"), Lovable's OG images, and @lovable_dev as the Twitter
handle. No page sets its own title or description. There is no sitemap, no
canonical tags, no structured data, 76 duplicate `<h1>` tags, inaccessible
`<div onClick>` patterns, and unused dependencies inflating the bundle.
Google shows "Lovable Generated Project" under every search result, and
every social share displays the Lovable logo.

## Scope

### In scope

- index.html head replacement (Issue 1)
- react-helmet-async installation + SEO component + per-page wiring (Issues 2, 6)
- Remove manual `document.title` calls in ForgotPassword.tsx and UpdatePassword.tsx
- sitemap.xml creation + robots.txt update (Issue 3)
- SiteGate PUBLIC_PATH_PREFIXES expansion (future-proofing for gate re-enable)
- JSON-LD structured data on key pages (Issue 5)
- Alt text fixes on profile images (Issue 7)
- h1 deduplication across all pages (Issue 8)
- NotFound noindex (Issue 9)
- div onClick to button conversion (Issue 10)
- Unused dependency removal + image lazy-loading (Issue 11)

### Out of scope

- Issue 4: vite-plugin-prerender (deferred, Lovable build-pipeline risk)
- OG image asset creation (public/og/og-default.png) — needs design, not code.
  **Interim fallback**: until the OG image is created, index.html and the
  SEO component will reference an existing brand asset
  (`/icons/icon-512.png`) as the OG image so social unfurls show the
  DragonCandy logo rather than a broken image.
- Dynamic sitemap build script for creator/business profile slugs
- Google Search Console / Bing Webmaster Tools verification setup
- hreflang (no non-English locales planned)

## Architecture

### SEO component

A single reusable `<SEO>` component at `src/components/SEO.tsx` built on
`react-helmet-async`. Every public page renders it near the top of its
return. The component manages: `<title>`, `<meta name="description">`,
`<link rel="canonical">`, Open Graph tags, Twitter Card tags, optional
`noindex`, and optional JSON-LD via a `jsonLd` prop.

```tsx
interface SEOProps {
  title: string;
  description: string;
  path: string;
  image?: string;
  type?: "website" | "article" | "profile";
  noindex?: boolean;
  jsonLd?: Record<string, unknown>;
}
```

The component prepends the site name to titles that don't already include
"DragonCandy" (e.g., "Pricing" becomes "Pricing - DragonCandy"). Canonical
URLs are constructed from `https://dragoncandy.io` + `path`.

### HelmetProvider

`react-helmet-async` requires a `<HelmetProvider>` wrapper. This goes in
`src/main.tsx`, wrapping `<App />`. No changes to `App.tsx` routing.

### index.html head

Replace lines 19-31 of `index.html` with DragonCandy-branded meta tags:

- Title: "DragonCandy - AI-Powered Marketplace for Brands & Creators"
- Description: DragonCandy's actual value proposition
- Author: DragonCandy
- Canonical: https://dragoncandy.io/
- OG tags: site_name, title, description, type, url, image (pointing to
  `/icons/icon-512.png` as interim fallback until a proper 1200x630 OG
  image is created), image dimensions, locale
- Twitter tags: summary_large_image card, @dragoncandy handle, title,
  description, image
- Organization JSON-LD script block

These serve as fallbacks when react-helmet-async hasn't hydrated (crawlers
that don't execute JS, social previewers).

### Replacing existing document.title calls

`ForgotPassword.tsx` and `UpdatePassword.tsx` manually set `document.title`
via `useEffect`. These must be removed and replaced with the `<SEO>`
component to avoid conflicting title logic.

### Per-page SEO values

| Route | Title | Description | noindex | JSON-LD |
|-------|-------|-------------|---------|---------|
| `/` & `/landing` | DragonCandy - AI-Powered Marketplace for Brands & Creators | DragonCandy connects restaurants, brands, and content creators for short-form social media campaigns. Powered by Donny AI. | no | - |
| `/auth` | Sign In or Sign Up - DragonCandy | Log in to DragonCandy or create a brand, restaurant, or creator account in under a minute. | no | - |
| `/auth/forgot` | Reset Password - DragonCandy | Reset your DragonCandy account password. | no | - |
| `/auth/update-password` | Update Password - DragonCandy | Set a new password for your DragonCandy account. | no | - |
| `/verify-email` | Verify Your Email - DragonCandy | - | yes | - |
| `/pricing` | Pricing - DragonCandy | Simple, transparent pricing for restaurants and brands running creator campaigns on DragonCandy. Pay only for content delivered. | no | Product + Offer per tier |
| `/help` | Help Center - DragonCandy | Guides, FAQs, and tutorials for DragonCandy creators, restaurants, and brands. | no | - |
| `/help/:slug` | {article.title} - DragonCandy Help | {article.summary or first 155 chars} | no | Article |
| `/help/promotions/:slug` | {brief.title} - DragonCandy Help | {brief.summary or first 155 chars} | no | Article |
| `/creator/:slug` | {creator_name} - Content Creator on DragonCandy | Browse the portfolio, reviews, and rates for {creator_name}. | no | Person |
| `/business/:slug` | {business_name} - DragonCandy | View {business_name}'s profile, active campaigns, and collaborations. | no | LocalBusiness / Organization |
| `/promo/:id` | {promotion_title} - Submit on DragonCandy | Submit content for {business_name}'s promotion on DragonCandy. | no | - |
| `/invite/accept` | Accept Your DragonCandy Invite | - | yes | - |
| `*` (NotFound) | Page Not Found - DragonCandy | - | yes | - |

### sitemap.xml

Static file at `public/sitemap.xml` covering the 5 publicly crawlable
routes: `/`, `/landing`, `/pricing`, `/help`, `/auth`. Each entry includes
`<loc>`, `<changefreq>`, and `<priority>`.

### robots.txt

Append `Sitemap: https://dragoncandy.io/sitemap.xml` to the existing
`public/robots.txt`.

### SiteGate PUBLIC_PATH_PREFIXES

The site gate (`src/lib/siteGate.ts`) is currently disabled, but the
`PUBLIC_PATH_PREFIXES` allowlist only contains `/promo/`. Add the public
routes that should remain accessible if the gate is ever re-enabled:
`/landing`, `/pricing`, `/help`, `/auth`, `/creator/`, `/business/`.
This prevents a gate re-enable from accidentally blocking crawlers and
public profiles.

### h1 deduplication

76 `<h1>` tags across 67 files. Strategy:

- For each route-level page component, keep its primary heading as `<h1>`.
- For child/section components rendered within a page (e.g., `HeroSection`,
  `DashboardHero`, `MarketplaceHeader`), demote their `<h1>` to `<h2>`.
- Authenticated pages are not SEO-critical but proper heading hierarchy
  improves a11y and Lighthouse accessibility scores.

The main.tsx fallback error UI also has an `<h1>` — that's fine since it
only renders when React fails to mount (no other h1 on the page).

### Alt text

Two files need fixes. Portfolio items are plain URL strings (not objects),
so there is no caption field available. Use the creator/business name for
descriptiveness:

- `PublicCreatorProfile.tsx`: change `alt="Portfolio item ${index + 1}"`
  to `` alt={`${profile.creator_name} portfolio ${index + 1}`} ``
- `PublicBusinessProfile.tsx`: change `alt="Sample content ${index + 2}"`
  to `` alt={`${profile.business_name} content sample ${index + 2}`} ``

### Accessibility: div onClick to button

Two components have interactive `<div onClick>` that should be
`<button type="button">`:

- `src/components/campaigns/MediaGallery.tsx` — the gallery item wrapper
  is a clickable div. Replace with `<button type="button">` styled with
  the same classes.
- `src/components/campaign-creator/EditableField.tsx` — the edit-trigger
  div. Replace with `<button type="button">`.

Two other flagged files use `onClick={(e) => e.stopPropagation()}` on
wrapper divs to prevent event bubbling — these are not primary click
targets and don't need conversion:

- `src/components/promotions/PromotionCard.tsx` line 172: stopPropagation on a button group wrapper
- `CampaignDetailModal.tsx` line 75: stopPropagation on modal content area

### Dependency cleanup

Remove from `package.json`:

- `"sharp"` (devDependencies, line 98) — listed but never imported in any
  source file or build config
- `"install"` (dependencies, line 58) — accidental `npm install install`,
  does nothing

### Image lazy loading

Add `loading="lazy"` to portfolio and profile images in
`PublicCreatorProfile.tsx` and `PublicBusinessProfile.tsx` that don't
already have it. Hero/above-the-fold images keep `loading="eager"` (or
omit the attribute, which defaults to eager) but should have explicit
`width` and `height` attributes to prevent CLS.

## Dependencies

- `react-helmet-async` — new production dependency
- No other new dependencies

## Risks

- **Lovable auto-deploy**: pushing to main triggers deploy. All changes
  should build-verify locally before push.
- **react-helmet-async + existing document.title calls**: ForgotPassword
  and UpdatePassword manually set `document.title` via `useEffect`. These
  must be replaced with the `<SEO>` component to avoid conflicts.
- **h1 demotion in shared components**: components like `DashboardHero` or
  `HeroSection` might use `<h1>` intentionally for their standalone
  context. Demoting to `<h2>` is correct when they're rendered as children
  of a page that has its own `<h1>`, which is always the case in this
  codebase.

## Validation

After all fixes are applied:

1. `npm run build` — must succeed with no errors
2. `npm run lint` — must pass
3. `npm run typecheck` — must pass
4. Manual check: `index.html` in build output should have DragonCandy meta
5. Lighthouse SEO audit in Chrome DevTools — target 95+
6. External validators (post-deploy): Facebook Sharing Debugger,
   Twitter Card Validator, LinkedIn Post Inspector, metatags.io,
   Google Rich Results Test
