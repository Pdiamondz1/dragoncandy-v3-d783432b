# Location Profiles Design Spec

> Each org_unit (location) gets its own profile — name, logo, description,
> social accounts, Stripe, and sample content — editable from the settings
> page when that location is selected. Business-wide settings (industry,
> collaboration style, budget, privacy) remain on business_profiles.

## Problem

The settings page at `/dashboard/business/settings` always reads from
`business_profiles`, which is a single record per user. When a restaurant
owner switches to a specific location via the OrgUnitSwitcher (e.g.
"South Philly"), the settings page still shows the parent business profile
("Harbormill"). There is no way to configure a location's identity,
social accounts, or sample content independently.

Stripe Connect and social account assignment are already location-aware
under the hood, but the settings UI doesn't surface location-specific
editing.

## Approach

Extend the `org_units` table with location profile fields (Approach A).
No new tables. The settings page switches its data source based on
`activeOrgUnit` from auth context.

## Data Model

### New columns on `org_units`

All nullable. Added via a single migration.

| Column | Type | Purpose |
|---|---|---|
| `description` | `TEXT` | Location pitch for creators |
| `brand_category` | `TEXT` | Optional category override |
| `sample_content_urls` | `JSONB` | Array of storage URLs for brand content examples |
| `show_parent_brand` | `BOOLEAN DEFAULT true` | Show parent brand name to creators |
| `instagram_url` | `TEXT` | Location Instagram profile link |
| `tiktok_url` | `TEXT` | Location TikTok profile link |
| `youtube_url` | `TEXT` | Location YouTube profile link |
| `facebook_url` | `TEXT` | Location Facebook profile link |
| `linkedin_url` | `TEXT` | Location LinkedIn profile link |
| `x_url` | `TEXT` | Location X/Twitter profile link |
| `other_social_url` | `TEXT` | Any other social link |

### Fields that stay on `business_profiles` (business-wide)

- `industry`, `budget_range`, `preferred_collaboration_style`,
  `sponsorship_budget`
- `marketing_objectives`, `profile_visibility`, `company_size`,
  `founded_year`
- `timezone`, `employee_count_range`
- `instagram_url`, `tiktok_url`, `youtube_url`, `facebook_url`,
  `linkedin_url`, `x_url`, `other_social_url` — these remain as
  business-wide defaults. Not removed.

### Social URL ownership

Both `business_profiles` and `org_units` carry social URL columns.
The ownership rule:

- **`org_units` social URLs** are location-specific overrides, edited
  in location mode
- **`business_profiles` social URLs** are business-wide defaults,
  edited in "All Locations" mode
- **Creator-facing resolution**: location social URL takes precedence;
  if empty, fall back to `business_profiles` social URL
- Editing social URLs in "All Locations" mode does NOT propagate to
  existing locations — each location's URLs are independent once set
- OAuth-connected accounts (via Outstand/AccountsTab) are a separate
  system already scoped by `org_unit_id` and are not affected by
  manual social URL fields

### TypeScript types

After the migration:

1. Regenerate Supabase types: `npx supabase gen types typescript`
2. Update the `OrgUnit` interface in `src/types/org.ts` to include
   all new fields
3. Both steps are required before any new hooks will compile

### Fields already on `org_units`

- `name`, `address`, `logo_url`, `website_url`
- `stripe_account_id`, `stripe_onboarding_complete`, `pending_balance`
- `lat`, `lng`, `is_primary`, `unit_type`

### RLS

Existing `org_units` RLS policies apply. No new policies needed — the
migration only adds columns, not rows or access patterns.

## Settings Page UX

### When a location is selected

The page splits into two visual zones:

**Top zone — Location Settings (teal accent)**

ProfileCompletionBar shows the location name, location-specific
completion percentage, and the parent business name as subtitle. Teal
gradient instead of pink.

Four accordion sections with teal-tinted borders:

1. **Location Profile** — name, logo upload, description textarea,
   brand_category input, `show_parent_brand` toggle
2. **Sample Content** — location-specific brand content uploads.
   This is a net-new feature (business profile sample content is
   currently stubbed out). Upload flow: files go to Supabase Storage
   bucket `brand-content` under path `{org_id}/{org_unit_id}/`.
   URLs stored in `sample_content_urls` JSONB as a string array.
   Max 10 files, 10MB each. UI renders as a thumbnail grid with
   upload and delete actions.
3. **Social Media** — `ConnectedAccountsList` (already scoped to
   `activeOrgUnit` via `AccountsTab`) plus collapsible manual social
   URL fields reading/writing `org_units` social columns
4. **Payments** — `StripeConnectSetup` (already location-aware)

**Bottom zone — Business-Wide Settings (dashed divider)**

Labeled "Harbormill · Business-Wide". Three accordion sections, fully
editable (same auto-save-on-blur behavior), visually separated by
the dashed divider and section header but not dimmed or disabled:

1. **Business Info** — industry, collaboration style (reads/writes
   `business_profiles`)
2. **Integrations** — Toast POS (business-wide)
3. **Privacy** — profile visibility (business-wide)

### When "All Locations" is selected

The page renders exactly as it does today — full `business_profiles`
form, pink gradient, all seven sections. No location zone appears.

### Auto-save behavior

