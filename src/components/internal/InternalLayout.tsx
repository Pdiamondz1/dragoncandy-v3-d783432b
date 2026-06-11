import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { LogOut } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useInternalAccess } from '@/hooks/internal/useInternalAccess';

interface NavItem {
  to: string;
  label: string;
  end?: boolean;
}

const stakeholderNav: NavItem[] = [
  { to: '/internal', label: 'Overview', end: true },
  { to: '/internal/weight', label: 'Weight' },
  { to: '/internal/briefings', label: 'Briefings' },
  { to: '/internal/strategy', label: 'Strategy' },
];

const adminNav: NavItem[] = [
  { to: '/internal/expenses', label: 'Expenses' },
  { to: '/internal/findings', label: 'Findings' },
  { to: '/internal/donny', label: 'Donny' },
];

export const InternalLayout = () => {
  const { isAdmin } = useInternalAccess();
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [signingOut, setSigningOut] = useState(false);
  const navItems = isAdmin ? [...stakeholderNav, ...adminNav] : stakeholderNav;

  const signOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await supabase.auth.signOut();
      queryClient.clear();
    } finally {
      navigate('/auth', { replace: true });
    }
  };

  return (
    <div className="min-h-screen bg-dc-card">
      <header className="border-b-2 border-teal-400 bg-dc-card px-4 py-3 lg:px-8">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <div className="flex items-center gap-2">
            <img src="/logo.webp" alt="DragonCandy" className="h-8 w-auto" />
            <span className="font-bold text-dc-teal">AIOS</span>
          </div>
          <nav className="flex flex-wrap items-center gap-1" aria-label="Internal">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${
                    isActive
                      ? 'bg-dc-teal text-white'
                      : 'text-dc-text hover:bg-dc-teal/12'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            {user?.email && (
              <span className="hidden text-xs text-dc-text-muted lg:inline">{user.email}</span>
            )}
            <button
              type="button"
              onClick={signOut}
              disabled={signingOut}
              className="flex items-center gap-1.5 rounded-full border border-dc-teal px-4 py-1.5 text-sm font-semibold text-dc-pink-accent transition-colors hover:bg-dc-teal/12 disabled:opacity-50"
            >
              <LogOut className="h-3.5 w-3.5" />
              {signingOut ? 'Signing out…' : 'Sign out'}
            </button>
          </div>
        </div>
      </header>
      <main className="p-4 lg:p-8">
        <Outlet />
      </main>
    </div>
  );
};
