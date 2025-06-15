
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "@/hooks/use-toast";

type Role = "business_client" | "content_creator";

const AuthPage = () => {
  const [mode, setMode] = useState<"login" | "signup">("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("business_client");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const navigate = useNavigate();

  // Check for auth session on mount
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        navigate("/", { replace: true });
      }
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (session) {
          navigate("/", { replace: true });
        }
      }
    );
    return () => subscription.unsubscribe();
  }, [navigate]);

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
        // Register and set user profile
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
        // Poll until the profile row is available
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

            // If a profile row exists, update the role
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
        // Login
        const { data, error: loginError } = await supabase.auth.signInWithPassword({
          email,
          password
        });
        if (loginError) {
          setError(loginError.message);
          setLoading(false);
          return;
        }
        // Success will trigger redirect from onAuthStateChange
      }
    } catch (err: any) {
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-md bg-white dark:bg-zinc-900 p-8 rounded-lg shadow">
        <h2 className="text-2xl font-bold mb-6 text-center">
          {mode === "signup" ? "Sign Up for DragonCandy" : "Log In"}
        </h2>
        <form className="space-y-4" onSubmit={handleSubmit}>
          {mode === "signup" && (
            <>
              <Label htmlFor="role">Select your role</Label>
              <RadioGroup
                id="role"
                value={role}
                onValueChange={setRole as any}
                className="flex flex-row gap-4 mb-2"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="business_client" id="business_client" />
                  <Label htmlFor="business_client">Business Client</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="content_creator" id="content_creator" />
                  <Label htmlFor="content_creator">Content Creator</Label>
                </div>
              </RadioGroup>
            </>
          )}

          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            value={email}
            autoComplete="email"
            required
            onChange={e => setEmail(e.target.value)}
            placeholder="you@email.com"
            disabled={loading}
          />

          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            value={password}
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            required
            onChange={e => setPassword(e.target.value)}
            placeholder="Your password"
            disabled={loading}
          />

          {error && (
            <div className="text-sm text-red-600 bg-red-50 dark:bg-red-900/20 px-2 py-1 rounded">
              {error}
            </div>
          )}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? (mode === "signup" ? "Signing up..." : "Logging in...") : (mode === "signup" ? "Sign Up" : "Log In")}
          </Button>
        </form>
        <div className="mt-4 text-center text-sm">
          {mode === "signup" ? (
            <>
              Already have an account?{" "}
              <button
                className="text-primary underline underline-offset-2"
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
                className="text-primary underline underline-offset-2"
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
