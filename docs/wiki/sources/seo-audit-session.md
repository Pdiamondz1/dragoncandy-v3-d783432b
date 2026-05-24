---
title: SEO Audit Session
type: source
created: 2026-05-05
updated: 2026-05-24
sources: [raw/sessions/2026-05-05-seo-audit-remediation.md]
tags: [seo, a11y, helmet]
---

# SEO Audit Session

Session from 2026-05-05 covering SEO remediation across the DragonCandy
frontend. Introduced react-helmet-async for per-page meta tags, created
a reusable SEO component, added JSON-LD structured data for organization
and local business schemas, generated a sitemap.xml, fixed h1 heading
hierarchy violations, added alt text to images, and converted
non-semantic div click handlers to proper button elements for
accessibility.

## Key Decisions

- Deferred server-side prerendering (e.g., Prerender.io or a custom
  solution) because the Lovable.dev build pipeline does not expose the
  necessary hooks, and introducing a prerender layer risked breaking the
  existing deploy flow. Client-side meta tags via react-helmet-async are
  sufficient for initial crawl coverage.
- Adopted a single shared SEO component pattern so every page gets
  consistent title, description, and Open Graph tags without per-page
  boilerplate.
- Converted interactive `div` elements with `onClick` handlers to
  `button` elements to fix keyboard accessibility and screen reader
  semantics.

## Patterns Discovered

- Multiple pages had competing h1 tags (page title plus component-level
  headings) which confused heading hierarchy for screen readers and
  crawlers.
- Several image components used decorative images without alt text,
  making them invisible to search engines and assistive technology.
- JSON-LD structured data can be injected via react-helmet-async script
  tags without requiring SSR.

## See Also

- [[DragonCandy Platform]]