Same on-blur save pattern as today. Location fields save to `org_units`
via `useLocationProfileSubmit`. Business-wide fields save to
`business_profiles` via existing `useBusinessProfileSubmit`.

## Hooks

### New: `useLocationProfileForm`

Mirrors `useBusinessProfileForm` but includes data fetching via React
Query (unlike the existing business form which uses a raw `useEffect`
fetch in the page component — this hook is self-contained).

- React Query key: `['location-profile', orgUnitId]`
- Queries `org_units` by `id` for: `name`, `description`,
  `brand_category`, `logo_url`, `sample_content_urls`,
  `show_parent_brand`, and all social URL fields
- Returns `formData`, `logoFile`, `handleInputChange`, `setLogoFile`,
  `isLoading`
- Reloads when `orgUnitId` changes (user switches location)

### New: `useLocationProfileSubmit`

- Updates `org_units` row by `id`
- Logo upload reuses existing `uploadProfileAsset()` utility, saves
  URL to `org_units.logo_url`
- Returns `{ submitProfile, isSubmitting }`

### New: `calculateLocationCompletion`

Returns `CompletionResult` (same shape as business completion).

Checks:
- `name` (required, always present)
- `logo_url` (has location logo)
- `description` (has description)
- At least one social presence — either an OAuth-connected account
  (via `useLocationSocialAccounts`) OR a manual social URL field
  populated on `org_units`
- Stripe connected (`stripe_onboarding_complete === true`)

### Existing hooks — no changes needed

- `useLocationSocialAccounts` — already filters by `org_unit_id`
- `useLocationReadiness` — already checks social + Stripe per location
- `StripeConnectSetup` — already passes `org_unit_id` to edge functions
- `AccountsTab` / `ConnectedAccountsList` — already scoped to
  `activeOrgUnit`
- `useBusinessProfileForm` / `useBusinessProfileSubmit` — continue to
  handle business-wide fields unchanged

## Settings Page Orchestration

`BusinessSettings.tsx` changes:

```
const { activeOrgUnit } = useAuth();

if (activeOrgUnit) {
  // Location mode: location form (top) + business form (bottom, editable)
  useLocationProfileForm(activeOrgUnit.id)  → top zone
  useBusinessProfileForm()                  → bottom zone
} else {
  // All Locations mode: business form only (current behavior)
  useBusinessProfileForm()                  → full page
}
```

`BusinessSettingsSections` splits into two components:
- `LocationSettingsSections` — the four location-specific accordion
  sections
- `BusinessSettingsSections` — retains business-wide sections only
  (Business Info, Integrations, Privacy)

The existing `BusinessSettingsSections` component is refactored, not
replaced. The location-specific sections (Social Media, Payments,
Sample Content) move to `LocationSettingsSections`. Business Info loses
its location fields (city, country move to the location profile since
each location has its own address already via `org_units.address`).

## Clone Flow

When adding a new location via the `OrgUnitsPage.tsx` modal:

- "Clone from" dropdown appears only when creating (not editing),
  populated from `useOrgUnits` for the current org
- On create, copies from the source `org_unit`: `description`,
  `brand_category`, `logo_url` (reference to same Storage URL — no
  file duplication), `sample_content_urls` (same references),
  `show_parent_brand`, and all social URL fields
- Fields NOT cloned: `id`, `name`, `address`, `is_primary`, `lat`,
  `lng`, `stripe_account_id`, `stripe_onboarding_complete`,
  `pending_balance`
- Stripe and social account connections (OAuth) are never cloned —
  those require independent setup per location

## Creator-Facing View

### Campaign cards and listings

Campaigns carry `org_unit_id`. Display logic:

- Name: `org_units.name` (location name)
- Logo: `org_units.logo_url` ?? `business_profiles.logo_url` (fallback)
- If `show_parent_brand === true` AND location name differs from
  business name: render as "South Philly · Harbormill"
- If `show_parent_brand === true` BUT names match: render as just
  the name (suppress duplicate, e.g. not "Harbormill · Harbormill")
- If `false`: render as just the location name

### Business/location profile page

When accessed via a campaign with `org_unit_id`:

- Shows location data: name, logo, description, social links, sample
  content from `org_units`
- Shows business-wide data: industry, collaboration style from
  `business_profiles`
- Reviews and ratings stay at business level (not per-location)

Fallback: if a location field is empty, display the parent
`business_profiles` value. A location works immediately after creation
even before customization.

### Messaging

Conversations initiated from a campaign show the location name and
logo as the avatar — display change only, conversation still belongs
to the same `org_id`.

### Not changed

- Campaign creation flow — already tags `org_unit_id`
- Payment flow — Stripe already resolves per-location
- Analytics — stays business-wide
- Reviews — stay at business level
- Browse Creators page — no location context needed

## Migration Safety

- All new columns are nullable — no breaking changes
- No columns removed from `business_profiles` — existing data intact
- No RLS policy changes — existing `org_units` policies cover the
  new columns
- Rollback: drop the new columns (data loss for location profile
  fields only, which are new)

## Known Gaps (not in scope)

- **Realtime sync**: If two team members edit the same location
  profile simultaneously, changes may overwrite. No realtime
  subscription for `org_units` profile fields. Acceptable for launch.
- **Location-level analytics**: Analytics stay business-wide. Per-
  location analytics is a future enhancement.
- **Location-level reviews**: Reviews stay at business level.
