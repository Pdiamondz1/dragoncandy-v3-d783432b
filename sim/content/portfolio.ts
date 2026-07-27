// Which work-pool images a creator shows as their portfolio.
//
// Blind assignment, same rule as faces: the inputs are a user id and the pool size, never a name,
// city or skill. Verified 2026-07-27 that the seeded skills are near-uniform anyway (photography
// 1,492 / video_editing 1,491 / ugc_creation 1,489 across 1,516 creators), so there is no niche to
// match against — the pool's own breadth is what makes a sample set plausible.
import { poolIndex } from "../avatars/pool";

const DEFAULT_COUNT = 3;

/**
 * `count` distinct pool indices for one creator, deterministic and never adjacent.
 *
 * Adjacency matters: consecutive pool indices come from neighbouring points in the prompt matrix,
 * so three adjacent images are three near-identical shots of the same kind of scene — which reads
 * as obviously generated. The stride is derived from the same id, forced odd so it cannot share a
 * factor with the pool size and collapse the walk onto a short cycle.
 */
export function portfolioIndices(userId: string, poolSize: number, count: number = DEFAULT_COUNT): number[] {
  if (!Number.isInteger(poolSize) || poolSize <= 0) {
    throw new Error(`poolSize must be a positive integer, got ${poolSize}`);
  }

  const wanted = Math.min(count, poolSize);
  const start = poolIndex(userId, poolSize);

  // At least 2 so picks are never adjacent; capped at a quarter of the pool so the three stay
  // spread rather than wrapping onto each other.
  const span = Math.max(2, Math.floor(poolSize / 4));
  let stride = 2 + (poolIndex(`${userId}:stride`, span) % span);
  if (stride % 2 === 0) stride += 1;

  const out: number[] = [];
  let cursor = start;
  // Bounded: at most `poolSize` probes, so a pathological stride can never spin forever.
  for (let probe = 0; probe < poolSize && out.length < wanted; probe++) {
    if (!out.includes(cursor)) out.push(cursor);
    cursor = (cursor + stride) % poolSize;
  }
  return out;
}
