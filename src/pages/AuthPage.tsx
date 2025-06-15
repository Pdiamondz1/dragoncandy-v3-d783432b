
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "@/hooks/use-toast";
import { Youtube } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

type Role = "business_client" | "content_creator";

const AuthPage = () => {
  const [mode, setMode] = useState<"login" | "signup">("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("business_client");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      console.log('User is authenticated, redirecting to home');
      navigate("/", { replace: true });
    }
  }, [isAuthenticated, navigate]);

  // Handle Auth Form Submit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    if (mode === "signup" && !role) {
      setError("Please select a role.");
      setLoading(false);
      return;
    }

    try {
      if (mode === "signup") {
        const redirectUrl = `${window.location.origin}/`;
        const { data, error: signupError } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: redirectUrl }
        });

        if (signupError) {
          setError(signupError.message);
          setLoading(false);
          return;
        }

        // Update role in profiles table (may be delayed due to trigger timing)
        let profileUpdated = false;
        for (let i = 0; i < 5; i++) {
          const { data: user } = await supabase.auth.getUser();
          const userId = user?.user?.id;
          if (userId) {
            const { data: profile } = await supabase
              .from("profiles")
              .select("*")
              .eq("id", userId)
              .maybeSingle();

            if (profile) {
              const { error: updateErr } = await supabase
                .from("profiles")
                .update({ role })
                .eq("id", userId);
              if (!updateErr) {
                profileUpdated = true;
                break;
              }
            }
          }
          await new Promise((res) => setTimeout(res, 800));
        }

        toast({
          title: "Check your inbox",
          description:
            "A confirmation email has been sent. Please check your email and follow the link to complete signup.",
        });

        setLoading(false);
      } else {
        const { data, error: loginError } = await supabase.auth.signInWithPassword({
          email,
          password
        });
        if (loginError) {
          setError(loginError.message);
          setLoading(false);
          return;
        }
        // The AuthContext will handle the redirect automatically
      }
    } catch (err: any) {
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-pink-50 py-8 px-2">
      <div className="w-full max-w-md bg-white dark:bg-zinc-900 rounded-2xl shadow-xl px-8 pt-8 pb-10 border border-pink-200">
        {/* Branding header */}
        <div className="flex flex-col items-center mb-8">
          <div className="rounded-full bg-pink-100 p-3 mb-2">
            <Youtube className="text-pink-600 w-8 h-8" />
          </div>
          <span className="text-2xl font-extrabold text-pink-600 tracking-tight mb-2">
            DragonCandy
          </span>
          <span className="inline-block bg-pink-100 text-pink-600 rounded-full px-4 py-1 text-xs font-semibold shadow-sm animate-fade-in">
            🚀 AI-Powered Content Platform
          </span>
        </div>

        <h2 className="text-2xl md:text-3xl font-bold mb-6 text-center text-pink-700">
          {mode === "signup" ? "Sign Up for DragonCandy" : "Log In"}
        </h2>
        <form className="space-y-5" onSubmit={handleSubmit}>
          {mode === "signup" && (
            <div>
              <Label htmlFor="role" className="mb-1 block text-pink-700 font-semibold">
                Select your role
              </Label>
              <RadioGroup
                id="role"
                value={role}
                onValueChange={setRole as any}
                className="flex flex-row gap-4 mb-2"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="business_client" id="business_client" />
                  <Label htmlFor="business_client" className="text-base">Business Client</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="content_creator" id="content_creator" />
                  <Label htmlFor="content_creator" className="text-base">Content Creator</Label>
                </div>
              </RadioGroup>
            </div>
          )}

          <div>
            <Label htmlFor="email" className="mb-1 block text-pink-700">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              autoComplete="email"
              required
              onChange={e => setEmail(e.target.value)}
              placeholder="you@email.com"
              disabled={loading}
              className="bg-pink-50 border-pink-200 focus-visible:ring-pink-300/70 text-base"
            />
          </div>

          <div>
            <Label htmlFor="password" className="mb-1 block text-pink-700">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              required
              onChange={e => setPassword(e.target.value)}
              placeholder="Your password"
              disabled={loading}
              className="bg-pink-50 border-pink-200 focus-visible:ring-pink-300/70 text-base"
            />
          </div>

          {error && (
            <div className="text-sm text-red-600 bg-red-50 dark:bg-red-900/20 px-2 py-1 rounded mt-2">
              {error}
            </div>
          )}

          <Button
            type="submit"
            className="w-full mt-1 font-bold text-lg bg-pink-600 hover:bg-pink-700 transition-colors py-3"
            disabled={loading}
          >
            {loading ? (mode === "signup" ? "Signing up..." : "Logging in...") : (mode === "signup" ? "Sign Up" : "Log In")}
          </Button>
        </form>
        <div className="mt-6 text-center text-sm">
          {mode === "signup" ? (
            <>
              Already have an account?{" "}
              <button
                className="text-pink-600 font-semibold underline underline-offset-2"
                type="button"
                onClick={() => { setMode("login"); setError(null); }}
                disabled={loading}
              >
                Log in
              </button>
            </>
          ) : (
            <>
              Don&apos;t have an account?{" "}
              <button
                className="text-pink-600 font-semibold underline underline-offset-2"
                type="button"
                onClick={() => { setMode("signup"); setError(null); }}
                disabled={loading}
              >
                Sign up
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default AuthPage;
