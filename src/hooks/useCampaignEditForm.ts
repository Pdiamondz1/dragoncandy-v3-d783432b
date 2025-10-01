
import { useState, useEffect } from 'react';
import { useCampaigns } from '@/hooks/useCampaigns';
import { toast } from '@/hooks/use-toast';
import type { Campaign } from '@/hooks/useCampaignQueries';

interface CampaignEditFormData {
  title: string;
  description: string;
  goals: string;
  deliverables: string[];
  platforms: string[];
  budget_min: string;
  budget_max: string;
  deadline: string;
  status: 'draft' | 'published' | 'active' | 'completed' | 'cancelled';
  style: string;
  tone: string;
  open_for_sponsorship: boolean;
}

export const useCampaignEditForm = (campaign: Campaign | undefined) => {
  const { updateCampaign } = useCampaigns();
  const [isSaving, setIsSaving] = useState(false);
  
  const [formData, setFormData] = useState<CampaignEditFormData>({
    title: '',
    description: '',
    goals: '',
    deliverables: [],
    platforms: [],
    budget_min: '',
    budget_max: '',
    deadline: '',
    status: 'draft' as 'draft' | 'published' | 'active' | 'completed' | 'cancelled',
    style: '',
    tone: '',
    open_for_sponsorship: false,
  });

  useEffect(() => {
    if (campaign) {
      setFormData({
        title: campaign.title || '',
        description: campaign.description || '',
        goals: campaign.goals || '',
        deliverables: campaign.deliverables || [],
        platforms: campaign.platforms || [],
        budget_min: campaign.budget_min?.toString() || '',
        budget_max: campaign.budget_max?.toString() || '',
        deadline: campaign.deadline ? new Date(campaign.deadline).toISOString().split('T')[0] : '',
        status: campaign.status,
        style: campaign.style || '',
        tone: campaign.tone || '',
        open_for_sponsorship: campaign.open_for_sponsorship || false,
      });
    }
  }, [campaign]);

  const handleInputChange = (field: keyof CampaignEditFormData, value: string | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleArrayChange = (field: 'platforms' | 'deliverables', value: string, checked: boolean) => {
    setFormData(prev => ({
      ...prev,
      [field]: checked 
        ? [...prev[field], value]
        : prev[field].filter(item => item !== value)
    }));
  };

  const handleSave = async (saveStatus: 'draft' | 'published') => {
    if (!campaign) return;

    setIsSaving(true);
    try {
      const updates = {
        ...formData,
        budget_min: formData.budget_min ? parseFloat(formData.budget_min) : undefined,
        budget_max: formData.budget_max ? parseFloat(formData.budget_max) : undefined,
        deadline: formData.deadline || undefined,
        status: saveStatus,
      };

      await updateCampaign.mutateAsync({ id: campaign.id, updates });
      
      if (saveStatus === 'published') {
        toast({
          title: 'Campaign published!',
          description: 'Your campaign is now live and visible to creators.',
        });
      } else {
        toast({
          title: 'Campaign saved!',
          description: 'Your changes have been saved as a draft.',
        });
      }
      
      return true;
    } catch (error) {
      console.error('Error updating campaign:', error);
      toast({
        title: 'Error saving campaign',
        description: 'Please try again later.',
        variant: 'destructive',
      });
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  return {
    formData,
    isSaving,
    handleInputChange,
    handleArrayChange,
    handleSave,
  };
};
