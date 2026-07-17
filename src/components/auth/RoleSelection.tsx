import { Store, Camera, Megaphone } from "lucide-react";
import { BRAND_ROLE_ENABLED } from '@/lib/featureConfig';

interface RoleSelectionProps {
  onSelectRole: (role: "business_client" | "content_creator" | "brand") => void;
  onBackToLogin: () => void;
}

export const RoleSelection = ({ onSelectRole, onBackToLogin }: RoleSelectionProps) => {
  return (
    <div className="flex-1 flex flex-col justify-center px-6 py-8">
      <h2 className="text-xl font-bold uppercase tracking-wider text-white text-center mb-3">
        Join DragonCandy
      </h2>
      <p className="text-white/70 text-sm text-center mb-8">
        How will you use DragonCandy?
      </p>

      <div className="w-full max-w-sm md:max-w-md mx-auto flex flex-col gap-4">
        {/* Business card */}
        <button
          type="button"
          onClick={() => onSelectRole("business_client")}
          className="w-full rounded-2xl border-2 border-dc-teal bg-white/5 p-6 flex items-center gap-5 hover:bg-white/10 transition-colors text-left"
        >
          <div className="w-14 h-14 rounded-2xl bg-dc-teal/10 flex items-center justify-center flex-shrink-0">
            <Store className="w-7 h-7 text-dc-teal" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-lg font-bold text-white">I'm a Restaurant</div>
            <div className="text-sm text-white/60 leading-snug">
              Restaurants & cafes looking for content creators
            </div>
          </div>
          <span className="text-dc-teal text-xl flex-shrink-0">&#8250;</span>
        </button>

        {/* Brand/Sponsor card — hidden behind feature flag */}
        {BRAND_ROLE_ENABLED && (
          <button
            type="button"
            onClick={() => onSelectRole("brand")}
            className="w-full rounded-2xl border-2 border-pink-400 bg-white/5 p-6 flex items-center gap-5 hover:bg-white/10 transition-colors text-left"
          >
            <div className="w-14 h-14 rounded-2xl bg-dc-pink-accent/10 flex items-center justify-center flex-shrink-0">
              <Megaphone className="w-7 h-7 text-pink-500" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-lg font-bold text-white">I'm a Brand/Sponsor</div>
              <div className="text-sm text-white/60 leading-snug">
                Brands running sponsored creator campaigns
              </div>
            </div>
            <span className="text-pink-400 text-xl flex-shrink-0">&#8250;</span>
          </button>
        )}

        {/* Creator card — neutral style to distinguish from the two primary roles */}
        <button
          type="button"
          onClick={() => onSelectRole("content_creator")}
          className="w-full rounded-2xl border-2 border-white/15 bg-white/5 p-6 flex items-center gap-5 hover:bg-white/10 transition-colors text-left"
        >
          <div className="w-14 h-14 rounded-2xl bg-white/10 flex items-center justify-center flex-shrink-0">
            <Camera className="w-7 h-7 text-white/60" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-lg font-bold text-white">I'm a Creator</div>
            <div className="text-sm text-white/60 leading-snug">
              Content creators looking for restaurant gigs
            </div>
          </div>
          <span className="text-white/40 text-xl flex-shrink-0">&#8250;</span>
        </button>

        {/* Back to login */}
        <div className="mt-8 mb-6 text-center text-base md:text-lg">
          <span className="text-white/80">Already have an account?{' '}</span>
          <button
            type="button"
            onClick={onBackToLogin}
            className="text-white font-semibold underline underline-offset-2 hover:text-dc-teal transition-colors py-2 px-1"
          >
            Log in
          </button>
        </div>
      </div>
    </div>
  );
};
