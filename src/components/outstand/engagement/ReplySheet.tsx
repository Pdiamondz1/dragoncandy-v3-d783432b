import React, { useState } from 'react';
import { Send } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useOutstandApi } from '@outstand-so/ui';
import { useOutstandConfig } from '@/integrations/outstand/Provider';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { Comment } from '@/hooks/outstand/usePostComments';

interface ReplySheetProps {
  comment: Comment | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const ReplySheet: React.FC<ReplySheetProps> = ({ comment, open, onOpenChange }) => {
  const { apiKey, baseUrl } = useOutstandConfig();
  const api = useOutstandApi({ apiKey, baseUrl });
  const qc = useQueryClient();
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);

  const handleReply = async () => {
    if (!comment || !replyText.trim()) return;
    setSending(true);
    try {
      const res = await api.post(`/posts/${comment.postId}/comments`, { text: replyText.trim() });
      if (!res.success) throw new Error(res.error || 'Reply failed');
      toast.success('Reply sent!');
      setReplyText('');
      qc.invalidateQueries({ queryKey: ['outstand', 'comments'] });
      onOpenChange(false);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Unknown error';
      toast.error(`Could not reply: ${message}`);
    } finally {
      setSending(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-2xl max-h-[80vh]">
        <SheetHeader>
          <SheetTitle className="text-sm">Reply to {comment?.authorName}</SheetTitle>
        </SheetHeader>
        {comment && (
          <div className="mt-4 space-y-4">
            <div className="bg-gray-50 rounded-xl p-3">
              <div className="text-[10px] text-gray-400 mb-1">on: {comment.postCaption}</div>
              <div className="text-xs text-gray-700">{comment.text}</div>
            </div>
            <div className="flex gap-2 items-center">
              <input
                type="text"
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleReply()}
                placeholder="Write a reply..."
                className="flex-1 border border-gray-200 rounded-full px-4 py-2.5 text-xs outline-none focus:border-dc-teal"
                disabled={sending}
                autoFocus
              />
              <button
                type="button"
                onClick={handleReply}
                disabled={sending || !replyText.trim()}
                className="w-9 h-9 bg-dc-teal text-white rounded-full flex items-center justify-center shrink-0 disabled:opacity-50"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
};
