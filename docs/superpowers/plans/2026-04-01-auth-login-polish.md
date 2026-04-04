# Auth: Polished Login Page with Role-Based Signup Flow — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Polish the login page UI and restructure signup to use a dedicated role selection screen before the signup form.

**Architecture:** Add step-based state management to `AuthPage.tsx` to conditionally render login form, role selection, or signup form. Extract role selection into a new `RoleSelection` component. Restyle `AuthForm` inputs and social buttons inside a white card container. All three views share a teal-to-pink gradient background.

**Tech Stack:** React, TypeScript, Tailwind CSS, Supabase Auth (unchanged), lucide-react icons, sonner toasts

**Spec:** `docs/superpowers/specs/2026-04-01-auth-login-polish-design.md`

**Important constraints:**
- No test framework is configured — verify via `npm run build` and visual inspection at 375px
- Do NOT modify `AuthContext.tsx`, `ReCaptcha.tsx`, `ForgotPassword.tsx`, `AuthenticationModal.tsx`, or any non-auth pages
- Do NOT change Supabase auth configuration
- Social auth buttons are visual-only — show "Coming soon" toast on click
- App name is "DragonCandy" (one word), not "Dragon Candy"

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `src/components/auth/RoleSelection.tsx` | Role selection screen with two cards (Business / Creator) |
| Modify | `src/pages/AuthPage.tsx` | Step state management, gradient bg, conditional rendering, social buttons moved into card |
| Modify | `src/components/auth/AuthForm.tsx` | Accept `preSelectedRole` prop, remove inline RadioGroup, restyle inputs in white card, add divider + social buttons |
| Modify | `src/components/auth/AuthModeToggle.tsx` | Restyle for card context (dark text, pink accent) |

---

### Task 1: Create RoleSelection Component

**Files:**
- Create: `src/components/auth/RoleSelection.tsx`

- [ ] **Step 1: Create `RoleSelection.tsx`**

```tsx
import React from "react";
import { Store, Camera } from "lucide-react";

interface RoleSelectionProps {
  onSelectRole: (role: "business_client" | "content_creator") => void;
  onBackToLogin: () => void;
}

export const RoleSelection = ({ onSelectRole, onBackToLogin }: RoleSelectionProps) => {
  return (
    <div className="flex-1 flex flex-col justify-center px-6 py-8">
      <h1 className="text-xl font-bold uppercase tracking-wider text-white text-center mb-3">
        Join DragonCandy
      </h1>
      <p className="text-white/70 text-sm text-center mb-8">
        How will you use DragonCandy?
      </p>

      <div className="w-full max-w-sm md:max-w-md mx-auto flex flex-col gap-4">
        {/* Business card */}
        <button
          type="button"
          onClick={() => onSelectRole("business_client")}
          className="w-full bg-white rounded-2xl border-2 border-teal-400 p-6 flex items-center gap-5 shadow-md hover:shadow-lg transition-shadow text-left"
        >
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-teal-50 to-teal-200 flex items-center justify-center flex-shrink-0">
            <Store className="w-7 h-7 text-teal-600" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-lg font-bold text-gray-900">I'm a Business</div>
            <div className="text-sm text-gray-500 leading-snug">
              Find creators to promote your brand, restaurant, or product
            </div>
          </div>
          <span className="text-teal-400 text-xl flex-shrink-0">&#8250;</span>
        </button>

        {/* Creator card */}
        <button
          type="button"
          onClick={() => onSelectRole("content_creator")}
          className="w-full bg-white rounded-2xl border-2 border-pink-300 p-6 flex items-center gap-5 shadow-md hover:shadow-lg transition-shadow text-left"
        >
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-pink-50 to-pink-200 flex items-center justify-center flex-shrink-0">
            <Camera className="w-7 h-7 text-pink-500" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-lg font-bold text-gray-900">I'm a Creator</div>
            <div className="text-sm text-gray-500 leading-snug">
              Get paid to create content for businesses and brands
            </div>
          </div>
          <span className="text-pink-300 text-xl flex-shrink-0">&#8250;</span>
        </button>

        {/* Back to login */}
        <div className="mt-6 text-center text-sm">
          <span className="text-white/70">Already have an account? </span>
          <button
            type="button"
            onClick={onBackToLogin}
            className="text-dc-teal font-semibold hover:underline"
          >
            Log in
          </button>
        </div>
      </div>
    </div>
  );
};
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds (component is created but not yet imported anywhere)

- [ ] **Step 3: Commit**

```bash
git add src/components/auth/RoleSelection.tsx
git commit -m "auth: add RoleSelection component with business/creator cards"
```

---

### Task 2: Restyle AuthForm — White Card, Inputs, Divider, Social Buttons

**Files:**
- Modify: `src/components/auth/AuthForm.tsx`

This task restructures `AuthForm` to:
- Accept a `preSelectedRole` prop and remove the inline RadioGroup when provided
- Wrap the form in a white card container
- Restyle inputs (48px, rounded-lg, gray-100 bg, teal focus ring)
- Move the "Forgot password?" link inside the form (below password, right-aligned)
- Add the login/signup CTA button
- Add "or continue with" divider
- Add branded social auth buttons (visual-only, "Coming soon" toast)
- Show role badge when in signup mode with pre-selected role

- [ ] **Step 1: Replace `AuthForm.tsx` with restyled version**

Replace the full contents of `src/components/auth/AuthForm.tsx` with:

```tsx
import React, { useState, useRef } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { toast as sonnerToast } from "sonner";
import { Eye, EyeOff, Store, Camera } from "lucide-react";
import ReCaptcha, { ReCaptchaHandle } from "./ReCaptcha";
import type { UserRole as Role } from "@/types/user";

