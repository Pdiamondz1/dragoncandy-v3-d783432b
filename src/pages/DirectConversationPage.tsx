import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import DashboardLayout from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ArrowLeft, MessageSquare } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import ConversationMessageThread from '@/components/messages/ConversationMessageThread';
import { useConversations } from '@/hooks/useConversations';

const DirectConversationPage: React.FC = () => {
  const { conversationId } = useParams<{ conversationId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: conversations = [] } = useConversations();

  const userRole = user?.user_metadata?.role || 'business_client';

  // Find the current conversation
  const conversation = conversations.find(c => c.conversation_id === conversationId);

  if (!conversationId) {
    return (
      <DashboardLayout userRole={userRole as 'business_client' | 'content_creator'}>
        <div className="flex-1 p-6">
          <div className="text-center">
            <p>Conversation not found</p>
            <Button onClick={() => navigate('/messages')} className="mt-4">
              Back to Messages
            </Button>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // Get the other participant's ID (recipient)
  const recipientId = conversation ? 
    // For now, we'll need to determine the recipient ID from the conversation
    // This would typically come from conversation participants
    "" : "";

  return (
    <DashboardLayout userRole={userRole as 'business_client' | 'content_creator'}>
      <div className="flex-1 p-6">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="flex items-center gap-4 mb-6">
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate('/messages')}
              className="flex items-center gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Messages
            </Button>
            
            <div className="flex items-center gap-3">
              <MessageSquare className="h-6 w-6 text-primary" />
              <div>
                <h1 className="text-xl font-semibold">
                  {conversation?.other_participant_name || 'Direct Conversation'}
                </h1>
                <p className="text-sm text-muted-foreground">Direct message conversation</p>
              </div>
            </div>
          </div>

          {/* Message Thread */}
          <Card>
            <ConversationMessageThread 
              conversationId={conversationId}
              recipientId={recipientId}
              conversationTitle={conversation?.other_participant_name || 'Direct Conversation'}
            />
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default DirectConversationPage;