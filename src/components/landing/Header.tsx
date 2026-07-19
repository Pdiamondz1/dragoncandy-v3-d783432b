import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Menu } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { LandingButton } from "@/components/landing/LandingButton";

const scrollToSection = (id: string) => {
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: "smooth" });
};

const navLinks = [
  { label: "For businesses", target: "business" },
  { label: "For creators", target: "creators" },
  { label: "How it works", target: "how" },
  { label: "Meet Donny", target: "donny" },
];

export const Header: React.FC = () => {
  const navigate = useNavigate();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  // The landing renders inside the app shell's scrolling `#main-content`, so `window.scrollY`
  // is always 0 — key the scroll-state off that container (falling back to the window for the
  // standalone/prerender case). At the very top the header is transparent so it blends into the
  // hero's soft glow; once you scroll it fades to a frosted-white bar that stays legible over the
  // colored sections below.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const scroller = document.getElementById("main-content");
    const target: HTMLElement | Window = scroller ?? window;
    const read = () => (scroller ? scroller.scrollTop : window.scrollY);
    const onScroll = () => setScrolled(read() > 12);
    onScroll();
    target.addEventListener("scroll", onScroll, { passive: true });
    return () => target.removeEventListener("scroll", onScroll);
  }, []);

  const handleNavClick = (sectionId: string) => {
    setSheetOpen(false);
    setTimeout(() => scrollToSection(sectionId), 350);
  };

  const handleNavigate = (path: string) => {
    setSheetOpen(false);
    setTimeout(() => navigate(path), 350);
  };

  return (
    // `sticky top-0` sticks to the app shell's scrolling `#main-content` — but ONLY because the
    // LandingPage wrapper no longer has an `overflow-x` (which would make it the scroll container
    // and break sticky). Transparent over the hero glow, frosted-white once scrolled for legibility.
    <header
      className={`sticky top-0 z-50 transition-colors duration-300 ${
        scrolled ? "bg-white/85 backdrop-blur-md" : "bg-transparent"
      }`}
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3.5 sm:px-8 lg:px-12">
        <button
          type="button"
          aria-label="DragonCandy home"
          onClick={() => navigate("/")}
          className="cursor-pointer border-none bg-transparent p-0"
        >
          <img src="/logo.webp" alt="DragonCandy" className="h-12 w-auto lg:h-14" />
        </button>

        {/* Desktop nav */}
        <nav aria-label="Primary" className="hidden items-center gap-7 md:flex">
          {navLinks.map((link) => (
            <button
              key={link.label}
              onClick={() => scrollToSection(link.target)}
              className="cursor-pointer border-none bg-transparent text-sm font-medium text-landing-ink-soft transition-colors duration-200 hover:text-landing-ink"
            >
              {link.label}
            </button>
          ))}
          <button
            onClick={() => navigate("/auth?mode=login")}
            className="cursor-pointer border-none bg-transparent text-sm font-medium text-landing-ink-soft transition-colors duration-200 hover:text-landing-ink"
          >
            Log in
          </button>
          <LandingButton
            variant="pink"
            onClick={() => navigate("/auth?mode=signup")}
            className="px-6 py-2.5 text-sm"
          >
            Get started
          </LandingButton>
        </nav>

        {/* Mobile hamburger */}
        <div className="md:hidden">
          <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
            <SheetTrigger asChild>
              <button
                className="rounded-full p-2 text-landing-ink transition-colors hover:bg-landing-lilac"
                aria-label="Toggle menu"
              >
                <Menu className="h-6 w-6" />
              </button>
            </SheetTrigger>
            <SheetContent
              side="right"
              className="w-64 border-landing-line bg-white pt-10 text-landing-ink"
            >
              <div className="flex flex-col gap-2">
                {navLinks.map((link) => (
                  <button
                    key={link.label}
                    onClick={() => handleNavClick(link.target)}
                    className="w-full cursor-pointer rounded-full border-none bg-transparent px-4 py-2.5 text-left font-medium text-landing-ink-soft transition-colors hover:bg-landing-lilac hover:text-landing-ink"
                  >
                    {link.label}
                  </button>
                ))}
                <hr className="my-2 border-landing-line" />
                <button
                  onClick={() => handleNavigate("/auth?mode=login")}
                  className="w-full cursor-pointer rounded-full border-none bg-transparent px-4 py-2.5 text-left font-medium text-landing-ink-soft transition-colors hover:bg-landing-lilac hover:text-landing-ink"
                >
                  Log in
                </button>
                <LandingButton
                  variant="pink"
                  onClick={() => handleNavigate("/auth?mode=signup")}
                  className="mt-1 w-full"
                >
                  Get started
                </LandingButton>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
};