interface AuthFormProps {
  mode: "login" | "signup";
  onError: (error: string | null) => void;
  preSelectedRole?: "business_client" | "content_creator";
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

  const roleIcon = preSelectedRole === "content_creator" ? (
    <Camera className="w-4 h-4" />
  ) : (
    <Store className="w-4 h-4" />
  );
  const roleLabel = preSelectedRole === "content_creator" ? "Creator" : "Business";

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
              ? (loading ? "Logging in..." : "Login")
              : (loading ? "Creating account..." : "Create Account")}
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
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds. The `Input`, `Label`, `RadioGroup`, `RadioGroupItem` imports are removed. New imports (`Link`, `sonnerToast`, `Store`, `Camera`) resolve correctly.

- [ ] **Step 3: Commit**

```bash
git add src/components/auth/AuthForm.tsx
git commit -m "auth: restyle AuthForm with white card, polished inputs, branded social buttons"
```

---

### Task 3: Update AuthModeToggle for Card Context

**Files:**
- Modify: `src/components/auth/AuthModeToggle.tsx`

The toggle now lives inside/below the white card, so it needs dark text colors instead of white.

- [ ] **Step 1: Replace `AuthModeToggle.tsx`**

Replace the full contents of `src/components/auth/AuthModeToggle.tsx` with:

```tsx
import React from 'react';

interface AuthModeToggleProps {
  mode: "login" | "signup";
  onModeChange: (mode: "login" | "signup") => void;
  loading: boolean;
}

export const AuthModeToggle = ({ mode, onModeChange, loading }: AuthModeToggleProps) => {
  if (mode === "login") {
    return (
      <div className="mt-6 text-center text-sm">
        <span className="text-gray-500">Don&apos;t have an account? </span>
        <button
          type="button"
          className="text-dc-pink-accent font-semibold hover:underline disabled:opacity-60"
          onClick={() => onModeChange("signup")}
          disabled={loading}
        >
          Sign Up
        </button>
      </div>
    );
  }

  return (
    <div className="mt-6 text-center text-sm">
      <span className="text-gray-500">Already have an account? </span>
      <button
        type="button"
        className="text-dc-pink-accent font-semibold hover:underline disabled:opacity-60"
        onClick={() => onModeChange("login")}
        disabled={loading}
      >
        Log in
      </button>
    </div>
  );
};
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/components/auth/AuthModeToggle.tsx
git commit -m "auth: restyle AuthModeToggle for white card context"
```

---

### Task 4: Restructure AuthPage — Gradient, Step State, Conditional Rendering

**Files:**
- Modify: `src/pages/AuthPage.tsx`

This is the main integration task. `AuthPage` gets:
- Teal-to-pink gradient background
- `signupStep` state (`'role-selection'` | `'signup-form'`)
- `selectedRole` state
- Conditional rendering of login form, role selection, or signup form
- Social buttons and forgot password link move into `AuthForm` (already done in Task 2), so they are removed from `AuthPage`
- "Dragon Candy" → "DragonCandy" in heading

- [ ] **Step 1: Replace `AuthPage.tsx`**

Replace the full contents of `src/pages/AuthPage.tsx` with:

