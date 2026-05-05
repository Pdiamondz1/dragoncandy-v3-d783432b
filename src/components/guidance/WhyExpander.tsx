import { useState, useCallback } from "react";
import { motion, AnimatePresence, useReducedMotion } from "@/lib/motion";
import { HelpCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface WhyExpanderProps {
  expanderKey: string;
  title: string;
  body: string;
}

export function WhyExpander({ expanderKey, title, body }: WhyExpanderProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { user } = useAuth();
  const reducedMotion = useReducedMotion();
  const logged = useState(false);

  const toggle = useCallback(() => {
    const opening = !isOpen;
    setIsOpen(opening);

    if (opening && !logged[0] && user) {
      logged[1](true);
      supabase
        .from("why_expander_views")
        .insert({ user_id: user.id, expander_key: expanderKey })
        .then(() => {});
    }
  }, [isOpen, expanderKey, user, logged]);

  return (
    <span className="inline-flex items-center">
      <button
        onClick={toggle}
        className="inline-flex items-center justify-center w-4 h-4 rounded-full text-gray-400 hover:text-dc-teal transition-colors ml-1"
        aria-label={`Why: ${title}`}
        aria-expanded={isOpen}
      >
        <HelpCircle className="w-3 h-3" />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.span
            initial={reducedMotion ? { opacity: 1 } : { opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.15 }}
            className="block w-full mt-1 px-2.5 py-1.5 bg-gray-50 rounded-md text-xs text-gray-600 leading-relaxed"
          >
            {body}
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}
