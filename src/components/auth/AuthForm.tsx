
import React, { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "@/hooks/use-toast";

type Role = "business_client" | "content_creator";

interface AuthFormProps {
  mode: "login" | "signup";
  onError: (error: string | null) => void;
}

export const AuthForm = ({ mode, onError }: AuthFormProps) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("business_client");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    onError(null);
    setLoading(true);

    if (mode === "signup" && !role) {
      onError("Please select a role.");
      setLoading(false);
      return;
    }

    try {
      if (mode === "signup") {
        const redirectUrl = `${window.location.origin}/profile/onboarding`;
        const { data, error: signupError } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: redirectUrl }
        });

        if (signupError) {
          onError(signupError.message);
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
          onError(loginError.message);
          setLoading(false);
          return;
        }
        // The AuthContext will handle the redirect automatically via useEffect
      }
    } catch (err: any) {
      onError("Something went wrong. Please try again.");
      setLoading(false);
    }
  };

  return (
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

      <Button
        type="submit"
        className="w-full mt-1 font-bold text-lg bg-pink-600 hover:bg-pink-700 transition-colors py-3"
        disabled={loading}
      >
        {loading ? (mode === "signup" ? "Signing up..." : "Logging in...") : (mode === "signup" ? "Sign Up" : "Log In")}
      </Button>
    </form>
  );
};
