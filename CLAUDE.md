@docs/PROJECT_CONTEXT.md
# DragonCandy — Claude Code Briefing

## Project Overview

DragonCandy (dragoncandy.io) is a marketplace platform for social media content delivery,
connecting brands/businesses with content creators. Buyers (brands) post campaigns,
creators apply and deliver content, with payments and real-time communication in between.
Donny AI, aka "Donny", is the super AI agent that will trascend the platform into plugins, extensions,
and APIs into an assortment of devices and wearables. We want to optimize the DragonCandy experience by
doing more with users typing LESS. The LESS typing for content delivery the better.

\---

## Elon Musk Algorithm

What exactly is the Algorithm? A series of deceptively simple steps DragonCandy development abides by:
Question every requirement.
Delete every possible step in a process (or part).
Simplify and optimize.
Accelerate cycle time.
Automate.

## Tech Stack

* **Frontend:** React + TypeScript, hosted on Lovable.dev → dragoncandy.io
* **Backend:** Supabase (Postgres, Auth, Edge Functions, Realtime, Storage)
* **Payments:** Stripe (currently using Stripe test mode)
* **Repo:** GitHub (auto-syncs with Lovable on push)
* **Styling:** Tailwind CSS only — no custom CSS unless absolutely necessary
* **Data Fetching:** React Query (TanStack Query) for all server state
* **Components:** Functional components only — no class components

\---

## Coding Conventions

* **TypeScript strict mode** — all code must be fully typed, no `any` unless unavoidable
* **Functional components only** — hooks over lifecycle methods
* **React Query** for all Supabase data fetching, mutations, and caching
* **Tailwind** for all styling — follow existing class patterns in the codebase
* Match the conventions and tooling used by **Lovable.dev** and **Supabase** (e.g. Supabase JS client v2, Vite, shadcn/ui if present)
* Always add **error handling** for Supabase queries and mutations
* Always handle **loading and error states** in UI components
* Use **named exports** for components, **default exports** only for pages

## Code Review Standards
After completing any implementation, review the code for:
- Functions longer than 30 lines (likely doing too much)
- Logic duplicated more than twice (extract to utility)
- Any `any` type usage in TypeScript (replace with real types)
- Components with more than 3 props that could be grouped into an object
- Missing error handling on async operations

Run /simplify before presenting code to the user.

\---

## Project Structure

```
src/
├── assets/           # Static assets (images, icons, fonts)
├── components/       # Reusable UI components
├── contexts/         # React context providers (auth, theme, etc.)
├── hooks/            # Custom React hooks (React Query hooks live here)
├── integrations/     # Third-party service integrations (Supabase, Stripe, etc.)
├── lib/              # Supabase client and utility libraries
├── pages/            # Route-level page components
├── types/            # TypeScript types and interfaces
├── App.css           # Global app styles
├── App.tsx           # Root app component and routing
├── index.css         # Base styles
├── main.tsx          # App entry point
└── vite-env.d.ts     # Vite environment type declarations
```

\---

## Supabase Database Tables

### User \& Auth

|Table|Purpose|
|-|-|
|`profiles`|Core user profiles (linked to Supabase auth)|
|`creator\_profiles`|Extended profile data for content creators|
|`business\_profiles`|Extended profile data for brands/businesses|
|`profile\_views`|Tracks who viewed which profiles|
|`onboarding\_steps`|Defines onboarding flow steps|
|`user\_onboarding\_progress`|Tracks per-user onboarding completion|
|`email\_verification\_tokens`|Email verification flow|
|`feature\_flags`|Per-user or global feature toggles|

### Campaigns \& Marketplace

|Table|Purpose|
|-|-|
|`campaigns`|Brand-created campaigns seeking creators|
|`campaign\_applications`|Creator applications to campaigns|
|`campaign\_collaborations`|Active collaborations between brands and creators|
|`campaign\_invitations`|Direct invites from brands to creators|
|`campaign\_matches`|Matched brand/creator pairings|
|`campaign\_sponsorships`|Sponsorship arrangements within campaigns|
|`application\_counter\_offers`|Negotiation counter-offers on applications|

### Payments \& Promotions

|Table|Purpose|
|-|-|
|`promotions`|Promotional offers or deals|
|`promotion\_submissions`|Creator submissions for promotions|
|`discount\_codes`|Discount/promo codes|

> \*\*Stripe:\*\* Payments are processed via Stripe (currently in \*\*test mode\*\*). Stripe logic lives in `src/integrations/`. Never switch to live Stripe keys without explicit confirmation.

### Messaging \& Realtime

