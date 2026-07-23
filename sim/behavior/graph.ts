// The daily behavior graph.
//
// planDay is PURE: given the reconstructed cohort state, it returns the ordered list of
// funnel-advancing actions for one tick. It advances each entity ONE stage per tick
// (realistic daily progression), in funnel order, so dependencies resolve across ticks:
//   business → crew → invite → accept → post campaign → apply → hire → upload → submit →
//   dual-party completion → review. A fresh cohort drains over several ticks; a steady
//   cohort keeps flowing because each crew posts a new campaign once its last completes.
//
// Invariants (tested in graph.test.ts): never emits a public (null group_id) campaign;
// never hires before an application exists; never submits before hired; never reviews
// before the collaboration is completed.
//
// runDay is the thin executor — serial (Phase 1 uses low concurrency; burst is Phase 4).

import type {
  Action,
  CohortState,
  CampaignState,
  CollaborationState,
} from "../types";
import { executeAction, type ActionContext } from "./actions";

const CREW_TARGET_SIZE = 4; // creators invited per crew
const APPLICANTS_PER_CAMPAIGN = 3; // applicants gathered before a hire

function groupBy<T, K>(items: T[], key: (t: T) => K): Map<K, T[]> {
  const m = new Map<K, T[]>();
  for (const it of items) {
    const k = key(it);
    const arr = m.get(k);
    if (arr) arr.push(it);
    else m.set(k, [it]);
  }
  return m;
}

/** A campaign is "done" once it has a completed collaboration → its crew may post a new one. */
function campaignCompleted(camp: CampaignState, collabsByCampaign: Map<string, CollaborationState[]>): boolean {
  return (collabsByCampaign.get(camp.campaignId) ?? []).some((cl) => cl.status === "completed");
}

/** One collaboration's next funnel step(s) for this tick. */
function planCollaboration(c: CollaborationState): Action[] {
  if (c.status === "completed") {
    const out: Action[] = [];
    if (!c.reviewedByOwner) {
      out.push({ kind: "leaveReview", actorId: c.ownerId, role: "business_client", collaborationId: c.collaborationId, revieweeId: c.creatorId });
    }
    if (!c.reviewedByCreator) {
      out.push({ kind: "leaveReview", actorId: c.creatorId, role: "content_creator", collaborationId: c.collaborationId, revieweeId: c.ownerId });
    }
    return out;
  }

  const cs = c.contentStatus;
  if (cs === null || cs === "pending") {
    return [{ kind: "uploadDeliverable", creatorId: c.creatorId, collaborationId: c.collaborationId, campaignId: c.campaignId }];
  }
  if (cs === "in_progress") {
    return [{ kind: "submitContent", creatorId: c.creatorId, collaborationId: c.collaborationId, campaignId: c.campaignId }];
  }
  if (cs === "submitted") {
    const out: Action[] = [];
    if (c.businessCompletionStatus !== "requested" && c.businessCompletionStatus !== "approved") {
      out.push({ kind: "requestCompletion", actorId: c.ownerId, role: "business_client", collaborationId: c.collaborationId });
    }
    if (c.creatorCompletionStatus !== "requested" && c.creatorCompletionStatus !== "approved") {
      out.push({ kind: "requestCompletion", actorId: c.creatorId, role: "content_creator", collaborationId: c.collaborationId });
    }
    return out;
  }
  // cs === 'approved' but status not yet 'completed' — transient; nothing this tick.
  return [];
}

