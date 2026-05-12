// Navigation configuration for sidebar, bottom nav, and hamburger drawer
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
  BarChart3,
  QrCode,
  Search,
  Plus,
  Megaphone,
  User,
  CreditCard,
  HelpCircle,
  Wallet,
  UserPlus,
  Building2,
  Users2,
  Sparkles,
  MapPin,
  Package,
  Share2,
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
  isDonny?: boolean;
}

// ── Sidebar nav (desktop) ──────────────────────────────────────────────────

export const businessSidebarNav: SidebarNavItem[] = [
  { icon: LayoutDashboard, label: 'Dashboard', href: '/dashboard/business' },
  { icon: Target, label: 'My Campaigns', href: '/dashboard/business/campaigns' },
  { icon: Image, label: 'Dragon Feed', href: '/dashboard/business/dragon-feed' },
  { icon: Activity, label: 'Inspiration', href: '/dashboard/business/activity' },
  { icon: Users, label: 'Browse Creators', href: '/dashboard/business/creators' },
  { icon: QrCode, label: 'UGC Campaigns', href: '/dashboard/business/promotions' },
  { icon: Share2, label: 'Social Media', href: '/dashboard/business/social' },
  { icon: Sparkles, label: 'DragonShare', href: '/dashboard/business/dragonshare' },
  { icon: MessageSquare, label: 'Messages', href: '/dashboard/business/messages' },
  { icon: BarChart3, label: 'Analytics', href: '/dashboard/analytics' },
  { icon: Wallet, label: 'Payments', href: '/dashboard/payments' },
  { icon: Building2, label: 'Locations', href: '/dashboard/business/locations' },
  { icon: Users2, label: 'Team', href: '/dashboard/business/team' },
  { icon: CreditCard, label: 'Billing', href: '/dashboard/business/billing' },
  { icon: Settings, label: 'Settings', href: '/dashboard/business/settings' },
];

export const brandSidebarNav: SidebarNavItem[] = [
  { icon: LayoutDashboard, label: 'Dashboard', href: '/dashboard/brand' },
  { icon: Search, label: 'Discover Campaigns', href: '/dashboard/brand/discover-campaigns' },
  { icon: Target, label: 'Sponsorships', href: '/dashboard/brand/sponsorships' },
  { icon: Users, label: 'Browse Creators', href: '/dashboard/brand/creators' },
  { icon: Sparkles, label: 'DragonShare', href: '/dashboard/brand/dragonshare' },
  { icon: MessageSquare, label: 'Messages', href: '/dashboard/brand/messages' },
  { icon: BarChart3, label: 'Analytics', href: '/dashboard/analytics' },
  { icon: Wallet, label: 'Payments', href: '/dashboard/payments' },
  { icon: Building2, label: 'Products', href: '/dashboard/brand/products' },
  { icon: Users2, label: 'Team', href: '/dashboard/brand/team' },
  { icon: CreditCard, label: 'Billing', href: '/dashboard/brand/billing' },
  { icon: Settings, label: 'Settings', href: '/dashboard/brand/settings' },
];

export const creatorSidebarNav: SidebarNavItem[] = [
  { icon: LayoutDashboard, label: 'Dashboard', href: '/dashboard/creator' },
  { icon: Search, label: 'Browse Campaigns', href: '/dashboard/creator/campaigns' },
  { icon: Target, label: 'My Campaigns', href: '/dashboard/creator/my-campaigns' },
  { icon: DollarSign, label: 'Earnings', href: '/dashboard/creator/earnings' },
  { icon: Share2, label: 'Social Media', href: '/dashboard/creator/social' },
  { icon: Sparkles, label: 'DragonShare', href: '/dashboard/creator/dragonshare' },
  { icon: MessageSquare, label: 'Messages', href: '/dashboard/creator/messages' },
  { icon: BarChart3, label: 'Analytics', href: '/dashboard/analytics' },
  { icon: Wallet, label: 'Payments', href: '/dashboard/payments' },
  { icon: Settings, label: 'Settings', href: '/dashboard/creator/settings' },
];

export function getSidebarNav(role: UserRole): SidebarNavItem[] {
  if (role === 'business_client') return businessSidebarNav;
  if (role === 'brand') return brandSidebarNav;
  return creatorSidebarNav;
}

// ── Bottom nav (mobile) ────────────────────────────────────────────────────

export const businessBottomNav: BottomNavItem[] = [
  { icon: LayoutDashboard, label: 'Home', href: '/dashboard/business' },
  { icon: Megaphone, label: 'Campaigns', href: '/dashboard/business/campaigns' },
  { icon: Plus, label: 'Donny', href: '#donny', isCenter: true, isDonny: true },
  { icon: MessageSquare, label: 'Messages', href: '/dashboard/business/messages' },
  { icon: User, label: 'Profile', href: '/dashboard/business/settings' },
];

export const creatorBottomNav: BottomNavItem[] = [
  { icon: LayoutDashboard, label: 'Home', href: '/dashboard/creator' },
  { icon: DollarSign, label: 'Earnings', href: '/dashboard/creator/earnings' },
  { icon: Plus, label: 'Donny', href: '#donny', isCenter: true, isDonny: true },
  { icon: MessageSquare, label: 'Messages', href: '/dashboard/creator/messages' },
  { icon: User, label: 'Profile', href: '/dashboard/creator/settings' },
];

