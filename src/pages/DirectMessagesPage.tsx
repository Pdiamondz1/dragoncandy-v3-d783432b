
import React, { useState, useEffect } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { ArrowLeft, MessageCircle } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import DirectMessagesList from '@/components/messages/DirectMessagesList';
import ConversationMessageThread from '@/components/messages/ConversationMessageThread';
import { useConversations, type Conversation } from '@/hooks/useConversations';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';

const DirectMessagesPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data: conversations = [] } = useConversations();
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [recipientId, setRecipientId] = useState<string>('');
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);

  const userRole = user?.user_metadata?.role || 'business_client';

  // When a conversation is selected, fetch the recipient
  useEffect(() => {
    if (selectedConversationId && user) {
      const conv = conversations.find(
        c => c.conversation_id === selectedConversationId
      );
      setSelectedConversation(conv || null);

      supabase
        .from('conversation_participants')
        .select('user_id')
        .eq('conversation_id', selectedConversationId)
        .neq('user_id', user.id)
        .maybeSingle()
        .then(({ data }) => {
          if (data) setRecipientId(data.user_id);
        });
    }
  }, [selectedConversationId, user, conversations]);

  const handleConversationSelect = (conversationId: string) => {
    setSelectedConversationId(conversationId);
  };

  const handleCampaignNavigate = (campaignId: string) => {
    const role = userRole === 'content_creator' ? 'creator' : userRole === 'brand' ? 'brand' : 'business';
    navigate(`/dashboard/${role}/messages/campaign/${campaignId}`);
  };

  return (
    <DashboardLayout userRole={userRole as 'business_client' | 'content_creator' | 'brand'}>
      <div className="min-h-screen overflow-x-hidden bg-dc-gray w-full max-w-full">
        {/* Template B header */}
        <div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center">
          {selectedConversationId ? (
            <button
              onClick={() => setSelectedConversationId(null)}
              className="text-dc-pink-accent text-lg mr-2"
              aria-label="Back to messages"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
          ) : (
            <div className="w-7" />
          )}
          <h1 className="flex-1 text-center font-sans text-base font-bold text-gray-900 uppercase tracking-wide">
            {selectedConversationId
              ? (selectedConversation?.other_participant_name || 'Conversation')
              : 'Messages'}
          </h1>
          <div className="w-7" />
        </div>

        {selectedConversationId ? (
          /* Message thread fills remaining screen */
          <div className="flex flex-col overflow-hidden" style={{ height: 'calc(100vh - 3rem)' }}>
            <ConversationMessageThread
              conversationId={selectedConversationId}
              recipientId={recipientId}
              conversationTitle={selectedConversation?.other_participant_name || 'Conversation'}
            />
          </div>
        ) : (
          /* Scrollable conversation list */
          <div className="pb-24 px-4 pt-4 overflow-hidden">
            <DirectMessagesList
              onConversationSelect={handleConversationSelect}
              onCampaignNavigate={handleCampaignNavigate}
              activeConversationId={selectedConversationId}
            />
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default DirectMessagesPage;
