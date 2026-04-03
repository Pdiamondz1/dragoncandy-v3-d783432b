
import React from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '@/components/DashboardLayout';
import { ChevronLeft, AlertCircle } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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

      return data as ProjectCollaboration[];
    },
    enabled: !!user,
  });

  const activeProjects = projects.filter(project => project.status === 'active');
  const completedProjects = projects.filter(project => project.status === 'completed');

  const handleMessageClick = async (campaignId: string) => {
    try {
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

      const { data: conversationId, error: conversationError } = await supabase.rpc(
        'create_or_get_direct_conversation',
        {
          user1_uuid: user.id,
          user2_uuid: campaignData.user_id
        }
      );

      if (conversationError) throw conversationError;

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
        <div className="min-h-screen bg-white overflow-x-hidden">
          <div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center">
            <span className="h-5 w-5 bg-gray-200 rounded-full animate-pulse mr-2" />
            <span className="flex-1 h-4 bg-gray-200 rounded-full animate-pulse mx-8" />
          </div>
          <div className="px-4 pt-4 pb-24 md:pb-0 space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="border-2 border-gray-100 rounded-2xl p-4 h-24 animate-pulse bg-gray-50" />
            ))}
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (error) {
    return (
      <DashboardLayout userRole="content_creator">
        <div className="min-h-screen bg-white overflow-x-hidden flex items-center justify-center p-4">
          <div className="border-2 border-dc-teal rounded-2xl p-6 text-center max-w-sm w-full">
            <AlertCircle className="h-10 w-10 text-red-400 mx-auto mb-3" />
            <h3 className="font-bold text-gray-900 mb-2">Failed to load projects</h3>
            <p className="text-gray-500 text-sm">There was an error loading your projects.</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout userRole="content_creator">
      <div className="min-h-screen bg-white overflow-x-hidden md:max-w-4xl md:mx-auto">
        {/* Template B Header */}
        <div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center">
          <button
            onClick={() => navigate(-1)}
            className="text-dc-pink-accent text-lg mr-2 flex items-center"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <h1 className="flex-1 font-sans text-base font-bold text-gray-900 uppercase tracking-wide text-center">
            My Projects
          </h1>
          <div className="w-7" />
        </div>

        {/* Body */}
        <div className="px-4 pt-4 pb-24 md:pb-0 space-y-4">
          {/* Payout Banner */}
          {user && <CreatorPayoutBanner creatorId={user.id} />}

          {/* Stats Cards */}
          <ProjectStatsCards projects={projects} />

          {/* Projects Tabs */}
          <Tabs defaultValue="active" className="space-y-4">
            <TabsList className="grid w-full grid-cols-3 rounded-full bg-gray-100">
              <TabsTrigger value="active" className="rounded-full text-xs font-bold uppercase tracking-wide">
                Active ({activeProjects.length})
              </TabsTrigger>
              <TabsTrigger value="completed" className="rounded-full text-xs font-bold uppercase tracking-wide">
                Done ({completedProjects.length})
              </TabsTrigger>
              <TabsTrigger value="all" className="rounded-full text-xs font-bold uppercase tracking-wide">
                All ({projects.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="active" className="space-y-3">
              <ProjectList
                projects={activeProjects}
                showProgress={true}
                onMessageClick={handleMessageClick}
              />
            </TabsContent>

            <TabsContent value="completed" className="space-y-3">
              <ProjectList
                projects={completedProjects}
                showProgress={false}
                onMessageClick={handleMessageClick}
              />
            </TabsContent>

            <TabsContent value="all" className="space-y-3">
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
