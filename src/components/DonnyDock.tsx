import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, matchPath } from 'react-router-dom';
import { DonnyChatSheet } from './donny/DonnyChatSheet';
import { useDonnyDashboard } from '@/hooks/useDonnyDashboard';
import donnyIcon from '@/assets/Donny_icon.png';

/** Routes where the dock is hidden */
const HIDDEN_PATTERNS = ['/auth', '/auth/*', '/profile/onboarding', '/onboarding/*'];

function shouldHideDock(pathname: string): boolean {
  return HIDDEN_PATTERNS.some((pattern) => matchPath(pattern, pathname) !== null);
}

/**
 * DonnyDock — Global floating chat icon, portal-rendered to document.body.
 *
 * Candy-gloss teal resting state with a layered radial gradient and an inner
 * highlight that catches the eye. Pink glow on hover. Subtle pulse animation
 * when Donny has an unread suggestion. Uses the Donny avatar asset — this is
 * NOT a generic support bubble.
 *
 * Keyboard accessible: focusable, Enter/Space to activate, aria-label.
 */
export function DonnyDock() {
  const location = useLocation();
  const { data: suggestion } = useDonnyDashboard();
  const hasNotification = !!suggestion;

  const [chatOpen, setChatOpen] = useState(false);
  const [initialMessage, setInitialMessage] = useState<string | undefined>();

  // Listen for global donny-open-chat events (from CTA buttons, deep links, etc.)
  useEffect(() => {
    const handler = (e: CustomEvent<{ message?: string }>) => {
      setInitialMessage(e.detail?.message);
      setChatOpen(true);
    };
    window.addEventListener('donny-open-chat', handler as EventListener);
    return () => window.removeEventListener('donny-open-chat', handler as EventListener);
  }, []);

  // Clear initial message when chat closes
  useEffect(() => {
    if (!chatOpen) setInitialMessage(undefined);
  }, [chatOpen]);

  if (shouldHideDock(location.pathname)) return null;

  const dock = (
    <>
      {/* Dock button */}
      <button
        type="button"
        onClick={() => setChatOpen(true)}
        aria-label="Open Donny AI assistant"
        className="
          fixed bottom-4 right-4 z-50
          w-14 h-14 lg:w-14 lg:h-14
          rounded-full
          focus:outline-none focus-visible:ring-4 focus-visible:ring-[#4DD9C0]/50 focus-visible:ring-offset-2
          transition-all duration-300 ease-out
          group
          cursor-pointer
        "
        style={{ WebkitTapHighlightColor: 'transparent' }}
      >
        {/* ── Outer glow layer ── */}
        <span
          className="
            absolute inset-0 rounded-full opacity-0
            group-hover:opacity-100 group-focus-visible:opacity-100
            transition-opacity duration-300
          "
          style={{
            boxShadow: '0 0 20px 4px rgba(249, 168, 212, 0.55), 0 0 40px 8px rgba(249, 168, 212, 0.25)',
          }}
          aria-hidden="true"
        />

        {/* ── Candy-gloss body ── */}
        <span
          className="
            absolute inset-0 rounded-full
            group-hover:scale-110 group-active:scale-95
            transition-transform duration-200
          "
          style={{
            background: `
              radial-gradient(ellipse 70% 40% at 35% 25%, rgba(255,255,255,0.45) 0%, transparent 70%),
              radial-gradient(ellipse 60% 50% at 65% 70%, rgba(0,229,204,0.3) 0%, transparent 80%),
              linear-gradient(145deg, #4DD9C0 0%, #38c5ad 50%, #2db89d 100%)
            `,
            boxShadow: `
              0 4px 14px rgba(77, 217, 192, 0.4),
              inset 0 1px 2px rgba(255,255,255,0.3),
              inset 0 -2px 4px rgba(0,0,0,0.08)
            `,
          }}
          aria-hidden="true"
        >
          {/* Dragon-scale texture overlay */}
          <span
            className="absolute inset-0 rounded-full opacity-[0.07] mix-blend-overlay"
            style={{
              backgroundImage: `
                radial-gradient(circle 4px at 30% 30%, rgba(255,255,255,0.8) 0%, transparent 100%),
                radial-gradient(circle 3px at 55% 25%, rgba(255,255,255,0.6) 0%, transparent 100%),
                radial-gradient(circle 5px at 40% 55%, rgba(255,255,255,0.7) 0%, transparent 100%),
                radial-gradient(circle 3px at 65% 50%, rgba(255,255,255,0.5) 0%, transparent 100%),
                radial-gradient(circle 4px at 50% 75%, rgba(255,255,255,0.6) 0%, transparent 100%),
                radial-gradient(circle 3px at 35% 70%, rgba(255,255,255,0.4) 0%, transparent 100%)
              `,
            }}
            aria-hidden="true"
          />
        </span>

        {/* ── Donny avatar ── */}
        <img
          src={donnyIcon}
          alt=""
          className="
            absolute inset-[4px] rounded-full object-cover
            ring-2 ring-white/30
            group-hover:ring-[#F9A8D4]/60
            transition-all duration-200
            pointer-events-none
          "
        />

        {/* ── Notification pip with pulse ── */}
        {hasNotification && (
          <span className="absolute -top-0.5 -right-0.5" aria-hidden="true">
            <span className="absolute inline-flex h-3.5 w-3.5 rounded-full bg-[#EC4899] opacity-75 animate-ping" />
            <span className="relative inline-flex h-3.5 w-3.5 rounded-full bg-[#EC4899] border-2 border-white" />
          </span>
        )}
      </button>

      {/* Chat drawer — only mounted when open to avoid eager Supabase queries */}
      {chatOpen && (
        <DonnyChatSheet
          open={chatOpen}
          onOpenChange={setChatOpen}
          initialMessage={initialMessage}
        />
      )}
    </>
  );

  return createPortal(dock, document.body);
}
