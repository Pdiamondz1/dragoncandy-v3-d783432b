import { useQuery } from '@tanstack/react-query';
import { useOutstandApi, type Post } from '@outstand-so/ui';
import { useOutstandConfig } from '@/integrations/outstand/Provider';
import { isInPublishedFeed } from '@/pages/OutstandManager';

export interface Comment {
  id: string;
  postId: string;
  postCaption: string;
  postPublishedAt: string | null;
  authorName: string;
  authorId: string;
  text: string;
  createdAt: string;
  platform: string;
  isReply: boolean;
  parentId?: string;
}

const POSTS_LIMIT = 50;

export function usePostComments(posts: Post[], enabled: boolean) {
  const { apiKey, baseUrl } = useOutstandConfig();
  const api = useOutstandApi({ apiKey, baseUrl });

  const publishedPosts = posts
    .filter(isInPublishedFeed)
    .sort((a, b) => {
      const aT = new Date(a.publishedAt ?? a.createdAt ?? 0).getTime();
      const bT = new Date(b.publishedAt ?? b.createdAt ?? 0).getTime();
      return bT - aT;
    })
    .slice(0, POSTS_LIMIT);

  return useQuery({
    queryKey: ['outstand', 'comments', publishedPosts.map((p) => p.id).join(',')],
    queryFn: async (): Promise<Comment[]> => {
      const allComments: Comment[] = [];
      const postCaption = (post: Post): string => {
        const container = post.containers?.[0] as Record<string, unknown> | undefined;
        return ((container?.content ?? container?.text ?? container?.caption ?? '') as string).slice(0, 60);
      };

      await Promise.all(
        publishedPosts.map(async (post) => {
          try {
            const res = await api.get(`/posts/${post.id}/comments`);
            if (!res.success || !Array.isArray(res.data)) return;
            const platform = (post.socialAccounts ?? [])[0]?.network ?? 'unknown';
            for (const c of res.data) {
              allComments.push({
                id: c.id,
                postId: post.id,
                postCaption: postCaption(post),
                postPublishedAt: post.publishedAt ?? null,
                authorName: c.authorName ?? c.author?.name ?? 'Unknown',
                authorId: c.authorId ?? c.author?.id ?? '',
                text: c.text ?? c.content ?? '',
                createdAt: c.createdAt ?? new Date().toISOString(),
                platform,
                isReply: !!c.parentId,
                parentId: c.parentId,
              });
            }
          } catch {
            // Skip posts whose comments can't be fetched
          }
        }),
      );

      return allComments.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    },
    enabled: enabled && publishedPosts.length > 0,
    staleTime: 60_000,
    refetchInterval: 60_000,
  });
}
