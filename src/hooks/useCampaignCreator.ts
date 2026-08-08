// src/hooks/useCampaignCreator.ts
import { useState, useCallback, useRef, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { mapDeliveryTierToDb } from '@/lib/campaignUtils';
import { donnyGenerateResponseSchema, launchValidationSchema } from '@/lib/campaignCreatorValidation';
import { pollCampaignJob, type CampaignJobRow } from '@/lib/campaignGenerationJob';
import { saveDraftToStorage, loadDraftFromStorage, clearDraftFromStorage, generateDraftId } from '@/lib/campaignCreatorDraft';
import { normalizeAudienceLine, normalizeCampaignTags } from '@/lib/campaignAudience';
import { recordCrewActivity } from '@/lib/crews/recordCrewActivity';
import { dispatchNotifications } from '@/lib/notifications/dispatch';
import type {
  BusinessContext,
  CampaignIdea,
  EditableCampaign,
  BrandFields,
  DonnyGenerateRequest,
} from '@/types/campaignCreator';
import type { Deliverable } from '@/types/campaignMedia';
import type { InspirationRef } from '@/types/firstRun';
import { TIER_LIMITS } from '@/types/campaignMedia';

type Screen = 'drop' | 'launchpad';

function ideaToEditableCampaign(idea: CampaignIdea): EditableCampaign {
  const deliverables: Deliverable[] = idea.deliverables.map((d) => ({
    id: crypto.randomUUID(),
    content_type: d.content_type,
    platform: d.platform,
    aspect_ratio: d.aspect_ratio,
    max_duration_seconds: d.estimated_duration ?? undefined,
    description: d.description,
  }));

  const deadline = new Date();
  deadline.setDate(deadline.getDate() + idea.timeline_days);

  return {
    title: idea.title,
    description: idea.description,
    tagline: (idea.tagline ?? '').slice(0, 120), // launchValidationSchema caps tagline at 120; the AI now emits one, so clamp defensively
    campaign_type: idea.campaign_type,
    platforms: [...idea.recommended_platforms],
    deliverables,
    // Start empty on purpose. A pre-filled price reads as "this is what I owe"; the business
    // sets it from the suggested range in CampaignEditor. See src/lib/campaignPricing.ts.
    fixed_price: 0,
    per_creator_cap: 0,
    usage_rights_days: 30,
    exclusivity_days: 14,
    geographic_scope: 'city' as const,
    target_creator_count: 2,
    deadline: deadline.toISOString().split('T')[0],
    delivery_type: mapDeliveryTierToDb(idea.tier) as EditableCampaign['delivery_type'],
    style_direction: idea.style_direction,
    // Already normalized at whichever boundary produced this idea (Zod or normalizeDraft).
    target_audience: idea.target_audience,
    campaign_tags: [...idea.campaign_tags],
    key_messages: [...idea.key_messages],
    hashtags: [...idea.hashtags],
    tier_reasoning: idea.tier_reasoning,
    emoji: idea.emoji,
    original_idea_id: idea.id,
    posting_preferences: {
      spread_strategy: 'auto' as const,
      spread_window_days: 14 as const,
      auto_schedule_on_approval: true,
    },
  };
}

/**
 * Human-readable detail for a failed generation. A supabase-js
 * `FunctionsFetchError` means the fetch itself died before a response —
 * mobile browsers drop long requests when the tab is backgrounded — so the
 * raw "Failed to send a request to the Edge Function" is misleading jargon.
 */
export function describeGenerationError(err: unknown): string {
  const e = err as { name?: string; message?: string; context?: { error?: string; status?: number } };
  if (e?.name === 'FunctionsFetchError') {
    return 'The connection dropped mid-generation — tap Generate to try again.';
  }
  // functions.invoke exposes the body only on 2xx, so the 429 rate-limit JSON
  // never reaches the caller — map it here instead of showing generic copy.
  if (e?.name === 'FunctionsHttpError' && e?.context?.status === 429) {
    return "You're generating too fast — give it a minute, then try again.";
  }
  if (e?.name === 'CampaignJobTimeoutError') {
    return 'This is taking longer than usual — try again in a minute.';
  }
  if (e?.name === 'CampaignJobFailedError') {
    return e.message ?? 'Generation failed';
  }
  return e?.context?.error ?? e?.message ?? 'Unknown error';
}

/**
 * Runs a generation through the async-job flow: the edge function returns a
 * `job_id` immediately and finishes server-side; we poll our own
 * campaign_generation_jobs row, which survives connection drops and mobile
 * tab backgrounding. If the deployed function predates async jobs (skew
 * window) it returns the full payload synchronously — passed through as-is.
 */
async function generateViaAsyncJob(
  request: DonnyGenerateRequest,
  onProgress: (message: string) => void,
): Promise<unknown> {
  const { data, error } = await supabase.functions.invoke('donny-campaign-generate', {
    body: { ...request, async: true },
  });
  if (error) throw error;

  const jobId = (data as { job_id?: string } | null)?.job_id;
  if (!jobId) return data;

  return pollCampaignJob(
    async () => {
      const { data: row, error: rowError } = await supabase
        .from('campaign_generation_jobs')
        .select('status, progress, result, error')
        .eq('id', jobId)
        .maybeSingle();
      if (rowError) throw rowError;
      return row as CampaignJobRow | null;
    },
    { onProgress },
  );
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

  // Donny chat handoff: a `?brief=` param means Donny scoped a campaign in chat.
  // We react to the param (not just mount) so it also works when the user is
  // already on the builder — same-route navigation keeps this component mounted.
  // A ref dedupes so each distinct brief fires generation exactly once.
  const [searchParams, setSearchParams] = useSearchParams();
  const lastBriefRef = useRef<string | null>(null);

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

  // Group ("crew") target: null = public marketplace; a crew id = a free, private
  // group campaign (only active members see it, no payment). Kept separate from
  // EditableCampaign so the paid/public path stays byte-for-byte unchanged.
  const [groupId, setGroupId] = useState<string | null>(null);

  // Inspiration refs (from InspirationStrip on DropScreen)
  const [inspirationRefs, setInspirationRefs] = useState<InspirationRef[]>([]);

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

    let sourceUrl: string | undefined;
    let manualText: string | undefined;

    try {
      if (mode === 'url') addMessage("Checking out your restaurant...");
      else if (mode === 'photo') addMessage("Analyzing your photo...");
      else addMessage("Got it, let me work with that...");

      if (mode === 'url') {
        const lines = value.split('\n');
        sourceUrl = lines.find(l => /^https?:\/\//i.test(l.trim()))?.trim();
        const textParts = lines.filter(l => !/^https?:\/\//i.test(l.trim())).join('\n').trim();
        if (textParts) manualText = textParts;
      } else if (mode === 'photo') {
        // photo mode: value is the object URL
      } else {
        manualText = value;
      }

      let connectedPlatforms: DonnyGenerateRequest['connected_platforms'];
      if (user) {
        try {
          const { data: accts } = await supabase
            .from('business_outstand_accounts')
            .select('platform, platform_handle')
            .eq('user_id', user.id)
            .eq('status', 'active');
          if (accts?.length) {
            connectedPlatforms = accts.map((a) => ({
              platform: a.platform,
              platform_handle: a.platform_handle,
            }));
          }
        } catch {
          // non-blocking — proceed without platform info
        }
      }

      const request: DonnyGenerateRequest = {
        source_type: mode === 'url' && sourceUrl ? detectUrlType(sourceUrl) : mode === 'photo' ? 'photo' : 'manual',
        role: userRole,
        inspiration_refs: inspirationRefs.length > 0 ? inspirationRefs : undefined,
        connected_platforms: connectedPlatforms,
      };

      if (sourceUrl) request.source_url = sourceUrl;
      if (mode === 'photo') request.photo_url = value;
      if (manualText) request.manual_text = manualText;

      // A 429 rate-limit makes functions.invoke throw (bodies are only exposed
      // on 2xx), so it surfaces via describeGenerationError's 429 mapping.
      const data = await generateViaAsyncJob(request, addMessage);

      const parsed = donnyGenerateResponseSchema.parse(data);
      setBusinessContext(parsed.business_context as BusinessContext);
      setCampaignIdeas(parsed.campaign_ideas as CampaignIdea[]);

      if (sourceUrl && parsed._meta?.url_extracted === false) {
        addMessage("Couldn't read that link, but your description worked great!");
      } else {
        addMessage(`Found ${parsed.business_context.business_name} — looking good!`);
      }

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
    } catch (err: unknown) {
      const detail = describeGenerationError(err);
      console.error('Campaign extraction error:', detail, err);
      if (mode === 'url' && !manualText) {
        addMessage("I couldn't read that link. Try adding a description too — like what you serve or want to promote.");
        toast.error("Couldn't read that link — add a description and try again");
      } else {
        addMessage(`Something went wrong: ${detail}`);
        toast.error(`Generation failed: ${detail}`);
      }
    } finally {
      setIsExtracting(false);
    }
  }, [userRole, user, inspirationRefs]);

  // Donny chat handoff: when a `?brief=` param appears, auto-run generation from
  // it, then strip the param. Waits for the user's role (so we send the correct
  // one) and for any in-flight generation to settle before consuming the brief,
  // and dedupes via lastBriefRef so each distinct brief fires exactly once — this
  // also covers same-route navigation when the user is already on the builder.
  useEffect(() => {
    const brief = searchParams.get('brief');
    if (!brief) return;
    if (userRole === null) return;
    if (isExtracting) return;
    if (lastBriefRef.current === brief) return;
    lastBriefRef.current = brief;

    const next = new URLSearchParams(searchParams);
    next.delete('brief');
    setSearchParams(next, { replace: true });

    void submitInput(brief, 'text');
  }, [searchParams, userRole, isExtracting, submitInput, setSearchParams]);

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

      const data = await generateViaAsyncJob(
        request,
        (msg) => setExtractionMessages((prev) => [...prev, msg]),
      );

      const parsed = donnyGenerateResponseSchema.parse(data);
      setCampaignIdeas(parsed.campaign_ideas as CampaignIdea[]);
      setExtractionMessages(["Here are 3 new ideas!"]);
    } catch (err) {
      toast.error('Failed to regenerate', { description: describeGenerationError(err) });
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

      // Free crew campaigns are exempt from the $50 marketplace minimum (they carry
      // fixed_price 0, forced below). Satisfy the schema's min-price rule with a
      // sentinel so the OTHER field validations (title, deadline, deliverables) still
      // run for group campaigns; the real price is overridden to 0 in the group block.
      const validationInput = groupId
        ? { ...editedCampaign, fixed_price: Math.max(editedCampaign.fixed_price ?? 0, 50) }
        : editedCampaign;
      const validated = launchValidationSchema.parse(validationInput);

      const insertPayload: Record<string, unknown> = {
        user_id: user.id,
        title: validated.title,
        description: validated.description,
        goals: editedCampaign.key_messages.join(', '),
        platforms: editedCampaign.platforms,
        fixed_price: validated.fixed_price,
        pricing_type: 'fixed',
        deadline: validated.deadline,
        delivery_type: validated.delivery_type,
        delivery_fee: resolveTierFee(editedCampaign.delivery_type),
        posting_preferences: editedCampaign.posting_preferences ?? null,
        posting_schedule_status: editedCampaign.posting_preferences ? 'configured' : 'not_configured',
        style: editedCampaign.style_direction,
        status: 'published' as const,
        campaign_deliverables: editedCampaign.deliverables.map((d) => ({
          content_type: d.content_type,
          platform: d.platform,
          aspect_ratio: d.aspect_ratio,
          max_duration_seconds: d.max_duration_seconds ?? null,
          description: d.description ?? null,
        })),
        ai_analysis: {
          ...businessContext,
          brand_fields: userRole === 'brand' ? brandFields : undefined,
          tagline: editedCampaign.tagline || null,
          campaign_type: editedCampaign.campaign_type,
          per_creator_cap: editedCampaign.per_creator_cap || null,
          usage_rights_days: editedCampaign.usage_rights_days,
          exclusivity_days: editedCampaign.exclusivity_days,
          geographic_scope: editedCampaign.geographic_scope,
          creator_count: editedCampaign.target_creator_count,
          // Free-typed in the editor, so clamp here — this is where it enters ai_analysis.
          target_audience: normalizeAudienceLine(editedCampaign.target_audience) || null,
          campaign_tags: normalizeCampaignTags(editedCampaign.campaign_tags),
          hashtags: editedCampaign.hashtags,
          hashtag_requirements: editedCampaign.hashtags.join(' '),
          tier_reasoning: editedCampaign.tier_reasoning,
          key_messages: editedCampaign.key_messages,
          style_direction: editedCampaign.style_direction,
          delivery_fee: resolveTierFee(editedCampaign.delivery_type),
        },
      };

      // Group campaign: force free, single-winner, private terms. Setting group_id
      // routes the campaign through the private-visibility RLS chokepoint; free
      // terms (fixed_price 0 / no fee) remove the Stripe apply-time gate. The
      // public/paid path (group_id null) is completely untouched.
      if (groupId) {
        insertPayload.group_id = groupId;
        insertPayload.fixed_price = 0;
        insertPayload.pricing_type = 'fixed';
        insertPayload.delivery_fee = 0;
        const analysis = insertPayload.ai_analysis as Record<string, unknown>;
        // Defensive single-winner: enforce_single_slot_campaign reads
        // (ai_analysis->>'creator_count'), so set it in the JSONB — there is no
        // top-level campaigns.creator_count column in prod.
        analysis.creator_count = 1;
        analysis.delivery_fee = 0;
      }

      const { data, error } = await supabase
        .from('campaigns')
        .insert(insertPayload as unknown as Database['public']['Tables']['campaigns']['Insert'])
        .select('id')
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: async (data) => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      clearDraftFromStorage();
      toast.success('Campaign launched!');

      // Notify active crew members that a new group campaign was posted. Routed
      // through the create-notification choke point (bell + email + Donny); never
      // send-notification-email directly. Fire-and-forget, never blocks the launch.
      if (groupId && user) {
        try {
          const { data: members } = await supabase
            .from('creator_group_members')
            .select('creator_id')
            .eq('group_id', groupId)
            .eq('status', 'active');
          const actorName = profile?.business_name ?? 'A business';
          // dispatchNotifications reads the error off the result — invoke resolves
          // (not rejects) on a non-2xx, so the old `.catch()` here logged nothing
          // when a member's notification actually failed.
          const { failed } = await dispatchNotifications(
            (members ?? []).map((member) => ({
              recipientId: member.creator_id,
              type: 'group_campaign_posted',
              category: 'campaigns',
              title: 'New crew campaign',
              body: `${actorName} posted a new campaign`,
              actionUrl: '/dashboard/creator/campaigns?crews=1',
              actorId: user.id,
              actorName,
              icon: 'campaign',
              data: { campaign_id: data.id, group_id: groupId },
              emailData: { campaignTitle: editedCampaign?.title ?? 'a new campaign', businessName: actorName },
            })),
          );
          if (failed > 0) {
            console.error(`Crew campaign notification failed for ${failed} member(s)`);
          }
        } catch (err) {
          console.error('Failed to prepare crew campaign notifications:', err);
        }

        // Crew activity for the launch (companion to group_campaign_posted above).
        void recordCrewActivity(data.id, 'campaign_posted');
      }

      if (userRole === 'brand') {
        navigate(`/dashboard/brand/campaigns/${data.id}`);
      } else {
        navigate(`/dashboard/business/campaigns/${data.id}`);
      }
    },
    onError: (err: unknown) => {
      const detail = (err as { message?: string })?.message ?? String(err);
      console.error('Campaign launch error:', detail, err);
      toast.error(`Launch failed: ${detail}`);
    },
  });

  const launchCampaign = useCallback(async () => {
    await launchMutation.mutateAsync();
  }, [launchMutation]);

  const saveDraft = useCallback(async () => {
    if (!editedCampaign) return;
    if (user) {
      const draftPayload: Record<string, unknown> = {
        user_id: user.id,
        title: editedCampaign.title,
        description: editedCampaign.description,
        goals: editedCampaign.key_messages.join(', '),
        platforms: editedCampaign.platforms,
        fixed_price: editedCampaign.fixed_price,
        pricing_type: 'fixed',
        deadline: editedCampaign.deadline,
        delivery_type: editedCampaign.delivery_type,
        delivery_fee: resolveTierFee(editedCampaign.delivery_type),
        style: editedCampaign.style_direction,
        status: 'draft' as const,
        ai_analysis: {
          ...businessContext,
          brand_fields: userRole === 'brand' ? brandFields : undefined,
          tagline: editedCampaign.tagline || null,
          campaign_type: editedCampaign.campaign_type,
          per_creator_cap: editedCampaign.per_creator_cap || null,
          usage_rights_days: editedCampaign.usage_rights_days,
          exclusivity_days: editedCampaign.exclusivity_days,
          geographic_scope: editedCampaign.geographic_scope,
          creator_count: editedCampaign.target_creator_count,
          // Free-typed in the editor, so clamp here — this is where it enters ai_analysis.
          target_audience: normalizeAudienceLine(editedCampaign.target_audience) || null,
          campaign_tags: normalizeCampaignTags(editedCampaign.campaign_tags),
          hashtags: editedCampaign.hashtags,
          hashtag_requirements: editedCampaign.hashtags.join(' '),
          key_messages: editedCampaign.key_messages,
          style_direction: editedCampaign.style_direction,
          tier_reasoning: editedCampaign.tier_reasoning,
          delivery_fee: resolveTierFee(editedCampaign.delivery_type),
        },
      };
      // Crew draft: preserve private/free targeting so a saved crew draft stays a free
      // private campaign (mirrors the launch overrides) rather than reverting to a paid
      // public draft.
      if (groupId) {
        draftPayload.group_id = groupId;
        draftPayload.fixed_price = 0;
        draftPayload.delivery_fee = 0;
        const analysis = draftPayload.ai_analysis as Record<string, unknown>;
        analysis.creator_count = 1;
        analysis.delivery_fee = 0;
      }
      const { error } = await supabase
        .from('campaigns')
        .insert(draftPayload as unknown as Database['public']['Tables']['campaigns']['Insert']);
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
  }, [editedCampaign, user, businessContext, draftId, selectedIdeaId, campaignIdeas, brandFields, userRole, groupId]);

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
    inspirationRefs,
    setInspirationRefs,
    groupId,
    setGroupId,
    submitInput,
    selectIdea,
    regenerateIdeas,
    updateField,
    updateBrandField,
    launchCampaign,
    saveDraft,
  };
}
