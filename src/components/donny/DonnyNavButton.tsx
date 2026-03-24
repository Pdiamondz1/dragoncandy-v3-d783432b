import { useDonnyDashboard } from '@/hooks/useDonnyDashboard';
import donnyIcon from '@/assets/Donny_icon.png';

interface DonnyNavButtonProps {
  onClick: () => void;
}

export function DonnyNavButton({ onClick }: DonnyNavButtonProps) {
  const { data: suggestion } = useDonnyDashboard();
  const hasNotification = !!suggestion;

  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center -mt-4 relative"
    >
      <div className="w-14 h-14 rounded-full bg-gradient-to-br from-[#4DD9C0] to-[#00E5CC] flex items-center justify-center shadow-lg shadow-teal-400/40 border-[3px] border-white">
        <img src={donnyIcon} alt="Donny" className="h-10 w-10 object-contain" />
      </div>
      {hasNotification && (
        <span className="absolute top-0 right-0 w-3 h-3 bg-[#EC4899] rounded-full border-2 border-white" />
      )}
      <span className="text-[10px] text-[#4DD9C0] font-bold mt-0.5">Donny</span>
    </button>
  );
}
