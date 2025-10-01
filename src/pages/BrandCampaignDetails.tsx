import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useCampaign } from '@/hooks/useCampaigns';
import DashboardLayout from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { 
  ArrowLeft, 
  MapPin, 
  Calendar, 
  DollarSign, 
  Target, 
  FileText,
  Building2,
  Loader2
} from 'lucide-react';
import { format } from 'date-fns';

const BrandCampaignDetails = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { campaign, isLoading } = useCampaign(id || '');

  if (!profile) {
    return <div>Loading...</div>;
  }

  if (isLoading) {
    return (
      <DashboardLayout userRole="brand">
        <div className="flex items-center justify-center h-screen">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  if (!campaign) {
    return (
      <DashboardLayout userRole="brand">
        <div className="p-8 text-center">
          <h2 className="text-2xl font-bold mb-4">Campaign Not Found</h2>
          <Button onClick={() => navigate('/dashboard/brand/discover-campaigns')}>
            Back to Discovery
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout userRole="brand">
      <div className="p-8 max-w-5xl mx-auto">
        <Button
          variant="ghost"
          onClick={() => navigate('/dashboard/brand/discover-campaigns')}
          className="mb-6"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Discovery
        </Button>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <CardTitle className="text-3xl mb-2">{campaign.title}</CardTitle>
                  <CardDescription className="text-base flex items-center gap-2">
                    <Building2 className="h-4 w-4" />
                    Restaurant Campaign
                  </CardDescription>
                </div>
                <Badge variant={campaign.open_for_sponsorship ? "default" : "secondary"}>
                  {campaign.open_for_sponsorship ? 'Open for Sponsorship' : 'Not Available'}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {campaign.description && (
                  <div>
                    <h3 className="font-semibold mb-2 flex items-center gap-2">
                      <FileText className="h-4 w-4" />
                      Description
                    </h3>
                    <p className="text-muted-foreground">{campaign.description}</p>
                  </div>
                )}

                <Separator />

                <div className="grid md:grid-cols-2 gap-6">
                  {campaign.budget_min && campaign.budget_max && (
                    <div>
                      <h3 className="font-semibold mb-2 flex items-center gap-2">
                        <DollarSign className="h-4 w-4" />
                        Budget Range
                      </h3>
                      <p className="text-lg font-medium">
                        ${campaign.budget_min.toLocaleString()} - ${campaign.budget_max.toLocaleString()}
                      </p>
                    </div>
                  )}

                  {campaign.deadline && (
                    <div>
                      <h3 className="font-semibold mb-2 flex items-center gap-2">
                        <Calendar className="h-4 w-4" />
                        Deadline
                      </h3>
                      <p className="text-lg font-medium">
                        {format(new Date(campaign.deadline), 'MMMM dd, yyyy')}
                      </p>
                    </div>
                  )}
                </div>

                {campaign.platforms && campaign.platforms.length > 0 && (
                  <div>
                    <h3 className="font-semibold mb-2 flex items-center gap-2">
                      <Target className="h-4 w-4" />
                      Target Platforms
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {campaign.platforms.map((platform, index) => (
                        <Badge key={index} variant="outline">
                          {platform}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {campaign.goals && (
                  <div>
                    <h3 className="font-semibold mb-2">Campaign Goals</h3>
                    <p className="text-muted-foreground">{campaign.goals}</p>
                  </div>
                )}

                {campaign.deliverables && campaign.deliverables.length > 0 && (
                  <div>
                    <h3 className="font-semibold mb-2">Expected Deliverables</h3>
                    <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                      {campaign.deliverables.map((deliverable, index) => (
                        <li key={index}>{deliverable}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <Separator />

                <div className="flex gap-3">
                  {campaign.open_for_sponsorship ? (
                    <Button 
                      size="lg"
                      onClick={() => navigate('/dashboard/brand/discover-campaigns')}
                    >
                      Sponsor This Campaign
                    </Button>
                  ) : (
                    <Button variant="secondary" disabled>
                      Not Available for Sponsorship
                    </Button>
                  )}
                  <Button 
                    variant="outline" 
                    size="lg"
                    onClick={() => navigate('/dashboard/brand/messages')}
                  >
                    Contact Restaurant
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default BrandCampaignDetails;
