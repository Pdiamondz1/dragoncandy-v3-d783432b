import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useDonnyContext } from '@/contexts/DonnyProvider';
import donnyEmblem from '@/assets/donny-emblem.png';

const PAGE_LABELS: Record<string, string> = {
  '/dashboard/business': 'Dashboard',
  '/dashboard/creator': 'Dashboard',
  '/dashboard/brand': 'Dashboard',
  '/campaigns': 'Campaigns',
  '/dragonshare': 'DragonShare',
  '/messages': 'Messages',
  '/settings': 'Settings',
  '/earnings': 'Earnings',
  '/projects': 'Projects',
  '/billing': 'Billing',
  '/team': 'Team',
};

function getPageLabel(pathname: string): string {
  for (const [prefix, label] of Object.entries(PAGE_LABELS)) {
    if (pathname.startsWith(prefix)) return label;
  }
  if (pathname.includes('/campaigns/')) return 'Campaign Detail';
  return 'this page';
}

const NUDGE_KEY = 'donny-help-nudge-shown';

export function DonnyHelpButton() {
  const { stage, open, openDonnyWithContext } = useDonnyContext();
  const location = useLocation();
  const [showNudge, setShowNudge] = useState(false);

  useEffect(() => {
    const shown = sessionStorage.getItem(`${NUDGE_KEY}:${location.pathname}`);
    if (shown || stage !== 'closed') return;

    const timer = setTimeout(() => {
      const alreadyShown = sessionStorage.getItem(`${NUDGE_KEY}:${location.pathname}`);
      if (!alreadyShown) {
        setShowNudge(true);
        sessionStorage.setItem(`${NUDGE_KEY}:${location.pathname}`, '1');
        setTimeout(() => setShowNudge(false), 6000);
      }
    }, 30000);

    return () => clearTimeout(timer);
  }, [location.pathname, stage]);

  if (stage !== 'closed') return null;

  const handleClick = () => {
    setShowNudge(false);
    const label = getPageLabel(location.pathname);
    openDonnyWithContext(`Help me with ${label}`);
  };

  return (
    <div className="fixed bottom-20 right-4 z-40 md:bottom-6 md:right-6 flex flex-col items-end gap-2">
      {showNudge && (
        <button
          onClick={handleClick}
          className="rounded-full bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-lg border border-gray-100 animate-fade-in whitespace-nowrap"
        >
          Stuck? Ask Donny
        </button>
      )}
      <button
        onClick={handleClick}
        data-tour="donny-help"
        aria-label="Ask Donny for help"
        className="relative h-14 w-14 rounded-full bg-dc-teal shadow-lg shadow-teal-200/40 transition-transform hover:scale-105 active:scale-95 overflow-hidden"
      >
        <img
          src={donnyEmblem}
          alt=""
          className="h-full w-full object-cover scale-[1.35]"
        />
        <span className="absolute -top-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-white text-[10px] font-bold text-dc-teal shadow-sm ring-1 ring-gray-100">
          ?
        </span>
      </button>
    </div>
  );
}
