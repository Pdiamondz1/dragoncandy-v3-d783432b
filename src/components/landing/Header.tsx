import React from "react";
import { useNavigate } from "react-router-dom";
import { Menu } from "lucide-react";
import dragonCandyLogo from "@/assets/dragon-candy-logo.png";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

export const Header: React.FC = () => {
  const navigate = useNavigate();

  return (
    <header className="flex items-center justify-between py-4">
      <img
        src={dragonCandyLogo}
        alt="DragonCandy"
        className="h-8 cursor-pointer"
        onClick={() => navigate('/')}
      />

      <Sheet>
        <SheetTrigger asChild>
          <button
            className="p-2 rounded-full hover:bg-gray-100 transition-colors"
            aria-label="Toggle menu"
          >
            <Menu className="h-6 w-6 text-dc-pink-accent" />
          </button>
        </SheetTrigger>
        <SheetContent side="right" className="w-56 pt-8">
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
    </header>
  );
};
