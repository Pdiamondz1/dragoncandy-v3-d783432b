import { DonnyAvatar } from './DonnyAvatar';
import { useDonnyContext } from '@/contexts/DonnyProvider';

export function DonnyNavButton() {
  const { stage, open, close, unreadCount, avatarState } = useDonnyContext();

  const handleClick = () => {
    if (stage === 'closed') {
      open();
    } else {
      close();
    }
  };

  return (
    <button
      onClick={handleClick}
      className="flex flex-col items-center -mt-4 min-h-[44px] min-w-[44px]"
      aria-label="Open Donny"
    >
      <span className="bg-white w-14 h-14 rounded-full shadow-lg shadow-dc-teal/30 -mt-4 flex items-center justify-center border-[3px] border-white">
        <DonnyAvatar
          size="lg"
          state={unreadCount > 0 ? 'action_needed' : avatarState}
          badgeCount={unreadCount}
          glow={unreadCount > 0}
        />
      </span>
    </button>
  );
}
