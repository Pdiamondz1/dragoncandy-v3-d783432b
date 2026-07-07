import { describe, it, expect } from 'vitest';
import { aiCapStatus, AI_COST_FLOOR_USD } from './aiCostCap';

describe('aiCapStatus', () => {
  it('uses the $250 floor pre-revenue and classifies green/watch/breach', () => {
    expect(aiCapStatus(0, 0)).toMatchObject({ capUsd: 250, basis: 'floor', status: 'green' });
    expect(aiCapStatus(100, 0).status).toBe('green'); // 40% of floor
    expect(aiCapStatus(200, 0).status).toBe('watch'); // exactly 80%
    expect(aiCapStatus(249, 0).status).toBe('watch'); // ~99.6%
    expect(aiCapStatus(300, 0).status).toBe('breach'); // >100%
  });

  it('switches to the 15%-of-revenue basis once it exceeds the floor', () => {
    // revenue $10k -> 15% = $1500 cap (> $250 floor)
    const r = aiCapStatus(600, 10_000);
    expect(r.capUsd).toBe(1500);
    expect(r.basis).toBe('revenue');
    expect(r.status).toBe('green'); // 40%
    expect(r.headroomUsd).toBe(900);
  });

  it('revenue below the floor threshold stays on the floor basis', () => {
    // 15% of $1000 = $150 < $250 floor
    expect(aiCapStatus(0, 1_000)).toMatchObject({ capUsd: AI_COST_FLOOR_USD, basis: 'floor' });
  });

  it('never lets negative revenue lower the cap below the floor', () => {
    expect(aiCapStatus(0, -500).capUsd).toBe(AI_COST_FLOOR_USD);
  });
});
