import { motion } from '@/lib/motion';
import { LandingButton } from '@/components/landing/LandingButton';
import { Rocket, ArrowRight } from 'lucide-react';

interface WelcomeStepProps {
  name: string;
  role: 'business_client' | 'content_creator' | 'brand';
  onContinue: () => void;
  loading: boolean;
}

const roleMessages = {
  business_client: {
    heading: "You're all set!",
    body: "Your restaurant profile is live. Start browsing creators and launch your first campaign.",
    cta: "Go to Dashboard",
  },
  content_creator: {
    heading: "Let's go!",
    body: "Your creator profile is ready. Browse campaigns, apply to gigs, and start creating.",
    cta: "See Campaigns",
  },
  brand: {
    heading: "Welcome aboard!",
    body: "Your brand is live on DragonCandy. Discover creators and sponsor campaigns.",
    cta: "Explore",
  },
};

const particles = Array.from({ length: 12 }, (_, i) => ({
  id: i,
  x: Math.cos((i / 12) * Math.PI * 2) * 80,
  y: Math.sin((i / 12) * Math.PI * 2) * 80,
  color: i % 3 === 0 ? '#2FC796' : i % 3 === 1 ? '#F43F7F' : '#FFC93C',
  size: 4 + (i % 3) * 2,
  delay: i * 0.06,
}));

export function WelcomeStep({ name, role, onContinue, loading }: WelcomeStepProps) {
  const config = roleMessages[role];

  return (
    <div className="flex flex-col items-center text-center">
      {/* Celebration burst */}
      <div className="relative w-32 h-32 mb-6">
        {particles.map((p) => (
          <motion.div
            key={p.id}
            className="absolute rounded-full"
            style={{
              width: p.size,
              height: p.size,
              backgroundColor: p.color,
              left: '50%',
              top: '50%',
            }}
            initial={{ x: 0, y: 0, opacity: 0, scale: 0 }}
            animate={{
              x: p.x,
              y: p.y,
              opacity: [0, 1, 0],
              scale: [0, 1.2, 0],
            }}
            transition={{
              duration: 1.2,
              delay: 0.3 + p.delay,
              ease: 'easeOut',
            }}
          />
        ))}

        <motion.div
          initial={{ scale: 0, rotate: -30 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.1 }}
          className="absolute inset-0 flex items-center justify-center"
        >
          <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-landing-mint to-landing-pink flex items-center justify-center shadow-[0_14px_30px_rgba(36,19,50,0.12)]">
            <Rocket className="w-10 h-10 text-white" />
          </div>
        </motion.div>
      </div>

      <motion.h2
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="font-display text-2xl font-bold text-landing-ink mb-1"
      >
        {config.heading}
      </motion.h2>

      {name && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="text-lg font-script text-landing-pink mb-3"
        >
          {name}
        </motion.p>
      )}

      <motion.p
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.55 }}
        className="text-sm text-landing-ink-soft max-w-xs mb-8"
      >
        {config.body}
      </motion.p>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.7 }}
        className="w-full"
      >
        <LandingButton
          onClick={onContinue}
          disabled={loading}
          variant="pink"
          className="w-full h-14 text-base disabled:opacity-60"
        >
          {loading ? 'Setting up...' : (
            <span className="flex items-center gap-2">
              {config.cta}
              <ArrowRight className="w-4 h-4" />
            </span>
          )}
        </LandingButton>
      </motion.div>
    </div>
  );
}
