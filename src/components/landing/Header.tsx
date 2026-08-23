import React from "react";
import { useNavigate } from "react-router-dom";

export const Header: React.FC = () => {
  const navigate = useNavigate();

  // The mobile sheet this used to close before routing is gone; the body is now a plain
  // navigate — kept as a named handler since it's still the Log in action's entry point.
  const handleNavigate = (path: string) => {
    navigate(path);
  };

  return (
    // `absolute inset-x-0 top-0` overlays the header on the hero instead of occupying flow
    // space — the page is a single non-scrolling screen now, so `sticky` (which still reserves
    // its own row) would push the hero down and cost a slice of the one viewport we have. The
    // bar is permanently transparent — there's video behind it, not a scrolling page of colored
    // sections to frost over. `z-40`, not `z-50`: app chrome must stay below the Radix modal
    // layer (DESIGN_SYSTEM.md).
    <header
      // `pt-[env(safe-area-inset-top)]` pays back `viewport-fit=cover` — in the native shell this
      // bar otherwise sits under the status bar / Dynamic Island (observed on device 2026-08-14).
      // The header itself carries no padding, so the raw inset is the whole correction; the inner
      // div keeps its own py-3.5. Zero on the web. See DESIGN_SYSTEM.md.
      className="absolute inset-x-0 top-0 z-40 bg-transparent pt-[env(safe-area-inset-top)]"
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3.5 sm:px-8 lg:px-12">
        <button
          type="button"
          aria-label="DragonCandy home"
          onClick={() => handleNavigate("/")}
          className="cursor-pointer border-none bg-transparent p-0"
        >
          <img src="/logo.webp" alt="DragonCandy" className="h-12 w-auto lg:h-14" />
        </button>

        <button
          type="button"
          onClick={() => handleNavigate("/auth?mode=login")}
          className="cursor-pointer border-none bg-transparent text-sm font-medium text-white/80 transition-colors duration-200 hover:text-white"
        >
          Log in
        </button>
      </div>
    </header>
  );
};
