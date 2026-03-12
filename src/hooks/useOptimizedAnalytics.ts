
import { useAnalyticsBatch } from '@/hooks/useAnalyticsBatch';
import { useAnalyticsCache } from '@/hooks/useAnalyticsCache';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';

export const useOptimizedAnalytics = () => {
  const { user, profile } = useAuth();
  const { addEvent, forceFlush } = useAnalyticsBatch();
  const { getCachedData, invalidateCache } = useAnalyticsCache();

  // Use batched tracking for high-frequency events
  const trackEventOptimized = (eventType: string, eventData?: Record<string, any>) => {
    addEvent(eventType, {
      ...eventData,
      user_role: profile?.role,
      timestamp: new Date().toISOString()
    });
  };

  const trackPageViewOptimized = (pageName: string) => {
    addEvent('page_view', { 
      page_name: pageName,
      user_role: profile?.role,
      referrer: document.referrer
    });
  };

  const trackUserActionOptimized = (action: string, context?: Record<string, any>) => {
    addEvent('user_action', { 
      action,
      user_role: profile?.role,
      ...context 
    });
  };

  const trackCampaignEventOptimized = (eventType: string, campaignId: string, additionalData?: Record<string, any>) => {
    addEvent('campaign_event', {
      campaign_event_type: eventType,
      campaign_id: campaignId,
      user_role: profile?.role,
      ...additionalData
    });
  };

  // Cached analytics queries
  const getAnalyticsData = async (timeRange: string) => {
    const cacheKey = `analytics_${user?.id}_${timeRange}`;
    
    return getCachedData(cacheKey, async () => {
      const endDate = new Date();
      const startDate = new Date();
      
      switch (timeRange) {
        case '24h':
          startDate.setHours(startDate.getHours() - 24);
          break;
        case '7d':
          startDate.setDate(startDate.getDate() - 7);
          break;
        case '30d':
          startDate.setDate(startDate.getDate() - 30);
          break;
        default:
          startDate.setDate(startDate.getDate() - 7);
      }

      const { data: events, error } = await supabase
        .from('analytics_events')
        .select('id, event_type, event_data, created_at, user_id')
        .eq('user_id', user!.id)
        .gte('created_at', startDate.toISOString())
        .lte('created_at', endDate.toISOString())
        .order('created_at', { ascending: false });

      if (error) throw error;

      const totalEvents = events?.length || 0;
      const uniqueUsers = new Set(events?.filter(e => e.user_id).map(e => e.user_id)).size;
      const campaignEvents = events?.filter(e => e.event_type === 'campaign_event') || [];
      const userActions = events?.filter(e => e.event_type === 'user_action') || [];
      const performanceMetrics = events?.filter(e => e.event_type === 'performance_metric') || [];
      const pageViews = events?.filter(e => e.event_type === 'page_view') || [];

      return {
        totalEvents,
        uniqueUsers,
        campaignEvents,
        userActions,
        performanceMetrics,
        pageViews,
        rawEvents: events || []
      };
    }, 5 * 60 * 1000); // Cache for 5 minutes
  };

  const getPopularPages = async (timeRange: string) => {
    const cacheKey = `popular_pages_${timeRange}`;
    
    return getCachedData(cacheKey, async () => {
      const analyticsData = await getAnalyticsData(timeRange);
      
      const pageViews = analyticsData.pageViews.reduce((acc: any, view: any) => {
        const pageName = view.event_data?.page_name || 'Unknown';
        acc[pageName] = (acc[pageName] || 0) + 1;
        return acc;
      }, {});

      return Object.entries(pageViews)
        .map(([page, count]) => ({ page, count }))
        .sort((a: any, b: any) => b.count - a.count)
        .slice(0, 10);
    }, 10 * 60 * 1000); // Cache for 10 minutes
  };

  const getUserActivityTrends = async (timeRange: string) => {
    const cacheKey = `activity_trends_${timeRange}`;
    
    return getCachedData(cacheKey, async () => {
      const analyticsData = await getAnalyticsData(timeRange);
      
      const dailyActivity = analyticsData.rawEvents.reduce((acc: any, event: any) => {
        const date = new Date(event.created_at).toLocaleDateString();
        acc[date] = (acc[date] || 0) + 1;
        return acc;
      }, {});

      return Object.entries(dailyActivity)
        .map(([date, count]) => ({ date, count }))
        .sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());
    }, 15 * 60 * 1000); // Cache for 15 minutes
  };

  return {
    trackEventOptimized,
    trackPageViewOptimized,
    trackUserActionOptimized,
    trackCampaignEventOptimized,
    getAnalyticsData,
    getPopularPages,
    getUserActivityTrends,
    forceFlush,
    invalidateCache
  };
};
