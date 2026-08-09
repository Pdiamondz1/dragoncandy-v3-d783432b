import { describe, expect, it } from 'vitest';
import { buildForecast, DEFAULT_ASSUMPTIONS } from './forecastModel';
import { selectDemoScaleScenario } from './demoScaleScenario';

const measured = {
  dbBytes: 0, storageBytes: 0, registeredUsersReal: 40, currentTierIndex: 0,
  loadMatrix: null, currentAiSpendUsd: 0, currentOpexUsd: 0, currentRevenueUsd: 0,
};

describe('selectDemoScaleScenario', () => {
  it('returns the 1,000,000-DAU scenario from a built model', () => {
    const model = buildForecast({ measured, assumptions: DEFAULT_ASSUMPTIONS });
    const s = selectDemoScaleScenario(model);
    expect(s).not.toBeNull();
    expect(s!.dau).toBe(1_000_000);
    expect(s!.label).toBe('1M');
    expect(s!.registeredUsers).toBe(1_000_000 * DEFAULT_ASSUMPTIONS.registered_per_dau);
  });

  it('returns null when no 1M scenario is present', () => {
    expect(selectDemoScaleScenario({ scenarios: [], coefficients: {} as never, notes: [] })).toBeNull();
  });
});