|Table|Purpose|
|-|-|
|`conversations`|Conversation threads|
|`conversation\_participants`|Users in each conversation|
|`messages`|Individual messages|
|`messages\_with\_profiles`|View joining messages with sender profile data|
|`message\_reactions`|Emoji reactions on messages|
|`user\_presence`|Online/offline status (realtime)|
|`push\_notifications`|Push notification records|
|`notification\_preferences`|Per-user notification settings|

### File Management

|Table|Purpose|
|-|-|
|`file\_uploads`|Uploaded files (content deliverables, assets)|
|`file\_versions`|Version history for uploaded files|
|`file\_permissions`|Access control on files|
|`file\_comments`|Comments on files|
|`file\_tags`|Tag definitions|
|`file\_tag\_assignments`|Tags assigned to files|

### Reviews \& Feedback

|Table|Purpose|
|-|-|
|`project\_reviews`|Reviews of completed collaborations|
|`review\_responses`|Responses to reviews|
|`beta\_feedback`|Beta user feedback submissions|

### Analytics

|Table|Purpose|
|-|-|
|`analytics\_events`|Custom event tracking|

\---

## Key Relationships

* `profiles` is the central user table — always join through here for user info
* `campaigns` → `campaign\_applications` → `campaign\_collaborations` is the core marketplace flow
* `conversations` + `conversation\_participants` + `messages` power the chat system
* `file\_uploads` are the primary content deliverable mechanism between creators and brands

\---

## Design System

> Screenshots of all screens are in the `/designs` folder. Always reference them when building or modifying UI.

### Color Palette

|Token|Hex|Usage|
|-|-|-|
|Mint / Teal (Primary)|`#4DD9C0` / `#00E5CC`|Primary buttons, borders, headings, icons, highlights|
|Pink (Secondary)|`#F9A8D4` / `#FF69B4`|Inbound message bubbles, CTA accents, dashboard header bg|
|Pink (Dark Accent)|`#EC4899`|Secondary buttons text, "Learn More" links, star ratings|
|Background Gray|`#A8A8A0`|Main app background (most screens)|
|Background White|`#FFFFFF`|Cards, profile stat sections, landing page|
|Background Pink|`#F9C8E0`|Browse Creators page background, business dashboard header|
|Text Dark|`#111111`|Headings, bold labels, card titles|
|Text Gray|`#555555`|Body copy, subtitles, placeholder text|
|Text White|`#FFFFFF`|Text on dark/image backgrounds, button labels|
|Outbound Message Teal|`#4DD9C0`|Outbound (user) chat bubbles|
|Inbound Message Pink|`#F9A8D4`|Inbound (other party) chat bubbles|
|Nav Icon Gray|`#888888`|Bottom nav icons (inactive)|
|CTA Yellow|`#FACC15`|Accent indicator strips on campaign cards|

### Typography

|Element|Style|
|-|-|
|Page titles / H1|ALL CAPS, bold, large — teal (`#4DD9C0`) on dark bg, dark on light bg|
|Section headings / H2|Title case or ALL CAPS, bold, dark or teal|
|Card titles|Bold, sentence case, dark (`#111111`)|
|Body text|Regular weight, sentence case, gray (`#555555`)|
|Button labels|Bold or semi-bold, sentence case (e.g. "Get Started", "Apply Now")|
|Subtext / captions|Small, light gray, sentence case|
|Stats / numbers|Extra bold, large, black — used for Projects Completed, Reels, etc.|

### Buttons

|Type|Style|
|-|-|
|Primary CTA|Full-width pill shape, teal fill (`#4DD9C0`), white bold text|
|Secondary CTA|Full-width pill shape, white/light fill, pink text (`#EC4899`) with dark border|
|Ghost / Outline|Pill shape, transparent fill, dark border, pink or teal text|
|Action (small)|Pill shape, pink or teal fill, white text — used in cards (e.g. "View Portfolio")|
|Send button|Dark circle with arrow icon (messaging)|
|Add button|Dark circle with `+` icon (bottom nav center)|

### Cards

* White background, large rounded corners (`rounded-2xl` or `rounded-3xl`)
* Subtle shadow or teal border (`border border-teal-300`)
* Consistent internal padding
* Creator cards: thumbnail image (left, rounded) + name + description + action button
* Campaign cards: full-bleed image with dark overlay + text + company avatar at bottom
* Quick action cards: teal border, bold title, short description, centered text

### Navigation

