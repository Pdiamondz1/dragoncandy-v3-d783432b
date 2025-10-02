import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Users, ExternalLink, DollarSign, Calendar } from 'lucide-react';
import { useCampaignApplications } from '@/hooks/useCampaignApplications';
import { Skeleton } from '@/components/ui/skeleton';

interface CreatorApplicationsCardProps {
  campaignId: string;
}

export const CreatorApplicationsCard = ({ campaignId }: CreatorApplicationsCardProps) => {
  const { data: applications, isLoading } = useCampaignApplications(campaignId);

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
              <div key={application.id} className="flex items-start gap-4 p-4 border rounded-lg hover:bg-muted/50 transition-colors">
                <Avatar className="h-12 w-12">
                  <AvatarImage 
                    src={application.creator_profile?.avatar_url || undefined} 
                    alt={application.creator_profile?.creator_name || 'Creator'} 
                  />
                  <AvatarFallback>
                    {application.creator_profile?.creator_name?.substring(0, 2).toUpperCase() || 'CR'}
                  </AvatarFallback>
                </Avatar>

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
                    <p className="text-sm text-muted-foreground bg-muted p-2 rounded">
                      {application.intro_message}
                    </p>
                  )}

                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="mt-2"
                    onClick={() => {
                      // Navigate to public creator profile
                      const creatorId = application.creator_id;
                      window.open(`/profile/creator/${creatorId}`, '_blank');
                    }}
                  >
                    View Creator Profile
                    <ExternalLink className="h-3 w-3 ml-2" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
