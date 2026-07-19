// Pure campaign-access authorization helpers.
//
// Several edge functions read `campaigns` (and related tables) with the
// SUPABASE_SERVICE_ROLE_KEY, which bypasses RLS entirely. Every one of those
// reads must re-assert in application code what RLS would otherwise have
// enforced — this module is the single, testable source of truth for that
// logic, so call sites don't each reinvent (and risk drifting from) the
// authorization rules.
//
// No imports, no `https://` deps — keeps this loadable by both Vitest and
// the Deno edge-function bundler.

export type AccessCampaign = {
  id: string;
  user_id: string | null;
  org_id: string | null;
  group_id: string | null;
  status: string | null;
};

export type AccessDecision = { allowed: boolean; reason: string };

/**
 * Can this actor SEE this campaign's detail data (title/description/budget/etc.)?
 *
 * Allowed if the actor is the campaign owner, an ACTIVE member of the owning org, or an
 * existing participant (has an application or collaboration on the campaign).
 * Crew (private group) campaigns add a further requirement: a non-owner/non-org
 * actor whose only basis for access is "participant" must ALSO be an active
 * member of the crew — an application alone must never unlock a private crew
 * campaign's details for a non-member. Fails closed on any missing input.
 *
 * `orgIds` must be the caller's set of org ids where `org_members.invitation_status
 * = 'active'` — the canonical active-membership predicate used everywhere else in
 * this codebase (RLS policies, `get_user_org_ids()`). A merely-invited or suspended
 * membership must never be included. A caller can be an active member of more than
 * one org, so this takes a set rather than a single id — any match against
 * `campaign.org_id` grants org-basis access.
 */
export function evaluateCampaignAccess(input: {
  campaign: AccessCampaign;
  userId: string;
  orgIds?: string[] | null;
  isCollaborator: boolean;
  hasApplication: boolean;
  isActiveGroupMember: boolean;
}): AccessDecision {
  const { campaign, userId, orgIds, isCollaborator, hasApplication, isActiveGroupMember } = input;

  if (!campaign || !userId) {
    return { allowed: false, reason: "not_authorized" };
  }

  let reason: "owner" | "org" | "participant" | null = null;
  if (campaign.user_id != null && campaign.user_id === userId) {
    reason = "owner";
  } else if (campaign.org_id != null && orgIds != null && orgIds.includes(campaign.org_id)) {
    reason = "org";
  } else if (isCollaborator) {
    // An actual collaborator keeps access regardless of status — mirrors the
    // `has_collaboration_on_campaign` arm of the campaigns SELECT policy.
    reason = "participant";
  } else if (hasApplication && campaign.status === "published") {
    // An APPLICATION is weaker than a collaboration: the campaigns SELECT policy only
    // exposes a campaign to a non-owner/non-collaborator while it is `published`. Once
    // the status moves on (closed/draft), a rejected or stale applicant loses visibility
    // under RLS — so a service-role path must drop them too, or it hands out the brief
    // and budget of a campaign the DB would have hidden. (Codex P2.)
    reason = "participant";
  }

  if (reason === null) {
    return { allowed: false, reason: "not_authorized" };
  }

  if (campaign.group_id != null) {
    const ownerOrOrg = reason === "owner" || reason === "org";
    if (!ownerOrOrg && !isActiveGroupMember) {
      return { allowed: false, reason: "crew_non_member" };
    }
  }

  return { allowed: true, reason };
}

/**
 * Can this actor APPLY to this campaign?
 *
 * Mirrors the DB-enforced gates (`apply_to_campaign` RPC + the
 * `can_create_application` RLS WITH CHECK): the campaign must be published,
 * and a crew (private group) campaign is members-only — no invitation
 * bypass. Fails closed on a missing campaign.
 */
export function evaluateApplyAccess(input: {
  campaign: AccessCampaign;
  isActiveGroupMember: boolean;
}): AccessDecision {
  const { campaign, isActiveGroupMember } = input;

  if (!campaign) {
    return { allowed: false, reason: "not_published" };
  }

  if (campaign.status !== "published") {
    return { allowed: false, reason: "not_published" };
  }

  if (campaign.group_id != null && !isActiveGroupMember) {
    return { allowed: false, reason: "crew_non_member" };
  }

  return { allowed: true, reason: "ok" };
}
