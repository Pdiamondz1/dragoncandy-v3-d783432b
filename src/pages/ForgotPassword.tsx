import React, { useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/use-toast";
import { Input } from "@/components/ui/input";
import { AuthHeader } from "@/components/auth/AuthHeader";
import { AuthShell } from "@/components/auth/AuthShell";
import { Eyebrow } from "@/components/landing/Eyebrow";
import { LandingButton } from "@/components/landing/LandingButton";
import { SEO } from "@/components/SEO";
import { publicOrigin } from '@/lib/publicOrigin';

const ForgotPassword: React.FC = () => {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setLoading(true);
    try {
      await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${publicOrigin()}/auth/update-password`,
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
    <AuthShell>
      <div className="flex flex-col min-h-screen">
        <SEO
          title="Reset Password"
          description="Reset your DragonCandy account password via email."
          path="/auth/forgot"
        />
        {/* Template C header */}
        <div className="bg-white/80 backdrop-blur-xl border-b border-landing-line px-4 py-3 flex items-center">
          <div className="flex-1 text-center">
            <h1 className="font-sans text-base font-bold text-landing-ink uppercase tracking-wide">Forgot Password</h1>
          </div>
        </div>

        <div className="flex-1 flex items-center justify-center p-4">
          <div className="w-full max-w-md">
            <div className="rounded-2xl border-2 border-landing-line bg-white shadow-[0_14px_30px_rgba(36,19,50,0.08)] p-8">
              <AuthHeader />

              <div className="text-center mb-6 mt-4">
                <Eyebrow className="text-landing-pink justify-center mb-2">Reset your password</Eyebrow>
                <p className="text-sm text-landing-ink-soft mt-1">
                  Enter your email address and we'll send you a link to reset your password.
                </p>
              </div>

              <form onSubmit={onSubmit} className="space-y-4">
                <div className="space-y-1">
                  <label htmlFor="email" className="font-sans text-xs font-semibold uppercase tracking-wider text-landing-ink-soft">
                    Email address
                  </label>
                  <Input
                    id="email"
                    type="email"
                    name="email"
                    autoComplete="email"
                    spellCheck={false}
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="h-12 rounded-xl px-5 text-base border-2 border-landing-line bg-white text-landing-ink placeholder:text-landing-ink-soft focus-visible:ring-landing-mint"
                  />
                </div>

                <LandingButton
                  type="submit"
                  variant="pink"
                  className="w-full h-12 disabled:opacity-60"
                  disabled={loading}
                >
                  {loading ? "Sending…" : "Send reset link"}
                </LandingButton>

                <div className="text-center text-sm mt-2">
                  <Link
                    to="/auth?mode=login"
                    className="text-landing-pink font-semibold hover:opacity-80"
                  >
                    Back to login
                  </Link>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    </AuthShell>
  );
};

export default ForgotPassword;
