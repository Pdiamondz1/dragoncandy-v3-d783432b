# Design System: Production Tokens & UI Primitives

**Date:** 2026-04-01
**Status:** Approved
**Scope:** Design tokens, Tailwind config, Button/Card component enhancements
**Constraint:** No page-level components or routing changes

---

## Context

DragonCandy launches production next week. The app currently looks like a prototype — inconsistent styling, no elevation system, no standardized button variants for the brand. This spec establishes the production design foundation by updating existing tokens and enhancing existing components. Zero new files for components; zero migration burden.

## Decisions Made

1. **Dark mode base**: Replace existing `#1E1E33` with `#1A1A2A` (navy undertone pairs better with teal primary)
2. **Token location**: Update `src/index.css` in place — no separate `design-tokens.css` file
3. **Component strategy**: Enhance existing shadcn `Button` and `Card` — no parallel `DCButton`/`DCCard` components

---

## 1. Dark Mode Token Updates (`src/index.css`)

Replace the `.dark` block's background-related tokens with `#1A1A2A`-derived values:

| Token | Current (HSL) | New (HSL) | Hex |
|-------|--------------|-----------|-----|
| `--background` | `240 27% 14%` | `240 23% 13%` | `#1A1A2A` |
| `--card` | `240 24% 19%` | `240 22% 18%` | `#242438` |
| `--popover` | `240 24% 19%` | `240 22% 16%` | `#1F1F32` |
| `--muted` | `240 20% 22%` | `240 20% 23%` | `#2E2E45` |
| `--border` | `240 20% 25%` | `240 20% 24%` | `#303050` |
| `--input` | `240 20% 25%` | `240 20% 24%` | `#303050` |

All other dark tokens (primary, secondary, accent, destructive, sidebar) remain unchanged.

## 2. Elevation System (`src/index.css`)

Add CSS custom properties for consistent shadows across light and dark modes:

```css
:root {
  --shadow-sm: 0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04);
  --shadow-md: 0 4px 12px rgba(0,0,0,0.08), 0 2px 6px rgba(0,0,0,0.04);
  --shadow-lg: 0 8px 30px rgba(0,0,0,0.10), 0 4px 12px rgba(0,0,0,0.06);
}

.dark {
  --shadow-sm: 0 1px 3px rgba(0,0,0,0.3), 0 1px 2px rgba(0,0,0,0.2);
  --shadow-md: 0 4px 12px rgba(0,0,0,0.3), 0 2px 6px rgba(0,0,0,0.2);
  --shadow-lg: 0 8px 30px rgba(0,0,0,0.4), 0 4px 12px rgba(0,0,0,0.3);
}
```

Usage: Cards at rest use `shadow-sm`, hover states use `shadow-md`, modals/popovers use `shadow-lg`.

## 3. Tailwind Config Updates (`tailwind.config.ts`)

### New colors

```ts
dc: {
  // existing...
  dark: '#1A1A2A',
  card: '#FFFFFF',
}
```

### New keyframe & animation

```ts
keyframes: {
  'slide-up': {
    from: { opacity: '0', transform: 'translateY(8px)' },
    to: { opacity: '1', transform: 'translateY(0)' },
  },
}
animation: {
  'slide-up': 'slide-up 0.3s ease-out',
}
```

### New box shadows

Map the CSS custom properties so they're usable as Tailwind utilities:

```ts
boxShadow: {
  // existing glow-teal, glow-pink, card-hover, card-elevated...
  'dc-sm': 'var(--shadow-sm)',
  'dc-md': 'var(--shadow-md)',
  'dc-lg': 'var(--shadow-lg)',
}
```

## 4. Button Enhancements (`src/components/ui/button.tsx`)

### New variants (added to CVA config)

| Variant | Style |
|---------|-------|
| `dc-primary` | `bg-dc-teal text-white dark:text-dc-dark hover:bg-dc-teal/90` + hover scale(1.02) + active scale(0.98) |
| `dc-outline` | `border-2 border-dc-teal text-dc-teal bg-transparent hover:bg-dc-teal/10` + hover scale(1.02) + active scale(0.98) |
| `dc-ghost` | `text-muted-foreground bg-transparent hover:text-dc-teal hover:bg-dc-teal/5` |

### New prop: `isLoading`

- Type: `boolean` (optional, defaults to `false`)
- When `true`: renders a spinner SVG before children, sets `pointer-events-none` and `opacity-80`
- Spinner: 16x16 animated circle, color inherits from text color

### Hover/press micro-interactions

Applied to `dc-primary` and `dc-outline` variants only (not default shadcn variants to avoid breaking existing pages):

```
transition: transform 150ms ease, box-shadow 150ms ease
hover: transform scale(1.02)
active: transform scale(0.98)
```

## 5. Card Enhancements (`src/components/ui/card.tsx`)

### New prop: `hover`

- Type: `"lift" | "none"` (optional, defaults to `"none"`)
- When `"lift"`: on hover, `translateY(-2px)` + shadow transitions from `dc-sm` to `dc-md`
- Transition: `transform 200ms ease, box-shadow 200ms ease`

### New prop: `accent`

- Type: `boolean` (optional, defaults to `false`)
- When `true`: adds `border-l-4 border-l-dc-teal` (teal left border accent)

Both props are additive — they compose with existing className overrides and don't change default Card behavior.

---

## Files Modified

| File | Change |
|------|--------|
| `src/index.css` | Update dark mode HSL tokens, add elevation CSS custom properties |
| `tailwind.config.ts` | Add `dc-dark`, `dc-card` colors, `slide-up` animation, `dc-sm/md/lg` shadows |
| `src/components/ui/button.tsx` | Add `dc-primary`, `dc-outline`, `dc-ghost` variants + `isLoading` prop |
| `src/components/ui/card.tsx` | Add `hover` and `accent` props |

## Files NOT Modified

- No page-level components
- No routing changes
- No new component files created

## Verification

- `npm run build` must succeed with zero errors
- All existing pages must render identically (no visual regressions from token changes)
- New variants only activate when explicitly used (`dc-primary`, `hover="lift"`, etc.)
