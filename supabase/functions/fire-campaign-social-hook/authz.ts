/**
 * Who may FIRE a campaign social hook.
 *
 * Deliberately NOT `_shared/campaign-access.ts`. `evaluateCampaignAccess` answers "can this actor
 * SEE this campaign's detail data" — a READ question. This function performs side-effecting WRITES:
 * at `stage: 4` it mints 1-hour signed Storage URLs over the campaign's private deliverables and
 * persists them into `donny_scheduled_posts.media_urls`, plus a high-priority "Post Now" nudge, for
 * EVERY party — and bills a per-party Anthropic caption to each party's `donny_cost_ledger`.
 *
 * Reusing the read gate imported its `hasApplication && status === 'published'` arm, so a merely
 * pending — or rejected — applicant could drive drafts and cost into the restaurant's and brand's
 * accounts. A read gate is not a write gate; a stricter, purpose-built predicate is the correct
 * shape even though it duplicates two of the same clauses. See [[Service-Role Data Exposure]].
 *
 * The authorized set is exactly "the parties who own this campaign's publishing":
 *   - the campaign owner
 *   - an ACTIVE member of the owning org (`invitation_status='active'`; an invited or removed
 *     member is not the business)
 *   - an ACTIVE sponsoring brand
 *
 * Creators are excluded on purpose: no live caller is a creator, and a creator does not decide
 * that a campaign's content gets staged for the restaurant's and brand's social accounts.
 *
 * Pure — no network, no Deno globals — so the rules are unit-testable.
 */

export interface HookCampaign {
  user_id: string | null;
  org_id: string | null;
}

export interface HookAuthzInput {
  campaign: HookCampaign | null;
  callerId: string | null;
  /** Org ids where the caller's `org_members.invitation_status = 'active'`. */
  callerOrgIds: readonly string[];
  /** True when the caller is the brand user on an active/accepted sponsorship of this campaign. */
  isActiveSponsorBrand: boolean;
}

export type HookAuthzResult =
  | { ok: true; basis: "owner" | "org" | "sponsor" }
  | { ok: false; status: 401 | 403 };

export function authorizeCampaignHook(input: HookAuthzInput): HookAuthzResult {
  const { campaign, callerId, callerOrgIds, isActiveSponsorBrand } = input;

  // No identity ⇒ 401, and it is resolved BEFORE the campaign is loaded, so an anonymous caller
  // cannot use "404 not found" vs "403 forbidden" as an existence oracle on a campaign id.
  if (!callerId) return { ok: false, status: 401 };

  // A missing campaign is reported as 403, not 404 — same reason.
  if (!campaign) return { ok: false, status: 403 };

  if (campaign.user_id != null && campaign.user_id === callerId) {
    return { ok: true, basis: "owner" };
  }
  if (campaign.org_id != null && callerOrgIds.includes(campaign.org_id)) {
    return { ok: true, basis: "org" };
  }
  // The brand arm is currently unexercised (`BRAND_ROLE_ENABLED` is false), but it is written now
  // because the caller that needs it — `useJointApproval`'s brand branch — swallows its own errors
  // with `.catch(console.error)`. Omitting it would mean stage-4 drafts silently never appear the
  // day Brand launches, with nothing surfaced anywhere.
  if (isActiveSponsorBrand) {
    return { ok: true, basis: "sponsor" };
  }

  return { ok: false, status: 403 };
}
