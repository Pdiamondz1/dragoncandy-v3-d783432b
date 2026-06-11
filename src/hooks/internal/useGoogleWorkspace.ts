import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface GoogleConnectionStatus {
  connected: boolean;
  needs_reconnect?: boolean;
  google_email?: string;
  scopes?: string[];
  has_folder?: boolean;
  connected_at?: string;
}

async function callProxy<T>(body: Record<string, unknown>): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('No active session');
  const response = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/google-workspace-proxy`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      },
      body: JSON.stringify(body),
    }
  );
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error || 'Google Workspace request failed');
  }
  return data as T;
}

/** Connection state via the status RPC (no token columns can ever appear here). */
export function useGoogleConnection() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['aios', 'workspace', 'connection', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('google_connection_status');
      if (error) {
        console.error('google_connection_status failed:', error);
        throw error;
      }
      return data as unknown as GoogleConnectionStatus;
    },
    enabled: !!user,
  });
}

/** Starts the OAuth flow: asks the proxy for a consent URL, then redirects. */
export function useConnectGoogle() {
  return useMutation({
    mutationFn: async () => {
      const { url } = await callProxy<{ url: string }>({
        action: 'auth_url',
        host: window.location.hostname,
      });
      window.location.assign(url);
    },
  });
}

/** Completes the OAuth flow from the callback page. */
export function useCompleteGoogleConnection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ code, state }: { code: string; state: string }) => {
      return callProxy<{ success: boolean; google_email: string }>({
        action: 'oauth_callback',
        code,
        state,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['aios', 'workspace'] });
    },
  });
}

export function useDisconnectGoogle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => callProxy<{ success: boolean }>({ action: 'disconnect' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['aios', 'workspace'] });
    },
  });
}
