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
      <span className="w-14 h-14 -mt-4 flex items-center justify-center">
        <img
          src={donnyEmblem}
          alt="Donny"
          className="w-full h-full object-contain"
        />
      </span>
    </button>
  );
}
