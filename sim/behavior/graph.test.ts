import { describe, it, expect } from "vitest";
import { planDay } from "./graph";
import type { CohortState, CollaborationState, BotRef } from "../types";

function biz(id: string): BotRef {
  return { userId: id, email: `${id}@synthetic.dragoncandy.test`, role: "business_client", personaKey: "hoboken_restaurant", cohort: "t" };
}
function creator(id: string): BotRef {
  return { userId: id, email: `${id}@synthetic.dragoncandy.test`, role: "content_creator", personaKey: "nyc_genz_creator", cohort: "t" };
}
const EMPTY: CohortState = { bots: [], crews: [], campaigns: [], applications: [], collaborations: [] };

describe("planDay — safety invariants", () => {
  it("never plans a public (null group_id) campaign", () => {
    const state: CohortState = {
      bots: [biz("b1"), creator("c1")],
      crews: [{ groupId: "g1", ownerId: "b1", activeMemberIds: ["c1"], invitedMemberIds: [] }],
      campaigns: [], applications: [], collaborations: [],
    };
    const plan = planDay(state, 1);
    const posts = plan.filter((a) => a.kind === "postCrewCampaign");
    expect(posts.length).toBeGreaterThan(0);
    // Every campaign-creating action carries a non-empty group_id (crew-private only).
    for (const a of plan) {
      if (a.kind === "postCrewCampaign") expect(a.groupId).toBeTruthy();
    }
  });
});

describe("planDay — funnel progression", () => {
  function withCollab(patch: Partial<CollaborationState>): CohortState {
    const base: CollaborationState = {
      collaborationId: "col1", campaignId: "camp1", ownerId: "b1", creatorId: "c1",
      status: "active", contentStatus: "pending",
      businessCompletionStatus: null, creatorCompletionStatus: null,
      reviewedByOwner: false, reviewedByCreator: false,
    };
    return {
      bots: [biz("b1"), creator("c1")],
      crews: [{ groupId: "g1", ownerId: "b1", activeMemberIds: ["c1"], invitedMemberIds: [] }],
      campaigns: [{ campaignId: "camp1", ownerId: "b1", groupId: "g1", status: "published" }],
      applications: [],
      collaborations: [{ ...base, ...patch }],
    };
  }

  it("hired + pending content → uploadDeliverable, not submit/review", () => {
    const kinds = planDay(withCollab({ contentStatus: "pending" }), 1).map((a) => a.kind);
    expect(kinds).toContain("uploadDeliverable");
    expect(kinds).not.toContain("submitContent");
    expect(kinds).not.toContain("leaveReview");
  });
  it("in_progress → submitContent, not upload", () => {
    const kinds = planDay(withCollab({ contentStatus: "in_progress" }), 1).map((a) => a.kind);
    expect(kinds).toContain("submitContent");
    expect(kinds).not.toContain("uploadDeliverable");
  });
  it("submitted → requestCompletion for both parties, never a review yet", () => {
    const plan = planDay(withCollab({ contentStatus: "submitted" }), 1);
    expect(plan.filter((a) => a.kind === "requestCompletion")).toHaveLength(2);
    expect(plan.some((a) => a.kind === "leaveReview")).toBe(false);
  });
  it("submitted with business already requested → only the creator requests", () => {
    const plan = planDay(withCollab({ contentStatus: "submitted", businessCompletionStatus: "requested" }), 1);
    const rc = plan.filter((a) => a.kind === "requestCompletion");
    expect(rc).toHaveLength(1);
    expect(rc[0].kind === "requestCompletion" && rc[0].role).toBe("content_creator");
  });
  it("submitted with BOTH already requested but not completed → re-drives the finalize (no silent wedge)", () => {
    const plan = planDay(withCollab({
      contentStatus: "submitted",
      businessCompletionStatus: "requested",
      creatorCompletionStatus: "requested",
      status: "active", // finalize previously no-op'd — must not wedge
    }), 1);
    const rc = plan.filter((a) => a.kind === "requestCompletion");
    expect(rc).toHaveLength(1); // one re-drive, which re-runs the finalize
    expect(plan.some((a) => a.kind === "leaveReview")).toBe(false);
  });
  it("completed + unreviewed → leaveReview for both, no completion/upload", () => {
    const plan = planDay(withCollab({ status: "completed", contentStatus: "approved" }), 1);
    expect(plan.filter((a) => a.kind === "leaveReview")).toHaveLength(2);
    expect(plan.some((a) => a.kind === "requestCompletion")).toBe(false);
  });
  it("review only after completion — never for a still-active collab", () => {
    const plan = planDay(withCollab({ status: "active", contentStatus: "submitted" }), 1);
    expect(plan.some((a) => a.kind === "leaveReview")).toBe(false);
  });
});

describe("planDay — hire gating (no hire before apply)", () => {
  const crew = { groupId: "g1", ownerId: "b1", activeMemberIds: ["c1", "c2"], invitedMemberIds: [] };
  const camp = { campaignId: "camp1", ownerId: "b1", groupId: "g1", status: "published" };
  const bots = [biz("b1"), creator("c1"), creator("c2")];

  it("no applications → no hire; creators apply instead", () => {
    const plan = planDay({ bots, crews: [crew], campaigns: [camp], applications: [], collaborations: [] }, 1);
    expect(plan.some((a) => a.kind === "hire")).toBe(false);
    expect(plan.some((a) => a.kind === "applyToCampaign")).toBe(true);
  });
  it("a pending application → hire that applicant", () => {
    const plan = planDay({
      bots, crews: [crew], campaigns: [camp],
      applications: [{ applicationId: "app1", campaignId: "camp1", creatorId: "c1", status: "pending" }],
      collaborations: [],
    }, 1);
    const hires = plan.filter((a) => a.kind === "hire");
    expect(hires).toHaveLength(1);
    expect(hires[0].kind === "hire" && hires[0].applicationId).toBe("app1");
  });
  it("campaign already has a collaboration → no more hires or applies", () => {
    const plan = planDay({
      bots, crews: [crew], campaigns: [camp],
      applications: [{ applicationId: "app1", campaignId: "camp1", creatorId: "c1", status: "accepted" }],
      collaborations: [{
        collaborationId: "col1", campaignId: "camp1", ownerId: "b1", creatorId: "c1",
        status: "active", contentStatus: "pending", businessCompletionStatus: null,
        creatorCompletionStatus: null, reviewedByOwner: false, reviewedByCreator: false,
      }],
    }, 1);
    expect(plan.some((a) => a.kind === "hire")).toBe(false);
    expect(plan.some((a) => a.kind === "applyToCampaign")).toBe(false);
  });
});

describe("planDay — transaction floor", () => {
  it("reaches the floor when there is plenty of eligible work", () => {
    const bots: BotRef[] = [];
    for (let i = 0; i < 9; i++) bots.push(biz(`b${i}`));
    for (let i = 0; i < 16; i++) bots.push(creator(`c${i}`));
    const plan = planDay({ bots, crews: [], campaigns: [], applications: [], collaborations: [] }, 9);
    expect(plan.length).toBeGreaterThanOrEqual(9); // ≥ one createCrew per business
  });
  it("returns fewer than the floor (a shortfall the caller must log) when quiescent", () => {
    expect(planDay(EMPTY, 20).length).toBeLessThan(20);
  });
});
