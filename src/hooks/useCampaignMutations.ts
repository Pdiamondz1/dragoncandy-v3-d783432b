
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';
import { cleanupCampaignMedia } from '@/lib/cleanupCampaignMedia';
import type { Campaign } from './useCampaignQueries';

export interface CreateCampaignData {
  title: string;
  description?: string;
  goals?: string;
  deliverables?: string[];
  platforms?: string[];
  budget_min?: number;
  budget_max?: number;
  deadline?: string;
  style?: string;
  tone?: string;
  status?: 'draft' | 'published';
  open_for_sponsorship?: boolean;
  // DragonDash fields
  delivery_type?: 'standard' | 'expedited' | 'dragonrush'; // DB column values (mapped from UI DeliveryTier)
  delivery_fee?: number;
  pricing_type?: 'fixed' | 'bid_range';
  fixed_price?: number;
  escrow_status?: 'none' | 'pending' | 'held' | 'released' | 'refunded';
  // AI-generated campaign analysis (JSONB)
  ai_analysis?: Record<string, unknown> | null;
  org_unit_id?: string | null;
}

export const useCreateCampaign = () => {
  const { user, activeOrgUnit } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (campaignData: CreateCampaignData) => {
      const { data, error } = await supabase
        .from('campaigns')
        .insert({
          ...campaignData,
          user_id: user!.id,
          org_unit_id: campaignData.org_unit_id ?? activeOrgUnit?.id ?? null,
        } as unknown as Database['public']['Tables']['campaigns']['Insert'])
        .select('id, title, description, status, open_for_sponsorship, budget_min, budget_max, platforms, user_id, group_id')
        .single();

      if (error) {
        console.error('Error creating campaign:', error);
        throw error;
      }

      return data as unknown as Campaign;
    },
    onSuccess: async (data) => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      
      // Batched publish notifications via single edge function call.
      // NEVER broadcast a private crew campaign (group_id set) to the whole creator/brand
      // base — that would leak the private campaign's title+id to non-members.
      if (data.status === 'published' && !data.group_id) {
        try {
          await supabase.functions.invoke('send-campaign-publish-notifications', {
            body: { campaignId: data.id, campaignTitle: data.title, userId: user!.id },
          });
        } catch (error) {
          console.error('Failed to send publish notifications:', error);
        }
      }
      
      toast({
        title: 'Campaign created successfully!',
        description: `"${data.title}" has been ${data.status === 'published' ? 'published' : 'saved as draft'}.${
          data.status === 'published' 
            ? ' Creators and brands have been notified!' 
            : ''
        }`,
      });
    },
    onError: (error) => {
      console.error('Campaign creation failed:', error);
      toast({
        title: 'Failed to create campaign',
        description: 'Please try again later.',
        variant: 'destructive',
      });
    },
  });
};

export const useUpdateCampaign = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<CreateCampaignData> }) => {
      const { data, error } = await supabase
        .from('campaigns')
        .update(updates as unknown as Database['public']['Tables']['campaigns']['Update'])
        .eq('id', id)
        .eq('user_id', user!.id)
        .select('id, title, description, status, open_for_sponsorship, budget_min, budget_max, platforms, user_id, group_id')
        .single();

      if (error) {
        console.error('Error updating campaign:', error);
        throw error;
      }

      return data as unknown as Campaign;
    },
    onSuccess: async (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      
      // Batched publish notifications via single edge function call.
      // NEVER broadcast a private crew campaign (group_id set) to the whole creator/brand base.
      if (variables.updates.status === 'published' && data.status === 'published' && !data.group_id) {
        try {
          await supabase.functions.invoke('send-campaign-publish-notifications', {
            body: { campaignId: data.id, campaignTitle: data.title, userId: user!.id },
          });
        } catch (error) {
          console.error('Failed to send publish notifications:', error);
        }
      }

      // Clean up temporary reference media when campaign reaches terminal status
      if (data.status === 'completed' || data.status === 'cancelled') {
        cleanupCampaignMedia(data.id).catch((err) => {
          console.error('Campaign media cleanup failed (non-blocking):', err);
        });
      }

      toast({
        title: 'Campaign updated successfully!',
        description: `"${data.title}" has been updated.${
          data.status === 'published'
            ? ' Creators and brands have been notified!' 
            : ''
        }`,
      });
    },
    onError: (error) => {
      console.error('Campaign update failed:', error);
      toast({
        title: 'Failed to update campaign',
        description: 'Please try again later.',
        variant: 'destructive',
      });
    },
  });
};

