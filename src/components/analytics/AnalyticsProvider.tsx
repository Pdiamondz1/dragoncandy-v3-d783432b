/* eslint-disable react-refresh/only-export-components */

import React, { createContext, useContext, ReactNode } from 'react';
import { useAnalytics } from '@/hooks/useAnalytics';

interface AnalyticsContextType {
  trackEvent: (eventType: string, eventData?: Record<string, unknown>) => Promise<void>;
  trackPageView: (pageName: string) => void;
  trackUserAction: (action: string, context?: Record<string, unknown>) => void;
  trackCampaignEvent: (eventType: string, campaignId: string, additionalData?: Record<string, unknown>) => void;
  trackPerformance: (metric: string, value: number, context?: Record<string, unknown>) => void;
}

const AnalyticsContext = createContext<AnalyticsContextType | undefined>(undefined);

interface AnalyticsProviderProps {
  children: ReactNode;
}

export const AnalyticsProvider: React.FC<AnalyticsProviderProps> = ({ children }) => {
  const analytics = useAnalytics();

  return (
    <AnalyticsContext.Provider value={analytics}>
      {children}
    </AnalyticsContext.Provider>
  );
};

export const useAnalyticsContext = () => {
  const context = useContext(AnalyticsContext);
  if (context === undefined) {
    throw new Error('useAnalyticsContext must be used within an AnalyticsProvider');
  }
  return context;
};
