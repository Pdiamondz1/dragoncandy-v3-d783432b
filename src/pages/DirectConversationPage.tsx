import React from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import DashboardLayout from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
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
        <div className="flex-1 p-6 bg-teal-50 min-h-screen overflow-x-hidden">
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
      <div className="flex flex-col h-full bg-teal-50">
        {/* Chat header */}
        <div className="bg-white px-4 py-3 flex items-center justify-between flex-shrink-0 shadow-sm">
          {/* Left: back arrow */}
          <button
            onClick={() => {
              if (navigationState?.from === 'browse-creators' && navigationState?.backPath) {
                navigate(navigationState.backPath);
              } else {
                const role = userRole === 'content_creator' ? 'creator' : 'business';
                navigate(`/dashboard/${role}/messages`);
              }
            }}
            className="text-dc-pink text-xl p-1 -ml-1"
            aria-label="Back"
          >
            <ArrowLeft className="h-5 w-5 text-dc-pink" />
          </button>

          {/* Center: name + status */}
          <div className="flex-1 text-center mx-3">
            <p className="text-lg font-bold text-dc-teal leading-tight">
              {conversation?.other_participant_name || 'Direct Conversation'}
            </p>
            <p className="text-xs text-gray-500">Recently Active</p>
          </div>

          {/* Right: View Profile link */}
          <div className="flex-shrink-0">
            {otherParticipantId && (
              <button
                onClick={() => navigate(`/profile/${otherParticipantId}`)}
                className="text-xs font-medium text-dc-teal hover:underline"
              >
                View Profile
              </button>
            )}
          </div>
        </div>

        {/* Message Thread — fills remaining height */}
        <div className="flex-1 min-h-0 flex flex-col">
          <ConversationMessageThread
            conversationId={conversationId}
            recipientId={recipientId}
            conversationTitle={conversation?.other_participant_name || 'Direct Conversation'}
          />
        </div>
      </div>
    </DashboardLayout>
  );
};

export default DirectConversationPage;