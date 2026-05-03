# Audit Part B -- Browser Diagnostics

Generated: 2026-04-10  
Method: Automated via `browser-use` CLI + headless Chromium (headed mode, authenticated session)  
Viewport: 1920x1080 (desktop), no CPU throttle applied  
Status: **Raw findings only -- no triage, no fixes proposed**

---

## PAGE 1: Browse Creators
**URL:** `https://dragoncandy.io/dashboard/business/creators`  
**Timestamp:** 2026-04-10T08:08:09Z

### Console Tab
- Errors on initial load: **0**
- Warnings on initial load: **0**
- Errors after 10-second scroll: **0**
- Warnings after scroll: **0**
- Any "Cannot read properties of null/undefined" errors: **No**

### Network Tab (Images)
- Total image requests on load: **4**
- Total transferred size (images only): **62 KB**
- Largest single image: **45 KB** -- `dragoncandy.io/icons/icon-192.png` (app icon, not content)
- Count of URLs containing `object/public`: **2**
- Count of URLs containing `object/sign` (signed URLs): **1**
- Count of URLs containing `render/image/public`: **0**
- Any 4xx/5xx image responses: **0**

### Oversized Images (natural vs displayed)
| Source | Natural | Displayed | Pixel Ratio |
|--------|---------|-----------|-------------|
| `object/public/profile-assets/.../logo-*.png` | 1024x1024 | 36x36 | **809x** |
| `object/sign/profile-assets/.../portfolio-*.jpeg` | 1169x1336 | 130x228 | **53x** |
| `object/public/profile-assets/.../avatar-*.jpeg` | 1258x2203 | 130x228 | **94x** |

### Image Attributes Audit
- Images missing `loading="lazy"`: **2 of 4** (logo + app icon)
- Images missing explicit `width`/`height` attributes: **4 of 4** (100%)
- Images using Supabase image transform (`render/image/public`): **0 of 4** (0%)

### Performance
- JS Heap: **13 MB** (initial), **13 MB** (post-scroll) -- stable
- DOM nodes: **294**
- No crash or error boundary triggered on desktop

### Post-Scroll State
- Total images: **4** (no new images loaded on scroll -- only 4 creators in DB)
- Broken images: **0**
- No console errors or warnings accumulated

---

## PAGE 2: Dragon Feed (Reels/Feed)
**URL:** `https://dragoncandy.io/dashboard/business/dragon-feed`  
**Timestamp:** 2026-04-10T08:09:11Z

### Console Tab
- Errors on initial load: **0**
- Warnings on initial load: **0**
- Errors after 10-second scroll: **0**
- Warnings after scroll: **0**
- Any "Cannot read properties of null/undefined" errors: **No**

### Network Tab (Images)
- Total image requests on load: **6**
- Total transferred size (images only): **62 KB** (mostly cached from prior page)
- Largest single image: **45 KB** -- `dragoncandy.io/icons/icon-192.png`
- Count of URLs containing `object/public`: **1**
- Count of URLs containing `object/sign` (signed URLs): **4**
- Count of URLs containing `render/image/public`: **0**
- Any 4xx/5xx image responses: **0**

### Oversized Images (natural vs displayed)
| Source | Natural | Displayed | Pixel Ratio |
|--------|---------|-----------|-------------|
| `object/public/profile-assets/.../logo-*.png` | 1024x1024 | 36x36 | **809x** |
| `object/sign/profile-assets/.../portfolio-*.png` | 1170x2532 | 209x209 | **68x** |
| `object/sign/profile-assets/.../portfolio-*.png` | 1170x2532 | 209x209 | **68x** |
| `object/sign/profile-assets/.../portfolio-*.jpeg` | 1169x1336 | 209x209 | **36x** |
| `object/sign/profile-assets/.../portfolio-*.png` | 1080x1080 | 209x209 | **27x** |

### Image Attributes Audit
- Images missing `loading="lazy"`: **6 of 6** (100%)
- Images missing explicit `width`/`height` attributes: **6 of 6** (100%)
- Images using Supabase image transform: **0 of 6** (0%)

### Video Elements
- Total `<video>` tags: **0** (feed items are images only for this creator set)

### Performance
- JS Heap: **13 MB** (stable across scroll)
- DOM nodes: **294**
- No crash or error boundary triggered

### Post-Scroll State
- Total images: **6** (unchanged)
- Total videos: **0**
- Broken images: **0**
- No console errors accumulated

---

## PAGE 3: Campaign Detail/Preview
**URL:** `https://dragoncandy.io/dashboard/business/campaigns/56e20530-a234-4e09-811d-0904a4ca7e6a`  
**Timestamp:** 2026-04-10T08:12:52Z

### Console Tab
- Errors on initial load: **0**
- Warnings on initial load: **0**
- Any "Cannot read properties of null/undefined" errors: **No**

### Network Tab (Images)
- Total image requests on load: **2**
- Total transferred size (images only): **62 KB** (cached)
- Largest single image: **45 KB** -- `dragoncandy.io/icons/icon-192.png`
- Count of URLs containing `object/public`: **1**
- Count of URLs containing `object/sign`: **0**
- Count of URLs containing `render/image/public`: **0**
- Any 4xx/5xx image responses: **0**

