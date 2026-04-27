import { useState, useCallback, useRef } from "react";
import { useLocation } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface HelpMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  suggestedActions?: { label: string; route: string }[];
  logId?: string;
  rating?: 1 | -1 | null;
}

interface PageContext {
  campaign_id?: string;
  status?: string;
  applicant_count?: number;
  post_count?: number;
  latest_boost_amount?: number;
  member_count?: number;
  current_tier?: string;
}

export function useDonnyHelp(pageContext?: PageContext) {
  const { user, profile } = useAuth();
  const location = useLocation();
  const [messages, setMessages] = useState<HelpMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const idCounter = useRef(0);

  const generateId = () => `help-${Date.now()}-${idCounter.current++}`;

  const askMutation = useMutation({
    mutationFn: async (query: string) => {
      const { data, error } = await supabase.functions.invoke("donny-help", {
        body: {
          page_path: location.pathname,
          page_context: pageContext ?? {},
          user_role: profile?.role ?? "unknown",
          query,
        },
      });
      if (error) throw error;
      return data as {
        answer: string;
        suggested_actions: { label: string; route: string }[];
        log_id: string | null;
      };
    },
  });

  const sendQuestion = useCallback(
    async (query: string) => {
      if (!query.trim() || isLoading) return;

      const userMsg: HelpMessage = {
        id: generateId(),
        role: "user",
        content: query,
      };
      setMessages((prev) => [...prev, userMsg]);
      setIsLoading(true);

      try {
        const result = await askMutation.mutateAsync(query);
        const assistantMsg: HelpMessage = {
          id: generateId(),
          role: "assistant",
          content: result.answer,
          suggestedActions: result.suggested_actions,
          logId: result.log_id ?? undefined,
          rating: null,
        };
        setMessages((prev) => [...prev, assistantMsg]);
      } catch {
        const errorMsg: HelpMessage = {
          id: generateId(),
          role: "assistant",
          content:
            "Sorry, I couldn't get an answer right now. Tap Talk to a human if you need help.",
        };
        setMessages((prev) => [...prev, errorMsg]);
      } finally {
        setIsLoading(false);
      }
    },
    [askMutation, isLoading]
  );

  const rateAnswer = useCallback(
    async (logId: string, rating: 1 | -1, comment?: string) => {
      setMessages((prev) =>
        prev.map((msg) =>
          msg.logId === logId ? { ...msg, rating } : msg
        )
      );

      await supabase
        .from("donny_help_logs" as any)
        .update({ rating, rating_comment: comment ?? null })
        .eq("id", logId);
    },
    []
  );

  const clearMessages = useCallback(() => setMessages([]), []);

  return {
    messages,
    isLoading,
    sendQuestion,
    rateAnswer,
    clearMessages,
    currentPage: location.pathname,
  };
}
