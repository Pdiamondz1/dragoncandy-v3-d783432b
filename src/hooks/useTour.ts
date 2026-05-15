import { useState, useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { getTourForRole } from "@/lib/tours/role-tours";
import type { TourStep } from "@/lib/tours/role-tours";

interface UseTourReturn {
  showTour: boolean;
  tourSteps: TourStep[];
  completeTour: () => void;
  skipTour: () => void;
  triggerTour: () => void;
}

const SESSION_KEY = "dc_tour_dismissed";

export function useTour(): UseTourReturn {
  const { user, profile } = useAuth();
  const queryClient = useQueryClient();
  const [showTour, setShowTour] = useState(false);

  const completeMutation = useMutation({
    mutationFn: async () => {
      if (!user) return;
      await supabase
        .from("profiles")
        .update({ onboarding_completed_at: new Date().toISOString() })
        .eq("id", user.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tour-state", user?.id] });
    },
    onError: (err) => { console.error('Failed to complete tour:', err); },
  });

  const completeTour = useCallback(() => {
    sessionStorage.setItem(SESSION_KEY, "true");
    setShowTour(false);
    completeMutation.mutate();
  }, [completeMutation]);

  const skipTour = useCallback(() => {
    sessionStorage.setItem(SESSION_KEY, "true");
    setShowTour(false);
    completeMutation.mutate();
  }, [completeMutation]);

  const triggerTour = useCallback(() => {
    setShowTour(true);
  }, []);

  const tourSteps = getTourForRole(profile?.role ?? "");

  return { showTour, tourSteps, completeTour, skipTour, triggerTour };
}
