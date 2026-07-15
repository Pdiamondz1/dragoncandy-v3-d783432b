import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';

/**
 * The known crew-activity event types (mirrors the DB `event_type` domain).
 * NB: there is deliberately no `paid` event.
 */
export type CrewActivityEventType =
  | 'campaign_posted'
  | 'application_received'
  | 'hired'
  | 'content_submitted'
  | 'content_approved'
  | 'revision_requested'
  | 'completed';

/** Shape of the `metadata` JSONB column we read for the feed summary. */
export interface CrewActivityMetadata {
  campaign_title?: string;
  creator_name?: string;
}

/** A single crew-activity feed row, normalized for the UI. */
export interface CrewActivityRow {
  id: string;
  campaign_id: string;
  actor_id: string | null;
  participant_id: string | null;
  /** DB is a free `text`; the UI switch handles known types + a fallback. */
  event_type: string;
  visibility: string;
  metadata: CrewActivityMetadata;
  created_at: string;
}

/** Shared `.select()` column list (avoids `select *`). */
export const CREW_ACTIVITY_SELECT =
  'id, campaign_id, actor_id, participant_id, event_type, visibility, metadata, created_at';

/** Safely narrow the JSONB `metadata` blob to the fields the feed uses. */
export function toCrewActivityMetadata(raw: Json | null): CrewActivityMetadata {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const obj = raw as Record<string, Json | undefined>;
  const meta: CrewActivityMetadata = {};
  if (typeof obj.campaign_title === 'string') meta.campaign_title = obj.campaign_title;
  if (typeof obj.creator_name === 'string') meta.creator_name = obj.creator_name;
  return meta;
}

/** The raw row shape returned by the shared `CREW_ACTIVITY_SELECT`. */
export interface RawCrewActivityRow {
  id: string;
  campaign_id: string;
  actor_id: string | null;
  participant_id: string | null;
  event_type: string;
  visibility: string;
  metadata: Json;
  created_at: string;
}

/** Normalize a raw DB row into the UI-facing {@link CrewActivityRow}. */
export function normalizeCrewActivityRow(row: RawCrewActivityRow): CrewActivityRow {
  return {
    id: row.id,
    campaign_id: row.campaign_id,
    actor_id: row.actor_id,
    participant_id: row.participant_id,
    event_type: row.event_type,
    visibility: row.visibility,
    metadata: toCrewActivityMetadata(row.metadata),
    created_at: row.created_at,
  };
}

/**
 * Crew-wide activity feed for a single crew ("creator group").
 *
 * RLS scopes what's visible: the owner sees every row for their crews; a
 * creator sees the crew-wide rows plus their own participation. We do NOT
 * filter by role client-side — the policy is the source of truth.
 *
 * `refetchOnWindowFocus` is on because rows are written from other pages
 * (campaign posts, applications, approvals), so the feed should freshen when
 * the user returns to this tab.
 */
export function useCrewActivity(groupId: string) {
  const query = useQuery({
    queryKey: ['crew-activity', groupId],
    queryFn: async (): Promise<CrewActivityRow[]> => {
      const { data, error } = await supabase
        .from('crew_activity')
        .select(CREW_ACTIVITY_SELECT)
        .eq('group_id', groupId)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) {
        console.error('Error fetching crew activity:', error);
        throw error;
      }
      return (data ?? []).map(normalizeCrewActivityRow);
    },
    enabled: !!groupId,
    refetchOnWindowFocus: true,
  });

  return {
    activity: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
  };
}
