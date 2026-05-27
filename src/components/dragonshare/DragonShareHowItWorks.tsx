import { useState, useEffect } from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';

interface Step {
  title: string;
  description: string;
}

const CREATOR_STEPS: Step[] = [
  { title: 'Upload your content', description: "Photo or video from your phone. Add a link if it's posted on social." },
  { title: 'Restaurant sees it', description: 'They decide if they want to boost your content.' },
  { title: 'You get paid + it goes everywhere', description: 'You keep 80% of the boost. Your content gets auto-posted across all your connected platforms.' },
];

const BUSINESS_STEPS: Step[] = [
  { title: 'Creators post about you', description: "They share content they've already made — food pics, reels, reviews." },
  { title: 'You pick what to boost', description: 'Choose a tier ($25–$250). One tap, no briefs, no back-and-forth.' },
  { title: 'Content goes everywhere', description: "Auto-posted across the creator's platforms AND yours. One mention becomes a multi-platform campaign." },
];

interface DragonShareHowItWorksProps {
  role: 'creator' | 'business';
}

export function DragonShareHowItWorks({ role }: DragonShareHowItWorksProps) {
  const storageKey = `dragonshare-hiw-collapsed-${role}`;
  const [collapsed, setCollapsed] = useState(() => {
    return localStorage.getItem(storageKey) === 'true';
  });

  useEffect(() => {
    localStorage.setItem(storageKey, String(collapsed));
  }, [collapsed, storageKey]);

  const steps = role === 'creator' ? CREATOR_STEPS : BUSINESS_STEPS;
  const accentColor = role === 'creator' ? 'border-l-dc-teal' : 'border-l-dc-pink';
  const stepBg = role === 'creator' ? 'bg-dc-teal' : 'bg-dc-pink';

  return (
    <div className={`bg-white rounded-2xl p-4 border-l-[3px] ${accentColor}`}>
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center justify-between w-full text-left"
      >
        <p className="font-bold text-sm text-dc-text">💡 How it works</p>
        {collapsed ? (
          <ChevronDown className="w-4 h-4 text-dc-text-muted" />
        ) : (
          <ChevronUp className="w-4 h-4 text-dc-text-muted" />
        )}
      </button>

      {!collapsed && (
        <div className="mt-3 space-y-3">
          {steps.map((step, i) => (
            <div key={i} className="flex gap-3">
              <div className={`w-7 h-7 min-w-[28px] ${stepBg} rounded-full flex items-center justify-center font-bold text-dc-dark text-xs`}>
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
