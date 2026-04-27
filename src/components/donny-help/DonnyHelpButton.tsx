import { useState, useEffect, useRef } from "react";
import { motion, useReducedMotion, AnimatePresence } from "@/lib/motion";
import donnyEmblem from "@/assets/donny-emblem.png";
import { DonnyHelpSheet } from "./DonnyHelpSheet";

export function DonnyHelpButton() {
  const [isOpen, setIsOpen] = useState(false);
  const [showNudge, setShowNudge] = useState(false);
  const reducedMotion = useReducedMotion();
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nudgeShownKey = useRef("");

  // Proactive nudge: show after 30s idle on a page (once per page per session)
  useEffect(() => {
    const pageKey = `donny-help-nudge-${window.location.pathname}`;
    nudgeShownKey.current = pageKey;

    const alreadyShown = sessionStorage.getItem(pageKey);
    if (alreadyShown || isOpen) return;

    idleTimer.current = setTimeout(() => {
      setShowNudge(true);
      sessionStorage.setItem(pageKey, "1");
      setTimeout(() => setShowNudge(false), 6000);
    }, 30000);

    return () => {
      if (idleTimer.current) clearTimeout(idleTimer.current);
    };
  }, [isOpen]);

  const handleOpen = () => {
    setIsOpen(true);
    setShowNudge(false);
    if (idleTimer.current) clearTimeout(idleTimer.current);
  };

  return (
    <>
      {/* Floating button */}
      <div className="fixed bottom-20 right-4 z-50 lg:bottom-6 lg:right-6">
        <AnimatePresence>
          {showNudge && !isOpen && (
            <motion.div
              initial={reducedMotion ? { opacity: 1 } : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.2 }}
              className="absolute bottom-16 right-0 bg-white rounded-full px-3 py-1.5 shadow-lg border border-dc-teal/30 whitespace-nowrap text-sm font-medium text-dc-dark"
            >
              Stuck? Ask Donny
            </motion.div>
          )}
        </AnimatePresence>

        <motion.button
          onClick={handleOpen}
          whileTap={reducedMotion ? undefined : { scale: 0.92 }}
          className="w-14 h-14 rounded-full bg-dc-teal shadow-lg shadow-dc-teal/25 flex items-center justify-center relative overflow-hidden"
          aria-label="Ask Donny for help"
        >
          <img
            src={donnyEmblem}
            alt=""
            className="w-full h-full object-cover scale-[1.35]"
          />
          <span className="absolute -top-0.5 -right-0.5 w-5 h-5 rounded-full bg-white border-2 border-dc-teal flex items-center justify-center text-[10px] font-bold text-dc-teal">
            ?
          </span>
        </motion.button>
      </div>

      {/* Help sheet */}
      <DonnyHelpSheet isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </>
  );
}