### Oversized Images (natural vs displayed)
| Source | Natural | Displayed | Pixel Ratio |
|--------|---------|-----------|-------------|
| `object/public/profile-assets/.../logo-*.png` | 1024x1024 | 36x36 | **809x** |

### Image Attributes Audit
- Images missing `loading="lazy"`: **2 of 2** (100%)
- Images missing explicit `width`/`height` attributes: **2 of 2** (100%)
- Images using Supabase image transform: **0 of 2** (0%)

### Video Elements
- Total `<video>` tags: **0**

### Performance
- JS Heap: **14 MB** (stable)
- DOM nodes: **573**
- No crash or error boundary triggered

---

## BONUS: Public Landing Page (unauthenticated)
**URL:** `https://dragoncandy.io/landing`  
**Timestamp:** 2026-04-10T07:58:14Z

### Console Tab
- Errors after scroll: **2** -- `"Failed to flush analytics batch: [object Object]"` (repeated)

### Network Tab (Images)
- Total image requests: **10** (performance API tracked); **25** `<img>` elements in DOM (marquee duplication)
- Total transferred size: **62 KB**
- Largest: **45 KB** -- `icons/icon-192.png`
- Supabase images: **8** (all signed URLs)
- `render/image/public` URLs: **0**

### Oversized Images
- **5 images** at 1170x2532 displayed at 160x160 = **116x pixel ratio**
- These are portfolio thumbnails in the marquee strip, duplicated 2x for seamless loop = same oversized image downloaded multiple times

### Duplicate Image Requests
- **4 unique portfolio images** each loaded **2x** (marquee duplication in DOM)

### Navigation Timing
- TTFB: **355 ms**
- DOMContentLoaded: **584 ms**
- Load complete: **585 ms**

### Performance
- JS Heap: **10 MB** (stable)
- DOM nodes: **204**

---

## CROSS-PAGE PATTERNS

### Consistent Across All Pages
1. **Zero images use Supabase image transform** (`render/image/public`). Every image is served at full original resolution.
2. **100% of images are missing explicit `width`/`height` HTML attributes** -- causes layout shift (CLS).
3. **Business logo (1024x1024) displayed at 36x36** on every authenticated page -- **809x oversized**. This single image alone wastes ~1 MB of decoded memory per page.
4. **No 4xx/5xx errors** observed on any page -- images load successfully, they're just oversized.
5. **JS Heap is stable** (10-14 MB) across all pages -- no memory leak during scroll.
6. **No crash or error boundary triggered** during this desktop session (1920x1080, no CPU throttle).

### Not Tested (requires manual verification)
- iPhone 12 Pro emulation + 4x CPU throttle (crash reproduction)
- Long tasks > 200ms during scroll (requires Performance tab recording)
- Frame drops during scroll (requires Performance tab timeline)
- Whether crash reproduces with more creators/feed items in the database

---

## PAGE 5: Browse Creators — Creator Profile Modals (Portfolio Deep-Dive)
**URL:** `https://dragoncandy.io/dashboard/business/creators` → "View Profile" modals  
**Timestamp:** 2026-04-10T09:45:00Z  
**Note:** This is the user-reported crash scenario — "when we view a Creator's profile and their portfolio, that's when it starts to crash or not load up all the thumbnails correctly"

---

### Creator: Charlie Smith (user `8e2f6554-f1ae-4110-b08c-3ac1afb3213b`)
**Portfolio:** 10 images + 2 videos

#### Images in Modal
| # | Natural | Displayed | Pixel Ratio | Notes |
|---|---------|-----------|-------------|-------|
| 0 | 4888x4128 | 269x269 | **330x** | Full-res DSLR photo |
| 1 | 6192x4128 | 269x269 | **530x** | Full-res DSLR photo |
| 2 | 6192x4128 | 269x269 | **530x** | Full-res DSLR photo |
| 3 | 4421x3893 | 269x269 | **237x** | Full-res DSLR photo |
| 4 | 6069x4046 | 269x269 | **340x** | Full-res DSLR photo |
| 5 | 6192x4128 | 269x269 | **530x** | Full-res DSLR photo |
| 6 | 5292x4010 | 269x269 | **292x** | Full-res DSLR photo |
| 7 | 4972x4128 | 269x269 | **284x** | Full-res DSLR photo |
| 8 | 5591x3837 | 269x269 | **287x** | Full-res DSLR photo |
| 9 | 4797x4128 | 269x269 | **273x** | Full-res DSLR photo |

**Decoded pixel memory (images only, estimated):** ~220 MP × 4 bytes/pixel = **~880 MB** of GPU/decoded memory for 10 thumbnails displayed at 269x269.

#### Videos in Modal
| # | Resolution | readyState | networkState | Error | Poster |
|---|-----------|------------|-------------|-------|--------|
| 0 | 1080x1920 | 4 (HAVE_ENOUGH_DATA) | 1 (NETWORK_IDLE) | null | none |
| 1 | 1080x1920 | 4 (HAVE_ENOUGH_DATA) | 1 (NETWORK_IDLE) | null | none |

