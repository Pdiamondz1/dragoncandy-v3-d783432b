
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Sparkles, Users, TrendingUp } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

const features = [
  {
    icon: <Sparkles className="text-pink-500 w-12 h-12" />,
    title: "AI-Powered Editing",
    description: "Transform your content with intelligent AI editing tools and suggestions.",
  },
  {
    icon: <Users className="text-pink-500 w-12 h-12" />,
    title: "Creator Marketplace",
    description: "Connect with talented creators for professional content collaboration.",
  },
  {
    icon: <TrendingUp className="text-pink-500 w-12 h-12" />,
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

  // If user is authenticated, show dashboard-like content
  if (user) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        {/* Navbar for authenticated users */}
        <nav className="flex items-center justify-between py-5 px-8 md:px-16">
          <div className="flex items-center gap-2">
            <div className="rounded-full bg-pink-100 p-2">
              <Sparkles className="text-pink-600 h-6 w-6" />
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

        {/* Dashboard content for authenticated users */}
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

  // Landing page for unauthenticated users
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
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

      {/* Hero Section */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="text-center">
          {/* Badge */}
          <span className="inline-block bg-pink-100 text-pink-600 rounded-full px-4 py-1 text-sm mb-8 font-semibold">
            🚀 AI-Powered Content Creation Platform
          </span>
          
          {/* Hero Heading */}
          <h1 className="text-4xl md:text-6xl font-bold text-gray-900 mb-6 leading-tight">
            Create Amazing Content<br />
            with <span className="text-pink-600">DragonCandy</span>
          </h1>
          
          {/* Hero Description */}
          <p className="text-lg md:text-xl text-gray-600 mb-10 max-w-3xl mx-auto leading-relaxed">
            Connect with top creators, harness AI editing tools, and build campaigns that drive real results. 
            DragonCandy makes professional content creation accessible to everyone.
          </p>
          
          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-16">
            <Button
              size="lg"
              className="bg-pink-600 hover:bg-pink-700 text-white px-8 py-3 text-lg font-semibold"
              onClick={() => navigate('/auth')}
            >
              Get Started Free →
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="border-gray-300 text-gray-700 px-8 py-3 text-lg hover:bg-gray-50"
            >
              Learn More
            </Button>
          </div>
        </div>
        
        {/* Feature Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          {features.map((feature, index) => (
            <Card key={index} className="text-center p-6 border-0 shadow-sm hover:shadow-md transition-shadow">
              <CardContent className="pt-6">
                <div className="flex justify-center mb-4">
                  {feature.icon}
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-3">
                  {feature.title}
                </h3>
                <p className="text-gray-600 leading-relaxed">
                  {feature.description}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Bottom CTA Section */}
        <div className="text-center mt-20 bg-white rounded-2xl p-12 shadow-sm">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">
            Complete Content Creation Platform
          </h2>
          <p className="text-lg text-gray-600 mb-8 max-w-2xl mx-auto">
            From AI-powered editing to creator marketplace and campaign management,
            everything you need to create amazing content in one platform.
          </p>
          <Button
            size="lg"
            className="bg-pink-600 hover:bg-pink-700 text-white px-8 py-3 text-lg font-semibold"
            onClick={() => navigate('/auth')}
          >
            Get Started Free →
          </Button>
        </div>
      </main>
    </div>
  );
}
