// Bot minting + cohort reconstruction.
//
// The mint path is synthetic-ONLY: assertSyntheticEmail refuses any address outside
// @synthetic.dragoncandy.test, because that domain is the source-of-truth tag the whole
// Phase 0 spine keys on (handle_new_user auto-registers such signups into synthetic_users).
// A bot minted under any other domain would be invisible to every exclusion filter.
//
// handle_new_user (verified live on prod) reads user_metadata.role + full_name and DERIVES
// business_profiles.account_type from role — so we pass only { role, full_name }. It does NOT
// set profiles.email_verified, and it registers synthetic_users(user_id) ONLY — so mintBot
// additionally sets email_verified and stamps cohort+persona.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Persona, Role, PersonaKey } from "./personas";
import type {
  BotRef,
  CohortState,
  CrewState,
  CampaignState,
  ApplicationState,
  CollaborationState,
} from "./types";

const SYNTHETIC_DOMAIN = "@synthetic.dragoncandy.test";

/** Refuse any email that is not a synthetic bot address. */
export function assertSyntheticEmail(email: string): void {
  if (!email.endsWith(SYNTHETIC_DOMAIN)) {
    throw new Error(`Refusing non-synthetic email: ${email} (must end ${SYNTHETIC_DOMAIN})`);
  }
}

export interface CreateUserInput {
  email: string;
  email_confirm: boolean;
  user_metadata: { role: Role; full_name: string };
}

/** Pure: persona → the exact admin.createUser payload (role is the field the DB consumes). */
export function personaToCreateUser(p: Persona): CreateUserInput {
  assertSyntheticEmail(p.email);
  return {
    email: p.email,
    email_confirm: true,
    user_metadata: { role: p.role, full_name: p.fullName },
  };
}

/**
 * Mint one bot: create the auth user (fires handle_new_user → profiles/business|creator_profiles
 * + synthetic_users registration), mark it verified, and stamp cohort+persona (which also PROVES
 * the trigger registered the row — a 0-row stamp means it did not fire).
 */
export async function mintBot(admin: SupabaseClient, persona: Persona): Promise<BotRef> {
  assertSyntheticEmail(persona.email);

  const { data, error } = await admin.auth.admin.createUser(personaToCreateUser(persona));
  if (error || !data?.user) {
    throw new Error(`createUser failed for ${persona.email}: ${error?.message ?? "no user returned"}`);
  }
  const userId = data.user.id;

  const { error: verErr } = await admin.from("profiles").update({ email_verified: true }).eq("id", userId);
  if (verErr) throw new Error(`email_verified update failed for ${persona.email}: ${verErr.message}`);

  const { data: reg, error: regErr } = await admin
    .from("synthetic_users")
    .update({ cohort: persona.cohort, persona: persona.personaKey })
    .eq("user_id", userId)
    .select("user_id");
  if (regErr) throw new Error(`synthetic_users stamp failed for ${persona.email}: ${regErr.message}`);
  if (!reg || reg.length === 0) {
    throw new Error(`synthetic_users not registered for ${persona.email} — handle_new_user did not fire?`);
  }

  return {
    userId,
    email: persona.email,
    role: persona.role,
    personaKey: persona.personaKey,
    cohort: persona.cohort,
  };
}

/** Service-role SELECT ... WHERE col IN (ids); empty ids short-circuit (no query, no error). */
async function selectIn<T>(
  admin: SupabaseClient,
  table: string,
  cols: string,
  col: string,
  ids: string[],
): Promise<T[]> {
  if (ids.length === 0) return [];
  const { data, error } = await admin.from(table).select(cols).in(col, ids);
  if (error) throw new Error(`readCohort ${table}: ${error.message}`);
  return (data ?? []) as T[];
}

