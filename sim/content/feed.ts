// Builds the DragonFeed rows for the synthetic cohort. Pure — no I/O, no clock: `nowMs` is passed
// in so the output is fully deterministic and testable.
//
// See docs/superpowers/specs/2026-07-27-synthetic-content-pass-design.md §4.4.
import { poolIndex, poolPublicUrl } from "../avatars/pool";

export interface FeedRowInput {
  creatorIds: string[];
  orgIds: string[];
  /** Pool object paths, e.g. "synthetic/work/0007.jpg" — the REAL ones present in storage. */
  workPaths: string[];
  supabaseUrl: string;
  count: number;
  nowMs: number;
  windowDays?: number;
}

export interface FeedRow {
  creator_id: string;
  target_org_id: string;
  content_type: "photo";
  content_file_path: string;
  caption: string;
  hashtags: string[];
  submitted_at: string;
  expires_at: string;
}

const WINDOW_DAYS = 60;
/** Well past the column's `now() + 30 days` default. Nothing filters on expiry today, but that
 *  default would quietly empty the feed a month after seeding. */
const EXPIRY_DAYS = 730;

const CAPTIONS = [
  "Shot this for the team last week — still one of my favourites.",
  "Golden hour in the dining room hits different.",
  "Behind the pass during service.",
  "New menu shoot, first look.",
  "Detail work on the plating.",
  "Quiet moment before doors open.",
  "This one took three takes and a lot of patience.",
  "Kitchen light is underrated.",
  "Set the table, waited for the sun.",
  "Local spot, big flavours.",
  "Sunday service prep.",
  "Bar shots are my favourite kind of problem.",
];

const TAGS = [
  ["#DragonDashed", "#foodphotography"],
  ["#DragonDashed", "#localeats"],
  ["#DragonDashed", "#ugc"],
  ["#DragonDashed", "#restaurantlife"],
  ["#DragonDashed", "#contentcreator"],
  ["#DragonDashed", "#foodie"],
];

const DAY_MS = 24 * 3600 * 1000;

export function buildFeedRows(input: FeedRowInput): FeedRow[] {
  const { creatorIds, orgIds, workPaths, supabaseUrl, count, nowMs } = input;
  const windowDays = input.windowDays ?? WINDOW_DAYS;

  // Nothing to reference or nobody to attribute to — emit nothing rather than a broken row.
  if (creatorIds.length === 0 || orgIds.length === 0 || workPaths.length === 0) return [];

  const expiresAt = new Date(nowMs + EXPIRY_DAYS * DAY_MS).toISOString();
  const rows: FeedRow[] = [];

  // Creators are DEALT round-robin from a rotated start rather than hashed independently per post.
  // Independent hashing is balls-in-bins: with 500 posts over 300 creators it handed one creator 9
  // posts while others got none, which makes a synthetic account look like a power user. Dealing
  // bounds every creator to ceil(count / creators) and stays fully deterministic.
  const rotation = poolIndex("feed:rotation", creatorIds.length);

  for (let i = 0; i < count; i++) {
    const creator = creatorIds[(rotation + i) % creatorIds.length];
    const org = orgIds[poolIndex(`${i}:org`, orgIds.length)];
    const path = workPaths[poolIndex(`${i}:img`, workPaths.length)];

    // Spread evenly back through the window, then jitter within the day so timestamps are dense
    // and irregular rather than one post per exact interval. Never in the future.
    const daysBack = (i / Math.max(1, count - 1)) * windowDays;
    const jitterMs = poolIndex(`${i}:jitter`, DAY_MS);
    const submittedMs = Math.min(nowMs, nowMs - Math.round(daysBack * DAY_MS) + jitterMs - DAY_MS / 2);

    rows.push({
      creator_id: creator,
      target_org_id: org,
      content_type: "photo",
      content_file_path: poolPublicUrl(supabaseUrl, path),
      caption: CAPTIONS[poolIndex(`${i}:caption`, CAPTIONS.length)],
      hashtags: TAGS[poolIndex(`${i}:tags`, TAGS.length)],
      submitted_at: new Date(submittedMs).toISOString(),
      expires_at: expiresAt,
    });
  }

  return rows;
}
