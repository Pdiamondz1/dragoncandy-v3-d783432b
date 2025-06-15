
import { Button } from "@/components/ui/button";
import { Youtube } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

const features = [
  {
    icon: <Youtube className="text-pink-500" />,
    title: "AI-Powered Editing",
    description: "Transform your content with intelligent AI editing tools and suggestions.",
  },
  {
    icon: <Youtube className="text-pink-500" />,
    title: "Creator Marketplace",
    description: "Connect with talented creators for professional content collaboration.",
  },
  {
    icon: <Youtube className="text-pink-500" />,
    title: "Campaign Management",
    description: "Manage campaigns, track performance, and optimize for maximum impact.",
  },
];

export default function Index() {
  const navigate = useNavigate();
  const { user, signOut, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-pink-600"></div>
      </div>
    );
  }

  if (!user) {
    navigate('/auth', { replace: true });
    return null;
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Navbar */}
      <nav className="flex items-center justify-between py-5 px-8 md:px-16">
        <div className="flex items-center gap-2">
          {/* DragonCandy Logo Icon */}
          <div className="rounded-full bg-pink-100 p-2">
            <Youtube className="text-pink-600 h-6 w-6" />
          </div>
          <span className="text-xl font-extrabold text-pink-600 tracking-tight">DragonCandy</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-muted-foreground">
            Welcome, {user.email}
          </span>
          <Button
            variant="outline"
            className="border-pink-500 text-pink-600 hover:bg-pink-50 hover:text-pink-700 px-4"
            onClick={signOut}
          >
            Sign out
          </Button>
        </div>
      </nav>

      {/* Hero Section */}
      <main className="flex-1 flex flex-col items-center justify-center px-2 pb-8">
        <span className="inline-block bg-pink-100 text-pink-600 rounded-full px-4 py-1 text-xs mb-6 font-semibold shadow-sm animate-fade-in">
          🚀 AI-Powered Content Creation Platform
        </span>
        <h1 className="text-4xl md:text-6xl font-bold text-center mb-4 leading-tight">
          Welcome to <span className="text-pink-600">DragonCandy</span>
        </h1>
        <p className="text-lg md:text-xl text-muted-foreground text-center mb-8 max-w-2xl">
          You're now logged in! Start creating amazing content with our AI-powered tools and connect with top creators.
        </p>
        
        {/* Features Row */}
        <div className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-3 gap-8 mt-2 mb-4">
          {features.map((f, i) => (
            <div
              key={i}
              className="flex flex-col items-center text-center bg-white rounded-xl shadow-sm p-6 border border-transparent hover:border-pink-200 transition"
            >
              <div className="mb-3">{f.icon}</div>
              <div className="text-base lg:text-lg font-bold mb-1">{f.title}</div>
              <p className="text-sm text-muted-foreground">{f.description}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
