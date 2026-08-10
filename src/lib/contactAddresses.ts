/**
 * The mailboxes the app tells a user to write to.
 *
 * WHY THIS FILE EXISTS: `support@` was hardcoded in four separate components,
 * `privacy@` in two, `sales@` in one. That is the shape that lets a domain get
 * missed — the same shape the Phase 1 origins allow-list had before
 * `src/lib/allowedOrigins.ts` collapsed it. Eight scattered literals is eight
 * chances to update seven of them.
 *
 * DOMAIN MIGRATION STATUS (2026-08-10): moved to `.com`. Phase 5a's gate — that
 * each `.com` mailbox genuinely RECEIVES — is met, and it is worth recording
 * what did and did not establish that, because the obvious check was worthless.
 *
 * WHAT DID NOT COUNT: an SMTP `RCPT TO` probe returned `250` for all five
 * addresses — and `250` for two deliberately nonsensical control addresses.
 * Google's MX does not disclose recipient validity at `RCPT` time, so
 * acceptance carries NO information about whether a mailbox exists. Without
 * the controls that probe would have read as "all five confirmed" and been
 * believed. (`dragoncandy.io`'s IONOS MX refused the probe outright — it
 * blocklists the origin IP — so it proved nothing in either direction either.)
 *
 * WHAT DID COUNT: the Google Workspace admin console. All five are **aliases
 * on `dame@dragoncandy.com`** (an active account in daily use), alongside
 * `info@` and `appstore@`. There are only three users in the org and zero
 * groups, so the alias list is the whole story. That establishes the ROUTING
 * — a property of the configuration — rather than one lucky delivery, which is
 * strictly stronger than the send-and-receive test originally planned.
 *
 * The lesson generalises past this file: when a probe cannot distinguish a
 * true from a false answer, no number of runs makes it evidence. Go and read
 * the configuration instead.
 *
 * All five deliver to ONE person's inbox today. That is fine at three
 * employees and will not stay fine — `privacy@` and `support@` in particular
 * want a shared mailbox someone else can cover. Flagged, not fixed.
 *
 * NOT COVERED HERE (each has a reason it cannot import this file):
 *   - `supabase/functions/stripe-webhook/index.ts` sends dispute alerts to
 *     `admin@dragoncandy.io`. Deno edge functions cannot import from `src/`,
 *     the same boundary `allowedOrigins.ts` documents.
 *   - `src/content/help/promotions/troubleshooting.mdx` names `support@` in
 *     prose; MDX body copy cannot reference a constant.
 *   - The `gdpr-erasure` help article names `privacy@` in its stored `body`
 *     on prod. That is database content and moves by migration, not by deploy.
 *   Any flip has to sweep those three by hand — hence this list. All three were
 *   swept alongside the constants below in the 2026-08-10 Phase 5a change.
 */

/** General user-facing support. */
export const SUPPORT_EMAIL = 'support@dragoncandy.com';

/**
 * Privacy and data-rights contact, as published in the Privacy Policy and
 * Terms of Service.
 *
 * Note an inconsistency this file makes visible rather than fixes: the legal
 * pages point data-rights requests at `privacy@`, while the in-app "Request
 * full data erasure" links in Creator/Business settings point at `SUPPORT_EMAIL`.
 * Both behaviours are preserved exactly as they were. Where GDPR requests
 * should land is an operations decision, not a refactor.
 */
export const PRIVACY_EMAIL = 'privacy@dragoncandy.com';

/** Enterprise / sales enquiries from the pricing page. */
export const SALES_EMAIL = 'sales@dragoncandy.com';

/**
 * Build a `mailto:` href with a correctly encoded subject.
 *
 * The subject MUST be encoded. `HelpArticlePage` previously interpolated an
 * article title straight into the query string, and 8 of the 32 titles on prod
 * contain a URL metacharacter — `DC Points & Creator Standing` among them. An
 * unencoded `&` ends the `subject` parameter early, so that button opened a
 * mail client with the subject silently truncated to "Help: DC Points". A `#`
 * in a future title would truncate it harder. Encoding here means no call site
 * can reintroduce that, and it replaces the hand-written `%20` escaping the
 * settings pages were carrying.
 */
export function mailtoHref(address: string, subject?: string): string {
  return subject
    ? `mailto:${address}?subject=${encodeURIComponent(subject)}`
    : `mailto:${address}`;
}