/** Reconstruct the full crew-lane cohort state from the DB (service-role reads). */
export async function readCohort(admin: SupabaseClient): Promise<CohortState> {
  const { data: reg, error } = await admin.from("synthetic_users").select("user_id, cohort, persona");
  if (error) throw new Error(`readCohort synthetic_users: ${error.message}`);
  const botIds = (reg ?? []).map((r) => r.user_id as string);
  if (botIds.length === 0) {
    return { bots: [], crews: [], campaigns: [], applications: [], collaborations: [] };
  }

  const profs = await selectIn<{ id: string; email: string; role: string }>(
    admin, "profiles", "id, email, role", "id", botIds,
  );
  const profById = new Map(profs.map((p) => [p.id, p]));
  const bots: BotRef[] = (reg ?? []).map((r) => {
    const p = profById.get(r.user_id as string);
    return {
      userId: r.user_id as string,
      email: p?.email ?? "",
      role: (p?.role as Role) ?? "content_creator",
      personaKey: (r.persona as PersonaKey | null) ?? null,
      cohort: (r.cohort as string | null) ?? null,
    };
  });

  const groups = await selectIn<{ id: string; owner_id: string }>(
    admin, "creator_groups", "id, owner_id", "owner_id", botIds,
  );
  const groupIds = groups.map((g) => g.id);
  const members = await selectIn<{ group_id: string; creator_id: string; status: string }>(
    admin, "creator_group_members", "group_id, creator_id, status", "group_id", groupIds,
  );
  const crews: CrewState[] = groups.map((g) => {
    const ms = members.filter((m) => m.group_id === g.id);
    return {
      groupId: g.id,
      ownerId: g.owner_id,
      activeMemberIds: ms.filter((m) => m.status === "active").map((m) => m.creator_id),
      invitedMemberIds: ms.filter((m) => m.status === "invited").map((m) => m.creator_id),
    };
  });

  const camps = await selectIn<{ id: string; user_id: string; group_id: string | null; status: string }>(
    admin, "campaigns", "id, user_id, group_id, status", "user_id", botIds,
  );
  // Synthetic campaigns are ALWAYS crew-private; ignore any (there should be none) that aren't.
  const synthCamps = camps.filter((c) => c.group_id != null);
  const campIds = synthCamps.map((c) => c.id);
  const ownerByCampaign = new Map(synthCamps.map((c) => [c.id, c.user_id]));
  const campaigns: CampaignState[] = synthCamps.map((c) => ({
    campaignId: c.id, ownerId: c.user_id, groupId: c.group_id, status: c.status,
  }));

  const apps = await selectIn<{ id: string; campaign_id: string; creator_id: string; status: string }>(
    admin, "campaign_applications", "id, campaign_id, creator_id, status", "campaign_id", campIds,
  );
  const applications: ApplicationState[] = apps.map((a) => ({
    applicationId: a.id, campaignId: a.campaign_id, creatorId: a.creator_id, status: a.status,
  }));

  const collabs = await selectIn<{
    id: string; campaign_id: string; creator_id: string; status: string;
    content_status: string | null; business_completion_status: string | null;
    creator_completion_status: string | null;
  }>(
    admin, "campaign_collaborations",
    "id, campaign_id, creator_id, status, content_status, business_completion_status, creator_completion_status",
    "campaign_id", campIds,
  );
  const collabIds = collabs.map((c) => c.id);
  const reviews = await selectIn<{ collaboration_id: string | null; reviewer_id: string }>(
    admin, "project_reviews", "collaboration_id, reviewer_id", "collaboration_id", collabIds,
  );
  const collaborations: CollaborationState[] = collabs.map((c) => {
    const ownerId = ownerByCampaign.get(c.campaign_id) ?? "";
    const revs = reviews.filter((r) => r.collaboration_id === c.id);
    return {
      collaborationId: c.id,
      campaignId: c.campaign_id,
      ownerId,
      creatorId: c.creator_id,
      status: c.status,
      contentStatus: c.content_status,
      businessCompletionStatus: c.business_completion_status,
      creatorCompletionStatus: c.creator_completion_status,
      reviewedByOwner: revs.some((r) => r.reviewer_id === ownerId),
      reviewedByCreator: revs.some((r) => r.reviewer_id === c.creator_id),
    };
  });

  return { bots, crews, campaigns, applications, collaborations };
}
