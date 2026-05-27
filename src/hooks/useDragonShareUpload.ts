import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

export function useDragonShareUpload() {
  const { user } = useAuth();
  const [uploading, setUploading] = useState(false);

  const upload = async (file: File): Promise<string | null> => {
    if (!user) {
      toast.error('You must be logged in to upload');
      return null;
    }

    setUploading(true);
    try {
      const ext = file.name.split('.').pop() ?? 'bin';
      const path = `${user.id}/${crypto.randomUUID()}.${ext}`;

      const { error } = await supabase.storage
        .from('dragonshare-content')
        .upload(path, file, { contentType: file.type, upsert: false });

      if (error) {
        toast.error('Upload failed. Please try again.');
        return null;
      }

      const { data: { publicUrl } } = supabase.storage
        .from('dragonshare-content')
        .getPublicUrl(path);

      return publicUrl;
    } catch {
      toast.error('Upload failed. Please try again.');
      return null;
    } finally {
      setUploading(false);
    }
  };

  return { upload, uploading };
}
