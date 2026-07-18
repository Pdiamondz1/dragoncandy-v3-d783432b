import React, { useState, useMemo } from 'react';
import { MessageCircle } from 'lucide-react';
import type { Post } from '@outstand-so/ui';
import { DCEmptyState } from '@/components/ui/dc-empty-state';
import { DCSkeleton } from '@/components/ui/dc-skeleton';
import { usePostComments, type Comment } from '@/hooks/outstand/usePostComments';
import { EngagementList } from './engagement/EngagementList';
import { EngagementDetail } from './engagement/EngagementDetail';
import { ReplySheet } from './engagement/ReplySheet';
import { AppChip } from '@/components/app/AppChip';

type FilterType = 'all' | 'comment' | 'mention';

interface EngagementTabProps {
  posts: Post[];
  ownAccountIds: string[];
}

export const EngagementTab: React.FC<EngagementTabProps> = ({ posts, ownAccountIds }) => {
  const { data: comments, isLoading } = usePostComments(posts, true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterType>('all');
  const [replySheetComment, setReplySheetComment] = useState<Comment | null>(null);

  const filteredComments = useMemo(() => {
    if (!comments) return [];
    const filtered = filter === 'all'
      ? comments
      : filter === 'comment'
        ? comments.filter((c) => !c.isReply)
        : comments.filter((c) => c.isReply);
    return [...filtered].sort((a, b) => {
      const aReplied = ownAccountIds.includes(a.authorId) || a.isReply;
      const bReplied = ownAccountIds.includes(b.authorId) || b.isReply;
      if (aReplied !== bReplied) return aReplied ? 1 : -1;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [comments, filter, ownAccountIds]);

  const selectedComment = useMemo(
    () => filteredComments.find((c) => c.id === selectedId) ?? null,
    [filteredComments, selectedId],
  );

  const commentCount = comments?.filter((c) => !c.isReply).length ?? 0;
  const mentionCount = comments?.filter((c) => c.isReply).length ?? 0;

  const handleSelect = (comment: Comment) => {
    setSelectedId(comment.id);
    if (window.innerWidth < 768) {
      setReplySheetComment(comment);
    }
  };

  if (isLoading) {
    return <DCSkeleton variant="card" count={4} className="mb-3" />;
  }

  if (!comments || comments.length === 0) {
    return (
      <DCEmptyState
        icon={MessageCircle}
        title="No comments or mentions yet"
        subtitle="When people comment on or mention your posts, they'll appear here."
      />
    );
  }

  const filterButtons: { key: FilterType; label: string; count?: number }[] = [
    { key: 'all', label: 'All' },
    { key: 'comment', label: 'Comments', count: commentCount },
    { key: 'mention', label: 'Mentions', count: mentionCount },
  ];

  return (
    <div>
      <div className="flex gap-1.5 mb-3 overflow-x-auto pb-1">
        {filterButtons.map((f) => (
          <AppChip
            key={f.key}
            active={filter === f.key}
            onClick={() => setFilter(f.key)}
            className="text-[11px] px-3 whitespace-nowrap inline-flex items-center gap-1"
          >
            {f.label}
            {f.count !== undefined && f.count > 0 && (
              <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${
                filter === f.key ? 'bg-dc-teal/20 text-dc-teal-btn' : 'bg-red-500 text-white'
              }`}>
                {f.count}
              </span>
            )}
          </AppChip>
        ))}
      </div>

      <div className="md:grid md:grid-cols-[320px_1fr] md:min-h-[400px] md:border md:border-dc-teal/15 md:rounded-xl md:overflow-hidden">
        <div className="md:border-r md:border-dc-teal/15 md:overflow-y-auto md:max-h-[500px]">
          <EngagementList
            comments={filteredComments}
            selectedId={selectedId}
            ownAccountIds={ownAccountIds}
            onSelect={handleSelect}
          />
        </div>
        <div className="hidden md:flex md:flex-col">
          {selectedComment ? (
            <EngagementDetail comment={selectedComment} />
          ) : (
            <div className="flex items-center justify-center h-full text-xs text-gray-300">
              Select a comment to view details and reply
            </div>
          )}
        </div>
      </div>

      <ReplySheet
        comment={replySheetComment}
        open={!!replySheetComment}
        onOpenChange={(open) => !open && setReplySheetComment(null)}
      />
    </div>
  );
};
