import React from 'react';
import { Link } from 'react-router-dom';
import { Menu, LogOut } from 'lucide-react';
import dragonCandyLogo from '@/assets/Transparent_DragonCandy_logo.png';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { useLogout } from '@/hooks/useLogout';
import type { UserRole } from '@/types/user';
import { getDrawerMenu } from '@/lib/navConfig';

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
  const sections = userRole ? getDrawerMenu(userRole) : [];

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
        <SheetContent side="right" className="w-72 pt-8 flex flex-col h-full">
          <nav className="flex-1 overflow-y-auto">
            {sections.map((section) => (
              <div key={section.heading} className="mb-4">
                <h3 className="px-4 mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {section.heading}
                </h3>
                <div className="flex flex-col gap-0.5">
                  {section.items.map((item) => (
                    <Link
                      key={item.href}
                      to={item.href}
                      className="flex items-center gap-3 px-4 py-2.5 rounded-xl hover:bg-dc-teal/10 text-foreground text-sm font-medium transition-colors"
                    >
                      <item.icon className="h-5 w-5 text-dc-teal flex-shrink-0" />
                      {item.label}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </nav>

          <div className="border-t border-border pt-3 pb-4">
            <button
              onClick={logout}
              className="flex items-center gap-3 px-4 py-2.5 rounded-xl hover:bg-red-50 text-red-600 text-sm font-medium w-full text-left transition-colors"
            >
              <LogOut className="h-5 w-5" />
              Sign Out
            </button>
          </div>
        </SheetContent>
      </Sheet>
    </header>
  );
};

export default MobileTopNav;