* **Top nav:** Logo (top-left) + hamburger menu (top-right), minimal — no labels
* **Bottom nav:** 7 icons — Home, Favorites, Play/Video, **+ (teal, prominent center)**, Campaigns/List, Megaphone/Promote, Profile
* Active center `+` button: teal circle, larger than other icons, elevated
* Inactive icons: gray (`#888888`)

### Messaging UI

* Background: medium gray (`#A8A8A0`)
* Inbound bubbles: pink (`#F9A8D4`), left-aligned, with sender avatar (Dragon Candy logo for platform messages)
* Outbound bubbles: teal (`#4DD9C0`), right-aligned, with user avatar
* Bubble shape: large pill / fully rounded ends
* Top bar: white/light bg, creator name in teal, "Recently Active" subtitle, phone icon (pink circle)
* Input bar: white pill input + dark `+` button (left) + dark send arrow (right)

### Profile \& Portfolio Pages

* Hero: full-bleed background image (photo or colored wall)
* Profile card: white pill/rounded card overlaid at bottom of hero — avatar (left, circular with teal border) + name + rating + location
* Stats row: 3 columns separated by pink vertical dividers — large bold number + label
* Reviews: 3-column horizontal scroll, plain text quotes + bold business name attribution
* CTA button: full-width teal pill at bottom

### Page-Specific Backgrounds

|Page|Background|
|-|-|
|Landing / Marketing|White (`#FFFFFF`)|
|Login|Medium gray (`#A8A8A0`)|
|Business Dashboard|Light pink (`#F9C8E0`) header, white body|
|Browse Creators|Light pink (`#F9C8E0`) full page|
|Creator Portfolio|Medium gray (`#A8A8A0`)|
|Available Campaigns|Medium gray (`#A8A8A0`)|
|Messaging|Medium gray (`#A8A8A0`)|
|Creator/Business Profile|Gray with hero image|

### Design Rules for Claude Code

* **Always use Tailwind utility classes** that match the above — never hardcode hex colors in inline styles
* **Mobile-first** — all screens are designed for mobile (375–430px width)
* **Pill-shaped buttons everywhere** — use `rounded-full` for all buttons
* **Teal borders on interactive cards** — use `border border-teal-300` or `border-2 border-teal-400`
* **Never change the color system** without explicit instruction — teal + pink is the core brand identity
* **Avatar images** always use `rounded-full` with a teal ring (`ring-2 ring-teal-400`)
* **Full-width buttons on mobile** — `w-full` for all primary CTAs
* **Consistent spacing** — use `p-4` or `p-6` for card padding, `gap-4` between elements

### Design Reference Files

Screenshots are stored in `/designs`:

* `login\_page.png` — Login \& signup screen
* `mobile\_landing\_page.png` — Public landing/marketing page
* `restaurant\_dashboard\_page.png` — Business user dashboard
* `browse\_creators\_page.png` — Creator listing/browse page
* `creator\_portfolio\_page.png` — Creator portfolio modal/page
* `creatorbusiness\_profile.png` — Creator public profile with reviews
* `creator\_view\_of\_available\_campaigns.png` — Campaign swipe/browse view
* `messaging\_page.png` — In-app messaging / chat UI

\---

## Important Rules

* **Never modify auth logic** (`email\_verification\_tokens`, Supabase Auth config) without confirming first
* **Never drop or rename tables/columns** — always add new columns as nullable
* **Always use RLS-safe queries** — assume Row Level Security is enabled on all tables
* **Do not hardcode user IDs or secrets** — use `supabase.auth.getUser()` for current user
* **Realtime features** (`messages`, `user\_presence`) use Supabase Realtime subscriptions — preserve existing subscription patterns
* **Ask before refactoring** large shared components (e.g. auth flow, messaging UI, campaign listings)
* When adding new Supabase queries, **always include `.select()` field lists** — avoid `select \*` in production code

\---

## Environment Variables

```
VITE\_SUPABASE\_URL=https://zocahiffooqdybdhguqv.supabase.co
VITE\_SUPABASE\_ANON\_KEY=
VITE\_STRIPE\_PUBLISHABLE\_KEY=pk\_test\_51SkFixJi7lqzzhdMKFYEBrKqmG0GhI1tBleC4Hw5x2doJL532AvXc3u1wPfFowtLUO8bPvmZme91hrMQthYkiEqQ00MxRx41yB
```

Never commit actual values. Reference `.env.local` locally.
Never use Stripe live keys (pk\_live\_... / sk\_live\_...) — test mode only until explicitly approved.

\---

## Deployment

* Push to `main` branch on GitHub → Lovable auto-deploys to dragoncandy.io
* Test locally with `npm run dev` before pushing
* No separate staging environment — test thoroughly before merging to main

