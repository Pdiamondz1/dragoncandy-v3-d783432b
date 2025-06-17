
import React, { useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MessageSquare, Plus, Users } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import DirectMessagesList from '@/components/messages/DirectMessagesList';
import MessageThread from '@/components/messages/MessageThread';

const DirectMessagesPage: React.FC = () => {
  const { user } = useAuth();
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);

  const userRole = user?.user_metadata?.role || 'business_client';

  return (
    <DashboardLayout userRole={userRole as 'business_client' | 'content_creator'}>
      <div className="flex-1 p-6">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <MessageSquare className="h-8 w-8 text-blue-600" />
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Direct Messages</h1>
                <p className="text-gray-600">Communicate directly with other users</p>
              </div>
            </div>
            <Button className="flex items-center gap-2">
              <Plus className="h-4 w-4" />
              New Conversation
            </Button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Conversations List */}
            <div className="lg:col-span-1">
              <DirectMessagesList 
                onConversationSelect={setSelectedConversationId}
              />
            </div>

            {/* Message Thread */}
            <div className="lg:col-span-2">
              {selectedConversationId ? (
                <Card className="h-[600px]">
                  <MessageThread 
                    campaignId="" // This would be conversation-based messaging
                    recipientId="" // This would be determined by the conversation
                    campaignTitle="Direct Conversation"
                  />
                </Card>
              ) : (
                <Card className="h-[600px]">
                  <CardContent className="flex flex-col items-center justify-center h-full">
                    <Users className="h-16 w-16 text-gray-400 mb-4" />
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">
                      Select a conversation
                    </h3>
                    <p className="text-gray-600 text-center">
                      Choose a conversation from the list to start messaging
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default DirectMessagesPage;
