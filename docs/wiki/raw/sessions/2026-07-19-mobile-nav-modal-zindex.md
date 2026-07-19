# Session 2026-07-19 — Mobile bottom-nav overlap fix (z-layering contract)

**PR:** #297 (merged). Frontend-only; no schema/RLS/edge-fn/secret/logic/routing change.

## Report

Founder screen-recording: on mobile the "Send Invitation" button at the bottom of the
campaign-invite bottom-sheet was mostly hidden behind the fixed bottom nav. Asked to fix it
**and** make sure the same mishap doesn't occur anywhere else.

## Root cause (systematic-debugging, evidence-first)

Persistent app chrome — `MobileBottomNav` and `MobileTopNav` — was `z-50`, the **same layer as
every Radix modal** (shadcn `Sheet`/`Dialog`/`AlertDialog` overlay + content are all `z-50`,
`src/components/ui/sheet.tsx`). Both the nav and the sheets `createPortal` to `<body>`, so the
`z-50` tie is resolved only by DOM insertion order — fragile and engine-dependent; on iOS Safari
the opaque white nav wins and paints over the sheet's bottom action button. This is a distinct
class from the doc's §1 (transform containing-block trap) and §3 (overscroll mis-paint) — a plain
z-index collision. Standard layering is `page content < app chrome < modal layer < toasts`; the
chrome had collided with the modal layer.

## Fix (4 files)

1. `src/components/MobileBottomNav.tsx` + `src/components/MobileTopNav.tsx`: `z-50` → `z-40`
   (app chrome below the modal layer). Deterministically renders every `side="bottom"` sheet
   (~20) + all dialogs above the nav at once; the modal overlay now correctly dims the nav.
2. `src/components/campaign-details/StickyApplyCTA.tsx` (creator campaign-details) — a NON-modal
   in-page `fixed bottom-0 z-40` bar that coexists with the nav: `bottom-0` →
   `bottom-[calc(6rem+env(safe-area-inset-bottom))] md:bottom-0` so it sits above the nav bar +
   floating Donny emblem on mobile; desktop (no bottom nav) unchanged.
3. `src/components/brand-browse/ShortlistDrawer.tsx` peek bar (brand-only) — same class; its
   fragile `+60px` offset (barely cleared the ~56px nav) aligned to the `6rem` convention.

## Audit / completeness

- Swept every `fixed`/`sticky` bottom-anchored bar + every `fixed inset-0` overlay. Only two
  non-modal in-page bottom bars exist (StickyApplyCTA, ShortlistDrawer peek) — both fixed.
- `ScheduleReviewScreen`'s sticky footer lives INSIDE a `Sheet` (`z-50`) → covered by the
  z-index change, no separate fix.
- No custom overlay sits at `z-40` or below → lowering the nav creates no new ties. Donny mobile
  sheet (`z-[60]/[61]`) + toasts (`z-[100]`) stay above.

## Verdict / z-stack (the durable rule)

`page content (z-auto) < in-page sticky sub-headers (z-10/20/30) < app chrome (both navs +
desktop header + DonnyDesktopPanel = z-40) < Radix modal layer (Sheet/Dialog/Popover/Dropdown/
Tooltip = z-50) < DonnyMobileSheet (z-[60/61]) < toasts (z-[100])`. Never give persistent chrome
the modal layer's `z-50`. A new non-modal in-page bottom bar must offset above the nav on mobile
(`6rem + env(safe-area-inset-bottom)`) or live inside a modal.

## Gotchas this session

- `git diff` auto-normalizes line endings, hiding a CRLF-vs-LF mismatch. The gh-REST PR path
  needs the blob's line-ending to MATCH origin/main **per file**: `MobileBottomNav.tsx` is CRLF
  on main (blob it raw), the other 3 are LF (blob with `tr -d '\r'`). Getting this wrong showed
  a whole-file `+84/-80` in the GitHub compare; matching per-file EOL restored clean small diffs.
- `grep -cP '\r$'` is unreliable on msys (strips `\r\n` together → reports 0 CR even for CRLF);
  use `xxd`/`file` to determine true line endings.
- Codex's `git diff --check` flags CR bytes as "trailing whitespace" on CRLF files — a false
  alarm resolved by the per-file EOL matching above; Codex's actual review was clean.

## Verification

`npm run build` green; Tailwind emitted `bottom:calc(6rem + env(safe-area-inset-bottom))`.
Independent code review PASS; Codex second review clean. Required CI (verify/smoke/lighthouse)
green; squash-merged. Authenticated on-device visual check is the founder's (Claude can't sign in).
