import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import type { UserRole } from '@/types/user';
import { getBottomNav } from '@/lib/navConfig';
import { Plus } from 'lucide-react';
import { DonnyChatSheet } from './donny/DonnyChatSheet';

interface MobileBottomNavProps {
  userRole: UserRole;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({ userRole }) => {
  const location = useLocation();
  const items = getBottomNav(userRole);
  const [donnyChatOpen, setDonnyChatOpen] = useState(false);
  const [initialMessage, setInitialMessage] = useState<string | undefined>();

  useEffect(() => {
    const handler = (e: CustomEvent<{ message?: string }>) => {
      setInitialMessage(e.detail?.message);
      setDonnyChatOpen(true);
    };
    window.addEventListener('donny-open-chat', handler as EventListener);
    return () => window.removeEventListener('donny-open-chat', handler as EventListener);
  }, []);

  const isActive = (href: string) =>
    location.pathname === href || location.pathname.startsWith(href + '/');

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-white border-t border-gray-100 pb-[env(safe-area-inset-bottom)]">
      <div className="flex items-end justify-around px-1 pt-1 pb-2">
        {items.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);

          if (item.isCenter) {
            return (
              <Link
                key={`${item.href}-${item.label}`}
                to={item.href}
                className="flex flex-col items-center -mt-4 min-h-[44px] min-w-[44px]"
                aria-label={item.label}
              >
                <span className="bg-dc-teal w-14 h-14 rounded-full shadow-lg shadow-dc-teal/30 -mt-4 flex items-center justify-center">
                  <Plus className="w-7 h-7 text-white" />
                </span>
              </Link>
            );
          }

          return (
            <Link
              key={`${item.href}-${item.label}`}
              to={item.href}
              className="flex flex-col items-center gap-0.5 py-1 min-w-0 min-h-[44px] min-w-[44px]"
              aria-label={item.label}
            >
              <Icon className={`h-5 w-5 ${active ? 'text-dc-teal font-bold' : 'text-[#888888]'}`} />
              <span
                className={`text-[10px] leading-tight truncate ${
                  active ? 'text-dc-teal font-semibold' : 'text-[#888888]'
                }`}
              >
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
      <DonnyChatSheet open={donnyChatOpen} onOpenChange={setDonnyChatOpen} initialMessage={initialMessage} />
    </nav>
  );
};

export default MobileBottomNav;
