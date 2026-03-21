
import React, { useEffect } from 'react';
import { useAnalyticsContext } from './AnalyticsProvider';

export const PerformanceMonitor: React.FC = () => {
  const { trackPerformance, trackEvent } = useAnalyticsContext();

  useEffect(() => {
    // Monitor Core Web Vitals
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.entryType === 'measure') {
          trackPerformance(entry.name, entry.duration);
        }
      }
    });

    observer.observe({ entryTypes: ['measure'] });

    // Monitor memory usage (if available)
    const checkMemoryUsage = () => {
      if ('memory' in performance) {
        const memory = (performance as any).memory;
        trackPerformance('memory_used', memory.usedJSHeapSize, {
          total_heap: memory.totalJSHeapSize,
          heap_limit: memory.jsHeapSizeLimit
        });
      }
    };

    // Check memory every 30 seconds
    const memoryInterval = setInterval(checkMemoryUsage, 30000);

    // Monitor errors
    const errorHandler = (event: ErrorEvent) => {
      trackEvent('javascript_error', {
        message: event.message,
        filename: event.filename,
        line: event.lineno,
        column: event.colno,
        stack: event.error?.stack
      });
    };

    const unhandledRejectionHandler = (event: PromiseRejectionEvent) => {
      trackEvent('unhandled_promise_rejection', {
        reason: event.reason?.toString(),
        stack: event.reason?.stack
      });
    };

    window.addEventListener('error', errorHandler);
    window.addEventListener('unhandledrejection', unhandledRejectionHandler);

    return () => {
      observer.disconnect();
      clearInterval(memoryInterval);
      window.removeEventListener('error', errorHandler);
      window.removeEventListener('unhandledrejection', unhandledRejectionHandler);
    };
  }, [trackPerformance, trackEvent]);

  return null; // This component doesn't render anything
};
