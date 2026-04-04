# Auth: Polished Login Page with Role-Based Signup Flow

**Date:** 2026-04-01
**Status:** Design approved
**Scope:** Login page polish, role selection screen, signup form restructure

## Summary

Polish the existing login experience and restructure the signup flow to include a dedicated role selection screen before the signup form. Visual-only changes to social auth buttons (not wired to OAuth providers). No changes to Supabase auth configuration, dashboard, landing page, or any other pages.

## Background

The current login page (`AuthPage.tsx`) has the right elements but needs visual polish:
- Inputs are functional but lack consistent sizing and focus states
- Social auth buttons (Google, Apple, Facebook) are unstyled icons
- Signup has inline radio buttons for role selection, which adds clutter
- The gray background (`#A8A8A0`) feels flat and disconnected from the brand

The current `AuthForm.tsx` handles both login and signup in a single component with mode toggling. Role selection is inline as radio buttons with three options: Business Client, Brand/Sponsor, Content Creator.

## Design

### Shared Background

All auth screens (login, role selection, signup form) use a **teal-to-pink diagonal gradient** background:
- CSS: `bg-gradient-to-br from-[#1A5C5C] via-[#2D7A7A] to-[#9B5A8A]`
- Applied to the outermost `AuthPage` wrapper div (`min-h-screen`)
- Replaces the current flat gray (`bg-dc-gray`)
- Consistent across the entire auth flow (login, role selection, signup form)

### Shared Branding

- App name is **"DragonCandy"** (one word, camelCase) — not "Dragon Candy"
- Top nav: DC logo (top-left) + hamburger menu (top-right) — unchanged from current

### 1. Login Page

**Layout:**
- Teal-to-pink gradient background (full viewport)
- "WELCOME TO DRAGONCANDY" heading — white, uppercase, bold, centered, outside the card
- White card container (`rounded-3xl`, `shadow-lg`) wrapping the form

**Inside the card:**
- **Email input:** 48px height, `rounded-lg`, `bg-gray-100`, `border-2 border-transparent`, `focus:border-teal-400` focus ring, 15px font
- **Password input:** Same styling as email, with show/hide toggle (Eye/EyeOff icon from lucide-react) positioned at right
- **"Forgot password?" link:** Right-aligned below password field, teal color (`text-dc-teal`), links to existing `/auth/forgot` page
- **Login button:** Full width, 48px height, `rounded-full`, `bg-dc-teal`, white bold text
- **"or continue with" divider:** Horizontal rule with centered text in gray, separating login button from social buttons
- **Social auth buttons:** Row of 3, each 52px square, `rounded-lg`:
  - Google: white background, gray border, Google "G" logo/icon
  - Apple: black background, Apple icon in white
  - Facebook: `#1877F2` blue background, "f" logo in white
  - On click: show "Coming soon" toast (not wired to OAuth)
- **Mode toggle:** "Don't have an account? **Sign Up**" — Sign Up in `text-dc-pink-accent` (`#EC4899`)

**Clicking "Sign Up"** navigates to the role selection screen (not directly to signup form).

### 2. Role Selection Screen

**Layout:**
- Same teal-to-pink gradient background
- "JOIN DRAGONCANDY" heading — white, uppercase, bold, centered
- Subtitle: "How will you use DragonCandy?" — white/70 opacity, centered

**Role cards** (stacked vertically, full width):

**"I'm a Business" card:**
- White background, `rounded-2xl`, `border-2 border-teal-400`, subtle shadow
- Left: 56px icon container (`rounded-2xl`, teal-tinted gradient bg) with store/restaurant icon
- Center: Title "I'm a Business" (bold, dark) + description "Find creators to promote your brand, restaurant, or product" (gray, small)
- Right: Teal chevron arrow
- Maps to role: `business_client`

**"I'm a Creator" card:**
- White background, `rounded-2xl`, `border-2 border-pink-300`, subtle shadow
- Left: 56px icon container (`rounded-2xl`, pink-tinted gradient bg) with camera icon
- Center: Title "I'm a Creator" (bold, dark) + description "Get paid to create content for businesses and brands" (gray, small)
- Right: Pink chevron arrow
- Maps to role: `content_creator`

