
import { useCallback, useRef, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import type { Database } from '@/integrations/supabase/types';

type AnalyticsEventInsert = Database['public']['Tables']['analytics_events']['Insert'];

interface AnalyticsBatchEvent {
  event_type: string;
  event_data?: Record<string, any>;
  user_id?: string;
  page_url?: string;
  user_agent?: string;
}

export const useAnalyticsBatch = () => {
  const { user } = useAuth();
  const batchQueue = useRef<AnalyticsBatchEvent[]>([]);
  const flushTimeoutRef = useRef<NodeJS.Timeout>();
  const isFlushingRef = useRef(false);

  const BATCH_SIZE = 10;
  const FLUSH_INTERVAL = 5000; // 5 seconds

  const flushBatch = useCallback(async () => {
    if (isFlushingRef.current || batchQueue.current.length === 0) {
      return;
    }

    isFlushingRef.current = true;
    const eventsToSend = [...batchQueue.current];
    batchQueue.current = [];

    try {
      console.log(`Flushing ${eventsToSend.length} analytics events`);
      
      const insertData: AnalyticsEventInsert[] = eventsToSend.map(event => ({
        event_type: event.event_type,
        event_data: event.event_data || {},
        user_id: event.user_id || null,
        page_url: event.page_url || null,
        user_agent: event.user_agent || null
      }));

      const { error } = await supabase
        .from('analytics_events')
        .insert(insertData);

      if (error) {
        console.error('Failed to flush analytics batch:', error);
        // Re-add failed events back to queue for retry
        batchQueue.current.unshift(...eventsToSend);
      } else {
        console.log('Successfully flushed analytics batch');
      }
    } catch (error) {
      console.error('Error flushing analytics batch:', error);
      // Re-add failed events back to queue for retry
      batchQueue.current.unshift(...eventsToSend);
    } finally {
      isFlushingRef.current = false;
    }
  }, []);

  const scheduleFlush = useCallback(() => {
    if (flushTimeoutRef.current) {
      clearTimeout(flushTimeoutRef.current);
    }
    
    flushTimeoutRef.current = setTimeout(() => {
      flushBatch();
    }, FLUSH_INTERVAL);
  }, [flushBatch]);

  const addEvent = useCallback((eventType: string, eventData?: Record<string, any>) => {
    const event: AnalyticsBatchEvent = {
      event_type: eventType,
      event_data: eventData || {},
      user_id: user?.id,
      page_url: window.location.href,
      user_agent: navigator.userAgent
    };

    batchQueue.current.push(event);

    // Flush immediately if batch is full
    if (batchQueue.current.length >= BATCH_SIZE) {
      if (flushTimeoutRef.current) {
        clearTimeout(flushTimeoutRef.current);
      }
      flushBatch();
    } else {
      // Otherwise schedule a flush
      scheduleFlush();
    }
  }, [user?.id, flushBatch, scheduleFlush]);

  const forceFlush = useCallback(() => {
    if (flushTimeoutRef.current) {
      clearTimeout(flushTimeoutRef.current);
    }
    flushBatch();
  }, [flushBatch]);

  // Flush on unmount
  useEffect(() => {
    return () => {
      if (flushTimeoutRef.current) {
        clearTimeout(flushTimeoutRef.current);
      }
      if (batchQueue.current.length > 0) {
        flushBatch();
      }
    };
  }, [flushBatch]);

  // Flush on page unload using simplified approach
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (batchQueue.current.length > 0) {
        // Use sendBeacon for reliable delivery on page unload
        const events = [...batchQueue.current];
        const data = JSON.stringify(events);
        
        try {
          // Use the Supabase REST endpoint directly
          const url = `https://zocahiffooqdybdhguqv.supabase.co/rest/v1/analytics_events`;
          const blob = new Blob([data], { type: 'application/json' });
          navigator.sendBeacon(url, blob);
        } catch (error) {
          console.error('Failed to send analytics on page unload:', error);
        }
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  return {
    addEvent,
    forceFlush,
    queueSize: batchQueue.current.length
  };
};
