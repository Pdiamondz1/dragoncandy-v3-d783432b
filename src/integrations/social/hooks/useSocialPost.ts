import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useSocialProxy } from '@/integrations/social/client';
import type { PostInput, PostResult } from '@/integrations/social/contract';

/**
 * Headless replacement for the Outstand cross-post mutation (`useCrossPost`),
 * over the provider-agnostic `social-proxy` gateway. Takes a contract
 * `PostInput` and returns a `PostResult`; invalidates the accounts list and any
 * post/comment queries on success.
 *
 * Dormant until Phase 3 swaps it in for the SDK hook.
 */
export function useSocialPost() {
  const { call } = useSocialProxy();
  const qc = useQueryClient();

  return useMutation<PostResult, Error, PostInput>({
    mutationFn: (input: PostInput) => call<PostResult>('createPost', input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['social-accounts'] });
      qc.invalidateQueries({ queryKey: ['social-comments'] });
    },
  });
}
