# Mobile PWA & Desktop Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert DragonCandy into an installable mobile PWA where desktop visitors see a branded QR gate screen instead of the app.

**Architecture:** A single `DesktopGate` component is inserted at the top of `DashboardLayoutInner` — if `useIsMobile()` returns false, the gate renders instead of the app. PWA installability is achieved via `manifest.json` and four meta tags in `index.html`. No service worker in v1.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, Vite, `qrcode.react`, `sharp` (devDependency, icon generation only)

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `package.json` | Modify | Add `qrcode.react` + `sharp` (dev) |
| `scripts/generate-icons.mjs` | Create | One-time script to resize logo to 192/512px PNGs |
| `public/icons/icon-192.png` | Create (generated) | PWA icon for Android Chrome |
| `public/icons/icon-512.png` | Create (generated) | PWA icon for Android Chrome splash |
| `public/manifest.json` | Create | PWA manifest — name, theme color, display mode, icons |
| `index.html` | Modify | Add manifest link + 4 PWA meta tags |
| `src/components/DesktopGate.tsx` | Create | Branded full-screen gate with QR code |
| `src/components/DashboardLayout.tsx` | Modify | Add `if (!isMobile) return <DesktopGate />;` |

---

## Task 1: Install dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install `qrcode.react` and `sharp`**

```bash
cd C:/Users/dwill/Desktop/dragoncandy-v2
npm install qrcode.react
npm install --save-dev sharp
```

- [ ] **Step 2: Verify install**

```bash
grep -E '"qrcode.react|"sharp"' package.json
```

Expected output includes both packages with version numbers.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add qrcode.react and sharp for PWA"
```

---

## Task 2: Generate PWA icons

**Files:**
- Create: `scripts/generate-icons.mjs`
- Create: `public/icons/icon-192.png` (generated)
- Create: `public/icons/icon-512.png` (generated)

- [ ] **Step 1: Create the icon generation script**

Create `scripts/generate-icons.mjs`:

```js
import sharp from 'sharp';
import { mkdirSync } from 'fs';

mkdirSync('public/icons', { recursive: true });

const src = 'src/assets/dragon-candy-logo.png';

await sharp(src).resize(192, 192, { fit: 'contain', background: { r: 77, g: 217, b: 192, alpha: 1 } }).toFile('public/icons/icon-192.png');
await sharp(src).resize(512, 512, { fit: 'contain', background: { r: 77, g: 217, b: 192, alpha: 1 } }).toFile('public/icons/icon-512.png');

console.log('Icons generated: public/icons/icon-192.png, public/icons/icon-512.png');
```

- [ ] **Step 2: Run the script**

```bash
node scripts/generate-icons.mjs
```

Expected output:
```
Icons generated: public/icons/icon-192.png, public/icons/icon-512.png
```

- [ ] **Step 3: Verify icons exist**

```bash
ls public/icons/
```

Expected: `icon-192.png  icon-512.png`

- [ ] **Step 4: Commit**

```bash
git add scripts/generate-icons.mjs public/icons/
git commit -m "chore: add PWA icon generation script and generated icons"
```

---

## Task 3: Create `public/manifest.json`

**Files:**
- Create: `public/manifest.json`

- [ ] **Step 1: Create the manifest**

Create `public/manifest.json`:

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

- [ ] **Step 2: Verify JSON is valid**

```bash
node -e "JSON.parse(require('fs').readFileSync('public/manifest.json','utf8')); console.log('valid')"
```

Expected: `valid`

- [ ] **Step 3: Commit**

```bash
git add public/manifest.json
git commit -m "feat: add PWA manifest"
```

---

## Task 4: Update `index.html` with PWA meta tags

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Add manifest link and PWA meta tags**

In `index.html`, add these 4 lines inside `<head>`, after the existing `<meta name="viewport">` tag:

```html
    <link rel="manifest" href="/manifest.json" />
    <meta name="theme-color" content="#4DD9C0" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="default" />
```

The `<head>` block should now look like:

```html
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="manifest" href="/manifest.json" />
    <meta name="theme-color" content="#4DD9C0" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="default" />
    <title>DragonCandy</title>
    ...
```

Also update `<title>` from `candy-campaign-creator` to `DragonCandy` while in this file.

- [ ] **Step 2: Verify with dev server**

```bash
npm run dev
```

Open browser DevTools → Application → Manifest. Confirm the manifest loads with name "DragonCandy" and both icons listed.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat: add PWA meta tags and manifest link to index.html"
```

---

## Task 5: Create `src/components/DesktopGate.tsx`

**Files:**
- Create: `src/components/DesktopGate.tsx`

- [ ] **Step 1: Create the component**

Create `src/components/DesktopGate.tsx`:

