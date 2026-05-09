import React, { useState } from 'react';
import { Send } from 'lucide-react';
import { useOutstandApi, usePostMetrics } from '@outstand-so/ui';
import { useOutstandConfig } from '@/integrations/outstand/Provider';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { Comment } from '@/hooks/outstand/usePostComments';

interface EngagementDetailProps {
  comment: Comment;
}

export const EngagementDetail: React.FC<EngagementDetailProps> = ({ comment }) => {
  const { apiKey, baseUrl } = useOutstandConfig();
  const api = useOutstandApi({ apiKey, baseUrl });
  const { analytics: postAnalytics } = usePostMetrics({
    apiKey,
    baseUrl,
    postId: comment.postId,
  });
  const qc = useQueryClient();
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);

  const handleReply = async () => {
    if (!replyText.trim()) return;
    setSending(true);
    try {
      const res = await api.post(`/posts/${comment.postId}/comments`, { text: replyText.trim() });
      if (!res.success) throw new Error(res.error || 'Reply failed');
      toast.success('Reply sent!');
      setReplyText('');
      qc.invalidateQueries({ queryKey: ['outstand', 'comments'] });
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Unknown error';
      toast.error(`Could not reply: ${message}`);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/50">
        <div className="text-[10px] font-semibold uppercase text-gray-400 mb-2">On your post</div>
        <div className="text-xs font-semibold text-gray-900">{comment.postCaption || 'Untitled post'}</div>
        <div className="text-[11px] text-gray-400 mt-1">
          {comment.postPublishedAt
            ? new Date(comment.postPublishedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
            : ''}
          {' · '}
          {comment.platform}
        </div>
        {postAnalytics?.aggregated_metrics && (
          <div className="flex gap-3 mt-2 text-[10px] text-gray-500">
            <span>{postAnalytics.aggregated_metrics.total_likes} likes</span>
            <span>{postAnalytics.aggregated_metrics.total_comments} comments</span>
            <span>{postAnalytics.aggregated_metrics.total_shares} shares</span>
          </div>
        )}
      </div>
      <div className="flex-1 px-5 py-4 overflow-y-auto">
        <div className="flex gap-2.5">
          <div className="w-8 h-8 bg-pink-200 rounded-full flex items-center justify-center text-xs font-bold text-pink-700 shrink-0">
            {comment.authorName.charAt(0).toUpperCase()}
          </div>
          <div>
            <div className="text-xs">
              <span className="font-bold text-gray-900">{comment.authorName}</span>
              <span className="text-gray-300 text-[10px] ml-2">
                {new Date(comment.createdAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
              </span>
            </div>
            <div className="text-xs text-gray-700 mt-1 leading-relaxed">{comment.text}</div>
          </div>
        </div>
      </div>
      <div className="px-5 py-3 border-t border-gray-100 flex gap-2 items-center">
        <input
          type="text"
          value={replyText}
          onChange={(e) => setReplyText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleReply()}
          placeholder={`Reply to ${comment.authorName}...`}
          className="flex-1 border border-gray-200 rounded-full px-4 py-2.5 text-xs outline-none focus:border-dc-teal"
          disabled={sending}
        />
        <button
          type="button"
          aria-label="Send reply"
          onClick={handleReply}
          disabled={sending || !replyText.trim()}
          className="w-9 h-9 bg-dc-teal text-white rounded-full flex items-center justify-center shrink-0 disabled:opacity-50"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};
