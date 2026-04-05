import React from 'react';
import { Link } from 'react-router-dom';
import { Menu, Settings, LogOut, LayoutDashboard, MessageSquare } from 'lucide-react';
import dragonCandyLogo from '@/assets/Transparent_DragonCandy_logo.png';
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
  bgClass = 'bg-white',
  userRole,
  showWelcome = false,
  displayName,
}) => {
  const logout = useLogout();

  const dashboardHref = userRole ? getDashboardHref(userRole) : '/';
  const settingsHref = userRole ? getSettingsHref(userRole) : '/';
  const messagesHref = userRole ? getMessagesHref(userRole) : '/';

  return (
    <header className={`sticky top-0 z-50 flex items-center justify-between px-4 py-2 ${bgClass} border-b border-border`}>
      <Link to="/" className="flex-shrink-0">
        <img src={dragonCandyLogo} alt="DragonCandy" className="w-[100px] md:w-[120px] lg:w-[140px] h-auto" />
      </Link>

      {showWelcome && displayName && (
        <div className="flex-1 min-w-0 text-center px-2">
          <p className="font-semibold text-sm uppercase tracking-wide text-dc-teal leading-tight truncate">
            Welcome Back, {displayName}
          </p>
          <p className="text-xs text-muted-foreground truncate">Create content and drive revenue</p>
        </div>
      )}

      <Sheet>
        <SheetTrigger asChild>
          <button
            className="p-2 rounded-full hover:bg-muted transition-colors"
            aria-label="Open menu"
          >
            <Menu className="h-6 w-6 text-gray-600" />
          </button>
        </SheetTrigger>
        <SheetContent side="right" className="w-64 pt-8">
          <div className="flex flex-col gap-1">
            <Link
              to={dashboardHref}
              className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-dc-teal/10 text-foreground text-base font-medium"
            >
              <LayoutDashboard className="h-5 w-5 text-dc-teal" />
              Dashboard
            </Link>
            {userRole && (
              <Link
                to={messagesHref}
                className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-dc-teal/10 text-foreground text-base font-medium"
              >
                <MessageSquare className="h-5 w-5 text-dc-teal" />
                Messages
              </Link>
            )}
            {userRole && (
              <Link
                to={settingsHref}
                className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-dc-teal/10 text-foreground text-base font-medium"
              >
                <Settings className="h-5 w-5 text-dc-teal" />
                Settings
              </Link>
            )}
            <button
              onClick={logout}
              className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-red-50 text-red-600 text-base font-medium w-full text-left mt-4"
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
