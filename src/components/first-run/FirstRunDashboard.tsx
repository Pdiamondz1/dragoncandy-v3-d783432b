import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { FirstRunHero } from './FirstRunHero';
import { MissionChecklist } from './MissionChecklist';
import type { UserRole, RoleMissions } from '@/types/firstRun';
import donnyEmblem from '@/assets/donny-emblem.webp';

interface FirstRunDashboardProps {
  role: UserRole;
  missions: RoleMissions;
  onCompleteMission: (key: string) => void;
  onSkip: () => void;
}

export function FirstRunDashboard({ role, missions, onCompleteMission: _onCompleteMission, onSkip }: FirstRunDashboardProps) {
  const { profile } = useAuth();
  const navigate = useNavigate();

  const displayName =
    profile?.business_name || profile?.creator_name || profile?.full_name || 'there';

  const handleCtaClick = () => {
    switch (role) {
      case 'business_client':
        navigate('/dashboard/business/campaigns/create');
        break;
      case 'content_creator':
        navigate('/dashboard/creator/campaigns');
        break;
      case 'brand':
        navigate('/dashboard/brand/style-picker');
        break;
    }
  };

  const handleMissionGo = (key: string) => {
    switch (key) {
      case 'browse_inspiration':
      case 'create_campaign':
      case 'launch_campaign':
        navigate('/dashboard/business/campaigns/create');
        break;
      case 'view_campaigns':
      case 'apply_campaign':
        navigate('/dashboard/creator/campaigns');
        break;
      case 'add_portfolio':
        navigate('/dashboard/creator/settings');
        break;
      case 'select_style':
        navigate('/dashboard/brand/style-picker');
        break;
      case 'browse_creators':
        navigate('/dashboard/brand/creators');
        break;
      case 'create_sponsorship':
        navigate('/dashboard/brand/campaigns/create');
        break;
    }
  };

  return (
    <div className="min-h-screen bg-white p-4">
      {/* Top bar */}
      <div className="flex justify-between items-center mb-4">
        <span className="flex items-center gap-1.5 text-sm font-bold text-dc-teal-btn">
          <img src={donnyEmblem} alt="" className="h-4 w-4 rounded-full object-cover scale-[1.35]" />
          DragonCandy
        </span>
        <button
          className="w-7 h-7 rounded-full bg-dc-teal/10 flex items-center justify-center text-xs text-dc-teal-btn"
          aria-label="Help tour"
        >
          ?
        </button>
      </div>

      <FirstRunHero name={displayName} role={role} onCtaClick={handleCtaClick} />
      <MissionChecklist
        role={role}
        missions={missions}
        onMissionGo={handleMissionGo}
        onSkip={onSkip}
      />

      <p className="text-center text-xs text-gray-500 mt-4">
        Takes about 60 seconds total ⚡
      </p>
    </div>
  );
}
