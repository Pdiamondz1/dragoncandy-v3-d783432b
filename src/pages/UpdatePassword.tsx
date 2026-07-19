import React, { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/use-toast";
import { Input } from "@/components/ui/input";
import { cleanupAuthState } from "@/lib/authCleanup";
import { AuthHeader } from "@/components/auth/AuthHeader";
import { AuthShell } from "@/components/auth/AuthShell";
import { Eyebrow } from "@/components/landing/Eyebrow";
import { LandingButton } from "@/components/landing/LandingButton";
import { SEO } from "@/components/SEO";

const UpdatePassword: React.FC = () => {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password.length < 8) {
      setErrorMessage("Use at least 8 characters.");
      toast({ title: "Password too short", description: "Use at least 8 characters." });
      return;
    }
    if (password !== confirm) {
      setErrorMessage("Passwords do not match. Please re-enter matching passwords.");
      toast({ title: "Passwords do not match", description: "Please re-enter matching passwords." });
      return;
    }
    setErrorMessage("");

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;

      // Auto-verify email — proves ownership via password reset link
      try {
        await supabase.functions.invoke('verify-on-password-reset');
      } catch {}

      toast({ title: "Password updated", description: "Please log in with your new password." });

      try {
        cleanupAuthState();
        await supabase.auth.signOut({ scope: 'global' });
      } catch {}

      window.location.href = "/auth?mode=login";
    } catch (err: unknown) {
      console.error("Error updating password:", err);
      const message = err instanceof Error ? err.message : "Try the link again.";
      toast({ title: "Could not update password", description: message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell>
      <div className="flex flex-col min-h-screen">
        <SEO
          title="Update Password"
          description="Set a new password for your DragonCandy account."
          path="/auth/update-password"
        />
        {/* Template C header */}
        <div className="bg-white/80 backdrop-blur-xl border-b border-landing-line px-4 py-3 flex items-center">
          <div className="flex-1 text-center">
            <h1 className="font-sans text-base font-bold text-landing-ink uppercase tracking-wide">Update Password</h1>
          </div>
        </div>

        <div className="flex-1 flex items-center justify-center p-4">
          <div className="w-full max-w-md">
            <div className="rounded-2xl border-2 border-landing-line bg-white shadow-[0_14px_30px_rgba(36,19,50,0.08)] p-8">
              <AuthHeader />

              <div className="text-center mb-6 mt-4">
                <Eyebrow className="text-landing-pink justify-center mb-2">Set a new password</Eyebrow>
                <p className="text-sm text-landing-ink-soft mt-1">
                  Enter and confirm your new password.
                </p>
              </div>

              <form onSubmit={onSubmit} className="space-y-4">
                <div className="space-y-1">
                  <label htmlFor="password" className="font-sans text-xs font-semibold uppercase tracking-wider text-landing-ink-soft">
                    New password
                  </label>
                  <Input
                    id="password"
                    type="password"
                    name="password"
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    aria-required="true"
                    aria-invalid={!!errorMessage}
                    aria-describedby={errorMessage ? "password-error" : undefined}
                    className="h-12 rounded-xl px-5 text-base border-2 border-landing-line bg-white text-landing-ink placeholder:text-landing-ink-soft focus-visible:ring-landing-mint"
                  />
                </div>

                <div className="space-y-1">
                  <label htmlFor="confirm" className="font-sans text-xs font-semibold uppercase tracking-wider text-landing-ink-soft">
                    Confirm new password
                  </label>
                  <Input
                    id="confirm"
                    type="password"
                    name="confirm-password"
                    autoComplete="new-password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    required
                    aria-required="true"
                    aria-invalid={!!errorMessage}
                    aria-describedby={errorMessage ? "password-error" : undefined}
                    className="h-12 rounded-xl px-5 text-base border-2 border-landing-line bg-white text-landing-ink placeholder:text-landing-ink-soft focus-visible:ring-landing-mint"
                  />
                </div>

                {errorMessage && (
                  <p id="password-error" role="alert" className="text-sm text-red-600">
                    {errorMessage}
                  </p>
                )}

                <LandingButton
                  type="submit"
                  variant="pink"
                  className="w-full h-12 disabled:opacity-60"
                  disabled={loading}
                >
                  {loading ? "Updating…" : "Update password"}
                </LandingButton>
              </form>
            </div>
          </div>
        </div>
      </div>
    </AuthShell>
  );
};

export default UpdatePassword;
