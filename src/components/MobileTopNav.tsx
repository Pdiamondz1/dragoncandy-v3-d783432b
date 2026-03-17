import React from 'react';
import { Link } from 'react-router-dom';
import { Menu, Settings, LogOut, LayoutDashboard, MessageSquare } from 'lucide-react';
import dragonCandyLogo from '@/assets/dragon-candy-logo.png';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { useLogout } from '@/hooks/useLogout';
import type { UserRole } from '@/types/user';
import { getDashboardHref, getSettingsHref, getMessagesHref } from '@/lib/navConfig';

interface MobileTopNavProps {
  bgClass?: string;
  userRole?: UserRole;
  showWelcome?: boolean;
  displayName?: string;
}

export const MobileTopNav: React.FC<MobileTopNavProps> = ({
  bgClass = 'bg-background',
  userRole,
  showWelcome = false,
  displayName,
}) => {
  const logout = useLogout();

  const dashboardHref = userRole ? getDashboardHref(userRole) : '/';
  const settingsHref = userRole ? getSettingsHref(userRole) : '/';
  const messagesHref = userRole ? getMessagesHref(userRole) : '/';

  return (
    <header className={`sticky top-0 z-40 flex items-center justify-between px-4 py-3 ${bgClass} border-b border-border`}>
      <Link to="/">
        <img src={dragonCandyLogo} alt="DragonCandy" className="h-8" />
      </Link>

      {showWelcome && displayName && (
        <div className="flex-1 text-center px-2">
          <p className="text-xs font-bold text-dc-teal uppercase leading-tight truncate">
            Welcome Back, {displayName}
          </p>
          <p className="text-xs text-[#555555]">Create content and drive revenue</p>
        </div>
      )}

      <Sheet>
        <SheetTrigger asChild>
          <button
            className="p-2 rounded-full hover:bg-gray-100 transition-colors"
            aria-label="Open menu"
          >
            <Menu className="h-6 w-6 text-foreground" />
          </button>
        </SheetTrigger>
        <SheetContent side="right" className="w-64 pt-8">
          <div className="flex flex-col gap-1">
            <Link
              to={dashboardHref}
              className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-dc-teal/10 text-foreground font-medium"
            >
              <LayoutDashboard className="h-5 w-5 text-dc-teal" />
              Dashboard
            </Link>
            {userRole && (
              <Link
                to={messagesHref}
                className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-dc-teal/10 text-foreground font-medium"
              >
                <MessageSquare className="h-5 w-5 text-dc-teal" />
                Messages
              </Link>
            )}
            {userRole && (
              <Link
                to={settingsHref}
                className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-dc-teal/10 text-foreground font-medium"
              >
                <Settings className="h-5 w-5 text-dc-teal" />
                Settings
              </Link>
            )}
            <button
              onClick={logout}
              className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-red-50 text-red-600 font-medium w-full text-left mt-4"
            >
              <LogOut className="h-5 w-5" />
              Log out
            </button>
          </div>
        </SheetContent>
      </Sheet>
    </header>
  );
};

export default MobileTopNav;
