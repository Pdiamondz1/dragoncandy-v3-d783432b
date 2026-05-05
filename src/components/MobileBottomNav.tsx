import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import type { UserRole } from '@/types/user';
import { getBottomNav } from '@/lib/navConfig';
import { DonnyNavButton } from './donny/DonnyNavButton';
import { DonnyMobileSheet } from './donny/DonnyMobileSheet';
import { useScrollDirection } from '@/hooks/useScrollDirection';

interface MobileBottomNavProps {
  userRole: UserRole;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({ userRole }) => {
  const location = useLocation();
  const items = getBottomNav(userRole);

  const isActive = (href: string) =>
    location.pathname === href || location.pathname.startsWith(href + '/');

  const scrollDirection = useScrollDirection();

  return (
    <>
      <nav className={`fixed bottom-0 left-0 right-0 z-50 md:hidden bg-white border-t border-gray-100 pb-[env(safe-area-inset-bottom)] transition-transform duration-300 ${scrollDirection === 'down' ? 'translate-y-full' : 'translate-y-0'}`}>
        <div className="flex items-end justify-around px-1 pt-1 pb-2">
          {items.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);

            if (item.isDonny) {
              return (
                <div key="donny-center" data-tour="bottom-nav-add">
                  <DonnyNavButton />
                </div>
              );
            }

            return (
              <Link
                key={`${item.href}-${item.label}`}
                to={item.href}
                className="flex flex-col items-center gap-0.5 py-1 min-h-[44px] min-w-[44px]"
                aria-label={item.label}
              >
                <Icon className={`h-5 w-5 ${active ? 'text-dc-teal font-bold' : 'text-gray-400'}`} />
                <span
                  className={`text-[10px] leading-tight truncate ${
                    active ? 'text-dc-teal font-semibold' : 'text-gray-400'
                  }`}
                >
                  {item.label}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
      <DonnyMobileSheet />
    </>
  );
};

export default MobileBottomNav;
