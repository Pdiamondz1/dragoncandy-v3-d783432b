interface TourButtonProps {
  onClick: () => void;
}

/** Quiet "?" button that replays the page tour. */
export function TourButton({ onClick }: TourButtonProps) {
  return (
    <button
      onClick={onClick}
      className="w-7 h-7 rounded-full border border-dc-teal/20 flex items-center justify-center text-xs text-dc-text-muted hover:bg-dc-teal/5 transition-colors"
      aria-label="Show tour"
    >
      ?
    </button>
  );
}