export const useDeleteCampaign = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (campaignId: string) => {
      const { data: campaign } = await supabase
        .from('campaigns')
        .select('title, user_id, escrow_status')
        .eq('id', campaignId)
        .single();

      if (campaign?.escrow_status === 'held') {
        throw new Error('Cannot delete a campaign with held escrow. Refund the escrow first.');
      }

      const { data: activeCollabs } = await supabase
        .from('campaign_collaborations')
        .select('id')
        .eq('campaign_id', campaignId)
        .eq('status', 'active')
        .limit(1);

      if (activeCollabs && activeCollabs.length > 0) {
        throw new Error('Cannot delete a campaign with an active collaboration.');
      }

      const campaignTitle = campaign?.title ?? 'Untitled Campaign';

      // Fetch owner name for notification context
      const { data: ownerProfile } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', user!.id)
        .maybeSingle();
      const businessName = ownerProfile?.full_name ?? 'A business';

      // Collect affected creator IDs from applications
      const { data: applications } = await supabase
        .from('campaign_applications')
        .select('creator_id')
        .eq('campaign_id', campaignId);
      const applicantIds = (applications ?? []).map((a) => a.creator_id).filter(Boolean);

      // Collect affected creator IDs from invitations
      const { data: invitations } = await supabase
        .from('campaign_invitations')
        .select('creator_id')
        .eq('campaign_id', campaignId);
      const invitedCreatorIds = (invitations ?? []).map((i) => i.creator_id).filter(Boolean);

      // Delete related records before deleting the campaign
      const { error: delApps } = await supabase.from('campaign_applications').delete().eq('campaign_id', campaignId);
      if (delApps) throw delApps;
      const { error: delInvites } = await supabase.from('campaign_invitations').delete().eq('campaign_id', campaignId);
      if (delInvites) throw delInvites;
      const { error: delMatches } = await supabase.from('campaign_matches').delete().eq('campaign_id', campaignId);
      if (delMatches) throw delMatches;
      const { error: delSponsors } = await supabase.from('campaign_sponsorships').delete().eq('campaign_id', campaignId);
      if (delSponsors) throw delSponsors;

      // Delete the campaign itself (RLS-safe: owner check)
      const { error } = await supabase
        .from('campaigns')
        .delete()
        .eq('id', campaignId)
        .eq('user_id', user!.id);
      if (error) throw error;

      // Notify affected creators (applicants + invited, deduped) via create-notification,
      // which inserts the in-app bell and sends the email server-side (resolving the
      // recipient's email with the service role — a frontend caller cannot email other
      // users directly, send-notification-email's auth gate would 403 a cross-user `to`).
      const recipientIds = [...new Set([...applicantIds, ...invitedCreatorIds])];
      const notifyPromises = recipientIds.map((id) =>
        supabase.functions.invoke('create-notification', {
          body: {
            recipientId: id,
            type: 'campaign_cancelled',
            category: 'campaigns',
            title: 'Campaign Cancelled',
            body: `${businessName} cancelled "${campaignTitle}"`,
            actorId: user!.id,
            actorName: businessName,
            icon: 'campaign',
            data: { campaign_id: campaignId },
            emailData: { campaignTitle, businessName },
          },
        }).catch((err: unknown) => console.error('Failed to send cancellation notification:', err))
      );
      await Promise.allSettled(notifyPromises);

    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      toast({ title: 'Campaign deleted successfully!' });
    },
    onError: (error) => {
      console.error('Campaign deletion failed:', error);
      toast({ title: 'Failed to delete campaign', description: 'Please try again later.', variant: 'destructive' });
    },
  });
};

