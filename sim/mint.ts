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
import { DEPTH_POOL_EMAIL_PREFIX, isDepthPoolEmail } from "./seed";
import { MARKETPLACE_EMAIL_PREFIX, isMarketplaceEmail } from "./marketplace/personas";

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
/**
 * Lightweight cohort read for `load`: fetch ONLY session-capable synthetic bots — the live daily
 * cohort (bot0##) + the active load cohort (botla…). It filters at the DB by email pattern, so it
 * never issues an oversized `.in(botIds)` over a large depth pool (a 50K-row `.in()` would blow the
 * PostgREST URL / time out before the load test even starts), and it deliberately SKIPS the
 * crew/campaign/application/collaboration graph that `readCohort` reconstructs — `load` drives
 * read-heavy public-surface traffic and needs only the bot refs (userId + email for session minting).
 * The depth pool (botseed_*) is DB-only weight that never authenticates, so it is excluded both at
 * the DB (`.not like`) and by the `isDepthPoolEmail` guard (single-source semantics).
 */
export async function readSessionCapableBots(admin: SupabaseClient): Promise<BotRef[]> {
  const { data, error } = await admin
    .from("profiles")
    .select("id, email, role")
    .like("email", `%${SYNTHETIC_DOMAIN}`)
    .not("email", "like", `${DEPTH_POOL_EMAIL_PREFIX}%`)
    // Exclude the PERSISTENT marketplace cohort (botmk_*): it has its own driver + teardown and must
    // never be swept into the daily crew tick or the single-runner load pre-warm.
    .not("email", "like", `${MARKETPLACE_EMAIL_PREFIX}%`);
  if (error) throw new Error(`readSessionCapableBots: ${error.message}`);
  return (data ?? [])
    .map((p) => ({
      userId: p.id as string,
      email: (p.email as string) ?? "",
      role: (p.role as Role) ?? "content_creator",
      personaKey: null as PersonaKey | null,
      cohort: null as string | null,
    }))
    .filter((b) => !isDepthPoolEmail(b.email) && !isMarketplaceEmail(b.email));
}

// ── Matrix shard slice (Phase 1, Task 1.1) ──────────────────────────────────────────────────
// The active (session-capable) load cohort namespace prefix — bulk-seed mints it as botla<seed>_<i>.
const ACTIVE_COHORT_PREFIX = "botla";
// Each runner shard drives its OWN fixed 25-bot slice from its own egress IP (25 mints/IP → 429-safe).
const PER_SHARD = 25;

/**
 * PURE: this shard's DISJOINT 25-bot slice of the active (botla…) cohort. Filters OUT the live
 * bot0## daily-tick cohort, then sorts by email so the slice is STABLE regardless of the row order
 * PostgREST returned — lexicographic determinism is sufficient (only stable, non-overlapping slices
 * matter, not numeric order); without it, independent runners would get different orderings →
 * OVERLAPPING slices (the same bot's session opened from two IPs). Returns the window
 * [shard·25 … shard·25+25); an out-of-range shard (`shard < 0` or `shard >= shards`) has no slice → [].
 */
export function sliceActiveCohort(
  rows: { id: string; email: string; role: string }[],
  shard: number,
  shards: number,
): BotRef[] {
  if (!(shards > 0) || shard < 0 || shard >= shards) return [];
  const ordered = rows
    .filter((r) => (r.email ?? "").startsWith(ACTIVE_COHORT_PREFIX))
    .sort((a, b) => a.email.localeCompare(b.email));
  const start = shard * PER_SHARD;
  return ordered.slice(start, start + PER_SHARD).map((r) => ({
    userId: r.id,
    email: r.email,
    role: (r.role as Role) ?? "content_creator",
    personaKey: null as PersonaKey | null,
    cohort: null as string | null,
  }));
}

/**
 * DB read for a matrix shard: fetch the active (botla…) cohort ordered by email at the DB, then
 * return THIS shard's slice. The `.like('botla%@synthetic…')` filter keeps the live bot0## cohort
 * (which readSessionCapableBots also returns) OUT, and `.order('email')` makes every runner see the
 * same ordering so the per-shard slices are disjoint across IPs (spec decision #3).
 */
export async function readActiveLoadCohort(
  admin: SupabaseClient,
  shard: number,
  shards: number,
): Promise<BotRef[]> {
  const { data, error } = await admin
    .from("profiles")
    .select("id, email, role")
    .like("email", `${ACTIVE_COHORT_PREFIX}%${SYNTHETIC_DOMAIN}`)
    .order("email", { ascending: true });
  if (error) throw new Error(`readActiveLoadCohort: ${error.message}`);
  return sliceActiveCohort((data ?? []) as { id: string; email: string; role: string }[], shard, shards);
}

export async function readCohort(admin: SupabaseClient): Promise<CohortState> {
  // Derive the cohort from the SESSION-CAPABLE bots only (live bot0## + active botla…), NOT the whole
  // synthetic_users registry. The depth pool (botseed_*) is inert weight that never authenticates and
  // — after a bulk-seed — can be tens of thousands of rows; including it would make `tick` plan/mint
  // sessions for accounts that never log in AND drag every downstream .in() to that size. We enrich
  // persona/cohort from the registry over this (small) id set. (Codex P1.)
  const sessionBots = await readSessionCapableBots(admin);
  const botIds = sessionBots.map((b) => b.userId);
  if (botIds.length === 0) {
    return { bots: [], crews: [], campaigns: [], applications: [], collaborations: [] };
  }

  const reg = await selectIn<{ user_id: string; cohort: string | null; persona: string | null }>(
    admin, "synthetic_users", "user_id, cohort, persona", "user_id", botIds,
  );
  const regById = new Map(reg.map((r) => [r.user_id, r]));
  const bots: BotRef[] = sessionBots.map((b) => ({
    ...b,
    personaKey: (regById.get(b.userId)?.persona as PersonaKey | null) ?? null,
    cohort: (regById.get(b.userId)?.cohort as string | null) ?? null,
  }));

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