**Bottom:** "Already have an account? **Log in**" — Log in in teal

**Tapping a card** stores the selected role in component state and transitions to the signup form.

### 3. Signup Form

**Layout:**
- Same teal-to-pink gradient background
- "CREATE ACCOUNT" heading — white, uppercase, bold, centered
- **Role badge** below heading: pill-shaped, semi-transparent white bg (`bg-white/15`), shows icon + role label (e.g. "📸 Creator") + "Change" link to go back to role selection

**White card container** (same styling as login card):
- **Full Name input:** 48px, same styling as login inputs
- **Email input:** Same as login
- **Password input:** Same as login, with show/hide toggle
- **"Create Account" button:** Full width, 48px, `rounded-full`, `bg-dc-teal`, white bold text
- **"or continue with" divider + social buttons:** Same as login page
- **Mode toggle:** "Already have an account? **Log in**"
- **reCAPTCHA:** Stays in current position (below the form), no changes to verification logic

**On form submission:**
- Existing signup flow is preserved: Supabase auth signup with role in metadata, verification email sent, user signed out pending verification
- Role comes from component state (set during role selection), not from inline radio buttons
- The inline radio button group (`RadioGroup`) is removed from the form

### 4. Forgot Password

No changes to the existing `ForgotPassword.tsx` page. The "Forgot password?" link on the login page already points to `/auth/forgot` which handles the Supabase `resetPasswordForEmail()` flow. Only ensure the link styling is consistent (teal color, proper spacing within the polished card layout).

## Component Architecture

### State Management

Add a `signupStep` state to `AuthPage.tsx`:
- `'role-selection'` — shows role cards
- `'signup-form'` — shows signup form with pre-selected role

Flow:
1. User on login view → clicks "Sign Up" → `signupStep` set to `'role-selection'`
2. User taps a role card → `selectedRole` stored, `signupStep` set to `'signup-form'`
3. User clicks "Change" on role badge → `signupStep` back to `'role-selection'`
4. User clicks "Log in" from any signup step → returns to login mode, resets `signupStep`

### New Component

**`RoleSelection.tsx`** (`src/components/auth/RoleSelection.tsx`):
- Props: `onSelectRole: (role: 'business_client' | 'content_creator') => void`, `onBackToLogin: () => void`
- Renders the two role cards and "Already have an account?" link
- Stateless — selection is handled by parent

### Modified Components

**`AuthPage.tsx`:**
- Add `signupStep` and `selectedRole` state
- Replace background class with gradient
- Fix "Dragon Candy" → "DragonCandy" in heading
- Conditionally render: login form | role selection | signup form based on mode + step
- Pass `selectedRole` to `AuthForm` when in signup mode

**`AuthForm.tsx`:**
- Accept `preSelectedRole` prop
- Remove inline `RadioGroup` for role selection when `preSelectedRole` is provided
- Use `preSelectedRole` in signup submission instead of form state
- Add white card container wrapper
- Restyle inputs: 48px height, `rounded-lg`, `bg-gray-100`, teal focus ring
- Add "or continue with" divider
- Restyle social auth buttons with brand colors
- Social buttons show "Coming soon" toast on click
- Add role badge display when in signup mode with pre-selected role

**`AuthModeToggle.tsx`:**
- Minor styling adjustments to match card context (colors, spacing)

### Unchanged

- `AuthContext.tsx` — no changes
- `ReCaptcha.tsx` — no changes
- `ForgotPassword.tsx` — no changes
- `AuthenticationModal.tsx` — no changes (separate modal flow)
- `useAuth.tsx` / `useRequireAuth.tsx` — no changes
- Supabase auth configuration — no changes
- Route structure — no changes
- All other pages (dashboard, landing, etc.) — no changes

## Verification

- `npm run build` succeeds with no TypeScript errors
- Login page renders at 375px without horizontal overflow
- Login → type credentials → submit works as before
- "Sign Up" → role selection → tap card → signup form → submit works
- "Change" on role badge returns to role selection
- "Forgot password?" links to existing `/auth/forgot` page
- Social auth buttons show "Coming soon" toast
- reCAPTCHA still functions on signup form submission
- Email verification flow unchanged
- Post-login routing (business vs creator dashboard) unchanged
