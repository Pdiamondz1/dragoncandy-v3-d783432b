# Design System: Production Tokens & UI Primitives — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish production-ready design tokens and enhance existing Button/Card components with branded variants.

**Architecture:** Update CSS custom properties in `index.css` for dark mode and elevation, extend Tailwind config with new colors/animations/shadows, and add new CVA variants + props to existing shadcn components. All changes are additive — no existing behavior changes.

**Tech Stack:** Tailwind CSS, class-variance-authority (CVA), React, TypeScript

**Spec:** `docs/superpowers/specs/2026-04-01-design-system-tokens-design.md`

---

### Task 1: Update Dark Mode Tokens

**Files:**
- Modify: `src/index.css:96-133` (the `.dark` block)

- [ ] **Step 1: Update dark mode background tokens**

In `src/index.css`, inside the `.dark` block (lines 96-133), replace these six token values:

```css
  .dark {
    --background: 240 23% 13%;
    --foreground: 0 0% 94%;

    --card: 240 22% 18%;
    --card-foreground: 0 0% 94%;

    --popover: 240 22% 16%;
    --popover-foreground: 0 0% 94%;

    --primary: 166 52% 51%;
    --primary-foreground: 240 27% 14%;

    --secondary: 330 65% 74%;
    --secondary-foreground: 240 27% 14%;

    --muted: 240 20% 23%;
    --muted-foreground: 215 20% 65%;

    --accent: 330 38% 16%;
    --accent-foreground: 330 65% 74%;

    --destructive: 0 62.8% 30.6%;
    --destructive-foreground: 0 0% 94%;

    --border: 240 20% 24%;
    --input: 240 20% 24%;
    --ring: 166 52% 51%;

    --sidebar-background: 240 27% 11%;
    --sidebar-foreground: 0 0% 90%;
    --sidebar-primary: 166 52% 51%;
    --sidebar-primary-foreground: 0 0% 100%;
    --sidebar-accent: 240 20% 18%;
    --sidebar-accent-foreground: 0 0% 90%;
    --sidebar-border: 240 20% 20%;
    --sidebar-ring: 166 52% 51%;
  }
```

The six changed values vs. what was there before:
- `--background`: `240 27% 14%` → `240 23% 13%`
- `--card`: `240 24% 19%` → `240 22% 18%`
- `--popover`: `240 24% 19%` → `240 22% 16%`
- `--muted`: `240 20% 22%` → `240 20% 23%`
- `--border`: `240 20% 25%` → `240 20% 24%`
- `--input`: `240 20% 25%` → `240 20% 24%`

All other values in the block remain identical.

- [ ] **Step 2: Verify build passes**

Run: `npm run build`
Expected: Build succeeds with zero errors. No CSS compilation issues.

- [ ] **Step 3: Commit**

```bash
git add src/index.css
git commit -m "style: update dark mode tokens to #1A1A2A navy base"
```

---

### Task 2: Add Elevation System

**Files:**
- Modify: `src/index.css:50-93` (the `:root` block) and `src/index.css:96-133` (the `.dark` block)

- [ ] **Step 1: Add shadow custom properties to `:root`**

In `src/index.css`, inside the `:root` block, add these three lines after the `--radius: 1rem;` line (currently line 82):

```css
    --shadow-sm: 0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04);
    --shadow-md: 0 4px 12px rgba(0,0,0,0.08), 0 2px 6px rgba(0,0,0,0.04);
    --shadow-lg: 0 8px 30px rgba(0,0,0,0.10), 0 4px 12px rgba(0,0,0,0.06);
```

- [ ] **Step 2: Add dark shadow overrides to `.dark`**

In `src/index.css`, inside the `.dark` block, add these three lines after the `--ring` line:

```css
    --shadow-sm: 0 1px 3px rgba(0,0,0,0.3), 0 1px 2px rgba(0,0,0,0.2);
    --shadow-md: 0 4px 12px rgba(0,0,0,0.3), 0 2px 6px rgba(0,0,0,0.2);
    --shadow-lg: 0 8px 30px rgba(0,0,0,0.4), 0 4px 12px rgba(0,0,0,0.3);
```

- [ ] **Step 3: Verify build passes**

Run: `npm run build`
Expected: Build succeeds with zero errors.

- [ ] **Step 4: Commit**

```bash
git add src/index.css
git commit -m "style: add elevation system shadow tokens (sm/md/lg)"
```

---

### Task 3: Update Tailwind Config

**Files:**
- Modify: `tailwind.config.ts`

- [ ] **Step 1: Add new DC colors**

In `tailwind.config.ts`, inside the `dc` color object (lines 27-35), add two new entries after the existing `yellow` entry:

```ts
dc: {
  teal: '#4DD9C0',
  'teal-dark': '#00E5CC',
  pink: '#F9A8D4',
  'pink-accent': '#EC4899',
  'pink-bg': '#F9C8E0',
  gray: '#A8A8A0',
  yellow: '#FACC15',
  dark: '#1A1A2A',
  card: '#FFFFFF',
},
```

- [ ] **Step 2: Add slide-up keyframe**

In `tailwind.config.ts`, inside the `keyframes` object (after the `marquee` keyframe, around line 114), add:

