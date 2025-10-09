
import React from 'react';
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
  Menu,
  Image
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useLogout } from '@/hooks/useLogout';
import { useProfileData } from '@/hooks/useProfileData';
import NotificationDropdown from '@/components/notifications/NotificationDropdown';
import { useIsMobile } from '@/hooks/use-mobile';

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
    { icon: Users, label: 'Browse Creators', href: '/dashboard/business/creators' },
    { icon: Briefcase, label: 'Projects', href: '/dashboard/business/projects' },
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
      <SidebarHeader className="border-b border-sidebar-border">
        <div className="flex items-center gap-2 px-4 py-2">
          <img src={dragonCandyLogo} alt="DragonCandy" className="w-12 h-12" />
          {!collapsed && (
            <Link to="/" className="text-xl font-bold text-sidebar-foreground">
              DragonCandy
            </Link>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => {
                const isActive = isActiveRoute(item.href);
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton asChild isActive={isActive}>
                      <Link to={item.href} className="flex items-center gap-3">
                        <item.icon className="h-5 w-5" />
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
                <Button className="w-full" size={collapsed ? "icon" : "default"}>
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

const DashboardLayout: React.FC<DashboardLayoutProps> = ({ children, userRole }) => {
  const { user } = useAuth();
  const logout = useLogout();
  const { avatarUrl, displayName } = useProfileData();
  const isMobile = useIsMobile();

  return (
    <SidebarProvider defaultOpen={!isMobile}>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar userRole={userRole} />
        
        <SidebarInset className="flex-1">
          {/* Header */}
          <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <div className="flex h-14 items-center justify-between px-4 lg:px-6">
              <div className="flex items-center gap-4">
                <SidebarTrigger />
                <h1 className="text-xl font-semibold text-foreground hidden sm:block">
                  {userRole === 'business_client' ? 'Restaurant Dashboard' : userRole === 'brand' ? 'Brand Dashboard' : 'Creator Dashboard'}
                </h1>
              </div>

              <div className="flex items-center gap-2 sm:gap-4">
                <NotificationDropdown />
                
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="relative h-8 w-8 rounded-full">
                      <Avatar className="h-8 w-8">
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

          {/* Page Content */}
          <main className="flex-1">
            {children}
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
};

export default DashboardLayout;
