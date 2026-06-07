# App Privacy Data Inventory — DragonCandy iOS

> **Purpose:** Source of truth for completing the **App Privacy** ("nutrition
> label") questionnaire in App Store Connect, and for keeping the hosted
> Privacy Policy (`/privacy`) in sync with what the app actually collects.
> Phase 0 deliverable of the Apple App Store roadmap.
>
> **Last reviewed:** 2026-06-06 · **Status:** Draft for founder confirmation
> (see "Decisions to confirm" at the end).

## How Apple's questionnaire works

For every data **type** you collect, App Store Connect asks four things:

1. **Collected?** Yes/No.
2. **Purposes** — any of: App Functionality, Analytics, Product
   Personalization, Developer's Advertising or Marketing, Third-Party
   Advertising, Other Purposes.
3. **Linked to the user's identity?** Yes/No.
4. **Used for tracking?** Yes/No — "tracking" means linking this data with
   third-party data **for advertising or sharing with a data broker**.

App Privacy covers data collected by **the app and any third-party SDKs or
partners** it uses. So Stripe, Outstand, Google Maps, Supabase, and Anthropic
are all in scope where they receive data.

## Headline findings

- **Nothing is used for tracking.** There is no third-party advertising SDK,
  no analytics SDK (Mixpanel/GA/Segment/Amplitude/PostHog), no Facebook pixel,
  and no crash-reporting SDK. Analytics are **first-party** — written to the
  Supabase `analytics_events` table (`src/hooks/useAnalytics.ts`).
- Because there's no tracking, **App Tracking Transparency (ATT) is not
  required** and no ATT prompt should be shown — as currently built.
- All collected data is used for **App Functionality** and (for usage/
  diagnostics) **Analytics**. None is used for advertising.
- Most data **is linked to identity** because it's tied to the signed-in
  Supabase user (`user_id`).

---

## Data types — declare as COLLECTED

| Apple category → type | What it is in DragonCandy | Purpose(s) | Linked to identity? | Tracking? |
|---|---|---|---|---|
| **Contact Info → Name** | Account/profile name | App Functionality | Yes | No |
| **Contact Info → Email Address** | Sign-up / auth (email + password) | App Functionality | Yes | No |
| **Contact Info → Physical Address** | Business address entered for discovery/geocoding (Google Maps) | App Functionality | Yes | No |
| **Financial Info → Payment Info** | Card payments via **Stripe** (Stripe collects card data directly; app stores only metadata such as amount, status, last 4) | App Functionality | Yes | No |
| **Purchases → Purchase History** | Marketplace transactions, boosts, payouts; subscription tier (`payment_events`, Stripe) | App Functionality | Yes | No |
| **User Content → Photos or Videos** | Content uploads, profile photos, DragonShare posts | App Functionality | Yes | No |
| **User Content → Customer Support** | Help requests and Donny AI assistant conversations | App Functionality | Yes | No |
| **User Content → Other User Content** | Captions, bios, campaign briefs, messages, reviews | App Functionality | Yes | No |
| **Identifiers → User ID** | Supabase auth user id; attached to analytics events | App Functionality, Analytics | Yes | No |
| **Identifiers → Device ID** | iOS push-notification device token (APNs), collected with permission | App Functionality | Yes | No |
| **Usage Data → Product Interaction** | Page views, user actions, campaign events (`analytics_events`) | Analytics, App Functionality | Yes | No |
| **Diagnostics → Crash Data** | JavaScript errors captured to first-party analytics (`javascript_error`, `unhandled_promise_rejection`) | Analytics, App Functionality | Yes | No |
| **Diagnostics → Performance Data** | Page-load and performance metrics (`performance_metric`) | Analytics, App Functionality | Yes | No |

### Connected social accounts (special note)
When a user links Instagram/TikTok/YouTube via **Outstand**, the app receives
account identifiers, access tokens, and post/follower analytics to enable
delegated posting and reporting. Declare the resulting profile/handle data
under **Contact Info → Other User Contact Info** (or Other Data) and the
imported metrics under **Usage Data → Other Usage Data** — App Functionality,
Linked: Yes, Tracking: No. This is data the user explicitly authorizes for
their own posting workflow, not advertising.

---

## Data types — declare as NOT COLLECTED

These have no collection path in the current build:

- **Health & Fitness** — none.
- **Location → Precise / Coarse (device)** — the app does **not** read device
  GPS. Business *addresses* are user-typed and declared under Contact Info →
  Physical Address, not device Location.
- **Sensitive Info** — none.
- **Contacts** (device address book) — none.
- **Browsing History** — none.
- **Search History** — in-app search (creators, help) is not stored as a
  per-user search-history dataset. *(See "Decisions to confirm" — search terms
  could appear inside analytics `event_data`; confirm how you want to treat
  this.)*
- **Audio Data / Gameplay Content** — none.
- **Usage Data → Advertising Data** — none (no ads).

---

## Third-party processors (data recipients)

| Processor | Role | Data it receives | In Apple scope as |
|---|---|---|---|
| **Supabase** | Hosting, auth, database, storage | All account, profile, content, analytics data | First-party backend (our controller) |
| **Stripe** | Payments | Card + payment info (directly), transaction metadata | Payment Info / Purchases |
| **Outstand** | Social media integration | Connected-account tokens, identifiers, post analytics | Other User Contact Info / Usage Data |
| **Google Maps** | Geocoding | Business addresses entered by users | Physical Address |
| **Anthropic (Claude)** | AI features (Donny) | Content submitted to AI features (server-side only) | User Content (processing) |

None of these are used for advertising or data-broker sharing → **Tracking:
No** across the board.

---

## What to enter in App Store Connect (summary)

1. **Yes, we collect data.**
2. Tick the types in the **COLLECTED** table above.
3. For each, set purposes to **App Functionality** (add **Analytics** for the
   Usage Data and Diagnostics rows).
4. **Linked to identity: Yes** for all of them.
5. **Used for tracking: No** for all of them.
6. Do **not** enable App Tracking Transparency.
7. Keep this label consistent with the `/privacy` page — if either changes,
   update both.

---

## Decisions to confirm before submission

1. **Phone number** — auth is email/password only; confirm no profile flow
   stores a phone number. If a business/creator profile captures one, add
   **Contact Info → Phone Number** (App Functionality, Linked: Yes, No
   tracking).
2. **Search terms in analytics** — decide whether in-app creator/help search
   terms logged inside `analytics_events.event_data` should be declared under
   **Search History**. Cleanest path: don't log raw search strings, so it
   stays "Not collected."
3. **Diagnostics linkage** — we currently attach `user_id` to error/
   performance events, so they're declared **Linked: Yes**. If you'd prefer
   them unlinked, stop attaching `user_id` to those events and re-declare.
4. **Privacy contact** — the `/privacy` page lists `privacy@dragoncandy.io`;
   ensure that mailbox exists and is monitored before submission.
5. **Re-audit at each new SDK** — if you later add attribution, ads, or a
   third-party analytics/crash SDK, this label and the ATT decision must be
   revisited (that would likely flip "Used for tracking" to Yes for some
   types).

## See also
- Hosted Privacy Policy: `src/pages/legal/PrivacyPolicy.tsx` (`/privacy`)
- Roadmap: `docs/superpowers/specs/2026-06-01-apple-app-store-design.md`
- First-party analytics: `src/hooks/useAnalytics.ts`, `src/components/analytics/`
