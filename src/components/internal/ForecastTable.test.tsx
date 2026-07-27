// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ForecastTable } from './ForecastTable';
import { buildForecast, DEFAULT_ASSUMPTIONS, type ForecastMeasured } from '@/lib/internal/forecastModel';
import { GB } from '@/lib/internal/weightThresholds';

// recharts' ResponsiveContainer instantiates a ResizeObserver on mount; jsdom
// has none, so stub it (the standard recharts-under-jsdom shim). The container
// still renders empty at 0x0, keeping the label assertions below unambiguous.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= ResizeObserverStub;

const measured: ForecastMeasured = {
  dbBytes: 0.5 * GB, storageBytes: 0.2 * GB, registeredUsersReal: 40, currentTierIndex: 0,
  loadMatrix: null, currentAiSpendUsd: 225, currentOpexUsd: 390, currentRevenueUsd: 0,
};

describe('ForecastTable', () => {
  it('renders a column per scenario and the degradation note when the load matrix is null', () => {
    const model = buildForecast({ measured, assumptions: DEFAULT_ASSUMPTIONS });
    render(<ForecastTable model={model} />);
    expect(screen.getByText('Today')).toBeInTheDocument();
    expect(screen.getByText('1M')).toBeInTheDocument();
    expect(screen.getByText(/ceiling unavailable/i)).toBeInTheDocument();
  });
});
