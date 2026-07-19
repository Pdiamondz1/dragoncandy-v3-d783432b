import { Store, Camera, Megaphone } from "lucide-react";
import { BRAND_ROLE_ENABLED } from '@/lib/featureConfig';
import { Eyebrow } from "@/components/landing/Eyebrow";

interface RoleSelectionProps {
  onSelectRole: (role: "business_client" | "content_creator" | "brand") => void;
  onBackToLogin: () => void;
}

const CARD_CLASSES =
  "w-full rounded-2xl border-2 p-6 flex items-center gap-5 text-left " +
  "transition-[transform,box-shadow] motion-safe:hover:-translate-y-0.5 " +
  "hover:shadow-[0_10px_24px_rgba(36,19,50,0.10)]";

export const RoleSelection = ({ onSelectRole, onBackToLogin }: RoleSelectionProps) => {
  return (
    <div className="flex-1 flex flex-col justify-center px-6 py-8">
      <div className="text-center mb-3">
        <Eyebrow className="text-landing-pink">Get started</Eyebrow>
      </div>
      <h2 className="font-display text-2xl font-extrabold text-landing-ink text-center mb-3">
        Join DragonCandy
      </h2>
      <p className="text-landing-ink-soft text-sm text-center mb-8">
        How will you use DragonCandy?
      </p>

      <div className="w-full max-w-sm md:max-w-md mx-auto flex flex-col gap-4">
        {/* Business card */}
        <button
          type="button"
          onClick={() => onSelectRole("business_client")}
          className={`${CARD_CLASSES} border-landing-pink-line bg-landing-pink-soft`}
        >
          <div className="w-14 h-14 rounded-2xl bg-white flex items-center justify-center flex-shrink-0">
            <Store className="w-7 h-7 text-landing-pink" />
          </div>
          <div className="flex-1 min-w-0">
            <Eyebrow className="text-landing-pink">For business owners</Eyebrow>
            <div className="font-display text-lg font-extrabold text-landing-ink mt-1">I'm a Restaurant</div>
            <div className="text-sm text-landing-ink-soft leading-snug">
              Restaurants & cafes looking for content creators
            </div>
          </div>
          <span className="text-landing-pink text-xl flex-shrink-0">&#8250;</span>
        </button>

        {/* Brand/Sponsor card — hidden behind feature flag */}
        {BRAND_ROLE_ENABLED && (
          <button
            type="button"
            onClick={() => onSelectRole("brand")}
            className={`${CARD_CLASSES} border-landing-line bg-landing-lilac`}
          >
            <div className="w-14 h-14 rounded-2xl bg-white flex items-center justify-center flex-shrink-0">
              <Megaphone className="w-7 h-7 text-landing-grape" />
            </div>
            <div className="flex-1 min-w-0">
              <Eyebrow className="text-landing-grape">For brands & sponsors</Eyebrow>
              <div className="font-display text-lg font-extrabold text-landing-ink mt-1">I'm a Brand/Sponsor</div>
              <div className="text-sm text-landing-ink-soft leading-snug">
                Brands running sponsored creator campaigns
              </div>
            </div>
            <span className="text-landing-grape text-xl flex-shrink-0">&#8250;</span>
          </button>
        )}

        {/* Creator card */}
        <button
          type="button"
          onClick={() => onSelectRole("content_creator")}
          className={`${CARD_CLASSES} border-landing-mint-line bg-landing-mint-soft`}
        >
          <div className="w-14 h-14 rounded-2xl bg-white flex items-center justify-center flex-shrink-0">
            <Camera className="w-7 h-7 text-landing-mint-ink" />
          </div>
          <div className="flex-1 min-w-0">
            <Eyebrow className="text-landing-mint-ink">For creators</Eyebrow>
            <div className="font-display text-lg font-extrabold text-landing-ink mt-1">I'm a Creator</div>
            <div className="text-sm text-landing-ink-soft leading-snug">
              Content creators looking for restaurant gigs
            </div>
          </div>
          <span className="text-landing-mint-ink text-xl flex-shrink-0">&#8250;</span>
        </button>

        {/* Back to login */}
        <div className="mt-8 mb-6 text-center text-base md:text-lg">
          <span className="text-landing-ink-soft">Already have an account?{' '}</span>
          <button
            type="button"
            onClick={onBackToLogin}
            className="text-landing-ink font-semibold underline underline-offset-2 hover:text-landing-pink transition-colors py-2 px-1"
          >
            Log in
          </button>
        </div>
      </div>
    </div>
  );
};
