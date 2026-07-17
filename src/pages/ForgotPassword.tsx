import { useDarkHtml } from "@/hooks/useDarkHtml";
import React, { useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/use-toast";
import { Input } from "@/components/ui/input";
import { AuthHeader } from "@/components/auth/AuthHeader";
import { SEO } from "@/components/SEO";

const ForgotPassword: React.FC = () => {
  useDarkHtml();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

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
    <div className="dark dc-surface flex flex-col overflow-x-hidden">
      <SEO
        title="Reset Password"
        description="Reset your DragonCandy account password via email."
        path="/auth/forgot"
      />
      {/* Template C header */}
      <div className="bg-dc-dark/80 backdrop-blur-xl border-b border-white/10 px-4 py-3 flex items-center">
        <div className="flex-1 text-center">
          <h1 className="font-sans text-base font-bold text-white uppercase tracking-wide">Forgot Password</h1>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="bg-white/5 border-2 border-dc-teal rounded-2xl p-6">
            <AuthHeader />

            <div className="text-center mb-6 mt-4">
              <p className="font-sans text-xs font-semibold uppercase tracking-wider text-white/60">
                Reset your password
              </p>
              <p className="text-sm text-white/60 mt-1">
                Enter your email address and we'll send you a link to reset your password.
              </p>
            </div>

            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-1">
                <label htmlFor="email" className="font-sans text-xs font-semibold uppercase tracking-wider text-white/60">
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
                  className="h-12 rounded-xl px-5 text-base border-white/15 bg-white/5 text-white placeholder:text-white/40 focus-visible:ring-dc-teal"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-full bg-dc-teal-btn text-white font-bold py-3 hover:bg-dc-teal-btn-hover transition-colors disabled:opacity-60"
              >
                {loading ? "Sending…" : "Send reset link"}
              </button>

              <div className="text-center text-sm mt-2">
                <Link
                  to="/auth?mode=login"
                  className="text-dc-pink-accent font-semibold hover:opacity-80"
                >
                  Back to login
                </Link>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ForgotPassword;
