# Pingdom Performance Remediation — Design Spec

**Date**: 2026-05-08
**Source**: Pingdom HAR audit, 2026-05-02 (`docs/pingdom.pdf`)
**Scope**: Code-level fixes only (no monitoring infrastructure)

## Problem Statement

The Pingdom audit of `https://dragoncandy.io/` reported a fully-loaded time of 4.97s with 8 requests. Prior sessions already addressed the highest-impact items (lazy-loaded routes, inline critical CSS, async font loading, preconnects, CDN cache headers). Two issues remain unresolved:

1. **Google Fonts are externally hosted** — two extra origins (`fonts.googleapis.com` + `fonts.gstatic.com`) add DNS, connection, and download overhead to the critical path, plus a GDPR/privacy concern.
2. **icon-16.png (1.25s) and favicon.ico (1.29s) have a slow waterfall** — these sub-1KB files are discovered late and queue behind higher-priority resources.

## Goals

- Eliminate all third-party font dependencies (zero external origins for fonts)
- Remove 4 network requests from the page load waterfall
- Tighten the Content Security Policy by removing unused external origins
- No visual regressions — same fonts, same icons, same rendering behavior

## Non-Goals

- Setting up continuous synthetic monitoring (separate ops task)
- Optimizing the JS bundle size or Supabase auth round-trip (already addressed in prior Lighthouse remediation)
- Changing the font family or weight selection

## Design

### 1. Self-Host Google Fonts

**Current state**: Three `<link>` tags in `index.html` load fonts from Google:
- `<link rel="preload" as="style" href="https://fonts.googleapis.com/css2?...">` (line 20)
- `<link href="https://fonts.googleapis.com/css2?..." rel="stylesheet" media="print" onload="this.media='all'">` (line 36)
- `<noscript><link href="https://fonts.googleapis.com/css2?..." rel="stylesheet"></noscript>` (line 37)

Two preconnect hints exist for these origins (lines 16–17).

**Change**:

1. Download 6 WOFF2 files and place in `public/fonts/`:
   - `outfit-400.woff2` (Outfit Regular)
   - `outfit-500.woff2` (Outfit Medium)
   - `outfit-600.woff2` (Outfit SemiBold)
   - `outfit-700.woff2` (Outfit Bold)
   - `outfit-800.woff2` (Outfit ExtraBold)
   - `pacifico-400.woff2` (Pacifico Regular)

2. Add `@font-face` declarations to the existing inline `<style>` block in `index.html`:

```css
@font-face{font-family:'Outfit';font-style:normal;font-weight:400;font-display:swap;src:url(/fonts/outfit-400.woff2) format('woff2')}
@font-face{font-family:'Outfit';font-style:normal;font-weight:500;font-display:swap;src:url(/fonts/outfit-500.woff2) format('woff2')}
@font-face{font-family:'Outfit';font-style:normal;font-weight:600;font-display:swap;src:url(/fonts/outfit-600.woff2) format('woff2')}
@font-face{font-family:'Outfit';font-style:normal;font-weight:700;font-display:swap;src:url(/fonts/outfit-700.woff2) format('woff2')}
@font-face{font-family:'Outfit';font-style:normal;font-weight:800;font-display:swap;src:url(/fonts/outfit-800.woff2) format('woff2')}
@font-face{font-family:'Pacifico';font-style:normal;font-weight:400;font-display:swap;src:url(/fonts/pacifico-400.woff2) format('woff2')}
```

3. Remove the 3 Google Fonts `<link>` tags (lines 20, 36, 37).

4. Remove the 2 preconnect hints for `fonts.googleapis.com` and `fonts.gstatic.com` (lines 16–17). Keep the Supabase preconnect (line 18).

**Rationale**: Eliminates 2 external origins and their associated DNS/connection overhead. WOFF2 is the only format needed — all modern browsers support it. `font-display: swap` matches the current `display=swap` parameter.

