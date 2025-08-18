import { useState, useEffect } from 'react';
import { CampaignAnalysis } from '@/types/campaign';

export interface AnonymousCampaignData {
  id: string;
  goal: string;
  analysis: CampaignAnalysis | null;
  customizedData: any | null;
  timelineBudgetData: any | null;
  createdAt: string;
  step: number;
}

const STORAGE_KEY = 'anonymous_campaign_data';

export const useAnonymousCampaign = () => {
  const [campaignData, setCampaignData] = useState<AnonymousCampaignData | null>(null);

  // Load campaign data from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setCampaignData(parsed);
      } catch (error) {
        console.error('Failed to parse stored campaign data:', error);
        localStorage.removeItem(STORAGE_KEY);
      }
    }
  }, []);

  // Save campaign data to localStorage whenever it changes
  useEffect(() => {
    if (campaignData) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(campaignData));
    }
  }, [campaignData]);

  const createNewCampaign = (goal: string) => {
    const newCampaign: AnonymousCampaignData = {
      id: `anon_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      goal,
      analysis: null,
      customizedData: null,
      timelineBudgetData: null,
      createdAt: new Date().toISOString(),
      step: 1,
    };
    setCampaignData(newCampaign);
    return newCampaign;
  };

  const updateCampaignGoal = (goal: string) => {
    if (campaignData) {
      setCampaignData({ ...campaignData, goal });
    } else {
      createNewCampaign(goal);
    }
  };

  const updateCampaignStep = (step: number) => {
    if (campaignData) {
      setCampaignData({ ...campaignData, step });
    }
  };

  const updateCampaignAnalysis = (analysis: CampaignAnalysis) => {
    if (campaignData) {
      setCampaignData({ ...campaignData, analysis, step: 2 });
    }
  };

  const updateCustomizedData = (data: any) => {
    if (campaignData) {
      setCampaignData({ ...campaignData, customizedData: data, step: 3 });
    }
  };

  const updateTimelineBudgetData = (data: any) => {
    if (campaignData) {
      setCampaignData({ ...campaignData, timelineBudgetData: data, step: 5 });
    }
  };

  const clearCampaignData = () => {
    setCampaignData(null);
    localStorage.removeItem(STORAGE_KEY);
  };

  const migrateCampaignToUser = async () => {
    // This will be called after user signs up/logs in
    // The actual migration will happen in the auth flow
    return campaignData;
  };

  return {
    campaignData,
    createNewCampaign,
    updateCampaignGoal,
    updateCampaignStep,
    updateCampaignAnalysis,
    updateCustomizedData,
    updateTimelineBudgetData,
    clearCampaignData,
    migrateCampaignToUser,
  };
};