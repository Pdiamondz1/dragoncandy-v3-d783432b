# How DragonCandy is built

A map for someone new. Read this after `CONTRIBUTING.md`, before your first real change.

---

## 1. The big picture

```
Browser / iPhone app
        │
        ▼
   React website  ─────────►  PostgreSQL database
   (Vercel)                   (decides who can see what)
        │
        └──────────────────►  98 small backend functions
                              (anything the browser can't be trusted with)
                                      │
                                      ├─► Claude / OpenAI
                                      ├─► Stripe
                                      └─► Outstand, Google Maps, Toast
```

**One rule explains most of the design:**

The browser talks to the database directly for ordinary things, and the database decides what it's
allowed to see. Anything the browser must *not* be trusted with — spending money, calling a paid AI
service, emailing someone, reading another customer's data — goes through a backend function
instead.

---

## 2. Three user types, and why that makes everything harder

| Who | Role value | Guard | Dashboard |
|---|---|---|---|
| Business | `business_client` | `BusinessRoute` | `/dashboard/business` |
| Creator | `content_creator` | `ProtectedRoute` | `/dashboard/creator` |
| Brand | `brand` | `BrandRoute` | `/dashboard/brand` |

A feature is rarely finished until it's right for all three. They see different data, have
different permissions, and often need different wording for the same situation.

**Most serious bugs here are one user type seeing something meant for another.**

Guards live in `src/components/auth/`.

---

## 3. The front end

```
src/
├── App.tsx        every route and the provider stack — start here
├── pages/         92 screens
├── components/
│   ├── app/       shared building blocks: PageBody, AppCard, AppChip, AppStatusBadge
│   ├── ui/        shadcn/Radix basics — shared with dark screens, change carefully
│   ├── auth/      route guards
│   └── internal/  the admin dashboard (dark theme, staff only)
├── features/      self-contained areas: donny, promotions, settings
├── hooks/         269 hooks — these wrap every database call
├── integrations/  supabase/client.ts, outstand/
├── contexts/      auth, theme, Donny
└── lib/           plain helper functions — most unit tests live here
```

**Two things worth knowing about `App.tsx`:** the app-wide loading guard, and a 3-hour
inactivity timeout that logs people out.

**Data.** Every database call goes through React Query inside a hook. There is exactly one database
client, at `src/integrations/supabase/client.ts` — it also holds the guard that stops your laptop
reaching the real database.

**Styling.** Tailwind with `dc-*` colour tokens. The app is light. Only `/internal` is dark. The
public landing page and login screens have their own extra styling that never leaks into the app.

**Desktop and phone are separate targets.** `lg:`/`xl:` is desktop, no prefix is phone. Two rules
that have each caused real bugs: bottom-anchored phone UI uses `dvh` and `env(safe-area-inset-bottom)`,
never `vh`; and anything pinned to the top of the screen needs `env(safe-area-inset-top)`, which you
cannot see in a browser and only shows up in the iPhone app.

---

## 4. The backend functions

98 Deno functions under `supabase/functions/`, with shared code in `_shared/`:

| File | What it does |
|---|---|
| `cors.ts` | Which websites may call us (including the iPhone app) |
| `auth.ts` | Working out who is calling |
| `campaign-access.ts` | Who may see or change a campaign |
| `model-routing.ts` | Picking the cheapest AI model that can do the job |
| `cost-ledger.ts` | Metering every AI call against the 15%-of-revenue cap |
| `platform-fee.ts`, `flush-pending-balance.ts` | Money |
| `emailLinks.ts` | Building safe links for emails |

### Read this before writing one

**"Requires a token" is not a permission check.** The public key *is* a valid token and ships inside
the browser bundle. So that setting only rejects requests with no token at all. It never tells you
*who* is calling. Six functions were found genuinely exposed this way.

**Service-role code skips all database permissions.** If a function uses the service key, it must
re-check every rule itself. Leaks here are the most common serious bug in this codebase.

**A `SECURITY DEFINER` database function also skips the permission policy on the table it writes
to.** Re-check the same rule inside the function — ideally by calling the exact same check the
policy uses, not a copy of it.

---

## 5. The database

PostgreSQL on Supabase. 389 migrations. Permissions on every table. Full reference:
`docs/DATABASE_SCHEMA.md`.

The core flow:

```
campaigns → campaign_applications → campaign_collaborations
                                          │
                                          ├─ file_uploads     (the delivered work)
                                          ├─ content_status   (approval state machine)
                                          └─ payouts          (Stripe)
```

`profiles` is the central user table. Join through it.

**Three traps that have caught people:**

1. **`updated_at` is not a status signal.** It moves on any write, so a title edit looks identical
   to a status change. For "when did X happen", use the purpose-built columns:
   `content_submitted_at`, `payout_executed_at`, `status_changed_at`, `completed_at`,
   `escrow_status_changed_at`. Anything before 2026-08-07 is unreliable either way — the trigger
   that set it was broken until then.

2. **`campaigns.deadline` is a date, not a timestamp.** Compare it as a calendar day. Treating it as
   a moment in time lands on midnight UTC and produces off-by-one-day bugs for every US user.

3. **A migration marked "applied" is not proof it worked.** An entire state machine was once
   recorded as applied and simply absent from production. Check `pg_proc` and `information_schema`
   directly.

---

## 6. Donny

Donny is a layer, not a feature. He appears on the dashboards, in a desktop side panel, in a mobile
sheet, and separately inside `/internal` as an admin assistant.

- `donny-orchestrator` is the main entry point. It routes to sub-agents: campaign writing, creator
  search, rewards, social posting.
- His knowledge comes from `donny_knowledge`. **Customer-facing and internal content are kept
  strictly separate** — internal strategy documents must never be reachable by a customer, and that
  boundary has been broken before.
- Which AI model runs is a config choice (`_shared/model-routing.ts`), so swapping models isn't a
  rewrite.
- Every call is metered.

**Donny drafts; a person taps to publish.** That's deliberate — the AI structurally cannot post to a
customer's public feed by itself.

---

## 7. Environments

| Where | Front end | Database |
|---|---|---|
| Your laptop | `npm run dev` | **Test** (a guard blocks the real one) |
| Preview | Automatic, one per pull request | Test |
| Production | Vercel, dragoncandy.com | Real |

Vercel's environment settings decide which database a deploy talks to. Changing those settings
changes which database is live. Handle with care.

---

## 8. Where new people get surprised

1. **The database is the security boundary, not the app.** A query that works for you may return
   nothing for another user type. Test as all three.
2. **Merged is not deployed.** Database and backend changes go out separately, by hand, to each
   environment.
3. **The three user types differ more than they look.** "Add a badge to the dashboard" is usually
   three changes.
4. **Docs drift.** Where a document and the code disagree, the code is right — then fix the
   document.
5. **`select *` is banned**, and permissions make some joins fail in non-obvious ways. Always list
   your fields.

---

**See also:** `CONTRIBUTING.md` · `docs/onboarding/first-week.md` · `docs/DATABASE_SCHEMA.md` ·
`docs/DESIGN_SYSTEM.md` · `docs/runbooks/`
