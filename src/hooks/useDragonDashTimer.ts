import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useEmailNotifications } from '@/hooks/useEmailNotifications';

interface TimerData {
  contentStartedAt: string | null;
  contentDeadline: string | null;
  deliveryType: string;
  timeRemaining: number | null;
  isExpired: boolean;
  formattedTime: string;
  percentageRemaining: number;
  status: 'not_started' | 'in_progress' | 'expired' | 'completed';
}

const DELIVERY_DURATIONS: Record<string, number> = {
  standard: 72 * 60 * 60 * 1000, // 72 hours in ms
  expedited: 10 * 60 * 60 * 1000, // 10 hours (midpoint of 8-12)
  dragonrush: 2 * 60 * 60 * 1000, // 2 hours (midpoint of 1-3)
};

export const useDragonDashTimer = (collaborationId: string | null) => {
  const [timerData, setTimerData] = useState<TimerData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const { sendNotification } = useEmailNotifications();

  const formatTimeRemaining = (ms: number): string => {
    if (ms <= 0) return 'Expired';
    
    const hours = Math.floor(ms / (1000 * 60 * 60));
    const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((ms % (1000 * 60)) / 1000);

    if (hours > 24) {
      const days = Math.floor(hours / 24);
      const remainingHours = hours % 24;
      return `${days}d ${remainingHours}h ${minutes}m`;
    }
    
    if (hours > 0) {
      return `${hours}h ${minutes}m ${seconds}s`;
    }
    
    return `${minutes}m ${seconds}s`;
  };

  const calculatePercentageRemaining = (
    startedAt: string, 
    deadline: string, 
    now: Date
  ): number => {
    const start = new Date(startedAt).getTime();
    const end = new Date(deadline).getTime();
    const current = now.getTime();
    
    const totalDuration = end - start;
    const elapsed = current - start;
    const remaining = totalDuration - elapsed;
    
    return Math.max(0, Math.min(100, (remaining / totalDuration) * 100));
  };

  const fetchTimerData = useCallback(async () => {
    if (!collaborationId) return;
    
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('campaign_collaborations')
        .select(`
          content_started_at,
          content_deadline,
          content_status,
          campaign:campaigns(delivery_type)
        `)
        .eq('id', collaborationId)
        .single();

      if (error) throw error;

      const now = new Date();
      const d = data as unknown as {
        content_started_at: string | null;
        content_deadline: string | null;
        content_status: string;
        campaign: { delivery_type: string }[] | { delivery_type: string } | null;
      };
      const contentStartedAt = d.content_started_at;
      const contentDeadline = d.content_deadline;
      const campaignRecord = Array.isArray(d.campaign) ? d.campaign[0] : d.campaign;
      const deliveryType = campaignRecord?.delivery_type || 'standard';
      const contentStatus = d.content_status;

      let status: TimerData['status'] = 'not_started';
      let timeRemaining: number | null = null;
      let isExpired = false;
      let percentageRemaining = 100;

      if (contentStatus === 'approved') {
        status = 'completed';
      } else if (contentStartedAt && contentDeadline) {
        const deadline = new Date(contentDeadline);
        timeRemaining = deadline.getTime() - now.getTime();
        isExpired = timeRemaining <= 0;
        status = isExpired ? 'expired' : 'in_progress';
        percentageRemaining = calculatePercentageRemaining(contentStartedAt, contentDeadline, now);
      }

      setTimerData({
        contentStartedAt,
        contentDeadline,
        deliveryType,
        timeRemaining,
        isExpired,
        formattedTime: timeRemaining !== null ? formatTimeRemaining(timeRemaining) : '--:--:--',
        percentageRemaining,
        status,
      });
    } catch (error) {
      console.error('Error fetching timer data:', error);
    } finally {
      setIsLoading(false);
    }
  }, [collaborationId]);

  const startContentCreation = useCallback(async () => {
    if (!collaborationId) return false;

    try {
      // Fetch collaboration with campaign and creator details for notification
      const { data: collab, error: fetchError } = await supabase
        .from('campaign_collaborations')
        .select(`
          campaign:campaigns(
            id,
            title,
            delivery_type,
            user_id
          ),
          creator:profiles!creator_id(full_name)
        `)
        .eq('id', collaborationId)
        .single();

      if (fetchError) throw fetchError;

      const collabData = collab as unknown as {
        campaign: { id: string; title: string; delivery_type: string; user_id: string }[] | { id: string; title: string; delivery_type: string; user_id: string } | null;
        creator: { full_name: string }[] | { full_name: string } | null;
      };
      const campaignRec = Array.isArray(collabData.campaign) ? collabData.campaign[0] : collabData.campaign;
      const deliveryType = campaignRec?.delivery_type || 'standard';
      const duration = DELIVERY_DURATIONS[deliveryType] || DELIVERY_DURATIONS.standard;
      
      const now = new Date();
      const deadline = new Date(now.getTime() + duration);

      const { error } = await supabase
        .from('campaign_collaborations')
        .update({
          content_started_at: now.toISOString(),
          content_deadline: deadline.toISOString(),
          content_status: 'in_progress',
        })
        .eq('id', collaborationId);

      if (error) throw error;

      // Fire-and-forget: write payment event for content_started
      // insert_payment_event RPC is not in generated types yet
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase.rpc('insert_payment_event' as any, {
        p_event_type: 'content_started',
        p_entity_type: 'collaboration',
        p_entity_id: collaborationId,
        p_campaign_id: campaignRec?.id ?? '',
        p_metadata: {},
      }).then(() => {}, () => {});

      toast({
        title: "Timer Started!",
        description: `You have ${formatTimeRemaining(duration)} to complete this content.`,
      });

      // Send email notification to business client
      const deliveryLabels: Record<string, string> = {
        standard: '72 hours',
        expedited: '8-12 hours',
        dragonrush: '1-3 hours',
      };

      const creatorRec = Array.isArray(collabData.creator) ? collabData.creator[0] : collabData.creator;
      sendNotification('content_started', undefined, undefined, {
        campaignTitle: campaignRec?.title,
        campaignId: campaignRec?.id,
        recipientUserId: campaignRec?.user_id,
        creatorName: creatorRec?.full_name || 'A creator',
        deliveryTime: deliveryLabels[deliveryType] || '72 hours',
        projectId: collaborationId,
      });

      await fetchTimerData();
      return true;
    } catch (error) {
      console.error('Error starting content creation:', error);
      toast({
        title: "Error",
        description: "Failed to start the timer. Please try again.",
        variant: "destructive",
      });
      return false;
    }
  }, [collaborationId, toast, fetchTimerData, sendNotification]);

  // Fetch initial data
  useEffect(() => {
    fetchTimerData();
  }, [fetchTimerData]);

  // Update timer every second when in progress
  useEffect(() => {
    if (timerData?.status !== 'in_progress') return;

    const interval = setInterval(() => {
      if (timerData.contentDeadline) {
        const now = new Date();
        const deadline = new Date(timerData.contentDeadline);
        const remaining = deadline.getTime() - now.getTime();
        const percentageRemaining = timerData.contentStartedAt 
          ? calculatePercentageRemaining(timerData.contentStartedAt, timerData.contentDeadline, now)
          : 0;

        setTimerData(prev => prev ? {
          ...prev,
          timeRemaining: remaining,
          isExpired: remaining <= 0,
          formattedTime: formatTimeRemaining(remaining),
          percentageRemaining,
          status: remaining <= 0 ? 'expired' : 'in_progress',
        } : null);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [timerData?.status, timerData?.contentDeadline, timerData?.contentStartedAt]);

  return {
    timerData,
    isLoading,
    startContentCreation,
    refreshTimer: fetchTimerData,
  };
};

export default useDragonDashTimer;
