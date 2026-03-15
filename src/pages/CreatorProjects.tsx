
import React from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '@/components/DashboardLayout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { AlertCircle } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import ProjectStatsCards from '@/components/projects/ProjectStatsCards';
import ProjectList from '@/components/projects/ProjectList';
import CreatorPayoutBanner from '@/components/projects/CreatorPayoutBanner';
import { useToast } from '@/hooks/use-toast';

interface ProjectCollaboration {
  id: string;
  campaign_id: string;
  creator_id: string;
  status: 'active' | 'completed' | 'cancelled';
  contract_details?: any;
  milestones?: any;
  deliverables_status?: any;
  business_completion_status?: string;
  creator_completion_status?: string;
  completed_at?: string | null;
  created_at: string;
  updated_at: string;
  // DragonDash timer fields
  content_started_at?: string | null;
  content_deadline?: string | null;
  content_status?: string | null;
  campaigns: {
    title: string;
    description?: string;
    deadline?: string;
    budget_min?: number;
    budget_max?: number;
    fixed_price?: number;
    pricing_type?: string;
    delivery_type?: string;
    deliverables?: string[];
  };
}

const CreatorProjects: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const { data: projects = [], isLoading, error } = useQuery({
    queryKey: ['creator-projects', user?.id],
    queryFn: async () => {
      console.log('Fetching projects for creator:', user?.id);
      const { data, error } = await supabase
        .from('campaign_collaborations')
        .select(`
          *,
          campaigns!campaign_id (
            title,
            description,
            deadline,
            budget_min,
            budget_max,
            fixed_price,
            pricing_type,
            delivery_type,
            deliverables
          )
        `)
        .eq('creator_id', user!.id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching projects:', error);
        throw error;
      }

      console.log('Fetched projects:', data);
      return data as ProjectCollaboration[];
    },
    enabled: !!user,
  });

  const activeProjects = projects.filter(project => project.status === 'active');
  const completedProjects = projects.filter(project => project.status === 'completed');

  const handleMessageClick = async (campaignId: string) => {
    try {
      // Get the business owner's user_id from the campaign
      const { data: campaignData, error: campaignError } = await supabase
        .from('campaigns')
        .select('user_id')
        .eq('id', campaignId)
        .single();

      if (campaignError || !campaignData) {
        throw new Error('Could not find campaign');
      }

      if (!user) {
        toast({
          title: "Authentication required",
          description: "Please log in to send messages.",
          variant: "destructive"
        });
        return;
      }

      // Create or get direct conversation with the business owner
      const { data: conversationId, error: conversationError } = await supabase.rpc(
        'create_or_get_direct_conversation',
        {
          user1_uuid: user.id,
          user2_uuid: campaignData.user_id
        }
      );

      if (conversationError) throw conversationError;

      // Navigate directly to the DM conversation
      navigate(`/dashboard/creator/messages/direct/${conversationId}`);
    } catch (error) {
      console.error('Failed to open conversation:', error);
      toast({
        title: "Error",
        description: "Failed to open conversation. Please try again.",
        variant: "destructive"
      });
    }
  };

  if (isLoading) {
    return (
      <DashboardLayout userRole="content_creator">
        <div className="flex-1 p-8">
          <div className="max-w-7xl mx-auto space-y-6">
            <div className="animate-pulse space-y-6">
              <div className="h-8 bg-gray-200 rounded w-1/3"></div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-32 bg-gray-200 rounded"></div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (error) {
    return (
      <DashboardLayout userRole="content_creator">
        <div className="flex-1 p-8">
          <div className="max-w-7xl mx-auto">
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <AlertCircle className="h-12 w-12 text-red-400 mb-4" />
                <h3 className="text-lg font-semibold text-dc-teal mb-2">
                  Failed to load projects
                </h3>
                <p className="text-muted-foreground">
                  There was an error loading your projects.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout userRole="content_creator">
      <div className="flex-1 p-8">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* Payout Banner */}
          {user && <CreatorPayoutBanner creatorId={user.id} />}

          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-extrabold text-dc-teal uppercase">My Projects</h1>
              <p className="text-muted-foreground">Manage your active campaigns and track deliverables</p>
            </div>
          </div>

          {/* Stats Cards */}
          <ProjectStatsCards projects={projects} />

          {/* Projects Tabs */}
          <Tabs defaultValue="active" className="space-y-6">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="active">Active ({activeProjects.length})</TabsTrigger>
              <TabsTrigger value="completed">Completed ({completedProjects.length})</TabsTrigger>
              <TabsTrigger value="all">All Projects ({projects.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="active" className="space-y-4">
              <ProjectList 
                projects={activeProjects} 
                showProgress={true} 
                onMessageClick={handleMessageClick}
              />
            </TabsContent>

            <TabsContent value="completed" className="space-y-4">
              <ProjectList 
                projects={completedProjects} 
                showProgress={false} 
                onMessageClick={handleMessageClick}
              />
            </TabsContent>

            <TabsContent value="all" className="space-y-4">
              <ProjectList 
                projects={projects} 
                showProgress={true} 
                onMessageClick={handleMessageClick}
              />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default CreatorProjects;