### 2. Inline Favicon and Icon-16 as Data URIs

**Current state**:
- `<link rel="icon" href="/favicon.ico" sizes="48x48" />` (line 12) — 823 bytes, took 1.29s in audit
- `<link rel="icon" type="image/png" sizes="16x16" href="/icons/icon-16.png" />` (line 14) — 801 bytes, took 1.25s in audit

**Change**:

1. Convert `public/favicon.ico` to a base64 data URI and inline in the `<link>` tag:
   ```html
   <link rel="icon" href="data:image/x-icon;base64,{base64-encoded}" sizes="48x48" />
   ```

2. Convert `public/icons/icon-16.png` to a base64 data URI and inline in the `<link>` tag:
   ```html
   <link rel="icon" type="image/png" sizes="16x16" href="data:image/png;base64,{base64-encoded}" />
   ```

3. Leave `icon-32.png` as a file reference (2.2KB, not flagged in audit).

4. Keep original files in `public/` — they're still referenced by `manifest.json` and potentially by external bookmarks/crawlers.

**Rationale**: At ~800 bytes each, base64 encoding adds approximately 1.1KB to the HTML document. This is negligible compared to the 1.25–1.29s network round-trips eliminated. The HTML is gzip-compressed in transit, further reducing the overhead.

### 3. CSP Tightening and Headers Update

**Current state**: The CSP in `index.html` (line 10) includes:
- `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`
- `font-src 'self' https://fonts.gstatic.com`

The `_headers` file has cache rules for `/assets/*`, `/logo.webp`, and `/index.html`.

**Change**:

1. Update CSP `style-src` to remove `https://fonts.googleapis.com`:
   ```
   style-src 'self' 'unsafe-inline'
   ```

2. Update CSP `font-src` to remove `https://fonts.gstatic.com`:
   ```
   font-src 'self'
   ```

3. Add cache rule for self-hosted fonts in `public/_headers`:
   ```
   /fonts/*
     Cache-Control: public, max-age=31536000, immutable
   ```

**Rationale**: Fewer allowed CSP origins = smaller attack surface. Font files are content-addressed (won't change without a new filename), so immutable caching is appropriate.

## Files Modified

| File | Change |
|------|--------|
| `index.html` | Add `@font-face` to inline CSS; inline favicon + icon-16 as data URIs; remove Google Fonts `<link>` tags and preconnects; tighten CSP |
| `public/_headers` | Add `/fonts/*` cache rule |
| `public/fonts/` (new) | 6 WOFF2 files: outfit-400 through 800, pacifico-400 |

## Impact Summary

| Metric | Before | Expected After |
|--------|--------|----------------|
| Network requests | 8 | 4 (eliminated: Google Fonts CSS, font file, icon-16.png, favicon.ico) |
| External origins | 2 (fonts.googleapis.com, fonts.gstatic.com) | 0 |
| HTML size increase | — | ~2KB (font-face CSS + base64 icons), compressed to ~500 bytes via gzip |
| CSP external origins | 2 | 0 |
| Fully-loaded time | 4.97s | Estimated improvement: 1–2s reduction |

## Verification Plan

1. `npm run build` — ensure no build errors
2. Local dev server — verify fonts render correctly at all 5 Outfit weights + Pacifico
3. Browser DevTools Network tab — confirm no requests to `fonts.googleapis.com` or `fonts.gstatic.com`
4. Check favicon renders in browser tab
5. Re-run Pingdom audit to compare before/after metrics
6. Run Lighthouse (desktop + mobile) to cross-reference

## Risk Assessment

- **Low risk**: Font rendering — WOFF2 with `font-display: swap` is identical behavior to the Google Fonts setup
- **Low risk**: HTML size — the ~2KB addition is negligible for a 1.7KB document (gzip handles it well)
- **No risk**: Original icon files remain in `public/` for `manifest.json` and external references
- **Positive side effect**: GDPR compliance improved — no more font requests to Google servers
