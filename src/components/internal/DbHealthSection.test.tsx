// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DbHealthSection } from './DbHealthSection';
import type { DbHealth } from '@/hooks/internal/useDbHealth';

const health: DbHealth = {
  connections: { total: 20, active: 3, idle: 15, idle_in_transaction: 2, max: 100, reserved: 3 },
  latency: { mean_query_ms: 1.4, slowest_statement_ms: 42 },
  cache_hit_ratio: 0.991, xact_commit: 1234, xact_rollback: 5, db_bytes: 5e8,
  generated_at: '2026-07-27T00:00:00Z',
};

describe('DbHealthSection', () => {
  it('renders live cards + the CPU/RAM "coming next" seam', () => {
    render(<DbHealthSection health={health} isLoading={false} isError={false} />);
    expect(screen.getByText('Database health')).toBeInTheDocument();
    expect(screen.getByText(/coming next/i)).toBeInTheDocument();
    expect(screen.getByText('99%')).toBeInTheDocument(); // cache hit
  });
  it('shows the error state on isError (does not throw)', () => {
    render(<DbHealthSection health={undefined} isLoading={false} isError />);
    expect(screen.getByText(/unavailable/i)).toBeInTheDocument();
  });
  it('degrades latency to — when pg_stat_statements is absent', () => {
    const noStats = { ...health, latency: { mean_query_ms: null, slowest_statement_ms: null } };
    render(<DbHealthSection health={noStats} isLoading={false} isError={false} />);
    expect(screen.getByText(/stat extension not enabled/i)).toBeInTheDocument();
  });
});
