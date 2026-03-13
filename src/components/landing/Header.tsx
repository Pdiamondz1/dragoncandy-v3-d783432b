
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Menu, X } from "lucide-react";
import dragonCandyLogo from "@/assets/dragon-candy-logo.png";

export const Header = () => {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  return (
    <header className="flex items-center justify-between py-4">
      <img
        src={dragonCandyLogo}
        alt="DragonCandy"
        className="h-8 cursor-pointer"
        onClick={() => navigate('/')}
      />

      <button
        onClick={() => setOpen(!open)}
        className="p-2 rounded-full hover:bg-gray-100 transition-colors"
        aria-label="Toggle menu"
      >
        {open ? (
          <X className="h-6 w-6 text-dc-pink-accent" />
        ) : (
          <Menu className="h-6 w-6 text-dc-pink-accent" />
        )}
      </button>

      {/* Dropdown sheet */}
      {open && (
        <div className="absolute top-16 right-4 z-50 bg-white rounded-2xl shadow-xl border border-gray-100 p-4 w-48 flex flex-col gap-2">
          <button
            className="w-full text-left px-4 py-2 rounded-full text-[#555555] hover:bg-dc-teal/10 hover:text-dc-teal font-medium text-sm"
            onClick={() => { navigate('/auth?mode=login'); setOpen(false); }}
          >
            Log in
          </button>
          <button
            className="w-full text-left px-4 py-2 rounded-full bg-dc-teal text-white font-bold text-sm"
            onClick={() => { navigate('/auth?mode=signup'); setOpen(false); }}
          >
            Sign up
          </button>
        </div>
      )}
    </header>
  );
};
