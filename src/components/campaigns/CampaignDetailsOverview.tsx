
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Calendar, DollarSign, Target, Palette, Volume2, Package, Hash, Globe, Users, Shield, Lock, UserCheck } from 'lucide-react';
import { Campaign } from '@/hooks/useCampaignQueries';
import CampaignAnalysisDisplay from './CampaignAnalysisDisplay';

interface CampaignDetailsOverviewProps {
  campaign: Campaign;
}

const CampaignDetailsOverview: React.FC<CampaignDetailsOverviewProps> = ({ campaign }) => {
  const formatCurrency = (amount: number | null) => {
    if (!amount) return 'Not specified';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Not specified';
    return new Date(dateString).toLocaleDateString();
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5" />
            Campaign Overview
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h3 className="font-semibold text-lg mb-2">{campaign.title}</h3>
            {campaign.description && (
              <p className="text-muted-foreground text-sm mb-4">{campaign.description}</p>
            )}
            <Badge variant={campaign.status === 'published' ? 'default' : 'secondary'}>
              {campaign.status.charAt(0).toUpperCase() + campaign.status.slice(1)}
            </Badge>
          </div>

          {campaign.goals && (
            <div>
              <h4 className="font-medium mb-2">Goals</h4>
              <p className="text-sm text-muted-foreground">{campaign.goals}</p>
            </div>
          )}

          {campaign.platforms && campaign.platforms.length > 0 && (
            <div>
              <h4 className="font-medium mb-2">Platforms</h4>
              <div className="flex flex-wrap gap-2">
                {campaign.platforms.map((platform, index) => (
                  <Badge key={index} variant="outline">{platform}</Badge>
                ))}
              </div>
            </div>
          )}

          {campaign.deliverables && campaign.deliverables.length > 0 && (
            <div>
              <h4 className="font-medium mb-2 flex items-center gap-2">
                <Package className="h-4 w-4" />
                Deliverables
              </h4>
              <div className="flex flex-wrap gap-2">
                {campaign.deliverables.map((deliverable, index) => (
                  <Badge key={index} variant="outline">{deliverable}</Badge>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Campaign Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <DollarSign className="h-5 w-5 text-green-600" />
            <div>
              <p className="font-medium">Budget Range</p>
              <p className="text-sm text-muted-foreground">
                {formatCurrency(campaign.budget_min)} - {formatCurrency(campaign.budget_max)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Calendar className="h-5 w-5 text-blue-600" />
            <div>
              <p className="font-medium">Deadline</p>
              <p className="text-sm text-muted-foreground">{formatDate(campaign.deadline)}</p>
            </div>
          </div>

          {campaign.style && (
            <div className="flex items-center gap-3">
              <Palette className="h-5 w-5 text-purple-600" />
              <div>
                <p className="font-medium">Style</p>
                <p className="text-sm text-muted-foreground capitalize">{campaign.style}</p>
              </div>
            </div>
          )}

          {campaign.tone && (
            <div className="flex items-center gap-3">
              <Volume2 className="h-5 w-5 text-orange-600" />
              <div>
                <p className="font-medium">Tone</p>
                <p className="text-sm text-muted-foreground capitalize">{campaign.tone}</p>
              </div>
            </div>
          )}

          {campaign.campaign_type && (
            <div className="flex items-center gap-3">
              <Target className="h-5 w-5 text-dc-teal" />
              <div>
                <p className="font-medium">Campaign Type</p>
                <p className="text-sm text-muted-foreground capitalize">{campaign.campaign_type.replace(/_/g, ' ')}</p>
              </div>
            </div>
          )}

          {campaign.per_creator_cap != null && (
            <div className="flex items-center gap-3">
              <UserCheck className="h-5 w-5 text-dc-teal" />
              <div>
                <p className="font-medium">Per-Creator Cap</p>
                <p className="text-sm text-muted-foreground">${campaign.per_creator_cap}</p>
              </div>
            </div>
          )}

          {campaign.usage_rights_days != null && (
            <div className="flex items-center gap-3">
              <Shield className="h-5 w-5 text-dc-teal" />
              <div>
                <p className="font-medium">Usage Rights</p>
                <p className="text-sm text-muted-foreground">{campaign.usage_rights_days} days</p>
              </div>
            </div>
          )}

          {campaign.exclusivity_days != null && (
            <div className="flex items-center gap-3">
              <Lock className="h-5 w-5 text-dc-teal" />
              <div>
                <p className="font-medium">Exclusivity</p>
                <p className="text-sm text-muted-foreground">{campaign.exclusivity_days} days</p>
              </div>
            </div>
          )}

          {campaign.geographic_scope && (
            <div className="flex items-center gap-3">
              <Globe className="h-5 w-5 text-dc-teal" />
              <div>
                <p className="font-medium">Geographic Scope</p>
                <p className="text-sm text-muted-foreground capitalize">{campaign.geographic_scope}</p>
              </div>
            </div>
          )}

          {campaign.creator_count != null && (
            <div className="flex items-center gap-3">
              <Users className="h-5 w-5 text-dc-teal" />
              <div>
                <p className="font-medium">Target Creators</p>
                <p className="text-sm text-muted-foreground">{campaign.creator_count}</p>
              </div>
            </div>
          )}

          {campaign.target_creator_personas && campaign.target_creator_personas.length > 0 && (
            <div>
              <h4 className="font-medium mb-2">Target Audience</h4>
              <div className="flex flex-wrap gap-2">
                {campaign.target_creator_personas.map((persona, index) => (
                  <Badge key={index} variant="outline" className="capitalize">{persona}</Badge>
                ))}
              </div>
            </div>
          )}

          {campaign.hashtag_requirements && (
            <div className="flex items-center gap-3">
              <Hash className="h-5 w-5 text-dc-teal" />
              <div>
                <p className="font-medium">Hashtags</p>
                <p className="text-sm text-teal-600">{campaign.hashtag_requirements}</p>
              </div>
            </div>
          )}

          {campaign.tagline && (
            <div>
              <h4 className="font-medium mb-1">Tagline</h4>
              <p className="text-sm text-muted-foreground italic">{campaign.tagline}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Full AI Analysis — spans full width below the grid */}
      {campaign.ai_analysis && (
        <div className="lg:col-span-2">
          <CampaignAnalysisDisplay analysis={campaign.ai_analysis} />
        </div>
      )}
    </div>
  );
};

export default CampaignDetailsOverview;
