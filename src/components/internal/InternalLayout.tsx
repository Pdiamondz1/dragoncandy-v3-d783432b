import { useEffect, useState } from 'react';
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
  { to: '/internal/workspace', label: 'Workspace' },
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

  // Ops-deck dark: flip the shadcn `dark` tokens while any internal page is
  // mounted so portaled primitives (dialogs, dropdowns, selects) match the
  // theme. Removed on unmount and never persisted — the consumer app keeps
  // its light default.
  useEffect(() => {
    document.documentElement.classList.add('dark');
    return () => document.documentElement.classList.remove('dark');
  }, []);

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
    <div className="relative min-h-screen bg-dc-dark">
      {/* Atmosphere: teal dawn top-left, pink ember bottom-right, blueprint grid */}
      <div aria-hidden className="pointer-events-none fixed inset-0">
        <div className="absolute -left-40 -top-40 h-[34rem] w-[34rem] rounded-full bg-dc-teal/10 blur-[120px]" />
        <div className="absolute -bottom-48 -right-32 h-[30rem] w-[30rem] rounded-full bg-dc-pink-accent/10 blur-[120px]" />
        <div
          className="absolute inset-0 opacity-[0.05]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(77,217,192,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(77,217,192,0.5) 1px, transparent 1px)',
            backgroundSize: '56px 56px',
          }}
        />
      </div>

      <header className="relative z-10 border-b border-dc-teal/20 bg-dc-dark/70 px-4 py-3 backdrop-blur-md lg:px-8">
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
                      ? 'bg-dc-teal font-bold text-dc-dark'
                      : 'text-white/70 hover:bg-white/[0.06] hover:text-white'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            {user?.email && (
              <span className="hidden text-xs text-white/40 lg:inline">{user.email}</span>
            )}
            <button
              type="button"
              onClick={signOut}
              disabled={signingOut}
              className="flex items-center gap-1.5 rounded-full border border-dc-teal/30 px-4 py-1.5 text-sm font-semibold text-dc-pink transition-colors hover:bg-white/[0.06] disabled:opacity-50"
            >
              <LogOut className="h-3.5 w-3.5" />
              {signingOut ? 'Signing out…' : 'Sign out'}
            </button>
          </div>
        </div>
      </header>
      <main className="relative z-10 p-4 lg:p-8">
        <Outlet />
      </main>
    </div>
  );
};
