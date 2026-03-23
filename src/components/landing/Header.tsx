import React from "react";
import { useNavigate } from "react-router-dom";
import { Menu } from "lucide-react";
import dragonCandyLogo from "@/assets/Transparent_DragonCandy_logo.png";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

export const Header: React.FC = () => {
  const navigate = useNavigate();

  return (
    <header className="flex items-center justify-between py-4 bg-white animate-fade-in">
      <img
        src={dragonCandyLogo}
        alt="DragonCandy"
        className="h-12 w-12 cursor-pointer transition-transform duration-200 hover:scale-105"
        onClick={() => navigate('/')}
      />

      {/* Desktop nav links — hidden on mobile */}
      <nav className="hidden md:flex items-center gap-8">
        <a
          href="#features"
          className="text-sm font-medium text-[#555555] hover:text-dc-teal transition-colors duration-200"
        >
          Features
        </a>
        <a
          href="#creators"
          className="text-sm font-medium text-[#555555] hover:text-dc-teal transition-colors duration-200"
        >
          Creators
        </a>
        <a
          href="#brands"
          className="text-sm font-medium text-[#555555] hover:text-dc-teal transition-colors duration-200"
        >
          For Brands
        </a>
        <Button
          variant="ghost"
          className="rounded-full text-[#555555] hover:text-dc-teal font-medium"
          onClick={() => navigate('/auth?mode=login')}
        >
          Log in
        </Button>
        <Button
          className="rounded-full bg-dc-teal text-white font-semibold px-6 hover:bg-dc-teal-dark hover:shadow-glow-teal transition-all duration-300"
          onClick={() => navigate('/auth?mode=signup')}
        >
          Get Started
        </Button>
      </nav>

      {/* Mobile hamburger — only icon, no extra nav links */}
      <div className="md:hidden">
        <Sheet>
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
              <Button
                variant="ghost"
                className="w-full justify-start rounded-full text-[#555555] hover:text-dc-teal"
                onClick={() => navigate('/auth?mode=login')}
              >
                Log in
              </Button>
              <Button
                className="w-full rounded-full bg-dc-teal text-white font-bold hover:bg-dc-teal-dark"
                onClick={() => navigate('/auth?mode=signup')}
              >
                Sign up
              </Button>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
};
