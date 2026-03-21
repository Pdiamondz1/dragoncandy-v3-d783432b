import React from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import DashboardLayout from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ArrowLeft, MessageSquare, Users } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import ConversationMessageThread from '@/components/messages/ConversationMessageThread';
import { useConversations } from '@/hooks/useConversations';
import { supabase } from '@/integrations/supabase/client';

const DirectConversationPage: React.FC = () => {
  const { conversationId } = useParams<{ conversationId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { data: conversations = [] } = useConversations();
  
  // Check if user came from browse creators page
  const navigationState = location.state as { from?: string; backPath?: string } | null;

  const userRole = user?.user_metadata?.role || 'business_client';

  // Find the current conversation
  const conversation = conversations.find(c => c.conversation_id === conversationId);

  if (!conversationId) {
    return (
      <DashboardLayout userRole={userRole as 'business_client' | 'content_creator'}>
        <div className="flex-1 p-6 bg-[#A8A8A0] min-h-screen overflow-x-hidden">
          <div className="text-center">
            <p>Conversation not found</p>
            <Button onClick={() => {
              const role = userRole === 'content_creator' ? 'creator' : 'business';
              navigate(`/dashboard/${role}/messages`);
            }} className="mt-4">
              Back to Messages
            </Button>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // Get the other participant's ID from conversation participants
  // We'll query the conversation_participants table to get the actual other participant
  const [otherParticipantId, setOtherParticipantId] = React.useState<string>("");

  React.useEffect(() => {
    if (conversationId && user) {
      // Fetch conversation participants to get the other user's ID
      supabase
        .from('conversation_participants')
        .select('user_id')
        .eq('conversation_id', conversationId)
        .neq('user_id', user.id)
        .maybeSingle()
        .then(({ data }) => {
          if (data) {
            setOtherParticipantId(data.user_id);
          }
        });
    }
  }, [conversationId, user]);

  const recipientId = otherParticipantId;

  return (
    <DashboardLayout userRole={userRole as 'business_client' | 'content_creator'}>
      <div className="flex-1 p-6">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="flex items-center gap-4 mb-6">
            {/* Show "Back to Browse Creators" when user came from that page */}
            {navigationState?.from === 'browse-creators' && navigationState?.backPath && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate(navigationState.backPath!)}
                className="flex items-center gap-2"
              >
                <Users className="h-4 w-4" />
                Back to Browse Creators
              </Button>
            )}
            
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const role = userRole === 'content_creator' ? 'creator' : 'business';
                navigate(`/dashboard/${role}/messages`);
              }}
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