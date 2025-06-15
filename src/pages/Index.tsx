
import { Button } from "@/components/ui/button";
import { Youtube } from "lucide-react";
import { useNavigate } from "react-router-dom";

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
        <div className="flex gap-2">
          <Button
            variant="ghost"
            className="text-muted-foreground px-4"
            onClick={() => navigate("/auth")}
          >
            Log in
          </Button>
          <Button
            variant="outline"
            className="border-pink-500 text-pink-600 hover:bg-pink-50 hover:text-pink-700 px-4"
            onClick={() => navigate("/auth")}
          >
            Sign up
          </Button>
        </div>
      </nav>

      {/* Hero Section */}
      <main className="flex-1 flex flex-col items-center justify-center px-2 pb-8">
        <span className="inline-block bg-pink-100 text-pink-600 rounded-full px-4 py-1 text-xs mb-6 font-semibold shadow-sm animate-fade-in">
          🚀 AI-Powered Content Creation Platform
        </span>
        <h1 className="text-4xl md:text-6xl font-bold text-center mb-4 leading-tight">
          Create Amazing Content<br />
          with <span className="text-pink-600">DragonCandy</span>
        </h1>
        <p className="text-lg md:text-xl text-muted-foreground text-center mb-8 max-w-2xl">
          Connect with top creators, harness AI editing tools, and build campaigns that drive real results.
          DragonCandy makes professional content creation accessible to everyone.
        </p>
        <div className="flex flex-col md:flex-row gap-3 mb-12">
          <Button
            className="bg-pink-600 hover:bg-pink-700 text-white font-semibold px-8 text-lg py-4 shadow-sm animate-fade-in"
            onClick={() => navigate("/auth")}
          >
            Get Started Free
          </Button>
          <Button
            variant="outline"
            className="border-pink-400 text-pink-600 font-semibold px-8 text-lg py-4 hover:bg-pink-50 animate-fade-in"
            onClick={() => window.scrollTo({ top: 700, behavior: 'smooth' })}
          >
            Learn More
          </Button>
        </div>
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
