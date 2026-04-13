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
      className="flex flex-col items-center min-h-[44px] min-w-[44px] -mt-3"
      aria-label="Open Donny"
    >
      <span className="w-[53px] h-[53px] rounded-full bg-white shadow-[0_0_0_3px_rgba(77,217,192,0.35),0_2px_8px_rgba(0,0,0,0.08)] flex items-center justify-center -mt-3 transition-transform active:scale-95">
        <img
          src={donnyEmblem}
          alt="Donny"
          className="w-11 h-11 object-contain"
        />
      </span>
    </button>
  );
}