```ts
'slide-up': {
  from: { opacity: '0', transform: 'translateY(8px)' },
  to: { opacity: '1', transform: 'translateY(0)' },
},
```

- [ ] **Step 3: Add slide-up animation**

In `tailwind.config.ts`, inside the `animation` object (after the `marquee` animation, around line 123), add:

```ts
'slide-up': 'slide-up 0.3s ease-out',
```

- [ ] **Step 4: Add elevation shadow utilities**

In `tailwind.config.ts`, inside the `boxShadow` object (after the `card-elevated` entry, around line 129), add:

```ts
'dc-sm': 'var(--shadow-sm)',
'dc-md': 'var(--shadow-md)',
'dc-lg': 'var(--shadow-lg)',
```

- [ ] **Step 5: Verify build passes**

Run: `npm run build`
Expected: Build succeeds. New Tailwind utilities `bg-dc-dark`, `bg-dc-card`, `animate-slide-up`, `shadow-dc-sm`, `shadow-dc-md`, `shadow-dc-lg` are now available.

- [ ] **Step 6: Commit**

```bash
git add tailwind.config.ts
git commit -m "style: extend Tailwind config with DC colors, slide-up animation, elevation shadows"
```

---

### Task 4: Enhance Button Component

**Files:**
- Modify: `src/components/ui/button.tsx`

- [ ] **Step 1: Add DC variants to CVA config**

In `src/components/ui/button.tsx`, add three new variants inside the `variant` object (after the `link` variant, line 20):

```ts
"dc-primary":
  "bg-dc-teal text-white dark:text-dc-dark hover:bg-dc-teal/90 transition-transform duration-150 hover:scale-[1.02] active:scale-[0.98]",
"dc-outline":
  "border-2 border-dc-teal text-dc-teal bg-transparent hover:bg-dc-teal/10 transition-transform duration-150 hover:scale-[1.02] active:scale-[0.98]",
"dc-ghost":
  "text-muted-foreground bg-transparent hover:text-dc-teal hover:bg-dc-teal/5",
```

- [ ] **Step 2: Add `isLoading` prop to ButtonProps**

Replace the existing `ButtonProps` interface (lines 36-39) with:

```ts
export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
  isLoading?: boolean
}
```

- [ ] **Step 3: Update Button component to handle loading state**

Replace the existing Button component (lines 42-54) with:

```ts
const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, isLoading = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(
          buttonVariants({ variant, size, className }),
          isLoading && "pointer-events-none opacity-80"
        )}
        ref={ref}
        {...props}
      >
        {isLoading && (
          <svg
            className="animate-spin -ml-1 mr-2 h-4 w-4"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        )}
        {props.children}
      </Comp>
    )
  }
)
```

Note: The `children` must be extracted from `props` explicitly since we spread `...props` onto the element. The SVG spinner uses `currentColor` so it inherits the text color of whichever variant is active.

- [ ] **Step 4: Verify build passes**

Run: `npm run build`
Expected: Build succeeds. No type errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/button.tsx
git commit -m "feat: add dc-primary/outline/ghost button variants and isLoading prop"
```

---

### Task 5: Enhance Card Component

**Files:**
- Modify: `src/components/ui/card.tsx`

- [ ] **Step 1: Add `hover` and `accent` props to Card**

Replace the existing Card component (lines 6-18) with:

```tsx
interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  hover?: "lift" | "none"
  accent?: boolean
}

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, hover = "none", accent = false, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "rounded-2xl border bg-card text-card-foreground shadow-dc-sm",
        hover === "lift" &&
          "transition-[transform,box-shadow] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-dc-md",
        accent && "border-l-4 border-l-dc-teal",
        className
      )}
      {...props}
    />
  )
)
Card.displayName = "Card"
```

Key changes from original:
- Added `CardProps` interface with `hover` and `accent`
- Default shadow changed from `shadow-sm` to `shadow-dc-sm` (uses our elevation system)
- `hover="lift"` adds transform + shadow transition on hover
- `accent` adds teal left border
- Both props default to off, so existing Card usage is unchanged (except the shadow now uses `shadow-dc-sm` which is visually identical in light mode)

- [ ] **Step 2: Verify build passes**

Run: `npm run build`
Expected: Build succeeds. No type errors. Existing Card usages throughout the codebase continue to work because `hover` and `accent` are optional with safe defaults.

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/card.tsx
git commit -m "feat: add hover lift and accent border props to Card component"
```

---

### Task 6: Final Verification

**Files:**
- None (verification only)

- [ ] **Step 1: Full build check**

Run: `npm run build`
Expected: Build succeeds with zero errors and zero warnings related to our changes.

- [ ] **Step 2: Verify no TypeScript errors**

Run: `npx tsc --noEmit`
Expected: No type errors. The new `isLoading` prop on Button and `hover`/`accent` props on Card are properly typed.

- [ ] **Step 3: Squash commit (optional)**

If all individual commits passed, create a final combined commit:

```bash
git add src/index.css tailwind.config.ts src/components/ui/button.tsx src/components/ui/card.tsx
git commit -m "design-system: establish production design tokens and UI primitives"
```

This is only needed if you prefer a single commit over the per-task commits above.
