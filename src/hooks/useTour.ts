import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { getTourForRole } from "@/lib/tours/role-tours";
import type { TourStep } from "@/lib/tours/role-tours";

interface UseTourReturn {
  showTour: boolean;
  tourSteps: TourStep[];
  completeTour: () => void;
  skipTour: () => void;
  replayTour: () => void;
}

export function useTour(): UseTourReturn {
  const { user, profile } = useAuth();
  const queryClient = useQueryClient();
  const [showTour, setShowTour] = useState(false);

  const { data: onboardingCompleted } = useQuery({
    queryKey: ["tour-state", user?.id],
    queryFn: async () => {
      if (!user) return true;
      const { data } = await supabase
        .from("profiles")
        .select("onboarding_completed_at")
        .eq("id", user.id)
        .single();
      return !!data?.onboarding_completed_at;
    },
    enabled: !!user,
  });

  useEffect(() => {
    if (onboardingCompleted === false && profile?.role) {
      const timer = setTimeout(() => setShowTour(true), 300);
      return () => clearTimeout(timer);
    }
  }, [onboardingCompleted, profile?.role]);

  const completeMutation = useMutation({
    mutationFn: async () => {
      if (!user) return;
      await supabase
        .from("profiles")
        .update({ onboarding_completed_at: new Date().toISOString() })
        .eq("id", user.id);
    },
    onSuccess: () => {
      setShowTour(false);
      queryClient.invalidateQueries({ queryKey: ["tour-state", user?.id] });
    },
  });

  const completeTour = useCallback(() => completeMutation.mutate(), [completeMutation]);
  const skipTour = useCallback(() => completeMutation.mutate(), [completeMutation]);

  const replayMutation = useMutation({
    mutationFn: async () => {
      if (!user) return;
      await supabase
        .from("profiles")
        .update({ onboarding_completed_at: null })
        .eq("id", user.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tour-state", user?.id] });
    },
  });

  const replayTour = useCallback(() => replayMutation.mutate(), [replayMutation]);

  const tourSteps = getTourForRole(profile?.role ?? "");

  return { showTour, tourSteps, completeTour, skipTour, replayTour };
}