```tsx
import { QRCodeSVG } from 'qrcode.react';
import dragonCandyLogo from '@/assets/dragon-candy-logo.png';

export function DesktopGate() {
  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-[#F9C8E0] to-[#4DD9C0] flex items-center justify-center p-8">
      <div className="bg-white/90 backdrop-blur-sm rounded-3xl p-10 text-center max-w-sm w-full shadow-2xl">
        <img
          src={dragonCandyLogo}
          alt="DragonCandy"
          className="h-12 mx-auto mb-5"
        />
        <h1 className="text-2xl font-extrabold text-gray-900 mb-2">
          Better on your phone 📱
        </h1>
        <p className="text-sm text-gray-500 mb-6">
          The full DragonCandy experience is designed for mobile. Grab your phone!
        </p>
        <div className="flex justify-center mb-5">
          <div className="p-2 rounded-2xl ring-4 ring-dc-pink-accent bg-white shadow-md inline-block">
            <QRCodeSVG
              value="https://dragoncandy.io"
              size={128}
              fgColor="#111111"
              bgColor="#ffffff"
            />
          </div>
        </div>
        <div className="bg-dc-pink-accent text-white rounded-full px-6 py-2.5 text-sm font-bold inline-block mb-3">
          Scan to open on phone
        </div>
        <p className="text-xs text-gray-400">dragoncandy.io</p>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: no errors related to `DesktopGate.tsx`.

- [ ] **Step 3: Commit**

```bash
git add src/components/DesktopGate.tsx
git commit -m "feat: add DesktopGate component with QR code"
```

---

## Task 6: Integrate `DesktopGate` into `DashboardLayout`

**Files:**
- Modify: `src/components/DashboardLayout.tsx`

- [ ] **Step 1: Add import**

At the top of `src/components/DashboardLayout.tsx`, add:

```tsx
import { DesktopGate } from '@/components/DesktopGate';
```

- [ ] **Step 2: Add the gate check — place it after ALL hook declarations**

React's rules of hooks require all hook calls to appear before any early return. The function already calls `useLocation`, `useAIAssistantContext`, and `useAIChatModal` after `useIsMobile`. The `if (!isMobile)` guard must go **after all of them**. Replace the top of `DashboardLayoutInner` so it reads:

```tsx
const DashboardLayoutInner: React.FC<DashboardLayoutProps> = ({ children, userRole }) => {
  const { user } = useAuth();
  const logout = useLogout();
  const { avatarUrl, displayName } = useProfileData();
  const isMobile = useIsMobile();
  const location = useLocation();
  const { setUserRole } = useAIAssistantContext();
  const { isOpen: isAIChatOpen, openModal, closeModal } = useAIChatModal();

  if (!isMobile) return <DesktopGate />;   // ← insert here, after all hooks

  // ... rest of function unchanged
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Manual verification — desktop**

```bash
npm run dev
```

1. Open `http://localhost:5173/dashboard/business` in a desktop browser
2. Expected: full-screen pink-to-teal gradient gate with DragonCandy logo, "Better on your phone 📱" heading, QR code, and "Scan to open on phone" button
3. Expected: NO sidebar, NO bottom nav, NO app content visible

- [ ] **Step 6: Manual verification — mobile**

Open Chrome DevTools → Toggle device toolbar → select iPhone 14 viewport (390px wide)

1. Navigate to `http://localhost:5173/dashboard/business`
2. Expected: normal app renders — bottom nav visible, dashboard content visible, NO gate screen

- [ ] **Step 7: Manual verification — landing page unaffected**

Navigate to `http://localhost:5173/` (landing page) on desktop.

Expected: landing page renders normally — NOT the gate screen.

- [ ] **Step 8: Commit**

```bash
git add src/components/DashboardLayout.tsx
git commit -m "feat: block desktop access to app with DesktopGate"
```

---

## Task 7: Final PWA verification

No file changes — verification only.

- [ ] **Step 1: Run Lighthouse PWA audit**

In Chrome DevTools with `npm run dev` running:
1. Open DevTools → Lighthouse tab
2. Select "Progressive Web App" category
3. Run audit on `http://localhost:5173`

Expected: PWA installability criteria met (manifest found, icons present, HTTPS in production).

> **Note:** Lighthouse may show an HTTP warning locally — this is expected. On production (`dragoncandy.io`, which is HTTPS via Lovable), the "Add to Home Screen" prompt will appear.

- [ ] **Step 2: Verify manifest in DevTools**

DevTools → Application → Manifest

Expected:
- Name: DragonCandy
- Theme color: #4DD9C0
- Display: standalone
- Icons: both 192×192 and 512×512 listed

- [ ] **Step 3: Push to main for production verification**

```bash
git push origin main
```

After Lovable deploys, open `https://dragoncandy.io` on an Android device in Chrome. A "Add to Home Screen" banner should appear within a few visits.

---

## Success Criteria Checklist

- [ ] Desktop browser on any `/dashboard/*` route shows the DesktopGate screen
- [ ] Landing page (`/`) works normally on desktop
- [ ] Mobile viewport shows the app as before — no regressions
- [ ] DevTools Application → Manifest shows DragonCandy with both icons
- [ ] QR code scans to `https://dragoncandy.io`
- [ ] App title in browser tab reads "DragonCandy" (not "candy-campaign-creator")
