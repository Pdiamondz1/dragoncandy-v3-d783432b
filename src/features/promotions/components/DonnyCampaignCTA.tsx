import React from 'react';
import { Sparkles } from 'lucide-react';

const DONNY_PROMPT = "Suggest three campaigns based on my Toast data";

/**
 * Pink CTA button that opens Donny with a Toast-data campaign prompt.
 * Dispatches the `donny-open-chat` custom event consumed by MobileBottomNav.
 */
export const DonnyCampaignCTA: React.FC = () => {
  const handleClick = () => {
    window.dispatchEvent(
      new CustomEvent('donny-open-chat', { detail: { message: DONNY_PROMPT } })
    );
  };

  return (
    <button
      onClick={handleClick}
      className="w-full rounded-full bg-[#F9A8D4] hover:bg-[#f490c7] active:scale-[0.98] text-gray-900 font-bold py-3 px-5 flex items-center justify-center gap-2 transition-all duration-150 shadow-sm"
    >
      <Sparkles className="w-4 h-4" />
      Ask Donny for campaign ideas
    </button>
  );
};
