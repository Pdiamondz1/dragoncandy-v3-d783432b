
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { useEmailNotifications } from '@/hooks/useEmailNotifications';

export const useManageApplication = () => {
  const queryClient = useQueryClient();
  const { sendNotification } = useEmailNotifications();

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
          await supabase.from('campaign_applications').update({ status: 'accepted' }).eq('id', applicationId);
        } else if (app.final_approval_status === 'rejected') {
          await supabase.from('campaign_applications').update({ status: 'rejected' }).eq('id', applicationId);
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

      // When accepted and escrow already held, create collaboration immediately
      if (data.status === 'accepted' && data.campaign_id) {
        try {
          const { data: campaign } = await supabase
            .from('campaigns')
            .select('escrow_status')
            .eq('id', data.campaign_id)
            .single();

          if (campaign?.escrow_status === 'held') {
            const { data: existingCollab } = await supabase
              .from('campaign_collaborations')
              .select('id')
              .eq('campaign_id', data.campaign_id)
              .eq('creator_id', data.creator_id)
              .maybeSingle();

            if (!existingCollab) {
              await supabase
                .from('campaign_collaborations')
                .insert({
                  campaign_id: data.campaign_id,
                  creator_id: data.creator_id,
                  application_id: data.id,
                  status: 'active',
                });

              await supabase
                .from('campaigns')
                .update({ status: 'active' })
                .eq('id', data.campaign_id);

              queryClient.invalidateQueries({ queryKey: ['campaigns'] });
              queryClient.invalidateQueries({ queryKey: ['campaign-project'] });
            }
          }
        } catch (collabError) {
          console.error('Failed to auto-create collaboration:', collabError);
        }

        // Auto-decline all other pending/counter_offered applications for this campaign
        try {
          const { data: otherApps } = await supabase
            .from('campaign_applications')
            .select('id, creator_id')
            .eq('campaign_id', data.campaign_id)
            .neq('id', data.id)
            .in('status', ['pending', 'counter_offered']);

          if (otherApps && otherApps.length > 0) {
            await supabase
              .from('campaign_applications')
              .update({ status: 'rejected' })
              .eq('campaign_id', data.campaign_id)
              .neq('id', data.id)
              .in('status', ['pending', 'counter_offered']);

            // Notify declined creators
            const { data: campaignInfo } = await supabase
              .from('campaigns')
              .select('title')
              .eq('id', data.campaign_id)
              .single();

            for (const app of otherApps) {
              try {
                const { data: profile } = await supabase
                  .from('profiles')
                  .select('email, full_name')
                  .eq('id', app.creator_id)
                  .single();

                if (profile?.email && campaignInfo?.title) {
                  await sendNotification(
                    'application_status',
                    profile.email,
                    profile.full_name,
                    {
                      campaignTitle: campaignInfo.title,
                      applicationStatus: 'rejected',
                      campaignId: data.campaign_id,
                    }
                  );
                }
              } catch {
                // Best-effort notification
              }
            }
          }
        } catch (declineError) {
          console.error('Failed to auto-decline other applications:', declineError);
        }
      }

      // Send email notification to creator
      try {
        const { data: creatorProfile } = await supabase
          .from('profiles')
          .select('email, full_name')
          .eq('id', data.creator_id)
          .single();

        const { data: campaign } = await supabase
          .from('campaigns')
          .select('title')
          .eq('id', data.campaign_id)
          .single();

        if (creatorProfile?.email && campaign?.title) {
          await sendNotification(
            'application_status',
            creatorProfile.email,
            creatorProfile.full_name,
            {
              campaignTitle: campaign.title,
              applicationStatus: data.status,
              campaignId: data.campaign_id,
            }
          );
        }
      } catch (emailError) {
        console.error('Failed to send email notification:', emailError);
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
