
import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import DashboardLayout from '@/components/DashboardLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertCircle } from 'lucide-react';
import { useCampaigns } from '@/hooks/useCampaigns';
import ApplicationsListFixed from '@/components/campaigns/ApplicationsListFixed';

const BusinessProposals = () => {
  const { campaignId } = useParams<{ campaignId: string }>();

  const { campaigns = [], isLoading: campaignLoading, error: campaignError } = useCampaigns();
  const campaign = campaigns.find(c => c.id === campaignId);

  if (campaignLoading) {
    return (
      <DashboardLayout userRole="business_client">
        <div className="flex-1 p-8">
          <div className="max-w-7xl mx-auto">
            <div className="animate-pulse space-y-6">
              <div className="h-8 bg-gray-200 rounded w-1/3"></div>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-24 bg-gray-200 rounded"></div>
                ))}
              </div>
              <div className="h-64 bg-gray-200 rounded"></div>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (campaignError) {
    return (
      <DashboardLayout userRole="business_client">
        <div className="flex-1 p-8">
          <div className="max-w-7xl mx-auto">
            <Card>
              <CardContent className="flex items-center justify-center py-12">
                <div className="text-center space-y-4">
                  <AlertCircle className="h-12 w-12 text-red-500 mx-auto" />
                  <div className="text-red-500">Failed to load campaign data</div>
                  <div className="text-sm text-gray-600">
                    {campaignError?.message || 'Unknown error occurred'}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (!campaign) {
    return (
      <DashboardLayout userRole="business_client">
        <div className="flex-1 p-8">
          <div className="max-w-7xl mx-auto">
            <Card>
              <CardContent className="flex items-center justify-center py-12">
                <div className="text-center space-y-4">
                  <AlertCircle className="h-12 w-12 text-yellow-500 mx-auto" />
                  <div className="text-lg font-medium">Campaign not found</div>
                  <div className="text-gray-600">
                    The campaign you're looking for doesn't exist or you don't have access to it.
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout userRole="business_client">
      <div className="flex-1 p-8">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* Header */}
          <div>
            <h1 className="text-3xl font-bold text-gray-900">
              Proposals for "{campaign?.title}"
            </h1>
            <p className="text-gray-600 mt-1">
              Review and manage creator applications for your campaign
            </p>
          </div>

          {/* Applications List */}
          <ApplicationsListFixed campaignId={campaignId!} />
        </div>
      </div>
    </DashboardLayout>
  );
};

export default BusinessProposals;
