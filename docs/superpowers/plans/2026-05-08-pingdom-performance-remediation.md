# Pingdom Performance Remediation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate 4 network requests and 2 external font origins from the page load waterfall by self-hosting Google Fonts, inlining tiny favicon/icon as data URIs, and tightening the CSP.

**Architecture:** All changes are in the static shell (`index.html`, `public/` assets, `_headers`). No React component changes. The Vite build pipeline is unaffected — fonts live in `public/` (served as-is), not `src/` (not processed by Vite).

**Tech Stack:** HTML, CSS `@font-face`, WOFF2 fonts, base64 data URIs, Netlify-style `_headers` file.

**Spec:** `docs/superpowers/specs/2026-05-08-pingdom-performance-remediation-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `public/fonts/outfit-latin-400.woff2` | Create | Outfit Regular latin subset |
| `public/fonts/outfit-latin-500.woff2` | Create | Outfit Medium latin subset |
| `public/fonts/outfit-latin-600.woff2` | Create | Outfit SemiBold latin subset |
| `public/fonts/outfit-latin-700.woff2` | Create | Outfit Bold latin subset |
| `public/fonts/outfit-latin-800.woff2` | Create | Outfit ExtraBold latin subset |
| `public/fonts/pacifico-latin-400.woff2` | Create | Pacifico Regular latin subset |
| `index.html` | Modify | Add @font-face, inline icons, remove Google Fonts links, tighten CSP |
| `public/_headers` | Modify | Add /fonts/* cache rule |

---

### Task 1: Download and install WOFF2 font files

**Files:**
- Create: `public/fonts/outfit-latin-400.woff2`
- Create: `public/fonts/outfit-latin-500.woff2`
- Create: `public/fonts/outfit-latin-600.woff2`
- Create: `public/fonts/outfit-latin-700.woff2`
- Create: `public/fonts/outfit-latin-800.woff2`
- Create: `public/fonts/pacifico-latin-400.woff2`

- [ ] **Step 1: Create the fonts directory**

```powershell
New-Item -ItemType Directory -Path "public/fonts" -Force
```

- [ ] **Step 2: Fetch the Google Fonts CSS to extract WOFF2 URLs**

Google Fonts serves different formats based on User-Agent. Use a Chrome UA to get WOFF2 with unicode-range subsets:

```powershell
$ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
$css = Invoke-WebRequest -Uri "https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&family=Pacifico&display=swap" -UserAgent $ua
$css.Content | Out-File -Encoding utf8 "public/fonts/_google-fonts-response.css"
```

Review the CSS file to identify the `/* latin */` subset `@font-face` blocks. Each block has a `src: url(...)` pointing to a `fonts.gstatic.com` WOFF2 file. We only need the `/* latin */` subset for each weight (DragonCandy is English-only).

- [ ] **Step 3: Download each latin subset WOFF2 file**

Run the following PowerShell script to parse the CSS from step 2, extract the `/* latin */` subset WOFF2 URLs, and download each one with a descriptive filename:

```powershell
$css = Get-Content "public/fonts/_google-fonts-response.css" -Raw

# Split CSS into blocks by the /* latin */ comment. Each latin block contains one @font-face.
# Pattern: /* latin */ followed by @font-face { ... font-weight: NNN; ... src: url(URL) ... }
$latinBlocks = [regex]::Matches($css, '/\* latin \*/\s*@font-face\s*\{[^}]+\}')

