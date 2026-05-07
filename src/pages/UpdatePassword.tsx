import React, { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/use-toast";
import { Input } from "@/components/ui/input";
import { cleanupAuthState } from "@/lib/authCleanup";
import { AuthHeader } from "@/components/auth/AuthHeader";
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

      toast({ title: "Password updated", description: "Please log in with your new password." });

      // Clean up any lingering sessions and force a fresh login
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
    <div className="min-h-screen bg-white flex flex-col overflow-x-hidden">
      <SEO
        title="Update Password"
        description="Set a new password for your DragonCandy account."
        path="/auth/update-password"
      />
      {/* Template C header */}
      <div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center">
        <div className="flex-1 text-center">
          <h1 className="font-sans text-base font-bold text-gray-900 uppercase tracking-wide">Update Password</h1>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="border-2 border-dc-teal rounded-2xl p-6">
            <AuthHeader />

            <div className="text-center mb-6 mt-4">
              <p className="font-sans text-xs font-semibold uppercase tracking-wider text-gray-500">
                Set a new password
              </p>
              <p className="text-sm text-gray-500 mt-1">
                Enter and confirm your new password.
              </p>
            </div>

            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-1">
                <label htmlFor="password" className="font-sans text-xs font-semibold uppercase tracking-wider text-gray-500">
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
                  className="rounded-full h-12 px-5 text-base border-gray-200"
                />
              </div>

              <div className="space-y-1">
                <label htmlFor="confirm" className="font-sans text-xs font-semibold uppercase tracking-wider text-gray-500">
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
                  className="rounded-full h-12 px-5 text-base border-gray-200"
                />
              </div>

              {errorMessage && (
                <p id="password-error" role="alert" className="text-sm text-dc-pink-accent">
                  {errorMessage}
                </p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-full bg-dc-teal-btn text-white font-bold py-3 hover:bg-dc-teal-btn-hover transition-colors disabled:opacity-60"
              >
                {loading ? "Updating…" : "Update password"}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UpdatePassword;
