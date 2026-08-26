import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Every publish sweep passes every safety parameter `claim_publish_job` takes.
 *
 * WHY THIS TEST EXISTS, RATHER THAN TRUST IN THE CALL SITES.
 *
 * This project has already shipped a claim RPC with a parameter that was
 * declared and never read — `p_claim_ttl_seconds`, whose whole job was to
 * recover abandoned claims, sat unused so claims were orphaned for ever
 * (20260826270000). Nothing looked wrong: the signature was right, the caller
 * passed a value, and the body ignored it. The lesson recorded then was that a
 * parameter nothing reads is not a control.
 *
 * The mirror of that is a parameter no caller PASSES. Both are silent, and the
 * second is now more likely: `p_max_age_seconds` (20260826370000) defaults to
 * 48 hours precisely so a forgetful caller still gets the deadline, which means
 * omitting it produces no error, no warning and no visible difference until a
 * job polls for two days.
 *
 * So the sweeps are re-derived from disk on every CI run rather than
 * enumerated. A third platform's sweep is covered the day it is written, which
 * is the property a hand-written list of two files cannot have — and this repo
 * has watched a hand-maintained enumeration fail three times on `profiles`
 * write grants alone.
 */

const FUNCTIONS_DIR = join(process.cwd(), 'supabase', 'functions');

/** Every argument `claim_publish_job` takes that a caller must supply itself. */
const REQUIRED_CLAIM_ARGS = [
  'p_claim_ttl_seconds',
  'p_rate_limit',
  'p_rate_window_seconds',
  'p_max_attempts',
  'p_max_age_seconds',
  // Both skip lists: without them a sweep re-claims the same job all ten
  // iterations, or stalls every account behind one that is throttled.
  'p_skip_account_keys',
  'p_skip_job_ids',
  // Rate limits differ per platform, so an unscoped claim enforces one
  // platform's allowance on another's account.
  'p_platform',
];

function sweepSources(): { name: string; source: string }[] {
  return readdirSync(FUNCTIONS_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory() && /^[a-z0-9-]+-publish-sweep$/.test(e.name))
    .map((e) => ({
      name: e.name,
      source: readFileSync(join(FUNCTIONS_DIR, e.name, 'index.ts'), 'utf8'),
    }))
    .filter((f) => f.source.includes('claim_publish_job'));
}

describe('publish sweeps', () => {
  const sweeps = sweepSources();

  // CONTROL. A discovery bug that found zero files would make every assertion
  // below vacuously true — the failure mode of a re-derived list.
  it('finds the sweeps that exist', () => {
    expect(sweeps.length).toBeGreaterThanOrEqual(2);
    expect(sweeps.map((s) => s.name).sort()).toEqual(
      expect.arrayContaining(['facebook-publish-sweep', 'instagram-publish-sweep']),
    );
  });

  it.each(sweepSources())('$name passes every claim_publish_job safety argument', ({ source }) => {
    for (const arg of REQUIRED_CLAIM_ARGS) {
      expect(source).toContain(`${arg}:`);
    }
  });

  // The deadline is the one that fails silently, so it gets its own assertion
  // rather than living only inside the loop above.
  it.each(sweepSources())('$name bounds a job that is only ever polled', ({ source }) => {
    expect(source).toMatch(/p_max_age_seconds:\s*MAX_AGE_SECONDS/);
    expect(source).toMatch(/const MAX_AGE_SECONDS\s*=/);
  });

  // A sweep that claims without naming its platform would apply whichever rate
  // limit it happens to hold to whichever account it happens to claim.
  it.each(sweepSources())('$name claims for exactly one platform', ({ name, source }) => {
    const platform = name.replace('-publish-sweep', '');
    expect(source).toContain(`p_platform: '${platform}'`);
  });
});
