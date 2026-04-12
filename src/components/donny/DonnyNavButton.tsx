import { useDonnyContext } from '@/contexts/DonnyProvider';
import donnyEmblem from '@/assets/donny-emblem.png';

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
      <span className="w-20 h-20 -mt-6 flex items-center justify-center">
        <img
          src={donnyEmblem}
          alt="Donny"
          className="w-20 h-20 object-contain"
        />
      </span>
    </button>
  );
}
