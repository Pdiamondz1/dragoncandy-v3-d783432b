// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const rpc = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { useBlockUser } from './useUserBlocks';

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return React.createElement(QueryClientProvider, { client: qc }, children);
}

describe('useBlockUser', () => {
  beforeEach(() => vi.clearAllMocks());
  it('calls the block_user RPC with the blocked id', async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    const { result } = renderHook(() => useBlockUser(), { wrapper });
    await act(async () => { await result.current.mutateAsync('user-2'); });
    expect(rpc).toHaveBeenCalledWith('block_user', { p_blocked_id: 'user-2' });
  });
});
