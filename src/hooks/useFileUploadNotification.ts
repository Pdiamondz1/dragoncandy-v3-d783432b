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

      // Get uploader profile
      const { data: uploaderProfile } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', user.id)
        .single();

      const uploaderName = uploaderProfile?.full_name || 'A user';

      // Determine recipient based on uploader role
      let recipientId: string;
      let notificationType: string;

      if (uploaderRole === 'creator') {
        // Creator uploaded → notify restaurant owner
        recipientId = campaign.user_id;
        notificationType = 'file_uploaded_by_creator';
      } else {
        // Restaurant uploaded → notify creator
        // Get the creator from campaign_collaborations
        const { data: collaboration } = await supabase
          .from('campaign_collaborations')
          .select('creator_id')
          .eq('campaign_id', campaignId)
          .eq('status', 'active')
          .single();

        if (!collaboration) return;
        recipientId = collaboration.creator_id;
        notificationType = 'file_uploaded_by_restaurant';
      }

      // Get recipient profile
      const { data: recipientProfile } = await supabase
        .from('profiles')
        .select('email, full_name')
        .eq('id', recipientId)
        .single();

      if (!recipientProfile) return;

      // Send email notification
      await supabase.functions.invoke('send-notification-email', {
        body: {
          to: recipientProfile.email,
          recipientName: recipientProfile.full_name,
          type: notificationType,
          data: {
            campaignTitle: campaign.title || campaignTitle,
            campaignId,
            uploaderName,
            fileCount,
          },
        },
      });

      console.log(`File upload notification sent to ${recipientProfile.email}`);
    } catch (error) {
      console.error('Failed to send file upload notification:', error);
    }
  };

  return { notifyFileUpload };
};
