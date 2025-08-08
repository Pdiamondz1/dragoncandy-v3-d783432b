import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

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

const ForgotPassword: React.FC = () => {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setSEO(
      "Reset Password | DragonCandy",
      "Reset your DragonCandy account password via email.",
      `${window.location.origin}/auth/forgot`
    );
  }, []);

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
    <main className="min-h-screen flex items-center justify-center py-10 px-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader>
          <CardTitle>Forgot Password</CardTitle>
          <CardDescription>
            Enter your email address and we'll send you a link to reset your password.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium">
                Email address
              </label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <Button type="submit" disabled={loading} className="w-full">
              {loading ? "Sending..." : "Send reset link"}
            </Button>

            <div className="text-center text-sm">
              <Link to="/auth?mode=login" className="underline">
                Back to login
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </main>
  );
};

export default ForgotPassword;