export const useDuplicateCampaign = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (sourceCampaignId: string) => {
      const { data: source, error: fetchError } = await supabase
        .from('campaigns')
        .select('title, description, goals, deliverables, platforms, budget_min, budget_max, style, tone, open_for_sponsorship, delivery_type, delivery_fee, pricing_type, fixed_price, ai_analysis, org_unit_id')
        .eq('id', sourceCampaignId)
        .single();

      if (fetchError || !source) throw fetchError ?? new Error('Campaign not found');

      const { data: newCampaign, error: insertError } = await supabase
        .from('campaigns')
        .insert({
          ...source,
          title: `${source.title} (Copy)`,
          status: 'draft',
          escrow_status: 'pending',
          deadline: null,
          user_id: user!.id,
          duplicated_from: sourceCampaignId,
        } as unknown as Database['public']['Tables']['campaigns']['Insert'])
        .select('id')
        .single();

      if (insertError) throw insertError;

      // Copy deliverables with status reset
      const { data: sourceDeliverables } = await supabase
        .from('campaign_deliverables')
        .select('content_type, platform, aspect_ratio, description, quantity')
        .eq('campaign_id', sourceCampaignId);

      if (sourceDeliverables?.length) {
        const { error: delivErr } = await supabase
          .from('campaign_deliverables')
          .insert(sourceDeliverables.map((d) => ({
            ...d,
            campaign_id: newCampaign.id,
            status: 'pending',
          })));
        if (delivErr) console.error('Failed to copy deliverables:', delivErr);
      }

      // Copy media assets
      const { data: sourceMedia } = await supabase
        .from('campaign_media')
        .select('media_type, media_url, caption, sort_order')
        .eq('campaign_id', sourceCampaignId);

      if (sourceMedia?.length) {
        const { error: mediaErr } = await supabase
          .from('campaign_media')
          .insert(sourceMedia.map((m) => ({
            ...m,
            campaign_id: newCampaign.id,
            uploaded_by: user!.id,
          })));
        if (mediaErr) console.error('Failed to copy media:', mediaErr);
      }

      return newCampaign;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      toast({ title: 'Campaign duplicated!', description: 'Edit the draft to customize and publish.' });
    },
    onError: () => {
      toast({ title: 'Failed to duplicate campaign', description: 'Please try again.', variant: 'destructive' });
    },
  });
};

export const useRelaunchWithCreators = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      sourceCampaignId,
      reinviteCreatorIds,
    }: {
      sourceCampaignId: string;
      reinviteCreatorIds: string[];
    }) => {
      const { data: source, error: fetchError } = await supabase
        .from('campaigns')
        .select('title, description, goals, deliverables, platforms, budget_min, budget_max, style, tone, open_for_sponsorship, delivery_type, delivery_fee, pricing_type, fixed_price, ai_analysis, org_unit_id')
        .eq('id', sourceCampaignId)
        .single();

      if (fetchError || !source) throw fetchError ?? new Error('Campaign not found');

      const { data: newCampaign, error: insertError } = await supabase
        .from('campaigns')
        .insert({
          ...source,
          title: source.title.replace(/ \(Copy\)$/, ''),
          status: 'published',
          escrow_status: 'pending',
          deadline: null,
          user_id: user!.id,
          duplicated_from: sourceCampaignId,
        } as unknown as Database['public']['Tables']['campaigns']['Insert'])
        .select('id')
        .single();

      if (insertError) throw insertError;

      const inviteResults = await Promise.allSettled(
        reinviteCreatorIds.map((creatorId) =>
          supabase.functions.invoke('send-campaign-invitation', {
            body: {
              campaign_id: newCampaign!.id,
              creator_id: creatorId,
              invited_by: user!.id,
              invitation_message: 'You did great work on our last campaign — we\'d love to work together again!',
            },
          })
        )
      );

      const sentCount = inviteResults.filter((r) => r.status === 'fulfilled').length;
      return { id: newCampaign!.id, sentCount };
    },
    onSuccess: (_data) => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      toast({
        title: 'Campaign relaunched!',
        description: `Published and ${_data.sentCount} creator${_data.sentCount !== 1 ? 's' : ''} invited.`,
      });
    },
    onError: () => {
      toast({ title: 'Failed to relaunch campaign', description: 'Please try again.', variant: 'destructive' });
    },
  });
};
