import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * One migration version, one file.
 *
 * The ledger (`supabase_migrations.schema_migrations`) is keyed on the version
 * stamp alone, so two files sharing one stamp are not a cosmetic clash: whichever
 * applies second is refused as "already recorded", and forcing it past that is how
 * `recorded != actual` happens — a divergence this project has three recorded cases
 * of. It is easy to hit, because a version is a timestamp a human picks by hand and
 * two branches open on the same day will pick the same round number. It happened:
 * `feat/verify-address-throttle` and `feat/instagram-analytics-connector` both chose
 * `20260825100000`, and nothing noticed until the branches were merged together.
 *
 * `migrations-recovered/` is deliberately NOT checked. It holds versions recovered
 * from prod's ledger that exist nowhere else, kept outside the replay path on
 * purpose (see CLAUDE.md), so it is not a namespace anything applies from.
 */
/**
 * Seven collisions predate this check and are frozen rather than fixed. Checked
 * against prod on 2026-08-24: NONE of these seven versions is in the ledger at
 * all (`select version ... where version in (...)` -> 0 rows), which is the usual
 * state here — the repo holds hundreds of files the ledger never recorded. So
 * renumbering them would churn fourteen files, tell us nothing about prod, and
 * risk confusing the recovery work in #496. New collisions are the ones worth
 * stopping, and they are what this list makes visible.
 */
const KNOWN_COLLISIONS = [
  '20260610120000: 20260610120000_donny_knowledge_wiki_source.sql, 20260610120000_refresh_profile_on_resignup.sql',
  '20260610130000: 20260610130000_canonical_display_names.sql, 20260610130000_fix_match_donny_knowledge_search_path.sql',
  '20260610140000: 20260610140000_content_performance.sql, 20260610140000_sync_auth_metadata_name.sql',
  '20260611120000: 20260611120000_app_role_stakeholder.sql, 20260611120000_content_briefs.sql',
  '20260612010000: 20260612010000_aios_findings.sql, 20260612010000_content_engine_unmeasured_brief_performance.sql',
  '20260716120000: 20260716120000_donny_cost_ledger_tier_web.sql, 20260716120000_fix_campaign_matches_scoring.sql',
  '20260808020000: 20260808020000_apply_to_campaign_eligibility.sql, 20260808020000_status_changed_at_anchors.sql',
];

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations');

describe('migration versions', () => {
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'));

  it('reads a non-empty migration directory', () => {
    // Without this, a wrong path would make every assertion below vacuously pass.
    expect(files.length).toBeGreaterThan(100);
  });

  it('gives every file a leading timestamp version', () => {
    const malformed = files.filter((f) => !/^\d{14}_/.test(f));
    expect(malformed).toEqual([]);
  });

  it('adds no version collision beyond the seven already here', () => {
    const byVersion = new Map<string, string[]>();
    for (const file of files) {
      const version = file.slice(0, 14);
      byVersion.set(version, [...(byVersion.get(version) ?? []), file]);
    }
    const collisions = [...byVersion.entries()]
      .filter(([, names]) => names.length > 1)
      .map(([version, names]) => `${version}: ${[...names].sort().join(', ')}`)
      .sort();
    // Exact-set, not a count: a third file joining a frozen version changes its
    // descriptor and fails here too.
    expect(collisions).toEqual(KNOWN_COLLISIONS);
  });
});
