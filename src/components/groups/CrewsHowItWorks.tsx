import { useState, useEffect } from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';

interface Step {
  title: string;
  description: string;
}

const STEPS: Step[] = [
  {
    title: 'Build your roster',
    description:
      "Pick creators you've worked with, or want to. Each one gets an invite they can accept or decline — nobody joins a crew without saying yes.",
  },
  {
    title: 'Post free collabs, crew-only',
    description:
      'Crew campaigns are unpaid and private: no budget, no Stripe, and nobody outside the crew ever sees them.',
  },
  {
    title: 'They apply in one tap',
    description:
      "No bidding and no Stripe — and because the collab never goes public, your roster isn't competing with the whole marketplace for it. Review, approvals, and delivery work like any other campaign.",
  },
];

const STORAGE_KEY = 'crews-hiw-collapsed';

/**
 * Business-side "what is a crew?" explainer. Mirrors DragonShareHowItWorks —
 * collapsible, remembers its state. Shown whether or not the business has
 * crews yet, because the questions it answers (consent, cost, what it unlocks)
 * arrive before the first crew exists.
 */
export function CrewsHowItWorks() {
  const [collapsed, setCollapsed] = useState(() => {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, String(collapsed));
  }, [collapsed]);

  return (
    <div className="bg-white rounded-2xl p-4 border-l-[3px] border-l-dc-teal">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center justify-between w-full text-left"
        aria-expanded={!collapsed}
      >
        <p className="font-bold text-sm text-dc-text">💡 What's a crew?</p>
        {collapsed ? (
          <ChevronDown className="w-4 h-4 text-dc-text-muted" />
        ) : (
          <ChevronUp className="w-4 h-4 text-dc-text-muted" />
        )}
      </button>

      {!collapsed && (
        <div className="mt-3 space-y-3">
          {STEPS.map((step, i) => (
            <div key={i} className="flex gap-3">
              <div className="w-7 h-7 min-w-[28px] bg-dc-teal rounded-full flex items-center justify-center font-bold text-dc-dark text-xs">
                {i + 1}
              </div>
              <div>
                <p className="text-xs font-semibold text-dc-text">{step.title}</p>
                <p className="text-[11px] text-dc-text-muted mt-0.5">{step.description}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
