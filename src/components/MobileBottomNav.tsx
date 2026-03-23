import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import type { UserRole } from '@/types/user';
import { getBottomNav } from '@/lib/navConfig';
import { DonnyNavButton } from './donny/DonnyNavButton';
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
    <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-card border-t border-border">
      <div className="flex items-end justify-around px-1 pb-2 pt-1">
        {items.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);

          if (item.isDonny) {
            return (
              <DonnyNavButton key="donny" onClick={() => setDonnyChatOpen(true)} />
            );
          }

          if (item.isCenter) {
            return (
              <Link
                key={`${item.href}-${item.label}`}
                to={item.href}
                className="flex flex-col items-center -mt-4"
                aria-label={item.label}
              >
                <span className="bg-dc-teal rounded-full p-4 shadow-lg flex items-center justify-center">
                  <Icon className="h-6 w-6 text-white" />
                </span>
              </Link>
            );
          }

          return (
            <Link
              key={`${item.href}-${item.label}`}
              to={item.href}
              className="flex flex-col items-center gap-0.5 py-1 min-w-0"
              aria-label={item.label}
            >
              <Icon className={`h-5 w-5 ${active ? 'text-dc-teal' : 'text-[#888888]'}`} />
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
