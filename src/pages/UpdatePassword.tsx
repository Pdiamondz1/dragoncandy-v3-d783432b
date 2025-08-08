import React, { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cleanupAuthState } from "@/lib/authCleanup";

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
    <main className="min-h-screen flex items-center justify-center py-10 px-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader>
          <CardTitle>Update Password</CardTitle>
          <CardDescription>
            Enter and confirm your new password.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="password" className="text-sm font-medium">
                New password
              </label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="confirm" className="text-sm font-medium">
                Confirm new password
              </label>
              <Input
                id="confirm"
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
              />
            </div>

            <Button type="submit" disabled={loading} className="w-full">
              {loading ? "Updating..." : "Update password"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
};

export default UpdatePassword;
