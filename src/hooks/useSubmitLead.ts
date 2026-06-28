import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

export type LeadAudience = "business" | "brand" | "creator" | "other";

export interface SubmitLeadParams {
  name: string;
  email: string;
  phone?: string;
  company?: string;
  audience: LeadAudience;
  message?: string;
  /** Honeypot — must stay empty for real submissions. */
  website?: string;
}

interface CaptureLeadResponse {
  success: boolean;
  id?: string;
}

/**
 * Submits a public landing-page lead through the `capture-lead` edge function
 * (verify_jwt=false), which validates, stores the lead, and emails the team.
 * No React Query cache to invalidate on the public surface — the future
 * /internal/leads view will own the `['leads']` query.
 */
export const useSubmitLead = () =>
  useMutation({
    mutationFn: async (params: SubmitLeadParams): Promise<CaptureLeadResponse> => {
      const { data, error } = await supabase.functions.invoke("capture-lead", {
        body: { ...params, source: "landing_page" },
      });
      if (error) throw error;
      return data as CaptureLeadResponse;
    },
    onSuccess: () => {
      toast({
        title: "Thanks — we'll be in touch!",
        description: "Your message has been sent to the DragonCandy team.",
      });
    },
    onError: (error) => {
      console.error("Lead submit failed:", error);
      toast({
        title: "Couldn't send your message",
        description: "Please try again in a moment.",
        variant: "destructive",
      });
    },
  });