foreach ($block in $latinBlocks) {
    $text = $block.Value
    $weight = if ($text -match 'font-weight:\s*(\d+)') { $Matches[1] } else { "400" }
    $family = if ($text -match "font-family:\s*'([^']+)'") { $Matches[1].ToLower() } else { "unknown" }
    $url = if ($text -match "src:\s*url\(([^)]+)\)") { $Matches[1] } else { $null }

    if ($url) {
        $outFile = "public/fonts/$family-latin-$weight.woff2"
        Write-Host "Downloading $family weight $weight -> $outFile"
        Invoke-WebRequest -Uri $url -OutFile $outFile
    }
}
```

Expected output: 6 lines like `Downloading outfit weight 400 -> public/fonts/outfit-latin-400.woff2`.

- [ ] **Step 4: Verify font files exist and have reasonable sizes**

```powershell
Get-ChildItem "public/fonts/*.woff2" | Select-Object Name, Length
```

Expected: 6 WOFF2 files, each roughly 5–30KB. Outfit weights should be similar sizes; Pacifico is typically larger (~15KB).

- [ ] **Step 5: Delete the temporary CSS file**

```powershell
Remove-Item "public/fonts/_google-fonts-response.css"
```

- [ ] **Step 6: Commit**

```powershell
git add public/fonts/
git commit -m "perf: add self-hosted Outfit and Pacifico WOFF2 latin subsets"
```

---

### Task 2: Add @font-face declarations and remove Google Fonts links

> **Note:** Line numbers below refer to the original `index.html` before any edits. Match by content, not line number — prior task edits may shift lines.

**Files:**
- Modify: `index.html` (preconnects, inline style block, Google Fonts link tags)

- [ ] **Step 1: Replace Google Fonts preconnects with @font-face declarations**

In `index.html`, remove lines 16–17 (the two Google Fonts preconnects):

```html
<!-- REMOVE these two lines -->
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
```

- [ ] **Step 2: Add @font-face rules to the inline style block**

In the existing `<style>` block (currently lines 21–35), prepend the `@font-face` declarations before the existing `body{...}` rule. All on single minified lines to keep the HTML compact:

```html
    <style>
      @font-face{font-family:'Outfit';font-style:normal;font-weight:400;font-display:swap;src:url(/fonts/outfit-latin-400.woff2) format('woff2')}
      @font-face{font-family:'Outfit';font-style:normal;font-weight:500;font-display:swap;src:url(/fonts/outfit-latin-500.woff2) format('woff2')}
      @font-face{font-family:'Outfit';font-style:normal;font-weight:600;font-display:swap;src:url(/fonts/outfit-latin-600.woff2) format('woff2')}
      @font-face{font-family:'Outfit';font-style:normal;font-weight:700;font-display:swap;src:url(/fonts/outfit-latin-700.woff2) format('woff2')}
      @font-face{font-family:'Outfit';font-style:normal;font-weight:800;font-display:swap;src:url(/fonts/outfit-latin-800.woff2) format('woff2')}
      @font-face{font-family:'Pacifico';font-style:normal;font-weight:400;font-display:swap;src:url(/fonts/pacifico-latin-400.woff2) format('woff2')}
      body{margin:0;font-family:'Outfit',system-ui,sans-serif;-webkit-font-smoothing:antialiased}
      /* ... rest of existing inline CSS unchanged ... */
    </style>
```

- [ ] **Step 3: Remove the Google Fonts preload link**

Remove line 20:

```html
<!-- REMOVE this line -->
<link rel="preload" as="style" href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&family=Pacifico&display=swap">
```

- [ ] **Step 4: Remove the async Google Fonts stylesheet loader and noscript fallback**

Remove lines 36–37:

```html
<!-- REMOVE these two lines -->
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&family=Pacifico&display=swap" rel="stylesheet" media="print" onload="this.media='all'">
<noscript><link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&family=Pacifico&display=swap" rel="stylesheet"></noscript>
```

- [ ] **Step 5: Verify no Google Fonts `<link>` tags remain in index.html**

Check that all Google Fonts `<link>` tags are gone. The CSP meta tag still references these origins at this point — that's expected and will be cleaned in Task 4.

```powershell
Select-String -Path "index.html" -Pattern "<link.*fonts\.(googleapis|gstatic)"
```

Expected: No matches.

- [ ] **Step 6: Run build to verify no breakage**

```powershell
npm run build
```

Expected: Clean build, no errors.

- [ ] **Step 7: Commit**

```powershell
git add index.html
git commit -m "perf: self-host fonts — replace Google Fonts links with local @font-face"
```

---

### Task 3: Inline favicon.ico and icon-16.png as data URIs

> **Note:** Line numbers below refer to the original `index.html` before any edits. Match by content, not line number — prior task edits may shift lines.

**Files:**
- Modify: `index.html` (favicon and icon-16 link tags)

- [ ] **Step 1: Generate base64 for favicon.ico**

```powershell
$bytes = [System.IO.File]::ReadAllBytes("public/favicon.ico")
$b64 = [Convert]::ToBase64String($bytes)
Write-Output "data:image/x-icon;base64,$b64"
```

Copy the full data URI output.

- [ ] **Step 2: Generate base64 for icon-16.png**

```powershell
$bytes = [System.IO.File]::ReadAllBytes("public/icons/icon-16.png")
$b64 = [Convert]::ToBase64String($bytes)
Write-Output "data:image/png;base64,$b64"
```

Copy the full data URI output.

- [ ] **Step 3: Replace favicon.ico link tag with inline data URI**

In `index.html`, replace the favicon link (line 12):

```html
<!-- BEFORE -->
<link rel="icon" href="/favicon.ico" sizes="48x48" />

