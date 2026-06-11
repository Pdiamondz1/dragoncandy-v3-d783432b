import { NavLink, Outlet } from 'react-router-dom';
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
  const navItems = isAdmin ? [...stakeholderNav, ...adminNav] : stakeholderNav;

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
        </div>
      </header>
      <main className="p-4 lg:p-8">
        <Outlet />
      </main>
    </div>
  );
};
