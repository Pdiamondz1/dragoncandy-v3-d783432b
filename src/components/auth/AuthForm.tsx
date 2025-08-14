
import React, { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "@/hooks/use-toast";
import { cleanupAuthState } from "@/lib/authCleanup";

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

    console.log(`🔐 AuthForm: Starting ${mode} process for:`, email);

    try {
      // Clean up any existing auth state before attempting login/signup
      cleanupAuthState();
      
      // Attempt to sign out any existing session first
      try {
        await supabase.auth.signOut({ scope: 'global' });
      } catch (cleanupError) {
        console.log('🧹 AuthForm: Cleanup signout completed (expected if no session)');
      }
      if (mode === "signup") {
        if (!role) {
          onError("Please select a role.");
          setLoading(false);
          return;
        }

        console.log('📝 AuthForm: Signing up user with role:', role);
        
        const redirectUrl = `${window.location.origin}/profile/onboarding`;
        console.log('🔗 AuthForm: Redirect URL:', redirectUrl);
        
        const { data, error: signupError } = await supabase.auth.signUp({
          email,
          password,
          options: { 
            emailRedirectTo: redirectUrl,
            data: {
              role: role, // Store role in user metadata
              email: email // Also store email for reference
            }
          }
        });

        if (signupError) {
          console.error('❌ AuthForm: Signup error:', signupError);
          onError(signupError.message);
          setLoading(false);
          return;
        }

        console.log('✅ AuthForm: Signup successful:', data);

        if (data.user && !data.session) {
          // Email confirmation required
          toast({
            title: "Check your inbox",
            description: "A confirmation email has been sent. Please check your email and follow the link to complete signup.",
          });
        } else if (data.session) {
          // Immediate login (if email confirmation is disabled)
          console.log('🚀 AuthForm: User logged in immediately, redirecting...');
          toast({
            title: "Welcome to DragonCandy!",
            description: "Your account has been created successfully.",
          });
        }

        setLoading(false);
      } else {
        // Login mode
        console.log('🔑 AuthForm: Logging in user');
        
        const { data, error: loginError } = await supabase.auth.signInWithPassword({
          email,
          password
        });
        
        if (loginError) {
          console.error('❌ AuthForm: Login error:', loginError);
          onError(loginError.message);
          setLoading(false);
          return;
        }

        console.log('✅ AuthForm: Login successful:', data);
        
        // Success toast for login
        toast({
          title: "Welcome back!",
          description: "You have been logged in successfully.",
        });

        // Force refresh for clean state
        if (data.user) {
          setTimeout(() => {
            window.location.href = '/';
          }, 500);
        }
      }
    } catch (err: any) {
      console.error('❌ AuthForm: Unexpected error:', err);
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
