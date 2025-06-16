
import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import DashboardLayout from '@/components/DashboardLayout';
import { useCampaign } from '@/hooks/useCampaigns';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Edit, Calendar, DollarSign, Users, Target, FileText, Palette, MessageSquare } from 'lucide-react';
import { format } from 'date-fns';

const CampaignDetailsPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { campaign, isLoading, error } = useCampaign(id!);

  if (isLoading) {
    return (
      <DashboardLayout userRole="business_client">
        <div className="flex-1 p-6">
          <div className="max-w-4xl mx-auto">
            <div className="animate-pulse space-y-6">
              <div className="h-8 bg-gray-200 rounded w-1/3"></div>
              <div className="h-64 bg-gray-200 rounded"></div>
              <div className="h-32 bg-gray-200 rounded"></div>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (error || !campaign) {
    return (
      <DashboardLayout userRole="business_client">
        <div className="flex-1 p-6">
          <div className="max-w-4xl mx-auto">
            <div className="text-center py-12">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">Campaign Not Found</h2>
              <p className="text-gray-600 mb-6">The campaign you're looking for doesn't exist or has been deleted.</p>
              <Button onClick={() => navigate('/dashboard/business/campaigns')}>
                Back to Campaigns
              </Button>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'draft': return 'bg-gray-100 text-gray-800';
      case 'published': return 'bg-blue-100 text-blue-800';
      case 'active': return 'bg-green-100 text-green-800';
      case 'completed': return 'bg-purple-100 text-purple-800';
      case 'cancelled': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const formatBudget = () => {
    if (campaign.budget_min && campaign.budget_max) {
      return `$${campaign.budget_min} - $${campaign.budget_max}`;
    }
    if (campaign.budget_min) {
      return `From $${campaign.budget_min}`;
    }
    if (campaign.budget_max) {
      return `Up to $${campaign.budget_max}`;
    }
    return 'Budget TBD';
  };

  return (
    <DashboardLayout userRole="business_client">
      <div className="flex-1 p-6">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate('/dashboard/business/campaigns')}
                className="flex items-center gap-2"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to Campaigns
              </Button>
              <div>
                <h1 className="text-3xl font-bold text-gray-900">{campaign.title}</h1>
                <div className="flex items-center gap-2 mt-2">
                  <Badge className={getStatusColor(campaign.status)}>
                    {campaign.status.charAt(0).toUpperCase() + campaign.status.slice(1)}
                  </Badge>
                  <span className="text-gray-500 text-sm">
                    Created {format(new Date(campaign.created_at), 'MMM dd, yyyy')}
                  </span>
                </div>
              </div>
            </div>
            <Button
              onClick={() => navigate(`/dashboard/business/campaigns/${campaign.id}/edit`)}
              className="flex items-center gap-2"
            >
              <Edit className="h-4 w-4" />
              Edit Campaign
            </Button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Main Content */}
            <div className="lg:col-span-2 space-y-6">
              {/* Campaign Overview */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    Campaign Overview
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {campaign.description && (
                    <div>
                      <h4 className="font-medium mb-2">Description</h4>
                      <p className="text-gray-600">{campaign.description}</p>
                    </div>
                  )}
                  
                  {campaign.goals && (
                    <div>
                      <h4 className="font-medium mb-2 flex items-center gap-2">
                        <Target className="h-4 w-4" />
                        Goals
                      </h4>
                      <p className="text-gray-600">{campaign.goals}</p>
                    </div>
                  )}

                  {campaign.style && (
                    <div>
                      <h4 className="font-medium mb-2 flex items-center gap-2">
                        <Palette className="h-4 w-4" />
                        Style & Tone
                      </h4>
                      <div className="flex gap-2">
                        <Badge variant="outline">{campaign.style}</Badge>
                        {campaign.tone && <Badge variant="outline">{campaign.tone}</Badge>}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Deliverables */}
              {campaign.deliverables && campaign.deliverables.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>Deliverables ({campaign.deliverables.length})</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {campaign.deliverables.map((deliverable, index) => (
                        <div key={index} className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                          <FileText className="h-4 w-4 text-gray-500" />
                          <span className="text-sm">{deliverable}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Applications & Collaborations */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <MessageSquare className="h-5 w-5" />
                    Applications & Collaborations
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-center py-8 text-gray-500">
                    <MessageSquare className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                    <p>No applications received yet</p>
                    <p className="text-sm">Applications will appear here when creators apply to your campaign</p>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              {/* Campaign Details */}
              <Card>
                <CardHeader>
                  <CardTitle>Campaign Details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-gray-500" />
                    <div>
                      <p className="text-sm text-gray-600">Budget</p>
                      <p className="font-medium">{formatBudget()}</p>
                    </div>
                  </div>

                  {campaign.deadline && (
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-gray-500" />
                      <div>
                        <p className="text-sm text-gray-600">Deadline</p>
                        <p className="font-medium">{format(new Date(campaign.deadline), 'MMM dd, yyyy')}</p>
                      </div>
                    </div>
                  )}

                  {campaign.platforms && campaign.platforms.length > 0 && (
                    <div className="flex items-start gap-2">
                      <Users className="h-4 w-4 text-gray-500 mt-1" />
                      <div>
                        <p className="text-sm text-gray-600 mb-2">Platforms</p>
                        <div className="flex flex-wrap gap-1">
                          {campaign.platforms.map((platform) => (
                            <Badge key={platform} variant="secondary" className="text-xs">
                              {platform}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Media & Assets */}
              <Card>
                <CardHeader>
                  <CardTitle>Media & Assets</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-center py-6 text-gray-500">
                    <FileText className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                    <p className="text-sm">No media uploaded yet</p>
                    <Button variant="outline" size="sm" className="mt-2">
                      Upload Files
                    </Button>
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

export default CampaignDetailsPage;