```tsx
import React, { useEffect, useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AuthForm } from "@/components/auth/AuthForm";
import { AuthModeToggle } from "@/components/auth/AuthModeToggle";
import { RoleSelection } from "@/components/auth/RoleSelection";
import { toast } from 'sonner';
import dragonCandyLogo from '@/assets/Transparent_DragonCandy_logo.png';

type SignupStep = "role-selection" | "signup-form";

const AuthPage = () => {
  const [searchParams] = useSearchParams();
  const initialMode = searchParams.get('mode') === 'login' ? 'login' : 'signup';
  const [mode, setMode] = useState<"login" | "signup">(initialMode);
  const [error, setError] = useState<string | null>(null);
  const [signupStep, setSignupStep] = useState<SignupStep>("role-selection");
  const [selectedRole, setSelectedRole] = useState<"business_client" | "content_creator" | null>(null);

  const navigate = useNavigate();
  const { user, isAuthenticated, migrateCampaignData } = useAuth();

  // Update mode when URL params change
  useEffect(() => {
    const urlMode = searchParams.get('mode');
    if (urlMode === 'login' || urlMode === 'signup') {
      setMode(urlMode);
    }
  }, [searchParams]);

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      // If returnTo is set (e.g. from Donny OAuth flow), redirect back with access token
      const returnTo = searchParams.get('returnTo');
      if (returnTo) {
        handleOAuthReturn(returnTo);
        return;
      }
      console.log('User is authenticated, checking profile completion');
      checkProfileCompletion();
    }
  }, [isAuthenticated]);

  const handleOAuthReturn = async (returnTo: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;

      // Append access_token to the returnTo URL so the authorize endpoint can read it
      const returnUrl = new URL(returnTo);
      returnUrl.searchParams.set('access_token', session.access_token);
      window.location.href = returnUrl.toString();
    } catch (err) {
      console.error('OAuth return redirect failed:', err);
    }
  };

  const checkProfileCompletion = async () => {
    if (!user) return;

    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role, email_verified')
        .eq('id', user.id)
        .single();

      // Check email verification first
      if (profile && profile.email_verified !== true) {
        console.log('Email not verified, signing out');
        await supabase.auth.signOut();
        setError('Please verify your email before continuing. Check your inbox for the verification link.');
        return;
      }

      const hasAnon = !!localStorage.getItem('anonymous_campaign_data') || !!localStorage.getItem('anonymous_campaign_final');

      if (!profile) {
        navigate('/profile/onboarding');
        return;
      }

      if (profile.role === 'business_client') {
        const { data: businessProfile } = await supabase
          .from('business_profiles')
          .select('is_completed')
          .eq('user_id', user.id)
          .single();

        if (!businessProfile?.is_completed) {
          navigate('/profile/business');
          return;
        }

        if (hasAnon) {
          await migrateCampaignData();
          navigate('/dashboard/business/campaigns', { replace: true });
          return;
        }

        navigate('/', { replace: true });
        return;
      }

      if (profile.role === 'content_creator') {
        const { data: creatorProfile } = await supabase
          .from('creator_profiles')
          .select('is_completed')
          .eq('user_id', user.id)
          .single();

        if (!creatorProfile?.is_completed) {
          navigate('/profile/creator');
          return;
        }

        if (hasAnon) {
          localStorage.removeItem('anonymous_campaign_data');
          localStorage.removeItem('anonymous_campaign_final');
          toast.message('Campaign creation is for business clients. You can browse paid campaigns.');
        }
        navigate('/dashboard/creator/campaigns', { replace: true });
        return;
      }

      // Fallback
      navigate('/', { replace: true });
    } catch (error: unknown) {
      console.error('Error checking profile completion:', error);
      navigate('/', { replace: true });
    }
  };

  const handleModeChange = (newMode: "login" | "signup") => {
    setMode(newMode);
    setError(null);
    // Reset signup step when switching modes
    setSignupStep("role-selection");
    setSelectedRole(null);
    navigate(`/auth?mode=${newMode}`, { replace: true });
  };

  const handleSelectRole = (role: "business_client" | "content_creator") => {
    setSelectedRole(role);
    setSignupStep("signup-form");
  };

  const handleChangeRole = () => {
    setSignupStep("role-selection");
    setSelectedRole(null);
  };

  const handleBackToLogin = () => {
    handleModeChange("login");
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#1A5C5C] via-[#2D7A7A] to-[#9B5A8A] flex flex-col">
      {/* Top nav — logo left, hamburger right */}
      <div className="flex items-center justify-between px-5 pt-6 pb-2">
        <Link to="/">
          <img src={dragonCandyLogo} alt="DragonCandy" className="h-14 w-14" />
        </Link>
        <button
          type="button"
          aria-label="Menu"
          className="flex flex-col gap-1.5 p-2 md:hidden"
        >
          <span className="block w-6 h-0.5 bg-white rounded-full" />
          <span className="block w-6 h-0.5 bg-white rounded-full" />
          <span className="block w-6 h-0.5 bg-white rounded-full" />
        </button>
      </div>

      {/* Render based on mode and signup step */}
      {mode === "login" && (
        <div className="flex-1 flex flex-col justify-center px-6 py-8">
          <h1 className="text-xl font-bold uppercase tracking-wider text-white text-center mb-6">
            Welcome to DragonCandy
          </h1>

          <AuthForm mode="login" onError={setError} />

          {error && (
            <div className="text-sm text-red-600 bg-red-50 px-4 py-2 rounded-xl mt-3 max-w-sm md:max-w-md mx-auto">
              {error}
            </div>
          )}

          <div className="max-w-sm md:max-w-md mx-auto w-full">
            <AuthModeToggle mode="login" onModeChange={handleModeChange} loading={false} />
          </div>
        </div>
      )}

      {mode === "signup" && signupStep === "role-selection" && (
        <RoleSelection
          onSelectRole={handleSelectRole}
          onBackToLogin={handleBackToLogin}
        />
      )}

      {mode === "signup" && signupStep === "signup-form" && selectedRole && (
        <div className="flex-1 flex flex-col justify-center px-6 py-8">
          <h1 className="text-xl font-bold uppercase tracking-wider text-white text-center mb-3">
            Create Account
          </h1>

          <AuthForm
            mode="signup"
            onError={setError}
            preSelectedRole={selectedRole}
            onChangeRole={handleChangeRole}
          />

          {error && (
            <div className="text-sm text-red-600 bg-red-50 px-4 py-2 rounded-xl mt-3 max-w-sm md:max-w-md mx-auto">
              {error}
            </div>
          )}

          <div className="max-w-sm md:max-w-md mx-auto w-full">
            <AuthModeToggle mode="signup" onModeChange={handleModeChange} loading={false} />
          </div>
        </div>
      )}
    </div>
  );
};

export default AuthPage;
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds with no TypeScript errors. The `AuthHeader` import is removed (it rendered `null`).

- [ ] **Step 3: Visual verification**

Run: `npm run dev`

Check at 375px viewport width:
1. `/auth?mode=login` — gradient background, white card form, branded social buttons, "Forgot password?" in teal, "Don't have an account? Sign Up" below card
2. Click "Sign Up" — role selection screen with two cards (Business teal border, Creator pink border)
3. Tap "I'm a Creator" — signup form with "Creator" role badge, "Change" link, Full Name / Email / Password fields
4. Click "Change" — returns to role selection
5. Click "Log in" from any screen — returns to login
6. Social auth buttons show "Coming soon" toast
7. No horizontal overflow at 375px

- [ ] **Step 4: Commit**

```bash
git add src/pages/AuthPage.tsx
git commit -m "auth: polished login page with role-based signup flow

