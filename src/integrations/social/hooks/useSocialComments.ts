import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSocialProxy } from '@/integrations/social/client';
import type { Comment, ProviderPost } from '@/integrations/social/contract';

/**
 * The enriched comment shape the engagement UI consumes — the contract
 * `Comment` plus `postCaption` + `postPublishedAt`, which the contract omits by
 * design (they belong to the post, not the comment). This is the exact shape of
 * the legacy `usePostComments` `Comment`, so the Phase-3 import swap is 1:1.
 */
export interface EnrichedComment extends Comment {
  postCaption: string;
  postPublishedAt: string | null;
}

/**
 * The post context needed to enrich its comments. A `ProviderPost` satisfies
 * this; callers may also pass a minimal `{ id, containers, publishedAt }`.
 */
export interface CommentPostContext {
  id: string; // providerPostId
  containers?: ProviderPost['containers'];
  publishedAt?: string | null;
}

function postCaption(post: CommentPostContext): string {
  const container = post.containers?.[0] as
    | Record<string, unknown>
    | undefined;
  const raw =
    (container?.content as string | undefined) ??
    (container?.text as string | undefined) ??
    (container?.caption as string | undefined) ??
    '';
  return raw.slice(0, 60);
}

/**
 * Headless replacement for the Outstand `usePostComments` hook over the
 * `social-proxy` gateway. Fetches contract `Comment[]` for one post and
 * enriches each with `postCaption` + `postPublishedAt` from the passed-in post
 * context, then exposes a `reply` mutation.
 *
 * Dormant until Phase 3 swaps it in.
 */
export function useSocialComments(post: CommentPostContext | null | undefined) {
  const { call, session } = useSocialProxy();
  const qc = useQueryClient();
  const providerPostId = post?.id ?? null;

  const query = useQuery({
    queryKey: ['social-comments', providerPostId],
    queryFn: async (): Promise<EnrichedComment[]> => {
      const comments = await call<Comment[]>('listComments', {
        providerPostId,
      });
      const caption = post ? postCaption(post) : '';
      const publishedAt = post?.publishedAt ?? null;
      return comments.map((c) => ({
        ...c,
        postCaption: caption,
        postPublishedAt: publishedAt,
      }));
    },
    enabled: !!session && !!providerPostId,
    staleTime: 60_000,
  });

  const reply = useMutation({
    mutationFn: (params: { commentId: string; text: string }) =>
      call<void>('replyToComment', {
        commentId: params.commentId,
        text: params.text,
        providerPostId,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['social-comments', providerPostId] });
    },
  });

  return {
    comments: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error as Error | null,
    refetch: query.refetch,
    reply,
  };
}
