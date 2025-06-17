
import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { 
  LayoutDashboard, 
  Target, 
  Users, 
  MessageSquare, 
  Settings, 
  LogOut,
  PlusCircle,
  Search,
  Briefcase
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import NotificationDropdown from '@/components/notifications/NotificationDropdown';

interface DashboardLayoutProps {
  children: React.ReactNode;
  userRole: 'business_client' | 'content_creator';
}

const DashboardLayout: React.FC<DashboardLayoutProps> = ({ children, userRole }) => {
  const location = useLocation();
  const { user, signOut } = useAuth();

  const businessNavItems = [
    { icon: LayoutDashboard, label: 'Dashboard', href: '/dashboard/business' },
    { icon: Target, label: 'Campaigns', href: '/dashboard/business/campaigns' },
    { icon: Briefcase, label: 'Projects', href: '/dashboard/business/projects' },
    { icon: MessageSquare, label: 'Messages', href: '/dashboard/business/messages' },
    { icon: Settings, label: 'Settings', href: '/dashboard/business/settings' },
  ];

  const creatorNavItems = [
    { icon: LayoutDashboard, label: 'Dashboard', href: '/dashboard/creator' },
    { icon: Search, label: 'Browse Campaigns', href: '/dashboard/creator/campaigns' },
    { icon: Briefcase, label: 'My Applications', href: '/dashboard/creator/applications' },
    { icon: MessageSquare, label: 'Messages', href: '/dashboard/creator/messages' },
    { icon: Settings, label: 'Settings', href: '/dashboard/creator/settings' },
  ];

  const navItems = userRole === 'business_client' ? businessNavItems : creatorNavItems;

  const isActiveRoute = (href: string) => {
    return location.pathname === href || location.pathname.startsWith(href + '/');
  };

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <div className="w-64 bg-white shadow-sm border-r border-gray-200">
        <div className="p-6">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-r from-pink-500 to-purple-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">DC</span>
            </div>
            <span className="text-xl font-bold text-gray-900">DragonCandy</span>
          </Link>
        </div>

        <nav className="px-4 pb-4 space-y-2">
          {navItems.map((item) => {
            const isActive = isActiveRoute(item.href);
            return (
              <Link
                key={item.href}
                to={item.href}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-purple-100 text-purple-700'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                }`}
              >
                <item.icon className="h-5 w-5" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {userRole === 'business_client' && (
          <div className="px-4 pb-4">
            <Link to="/dashboard/business/campaigns/new">
              <Button className="w-full">
                <PlusCircle className="h-4 w-4 mr-2" />
                New Campaign
              </Button>
            </Link>
          </div>
        )}
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <header className="bg-white border-b border-gray-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <h1 className="text-2xl font-bold text-gray-900">
                {userRole === 'business_client' ? 'Business Dashboard' : 'Creator Dashboard'}
              </h1>
            </div>

            <div className="flex items-center gap-4">
              <NotificationDropdown />
              
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="relative h-8 w-8 rounded-full">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={user?.user_metadata?.avatar_url} alt="Avatar" />
                      <AvatarFallback>
                        {user?.email?.charAt(0).toUpperCase() || 'U'}
                      </AvatarFallback>
                    </Avatar>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-56" align="end" forceMount>
                  <DropdownMenuLabel className="font-normal">
                    <div className="flex flex-col space-y-1">
                      <p className="text-sm font-medium leading-none">
                        {user?.user_metadata?.full_name || 'User'}
                      </p>
                      <p className="text-xs leading-none text-muted-foreground">
                        {user?.email}
                      </p>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link to={`/dashboard/${userRole === 'business_client' ? 'business' : 'creator'}/settings`}>
                      <Settings className="mr-2 h-4 w-4" />
                      <span>Settings</span>
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={signOut}>
                    <LogOut className="mr-2 h-4 w-4" />
                    <span>Log out</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </header>

        {/* Page Content */}
        {children}
      </div>
    </div>
  );
};

export default DashboardLayout;
