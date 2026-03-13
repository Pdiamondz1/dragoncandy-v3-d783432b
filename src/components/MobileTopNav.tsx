import { Link } from 'react-router-dom';
import { Menu, Settings, LogOut, LayoutDashboard, MessageSquare } from 'lucide-react';
import dragonCandyLogo from '@/assets/dragon-candy-logo.png';
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from '@/components/ui/sheet';
import { useLogout } from '@/hooks/useLogout';

interface MobileTopNavProps {
  bgClass?: string;
  userRole?: 'business_client' | 'content_creator' | 'brand';
}

export const MobileTopNav: React.FC<MobileTopNavProps> = ({
  bgClass = 'bg-background',
  userRole,
}) => {
  const logout = useLogout();

  const dashboardHref =
    userRole === 'business_client'
      ? '/dashboard/business'
      : userRole === 'brand'
      ? '/dashboard/brand'
      : userRole === 'content_creator'
      ? '/dashboard/creator'
      : '/';

  const settingsHref =
    userRole === 'business_client'
      ? '/dashboard/business/settings'
      : userRole === 'brand'
      ? '/dashboard/brand/settings'
      : userRole === 'content_creator'
      ? '/dashboard/creator/settings'
      : '/';

  const messagesHref =
    userRole === 'business_client'
      ? '/dashboard/business/messages'
      : userRole === 'brand'
      ? '/dashboard/brand/messages'
      : '/dashboard/creator/messages';

  return (
    <header className={`sticky top-0 z-40 flex items-center justify-between px-4 py-3 ${bgClass} border-b border-border`}>
      <Link to="/">
        <img src={dragonCandyLogo} alt="DragonCandy" className="h-8" />
      </Link>

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
