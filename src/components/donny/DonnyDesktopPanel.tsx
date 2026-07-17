import { useEffect, useRef } from 'react';
import { useDonnyContext } from '@/contexts/DonnyProvider';
import { useIsMobile } from '@/hooks/use-mobile';
import { DonnyTray } from './DonnyTray';
import { DonnyChatView } from './DonnyChatView';
import { cn } from '@/lib/utils';

export function DonnyDesktopPanel() {
  const { stage, close } = useDonnyContext();
  const isMobile = useIsMobile();
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [close]);

  // Desktop: close when clicking outside the panel. Mobile has its own backdrop,
  // and this panel is only CSS-hidden (not unmounted) on mobile — so the isMobile
  // gate is required to avoid closing Donny on unrelated mobile taps.
  useEffect(() => {
    if (isMobile || stage === 'closed') return;
    const handler = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (panelRef.current?.contains(target)) return; // click inside the panel
      if (target.closest('[data-donny-launcher]')) return; // let the launcher toggle
      close();
    };
    document.addEventListener('pointerdown', handler);
    return () => document.removeEventListener('pointerdown', handler);
  }, [isMobile, stage, close]);

  if (stage === 'closed') return null;

  return (
    <div
      ref={panelRef}
      className={cn(
        'hidden md:flex flex-col fixed inset-y-0 right-0 z-40 shadow-2xl border-l border-gray-200 bg-white transition-all duration-200',
        stage === 'tray' && 'w-80',
        stage === 'chat' && 'w-[420px]'
      )}
    >
      {stage === 'tray' && <DonnyTray />}
      {stage === 'chat' && <DonnyChatView />}
    </div>
  );
}
