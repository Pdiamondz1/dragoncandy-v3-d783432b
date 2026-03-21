import React, { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/use-toast";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cleanupAuthState } from "@/lib/authCleanup";
import { AuthHeader } from "@/components/auth/AuthHeader";

const setSEO = (title: string, description: string, canonical?: string) => {
  document.title = title;
  const metaDesc = document.querySelector('meta[name="description"]');
  if (metaDesc) metaDesc.setAttribute('content', description);
  else {
    const m = document.createElement('meta');
    m.setAttribute('name', 'description');
    m.setAttribute('content', description);
    document.head.appendChild(m);
  }
  const existingCanonical = document.querySelector('link[rel="canonical"]');
  const href = canonical || window.location.href;
  if (existingCanonical) existingCanonical.setAttribute('href', href);
  else {
    const link = document.createElement('link');
    link.setAttribute('rel', 'canonical');
    link.setAttribute('href', href);
    document.head.appendChild(link);
  }
};

const UpdatePassword: React.FC = () => {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setSEO(
      "Update Password | DragonCandy",
      "Set a new password for your DragonCandy account.",
      `${window.location.origin}/auth/update-password`
    );
  }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password.length < 8) {
      toast({ title: "Password too short", description: "Use at least 8 characters." });
      return;
    }
    if (password !== confirm) {
      toast({ title: "Passwords do not match", description: "Please re-enter matching passwords." });
      return;
    }

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
    } catch (err: any) {
      console.error("Error updating password:", err);
      toast({ title: "Could not update password", description: err?.message || "Try the link again." });
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-pink-50 dark:bg-zinc-950 flex items-center justify-center py-10 px-4">
      <div className="w-full max-w-md">
        <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-xl px-8 pt-8 pb-10 border border-pink-200 dark:border-zinc-800">
          <AuthHeader />
          
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold text-pink-700 dark:text-pink-300 mb-2">
              Update Password
            </h1>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Enter and confirm your new password.
            </p>
          </div>

          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="password" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                New password
              </label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="transition-all duration-200 focus:ring-2 focus:ring-pink-500 focus:border-pink-500"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="confirm" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Confirm new password
              </label>
              <Input
                id="confirm"
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                className="transition-all duration-200 focus:ring-2 focus:ring-pink-500 focus:border-pink-500"
              />
            </div>

            <Button 
              type="submit" 
              disabled={loading} 
              className="w-full bg-pink-600 hover:bg-pink-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors duration-200"
            >
              {loading ? "Updating..." : "Update password"}
            </Button>
          </form>
        </div>
      </div>
    </main>
  );
};

export default UpdatePassword;
