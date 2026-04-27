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

const SESSION_KEY = "dc_tour_dismissed";

export function useTour(dashboardPath?: string): UseTourReturn {
  const { user, profile } = useAuth();
  const queryClient = useQueryClient();
  const [showTour, setShowTour] = useState(false);

  // DB guard: check onboarding_completed_at
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
    // Route guard: only show on exact dashboard home route
    if (dashboardPath && window.location.pathname !== dashboardPath) return;

    // Session guard: skip if dismissed this session
    if (sessionStorage.getItem(SESSION_KEY)) return;

    // DB guard: skip if onboarding already completed
    if (onboardingCompleted !== false) return;

    // Role must be known
    if (!profile?.role) return;

    // Mount delay: 500ms
    const timer = setTimeout(() => setShowTour(true), 500);
    return () => clearTimeout(timer);
  }, [onboardingCompleted, profile?.role, dashboardPath]);

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

  const replayMutation = useMutation({
    mutationFn: async () => {
      if (!user) return;
      await supabase
        .from("profiles")
        .update({ onboarding_completed_at: null })
        .eq("id", user.id);
    },
    onSuccess: () => {
      sessionStorage.removeItem(SESSION_KEY);
      queryClient.invalidateQueries({ queryKey: ["tour-state", user?.id] });
    },
  });

  const replayTour = useCallback(() => replayMutation.mutate(), [replayMutation]);

  const tourSteps = getTourForRole(profile?.role ?? "");

  return { showTour, tourSteps, completeTour, skipTour, replayTour };
}