/** Pure planner: the ordered actions to advance the funnel one stage this tick. */
export function planDay(state: CohortState, _floor: number): Action[] {
  const actions: Action[] = [];
  const businesses = state.bots.filter((b) => b.role === "business_client");
  const creatorIds = state.bots.filter((b) => b.role === "content_creator").map((c) => c.userId).sort();

  const crewsByOwner = groupBy(state.crews, (c) => c.ownerId);
  const campaignsByGroup = groupBy(
    state.campaigns.filter((c): c is CampaignState & { groupId: string } => c.groupId != null),
    (c) => c.groupId,
  );
  const appsByCampaign = groupBy(state.applications, (a) => a.campaignId);
  const collabsByCampaign = groupBy(state.collaborations, (c) => c.campaignId);

  // 1. Business without a crew → create one.
  for (const biz of businesses) {
    if (!crewsByOwner.get(biz.userId)?.length) {
      actions.push({ kind: "createCrew", bizId: biz.userId });
    }
  }

  // 2. Crew under target size → invite fresh creators.
  for (const crew of state.crews) {
    const current = new Set([...crew.activeMemberIds, ...crew.invitedMemberIds]);
    const need = CREW_TARGET_SIZE - current.size;
    if (need <= 0) continue;
    const candidates = creatorIds.filter((id) => !current.has(id) && id !== crew.ownerId);
    for (const creatorId of candidates.slice(0, need)) {
      actions.push({ kind: "inviteToCrew", bizId: crew.ownerId, groupId: crew.groupId, creatorId });
    }
  }

  // 3. Invited member → accept.
  for (const crew of state.crews) {
    for (const creatorId of crew.invitedMemberIds) {
      actions.push({ kind: "acceptCrewInvite", creatorId, groupId: crew.groupId });
    }
  }

  // 4. Crew with active members and no in-flight campaign → post one.
  for (const crew of state.crews) {
    if (crew.activeMemberIds.length === 0) continue;
    const camps = campaignsByGroup.get(crew.groupId) ?? [];
    const inFlight = camps.some((c) => !campaignCompleted(c, collabsByCampaign));
    if (!inFlight) {
      actions.push({ kind: "postCrewCampaign", bizId: crew.ownerId, groupId: crew.groupId });
    }
  }

  // 5. Published campaign not yet hired → active crew members apply.
  for (const camp of state.campaigns) {
    if (!camp.groupId || camp.status !== "published") continue;
    if ((collabsByCampaign.get(camp.campaignId) ?? []).length > 0) continue; // already hired
    const crew = state.crews.find((c) => c.groupId === camp.groupId);
    if (!crew) continue;
    const applied = new Set((appsByCampaign.get(camp.campaignId) ?? []).map((a) => a.creatorId));
    const candidates = crew.activeMemberIds.filter((id) => !applied.has(id)).sort();
    for (const creatorId of candidates.slice(0, APPLICANTS_PER_CAMPAIGN)) {
      actions.push({ kind: "applyToCampaign", creatorId, campaignId: camp.campaignId });
    }
  }

  // 6. Campaign with a pending application and no collaboration → hire the first.
  for (const camp of state.campaigns) {
    if (!camp.groupId) continue;
    if ((collabsByCampaign.get(camp.campaignId) ?? []).length > 0) continue;
    const pending = (appsByCampaign.get(camp.campaignId) ?? [])
      .filter((a) => a.status === "pending" || a.status === "counter_offered")
      .sort((x, y) => x.applicationId.localeCompare(y.applicationId));
    if (pending.length > 0) {
      actions.push({ kind: "hire", bizId: camp.ownerId, applicationId: pending[0].applicationId });
    }
  }

  // 7. Advance each collaboration through the content funnel.
  for (const collab of state.collaborations) {
    actions.push(...planCollaboration(collab));
  }

  return actions;
}

export interface TickReport {
  attempted: number;
  succeeded: number;
  failures: { action: Action; error: string }[];
}

/** Execute a plan serially, isolating per-action failures (one failure never aborts the tick). */
export async function runDay(plan: Action[], ctx: ActionContext): Promise<TickReport> {
  const failures: { action: Action; error: string }[] = [];
  let succeeded = 0;
  for (const action of plan) {
    try {
      await executeAction(action, ctx);
      succeeded += 1;
    } catch (e) {
      failures.push({ action, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return { attempted: plan.length, succeeded, failures };
}
