
import { useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';

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

      // Log to console in development
      if (process.env.NODE_ENV === 'development') {
        console.log('Analytics Event:', analyticsEvent);
      }
    } catch (error) {
      console.error('Failed to track analytics event:', error);
    }
  };

  const trackPageView = (pageName: string) => {
    trackEvent('page_view', { 
      page_name: pageName,
      user_role: profile?.role 
    });
  };

  const trackUserAction = (action: string, context?: Record<string, any>) => {
    trackEvent('user_action', { 
      action,
      user_role: profile?.role,
      ...context 
    });
  };

  const trackCampaignEvent = (eventType: string, campaignId: string, additionalData?: Record<string, any>) => {
    trackEvent('campaign_event', {
      campaign_event_type: eventType,
      campaign_id: campaignId,
      user_role: profile?.role,
      ...additionalData
    });
  };

  const trackPerformance = (metric: string, value: number, context?: Record<string, any>) => {
    trackEvent('performance_metric', {
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
    trackPerformance
  };
};
