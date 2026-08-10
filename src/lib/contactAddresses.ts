/**
 * The mailboxes the app tells a user to write to.
 *
 * WHY THIS FILE EXISTS: `support@` was hardcoded in four separate components,
 * `privacy@` in two, `sales@` in one. That is the shape that lets a domain get
 * missed — the same shape the Phase 1 origins allow-list had before
 * `src/lib/allowedOrigins.ts` collapsed it. Eight scattered literals is eight
 * chances to update seven of them.
 *
 * DOMAIN MIGRATION STATUS (2026-08-10): these deliberately still read
 * `.io`. Phases 1-4 moved the app, the config, the redirect and the stored
 * content, but a mailbox is not a URL — flipping it is only safe once the
 * `.com` mailbox is proven to RECEIVE, and that proof is a Phase 5 gate that
 * has not yet been met.
 *
 * Do NOT flip these on the strength of a send test or a DNS check. Two facts
 * from the 2026-08-10 audit, both verified, say why:
 *
 *   1. `dragoncandy.com` accepts EVERY recipient at SMTP time. Probing
 *      `support@`, `privacy@`, `sales@`, `admin@` and `founders@` returned
 *      `250` — and so did two deliberately nonsensical control addresses.
 *      So mail to a `.com` mailbox that does not exist is accepted and then
 *      disappears: no bounce to the sender, no error anywhere. A user's GDPR
 *      erasure request would vanish in silence.
 *   2. `dragoncandy.io`'s IONOS MX could not be probed from here at all (it
 *      blocklists the origin IP), so we do not actually know that today's
 *      addresses receive either. Neither side is verified by observation.
 *
 * The only evidence that clears this gate is a human confirming a real message
 * arrived in a monitored inbox, per address. When that happens, change the
 * three constants below and nothing else.
 *
 * NOT COVERED HERE (each has a reason it cannot import this file):
 *   - `supabase/functions/stripe-webhook/index.ts` sends dispute alerts to
 *     `admin@dragoncandy.io`. Deno edge functions cannot import from `src/`,
 *     the same boundary `allowedOrigins.ts` documents.
 *   - `src/content/help/promotions/troubleshooting.mdx` names `support@` in
 *     prose; MDX body copy cannot reference a constant.
 *   - The `gdpr-erasure` help article names `privacy@` in its stored `body`
 *     on prod. That is database content and moves by migration, not by deploy.
 *   Any flip has to sweep those three by hand — hence this list.
 */

/** General user-facing support. */
export const SUPPORT_EMAIL = 'support@dragoncandy.io';

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
export const PRIVACY_EMAIL = 'privacy@dragoncandy.io';

/** Enterprise / sales enquiries from the pricing page. */
export const SALES_EMAIL = 'sales@dragoncandy.io';

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