export const brandBottomNav: BottomNavItem[] = [
  { icon: LayoutDashboard, label: 'Home', href: '/dashboard/brand' },
  { icon: Target, label: 'Campaigns', href: '/dashboard/brand/sponsorships' },
  { icon: Plus, label: 'Donny', href: '#donny', isCenter: true, isDonny: true },
  { icon: MessageSquare, label: 'Messages', href: '/dashboard/brand/messages' },
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
  if (role === 'business_client') return 'Restaurant Dashboard';
  if (role === 'brand') return 'Brand Dashboard';
  return 'Creator Dashboard';
}

// ── Drawer menu (hamburger) ───────────────────────────────────────────────

export interface DrawerMenuItem {
  icon: LucideIcon;
  label: string;
  href: string;
}

export interface DrawerMenuSection {
  heading: string;
  items: DrawerMenuItem[];
}

const businessDrawerMenu: DrawerMenuSection[] = [
  {
    heading: 'Navigation',
    items: [
      { icon: LayoutDashboard, label: 'Dashboard', href: '/dashboard/business' },
      { icon: Target, label: 'My Campaigns', href: '/dashboard/business/campaigns' },
      { icon: Image, label: 'Dragon Feed', href: '/dashboard/business/dragon-feed' },
      { icon: Activity, label: 'Inspiration', href: '/dashboard/business/activity' },
      { icon: Users, label: 'Browse Creators', href: '/dashboard/business/creators' },
      { icon: QrCode, label: 'UGC Campaigns', href: '/dashboard/business/promotions' },
      { icon: Share2, label: 'Social Media', href: '/dashboard/business/social' },
      { icon: Sparkles, label: 'DragonShare', href: '/dashboard/business/dragonshare' },
      { icon: MessageSquare, label: 'Messages', href: '/dashboard/business/messages' },
      { icon: BarChart3, label: 'Analytics', href: '/dashboard/analytics' },
    ],
  },
  {
    heading: 'Account',
    items: [
      { icon: MapPin, label: 'Locations', href: '/dashboard/business/locations' },
      { icon: UserPlus, label: 'Team Members', href: '/dashboard/business/team' },
      { icon: CreditCard, label: 'Billing', href: '/dashboard/business/billing' },
      { icon: Settings, label: 'Settings', href: '/dashboard/business/settings' },
    ],
  },
  {
    heading: 'Support',
    items: [
      { icon: HelpCircle, label: 'Help', href: '/help' },
    ],
  },
];

const creatorDrawerMenu: DrawerMenuSection[] = [
  {
    heading: 'Navigation',
    items: [
      { icon: LayoutDashboard, label: 'Dashboard', href: '/dashboard/creator' },
      { icon: Search, label: 'Browse Campaigns', href: '/dashboard/creator/campaigns' },
      { icon: Target, label: 'My Campaigns', href: '/dashboard/creator/my-campaigns' },
      { icon: DollarSign, label: 'Earnings', href: '/dashboard/creator/earnings' },
      { icon: Image, label: 'Dragon Feed', href: '/dashboard/creator/dragon-feed' },
      { icon: Share2, label: 'Social Media', href: '/dashboard/creator/social' },
      { icon: Sparkles, label: 'DragonShare', href: '/dashboard/creator/dragonshare' },
      { icon: MessageSquare, label: 'Messages', href: '/dashboard/creator/messages' },
      { icon: BarChart3, label: 'Analytics', href: '/dashboard/analytics' },
    ],
  },
  {
    heading: 'Account',
    items: [
      { icon: Settings, label: 'Settings', href: '/dashboard/creator/settings' },
    ],
  },
  {
    heading: 'Support',
    items: [
      { icon: HelpCircle, label: 'Help', href: '/help' },
    ],
  },
];

const brandDrawerMenu: DrawerMenuSection[] = [
  {
    heading: 'Navigation',
    items: [
      { icon: LayoutDashboard, label: 'Dashboard', href: '/dashboard/brand' },
      { icon: Search, label: 'Discover Campaigns', href: '/dashboard/brand/discover-campaigns' },
      { icon: Target, label: 'Sponsorships', href: '/dashboard/brand/sponsorships' },
      { icon: Users, label: 'Browse Creators', href: '/dashboard/brand/creators' },
      { icon: Sparkles, label: 'DragonShare', href: '/dashboard/brand/dragonshare' },
      { icon: MessageSquare, label: 'Messages', href: '/dashboard/brand/messages' },
      { icon: BarChart3, label: 'Analytics', href: '/dashboard/analytics' },
    ],
  },
  {
    heading: 'Account',
    items: [
      { icon: Package, label: 'Products', href: '/dashboard/brand/products' },
      { icon: UserPlus, label: 'Team Members', href: '/dashboard/brand/team' },
      { icon: CreditCard, label: 'Billing', href: '/dashboard/brand/billing' },
      { icon: Settings, label: 'Settings', href: '/dashboard/brand/settings' },
    ],
  },
  {
    heading: 'Support',
    items: [
      { icon: HelpCircle, label: 'Help', href: '/help' },
    ],
  },
];

export function getDrawerMenu(role: UserRole): DrawerMenuSection[] {
  if (role === 'business_client') return businessDrawerMenu;
  if (role === 'brand') return brandDrawerMenu;
  return creatorDrawerMenu;
}
