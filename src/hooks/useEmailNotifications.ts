import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

type NotificationType = 
  | 'new_application'
  | 'application_status'
  | 'new_message'
  | 'payment_received'
  | 'review_request'
  | 'campaign_update'
  | 'campaign_published'
  | 'sponsorship_proposal'
  | 'sponsorship_status'
  | 'approval_pending'
  | 'content_liked'
  | 'completion_request'
  | 'project_completion'
  | 'sponsorship_completion_request'
  | 'sponsorship_completed';

interface NotificationData {
  campaignTitle?: string;
  campaignId?: string;
  recipientUserId?: string;
  applicantName?: string;
  applicationStatus?: string;
  senderName?: string;
  amount?: number;
  message?: string;
  reviewUrl?: string;
  updateDetails?: string;
  brandName?: string;
  businessName?: string;
  sponsorshipAmount?: number;
  sponsorshipId?: string;
  proposalStatus?: string;
  party?: string;
  creatorName?: string;
  contentUrl?: string;
  likerName?: string;
  projectId?: string;
  actionUrl?: string;
  requesterName?: string;
}

export const useEmailNotifications = () => {
  const sendNotification = async (
    type: NotificationType,
    recipientEmail: string | undefined,
    recipientName: string | undefined,
    data: NotificationData
  ) => {
    try {
      const { data: result, error } = await supabase.functions.invoke('send-notification-email', {
        body: {
          to: recipientEmail,
          recipientName,
          type,
          data,
        },
      });

      if (error) {
        console.error('Failed to send notification email:', error);
        // Don't show toast error to user - email notifications are background tasks
        return { success: false, error };
      }

      console.log('Notification email sent successfully:', result);
      return { success: true, data: result };
    } catch (error) {
      console.error('Error sending notification email:', error);
      return { success: false, error };
    }
  };

  const sendWelcomeEmail = async (
    email: string,
    name: string,
    role: 'business_client' | 'content_creator' | 'brand'
  ) => {
    try {
      const { data, error } = await supabase.functions.invoke('send-welcome-email', {
        body: {
          email,
          name,
          role,
        },
      });

      if (error) {
        console.error('Failed to send welcome email:', error);
        toast.error('Failed to send welcome email');
        return { success: false, error };
      }

      console.log('Welcome email sent successfully:', data);
      return { success: true, data };
    } catch (error) {
      console.error('Error sending welcome email:', error);
      toast.error('Failed to send welcome email');
      return { success: false, error };
    }
  };

  return {
    sendNotification,
    sendWelcomeEmail,
  };
};
