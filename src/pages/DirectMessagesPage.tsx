
import React, { useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { useAuth } from '@/hooks/useAuth';
import DirectMessagesList from '@/components/messages/DirectMessagesList';
import { useNavigate } from 'react-router-dom';

const DirectMessagesPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();


  const userRole = user?.user_metadata?.role || 'business_client';

  return (
    <DashboardLayout userRole={userRole as 'business_client' | 'content_creator'}>
      <div className="flex-1 bg-[#A8A8A0] min-h-screen">
        <div className="max-w-2xl mx-auto">
          {/* Header */}
          <div className="px-4 pt-4 pb-2">
            <h1 className="text-xl font-bold text-gray-900">Messages</h1>
          </div>

          {/* Conversations List */}
          <DirectMessagesList />
        </div>
      </div>
    </DashboardLayout>
  );
};

export default DirectMessagesPage;
