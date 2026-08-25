import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Every surface that offers the Outstand connect buttons must also offer the
 * analytics connectors.
 *
 * This is a real defect replayed as a test. `LocationSettingsSections` rendered
 * `ConnectedAccountsList` (Outstand — which publishes) and nothing else, so the only
 * Instagram button on the page a multi-location business actually lands on belonged
 * to the other integration. On 2026-08-24 the founder pressed it and granted the
 * account to Outstand-IG, then reported the new connector as broken; our table was
 * empty, and correctly so.
 *
 * The two integrations look alike and do different jobs — Outstand publishes, these
 * read — so a page that offers one and hides the other does not present a choice, it
 * misroutes. Adding a fourth settings surface later is exactly when this is easiest
 * to forget, which is why the check derives the file list instead of naming it.
 */
const SETTINGS_DIR = join(process.cwd(), 'src', 'components', 'settings');

const files = readdirSync(SETTINGS_DIR)
  .filter((f) => f.endsWith('.tsx'))
  .map((f) => ({ name: f, source: readFileSync(join(SETTINGS_DIR, f), 'utf8') }));

const outstandSurfaces = files.filter((f) => f.source.includes('<ConnectedAccountsList'));

describe('analytics connector coverage', () => {
  it('finds the settings surfaces that render the Outstand accounts list', () => {
    // Without this, a renamed component or moved directory would make every
    // assertion below pass over an empty list.
    expect(outstandSurfaces.map((f) => f.name).sort()).toEqual([
      'BusinessSettingsSections.tsx',
      'CreatorSettingsSections.tsx',
      'LocationSettingsSections.tsx',
    ]);
  });

  it.each([
    'InstagramInsightsCard',
    'YouTubeAnalyticsCard',
    'FacebookPageInsightsCard',
    'XAnalyticsCard',
    'TikTokAnalyticsCard',
  ])(
    'renders %s on every surface that offers Outstand',
    (card) => {
      const missing = outstandSurfaces
        .filter((f) => !f.source.includes(`<${card}`))
        .map((f) => f.name);
      expect(missing).toEqual([]);
    },
  );

  it('says on the location page that the connections are account-wide, not per location', () => {
    // The location section is headed "This location's accounts", but both
    // connections key on user_id, so the bare cards would assert a per-location
    // relationship the schema does not have.
    const location = outstandSurfaces.find((f) => f.name === 'LocationSettingsSections.tsx');
    expect(location?.source).toMatch(
      /belong to your DragonCandy\s+account rather than to this location/,
    );
  });
});
