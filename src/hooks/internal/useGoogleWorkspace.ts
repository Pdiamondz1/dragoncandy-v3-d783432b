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

// --- Drive file hub (GW PR 2) ---

export interface WorkspaceFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  webViewLink?: string;
  webContentLink?: string;
}

export type WorkspaceFileKind = 'doc' | 'sheet' | 'slides';

const filesKey = (userId?: string) => ['aios', 'workspace', 'files', userId];

export function useWorkspaceFiles() {
  const { user } = useAuth();
  const connection = useGoogleConnection();
  return useQuery({
    queryKey: filesKey(user?.id),
    queryFn: async () => {
      const { files } = await callProxy<{ files: WorkspaceFile[] }>({ action: 'list_files' });
      return files;
    },
    enabled: !!user && !!connection.data?.connected,
  });
}

/** Apply a mutation result to the cached list instantly, then reconcile. */
function useUpdateFilesCache() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return (update: (files: WorkspaceFile[]) => WorkspaceFile[]) => {
    queryClient.setQueryData<WorkspaceFile[]>(filesKey(user?.id), (files) => update(files ?? []));
    queryClient.invalidateQueries({ queryKey: ['aios', 'workspace', 'files'] });
  };
}

export function useCreateWorkspaceFile() {
  const updateCache = useUpdateFilesCache();
  return useMutation({
    mutationFn: async ({ kind, name }: { kind: WorkspaceFileKind; name: string }) => {
      const { file } = await callProxy<{ file: WorkspaceFile }>({ action: 'create_file', kind, name });
      return file;
    },
    onSuccess: (file) => updateCache((files) => [file, ...files]),
  });
}

export function useRenameWorkspaceFile() {
  const updateCache = useUpdateFilesCache();
  return useMutation({
    mutationFn: async ({ fileId, name }: { fileId: string; name: string }) => {
      const { file } = await callProxy<{ file: WorkspaceFile }>({ action: 'rename_file', file_id: fileId, name });
      return file;
    },
    onSuccess: (file) => updateCache((files) => files.map((f) => (f.id === file.id ? file : f))),
  });
}

export function useTrashWorkspaceFile() {
  const updateCache = useUpdateFilesCache();
  return useMutation({
    mutationFn: async (fileId: string) =>
      callProxy<{ success: boolean }>({ action: 'trash_file', file_id: fileId }),
    onSuccess: (_, fileId) => updateCache((files) => files.filter((f) => f.id !== fileId)),
  });
}

async function uploadOne(file: File): Promise<void> {
  const mimeType = file.type || 'application/octet-stream';
  const { upload_url } = await callProxy<{ upload_url: string }>({
    action: 'upload_init',
    name: file.name,
    mime_type: mimeType,
  });
  const response = await fetch(upload_url, {
    method: 'PUT',
    headers: { 'Content-Type': mimeType },
    body: file,
  });
  if (!response.ok) throw new Error(`Upload failed (${response.status})`);
}

/**
 * Concurrent two-step uploads: the proxy starts a resumable session per file
 * (server holds the token), then the browser streams the bytes straight to
 * Google — no file content ever passes through our backend. Returns the names
 * of any files that failed; the list refreshes once after the batch.
 */
export function useUploadWorkspaceFiles() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (files: File[]) => {
      const results = await Promise.allSettled(files.map(uploadOne));
      return files.filter((_, i) => results[i].status === 'rejected').map((f) => f.name);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: filesKey(user?.id) });
    },
  });
}
