
import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

export interface BetaFeedback {
  feature_name: string;
  feedback_type: 'bug' | 'improvement' | 'feature_request' | 'general';
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  browser_info?: string;
  page_url?: string;
  user_agent?: string;
}

export const useBetaFeedback = () => {
  const { user } = useAuth();
  const [submitting, setSubmitting] = useState(false);

  const submitFeedback = async (feedback: BetaFeedback) => {
    if (!user) {
      toast.error('Please sign in to submit feedback');
      return false;
    }

    setSubmitting(true);

    try {
      const { error } = await supabase
        .from('beta_feedback' as any)
        .insert([{
          ...feedback,
          user_id: user.id,
          browser_info: navigator.userAgent,
          page_url: window.location.href,
          user_agent: navigator.userAgent
        }]);

      if (error) {
        console.error('Error submitting feedback:', error);
        toast.error('Failed to submit feedback. Please try again.');
        return false;
      }

      toast.success('Thank you for your feedback! We\'ll review it soon.');
      return true;
    } catch (error) {
      console.error('Error submitting feedback:', error);
      toast.error('Failed to submit feedback. Please try again.');
      return false;
    } finally {
      setSubmitting(false);
    }
  };

  return {
    submitFeedback,
    submitting
  };
};
