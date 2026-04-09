import { supabase } from '@/integrations/supabase/client';

/**
 * SAFETY: This function ONLY deletes temporary reference/sample media
 * uploaded by restaurants during campaign creation. It NEVER touches:
 *   - campaign_deliverables (approved creator content)
 *   - creator portfolio content
 *   - Dragon Feed content (portfolio-based, separate system)
 *
 * Media types targeted: 'reference_image', 'reference_video', 'raw_footage'
 * Storage bucket: 'campaign-assets'
 */

const CLEANUP_MEDIA_TYPES = ['reference_image', 'reference_video', 'raw_footage'] as const;

function extractStoragePath(fileUrl: string): string | null {
  // Supabase Storage URLs:
  // https://xxx.supabase.co/storage/v1/object/public/campaign-assets/campaigns/abc/media/...
  const marker = '/storage/v1/object/public/campaign-assets/';
  const idx = fileUrl.indexOf(marker);
  if (idx === -1) return null;
  return fileUrl.substring(idx + marker.length);
}

export async function cleanupCampaignMedia(campaignId: string): Promise<void> {
  // 1. Fetch only reference/sample media for this campaign
  // @ts-ignore — campaign_media not in generated types yet
  const { data: media, error: fetchError } = await supabase
    .from('campaign_media')
    .select('id, file_url, file_name, media_type')
    .eq('campaign_id', campaignId)
    .in('media_type', [...CLEANUP_MEDIA_TYPES]);

  if (fetchError) {
    console.error(`[cleanupCampaignMedia] Failed to fetch media for campaign ${campaignId}:`, fetchError);
    return;
  }

  if (!media || media.length === 0) {
    console.log(`[cleanupCampaignMedia] No reference media to clean up for campaign ${campaignId}`);
    return;
  }

  // 2. Extract storage paths and filter out any that couldn't be parsed
  const filePaths = media
    .map((m: { file_url: string }) => extractStoragePath(m.file_url))
    .filter((p: string | null): p is string => p !== null);

  // 3. Delete files from Supabase Storage (campaign-assets bucket)
  if (filePaths.length > 0) {
    const { error: storageError } = await supabase
      .storage
      .from('campaign-assets')
      .remove(filePaths);

    if (storageError) {
      console.error(`[cleanupCampaignMedia] Storage deletion failed for campaign ${campaignId}:`, storageError);
      // Continue to delete DB records even if storage cleanup fails —
      // orphaned storage files can be cleaned up later via a sweep.
    }
  }

  // 4. Delete the database records
  const mediaIds = media.map((m: { id: string }) => m.id);
  // @ts-ignore — campaign_media not in generated types yet
  const { error: deleteError } = await supabase
    .from('campaign_media')
    .delete()
    .in('id', mediaIds);

  if (deleteError) {
    console.error(`[cleanupCampaignMedia] DB record deletion failed for campaign ${campaignId}:`, deleteError);
    return;
  }

  console.log(
    `[cleanupCampaignMedia] Cleaned up ${media.length} reference file(s) for campaign ${campaignId}`
  );
}
