import React, { useState, useRef } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { toast as sonnerToast } from "sonner";
import { Eye, EyeOff, Store, Camera, Megaphone } from "lucide-react";
import ReCaptcha, { ReCaptchaHandle } from "./ReCaptcha";
import type { UserRole as Role } from "@/types/user";

interface AuthFormProps {
  mode: "login" | "signup";
  onError: (error: string | null) => void;
  preSelectedRole?: "business_client" | "content_creator" | "brand";
  onChangeRole?: () => void;
}

export const AuthForm = ({ mode, onError, preSelectedRole, onChangeRole }: AuthFormProps) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const captchaRef = useRef<ReCaptchaHandle>(null);

  const role: Role | undefined = preSelectedRole;

  const handleSocialClick = () => {
    sonnerToast("Coming soon", {
      description: "Social sign-in will be available soon.",
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    onError(null);
    setLoading(true);

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

      if (mode === "signup") {
        if (!role) {
          onError("Please select a role.");
          captchaRef.current?.reset();
          setLoading(false);
          return;
        }

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

  const getRoleDisplay = () => {
    switch (preSelectedRole) {
      case "content_creator":
        return { icon: <Camera className="w-4 h-4" />, label: "Creator" };
      case "brand":
        return { icon: <Megaphone className="w-4 h-4" />, label: "Brand" };
      default:
        return { icon: <Store className="w-4 h-4" />, label: "Business" };
    }
  };
  const { icon: roleIcon, label: roleLabel } = getRoleDisplay();

  return (
    <div className="w-full max-w-sm md:max-w-md mx-auto">
      {/* Role badge (signup only) */}
      {mode === "signup" && preSelectedRole && (
        <div className="flex justify-center mb-6">
          <div className="inline-flex items-center gap-2 bg-white/15 rounded-full px-4 py-1.5">
            {roleIcon}
            <span className="text-white text-sm font-semibold">{roleLabel}</span>
            {onChangeRole && (
              <button
                type="button"
                onClick={onChangeRole}
                className="text-white/50 text-xs hover:text-white/80 ml-1"
              >
                Change
              </button>
            )}
          </div>
        </div>
      )}

      {/* White card container */}
      <div className="bg-white rounded-3xl shadow-lg p-8">
        <form className="space-y-4" onSubmit={handleSubmit}>
          {/* Full name (signup only) */}
          {mode === "signup" && (
            <div>
              <input
                id="fullName"
                type="text"
                value={fullName}
                autoComplete="name"
                required
                onChange={e => setFullName(e.target.value)}
                placeholder="Full Name"
                disabled={loading}
                className="w-full h-12 rounded-lg bg-gray-100 border-2 border-transparent focus:border-teal-400 focus:outline-none px-4 text-[15px] text-gray-700 placeholder:text-gray-400"
              />
            </div>
          )}

          {/* Email */}
          <div>
            <input
              id="email"
              type="email"
              value={email}
              autoComplete="email"
              required
              onChange={e => setEmail(e.target.value)}
              placeholder="Email"
              disabled={loading}
              className="w-full h-12 rounded-lg bg-gray-100 border-2 border-transparent focus:border-teal-400 focus:outline-none px-4 text-[15px] text-gray-700 placeholder:text-gray-400"
            />
          </div>

          {/* Password */}
          <div className="relative">
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              value={password}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              required
              onChange={e => setPassword(e.target.value)}
              placeholder="Password"
              disabled={loading}
              className="w-full h-12 rounded-lg bg-gray-100 border-2 border-transparent focus:border-teal-400 focus:outline-none px-4 pr-12 text-[15px] text-gray-700 placeholder:text-gray-400"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
          </div>

          {/* Forgot password (login only) */}
          {mode === "login" && (
            <div className="text-right">
              <Link
                to="/auth/forgot"
                className="text-dc-teal text-sm hover:underline"
              >
                Forgot password?
              </Link>
            </div>
          )}

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

          {/* Submit button */}
          <button
            type="submit"
            className="w-full h-12 rounded-full bg-dc-teal text-white font-bold text-base disabled:opacity-60 hover:opacity-90 transition-opacity"
            disabled={loading}
          >
            {mode === "login"
              ? (loading ? "Logging in…" : "Login")
              : (loading ? "Creating account…" : "Create Account")}
          </button>
        </form>

        {/* Divider */}
        <div className="flex items-center gap-3 my-6">
          <div className="flex-1 h-px bg-gray-200" />
          <span className="text-gray-400 text-sm whitespace-nowrap">or continue with</span>
          <div className="flex-1 h-px bg-gray-200" />
        </div>

        {/* Social auth buttons */}
        <div className="flex justify-center gap-4">
          {/* Google */}
          <button
            type="button"
            aria-label="Sign in with Google"
            onClick={handleSocialClick}
            className="w-[52px] h-[52px] rounded-lg border-[1.5px] border-gray-200 bg-white flex items-center justify-center hover:shadow-md transition-shadow"
          >
            <svg viewBox="0 0 24 24" className="w-5 h-5" xmlns="http://www.w3.org/2000/svg">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
          </button>

          {/* Apple */}
          <button
            type="button"
            aria-label="Sign in with Apple"
            onClick={handleSocialClick}
            className="w-[52px] h-[52px] rounded-lg bg-black flex items-center justify-center hover:shadow-md transition-shadow"
          >
            <svg viewBox="0 0 24 24" className="w-5 h-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="currentColor">
              <path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701"/>
            </svg>
          </button>

          {/* Facebook */}
          <button
            type="button"
            aria-label="Sign in with Facebook"
            onClick={handleSocialClick}
            className="w-[52px] h-[52px] rounded-lg bg-[#1877F2] flex items-center justify-center hover:shadow-md transition-shadow"
          >
            <svg viewBox="0 0 24 24" className="w-5 h-5" xmlns="http://www.w3.org/2000/svg">
              <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" fill="white"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
};