<!-- AFTER (with actual base64 from step 1) -->
<link rel="icon" href="data:image/x-icon;base64,ACTUAL_BASE64_HERE" sizes="48x48" />
```

- [ ] **Step 4: Replace icon-16.png link tag with inline data URI**

In `index.html`, replace the icon-16 link (line 14):

```html
<!-- BEFORE -->
<link rel="icon" type="image/png" sizes="16x16" href="/icons/icon-16.png" />

<!-- AFTER (with actual base64 from step 2) -->
<link rel="icon" type="image/png" sizes="16x16" href="data:image/png;base64,ACTUAL_BASE64_HERE" />
```

- [ ] **Step 5: Verify original files still exist for manifest.json**

```powershell
Test-Path "public/favicon.ico"; Test-Path "public/icons/icon-16.png"
```

Expected: Both return `True`.

- [ ] **Step 6: Run build to verify no breakage**

```powershell
npm run build
```

Expected: Clean build, no errors.

- [ ] **Step 7: Commit**

```powershell
git add index.html
git commit -m "perf: inline favicon.ico and icon-16.png as data URIs to eliminate waterfall"
```

---

### Task 4: Tighten CSP and add font cache headers

> **Note:** Line numbers below refer to the original `index.html` before any edits. Match by content, not line number — prior task edits may shift lines.

**Files:**
- Modify: `index.html` (CSP meta tag)
- Modify: `public/_headers` (add font cache rule)

- [ ] **Step 1: Remove fonts.googleapis.com from CSP style-src**

In the CSP meta tag on line 10 of `index.html`, find:

```
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com
```

Replace with:

```
style-src 'self' 'unsafe-inline'
```

- [ ] **Step 2: Remove fonts.gstatic.com from CSP font-src**

In the same CSP meta tag, find:

```
font-src 'self' https://fonts.gstatic.com
```

Replace with:

```
font-src 'self'
```

- [ ] **Step 3: Verify CSP has no Google Fonts references**

```powershell
Select-String -Path "index.html" -Pattern "fonts.googleapis|fonts.gstatic"
```

Expected: No matches.

- [ ] **Step 4: Add /fonts/* cache rule to _headers**

In `public/_headers`, add a new rule block after the existing `/assets/*` rule (after line 2). The final file should read:

```
/assets/*
  Cache-Control: public, max-age=31536000, immutable

/fonts/*
  Cache-Control: public, max-age=31536000, immutable

/logo.webp
  Cache-Control: public, max-age=86400

/index.html
  Cache-Control: public, s-maxage=3600, max-age=0, must-revalidate

/*
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
```

- [ ] **Step 5: Run build to verify no breakage**

```powershell
npm run build
```

Expected: Clean build, no errors.

- [ ] **Step 6: Commit**

```powershell
git add index.html public/_headers
git commit -m "perf: tighten CSP — remove Google Fonts origins; add font cache headers"
```

---

### Task 5: Verify all changes end-to-end

**Files:** None (verification only)

- [ ] **Step 1: Run full build**

```powershell
npm run build
```

Expected: Clean build, zero errors.

- [ ] **Step 2: Start dev server and visually verify fonts**

```powershell
npm run dev
```

Open `http://127.0.0.1:8080` in a browser. Check:
- Landing page heading uses Outfit Bold/ExtraBold (weights 700/800)
- Body text uses Outfit Regular (400)
- Any Pacifico-styled text renders in the script font
- No FOUT (flash of unstyled text) beyond the expected `font-display: swap` behavior

- [ ] **Step 3: Verify no external font requests in DevTools**

Open Chrome DevTools → Network tab → reload. Filter by "font" type.
- Expected: Only requests to `127.0.0.1:8080/fonts/*.woff2` — zero requests to `fonts.googleapis.com` or `fonts.gstatic.com`

- [ ] **Step 4: Verify favicon appears in browser tab**

Check the browser tab icon. It should show the DragonCandy icon (same as before).

- [ ] **Step 5: Verify CSP is correct in response headers**

In Chrome DevTools → Console, check for any CSP violation errors. There should be none.

- [ ] **Step 6: Confirm total index.html request count**

In DevTools Network tab, reload with cache disabled. Count total requests for the initial page load.
- Expected: ~4 fewer requests than the Pingdom baseline of 8 (Google Fonts CSS, font file, icon-16.png, favicon.ico eliminated)

---
