import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ResolvedAvatar } from '@/components/ui/resolved-avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Users, ExternalLink, DollarSign, Calendar } from 'lucide-react';
import { useCampaignApplications } from '@/hooks/useFetchApplications';
import { Skeleton } from '@/components/ui/skeleton';
import { JointApprovalCard } from './JointApprovalCard';
import { CampaignApplication } from '@/types/applications';
import { useCampaign } from '@/hooks/useCampaigns';
import { useAuth } from '@/hooks/useAuth';
import { useCampaignSponsorship } from '@/hooks/useCampaignSponsorship';
import { BRAND_ROLE_ENABLED } from '@/lib/featureConfig';

interface CreatorApplicationsCardProps {
  campaignId: string;
}

export const CreatorApplicationsCard = ({ campaignId }: CreatorApplicationsCardProps) => {
  const { data: applications, isLoading } = useCampaignApplications(campaignId);
  const { campaign } = useCampaign(campaignId);
  const { profile } = useAuth();
  
  // Check if campaign has an active sponsorship
  const { data: activeSponsorshipData } = useCampaignSponsorship(campaignId);
  const hasActiveSponsor = !!activeSponsorshipData;

  // Determine user role based on profile and campaign ownership
  const getUserRole = (): 'brand' | 'restaurant' | undefined => {
    if (!profile || !campaign) return undefined;
    
    // If user is the campaign owner, they're the restaurant
    if (campaign.user_id === profile.id) return 'restaurant';
    
    // Otherwise, they're viewing as a brand (sponsor)
    return 'brand';
  };

  const userRole = getUserRole();
  
  // Only consider it sponsored if campaign is open for sponsorship AND has an accepted sponsor
  const isSponsored = (BRAND_ROLE_ENABLED && campaign?.open_for_sponsorship && hasActiveSponsor) || false;

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent className="space-y-4">
          {[1, 2].map((i) => (
            <div key={i} className="flex items-start gap-4 p-4 border rounded-lg">
              <Skeleton className="h-12 w-12 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-4 w-full" />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  const applicationCount = applications?.length || 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Creator Applications
          </span>
          <Badge variant="secondary">
            {applicationCount} {applicationCount === 1 ? 'Application' : 'Applications'}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {applicationCount === 0 ? (
          <div className="text-center py-8">
            <Users className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">
              No creator applications yet. Check back soon!
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {applications?.map((application) => (
              <div key={application.id} className="flex items-start gap-4 p-4 border rounded-lg hover:bg-dc-teal/[0.04] transition-colors">
                <ResolvedAvatar
                  path={application.creator_profile?.avatar_url}
                  alt={application.creator_profile?.creator_name || 'Creator'}
                  fallback={application.creator_profile?.creator_name?.substring(0, 2).toUpperCase() || 'CR'}
                  className="h-12 w-12"
                />

                <div className="flex-1 space-y-2">
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="font-medium">{application.creator_profile?.creator_name || 'Unknown Creator'}</h4>
                      <Badge variant={
                        application.status === 'accepted' ? 'default' :
                        application.status === 'rejected' ? 'destructive' : 'secondary'
                      } className="mt-1">
                        {application.status}
                      </Badge>
                    </div>
                  </div>

                  {application.creator_profile?.bio && (
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {application.creator_profile.bio}
                    </p>
                  )}

                  <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                    {application.proposed_rate && (
                      <span className="flex items-center gap-1">
                        <DollarSign className="h-3 w-3" />
                        ${application.proposed_rate.toLocaleString()}
                      </span>
                    )}
                    {application.proposed_timeline && (
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {application.proposed_timeline}
                      </span>
                    )}
                  </div>

                  {application.intro_message && (
                    <p className="text-sm text-muted-foreground bg-dc-teal/[0.04] p-2 rounded">
                      {application.intro_message}
                    </p>
                  )}

                  <div className="space-y-3 mt-3">
                    {isSponsored && userRole && application.status === 'pending' && (
                      <JointApprovalCard
                        application={application as CampaignApplication & { brand_approval_status?: string; restaurant_approval_status?: string; final_approval_status?: string }}
                        userRole={userRole}
                      />
                    )}
                    
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="w-full"
                      onClick={() => {
                        // Navigate to public creator profile
                        const creatorId = application.creator_id;
                        window.open(`/creator/${creatorId}`, '_blank');
                      }}
                    >
                      View Creator Profile
                      <ExternalLink className="h-3 w-3 ml-2" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
