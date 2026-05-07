# Security Audit Remediation Design

> Fixes all 24 actionable issues from `docs/security-audit.docx`.
> Toast issues (#5, #22) deferred — no API access yet.

## Scope

| Severity | Count | Issues |
|----------|-------|--------|
| CRITICAL | 4 | #1, #2, #3, #4 |
| HIGH | 8 | #6, #7, #8, #9, #10, #11, #12, #13, #14 |
| MEDIUM | 8 | #15, #16, #17, #18, #19, #20, #21, #23 |
| LOW | 3 | #24, #25, #26 |
| Deferred | 2 | #5 (Toast webhook sig), #22 (Toast token encryption) |

## Execution Order

Severity-first: CRITICAL → HIGH → MEDIUM → LOW. Each batch verified with `npm run build` before the next begins. Database migrations are written as `.sql` files in `supabase/migrations/` for manual application.

---

## Shared Utilities (built first, used across batches)

### `src/lib/safeUrl.ts`

Validates user-supplied URLs. Returns `undefined` for dangerous protocols.

```ts
export const safeUrl = (raw: string | null | undefined): string | undefined => {
  if (!raw) return undefined;
  try {
    const url = new URL(raw, window.location.origin);
    if (url.protocol === 'http:' || url.protocol === 'https:' || url.protocol === 'mailto:') {
      return url.toString();
    }
  } catch { /* invalid URL */ }
  return undefined;
};
```

Used by: #6 (social URLs), #23 (Donny markdown links).

### `supabase/functions/_shared/htmlEscape.ts`

Escapes HTML special characters in strings before template interpolation.

```ts
export const htmlEscape = (s: string): string =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
```

Used by: #2 (email templates).

### `supabase/functions/_shared/cors.ts`

Origin-checked CORS headers replacing `Access-Control-Allow-Origin: *`.

```ts
const ALLOWED = new Set([
  'https://dragoncandy.io',
  'https://www.dragoncandy.io',
  'https://dragoncandy-preview.lovable.app',
]);

export const corsHeaders = (req: Request) => {
  const origin = req.headers.get('origin') ?? '';
  return {
    'Access-Control-Allow-Origin': ALLOWED.has(origin) ? origin : 'https://dragoncandy.io',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
};
```

Used by: #18 (all 56 edge functions).

### `src/lib/csvEscape.ts`

Escapes CSV cells to prevent Excel formula injection.

```ts
export const csvCell = (v: unknown): string => {
  let s = String(v ?? '');
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  if (/[,"\n]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
};
```

Used by: #20 (admin CSV export).

---

## Batch 1: CRITICAL

### #1 — Amount tampering in `create-sponsorship-checkout`

**File:** `supabase/functions/create-sponsorship-checkout/index.ts`

**Problem:** The `amount` parameter is accepted from the client request body and passed directly to Stripe. A brand can submit `amount: 0.01` to pay a fraction of the agreed price.

**Fix:**
1. Remove `amount` and `campaignTitle` from the destructured request body.
2. Look up `sponsorship_amount` and related fields from `campaign_sponsorships` by `sponsorshipId`.
3. Verify the requester owns the `brand_id` on the sponsorship.
4. Use the DB amount for Stripe.

**Audit scope:** Also audit `create-checkout-session`, `create-campaign-escrow`, and `boost-payment` for the same pattern — no edge function should accept monetary amounts from the client.

### #2 — Email template HTML injection

**File:** `supabase/functions/send-notification-email/index.ts`

**Problem:** ~15 user-controlled fields are interpolated directly into HTML email templates without escaping. Stored XSS via email.

**Fix:**
1. Import `htmlEscape` from `_shared/htmlEscape.ts`.
2. Wrap every UGC-sourced variable in `htmlEscape()` before interpolation.
3. Fields to escape: `applicantName`, `campaignTitle`, `senderName`, `message`, `requesterName`, `uploaderName`, `likerName`, `businessName`, `creatorName`, `invitationMessage`, `description`, `recipientName`, `party`, `amount`.

### #3 — Messages RLS gap (migration)

**File:** New migration `supabase/migrations/20260506_security_messages_rls.sql`

**Problem:** Conversation-scoped messages (where `sender_id` and `recipient_id` may be NULL) have no SELECT policy covering conversation participants. The existing policy only checks `sender_id = auth.uid() OR recipient_id = auth.uid()`.

**Fix:** Add a supplementary SELECT policy:

```sql
CREATE POLICY "messages: conversation participants"
ON public.messages FOR SELECT
USING (
  sender_id = auth.uid()
  OR recipient_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM conversation_participants cp
    WHERE cp.conversation_id = messages.conversation_id
      AND cp.user_id = auth.uid()
      AND cp.left_at IS NULL
  )
);
```

If the existing sender/recipient policy already exists, drop it first and replace with this unified policy.

### #4 — Discount codes RLS

**File:** New migration (if needed) + documentation

**Problem:** `discount_codes` policies restrict all operations to promotion owners. The `/promo/*` QR redemption path needs public read.

**Fix approach:**
1. Investigate the current redemption path — check if it already uses a service-role edge function.
2. If yes: document the bypass and add a code comment.
3. If no: route redemption through a service-role edge function (preferred) OR add a narrow public SELECT policy.

---

## Batch 2: HIGH

### #6 — Social media URL XSS

**Files:**
- `src/components/creator-browse/CreatorProfileModal.tsx`
- `src/components/campaigns/RestaurantProfileCard.tsx`

**Problem:** User-supplied URLs rendered as `href` without protocol validation. `javascript:alert(1)` executes on click.

**Fix:** Import `safeUrl` from `src/lib/safeUrl.ts` and wrap every user-supplied URL:
```tsx
<a href={safeUrl(profile.website_url)} ...>
```

Apply to: `website_url`, `instagram_url`, `tiktok_url`, `facebook_url`, `linkedin_url`, `x_url`, `other_social_url`, all portfolio links, business website URLs.

### #7 — React Query cache on logout

**File:** `src/hooks/useLogout.ts`

**Problem:** Cached query data persists across user sessions on shared devices.

**Fix:** Add `queryClient.clear()` after `signOut()`:
```ts
import { useQueryClient } from "@tanstack/react-query";

const queryClient = useQueryClient();
// ... in logout handler:
await signOut();
queryClient.clear();
```

### #8 — Profile-assets bucket (migration + frontend)

**Migration file:** `supabase/migrations/20260506_security_profile_assets_private.sql`

**Problem:** `profile-assets` bucket is public. KYC-adjacent assets exposed.

**Fix:**
1. Migration: `UPDATE storage.buckets SET public = false WHERE id = 'profile-assets';`
2. Add storage RLS policies for authenticated owner read/write.
3. Update frontend components that reference profile-asset URLs to use `supabase.storage.from('profile-assets').createSignedUrl()` with short-lived expiry.

**Impact:** Every component rendering profile images/avatars from this bucket needs updating. This is the highest-touch change in the spec.

### #9 — Server-side MIME validation

**File:** `src/lib/storage/uploadProfileAsset.ts` + new edge function

**Problem:** MIME validation is client-side only — trivially bypassed.

**Fix:**
1. Add file magic byte validation at upload time.
2. Check first 16 bytes against known signatures: `FF D8 FF` (JPEG), `89 50 4E 47` (PNG), `47 49 46 38` (GIF), `52 49 46 46` (WebP RIFF header).
3. Reject on mismatch before uploading to Supabase Storage.
4. Whitelist file extensions to `[jpg, jpeg, png, webp, gif]` server-side.

### #10 — profile_views anonymous writes (migration)

**File:** `supabase/migrations/20260506_security_profile_views_auth.sql`

**Fix:**
1. Drop the current permissive INSERT policy.
2. Add `TO authenticated` restriction.
3. Add unique partial index: `CREATE UNIQUE INDEX idx_profile_views_hourly ON profile_views (viewer_id, profile_id, date_trunc('hour', viewed_at));`

### #11 — analytics_events anonymous writes (migration)

**File:** Same migration file as #10 or separate.

**Fix:** Replace `WITH CHECK (true)` INSERT policy with `TO authenticated` restriction.

### #12 — user_presence SELECT restriction (migration)

**File:** `supabase/migrations/20260506_security_presence_scope.sql`

**Fix:** Replace `USING (true)` with conversation-participant scoping:
```sql
USING (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM conversation_participants cp1
    JOIN conversation_participants cp2 ON cp1.conversation_id = cp2.conversation_id
    WHERE cp1.user_id = auth.uid()
      AND cp2.user_id = user_presence.user_id
      AND cp1.left_at IS NULL AND cp2.left_at IS NULL
  )
)
```

### #13 — campaign_sponsorships UPDATE narrowing (migration)

**File:** `supabase/migrations/20260506_security_sponsorship_update.sql`

**Fix:** Split the current broad UPDATE policy into per-role policies. Gate `payment_status` and `amount` to service-role only. Brand can update brand-specific fields; restaurant can update restaurant-specific fields.

### #14 — email_verification_tokens write policies (migration)

**File:** `supabase/migrations/20260506_security_email_tokens.sql`

**Fix:**
```sql
CREATE POLICY "email_verif: deny client writes"
ON public.email_verification_tokens FOR ALL
TO authenticated USING (false) WITH CHECK (false);
```

---

## Batch 3: MEDIUM

### #15 — SiteGate password in bundle

**Action:** Documentation only. SiteGate is a friction barrier, not a security control. No code change — all actual security is provided by RLS and edge-function auth.

### #16 — `dc_site_unlocked_until` survives logout

**File:** `src/lib/authCleanup.ts`

**Fix:** Add two lines:
```ts
localStorage.removeItem('dc_site_unlocked_until');
sessionStorage.removeItem('dc_gate_redirect');
```

### #17 — LLM rate limiting

**Files:**
- New migration: `supabase/migrations/20260506_security_llm_rate_limit.sql`
- `supabase/functions/_shared/usage-tracker.ts` (extend existing)
- All LLM edge functions (chat-assistant, donny-chat, donny-orchestrator, etc.)

**Fix:**
1. Create `llm_usage` table: `(id, user_id, hour_bucket timestamptz, call_count int, updated_at)` with unique index on `(user_id, hour_bucket)`.
2. Add rate-check helper in `_shared/usage-tracker.ts`.
3. Each LLM edge function calls the rate checker at the top, returning 429 if over limit.
4. Default limit: 50 calls/hour for free tier.

### #18 — CORS wildcard on all edge functions

**Files:** All 56 edge functions in `supabase/functions/*/index.ts`

**Fix:**
1. Create `_shared/cors.ts` (defined above in Shared Utilities).
2. In every edge function, replace the hardcoded `corsHeaders` object with `corsHeaders(req)`.
3. This is a mechanical find-and-replace across all functions.

### #19 — SVG in MIME types

**File:** `src/lib/fileUtils.ts`

**Fix:** Remove `'image/svg+xml'` from the `images` array in the MIME type allowlist.

### #20 — CSV formula injection

**File:** `src/pages/AdminDragonShareLedger.tsx`

**Fix:** Import `csvCell` from `src/lib/csvEscape.ts` and apply to each cell when building CSV rows:
```ts
const csv = rows.map(r => r.map(csvCell).join(',')).join('\n');
```

### #21 — CSP meta tag

**File:** `index.html`

**Fix:** Add Content-Security-Policy meta tag with policy:
- `default-src 'self'`
- `script-src 'self' 'unsafe-inline' https://maps.googleapis.com https://www.google.com https://www.gstatic.com https://js.stripe.com`
- `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`
- `font-src 'self' https://fonts.gstatic.com`
- `img-src 'self' data: blob: https://*.supabase.co https://*.googleusercontent.com https://maps.gstatic.com`
- `media-src 'self' blob: https://*.supabase.co`
- `connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.stripe.com https://www.google.com https://www.recaptcha.net`
- `frame-src https://js.stripe.com https://www.google.com`
- `frame-ancestors 'none'`
- `base-uri 'self'`
- `form-action 'self'`

Also add: `<meta name="referrer" content="strict-origin-when-cross-origin">`

### #23 — Donny markdown `javascript:` links

**File:** `src/components/donny/DonnyMessage.tsx`

**Fix:** Apply `safeUrl()` to the href in the custom link renderer, falling back to `#` if unsafe:
```tsx
<a href={safeUrl(href) ?? '#'} target="_blank" rel="noopener noreferrer">{children}</a>
```

---

## Batch 4: LOW

### #24 — Inactivity timeout (manual step)

**Action:** Reduce Supabase JWT TTL to 15-30 min in project auth settings (Supabase dashboard). Not a code change.

### #25 — vite.config.ts dev server bind

**File:** `vite.config.ts`

**Fix:** Change `host: "0.0.0.0"` to `host: "127.0.0.1"`.

### #26 — `.gitignore` update

**File:** `.gitignore`

**Fix:** Add `supabase/.temp/` to the ignore list.

---

## Migration Files Summary

All migrations go in `supabase/migrations/` with timestamp prefix `20260506`:

| File | Issues Covered |
|------|---------------|
| `20260506_security_messages_rls.sql` | #3 |
| `20260506_security_discount_codes.sql` | #4 (if needed) |
| `20260506_security_profile_assets_private.sql` | #8 |
| `20260506_security_rls_tightening.sql` | #10, #11, #12, #13, #14 |
| `20260506_security_presence_scope.sql` | #12 (if separate) |
| `20260506_security_llm_rate_limit.sql` | #17 |

---

## Validation Checklist (post-fix)

From the audit's Section 11, verify:

1. **RLS messages:** Query messages as a non-participant → zero rows
2. **Stripe amount:** POST to create-sponsorship-checkout with `amount: 0.01` → Stripe receives DB amount
3. **Email XSS:** Create campaign titled `<img src=x onerror=alert(1)>` → renders as text in email
4. **URL XSS:** Set `website_url = 'javascript:alert(1)'` → link is inert or absent
5. **Logout cache:** Login as A → navigate → logout → login as B → no stale data flash
6. **CORS:** `curl -H 'Origin: https://attacker.example'` → response shows `dragoncandy.io`, not echo
7. **SiteGate cleanup:** Logout → `localStorage.getItem('dc_site_unlocked_until')` → null
8. **MIME validation:** Upload SVG renamed to `.png` with `image/png` MIME → rejected

---

## Files Changed

### New files
- `src/lib/safeUrl.ts`
- `src/lib/csvEscape.ts`
- `supabase/functions/_shared/htmlEscape.ts`
- `supabase/functions/_shared/cors.ts`
- 6 migration files in `supabase/migrations/`

### Modified files
- `supabase/functions/create-sponsorship-checkout/index.ts` (#1)
- `supabase/functions/send-notification-email/index.ts` (#2)
- `src/components/creator-browse/CreatorProfileModal.tsx` (#6)
- `src/components/campaigns/RestaurantProfileCard.tsx` (#6)
- `src/hooks/useLogout.ts` (#7)
- `src/lib/authCleanup.ts` (#16)
- `src/lib/fileUtils.ts` (#19)
- `src/lib/storage/uploadProfileAsset.ts` (#9)
- `src/pages/AdminDragonShareLedger.tsx` (#20)
- `src/components/donny/DonnyMessage.tsx` (#23)
- `index.html` (#21)
- `vite.config.ts` (#25)
- `.gitignore` (#26)
- All 56 edge functions in `supabase/functions/` (#18 — CORS)
- Frontend components rendering profile-assets URLs (#8 — signed URLs)

### Deferred (no API access)
- `supabase/functions/toast-redemption-webhook/index.ts` (#5)
- Toast token encryption (#22)

### Manual steps (not code)
- Reduce Supabase JWT TTL to 15-30 min (#24)
- Apply migration files via Supabase CLI (#3, #4, #8, #10-14, #17)
