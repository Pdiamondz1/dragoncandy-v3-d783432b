
import React, { useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { Card, CardContent } from '@/components/ui/card';
import { MessageSquare, Users, MessageCircle } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import DirectMessagesList from '@/components/messages/DirectMessagesList';
import { useNavigate } from 'react-router-dom';

const DirectMessagesPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();


  const userRole = user?.user_metadata?.role || 'business_client';

  return (
    <DashboardLayout userRole={userRole as 'business_client' | 'content_creator'}>
      <div className="flex-1 p-6 bg-[#A8A8A0] min-h-screen overflow-x-hidden">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="mb-8">
            <div className="flex items-center gap-4 mb-2">
              <div className="p-3 bg-primary/10 rounded-xl">
                <MessageCircle className="h-8 w-8 text-primary" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-foreground">Messages</h1>
                <p className="text-muted-foreground text-lg">Communicate with creators and clients through direct messages and campaign discussions</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[calc(100vh-240px)]">
            {/* Conversations List */}
          <div className="lg:col-span-1">
            <DirectMessagesList />
          </div>

            {/* Message Thread Placeholder */}
            <div className="lg:col-span-2">
              <Card className="h-full border-border/50 shadow-lg">
                <CardContent className="flex flex-col items-center justify-center h-full p-12">
                  <div className="text-center space-y-4">
                    <div className="p-6 bg-muted/30 rounded-full w-fit mx-auto">
                      <Users className="h-12 w-12 text-muted-foreground" />
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
