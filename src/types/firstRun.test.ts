import { describe, it, expect } from 'vitest';
import { getInitialMissions, areMissionsComplete, parseFirstRunMissions } from './firstRun';

describe('first_run_missions holds only non-derivable view events', () => {
  it('business missions no longer track payments or campaigns', () => {
    const m = getInitialMissions('business_client') as unknown as Record<string, unknown>;
    expect(Object.keys(m).sort()).toEqual(['browse_inspiration']);
  });

  it('creator missions no longer track payouts, portfolio or applying', () => {
    const m = getInitialMissions('content_creator') as unknown as Record<string, unknown>;
    expect(Object.keys(m).sort()).toEqual(['view_campaigns']);
  });

  it('brand missions keep only the two view events', () => {
    const m = getInitialMissions('brand') as unknown as Record<string, unknown>;
    expect(Object.keys(m).sort()).toEqual(['browse_creators', 'select_style']);
  });

  /** Old rows must keep reading — the column is narrowed, never dropped. */
  it('parses a legacy blob containing removed keys without throwing', () => {
    const legacy = { browse_inspiration: true, create_campaign: true, setup_payments: false };
    const parsed = parseFirstRunMissions(legacy as never, 'business_client');
    expect(parsed).toBeTruthy();
    expect((parsed as unknown as Record<string, unknown>).browse_inspiration).toBe(true);
  });

  it('completion ignores keys that are no longer part of the set', () => {
    expect(areMissionsComplete({ browse_inspiration: true } as never)).toBe(true);
  });
});
