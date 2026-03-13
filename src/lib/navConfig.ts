import {
  LayoutDashboard,
  Target,
  Users,
  MessageSquare,
  Settings,
  Briefcase,
  Image,
  DollarSign,
  Activity,
  QrCode,
  Search,
  Heart,
  Play,
  Plus,
  List,
  Megaphone,
  User,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { UserRole } from '@/types/user';

export interface SidebarNavItem {
  icon: LucideIcon;
  label: string;
  href: string;
}

export interface BottomNavItem {
  icon: LucideIcon;
  label: string;
  href: string;
  isCenter?: boolean;
}

// ── Sidebar nav (desktop) ──────────────────────────────────────────────────

export const businessSidebarNav: SidebarNavItem[] = [
  { icon: LayoutDashboard, label: 'Dashboard', href: '/dashboard/business' },
  { icon: Target, label: 'My Campaigns', href: '/dashboard/business/campaigns' },
  { icon: Image, label: 'Dragon Feed', href: '/dashboard/business/dragon-feed' },
  { icon: Activity, label: 'Inspiration', href: '/dashboard/business/activity' },
  { icon: Users, label: 'Browse Creators', href: '/dashboard/business/creators' },
  { icon: Briefcase, label: 'Projects', href: '/dashboard/business/projects' },
  { icon: DollarSign, label: 'Sponsorships', href: '/dashboard/business/sponsorships' },
  { icon: QrCode, label: 'Promotions', href: '/dashboard/business/promotions' },
  { icon: MessageSquare, label: 'Messages', href: '/dashboard/business/messages' },
  { icon: Settings, label: 'Settings', href: '/dashboard/business/settings' },
];

export const brandSidebarNav: SidebarNavItem[] = [
  { icon: LayoutDashboard, label: 'Dashboard', href: '/dashboard/brand' },
  { icon: Search, label: 'Discover Campaigns', href: '/dashboard/brand/discover-campaigns' },
  { icon: Target, label: 'Sponsorships', href: '/dashboard/brand/sponsorships' },
  { icon: Users, label: 'Browse Creators', href: '/dashboard/brand/creators' },
  { icon: MessageSquare, label: 'Messages', href: '/dashboard/brand/messages' },
  { icon: Settings, label: 'Settings', href: '/dashboard/brand/settings' },
];

export const creatorSidebarNav: SidebarNavItem[] = [
  { icon: LayoutDashboard, label: 'Dashboard', href: '/dashboard/creator' },
  { icon: Search, label: 'Browse Campaigns', href: '/dashboard/creator/campaigns' },
  { icon: Briefcase, label: 'My Applications', href: '/dashboard/creator/applications' },
  { icon: Target, label: 'My Projects', href: '/dashboard/creator/projects' },
  { icon: DollarSign, label: 'Earnings', href: '/dashboard/creator/earnings' },
  { icon: MessageSquare, label: 'Messages', href: '/dashboard/creator/messages' },
  { icon: Settings, label: 'Settings', href: '/dashboard/creator/settings' },
];

export function getSidebarNav(role: UserRole): SidebarNavItem[] {
  if (role === 'business_client') return businessSidebarNav;
  if (role === 'brand') return brandSidebarNav;
  return creatorSidebarNav;
}

// ── Bottom nav (mobile, 7 items) ───────────────────────────────────────────

export const businessBottomNav: BottomNavItem[] = [
  { icon: LayoutDashboard, label: 'Home', href: '/dashboard/business' },
  { icon: Heart, label: 'Feed', href: '/dashboard/business/dragon-feed' },
  { icon: Play, label: 'Inspire', href: '/dashboard/business/activity' },
  { icon: Plus, label: 'Create', href: '/dashboard/business/campaigns/create', isCenter: true },
  { icon: List, label: 'Campaigns', href: '/dashboard/business/campaigns' },
  { icon: Megaphone, label: 'Promos', href: '/dashboard/business/promotions' },
  { icon: User, label: 'Profile', href: '/dashboard/business/settings' },
];

export const creatorBottomNav: BottomNavItem[] = [
  { icon: LayoutDashboard, label: 'Home', href: '/dashboard/creator' },
  { icon: Heart, label: 'Applied', href: '/dashboard/creator/applications' },
  { icon: Play, label: 'Projects', href: '/dashboard/creator/projects' },
  { icon: Plus, label: 'Browse', href: '/dashboard/creator/campaigns', isCenter: true },
  { icon: List, label: 'Campaigns', href: '/dashboard/creator/campaigns' },
  { icon: Megaphone, label: 'Earnings', href: '/dashboard/creator/earnings' },
  { icon: User, label: 'Profile', href: '/dashboard/creator/settings' },
];

export const brandBottomNav: BottomNavItem[] = [
  { icon: LayoutDashboard, label: 'Home', href: '/dashboard/brand' },
  { icon: Heart, label: 'Creators', href: '/dashboard/brand/creators' },
  { icon: Play, label: 'Discover', href: '/dashboard/brand/discover-campaigns' },
  { icon: Plus, label: 'Add', href: '/dashboard/brand/discover-campaigns', isCenter: true },
  { icon: List, label: 'Sponsors', href: '/dashboard/brand/sponsorships' },
  { icon: Megaphone, label: 'Analytics', href: '/dashboard/brand/analytics' },
  { icon: User, label: 'Profile', href: '/dashboard/brand/settings' },
];

export function getBottomNav(role: UserRole): BottomNavItem[] {
  if (role === 'business_client') return businessBottomNav;
  if (role === 'brand') return brandBottomNav;
  return creatorBottomNav;
}

// ── Role-based route helpers ───────────────────────────────────────────────

export function getDashboardHref(role: UserRole): string {
  if (role === 'business_client') return '/dashboard/business';
  if (role === 'brand') return '/dashboard/brand';
  return '/dashboard/creator';
}

export function getSettingsHref(role: UserRole): string {
  if (role === 'business_client') return '/dashboard/business/settings';
  if (role === 'brand') return '/dashboard/brand/settings';
  return '/dashboard/creator/settings';
}

export function getMessagesHref(role: UserRole): string {
  if (role === 'business_client') return '/dashboard/business/messages';
  if (role === 'brand') return '/dashboard/brand/messages';
  return '/dashboard/creator/messages';
}

export function getDashboardLabel(role: UserRole): string {
  if (role === 'business_client') return 'Business Dashboard';
  if (role === 'brand') return 'Brand Dashboard';
  return 'Creator Dashboard';
}
