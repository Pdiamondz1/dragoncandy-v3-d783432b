
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

export const useManageApplication = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      applicationId,
      status,
      approvalRole,
    }: {
      applicationId: string;
      status: 'accepted' | 'rejected' | 'counter_offered';
      approvalRole?: 'brand' | 'restaurant';
    }) => {
      if (approvalRole) {
        // Joint approval: set role-specific column, trigger handles final_approval_status
        const column = approvalRole === 'brand'
          ? 'brand_approval_status'
          : 'restaurant_approval_status';
        const approvalStatus = status === 'accepted' ? 'approved' : status === 'rejected' ? 'rejected' : 'pending';

        const { error } = await supabase
          .from('campaign_applications')
          .update({ [column]: approvalStatus })
          .eq('id', applicationId);
        if (error) throw error;

        // Refetch to get the trigger-computed final_approval_status
        const { data: app, error: fetchError } = await supabase
          .from('campaign_applications')
          .select('*, campaigns(title)')
          .eq('id', applicationId)
          .single();
        if (fetchError) throw fetchError;

        // Sync legacy status column when final is resolved
        if (app.final_approval_status === 'approved') {
          const { error: syncError } = await supabase.from('campaign_applications').update({ status: 'accepted' }).eq('id', applicationId);
          if (syncError) throw syncError;
        } else if (app.final_approval_status === 'rejected') {
          const { error: syncError } = await supabase.from('campaign_applications').update({ status: 'rejected' }).eq('id', applicationId);
          if (syncError) throw syncError;
        }

        return app;
      } else {
        // Non-sponsored: direct status update with race guard
        const { data, error } = await supabase
          .from('campaign_applications')
          .update({
            status,
            restaurant_approval_status: status === 'accepted' ? 'approved' : status === 'rejected' ? 'rejected' : 'pending'
          })
          .eq('id', applicationId)
          .in('status', ['pending', 'counter_offered'])
          .select('id, campaign_id, creator_id, status, restaurant_approval_status, final_approval_status');

        if (error) throw error;
        if (!data || data.length === 0) {
          throw new Error('This application is no longer pending — its status may have already changed.');
        }
        return data![0];
      }
    },
    onSuccess: async (data) => {
      queryClient.invalidateQueries({ queryKey: ['campaign-applications'] });
      queryClient.invalidateQueries({ queryKey: ['creator-applications'] });
      queryClient.invalidateQueries({ queryKey: ['agreed-value'] });

      // When accepted, use atomic RPC for collaboration + campaign activation + sibling rejection
      if (data.status === 'accepted' && data.campaign_id) {
        try {
          // Snapshot sibling creator IDs before the RPC (for notifications after)
          const { data: otherApps } = await supabase
            .from('campaign_applications')
            .select('id, creator_id')
            .eq('campaign_id', data.campaign_id)
            .neq('id', data.id)
            .in('status', ['pending', 'counter_offered']);

          // Atomic: creates collaboration, activates campaign if escrow held, rejects siblings
          const { error: rpcError } = await supabase
            .rpc('accept_application_with_collaboration', {
              p_application_id: data.id,
            });

          if (rpcError) throw rpcError;

          queryClient.invalidateQueries({ queryKey: ['campaigns'] });
          queryClient.invalidateQueries({ queryKey: ['campaign-project'] });

          // Notify declined creators (best-effort, after atomic RPC)
          if (otherApps && otherApps.length > 0) {
            const { data: campaignInfo } = await supabase
              .from('campaigns')
              .select('title, id')
              .eq('id', data.campaign_id)
              .single();

            for (const app of otherApps) {
              try {
                if (campaignInfo?.title) {
                  supabase.functions.invoke('create-notification', {
                    body: {
                      recipientId: app.creator_id,
                      type: 'application_rejected',
                      category: 'campaigns',
                      title: 'Application Update',
                      body: `Your application for "${campaignInfo.title}" was not selected this time.`,
                      actionUrl: `/dashboard/creator/campaigns`,
                      icon: 'application',
                      data: { campaign_id: data.campaign_id, application_id: app.id },
                      emailData: { campaignTitle: campaignInfo.title, applicationStatus: 'rejected', campaignId: data.campaign_id },
                    },
                  });
                }
              } catch {
                // Best-effort notification
              }
            }

          }
        } catch (collabError) {
          console.error('Failed to accept application atomically:', collabError);
        }
      }

      // Notify the creator of the final decision (fire-and-forget)
      const { data: campaign } = await supabase
        .from('campaigns')
        .select('title, id')
        .eq('id', data.campaign_id)
        .single()
        .then(r => r, () => ({ data: null }));

      try {
        if (campaign?.title) {
          const isAccepted = data.status === 'accepted';
          supabase.functions.invoke('create-notification', {
            body: {
              recipientId: data.creator_id,
              type: isAccepted ? 'application_accepted' : 'application_rejected',
              category: 'campaigns',
              title: isAccepted ? 'Application Accepted!' : 'Application Update',
              body: isAccepted
                ? `Congratulations! Your application for "${campaign.title}" was accepted.`
                : `Your application for "${campaign.title}" was not selected this time.`,
              actionUrl: isAccepted
                ? `/dashboard/creator/my-campaigns`
                : `/dashboard/creator/campaigns`,
              icon: 'application',
              data: { campaign_id: data.campaign_id, application_id: data.id },
              emailData: { campaignTitle: campaign.title, applicationStatus: data.status, campaignId: data.campaign_id },
            },
          });
        }
      } catch (emailError) {
        console.error('Failed to send notification:', emailError);
      }

      // Send Donny "you're hired" nudge to creator
      if (data.status === 'accepted') {
        try {
          await supabase.from('donny_nudges').insert({
            user_id: data.creator_id,
            type: 'campaign_hired',
            summary: `🎉 You've been hired for "${campaign?.title ?? 'a campaign'}"! Head to your projects to get started.`,
            priority: 'high',
            actions: [
              { label: 'View Project', route: `/dashboard/creator/my-campaigns` },
              { label: 'Send Message', route: `/messages/${data.campaign_id}` },
            ],
            raw_data: { campaign_id: data.campaign_id, application_id: data.id },
          });
        } catch (nudgeError) {
          console.error('Failed to send Donny hired nudge:', nudgeError);
        }
      }

      toast({
        title: `Application ${data.status}!`,
        description: data.status === 'accepted'
          ? 'The project is now active — the creator can start uploading content.'
          : 'The creator has been notified.',
      });
    },
    onError: (error) => {
      console.error('Application management failed:', error);
      toast({
        title: 'Failed to update application',
        description: 'Please try again later.',
        variant: 'destructive',
      });
    },
  });
};
