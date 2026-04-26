// src/hooks/useCampaignCreator.ts
import { useState, useCallback, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { mapDeliveryTierToDb } from '@/lib/campaignUtils';
import { donnyGenerateResponseSchema, launchValidationSchema } from '@/lib/campaignCreatorValidation';
import { saveDraftToStorage, loadDraftFromStorage, clearDraftFromStorage, generateDraftId } from '@/lib/campaignCreatorDraft';
import type {
  BusinessContext,
  CampaignIdea,
  EditableCampaign,
  BrandFields,
  DonnyGenerateRequest,
} from '@/types/campaignCreator';
import type { Deliverable } from '@/types/campaignMedia';
import { TIER_LIMITS } from '@/types/campaignMedia';

type Screen = 'drop' | 'launchpad';

function ideaToEditableCampaign(idea: CampaignIdea): EditableCampaign {
  const deliverables: Deliverable[] = idea.deliverables.map((d) => ({
    id: crypto.randomUUID(),
    content_type: d.content_type,
    platform: d.platform,
    aspect_ratio: d.aspect_ratio,
    max_duration_seconds: d.estimated_duration,
    description: d.description,
  }));

  const deadline = new Date();
  deadline.setDate(deadline.getDate() + idea.timeline_days);

  return {
    title: idea.title,
    description: idea.description,
    campaign_type: idea.campaign_type,
    platforms: [...idea.recommended_platforms],
    deliverables,
    budget_min: idea.budget_range.min,
    budget_max: idea.budget_range.max,
    deadline: deadline.toISOString().split('T')[0],
    delivery_type: mapDeliveryTierToDb(idea.tier) as EditableCampaign['delivery_type'],
    style_direction: idea.style_direction,
    target_creator_persona: [...idea.target_creator_persona],
    key_messages: [...idea.key_messages],
    hashtags: [...idea.hashtags],
    tier_reasoning: idea.tier_reasoning,
    emoji: idea.emoji,
    original_idea_id: idea.id,
  };
}

function detectUrlType(url: string): BusinessContext['source_type'] {
  if (url.includes('google.com/maps') || url.includes('goo.gl') || url.includes('business.google')) return 'google_business';
  if (url.includes('instagram.com')) return 'instagram';
  if (url.includes('yelp.com')) return 'yelp';
  return 'website';
}

function resolveTierFee(deliveryType: EditableCampaign['delivery_type']): number {
  const tierMap: Record<string, keyof typeof TIER_LIMITS> = {
    dragonrush: 'dragondash',
    expedited: 'express',
    standard: 'standard',
  };
  const tierKey = tierMap[deliveryType] ?? 'standard';
  return TIER_LIMITS[tierKey].fee;
}

export function useCampaignCreator() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Role
  const [userRole, setUserRole] = useState<'business_client' | 'brand' | null>(null);

  // Screen 1 state
  const [screen, setScreen] = useState<Screen>('drop');
  const [inputMode, setInputMode] = useState<'url' | 'photo' | 'text'>('url');
  const [inputValue, setInputValue] = useState('');
  const [isExtracting, setIsExtracting] = useState(false);
  const [businessContext, setBusinessContext] = useState<BusinessContext | null>(null);
  const [extractionMessages, setExtractionMessages] = useState<string[]>([]);

  // Screen 2 state
  const [campaignIdeas, setCampaignIdeas] = useState<CampaignIdea[] | null>(null);
  const [selectedIdeaId, setSelectedIdeaId] = useState<string | null>(null);
  const [editedCampaign, setEditedCampaign] = useState<EditableCampaign | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [brandFields, setBrandFields] = useState<BrandFields | null>(null);

  // Persistence
  const [draftId, setDraftId] = useState<string | null>(null);
  const isAuthenticated = !!user;

  // Detect role from profile (already loaded by AuthContext)
  useEffect(() => {
    if (!profile) {
      setUserRole(null);
      return;
    }
    if (profile.role === 'brand') {
      setUserRole('brand');
      setBrandFields({
        budget_pool: 0,
        per_creator_cap: 0,
        usage_rights_days: 180,
        exclusivity_days: 0,
        geographic_scope: 'city',
        target_creator_count: 3,
      });
    } else {
      setUserRole('business_client');
    }
  }, [profile]);

  // Restore draft on mount
  useEffect(() => {
    if (!isAuthenticated) {
      const draft = loadDraftFromStorage();
      if (draft) {
        setBusinessContext(draft.businessContext);
        setCampaignIdeas(draft.campaignIdeas);
        setSelectedIdeaId(draft.selectedIdeaId);
        setEditedCampaign(draft.editedCampaign);
        setBrandFields(draft.brandFields);
        setDraftId(draft.id);
        if (draft.campaignIdeas) setScreen('launchpad');
      }
    }
  }, [isAuthenticated]);

  // Auto-save debounce
  const triggerAutoSave = useCallback(() => {
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => {
      const id = draftId || generateDraftId();
      if (!draftId) setDraftId(id);
      saveDraftToStorage({
        id,
        businessContext,
        selectedIdeaId,
        campaignIdeas,
        editedCampaign,
        brandFields,
        updatedAt: new Date().toISOString(),
      });
    }, 30_000);
  }, [draftId, businessContext, selectedIdeaId, campaignIdeas, editedCampaign, brandFields]);

  // Screen 1: Submit input
  const submitInput = useCallback(async (value: string, mode: 'url' | 'photo' | 'text') => {
    setInputMode(mode);
    setInputValue(value);
    setIsExtracting(true);
    setExtractionMessages([]);

    const addMessage = (msg: string) => setExtractionMessages((prev) => [...prev, msg]);

    try {
      if (mode === 'url') addMessage("Checking out your business...");
      else if (mode === 'photo') addMessage("Analyzing your photo...");
      else addMessage("Got it, let me work with that...");

      const request: DonnyGenerateRequest = {
        source_type: mode === 'url' ? detectUrlType(value) : mode === 'photo' ? 'photo' : 'manual',
        role: userRole,
      };

      if (mode === 'url') request.source_url = value;
      else if (mode === 'photo') request.photo_url = value;
      else request.manual_text = value;

      const { data, error } = await supabase.functions.invoke('donny-campaign-generate', {
        body: request,
      });

      if (error) throw error;

      const parsed = donnyGenerateResponseSchema.parse(data);
      setBusinessContext(parsed.business_context);
      setCampaignIdeas(parsed.campaign_ideas);

      addMessage(`Found ${parsed.business_context.business_name} — looking good!`);

      // Cache business context for authenticated users
      if (user) {
        await supabase.from('business_contexts').insert({
          profile_id: user.id,
          source_url: parsed.business_context.source_url,
          source_type: parsed.business_context.source_type,
          extracted_data: parsed.business_context as unknown as Record<string, unknown>,
        });
      }

      setScreen('launchpad');
    } catch (err) {
      addMessage("I couldn't read that — want to try a different link, or just tell me about your business?");
      toast.error('Extraction failed', { description: String(err) });
    } finally {
      setIsExtracting(false);
    }
  }, [userRole, user]);

  // Screen 2: Select idea
  const selectIdea = useCallback((ideaId: string) => {
    const idea = campaignIdeas?.find((i) => i.id === ideaId);
    if (!idea) return;
    setSelectedIdeaId(ideaId);
    setEditedCampaign(ideaToEditableCampaign(idea));
    setIsExpanded(true);
    triggerAutoSave();
  }, [campaignIdeas, triggerAutoSave]);

  // Screen 2: Regenerate
  const regenerateIdeas = useCallback(async () => {
    if (!businessContext) return;
    setIsExtracting(true);
    setSelectedIdeaId(null);
    setEditedCampaign(null);
    setIsExpanded(false);
    setExtractionMessages(["Let me think of something different..."]);

    try {
      const request: DonnyGenerateRequest = {
        source_type: businessContext.source_type,
        source_url: businessContext.source_url || undefined,
        manual_text: businessContext.source_type === 'manual' ? inputValue : undefined,
        role: userRole,
      };

      const { data, error } = await supabase.functions.invoke('donny-campaign-generate', {
        body: request,
      });

      if (error) throw error;
      const parsed = donnyGenerateResponseSchema.parse(data);
      setCampaignIdeas(parsed.campaign_ideas);
      setExtractionMessages(["Here are 3 new ideas!"]);
    } catch (err) {
      toast.error('Failed to regenerate', { description: String(err) });
    } finally {
      setIsExtracting(false);
    }
  }, [businessContext, inputValue, userRole]);

  // Screen 2: Update campaign field
  const updateField = useCallback(<K extends keyof EditableCampaign>(
    field: K,
    value: EditableCampaign[K]
  ) => {
    setEditedCampaign((prev) => prev ? { ...prev, [field]: value } : prev);
    triggerAutoSave();
  }, [triggerAutoSave]);

  // Screen 2: Update brand field
  const updateBrandField = useCallback(<K extends keyof BrandFields>(
    field: K,
    value: BrandFields[K]
  ) => {
    setBrandFields((prev) => prev ? { ...prev, [field]: value } : prev);
    triggerAutoSave();
  }, [triggerAutoSave]);

  // Launch campaign
  const launchMutation = useMutation({
    mutationFn: async () => {
      if (!editedCampaign) throw new Error('No campaign to launch');
      if (!user) throw new Error('Must be authenticated to launch');

      const validated = launchValidationSchema.parse(editedCampaign);

      const insertPayload: Record<string, unknown> = {
        user_id: user.id,
        title: validated.title,
        description: validated.description,
        goals: editedCampaign.key_messages.join(', '),
        platforms: editedCampaign.platforms,
        budget_min: validated.budget_min,
        budget_max: validated.budget_max,
        deadline: validated.deadline,
        delivery_type: validated.delivery_type,
        delivery_fee: resolveTierFee(editedCampaign.delivery_type),
        style: editedCampaign.style_direction,
        status: 'published' as const,
        ai_analysis: {
          ...businessContext,
          brand_fields: userRole === 'brand' ? brandFields : undefined,
          target_creator_persona: editedCampaign.target_creator_persona,
          hashtags: editedCampaign.hashtags,
          tier_reasoning: editedCampaign.tier_reasoning,
        },
      };

      const { data, error } = await supabase
        .from('campaigns')
        .insert(insertPayload as Parameters<typeof supabase.from<'campaigns'>>[0] extends infer T ? Record<string, unknown> : never)
        .select('id')
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      clearDraftFromStorage();
      toast.success('Campaign launched!');
      if (userRole === 'brand') {
        navigate(`/dashboard/brand/campaigns/${data.id}`);
      } else {
        navigate(`/dashboard/business/campaigns/${data.id}`);
      }
    },
    onError: (err) => {
      toast.error('Launch failed', { description: String(err) });
    },
  });

  const launchCampaign = useCallback(async () => {
    await launchMutation.mutateAsync();
  }, [launchMutation]);

  const saveDraft = useCallback(async () => {
    if (!editedCampaign) return;
    if (user) {
      const { error } = await supabase.from('campaigns').insert({
        user_id: user.id,
        title: editedCampaign.title,
        description: editedCampaign.description,
        budget_min: editedCampaign.budget_min,
        budget_max: editedCampaign.budget_max,
        deadline: editedCampaign.deadline,
        delivery_type: editedCampaign.delivery_type,
        status: 'draft' as const,
        ai_analysis: businessContext as unknown as Record<string, unknown>,
      });
      if (error) throw error;
      toast.success('Draft saved');
    } else {
      const id = draftId || generateDraftId();
      if (!draftId) setDraftId(id);
      saveDraftToStorage({
        id,
        businessContext,
        selectedIdeaId,
        campaignIdeas,
        editedCampaign,
        brandFields,
        updatedAt: new Date().toISOString(),
      });
      toast.success('Draft saved locally');
    }
  }, [editedCampaign, user, businessContext, draftId, selectedIdeaId, campaignIdeas, brandFields]);

  return {
    screen,
    inputMode,
    inputValue,
    isExtracting,
    businessContext,
    extractionMessages,
    campaignIdeas,
    selectedIdeaId,
    editedCampaign,
    isExpanded,
    userRole,
    brandFields,
    draftId,
    isAuthenticated,
    isLaunching: launchMutation.isPending,
    submitInput,
    selectIdea,
    regenerateIdeas,
    updateField,
    updateBrandField,
    launchCampaign,
    saveDraft,
  };
}
