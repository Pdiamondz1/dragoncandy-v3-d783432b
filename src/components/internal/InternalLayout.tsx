import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  Bot,
  Bug,
  BookOpen,
  ClipboardCheck,
  FileText,
  FolderOpen,
  Gauge,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Menu,
  Presentation,
  Receipt,
  Repeat,
  Sparkles,
  TrendingUp,
  Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useInternalAccess } from '@/hooks/internal/useInternalAccess';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}

interface NavGroup {
  label: string;
  admin?: boolean;
  items: NavItem[];
}

// Donny is pinned above the groups for one-tap access (admin-only, like the
// rest of the Operate surface).
const DONNY_ITEM: NavItem = { to: '/internal/donny', label: 'Ask Donny', icon: Sparkles };

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Monitor',
    items: [
      { to: '/internal/scorecard', label: 'Scorecard', icon: Presentation },
      { to: '/internal', label: 'Overview', icon: LayoutDashboard, end: true },
      { to: '/internal/weight', label: 'Weight', icon: Gauge },
      { to: '/internal/briefings', label: 'Briefings', icon: FileText },
      { to: '/internal/strategy', label: 'Strategy', icon: BookOpen },
      { to: '/internal/workspace', label: 'Workspace', icon: FolderOpen },
    ],
  },
  {
    label: 'Operate',
    admin: true,
    items: [
      { to: '/internal/expenses', label: 'Expenses', icon: Receipt },
      { to: '/internal/forecast', label: 'Forecast', icon: TrendingUp },
      { to: '/internal/findings', label: 'Findings', icon: Bug },
      { to: '/internal/corrections', label: 'Corrections', icon: ClipboardCheck },
      { to: '/internal/playbooks', label: 'Playbooks', icon: ListChecks },
      { to: '/internal/loops', label: 'Loops', icon: Repeat },
      { to: '/internal/stakeholders', label: 'Stakeholders', icon: Users },
      { to: '/internal/simulation', label: 'Simulation', icon: Bot },
    ],
  },
];

const linkClass = (isActive: boolean) =>
  cn(
    'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold transition-colors',
    isActive
      ? 'bg-dc-teal text-dc-dark'
      : 'text-white/70 hover:bg-white/[0.06] hover:text-white',
  );

/** Sidebar body — shared verbatim by the desktop rail and the mobile drawer. */
function NavBody({
  isAdmin,
  email,
  signingOut,
  onSignOut,
  onNavigate,
}: {
  isAdmin: boolean;
  email?: string | null;
  signingOut: boolean;
  onSignOut: () => void;
  onNavigate?: () => void;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="mb-5 flex items-center gap-2 px-1">
        <img src="/logo.webp" alt="DragonCandy" className="h-8 w-auto" />
        <span className="font-bold text-dc-teal">AIOS</span>
      </div>

      {isAdmin && (
        <NavLink
          to={DONNY_ITEM.to}
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              'mb-5 flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-sm font-bold transition-colors',
              isActive
                ? 'border-dc-pink-accent/60 bg-dc-pink-accent/15 text-dc-pink'
                : 'border-dc-teal/40 bg-dc-teal/10 text-dc-teal hover:bg-dc-teal/[0.18]',
            )
          }
        >
          <Sparkles className="h-4 w-4 shrink-0" />
          Ask Donny
        </NavLink>
      )}

      <nav className="flex-1 space-y-5 overflow-y-auto overscroll-contain" aria-label="Internal">
        {NAV_GROUPS.map((group) => {
          if (group.admin && !isAdmin) return null;
          return (
            <div key={group.label}>
              <p className="px-3 pb-1.5 font-mono text-[10px] uppercase tracking-wider text-white/35">
                {group.label}
              </p>
              <div className="space-y-0.5">
                {group.items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    onClick={onNavigate}
                    className={({ isActive }) => linkClass(isActive)}
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
                    {item.label}
                  </NavLink>
                ))}
              </div>
            </div>
          );
        })}
      </nav>

      <div className="mt-4 border-t border-white/10 pt-3">
        {email && <p className="truncate px-3 pb-2 text-xs text-white/40">{email}</p>}
        <button
          type="button"
          onClick={onSignOut}
          disabled={signingOut}
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-dc-pink transition-colors hover:bg-white/[0.06] disabled:opacity-50"
        >
          <LogOut className="h-4 w-4 shrink-0" />
          {signingOut ? 'Signing out…' : 'Sign out'}
        </button>
      </div>
    </div>
  );
}

export const InternalLayout = () => {
  const { isAdmin } = useInternalAccess();
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [signingOut, setSigningOut] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

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

      {/* Mobile top bar (hamburger + logo + quick Donny) — sticky so the menu
          and Ask Donny stay reachable while the page scrolls. */}
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-dc-teal/20 bg-dc-dark/80 px-4 py-3 backdrop-blur-md lg:hidden">
        <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
          <SheetTrigger asChild>
            <button
              type="button"
              aria-label="Open navigation menu"
              className="-ml-1.5 rounded-lg p-1.5 text-white/80 transition-colors hover:bg-white/[0.06]"
            >
              <Menu className="h-5 w-5" />
            </button>
          </SheetTrigger>
          <SheetContent side="left" className="w-72 border-dc-teal/20 bg-dc-dark p-4">
            <SheetTitle className="sr-only">AIOS navigation</SheetTitle>
            <NavBody
              isAdmin={isAdmin}
              email={user?.email}
              signingOut={signingOut}
              onSignOut={signOut}
              onNavigate={() => setDrawerOpen(false)}
            />
          </SheetContent>
        </Sheet>

        <div className="flex items-center gap-2">
          <img src="/logo.webp" alt="DragonCandy" className="h-7 w-auto" />
          <span className="font-bold text-dc-teal">AIOS</span>
        </div>

        {isAdmin && (
          <NavLink
            to={DONNY_ITEM.to}
            className={({ isActive }) =>
              cn(
                'ml-auto flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold transition-colors',
                isActive
                  ? 'border-dc-pink-accent/60 bg-dc-pink-accent/15 text-dc-pink'
                  : 'border-dc-teal/40 bg-dc-teal/10 text-dc-teal',
              )
            }
          >
            <Sparkles className="h-3.5 w-3.5" />
            Ask Donny
          </NavLink>
        )}
      </header>

      <div className="relative z-10 flex">
        {/* Desktop sidebar */}
        <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-dc-teal/20 bg-dc-dark/60 p-4 backdrop-blur-md lg:flex">
          <NavBody
            isAdmin={isAdmin}
            email={user?.email}
            signingOut={signingOut}
            onSignOut={signOut}
          />
        </aside>

        <main className="min-w-0 flex-1 p-4 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
};
