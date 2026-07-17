import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { useAuth } from '@/hooks/useAuth';

export function PublicPageHeader() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [sheetOpen, setSheetOpen] = useState(false);

  const handleNavigate = (path: string) => {
    setSheetOpen(false);
    setTimeout(() => navigate(path), 350);
  };

  return (
    <header className="sticky top-0 z-50 flex items-center justify-between bg-white px-4 py-4 md:px-8">
      <img
        src="/logo.webp"
        alt="DragonCandy"
        width={140}
        height={47}
        fetchPriority="high"
        className="w-[100px] md:w-[120px] lg:w-[140px] h-auto cursor-pointer transition-transform duration-200 hover:scale-105"
        onClick={() => navigate('/')}
      />

      {/* Desktop buttons — auth-aware. While auth resolves, render nothing to avoid
          a logged-out→logged-in flicker. */}
      <div className="hidden md:flex items-center gap-4">
        {loading ? null : user ? (
          <Button
            className="rounded-full bg-dc-teal-btn text-white font-semibold px-6 hover:bg-dc-teal-btn-hover hover:shadow-glow-teal transition-all duration-300"
            onClick={() => navigate('/dashboard')}
          >
            Dashboard
          </Button>
        ) : (
          <>
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
          </>
        )}
      </div>

      {/* Mobile hamburger — auth-aware. Hidden entirely while auth resolves. */}
      {!loading && (
        <div className="md:hidden">
          <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
            <SheetTrigger asChild>
              <button
                className="p-2 rounded-full hover:bg-teal-50 transition-colors"
                aria-label="Toggle menu"
              >
                <Menu className="h-6 w-6 text-dc-text-muted" />
              </button>
            </SheetTrigger>
            <SheetContent side="right" className="w-64 pt-8">
              <div className="flex flex-col gap-3">
                {user ? (
                  <Button
                    className="w-full rounded-full bg-dc-teal-btn text-white font-bold hover:bg-dc-teal-btn-hover"
                    onClick={() => handleNavigate('/dashboard')}
                  >
                    Dashboard
                  </Button>
                ) : (
                  <>
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
                  </>
                )}
              </div>
            </SheetContent>
          </Sheet>
        </div>
      )}
    </header>
  );
}
