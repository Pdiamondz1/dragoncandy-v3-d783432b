import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Menu } from "lucide-react";
import { BRAND_ROLE_ENABLED } from "@/lib/featureConfig";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

const scrollToSection = (id: string) => {
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: "smooth" });
};

const navLinks = [
  { label: "How It Works", target: "how-it-works" },
  { label: "For Business", target: "pick-your-lane" },
  { label: "For Brands", target: "pick-your-lane" },
  { label: "For Creators", target: "pick-your-lane" },
  { label: "Contact", target: "start-free" },
];

const visibleNavLinks = BRAND_ROLE_ENABLED
  ? navLinks
  : navLinks.filter((l) => l.label !== "For Brands");

export const Header: React.FC = () => {
  const navigate = useNavigate();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  React.useEffect(() => {
    if (typeof document === "undefined") return;

    // The landing renders inside the app shell's scrolling `<main id="main-content">`
    // (App.tsx: `flex h-screen` shell + inner `overflow-auto` main), so the WINDOW never
    // scrolls — `window.scrollY` stays 0 and the header would never leave its transparent
    // state, floating illegibly over bright sections. Key off the real scroll container,
    // falling back to `window` if that shell id ever changes.
    const scroller = document.getElementById("main-content");
    const target: HTMLElement | Window = scroller ?? window;
    const readScroll = () => (scroller ? scroller.scrollTop : window.scrollY);

    const handleScroll = () => setScrolled(readScroll() > 16);
    handleScroll();

    target.addEventListener("scroll", handleScroll, { passive: true });
    return () => target.removeEventListener("scroll", handleScroll);
  }, []);

  const handleNavClick = (sectionId: string) => {
    setSheetOpen(false);
    setTimeout(() => scrollToSection(sectionId), 350);
  };

  const handleNavigate = (path: string) => {
    setSheetOpen(false);
    setTimeout(() => navigate(path), 350);
  };

  // The fixed header sits over the scrolling `#main-content`, but a fixed element's wheel
  // scroll-chain targets the (non-scrolling) viewport — so scrolling while the pointer is over
  // the header does nothing (can't scroll from the very top). `pointer-events-none` lets wheel/
  // touch pass THROUGH the transparent header to the content (native scroll, incl. mobile
  // momentum); the interactive bits re-enable pointer events, and this forwards wheel to the
  // scroller so desktop scrolling works over them too.
  const forwardWheelToScroller = (e: React.WheelEvent) => {
    const scroller = document.getElementById("main-content");
    if (!scroller) return;
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? scroller.clientHeight : 1;
    scroller.scrollTop += e.deltaY * unit;
  };

  return (
    <header
      className={`pointer-events-none fixed inset-x-0 top-0 z-50 transition-colors duration-300 ${
        scrolled ? "bg-white/80 backdrop-blur-xl" : "bg-transparent"
      }`}
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3.5 sm:px-8 lg:px-12">
        <img
          src="/logo.webp"
          alt="DragonCandy"
          width={140}
          height={47}
          className="pointer-events-auto h-16 w-auto cursor-pointer transition-transform duration-200 hover:scale-105 lg:h-20"
          onClick={() => navigate("/")}
          onWheel={forwardWheelToScroller}
        />

        {/* Desktop nav */}
        <nav
          aria-label="Primary"
          className="pointer-events-auto hidden items-center gap-7 md:flex"
          onWheel={forwardWheelToScroller}
        >
          {visibleNavLinks.map((link) => (
            <button
              key={link.label}
              onClick={() => scrollToSection(link.target)}
              className="cursor-pointer border-none bg-transparent text-sm font-medium text-dc-text-muted transition-colors duration-200 hover:text-dc-teal"
            >
              {link.label}
            </button>
          ))}
          <button
            onClick={() => navigate("/auth?mode=login")}
            className="cursor-pointer border-none bg-transparent text-sm font-medium text-dc-text-muted transition-colors duration-200 hover:text-dc-teal"
          >
            Login
          </button>
          <button
            onClick={() => navigate("/auth?mode=signup")}
            className="rounded-full bg-dc-teal px-6 py-2.5 text-sm font-bold text-dc-dark transition-all duration-300 hover:bg-dc-teal-dark hover:shadow-glow-teal"
          >
            Get Started
          </button>
        </nav>

        {/* Mobile hamburger */}
        <div className="pointer-events-auto md:hidden" onWheel={forwardWheelToScroller}>
          <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
            <SheetTrigger asChild>
              <button
                className="rounded-full p-2 text-dc-text-muted transition-colors hover:bg-dc-text/10"
                aria-label="Toggle menu"
              >
                <Menu className="h-6 w-6" />
              </button>
            </SheetTrigger>
            <SheetContent
              side="right"
              className="w-64 border-dc-text/10 bg-white pt-10 text-dc-text"
            >
              <div className="flex flex-col gap-2">
                {visibleNavLinks.map((link) => (
                  <button
                    key={link.label}
                    onClick={() => handleNavClick(link.target)}
                    className="w-full cursor-pointer rounded-full border-none bg-transparent px-4 py-2.5 text-left font-medium text-dc-text-muted transition-colors hover:bg-dc-text/5 hover:text-dc-teal"
                  >
                    {link.label}
                  </button>
                ))}
                <hr className="my-2 border-dc-text/10" />
                <button
                  onClick={() => handleNavigate("/auth?mode=login")}
                  className="w-full cursor-pointer rounded-full border-none bg-transparent px-4 py-2.5 text-left font-medium text-dc-text-muted transition-colors hover:bg-dc-text/5 hover:text-dc-teal"
                >
                  Login
                </button>
                <button
                  onClick={() => handleNavigate("/auth?mode=signup")}
                  className="mt-1 w-full rounded-full bg-dc-teal px-4 py-3 font-bold text-dc-dark transition-colors hover:bg-dc-teal-dark"
                >
                  Get Started
                </button>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
};
