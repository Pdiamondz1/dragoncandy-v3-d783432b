// Pure, dependency-free helpers for the manage-internal-users edge function.
// No https:// / npm: / Deno imports so Vitest (node) can load this directly.

export type InternalTier = 'admin' | 'stakeholder';

/** App-roles that grant AIOS access (subset of the app_role enum). */
export const INTERNAL_TIERS: readonly InternalTier[] = ['admin', 'stakeholder'];

export interface InternalUserRow {
  user_id: string;
  email: string;
  full_name: string | null;
  /** Effective tier — 'admin' wins when a user holds both roles. */
  tier: InternalTier;
  roles: InternalTier[];
  status: 'invited' | 'active';
  invited_at: string | null;
  last_sign_in_at: string | null;
}

// Pragmatic single-line email check — server is the authority, the regex only
// rejects obvious garbage before we hand the value to the Supabase admin API.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(value: unknown): value is string {
  return typeof value === 'string' && EMAIL_RE.test(value.trim());
}

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

/** Validate a requested tier. Returns null for anything not in INTERNAL_TIERS. */
export function normalizeTier(value: unknown): InternalTier | null {
  return value === 'admin' || value === 'stakeholder' ? value : null;
}

/** 'admin' outranks 'stakeholder' when a user holds both roles. */
export function highestTier(roles: readonly string[]): InternalTier {
  return roles.includes('admin') ? 'admin' : 'stakeholder';
}

/** A user who has signed in at least once is Active; otherwise still Invited. */
export function deriveStatus(
  authUser: { last_sign_in_at?: string | null } | null | undefined,
): 'invited' | 'active' {
  return authUser?.last_sign_in_at ? 'active' : 'invited';
}

export function tierLabel(tier: InternalTier): string {
  return tier === 'admin' ? 'full admin' : 'stakeholder (read-only)';
}

// Local HTML escaper (kept inline so this module has zero imports).
function esc(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export const INTERNAL_HOST_URL = 'https://internal.dragoncandy.com';

/**
 * Visible link text, derived from the href above rather than written out.
 *
 * These two were hardcoded and went stale the moment `INTERNAL_HOST_URL` moved
 * to .com in Phase 2, rendering <a href="...com">...io</a> in the email that
 * carries the password-set flow — the shape mail filters score as phishing.
 * That was fixed by hand (8f2312ae); deriving it means the next time this
 * constant moves, the label cannot be left behind.
 */
export const INTERNAL_HOST_LABEL = INTERNAL_HOST_URL.replace(/^https?:\/\//, '');
export const INVITE_SUBJECT = 'Your invitation to DragonCandy AIOS';
export const GRANTED_SUBJECT = 'You now have access to DragonCandy AIOS';

function greeting(name: string): string {
  const trimmed = (name ?? '').trim();
  return trimmed ? `Hi ${esc(trimmed)},` : 'Hi,';
}

function shell(inner: string): string {
  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
  </head>
  <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #111111; max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="background: linear-gradient(135deg, #0F766E 0%, #4DD9C0 100%); padding: 30px; text-align: center; border-radius: 12px 12px 0 0;">
      <h1 style="color: #ffffff; margin: 0; font-size: 26px; letter-spacing: 0.5px;">DragonCandy AIOS</h1>
      <p style="color: rgba(255,255,255,0.85); margin: 6px 0 0; font-size: 13px; text-transform: uppercase; letter-spacing: 2px;">Internal Operating Deck</p>
    </div>
    <div style="background: #ffffff; padding: 40px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
      ${inner}
      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
      <p style="font-size: 12px; color: #9ca3af; text-align: center;">
        DragonCandy · Hoboken, NJ · internal use only<br>
        <a href="${INTERNAL_HOST_URL}" style="color: #0F766E; text-decoration: none;">${INTERNAL_HOST_LABEL}</a>
      </p>
    </div>
  </body>
</html>`;
}

function ctaButton(href: string, label: string): string {
  return `<div style="text-align: center; margin: 32px 0;">
        <a href="${esc(href)}"
           style="background: #0F766E; color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 9999px; display: inline-block; font-weight: 700; font-size: 16px;">
          ${esc(label)}
        </a>
      </div>`;
}

/** Invite email for a brand-new internal-only account (sets their password). */
export function buildInviteEmailHtml(args: {
  name: string;
  actionLink: string;
  tier: InternalTier;
}): string {
  const inner = `
      <h2 style="color: #111111; margin-top: 0;">${greeting(args.name)}</h2>
      <p style="font-size: 16px; color: #374151;">
        You've been invited to the <strong>DragonCandy AIOS</strong> — our internal operating
        deck — with <strong>${esc(tierLabel(args.tier))}</strong> access.
      </p>
      <p style="font-size: 16px; color: #374151;">
        Click below to set your password. Afterwards, sign in any time at
        <a href="${INTERNAL_HOST_URL}" style="color: #0F766E;">${INTERNAL_HOST_LABEL}</a>.
      </p>
      ${ctaButton(args.actionLink, 'Set your password')}
      <p style="font-size: 14px; color: #6b7280;">
        This invitation link is single-use and expires soon. If it has expired, ask a DragonCandy
        founder to re-send your invite.
      </p>
      <p style="font-size: 14px; color: #6b7280;">
        This account is for the AIOS only — it does not include the main DragonCandy app. If you
        weren't expecting this, you can safely ignore this email.
      </p>`;
  return shell(inner);
}

/** Granted-access email for someone who already has a DragonCandy password. */
export function buildGrantedEmailHtml(args: { name: string; tier: InternalTier }): string {
  const inner = `
      <h2 style="color: #111111; margin-top: 0;">${greeting(args.name)}</h2>
      <p style="font-size: 16px; color: #374151;">
        You've been granted <strong>${esc(tierLabel(args.tier))}</strong> access to the
        <strong>DragonCandy AIOS</strong> — our internal operating deck.
      </p>
      <p style="font-size: 16px; color: #374151;">
        Sign in with your existing DragonCandy password at the link below.
      </p>
      ${ctaButton(INTERNAL_HOST_URL, 'Open the AIOS')}
      <p style="font-size: 14px; color: #6b7280;">
        If you weren't expecting this, you can safely ignore this email.
      </p>`;
  return shell(inner);
}
