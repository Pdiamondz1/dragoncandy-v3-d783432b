import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export const useDashboardLoadTime = (isDataReady: boolean) => {
  const { user } = useAuth();
  const mountTimeRef = useRef(performance.now());
  const reportedRef = useRef(false);

  useEffect(() => {
    if (!isDataReady || reportedRef.current || !user) return;
    reportedRef.current = true;

    const loadTimeMs = Math.round(performance.now() - mountTimeRef.current);

    supabase.from('analytics_events').insert({
      event_type: 'dashboard_load_time',
      user_id: user.id,
      event_data: { load_time_ms: loadTimeMs },
      page_url: window.location.pathname,
    });
  }, [isDataReady, user]);
};
