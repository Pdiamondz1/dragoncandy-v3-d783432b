# Brand assets

Public, stable URLs for brand marks used outside the app — chiefly email
signatures, which cannot reference anything in `src/`.

| File | Size | Used by |
|------|------|---------|
| `dc-mark-104.png` | 104×122 | Email signatures. Displayed at 52×61; this is the 2× retina asset. |
| `dc-mark-512.png` | 440×512 | Documents, decks, general use. |

Both are served at `https://dragoncandy.com/brand/<file>` because Vercel serves
`public/` from the site root.

## Why PNG and not the existing `logo.webp`

Outlook for Windows renders mail with the Word engine, which has no WebP
support — the mark would appear as a broken-image box in a large share of
business inboxes.

## Transparency is load-bearing

Both files keep an alpha channel. Apple Mail and Outlook auto-invert light
signatures in dark mode; a mark with an opaque white background becomes a
glowing white slab. Any regeneration MUST preserve alpha — check it.

## Regenerate

    sips -s format png public/logo.webp --out /tmp/dc-mark-full.png
    sips -z 122 104 /tmp/dc-mark-full.png --out public/brand/dc-mark-104.png
    sips -z 512 440 /tmp/dc-mark-full.png --out public/brand/dc-mark-512.png
    sips -g hasAlpha public/brand/dc-mark-104.png   # must print: hasAlpha: yes
