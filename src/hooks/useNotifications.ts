
import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';

export interface Notification {
  id: string;
  type: 'application_received' | 'application_status_changed' | 'milestone_completed' | 'sponsorship_proposal_received' | 'sponsorship_status_changed';
  title: string;
  message: string;
  read: boolean;
  created_at: string;
  data?: any;
}

export const useNotifications = () => {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const initializedRef = useRef(false);
  useEffect(() => {
    if (!user) return;

    // Hydrate initial notifications for existing pending sponsorship proposals
    const init = async () => {
      if (initializedRef.current) return;
      try {
        const { data: myCampaigns } = await supabase
          .from('campaigns')
          .select('id,title')
          .eq('user_id', user.id);

        const campaignIds = (myCampaigns || []).map((c: any) => c.id);
        if (campaignIds.length === 0) return;

        const { data: proposals } = await supabase
          .from('campaign_sponsorships')
          .select('id,campaign_id,brand_id,sponsorship_amount,created_at,status')
          .in('campaign_id', campaignIds)
          .eq('status', 'pending')
          .order('created_at', { ascending: false })
          .limit(10);

        if (!proposals || proposals.length === 0) return;

        const brandIds = Array.from(new Set(proposals.map((p: any) => p.brand_id)));
        const { data: brands } = await supabase
          .from('business_profiles')
          .select('id,business_name')
          .in('id', brandIds);

        const brandMap = new Map((brands || []).map((b: any) => [b.id, b.business_name]));
        const campaignTitleMap = new Map((myCampaigns || []).map((c: any) => [c.id, c.title]));

        const initialNotifications: Notification[] = (proposals || []).map((p: any) => ({
          id: `sponsorship-${p.id}`,
          type: 'sponsorship_proposal_received',
          title: 'New Sponsorship Proposal',
          message: `${brandMap.get(p.brand_id) || 'A brand'} has proposed $${p.sponsorship_amount || 0} to sponsor "${campaignTitleMap.get(p.campaign_id) || 'your campaign'}"`,
          read: false,
          created_at: p.created_at,
          data: {
            campaign_id: p.campaign_id,
            sponsorship_id: p.id,
            brand_id: p.brand_id,
          },
        }));

        let addedCount = 0;
        setNotifications(prev => {
          const existingIds = new Set(prev.map(n => n.id));
          const toAdd = initialNotifications.filter(n => !existingIds.has(n.id));
          addedCount = toAdd.length;
          return [...toAdd, ...prev];
        });
        setUnreadCount(prev => prev + addedCount);
      } catch (e) {
        console.log('Initial notifications load failed', e);
      }
    };

    init();

    // Set up real-time subscription for application status changes
    const applicationChannel = supabase
      .channel('application-updates')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'campaign_applications',
        },
        (payload) => {
          console.log('Application status updated:', payload);
          
          // Show toast notification
          const newStatus = payload.new.status;
          if (newStatus === 'accepted') {
            toast({
              title: 'Application Accepted!',
              description: 'Your application has been accepted. A new collaboration has been created.',
            });
          } else if (newStatus === 'rejected') {
            toast({
              title: 'Application Update',
              description: 'Your application status has been updated.',
              variant: 'destructive',
            });
          }

          // Add to notifications list
          const notification: Notification = {
            id: `app-${payload.new.id}-${Date.now()}`,
            type: 'application_status_changed',
            title: `Application ${newStatus}`,
            message: `Your application status has been updated to ${newStatus}`,
            read: false,
            created_at: new Date().toISOString(),
            data: payload.new,
          };

          setNotifications(prev => [notification, ...prev]);
          setUnreadCount(prev => prev + 1);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'campaign_applications',
        },
        (payload) => {
          console.log('New application received:', payload);
          
          // For business users - show toast when they receive new applications
          toast({
            title: 'New Application Received',
            description: 'A creator has applied to one of your campaigns.',
          });

          const notification: Notification = {
            id: `new-app-${payload.new.id}`,
            type: 'application_received',
            title: 'New Application',
            message: 'A creator has applied to your campaign',
            read: false,
            created_at: new Date().toISOString(),
            data: payload.new,
          };

          setNotifications(prev => [notification, ...prev]);
          setUnreadCount(prev => prev + 1);
        }
      )
      .subscribe();

    // Set up real-time subscription for sponsorship proposals
    const sponsorshipChannel = supabase
      .channel('sponsorship-updates')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'campaign_sponsorships',
        },
        async (payload) => {
          console.log('New sponsorship proposal received (realtime):', payload);
          
          // Fetch campaign and brand details for context
          const { data: campaign } = await supabase
            .from('campaigns')
            .select('title, user_id')
            .eq('id', payload.new.campaign_id)
            .single();

          if (!campaign) {
            console.log('Campaign not found');
            return;
          }

          console.log('Campaign user_id:', campaign.user_id, 'Current user:', user.id);

          const { data: brandProfile } = await supabase
            .from('business_profiles')
            .select('business_name')
            .eq('id', payload.new.brand_id)
            .single();

          // Only notify the restaurant owner (campaign creator)
          if (campaign.user_id === user.id) {
            console.log('Creating notification for restaurant owner');
            
            toast({
              title: 'New Sponsorship Proposal! 🎉',
              description: `${brandProfile?.business_name || 'A brand'} wants to sponsor your campaign "${campaign.title}"`,
            });

            const notification: Notification = {
              id: `sponsorship-${payload.new.id}`,
              type: 'sponsorship_proposal_received',
              title: 'New Sponsorship Proposal',
              message: `${brandProfile?.business_name || 'A brand'} has proposed $${payload.new.sponsorship_amount || 0} to sponsor "${campaign.title}"`,
              read: false,
              created_at: new Date().toISOString(),
              data: {
                campaign_id: payload.new.campaign_id,
                sponsorship_id: payload.new.id,
                brand_id: payload.new.brand_id,
              },
            };

            setNotifications(prev => [notification, ...prev]);
            setUnreadCount(prev => prev + 1);
          } else {
            console.log('User is not the campaign owner, skipping notification');
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'campaign_sponsorships',
        },
        async (payload) => {
          console.log('Sponsorship status updated:', payload);
          
          // Check if status changed
          if (payload.old.status !== payload.new.status) {
            // Fetch campaign and brand details
            const { data: campaign } = await supabase
              .from('campaigns')
              .select('title')
              .eq('id', payload.new.campaign_id)
              .single();

            const { data: brandProfile } = await supabase
              .from('business_profiles')
              .select('user_id')
              .eq('id', payload.new.brand_id)
              .single();

            // Only notify the brand who submitted the proposal
            if (brandProfile && brandProfile.user_id === user.id) {
              const newStatus = payload.new.status;
              const statusMessages: Record<string, string> = {
                accepted: '✅ Your sponsorship proposal has been accepted!',
                rejected: '❌ Your sponsorship proposal was declined',
                counter_offer: '💬 The restaurant made a counter-offer',
              };

              if (statusMessages[newStatus]) {
                toast({
                  title: 'Sponsorship Update',
                  description: `${statusMessages[newStatus]} for "${campaign?.title || 'campaign'}"`,
                  variant: newStatus === 'rejected' ? 'destructive' : 'default',
                });

                const notification: Notification = {
                  id: `sponsorship-update-${payload.new.id}-${Date.now()}`,
                  type: 'sponsorship_status_changed',
                  title: `Sponsorship ${newStatus.charAt(0).toUpperCase() + newStatus.slice(1)}`,
                  message: `Your proposal for "${campaign?.title || 'campaign'}" is now ${newStatus}`,
                  read: false,
                  created_at: new Date().toISOString(),
                  data: {
                    campaign_id: payload.new.campaign_id,
                    sponsorship_id: payload.new.id,
                    status: newStatus,
                  },
                };

                setNotifications(prev => [notification, ...prev]);
                setUnreadCount(prev => prev + 1);
              }
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(applicationChannel);
      supabase.removeChannel(sponsorshipChannel);
    };
  }, [user]);

  const markAsRead = (notificationId: string) => {
    setNotifications(prev =>
      prev.map(notif =>
        notif.id === notificationId ? { ...notif, read: true } : notif
      )
    );
    setUnreadCount(prev => Math.max(0, prev - 1));
  };

  const markAllAsRead = () => {
    setNotifications(prev => prev.map(notif => ({ ...notif, read: true })));
    setUnreadCount(0);
  };

  return {
    notifications,
    unreadCount,
    markAsRead,
    markAllAsRead,
  };
};
