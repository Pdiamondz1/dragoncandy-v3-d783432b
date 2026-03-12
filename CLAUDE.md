# DragonCandy — Claude Code Briefing

## Project Overview
DragonCandy (dragoncandy.io) is a marketplace platform for social media content delivery,
connecting brands/businesses with content creators. Buyers (brands) post campaigns,
creators apply and deliver content, with payments and real-time communication in between.

---

## Tech Stack
- **Frontend:** React + TypeScript, hosted on Lovable.dev → dragoncandy.io
- **Backend:** Supabase (Postgres, Auth, Edge Functions, Realtime, Storage)
- **Payments:** Stripe (currently using Stripe test mode)
- **Repo:** GitHub (auto-syncs with Lovable on push)
- **Styling:** Tailwind CSS only — no custom CSS unless absolutely necessary
- **Data Fetching:** React Query (TanStack Query) for all server state
- **Components:** Functional components only — no class components

---

## Coding Conventions
- **TypeScript strict mode** — all code must be fully typed, no `any` unless unavoidable
- **Functional components only** — hooks over lifecycle methods
- **React Query** for all Supabase data fetching, mutations, and caching
- **Tailwind** for all styling — follow existing class patterns in the codebase
- Match the conventions and tooling used by **Lovable.dev** and **Supabase** (e.g. Supabase JS client v2, Vite, shadcn/ui if present)
- Always add **error handling** for Supabase queries and mutations
- Always handle **loading and error states** in UI components
- Use **named exports** for components, **default exports** only for pages

---

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

---

## Supabase Database Tables

### User & Auth
| Table | Purpose |
|-------|---------|
| `profiles` | Core user profiles (linked to Supabase auth) |
| `creator_profiles` | Extended profile data for content creators |
| `business_profiles` | Extended profile data for brands/businesses |
| `profile_views` | Tracks who viewed which profiles |
| `onboarding_steps` | Defines onboarding flow steps |
| `user_onboarding_progress` | Tracks per-user onboarding completion |
| `email_verification_tokens` | Email verification flow |
| `feature_flags` | Per-user or global feature toggles |

### Campaigns & Marketplace
| Table | Purpose |
|-------|---------|
| `campaigns` | Brand-created campaigns seeking creators |
| `campaign_applications` | Creator applications to campaigns |
| `campaign_collaborations` | Active collaborations between brands and creators |
| `campaign_invitations` | Direct invites from brands to creators |
| `campaign_matches` | Matched brand/creator pairings |
| `campaign_sponsorships` | Sponsorship arrangements within campaigns |
| `application_counter_offers` | Negotiation counter-offers on applications |

### Payments & Promotions
| Table | Purpose |
|-------|---------|
| `promotions` | Promotional offers or deals |
| `promotion_submissions` | Creator submissions for promotions |
| `discount_codes` | Discount/promo codes |

> **Stripe:** Payments are processed via Stripe (currently in **test mode**). Stripe logic lives in `src/integrations/`. Never switch to live Stripe keys without explicit confirmation.

### Messaging & Realtime
| Table | Purpose |
|-------|---------|
| `conversations` | Conversation threads |
| `conversation_participants` | Users in each conversation |
| `messages` | Individual messages |
| `messages_with_profiles` | View joining messages with sender profile data |
| `message_reactions` | Emoji reactions on messages |
| `user_presence` | Online/offline status (realtime) |
| `push_notifications` | Push notification records |
| `notification_preferences` | Per-user notification settings |

### File Management
| Table | Purpose |
|-------|---------|
| `file_uploads` | Uploaded files (content deliverables, assets) |
| `file_versions` | Version history for uploaded files |
| `file_permissions` | Access control on files |
| `file_comments` | Comments on files |
| `file_tags` | Tag definitions |
| `file_tag_assignments` | Tags assigned to files |

### Reviews & Feedback
| Table | Purpose |
|-------|---------|
| `project_reviews` | Reviews of completed collaborations |
| `review_responses` | Responses to reviews |
| `beta_feedback` | Beta user feedback submissions |

### Analytics
| Table | Purpose |
|-------|---------|
| `analytics_events` | Custom event tracking |

---

## Key Relationships
- `profiles` is the central user table — always join through here for user info
- `campaigns` → `campaign_applications` → `campaign_collaborations` is the core marketplace flow
- `conversations` + `conversation_participants` + `messages` power the chat system
- `file_uploads` are the primary content deliverable mechanism between creators and brands

---

## Important Rules
- **Never modify auth logic** (`email_verification_tokens`, Supabase Auth config) without confirming first
- **Never drop or rename tables/columns** — always add new columns as nullable
- **Always use RLS-safe queries** — assume Row Level Security is enabled on all tables
- **Do not hardcode user IDs or secrets** — use `supabase.auth.getUser()` for current user
- **Realtime features** (`messages`, `user_presence`) use Supabase Realtime subscriptions — preserve existing subscription patterns
- **Ask before refactoring** large shared components (e.g. auth flow, messaging UI, campaign listings)
- When adding new Supabase queries, **always include `.select()` field lists** — avoid `select *` in production code

---

## Environment Variables
```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_STRIPE_PUBLISHABLE_KEY=     # Stripe test key (pk_test_...)
```
Never commit actual values. Reference `.env.local` locally.
Never use Stripe live keys (pk_live_... / sk_live_...) — test mode only until explicitly approved.

---

## Deployment
- Push to `main` branch on GitHub → Lovable auto-deploys to dragoncandy.io
- Test locally with `npm run dev` before pushing
- No separate staging environment — test thoroughly before merging to main
