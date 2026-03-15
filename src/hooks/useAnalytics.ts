
import { useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useOptimizedAnalytics } from '@/hooks/useOptimizedAnalytics';

interface AnalyticsEvent {
  event_type: string;
  event_data?: Record<string, any>;
  user_id?: string;
  session_id?: string;
  page_url?: string;
  user_agent?: string;
}

export const useAnalytics = () => {
  const { user, profile } = useAuth();
  const { trackEventOptimized, trackPageViewOptimized, trackUserActionOptimized, trackCampaignEventOptimized } = useOptimizedAnalytics();

  // Legacy direct tracking method (kept for backward compatibility)
  const trackEvent = async (eventType: string, eventData?: Record<string, any>) => {
    try {
      const analyticsEvent: AnalyticsEvent = {
        event_type: eventType,
        event_data: eventData || {},
        user_id: user?.id,
        page_url: window.location.href,
        user_agent: navigator.userAgent
      };

      // Store in Supabase for analytics
      await supabase
        .from('analytics_events')
        .insert([analyticsEvent]);

    } catch (error) {
      console.error('Failed to track analytics event:', error);
    }
  };

  const trackPageView = (pageName: string) => {
    // Use optimized version for better performance
    trackPageViewOptimized(pageName);
  };

  const trackUserAction = (action: string, context?: Record<string, any>) => {
    // Use optimized version for better performance
    trackUserActionOptimized(action, context);
  };

  const trackCampaignEvent = (eventType: string, campaignId: string, additionalData?: Record<string, any>) => {
    // Use optimized version for better performance
    trackCampaignEventOptimized(eventType, campaignId, additionalData);
  };

  const trackPerformance = (metric: string, value: number, context?: Record<string, any>) => {
    trackEventOptimized('performance_metric', {
      metric,
      value,
      ...context
    });
  };

  // Track page performance on mount
  useEffect(() => {
    const measurePageLoad = () => {
      if ('performance' in window && 'getEntriesByType' in performance) {
        setTimeout(() => {
          const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
          if (navigation) {
            trackPerformance('page_load_time', navigation.loadEventEnd - navigation.fetchStart, {
              page_url: window.location.href
            });
          }
        }, 1000);
      }
    };

    measurePageLoad();
  }, []);

  return {
    trackEvent,
    trackPageView,
    trackUserAction,
    trackCampaignEvent,
    trackPerformance,
    // Expose optimized methods
    trackEventOptimized,
    trackPageViewOptimized,
    trackUserActionOptimized,
    trackCampaignEventOptimized
  };
};
