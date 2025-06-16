
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";

export const Header = () => {
  const navigate = useNavigate();

  return (
    <header className="bg-white shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center py-6">
          {/* Logo */}
          <div className="flex items-center gap-2">
            <div className="rounded-full bg-pink-100 p-2">
              <Sparkles className="text-pink-600 h-6 w-6" />
            </div>
            <span className="text-xl font-extrabold text-pink-600 tracking-tight">DragonCandy</span>
          </div>
          
          {/* Auth buttons */}
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              className="text-gray-600 hover:text-pink-600"
              onClick={() => navigate('/auth')}
            >
              Log in
            </Button>
            <Button
              className="bg-pink-600 hover:bg-pink-700 text-white px-6"
              onClick={() => navigate('/auth')}
            >
              Sign up
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
};
