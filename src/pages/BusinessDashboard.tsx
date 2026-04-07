// src/pages/BusinessDashboard.tsx
import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import DashboardLayout from '@/components/DashboardLayout';
import { Loader2, ChevronRight } from 'lucide-react';
import { ActivityFeedCard } from '@/components/dashboard/ActivityFeedCard';
import { useBusinessActiveCampaigns } from '@/hooks/useBusinessActiveCampaigns';
import donnyIcon from '@/assets/Donny_icon.png';

function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'No deadline';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const BusinessDashboard = () => {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const { data: campaigns, isLoading: campaignsLoading } = useBusinessActiveCampaigns();

  if (!profile) {
    return <div>Loading...</div>;
  }

  const recentCampaigns = campaigns?.slice(0, 3) ?? [];
  const hasMore = (campaigns?.length ?? 0) > 3;

  return (
    <DashboardLayout userRole="business_client">
      <div className="min-h-screen bg-white overflow-x-hidden">
        <div className="px-4 pt-8 pb-24 md:pb-0">
          <div className="max-w-2xl lg:max-w-5xl mx-auto">

            {/* Desktop: 2-col grid; Mobile: stacked */}
            <div className="lg:grid lg:grid-cols-2 lg:gap-12 lg:items-start">

              {/* HERO — Create a Campaign with Donny */}
              <div className="flex flex-col items-center text-center lg:sticky lg:top-20 py-8 lg:py-16">
                <img
                  src={donnyIcon}
                  alt="Donny"
                  className="w-20 h-20 rounded-full object-cover shadow-[0_0_12px_rgba(77,217,192,0.5)] mb-6"
                />
                <h1 className="text-2xl font-bold text-gray-900 mb-2">
                  Ready to grow, {profile.full_name || 'there'}?
                </h1>
                <p className="text-gray-500 text-sm mb-6 max-w-xs">
                  Launch a campaign and let Donny match you with the perfect creators.
                </p>
                <Link
                  to="/dashboard/business/campaigns/create"
                  className="inline-flex items-center justify-center w-full max-w-xs rounded-full bg-dc-teal hover:bg-dc-teal/90 text-white font-semibold py-3 px-6 text-base transition-colors"
                >
                  Create a Campaign with Donny
                </Link>
              </div>

              {/* LIVE STATE — Active campaigns */}
              <div className="py-8 lg:py-16">
                <div className="flex items-center justify-between mb-3">
                  <p className="font-sans text-sm font-bold uppercase tracking-wide text-dc-teal">
                    Your Active Campaigns
                  </p>
                  {hasMore && (
                    <Link
                      to="/business/campaigns"
                      className="text-xs font-semibold text-dc-teal hover:underline flex items-center gap-0.5"
                    >
                      View all <ChevronRight className="w-3 h-3" />
                    </Link>
                  )}
                </div>

                {campaignsLoading ? (
                  <div className="border-2 border-dc-teal rounded-2xl p-6 bg-white flex items-center justify-center">
                    <Loader2 className="w-5 h-5 text-dc-teal animate-spin" />
                  </div>
                ) : recentCampaigns.length === 0 ? (
                  <div className="border-2 border-dc-teal rounded-2xl p-6 bg-white text-center">
                    <p className="text-sm text-gray-500">No active campaigns yet.</p>
                    <button
                      onClick={() => navigate('/dashboard/business/campaigns/create')}
                      className="text-sm font-semibold text-dc-teal hover:underline mt-1"
                    >
                      Let Donny help you create one
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {recentCampaigns.map((campaign) => (
                      <ActivityFeedCard
                        key={campaign.id}
                        title={campaign.title}
                        subtitle={`${campaign.creatorName ? `@${campaign.creatorName}` : 'Unassigned'} · Due ${formatDate(campaign.deadline)}`}
                        status={campaign.status}
                        onClick={() => navigate(`/dashboard/business/campaigns/${campaign.id}`)}
                      />
                    ))}
                    {hasMore && (
                      <Link
                        to="/business/campaigns"
                        className="block text-center text-sm font-semibold text-dc-teal hover:underline pt-1"
                      >
                        View all campaigns
                      </Link>
                    )}
                  </div>
                )}
              </div>

            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default BusinessDashboard;
