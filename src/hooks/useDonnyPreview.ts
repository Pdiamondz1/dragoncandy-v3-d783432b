import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { MoodBoardData, StoryboardFrame } from '@/types/campaignMedia';

interface PreviewParams {
  campaignId: string;
  previewTypes: string[];
  styleNotes?: string;
}

interface PreviewResult {
  previews: Array<{
    id: string;
    preview_type: string;
    title: string;
    description: string;
    preview_data: Record<string, unknown>;
    media_url?: string;
  }>;
}

export const useDonnyPreview = () => {
  return useMutation({
    mutationFn: async ({ campaignId, previewTypes, styleNotes }: PreviewParams): Promise<PreviewResult> => {
      const { data, error } = await supabase.functions.invoke('donny-campaign-preview', {
        body: {
          action: 'generate',
          campaign_id: campaignId,
          preview_types: previewTypes,
          style_notes: styleNotes,
        },
      });
      if (error) throw error;
      return data as PreviewResult;
    },
  });
};

export function extractMoodBoard(previews: PreviewResult['previews']): MoodBoardData | null {
  const moodBoard = previews.find((p) => p.preview_type === 'mood_board');
  if (!moodBoard) return null;
  const pd = moodBoard.preview_data as Record<string, unknown>;
  return {
    title: moodBoard.title,
    color_palette: (pd.color_palette as string[]) || [],
    typography: pd.typography as { heading: string; body: string } | undefined,
    layout_description: (pd.layout_description as string) || '',
    reference_descriptions: pd.reference_descriptions as string[] | undefined,
  };
}

export function extractStoryboard(previews: PreviewResult['previews']): StoryboardFrame[] {
  const storyboard = previews.find((p) => p.preview_type === 'storyboard');
  if (!storyboard) return [];
  const pd = storyboard.preview_data as Record<string, unknown>;
  return (pd.frames as StoryboardFrame[]) || [];
}
