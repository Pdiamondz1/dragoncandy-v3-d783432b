---
title: Brand Logo Sizing
type: concept
created: 2026-08-24
updated: 2026-08-24
sources: [2026-08-24-page-drag-and-logo-size.md]
tags: [design-system, frontend, headers, testing, regression-guards]
---
# Brand Logo Sizing

One size for the DragonCandy mark across every header, held in `src/lib/brandLogo.ts` rather
than typed into each component. The interesting part is not the CSS — it is **why the first
fix left three headers wrong while a test reported green**.

## The asset is taller than it is wide, so a width class sets the height

Two files, both stacked badges:

| File | Intrinsic | Aspect |
|---|---|---|
| `public/logo.webp` | 280 x 326 | 0.859 |
| `src/assets/Transparent_DragonCandy_logo.webp` | 400 x 465 | 0.860 |

A `w-[140px] h-auto` therefore does not cap the mark at 140 — it renders it **163px tall**.
That single mistake produced four different wrong sizes:

| Surface | Was | Rendered |
|---|---|---|
| `AuthPage` (log in / sign up) | `w-[100px] md:w-[120px] lg:w-[140px]` | 116 / 140 / **163px tall** |
| `MobileTopNav` (post-login, mobile) | `w-[64px]` | **74px** |
| `DashboardLayout` sidebar (post-login, desktop) | `w-[100px]` | **116px** |
| `PublicPageHeader` (fixed 2026-08-23) | `w-[100px] md:w-[120px] lg:w-[140px]` | 116 / 140 / **163px** |

against the landing header's **56px**.

**Because the two aspects agree to within 0.001, one height class renders an identical size on
every surface regardless of which file it imports.** That is what made a single shared constant
possible; it is a property of these assets, not a general fact, so re-check it if either is
replaced.

## The guard is the lesson

The 2026-08-23 pass fixed the landing and `PublicPageHeader` and pinned them **to each other by
hand** — a test asserting both source files contained the same literal class string. That test
passed continuously while three other headers stayed wrong, and the founder reported the same
defect again the next day on the surfaces the first pass never enumerated.

> **A guard that watches the pair you already repaired cannot see the four you did not.**

The shape recurs across this project: `profiles`'s write-grant enumeration failed twice by hand
before `profilesWriteGrants.test.ts` re-derived it from source
([[Identity & Address Verification]]); the same reasoning drives
[[RAG Retrieval Evaluation]]'s rule that a pin holding a value nothing reads is worse than no pin.
The fix is always the same: **derive the population under test, do not list it.**

`src/lib/brandLogo.test.ts` walks the header list, requires each to import
`HEADER_LOGO_CLASS`, and fails on any pixel width or `h-auto` inside a `<img alt="DragonCandy">`
— stripping comments first, since these files legitimately quote the old broken classes to
explain why they are gone, and without that the assertion could never fail.

## The constants

- `HEADER_LOGO_CLASS` = `h-12 w-auto lg:h-14` — every header: landing, `PublicPageHeader`
  (terms, privacy, how-it-works, pricing, 404, public profiles), `AuthPage`, `MobileTopNav`,
  `DashboardLayout`'s sidebar.
- `RAIL_LOGO_CLASS` = `h-8 w-auto` — the collapsed 56px sidebar rail only. `lg:h-14` would render
  48px wide inside roughly 48px of content box: it fits with nothing to spare, which is not a
  margin worth defending.
- `PUBLIC_LOGO_INTRINSIC` / `APP_LOGO_INTRINSIC` — the `width`/`height` attributes, per asset.

**`/internal` is deliberately outside this system** — an internal tool with its own denser chrome
(`h-8`/`h-7`), not app or marketing surface. So is the pitch deck.

## Intrinsic attributes prevent layout shift only if they are true

`PublicPageHeader` carried `width={140} height={47}` — an aspect of **2.98** against the real
0.859. Attributes whose entire purpose is reserving the correct box before the image loads were
reserving the wrong shape and **causing** the shift they exist to prevent. Read the real
dimensions off the file (`sips -g pixelWidth -g pixelHeight`) rather than copying numbers forward.

## Known Issues

- **The two post-login headers are pinned at class level only.** `MobileTopNav` and the sidebar
  were never seen rendered at the new size: reaching them needs a login, and **no test-account
  credentials exist** despite `CLAUDE.md` saying they live in the memory system. The landing and
  auth headers were measured on screen (48x56); the other two rest on the identical class string
  and the matching aspect ratios.
- `MobileTopNav`'s old `md:`/`lg:` steps were dead code — `DashboardLayout` only renders that bar
  when `isMobile`. Removed with the rest.

## See Also

- [[Mobile Viewport & Fixed Positioning]] — the other half of the same session (§10)
- [[Landing Cinematic Single-CTA Redesign]] — the landing header this size comes from
- [[Identity & Address Verification]] — the same derive-don't-list guard, applied to column grants
