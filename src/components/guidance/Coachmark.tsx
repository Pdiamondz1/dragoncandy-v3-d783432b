import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence, useReducedMotion } from "@/lib/motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface CoachmarkProps {
  coachmarkKey: string;
  title: string;
  body: string;
  children: React.ReactNode;
}

export function Coachmark({ coachmarkKey, title, body, children }: CoachmarkProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const reducedMotion = useReducedMotion();
  const [visible, setVisible] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: dismissed } = useQuery({
    queryKey: ["coachmarks", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data } = await supabase
        .from("profiles")
        .select("dismissed_coachmarks")
        .eq("id", user.id)
        .single();
      return (data?.dismissed_coachmarks as string[]) ?? [];
    },
    enabled: !!user,
  });

  useEffect(() => {
    if (!dismissed || dismissed.includes(coachmarkKey)) return;
    const showTimer = setTimeout(() => setVisible(true), 500);
    return () => clearTimeout(showTimer);
  }, [dismissed, coachmarkKey]);

  // Auto-dismiss after 8s
  const dismissMutation = useMutation({
    mutationFn: async () => {
      if (!user) return;
      const current = dismissed ?? [];
      const updated = [...current, coachmarkKey];
      await supabase
        .from("profiles")
        .update({ dismissed_coachmarks: updated })
        .eq("id", user.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["coachmarks", user?.id] });
    },
  });

  const dismiss = useCallback(() => {
    setVisible(false);
    dismissMutation.mutate();
  }, [dismissMutation]);

  useEffect(() => {
    if (!visible) return;
    timerRef.current = setTimeout(() => dismiss(), 8000);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [visible, dismiss]);

  return (
    <div ref={containerRef} className="relative inline-block">
      {children}
      <AnimatePresence>
        {visible && (
          <motion.div
            initial={reducedMotion ? { opacity: 1 } : { opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.15 }}
            className="absolute z-50 top-full right-0 mt-2 w-56 bg-dc-dark text-white rounded-lg p-3 shadow-xl"
          >
            <div className="absolute -top-1.5 right-4 w-3 h-3 bg-dc-dark rotate-45" />
            <p className="text-xs font-semibold mb-1">{title}</p>
            <p className="text-xs text-gray-300 leading-relaxed">{body}</p>
            <button
              onClick={dismiss}
              className="mt-2 text-[10px] font-medium text-dc-teal hover:text-dc-teal/80"
            >
              Got it
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