- Both videos fully buffered (`readyState: 4`) — no poster thumbnails, no `preload="none"`.
- Videos served at full resolution via `getPublicUrl` (public bucket, no transform).

#### Performance
- JS Heap: **13 MB** (stable — Chrome manages video/image memory outside JS heap)
- DOM Nodes: **449**
- Console errors: **0**
- Broken images: **0**

#### Resource Timing (cumulative across session)
- **60 total profile-asset requests** after opening Charlie Smith's modal
- **Multiple images taking 3-5 seconds** to load (3114ms–4786ms duration) — the 6000x4000 DSLR photos
- Signed URL fetch requests generated for **ALL creators' portfolios**, not just the open modal

---

### Creator: Elias Acevedo (user `4675f7e8-34e0-4433-8435-8102a3183a76`)
**Portfolio:** No portfolio items uploaded

- 5 images total (logo, avatars from creator cards — no portfolio content)
- 0 video elements
- DOM Nodes: 456
- JS Heap: 14 MB
- No portfolio section visible in modal — only About, Skills, Rates, Reviews

---

### Creator: Dominick Commesso (user `3cf4cd98-bd21-427c-...`)
**Portfolio:** 1 image + 13 videos (all TikTok-style content)

#### Videos in Modal
| # | Resolution | readyState | networkState | Error | Notes |
|---|-----------|------------|-------------|-------|-------|
| 0-5 | 576x1024 | 4 | 1 | null | Vertical TikTok |
| 6 | 1024x576 | 4 | 1 | null | Horizontal |
| 7-12 | 576x1024 | 4 | 1 | null | Vertical TikTok |

- **13 video elements ALL fully buffered simultaneously** (`readyState: 4`)
- **No poster thumbnails** on any video — browser must download + decode each video file to show first frame
- **No `preload="none"`** — all videos begin loading immediately on modal open
- **No lazy loading** — all 13 videos load regardless of scroll position

#### Resource Timing (cumulative)
- **134 total resources** loaded by this point in session
- **83 profile-asset requests** (accumulated across all creator modal opens)
- **46 video-related resource entries** (signed URL fetches + actual video streams)

#### Performance
- JS Heap: **13 MB** (stable on desktop — video memory managed outside heap)
- DOM Nodes: **500**
- Console errors: **0**
- Broken images: **0**

---

### Creator: JGR Media (user `478c1421-44df-44a5-989f-0762baeafc0b`)
**Portfolio:** 4 images (from earlier session — signed URLs)

- Previously observed: portfolio images at 1170x2532 displayed at ~209x209 (**68x pixel ratio**)
- Signed URL requests for all portfolio items

---

## CROSS-PAGE PATTERNS (UPDATED with Creator Modal Findings)

### Critical Findings from Creator Profile Modals

1. **CreatorCard.tsx resolves signed URLs for ALL creators' portfolios on page load** — not just when a modal opens. With 4 creators this generates 60+ fetch requests. With 50+ creators this would be catastrophic.

2. **Charlie Smith's 10 DSLR photos decode to ~880 MB of pixel memory** when displayed at 269x269 thumbnails. On a mobile device with 2-4 GB total RAM, this alone could trigger an OOM crash.

3. **Dominick Commesso's 13 videos ALL load simultaneously** with no lazy loading, no poster images, and no `preload="none"`. Each video must be downloaded and decoded just to show the first frame as a thumbnail.

4. **No Supabase image transforms used anywhere** — not for thumbnails, not for avatars, not for portfolio grids. Every image is served at its original upload resolution.

5. **Broken avatar URL observed**: `https://dragoncandy.io/dashboard/business/8e2f6554.../avatar-...` — this is a route path, not a storage URL (returned 309 bytes, likely a redirect/404).

6. **Desktop doesn't crash** because Chrome manages image/video decoded memory outside the JS heap (heap stays at 13 MB). Mobile Safari/Chrome have much tighter memory limits and will kill the tab.

### Consistent Across All Pages (unchanged)
1. **Zero images use Supabase image transform** (`render/image/public`).
2. **100% of images are missing explicit `width`/`height` HTML attributes**.
3. **Business logo (1024x1024) displayed at 36x36** on every authenticated page — **809x oversized**.
4. **No 4xx/5xx errors** observed — images load successfully, they're just oversized.
5. **JS Heap is stable** (10-14 MB) on desktop — no JS memory leak.
6. **No crash or error boundary triggered** during this 1920x1080 desktop session.

### Not Tested (requires manual verification)
- iPhone 12 Pro emulation + 4x CPU throttle (crash reproduction)
- Long tasks > 200ms during scroll (requires Performance tab recording)
- Frame drops during scroll (requires Performance tab timeline)
- Whether crash reproduces with more creators/feed items in the database
- `performance.measureUserAgentSpecificMemory()` for true decoded image/video memory usage

---

*End of browser diagnostics. Awaiting acknowledgment before proceeding to triage or fixes.*
