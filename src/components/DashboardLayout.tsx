import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import dragonCandyLogo from '@/assets/Transparent_DragonCandy_logo.png';
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
import { ThemeToggle } from '@/components/ThemeToggle';
import { useAuth } from '@/hooks/useAuth';
import { useLogout } from '@/hooks/useLogout';
import { useProfileData } from '@/hooks/useProfileData';
import NotificationDropdown from '@/components/notifications/NotificationDropdown';
import { useIsMobile } from '@/hooks/use-mobile';
import { MobileBottomNav } from '@/components/MobileBottomNav';
import { MobileTopNav } from '@/components/MobileTopNav';
import { DonnyAvatar } from '@/components/donny/DonnyAvatar';
import { useDonnyContext } from '@/contexts/DonnyProvider';
import { OrgUnitSwitcher } from '@/components/org/OrgUnitSwitcher';
import { useMyOrgRole } from '@/hooks/useOrgData';
import { DesktopGate } from '@/components/DesktopGate';
import ErrorBoundary from '@/components/ErrorBoundary';
import { DonnyHelpButton } from '@/components/donny-help/DonnyHelpButton';
import { DCTour } from '@/components/guidance/DCTour';
import { useTour } from '@/hooks/useTour';
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
      <SidebarHeader className="bg-sidebar">
        <div className="flex items-center justify-center px-2 py-3">
          <Link to="/" className="transition-transform duration-200 hover:scale-105">
            <img
              src={dragonCandyLogo}
              alt="DragonCandy"
              className={collapsed ? 'h-8' : 'w-[100px] h-auto'}
            />
          </Link>
        </div>
      </SidebarHeader>

      <SidebarContent className="bg-sidebar">
        <SidebarGroup>
          <SidebarGroupLabel className="text-dc-teal text-xs font-bold tracking-wide uppercase px-3">
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
                          ? 'bg-dc-teal/12 text-dc-teal font-semibold border-r-2 border-dc-teal'
                          : 'text-muted-foreground hover:bg-muted hover:text-foreground transition-colors duration-200'
                      }
                    >
                      <Link to={item.href} className="flex items-center gap-3 px-3">
                        <item.icon
                          className={`h-[18px] w-[18px] transition-colors duration-200 ${
                            isActive ? 'text-dc-teal' : 'text-muted-foreground'
                          }`}
                        />
                        {!collapsed && <span className="text-sm">{item.label}</span>}
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
            <SidebarGroupContent className="px-4 pt-2">
              <Link to="/dashboard/business/campaigns/create">
                <Button
                  className="w-full bg-dc-teal text-white hover:bg-dc-teal-dark hover:shadow-glow-teal rounded-full font-semibold transition-all duration-300"
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
  const { user, activeOrg } = useAuth();
  const logout = useLogout();
  const { avatarUrl, displayName } = useProfileData();
  const isMobile = useIsMobile();
  const location = useLocation();
  const { stage, open, close, unreadCount, avatarState } = useDonnyContext();
  const [sidebarOpen, setSidebarOpen] = useState(!isMobile);
  const { data: myRole } = useMyOrgRole(activeOrg?.id);
  const canManageUnits = myRole?.role === 'owner' || myRole?.role === 'admin';
  const { showTour, tourSteps, completeTour, skipTour } = useTour();

  // Sync sidebar state when viewport crosses mobile/desktop boundary
  useEffect(() => {
    setSidebarOpen(!isMobile);
  }, [isMobile]);

  const topNavBgClass =
    userRole === 'business_client' || userRole === 'content_creator' || userRole === 'brand'
      ? 'bg-gradient-to-b from-dc-pink-bg to-pink-50'
      : 'bg-white';
  const showWelcome =
    (userRole === 'business_client' && location.pathname === '/dashboard/business') ||
    (userRole === 'brand' && location.pathname === '/dashboard/brand');

  return (
    <SidebarProvider open={sidebarOpen} onOpenChange={setSidebarOpen}>
      <div className="min-h-screen flex w-full bg-background overflow-x-hidden font-outfit">
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

          {/* Desktop header — refined with glass effect */}
          {!isMobile && (
            <header className="sticky top-0 z-40 border-b border-border/50 bg-background/80 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60">
              <div className="flex h-16 items-center justify-between px-6 lg:px-8">
                <div className="flex items-center gap-4">
                  <SidebarTrigger className="hover:bg-muted transition-colors duration-200" />
                  <div className="hidden sm:block">
                    <h1 className="text-lg font-semibold text-foreground tracking-tight">
                      {getDashboardLabel(userRole)}
                    </h1>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {userRole !== 'content_creator' && (
                    <OrgUnitSwitcher
                      canManage={canManageUnits}
                      onAddUnit={() => {
                        window.location.href = activeOrg?.org_type === 'restaurant'
                          ? '/dashboard/business/locations'
                          : '/dashboard/brand/products';
                      }}
                    />
                  )}
                  <ThemeToggle />
                  <NotificationDropdown />

                  <button
                    onClick={() => stage === 'closed' ? open() : close()}
                    className="relative hidden md:block"
                    aria-label="Open Donny"
                  >
                    <DonnyAvatar
                      size="md"
                      state={unreadCount > 0 ? 'action_needed' : avatarState}
                      badgeCount={unreadCount}
                      glow={unreadCount > 0}
                    />
                  </button>

                  <div className="w-px h-6 bg-border mx-1" />

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" className="relative h-9 w-9 rounded-full hover:ring-2 hover:ring-dc-teal/30 transition-all duration-200">
                        <Avatar className="h-9 w-9 ring-2 ring-dc-teal/60">
                          <AvatarImage src={avatarUrl} alt="Avatar" />
                          <AvatarFallback className="bg-dc-teal/10 text-dc-teal font-semibold text-sm">
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
                        <Link to={getSettingsHref(userRole)} className="cursor-pointer">
                          <Settings className="mr-2 h-4 w-4" />
                          <span>Settings</span>
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={logout} className="cursor-pointer text-red-600 dark:text-red-400 focus:text-red-600">
                        <LogOut className="mr-2 h-4 w-4" />
                        <span>Log out</span>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </header>
          )}

          <main className={`${isMobile ? 'flex-1 min-h-screen overflow-x-hidden pb-24 w-full min-w-0 max-w-[100vw]' : 'flex-1 p-6 lg:p-8'} animate-fade-in`}>
            <ErrorBoundary level="page">
              {children}
            </ErrorBoundary>
          </main>
        </SidebarInset>

        {/* Mobile bottom nav */}
        {isMobile && <MobileBottomNav userRole={userRole} />}

        {/* Floating Donny Help button */}
        <div data-tour="donny-help">
          <DonnyHelpButton />
        </div>

        {/* First-run tour */}
        {showTour && tourSteps.length > 0 && (
          <DCTour steps={tourSteps} onComplete={completeTour} onSkip={skipTour} />
        )}
      </div>
    </SidebarProvider>
  );
};

const DashboardLayout: React.FC<DashboardLayoutProps> = (props) => {
  return <DashboardLayoutInner {...props} />;
};

export default DashboardLayout;
