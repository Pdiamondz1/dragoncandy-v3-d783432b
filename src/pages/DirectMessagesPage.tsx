
import React, { useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Users, MessageCircle } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import DirectMessagesList from '@/components/messages/DirectMessagesList';
import { useNavigate } from 'react-router-dom';

const DirectMessagesPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();


  const userRole = user?.user_metadata?.role || 'business_client';

  return (
    <DashboardLayout userRole={userRole as 'business_client' | 'content_creator'}>
      <div className="flex-1 bg-dc-gray min-h-screen p-4">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="mb-6">
            <div className="flex items-center gap-3">
              <div className="bg-dc-teal/15 p-2 rounded-full">
                <MessageCircle className="h-6 w-6 text-dc-teal" />
              </div>
              <h1 className="text-dc-teal font-bold text-xl">Messages</h1>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[calc(100vh-200px)]">
            {/* Conversations List */}
            <div className="lg:col-span-1">
              <div className="bg-white rounded-2xl overflow-hidden h-full">
                <DirectMessagesList />
              </div>
            </div>

            {/* Message Thread Placeholder */}
            <div className="lg:col-span-2">
              <Card className="h-full bg-white rounded-2xl">
                <CardContent className="flex flex-col items-center justify-center h-full p-12">
                  <div className="text-center space-y-4">
                    <div className="p-6 bg-dc-teal/10 rounded-full w-fit mx-auto">
                      <Users className="h-12 w-12 text-dc-teal" />
                    </div>
                    <div className="space-y-2">
                      <h3 className="text-xl font-semibold text-foreground">
                        Select a conversation
                      </h3>
                      <p className="text-muted-foreground max-w-md">
                        Choose a conversation from the list to start messaging. Both direct messages and campaign conversations are shown here.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default DirectMessagesPage;
