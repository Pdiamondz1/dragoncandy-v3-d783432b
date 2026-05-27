import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Menu } from "lucide-react";
import { BRAND_ROLE_ENABLED } from '@/lib/featureConfig';
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

const scrollToSection = (id: string) => {
  const el = document.getElementById(id);
  if (el) {
    el.scrollIntoView({ behavior: "smooth" });
  }
};

const navLinks = [
  { label: "How It Works", target: "how-it-works" },
  { label: "For Restaurants", target: "features" },
  { label: "For Brands", target: "brands" },
  { label: "For Creators", target: "cta" },
];

const visibleNavLinks = BRAND_ROLE_ENABLED
  ? navLinks
  : navLinks.filter((l) => l.target !== 'brands');

export const Header: React.FC = () => {
  const navigate = useNavigate();
  const [sheetOpen, setSheetOpen] = useState(false);

  const handleNavClick = (sectionId: string) => {
    setSheetOpen(false);
    // Wait for sheet close animation before scrolling
    setTimeout(() => scrollToSection(sectionId), 350);
  };

  const handleNavigate = (path: string) => {
    setSheetOpen(false);
    setTimeout(() => navigate(path), 350);
  };

  return (
    <header className="flex items-center justify-between py-4 bg-white animate-fade-in">
      <img
        src="/logo.webp"
        alt="DragonCandy"
        width={140}
        height={47}
        fetchPriority="high"
        className="w-[100px] md:w-[120px] lg:w-[140px] h-auto cursor-pointer transition-transform duration-200 hover:scale-105"
        onClick={() => navigate('/')}
      />

      {/* Desktop nav links — hidden on mobile */}
      <nav aria-label="Primary" className="hidden md:flex items-center gap-8">
        {visibleNavLinks.map((link) => (
          <button
            key={link.target}
            onClick={() => scrollToSection(link.target)}
            className="text-sm font-medium text-dc-text-muted hover:text-dc-teal transition-colors duration-200 bg-transparent border-none cursor-pointer"
          >
            {link.label}
          </button>
        ))}
        <Button
          variant="ghost"
          className="rounded-full text-dc-text-muted hover:text-dc-teal font-medium"
          onClick={() => navigate('/auth?mode=login')}
        >
          Login
        </Button>
        <Button
          className="rounded-full bg-dc-teal-btn text-white font-semibold px-6 hover:bg-dc-teal-btn-hover hover:shadow-glow-teal transition-all duration-300"
          onClick={() => navigate('/auth?mode=signup')}
        >
          Get Started
        </Button>
      </nav>

      {/* Mobile hamburger */}
      <div className="md:hidden">
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetTrigger asChild>
            <button
              className="p-2 rounded-full hover:bg-gray-100 transition-colors"
              aria-label="Toggle menu"
            >
              <Menu className="h-6 w-6 text-gray-600" />
            </button>
          </SheetTrigger>
          <SheetContent side="right" className="w-64 pt-8">
            <div className="flex flex-col gap-3">
              {visibleNavLinks.map((link) => (
                <button
                  key={link.target}
                  onClick={() => handleNavClick(link.target)}
                  className="w-full text-left px-4 py-2 rounded-full text-dc-text-muted hover:text-dc-teal font-medium bg-transparent border-none cursor-pointer"
                >
                  {link.label}
                </button>
              ))}
              <hr className="border-gray-200 my-1" />
              <Button
                variant="ghost"
                className="w-full justify-start rounded-full text-dc-text-muted hover:text-dc-teal"
                onClick={() => handleNavigate('/auth?mode=login')}
              >
                Login
              </Button>
              <Button
                className="w-full rounded-full bg-dc-teal-btn text-white font-bold hover:bg-dc-teal-btn-hover"
                onClick={() => handleNavigate('/auth?mode=signup')}
              >
                Get Started
              </Button>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
};
