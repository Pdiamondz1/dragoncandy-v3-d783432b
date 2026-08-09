import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export const useFileUploadNotification = () => {
  const { user } = useAuth();

  const notifyFileUpload = async (
    campaignId: string,
    campaignTitle: string,
    fileCount: number,
    uploaderRole: 'creator' | 'restaurant'
  ) => {
    if (!user || !campaignId) return;

    try {
      // Get campaign details to find the recipient
      const { data: campaign } = await supabase
        .from('campaigns')
        .select('user_id, title')
        .eq('id', campaignId)
        .single();

      if (!campaign) return;

      // Get the collaboration for this campaign (needed for correct project URL)
      const { data: collaboration } = await supabase
        .from('campaign_collaborations')
        .select('id, creator_id')
        .eq('campaign_id', campaignId)
        .eq('status', 'active')
        .single();

      if (!collaboration) return;

      // Get uploader profile
      const { data: uploaderProfile } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', user.id)
        .single();

      const uploaderName = uploaderProfile?.full_name || 'A user';
      const fileLabel = fileCount === 1 ? '1 file' : `${fileCount} files`;
      const title = campaign.title || campaignTitle;

      // Determine recipient based on uploader role
      const recipientId = uploaderRole === 'creator'
        ? campaign.user_id
        : collaboration.creator_id;

      supabase.functions.invoke('create-notification', {
        body: {
          recipientId,
          type: 'file_uploaded',
          // No `emailType` here on purpose. This type has two role-worded templates, and
          // whichever the client named is the one that fired — so either party in a real
          // collaboration could send the other the email claiming the wrong uploader.
          // `create-notification` now derives the variant from `collaboration_id` below.
          category: 'content',
          title: 'New File Upload',
          body: `${uploaderName} uploaded ${fileLabel} to "${title}"`,
          actionUrl: `/dashboard/business/campaigns/${campaignId}`,
          actorId: user.id,
          actorName: uploaderName,
          icon: 'file',
          data: { campaign_id: campaignId, collaboration_id: collaboration.id, file_count: fileCount },
          emailData: { campaignTitle: title, campaignId, collaborationId: collaboration.id, uploaderName, fileCount },
        },
      }).catch((err: unknown) => console.error('Failed to send notification:', err));

    } catch (error) {
      console.error('Failed to send file upload notification:', error);
    }
  };

  return { notifyFileUpload };
};
