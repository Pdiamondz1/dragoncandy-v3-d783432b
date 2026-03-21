
import React, { useState, useEffect } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { Card, CardContent } from '@/components/ui/card';
import { MessageCircle, Users } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import DirectMessagesList from '@/components/messages/DirectMessagesList';
import ConversationMessageThread from '@/components/messages/ConversationMessageThread';
import { useConversations, type Conversation } from '@/hooks/useConversations';
import { useNavigate, useParams } from 'react-router-dom';
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
      // Find conversation in list
      const conv = conversations.find(
        c => c.conversation_id === selectedConversationId
      );
      setSelectedConversation(conv || null);

      // Get recipient ID
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
      <div className="flex flex-col h-[calc(100vh-4rem)] overflow-hidden">
        {/* Compact header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-border/50 bg-card/50 backdrop-blur-sm flex-shrink-0">
          <div className="p-2 bg-primary/10 rounded-lg">
            <MessageCircle className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-foreground">Messages</h1>
            <p className="text-xs text-muted-foreground">Direct messages and campaign discussions</p>
          </div>
        </div>

        {/* Split pane: conversations list + message thread */}
        <div className="flex flex-1 min-h-0">
          {/* Left panel — conversation list */}
          <div className="w-80 lg:w-96 border-r border-border/50 flex-shrink-0 overflow-hidden">
            <DirectMessagesList
              onConversationSelect={handleConversationSelect}
              onCampaignNavigate={handleCampaignNavigate}
              activeConversationId={selectedConversationId}
            />
          </div>

          {/* Right panel — message thread or placeholder */}
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
            {selectedConversationId ? (
              <ConversationMessageThread
                conversationId={selectedConversationId}
                recipientId={recipientId}
                conversationTitle={selectedConversation?.other_participant_name || 'Conversation'}
              />
            ) : (
              <div className="flex-1 flex items-center justify-center bg-muted/20">
                <div className="text-center space-y-4 animate-fade-in">
                  <div className="p-5 bg-muted/40 rounded-2xl w-fit mx-auto">
                    <Users className="h-10 w-10 text-muted-foreground/60" />
                  </div>
                  <div className="space-y-1.5">
                    <h3 className="text-lg font-semibold text-foreground">
                      Select a conversation
                    </h3>
                    <p className="text-sm text-muted-foreground max-w-xs">
                      Choose a conversation from the list to start messaging
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default DirectMessagesPage;
