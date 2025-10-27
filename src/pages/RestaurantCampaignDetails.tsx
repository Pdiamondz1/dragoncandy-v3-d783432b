import React, { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import DashboardLayout from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  ArrowLeft, 
  Calendar, 
  DollarSign, 
  MapPin, 
  Target, 
  Users,
  MessageSquare,
  CheckCircle2,
  XCircle,
  Clock,
  Sparkles
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import ApplicationCard from '@/components/campaigns/ApplicationCard';
import SponsorshipProposalCard from '@/components/campaigns/SponsorshipProposalCard';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/hooks/use-toast';
import { useEmailNotifications } from '@/hooks/useEmailNotifications';

const RestaurantCampaignDetails = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { sendNotification } = useEmailNotifications();

  // Fetch campaign for ownership check
  const { data: campaign, isLoading: campaignLoading } = useQuery({
    queryKey: ['campaign', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('campaigns')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const handleAcceptSponsorship = useMutation({
    mutationFn: async (proposalId: string) => {
      const { data, error } = await supabase
        .from('campaign_sponsorships')
        .update({ status: 'accepted' })
        .eq('id', proposalId)
        .select('*, brand_id!inner(business_name, user_id)')
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: async (data) => {
      queryClient.invalidateQueries({ queryKey: ['campaign_sponsorships', id] });
      
      // Send email notification to brand
      try {
        const { data: campaign } = await supabase
          .from('campaigns')
          .select('title')
          .eq('id', id)
          .single();

        const { data: brandUser } = await supabase
          .from('profiles')
          .select('email, full_name')
          .eq('id', (data.brand_id as any)?.user_id)
          .maybeSingle();

        if (brandUser?.email && campaign) {
          await sendNotification(
            'sponsorship_status',
            brandUser.email,
            brandUser.full_name || (data.brand_id as any)?.business_name || 'Brand Partner',
            {
              campaignTitle: campaign.title,
              proposalStatus: 'accepted',
              sponsorshipAmount: data.sponsorship_amount,
            }
          );
        }
      } catch (error) {
        console.error('Failed to send email notification:', error);
        // Don't block the success flow if email fails
      }

      toast({
        title: 'Sponsorship accepted',
        description: 'The brand sponsor has been notified.',
      });
    },
    onError: (error) => {
      console.error('Error accepting sponsorship:', error);
      toast({
        title: 'Failed to accept sponsorship',
        description: 'Please try again later.',
        variant: 'destructive',
      });
    },
  });

  const handleRejectSponsorship = useMutation({
    mutationFn: async (proposalId: string) => {
      const { data, error } = await supabase
        .from('campaign_sponsorships')
        .update({ status: 'rejected' })
        .eq('id', proposalId)
        .select('*, brand_id!inner(business_name, user_id)')
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: async (data) => {
      queryClient.invalidateQueries({ queryKey: ['campaign_sponsorships', id] });
      
      // Send email notification to brand
      try {
        const { data: campaign } = await supabase
          .from('campaigns')
          .select('title')
          .eq('id', id)
          .single();

        const { data: brandUser } = await supabase
          .from('profiles')
          .select('email, full_name')
          .eq('id', (data.brand_id as any)?.user_id)
          .maybeSingle();

        if (brandUser?.email && campaign) {
          await sendNotification(
            'sponsorship_status',
            brandUser.email,
            brandUser.full_name || (data.brand_id as any)?.business_name || 'Brand Partner',
            {
              campaignTitle: campaign.title,
              proposalStatus: 'rejected',
            }
          );
        }
      } catch (error) {
        console.error('Failed to send email notification:', error);
        // Don't block the success flow if email fails
      }

      toast({
        title: 'Sponsorship rejected',
        description: 'The brand sponsor has been notified.',
      });
    },
    onError: (error) => {
      console.error('Error rejecting sponsorship:', error);
      toast({
        title: 'Failed to reject sponsorship',
        description: 'Please try again later.',
        variant: 'destructive',
      });
    },
  });

  // Ownership check - redirect if not owner
  useEffect(() => {
    if (campaign && user && campaign.user_id !== user.id) {
      toast({
        title: 'Access Denied',
        description: 'You do not have permission to view this campaign.',
        variant: 'destructive',
      });
      navigate('/dashboard/business/campaigns');
    }
  }, [campaign, user, navigate]);

  const { data: sponsorships, isLoading: sponsorshipsLoading } = useQuery({
    queryKey: ['campaign_sponsorships', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('campaign_sponsorships')
        .select(`
          *,
          brand:brand_id (
            business_name,
            logo_url,
            brand_category,
            description
          )
        `)
        .eq('campaign_id', id);

      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const { data: applications, isLoading: applicationsLoading } = useQuery({
    queryKey: ['campaign_applications', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('campaign_applications')
        .select(`
          *,
          creator:creator_id (
            creator_name,
            avatar_url,
            bio,
            skills,
            portfolio_urls
          )
        `)
        .eq('campaign_id', id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  if (campaignLoading) {
    return (
      <DashboardLayout userRole="business_client">
        <div className="p-8 max-w-7xl mx-auto">
          <Skeleton className="h-8 w-64 mb-4" />
          <Skeleton className="h-64 w-full mb-4" />
          <Skeleton className="h-96 w-full" />
        </div>
      </DashboardLayout>
    );
  }

  if (!campaign) {
    return (
      <DashboardLayout userRole="business_client">
        <div className="p-8 max-w-7xl mx-auto text-center">
          <p className="text-muted-foreground">Campaign not found</p>
        </div>
      </DashboardLayout>
    );
  }

  // If not owner, show nothing while redirecting
  if (campaign && user && campaign.user_id !== user.id) {
    return null;
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'accepted':
        return 'bg-green-500/10 text-green-700 border-green-500/20';
      case 'pending':
        return 'bg-yellow-500/10 text-yellow-700 border-yellow-500/20';
      case 'rejected':
        return 'bg-red-500/10 text-red-700 border-red-500/20';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'accepted':
        return <CheckCircle2 className="h-4 w-4" />;
      case 'pending':
        return <Clock className="h-4 w-4" />;
      case 'rejected':
        return <XCircle className="h-4 w-4" />;
      default:
        return null;
    }
  };

  const pendingSponsorships = sponsorships?.filter(s => s.status === 'pending') || [];
  const acceptedSponsorships = sponsorships?.filter(s => s.status === 'accepted') || [];

  return (
    <DashboardLayout userRole="business_client">
      <div className="p-8 max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate('/dashboard/business/campaigns')}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-foreground">{campaign.title}</h1>
            <p className="text-muted-foreground">Campaign Details & Management</p>
          </div>
          <Badge className={getStatusColor(campaign.status)}>
            {campaign.status}
          </Badge>
        </div>

        {/* Campaign Overview */}
        <Card>
          <CardHeader>
            <CardTitle>Campaign Overview</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">{campaign.description}</p>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="flex items-center gap-2">
                <DollarSign className="h-5 w-5 text-primary" />
                <div>
                  <p className="text-sm text-muted-foreground">Budget</p>
                  <p className="font-semibold">
                    ${campaign.budget_min?.toLocaleString()} - ${campaign.budget_max?.toLocaleString()}
                  </p>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-primary" />
                <div>
                  <p className="text-sm text-muted-foreground">Deadline</p>
                  <p className="font-semibold">
                    {campaign.deadline ? new Date(campaign.deadline).toLocaleDateString() : 'Not set'}
                  </p>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                <Target className="h-5 w-5 text-primary" />
                <div>
                  <p className="text-sm text-muted-foreground">Platforms</p>
                  <p className="font-semibold">
                    {campaign.platforms?.join(', ') || 'Not specified'}
                  </p>
                </div>
              </div>
            </div>

            {campaign.open_for_sponsorship && (
              <div className="flex items-center gap-2 p-3 bg-primary/10 rounded-lg border border-primary/20">
                <Sparkles className="h-5 w-5 text-primary" />
                <span className="text-sm font-medium text-primary">Open for Brand Sponsorships</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Tabs */}
        <Tabs defaultValue="sponsorships" className="space-y-4">
          <TabsList>
            <TabsTrigger value="sponsorships">
              Brand Sponsorships ({sponsorships?.length || 0})
            </TabsTrigger>
            <TabsTrigger value="applications">
              Creator Applications ({applications?.length || 0})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="sponsorships" className="space-y-4">
            {sponsorshipsLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-48 w-full" />
                <Skeleton className="h-48 w-full" />
              </div>
            ) : sponsorships && sponsorships.length > 0 ? (
              <>
                {pendingSponsorships.length > 0 && (
                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold flex items-center gap-2">
                      <Clock className="h-5 w-5 text-yellow-600" />
                      Pending Proposals ({pendingSponsorships.length})
                    </h3>
                    {pendingSponsorships.map((sponsorship) => (
                      <SponsorshipProposalCard
                        key={sponsorship.id}
                        proposal={sponsorship as any}
                        onAccept={handleAcceptSponsorship.mutate}
                        onReject={handleRejectSponsorship.mutate}
                      />
                    ))}
                  </div>
                )}

                {acceptedSponsorships.length > 0 && (
                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold flex items-center gap-2">
                      <CheckCircle2 className="h-5 w-5 text-green-600" />
                      Accepted Sponsorships ({acceptedSponsorships.length})
                    </h3>
                    {acceptedSponsorships.map((sponsorship) => (
                      <SponsorshipProposalCard
                        key={sponsorship.id}
                        proposal={sponsorship as any}
                        onAccept={handleAcceptSponsorship.mutate}
                        onReject={handleRejectSponsorship.mutate}
                      />
                    ))}
                  </div>
                )}
              </>
            ) : (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Users className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No Sponsorship Proposals Yet</h3>
                  <p className="text-sm text-muted-foreground text-center max-w-md">
                    Brands will be able to submit sponsorship proposals once your campaign is published
                    and marked as open for sponsorship.
                  </p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="applications" className="space-y-4">
            {applicationsLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-64 w-full" />
                <Skeleton className="h-64 w-full" />
              </div>
            ) : applications && applications.length > 0 ? (
              <div className="space-y-4">
                {applications.map((application) => {
                  const hasAcceptedSponsorship = sponsorships?.some(s => s.status === 'accepted');
                  return (
                    <ApplicationCard
                      key={application.id}
                      application={application as any}
                      showActions={true}
                      isSponsored={hasAcceptedSponsorship}
                      userRole={hasAcceptedSponsorship ? "restaurant" : undefined}
                    />
                  );
                })}
              </div>
            ) : (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Users className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No Applications Yet</h3>
                  <p className="text-sm text-muted-foreground text-center max-w-md">
                    Creators will be able to apply to your campaign once it's published.
                  </p>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default RestaurantCampaignDetails;
