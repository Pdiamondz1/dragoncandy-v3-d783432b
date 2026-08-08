
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
        // `campaign_deliverables` (the JSONB column, not the table of the same name) is
        // where the launch wizard actually writes deliverables — useCampaignQueries reads
        // it back as the source of truth. Omitting it here is why a duplicate arrived with
        // no content requirements even when the source clearly had them.
        // group_id MUST be carried through. Omitting it silently turned a duplicated crew
        // campaign PUBLIC while keeping the crew's forced fixed_price of 0 — a public $0
        // campaign, and publishing it fired send-campaign-publish-notifications (gated on
        // !group_id) to every onboarded creator. That breaks the promise made in the
        // crew-invitation email and both help articles that crew collabs never go public.
        // Preserving it is also the better behaviour: re-launching a crew collab should
        // give you another crew collab. It is safe — fixed_price 0 travels with it, which
        // is exactly what campaigns_group_free requires, and
        // trg_enforce_campaign_group_ownership passes because the duplicate keeps the same
        // owner. Do NOT "clean this up" by dropping group_id.
        .select('title, description, goals, deliverables, campaign_deliverables, platforms, budget_min, budget_max, style, tone, open_for_sponsorship, delivery_type, delivery_fee, pricing_type, fixed_price, ai_analysis, org_unit_id, group_id')
        .eq('id', sourceCampaignId)
        .single();

      if (fetchError || !source) throw fetchError ?? new Error('Campaign not found');

      const { data: newCampaign, error: insertError } = await supabase
        .from('campaigns')
        .insert({
          ...source,
          title: `${source.title} (Copy)`,
          status: 'draft',
          // escrow_status is deliberately NOT set — the column defaults to 'none'.
          // Setting 'pending' here meant "the business clicked Publish and is on their way
          // to Stripe" (the only other place that value is written: CampaignFinalizeStep,
          // gated on wantToPublish). A duplicate is a draft nobody has asked to publish.
          // The visible symptom was on CampaignCard: getCtaLabel checks escrow BEFORE the
          // draft check, so a fresh duplicate showed "Pay & Publish →" for a campaign that
          // owed nothing. The detail banner was NOT affected — deriveBannerState returns
          // 'draft' before it ever reaches the escrow branch. Don't "fix" that ordering on
          // the assumption the banner was broken too; it wasn't.
          // Consequence of this change: a duplicate now follows publish-then-pay like every
          // normally-created campaign (which also start at 'none'), instead of the
          // pay-then-publish path the stray 'pending' put it on. Payment is still collected
          // — at accept time, via the payment_pending_project branch.
          deadline: null,
          user_id: user!.id,
          duplicated_from: sourceCampaignId,
        } as unknown as Database['public']['Tables']['campaigns']['Insert'])
        .select('id')
        .single();

      if (insertError) throw insertError;

      // Both content copies below previously selected columns that do not exist
      // (`quantity` on campaign_deliverables; `media_url`/`caption` on campaign_media).
      // PostgREST returned 42703, the error was discarded, `data` came back null, and the
      // `if (…?.length)` guard skipped the copy — so every duplicate silently lost its
      // deliverables and media. Read the errors so this cannot fail quietly again.
      let contentCopyFailed = false;

      const { data: sourceDeliverables, error: delivFetchErr } = await supabase
        .from('campaign_deliverables')
        .select('content_type, platform, aspect_ratio, description, max_duration_seconds, sort_order')
        .eq('campaign_id', sourceCampaignId);

      if (delivFetchErr) {
        contentCopyFailed = true;
        console.error('Failed to read deliverables to copy:', delivFetchErr);
      }

      if (sourceDeliverables?.length) {
        const { error: delivErr } = await supabase
          .from('campaign_deliverables')
          .insert(sourceDeliverables.map((d) => ({
            ...d,
            campaign_id: newCampaign.id,
            status: 'pending',
          })));
        if (delivErr) {
          contentCopyFailed = true;
          console.error('Failed to copy deliverables:', delivErr);
        }
      }

      // Media rows point at already-uploaded storage objects — file_url/file_name are both
      // NOT NULL and are carried, not regenerated. NOTE the copy therefore SHARES storage
      // objects with the source campaign, and cleanupCampaignMedia (imported above, run when
      // a campaign hits completed/cancelled) deletes by resolving file_url to a storage path.
      // Terminating either campaign would strip the other's files. Latent today — the only
      // caller of updateCampaign passes 'draft'|'published' — but duplicate the storage
      // objects here before wiring any UI that can move a campaign to completed/cancelled.
      const { data: sourceMedia, error: mediaFetchErr } = await supabase
        .from('campaign_media')
        .select('media_type, file_url, file_name, file_size_bytes, mime_type, duration_seconds, thumbnail_url, sort_order')
        .eq('campaign_id', sourceCampaignId);

      if (mediaFetchErr) {
        contentCopyFailed = true;
        console.error('Failed to read media to copy:', mediaFetchErr);
      }

      if (sourceMedia?.length) {
        const { error: mediaErr } = await supabase
          .from('campaign_media')
          .insert(sourceMedia.map((m) => ({
            ...m,
            campaign_id: newCampaign.id,
            uploaded_by: user!.id,
          })));
        if (mediaErr) {
          contentCopyFailed = true;
          console.error('Failed to copy media:', mediaErr);
        }
      }

      return { ...newCampaign, contentCopyFailed };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      // Don't claim a clean copy when the content didn't come across — the business would
      // otherwise discover the empty deliverables list only after publishing.
      toast(
        result.contentCopyFailed
          ? {
              title: 'Campaign duplicated, but not everything copied',
              description: 'Check the deliverables and media on the draft before you publish.',
              variant: 'destructive',
            }
          : { title: 'Campaign duplicated!', description: 'Edit the draft to customize and publish.' },
      );
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
        // group_id is selected to REJECT crew campaigns below, and campaign_deliverables
        // (the JSONB column) because that is where the launch wizard actually writes
        // deliverables — omitting it produced a re-hire with no content requirements.
        .select('title, description, goals, deliverables, campaign_deliverables, platforms, budget_min, budget_max, style, tone, open_for_sponsorship, delivery_type, delivery_fee, pricing_type, fixed_price, ai_analysis, org_unit_id, group_id')
        .eq('id', sourceCampaignId)
        .single();

      if (fetchError || !source) throw fetchError ?? new Error('Campaign not found');

      // Re-hire does not apply to a crew campaign, and quietly copying one was actively
      // harmful: group_id was never selected, so `...source` produced a PUBLIC campaign
      // carrying the crew's forced fixed_price of 0 — a private crew collab relisted live
      // at $0 on the public board (usePublicCampaigns returns any published, group-less
      // row). That breaks the promise made in the crew-invitation email and both help
      // articles, that crew collabs never go public. To be precise, this path did NOT
      // itself email anyone — send-campaign-publish-notifications is not called here; the
      // leak was marketplace visibility. The duplicate path is the one that broadcasts.
      //
      // Preserving group_id is not the alternative: trg_reject_group_campaign_invitation
      // (20260709120021) raises on ANY campaign_invitations insert for a crew campaign, so
      // the invite fan-out below — the entire point of this action — cannot run. Re-hiring
      // a crew is simply a different gesture: post a new crew campaign, which the crew
      // already sees.
      const { group_id: sourceGroupId, ...copyable } = source;
      if (sourceGroupId !== null) {
        throw new Error('CREW_CAMPAIGN_NOT_ELIGIBLE');
      }

      const { data: newCampaign, error: insertError } = await supabase
        .from('campaigns')
        .insert({
          ...copyable,
          title: source.title.replace(/ \(Copy\)$/, ''),
          status: 'published',
          // escrow_status is deliberately NOT set — the column defaults to 'none'.
          // 'pending' means "the business clicked Publish and is heading to Stripe", so on
          // a campaign this inserts as ALREADY published it rendered the contradictory
          // "Payment Required to Publish" banner and a "Pay & Publish →" card CTA.
          // Escrow is paid AFTER hire, not before listing (see usePublicCampaigns), and
          // the launch wizard likewise publishes with no escrow_status at all. Note the
          // older CampaignFinalizeStep flow is the deliberate exception — it keeps the
          // campaign a DRAFT and sets 'pending' precisely because it is sending the
          // business to checkout first. Don't reconcile the two; they are different flows.
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

      // functions.invoke RESOLVES on a non-2xx — it returns { data: null, error } rather
      // than throwing (documented elsewhere in this codebase at useCampaignCreator.ts and
      // useCreatorGroupInvitations.ts). Counting fulfilled promises therefore reported
      // every 400/403 as "sent": send-campaign-invitation rejects a missing profiles row,
      // a self-invite, a non-published campaign and a non-owner, and the business was told
      // those creators had been invited. Count only invites that actually succeeded.
      const sentCount = inviteResults.filter(
        (r) => r.status === 'fulfilled' && !r.value?.error,
      ).length;
      const failedCount = reinviteCreatorIds.length - sentCount;
      return { id: newCampaign!.id, sentCount, failedCount };
    },
    onSuccess: (_data) => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      const plural = (n: number) => `${n} creator${n !== 1 ? 's' : ''}`;
      // Don't report an invite as sent when it wasn't — the campaign is live either way,
      // so the business needs to know who to chase rather than a reassuring total.
      toast({
        title: 'Campaign relaunched!',
        description: _data.failedCount > 0
          ? `Published, and ${plural(_data.sentCount)} invited. ${plural(_data.failedCount)} couldn't be reached — invite them from the campaign page.`
          : `Published and ${plural(_data.sentCount)} invited.`,
      });
    },
    onError: (error) => {
      // Say the real reason for the one refusal we raise ourselves, rather than sending
      // the business round a "try again" loop on something that will never succeed.
      if (error instanceof Error && error.message === 'CREW_CAMPAIGN_NOT_ELIGIBLE') {
        toast({
          title: 'Re-hire is for marketplace campaigns',
          description: 'Crew collabs stay private to your crew. Post a new crew campaign — your crew already sees it.',
          variant: 'destructive',
        });
        return;
      }
      toast({ title: 'Failed to relaunch campaign', description: 'Please try again.', variant: 'destructive' });
    },
  });
};
