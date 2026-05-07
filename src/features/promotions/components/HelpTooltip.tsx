import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { HelpCircle, ArrowRight } from 'lucide-react';

interface HelpTooltipProps {
  /** URL slug matching a brief in /help/promotions/ */
  slug: string;
  /** One-sentence summary shown in the popover */
  summary: string;
  /** Optional override for the link label */
  linkLabel?: string;
}

/**
 * Teal "?" circle that pops open a brief-summary card on click.
 * Positioned inline — wrap it next to a heading or label.
 */
export const HelpTooltip: React.FC<HelpTooltipProps> = ({
  slug,
  summary,
  linkLabel = 'Read full brief',
}) => {
  const [open, setOpen] = useState(false);

  return (
    <span className="relative inline-flex items-center">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        aria-label="Help"
        className="w-5 h-5 rounded-full bg-dc-teal text-white flex items-center justify-center text-[11px] font-bold hover:bg-dc-teal/80 transition-colors focus:outline-none focus:ring-2 focus:ring-dc-teal/40 focus:ring-offset-1"
      >
        <HelpCircle className="w-3.5 h-3.5" />
      </button>

      {open && (
        <div className="absolute z-50 left-1/2 -translate-x-1/2 top-full mt-2 w-64 animate-in fade-in slide-in-from-top-1 duration-150">
          {/* Arrow */}
          <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-3 h-3 rotate-45 bg-white border-l border-t border-gray-200" />

          {/* Card */}
          <div className="relative bg-white rounded-xl border border-gray-200 shadow-lg p-3.5">
            <p className="text-xs text-gray-600 leading-relaxed mb-3">
              {summary}
            </p>
            <Link
              to={`/help/promotions/${slug}`}
              className="inline-flex items-center gap-1 text-xs font-semibold text-dc-teal hover:text-dc-teal/80 transition-colors"
              onClick={() => setOpen(false)}
            >
              {linkLabel}
              <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
        </div>
      )}
    </span>
  );
};
