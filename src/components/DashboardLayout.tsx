
import React from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { 
  Sparkles, 
  LayoutDashboard, 
  Megaphone, 
  Store, 
  Image, 
  MessageSquare, 
  Settings, 
  LogOut 
} from 'lucide-react';

interface DashboardLayoutProps {
  children: React.ReactNode;
  userRole: 'business_client' | 'content_creator';
}

const DashboardLayout: React.FC<DashboardLayoutProps> = ({ children, userRole }) => {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const businessMenuItems = [
    { icon: LayoutDashboard, label: 'Dashboard', path: '/dashboard/business' },
    { icon: Megaphone, label: 'Campaigns', path: '/dashboard/business/campaigns' },
    { icon: Store, label: 'Marketplace', path: '/dashboard/business/marketplace' },
    { icon: Image, label: 'Media', path: '/dashboard/business/media' },
    { icon: MessageSquare, label: 'Messages', path: '/dashboard/business/messages' },
    { icon: Settings, label: 'Settings', path: '/dashboard/business/settings' },
  ];

  const creatorMenuItems = [
    { icon: LayoutDashboard, label: 'Dashboard', path: '/dashboard/creator' },
    { icon: Store, label: 'Marketplace', path: '/dashboard/creator/marketplace' },
    { icon: Megaphone, label: 'My Projects', path: '/dashboard/creator/projects' },
    { icon: Image, label: 'Portfolio', path: '/dashboard/creator/portfolio' },
    { icon: MessageSquare, label: 'Messages', path: '/dashboard/creator/messages' },
    { icon: Settings, label: 'Settings', path: '/dashboard/creator/settings' },
  ];

  const menuItems = userRole === 'business_client' ? businessMenuItems : creatorMenuItems;

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <div className="w-64 bg-white shadow-sm border-r border-gray-200 flex flex-col">
        {/* Logo */}
        <div className="p-6 border-b border-gray-200">
          <Link to="/" className="flex items-center gap-2">
            <div className="rounded-full bg-pink-100 p-2">
              <Sparkles className="text-pink-600 h-6 w-6" />
            </div>
            <span className="text-xl font-extrabold text-pink-600 tracking-tight">
              DragonCandy
            </span>
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4">
          <ul className="space-y-2">
            {menuItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;
              
              return (
                <li key={item.path}>
                  <Link
                    to={item.path}
                    className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-blue-50 text-blue-700 border border-blue-200'
                        : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'
                    }`}
                  >
                    <Icon className="h-5 w-5" />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Sign Out */}
        <div className="p-4 border-t border-gray-200">
          <Button
            variant="ghost"
            className="w-full justify-start text-gray-700 hover:text-red-600 hover:bg-red-50"
            onClick={handleSignOut}
          >
            <LogOut className="h-5 w-5 mr-3" />
            Sign Out
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {children}
      </div>
    </div>
  );
};

export default DashboardLayout;
