import React from "react";
import { Store, Camera } from "lucide-react";

interface RoleSelectionProps {
  onSelectRole: (role: "business_client" | "content_creator") => void;
  onBackToLogin: () => void;
}

export const RoleSelection = ({ onSelectRole, onBackToLogin }: RoleSelectionProps) => {
  return (
    <div className="flex-1 flex flex-col justify-center px-6 py-8">
      <h1 className="text-xl font-bold uppercase tracking-wider text-white text-center mb-3">
        Join DragonCandy
      </h1>
      <p className="text-white/70 text-sm text-center mb-8">
        How will you use DragonCandy?
      </p>

      <div className="w-full max-w-sm md:max-w-md mx-auto flex flex-col gap-4">
        {/* Business card */}
        <button
          type="button"
          onClick={() => onSelectRole("business_client")}
          className="w-full bg-white rounded-2xl border-2 border-teal-400 p-6 flex items-center gap-5 shadow-md hover:shadow-lg transition-shadow text-left"
        >
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-teal-50 to-teal-200 flex items-center justify-center flex-shrink-0">
            <Store className="w-7 h-7 text-teal-600" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-lg font-bold text-gray-900">I'm a Business</div>
            <div className="text-sm text-gray-500 leading-snug">
              Find creators to promote your brand, restaurant, or product
            </div>
          </div>
          <span className="text-teal-400 text-xl flex-shrink-0">&#8250;</span>
        </button>

        {/* Creator card */}
        <button
          type="button"
          onClick={() => onSelectRole("content_creator")}
          className="w-full bg-white rounded-2xl border-2 border-pink-300 p-6 flex items-center gap-5 shadow-md hover:shadow-lg transition-shadow text-left"
        >
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-pink-50 to-pink-200 flex items-center justify-center flex-shrink-0">
            <Camera className="w-7 h-7 text-pink-500" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-lg font-bold text-gray-900">I'm a Creator</div>
            <div className="text-sm text-gray-500 leading-snug">
              Get paid to create content for businesses and brands
            </div>
          </div>
          <span className="text-pink-300 text-xl flex-shrink-0">&#8250;</span>
        </button>

        {/* Back to login */}
        <div className="mt-6 text-center text-sm">
          <span className="text-white/70">Already have an account? </span>
          <button
            type="button"
            onClick={onBackToLogin}
            className="text-dc-teal font-semibold hover:underline"
          >
            Log in
          </button>
        </div>
      </div>
    </div>
  );
};
