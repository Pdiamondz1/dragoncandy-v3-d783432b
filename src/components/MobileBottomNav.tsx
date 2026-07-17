import React from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation } from 'react-router-dom';
import type { UserRole } from '@/types/user';
import { getBottomNav } from '@/lib/navConfig';
import { DonnyNavButton } from './donny/DonnyNavButton';
import { DonnyMobileSheet } from './donny/DonnyMobileSheet';
import { useTotalUnreadCount } from '@/hooks/useUnreadCounts';

interface MobileBottomNavProps {
  userRole: UserRole;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({ userRole }) => {
  const location = useLocation();
  const items = getBottomNav(userRole);

  const isActive = (href: string) =>
    location.pathname === href || location.pathname.startsWith(href + '/');

  const unreadCount = useTotalUnreadCount();

  // Portal to <body> so the `fixed` nav (and Donny's mobile sheet) sit OUTSIDE the app's
  // inner scroll container (`<main className="overflow-auto">` in AppShell). Rendered in
  // place, they are descendants of that scroller, and iOS Safari does not paint a
  // `position:fixed` descendant of an `overflow:auto` container stably during rubber-band /
  // momentum overscroll — scrolling up hard dragged the nav up mid-screen and exposed
  // whitespace below. As a <body> child the nav anchors to the viewport and is immune to the
  // inner scroll's overscroll. Same fix as ApplyConfirmation; context flows through the portal.
  return createPortal(
    <>
      {/* Always visible — no hide-on-scroll: the nav is Donny's only mobile entry point
          (founder decision 2026-07-14; the old scroll-direction hide left users stranded). */}
      <nav aria-label="Mobile bottom" className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-dc-dark/95 backdrop-blur border-t border-white/10 pb-[env(safe-area-inset-bottom)]">
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
                <span className="relative">
                  <Icon className={`h-5 w-5 ${active ? 'text-dc-teal font-bold' : 'text-white/50'}`} />
                  {item.label === 'Messages' && unreadCount > 0 && (
                    <span className="absolute -top-1.5 -right-2.5 bg-pink-500 text-white text-[9px] font-bold min-w-[16px] h-4 flex items-center justify-center rounded-full px-1">
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  )}
                </span>
                <span
                  className={`text-[10px] leading-tight truncate ${
                    active ? 'text-dc-teal font-semibold' : 'text-white/50'
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
    </>,
    document.body,
  );
};

