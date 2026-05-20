
import { useState, useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';

export interface NotificationData {
  campaign_id?: string;
  application_id?: string;
  sponsorship_id?: string;
  brand_id?: string;
  status?: string;
  content_id?: string;
  liker_id?: string;
  liker_name?: string;
  invitation_id?: string;
  conversation_id?: string;
  sender_id?: string;
  sender_name?: string;
  proposed_rate?: number;
  sender_role?: string;
  [key: string]: unknown;
}

export interface Notification {
  id: string;
  type: 'application_received' | 'application_status_changed' | 'milestone_completed' | 'sponsorship_proposal_received' | 'sponsorship_status_changed' | 'content_liked' | 'campaign_invitation' | 'message_received' | 'counter_offer_received' | 'counter_offer_responded';
  title: string;
  message: string;
  read: boolean;
  created_at: string;
  data?: NotificationData;
}

export const useNotifications = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const initializedRef = useRef(false);
  const prefsRef = useRef<{ push: boolean; messages: boolean; campaigns: boolean }>({
    push: true, messages: true, campaigns: true,
  });

  // Persist notifications per-user so read state survives route changes/reloads
  useEffect(() => {
    if (!user) return;
    try {
      const raw = localStorage.getItem(`dc_notifications_${user.id}`);
      if (raw) {
        const stored: Notification[] = JSON.parse(raw);
        setNotifications(stored);
        setUnreadCount(stored.filter(n => !n.read).length);
      }
    } catch (e) {
      console.error('Failed to load stored notifications', e);
    }
  }, [user]);

  // Save notifications and keep unread count in sync
  useEffect(() => {
    if (!user) return;
    try {
      localStorage.setItem(`dc_notifications_${user.id}`, JSON.stringify(notifications));
      setUnreadCount(notifications.filter(n => !n.read).length);
    } catch (e) {
      console.error('Failed to save notifications', e);
    }
  }, [notifications, user]);

  useEffect(() => {
    if (!user) return;

    // Hydrate initial notifications for existing pending sponsorship proposals
    const init = async () => {
      if (initializedRef.current) return;
      try {
        // Load notification preferences
        const { data: prefsData } = await supabase
          .from('notification_preferences')
          .select('push_notifications, message_notifications, campaign_notifications')
          .eq('user_id', user.id)
          .maybeSingle();
        if (prefsData) {
          prefsRef.current = {
            push: prefsData.push_notifications ?? true,
            messages: prefsData.message_notifications ?? true,
            campaigns: prefsData.campaign_notifications ?? true,
          };
        }

        // Build a map of read states from storage to keep them across navigations
        let storedRead = new Map<string, boolean>();
        try {
          const rawStored = localStorage.getItem(`dc_notifications_${user.id}`);
          if (rawStored) {
            const storedList: Notification[] = JSON.parse(rawStored);
            storedRead = new Map(storedList.map((n) => [n.id, !!n.read]));
          }
        } catch {}

        // Load notifications for restaurant owners (received proposals)
        const { data: myCampaigns } = await supabase
          .from('campaigns')
          .select('id,title')
          .eq('user_id', user.id);

        const campaignIds = (myCampaigns || []).map((c) => c.id);
        
        if (campaignIds.length > 0) {
          const { data: proposals } = await supabase
            .from('campaign_sponsorships')
            .select('id,campaign_id,brand_id,sponsorship_amount,created_at,status')
            .in('campaign_id', campaignIds)
            .eq('status', 'pending')
            .order('created_at', { ascending: false })
            .limit(10);

          if (proposals && proposals.length > 0) {
            const brandIds = Array.from(new Set(proposals.map((p) => p.brand_id)));
            const { data: brands } = await supabase
              .from('business_profiles')
              .select('id,business_name')
              .in('id', brandIds);

            const brandMap = new Map((brands || []).map((b) => [b.id, b.business_name]));
            const campaignTitleMap = new Map((myCampaigns || []).map((c) => [c.id, c.title]));

            const restaurantNotifications: Notification[] = proposals.map((p) => ({
              id: `sponsorship-${p.id}`,
              type: 'sponsorship_proposal_received',
              title: 'New Sponsorship Proposal',
              message: `${brandMap.get(p.brand_id) || 'A brand'} has proposed $${p.sponsorship_amount || 0} to sponsor "${campaignTitleMap.get(p.campaign_id) || 'your campaign'}"`,
              read: storedRead.get(`sponsorship-${p.id}`) ?? false,
              created_at: p.created_at,
              data: {
                campaign_id: p.campaign_id,
                sponsorship_id: p.id,
                brand_id: p.brand_id,
              },
            }));

            setNotifications(prev => {
              const existingIds = new Set(prev.map(n => n.id));
              const toAdd = restaurantNotifications.filter(n => !existingIds.has(n.id));
              return [...toAdd, ...prev];
            });
            // unread count recalculated via persistence effect
          }
        }

        // Load notifications for brands (status updates on their proposals)
        const { data: myBrandProfile } = await supabase
          .from('business_profiles')
          .select('id')
          .eq('user_id', user.id)
          .eq('account_type', 'brand')
          .maybeSingle();

        if (myBrandProfile) {
          const { data: myProposals } = await supabase
            .from('campaign_sponsorships')
            .select('id,campaign_id,sponsorship_amount,status,created_at,updated_at')
            .eq('brand_id', myBrandProfile.id)
            .in('status', ['accepted', 'rejected'])
            .order('updated_at', { ascending: false })
            .limit(10);

          if (myProposals && myProposals.length > 0) {
            const proposalCampaignIds = myProposals.map((p) => p.campaign_id);
            const { data: campaigns } = await supabase
              .from('campaigns')
              .select('id,title')
              .in('id', proposalCampaignIds);

            const campaignTitleMap = new Map((campaigns || []).map((c) => [c.id, c.title]));

            const brandNotifications: Notification[] = myProposals.map((p) => ({
              id: `sponsorship-update-${p.id}`,
              type: 'sponsorship_status_changed',
              title: `Sponsorship ${p.status.charAt(0).toUpperCase() + p.status.slice(1)}`,
              message: `Your $${p.sponsorship_amount || 0} proposal for "${campaignTitleMap.get(p.campaign_id) || 'campaign'}" was ${p.status}`,
              read: storedRead.get(`sponsorship-update-${p.id}`) ?? false,
              created_at: p.updated_at || p.created_at,
              data: {
                campaign_id: p.campaign_id,
                sponsorship_id: p.id,
                status: p.status,
              },
            }));

            setNotifications(prev => {
              const existingIds = new Set(prev.map(n => n.id));
              const toAdd = brandNotifications.filter(n => !existingIds.has(n.id));
              return [...toAdd, ...prev];
            });
            // unread count recalculated via persistence effect
          }
        }

        // Load notifications for creators (pending campaign invitations)
        const { data: pendingInvites } = await supabase
          .from('campaign_invitations')
          .select('id, campaign_id, created_at, campaigns:campaign_id ( title )')
          .eq('creator_id', user.id)
          .eq('status', 'pending')
          .order('created_at', { ascending: false })
          .limit(10);

        if (pendingInvites && pendingInvites.length > 0) {
          const inviteNotifications: Notification[] = pendingInvites.map((inv) => ({
            id: `invite-${inv.id}`,
            type: 'campaign_invitation' as const,
            title: 'Campaign Invitation',
            message: `You've been invited to "${(inv.campaigns as { title?: string } | null)?.title || 'a campaign'}"`,
            read: storedRead.get(`invite-${inv.id}`) ?? false,
            created_at: inv.created_at,
            data: {
              campaign_id: inv.campaign_id,
              invitation_id: inv.id,
            },
          }));

          setNotifications(prev => {
            const existingIds = new Set(prev.map(n => n.id));
            const toAdd = inviteNotifications.filter(n => !existingIds.has(n.id));
            return [...toAdd, ...prev];
          });
        }

        initializedRef.current = true;
      } catch (e) {
        console.error('Initial notifications load failed', e);
      }
    };

    init();

    const lookupCache = new Map<string, { data: unknown; expiresAt: number }>();
    const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

    const cachedLookup = async <T>(
      key: string,
      fetcher: () => Promise<T>
    ): Promise<T | null> => {
      const cached = lookupCache.get(key);
      if (cached && cached.expiresAt > Date.now()) {
        return cached.data as T;
      }
      const result = await fetcher();
      if (result) {
        lookupCache.set(key, { data: result, expiresAt: Date.now() + CACHE_TTL });
      }
      return result;
    };

    // Single consolidated channel for all notification events
    const notificationChannel = supabase
      .channel(`notifications-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'campaign_applications',
        },
        (payload) => {
          const newStatus = payload.new.status;
          if (prefsRef.current.push && prefsRef.current.campaigns) {
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
          if (prefsRef.current.push && prefsRef.current.campaigns) {
            toast({
              title: 'New Application Received',
              description: 'A creator has applied to one of your campaigns.',
            });
          }

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
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'campaign_sponsorships',
        },
        async (payload) => {
          // Fetch campaign and brand details for context (cached)
          const campaign = await cachedLookup(`campaign-${payload.new.campaign_id}`, async () => {
            const { data } = await supabase.from('campaigns').select('title, user_id').eq('id', payload.new.campaign_id).single();
            return data;
          });
          if (!campaign) return;

          const brandProfile = await cachedLookup(`brand-${payload.new.brand_id}`, async () => {
            const { data } = await supabase.from('business_profiles').select('business_name').eq('id', payload.new.brand_id).single();
            return data;
          });

          if (campaign.user_id === user.id) {
            if (prefsRef.current.push && prefsRef.current.campaigns) {
              toast({
                title: 'New Sponsorship Proposal!',
                description: `${brandProfile?.business_name || 'A brand'} wants to sponsor your campaign "${campaign.title}"`,
              });
            }

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
          // Check if status changed
          if (payload.old.status !== payload.new.status) {
            // Fetch campaign and brand details (cached)
            const campaign = await cachedLookup(`campaign-${payload.new.campaign_id}`, async () => {
              const { data } = await supabase.from('campaigns').select('title').eq('id', payload.new.campaign_id).single();
              return data;
            });

            const brandProfile = await cachedLookup(`brand-user-${payload.new.brand_id}`, async () => {
              const { data } = await supabase.from('business_profiles').select('user_id').eq('id', payload.new.brand_id).single();
              return data;
            });

            // Only notify the brand who submitted the proposal
            if (brandProfile && brandProfile.user_id === user.id) {
              const newStatus = payload.new.status;
              const statusMessages: Record<string, string> = {
                accepted: '✅ Your sponsorship proposal has been accepted!',
                rejected: '❌ Your sponsorship proposal was declined',
                counter_offer: '💬 The restaurant made a counter-offer',
              };

              if (statusMessages[newStatus]) {
                if (prefsRef.current.push && prefsRef.current.campaigns) {
                  toast({
                    title: 'Sponsorship Update',
                    description: `${statusMessages[newStatus]} for "${campaign?.title || 'campaign'}"`,
                    variant: newStatus === 'rejected' ? 'destructive' : 'default',
                  });
                }

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
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'analytics_events',
          filter: 'event_type=eq.dragon_feed_like',
        },
        async (payload) => {
          const eventData = payload.new.event_data as Record<string, unknown>;

          // Only notify if this is a 'like' action (not 'unlike')
          if (eventData?.action !== 'like') return;

          // Fetch creator profile to check if current user is the creator (cached)
          const creatorProfile = await cachedLookup(`creator-${eventData.creator_id}`, async () => {
            const { data } = await supabase.from('creator_profiles').select('id, user_id, creator_name').eq('id', eventData.creator_id as string).single();
            return data;
          });

          // Only notify if current user owns this content
          if (creatorProfile?.user_id !== user.id) return;

          // Fetch the liker's profile for display name (cached)
          const likerProfile = await cachedLookup(`profile-${payload.new.user_id}`, async () => {
            const { data } = await supabase.from('profiles').select('full_name, email').eq('id', payload.new.user_id).single();
            return data;
          });

          const likerName = likerProfile?.full_name ||
                            likerProfile?.email?.split('@')[0] ||
                            'Someone';

          if (prefsRef.current.push) {
            toast({
              title: 'Your content got a like!',
              description: `${likerName} liked your content`,
            });
          }

          // Add to notifications list
          const notification: Notification = {
            id: `content-like-${payload.new.id}`,
            type: 'content_liked',
            title: 'Content Liked',
            message: `${likerName} liked your content`,
            read: false,
            created_at: new Date().toISOString(),
            data: {
              content_id: eventData.content_id as string | undefined,
              liker_id: payload.new.user_id,
              liker_name: likerName,
            },
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
          table: 'campaign_invitations',
          filter: `creator_id=eq.${user.id}`,
        },
        async (payload) => {
          let campaignTitle = 'a campaign';
          try {
            const campaign = await cachedLookup(`campaign-title-${payload.new.campaign_id}`, async () => {
              const { data } = await supabase.from('campaigns').select('title').eq('id', payload.new.campaign_id).single();
              return data;
            });
            if (campaign) campaignTitle = campaign.title;
          } catch {}

          if (prefsRef.current.push && prefsRef.current.campaigns) {
            toast({
              title: 'Campaign Invitation!',
              description: `You've been invited to "${campaignTitle}"`,
            });
          }

          const notification: Notification = {
            id: `invite-${payload.new.id}`,
            type: 'campaign_invitation',
            title: 'Campaign Invitation',
            message: `You've been invited to "${campaignTitle}"`,
            read: false,
            created_at: new Date().toISOString(),
            data: { campaign_id: payload.new.campaign_id, invitation_id: payload.new.id },
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
          table: 'messages',
          filter: `recipient_id=eq.${user.id}`,
        },
        async (payload) => {
          const msg = payload.new;
          if (msg.sender_id === user.id) return;

          const senderProfile = await cachedLookup(`profile-${msg.sender_id}`, async () => {
            const { data } = await supabase.from('profiles').select('full_name, email').eq('id', msg.sender_id).single();
            return data;
          });

          const senderName = senderProfile?.full_name || senderProfile?.email?.split('@')[0] || 'Someone';
          const preview = typeof msg.content === 'string'
            ? msg.content.substring(0, 60) + (msg.content.length > 60 ? '…' : '')
            : 'New message';

          if (prefsRef.current.push && prefsRef.current.messages) {
            toast({
              title: `Message from ${senderName}`,
              description: preview,
            });
          }

          const notification: Notification = {
            id: `msg-${msg.id}`,
            type: 'message_received',
            title: 'New Message',
            message: `${senderName}: ${preview}`,
            read: false,
            created_at: new Date().toISOString(),
            data: {
              conversation_id: msg.conversation_id,
              campaign_id: msg.campaign_id,
              sender_id: msg.sender_id,
              sender_name: senderName,
            },
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
          table: 'application_counter_offers',
        },
        async (payload) => {
          if (payload.new.sender_id === user.id) return;

          const application = await cachedLookup(`application-${payload.new.application_id}`, async () => {
            const { data } = await supabase.from('campaign_applications').select('campaign_id, creator_id').eq('id', payload.new.application_id).single();
            return data;
          });
          if (!application) return;

          const campaign = await cachedLookup(`campaign-${application.campaign_id}`, async () => {
            const { data } = await supabase.from('campaigns').select('title, user_id').eq('id', application.campaign_id).single();
            return data;
          });

          const isRelevant = user.id === application.creator_id || user.id === campaign?.user_id;
          if (!isRelevant) return;

          const amount = payload.new.proposed_rate;
          const amountStr = amount ? `$${Number(amount).toLocaleString()}` : '';

          if (prefsRef.current.push && prefsRef.current.campaigns) {
            toast({
              title: 'New Counter Offer',
              description: `New counter-offer on "${campaign?.title || 'campaign'}"${amountStr ? `: ${amountStr}` : ''}`,
            });
          }

          const notification: Notification = {
            id: `counter-offer-${payload.new.id}`,
            type: 'counter_offer_received',
            title: 'New Counter Offer',
            message: `New counter-offer on "${campaign?.title || 'campaign'}"${amountStr ? `: ${amountStr}` : ''}`,
            read: false,
            created_at: new Date().toISOString(),
            data: {
              campaign_id: application.campaign_id,
              application_id: payload.new.application_id,
              proposed_rate: amount,
              sender_role: payload.new.sender_role,
            },
          };

          setNotifications(prev => [notification, ...prev]);
          setUnreadCount(prev => prev + 1);
          queryClient.invalidateQueries({ queryKey: ['counter-offers'] });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'application_counter_offers',
        },
        async (payload) => {
          const newStatus = payload.new.status as string;
          if (newStatus !== 'accepted' && newStatus !== 'declined') return;
          if (payload.new.sender_id !== user.id) return;

          const application = await cachedLookup(`application-${payload.new.application_id}`, async () => {
            const { data } = await supabase.from('campaign_applications').select('campaign_id, creator_id').eq('id', payload.new.application_id).single();
            return data;
          });
          if (!application) return;

          const campaign = await cachedLookup(`campaign-${application.campaign_id}`, async () => {
            const { data } = await supabase.from('campaigns').select('title, user_id').eq('id', application.campaign_id).single();
            return data;
          });

          if (prefsRef.current.push && prefsRef.current.campaigns) {
            toast({
              title: newStatus === 'accepted' ? 'Counter Offer Accepted!' : 'Counter Offer Declined',
              description: `Your counter-offer on "${campaign?.title || 'campaign'}" was ${newStatus}`,
              variant: newStatus === 'declined' ? 'destructive' : 'default',
            });
          }

          const notification: Notification = {
            id: `counter-response-${payload.new.id}-${Date.now()}`,
            type: 'counter_offer_responded',
            title: newStatus === 'accepted' ? 'Counter Offer Accepted' : 'Counter Offer Declined',
            message: `Your counter-offer on "${campaign?.title || 'campaign'}" was ${newStatus}`,
            read: false,
            created_at: new Date().toISOString(),
            data: {
              campaign_id: application.campaign_id,
              application_id: payload.new.application_id,
              status: newStatus,
              sender_role: payload.new.sender_role,
            },
          };

          setNotifications(prev => [notification, ...prev]);
          setUnreadCount(prev => prev + 1);
          queryClient.invalidateQueries({ queryKey: ['counter-offers'] });
          queryClient.invalidateQueries({ queryKey: ['campaign-applications'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(notificationChannel);
    };
  }, [user, queryClient]);

  const markAsRead = useCallback((notificationId: string) => {
    setNotifications(prev =>
      prev.map(notif =>
        notif.id === notificationId ? { ...notif, read: true } : notif
      )
    );
    setUnreadCount(prev => Math.max(0, prev - 1));
  }, []);

  const markAllAsRead = useCallback(() => {
    setNotifications(prev => prev.map(notif => ({ ...notif, read: true })));
    setUnreadCount(0);
  }, []);

  const markConversationRead = useCallback((id: string) => {
    setNotifications(prev => {
      const updated = prev.map(notif => {
        if (notif.type === 'message_received' && !notif.read &&
          (notif.data?.conversation_id === id || notif.data?.campaign_id === id)) {
          return { ...notif, read: true };
        }
        return notif;
      });
      return updated;
    });
  }, []);

  return {
    notifications,
    unreadCount,
    markAsRead,
    markAllAsRead,
    markConversationRead,
  };
};
