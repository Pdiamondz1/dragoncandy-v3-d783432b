
import React, { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "@/hooks/use-toast";
import ReCaptcha, { ReCaptchaHandle } from "./ReCaptcha";
import type { UserRole as Role } from "@/types/user";

interface AuthFormProps {
  mode: "login" | "signup";
  onError: (error: string | null) => void;
}

export const AuthForm = ({ mode, onError }: AuthFormProps) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<Role>("business_client");
  const [loading, setLoading] = useState(false);
  const captchaRef = useRef<ReCaptchaHandle>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    onError(null);
    setLoading(true);

    console.log(`🔐 AuthForm: Starting ${mode} process for:`, email);

    try {
      // Get reCAPTCHA token with timestamp
      const tokenData = captchaRef.current?.getTokenWithAge();

      if (!tokenData || !tokenData.token) {
        onError("Please complete the CAPTCHA verification.");
        setLoading(false);
        return;
      }

      // Check token age (Google tokens expire after 2 minutes)
      const tokenAgeSeconds = (Date.now() - tokenData.issuedAt) / 1000;
      const MAX_TOKEN_AGE = 100; // 100 seconds to be safe

      if (tokenAgeSeconds > MAX_TOKEN_AGE) {
        console.warn(`⏰ Token too old: ${tokenAgeSeconds.toFixed(1)}s`);
        onError("CAPTCHA expired. Please verify again.");
        toast({
          title: "CAPTCHA Expired",
          description: "Please complete the CAPTCHA verification again.",
          variant: "destructive",
        });
        captchaRef.current?.reset();
        setLoading(false);
        return;
      }

      console.log(`🔒 Verifying reCAPTCHA token (age: ${tokenAgeSeconds.toFixed(1)}s)...`);

      // Verify reCAPTCHA token with backend
      const { data: verificationData, error: verificationError } = await supabase.functions.invoke(
        'verify-recaptcha',
        {
          body: { token: tokenData.token },
        }
      );

      if (verificationError || !verificationData?.success) {
        console.error('❌ reCAPTCHA verification failed:', verificationError || verificationData);

        const errorCodes = verificationData?.errorCodes || [];
        let errorMessage = "CAPTCHA verification failed. Please try again.";

        if (errorCodes.includes('invalid-input-secret')) {
          errorMessage = "Server configuration error. Please contact support.";
        } else if (errorCodes.includes('timeout-or-duplicate')) {
          errorMessage = "CAPTCHA expired or already used. Please verify again.";
        } else if (errorCodes.includes('invalid-input-response')) {
          errorMessage = "Invalid CAPTCHA response. Please try again.";
        }

        onError(errorMessage);
        toast({
          title: "Verification Failed",
          description: errorMessage,
          variant: "destructive",
        });
        captchaRef.current?.reset();
        setLoading(false);
        return;
      }

      console.log('✅ reCAPTCHA verification successful for:', verificationData.hostname);

      if (mode === "signup") {
        if (!role) {
          onError("Please select a role.");
          captchaRef.current?.reset();
          setLoading(false);
          return;
        }

        console.log('📝 AuthForm: Signing up user with role:', role);

        const { data, error: signupError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/`,
            data: {
              role: role,
              email: email,
              full_name: fullName || email.split('@')[0]
            }
          }
        });

        if (signupError) {
          console.error('❌ AuthForm: Signup error:', signupError);
          onError(signupError.message);
          captchaRef.current?.reset();
          setLoading(false);
          return;
        }

        console.log('✅ AuthForm: Signup successful:', data);

        // Send verification email
        if (data.user) {
          const userName = fullName || email.split('@')[0];

          try {
            const { error: emailError } = await supabase.functions.invoke('send-verification-email', {
              body: {
                email,
                name: userName,
                userId: data.user.id,
              },
            });

            if (emailError) {
              console.error('Failed to send verification email:', emailError);
              toast({
                title: "Account created",
                description: "But there was an issue sending the verification email. Please contact support.",
              });
            } else {
              console.log('✅ Verification email sent successfully');
              toast({
                title: "Check your email",
                description: "We've sent you a verification link. Please verify your email before logging in.",
              });
            }
          } catch (emailError) {
            console.error('Error sending verification email:', emailError);
          }

          // Sign out the user - they must verify first
          await supabase.auth.signOut();
        }

        captchaRef.current?.reset();
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
          captchaRef.current?.reset();
          setLoading(false);
          return;
        }

        console.log('✅ AuthForm: Login successful:', data);

        // Check if email is verified
        if (data.user) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('email_verified')
            .eq('id', data.user.id)
            .single();

          if (profile && !profile.email_verified) {
            await supabase.auth.signOut();
            onError('Please verify your email before logging in. Check your inbox for the verification link.');
            captchaRef.current?.reset();
            setLoading(false);
            return;
          }
        }

        toast({
          title: "Welcome back!",
          description: "You have been logged in successfully.",
        });

        captchaRef.current?.reset();
        // The AuthContext will handle the redirect automatically via useEffect
      }
    } catch (err: unknown) {
      console.error('❌ AuthForm: Unexpected error:', err);
      onError("Something went wrong. Please try again.");
      captchaRef.current?.reset();
      setLoading(false);
    }
  };

  return (
    <form className="space-y-3" onSubmit={handleSubmit}>
      {mode === "signup" && (
        <>
          <div>
            <Input
              id="fullName"
              type="text"
              value={fullName}
              autoComplete="name"
              required
              onChange={e => setFullName(e.target.value)}
              placeholder="Full Name"
              disabled={loading}
              className="rounded-full px-6 h-12 bg-white border-0 text-base text-center placeholder:text-center placeholder:text-gray-400 focus-visible:ring-dc-teal"
            />
          </div>

          <div>
            <p className="text-xs text-white uppercase tracking-widest text-center mb-2 font-medium">
              Select your role
            </p>
            <RadioGroup
              id="role"
              value={role}
              onValueChange={setRole as (value: string) => void}
              className="flex flex-col gap-2"
            >
              <div className="flex items-center space-x-2 bg-white/20 rounded-full px-5 py-2.5">
                <RadioGroupItem value="business_client" id="business_client" className="border-white text-white" />
                <Label htmlFor="business_client" className="text-white cursor-pointer text-sm">
                  Restaurant / Business Client
                </Label>
              </div>
              <div className="flex items-center space-x-2 bg-white/20 rounded-full px-5 py-2.5">
                <RadioGroupItem value="brand" id="brand" className="border-white text-white" />
                <Label htmlFor="brand" className="text-white cursor-pointer text-sm">
                  Brand / Sponsor
                </Label>
              </div>
              <div className="flex items-center space-x-2 bg-white/20 rounded-full px-5 py-2.5">
                <RadioGroupItem value="content_creator" id="content_creator" className="border-white text-white" />
                <Label htmlFor="content_creator" className="text-white cursor-pointer text-sm">
                  Content Creator
                </Label>
              </div>
            </RadioGroup>
          </div>
        </>
      )}

      <div>
        <Input
          id="email"
          type="email"
          value={email}
          autoComplete="email"
          required
          onChange={e => setEmail(e.target.value)}
          placeholder="Email"
          disabled={loading}
          className="rounded-full px-6 h-12 bg-white border-0 text-base text-center placeholder:text-center placeholder:text-gray-400 focus-visible:ring-dc-teal"
        />
      </div>

      <div>
        <Input
          id="password"
          type="password"
          value={password}
          autoComplete={mode === "signup" ? "new-password" : "current-password"}
          required
          onChange={e => setPassword(e.target.value)}
          placeholder="Password"
          disabled={loading}
          className="rounded-full px-6 h-12 bg-white border-0 text-base text-center placeholder:text-center placeholder:text-gray-400 focus-visible:ring-dc-teal"
        />
      </div>

      {/* reCAPTCHA Widget */}
      <ReCaptcha
        ref={captchaRef}
        onExpired={() => {
          toast({
            title: "CAPTCHA expired",
            description: "Please verify again.",
            variant: "destructive",
          });
        }}
        onError={() => {
          toast({
            title: "CAPTCHA error",
            description: "There was an error loading the CAPTCHA. Please refresh the page.",
            variant: "destructive",
          });
        }}
      />

      {mode === "login" ? (
        <button
          type="submit"
          className="w-full rounded-full bg-white text-dc-teal font-semibold text-base h-12 shadow-sm border border-gray-200 disabled:opacity-60 hover:bg-gray-50 transition-colors"
          disabled={loading}
        >
          {loading ? "Logging in..." : "Login"}
        </button>
      ) : (
        <button
          type="submit"
          className="w-full rounded-full bg-dc-teal text-white font-bold text-base h-12 disabled:opacity-60 hover:bg-dc-teal-dark transition-colors"
          disabled={loading}
        >
          {loading ? "Signing up..." : "Sign Up"}
        </button>
      )}
    </form>
  );
};
