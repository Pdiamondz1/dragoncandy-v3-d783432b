import { supabase } from '@/integrations/supabase/client';

function dataUrlToBlob(dataUrl: string): Blob {
  const [header, base64] = dataUrl.split(',');
  const mime = header.match(/:(.*?);/)?.[1] ?? 'image/jpeg';
  const bytes = atob(base64);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

export async function persistVideoThumbnail(
  fileId: string,
  frameDataUrl: string,
): Promise<boolean> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return false;

    const userId = session.user.id;
    const blob = dataUrlToBlob(frameDataUrl);
    const thumbPath = `${userId}/thumbs/${fileId}-thumb.jpg`;

    const { error: uploadErr } = await supabase.storage
      .from('campaign-deliverables')
      .upload(thumbPath, blob, {
        contentType: 'image/jpeg',
        cacheControl: '86400',
        upsert: true,
      });

    if (uploadErr) {
      console.warn('Thumbnail upload failed:', uploadErr.message);
      return false;
    }

    const { data: existing } = await supabase
      .from('file_uploads')
      .select('metadata')
      .eq('id', fileId)
      .single();

    const currentMeta = (existing?.metadata as Record<string, unknown>) ?? {};
    const { error: updateErr } = await supabase
      .from('file_uploads')
      .update({ metadata: { ...currentMeta, thumbnail_path: thumbPath } })
      .eq('id', fileId);

    if (updateErr) {
      console.warn('Thumbnail metadata update failed:', updateErr.message);
      return false;
    }

    return true;
  } catch (err) {
    console.warn('Thumbnail backfill failed:', err);
    return false;
  }
}
