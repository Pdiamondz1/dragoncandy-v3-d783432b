// Shared domain types for the harness: the reconstructed cohort state (produced by
// readCohort in mint.ts) and the Action union (planned by graph.ts, executed by
// actions.ts). Kept in one place so minting, planning, and execution agree on shape.

import type { Role, PersonaKey } from "./personas";

export interface BotRef {
  userId: string;
  email: string;
  role: Role;
  personaKey: PersonaKey | null;
  cohort: string | null;
}

export interface CrewState {
  groupId: string;
  ownerId: string;
  activeMemberIds: string[];
  invitedMemberIds: string[];
}

export interface CampaignState {
  campaignId: string;
  ownerId: string;
  /** Always non-null for synthetic (crew-private) campaigns — the isolation guarantee. */
  groupId: string | null;
  status: string;
}

export interface ApplicationState {
  applicationId: string;
  campaignId: string;
  creatorId: string;
  status: string;
}

export interface CollaborationState {
  collaborationId: string;
  campaignId: string;
  ownerId: string;
  creatorId: string;
  status: string;
  contentStatus: string | null;
  businessCompletionStatus: string | null;
  creatorCompletionStatus: string | null;
  reviewedByOwner: boolean;
  reviewedByCreator: boolean;
}

export interface CohortState {
  bots: BotRef[];
  crews: CrewState[];
  campaigns: CampaignState[];
  applications: ApplicationState[];
  collaborations: CollaborationState[];
}

/**
 * One funnel-advancing write. `graph.planDay` emits an ordered list; `actions.executeAction`
 * performs each. Every action runs as a specific bot (the id field named below) over its own
 * JWT — except nothing here uses service-role for a marketplace write.
 */
export type Action =
  | { kind: "createCrew"; bizId: string }
  | { kind: "inviteToCrew"; bizId: string; groupId: string; creatorId: string }
  | { kind: "acceptCrewInvite"; creatorId: string; groupId: string }
  | { kind: "postCrewCampaign"; bizId: string; groupId: string }
  | { kind: "applyToCampaign"; creatorId: string; campaignId: string }
  | { kind: "hire"; bizId: string; applicationId: string }
  | { kind: "uploadDeliverable"; creatorId: string; collaborationId: string; campaignId: string }
  | { kind: "submitContent"; creatorId: string; collaborationId: string; campaignId: string }
  | { kind: "requestCompletion"; actorId: string; role: Role; collaborationId: string }
  | { kind: "leaveReview"; actorId: string; role: Role; collaborationId: string; revieweeId: string };
