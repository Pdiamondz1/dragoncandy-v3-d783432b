import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Heart,
  Play,
  Plus,
  List,
  Megaphone,
  User,
} from 'lucide-react';

interface MobileBottomNavProps {
  userRole: 'business_client' | 'content_creator' | 'brand';
}

type NavItem = {
  icon: React.ElementType;
  href: string;
  label: string;
  isCenter?: boolean;
};

const businessItems: NavItem[] = [
  { icon: LayoutDashboard, label: 'Home', href: '/dashboard/business' },
  { icon: Heart, label: 'Feed', href: '/dashboard/business/dragon-feed' },
  { icon: Play, label: 'Inspiration', href: '/dashboard/business/activity' },
  { icon: Plus, label: 'Create', href: '/dashboard/business/campaigns/create', isCenter: true },
  { icon: List, label: 'Campaigns', href: '/dashboard/business/campaigns' },
  { icon: Megaphone, label: 'Promotions', href: '/dashboard/business/promotions' },
  { icon: User, label: 'Profile', href: '/dashboard/business/settings' },
];

const creatorItems: NavItem[] = [
  { icon: LayoutDashboard, label: 'Home', href: '/dashboard/creator' },
  { icon: Heart, label: 'Applied', href: '/dashboard/creator/applications' },
  { icon: Play, label: 'Projects', href: '/dashboard/creator/projects' },
  { icon: Plus, label: 'Browse', href: '/dashboard/creator/campaigns', isCenter: true },
  { icon: List, label: 'Campaigns', href: '/dashboard/creator/campaigns' },
  { icon: Megaphone, label: 'Earnings', href: '/dashboard/creator/earnings' },
  { icon: User, label: 'Profile', href: '/dashboard/creator/settings' },
];

const brandItems: NavItem[] = [
  { icon: LayoutDashboard, label: 'Home', href: '/dashboard/brand' },
  { icon: Heart, label: 'Creators', href: '/dashboard/brand/creators' },
  { icon: Play, label: 'Discover', href: '/dashboard/brand/discover-campaigns' },
  { icon: Plus, label: 'Add', href: '/dashboard/brand/discover-campaigns', isCenter: true },
  { icon: List, label: 'Sponsors', href: '/dashboard/brand/sponsorships' },
  { icon: Megaphone, label: 'Analytics', href: '/dashboard/brand/analytics' },
  { icon: User, label: 'Profile', href: '/dashboard/brand/settings' },
];

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({ userRole }) => {
  const location = useLocation();

  const items =
    userRole === 'business_client'
      ? businessItems
      : userRole === 'brand'
      ? brandItems
      : creatorItems;

  const isActive = (href: string) =>
    location.pathname === href || location.pathname.startsWith(href + '/');

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-white border-t border-gray-200">
      <div className="flex items-end justify-around px-1 pb-2 pt-1">
        {items.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);

          if (item.isCenter) {
            return (
              <Link
                key={item.href + item.label}
                to={item.href}
                className="flex flex-col items-center -mt-4"
                aria-label={item.label}
              >
                <span className="bg-dc-teal rounded-full p-3 shadow-lg flex items-center justify-center">
                  <Icon className="h-6 w-6 text-white" />
                </span>
              </Link>
            );
          }

          return (
            <Link
              key={item.href + item.label}
              to={item.href}
              className="flex flex-col items-center gap-0.5 py-1 min-w-0"
              aria-label={item.label}
            >
              <Icon
                className={`h-5 w-5 ${active ? 'text-dc-teal' : 'text-[#888888]'}`}
              />
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
    </nav>
  );
};

export default MobileBottomNav;
