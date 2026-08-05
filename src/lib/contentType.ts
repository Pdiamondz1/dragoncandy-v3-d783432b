/**
 * The exact vocabulary of the live `donny_scheduled_posts.content_type` CHECK,
 * verified against prod 2026-08-05.
 */
export const DB_CONTENT_TYPES = [
  'photo', 'reel', 'story', 'video', 'carousel', 'tweet', 'thread',
] as const;

export type DbContentType = (typeof DB_CONTENT_TYPES)[number];

const PLANNER_ALIASES: Record<string, DbContentType> = {
  // content-posting-plan/index.ts:110 returns this for any video/* mime type.
  // It is not in the CHECK, so writing it unmapped fails the insert.
  video_reel: 'reel',
};

/**
 * Map a planner content type onto the DB vocabulary.
 *
 * Returns 'photo' for anything unrecognised rather than throwing: this sits on
 * the publish path, and a hard failure here would lose the post entirely — which
 * is the bug this function exists to fix. The caller logs the DB error, so an
 * unexpected value is still visible.
 */
export function toDbContentType(planContentType: string): DbContentType {
  if ((DB_CONTENT_TYPES as readonly string[]).includes(planContentType)) {
    return planContentType as DbContentType;
  }
  return PLANNER_ALIASES[planContentType] ?? 'photo';
}
