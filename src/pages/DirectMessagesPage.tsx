
import React, { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { ArrowLeft, MessageCircle } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { DirectMessagesList } from '@/components/messages/DirectMessagesList';
import { ConversationMessageThread } from '@/components/messages/ConversationMessageThread';
import { ErrorState } from '@/components/ui/error-state';
import { useConversations, type Conversation } from '@/hooks/useConversations';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { PageHeader } from '@/components/ui/PageHeader';

const DirectMessagesPage: React.FC = () => {
  const { user, activeOrgUnit } = useAuth();
  const navigate = useNavigate();
  const { data: conversations = [], error, refetch } = useConversations(activeOrgUnit?.id);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [recipientId, setRecipientId] = useState<string>('');
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);

  const userRole = user?.user_metadata?.role || 'business_client';

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

  if (error) {
    return (
      <DashboardLayout userRole={userRole as 'business_client' | 'content_creator' | 'brand'}>
        <ErrorState message={error.message} onRetry={refetch} />
      </DashboardLayout>
    );
  }

  const handleConversationSelect = (conversationId: string) => {
    setSelectedConversationId(conversationId);
  };

  const handleCampaignNavigate = (campaignId: string) => {
    const role = userRole === 'content_creator' ? 'creator' : userRole === 'brand' ? 'brand' : 'business';
    navigate(`/dashboard/${role}/messages/campaign/${campaignId}`);
  };

  return (
    <DashboardLayout userRole={userRole as 'business_client' | 'content_creator' | 'brand'}>
      <div className="min-h-screen overflow-x-hidden bg-teal-50 w-full max-w-full md:max-w-4xl md:mx-auto">
        {/* Template B header */}
        <PageHeader>
          <div className="flex items-center">
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
            <div className="flex-1 text-center">
              <h1 className="font-sans text-base font-bold text-gray-900 uppercase tracking-wide">
                {selectedConversationId
                  ? (selectedConversation?.other_participant_name || 'Conversation')
                  : 'Messages'}
              </h1>
              {selectedConversationId && (
                <p className="text-xs text-gray-500">Recently Active</p>
              )}
            </div>
            {selectedConversationId && recipientId ? (
              <Link
                to={`/profile/${recipientId}`}
                className="text-xs font-medium text-dc-teal hover:underline"
              >
                View Profile
              </Link>
            ) : (
              <div className="w-7" />
            )}
          </div>
        </PageHeader>

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
          <>
            {/* Scrollable conversation list */}
            <div className="pb-24 md:pb-0 px-4 pt-4 overflow-hidden">
              <DirectMessagesList
                onConversationSelect={handleConversationSelect}
                onCampaignNavigate={handleCampaignNavigate}
                activeConversationId={selectedConversationId}
              />
            </div>
            {/* Desktop empty state hint */}
            <div className="hidden md:flex items-center justify-center py-16">
              <div className="text-center">
                <MessageCircle className="h-10 w-10 text-gray-300 mx-auto mb-3" aria-hidden="true" />
                <p className="text-sm text-gray-400">
                  Select a conversation or start a new one from a creator's profile
                </p>
              </div>
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
};

export default DirectMessagesPage;
