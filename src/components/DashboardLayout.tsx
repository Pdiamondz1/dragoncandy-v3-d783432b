import React, { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import dragonCandyLogo from '@/assets/dragon-candy-logo.png';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  SidebarInset,
  useSidebar,
} from '@/components/ui/sidebar';
import {
  LayoutDashboard,
  Target,
  Users,
  MessageSquare,
  Settings,
  LogOut,
  PlusCircle,
  Search,
  Briefcase,
  Image,
  DollarSign,
  Activity,
  QrCode
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useLogout } from '@/hooks/useLogout';
import { useProfileData } from '@/hooks/useProfileData';
import NotificationDropdown from '@/components/notifications/NotificationDropdown';
import { useIsMobile } from '@/hooks/use-mobile';
import { AIChatWidget, AIChatModal } from '@/components/ai-assistant';
import { useAIAssistantContext } from '@/contexts/AIAssistantContext';
import { useAIChatModal } from '@/contexts/AIChatModalContext';
import { MobileBottomNav } from '@/components/MobileBottomNav';
import { MobileTopNav } from '@/components/MobileTopNav';

interface DashboardLayoutProps {
  children: React.ReactNode;
  userRole: 'business_client' | 'content_creator' | 'brand';
}

const AppSidebar: React.FC<{ userRole: 'business_client' | 'content_creator' | 'brand' }> = ({ userRole }) => {
  const location = useLocation();
  const { state } = useSidebar();
  const collapsed = state === 'collapsed';

  const businessNavItems = [
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

  const brandNavItems = [
    { icon: LayoutDashboard, label: 'Dashboard', href: '/dashboard/brand' },
    { icon: Search, label: 'Discover Campaigns', href: '/dashboard/brand/discover-campaigns' },
    { icon: Target, label: 'Sponsorships', href: '/dashboard/brand/sponsorships' },
    { icon: Users, label: 'Browse Creators', href: '/dashboard/brand/creators' },
    { icon: MessageSquare, label: 'Messages', href: '/dashboard/brand/messages' },
    { icon: Settings, label: 'Settings', href: '/dashboard/brand/settings' },
  ];

  const creatorNavItems = [
    { icon: LayoutDashboard, label: 'Dashboard', href: '/dashboard/creator' },
    { icon: Search, label: 'Browse Campaigns', href: '/dashboard/creator/campaigns' },
    { icon: Briefcase, label: 'My Applications', href: '/dashboard/creator/applications' },
    { icon: Target, label: 'My Projects', href: '/dashboard/creator/projects' },
    { icon: DollarSign, label: 'Earnings', href: '/dashboard/creator/earnings' },
    { icon: MessageSquare, label: 'Messages', href: '/dashboard/creator/messages' },
    { icon: Settings, label: 'Settings', href: '/dashboard/creator/settings' },
  ];

  const navItems = userRole === 'business_client'
    ? businessNavItems
    : userRole === 'brand'
    ? brandNavItems
    : creatorNavItems;

  const isActiveRoute = (href: string) => {
    return location.pathname === href || location.pathname.startsWith(href + '/');
  };

  return (
    <Sidebar className={collapsed ? "w-14" : "w-60"} collapsible="icon">
      {/* Header — white bg, teal bottom border */}
      <SidebarHeader className="border-b border-dc-teal/30 bg-white">
        <div className="flex items-center justify-center px-2 py-2">
          <Link to="/">
            <img src={dragonCandyLogo} alt="DragonCandy" className={collapsed ? "h-8" : "w-full max-w-[180px]"} />
          </Link>
        </div>
      </SidebarHeader>

      <SidebarContent className="bg-white">
        <SidebarGroup>
          {/* ALL CAPS teal group label */}
          <SidebarGroupLabel className="text-dc-teal text-xs font-bold tracking-widest uppercase">
            Navigation
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => {
                const isActive = isActiveRoute(item.href);
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive}
                      className={
                        isActive
                          ? 'bg-dc-teal/15 text-dc-teal font-semibold'
                          : 'text-[#555555] hover:bg-dc-teal/10 hover:text-dc-teal'
                      }
                    >
                      <Link to={item.href} className="flex items-center gap-3">
                        <item.icon
                          className={`h-5 w-5 ${isActive ? 'text-dc-teal' : 'text-[#555555]'}`}
                        />
                        {!collapsed && <span>{item.label}</span>}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {userRole === 'business_client' && (
          <SidebarGroup>
            <SidebarGroupContent className="px-4">
              <Link to="/dashboard/business/campaigns/create">
                <Button
                  className="w-full bg-dc-teal text-white hover:bg-dc-teal-dark rounded-full font-semibold"
                  size={collapsed ? "icon" : "default"}
                >
                  <PlusCircle className="h-4 w-4" />
                  {!collapsed && <span className="ml-2">New Campaign</span>}
                </Button>
              </Link>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
    </Sidebar>
  );
};

const DashboardLayoutInner: React.FC<DashboardLayoutProps> = ({ children, userRole }) => {
  const { user } = useAuth();
  const logout = useLogout();
  const { avatarUrl, displayName } = useProfileData();
  const isMobile = useIsMobile();
  const { setUserRole } = useAIAssistantContext();
  const { isOpen: isAIChatOpen, openModal, closeModal } = useAIChatModal();

  useEffect(() => {
    setUserRole(userRole);
  }, [userRole, setUserRole]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        openModal();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [openModal]);

  return (
    <SidebarProvider defaultOpen={!isMobile}>
      <div className="min-h-screen flex w-full bg-background">
        {/* Sidebar — desktop only */}
        <div className="hidden md:block">
          <AppSidebar userRole={userRole} />
        </div>

        <SidebarInset className="flex-1">
          {/* Mobile top nav */}
          {isMobile && <MobileTopNav userRole={userRole} />}

          {/* Desktop header */}
          {!isMobile && (
            <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
              <div className="flex h-14 items-center justify-between px-4 lg:px-6">
                <div className="flex items-center gap-4">
                  <SidebarTrigger />
                  <h1 className="text-xl font-semibold text-foreground hidden sm:block">
                    {userRole === 'business_client' ? 'Business Dashboard' : userRole === 'brand' ? 'Brand Dashboard' : 'Creator Dashboard'}
                  </h1>
                </div>

                <div className="flex items-center gap-2 sm:gap-4">
                  <NotificationDropdown />

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" className="relative h-8 w-8 rounded-full">
                        <Avatar className="h-8 w-8 ring-2 ring-dc-teal">
                          <AvatarImage src={avatarUrl} alt="Avatar" />
                          <AvatarFallback>
                            {displayName?.charAt(0).toUpperCase() || user?.email?.charAt(0).toUpperCase() || 'U'}
                          </AvatarFallback>
                        </Avatar>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="w-56" align="end" forceMount>
                      <DropdownMenuLabel className="font-normal">
                        <div className="flex flex-col space-y-1">
                          <p className="text-sm font-medium leading-none">
                            {displayName || user?.user_metadata?.full_name || 'User'}
                          </p>
                          <p className="text-xs leading-none text-muted-foreground">
                            {user?.email}
                          </p>
                        </div>
                      </DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem asChild>
                        <Link to={`/dashboard/${userRole === 'business_client' ? 'business' : userRole === 'brand' ? 'brand' : 'creator'}/settings`}>
                          <Settings className="mr-2 h-4 w-4" />
                          <span>Settings</span>
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={logout}>
                        <LogOut className="mr-2 h-4 w-4" />
                        <span>Log out</span>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </header>
          )}

          {/* Page Content */}
          <main className={isMobile ? 'flex-1 pb-20' : 'flex-1'}>
            {children}
          </main>
        </SidebarInset>

        {/* Mobile bottom nav */}
        {isMobile && <MobileBottomNav userRole={userRole} />}

        {/* AI Assistant Widget */}
        <AIChatWidget userRole={userRole} />

        {/* AI Chat Modal */}
        <AIChatModal
          isOpen={isAIChatOpen}
          onClose={closeModal}
          userRole={userRole}
        />
      </div>
    </SidebarProvider>
  );
};

const DashboardLayout: React.FC<DashboardLayoutProps> = (props) => {
  return <DashboardLayoutInner {...props} />;
};

export default DashboardLayout;
