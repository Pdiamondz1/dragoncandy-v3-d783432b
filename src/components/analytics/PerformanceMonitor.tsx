
import React, { useEffect } from 'react';
import { useAnalyticsContext } from './AnalyticsProvider';

export const PerformanceMonitor: React.FC = () => {
  const { trackEvent } = useAnalyticsContext();

  useEffect(() => {
    // Capture client-side errors (low volume, genuinely useful).
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
      window.removeEventListener('error', errorHandler);
      window.removeEventListener('unhandledrejection', unhandledRejectionHandler);
    };
  }, [trackEvent]);

  return null; // This component doesn't render anything
};
