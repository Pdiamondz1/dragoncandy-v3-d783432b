
import { Menu } from "lucide-react";
import dragonCandyLogo from "@/assets/dragon-candy-logo.png";
import { useNavigate } from "react-router-dom";

export const Header = () => {
  const navigate = useNavigate();

  return (
    <header className="flex items-center justify-between px-4 pt-4 pb-2 bg-white">
      <img
        src={dragonCandyLogo}
        alt="DragonCandy"
        className="h-16 cursor-pointer"
        onClick={() => navigate('/')}
      />
      <button className="p-2">
        <Menu className="h-6 w-6 text-gray-700" />
      </button>
    </header>
  );
};
