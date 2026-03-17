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
import { Settings, LogOut, PlusCircle } from 'lucide-react';
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
import type { UserRole } from '@/types/user';
import { getSidebarNav, getSettingsHref, getDashboardLabel } from '@/lib/navConfig';

interface DashboardLayoutProps {
  children: React.ReactNode;
  userRole: UserRole;
}

interface AppSidebarProps {
  userRole: UserRole;
}

const AppSidebar: React.FC<AppSidebarProps> = ({ userRole }) => {
  const location = useLocation();
  const { state } = useSidebar();
  const collapsed = state === 'collapsed';
  const navItems = getSidebarNav(userRole);

  const isActiveRoute = (href: string) =>
    location.pathname === href || location.pathname.startsWith(href + '/');

  return (
    <Sidebar className={collapsed ? 'w-14' : 'w-60'} collapsible="icon">
      <SidebarHeader className="border-b border-dc-teal/30 bg-white">
        <div className="flex items-center justify-center px-2 py-2">
          <Link to="/">
            <img
              src={dragonCandyLogo}
              alt="DragonCandy"
              className={collapsed ? 'h-8' : 'w-full max-w-[180px]'}
            />
          </Link>
        </div>
      </SidebarHeader>

      <SidebarContent className="bg-white">
        <SidebarGroup>
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
                  size={collapsed ? 'icon' : 'default'}
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
  const location = useLocation();
  const { setUserRole } = useAIAssistantContext();
  const { isOpen: isAIChatOpen, openModal, closeModal } = useAIChatModal();

  const topNavBgClass = userRole === 'business_client' ? 'bg-[#F9C8E0]' : 'bg-[#A8A8A0]';
  const showWelcome = userRole === 'business_client' && location.pathname === '/dashboard/business';

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
          {isMobile && (
            <MobileTopNav
              userRole={userRole}
              bgClass={topNavBgClass}
              showWelcome={showWelcome}
              displayName={displayName}
            />
          )}

          {/* Desktop header */}
          {!isMobile && (
            <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
              <div className="flex h-14 items-center justify-between px-4 lg:px-6">
                <div className="flex items-center gap-4">
                  <SidebarTrigger />
                  <h1 className="text-xl font-semibold text-foreground hidden sm:block">
                    {getDashboardLabel(userRole)}
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
                            {displayName?.charAt(0).toUpperCase() ||
                              user?.email?.charAt(0).toUpperCase() ||
                              'U'}
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
                        <Link to={getSettingsHref(userRole)}>
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

          <main className={isMobile ? 'flex-1 pb-20' : 'flex-1'}>
            {children}
          </main>
        </SidebarInset>

        {/* Mobile bottom nav */}
        {isMobile && <MobileBottomNav userRole={userRole} />}

        <AIChatWidget userRole={userRole} />
        <AIChatModal isOpen={isAIChatOpen} onClose={closeModal} userRole={userRole} />
      </div>
    </SidebarProvider>
  );
};

const DashboardLayout: React.FC<DashboardLayoutProps> = (props) => {
  return <DashboardLayoutInner {...props} />;
};

export default DashboardLayout;
