# DragonCandy — Mobile PWA & Desktop Gate

**Date:** 2026-03-23
**Status:** Approved for implementation

---

## Goal

Convert DragonCandy from a responsive web app into a mobile-first PWA (Progressive Web App). The authenticated app experience is mobile-only. Desktop/laptop visitors to the app are shown a branded gate screen with a QR code directing them to open the app on their phone. The marketing landing page remains fully responsive.

---

## Approach

**Layout-level gate via `DashboardLayout`** — insert a single `!isMobile` check at the top of `DashboardLayoutInner`. If the visitor is on desktop, render `<DesktopGate />` instead of the app. All 50+ pages are covered automatically with no per-page changes. Desktop sidebar code is preserved (hidden, not removed) for potential future use.

---

## Architecture

### What Changes

| File | Change |
|---|---|
| `src/components/DashboardLayout.tsx` | Add `if (!isMobile) return <DesktopGate />;` inside `DashboardLayoutInner` |
| `src/components/DesktopGate.tsx` | New component — branded gate screen with QR code |
| `public/manifest.json` | New file — PWA manifest for home screen installability |
| `index.html` | Add 4 PWA meta tags |
| `package.json` | Add `qrcode.react` dependency |

### What Does Not Change

- `LandingPage.tsx` — stays fully responsive for desktop visitors
- All 50+ page components — no modifications needed
- Desktop sidebar code in `DashboardLayout` — preserved, just never rendered on mobile
- Supabase backend, auth, routing — untouched

---

## Component: `DesktopGate`

**Location:** `src/components/DesktopGate.tsx`

**Behavior:**
- Renders when `useIsMobile()` returns `false` (viewport ≥ 768px)
- Full-screen, replaces all app chrome (no sidebar, no nav leaks through)
- QR code generated client-side via `qrcode.react`, points to `https://dragoncandy.io`

**Visual design (Option B — Bold & Branded):**
- Full-screen pink-to-teal gradient background (`from-dc-pink/60 to-teal-400/80`)
- White semi-transparent frosted card centered on screen
- DragonCandy logo
- Headline: "Better on your phone 📱"
- Body: "The full DragonCandy experience is designed for mobile. Grab your phone!"
- QR code with pink ring border (`ring-4 ring-dc-pink`)
- Label: "Scan to open on phone"
- Subtext: `dragoncandy.io`

**Integration point in `DashboardLayout.tsx`:**
```tsx
const DashboardLayoutInner: React.FC<DashboardLayoutProps> = ({ children, userRole }) => {
  const isMobile = useIsMobile();

  // Gate: show branded screen for desktop visitors
  if (!isMobile) return <DesktopGate />;

  // ... rest of layout unchanged
```

---

## PWA Configuration

### `public/manifest.json`
```json
{
  "name": "DragonCandy",
  "short_name": "DragonCandy",
  "description": "Marketplace connecting brands with content creators",
  "start_url": "/",
  "display": "standalone",
  "theme_color": "#4DD9C0",
  "background_color": "#A8A8A0",
  "icons": [
    {
      "src": "/icons/icon-192.png",
      "sizes": "192x192",
      "type": "image/png"
    },
    {
      "src": "/icons/icon-512.png",
      "sizes": "512x512",
      "type": "image/png"
    }
  ]
}
```

> **Note:** Android Chrome requires at least a 192×192 and a 512×512 PNG icon for the "Add to Home Screen" installability banner to appear. These must be created from the DragonCandy logo and placed at `public/icons/icon-192.png` and `public/icons/icon-512.png`.

### `index.html` additions
```html
<link rel="manifest" href="/manifest.json" />
<meta name="theme-color" content="#4DD9C0" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="default" />
```

**No service worker in v1** — offline support deferred. The app is installable and runs full-screen without it.

---

## Dependencies

- `qrcode.react` — lightweight client-side QR code generator, no backend required

---

## Implementation Notes

- **`useIsMobile()` breakpoint:** Confirm the existing hook uses 768px as its threshold to match the gate trigger — no changes to the hook needed if it already uses this value.
- **QR code URL:** Points to `https://dragoncandy.io` (root). Deep-linking to the specific route the desktop visitor was on is **not** a requirement — users will re-authenticate on mobile normally.
- **PWA icons:** Must generate `icon-192.png` and `icon-512.png` from the existing DragonCandy logo asset (`src/assets/dragon-candy-logo.png`) and place them in `public/icons/`.

---

## Mobile Install Experience

| Platform | How users install |
|---|---|
| Android (Chrome) | "Add to Home Screen" banner appears automatically after engagement |
| iOS (Safari) | Share → "Add to Home Screen" → opens full-screen, no browser chrome |

---

## Out of Scope

- Service worker / offline caching (v2)
- Push notifications via Web Push API (v2)
- App Store / Google Play native app (not planned)
- Removing or refactoring desktop sidebar code (preserved intentionally)

---

## Success Criteria

1. Opening any authenticated app URL on a desktop browser shows the `DesktopGate` screen
2. Opening `dragoncandy.io` (landing page) on desktop shows the full marketing page
3. On mobile, the app works exactly as before — no regressions
4. On mobile Chrome/Safari, the app is installable to the home screen
5. Installed PWA opens full-screen with no browser URL bar
