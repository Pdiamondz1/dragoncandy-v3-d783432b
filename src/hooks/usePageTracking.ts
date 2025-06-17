
import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useAnalyticsContext } from '@/components/analytics/AnalyticsProvider';

export const usePageTracking = () => {
  const location = useLocation();
  const { trackPageView } = useAnalyticsContext();

  useEffect(() => {
    // Extract page name from pathname
    const pageName = location.pathname === '/' ? 'home' : location.pathname.slice(1).replace(/\//g, '_');
    trackPageView(pageName);
  }, [location, trackPageView]);
};
