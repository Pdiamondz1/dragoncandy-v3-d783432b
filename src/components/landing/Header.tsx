
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import dragonCandyLogo from "@/assets/dragon-candy-logo.png";

export const Header = () => {
  const navigate = useNavigate();

  return (
    <header className="bg-white shadow-sm">
      <div className="px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center py-6">
          {/* Logo */}
          <div className="flex items-center gap-2">
            <img src={dragonCandyLogo} alt="DragonCandy" className="h-8" />
            <span className="text-xl font-extrabold text-pink-600 tracking-tight">DragonCandy</span>
          </div>
          
          {/* Auth buttons */}
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              className="text-gray-600 hover:text-pink-600"
              onClick={() => navigate('/auth?mode=login')}
            >
              Log in
            </Button>
            <Button
              className="bg-pink-600 hover:bg-pink-700 text-white px-6"
              onClick={() => navigate('/auth?mode=signup')}
            >
              Sign up
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
};
