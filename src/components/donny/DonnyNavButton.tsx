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
      data-tour="donny-help"
      className="flex flex-col items-center min-h-[44px] min-w-[44px] -mt-3"
      aria-label="Open Donny"
    >
      <span className="w-[52px] h-[52px] rounded-full shadow-[0_0_0_3px_rgba(77,217,192,0.35),0_2px_8px_rgba(0,0,0,0.08)] -mt-3 transition-transform active:scale-95 overflow-hidden">
        <img
          src={donnyEmblem}
          alt="Donny"
          className="w-full h-full object-cover scale-[1.35]"
        />
      </span>
    </button>
  );
}
