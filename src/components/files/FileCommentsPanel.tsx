
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card } from '@/components/ui/card';
import { MessageSquare, Send, Reply } from 'lucide-react';
import { useCreateFileComment } from '@/hooks/useFileComments';
import { useAuth } from '@/hooks/useAuth';
import type { FileComment } from '@/types/files';

interface FileCommentsPanelProps {
  fileId: string;
  comments?: FileComment[];
}

export const FileCommentsPanel: React.FC<FileCommentsPanelProps> = ({
  fileId,
  comments = []
}) => {
  const { user } = useAuth();
  const [newComment, setNewComment] = useState('');
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const createComment = useCreateFileComment();

  const handleSubmitComment = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!newComment.trim()) return;

    await createComment.mutateAsync({
      file_upload_id: fileId,
      comment_text: newComment,
      parent_comment_id: replyTo ?? undefined
    });

    setNewComment('');
    setReplyTo(null);
  };

  const renderComment = (comment: FileComment, isReply = false) => (
    <Card key={comment.id} className={`p-4 ${isReply ? 'ml-8 mt-2' : ''}`}>
      <div className="flex gap-3">
        <Avatar className="h-8 w-8">
          <AvatarImage src={comment.user_profile?.avatar_url || ''} alt={comment.user_profile?.full_name ?? "User avatar"} />
          <AvatarFallback>
            {comment.user_profile?.full_name?.[0] || 'U'}
          </AvatarFallback>
        </Avatar>
        
        <div className="flex-1 space-y-2">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm">
              {comment.user_profile?.full_name || 'Anonymous'}
            </span>
            <span className="text-xs text-muted-foreground">
              {new Date(comment.created_at).toLocaleString()}
            </span>
          </div>
          
          <p className="text-sm text-foreground">{comment.comment_text}</p>
          
          {!isReply && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setReplyTo(comment.id)}
              className="h-auto p-0 text-xs text-blue-600 hover:text-blue-800"
            >
              <Reply className="h-3 w-3 mr-1" />
              Reply
            </Button>
          )}
        </div>
      </div>
      
      {/* Render replies */}
      {comment.replies && comment.replies.map(reply => 
        renderComment(reply, true)
      )}
    </Card>
  );

  return (
    <div className="space-y-6">
      {/* Comments List */}
      {comments.length > 0 ? (
        <div className="space-y-4">
          {comments
            .filter(comment => !comment.parent_comment_id)
            .map(comment => renderComment(comment))}
        </div>
      ) : (
        <div className="text-center py-8">
          <MessageSquare className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
          <p className="text-muted-foreground">No comments yet</p>
          <p className="text-sm text-muted-foreground">Be the first to leave a comment</p>
        </div>
      )}

      {/* New Comment Form */}
      <Card className="p-4">
        <form onSubmit={handleSubmitComment} className="space-y-4">
          {replyTo && (
            <div className="flex items-center gap-2 text-sm text-blue-600">
              <Reply className="h-4 w-4" />
              <span>Replying to comment</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setReplyTo(null)}
                className="h-auto p-0 text-xs"
              >
                Cancel
              </Button>
            </div>
          )}
          
          <div className="flex gap-3">
            <Avatar className="h-8 w-8">
              <AvatarImage src={user?.user_metadata?.avatar_url || ''} alt="User avatar" />
              <AvatarFallback>
                {user?.email?.[0]?.toUpperCase() || 'U'}
              </AvatarFallback>
            </Avatar>
            
            <div className="flex-1 space-y-3">
              <Textarea
                placeholder={replyTo ? 'Write a reply...' : 'Add a comment...'}
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                rows={3}
              />
              
              <div className="flex justify-end">
                <Button
                  type="submit"
                  size="sm"
                  disabled={!newComment.trim() || createComment.isPending}
                >
                  <Send className="h-4 w-4 mr-2" />
                  {replyTo ? 'Reply' : 'Comment'}
                </Button>
              </div>
            </div>
          </div>
        </form>
      </Card>
    </div>
  );
};

