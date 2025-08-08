import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/use-toast";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { AuthHeader } from "@/components/auth/AuthHeader";

const setSEO = (title: string, description: string, canonical?: string) => {
  document.title = title;
  const metaDesc = document.querySelector('meta[name="description"]');
  if (metaDesc) metaDesc.setAttribute('content', description);
  else {
    const m = document.createElement('meta');
    m.setAttribute('name', 'description');
    m.setAttribute('content', description);
    document.head.appendChild(m);
  }
  const existingCanonical = document.querySelector('link[rel="canonical"]');
  const href = canonical || window.location.href;
  if (existingCanonical) existingCanonical.setAttribute('href', href);
  else {
    const link = document.createElement('link');
    link.setAttribute('rel', 'canonical');
    link.setAttribute('href', href);
    document.head.appendChild(link);
  }
};

const ForgotPassword: React.FC = () => {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setSEO(
      "Reset Password | DragonCandy",
      "Reset your DragonCandy account password via email.",
      `${window.location.origin}/auth/forgot`
    );
  }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setLoading(true);
    try {
      await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/update-password`,
      });

      toast({
        title: "Check your email",
        description:
          "If an account exists for that email, we sent a reset link. Please check your inbox.",
      });
    } catch (err) {
      console.error("Error sending reset email:", err);
      // Avoid user enumeration – show same success message
      toast({
        title: "Check your email",
        description:
          "If an account exists for that email, we sent a reset link. Please check your inbox.",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-pink-50 dark:bg-zinc-950 flex items-center justify-center py-10 px-4">
      <div className="w-full max-w-md">
        <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-xl px-8 pt-8 pb-10 border border-pink-200 dark:border-zinc-800">
          <AuthHeader />
          
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold text-pink-700 dark:text-pink-300 mb-2">
              Forgot Password
            </h1>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Enter your email address and we'll send you a link to reset your password.
            </p>
          </div>

          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Email address
              </label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="transition-all duration-200 focus:ring-2 focus:ring-pink-500 focus:border-pink-500"
              />
            </div>

            <Button 
              type="submit" 
              disabled={loading} 
              className="w-full bg-pink-600 hover:bg-pink-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors duration-200"
            >
              {loading ? "Sending..." : "Send reset link"}
            </Button>

            <div className="text-center text-sm mt-4">
              <Link 
                to="/auth?mode=login" 
                className="text-pink-600 hover:text-pink-700 font-semibold underline underline-offset-2"
              >
                Back to login
              </Link>
            </div>
          </form>
        </div>
      </div>
    </main>
  );
};

export default ForgotPassword;