- Teal-to-pink gradient background across all auth screens
- Multi-step signup: role selection → signup form
- White card container with restyled inputs (48px, rounded-lg, teal focus)
- Branded social auth buttons (visual-only, Coming soon toast)
- Fixed DragonCandy branding (was 'Dragon Candy')
- Forgot password link restyled inside form card"
```

---

### Task 5: Final Build Verification and Cleanup

**Files:**
- Verify: all modified files

- [ ] **Step 1: Full build check**

Run: `npm run build`
Expected: Build succeeds with zero errors and zero warnings related to auth components.

- [ ] **Step 2: Check for unused imports**

Verify that `src/components/auth/AuthHeader.tsx` is no longer imported anywhere. If it's only imported by `AuthPage.tsx` (which we removed), it's now dead code. Leave it in place — it may be used by `AuthenticationModal` or other components. Check:

Run: `grep -r "AuthHeader" src/ --include="*.tsx" --include="*.ts"`

If only `AuthHeader.tsx` itself shows up, it's unused. Leave it — don't delete files outside scope.

- [ ] **Step 3: Verify no other pages were modified**

Run: `git diff --name-only`

Expected files changed:
- `src/pages/AuthPage.tsx`
- `src/components/auth/AuthForm.tsx`
- `src/components/auth/AuthModeToggle.tsx`
- `src/components/auth/RoleSelection.tsx` (new)

No other files should appear. If they do, investigate and revert.

- [ ] **Step 4: Final commit (if any cleanup was needed)**

Only commit if cleanup changes were made. Otherwise skip.
