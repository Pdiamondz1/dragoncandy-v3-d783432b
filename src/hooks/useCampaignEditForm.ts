
import { useState, useEffect } from 'react';
import { useCampaigns } from '@/hooks/useCampaigns';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import type { Campaign } from '@/hooks/useCampaignQueries';
import type { Deliverable } from '@/types/campaignMedia';

export interface CampaignEditFormData {
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
  tagline: string;
  campaign_type: string;
  per_creator_cap: string;
  usage_rights_days: string;
  exclusivity_days: string;
  geographic_scope: string;
  target_creator_count: string;
  target_creator_personas: string[];
  delivery_type: 'standard' | 'expedited' | 'dragonrush';
  style_direction: string;
  key_messages: string[];
  hashtags: string[];
  tier_reasoning: string;
}

export const useCampaignEditForm = (campaign: Campaign | undefined) => {
  const { updateCampaign } = useCampaigns();
  const queryClient = useQueryClient();
  const [isSaving, setIsSaving] = useState(false);
  const [structuredDeliverables, setStructuredDeliverables] = useState<Deliverable[]>([]);

  const [formData, setFormData] = useState<CampaignEditFormData>({
    title: '',
    description: '',
    goals: '',
    deliverables: [],
    platforms: [],
    budget_min: '',
    budget_max: '',
    deadline: '',
    status: 'draft',
    style: '',
    tone: '',
    open_for_sponsorship: false,
    tagline: '',
    campaign_type: '',
    per_creator_cap: '',
    usage_rights_days: '',
    exclusivity_days: '',
    geographic_scope: '',
    target_creator_count: '',
    target_creator_personas: [],
    delivery_type: 'standard',
    style_direction: '',
    key_messages: [],
    hashtags: [],
    tier_reasoning: '',
  });

  useEffect(() => {
    if (campaign) {
      const hashtags = campaign.hashtag_requirements?.split(' ').filter(Boolean) ?? [];
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
        tagline: campaign.tagline || '',
        campaign_type: campaign.campaign_type || '',
        per_creator_cap: campaign.per_creator_cap?.toString() || '',
        usage_rights_days: campaign.usage_rights_days?.toString() || '',
        exclusivity_days: campaign.exclusivity_days?.toString() || '',
        geographic_scope: campaign.geographic_scope || '',
        target_creator_count: campaign.creator_count?.toString() || '',
        target_creator_personas: campaign.target_creator_personas || [],
        delivery_type: campaign.delivery_type || 'standard',
        style_direction: typeof campaign.style_direction === 'string'
          ? campaign.style_direction
          : campaign.style_direction
            ? [campaign.style_direction.mood, campaign.style_direction.visual_style,
               campaign.style_direction.color_palette, campaign.style_direction.references]
              .filter(Boolean).join('. ')
            : '',
        key_messages: campaign.key_messages || [],
        hashtags,
        tier_reasoning: campaign.tier_reasoning || '',
      });
    }
  }, [campaign]);

  const handleInputChange = (
    field: keyof CampaignEditFormData,
    value: string | boolean | string[],
  ) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleArrayChange = (
    field: 'platforms' | 'deliverables' | 'target_creator_personas',
    value: string,
    checked: boolean,
  ) => {
    setFormData(prev => ({
      ...prev,
      [field]: checked
        ? [...(prev[field] as string[]), value]
        : (prev[field] as string[]).filter(item => item !== value),
    }));
  };

  const handleChipListChange = (field: 'key_messages' | 'hashtags', values: string[]) => {
    setFormData(prev => ({ ...prev, [field]: values }));
  };

  const handleStructuredDeliverablesChange = (deliverables: Deliverable[]) => {
    setStructuredDeliverables(deliverables);
  };

  const handleSave = async (saveStatus: 'draft' | 'published') => {
    if (!campaign) return;

    setIsSaving(true);
    try {
      const existingAnalysis = campaign.ai_analysis as Record<string, unknown> | null;

      const updates: Record<string, unknown> = {
        title: formData.title,
        description: formData.description,
        goals: formData.key_messages.length > 0
          ? formData.key_messages.join(', ')
          : formData.goals,
        deliverables: formData.deliverables,
        platforms: formData.platforms,
        budget_min: formData.budget_min ? parseFloat(formData.budget_min) : undefined,
        budget_max: formData.budget_max ? parseFloat(formData.budget_max) : undefined,
        deadline: formData.deadline || undefined,
        status: saveStatus,
        style: formData.style_direction || formData.style,
        tone: formData.tone,
        open_for_sponsorship: formData.open_for_sponsorship,
        delivery_type: formData.delivery_type || undefined,
        ai_analysis: {
          ...existingAnalysis,
          tagline: formData.tagline || null,
          campaign_type: formData.campaign_type || null,
          per_creator_cap: formData.per_creator_cap
            ? parseFloat(formData.per_creator_cap)
            : null,
          usage_rights_days: formData.usage_rights_days
            ? parseInt(formData.usage_rights_days, 10)
            : null,
          exclusivity_days: formData.exclusivity_days
            ? parseInt(formData.exclusivity_days, 10)
            : null,
          geographic_scope: formData.geographic_scope || null,
          creator_count: formData.target_creator_count
            ? parseInt(formData.target_creator_count, 10)
            : null,
          target_creator_personas: formData.target_creator_personas,
          hashtags: formData.hashtags,
          hashtag_requirements: formData.hashtags.join(' '),
          key_messages: formData.key_messages,
          style_direction: formData.style_direction || null,
          tier_reasoning: formData.tier_reasoning || null,
        },
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await updateCampaign.mutateAsync({ id: campaign.id, updates: updates as any });

      if (structuredDeliverables.length > 0) {
        await supabase
          .from('campaign_deliverables')
          .delete()
          .eq('campaign_id', campaign.id);

        await supabase
          .from('campaign_deliverables')
          .insert(
            structuredDeliverables.map((d, i) => ({
              campaign_id: campaign.id,
              content_type: d.content_type,
              platform: d.platform,
              aspect_ratio: d.aspect_ratio,
              max_duration_seconds: d.max_duration_seconds ?? null,
              description: d.description ?? null,
              sort_order: i,
            })),
          );

        queryClient.invalidateQueries({ queryKey: ['campaign_deliverables', campaign.id] });
      }

      toast({
        title: saveStatus === 'published' ? 'Campaign published!' : 'Campaign saved!',
        description: saveStatus === 'published'
          ? 'Your campaign is now live and visible to creators.'
          : 'Your changes have been saved as a draft.',
      });

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
    structuredDeliverables,
    handleInputChange,
    handleArrayChange,
    handleChipListChange,
    handleStructuredDeliverablesChange,
    handleSave,
  };
};
