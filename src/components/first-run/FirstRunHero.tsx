import type { UserRole } from '@/types/firstRun';

interface FirstRunHeroProps {
  name: string;
  role: UserRole;
  onCtaClick: () => void;
}

const HERO_CONFIG: Record<UserRole, {
  gradient: string;
  emoji: string;
  subtitle: string;
  cta: string;
  decoration: string;
}> = {
  business_client: {
    gradient: 'from-teal-400 via-emerald-400 to-pink-300',
    emoji: '🐉',
    subtitle: "Let's get creators knocking on your door.\n60 seconds. We'll do the heavy lifting.",
    cta: 'Create Your First Campaign ✨',
    decoration: '✨',
  },
  content_creator: {
    gradient: 'from-teal-400 via-teal-300 to-pink-300',
    emoji: '🎬',
    subtitle: "Brands are looking for creators like you.\nLet's get you booked on your first campaign.",
    cta: 'See Campaigns For You 👀',
    decoration: '✨',
  },
  brand: {
    gradient: 'from-pink-500 via-pink-300 to-teal-400',
    emoji: '🏢',
    subtitle: "Let's connect you with creators who\nget your brand. Under 60 seconds.",
    cta: 'Find Your Creators 🎯',
    decoration: '🍬',
  },
};

export function FirstRunHero({ name, role, onCtaClick }: FirstRunHeroProps) {
  const config = HERO_CONFIG[role];

  return (
    <div className={`bg-gradient-to-br ${config.gradient} rounded-3xl p-6 text-center relative overflow-hidden mb-4`}>
      <div className="absolute top-3 right-4 text-base opacity-50">{config.decoration}</div>
      <div className="text-3xl mb-2">{config.emoji}</div>
      <h1 className="text-xl font-bold text-white mb-1">
        Welcome, {name}!
      </h1>
      <p className="text-sm text-white/90 mb-5 whitespace-pre-line">
        {config.subtitle}
      </p>
      <button
        onClick={onCtaClick}
        className="bg-white text-gray-900 font-bold py-3 px-7 rounded-full text-sm shadow-lg hover:shadow-xl transition-shadow"
      >
        {config.cta}
      </button>
    </div>
  );
}
